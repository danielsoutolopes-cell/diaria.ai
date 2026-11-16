import { supabaseAdmin } from '@/lib/supabase';

export interface CalculoDiariaParams {
  tenantId: string;
  nomeTrabalhador: string;
  obraId?: string | null;
  nomeObra?: string | null;
  fracao: number; // 1.0, 0.5, 0.25
  motivo?: string | null;
}

export interface CalculoDiariaResultado {
  valorUnitarioObra: number;
  fracaoAplicada: number;
  valorFinal: number;
  origemValor: 'OBRA_TRABALHADOR' | 'OBRA_PADRAO' | 'TRABALHADOR_GLOBAL' | 'REGRA_EVENTO' | 'FALLBACK_SISTEMA';
  descricaoRegra: string;
}

/**
 * Motor de Precificação Hierárquica de Diárias por Canteiro
 * Suporta frações como 0.5 dia em uma obra (ex: Quase Tudo R$ 220) e 0.5 dia em outra (ex: Jabaquara R$ 200).
 */
export async function calcularValorDiariaCanteiro(params: CalculoDiariaParams): Promise<CalculoDiariaResultado> {
  const { tenantId, nomeTrabalhador, obraId, nomeObra, fracao, motivo } = params;
  const motivoUpper = (motivo || '').toUpperCase();

  // 1. Regras de Exceção Fixas de Eventos de Campo (Chuva, Viagem sem motorista, Parado)
  if (motivoUpper.includes('CHUVA') || motivoUpper.includes('PARADO')) {
    const valorChuva = 120.00;
    return {
      valorUnitarioObra: valorChuva,
      fracaoAplicada: fracao,
      valorFinal: Number((valorChuva * (fracao || 1.0)).toFixed(2)),
      origemValor: 'REGRA_EVENTO',
      descricaoRegra: `Regra de ${motivoUpper.includes('CHUVA') ? 'Chuva' : 'Parado'} (Base R$ 120,00)`,
    };
  }

  if (motivoUpper.includes('VIAGEM') && !motivoUpper.includes('VIAGEM_MOTORISTA') && !motivoUpper.includes('MOTORISTA')) {
    const valorViagem = 120.00;
    return {
      valorUnitarioObra: valorViagem,
      fracaoAplicada: fracao,
      valorFinal: Number((valorViagem * (fracao || 1.0)).toFixed(2)),
      origemValor: 'REGRA_EVENTO',
      descricaoRegra: 'Regra de Viagem/Passageiro (Base R$ 120,00)',
    };
  }

  // 2. Prioridade 1: Tabela Específica Trabalhador x Obra (Ex: R$ 220 Quase Tudo / R$ 200 Jabaquara)
  if (obraId || nomeObra) {
    try {
      let query = supabaseAdmin
        .from('trabalhador_obra_valores')
        .select('valor_diaria, nome_obra')
        .eq('tenant_id', tenantId)
        .eq('ativo', true)
        .ilike('nome_trabalhador', `%${nomeTrabalhador}%`);

      if (obraId) {
        query = query.eq('obra_id', obraId);
      }

      const { data: precoExcecao } = await query.limit(1).maybeSingle();

      if (precoExcecao?.valor_diaria) {
        const base = Number(precoExcecao.valor_diaria);
        return {
          valorUnitarioObra: base,
          fracaoAplicada: fracao,
          valorFinal: Number((base * (fracao || 1.0)).toFixed(2)),
          origemValor: 'OBRA_TRABALHADOR',
          descricaoRegra: `Tabela específica do canteiro (${precoExcecao.nome_obra || nomeObra}): R$ ${base.toFixed(2)}/dia`,
        };
      }
    } catch (e) {
      console.warn('Aviso ao consultar trabalhador_obra_valores:', e);
    }
  }

  // 3. Prioridade 2: Valor Padrão Configurado na Própria Obra
  if (obraId || nomeObra) {
    try {
      let queryObra = supabaseAdmin
        .from('obras_config')
        .select('valor_diaria_padrao, tipo_obra')
        .eq('tenant_id', tenantId);

      if (obraId) {
        queryObra = queryObra.eq('id', obraId);
      } else if (nomeObra) {
        queryObra = queryObra.ilike('nome', `%${nomeObra}%`);
      }

      const { data: obraData } = await queryObra.limit(1).maybeSingle();

      if (obraData?.valor_diaria_padrao && Number(obraData.valor_diaria_padrao) > 0) {
        const base = Number(obraData.valor_diaria_padrao);
        return {
          valorUnitarioObra: base,
          fracaoAplicada: fracao,
          valorFinal: Number((base * (fracao || 1.0)).toFixed(2)),
          origemValor: 'OBRA_PADRAO',
          descricaoRegra: `Valor padrão do canteiro: R$ ${base.toFixed(2)}/dia`,
        };
      }
    } catch (e) {
      console.warn('Aviso ao consultar obras_config:', e);
    }
  }

  // 4. Prioridade 3: Valor Global do Trabalhador
  try {
    const { data: funcData } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('valor_diaria')
      .eq('tenant_id', tenantId)
      .ilike('nome_trabalhador', `%${nomeTrabalhador}%`)
      .limit(1)
      .maybeSingle();

    if (funcData?.valor_diaria && Number(funcData.valor_diaria) > 0) {
      const base = Number(funcData.valor_diaria);
      return {
        valorUnitarioObra: base,
        fracaoAplicada: fracao,
        valorFinal: Number((base * (fracao || 1.0)).toFixed(2)),
        origemValor: 'TRABALHADOR_GLOBAL',
        descricaoRegra: `Diária padrão do trabalhador: R$ ${base.toFixed(2)}/dia`,
      };
    }
  } catch (e) {
    console.warn('Aviso ao consultar funcionarios_obra:', e);
  }

  // 5. Fallback Geral do Sistema (Padrão R$ 150 Piscina / R$ 180 Civil)
  const baseFallback = 150.00;
  return {
    valorUnitarioObra: baseFallback,
    fracaoAplicada: fracao,
    valorFinal: Number((baseFallback * (fracao || 1.0)).toFixed(2)),
    origemValor: 'FALLBACK_SISTEMA',
    descricaoRegra: `Diária base padrão do sistema: R$ ${baseFallback.toFixed(2)}/dia`,
  };
}
