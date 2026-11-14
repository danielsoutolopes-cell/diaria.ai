import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lancamentosIds, obraId, observacao = 'Fechamento semanal encerrado' } = body;

    if (!lancamentosIds || !Array.isArray(lancamentosIds) || lancamentosIds.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum lançamento selecionado para liquidação.' },
        { status: 400 }
      );
    }

    const agora = new Date().toISOString();

    // Faz o UPDATE no banco para LIQUIDADO apenas nos itens marcados
    const { error } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .update({
        status: 'LIQUIDADO',
        liquidado_em: agora,
        observacao: observacao,
        updated_at: agora,
      })
      .in('id', lancamentosIds);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: `${lancamentosIds.length} lançamento(s) liquidado(s) com sucesso!`,
      liquidadoEm: agora,
      quantidadeLiquidada: lancamentosIds.length,
    });
  } catch (error) {
    console.error('Erro ao liquidar lançamentos:', error);
    return NextResponse.json(
      { error: 'Falha ao processar liquidação da semana.' },
      { status: 500 }
    );
  }
}

