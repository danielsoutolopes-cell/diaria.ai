import crypto from 'crypto';
import type { DiarioObraRegistro } from '@/lib/diarioObraRelatorio';

export const JHOSTON_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const PONTO_CAMPO_COOKIE_NAME = 'diaria_ponto_campo';

export type TipoDiariaCampo =
  | 'NORMAL'
  | 'MEIO_DIA'
  | 'CHUVA'
  | 'VIAGEM'
  | 'DIA_PARADO';

export interface OpcaoTipoDiariaCampo {
  codigo: TipoDiariaCampo;
  label: string;
  labelCurto: string;
  fracao: number;
  tipoRegistro: 'DIARIA' | 'CHUVA' | 'VIAGEM' | 'DIA_PARADO';
}

export const OPCOES_TIPO_DIARIA_CAMPO: readonly OpcaoTipoDiariaCampo[] = [
  {
    codigo: 'NORMAL',
    label: 'Normal (1.0)',
    labelCurto: '1.0',
    fracao: 1.0,
    tipoRegistro: 'DIARIA',
  },
  {
    codigo: 'MEIO_DIA',
    label: 'Meio Dia (0.5)',
    labelCurto: '0.5',
    fracao: 0.5,
    tipoRegistro: 'DIARIA',
  },
  {
    codigo: 'CHUVA',
    label: 'Chuva (1.0)',
    labelCurto: 'Chuva',
    fracao: 1.0,
    tipoRegistro: 'CHUVA',
  },
  {
    codigo: 'VIAGEM',
    label: 'Viagem',
    labelCurto: 'Viagem',
    fracao: 1.0,
    tipoRegistro: 'VIAGEM',
  },
  {
    codigo: 'DIA_PARADO',
    label: 'Dia Parado',
    labelCurto: 'Parado',
    fracao: 1.0,
    tipoRegistro: 'DIA_PARADO',
  },
] as const;

export interface EncarregadoCampoConfig {
  id: string;
  nome: string;
  pin: string;
  telefone?: string | null;
  obrasVinculadas: string[];
  ativo: boolean;
}

export interface SessaoPontoCampo {
  encarregadoId: string;
  encarregadoNome: string;
  tenantId: string;
  obrasVinculadas: string[];
  exp: number;
}

export interface StatusRelatorioSemanalObra {
  obraNome: string;
  enviadoEstaSemana: boolean;
  ultimoEnvioData: string | null;
  prazoQuintaFeira: string;
  situacaoPrazo: 'ENVIADO' | 'NO_PRAZO' | 'HOJE_QUINTA' | 'ATRASADO';
}

export const ENCARREGADOS_CAMPO_DEFAULT_JHOSTON: readonly EncarregadoCampoConfig[] =
  [
    {
      id: 'diego-paraty',
      nome: 'Diego',
      pin: '1234',
      telefone: null,
      obrasVinculadas: [
        'Jabaquara - Paraty/RJ',
        'Quase Tudo Diego - Paraty/RJ',
      ],
      ativo: true,
    },
  ];

function getSigningSecret(): string {
  return (
    process.env.PONTO_CAMPO_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'diaria-ai-ponto-campo-homologacao-v1'
  );
}

export function assinarSessaoPontoCampo(payload: SessaoPontoCampo): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(b64)
    .digest('base64url');
  return `${b64}.${sig}`;
}

export function verificarSessaoPontoCampo(
  token: string | undefined | null
): SessaoPontoCampo | null {
  if (!token || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const expected = crypto
    .createHmac('sha256', getSigningSecret())
    .update(b64)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(b64, 'base64url').toString('utf8')
    ) as SessaoPontoCampo;
    if (!parsed.encarregadoId || !parsed.tenantId || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function normalizarChaveObra(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function obterDataBrasilISO(dataRef: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(dataRef);
}

/**
 * Calcula o status do relatório semanal de 3 fotos (prazo máximo: quinta-feira)
 * para uma obra específica na semana corrente (segunda a domingo, BRT).
 */
export function calcularStatusRelatorioSemanal(
  diarios: readonly DiarioObraRegistro[],
  obraNome: string,
  dataRef: Date = new Date()
): StatusRelatorioSemanalObra {
  const hojeIso = obterDataBrasilISO(dataRef);
  const [y, m, d] = hojeIso.split('-').map(Number);
  const hojeUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const diaSemana = hojeUtc.getUTCDay(); // 0=Dom, 1=Seg, ..., 4=Qui, 6=Sab
  const offsetParaSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;

  const segundaUtc = new Date(hojeUtc);
  segundaUtc.setUTCDate(hojeUtc.getUTCDate() + offsetParaSegunda);
  const quintaUtc = new Date(segundaUtc);
  quintaUtc.setUTCDate(segundaUtc.getUTCDate() + 3);
  const domingoUtc = new Date(segundaUtc);
  domingoUtc.setUTCDate(segundaUtc.getUTCDate() + 6);

  const isoSegunda = segundaUtc.toISOString().slice(0, 10);
  const isoQuinta = quintaUtc.toISOString().slice(0, 10);
  const isoDomingo = domingoUtc.toISOString().slice(0, 10);

  const chaveAlvo = normalizarChaveObra(obraNome);
  const enviosDaSemana = diarios
    .filter((diario) => {
      if (!diario.data) return false;
      if (diario.data < isoSegunda || diario.data > isoDomingo) return false;
      return normalizarChaveObra(diario.obraNome) === chaveAlvo;
    })
    .sort((a, b) => b.data.localeCompare(a.data));

  const enviadoEstaSemana = enviosDaSemana.length > 0;
  let situacaoPrazo: StatusRelatorioSemanalObra['situacaoPrazo'] = 'NO_PRAZO';
  if (enviadoEstaSemana) {
    situacaoPrazo = 'ENVIADO';
  } else if (hojeIso === isoQuinta) {
    situacaoPrazo = 'HOJE_QUINTA';
  } else if (hojeIso > isoQuinta) {
    situacaoPrazo = 'ATRASADO';
  }

  return {
    obraNome,
    enviadoEstaSemana,
    ultimoEnvioData: enviosDaSemana[0]?.data || null,
    prazoQuintaFeira: isoQuinta,
    situacaoPrazo,
  };
}
