import { NextRequest, NextResponse } from 'next/server';
import { extrairDadosMensagem } from '@/lib/gemini';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mensagem, tenantId = '00000000-0000-0000-0000-000000000001' } = body;

    if (!mensagem || typeof mensagem !== 'string') {
      return NextResponse.json({ error: 'Mensagem inválida ou ausente.' }, { status: 400 });
    }

    const extracao = await extrairDadosMensagem(mensagem);

    // Opcionalmente grava histórico de apontamento preliminar
    return NextResponse.json({
      success: true,
      mensagemOriginal: mensagem,
      extracao,
      tenantId,
    });
  } catch (error) {
    console.error('Erro no endpoint NLP:', error);
    return NextResponse.json(
      { error: 'Falha ao processar texto com Gemini AI.' },
      { status: 500 }
    );
  }
}
