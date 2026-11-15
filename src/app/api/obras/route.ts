import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('obras_config')
      .select('*')
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
    const body = await req.json();
    const { nome, local, tipo_obra, valor_diaria_padrao, apelidos, tenant_id = '00000000-0000-0000-0000-000000000001' } = body;

    if (!nome) {
      return NextResponse.json({ error: 'Nome da obra é obrigatório' }, { status: 400 });
    }

    const payload: Record<string, any> = {
      tenant_id,
      nome: String(nome).trim().toUpperCase(),
      local: local ? String(local).trim() : 'Canteiro Volante',
      tipo_obra: tipo_obra || 'PISCINA',
      ativo: true,
    };

    // Tenta inserir direto
    let res = await supabaseAdmin.from('obras_config').insert(payload).select().single();

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
