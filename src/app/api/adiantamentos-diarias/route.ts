import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface AdiantamentoRow {
  id: string;
  funcionario_id: string;
  obra_id: string | null;
  data_adiantamento: string;
  quantidade_diarias: number;
  quantidade_restante: number;
  valor_unitario: number;
  valor_total: number;
  status: 'ATIVO' | 'QUITADO' | 'CANCELADO';
  observacao: string | null;
  criado_por: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = getActiveTenantFromRequest(req).id;

    const [adRes, funcRes, obrasRes] = await Promise.all([
      supabaseAdmin
        .from('adiantamentos_diarias')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabaseAdmin
        .from('funcionarios_obra')
        .select('id, nome_trabalhador, valor_diaria, valor_diaria_obra, valor_diaria_piscina')
        .eq('tenant_id', tenantId)
        .eq('ativo', true)
        .order('nome_trabalhador', { ascending: true }),
      supabaseAdmin
        .from('obras_config')
        .select('id, nome, tipo_obra')
        .eq('tenant_id', tenantId)
        .eq('ativo', true)
        .order('nome', { ascending: true }),
    ]);

    if (adRes.error) {
      return NextResponse.json({ error: adRes.error.message }, { status: 500 });
    }

    const funcionariosNorm = (funcRes.data || []).map((f) => ({
      id: String(f.id),
      nome: String(f.nome_trabalhador || 'Colaborador'),
      valor_diaria: Number(f.valor_diaria || 0),
      valor_diaria_obra: Number(f.valor_diaria_obra || f.valor_diaria || 0),
      valor_diaria_piscina: Number(f.valor_diaria_piscina || f.valor_diaria || 0),
    }));

    const funcMap = new Map(funcionariosNorm.map((f) => [f.id, f.nome]));
    const obraMap = new Map(
      (obrasRes.data || []).map((o) => [String(o.id), String(o.nome)])
    );

    const adiantamentos = ((adRes.data || []) as AdiantamentoRow[]).map((a) => ({
      ...a,
      funcionario_nome: funcMap.get(a.funcionario_id) || 'Colaborador',
      obra_nome: a.obra_id ? obraMap.get(a.obra_id) || 'Obra' : 'Qualquer obra',
    }));

    return NextResponse.json({
      adiantamentos,
      funcionarios: funcionariosNorm,
      obras: obrasRes.data || [],
    });
  } catch (err) {
    console.error('[GET /api/adiantamentos-diarias]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = getActiveTenantFromRequest(req).id;
    const body = (await req.json()) as {
      funcionarioId?: string;
      obraId?: string | null;
      dataAdiantamento?: string;
      quantidadeDiarias?: number;
      valorUnitario?: number;
      observacao?: string;
      criadoPor?: string;
    };

    const funcionarioId = String(body.funcionarioId || '').trim();
    const quantidadeDiarias = Number(body.quantidadeDiarias || 0);
    const valorUnitario = Number(body.valorUnitario || 0);
    const dataAdiantamento =
      body.dataAdiantamento || new Date().toISOString().split('T')[0];

    if (!funcionarioId || quantidadeDiarias <= 0) {
      return NextResponse.json(
        { error: 'Informe colaborador e quantidade de diárias maior que zero.' },
        { status: 400 }
      );
    }

    const valorTotal = Number((quantidadeDiarias * valorUnitario).toFixed(2));

    const { data, error } = await supabaseAdmin
      .from('adiantamentos_diarias')
      .insert({
        tenant_id: tenantId,
        funcionario_id: funcionarioId,
        obra_id: body.obraId || null,
        data_adiantamento: dataAdiantamento,
        quantidade_diarias: quantidadeDiarias,
        quantidade_restante: quantidadeDiarias,
        valor_unitario: valorUnitario,
        valor_total: valorTotal,
        status: 'ATIVO',
        observacao: body.observacao?.trim() || null,
        criado_por: body.criadoPor || 'ADMIN',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      adiantamento: data,
      message: `Adiantamento de ${quantidadeDiarias} diária(s) (R$ ${valorTotal.toFixed(2)}) registrado com abatimento automático ativo.`,
    });
  } catch (err) {
    console.error('[POST /api/adiantamentos-diarias]', err);
    return NextResponse.json({ error: 'Erro ao gravar adiantamento.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const tenantId = getActiveTenantFromRequest(req).id;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('adiantamentos_diarias')
      .update({ status: 'CANCELADO', quantidade_restante: 0, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/adiantamentos-diarias]', err);
    return NextResponse.json({ error: 'Erro ao cancelar adiantamento.' }, { status: 500 });
  }
}
