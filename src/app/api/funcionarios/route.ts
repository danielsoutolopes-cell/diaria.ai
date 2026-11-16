import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Tenta selecionar com as novas colunas; se o banco ainda não rodou a migration, faz fallback seguro
    let { data, error } = await supabaseAdmin
      .from('funcionarios_obra')
      .select(`
        id,
        nome_trabalhador,
        chave_pix,
        telefone,
        obra_id,
        funcao,
        is_encarregado,
        valor_diaria,
        regime_remuneracao,
        ciclo_pagamento,
        valor_base_contratual,
        ativo,
        obras_config (
          nome
        )
      `)
      .order('nome_trabalhador', { ascending: true });

    if (error && (error.code === '42703' || error.message?.includes('is_encarregado') || error.message?.includes('regime_remuneracao'))) {
      // Fallback sem as colunas novas caso a migration ainda não tenha sido executada no Supabase
      const fallback = await supabaseAdmin
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
      
      data = fallback.data as any;
      error = fallback.error;
    }

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
      is_encarregado = false,
      regime_remuneracao = 'DIARISTA',
      ciclo_pagamento = 'QUINZENAL',
      valor_base_contratual,
      funcao = 'OPERACIONAL',
      apelidos,
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
      is_encarregado: Boolean(is_encarregado),
      valor_diaria: Number(valor_diaria) || 150,
      regime_remuneracao,
      ciclo_pagamento,
      valor_base_contratual: Number(valor_base_contratual || valor_diaria || 0),
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
        is_encarregado,
        valor_diaria,
        regime_remuneracao,
        ciclo_pagamento,
        valor_base_contratual,
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

    // Se informou apelidos, salva no storage
    if (res.data?.id && Array.isArray(apelidos) && apelidos.length > 0) {
      const { obterApelidosSistema, salvarApelidosSistema } = await import('@/services/apelidosStorage');
      const mapa = await obterApelidosSistema();
      mapa.funcionarios[res.data.id] = apelidos.map((a: string) => String(a).trim()).filter(Boolean);
      await salvarApelidosSistema(mapa);
    }

    return NextResponse.json({ success: true, funcionario: res.data });
  } catch (err) {
    console.error('Erro ao criar funcionário:', err);
    return NextResponse.json({ error: 'Falha interna ao criar funcionário' }, { status: 500 });
  }
}
