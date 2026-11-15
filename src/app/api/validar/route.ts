import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { loteId, token, ajustes } = body;
    // ajustes: Array<{ detalheId?: string; lancamentoId?: string; fracao_dia: number; valor_diaria?: number }>

    if (!loteId && !token) {
      return NextResponse.json({ error: 'Identificador do lote ou token é obrigatório.' }, { status: 400 });
    }

    // 1. Localizar lote
    let query = supabaseAdmin.from('ponto_lote').select('*');
    if (token) {
      query = query.eq('token_aprovacao', token);
    } else {
      query = query.eq('id', loteId);
    }

    const { data: lote, error: errLote } = await query.single();
    if (errLote || !lote) {
      return NextResponse.json({ error: 'Lote não encontrado.' }, { status: 404 });
    }

    // 2. Atualizar frações ajustadas pela Patrícia
    if (ajustes && Array.isArray(ajustes)) {
      for (const item of ajustes) {
        if (item.detalheId) {
          await supabaseAdmin
            .from('ponto_detalhe')
            .update({ fracao_dia: item.fracao_dia })
            .eq('id', item.detalheId);
        }
        if (item.lancamentoId) {
          await supabaseAdmin
            .from('lancamentos_financeiros')
            .update({
              fracao_dia: item.fracao_dia,
              valor_monetario: (item.valor_diaria || 150) * item.fracao_dia,
              status: 'VALIDADO',
            })
            .eq('id', item.lancamentoId);
        }
      }
    }

    // 3. Atualizar status de todos os lançamentos financeiros vinculados ao lote
    await supabaseAdmin
      .from('lancamentos_financeiros')
      .update({ status: 'VALIDADO' })
      .eq('ponto_lote_id', lote.id);

    // 4. Marcar lote como validado
    await supabaseAdmin
      .from('ponto_lote')
      .update({
        status_validacao: 'VALIDADO',
        validado_por: 'Patrícia Grubel & Daniel Lopes',
        validado_em: new Date().toISOString(),
      })
      .eq('id', lote.id);

    return NextResponse.json({
      success: true,
      message: 'Ponto validado com sucesso! Folha atualizada.',
      loteId: lote.id,
      status: 'VALIDADO',
      notificacaoDuplicada: {
        enviadoPara: [
          { nome: 'Patrícia Grubel', telefone: '5511978543369' },
          { nome: 'Daniel Lopes', telefone: '5511913192703' },
        ],
        aviso: 'Lote aprovado e disponibilizado para liquidação no Borderô.',
      },
    });
  } catch (error) {
    console.error('Erro ao validar ponto:', error);
    return NextResponse.json({ error: 'Falha ao validar ponto.' }, { status: 500 });
  }
}

