import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extrairDadosMensagem } from '@/lib/gemini';
import { getActiveTenantFromRequest } from '@/lib/tenant';

interface NlpRequestBody {
  mensagem?: string;
  tenantId?: string;
  imagemBase64?: string;
  imagemMimeType?: string;
}

async function transcreverImagemOmnichannel(
  imagemBase64: string,
  mimeType: string,
  legenda?: string
): Promise<string> {
  const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^"|"$/g, '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada para leitura de imagem.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  });
  const cleanBase64 = imagemBase64.replace(/^data:[^;]+;base64,/, '');
  const prompt = `Você é o leitor multimodal do Omnichannel diaria.ai.
Extraia TODO o conteúdo útil desta imagem (print de WhatsApp com lista de ponto ou pedidos de vale, comprovante de PIX/Nubank, cupom fiscal ou lista escrita à mão) em texto limpo em português, preservando datas, nomes exatos, obras, valores em R$ e se é DIÁRIA ou VALE.
Retorne APENAS o texto extraído, sem comentários extras.`;

  const res = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType || 'image/jpeg',
      },
    },
  ]);
  const textoImagem = res.response.text().trim();
  return legenda ? `${legenda}\n\n[Conteúdo da imagem]:\n${textoImagem}` : textoImagem;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as NlpRequestBody;
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = body.tenantId || activeTenant.id;
    let mensagem = (body.mensagem || '').trim();

    if (body.imagemBase64) {
      mensagem = await transcreverImagemOmnichannel(
        body.imagemBase64,
        body.imagemMimeType || 'image/jpeg',
        mensagem || undefined
      );
    }

    if (!mensagem) {
      return NextResponse.json(
        { error: 'Envie um texto ou uma imagem para processar.' },
        { status: 400 }
      );
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
      { error: 'Falha ao processar mensagem/imagem com Gemini AI.' },
      { status: 500 }
    );
  }
}

