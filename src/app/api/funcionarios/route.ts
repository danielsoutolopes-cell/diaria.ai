import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('funcionarios_obra')
      .select(`
        id,
        nome_trabalhador,
        chave_pix,
        telefone,
        obra_id,
        funcao,
        valor_diaria,
        ativo,
        obras_config (
          nome
        )
      `)
      .order('nome_trabalhador', { ascending: true });

    if (error) {
      console.error('Erro ao listar funcionários:', error);
      return NextResponse.json({ funcionarios: [] }, { status: 500 });
    }

    return NextResponse.json({ funcionarios: data || [] });
  } catch (err) {
    console.error('Erro na rota /api/funcionarios:', err);
    return NextResponse.json({ funcionarios: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nome_trabalhador,
      chave_pix,
      telefone,
      obra_id,
      valor_diaria,
      funcao = 'OPERACIONAL',
      tenant_id = '00000000-0000-0000-0000-000000000001',
    } = body;

    if (!nome_trabalhador || !chave_pix) {
      return NextResponse.json({ error: 'Nome e Chave PIX são obrigatórios' }, { status: 400 });
    }

    const payload: Record<string, any> = {
      tenant_id,
      nome_trabalhador: String(nome_trabalhador).trim(),
      chave_pix: String(chave_pix).trim(),
      telefone: telefone ? String(telefone).trim() : null,
      obra_id: obra_id || null,
      valor_diaria: Number(valor_diaria) || 150,
      funcao: funcao || 'OPERACIONAL',
      ativo: true,
    };

    const res = await supabaseAdmin
      .from('funcionarios_obra')
      .insert(payload)
      .select(`
        id,
        nome_trabalhador,
        chave_pix,
        telefone,
        obra_id,
        funcao,
        valor_diaria,
        ativo,
        obras_config (
          nome
        )
      `)
      .single();

    if (res.error) {
      console.error('Erro ao inserir funcionário:', res.error);
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, funcionario: res.data });
  } catch (err) {
    console.error('Erro ao criar funcionário:', err);
    return NextResponse.json({ error: 'Falha interna ao criar funcionário' }, { status: 500 });
  }
}
