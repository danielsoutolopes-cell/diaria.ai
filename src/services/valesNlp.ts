import { GoogleGenerativeAI } from '@google/generative-ai';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';

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
  tipoDocumento: 'SOLICITACAO_VALE' | 'COMPROVANTE_PIX_VALE' | 'LIQUIDACAO_PIX' | 'OUTRO';
  nomeTrabalhador: string | null;
  nomeOriginalLido: string | null;
  valor: number;
  data: string | null;
  hora: string | null;
  pagador: string | null;
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
    { regex: /\b(gilvan|gil335revest|\bgil\b)\b/i, canonico: 'Gilvan - Gil' },
    { regex: /\b(edmilson|peu)\b/i, canonico: 'Edmilson - Peu' },
    { regex: /\b(z[eé]\s*baiano|jos[eé]\s*baiano)\b/i, canonico: 'Zé Baiano' },
    { regex: /\b(lucas\.?\s*j\.?)\b/i, canonico: 'Lucas J.' },
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
}): Promise<ResultadoOcrPix> {
  const legendaInfo = interpretarLegendaComprovantePix(params.legenda || '');
  const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^"|"$/g, '');

  if (!apiKey) {
    return {
      tipoDocumento: legendaInfo.isComprovanteVale
        ? 'COMPROVANTE_PIX_VALE'
        : 'OUTRO',
      nomeTrabalhador: legendaInfo.nomeTrabalhador,
      nomeOriginalLido: legendaInfo.nomeTrabalhador,
      valor: legendaInfo.valorSugerido || 100.0,
      data: new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
      }),
      hora: new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      }),
      pagador: 'Patrícia Grubel',
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
Analise esta imagem (pode ser um comprovante bancário de PIX de vale/adiantamento, um comprovante PIX de quitação/acerto salarial ou um print de solicitação de vale).
${params.legenda ? `Legenda enviada junto com a imagem: "${params.legenda}"` : ''}

Regras de classificação:
- Se for comprovante PIX de valor pequeno/redondo de adiantamento (ex.: R$ 50, R$ 100, R$ 150, R$ 200) ou a legenda mencionar "vale" / "vlw" -> tipoDocumento = "COMPROVANTE_PIX_VALE".
- Se for comprovante PIX de acerto/quitação de diárias/quinzena (ex.: R$ 1.150,00 Manoel, R$ 1.275,00 Weslen/Wender, repasse semanal) -> tipoDocumento = "LIQUIDACAO_PIX".
- Se for print de conversa pedindo vale sem comprovante bancário -> tipoDocumento = "SOLICITACAO_VALE" (se valor omitido, retorne 100.0).

Retorne APENAS JSON puro (sem markdown):
{
  "tipoDocumento": "SOLICITACAO_VALE" | "COMPROVANTE_PIX_VALE" | "LIQUIDACAO_PIX" | "OUTRO",
  "nomeOriginalLido": "Nome do favorecido / recebedor lido na imagem ou legenda",
  "valor": 0.00,
  "data": "YYYY-MM-DD",
  "hora": "HH:MM",
  "pagador": "Nome do pagador se visível (ex: Patrícia Grubel)",
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
    data:
      parsed.data ||
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
    hora:
      parsed.hora ||
      new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      }),
    pagador: parsed.pagador || 'Patrícia Grubel',
    chavePix: parsed.chavePix || null,
    obraSugerida: parsed.obraSugerida || legendaInfo.obraSugerida || null,
    legendaInterpretada: params.legenda || null,
    confianca: parsed.confianca || 'MEDIA',
  };
}
