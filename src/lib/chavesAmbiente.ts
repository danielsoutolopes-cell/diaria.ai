export type OndeUsadaTag =
  | 'Render'
  | 'GitHub Actions'
  | 'Supabase'
  | 'Cloudflare R2'
  | 'Baileys WhatsApp';

export interface ChaveAmbienteItem {
  nome: string;
  descricao: string;
  ondeUsada: readonly OndeUsadaTag[];
  secreta: boolean;
  status: 'CONFIGURADA' | 'PENDENTE';
  valorMascarado: string;
  /** Preenchido apenas para chaves públicas ou quando revelado explicitamente por Super Admin */
  valorCompleto?: string;
}

export interface BaileysSessionResumo {
  disponivel: boolean;
  session_id: string | null;
  total_chaves: number;
  updated_at: string | null;
}

export interface DefinicaoChaveAmbiente {
  nome: string;
  fallbacks?: readonly string[];
  descricao: string;
  ondeUsada: readonly OndeUsadaTag[];
  secreta: boolean;
}

export const DEFINICOES_CHAVES_AMBIENTE: readonly DefinicaoChaveAmbiente[] = [
  {
    nome: 'RENDER_APP_URL',
    fallbacks: ['NEXT_PUBLIC_APP_URL', 'RENDER_EXTERNAL_URL'],
    descricao:
      'URL pública da instância em produção (usada pelos crons do GitHub Actions).',
    ondeUsada: ['Render', 'GitHub Actions'],
    secreta: false,
  },
  {
    nome: 'CRON_SECRET',
    descricao:
      'Segredo Bearer para autenticar agendamentos automáticos (Resumo 19h, Saúde 19:30, PDF Quinzenal).',
    ondeUsada: ['Render', 'GitHub Actions'],
    secreta: true,
  },
  {
    nome: 'NEXT_PUBLIC_SUPABASE_URL',
    descricao: 'Endpoint do projeto Supabase multi-tenant (Jhoston & Intermack).',
    ondeUsada: ['Supabase', 'Render'],
    secreta: false,
  },
  {
    nome: 'SUPABASE_SERVICE_ROLE_KEY',
    fallbacks: ['SUPABASE_SECRET_KEY'],
    descricao:
      'Chave administrativa server-side para operações protegidas e RLS.',
    ondeUsada: ['Supabase', 'Render'],
    secreta: true,
  },
  {
    nome: 'GEMINI_API_KEY',
    descricao:
      'Chave da API Google Gemini usada na extração 2 passagens, OCR e Diagnóstico IA.',
    ondeUsada: ['Render'],
    secreta: true,
  },
  {
    nome: 'CLOUDFLARE_R2_ACCOUNT_ID',
    fallbacks: ['R2_ACCOUNT_ID'],
    descricao: 'Identificador da conta Cloudflare R2 para armazenamento de fotos e PDFs.',
    ondeUsada: ['Cloudflare R2', 'Render'],
    secreta: false,
  },
  {
    nome: 'CLOUDFLARE_R2_BUCKET_NAME',
    fallbacks: ['R2_BUCKET_NAME'],
    descricao: 'Nome do bucket S3 compatível no Cloudflare R2.',
    ondeUsada: ['Cloudflare R2', 'Render'],
    secreta: false,
  },
  {
    nome: 'CLOUDFLARE_R2_ACCESS_KEY_ID',
    fallbacks: ['R2_ACCESS_KEY_ID'],
    descricao: 'Access Key ID de autenticação do bucket Cloudflare R2.',
    ondeUsada: ['Cloudflare R2', 'Render'],
    secreta: true,
  },
  {
    nome: 'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    fallbacks: ['R2_SECRET_ACCESS_KEY'],
    descricao: 'Secret Access Key privada do bucket Cloudflare R2.',
    ondeUsada: ['Cloudflare R2', 'Render'],
    secreta: true,
  },
] as const;

export function mascararValorChave(
  valor: string | undefined | null,
  secreta: boolean
): string {
  const limpo = (valor || '').trim();
  if (!limpo) return '— (não configurada)';
  if (!secreta) return limpo;
  if (limpo.length <= 8) {
    return `${limpo.slice(0, 2)}••••${limpo.slice(-2)}`;
  }
  const prefixo = limpo.slice(0, 4);
  const sufixo = limpo.slice(-4);
  return `${prefixo}••••••••${sufixo}`;
}

export function montarListaChavesAmbiente(
  env: Record<string, string | undefined>,
  incluirSegredosCompletos = false
): ChaveAmbienteItem[] {
  return DEFINICOES_CHAVES_AMBIENTE.map((def) => {
    let valorEncontrado = (env[def.nome] || '').trim();
    if (!valorEncontrado && def.fallbacks) {
      for (const fb of def.fallbacks) {
        const v = (env[fb] || '').trim();
        if (v) {
          valorEncontrado = v;
          break;
        }
      }
    }

    const configurada = valorEncontrado.length > 0;
    const item: ChaveAmbienteItem = {
      nome: def.nome,
      descricao: def.descricao,
      ondeUsada: def.ondeUsada,
      secreta: def.secreta,
      status: configurada ? 'CONFIGURADA' : 'PENDENTE',
      valorMascarado: mascararValorChave(valorEncontrado, def.secreta),
    };

    if (configurada && (!def.secreta || incluirSegredosCompletos)) {
      item.valorCompleto = valorEncontrado;
    }

    return item;
  });
}
