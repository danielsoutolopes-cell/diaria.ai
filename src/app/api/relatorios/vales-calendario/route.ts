import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';
import type { MovimentoCaixaCampo } from '@/app/api/caixa-campo/route';

export const dynamic = 'force-dynamic';

export interface EventoCalendarioFinanceiro {
  id: string;
  dia: number;
  categoria: 'VALE' | 'PIX_CAIXA' | 'NOTA_CAMPO';
  rotulo: string;
  valor: number;
  obra: string;
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const mes = searchParams.get('mes') || new Date().toISOString().slice(0, 7);

    const [anoStr, mesStr] = mes.split('-');
    const diasNoMes = new Date(Number(anoStr), Number(mesStr), 0).getDate();
    const dataInicio = `${mes}-01`;
    const dataFim = `${mes}-${String(diasNoMes).padStart(2, '0')}`;

    // 1. Vales do mês (isolados por tenant_id, ignorando DESCARTADO)
    const { data: vales } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select('id, nome_trabalhador, valor_monetario, data_referencia, obras_config ( nome )')
      .eq('tenant_id', activeTenant.id)
      .eq('tipo_lancamento', 'VALE')
      .neq('status', 'DESCARTADO')
      .gte('data_referencia', dataInicio)
      .lte('data_referencia', dataFim);

    const eventos: EventoCalendarioFinanceiro[] = [];
    let totalVales = 0;
    let totalPixCaixa = 0;
    let totalNotasCampo = 0;

    for (const v of vales || []) {
      const dia = Number(String(v.data_referencia).split('-')[2]);
      const valor = Number(v.valor_monetario || 0);
      totalVales += valor;
      const obraNome =
        (v as unknown as { obras_config?: { nome?: string | null } | null })
          .obras_config?.nome || 'PORTO SEGURO';
      eventos.push({
        id: String(v.id),
        dia,
        categoria: 'VALE',
        rotulo: normalizarNomeTrabalhadorCanonico(v.nome_trabalhador),
        valor,
        obra: obraNome,
      });
    }

    // 2. Movimentos de Caixa de Campo & Reembolsos do mês
    const { data: paramData } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', activeTenant.id)
      .maybeSingle();

    const configs = (paramData?.configuracoes || {}) as Record<string, unknown>;
    const movs = Array.isArray(configs.caixa_campo_movimentos)
      ? (configs.caixa_campo_movimentos as MovimentoCaixaCampo[])
      : [];

    for (const m of movs) {
      if (!m.data || !m.data.startsWith(mes)) continue;
      const dia = Number(String(m.data).split('-')[2]);
      const valor = Number(m.valor || 0);
      if (m.tipo === 'ENTRADA_PIX') {
        totalPixCaixa += valor;
        eventos.push({
          id: m.id,
          dia,
          categoria: 'PIX_CAIXA',
          rotulo: `PIX ${m.encarregado.split(' ')[0]}`,
          valor,
          obra: m.obra,
        });
      } else if (m.tipo === 'NOTA_DESPESA') {
        totalNotasCampo += valor;
        eventos.push({
          id: m.id,
          dia,
          categoria: 'NOTA_CAMPO',
          rotulo: m.categoria || 'Nota',
          valor,
          obra: m.obra,
        });
      }
    }

    return NextResponse.json({
      mes,
      diasNoMes,
      totalVales,
      totalPixCaixa,
      totalNotasCampo,
      saldoCampoEmMaos: Number((totalPixCaixa - totalNotasCampo).toFixed(2)),
      eventos,
    });
  } catch (error) {
    console.error('Erro em GET /api/relatorios/vales-calendario:', error);
    return NextResponse.json(
      {
        mes: '',
        diasNoMes: 30,
        totalVales: 0,
        totalPixCaixa: 0,
        totalNotasCampo: 0,
        saldoCampoEmMaos: 0,
        eventos: [],
      },
      { status: 500 }
    );
  }
}
