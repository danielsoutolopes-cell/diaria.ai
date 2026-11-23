import { GoogleGenerativeAI } from '@google/generative-ai';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';
import {
  extrairDataHoraTimestampWhatsApp,
  montarDataHoraEnvioIso,
  normalizarDataIso,
  normalizarEmissorPix,
  normalizarHoraHHMM,
  obterDataHoraBrasilia,
  type OrigemRastreabilidadeCaixinha,
} from '@/lib/caixinhaPixRastreabilidade';

export interface ContextoValeGrupo {
  ultimoEvento: 'VALE_SOLICITACAO';
  solicitadoPor: string;
  obra: string;
  dataReferencia: string;
  valorPadrao: number;
  atualizadoEmMs: number;
}

export interface ValeNaturalExtraido {
  nomeTrabalhador: string;
  valor: number;
  complementoDeContexto: boolean;
  motivoTexto: string;
}

export interface LegendaPixPareamento {
  isComprovanteVale: boolean;
  nomeTrabalhador: string | null;
  obraSugerida: string | null;
  valorSugerido: number | null;
}

export interface ResultadoOcrPix {
  tipoDocumento:
    | 'SOLICITACAO_VALE'
    | 'COMPROVANTE_PIX_VALE'
    | 'LIQUIDACAO_PIX'
    | 'SUPRIMENTO_CAIXINHA'
    | 'OUTRO';
  nomeTrabalhador: string | null;
  nomeOriginalLido: string | null;
  valor: number;
  data: string | null;
  hora: string | null;
  dataHoraEnvio?: string | null;
  horaBarraStatus?: string | null;
  pagador: string | null;
  origemPagador?: OrigemRastreabilidadeCaixinha;
  origemDataHora?: OrigemRastreabilidadeCaixinha;
  comprovanteCortado?: boolean;
  chavePix: string | null;
  obraSugerida: string | null;
  legendaInterpretada: string | null;
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
}

// Janela de contexto por grupo (15 minutos) para capturar mensagens complementares encadeadas
const CONTEXTO_VALES_POR_GRUPO = new Map<string, ContextoValeGrupo>();
const JANELA_CONTEXTO_MS = 15 * 60 * 1000;

export function registrarContextoSolicitacaoVale(
  remoteJid: string,
  ctx: Omit<ContextoValeGrupo, 'ultimoEvento' | 'atualizadoEmMs'>
): void {
  if (!remoteJid) return;
  CONTEXTO_VALES_POR_GRUPO.set(remoteJid, {
    ultimoEvento: 'VALE_SOLICITACAO',
    ...ctx,
    atualizadoEmMs: Date.now(),
  });
}

export function obterContextoSolicitacaoVale(
  remoteJid: string
): ContextoValeGrupo | null {
  if (!remoteJid) return null;
  const ctx = CONTEXTO_VALES_POR_GRUPO.get(remoteJid);
  if (!ctx) return null;
  if (Date.now() - ctx.atualizadoEmMs > JANELA_CONTEXTO_MS) {
    CONTEXTO_VALES_POR_GRUPO.delete(remoteJid);
    return null;
  }
  return ctx;
}

/**
 * Extrai pedidos naturais e complementares de vale em português informal de canteiro:
 * - "Uma vale pra o Mateus por favor."
 * - "Pra o Daniel e o Ian também por favor. Vale."
 * - "Manda um vale pro Zé Baiano e pro Lucas"
 * Valor padrão = R$ 100,00 quando omitido (regra V11).
 */
export function extrairPedidosValeNaturais(
  texto: string,
  remoteJid?: string
): ValeNaturalExtraido[] {
  const limpo = (texto || '').trim();
  if (!limpo) return [];

  const norm = limpo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const mencionaVale = /\b(vales?|adiantamento)\b/.test(norm);
  const contextoAnterior = remoteJid
    ? obterContextoSolicitacaoVale(remoteJid)
    : null;
  const pareceComplemento =
    Boolean(contextoAnterior) &&
    /\b(tambem|tb|tbm|mais um|e o|e pro|pra o|pro|para o)\b/.test(norm);

  if (!mencionaVale && !pareceComplemento) {
    return [];
  }

  // Detecta valor explícito (ex.: "R$ 150", "vale de 200", "50 de vale")
  const matchValor = limpo.match(
    /(?:r\$\s*|de\s+|vale\s+(?:de\s+)?)(\d{2,4}(?:[.,]\d{1,2})?)/i
  );
  const valorExtraido = matchValor
    ? parseFloat(matchValor[1].replace(',', '.'))
    : contextoAnterior?.valorPadrao || 100.0;

  // Nomes conhecidos da operação e padrões "pra o X", "pro X", "para X"
  const nomesEncontrados = new Set<string>();
  const candidatosConhecidos: Array<{ regex: RegExp; canonico: string }> = [
    { regex: /\b(mateus|matheus)\b/i, canonico: 'Mateus' },
    { regex: /\b(daniel\.?)\b/i, canonico: 'Daniel' },
    { regex: /\b(ian)\b/i, canonico: 'Ian' },
    { regex: /\b(manoel|manuel)\b/i, canonico: 'Manoel' },
    { regex: /\b(wender(?:\s*22)?|weslen)\b/i, canonico: 'Wender' },
    { regex: /\b(gilvan|gil335revest|\bgil\b)\b/i, canonico: 'Gil' },
    { regex: /\b(edmilson|peu)\b/i, canonico: 'Peu' },
    { regex: /\b(z[eé]\s*baiano|jos[eé]\s*baiano)\b/i, canonico: 'Zé Baiano' },
    { regex: /\b(lucas[\s.\-]*j\.?)\b/i, canonico: 'Lucas J' },
    { regex: /\b(z[eé]\s*roberto|jos[eé]\s*roberto)\b/i, canonico: 'Zé Roberto' },
    { regex: /\b(diego)\b/i, canonico: 'Diego' },
    { regex: /\b(joabson)\b/i, canonico: 'Joabson Nascimento' },
  ];

  for (const item of candidatosConhecidos) {
    if (item.regex.test(limpo)) {
      nomesEncontrados.add(item.canonico);
    }
  }

  // Fallback genérico para nomes próprios após "pra o", "pro", "para o", "para"
  if (nomesEncontrados.size === 0) {
    const regexGenerico =
      /(?:pra\s+o|pro|para\s+o|para)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\.?)?)/g;
    let m: RegExpExecArray | null;
    while ((m = regexGenerico.exec(limpo)) !== null) {
      const candidato = m[1].trim();
      if (
        candidato.length >= 2 &&
        !/^(por|favor|vale|tambem|hoje|amanha|pix)$/i.test(candidato)
      ) {
        nomesEncontrados.add(normalizarNomeTrabalhadorCanonico(candidato));
      }
    }
  }

  return Array.from(nomesEncontrados).map((nomeTrabalhador) => ({
    nomeTrabalhador,
    valor: valorExtraido > 0 ? valorExtraido : 100.0,
    complementoDeContexto: Boolean(pareceComplemento && !mencionaVale),
    motivoTexto: limpo,
  }));
}

/**
 * Interpreta legendas informais de comprovantes PIX de vale enviados pela Administração:
 * Ex.: "Daniel vlw bahia", "Ian vale bahia", "Mateus vale bahia"
 */
export function interpretarLegendaComprovantePix(
  legenda: string
): LegendaPixPareamento {
  const limpo = (legenda || '').trim();
  if (!limpo) {
    return {
      isComprovanteVale: false,
      nomeTrabalhador: null,
      obraSugerida: null,
      valorSugerido: null,
    };
  }

  const norm = limpo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const isValeInformal = /\b(vale|vlw|valeu|adiant|pix\s+vale)\b/.test(norm);
  const pedidos = extrairPedidosValeNaturais(
    isValeInformal ? `${limpo} vale` : limpo
  );
  const nomeTrabalhador = pedidos[0]?.nomeTrabalhador || null;

  let obraSugerida: string | null = null;
  if (norm.includes('piscina') && (norm.includes('porto') || norm.includes('bahia'))) {
    obraSugerida = 'PISCINA PORTO SEGURO';
  } else if (norm.includes('quase tudo')) {
    obraSugerida = 'QUASE TUDO';
  } else if (norm.includes('bahia') || norm.includes('porto seguro')) {
    obraSugerida = 'PISCINA PORTO SEGURO';
  }

  const matchValor = limpo.match(/(?:r\$\s*)?(\d{2,5}[.,]\d{2})/i);
  const valorSugerido = matchValor
    ? parseFloat(matchValor[1].replace(',', '.'))
    : null;

  return {
    isComprovanteVale: isValeInformal && Boolean(nomeTrabalhador),
    nomeTrabalhador,
    obraSugerida,
    valorSugerido,
  };
}

/**
 * Leitura OCR via Gemini Vision para comprovantes PIX (vales ou quitações de ciclo)
 * e prints/fotos de solicitações de vale.
 */
export async function analisarImagemPixComGemini(params: {
  imagemBase64: string;
  mimeType?: string;
  legenda?: string;
  remetenteNome?: string | null;
  remetenteTelefone?: string | null;
  whatsappTimestamp?: number | string | null;
}): Promise<ResultadoOcrPix> {
  const legendaInfo = interpretarLegendaComprovantePix(params.legenda || '');
  const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^"|"$/g, '');
  const tsZap = extrairDataHoraTimestampWhatsApp(params.whatsappTimestamp);
  const emissorZap =
    normalizarEmissorPix(params.remetenteNome) ||
    normalizarEmissorPix(params.remetenteTelefone);
  const agoraBr = obterDataHoraBrasilia();

  if (!apiKey) {
    const dataFallback = tsZap?.data || agoraBr.data;
    const horaFallback = tsZap?.hora || agoraBr.hora;
    return {
      tipoDocumento: legendaInfo.isComprovanteVale
        ? 'COMPROVANTE_PIX_VALE'
        : 'OUTRO',
      nomeTrabalhador: legendaInfo.nomeTrabalhador,
      nomeOriginalLido: legendaInfo.nomeTrabalhador,
      valor: legendaInfo.valorSugerido || 100.0,
      data: dataFallback,
      hora: horaFallback,
      dataHoraEnvio: montarDataHoraEnvioIso(dataFallback, horaFallback),
      horaBarraStatus: null,
      pagador: emissorZap || 'Patrícia',
      origemPagador: emissorZap ? 'INFERIDO_WHATSAPP' : 'INFERIDO_OPERADOR',
      origemDataHora: tsZap ? 'INFERIDO_WHATSAPP' : 'INFERIDO_OPERADOR',
      comprovanteCortado: true,
      chavePix: null,
      obraSugerida: legendaInfo.obraSugerida,
      legendaInterpretada: params.legenda || null,
      confianca: legendaInfo.nomeTrabalhador ? 'MEDIA' : 'BAIXA',
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  });
  const cleanBase64 = params.imagemBase64.replace(/^data:[^;]+;base64,/, '');

  const prompt = `Você é o motor OCR financeiro do sistema diaria.ai.
Analise esta imagem (comprovante bancário de PIX de vale/adiantamento, suprimento de caixinha de obra, quitação/acerto salarial ou print de solicitação de vale).
${params.legenda ? `Legenda enviada junto com a imagem: "${params.legenda}"` : ''}

Regras de classificação:
- Se for comprovante PIX de valor de adiantamento/vale ou a legenda mencionar "vale" / "vlw" -> tipoDocumento = "COMPROVANTE_PIX_VALE".
- Se for comprovante PIX destinado ao caixinha de campo / compra de material / suprimento de obra (ex.: legenda "caixinha", "material", "suprimento", "pix pro gil obra") -> tipoDocumento = "SUPRIMENTO_CAIXINHA".
- Se for comprovante PIX de acerto/quitação de diárias/quinzena -> tipoDocumento = "LIQUIDACAO_PIX".
- Se for print de conversa pedindo vale sem comprovante bancário -> tipoDocumento = "SOLICITACAO_VALE" (se valor omitido, retorne 100.0).

REGRAS ESTRITAS PARA PRINTS CORTADOS (ex.: Nubank cortado sem pagador ou sem campo "Quando"):
- NÃO INVENTE o campo "pagador". Se a seção de pagador estiver cortada/invisível, retorne "pagador": null e "comprovanteCortado": true.
- Se data ou hora do comprovante estiver cortada, retorne null em "data"/"hora".
- Se o relógio da barra superior do celular aparecer no print, informe em "horaBarraStatus": "HH:MM" (senão null).

Retorne APENAS JSON puro (sem markdown):
{
  "tipoDocumento": "SOLICITACAO_VALE" | "COMPROVANTE_PIX_VALE" | "SUPRIMENTO_CAIXINHA" | "LIQUIDACAO_PIX" | "OUTRO",
  "nomeOriginalLido": "Nome do favorecido / recebedor lido na imagem ou legenda",
  "valor": 0.00,
  "data": "YYYY-MM-DD ou null",
  "hora": "HH:MM ou null",
  "horaBarraStatus": "HH:MM do topo da tela ou null",
  "pagador": "Nome do pagador se visível na imagem, ou null",
  "comprovanteCortado": true ou false,
  "chavePix": "Chave PIX se visível ou null",
  "obraSugerida": "Nome da obra se inferível ou null",
  "confianca": "ALTA" | "MEDIA" | "BAIXA"
}`;

  const res = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: cleanBase64,
        mimeType: params.mimeType || 'image/jpeg',
      },
    },
  ]);

  const raw = res.response
    .text()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();

  const parsed = JSON.parse(raw) as Partial<ResultadoOcrPix>;
  const nomeBruto =
    legendaInfo.nomeTrabalhador || parsed.nomeOriginalLido || null;
  const nomeCanonico = nomeBruto
    ? normalizarNomeTrabalhadorCanonico(nomeBruto)
    : null;

  const pagadorOcr = normalizarEmissorPix(parsed.pagador);
  const pagadorFinal = pagadorOcr || emissorZap || 'Patrícia';
  const origemPagador: OrigemRastreabilidadeCaixinha = pagadorOcr
    ? 'OCR_COMPROVANTE'
    : emissorZap
      ? 'INFERIDO_WHATSAPP'
      : 'INFERIDO_OPERADOR';

  const dataOcr = normalizarDataIso(parsed.data);
  const horaOcr = normalizarHoraHHMM(parsed.hora);
  const horaTela = normalizarHoraHHMM(parsed.horaBarraStatus);

  let dataFinal: string;
  let horaFinal: string;
  let origemDataHora: OrigemRastreabilidadeCaixinha;

  if (dataOcr && horaOcr) {
    dataFinal = dataOcr;
    horaFinal = horaOcr;
    origemDataHora = 'OCR_COMPROVANTE';
  } else if (tsZap) {
    dataFinal = dataOcr || tsZap.data;
    horaFinal = horaOcr || tsZap.hora;
    origemDataHora = 'INFERIDO_WHATSAPP';
  } else if (horaTela) {
    dataFinal = dataOcr || agoraBr.data;
    horaFinal = horaOcr || horaTela;
    origemDataHora = 'CAPTURADO_TELA';
  } else {
    dataFinal = dataOcr || agoraBr.data;
    horaFinal = horaOcr || agoraBr.hora;
    origemDataHora = 'INFERIDO_OPERADOR';
  }

  return {
    tipoDocumento:
      parsed.tipoDocumento ||
      (legendaInfo.isComprovanteVale ? 'COMPROVANTE_PIX_VALE' : 'OUTRO'),
    nomeTrabalhador: nomeCanonico,
    nomeOriginalLido: parsed.nomeOriginalLido || nomeBruto,
    valor:
      Number(parsed.valor) > 0
        ? Number(parsed.valor)
        : legendaInfo.valorSugerido || 100.0,
    data: dataFinal,
    hora: horaFinal,
    dataHoraEnvio: montarDataHoraEnvioIso(dataFinal, horaFinal),
    horaBarraStatus: horaTela,
    pagador: pagadorFinal,
    origemPagador,
    origemDataHora,
    comprovanteCortado:
      Boolean(parsed.comprovanteCortado) || !pagadorOcr || !dataOcr || !horaOcr,
    chavePix: parsed.chavePix || null,
    obraSugerida: parsed.obraSugerida || legendaInfo.obraSugerida || null,
    legendaInterpretada: params.legenda || null,
    confianca: parsed.confianca || 'MEDIA',
  };
}
