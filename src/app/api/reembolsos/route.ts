import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

// GET: Listar todos os reembolsos isolados por tenant_id
export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query = supabaseAdmin
      .from('pedidos_reembolso')
      .select('*, pagamentos_reembolso(*)')
      .eq('tenant_id', activeTenant.id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Tabela de reembolsos ainda pendente de migration no Supabase:', error.message);
      return NextResponse.json({ success: true, reembolsos: [] });
    }

    return NextResponse.json({ success: true, reembolsos: data || [] });
  } catch (err) {
    console.error('Erro no GET de reembolsos:', err);
    return NextResponse.json({ error: 'Falha ao buscar reembolsos.' }, { status: 500 });
  }
}

// POST: Ações operacionais da Patrícia (Aprovar, Recusar, Registrar Pagamento Parcial/Total)
export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = await req.json();
    const { action, reembolsoId, valorAprovado, valorPago, formaPagamento, observacao, motivoRecusa, registradoPor = 'PATRICIA' } = body;

    if (!reembolsoId) {
      return NextResponse.json({ error: 'reembolsoId é obrigatório.' }, { status: 400 });
    }

    // 1. APROVAÇÃO PELA PATRÍCIA (isolada por tenant_id)
    if (action === 'aprovar') {
      const valor = Number(valorAprovado);
      if (isNaN(valor) || valor <= 0) {
        return NextResponse.json({ error: 'Informe um valor aprovado válido.' }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from('pedidos_reembolso')
        .update({
          valor_aprovado: valor,
          status: 'APROVADO',
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', activeTenant.id)
        .eq('id', reembolsoId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, reembolso: data, message: 'Reembolso aprovado com sucesso.' });
    }

    // 2. RECUSA PELA PATRÍCIA (isolada por tenant_id)
    if (action === 'recusar') {
      const { data, error } = await supabaseAdmin
        .from('pedidos_reembolso')
        .update({
          status: 'RECUSADO',
          motivo_recusa: motivoRecusa || 'Despesa não aprovada pela administração.',
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', activeTenant.id)
        .eq('id', reembolsoId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, reembolso: data, message: 'Reembolso recusado.' });
    }

    // 3. REGISTRAR PAGAMENTO (PARCIAL OU TOTAL EM DATA LIVRE, isolado por tenant_id)
    if (action === 'pagar') {
      const pago = Number(valorPago);
      if (isNaN(pago) || pago <= 0) {
        return NextResponse.json({ error: 'Informe um valor pago válido.' }, { status: 400 });
      }

      // Buscar estado atual do reembolso pertencente ao tenant ativo
      const { data: atual, error: erroAtual } = await supabaseAdmin
        .from('pedidos_reembolso')
        .select('valor_aprovado, valor_pago, tenant_id')
        .eq('tenant_id', activeTenant.id)
        .eq('id', reembolsoId)
        .single();

      if (erroAtual || !atual) {
        return NextResponse.json({ error: 'Reembolso não encontrado.' }, { status: 404 });
      }

      const novoValorPago = Number((Number(atual.valor_pago || 0) + pago).toFixed(2));
      const valorAprovadoFinal = Number(atual.valor_aprovado || 0);
      const novoStatus = novoValorPago >= valorAprovadoFinal ? 'LIQUIDADO' : 'PAGO_PARCIAL';

      await supabaseAdmin.from('pagamentos_reembolso').insert({
        tenant_id: activeTenant.id,
        reembolso_id: reembolsoId,
        valor_pago: pago,
        forma_pagamento: formaPagamento || 'PIX',
        registrado_por: registradoPor,
        observacao: observacao || null,
        data_pagamento: new Date().toISOString().split('T')[0],
      });

      const { data: reembolsoAtualizado, error: erroUp } = await supabaseAdmin
        .from('pedidos_reembolso')
        .update({
          valor_pago: novoValorPago,
          status: novoStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', activeTenant.id)
        .eq('id', reembolsoId)
        .select()
        .single();

      if (erroUp) throw erroUp;

      return NextResponse.json({
        success: true,
        reembolso: reembolsoAtualizado,
        message: novoStatus === 'LIQUIDADO' ? 'Reembolso totalmente liquidado!' : `Pagamento parcial de R$ ${pago.toFixed(2)} registrado com sucesso!`,
      });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno.';
    console.error('Erro na ação de reembolso:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
