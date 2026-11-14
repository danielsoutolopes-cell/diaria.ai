import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { deleteFromR2ByUrl } from '@/services/r2Storage';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lancamentoId } = body;

    if (!lancamentoId) {
      return NextResponse.json({ error: 'ID do lançamento é obrigatório.' }, { status: 400 });
    }

    // 1. Buscar o registro para verificar se há comprovante anexado
    const { data: lancamento, error: fetchErr } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select('id, comprovante_url, nome_trabalhador')
      .eq('id', lancamentoId)
      .single();

    if (fetchErr || !lancamento) {
      return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 });
    }

    let r2Excluido = false;

    // 2. Se houver comprovante_url, apaga fisicamente do Cloudflare R2
    if (lancamento.comprovante_url) {
      const delResult = await deleteFromR2ByUrl(lancamento.comprovante_url);
      r2Excluido = delResult.success;
      if (!delResult.success) {
        console.warn(`Aviso: falha ao apagar mídia do R2: ${delResult.error}`);
      }
    }

    // 3. Excluir o lançamento no Supabase
    const { error: deleteErr } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .delete()
      .eq('id', lancamentoId);

    if (deleteErr) {
      throw deleteErr;
    }

    return NextResponse.json({
      success: true,
      message: 'Lançamento excluído com sucesso e mídia física limpa do Cloudflare R2.',
      r2Excluido,
    });
  } catch (error: any) {
    console.error('Erro ao excluir lançamento e mídia R2:', error);
    return NextResponse.json(
      { error: error?.message || 'Falha ao processar exclusão do lançamento.' },
      { status: 500 }
    );
  }
}

