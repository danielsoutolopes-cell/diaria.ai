import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { data, error } = await supabaseAdmin
      .from('obras_config')
      .select('*')
      .eq('tenant_id', activeTenant.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao listar obras:', error);
      return NextResponse.json({ obras: [] }, { status: 500 });
    }

    return NextResponse.json({ obras: data || [] });
  } catch (err) {
    console.error('Erro na rota /api/obras:', err);
    return NextResponse.json({ obras: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = await req.json();
    const { nome, local, tipo_obra, valor_diaria_padrao, apelidos } = body;
    const tenant_id = activeTenant.id;

    if (!nome) {
      return NextResponse.json({ error: 'Nome da obra é obrigatório' }, { status: 400 });
    }

    const payload: Record<string, string | number | boolean> = {
      tenant_id,
      nome: String(nome).trim().toUpperCase(),
      local: local ? String(local).trim() : 'Canteiro Volante',
      tipo_obra: tipo_obra || 'PISCINA',
      ativo: true,
    };

    // Tenta inserir direto
    const res = await supabaseAdmin.from('obras_config').insert(payload).select().single();

    if (res.error) {
      console.error('Erro ao inserir obra:', res.error);
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    // Se informou apelidos, salva no storage
    if (res.data?.id && Array.isArray(apelidos) && apelidos.length > 0) {
      const { obterApelidosSistema, salvarApelidosSistema } = await import('@/services/apelidosStorage');
      const mapa = await obterApelidosSistema();
      mapa.obras[res.data.id] = apelidos.map((a: string) => String(a).trim()).filter(Boolean);
      await salvarApelidosSistema(mapa);
    }

    return NextResponse.json({ success: true, obra: res.data });
  } catch (err) {
    console.error('Erro ao criar obra:', err);
    return NextResponse.json({ error: 'Falha interna ao criar obra' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = await req.json();
    const { id, nome, local, tipo_obra, valor_diaria_padrao, ativo, apelidos } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID da obra é obrigatório' }, { status: 400 });
    }

    const payload: Record<string, string | number | boolean> = {};
    if (nome !== undefined) payload.nome = String(nome).trim().toUpperCase();
    if (local !== undefined) payload.local = String(local).trim();
    if (tipo_obra !== undefined) payload.tipo_obra = tipo_obra;
    if (valor_diaria_padrao !== undefined) payload.valor_diaria_padrao = Number(valor_diaria_padrao);
    if (ativo !== undefined) payload.ativo = Boolean(ativo);

    const res = await supabaseAdmin
      .from('obras_config')
      .update(payload)
      .eq('tenant_id', activeTenant.id)
      .eq('id', id)
      .select()
      .single();

    if (res.error) {
      console.error('Erro ao atualizar obra:', res.error);
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    // Se informou apelidos, salva no storage
    if (Array.isArray(apelidos)) {
      const { obterApelidosSistema, salvarApelidosSistema } = await import('@/services/apelidosStorage');
      const mapa = await obterApelidosSistema();
      mapa.obras[id] = apelidos.map((a: string) => String(a).trim()).filter(Boolean);
      await salvarApelidosSistema(mapa);
    }

    return NextResponse.json({ success: true, obra: res.data });
  } catch (err) {
    console.error('Erro ao atualizar obra:', err);
    return NextResponse.json({ error: 'Falha interna ao atualizar obra' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID da obra é obrigatório' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('obras_config')
      .update({ ativo: false })
      .eq('tenant_id', activeTenant.id)
      .eq('id', id);

    if (error) {
      console.error('Erro ao inativar obra:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao inativar obra:', err);
    return NextResponse.json({ error: 'Falha interna' }, { status: 500 });
  }
}
