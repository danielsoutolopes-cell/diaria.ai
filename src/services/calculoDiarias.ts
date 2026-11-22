import { supabaseAdmin } from '@/lib/supabase';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
  obterAliasesEquivalentes,
} from '@/lib/normalizarObra';

export interface CalculoDiariaParams {
  tenantId: string;
  nomeTrabalhador: string;
  obraId?: string | null;
  nomeObra?: string | null;
  tipoObra?: string | null;
  fracao: number; // 1.0, 0.5, 0.25
  motivo?: string | null;
}

export interface CalculoDiariaResultado {
  valorUnitarioObra: number;
  fracaoAplicada: number;
  valorFinal: number;
  origemValor:
    | 'OBRA_TRABALHADOR'
    | 'TRABALHADOR_TIPOLOGIA'
    | 'TRABALHADOR_GLOBAL'
    | 'OBRA_PADRAO'
    | 'REGRA_EVENTO'
    | 'FALLBACK_SISTEMA';
  descricaoRegra: string;
}

interface ObraConfigLookup {
  id: string;
  nome: string | null;
  valor_diaria_padrao: number | string | null;
  tipo_obra: string | null;
}

interface FuncionarioPricingRow {
  nome_trabalhador: string;
  valor_diaria: number | string | null;
  valor_diaria_obra?: number | string | null;
  valor_diaria_piscina?: number | string | null;
  regime_remuneracao?: string | null;
  valor_base_contratual?: number | string | null;
}

interface TrabalhadorObraValorRow {
  nome_trabalhador: string;
  valor_diaria: number | string;
  nome_obra: string | null;
  obra_id: string | null;
}

/**
 * Tabela de referência setorial V11 por tipologia quando o cadastro do trabalhador
 * ainda não possui valor_diaria_piscina / valor_diaria_obra explicitamente preenchido.
 */
const REFERENCIA_DIARIA_PISCINA: Record<string, number> = {
  GIL: 400.0,
  'GILVAN - GIL': 400.0,
  PEU: 450.0,
  'EDMILSON - PEU': 450.0,
  MATEUS: 340.0,
  IAN: 300.0,
  DANIEL: 280.0,
  'LUCAS J': 150.0,
  'LUCAS J.': 150.0,
  'ZÉ BAIANO': 150.0,
};

const REFERENCIA_DIARIA_QUASE_TUDO: Record<string, number> = {
  MANOEL: 230.0,
  WENDER: 180.0,
};

function normalizarComparacao(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Motor de Precificação Hierárquica de Diárias por Canteiro (V11)
 * Ordem estrita de precedência:
 * 1. Regras de Exceção Fixas (Chuva R$ 120,00 / Parado R$ 120,00 / Viagem Passageiro R$ 120,00)
 * 2. Tabela Específica Trabalhador × Obra (`trabalhador_obra_valores`)
 * 3. Cadastro Individual do Trabalhador por Tipologia (`funcionarios_obra`: `valor_diaria_piscina` / `valor_diaria_obra` / `valor_diaria`)
 * 4. Referência de Tipologia (Piscina / Quase Tudo) quando valor no cadastro está zerado/ausente
 * 5. Valor Padrão da Obra (`obras_config.valor_diaria_padrao`)
 * 6. Fallback Geral do Sistema (R$ 150,00 Piscina / R$ 180,00 Obra Civil)
 */
export async function calcularValorDiariaCanteiro(
  params: CalculoDiariaParams
): Promise<CalculoDiariaResultado> {
  const { tenantId, nomeTrabalhador, obraId, nomeObra, tipoObra, fracao, motivo } =
    params;
  const fracaoEfetiva = fracao === 0 ? 0 : fracao || 1.0;
  const motivoUpper = (motivo || '').toUpperCase();
  const nomeCanonico = normalizarNomeTrabalhadorCanonico(nomeTrabalhador);
  const nomeCanonicoUpper = nomeCanonico.toUpperCase();
  const aliasesEquivalentes = obterAliasesEquivalentes(nomeTrabalhador).map(
    normalizarComparacao
  );

  // 0. Falta sem remuneração
  if (fracaoEfetiva <= 0 || motivoUpper.includes('FALTA')) {
    return {
      valorUnitarioObra: 0.0,
      fracaoAplicada: 0.0,
      valorFinal: 0.0,
      origemValor: 'REGRA_EVENTO',
      descricaoRegra: 'Falta / Sem remuneração (0,0d)',
    };
  }

  // 1. Regras de Exceção Fixas de Eventos de Campo (Chuva = R$ 120,00 fixo, Parado, Viagem sem motorista)
  if (motivoUpper.includes('CHUVA') || motivoUpper.includes('PARADO')) {
    const valorEvento = 120.0;
    return {
      valorUnitarioObra: valorEvento,
      fracaoAplicada: fracaoEfetiva,
      valorFinal: Number((valorEvento * fracaoEfetiva).toFixed(2)),
      origemValor: 'REGRA_EVENTO',
      descricaoRegra: `Regra de ${motivoUpper.includes('CHUVA') ? 'Dia de Chuva' : 'Dia Parado'} (Fixo R$ 120,00)`,
    };
  }

  if (
    motivoUpper.includes('VIAGEM') &&
    !motivoUpper.includes('VIAGEM_MOTORISTA') &&
    !motivoUpper.includes('MOTORISTA')
  ) {
    const valorViagem = 120.0;
    return {
      valorUnitarioObra: valorViagem,
      fracaoAplicada: fracaoEfetiva,
      valorFinal: Number((valorViagem * fracaoEfetiva).toFixed(2)),
      origemValor: 'REGRA_EVENTO',
      descricaoRegra: 'Regra de Viagem/Passageiro (Fixo R$ 120,00)',
    };
  }

  // Consultar metadados da obra (apenas para descobrir tipologia e fallback futuro)
  let obraData: ObraConfigLookup | null = null;
  if (obraId || nomeObra) {
    try {
      let queryObra = supabaseAdmin
        .from('obras_config')
        .select('id, nome, valor_diaria_padrao, tipo_obra')
        .eq('tenant_id', tenantId);

      if (obraId) {
        queryObra = queryObra.eq('id', obraId);
      } else if (nomeObra) {
        queryObra = queryObra.ilike('nome', `%${nomeObra}%`);
      }

      const { data } = await queryObra.limit(1).maybeSingle();
      obraData = (data as ObraConfigLookup | null) || null;
    } catch (e) {
      console.warn('Aviso ao consultar obras_config:', e);
    }
  }

  const nomeObraCanonico = normalizarNomeObraCanonica(
    nomeObra || obraData?.nome,
    tipoObra || obraData?.tipo_obra
  );
  const isObraQuaseTudo = nomeObraCanonico.includes('QUASE TUDO');
  const isPiscina =
    !isObraQuaseTudo &&
    ((tipoObra || obraData?.tipo_obra || '').toUpperCase() === 'PISCINA' ||
      nomeObraCanonico.includes('PISCINA'));

  // 2. Prioridade 1: Tabela Específica Trabalhador × Obra (trabalhador_obra_valores)
  if (obraId || nomeObra) {
    try {
      let query = supabaseAdmin
        .from('trabalhador_obra_valores')
        .select('nome_trabalhador, valor_diaria, nome_obra, obra_id')
        .eq('tenant_id', tenantId)
        .eq('ativo', true);

      if (obraId) {
        query = query.eq('obra_id', obraId);
      }

      const { data: precosObra } = await query;
      const listaPrecos = (precosObra as TrabalhadorObraValorRow[] | null) || [];
      const matchExcecao = listaPrecos.find((row) => {
        const rowNorm = normalizarComparacao(
          normalizarNomeTrabalhadorCanonico(row.nome_trabalhador)
        );
        const obraMatch =
          Boolean(obraId && row.obra_id === obraId) ||
          !row.nome_obra ||
          normalizarNomeObraCanonica(row.nome_obra) === nomeObraCanonico;
        return obraMatch && aliasesEquivalentes.includes(rowNorm);
      });

      if (matchExcecao && Number(matchExcecao.valor_diaria) > 0) {
        const base = Number(matchExcecao.valor_diaria);
        return {
          valorUnitarioObra: base,
          fracaoAplicada: fracaoEfetiva,
          valorFinal: Number((base * fracaoEfetiva).toFixed(2)),
          origemValor: 'OBRA_TRABALHADOR',
          descricaoRegra: `Tabela específica (${matchExcecao.nome_obra || nomeObraCanonico}): R$ ${base.toFixed(2)}/dia`,
        };
      }
    } catch (e) {
      console.warn('Aviso ao consultar trabalhador_obra_valores:', e);
    }
  }

  // 3. Prioridade 2: Cadastro Individual do Trabalhador por Tipologia (funcionarios_obra)
  // IMPORTANTE: Avaliado ANTES de obras_config.valor_diaria_padrao (que tem default R$ 150,00)
  try {
    let funcionariosLista: FuncionarioPricingRow[] = [];
    const resTipologia = await supabaseAdmin
      .from('funcionarios_obra')
      .select(
        'nome_trabalhador, valor_diaria, valor_diaria_obra, valor_diaria_piscina, regime_remuneracao, valor_base_contratual'
      )
      .eq('tenant_id', tenantId);

    if (resTipologia.error) {
      // Fallback seguro caso as colunas valor_diaria_obra/piscina ainda não tenham sido migradas
      const resBasico = await supabaseAdmin
        .from('funcionarios_obra')
        .select('nome_trabalhador, valor_diaria, regime_remuneracao, valor_base_contratual')
        .eq('tenant_id', tenantId);
      funcionariosLista =
        (resBasico.data as FuncionarioPricingRow[] | null) || [];
    } else {
      funcionariosLista =
        (resTipologia.data as FuncionarioPricingRow[] | null) || [];
    }

    const funcData = funcionariosLista.find((f) => {
      const fNorm = normalizarComparacao(
        normalizarNomeTrabalhadorCanonico(f.nome_trabalhador)
      );
      return aliasesEquivalentes.includes(fNorm);
    });

    if (funcData) {
      // Regimes fixos (SEMANALISTA / MENSALISTA): ponto atesta presença sem gerar diária avulsa duplicada
      if (
        funcData.regime_remuneracao === 'SEMANALISTA' ||
        funcData.regime_remuneracao === 'MENSALISTA'
      ) {
        const valorBase = Number(funcData.valor_base_contratual || 0);
        return {
          valorUnitarioObra: 0.0,
          fracaoAplicada: fracaoEfetiva,
          valorFinal: 0.0,
          origemValor: 'TRABALHADOR_GLOBAL',
          descricaoRegra: `${funcData.regime_remuneracao === 'MENSALISTA' ? 'Mensalista' : 'Semanalista'} Fixo (R$ ${valorBase.toFixed(2)}) - Ponto para auditoria de presença`,
        };
      }

      const valorPiscina = Number(funcData.valor_diaria_piscina || 0);
      const valorObra = Number(funcData.valor_diaria_obra || 0);
      const valorGlobal = Number(funcData.valor_diaria || 0);

      if (isPiscina && valorPiscina > 0) {
        return {
          valorUnitarioObra: valorPiscina,
          fracaoAplicada: fracaoEfetiva,
          valorFinal: Number((valorPiscina * fracaoEfetiva).toFixed(2)),
          origemValor: 'TRABALHADOR_TIPOLOGIA',
          descricaoRegra: `Diária Piscina do trabalhador (${nomeCanonico}): R$ ${valorPiscina.toFixed(2)}/dia`,
        };
      }

      if (!isPiscina && valorObra > 0) {
        return {
          valorUnitarioObra: valorObra,
          fracaoAplicada: fracaoEfetiva,
          valorFinal: Number((valorObra * fracaoEfetiva).toFixed(2)),
          origemValor: 'TRABALHADOR_TIPOLOGIA',
          descricaoRegra: `Diária Obra Civil do trabalhador (${nomeCanonico}): R$ ${valorObra.toFixed(2)}/dia`,
        };
      }

      if (valorGlobal > 0) {
        return {
          valorUnitarioObra: valorGlobal,
          fracaoAplicada: fracaoEfetiva,
          valorFinal: Number((valorGlobal * fracaoEfetiva).toFixed(2)),
          origemValor: 'TRABALHADOR_GLOBAL',
          descricaoRegra: `Diária cadastrada do trabalhador (${nomeCanonico}): R$ ${valorGlobal.toFixed(2)}/dia`,
        };
      }
    }
  } catch (e) {
    console.warn('Aviso ao consultar funcionarios_obra:', e);
  }

  // 4. Prioridade 3: Referência Setorial por Tipologia (Piscina Porto Seguro / Quase Tudo)
  if (isObraQuaseTudo && REFERENCIA_DIARIA_QUASE_TUDO[nomeCanonicoUpper]) {
    const base = REFERENCIA_DIARIA_QUASE_TUDO[nomeCanonicoUpper];
    return {
      valorUnitarioObra: base,
      fracaoAplicada: fracaoEfetiva,
      valorFinal: Number((base * fracaoEfetiva).toFixed(2)),
      origemValor: 'TRABALHADOR_TIPOLOGIA',
      descricaoRegra: `Diária Quase Tudo (${nomeCanonico}): R$ ${base.toFixed(2)}/dia`,
    };
  }

  if (isPiscina && REFERENCIA_DIARIA_PISCINA[nomeCanonicoUpper]) {
    const base = REFERENCIA_DIARIA_PISCINA[nomeCanonicoUpper];
    return {
      valorUnitarioObra: base,
      fracaoAplicada: fracaoEfetiva,
      valorFinal: Number((base * fracaoEfetiva).toFixed(2)),
      origemValor: 'TRABALHADOR_TIPOLOGIA',
      descricaoRegra: `Diária Piscina (${nomeCanonico}): R$ ${base.toFixed(2)}/dia`,
    };
  }

  // 5. Prioridade 4: Valor Padrão Configurado na Própria Obra (obras_config)
  if (obraData?.valor_diaria_padrao && Number(obraData.valor_diaria_padrao) > 0) {
    const base = Number(obraData.valor_diaria_padrao);
    return {
      valorUnitarioObra: base,
      fracaoAplicada: fracaoEfetiva,
      valorFinal: Number((base * fracaoEfetiva).toFixed(2)),
      origemValor: 'OBRA_PADRAO',
      descricaoRegra: `Valor padrão do canteiro (${nomeObraCanonico}): R$ ${base.toFixed(2)}/dia`,
    };
  }

  // 6. Fallback Geral do Sistema (Padrão R$ 150,00 Piscina / R$ 180,00 Obra Civil)
  const baseFallback = isPiscina ? 150.0 : 180.0;
  return {
    valorUnitarioObra: baseFallback,
    fracaoAplicada: fracaoEfetiva,
    valorFinal: Number((baseFallback * fracaoEfetiva).toFixed(2)),
    origemValor: 'FALLBACK_SISTEMA',
    descricaoRegra: `Diária base padrão do sistema (${isPiscina ? 'Piscina' : 'Obra Civil'}): R$ ${baseFallback.toFixed(2)}/dia`,
  };
}
