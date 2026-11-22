import { NextRequest, NextResponse } from 'next/server';
import { extrairDadosMensagem } from '@/lib/gemini';
import { getActiveTenantFromRequest } from '@/lib/tenant';

interface NlpRequestBody {
  mensagem?: string;
  tenantId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as NlpRequestBody;
    const activeTenant = getActiveTenantFromRequest(req);
    const mensagem = body.mensagem;
    const tenantId = body.tenantId || activeTenant.id;

    if (!mensagem || typeof mensagem !== 'string') {
      return NextResponse.json({ error: 'Mensagem inválida ou ausente.' }, { status: 400 });
    }

    const extracao = await extrairDadosMensagem(mensagem, tenantId);

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

