import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';

export type SeveridadeAnomalia = 'ALTA' | 'MEDIA' | 'INFO';

export type TipoAnomaliaAuditoria =
  | 'SOMA_DIARIA_ACIMA_1'
  | 'PRECO_FORA_REGRA'
  | 'VALE_SEM_COMPROVANTE'
  | 'ALIAS_NAO_CANONICO'
  | 'DUPLICIDADE_SUSPEITA'
  | 'SEM_CHAVE_PIX';

export type TipoAcaoCorretiva =
  | 'NORMALIZAR_NOME'
  | 'CORRIGIR_VALOR'
  | 'DESCARTAR_DUPLICIDADE'
  | 'REVISAO_MANUAL';

export interface LancamentoAuditoriaInput {
  id: string;
  nomeTrabalhador: string;
  obraId: string | null;
  obraNome: string;
  obraTipo: string | null;
  tipoLancamento: 'PONTO' | 'VALE';
  fracaoDia: number;
  valorMonetario: number;
  status: string;
  dataReferencia: string;
  observacao: string | null;
  comprovanteUrl: string | null;
  valeEtapa: string | null;
  loteId: string | null;
  createdAt: string | null;
}

export interface FuncionarioAuditoriaInput {
  id: string;
  nomeTrabalhador: string;
  chavePix: string | null;
  valorDiaria: number | null;
  valorDiariaObra: number | null;
  valorDiariaPiscina: number | null;
  regimeRemuneracao: string | null;
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
}

export interface RelatorioAuditoriaInterna {
  anomalias: AnomaliaAuditoria[];
  simulacao: SimulacaoPreFechamento;
  cruzamentoLotes: CruzamentoLoteAuditoria[];
  totalLancamentosAnalisados: number;
  totalLotesAnalisados: number;
}

const REGRA_CHUVA_VALOR = 120;

/**
 * Motor determinístico e puro da Auditoria Interna (Prompt 9):
 * cruza lançamentos financeiros x cadastros x lotes WhatsApp para detectar anomalias,
 * propor Diff Antes x Depois e simular impacto financeiro pré-fechamento.
 */
export function executarAuditoriaInterna(params: {
  lancamentos: LancamentoAuditoriaInput[];
  funcionarios: FuncionarioAuditoriaInput[];
  lotes: LoteAuditoriaInput[];
  agoraRef?: Date;
}): RelatorioAuditoriaInterna {
  const agora = params.agoraRef || new Date();
  const anomalias: AnomaliaAuditoria[] = [];

  const mapaFuncs = new Map<string, FuncionarioAuditoriaInput>();
  for (const f of params.funcionarios) {
    const canon = normalizarNomeTrabalhadorCanonico(f.nomeTrabalhador).toUpperCase();
    mapaFuncs.set(canon, f);
  }

  const mapaLotes = new Map<string, LoteAuditoriaInput>();
  for (const l of params.lotes) {
    mapaLotes.set(l.id, l);
  }

  const abertos = params.lancamentos.filter(
    (l) => l.status !== 'DESCARTADO' && l.status !== 'LIQUIDADO'
  );

  // 1. Verificar nomes não canônicos (aliases soltos no banco)
  for (const lanc of abertos) {
    const canon = normalizarNomeTrabalhadorCanonico(lanc.nomeTrabalhador);
    if (canon.trim() !== lanc.nomeTrabalhador.trim()) {
      const lote = lanc.loteId ? mapaLotes.get(lanc.loteId) : undefined;
      anomalias.push({
        id: `alias-${lanc.id}`,
        tipo: 'ALIAS_NAO_CANONICO',
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

  // 2. Verificar soma de diárias > 1.0 no mesmo dia (mesmo somando obras diferentes)
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

      // Verifica se é duplicidade idêntica (mesma obra e mesma fração)
      const mesmaObra =
        new Set(lista.map((i) => normalizarNomeObraCanonica(i.obraNome, i.obraTipo)))
          .size === 1;

      if (mesmaObra && lista.length >= 2) {
        anomalias.push({
          id: `dup-${ultimo.id}`,
          tipo: 'DUPLICIDADE_SUSPEITA',
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

  // 3. Verificar precificação fora da regra hierárquica (Chuva = R$ 120 ou diária cadastrada)
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
      regraAplicada = 'Dia de Chuva (R$ 120,00 fixo)';
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

  // 4. Vales sem comprovante PIX (Etapa 1 pendente)
  for (const lanc of abertos) {
    if (lanc.tipoLancamento !== 'VALE') continue;
    const semComprovante =
      !lanc.comprovanteUrl &&
      (lanc.valeEtapa === 'SOLICITADO' || !lanc.valeEtapa);
    if (semComprovante) {
      const canon = normalizarNomeTrabalhadorCanonico(lanc.nomeTrabalhador);
      const criado = lanc.createdAt ? new Date(lanc.createdAt) : null;
      const horasAtras =
        criado && !Number.isNaN(criado.getTime())
          ? (agora.getTime() - criado.getTime()) / (1000 * 60 * 60)
          : 0;
      anomalias.push({
        id: `vale-sem-pix-${lanc.id}`,
        tipo: 'VALE_SEM_COMPROVANTE',
        severidade: horasAtras >= 24 ? 'MEDIA' : 'INFO',
        titulo: `Vale de R$ ${lanc.valorMonetario.toFixed(2)} sem comprovante PIX (Etapa 1)`,
        descricao: `O vale solicitado para ${canon} em ${lanc.dataReferencia} ainda não possui comprovante PIX vinculado na Etapa 2 (/validacao/vales).`,
        trabalhadorCanonico: canon,
        obraNome: normalizarNomeObraCanonica(lanc.obraNome, lanc.obraTipo),
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

  for (const [key, reg] of Array.from(saldosPorTrabalhador.entries())) {
    if (reg.atual <= 0) continue;
    const func = mapaFuncs.get(key);
    const pix = (func?.chavePix || '').trim();
    if (!pix || pix.toLowerCase().includes('não informada')) {
      anomalias.push({
        id: `sem-pix-${key}`,
        tipo: 'SEM_CHAVE_PIX',
        severidade: 'MEDIA',
        titulo: `Trabalhador com saldo aberto (R$ ${reg.atual.toFixed(2)}) sem chave PIX`,
        descricao: `${reg.nome} possui saldo líquido em aberto de R$ ${reg.atual.toFixed(2)}, mas não tem chave PIX cadastrada em /setup.`,
        trabalhadorCanonico: reg.nome,
        obraNome: 'Cadastro Geral',
        dataReferencia: agora.toISOString().slice(0, 10),
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

  // 6. Cruzamento Mensagens WhatsApp (ponto_lote) x Lançamentos Financeiros
  const lancsPorLote = new Map<string, LancamentoAuditoriaInput[]>();
  for (const lanc of params.lancamentos) {
    if (!lanc.loteId || lanc.status === 'DESCARTADO') continue;
    const lista = lancsPorLote.get(lanc.loteId) || [];
    lista.push(lanc);
    lancsPorLote.set(lanc.loteId, lista);
  }

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
      const temDivergencia =
        vinculados.length === 0 ||
        vinculados.some((v) => lancsComAnomalia.has(v.id));

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
      };
    });

  // Ordenar anomalias por severidade (ALTA -> MEDIA -> INFO)
  const ordemSev: Record<SeveridadeAnomalia, number> = {
    ALTA: 0,
    MEDIA: 1,
    INFO: 2,
  };
  anomalias.sort((a, b) => ordemSev[a.severidade] - ordemSev[b.severidade]);

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
    totalLancamentosAnalisados: params.lancamentos.length,
    totalLotesAnalisados: params.lotes.length,
  };
}
