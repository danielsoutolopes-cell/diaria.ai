import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obras ativas
    const { data: obras, error: errObras } = await supabaseAdmin
      .from('obras_config')
      .select('id, nome, local, tipo_obra')
      .eq('ativo', true);

    // 2. Lotes pendentes de validação
    const { data: lotesList, error: errLotes } = await supabaseAdmin
      .from('ponto_lote')
      .select('id, status_validacao');

    const lotesPendentes = (lotesList || []).filter(l => l.status_validacao === 'PENDENTE').length;
    console.log('[API-DASHBOARD] lotesList raw:', lotesList?.length, 'Pendentes filtrados:', lotesPendentes, 'Error:', errLotes);

    // 3. Lançamentos validados para fechamento semanal
    const { data: lancamentosValidados } = await supabaseAdmin
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
    const { count: totalOperariosCount, data: operariosList } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('id', { count: 'exact' })
      .eq('ativo', true);

    const totalOperarios = totalOperariosCount !== null && totalOperariosCount !== undefined 
      ? totalOperariosCount 
      : (operariosList?.length || 0);

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
      lotesPendentes: lotesPendentes,
      totalOperarios: totalOperarios,
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

