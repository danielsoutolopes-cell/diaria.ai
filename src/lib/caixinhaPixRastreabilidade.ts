import { formatarNomeExibicaoTrabalhador } from '@/lib/normalizarObra';

export type OrigemRastreabilidadeCaixinha =
  | 'OCR_COMPROVANTE'
  | 'INFERIDO_WHATSAPP'
  | 'CAPTURADO_TELA'
  | 'INFERIDO_OPERADOR'
  | 'MANUAL';

export const EMISSORES_PIX_PADRAO: readonly string[] = [
  'Patrícia',
  'Joabson',
];

export interface EmissorPixCaixinhaConfig {
  id: string;
  nome: string;
  ativo: boolean;
  padrao: boolean;
  criadoEm: string;
}

export const LABELS_ORIGEM_RASTREABILIDADE: Record<
  OrigemRastreabilidadeCaixinha,
  string
> = {
  OCR_COMPROVANTE: 'OCR Comprovante',
  INFERIDO_WHATSAPP: 'Inferido via WhatsApp',
  CAPTURADO_TELA: 'Horário da Tela (Print)',
  INFERIDO_OPERADOR: 'Inferido pelo Operador',
  MANUAL: 'Manual',
};

export interface LeituraBrutaOcrCaixinha {
  tipo?: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO' | null;
  valor?: number | string | null;
  categoria?: string | null;
  descricao?: string | null;
  destinatario?: string | null;
  emissorPix?: string | null;
  data?: string | null;
  hora?: string | null;
  horaBarraStatus?: string | null;
  comprovanteCortado?: boolean | null;
}

export interface ContextoFallbackCaixinha {
  remetenteNome?: string | null;
  remetenteTelefone?: string | null;
  whatsappTimestamp?: number | string | null;
  usuarioLogado?: string | null;
  arquivoLastModifiedMs?: number | null;
  agora?: Date;
}

export interface LeituraEnriquecidaOcrCaixinha {
  tipo: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO';
  valor: number;
  categoria: string;
  descricao: string;
  destinatario: string | null;
  emissorPix: string | null;
  origemEmissor: OrigemRastreabilidadeCaixinha;
  labelOrigemEmissor: string;
  data: string;
  hora: string;
  dataHoraEnvio: string;
  origemDataHora: OrigemRastreabilidadeCaixinha;
  labelOrigemDataHora: string;
  comprovanteCortado: boolean;
}

function removerAcentos(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Normaliza qualquer variação de nome, apelido ou telefone do emissor/pagador do PIX
 * para um nome limpo padronizado exibido no dropdown e no extrato.
 */
export function normalizarEmissorPix(
  bruto: string | null | undefined
): string | null {
  const limpo = (bruto || '').trim();
  if (!limpo) return null;

  const digitos = limpo.replace(/\D/g, '');
  if (digitos.endsWith('11978543369') || digitos.endsWith('978543369')) {
    return 'Patrícia';
  }
  if (
    digitos.endsWith('11988139833') ||
    digitos.endsWith('988139833') ||
    digitos.endsWith('11913192703') ||
    digitos.endsWith('913192703')
  ) {
    return 'Daniel';
  }
  if (digitos.endsWith('24998424641') || digitos.endsWith('998424641')) {
    return 'Joabson';
  }

  const norm = removerAcentos(limpo).toLowerCase();
  if (
    norm === 'null' ||
    norm === 'undefined' ||
    norm === 'desconhecido' ||
    norm === 'nao informado' ||
    norm === 'nao visivel' ||
    norm === 'n/a'
  ) {
    return null;
  }

  if (norm.includes('patr')) return 'Patrícia';
  if (norm.includes('joabson')) return 'Joabson';
  if (norm.includes('daniel')) return 'Daniel';
  if (
    norm.includes('conta empresa') ||
    norm.includes('jhoston') ||
    norm.includes('intermack') ||
    norm.includes('ltda') ||
    norm.includes('cnpj') ||
    norm.includes('empresa')
  ) {
    return 'Conta Empresa';
  }

  // Se vier apenas números de telefone não mapeados, mantém legível
  if (digitos.length >= 10 && digitos.length === limpo.replace(/[\s+\-()]/g, '').length) {
    return `WhatsApp (${digitos.slice(-4)})`;
  }

  return limpo;
}

export function isEmissorPixPadrao(nome: string | null | undefined): boolean {
  const norm = normalizarEmissorPix(nome);
  if (!norm) return false;
  const chave = removerAcentos(norm).toLowerCase();
  return EMISSORES_PIX_PADRAO.some(
    (p) => removerAcentos(p).toLowerCase() === chave
  );
}

/**
 * Normaliza a lista persistida de emissores (`emissores_pix_caixinha`), garantindo
 * que as opções padrão obrigatórias (Patrícia e Joabson) estejam sempre presentes e ativas.
 */
export function normalizarListaEmissoresConfig(
  raw: unknown
): EmissorPixCaixinhaConfig[] {
  const vistos = new Map<string, EmissorPixCaixinhaConfig>();

  EMISSORES_PIX_PADRAO.forEach((nomePadrao) => {
    const chave = removerAcentos(nomePadrao).toLowerCase();
    vistos.set(chave, {
      id: `padrao-${chave}`,
      nome: nomePadrao,
      ativo: true,
      padrao: true,
      criadoEm: '2026-11-01T00:00:00.000Z',
    });
  });

  if (Array.isArray(raw)) {
    raw.forEach((item, idx) => {
      if (typeof item === 'string') {
        const nomeNorm = normalizarEmissorPix(item);
        if (!nomeNorm) return;
        const chave = removerAcentos(nomeNorm).toLowerCase();
        if (!vistos.has(chave)) {
          vistos.set(chave, {
            id: `emissor-${chave}-${idx}`,
            nome: nomeNorm,
            ativo: true,
            padrao: false,
            criadoEm: new Date().toISOString(),
          });
        }
        return;
      }

      if (!item || typeof item !== 'object') return;
      const obj = item as Record<string, unknown>;
      const nomeRaw = typeof obj.nome === 'string' ? obj.nome : '';
      const nomeNorm = normalizarEmissorPix(nomeRaw);
      if (!nomeNorm) return;
      const chave = removerAcentos(nomeNorm).toLowerCase();
      if (vistos.has(chave)) return;

      vistos.set(chave, {
        id:
          typeof obj.id === 'string' && obj.id.trim()
            ? obj.id.trim()
            : `emissor-${chave}-${idx}`,
        nome: nomeNorm,
        ativo: obj.ativo !== false,
        padrao: false,
        criadoEm:
          typeof obj.criadoEm === 'string'
            ? obj.criadoEm
            : new Date().toISOString(),
      });
    });
  }

  return Array.from(vistos.values());
}

/**
 * Extrai a lista final de nomes para o dropdown "Emissor / Quem Enviou o PIX":
 * sempre inicia com Patrícia e Joabson + emissores adicionais ativos do tenant,
 * respeitando emissores desativados manualmente no /setup.
 */
export function extrairEmissoresPixAtivos(
  config: ReadonlyArray<EmissorPixCaixinhaConfig>,
  extrasHistorico?: ReadonlyArray<string | null | undefined>
): string[] {
  const normalizada = normalizarListaEmissoresConfig(config);
  const inativos = new Set<string>(
    normalizada
      .filter((item) => !item.ativo && !item.padrao)
      .map((item) => removerAcentos(item.nome).toLowerCase())
  );

  const vistos = new Map<string, string>();
  const adicionar = (nome: string | null | undefined) => {
    const norm = normalizarEmissorPix(nome);
    if (!norm) return;
    const chave = removerAcentos(norm).toLowerCase();
    if (inativos.has(chave)) return;
    if (!vistos.has(chave)) {
      vistos.set(chave, norm);
    }
  };

  normalizada
    .filter((item) => item.padrao || item.ativo)
    .forEach((item) => adicionar(item.nome));

  (extrasHistorico || []).forEach(adicionar);

  return Array.from(vistos.values());
}

/**
 * Combina as opções padrão obrigatórias (Patrícia e Joabson) com emissores extras sem duplicidade.
 */
export function listarEmissoresPixTenant(
  extras?: ReadonlyArray<string | null | undefined>
): string[] {
  const vistos = new Map<string, string>();
  const adicionar = (nome: string | null | undefined) => {
    const norm = normalizarEmissorPix(nome);
    if (!norm) return;
    const chave = removerAcentos(norm).toLowerCase();
    if (!vistos.has(chave)) {
      vistos.set(chave, norm);
    }
  };

  EMISSORES_PIX_PADRAO.forEach(adicionar);
  (extras || []).forEach(adicionar);
  return Array.from(vistos.values());
}

/**
 * Normaliza data no formato YYYY-MM-DD (aceita DD/MM/YYYY, YYYY-MM-DD ou ISO).
 */
export function normalizarDataIso(raw: string | null | undefined): string | null {
  const txt = (raw || '').trim();
  if (!txt) return null;

  const matchIso = txt.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (matchIso) {
    const [, yyyy, mm, dd] = matchIso;
    const mNum = Number(mm);
    const dNum = Number(dd);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const matchBr = txt.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (matchBr) {
    const dd = matchBr[1].padStart(2, '0');
    const mm = matchBr[2].padStart(2, '0');
    const yyyy = matchBr[3];
    const mNum = Number(mm);
    const dNum = Number(dd);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return null;
}

/**
 * Normaliza hora no formato HH:MM (aceita HH:MM, HH:MM:SS, HHhMM).
 */
export function normalizarHoraHHMM(
  raw: string | null | undefined
): string | null {
  const txt = (raw || '').trim();
  if (!txt) return null;

  const match = txt.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)(?::[0-5]\d)?\b/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function obterDataHoraBrasilia(base: Date = new Date()): {
  data: string;
  hora: string;
} {
  const data = base.toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
  const hora = base.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return {
    data,
    hora: normalizarHoraHHMM(hora) || '12:00',
  };
}

/**
 * Converte timestamp do WhatsApp (Unix em segundos, ms ou ISO) para Data e Hora em Brasília.
 */
export function extrairDataHoraTimestampWhatsApp(
  timestamp: number | string | null | undefined
): { data: string; hora: string; dataHoraEnvio: string } | null {
  if (timestamp === null || timestamp === undefined || timestamp === '') {
    return null;
  }

  let dateObj: Date | null = null;
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    dateObj = new Date(ms);
  } else if (typeof timestamp === 'string') {
    const trimmed = timestamp.trim();
    if (/^\d{9,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 10_000_000_000 ? num * 1000 : num;
      dateObj = new Date(ms);
    } else {
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) {
        dateObj = new Date(parsed);
      }
    }
  }

  if (!dateObj || Number.isNaN(dateObj.getTime())) {
    return null;
  }

  const br = obterDataHoraBrasilia(dateObj);
  return {
    data: br.data,
    hora: br.hora,
    dataHoraEnvio: montarDataHoraEnvioIso(br.data, br.hora),
  };
}

/**
 * Monta timestamp ISO-8601 com fuso de Brasília (-03:00) a partir de data (YYYY-MM-DD) e hora (HH:MM).
 */
export function montarDataHoraEnvioIso(
  dataIso: string,
  horaHHMM: string
): string {
  const dataLimpa =
    normalizarDataIso(dataIso) || obterDataHoraBrasilia().data;
  const horaLimpa = normalizarHoraHHMM(horaHHMM) || '12:00';
  return `${dataLimpa}T${horaLimpa}:00-03:00`;
}

/**
 * Formata data (YYYY-MM-DD) e hora (HH:MM) no padrão brasileiro "dd/mm/aaaa às HH:mm".
 */
export function formatarDataHoraBr(
  dataIso: string | null | undefined,
  horaHHMM?: string | null
): string {
  const dataNorm = normalizarDataIso(dataIso);
  const dataBr = dataNorm
    ? `${dataNorm.slice(8, 10)}/${dataNorm.slice(5, 7)}/${dataNorm.slice(0, 4)}`
    : (dataIso || '').trim();
  const horaNorm = normalizarHoraHHMM(horaHHMM);
  if (dataBr && horaNorm) {
    return `${dataBr} às ${horaNorm}`;
  }
  return dataBr || horaNorm || '—';
}

/**
 * Motor de fallback inteligente para comprovantes PIX / notas (inclusive prints cortados
 * como Nubank sem pagador ou sem campo "Quando" completo).
 */
export function aplicarFallbackOcrCaixinha(
  leituraBruta: LeituraBrutaOcrCaixinha,
  contexto: ContextoFallbackCaixinha = {}
): LeituraEnriquecidaOcrCaixinha {
  const tipo: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO' =
    leituraBruta.tipo === 'ENTRADA_PIX' ||
    leituraBruta.tipo === 'DEVOLUCAO_TROCO'
      ? leituraBruta.tipo
      : 'NOTA_DESPESA';

  const valorNumerico =
    typeof leituraBruta.valor === 'number'
      ? leituraBruta.valor
      : typeof leituraBruta.valor === 'string'
        ? Number(leituraBruta.valor.replace(/[^\d.,-]/g, '').replace(',', '.'))
        : 0;
  const valor = Number.isFinite(valorNumerico)
    ? Number(valorNumerico.toFixed(2))
    : 0;

  const categoria =
    (leituraBruta.categoria || '').trim() ||
    (tipo === 'ENTRADA_PIX' ? 'Suprimento PIX' : 'Material');

  const descricao =
    (leituraBruta.descricao || '').trim() ||
    (tipo === 'ENTRADA_PIX' ? 'Suprimento PIX Caixinha' : 'Despesa de Campo');

  const destinatarioBruto = (leituraBruta.destinatario || '').trim();
  const destinatario = destinatarioBruto
    ? formatarNomeExibicaoTrabalhador(destinatarioBruto)
    : null;

  // 1. Resolução de Emissor do PIX (com fallback inteligente para prints cortados)
  const emissorOcr = normalizarEmissorPix(leituraBruta.emissorPix);
  const emissorWhatsApp =
    normalizarEmissorPix(contexto.remetenteNome) ||
    normalizarEmissorPix(contexto.remetenteTelefone);
  const emissorUsuario = normalizarEmissorPix(contexto.usuarioLogado);

  let emissorPix: string | null = null;
  let origemEmissor: OrigemRastreabilidadeCaixinha = 'MANUAL';

  if (emissorOcr) {
    emissorPix = emissorOcr;
    origemEmissor = 'OCR_COMPROVANTE';
  } else if (emissorWhatsApp) {
    emissorPix = emissorWhatsApp;
    origemEmissor = 'INFERIDO_WHATSAPP';
  } else if (tipo === 'ENTRADA_PIX' && emissorUsuario) {
    emissorPix = emissorUsuario;
    origemEmissor = 'INFERIDO_OPERADOR';
  }

  // 2. Resolução de Data + Hora (com fallback WhatsApp -> Barra de Status -> Arquivo -> Agora BRT)
  const dataOcr = normalizarDataIso(leituraBruta.data);
  const horaOcr = normalizarHoraHHMM(leituraBruta.hora);
  const horaTela = normalizarHoraHHMM(leituraBruta.horaBarraStatus);
  const tsWhatsApp = extrairDataHoraTimestampWhatsApp(contexto.whatsappTimestamp);
  const tsArquivo =
    typeof contexto.arquivoLastModifiedMs === 'number' &&
    Number.isFinite(contexto.arquivoLastModifiedMs) &&
    contexto.arquivoLastModifiedMs > 0
      ? obterDataHoraBrasilia(new Date(contexto.arquivoLastModifiedMs))
      : null;
  const agoraBr = obterDataHoraBrasilia(contexto.agora || new Date());

  let dataFinal: string;
  let horaFinal: string;
  let origemDataHora: OrigemRastreabilidadeCaixinha;

  if (dataOcr && horaOcr) {
    dataFinal = dataOcr;
    horaFinal = horaOcr;
    origemDataHora = 'OCR_COMPROVANTE';
  } else if (tsWhatsApp) {
    dataFinal = dataOcr || tsWhatsApp.data;
    horaFinal = horaOcr || tsWhatsApp.hora;
    origemDataHora = 'INFERIDO_WHATSAPP';
  } else if (horaTela) {
    dataFinal = dataOcr || tsArquivo?.data || agoraBr.data;
    horaFinal = horaOcr || horaTela;
    origemDataHora = 'CAPTURADO_TELA';
  } else if (tsArquivo) {
    dataFinal = dataOcr || tsArquivo.data;
    horaFinal = horaOcr || tsArquivo.hora;
    origemDataHora = 'INFERIDO_OPERADOR';
  } else {
    dataFinal = dataOcr || agoraBr.data;
    horaFinal = horaOcr || agoraBr.hora;
    origemDataHora = 'INFERIDO_OPERADOR';
  }

  const comprovanteCortado =
    Boolean(leituraBruta.comprovanteCortado) ||
    (tipo === 'ENTRADA_PIX' && (!emissorOcr || !dataOcr || !horaOcr));

  return {
    tipo,
    valor,
    categoria,
    descricao,
    destinatario,
    emissorPix,
    origemEmissor,
    labelOrigemEmissor: LABELS_ORIGEM_RASTREABILIDADE[origemEmissor],
    data: dataFinal,
    hora: horaFinal,
    dataHoraEnvio: montarDataHoraEnvioIso(dataFinal, horaFinal),
    origemDataHora,
    labelOrigemDataHora: LABELS_ORIGEM_RASTREABILIDADE[origemDataHora],
    comprovanteCortado,
  };
}
