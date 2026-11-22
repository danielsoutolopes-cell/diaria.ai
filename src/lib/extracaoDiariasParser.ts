import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import type { NLPExtracaoResponse } from '@/types/database';

type NLPObraBloco = NLPExtracaoResponse['obras'][number];
type NLPApontamento = NLPObraBloco['apontamentos'][number];

export interface OpcoesExtracaoDiarias {
  /** Lista oficial de nomes cadastrados em funcionarios_obra do tenant ativo */
  funcionariosOficiais?: readonly string[];
  /** Lista oficial de obras cadastradas em obras_config do tenant ativo */
  obrasOficiais?: readonly string[];
  /** Ano de referência para datas sem ano explícito (ex.: "22 de novembro") */
  anoReferencia?: number;
}

/**
 * Mapeamento de nomes canônicos para o nome oficial de exibição/validação no card
 * (quando o tenant não fornece um nome divergente na tabela funcionarios_obra).
 */
const NOMES_OFICIAIS_PADRAO: Record<string, string> = {
  GIL: 'Gilvan - Gil',
  MATEUS: 'Mateus',
  'LUCAS J': 'Lucas J.',
  PEU: 'Edmilson - Peu',
  IAN: 'Ian',
  'ZE BAIANO': 'Zé Baiano',
  DANIEL: 'Daniel',
  WENDER: 'Wender',
  MANOEL: 'Manoel',
  'ZE ROBERTO': 'Zé Roberto',
  DIEGO: 'Diego',
};

const MESES_PT: Record<string, number> = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12,
};

function removerAcentosUpper(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve o nome oficial do trabalhador para exibição/gravação,
 * respeitando a lista de colaboradores cadastrados do tenant ativo (isolamento multi-tenant)
 * e os aliases oficiais (Gil -> Gilvan - Gil, Peu -> Edmilson - Peu, Lucas. J -> Lucas J., etc.).
 */
export function resolverNomeOficialTrabalhador(
  nomeBruto: string,
  funcionariosOficiais?: readonly string[]
): string {
  const limpo = nomeBruto
    .replace(/^[-•*–—\d.)\s]+/, '')
    .replace(/[,;:]+$/, '')
    .trim();

  if (!limpo) return 'Trabalhador';

  const canon = normalizarNomeTrabalhadorCanonico(limpo);
  const chaveCanon = removerAcentosUpper(canon);

  // 1. Prioriza o nome oficial cadastrado em funcionarios_obra do tenant ativo
  if (funcionariosOficiais && funcionariosOficiais.length > 0) {
    const matchTenant = funcionariosOficiais.find(
      (f) =>
        removerAcentosUpper(normalizarNomeTrabalhadorCanonico(f)) === chaveCanon
    );
    if (matchTenant) {
      return matchTenant.trim();
    }
  }

  // 2. Mapeamento oficial padrão (Gilvan - Gil, Edmilson - Peu, Lucas J., Zé Baiano, etc.)
  if (NOMES_OFICIAIS_PADRAO[chaveCanon]) {
    return NOMES_OFICIAIS_PADRAO[chaveCanon];
  }

  // 3. Preserva abreviação de inicial se houver (ex.: "João. S" -> "João S.") sem truncar
  const matchInicial = limpo.match(/^([A-Za-zÀ-ÿ]+)\s*\.\s*([A-Za-zÀ-ÿ])\.?$/);
  if (matchInicial) {
    return `${matchInicial[1]} ${matchInicial[2].toUpperCase()}.`;
  }

  return canon;
}

/**
 * Extrai data YYYY-MM-DD de expressões em português (24/7, incluindo sábados e domingos).
 * Ex.: "Domingo 22 de novembro piscina porto seguro." -> "2026-11-22".
 */
export function extrairDataReferenciaTexto(
  texto: string,
  anoReferencia = 2026
): string | undefined {
  const semAcento = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // 1. ISO explícito YYYY-MM-DD
  const matchIso = semAcento.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (matchIso) {
    return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`;
  }

  // 2. Formato "22 de novembro" / "dia 22 de novembro de 2026"
  const matchExtenso = semAcento.match(
    /\b(\d{1,2})\s+de\s+([a-z]{3,10})(?:\s+de\s+(20\d{2}))?\b/
  );
  if (matchExtenso) {
    const dia = Number(matchExtenso[1]);
    const mesNome = matchExtenso[2];
    const mes = MESES_PT[mesNome];
    const ano = matchExtenso[3] ? Number(matchExtenso[3]) : anoReferencia;
    if (mes && dia >= 1 && dia <= 31) {
      return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }

  // 3. Formato DD/MM ou DD/MM/YYYY
  const matchBarra = semAcento.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (matchBarra) {
    const dia = Number(matchBarra[1]);
    const mes = Number(matchBarra[2]);
    const ano = matchBarra[3] ? Number(matchBarra[3]) : anoReferencia;
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
      return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }

  return undefined;
}

/**
 * Detecta se a linha é um cabeçalho de obra/data/contexto (e não um nome de trabalhador).
 */
function detectarCabecalhoObraOuData(
  linha: string,
  obrasOficiais?: readonly string[]
): {
  isCabecalho: boolean;
  nomeObra?: string;
  dataReferencia?: string;
  motivoContexto?: string;
  restoAposDoisPontos?: string;
} {
  const limpa = linha.trim();
  if (!limpa) return { isCabecalho: false };

  // Separa eventual formato "Piscina Porto Seguro: Gil, Mateus, ..."
  const idxDoisPontos = limpa.indexOf(':');
  const parteCabecalho =
    idxDoisPontos > 0 ? limpa.slice(0, idxDoisPontos).trim() : limpa;
  const restoAposDoisPontos =
    idxDoisPontos > 0 ? limpa.slice(idxDoisPontos + 1).trim() : undefined;

  const upper = removerAcentosUpper(parteCabecalho);
  const dataRef = extrairDataReferenciaTexto(parteCabecalho);

  const temDiaSemana =
    /\b(DOMINGO|SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SABADO)\b/.test(upper);
  const temPalavraObra =
    /\b(OBRA|PISCINA|PORTO SEGURO|QUASE TUDO|BAHIA|PORTO IMPERIAL|JABAQUARA|ALPHAVILLE|DIARIAS?|PRESENCAS?|APONTAMENTO|EQUIPE)\b/.test(
      upper
    );

  let motivoContexto: string | undefined;
  if (/\bCHUVA\b/.test(upper)) {
    motivoContexto = 'CHUVA';
  } else if (/\bVIAGEM\b/.test(upper)) {
    motivoContexto = 'VIAGEM_PASSAGEIRO';
  } else if (/\b(PARADO|SEM ACESSO|BARRADO|CONDOMINIO)\b/.test(upper)) {
    motivoContexto = 'PARADO';
  }

  // Match contra obras oficiais cadastradas no tenant ativo
  let obraEncontrada: string | undefined;
  if (obrasOficiais && obrasOficiais.length > 0) {
    const matchObra = obrasOficiais.find((o) => {
      const oUpper = removerAcentosUpper(o);
      return oUpper.length >= 3 && upper.includes(oUpper);
    });
    if (matchObra) {
      obraEncontrada = normalizarNomeObraCanonica(matchObra);
    }
  }

  if (!obraEncontrada) {
    if (upper.includes('PISCINA') && (upper.includes('PORTO SEGURO') || upper.includes('BAHIA'))) {
      obraEncontrada = 'PISCINA PORTO SEGURO';
    } else if (upper.includes('QUASE TUDO')) {
      obraEncontrada = 'QUASE TUDO';
    } else if (upper.includes('PORTO IMPERIAL') || upper.includes('MAURO OBRA')) {
      obraEncontrada = 'PORTO IMPERIAL';
    } else if (upper.includes('PORTO SEGURO') || upper.includes('BAHIA')) {
      obraEncontrada = 'PORTO SEGURO';
    } else if (upper.includes('PISCINA')) {
      // Remove prefixo de data/dia da semana e pontuação final sem truncar o resto da mensagem
      const semData = parteCabecalho
        .replace(
          /\b(?:domingo|segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado)\b/gi,
          ''
        )
        .replace(/\b(?:dia\s+)?\d{1,2}\s+de\s+[a-zç]+(?:\s+de\s+\d{4})?\b/gi, '')
        .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g, '')
        .replace(/[.!?]+$/g, '')
        .trim();
      obraEncontrada = normalizarNomeObraCanonica(semData || 'PISCINA', 'PISCINA');
    }
  }

  const isCabecalho = Boolean(
    obraEncontrada ||
      dataRef ||
      temDiaSemana ||
      temPalavraObra ||
      motivoContexto ||
      (restoAposDoisPontos && restoAposDoisPontos.length > 0)
  );

  return {
    isCabecalho,
    nomeObra: obraEncontrada,
    dataReferencia: dataRef,
    motivoContexto,
    restoAposDoisPontos,
  };
}

function isLinhaRuidoOuVale(linha: string): boolean {
  const upper = removerAcentosUpper(linha);
  if (!upper || upper.length < 2) return true;
  if (/^\d+([.,]\d+)?$/.test(upper)) return true;

  const ruidoExato = new Set([
    'OK',
    'BOM DIA',
    'BOA TARDE',
    'BOA NOITE',
    'OBRIGADO',
    'OBRIGADA',
    'VALEU',
    'VLW',
    'SHOW',
    'FECHADO',
    'COMBINADO',
    'CERTO',
    'TMJ',
    'POR FAVOR',
    'PFV',
  ]);
  if (ruidoExato.has(upper.replace(/[!?.]+$/g, ''))) return true;

  // Linhas de solicitação de vale / PIX / comprovante não são linhas de diária
  if (
    /\b(VALE|VALES|ADIANTAMENTO|COMPROVANTE|PIX|TRANSFERENCIA|REEMBOLSO|NOTA FISCAL|CUPOM|GASOLINA|PEDAGIO)\b/.test(
      upper
    )
  ) {
    return true;
  }

  // Frases longas conversacionais (> 6 palavras) não são nomes simples em lista
  const palavras = upper.split(' ').filter(Boolean);
  if (palavras.length > 6) return true;

  return false;
}

function parseLinhaTrabalhador(
  itemBruto: string,
  motivoContexto: string | undefined,
  funcionariosOficiais?: readonly string[]
): NLPApontamento | null {
  const limpo = itemBruto
    .replace(/^[-•*–—\d)]+\s*/, '')
    .trim();

  if (!limpo || isLinhaRuidoOuVale(limpo)) return null;

  const upper = removerAcentosUpper(limpo);

  let fracao = 1.0;
  let motivo = motivoContexto || 'NORMAL';
  let nomeSemModificador = limpo;

  if (/\b(FALTA|FALTOU|NAO VEIO|NAO FOI|ATESTADO)\b/.test(upper)) {
    fracao = 0.0;
    motivo = 'FALTA';
    nomeSemModificador = limpo
      .replace(/\b(falta|faltou|n[aã]o\s+veio|n[aã]o\s+foi|atestado)\b/gi, '')
      .trim();
  } else if (/\b(MEIO\s*DIA|MEIO\s*PERIODO|0[.,]5|1\/2)\b/.test(upper)) {
    fracao = 0.5;
    motivo = 'MEIO_PERIODO';
    nomeSemModificador = limpo
      .replace(/\b(meio\s*dia|meio\s*per[ií]odo|0[.,]5d?|1\/2)\b/gi, '')
      .trim();
  } else if (/\bCHUVA\b/.test(upper)) {
    fracao = 1.0; // Dia de chuva é SEMPRE 1.0 integral por padrão
    motivo = 'CHUVA';
    nomeSemModificador = limpo.replace(/\b(dia\s+de\s+)?chuva\b/gi, '').trim();
  } else if (/\bMOTORISTA\b/.test(upper)) {
    fracao = 1.0;
    motivo = 'VIAGEM_MOTORISTA';
    nomeSemModificador = limpo.replace(/\b(motorista|dirigiu)\b/gi, '').trim();
  } else if (/\bVIAGEM\b/.test(upper)) {
    fracao = 1.0;
    motivo = 'VIAGEM_PASSAGEIRO';
    nomeSemModificador = limpo.replace(/\b(dia\s+de\s+)?viagem\b/gi, '').trim();
  } else if (/\bPARADO\b/.test(upper)) {
    fracao = 1.0;
    motivo = 'PARADO';
    nomeSemModificador = limpo.replace(/\b(dia\s+)?parado\b/gi, '').trim();
  }

  // Remove conectores/traços residuais nas pontas sem jamais cortar em pontos internos (ex.: "Lucas. J")
  nomeSemModificador = nomeSemModificador
    .replace(/^[-–—:,;\s]+/, '')
    .replace(/[-–—:,;\s]+$/, '')
    .trim();

  if (!nomeSemModificador || nomeSemModificador.length < 2) return null;
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(nomeSemModificador)) return null;

  const nomeResolvido = resolverNomeOficialTrabalhador(
    nomeSemModificador,
    funcionariosOficiais
  );

  return {
    nome: nomeResolvido,
    fracao,
    motivo,
  };
}

/**
 * Parser determinístico de listas de diárias:
 * - NUNCA interrompe ou trunca após pontos finais (".") como "seguro." ou iniciais ("Lucas. J").
 * - Preserva TODAS as linhas após cabeçalhos mesmo com linhas em branco (\n\n).
 * - Aceita todos os dias da semana 24/7 (inclusive domingos e feriados).
 */
export function extrairListaTrabalhadoresDeterministica(
  textoMensagem: string,
  opcoes: OpcoesExtracaoDiarias = {}
): NLPExtracaoResponse {
  if (!textoMensagem || !textoMensagem.trim()) {
    return { obras: [] };
  }

  // Mensagem estritamente de pedido de vale (sem lista de diárias) não deve gerar apontamentos
  const textoUpper = removerAcentosUpper(textoMensagem);
  const linhasOriginais = textoMensagem.split(/\r?\n/);
  const linhasNaoVazias = linhasOriginais
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (linhasNaoVazias.length === 0) {
    return { obras: [] };
  }

  // Se for mensagem curta falando só de vale sem lista vertical de presença
  const pareceSomenteVale =
    linhasNaoVazias.length <= 2 &&
    /\b(VALE|VALES|ADIANTAMENTO|PIX)\b/.test(textoUpper) &&
    !/\b(DIARIA|DIARIAS|PRESENCA|TRABALHOU|CHUVA|VIAGEM|DOMINGO|SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SABADO)\b/.test(
      textoUpper
    );
  if (pareceSomenteVale) {
    return { obras: [] };
  }

  const anoRef = opcoes.anoReferencia ?? 2026;
  const dataGlobal = extrairDataReferenciaTexto(textoMensagem, anoRef);

  const blocos: NLPObraBloco[] = [];
  let blocoAtual: NLPObraBloco | null = null;
  let motivoContextoAtual: string | undefined;

  const garantirBloco = (
    nomeObraSugerido?: string,
    dataSugerida?: string
  ): NLPObraBloco => {
    if (!blocoAtual) {
      blocoAtual = {
        nome_obra: nomeObraSugerido || 'GERAL',
        data_referencia: dataSugerida || dataGlobal,
        apontamentos: [],
        vales: [],
        setup: false,
      };
      blocos.push(blocoAtual);
    }
    return blocoAtual;
  };

  const adicionarApontamentoSemDuplicar = (
    bloco: NLPObraBloco,
    ap: NLPApontamento
  ): void => {
    const chaveNova = removerAcentosUpper(
      normalizarNomeTrabalhadorCanonico(ap.nome)
    );
    const jaExiste = bloco.apontamentos.some(
      (x) =>
        removerAcentosUpper(normalizarNomeTrabalhadorCanonico(x.nome)) ===
        chaveNova
    );
    if (!jaExiste) {
      bloco.apontamentos.push(ap);
    }
  };

  for (const linha of linhasNaoVazias) {
    const cab = detectarCabecalhoObraOuData(linha, opcoes.obrasOficiais);

    if (cab.isCabecalho) {
      const novaObra = cab.nomeObra;
      const novaData = cab.dataReferencia || dataGlobal;
      if (cab.motivoContexto) {
        motivoContextoAtual = cab.motivoContexto;
      }

      const anterior = blocoAtual;
      let blocoAtivo: NLPObraBloco;
      if (!anterior) {
        blocoAtivo = {
          nome_obra: novaObra || 'GERAL',
          data_referencia: novaData,
          apontamentos: [],
          vales: [],
          setup: false,
        };
        blocos.push(blocoAtivo);
      } else if (
        novaObra &&
        anterior.apontamentos.length > 0 &&
        removerAcentosUpper(anterior.nome_obra) !== removerAcentosUpper(novaObra)
      ) {
        blocoAtivo = {
          nome_obra: novaObra,
          data_referencia: novaData || anterior.data_referencia,
          apontamentos: [],
          vales: [],
          setup: false,
        };
        blocos.push(blocoAtivo);
      } else {
        blocoAtivo = anterior;
        if (novaObra && blocoAtivo.nome_obra === 'GERAL') {
          blocoAtivo.nome_obra = novaObra;
        }
        if (novaData && !blocoAtivo.data_referencia) {
          blocoAtivo.data_referencia = novaData;
        }
      }
      blocoAtual = blocoAtivo;

      // Se houve lista na mesma linha após ":" (ex.: "Piscina Porto Seguro: Gil, Mateus, Lucas. J")
      // NUNCA quebra em ponto ("."), apenas em vírgula / ponto-e-vírgula / " e "
      if (cab.restoAposDoisPontos) {
        const itensLinha = cab.restoAposDoisPontos
          .split(/[,;]+|\s+e\s+/i)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const item of itensLinha) {
          const ap = parseLinhaTrabalhador(
            item,
            motivoContextoAtual,
            opcoes.funcionariosOficiais
          );
          if (ap) adicionarApontamentoSemDuplicar(blocoAtivo, ap);
        }
      }
      continue;
    }

    // Linha comum de trabalhador (ou lista separada por vírgula) — NUNCA quebra em ponto (".")
    if (isLinhaRuidoOuVale(linha)) continue;

    const bloco = garantirBloco(undefined, dataGlobal);
    const segmentos = linha.includes(',') || linha.includes(';')
      ? linha.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
      : [linha];

    for (const seg of segmentos) {
      const ap = parseLinhaTrabalhador(
        seg,
        motivoContextoAtual,
        opcoes.funcionariosOficiais
      );
      if (ap) {
        adicionarApontamentoSemDuplicar(bloco, ap);
      }
    }
  }

  return {
    obras: blocos.filter((b) => b.apontamentos.length > 0),
  };
}

/**
 * Safety-net / Reconciliador pós-LLM:
 * Garante que nenhum trabalhador listado na mensagem seja perdido caso o modelo
 * trunque após um ponto (".", ex.: "seguro." ou "Lucas. J"), linha em branco (\n\n)
 * ou limite curto de saída, preservando frações/motivos identificados pela IA.
 */
export function reconciliarExtracaoComParserDeterministico(
  textoMensagem: string,
  extracaoIA: NLPExtracaoResponse | null | undefined,
  opcoes: OpcoesExtracaoDiarias = {}
): NLPExtracaoResponse {
  const det = extrairListaTrabalhadoresDeterministica(textoMensagem, opcoes);
  const obrasIA = Array.isArray(extracaoIA?.obras) ? extracaoIA.obras : [];

  // Caso 1: IA falhou ou veio vazia -> usa extração determinística integral
  const totalApIA = obrasIA.reduce(
    (acc, o) => acc + (Array.isArray(o.apontamentos) ? o.apontamentos.length : 0),
    0
  );
  const totalValesIA = obrasIA.reduce(
    (acc, o) => acc + (Array.isArray(o.vales) ? o.vales.length : 0),
    0
  );

  if (obrasIA.length === 0 || (totalApIA === 0 && totalValesIA === 0)) {
    if (det.obras.length > 0) {
      return det;
    }
    return { obras: obrasIA };
  }

  // Normaliza nomes/obras/datas nos blocos vindos da IA sem perder nada
  const obrasFinais: NLPObraBloco[] = obrasIA.map((obra) => {
    const obraNomeLimpo = obra.nome_obra
      ? normalizarNomeObraCanonica(obra.nome_obra.replace(/[.!?]+$/g, '').trim())
      : 'GERAL';
    const dataFinal =
      obra.data_referencia ||
      extrairDataReferenciaTexto(textoMensagem, opcoes.anoReferencia ?? 2026);

    const apontamentosUnicos: NLPApontamento[] = [];
    const vistos = new Set<string>();
    for (const ap of obra.apontamentos || []) {
      const nomeOficial = resolverNomeOficialTrabalhador(
        ap.nome,
        opcoes.funcionariosOficiais
      );
      const chave = removerAcentosUpper(
        normalizarNomeTrabalhadorCanonico(nomeOficial)
      );
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      apontamentosUnicos.push({
        nome: nomeOficial,
        fracao: Number(ap.fracao ?? 1.0),
        motivo: ap.motivo || 'NORMAL',
      });
    }

    return {
      ...obra,
      nome_obra: obraNomeLimpo,
      data_referencia: dataFinal,
      apontamentos: apontamentosUnicos,
      vales: (obra.vales || []).map((v) => ({
        nome: resolverNomeOficialTrabalhador(v.nome, opcoes.funcionariosOficiais),
        valor: Number(v.valor ?? 100.0),
      })),
    };
  });

  // Caso 2: Reconcilia trabalhadores faltantes detectados pelo parser determinístico
  // (ex.: IA extraiu apenas 2 de 7 por corte após "Mateus" / "Lucas. J")
  for (const blocoDet of det.obras) {
    const chaveObraDet = removerAcentosUpper(blocoDet.nome_obra);
    let blocoAlvo = obrasFinais.find(
      (o) => removerAcentosUpper(o.nome_obra) === chaveObraDet
    );

    if (!blocoAlvo && obrasFinais.length === 1) {
      blocoAlvo = obrasFinais[0];
      if (
        blocoAlvo.nome_obra === 'GERAL' &&
        blocoDet.nome_obra !== 'GERAL'
      ) {
        blocoAlvo.nome_obra = blocoDet.nome_obra;
      }
    }

    if (!blocoAlvo) {
      obrasFinais.push(blocoDet);
      continue;
    }

    if (!blocoAlvo.data_referencia && blocoDet.data_referencia) {
      blocoAlvo.data_referencia = blocoDet.data_referencia;
    }

    const presentesNoBloco = new Set(
      blocoAlvo.apontamentos.map((a) =>
        removerAcentosUpper(normalizarNomeTrabalhadorCanonico(a.nome))
      )
    );

    for (const apDet of blocoDet.apontamentos) {
      const chaveCanon = removerAcentosUpper(
        normalizarNomeTrabalhadorCanonico(apDet.nome)
      );
      if (!presentesNoBloco.has(chaveCanon)) {
        blocoAlvo.apontamentos.push(apDet);
        presentesNoBloco.add(chaveCanon);
      }
    }
  }

  return { obras: obrasFinais };
}

export interface ResultadoSanitizacaoMensagem {
  /** Texto bruto preservado integralmente para auditoria ("Ver Mensagem Original") */
  textoOriginal: string;
  /** Versão higienizada usada exclusivamente pelo parser/IA */
  textoHigienizado: string;
  /** Lista de higienizações cirúrgicas aplicadas */
  alteracoesAplicadas: string[];
  /** Nomes candidatos encontrados na lista após higienização */
  candidatosLista: string[];
}

export interface AuditoriaContagemLista {
  qtdEsperadaLista: number;
  qtdExtraida: number;
  nomesFaltantes: string[];
  divergenciaDetectada: boolean;
}

export interface ResultadoPipelineDuasPassagens {
  extracao: NLPExtracaoResponse;
  sanitizacao: ResultadoSanitizacaoMensagem;
  auditoriaPassagem1: AuditoriaContagemLista;
  segundaPassagemExecutada: boolean;
  logsAjuste: string[];
}

/**
 * PASSAGEM 1 — SANITIZAÇÃO CIRÚRGICA (SEM ALTERAR O TEXTO ORIGINAL SALVO):
 * Remove pontos finais de frase/nome ("seguro.", "Gil.", "Daniel."), abreviações com ponto
 * em iniciais de nomes ("Lucas. J" -> "Lucas J"), ruídos de pontuação solta e linhas em branco
 * duplicadas, PRESERVANDO INTACTOS pontos/vírgulas em números decimais e valores
 * (0.5, 1.0, 0,5, 120.00, 230.00, 1.250,00).
 */
export function higienizarMensagemParaExtracao(
  textoOriginal: string,
  opcoes: OpcoesExtracaoDiarias = {}
): ResultadoSanitizacaoMensagem {
  const alteracoesAplicadas: string[] = [];
  if (!textoOriginal || !textoOriginal.trim()) {
    return {
      textoOriginal,
      textoHigienizado: '',
      alteracoesAplicadas,
      candidatosLista: [],
    };
  }

  // 1. Protege números decimais e valores monetários (0.5, 1.0, 120.00, 230.00, 1.250,00)
  const numerosProtegidos: string[] = [];
  let trabalhando = textoOriginal.replace(/\r\n?/g, '\n').replace(
    /\b\d+(?:[.,]\d+)+\b/g,
    (match) => {
      const idx = numerosProtegidos.length;
      numerosProtegidos.push(match);
      return `__NUMPROT${idx}__`;
    }
  );

  // 2. Normaliza abreviações de iniciais em nomes ("Lucas. J" / "Lucas. J." -> "Lucas J")
  const antesIniciais = trabalhando;
  trabalhando = trabalhando.replace(
    /\b([A-Za-zÀ-ÿ]{2,})\.\s*([A-Za-zÀ-ÿ])\.?(?=\s|$|[,;])/g,
    '$1 $2'
  );
  if (trabalhando !== antesIniciais) {
    alteracoesAplicadas.push('NORMALIZAR_INICIAIS_COM_PONTO');
  }

  // 3. Remove pontos finais de frase/nome (ex.: "seguro.", "Gil.", "Daniel.", "...")
  const antesPontosFinais = trabalhando;
  trabalhando = trabalhando.replace(
    /([A-Za-zÀ-ÿ])\.+(?=\s|$|[,;])/g,
    '$1'
  );
  if (trabalhando !== antesPontosFinais) {
    alteracoesAplicadas.push('REMOVER_PONTOS_FINAIS_TEXTO');
  }

  // 4. Remove ruídos de pontuação solta e colapsa linhas em branco duplicadas
  const linhasRaw = trabalhando.split('\n');
  const linhasLimpas: string[] = [];
  let removeuLinhasVaziasOuRuido = false;

  for (const linhaRaw of linhasRaw) {
    const limpa = linhaRaw
      .replace(/^[\s.,;•·*–—-]+$/, '')
      .replace(/\s+[.,;]+\s+/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    if (!limpa) {
      removeuLinhasVaziasOuRuido = true;
      continue;
    }
    linhasLimpas.push(limpa);
  }

  if (removeuLinhasVaziasOuRuido && linhasLimpas.length < linhasRaw.length) {
    alteracoesAplicadas.push('COLAPSAR_QUEBRAS_E_RUIDO');
  }

  // 5. Restaura todos os números decimais/valores protegidos intactos
  const textoHigienizado = linhasLimpas
    .join('\n')
    .replace(/__NUMPROT(\d+)__/g, (_m, idxStr: string) => {
      const idx = Number(idxStr);
      return numerosProtegidos[idx] ?? '';
    });

  // 6. Extrai contagem de nomes candidatos presentes na lista higienizada
  const detLista = extrairListaTrabalhadoresDeterministica(textoHigienizado, opcoes);
  const candidatosLista = detLista.obras.flatMap((b) =>
    b.apontamentos.map((a) => a.nome)
  );

  return {
    textoOriginal,
    textoHigienizado,
    alteracoesAplicadas,
    candidatosLista,
  };
}

/**
 * Audita a contagem de trabalhadores extraídos comparando com os nomes candidatos
 * presentes na lista da mensagem higienizada.
 */
export function auditarContagemListaExtracao(
  candidatosLista: readonly string[],
  extracao: NLPExtracaoResponse | null | undefined
): AuditoriaContagemLista {
  const extraidos = (extracao?.obras || []).flatMap((o) => o.apontamentos || []);
  const chavesExtraidas = new Set(
    extraidos.map((a) =>
      removerAcentosUpper(normalizarNomeTrabalhadorCanonico(a.nome))
    )
  );

  const nomesFaltantes: string[] = [];
  const chavesFaltantesVistas = new Set<string>();

  for (const candidato of candidatosLista) {
    const chave = removerAcentosUpper(normalizarNomeTrabalhadorCanonico(candidato));
    if (!chavesExtraidas.has(chave) && !chavesFaltantesVistas.has(chave)) {
      nomesFaltantes.push(candidato);
      chavesFaltantesVistas.add(chave);
    }
  }

  return {
    qtdEsperadaLista: candidatosLista.length,
    qtdExtraida: chavesExtraidas.size,
    nomesFaltantes,
    divergenciaDetectada: nomesFaltantes.length > 0,
  };
}

/**
 * Monta o prompt focado da Passagem 2B para recuperar exclusivamente os nomes faltantes
 * detectados pela auditoria de contagem da lista.
 */
export function montarPromptSegundaPassagemFocada(params: {
  textoHigienizado: string;
  nomesFaltantes: readonly string[];
  obraJaIdentificada?: string;
  dataJaIdentificada?: string;
}): string {
  return (
    `AUDITORIA DE CONTAGEM — SEGUNDA PASSAGEM FOCADA EM NOMES FALTANTES:\n` +
    `A primeira extração omitiu ${params.nomesFaltantes.length} trabalhador(es) presentes na lista da mensagem.\n` +
    `Extraia OBRIGATORIAMENTE os seguintes trabalhadores faltantes (com obra, data_referencia, fracao e motivo):\n` +
    `- Faltantes: ${params.nomesFaltantes.join(', ')}\n` +
    (params.obraJaIdentificada ? `- Obra detectada na 1ª passagem: ${params.obraJaIdentificada}\n` : '') +
    (params.dataJaIdentificada ? `- Data detectada na 1ª passagem: ${params.dataJaIdentificada}\n` : '') +
    `\nMENSAGEM HIGIENIZADA:\n${params.textoHigienizado}`
  );
}

/**
 * Pipeline Completo em 2 Passagens + Checagem de Contagem de Lista:
 * - Passagem 1: Sanitização cirúrgica (sem alterar o texto original de auditoria).
 * - Passagem 2A: Extração estruturada sobre o texto higienizado.
 * - Auditoria de Contagem: Se extraídos < candidatos da lista, dispara automaticamente
 *   Passagem 2B focada nos nomes faltantes + reconciliação determinística final.
 */
export async function executarPipelineDuasPassagens(params: {
  textoOriginal: string;
  opcoes?: OpcoesExtracaoDiarias;
  executarExtracaoLLM: (promptTexto: string) => Promise<NLPExtracaoResponse | null>;
}): Promise<ResultadoPipelineDuasPassagens> {
  const opcoes = params.opcoes || {};
  const logsAjuste: string[] = [];

  // PASSAGEM 1 — Sanitização cirúrgica preservando textoOriginal intacto
  const sanitizacao = higienizarMensagemParaExtracao(params.textoOriginal, opcoes);
  if (sanitizacao.alteracoesAplicadas.length > 0) {
    logsAjuste.push(
      `[PASSAGEM_1_SANITIZACAO] Regras aplicadas: ${sanitizacao.alteracoesAplicadas.join(', ')} (candidatos na lista: ${sanitizacao.candidatosLista.length}).`
    );
  }

  // PASSAGEM 2A — Extração estruturada sobre o texto higienizado
  let extracaoPassagem2A: NLPExtracaoResponse | null = null;
  try {
    extracaoPassagem2A = await params.executarExtracaoLLM(
      sanitizacao.textoHigienizado || params.textoOriginal
    );
  } catch (errPass1) {
    logsAjuste.push(
      `[PASSAGEM_2A_FALLBACK] Falha na chamada inicial da IA: ${errPass1 instanceof Error ? errPass1.message : String(errPass1)}`
    );
  }

  // AUDITORIA DE CONTAGEM DA LISTA
  const auditoriaPassagem1 = auditarContagemListaExtracao(
    sanitizacao.candidatosLista,
    extracaoPassagem2A
  );

  let extracaoCombinada: NLPExtracaoResponse | null = extracaoPassagem2A;
  let segundaPassagemExecutada = false;

  // Se houver nomes faltantes em relação à lista, dispara Passagem 2B focada
  if (
    auditoriaPassagem1.divergenciaDetectada &&
    auditoriaPassagem1.nomesFaltantes.length > 0
  ) {
    segundaPassagemExecutada = true;
    logsAjuste.push(
      `[AUDITORIA_CONTAGEM] Extraídos ${auditoriaPassagem1.qtdExtraida}/${auditoriaPassagem1.qtdEsperadaLista}. Disparando 2ª passagem focada para: ${auditoriaPassagem1.nomesFaltantes.join(', ')}.`
    );

    const primeiraObra = extracaoPassagem2A?.obras?.[0];
    const promptFocado = montarPromptSegundaPassagemFocada({
      textoHigienizado: sanitizacao.textoHigienizado,
      nomesFaltantes: auditoriaPassagem1.nomesFaltantes,
      obraJaIdentificada: primeiraObra?.nome_obra,
      dataJaIdentificada: primeiraObra?.data_referencia,
    });

    try {
      const extracaoPassagem2B = await params.executarExtracaoLLM(promptFocado);
      if (extracaoPassagem2B && extracaoPassagem2B.obras?.length) {
        const obrasBase = extracaoPassagem2A?.obras
          ? extracaoPassagem2A.obras.map((o) => ({
              ...o,
              apontamentos: [...(o.apontamentos || [])],
              vales: [...(o.vales || [])],
            }))
          : [];

        for (const bloco2B of extracaoPassagem2B.obras) {
          const chaveObra2B = removerAcentosUpper(
            normalizarNomeObraCanonica(bloco2B.nome_obra || 'GERAL')
          );
          let destino = obrasBase.find(
            (o) =>
              removerAcentosUpper(normalizarNomeObraCanonica(o.nome_obra || 'GERAL')) ===
              chaveObra2B
          );
          if (!destino && obrasBase.length === 1) {
            destino = obrasBase[0];
          }
          if (!destino) {
            obrasBase.push({
              ...bloco2B,
              apontamentos: [...(bloco2B.apontamentos || [])],
              vales: [...(bloco2B.vales || [])],
            });
            continue;
          }
          const jaNoDestino = new Set(
            destino.apontamentos.map((a) =>
              removerAcentosUpper(normalizarNomeTrabalhadorCanonico(a.nome))
            )
          );
          for (const ap2B of bloco2B.apontamentos || []) {
            const chaveAp = removerAcentosUpper(
              normalizarNomeTrabalhadorCanonico(ap2B.nome)
            );
            if (!jaNoDestino.has(chaveAp)) {
              destino.apontamentos.push(ap2B);
              jaNoDestino.add(chaveAp);
            }
          }
        }

        extracaoCombinada = { obras: obrasBase };
        const posPass2B = auditarContagemListaExtracao(
          sanitizacao.candidatosLista,
          extracaoCombinada
        );
        logsAjuste.push(
          `[PASSAGEM_2B_CONCLUIDA] Cobertura após 2ª passagem IA: ${posPass2B.qtdExtraida}/${posPass2B.qtdEsperadaLista}.`
        );
      }
    } catch (errPass2) {
      logsAjuste.push(
        `[PASSAGEM_2B_FALLBACK] Erro na 2ª passagem IA (recuperação determinística acionada): ${errPass2 instanceof Error ? errPass2.message : String(errPass2)}`
      );
    }
  }

  // Reconciliação final determinística (garante 100% de completude e resolução de aliases)
  const extracaoFinal = reconciliarExtracaoComParserDeterministico(
    sanitizacao.textoHigienizado || params.textoOriginal,
    extracaoCombinada,
    opcoes
  );

  const auditoriaFinal = auditarContagemListaExtracao(
    sanitizacao.candidatosLista,
    extracaoFinal
  );
  if (segundaPassagemExecutada) {
    logsAjuste.push(
      `[RESULTADO_FINAL] Total consolidado: ${auditoriaFinal.qtdExtraida}/${auditoriaFinal.qtdEsperadaLista} trabalhador(es).`
    );
  }

  return {
    extracao: extracaoFinal,
    sanitizacao,
    auditoriaPassagem1,
    segundaPassagemExecutada,
    logsAjuste,
  };
}
