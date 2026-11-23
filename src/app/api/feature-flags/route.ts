import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveTenantFromRequest,
  isDanielOuPatricia,
  TENANTS,
  type TenantSlug,
} from '@/lib/tenant';
import {
  FEATURE_FLAGS_CATALOGO,
  lerAuditoriaFeatureFlagsPorEmpresa,
  lerFeatureFlagsTenant,
  lerTodasFeatureFlagsPorEmpresa,
  salvarFeatureFlagsTenant,
  type FeatureFlagsHomologacao,
} from '@/services/featureFlagsStorage';

export const dynamic = 'force-dynamic';

interface FeatureFlagsPostBody {
  tenantSlug?: TenantSlug;
  flags?: Partial<FeatureFlagsHomologacao>;
  atualizadoPor?: string;
}

function verificarAdminHub(req: NextRequest): {
  permitido: boolean;
  usuario: string;
} {
  const rawUser = req.cookies.get('diaria_user')?.value
    ? decodeURIComponent(req.cookies.get('diaria_user')?.value || '')
    : 'Patrícia Grubel';
  return {
    permitido: isDanielOuPatricia(rawUser),
    usuario: rawUser,
  };
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const incluirTodas = searchParams.get('all') === '1';

    const flagsAtivas = await lerFeatureFlagsTenant(activeTenant.id);

    if (incluirTodas) {
      const auth = verificarAdminHub(req);
      if (!auth.permitido) {
        return NextResponse.json(
          {
            error:
              'Consulta multi-empresa de Feature Flags é exclusiva de Patrícia Grubel e Daniel Lopes (/config-geral).',
          },
          { status: 403 }
        );
      }

      const [porEmpresa, auditoriaPorEmpresa] = await Promise.all([
        lerTodasFeatureFlagsPorEmpresa(),
        lerAuditoriaFeatureFlagsPorEmpresa(),
      ]);

      return NextResponse.json({
        success: true,
        tenant: {
          id: activeTenant.id,
          slug: activeTenant.slug,
          nome: activeTenant.nome,
        },
        flags: flagsAtivas,
        porEmpresa,
        auditoriaPorEmpresa,
        catalogo: FEATURE_FLAGS_CATALOGO,
      });
    }

    return NextResponse.json({
      success: true,
      tenant: {
        id: activeTenant.id,
        slug: activeTenant.slug,
        nome: activeTenant.nome,
      },
      flags: flagsAtivas,
      catalogo: FEATURE_FLAGS_CATALOGO,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao consultar feature flags.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = verificarAdminHub(req);
    if (!auth.permitido) {
      return NextResponse.json(
        {
          error:
            'Alteração de Feature Flags de homologação é exclusiva de Patrícia Grubel e Daniel Lopes no /config-geral.',
        },
        { status: 403 }
      );
    }

    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as FeatureFlagsPostBody;

    if (!body.flags || typeof body.flags !== 'object') {
      return NextResponse.json(
        { error: 'Payload de flags inválido.' },
        { status: 400 }
      );
    }

    const alvoSlug: TenantSlug =
      body.tenantSlug === 'intermack'
        ? 'intermack'
        : body.tenantSlug === 'jhoston'
          ? 'jhoston'
          : activeTenant.slug;

    const alvoTenant = TENANTS[alvoSlug];
    const atualizadas = await salvarFeatureFlagsTenant(
      alvoTenant.id,
      body.flags,
      body.atualizadoPor || `${auth.usuario} (/config-geral)`
    );

    const [porEmpresa, auditoriaPorEmpresa] = await Promise.all([
      lerTodasFeatureFlagsPorEmpresa(),
      lerAuditoriaFeatureFlagsPorEmpresa(),
    ]);

    return NextResponse.json({
      success: true,
      tenant: {
        id: alvoTenant.id,
        slug: alvoTenant.slug,
        nome: alvoTenant.nome,
      },
      flags: atualizadas,
      porEmpresa,
      auditoriaPorEmpresa,
      message: `Feature Flags de homologação atualizadas para ${alvoTenant.nome} via /config-geral.`,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao salvar feature flags.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
