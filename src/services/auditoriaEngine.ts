import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import { extrairJanelaSolicitacaoBucket } from '@/lib/valeIdempotencia';

export type SeveridadeAnomalia = 'ALTA' | 'MEDIA' | 'INFO';

export type TipoAnomaliaAuditoria =
  | 'SOMA_DIARIA_ACIMA_1'
  | 'PRECO_FORA_REGRA'
  | 'VALE_SEM_COMPROVANTE'
  | 'ALIAS_NAO_CANONICO'
  | 'DUPLICIDADE_SUSPEITA'
  | 'VALE_DUPLICADO'
  | 'REGISTRO_FANTASMA'
  | 'LOTE_FANTASMA'
  | 'FUNCIONARIO_DUPLICADO'
  | 'SEM_CHAVE_IDEMPOTENCIA'
  | 'SEM_CHAVE_PIX';

export type CategoriaAnomaliaSaude =
  | 'DUPLICADOS'
  | 'FANTASMAS'
  | 'REGRAS'
  | 'RASTREABILIDADE';

export type TipoAcaoCorretiva =
  | 'NORMALIZAR_NOME'
  | 'CORRIGIR_VALOR'
  | 'DESCARTAR_DUPLICIDADE'
  | 'PREENCHER_IDEMPOTENCIA'
  | 'REVISAO_MANUAL';

export type NivelSaudeSistema = 'EXCELENTE' | 'SAUDAVEL' | 'ATENCAO' | 'CRITICO';
export type StatusPilarSaude = 'OK' | 'ALERTA' | 'CRITICO';

export interface LancamentoAuditoriaInput {
  id: string;
  nomeTrabalhador: string;
  obraId: string | null;
  obraNome: string;
  obraTipo: string | null;
  tipoLancamento: 'PONTO' | 'VALE' | 'LIQUIDACAO';
  fracaoDia: number;
  valorMonetario: number;
  status: string;
  dataReferencia: string;
  observacao: string | null;
  comprovanteUrl: string | null;
  valeEtapa: string | null;
  loteId: string | null;
  createdAt: string | null;
  chaveIdempotencia?: string | null;
  horarioOrigem?: string | null;
  solicitadoPor?: string | null;
  dataHoraSolicitacao?: string | null;
  aprovadoPor?: string | null;
  dataHoraEnvioEfetivo?: string | null;
}

export interface FuncionarioAuditoriaInput {
  id: string;
  nomeTrabalhador: string;
  chavePix: string | null;
  valorDiaria: number | null;
  valorDiariaObra: number | null;
  valorDiariaPiscina: number | null;
  regimeRemuneracao: string | null;
  ativo?: boolean;
}

export interface LoteAuditoriaInput {
  id: string;
  dataReferencia: string;
  mensagemOriginal: string;
  status: string;
  remetenteNome: string | null;
  createdAt: string | null;
  obraNome: string;
}

export interface AnomaliaAuditoria {
  id: string;
  tipo: TipoAnomaliaAuditoria;
  categoria?: CategoriaAnomaliaSaude;
  severidade: SeveridadeAnomalia;
  titulo: string;
  descricao: string;
  trabalhadorCanonico: string;
  obraNome: string;
  dataReferencia: string;
  lancamentoId: string | null;
  loteEvidencia: string | null;
  antes: {
    campo: string;
    valor: string;
  };
  depoisSugerido: {
    campo: string;
    valor: string;
  };
  impactoFinanceiroDelta: number; // positivo aumenta saldo, negativo reduz saldo
  acaoCorretiva: {
    tipo: TipoAcaoCorretiva;
    podeAprovarUmClique: boolean;
    novoNome?: string;
    novoValor?: number;
    lancamentoId?: string;
  };
}

export interface SimulacaoPreFechamento {
  saldoAbertoAtual: number;
  impactoCorrecoesDelta: number;
  saldoProjetadoPosCorrecoes: number;
  totalAnomalias: number;
  anomaliasAlta: number;
  anomaliasMedia: number;
  anomaliasInfo: number;
  porTrabalhador: Array<{
    trabalhador: string;
    atual: number;
    delta: number;
    projetado: number;
  }>;
}

export interface CruzamentoLoteAuditoria {
  loteId: string;
  dataReferencia: string;
  obraNome: string;
  remetente: string;
  statusLote: string;
  trechoMensagem: string;
  qtdLancamentosVinculados: number;
  valorTotalLote: number;
  temDivergencia: boolean;
  isFantasma?: boolean;
}

export interface PilarSaudeSistema {
  id: string;
  titulo: string;
  status: StatusPilarSaude;
  nota: number;
  resumo: string;
  ocorrencias: number;
}

export interface RelatorioSaudeSistema {
  scoreGeral: number;
  nivel: NivelSaudeSistema;
  duplicadosDetectados: number;
  fantasmasDetectados: number;
  lotesFantasmasDetectados: number;
  cadastrosDuplicadosDetectados: number;
  coberturaIdempotenciaPct: number;
  coberturaRastreabilidadeValesPct: number;
  coberturaPixEquipePct: number;
  dataCorteFormatada: string | null;
  pilares: PilarSaudeSistema[];
}

export interface RelatorioAuditoriaInterna {
  anomalias: AnomaliaAuditoria[];
  simulacao: SimulacaoPreFechamento;
  cruzamentoLotes: CruzamentoLoteAuditoria[];
  saudeSistema: RelatorioSaudeSistema;
  totalLancamentosAnalisados: number;
  totalLotesAnalisados: number;
}

const REGRA_CHUVA_VALOR = 120;

function classificarCategoria(tipo: TipoAnomaliaAuditoria): CategoriaAnomaliaSaude {
  if (
    tipo === 'DUPLICIDADE_SUSPEITA' ||
    tipo === 'VALE_DUPLICADO' ||
    tipo === 'FUNCIONARIO_DUPLICADO'
  ) {
    return 'DUPLICADOS';
  }
  if (tipo === 'REGISTRO_FANTASMA' || tipo === 'LOTE_FANTASMA') {
    return 'FANTASMAS';
  }
  if (tipo === 'SOMA_DIARIA_ACIMA_1' || tipo === 'PRECO_FORA_REGRA') {
    return 'REGRAS';
  }
  return 'RASTREABILIDADE';
}

function diferencaDias(dataIsoA: string, dataIsoB: string): number | null {
  const a = Date.parse(`${dataIsoA.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${dataIsoB.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function classificarNivelSaude(score: number): NivelSaudeSistema {
  if (score >= 90) return 'EXCELENTE';
  if (score >= 75) return 'SAUDAVEL';
  if (score >= 50) return 'ATENCAO';
  return 'CRITICO';
}

function classificarStatusPilar(nota: number): StatusPilarSaude {
  if (nota >= 90) return 'OK';
  if (nota >= 65) return 'ALERTA';
  return 'CRITICO';
}

/**
 * Motor determinístico e puro da Saúde do Sistema & Auditoria Interna (V18):
 * cruza lançamentos financeiros x cadastros x obras x lotes WhatsApp para detectar:
 * - Duplicidades (Diárias, Vales e Cadastros de Colaboradores);
 * - Registros Fantasmas (datas absurdas/deslocadas, valores zerados, obras órfãs,
 *   trabalhadores não cadastrados e lotes WhatsApp sem lançamentos vinculados);
 * - Precificação fora da regra (Chuva R$ 120,00 padrão 1.0 e tabela individual);
 * - Rastreabilidade, Idempotência e Score de Saúde 0–100.
 */
export function executarAuditoriaInterna(params: {
  lancamentos: LancamentoAuditoriaInput[];
  funcionarios: FuncionarioAuditoriaInput[];
  lotes: LoteAuditoriaInput[];
  obrasAtivasIds?: readonly string[];
  dataCorteFormatada?: string | null;
  agoraRef?: Date;
}): RelatorioAuditoriaInterna {
  const agora = params.agoraRef || new Date();
  const hojeIso = agora.toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
  const anomalias: AnomaliaAuditoria[] = [];

  const mapaFuncs = new Map<string, FuncionarioAuditoriaInput>();
  const funcsPorCanonico = new Map<string, FuncionarioAuditoriaInput[]>();

  for (const f of params.funcionarios) {
    const canon = normalizarNomeTrabalhadorCanonico(f.nomeTrabalhador);
    const key = canon.toUpperCase();
    mapaFuncs.set(key, f);
    if (f.ativo !== false) {
      const lista = funcsPorCanonico.get(key) || [];
      lista.push(f);
      funcsPorCanonico.set(key, lista);
    }
  }

  const obrasAtivasSet =
    params.obrasAtivasIds && params.obrasAtivasIds.length > 0
      ? new Set(params.obrasAtivasIds)
      : null;

  const mapaLotes = new Map<string, LoteAuditoriaInput>();
  for (const l of params.lotes) {
    mapaLotes.set(l.id, l);
  }

  const abertos = params.lancamentos.filter(
    (l) => l.status !== 'DESCARTADO' && l.status !== 'LIQUIDADO'
  );

  // 0. Cadastros duplicados em funcionarios_obra (ex.: "GIL" e "Gilvan" ambos ativos)
  let cadastrosDuplicadosDetectados = 0;
  for (const [, listaFuncs] of Array.from(funcsPorCanonico.entries())) {
    if (listaFuncs.length >= 2) {
      cadastrosDuplicadosDetectados++;
      const canon = normalizarNomeTrabalhadorCanonico(
        listaFuncs[0].nomeTrabalhador
      );
      const nomesRaw = listaFuncs.map((f) => `"${f.nomeTrabalhador}"`).join(', ');
      anomalias.push({
        id: `func-dup-${canon.toLowerCase().replace(/\s+/g, '-')}`,
        tipo: 'FUNCIONARIO_DUPLICADO',
        categoria: 'DUPLICADOS',
        severidade: 'MEDIA',
        titulo: `Cadastro duplicado na equipe: ${canon} (${listaFuncs.length} perfis ativos)`,
        descricao: `Existem ${listaFuncs.length} cadastros ativos em funcionarios_obra apontando para o mesmo colaborador canônico (${nomesRaw}). Unificar evita divergência de chave PIX e diária base.`,
        trabalhadorCanonico: canon,
        obraNome: 'Cadastro de Equipe',
        dataReferencia: hojeIso,
        lancamentoId: null,
        loteEvidencia: null,
        antes: { campo: 'funcionarios_obra', valor: nomesRaw },
        depoisSugerido: {
          campo: 'funcionarios_obra',
          valor: `Manter apenas 1 perfil ativo "${canon}" em /setup`,
        },
        impactoFinanceiroDelta: 0,
        acaoCorretiva: {
          tipo: 'REVISAO_MANUAL',
          podeAprovarUmClique: false,
        },
      });
    }
  }

  // 1. Verificar nomes não canônicos (aliases soltos no banco)
  for (const lanc of abertos) {
    const canon = normalizarNomeTrabalhadorCanonico(lanc.nomeTrabalhador);
    if (canon.trim() !== lanc.nomeTrabalhador.trim()) {
      const lote = lanc.loteId ? mapaLotes.get(lanc.loteId) : undefined;
      anomalias.push({
        id: `alias-${lanc.id}`,
        tipo: 'ALIAS_NAO_CANONICO',
        categoria: 'RASTREABILIDADE',
        severidade: 'MEDIA',
        titulo: `Apelido não unificado: "${lanc.nomeTrabalhador}"`,
        descricao: `O lançamento está salvo como "${lanc.nomeTrabalhador}", mas o nome canônico oficial na tabela de aliases é "${canon}". Unificar evita fragmentação no borderô e no Excel V6.`,
        trabalhadorCanonico: canon,
        obraNome: normalizarNomeObraCanonica(lanc.obraNome, lanc.obraTipo),
        dataReferencia: lanc.dataReferencia,
        lancamentoId: lanc.id,
        loteEvidencia: lote?.mensagemOriginal?.slice(0, 140) || null,
        antes: { campo: 'nome_trabalhador', valor: lanc.nomeTrabalhador },
        depoisSugerido: { campo: 'nome_trabalhador', valor: canon },
        impactoFinanceiroDelta: 0,
        acaoCorretiva: {
          tipo: 'NORMALIZAR_NOME',
          podeAprovarUmClique: true,
          novoNome: canon,
          lancamentoId: lanc.id,
        },
      });
    }
  }

  // 2. Verificar soma de diárias > 1.0 no mesmo dia & diárias duplicadas
  const pontosPorTrabalhadorDia = new Map<string, LancamentoAuditoriaInput[]>();
  for (const lanc of abertos) {
    if (lanc.tipoLancamento !== 'PONTO') continue;
    const canon = normalizarNomeTrabalhadorCanonico(lanc.nomeTrabalhador);
    const chave = `${canon.toUpperCase()}__${lanc.dataReferencia}`;
    const lista = pontosPorTrabalhadorDia.get(chave) || [];
    lista.push(lanc);
    pontosPorTrabalhadorDia.set(chave, lista);
  }

  for (const [, lista] of Array.from(pontosPorTrabalhadorDia.entries())) {
    const somaFracao = Number(
      lista.reduce((acc, item) => acc + Number(item.fracaoDia || 0), 0).toFixed(2)
    );
    if (somaFracao > 1.0) {
      const ultimo = lista[lista.length - 1];
      const canon = normalizarNomeTrabalhadorCanonico(ultimo.nomeTrabalhador);
      const obrasEnvolvidas = Array.from(
        new Set(lista.map((i) => normalizarNomeObraCanonica(i.obraNome, i.obraTipo)))
      ).join(' + ');

      const mesmaObra =
        new Set(lista.map((i) => normalizarNomeObraCanonica(i.obraNome, i.obraTipo)))
          .size === 1;

      if (mesmaObra && lista.length >= 2) {
        anomalias.push({
          id: `dup-${ultimo.id}`,
          tipo: 'DUPLICIDADE_SUSPEITA',
          categoria: 'DUPLICADOS',
          severidade: 'ALTA',
          titulo: `Diária duplicada em ${obrasEnvolvidas} (${somaFracao}d no mesmo dia)`,
          descricao: `Foram encontrados ${lista.length} lançamentos de ponto abertos para ${canon} em ${ultimo.dataReferencia} na mesma obra (${obrasEnvolvidas}), somando ${somaFracao} diárias.`,
          trabalhadorCanonico: canon,
          obraNome: obrasEnvolvidas,
          dataReferencia: ultimo.dataReferencia,
          lancamentoId: ultimo.id,
          loteEvidencia: ultimo.loteId
            ? mapaLotes.get(ultimo.loteId)?.mensagemOriginal?.slice(0, 140) || null
            : null,
          antes: {
            campo: 'status / soma_dia',
            valor: `${ultimo.status} (soma ${somaFracao}d = R$ ${lista
              .reduce((a, b) => a + b.valorMonetario, 0)
              .toFixed(2)})`,
          },
          depoisSugerido: {
            campo: 'status',
            valor: `DESCARTADO (Soft Delete do duplicado — economiza R$ ${ultimo.valorMonetario.toFixed(2)})`,
          },
          impactoFinanceiroDelta: Number((-ultimo.valorMonetario).toFixed(2)),
          acaoCorretiva: {
            tipo: 'DESCARTAR_DUPLICIDADE',
            podeAprovarUmClique: true,
            lancamentoId: ultimo.id,
          },
        });
      } else {
        anomalias.push({
          id: `soma-${ultimo.id}`,
          tipo: 'SOMA_DIARIA_ACIMA_1',
          categoria: 'REGRAS',
          severidade: 'ALTA',
          titulo: `Soma diária acima de 1,0 (${somaFracao}d) entre obras`,
          descricao: `${canon} possui ${somaFracao} diárias somadas em ${ultimo.dataReferencia} nas obras ${obrasEnvolvidas}. A regra de rateio exige soma diária <= 1,0 (ex.: 0,5 + 0,5).`,
          trabalhadorCanonico: canon,
          obraNome: obrasEnvolvidas,
          dataReferencia: ultimo.dataReferencia,
          lancamentoId: ultimo.id,
          loteEvidencia: ultimo.loteId
            ? mapaLotes.get(ultimo.loteId)?.mensagemOriginal?.slice(0, 140) || null
            : null,
          antes: {
            campo: 'fracao_dia (soma)',
            valor: `${somaFracao}d`,
          },
          depoisSugerido: {
            campo: 'fracao_dia (rateio)',
            valor: 'Ajustar para 0,5d + 0,5d (total 1,0d) na tela de Borderô/Validação',
          },
          impactoFinanceiroDelta: 0,
          acaoCorretiva: {
            tipo: 'REVISAO_MANUAL',
            podeAprovarUmClique: false,
            lancamentoId: ultimo.id,
          },
        });
      }
    }
  }

  // 2B. Detectar VALES DUPLICADOS (mesmo trabalhador canônico + data + valor,
  //     na mesma janela horária OU registro sem horário colidindo com registro já completo)
  const valesPorDiaValor = new Map<string, LancamentoAuditoriaInput[]>();
  const valesAbertos = abertos.filter((l) => l.tipoLancamento === 'VALE');

  for (const vale of valesAbertos) {
    const canon = normalizarNomeTrabalhadorCanonico(vale.nomeTrabalhador);
    const valorCentavos = Math.round(Number(vale.valorMonetario || 0) * 100);
    const chaveBase = `${canon.toUpperCase()}__${vale.dataReferencia}__${valorCentavos}`;
    const lista = valesPorDiaValor.get(chaveBase) || [];
    lista.push(vale);
    valesPorDiaValor.set(chaveBase, lista);
  }

  const pontuarCompletudeVale = (v: LancamentoAuditoriaInput): number =>
    (v.comprovanteUrl ? 100 : 0) +
    (v.chaveIdempotencia ? 25 : 0) +
    (v.dataHoraSolicitacao || v.horarioOrigem ? 15 : 0) +
    (v.solicitadoPor ? 10 : 0) +
    (v.aprovadoPor ? 5 : 0);

  for (const [, grupoDiaValor] of Array.from(valesPorDiaValor.entries())) {
    if (grupoDiaValor.length < 2) continue;

    // Agrupa por janela horária explícita; registros SEM_HORA são absorvidos pelo registro
    // mais completo do mesmo trabalhador+data+valor (padrão clássico de duplicação manual/webhook)
    const porJanela = new Map<string, LancamentoAuditoriaInput[]>();
    const semHora: LancamentoAuditoriaInput[] = [];

    for (const v of grupoDiaValor) {
      const temHorario = Boolean(
        (v.horarioOrigem && v.horarioOrigem.trim()) ||
          (v.dataHoraSolicitacao && v.dataHoraSolicitacao.trim())
      );
      const janela = extrairJanelaSolicitacaoBucket(
        v.horarioOrigem || v.dataHoraSolicitacao
      );
      if (!temHorario || janela === '0000') {
        semHora.push(v);
      } else {
        const l = porJanela.get(janela) || [];
        l.push(v);
        porJanela.set(janela, l);
      }
    }

    const duplicadosDetectadosGrupo: LancamentoAuditoriaInput[] = [];

    if (porJanela.size > 0) {
      // 1) Duplicatas dentro da mesma janela horária
      for (const [, listaJanela] of Array.from(porJanela.entries())) {
        if (listaJanela.length < 2) continue;
        const ordenado = [...listaJanela].sort(
          (a, b) => pontuarCompletudeVale(b) - pontuarCompletudeVale(a)
        );
        for (let i = 1; i < ordenado.length; i++) {
          duplicadosDetectadosGrupo.push(ordenado[i]);
        }
      }
      // 2) Vales sem horário colidindo com vale já rastreado com horário no mesmo dia+valor
      for (const vSemHora of semHora) {
        duplicadosDetectadosGrupo.push(vSemHora);
      }
    } else if (semHora.length >= 2) {
      // Todos sem horário: preserva o mais completo e marca os excedentes
      const ordenado = [...semHora].sort(
        (a, b) => pontuarCompletudeVale(b) - pontuarCompletudeVale(a)
      );
      for (let i = 1; i < ordenado.length; i++) {
        duplicadosDetectadosGrupo.push(ordenado[i]);
      }
    }

    for (const dup of duplicadosDetectadosGrupo) {
      const canon = normalizarNomeTrabalhadorCanonico(dup.nomeTrabalhador);
      anomalias.push({
        id: `vale-dup-${dup.id}`,
        tipo: 'VALE_DUPLICADO',
        categoria: 'DUPLICADOS',
        severidade: 'ALTA',
        titulo: `Vale duplicado: ${canon} (R$ ${dup.valorMonetario.toFixed(2)} em ${dup.dataReferencia})`,
        descricao: `Encontrados ${grupoDiaValor.length} vales idênticos para ${canon} na mesma data e janela (${dup.horarioOrigem || dup.dataHoraSolicitacao || 'sem horário'}). Descartar a duplicata preserva o registro oficial mais completo.`,
        trabalhadorCanonico: canon,
        obraNome: normalizarNomeObraCanonica(dup.obraNome, dup.obraTipo),
        dataReferencia: dup.dataReferencia,
        lancamentoId: dup.id,
        loteEvidencia: dup.observacao,
        antes: {
          campo: 'vale (duplicado)',
          valor: `R$ ${dup.valorMonetario.toFixed(2)} (${dup.status})`,
        },
        depoisSugerido: {
          campo: 'status',
          valor: `DESCARTADO (Soft Delete — remove dedução indevida de R$ ${dup.valorMonetario.toFixed(2)})`,
        },
        // Descartar um vale duplicado AUMENTA o saldo líquido a pagar ao trabalhador
        impactoFinanceiroDelta: Number(dup.valorMonetario.toFixed(2)),
        acaoCorretiva: {
          tipo: 'DESCARTAR_DUPLICIDADE',
          podeAprovarUmClique: true,
          lancamentoId: dup.id,
        },
      });
    }
  }

  // 2C. CAÇA-FANTASMAS: Registros Fantasmas (datas absurdas/deslocadas, valor zerado, obra órfã, trabalhador inexistente)
  for (const lanc of abertos) {
    const canon = normalizarNomeTrabalhadorCanonico(lanc.nomeTrabalhador);
    const obraCanonica = normalizarNomeObraCanonica(lanc.obraNome, lanc.obraTipo);

    // Fantasma 1: Data de referência absurda (ex.: criado em nov/2026 mas com data_referencia > 45 dias atrás como 2026-03-30, ou no futuro > +2 dias)
    const diffParaHoje = diferencaDias(lanc.dataReferencia, hojeIso);
    const dataCriacaoIso = lanc.createdAt ? lanc.createdAt.slice(0, 10) : null;
    const diffParaCriacao = dataCriacaoIso
      ? diferencaDias(dataCriacaoIso, lanc.dataReferencia)
      : null;

    if (
      (diffParaHoje !== null && diffParaHoje > 2) ||
      (diffParaCriacao !== null && diffParaCriacao > 45)
    ) {
      const motivoData =
        diffParaHoje !== null && diffParaHoje > 2
          ? `data futura (${lanc.dataReferencia}, +${diffParaHoje}d à frente)`
          : `data retroativa suspeita (${lanc.dataReferencia}, criada ${diffParaCriacao}d depois em ${dataCriacaoIso})`;
      const deltaGhost =
        lanc.tipoLancamento === 'VALE'
          ? Number(lanc.valorMonetario.toFixed(2))
          : Number((-lanc.valorMonetario).toFixed(2));
      anomalias.push({
        id: `fantasma-data-${lanc.id}`,
        tipo: 'REGISTRO_FANTASMA',
        categoria: 'FANTASMAS',
        severidade: 'ALTA',
        titulo: `Registro Fantasma por data anômala (${lanc.tipoLancamento})`,
        descricao: `O lançamento de ${canon} possui ${motivoData}. Padrão típico de erro de leitura de data por IA ou registro antigo reimportado.`,
        trabalhadorCanonico: canon,
        obraNome: obraCanonica,
        dataReferencia: lanc.dataReferencia,
        lancamentoId: lanc.id,
        loteEvidencia: lanc.observacao,
        antes: {
          campo: 'data_referencia / created_at',
          valor: `${lanc.dataReferencia} (criado em ${dataCriacaoIso || 'N/A'})`,
        },
        depoisSugerido: {
          campo: 'status',
          valor: `DESCARTADO (Soft Delete auditado do registro fantasma)`,
        },
        impactoFinanceiroDelta: deltaGhost,
        acaoCorretiva: {
          tipo: 'DESCARTAR_DUPLICIDADE',
          podeAprovarUmClique: true,
          lancamentoId: lanc.id,
        },
      });
    }

    // Fantasma 2: Valor monetário <= 0 em registro ativo (exceto falta 0.0)
    const isFalta = lanc.tipoLancamento === 'PONTO' && lanc.fracaoDia === 0;
    if (!isFalta && Number(lanc.valorMonetario || 0) <= 0) {
      anomalias.push({
        id: `fantasma-valor-${lanc.id}`,
        tipo: 'REGISTRO_FANTASMA',
        categoria: 'FANTASMAS',
        severidade: 'ALTA',
        titulo: `Registro Fantasma com valor zerado (${lanc.tipoLancamento})`,
        descricao: `Lançamento ativo de ${canon} em ${lanc.dataReferencia} (${obraCanonica}) está com valor R$ ${Number(lanc.valorMonetario || 0).toFixed(2)}. Pode ser recibo não identificado ou falha de extração.`,
        trabalhadorCanonico: canon,
        obraNome: obraCanonica,
        dataReferencia: lanc.dataReferencia,
        lancamentoId: lanc.id,
        loteEvidencia: lanc.observacao,
        antes: {
          campo: 'valor_monetario',
          valor: `R$ ${Number(lanc.valorMonetario || 0).toFixed(2)}`,
        },
        depoisSugerido: {
          campo: 'status',
          valor: 'Descartar registro fantasma ou editar valor no Borderô',
        },
        impactoFinanceiroDelta: 0,
        acaoCorretiva: {
          tipo: 'DESCARTAR_DUPLICIDADE',
          podeAprovarUmClique: true,
          lancamentoId: lanc.id,
        },
      });
    }

    // Fantasma 3: Obra órfã (obra_id nulo ou inexistente na lista ativa do tenant)
    if (
      !lanc.obraId ||
      (obrasAtivasSet !== null && !obrasAtivasSet.has(lanc.obraId))
    ) {
      anomalias.push({
        id: `fantasma-obra-${lanc.id}`,
        tipo: 'REGISTRO_FANTASMA',
        categoria: 'FANTASMAS',
        severidade: 'MEDIA',
        titulo: `Lançamento sem vínculo de obra ativa (${lanc.tipoLancamento})`,
        descricao: `${canon} (${lanc.dataReferencia}) está sem obra_id válida ou vinculado a uma obra inativa/excluída. Isso distorce o Custo por Obra na Aba 5 do Excel.`,
        trabalhadorCanonico: canon,
        obraNome: obraCanonica,
        dataReferencia: lanc.dataReferencia,
        lancamentoId: lanc.id,
        loteEvidencia: lanc.observacao,
        antes: {
          campo: 'obra_id',
          valor: lanc.obraId ? `${lanc.obraId} (inativa/órfã)` : 'NULL (sem obra)',
        },
        depoisSugerido: {
          campo: 'obra_id',
          valor: 'Vincular à obra oficial em /validacao/vales ou /bordero',
        },
        impactoFinanceiroDelta: 0,
        acaoCorretiva: {
          tipo: 'REVISAO_MANUAL',
          podeAprovarUmClique: false,
          lancamentoId: lanc.id,
        },
      });
    }

    // Fantasma 4: Trabalhador fantasma (não existe no cadastro funcionarios_obra do tenant)
    if (
      params.funcionarios.length > 0 &&
      !mapaFuncs.has(canon.toUpperCase())
    ) {
      anomalias.push({
        id: `fantasma-colab-${lanc.id}`,
        tipo: 'REGISTRO_FANTASMA',
        categoria: 'FANTASMAS',
        severidade: 'MEDIA',
        titulo: `Trabalhador não cadastrado na equipe: "${canon}"`,
        descricao: `O lançamento de ${lanc.dataReferencia} (R$ ${lanc.valorMonetario.toFixed(2)}) referencia "${canon}", que não consta em funcionarios_obra deste tenant.`,
        trabalhadorCanonico: canon,
        obraNome: obraCanonica,
        dataReferencia: lanc.dataReferencia,
        lancamentoId: lanc.id,
        loteEvidencia: lanc.observacao,
        antes: { campo: 'nome_trabalhador', valor: `${canon} (sem cadastro)` },
        depoisSugerido: {
          campo: 'funcionarios_obra',
          valor: 'Cadastrar colaborador em /setup ou corrigir apelido',
        },
        impactoFinanceiroDelta: 0,
        acaoCorretiva: {
          tipo: 'REVISAO_MANUAL',
          podeAprovarUmClique: false,
          lancamentoId: lanc.id,
        },
      });
    }
  }

  // 3. Verificar precificação fora da regra hierárquica (Chuva = R$ 120 padrão 1.0 ou diária cadastrada)
  for (const lanc of abertos) {
    if (lanc.tipoLancamento !== 'PONTO') continue;
    if (lanc.fracaoDia <= 0) continue;

    const canon = normalizarNomeTrabalhadorCanonico(lanc.nomeTrabalhador);
    const obraCanonica = normalizarNomeObraCanonica(lanc.obraNome, lanc.obraTipo);
    const obsUpper = (lanc.observacao || '').toUpperCase();
    const isChuva = obsUpper.includes('CHUVA');
    const isPiscina =
      lanc.obraTipo === 'PISCINA' || obraCanonica.includes('PISCINA');

    let valorEsperado: number | null = null;
    let regraAplicada = '';

    if (isChuva) {
      valorEsperado = Number((REGRA_CHUVA_VALOR * lanc.fracaoDia).toFixed(2));
      regraAplicada = 'Dia de Chuva (R$ 120,00 padrão 1.0)';
    } else {
      const func = mapaFuncs.get(canon.toUpperCase());
      if (func) {
        const base = isPiscina
          ? func.valorDiariaPiscina || func.valorDiaria
          : func.valorDiariaObra || func.valorDiaria;
        if (base && base > 0) {
          valorEsperado = Number((base * lanc.fracaoDia).toFixed(2));
          regraAplicada = isPiscina
            ? `Tabela individual Piscina (R$ ${base.toFixed(2)})`
            : `Tabela individual Obra Civil (R$ ${base.toFixed(2)})`;
        }
      }
    }

    if (
      valorEsperado !== null &&
      Math.abs(valorEsperado - lanc.valorMonetario) >= 1
    ) {
      const delta = Number((valorEsperado - lanc.valorMonetario).toFixed(2));
      anomalias.push({
        id: `preco-${lanc.id}`,
        tipo: 'PRECO_FORA_REGRA',
        categoria: 'REGRAS',
        severidade: 'ALTA',
        titulo: `Valor divergente da regra (${regraAplicada})`,
        descricao: `A diária de ${canon} em ${obraCanonica} (${lanc.dataReferencia}) está lançada por R$ ${lanc.valorMonetario.toFixed(2)}, mas pela regra "${regraAplicada}" (fração ${lanc.fracaoDia}x) deveria ser R$ ${valorEsperado.toFixed(2)}.`,
        trabalhadorCanonico: canon,
        obraNome: obraCanonica,
        dataReferencia: lanc.dataReferencia,
        lancamentoId: lanc.id,
        loteEvidencia: lanc.loteId
          ? mapaLotes.get(lanc.loteId)?.mensagemOriginal?.slice(0, 140) || null
          : null,
        antes: {
          campo: 'valor_monetario',
          valor: `R$ ${lanc.valorMonetario.toFixed(2)}`,
        },
        depoisSugerido: {
          campo: 'valor_monetario',
          valor: `R$ ${valorEsperado.toFixed(2)} (${delta >= 0 ? '+' : ''}R$ ${delta.toFixed(2)})`,
        },
        impactoFinanceiroDelta: delta,
        acaoCorretiva: {
          tipo: 'CORRIGIR_VALOR',
          podeAprovarUmClique: true,
          novoValor: valorEsperado,
          lancamentoId: lanc.id,
        },
      });
    }
  }

  // 4. Vales sem comprovante PIX (Etapa 1 pendente) & Vales sem chave de idempotência
  let valesComIdempotencia = 0;
  let valesComRastreabilidade = 0;

  for (const lanc of valesAbertos) {
    const canon = normalizarNomeTrabalhadorCanonico(lanc.nomeTrabalhador);
    const obraCanonica = normalizarNomeObraCanonica(lanc.obraNome, lanc.obraTipo);

    if (lanc.chaveIdempotencia && lanc.chaveIdempotencia.trim().length > 0) {
      valesComIdempotencia++;
    } else if (lanc.chaveIdempotencia === null) {
      anomalias.push({
        id: `idemp-${lanc.id}`,
        tipo: 'SEM_CHAVE_IDEMPOTENCIA',
        categoria: 'RASTREABILIDADE',
        severidade: 'INFO',
        titulo: `Vale sem chave de idempotência anti-duplicidade`,
        descricao: `O vale de ${canon} em ${lanc.dataReferencia} (R$ ${lanc.valorMonetario.toFixed(2)}) ainda não possui chave_idempotencia determinística gravada no banco.`,
        trabalhadorCanonico: canon,
        obraNome: obraCanonica,
        dataReferencia: lanc.dataReferencia,
        lancamentoId: lanc.id,
        loteEvidencia: lanc.observacao,
        antes: { campo: 'chave_idempotencia', valor: 'NULL' },
        depoisSugerido: {
          campo: 'chave_idempotencia',
          valor: 'Gerar chave determinística SHA-256 em 1 clique',
        },
        impactoFinanceiroDelta: 0,
        acaoCorretiva: {
          tipo: 'PREENCHER_IDEMPOTENCIA',
          podeAprovarUmClique: true,
          lancamentoId: lanc.id,
        },
      });
    }

    if (lanc.solicitadoPor && lanc.dataHoraSolicitacao) {
      valesComRastreabilidade++;
    }

    const semComprovante =
      !lanc.comprovanteUrl &&
      (lanc.valeEtapa === 'SOLICITADO' || !lanc.valeEtapa);
    if (semComprovante) {
      const criado = lanc.createdAt ? new Date(lanc.createdAt) : null;
      const horasAtras =
        criado && !Number.isNaN(criado.getTime())
          ? (agora.getTime() - criado.getTime()) / (1000 * 60 * 60)
          : 0;
      anomalias.push({
        id: `vale-sem-pix-${lanc.id}`,
        tipo: 'VALE_SEM_COMPROVANTE',
        categoria: 'RASTREABILIDADE',
        severidade: horasAtras >= 24 ? 'MEDIA' : 'INFO',
        titulo: `Vale de R$ ${lanc.valorMonetario.toFixed(2)} sem comprovante PIX (Etapa 1)`,
        descricao: `O vale solicitado para ${canon} em ${lanc.dataReferencia} ainda não possui comprovante PIX vinculado na Etapa 2 (/validacao/vales).`,
        trabalhadorCanonico: canon,
        obraNome: obraCanonica,
        dataReferencia: lanc.dataReferencia,
        lancamentoId: lanc.id,
        loteEvidencia: lanc.observacao,
        antes: { campo: 'vale_etapa', valor: 'SOLICITADO (sem anexo R2)' },
        depoisSugerido: {
          campo: 'vale_etapa',
          valor: 'Anexar comprovante PIX em /validacao/vales',
        },
        impactoFinanceiroDelta: 0,
        acaoCorretiva: {
          tipo: 'REVISAO_MANUAL',
          podeAprovarUmClique: false,
          lancamentoId: lanc.id,
        },
      });
    }
  }

  // 5. Trabalhadores com saldo aberto sem chave PIX cadastrada
  const saldosPorTrabalhador = new Map<
    string,
    { nome: string; atual: number; delta: number }
  >();

  for (const lanc of abertos) {
    const canon = normalizarNomeTrabalhadorCanonico(lanc.nomeTrabalhador);
    const key = canon.toUpperCase();
    const reg = saldosPorTrabalhador.get(key) || {
      nome: canon,
      atual: 0,
      delta: 0,
    };
    reg.atual = Number(
      (
        reg.atual +
        (lanc.tipoLancamento === 'VALE'
          ? -lanc.valorMonetario
          : lanc.valorMonetario)
      ).toFixed(2)
    );
    saldosPorTrabalhador.set(key, reg);
  }

  let trabalhadoresComSaldo = 0;
  let trabalhadoresComPix = 0;

  for (const [key, reg] of Array.from(saldosPorTrabalhador.entries())) {
    if (reg.atual <= 0) continue;
    trabalhadoresComSaldo++;
    const func = mapaFuncs.get(key);
    const pix = (func?.chavePix || '').trim();
    if (pix && !pix.toLowerCase().includes('não informada')) {
      trabalhadoresComPix++;
    } else {
      anomalias.push({
        id: `sem-pix-${key}`,
        tipo: 'SEM_CHAVE_PIX',
        categoria: 'RASTREABILIDADE',
        severidade: 'MEDIA',
        titulo: `Trabalhador com saldo aberto (R$ ${reg.atual.toFixed(2)}) sem chave PIX`,
        descricao: `${reg.nome} possui saldo líquido em aberto de R$ ${reg.atual.toFixed(2)}, mas não tem chave PIX cadastrada em /setup.`,
        trabalhadorCanonico: reg.nome,
        obraNome: 'Cadastro Geral',
        dataReferencia: hojeIso,
        lancamentoId: null,
        loteEvidencia: null,
        antes: { campo: 'chave_pix', valor: 'Não informada' },
        depoisSugerido: {
          campo: 'chave_pix',
          valor: 'Cadastrar chave PIX em /setup ou editar no Borderô',
        },
        impactoFinanceiroDelta: 0,
        acaoCorretiva: {
          tipo: 'REVISAO_MANUAL',
          podeAprovarUmClique: false,
        },
      });
    }
  }

  // 6. Cruzamento Mensagens WhatsApp (ponto_lote) x Lançamentos Financeiros + Detecção de Lotes Fantasmas
  const lancsPorLote = new Map<string, LancamentoAuditoriaInput[]>();
  for (const lanc of params.lancamentos) {
    if (!lanc.loteId || lanc.status === 'DESCARTADO') continue;
    const lista = lancsPorLote.get(lanc.loteId) || [];
    lista.push(lanc);
    lancsPorLote.set(lanc.loteId, lista);
  }

  let lotesFantasmasDetectados = 0;
  for (const lote of params.lotes) {
    if (lote.status === 'DESCARTADO') continue;
    const vinculados = lancsPorLote.get(lote.id) || [];
    if (vinculados.length === 0) {
      lotesFantasmasDetectados++;
      anomalias.push({
        id: `lote-fantasma-${lote.id}`,
        tipo: 'LOTE_FANTASMA',
        categoria: 'FANTASMAS',
        severidade: 'MEDIA',
        titulo: `Lote WhatsApp Fantasma sem lançamentos vinculados`,
        descricao: `A mensagem recebida em ${lote.dataReferencia} (${lote.obraNome}) está registrada com status ${lote.status}, mas não possui nenhum lançamento financeiro ativo vinculado.`,
        trabalhadorCanonico: lote.remetenteNome || 'Grupo WhatsApp',
        obraNome: lote.obraNome,
        dataReferencia: lote.dataReferencia,
        lancamentoId: null,
        loteEvidencia: (lote.mensagemOriginal || '').slice(0, 160) || null,
        antes: {
          campo: 'ponto_lote / lancamentos',
          valor: `Status ${lote.status} com 0 lançamentos`,
        },
        depoisSugerido: {
          campo: 'revisão',
          valor: 'Verificar se a mensagem foi descartada ou reprocessar em /validacao/diarias',
        },
        impactoFinanceiroDelta: 0,
        acaoCorretiva: {
          tipo: 'REVISAO_MANUAL',
          podeAprovarUmClique: false,
        },
      });
    }
  }

  // Garante categoria preenchida em 100% das anomalias
  for (const anom of anomalias) {
    if (!anom.categoria) {
      anom.categoria = classificarCategoria(anom.tipo);
    }
  }

  // Aplica deltas de correções sugeridas na simulação pré-fechamento
  for (const anom of anomalias) {
    if (anom.impactoFinanceiroDelta !== 0) {
      const key = anom.trabalhadorCanonico.toUpperCase();
      const reg = saldosPorTrabalhador.get(key);
      if (reg) {
        reg.delta = Number((reg.delta + anom.impactoFinanceiroDelta).toFixed(2));
      }
    }
  }

  const porTrabalhador = Array.from(saldosPorTrabalhador.values())
    .map((r) => ({
      trabalhador: r.nome,
      atual: Math.max(0, r.atual),
      delta: r.delta,
      projetado: Math.max(0, Number((r.atual + r.delta).toFixed(2))),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.atual - a.atual);

  const saldoAbertoAtual = Number(
    porTrabalhador.reduce((acc, p) => acc + p.atual, 0).toFixed(2)
  );
  const impactoCorrecoesDelta = Number(
    porTrabalhador.reduce((acc, p) => acc + p.delta, 0).toFixed(2)
  );
  const saldoProjetadoPosCorrecoes = Math.max(
    0,
    Number((saldoAbertoAtual + impactoCorrecoesDelta).toFixed(2))
  );

  const lancsComAnomalia = new Set(
    anomalias.map((a) => a.lancamentoId).filter(Boolean)
  );

  const cruzamentoLotes: CruzamentoLoteAuditoria[] = params.lotes
    .slice(0, 40)
    .map((lote) => {
      const vinculados = lancsPorLote.get(lote.id) || [];
      const valorTotal = Number(
        vinculados
          .reduce(
            (acc, l) =>
              acc +
              (l.tipoLancamento === 'VALE'
                ? -l.valorMonetario
                : l.valorMonetario),
            0
          )
          .toFixed(2)
      );
      const isFantasma = vinculados.length === 0 && lote.status !== 'DESCARTADO';
      const temDivergencia =
        isFantasma || vinculados.some((v) => lancsComAnomalia.has(v.id));

      return {
        loteId: lote.id,
        dataReferencia: lote.dataReferencia,
        obraNome: lote.obraNome,
        remetente: lote.remetenteNome || 'Grupo WhatsApp',
        statusLote: lote.status,
        trechoMensagem: (lote.mensagemOriginal || '').slice(0, 160),
        qtdLancamentosVinculados: vinculados.length,
        valorTotalLote: valorTotal,
        temDivergencia,
        isFantasma,
      };
    });

  // Ordenar anomalias por severidade (ALTA -> MEDIA -> INFO)
  const ordemSev: Record<SeveridadeAnomalia, number> = {
    ALTA: 0,
    MEDIA: 1,
    INFO: 2,
  };
  anomalias.sort((a, b) => ordemSev[a.severidade] - ordemSev[b.severidade]);

  // 7. Cálculo do Health Score (0-100) e dos 6 Pilares de Saúde do Sistema
  const duplicadosDetectados = anomalias.filter(
    (a) => a.tipo === 'DUPLICIDADE_SUSPEITA' || a.tipo === 'VALE_DUPLICADO'
  ).length;
  const fantasmasDetectados = anomalias.filter(
    (a) => a.tipo === 'REGISTRO_FANTASMA' || a.tipo === 'LOTE_FANTASMA'
  ).length;
  const errosRegras = anomalias.filter(
    (a) => a.tipo === 'PRECO_FORA_REGRA' || a.tipo === 'SOMA_DIARIA_ACIMA_1'
  ).length;
  const errosAlias = anomalias.filter(
    (a) => a.tipo === 'ALIAS_NAO_CANONICO'
  ).length;
  const semPixCount = anomalias.filter((a) => a.tipo === 'SEM_CHAVE_PIX').length;
  const semIdempCount = anomalias.filter(
    (a) => a.tipo === 'SEM_CHAVE_IDEMPOTENCIA'
  ).length;

  const coberturaIdempotenciaPct =
    valesAbertos.length > 0
      ? Math.round((valesComIdempotencia / valesAbertos.length) * 100)
      : 100;
  const coberturaRastreabilidadeValesPct =
    valesAbertos.length > 0
      ? Math.round((valesComRastreabilidade / valesAbertos.length) * 100)
      : 100;
  const coberturaPixEquipePct =
    trabalhadoresComSaldo > 0
      ? Math.round((trabalhadoresComPix / trabalhadoresComSaldo) * 100)
      : 100;

  const notaDuplicidade = Math.max(
    0,
    100 - duplicadosDetectados * 25 - cadastrosDuplicadosDetectados * 10
  );
  const notaFantasmas = Math.max(0, 100 - fantasmasDetectados * 20);
  const notaRegras = Math.max(0, 100 - errosRegras * 18);
  const notaRastreabilidade = Math.round(
    (coberturaIdempotenciaPct + coberturaRastreabilidadeValesPct) / 2
  );
  const notaCanonicos = Math.max(0, 100 - errosAlias * 10);
  const notaPix = coberturaPixEquipePct;

  const scoreGeral = Math.round(
    notaDuplicidade * 0.25 +
      notaFantasmas * 0.25 +
      notaRegras * 0.2 +
      notaRastreabilidade * 0.15 +
      notaCanonicos * 0.05 +
      notaPix * 0.1
  );

  const pilares: PilarSaudeSistema[] = [
    {
      id: 'duplicidade',
      titulo: 'Anti-Duplicidade (Diárias & Vales)',
      status: classificarStatusPilar(notaDuplicidade),
      nota: notaDuplicidade,
      resumo:
        duplicadosDetectados === 0 && cadastrosDuplicadosDetectados === 0
          ? 'Nenhuma diária, vale ou perfil duplicado encontrado.'
          : `${duplicadosDetectados} lançamento(s) e ${cadastrosDuplicadosDetectados} cadastro(s) duplicado(s).`,
      ocorrencias: duplicadosDetectados + cadastrosDuplicadosDetectados,
    },
    {
      id: 'fantasmas',
      titulo: 'Caça-Fantasmas (Órfãos & Datas)',
      status: classificarStatusPilar(notaFantasmas),
      nota: notaFantasmas,
      resumo:
        fantasmasDetectados === 0
          ? 'Zero registros fantasmas, órfãos ou lotes vazios.'
          : `${fantasmasDetectados} anomalia(s) fantasma(s) (${lotesFantasmasDetectados} lote(s) sem vínculo).`,
      ocorrencias: fantasmasDetectados,
    },
    {
      id: 'regras',
      titulo: 'Precificação & Teto Diário (≤ 1,0d)',
      status: classificarStatusPilar(notaRegras),
      nota: notaRegras,
      resumo:
        errosRegras === 0
          ? '100% aderente à tabela individual, Chuva (1.0 = R$ 120) e rateios.'
          : `${errosRegras} lançamento(s) fora da tabela ou acima de 1,0 diária/dia.`,
      ocorrencias: errosRegras,
    },
    {
      id: 'rastreabilidade',
      titulo: 'Idempotência & Rastreabilidade Vales',
      status: classificarStatusPilar(notaRastreabilidade),
      nota: notaRastreabilidade,
      resumo: `${coberturaIdempotenciaPct}% com chave anti-duplicidade • ${coberturaRastreabilidadeValesPct}% rastreados.`,
      ocorrencias: semIdempCount,
    },
    {
      id: 'canonicos',
      titulo: 'Unificação de Nomes (Gil/Peu/Lucas J)',
      status: classificarStatusPilar(notaCanonicos),
      nota: notaCanonicos,
      resumo:
        errosAlias === 0
          ? 'Todos os lançamentos usam nomes canônicos oficiais.'
          : `${errosAlias} apelido(s) pendente(s) de normalização em 1 clique.`,
      ocorrencias: errosAlias,
    },
    {
      id: 'pix',
      titulo: 'Prontidão PIX da Folha',
      status: classificarStatusPilar(notaPix),
      nota: notaPix,
      resumo:
        semPixCount === 0
          ? `${coberturaPixEquipePct}% da equipe com saldo tem chave PIX ativa.`
          : `${semPixCount} colaborador(es) com saldo aberto ainda sem chave PIX.`,
      ocorrencias: semPixCount,
    },
  ];

  return {
    anomalias,
    simulacao: {
      saldoAbertoAtual,
      impactoCorrecoesDelta,
      saldoProjetadoPosCorrecoes,
      totalAnomalias: anomalias.length,
      anomaliasAlta: anomalias.filter((a) => a.severidade === 'ALTA').length,
      anomaliasMedia: anomalias.filter((a) => a.severidade === 'MEDIA').length,
      anomaliasInfo: anomalias.filter((a) => a.severidade === 'INFO').length,
      porTrabalhador,
    },
    cruzamentoLotes,
    saudeSistema: {
      scoreGeral,
      nivel: classificarNivelSaude(scoreGeral),
      duplicadosDetectados,
      fantasmasDetectados,
      lotesFantasmasDetectados,
      cadastrosDuplicadosDetectados,
      coberturaIdempotenciaPct,
      coberturaRastreabilidadeValesPct,
      coberturaPixEquipePct,
      dataCorteFormatada: params.dataCorteFormatada || null,
      pilares,
    },
    totalLancamentosAnalisados: params.lancamentos.length,
    totalLotesAnalisados: params.lotes.length,
  };
}
