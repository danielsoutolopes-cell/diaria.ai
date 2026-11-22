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
   - Meio período / trabalhou de manhã / "Meio dia" / dispensado mais cedo = fracao: 0.5 (motivo: "MEIO_PERIODO")
   - Dia de chuva (obra paralisada por chuva, "Diárias de chuva") = fracao: 1.0, motivo: "CHUVA" (Gera diária especial de chuva: R$ 120,00)
   - Dia parado (quando o condomínio não liberou acesso, portaria travada ou material não entregue) = fracao: 1.0, motivo: "PARADO" (Gera diária especial de dia parado: R$ 120,00)
   - Dia de viagem (deslocamento entre cidades/estados da equipe, "Viagem Bahia", etc.):
     * Se for o MOTORISTA (ou indicado como motorista/quem dirigiu) = fracao: 1.0, motivo: "VIAGEM_MOTORISTA" (diária integral)
     * Para os demais passageiros/trabalhadores da equipe em trânsito = fracao: 1.0, motivo: "VIAGEM_PASSAGEIRO" (diária especial de viagem: R$ 120,00)
   - Falta injustificada ou atestado sem remuneração = fracao: 0.0 (motivo: "FALTA")
3. Mapeamento de Obras, Cidades e Apelidos:
   - "Piscina Porto Seguro" ou apontamento explícito de piscina em Porto Seguro/Bahia (incluindo envios de sábado à noite, ex.: 18:12): Nome da Obra = "PISCINA PORTO SEGURO".
   - "Bahia" ou "Porto Seguro" (quando não especificar Piscina): Nome da Obra = "PORTO SEGURO".
   - "Quase tudo": Nome da Obra = "QUASE TUDO".
   - "Mauro obra" ou "Porto Imperial": Nome da Obra = "PORTO IMPERIAL" (O termo "obra" indica Obra Civil, diferenciando de Piscina).
   - Reconhecer e preservar apelidos de canteiro como nomes próprios dos operários (ex: "Wender 22" / "Weslen", "Mauro obra", "Manoel", "Peu" / "Edmilson", "Ian", "Zé baiano" / "José baiano", "Daniel.", "Gil" / "Gilvan" / "Gil335Revest", "Mateus", "Lucas. J.").
   - Identificar datas citadas na mensagem (ex: "05/11", "dia 09 de novembro", "14 de novembro", "21/11") e formatar preferencialmente em YYYY-MM-DD considerando o ano corrente (2026).
4. Vales e adiantamentos financeiros concedidos a cada trabalhador (ex: "dei 50 de vale pra cada", "adiantou 100 pro José", "Uma vale pra o Mateus", "Pra o Daniel e o Ian também por favor. Vale."). Se o encarregado pedir vale SEM informar o valor, extraia cada nome em "vales" com "valor": 100.0 (padrão operacional de vale quando omitido).
5. A flag "setup": true caso a mensagem seja uma ordem de alocação/cadastro inicial de equipe (ex: "Obra Bahia, aloca o José e o Pedro lá com diária de...").

REGRAS RÍGIDAS:
- Realize 'Extração Multi-Contexto': se a mensagem misturar pessoas de obras diferentes (ex: "Na Bahia trabalhou Pedro e José com vale de 50. Em Jabaquara Miguel trabalhou meio dia"), separe em objetos distintos dentro do array "obras".
- Aceite envios em qualquer dia e horário (incluindo sábado à tarde/noite, ex.: 16:39 na Quase Tudo e 18:12 na Piscina Porto Seguro) sem mesclar obras diferentes.
- RETORNE ESTRITAMENTE um JSON válido SEM formatação markdown (\`\`\`json ou \`\`\`), SEM explicações adicionais, correspondendo exatamente a este formato:
{
  "obras": [
    {
      "nome_obra": "string",
      "data_referencia": "YYYY-MM-DD",
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
IMPORTANTE SOBRE FRAÇÕES:
- fracao DEVE ser um número float puro: 1.0 para dia inteiro/viagem/chuva, 0.5 para meio período, 0.0 para falta. NUNCA use strings como "1/4" ou "1/2".
- Cada pessoa presente recebe sua própria diária individual inteira (1.0) ou meia diária (0.5).
`;

export async function extrairDadosMensagem(
  textoMensagem: string,
  tenantId?: string
): Promise<NLPExtracaoResponse> {
  if (!textoMensagem || !textoMensagem.trim()) {
    return { obras: [] };
  }

  try {
    // 1. Injeção Dinâmica da Tabela de Apelidos de Obras e Colaboradores (isolada por tenant_id)
    let instrucoesAdicionais = '';
    try {
      const { obterApelidosSistema } = await import('@/services/apelidosStorage');
      const { supabaseAdmin } = await import('@/lib/supabase');
      const { TENANTS } = await import('@/lib/tenant');
      const targetTenantId = tenantId || TENANTS.jhoston.id;

      const [mapaApelidos, { data: obrasDB }, { data: funcsDB }] = await Promise.all([
        obterApelidosSistema(),
        supabaseAdmin
          .from('obras_config')
          .select('id, nome')
          .eq('tenant_id', targetTenantId),
        supabaseAdmin
          .from('funcionarios_obra')
          .select('id, nome_trabalhador')
          .eq('tenant_id', targetTenantId),
      ]);

      const listaDeParaObras: string[] = [];
      (obrasDB || []).forEach((o: { id: string; nome: string }) => {
        const apelidos = mapaApelidos.obras[o.id] || [];
        if (apelidos.length > 0) {
          listaDeParaObras.push(`• "${o.nome}" responde também por: ${apelidos.map((a) => `"${a}"`).join(', ')}`);
        }
      });

      const listaDeParaFuncs: string[] = [];
      (funcsDB || []).forEach((f: { id: string; nome_trabalhador: string }) => {
        const apelidos = mapaApelidos.funcionarios[f.id] || [];
        if (apelidos.length > 0) {
          listaDeParaFuncs.push(`• "${f.nome_trabalhador}" responde também por: ${apelidos.map((a) => `"${a}"`).join(', ')}`);
        }
      });

      if (listaDeParaObras.length > 0 || listaDeParaFuncs.length > 0) {
        instrucoesAdicionais = `\n\nTABELA OFICIAL DE DE-PARA / APELIDOS CADASTRADOS NO SISTEMA:\n` +
          `OBRAS:\n${listaDeParaObras.join('\n')}\n\n` +
          `COLABORADORES:\n${listaDeParaFuncs.join('\n')}\n` +
          `Use OBRIGATORIAMENTE o nome oficial do cadastro sempre que encontrar um desses apelidos na mensagem!`;
      }
    } catch (errAlias) {
      console.warn('Não foi possível carregar tabela dinâmica de apelidos:', errAlias);
    }

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
      systemInstruction: SYSTEM_INSTRUCTION + instrucoesAdicionais,
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

