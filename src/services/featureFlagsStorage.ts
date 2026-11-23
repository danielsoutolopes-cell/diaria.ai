import { supabaseAdmin } from '@/lib/supabase';
import { TENANTS, type TenantSlug } from '@/lib/tenant';

export interface FeatureFlagsHomologacao {
  FF_RESUMO_DIARIO_19H: boolean;
  FF_EXTRATO_COLABORADOR_LINK: boolean;
}

export type FeatureFlagKey = keyof FeatureFlagsHomologacao;

export const FEATURE_FLAGS_DEFAULT: FeatureFlagsHomologacao = {
  FF_RESUMO_DIARIO_19H: false,
  FF_EXTRATO_COLABORADOR_LINK: false,
};

export type FeatureFlagFase = 'HOMOLOGAÇÃO' | 'IMPLANTAÇÃO';

export interface FeatureFlagMetadata {
  key: FeatureFlagKey;
  titulo: string;
  descricao: string;
  statusLabel: 'EM HOMOLOGAÇÃO';
  fase: FeatureFlagFase;
  fluxosAfetados: readonly string[];
}

export interface FeatureFlagsAuditoriaTenant {
  atualizadoPor: string | null;
  atualizadoEm: string | null;
}

export const FEATURE_FLAGS_CATALOGO: readonly FeatureFlagMetadata[] = [
  {
    key: 'FF_RESUMO_DIARIO_19H',
    titulo: 'Resumo Diário Automático às 19h (Confirmação "OK")',
    descricao:
      'Envia às 19:00 (America/Sao_Paulo, 24/7) o espelho diário de presenças no grupo da obra (sem valores em R$) para o encarregado homologar respondendo "OK" no WhatsApp.',
    statusLabel: 'EM HOMOLOGAÇÃO',
    fase: 'HOMOLOGAÇÃO',
    fluxosAfetados: [
      'Agendador 19h (/api/cron/resumo-diario-19h)',
      'Webhook WhatsApp ("OK")',
      'Tela /whatsapp',
    ],
  },
  {
    key: 'FF_EXTRATO_COLABORADOR_LINK',
    titulo: 'Portal / Extrato Simplificado do Colaborador (Link Seguro)',
    descricao:
      'Libera no Borderô a geração de link temporário assinado (/extrato/[token], sem login) enviado junto ao comprovante PIX para o prestador consultar diárias, chuvas, rateios e vales.',
    statusLabel: 'EM HOMOLOGAÇÃO',
    fase: 'HOMOLOGAÇÃO',
    fluxosAfetados: [
      'Borderô (/bordero)',
      'Portal Público (/extrato/[token])',
      'API /api/extrato-colaborador',
    ],
  },
];

export function normalizarFeatureFlags(
  raw: unknown
): FeatureFlagsHomologacao {
  if (!raw || typeof raw !== 'object') {
    return { ...FEATURE_FLAGS_DEFAULT };
  }
  const obj = raw as Record<string, unknown>;
  return {
    FF_RESUMO_DIARIO_19H: obj.FF_RESUMO_DIARIO_19H === true,
    FF_EXTRATO_COLABORADOR_LINK: obj.FF_EXTRATO_COLABORADOR_LINK === true,
  };
}

/**
 * Lê as Feature Flags de homologação isoladas por tenant_id.
 * Usa persistência híbrida (parametros_sistema.configuracoes.feature_flags_homologacao
 * + fallback/espelho na coluna tenants.feature_flags_homologacao).
 */
export async function lerFeatureFlagsTenant(
  tenantId: string
): Promise<FeatureFlagsHomologacao> {
  try {
    const { data: paramRow } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    const configs = (paramRow?.configuracoes || null) as Record<
      string,
      unknown
    > | null;
    if (configs && configs.feature_flags_homologacao) {
      return normalizarFeatureFlags(configs.feature_flags_homologacao);
    }

    const { data: tenantRow } = await supabaseAdmin
      .from('tenants')
      .select('feature_flags_homologacao')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantRow && 'feature_flags_homologacao' in tenantRow) {
      return normalizarFeatureFlags(
        (tenantRow as Record<string, unknown>).feature_flags_homologacao
      );
    }
  } catch {
    // Fallback seguro: todas as flags de homologação desligadas
  }
  return { ...FEATURE_FLAGS_DEFAULT };
}

/**
 * Lê metadados de auditoria (quem/quando alterou) das Feature Flags de um tenant_id.
 */
export async function lerAuditoriaFeatureFlagsTenant(
  tenantId: string
): Promise<FeatureFlagsAuditoriaTenant> {
  try {
    const { data: paramRow } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    const configs = (paramRow?.configuracoes || null) as Record<
      string,
      unknown
    > | null;
    return {
      atualizadoPor:
        typeof configs?.feature_flags_atualizado_por === 'string'
          ? configs.feature_flags_atualizado_por
          : null,
      atualizadoEm:
        typeof configs?.feature_flags_atualizado_em === 'string'
          ? configs.feature_flags_atualizado_em
          : null,
    };
  } catch {
    return { atualizadoPor: null, atualizadoEm: null };
  }
}

/**
 * Salva as Feature Flags de homologação isoladas por tenant_id.
 */
export async function salvarFeatureFlagsTenant(
  tenantId: string,
  partial: Partial<FeatureFlagsHomologacao>,
  atualizadoPor = 'Patrícia & Daniel (/config-geral)'
): Promise<FeatureFlagsHomologacao> {
  const atuais = await lerFeatureFlagsTenant(tenantId);
  const proximas: FeatureFlagsHomologacao = {
    FF_RESUMO_DIARIO_19H:
      partial.FF_RESUMO_DIARIO_19H ?? atuais.FF_RESUMO_DIARIO_19H,
    FF_EXTRATO_COLABORADOR_LINK:
      partial.FF_EXTRATO_COLABORADOR_LINK ?? atuais.FF_EXTRATO_COLABORADOR_LINK,
  };

  const { data: paramRow } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();

  const configsAtuais = (paramRow?.configuracoes || {}) as Record<
    string,
    unknown
  >;
  const novasConfigs: Record<string, unknown> = {
    ...configsAtuais,
    feature_flags_homologacao: proximas,
    feature_flags_atualizado_por: atualizadoPor,
    feature_flags_atualizado_em: new Date().toISOString(),
  };

  if (paramRow?.id) {
    await supabaseAdmin
      .from('parametros_sistema')
      .update({ configuracoes: novasConfigs })
      .eq('id', paramRow.id);
  } else {
    await supabaseAdmin.from('parametros_sistema').insert({
      tenant_id: tenantId,
      configuracoes: novasConfigs,
    });
  }

  // Best-effort: espelha também em tenants.feature_flags_homologacao se a coluna V16 existir
  try {
    await supabaseAdmin
      .from('tenants')
      .update({ feature_flags_homologacao: proximas })
      .eq('id', tenantId);
  } catch {
    // Ignora caso a migração V16 ainda não tenha sido executada no banco remoto
  }

  return proximas;
}

export async function lerTodasFeatureFlagsPorEmpresa(): Promise<
  Record<TenantSlug, FeatureFlagsHomologacao>
> {
  const [jhoston, intermack] = await Promise.all([
    lerFeatureFlagsTenant(TENANTS.jhoston.id),
    lerFeatureFlagsTenant(TENANTS.intermack.id),
  ]);
  return { jhoston, intermack };
}

export async function lerAuditoriaFeatureFlagsPorEmpresa(): Promise<
  Record<TenantSlug, FeatureFlagsAuditoriaTenant>
> {
  const [jhoston, intermack] = await Promise.all([
    lerAuditoriaFeatureFlagsTenant(TENANTS.jhoston.id),
    lerAuditoriaFeatureFlagsTenant(TENANTS.intermack.id),
  ]);
  return { jhoston, intermack };
}
