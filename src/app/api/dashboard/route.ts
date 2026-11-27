import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;

    // 1. Obras ativas
    const { data: obras } = await supabaseAdmin
      .from('obras_config')
      .select('id, nome, local, tipo_obra')
      .eq('tenant_id', tenantId)
      .eq('ativo', true);

    // 2. Lotes pendentes + Vales avulsos pendentes (alinhado 1:1 com /api/pendentes)
    const { data: lotesList } = await supabaseAdmin
      .from('ponto_lote')
      .select('id, status_validacao')
      .eq('tenant_id', tenantId)
      .eq('status_validacao', 'PENDENTE');

    const { data: valesPendentesList } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select('id, ponto_lote_id')
      .eq('tenant_id', tenantId)
      .eq('tipo_lancamento', 'VALE')
      .eq('status', 'PENDENTE');

    const lotesPendentesIds = new Set((lotesList || []).map((l) => l.id));
    const valesAvulsosPendentes = (valesPendentesList || []).filter(
      (v) => !v.ponto_lote_id || !lotesPendentesIds.has(v.ponto_lote_id)
    ).length;

    const lotesPendentes = lotesPendentesIds.size + valesAvulsosPendentes;

    // 3. Lançamentos validados para fechamento semanal
    const { data: lancamentosValidados } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select('id, valor_monetario, tipo_lancamento')
      .eq('tenant_id', tenantId)
      .eq('status', 'VALIDADO');

    // 4. Vales da semana (ignorando liquidados e descartados)
    const { data: valesSemana } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select('valor_monetario')
      .eq('tenant_id', tenantId)
      .eq('tipo_lancamento', 'VALE')
      .neq('status', 'LIQUIDADO')
      .neq('status', 'DESCARTADO');

    // 5. Total de operários cadastrados
    const { count: totalOperariosCount, data: operariosList } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('id', { count: 'exact' })
      .eq('tenant_id', tenantId)
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

    // 4. Clima ao vivo via OpenWeather (São Paulo / BR)
    let climaAtual: { descricao: string; tempC: number | null; cidade: string } = {
      descricao: 'Indisponível',
      tempC: null,
      cidade: 'São Paulo',
    };
    const owKey = (process.env.OPENWEATHER_API_KEY || '').trim();
    if (owKey) {
      try {
        const resClima = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=Sao%20Paulo,BR&units=metric&lang=pt_br&appid=${encodeURIComponent(owKey)}`,
          { cache: 'no-store' }
        );
        if (resClima.ok) {
          const cw = (await resClima.json()) as {
            weather?: Array<{ description?: string }>;
            main?: { temp?: number };
            name?: string;
          };
          const descRaw = cw.weather?.[0]?.description || 'Sem dados';
          climaAtual = {
            descricao: descRaw.charAt(0).toUpperCase() + descRaw.slice(1),
            tempC: typeof cw.main?.temp === 'number' ? Math.round(cw.main.temp) : null,
            cidade: cw.name || 'São Paulo',
          };
        }
      } catch {
        // fallback silencioso
      }
    }

    return NextResponse.json({
      obrasAtivas: obras?.length || 0,
      obrasLista: obras || [],
      lotesPendentes: lotesPendentes,
      totalOperarios: totalOperarios,
      totalVales,
      saldoLiquidoSemana,
      climaAtual,
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

