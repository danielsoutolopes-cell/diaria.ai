/**
 * Chamada REST nativa ao Google Gemini (gemini-2.5-flash) usando `fetch`.
 * 100% compatível com Cloudflare Workers (Edge), Node.js e leitura nativa de PDFs/Imagens.
 */

export interface GeminiInlineData {
  data: string;
  mimeType: string;
}

export async function chamarGeminiRest(params: {
  apiKey: string;
  prompt: string;
  inlineData?: GeminiInlineData;
  jsonMode?: boolean;
  model?: string;
}): Promise<string> {
  const cleanKey = params.apiKey.trim().replace(/^"|"$/g, '');
  const rawModel = (params.model || '').trim();
  const safeModel =
    !rawModel || rawModel.includes('3.5-flash-lite')
      ? 'gemini-2.5-flash'
      : rawModel;

  const parts: Array<Record<string, unknown>> = [{ text: params.prompt }];
  if (params.inlineData) {
    parts.push({
      inlineData: {
        mimeType: params.inlineData.mimeType,
        data: params.inlineData.data,
      },
    });
  }

  const body: Record<string, unknown> = {
    contents: [{ parts }],
  };
  if (params.jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    safeModel
  )}:generateContent?key=${encodeURIComponent(cleanKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    throw new Error('Gemini retornou resposta vazia.');
  }
  return text;
}
