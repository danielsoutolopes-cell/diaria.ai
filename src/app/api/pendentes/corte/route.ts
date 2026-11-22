import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

function getOntemBrasiliaISO(): string {
  const agoraBrasilia = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  agoraBrasilia.setDate(agoraBrasilia.getDate() - 1);
  const yyyy = agoraBrasilia.getFullYear();
  const mm = String(agoraBrasilia.getMonth() + 1).padStart(2, '0');
  const dd = String(agoraBrasilia.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface CorteRequestBody {
  dataCorte?: string;
  dataHoraCorte?: string;
  usuarioLogado?: string;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;
    let body: CorteRequestBody = {};
    try {
      body = (await req.json()) as CorteRequestBody;
    } catch {
      body = {};
    }

    const dataHoraCorte = body.dataHoraCorte || null;
    const dataCorte =
      body.dataCorte ||
      (dataHoraCorte ? dataHoraCorte.slice(0, 10) : getOntemBrasiliaISO());
    const usuarioLogado = body.usuarioLogado || 'Corte Rígido V15 (Sistema)';
    const agoraISO = new Date().toISOString();

    // 1. Marcar todos os lotes pendentes até o ponto de corte como VALIDADO
    let queryLotes = supabaseAdmin
      .from('ponto_lote')
      .update({
        status_validacao: 'VALIDADO',
        validado_por: usuarioLogado,
        validado_em: agoraISO,
      })
      .eq('tenant_id', tenantId)
      .eq('status_validacao', 'PENDENTE');

    queryLotes = dataHoraCorte
      ? queryLotes.lte('created_at', dataHoraCorte)
      : queryLotes.lte('data_referencia', dataCorte);

    const { data: lotesAtualizados, error: errLotes } =
      await queryLotes.select('id');

    if (errLotes) {
      console.error('Erro ao aplicar corte em ponto_lote:', errLotes);
      return NextResponse.json(
        { error: 'Falha ao atualizar lotes pendentes.' },
        { status: 500 }
      );
    }

    // 2. Marcar todos os lançamentos financeiros pendentes até o ponto de corte como VALIDADO
    let queryLancs = supabaseAdmin
      .from('lancamentos_financeiros')
      .update({
        status: 'VALIDADO',
      })
      .eq('tenant_id', tenantId)
      .eq('status', 'PENDENTE');

    queryLancs = dataHoraCorte
      ? queryLancs.lte('created_at', dataHoraCorte)
      : queryLancs.lte('data_referencia', dataCorte);

    const { data: lancsAtualizados, error: errLancs } =
      await queryLancs.select('id');

    if (errLancs) {
      console.error('Erro ao aplicar corte em lancamentos_financeiros:', errLancs);
      return NextResponse.json(
        { error: 'Falha ao atualizar lançamentos pendentes.' },
        { status: 500 }
      );
    }

    // 3. Persistir data_corte_operacional e data_hora_corte_rigido em parametros_sistema
    const { data: paramAtual } = await supabaseAdmin
      .from('parametros_sistema')
      .select('id, configuracoes')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const novasConfigs: Record<string, unknown> = {
      ...((paramAtual?.configuracoes as Record<string, unknown> | null) || {}),
      data_corte_operacional: dataCorte,
      ...(dataHoraCorte ? { data_hora_corte_rigido: dataHoraCorte } : {}),
      corte_aplicado_em: agoraISO,
      corte_aplicado_por: usuarioLogado,
    };

    if (paramAtual?.id) {
      await supabaseAdmin
        .from('parametros_sistema')
        .update({ configuracoes: novasConfigs })
        .eq('id', paramAtual.id);
    } else {
      await supabaseAdmin.from('parametros_sistema').insert({
        tenant_id: tenantId,
        configuracoes: novasConfigs,
      });
    }

    return NextResponse.json({
      success: true,
      dataCorte,
      dataHoraCorte,
      lotesValidados: lotesAtualizados?.length || 0,
      lancamentosValidados: lancsAtualizados?.length || 0,
      message: `Ponto de corte aplicado até ${dataHoraCorte || dataCorte}. Registros anteriores marcados como VALIDADO.`,
    });
  } catch (error) {
    console.error('Erro em POST /api/pendentes/corte:', error);
    return NextResponse.json(
      { error: 'Erro interno ao aplicar ponto de corte.' },
      { status: 500 }
    );
  }
}
