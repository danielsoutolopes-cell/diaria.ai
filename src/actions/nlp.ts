'use server';

import { extrairDadosMensagem } from '@/lib/gemini';
import { NLPExtracaoResponse } from '@/types/database';

export interface ActionResult {
  success: boolean;
  extracao?: NLPExtracaoResponse;
  error?: string;
}

export async function processarMensagemNLP(mensagem: string): Promise<ActionResult> {
  if (!mensagem || !mensagem.trim()) {
    return { success: false, error: 'A mensagem não pode estar vazia.' };
  }

  try {
    const extracao = await extrairDadosMensagem(mensagem.trim());
    return {
      success: true,
      extracao,
    };
  } catch (error) {
    console.error('Erro na Server Action processarMensagemNLP:', error);
    return {
      success: false,
      error: 'Falha ao processar mensagem com Gemini 1.5 Flash.',
    };
  }
}
