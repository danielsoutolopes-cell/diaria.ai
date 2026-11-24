import crypto from 'crypto';

export type AdminChaveId = 'patricia' | 'daniel';

export const JANELA_LIVRE_HORAS = 24;
export const JANELA_LIVRE_MS = JANELA_LIVRE_HORAS * 60 * 60 * 1000;
export const JANELA_PIN_SEGUNDOS = 180; // 3 minutos
export const JANELA_PIN_MS = JANELA_PIN_SEGUNDOS * 1000;

export interface PinEfemeroInfo {
  adminId: AdminChaveId;
  adminNome: string;
  /** Chave completa de 8 dígitos (prefixo4 + sufixo4) */
  pin: string;
  /** 4 primeiros dígitos exibidos abaixo do registro na ação */
  prefixo4: string;
  /** 4 últimos dígitos exibidos apenas na tela segura /chaves-autorizacao */
  sufixo4: string;
  expiraEmMs: number;
  segundosRestantes: number;
}

export interface ResultadoDuplaAlcada {
  exigeDuplaAlcada: boolean;
  autorizado: boolean;
  erro?: string;
}

function getSecretDuplaAlcada(): string {
  return (
    process.env.DUPLA_ALCADA_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    'diaria-ai-dupla-alcada-v1'
  );
}

export function identificarAdminChave(
  usuario: string | null | undefined
): AdminChaveId | null {
  if (!usuario) return null;
  const u = usuario.toLowerCase();
  if (u.includes('patr') || u.includes('11978543369')) return 'patricia';
  if (
    u.includes('daniel') ||
    u.includes('11988139833') ||
    u.includes('11913192703')
  ) {
    return 'daniel';
  }
  return null;
}

function calcularPinParaSlot(adminId: AdminChaveId, slot: number): string {
  const hmac = crypto
    .createHmac('sha256', getSecretDuplaAlcada())
    .update(`split8:${adminId}:${slot}`)
    .digest();
  const num = hmac.readUInt32BE(0) % 100_000_000;
  return String(num).padStart(8, '0');
}

export function gerarPinEfemeroAdmin(
  adminId: AdminChaveId,
  agoraMs: number = Date.now()
): PinEfemeroInfo {
  const slot = Math.floor(agoraMs / JANELA_PIN_MS);
  const expiraEmMs = (slot + 1) * JANELA_PIN_MS;
  const segundosRestantes = Math.max(
    1,
    Math.ceil((expiraEmMs - agoraMs) / 1000)
  );
  const pin8 = calcularPinParaSlot(adminId, slot);
  return {
    adminId,
    adminNome: adminId === 'patricia' ? 'Patrícia Grubel' : 'Daniel Lopes',
    pin: pin8,
    prefixo4: pin8.slice(0, 4),
    sufixo4: pin8.slice(4, 8),
    expiraEmMs,
    segundosRestantes,
  };
}

export function validarPinEfemeroAdmin(
  adminId: AdminChaveId,
  pinInformado: string | undefined | null,
  agoraMs: number = Date.now()
): boolean {
  const limpo = String(pinInformado || '').replace(/\D/g, '');
  if (limpo.length !== 8) return false;
  const slotAtual = Math.floor(agoraMs / JANELA_PIN_MS);
  const pinAtual = calcularPinParaSlot(adminId, slotAtual);
  if (limpo === pinAtual) return true;

  // Tolerância de 15s na virada de janela de 3 minutos
  const inicioSlotAtual = slotAtual * JANELA_PIN_MS;
  if (agoraMs - inicioSlotAtual <= 15_000) {
    const pinAnterior = calcularPinParaSlot(adminId, slotAtual - 1);
    if (limpo === pinAnterior) return true;
  }
  return false;
}

export function registroPassouDe24Horas(
  createdAt: string | null | undefined,
  dataReferencia?: string | null,
  agoraMs: number = Date.now()
): boolean {
  if (createdAt) {
    const ts = Date.parse(createdAt);
    if (!Number.isNaN(ts)) {
      return agoraMs - ts > JANELA_LIVRE_MS;
    }
  }
  if (dataReferencia) {
    const tsRef = Date.parse(`${dataReferencia}T12:00:00-03:00`);
    if (!Number.isNaN(tsRef)) {
      return agoraMs - tsRef > JANELA_LIVRE_MS;
    }
  }
  return false;
}

export function validarDuplaAlcada(params: {
  createdAt?: string | null;
  dataReferencia?: string | null;
  pinPatricia?: string | null;
  pinDaniel?: string | null;
  agoraMs?: number;
}): ResultadoDuplaAlcada {
  const agora = params.agoraMs ?? Date.now();
  const exige = registroPassouDe24Horas(
    params.createdAt,
    params.dataReferencia,
    agora
  );
  if (!exige) {
    return { exigeDuplaAlcada: false, autorizado: true };
  }

  const okPatricia = validarPinEfemeroAdmin(
    'patricia',
    params.pinPatricia,
    agora
  );
  const okDaniel = validarPinEfemeroAdmin('daniel', params.pinDaniel, agora);

  if (!okPatricia || !okDaniel) {
    const faltando = !okPatricia && !okDaniel
      ? 'PIN da Patrícia e PIN do Daniel'
      : !okPatricia
        ? 'PIN da Patrícia'
        : 'PIN do Daniel';
    return {
      exigeDuplaAlcada: true,
      autorizado: false,
      erro: `Registro com mais de 24h exige Dupla Alçada (2 chaves válidas por 3 min). Verifique: ${faltando}.`,
    };
  }

  return { exigeDuplaAlcada: true, autorizado: true };
}
