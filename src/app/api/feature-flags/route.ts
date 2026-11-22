import { NextRequest, NextResponse } from 'next/server';
import { getActiveTenantFromRequest, TENANTS, type TenantSlug } from '@/lib/tenant';
import {
  FEATURE_FLAGS_CATALOGO,
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

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const incluirTodas = searchParams.get('all') === '1';

    const flagsAtivas = await lerFeatureFlagsTenant(activeTenant.id);

    if (incluirTodas) {
      const porEmpresa = await lerTodasFeatureFlagsPorEmpresa();
      return NextResponse.json({
        success: true,
        tenant: {
          id: activeTenant.id,
          slug: activeTenant.slug,
          nome: activeTenant.nome,
        },
        flags: flagsAtivas,
        porEmpresa,
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
      body.atualizadoPor || 'Super Usuário (/setup)'
    );

    const porEmpresa = await lerTodasFeatureFlagsPorEmpresa();

    return NextResponse.json({
      success: true,
      tenant: {
        id: alvoTenant.id,
        slug: alvoTenant.slug,
        nome: alvoTenant.nome,
      },
      flags: atualizadas,
      porEmpresa,
      message: `Feature Flags de homologação atualizadas para ${alvoTenant.nome}.`,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao salvar feature flags.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
