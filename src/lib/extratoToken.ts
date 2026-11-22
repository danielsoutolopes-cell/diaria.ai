import crypto from 'node:crypto';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';

export interface ExtratoColaboradorTokenPayload {
  tenantId: string;
  trabalhadorCanonico: string;
  periodoDias: number;
  emitidoEm: number; // unix seconds
  expiraEm: number; // unix seconds
}

function getSigningSecret(): string {
  return (
    process.env.EXTRATO_TOKEN_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'diaria-ai-extrato-homologacao-secret-v16'
  );
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Gera token temporário assinado via HMAC-SHA256 para o Portal / Extrato
 * Simplificado do Colaborador (/extrato/[token], sem login).
 */
export function gerarTokenExtratoColaborador(params: {
  tenantId: string;
  trabalhador: string;
  periodoDias?: number;
  expiraEmHoras?: number;
  agoraMs?: number;
}): { token: string; expiraEmIso: string; payload: ExtratoColaboradorTokenPayload } {
  const agoraSec = Math.floor((params.agoraMs ?? Date.now()) / 1000);
  const ttlSec = Math.max(1, Math.round((params.expiraEmHoras ?? 168) * 3600)); // padrão 7 dias
  const payload: ExtratoColaboradorTokenPayload = {
    tenantId: params.tenantId,
    trabalhadorCanonico: normalizarNomeTrabalhadorCanonico(params.trabalhador),
    periodoDias: params.periodoDias ?? 15,
    emitidoEm: agoraSec,
    expiraEm: agoraSec + ttlSec,
  };

  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'EXT' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${headerB64}.${payloadB64}`;
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(dataToSign)
    .digest();
  const sigB64 = base64UrlEncode(sig);

  return {
    token: `${dataToSign}.${sigB64}`,
    expiraEmIso: new Date(payload.expiraEm * 1000).toISOString(),
    payload,
  };
}

/**
 * Valida assinatura HMAC-SHA256 e prazo de validade do token do colaborador.
 */
export function verificarTokenExtratoColaborador(
  token: string,
  agoraMs: number = Date.now()
):
  | { valido: true; payload: ExtratoColaboradorTokenPayload }
  | { valido: false; motivo: string } {
  try {
    const partes = token.trim().split('.');
    if (partes.length !== 3) {
      return { valido: false, motivo: 'Formato de token inválido.' };
    }
    const [headerB64, payloadB64, sigB64] = partes;
    const dataToSign = `${headerB64}.${payloadB64}`;
    const expectedSig = base64UrlEncode(
      crypto
        .createHmac('sha256', getSigningSecret())
        .update(dataToSign)
        .digest()
    );

    const a = Buffer.from(sigB64, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valido: false, motivo: 'Assinatura de segurança inválida.' };
    }

    const decoded = JSON.parse(
      base64UrlDecode(payloadB64)
    ) as ExtratoColaboradorTokenPayload;

    if (
      !decoded ||
      typeof decoded.tenantId !== 'string' ||
      typeof decoded.trabalhadorCanonico !== 'string' ||
      typeof decoded.expiraEm !== 'number'
    ) {
      return { valido: false, motivo: 'Payload do token corrompido.' };
    }

    const agoraSec = Math.floor(agoraMs / 1000);
    if (agoraSec > decoded.expiraEm) {
      return {
        valido: false,
        motivo: 'Este link seguro de extrato expirou. Solicite um novo link à administração.',
      };
    }

    return { valido: true, payload: decoded };
  } catch {
    return { valido: false, motivo: 'Token malformado ou ilegível.' };
  }
}
