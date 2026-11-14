import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // 1. Obras ativas
    const { data: obras, error: errObras } = await supabaseAdmin
      .from('obras_config')
      .select('id, nome, local, tipo_obra')
      .eq('ativo', true);

    // 2. Lotes pendentes de validação
    const { data: lotesPendentes, error: errLotes } = await supabaseAdmin
      .from('ponto_lote')
      .select('id')
      .eq('status_validacao', 'PENDENTE');

    // 3. Lançamentos validados para fechamento semanal
    const { data: lancamentosValidados, error: errLanc } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select('id, valor_monetario, tipo_lancamento')
      .eq('status', 'VALIDADO');

    // 4. Vales da semana
    const { data: valesSemana } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select('valor_monetario')
      .eq('tipo_lancamento', 'VALE')
      .neq('status', 'LIQUIDADO');

    // 5. Total de operários cadastrados
    const { count: totalOperarios } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('id', { count: 'exact', head: true })
      .eq('ativo', true);

    const totalVales = (valesSemana || []).reduce((acc, curr) => acc + (Number(curr.valor_monetario) || 0), 0);
    
    // Cálculo do saldo consolidado
    const totalBruto = (lancamentosValidados || [])
      .filter((l) => l.tipo_lancamento === 'PONTO')
      .reduce((acc, curr) => acc + (Number(curr.valor_monetario) || 0), 0);
    
    const totalValesValidados = (lancamentosValidados || [])
      .filter((l) => l.tipo_lancamento === 'VALE')
      .reduce((acc, curr) => acc + (Number(curr.valor_monetario) || 0), 0);

    const saldoLiquidoSemana = Math.max(0, totalBruto - totalValesValidados);

    return NextResponse.json({
      obrasAtivas: obras?.length || 0,
      obrasLista: obras || [],
      lotesPendentes: lotesPendentes?.length || 0,
      totalOperarios: totalOperarios || 0,
      totalVales,
      saldoLiquidoSemana,
    });
  } catch (error) {
    console.error('Erro no endpoint dashboard:', error);
    return NextResponse.json({
      obrasAtivas: 0,
      obrasLista: [],
      lotesPendentes: 0,
      totalOperarios: 0,
      totalVales: 0,
      saldoLiquidoSemana: 0,
    });
  }
}

