import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Listar diárias por obra de um funcionário ou de todos
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const funcionarioId = searchParams.get('funcionarioId');
    const tenantId = searchParams.get('tenantId') || '00000000-0000-0000-0000-000000000001';

    let query = supabaseAdmin
      .from('trabalhador_obra_valores')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .order('nome_trabalhador', { ascending: true });

    if (funcionarioId) {
      query = query.eq('funcionario_id', funcionarioId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, valores: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Criar ou atualizar valor de diária em obra específica (Ex: R$ 220 Quase Tudo / R$ 200 Jabaquara)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId = '00000000-0000-0000-0000-000000000001', funcionarioId, nomeTrabalhador, obraId, nomeObra, valorDiaria, observacao } = body;

    if (!nomeTrabalhador || !valorDiaria) {
      return NextResponse.json({ error: 'Nome do trabalhador e valor da diária são obrigatórios.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('trabalhador_obra_valores')
      .upsert({
        tenant_id: tenantId,
        funcionario_id: funcionarioId || null,
        nome_trabalhador: nomeTrabalhador,
        obra_id: obraId || null,
        nome_obra: nomeObra || null,
        valor_diaria: Number(valorDiaria),
        observacao: observacao || null,
        ativo: true,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, valor: data, message: 'Diária por obra configurada com sucesso.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
