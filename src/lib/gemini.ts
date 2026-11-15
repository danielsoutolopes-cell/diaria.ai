import { GoogleGenerativeAI } from '@google/generative-ai';
import { NLPExtracaoResponse } from '@/types/database';

const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^"|"$/g, '');
const genAI = new GoogleGenerativeAI(apiKey);

const SYSTEM_INSTRUCTION = `
Você é o assistente de Inteligência Artificial do sistema Ponto Patrícia (Diária.AI), especializado em extração multi-contexto de mensagens operacionais informais de canteiro de obras e construção de piscinas.

SEU OBJETIVO:
Ler mensagens em linguagem natural (enviadas por encarregados ou digitadas no terminal) e extrair com máxima precisão:
1. As obras mencionadas (ex: Bahia, Jabaquara, Alphaville, etc.). Se não houver nome específico de obra, atribua "GERAL".
2. Os apontamentos de presença de cada trabalhador, identificando a fração e a regra de diária:
   - Dia normal / integral de trabalho = fracao: 1.0 (motivo: "NORMAL")
   - Meio período / trabalhou de manhã / dispensado mais cedo = fracao: 0.5 (motivo: "MEIO_PERIODO")
   - Dia de chuva (obra paralisada por chuva) = fracao: 1.0, motivo: "CHUVA" (Gera diária especial de chuva: R$ 120,00)
   - Dia parado (quando o condomínio não liberou acesso, portaria travada ou material não entregue) = fracao: 1.0, motivo: "PARADO" (Gera diária especial de dia parado: R$ 120,00)
   - Dia de viagem (deslocamento entre cidades/estados da equipe):
     * Se for o MOTORISTA (ou indicado como motorista/quem dirigiu) = fracao: 1.0, motivo: "VIAGEM_MOTORISTA" (diária integral)
     * Para os demais passageiros/trabalhadores da equipe em trânsito = fracao: 1.0, motivo: "VIAGEM_PASSAGEIRO" (diária especial de viagem: R$ 12,00)
   - Falta injustificada ou atestado sem remuneração = fracao: 0.0 (motivo: "FALTA")
3. Vales e adiantamentos financeiros concedidos a cada trabalhador (ex: "dei 50 de vale pra cada", "adiantou 100 pro José").
4. A flag "setup": true caso a mensagem seja uma ordem de alocação/cadastro inicial de equipe (ex: "Obra Bahia, aloca o José e o Pedro lá com diária de...").

REGRAS RÍGIDAS:
- Realize 'Extração Multi-Contexto': se a mensagem misturar pessoas de obras diferentes (ex: "Na Bahia trabalhou Pedro e José com vale de 50. Em Jabaquara Miguel trabalhou meio dia"), separe em objetos distintos dentro do array "obras".
- RETORNE ESTRITAMENTE um JSON válido SEM formatação markdown (\`\`\`json ou \`\`\`), SEM explicações adicionais, correspondendo exatamente a este formato:
{
  "obras": [
    {
      "nome_obra": "string",
      "apontamentos": [
        {
          "nome": "string",
          "fracao": 1.0,
          "motivo": "string"
        }
      ],
      "vales": [
        {
          "nome": "string",
          "valor": 0.0
        }
      ],
      "setup": false
    }
  ]
}
`;

export async function extrairDadosMensagem(textoMensagem: string): Promise<NLPExtracaoResponse> {
  if (!textoMensagem || !textoMensagem.trim()) {
    return { obras: [] };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const result = await model.generateContent(textoMensagem);
    const responseText = result.response.text().trim();

    // Limpar possíveis delimitadores markdown residuais
    const jsonClean = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed: NLPExtracaoResponse = JSON.parse(jsonClean);
    return parsed;
  } catch (error) {
    console.error('Erro na extração NLP via Gemini:', error);
    // Fallback defensivo estruturado
    return {
      obras: [
        {
          nome_obra: 'GERAL',
          apontamentos: [],
          vales: [],
          setup: false,
        },
      ],
    };
  }
}

