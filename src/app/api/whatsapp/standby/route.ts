import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { data } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', activeTenant.id)
      .limit(1)
      .maybeSingle();

    const configs = (data?.configuracoes || {}) as Record<string, unknown>;
    const standby = configs.whatsapp_standby !== false; // default: STAND-BY
    return NextResponse.json(
      {
        success: true,
        tenant: activeTenant.slug,
        standby,
        modo: standby ? 'STAND_BY' : 'ATIVO',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json({
      success: true,
      standby: true,
      modo: 'STAND_BY',
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as { standby?: boolean };
    const standby = body.standby === true;

    const { data: paramRow } = await supabaseAdmin
      .from('parametros_sistema')
      .select('id, configuracoes')
      .eq('tenant_id', activeTenant.id)
      .limit(1)
      .maybeSingle();

    const configs = ((paramRow?.configuracoes as Record<string, unknown> | null) ||
      {}) as Record<string, unknown>;

    const novasConfigs: Record<string, unknown> = {
      ...configs,
      whatsapp_standby: standby,
      whatsapp_modo: standby ? 'STAND_BY' : 'ATIVO',
      whatsapp_standby_atualizado_em: new Date().toISOString(),
    };

    if (paramRow?.id) {
      await supabaseAdmin
        .from('parametros_sistema')
        .update({ configuracoes: novasConfigs })
        .eq('id', paramRow.id);
    } else {
      await supabaseAdmin.from('parametros_sistema').insert({
        tenant_id: activeTenant.id,
        configuracoes: novasConfigs,
      });
    }

    return NextResponse.json({
      success: true,
      tenant: activeTenant.slug,
      standby,
      modo: standby ? 'STAND_BY' : 'ATIVO',
      message: standby
        ? 'WhatsApp colocado em STAND-BY (ingestão e auto-wake pausados; sessão preservada no Supabase).'
        : 'WhatsApp religado em modo ATIVO!',
    });
  } catch (err) {
    console.error('[api/whatsapp/standby POST]', err);
    return NextResponse.json(
      { error: 'Falha ao atualizar modo do WhatsApp.' },
      { status: 500 }
    );
  }
}
