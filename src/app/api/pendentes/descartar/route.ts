import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

interface DescartarRequestBody {
  modo: 'ITEM' | 'LOTE' | 'RESTAURAR';
  loteId?: string;
  detalheId?: string;
  lancamentoId?: string;
  trabalhador?: string;
  motivo?: string;
  usuarioLogado?: string;
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { data: descartados } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select('id, nome_trabalhador, fracao_dia, data_referencia, observacao, ponto_lote_id, created_at, obras_config ( nome )')
      .eq('tenant_id', activeTenant.id)
      .eq('status', 'DESCARTADO')
      .order('created_at', { ascending: false })
      .limit(40);

    return NextResponse.json({ descartados: descartados || [] });
  } catch (error) {
    console.error('Erro em GET /api/pendentes/descartar:', error);
    return NextResponse.json({ descartados: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;
    const body = (await req.json()) as DescartarRequestBody;
    const {
      modo,
      loteId,
      detalheId,
      lancamentoId,
      trabalhador,
      motivo = 'Excluído na conferência de validação',
      usuarioLogado = 'Patrícia Grubel',
    } = body;

    if (!modo || (modo !== 'ITEM' && modo !== 'LOTE' && modo !== 'RESTAURAR')) {
      return NextResponse.json(
        { error: 'Modo inválido. Use ITEM, LOTE ou RESTAURAR.' },
        { status: 400 }
      );
    }

    // MODO RESTAURAR: devolve um lançamento descartado para PENDENTE
    if (modo === 'RESTAURAR' && lancamentoId) {
      await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({ status: 'PENDENTE' })
        .eq('tenant_id', tenantId)
        .eq('id', lancamentoId);

      if (loteId && !loteId.startsWith('vale-')) {
        await supabaseAdmin
          .from('ponto_lote')
          .update({ status_validacao: 'PENDENTE' })
          .eq('tenant_id', tenantId)
          .eq('id', loteId);
      }

      return NextResponse.json({
        success: true,
        modo: 'RESTAURAR',
        message: 'Registro restaurado para a fila de validação!',
      });
    }

    const agoraISO = new Date().toISOString();
    const agoraBR = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
    const tagDescarte = `[DESCARTADO por ${usuarioLogado} em ${agoraBR}: ${motivo}]`;

    // MODO LOTE: descarta a mensagem inteira (soft delete)
    if (modo === 'LOTE') {
      if (!loteId) {
        return NextResponse.json(
          { error: 'loteId é obrigatório para descartar uma mensagem.' },
          { status: 400 }
        );
      }

      // Caso seja um vale avulso sem ponto_lote real
      if (loteId.startsWith('vale-')) {
        const idLanc = lancamentoId || loteId.replace('vale-', '');
        await supabaseAdmin
          .from('lancamentos_financeiros')
          .update({
            status: 'DESCARTADO',
            observacao: tagDescarte,
          })
          .eq('tenant_id', tenantId)
          .eq('id', idLanc);

        return NextResponse.json({
          success: true,
          modo: 'LOTE',
          loteId,
          message: 'Registro de vale descartado com sucesso.',
        });
      }

      // Soft delete no ponto_lote
      await supabaseAdmin
        .from('ponto_lote')
        .update({
          status_validacao: 'DESCARTADO',
          validado_por: `${usuarioLogado} (Descartado)`,
          validado_em: agoraISO,
        })
        .eq('tenant_id', tenantId)
        .eq('id', loteId);

      // Soft delete em todos os lançamentos pendentes daquele lote
      await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({
          status: 'DESCARTADO',
          observacao: tagDescarte,
        })
        .eq('tenant_id', tenantId)
        .eq('ponto_lote_id', loteId)
        .eq('status', 'PENDENTE');

      return NextResponse.json({
        success: true,
        modo: 'LOTE',
        loteId,
        message: 'Mensagem inteira descartada da fila de validação.',
      });
    }

    // MODO ITEM: exclui apenas 1 registro (ponto ou vale) dentro da mensagem
    if (detalheId && !detalheId.startsWith('vale-')) {
      await supabaseAdmin
        .from('ponto_detalhe')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', detalheId);
    }

    if (lancamentoId) {
      await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({
          status: 'DESCARTADO',
          observacao: tagDescarte,
        })
        .eq('tenant_id', tenantId)
        .eq('id', lancamentoId);
    } else if (loteId && !loteId.startsWith('vale-') && trabalhador) {
      // Fallback: localizar lançamento pendente do trabalhador neste lote
      await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({
          status: 'DESCARTADO',
          observacao: tagDescarte,
        })
        .eq('tenant_id', tenantId)
        .eq('ponto_lote_id', loteId)
        .eq('status', 'PENDENTE')
        .ilike('nome_trabalhador', trabalhador);
    }

    // Verificar se o lote ficou completamente vazio após remover este item
    let loteDescartadoAutomaticamente = false;
    if (loteId && !loteId.startsWith('vale-')) {
      const { count: detalhesRestantes } = await supabaseAdmin
        .from('ponto_detalhe')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('ponto_lote_id', loteId);

      const { count: valesRestantes } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('ponto_lote_id', loteId)
        .eq('tipo_lancamento', 'VALE')
        .eq('status', 'PENDENTE');

      if ((detalhesRestantes || 0) === 0 && (valesRestantes || 0) === 0) {
        await supabaseAdmin
          .from('ponto_lote')
          .update({
            status_validacao: 'DESCARTADO',
            validado_por: `${usuarioLogado} (Descartado)`,
            validado_em: agoraISO,
          })
          .eq('tenant_id', tenantId)
          .eq('id', loteId);
        loteDescartadoAutomaticamente = true;
      }
    }

    return NextResponse.json({
      success: true,
      modo: 'ITEM',
      detalheId,
      lancamentoId,
      loteDescartadoAutomaticamente,
      message: 'Registro excluído da validação com sucesso.',
    });
  } catch (error) {
    console.error('Erro em POST /api/pendentes/descartar:', error);
    return NextResponse.json(
      { error: 'Erro interno ao descartar registro.' },
      { status: 500 }
    );
  }
}
