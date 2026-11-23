import { GoogleGenerativeAI } from '@google/generative-ai';
import { NLPExtracaoResponse } from '@/types/database';
import {
  executarPipelineDuasPassagens,
  reconciliarExtracaoComParserDeterministico,
} from '@/lib/extracaoDiariasParser';
import {
  aplicarRegrasAprendidasTexto,
  atualizarPerfilRemetenteValidado,
  carregarContextoAprendizado,
  extrairAssinaturaEstruturalMensagem,
  gerarBlocoFewShotPrompt,
  registrarAprendizadoPedidoExclusivoVales,
  registrarRegraAprendida,
  sugerirObraPadraoSeOmitida,
  type ContextoAprendizadoRemetente,
} from '@/services/aprendizadoCampoService';

const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^"|"$/g, '');
const genAI = new GoogleGenerativeAI(apiKey);

export interface ContextoRemetenteExtracao {
  remetenteTelefone?: string | null;
  remetenteNome?: string | null;
}

const SYSTEM_INSTRUCTION = `
Você é o assistente de Inteligência Artificial do sistema Ponto Patrícia (Diária.AI), especializado em extração multi-contexto de mensagens operacionais informais de canteiro de obras e construção de piscinas.

SEU OBJETIVO:
Ler TODA a mensagem do início ao último caractere (enviada por encarregados ou digitada no terminal) e extrair com máxima precisão:
1. As obras mencionadas (ex: Bahia, Jabaquara, Alphaville, Piscina Porto Seguro, Quase Tudo, etc.). Se não houver nome específico de obra, atribua "GERAL".
2. Os apontamentos de presença de TODOS os trabalhadores listados, identificando a fração e a regra de diária:
   - Dia normal / integral de trabalho = fracao: 1.0 (motivo: "NORMAL")
   - Meio período / trabalhou de manhã / "Meio dia" / dispensado mais cedo = fracao: 0.5 (motivo: "MEIO_PERIODO")
   - Dia de chuva (obra paralisada por chuva, "Diárias de chuva") = fracao: 1.0 (SEMPRE 1.0 por padrão, pois cobre alimentação/estadia de dia não trabalhado — não usar 0.5 para chuva), motivo: "CHUVA" (Gera diária especial de chuva: R$ 120,00)
   - Dia parado (quando o condomínio não liberou acesso, portaria travada ou material não entregue) = fracao: 1.0, motivo: "PARADO" (Gera diária especial de dia parado: R$ 120,00)
   - Dia de viagem (deslocamento entre cidades/estados da equipe, "Viagem Bahia", etc.):
     * Se for o MOTORISTA (ou indicado como motorista/quem dirigiu) = fracao: 1.0, motivo: "VIAGEM_MOTORISTA" (diária integral)
     * Para os demais passageiros/trabalhadores da equipe em trânsito = fracao: 1.0, motivo: "VIAGEM_PASSAGEIRO" (diária especial de viagem: R$ 120,00)
   - Falta injustificada ou atestado sem remuneração = fracao: 0.0 (motivo: "FALTA")
3. Mapeamento de Obras, Cidades e Apelidos Oficiais:
   - "Piscina Porto Seguro" ou apontamento explícito de piscina em Porto Seguro/Bahia (incluindo envios de sábado à noite ou domingo): Nome da Obra = "PISCINA PORTO SEGURO".
   - "Bahia" ou "Porto Seguro" (quando não especificar Piscina): Nome da Obra = "PORTO SEGURO".
   - "Quase tudo": Nome da Obra = "QUASE TUDO".
   - "Mauro obra" ou "Porto Imperial": Nome da Obra = "PORTO IMPERIAL" (O termo "obra" indica Obra Civil, diferenciando de Piscina).
   - Resolva os apelidos/grafias de campo para os nomes oficiais da equipe:
     * "Gil" / "Gilvan" / "Gil335Revest" -> "Gilvan - Gil"
     * "Mateus" -> "Mateus"
     * "Lucas. J" / "Lucas. J." / "Lucas J." / "Lucas.j." / "Lucas J" -> "Lucas J."
     * "Peu" / "Edmilson" -> "Edmilson - Peu"
     * "Ian" -> "Ian"
     * "José baiano" / "Zé baiano" -> "Zé Baiano"
     * "Daniel" / "Daniel." -> "Daniel"
     * "Wender 22" / "Weslen" -> "Wender"
     * "Manoel" -> "Manoel"
   - Identificar datas citadas na mensagem (ex: "05/11", "dia 09 de novembro", "14 de novembro", "21/11", "Domingo 22 de novembro") e formatar em YYYY-MM-DD considerando o ano corrente (2026).
4. Vales e adiantamentos financeiros (SEPARAÇÃO ESTRITA — PEDIDO EXCLUSIVO DE VALES NÃO GERA DIÁRIAS):
   - Se a mensagem for um pedido exclusivo de vales (ex.: "Bom dia Patrícia 6 vale por favor." seguido de nomes, "5 vale por favor", "Uma vale pra o Mateus por favor.") e NÃO mencionar presença/diária/trabalho, retorne OBRIGATORIAMENTE "apontamentos": [] (ZERO diárias) e preencha SOMENTE "vales".
   - Valor por linha: se a linha especificar um valor explícito (ex.: "José baiano 50 reais." ou "Zé Baiano R$ 50"), extraia "valor": 50.0 e canonize o nome para "Zé Baiano" (NUNCA mantenha "50 reais" dentro do nome).
   - Fallback de valor: se a linha não trouxer valor (ex.: "Mateus", "Ian", "Peu", "Lucas. J.", "Gil"), aplique "valor": 100.0 e canonize o nome ("Lucas. J." -> "Lucas J.", "Gil" -> "Gil", "Peu" -> "Peu").
5. A flag "setup": true caso a mensagem seja uma ordem de alocação/cadastro inicial de equipe (ex: "Obra Bahia, aloca o José e o Pedro lá com diária de...").

REGRAS RÍGIDAS DE COMPLETUDE E ANTI-TRUNCAMENTO (OBRIGATÓRIO):
- NUNCA interrompa, corte ou trunque a leitura após pontos finais (".") no cabeçalho (ex.: "piscina porto seguro.") ou pontos em abreviações/iniciais de nomes (ex.: "Lucas. J", "Lucas J.", "Daniel.").
- NUNCA interrompa a leitura ao encontrar linhas em branco (\\n\\n) entre o cabeçalho e a lista de trabalhadores ou entre nomes. Continue lendo TODAS as linhas até o último nome da mensagem.
- NUNCA limite a quantidade de trabalhadores retornados em "apontamentos". Se houver 7, 15 ou 30 nomes listados, retorne TODOS os nomes no array "apontamentos".
- Realize 'Extração Multi-Contexto': se a mensagem misturar pessoas de obras diferentes, separe em objetos distintos dentro do array "obras".
- Aceite envios 24/7 em QUALQUER dia da semana e horário (segunda a domingo, incluindo domingos como "Domingo 22 de novembro...", sábados à tarde/noite e feriados) sem descartar nenhum registro.
- EXEMPLO OBRIGATÓRIO DE REFERÊNCIA:
  Entrada:
  "Domingo 22 de novembro piscina porto seguro.

  Gil
  Mateus
  Lucas. J
  Peu
  Ian
  José baiano
  Daniel"
  Saída esperada (TODOS os 7 trabalhadores):
  {"obras":[{"nome_obra":"PISCINA PORTO SEGURO","data_referencia":"2026-11-22","apontamentos":[{"nome":"Gilvan - Gil","fracao":1.0,"motivo":"NORMAL"},{"nome":"Mateus","fracao":1.0,"motivo":"NORMAL"},{"nome":"Lucas J.","fracao":1.0,"motivo":"NORMAL"},{"nome":"Edmilson - Peu","fracao":1.0,"motivo":"NORMAL"},{"nome":"Ian","fracao":1.0,"motivo":"NORMAL"},{"nome":"Zé Baiano","fracao":1.0,"motivo":"NORMAL"},{"nome":"Daniel","fracao":1.0,"motivo":"NORMAL"}],"vales":[],"setup":false}]}
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
  tenantId?: string,
  contextoRemetente?: ContextoRemetenteExtracao
): Promise<NLPExtracaoResponse> {
  if (!textoMensagem || !textoMensagem.trim()) {
    return { obras: [] };
  }

  let funcionariosOficiaisTenant: string[] = [];
  let obrasOficiaisTenant: string[] = [];
  let targetTenantId = tenantId || '00000000-0000-0000-0000-000000000001';
  let contextoAprendido: ContextoAprendizadoRemetente = {
    tenantId: targetTenantId,
    remetenteTelefone: contextoRemetente?.remetenteTelefone || null,
    perfilRemetente: null,
    regrasAtivas: [],
  };

  // 1. Injeção Dinâmica da Tabela de Apelidos + Memória de Aprendizado Contínuo (isolada por tenant_id)
  let instrucoesAdicionais = '';
  try {
    const { obterApelidosSistema } = await import('@/services/apelidosStorage');
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { TENANTS } = await import('@/lib/tenant');
    targetTenantId = tenantId || TENANTS.jhoston.id;

    const [mapaApelidos, { data: obrasDB }, { data: funcsDB }, memAprendida] =
      await Promise.all([
        obterApelidosSistema(),
        supabaseAdmin
          .from('obras_config')
          .select('id, nome')
          .eq('tenant_id', targetTenantId),
        supabaseAdmin
          .from('funcionarios_obra')
          .select('id, nome_trabalhador')
          .eq('tenant_id', targetTenantId),
        carregarContextoAprendizado(
          targetTenantId,
          contextoRemetente?.remetenteTelefone
        ),
      ]);

    contextoAprendido = memAprendida;

    const listaObrasRows = (obrasDB || []) as Array<{ id: string; nome: string }>;
    const listaFuncsRows = (funcsDB || []) as Array<{
      id: string;
      nome_trabalhador: string;
    }>;

    obrasOficiaisTenant = listaObrasRows
      .map((o) => o.nome)
      .filter((n): n is string => Boolean(n && n.trim()));
    funcionariosOficiaisTenant = listaFuncsRows
      .map((f) => f.nome_trabalhador)
      .filter((n): n is string => Boolean(n && n.trim()));

    const listaDeParaObras: string[] = [];
    listaObrasRows.forEach((o) => {
      const apelidos = mapaApelidos.obras[o.id] || [];
      if (apelidos.length > 0) {
        listaDeParaObras.push(
          `• "${o.nome}" responde também por: ${apelidos.map((a) => `"${a}"`).join(', ')}`
        );
      }
    });

    const listaDeParaFuncs: string[] = [];
    listaFuncsRows.forEach((f) => {
      const apelidos = mapaApelidos.funcionarios[f.id] || [];
      if (apelidos.length > 0) {
        listaDeParaFuncs.push(
          `• "${f.nome_trabalhador}" responde também por: ${apelidos.map((a) => `"${a}"`).join(', ')}`
        );
      }
    });

    if (listaDeParaObras.length > 0 || listaDeParaFuncs.length > 0) {
      instrucoesAdicionais =
        `\n\nTABELA OFICIAL DE DE-PARA / APELIDOS CADASTRADOS NO SISTEMA:\n` +
        `OBRAS:\n${listaDeParaObras.join('\n')}\n\n` +
        `COLABORADORES:\n${listaDeParaFuncs.join('\n')}\n` +
        `Use OBRIGATORIAMENTE o nome oficial do cadastro sempre que encontrar um desses apelidos na mensagem!`;
    }

    // Injeção dinâmica few-shot dos hábitos e aliases aprendidos do remetente/tenant
    const blocoFewShot = gerarBlocoFewShotPrompt(contextoAprendido);
    if (blocoFewShot) {
      instrucoesAdicionais += blocoFewShot;
    }
  } catch (errAlias) {
    console.warn('Não foi possível carregar tabela dinâmica de apelidos/memória:', errAlias);
  }

  const opcoesTenant = {
    funcionariosOficiais: funcionariosOficiaisTenant,
    obrasOficiais: obrasOficiaisTenant,
  };

  try {
    const model = apiKey
      ? genAI.getGenerativeModel({
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
          systemInstruction: SYSTEM_INSTRUCTION + instrucoesAdicionais,
        })
      : null;

    const resultadoPipeline = await executarPipelineDuasPassagens({
      textoOriginal: textoMensagem,
      opcoes: opcoesTenant,
      executarExtracaoLLM: async (promptTexto: string) => {
        if (!model) return null;
        // Aplica aliases/regras já aprendidas do tenant/remetente antes da chamada LLM
        const { textoEnriquecido } = aplicarRegrasAprendidasTexto(
          promptTexto,
          contextoAprendido
        );
        const result = await model.generateContent(textoEnriquecido);
        const responseText = result.response.text().trim();
        const jsonClean = responseText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '')
          .trim();
        return JSON.parse(jsonClean) as NLPExtracaoResponse;
      },
    });

    // Sugestão inteligente de obra padrão se o remetente omitiu o canteiro
    const { extracao: extracaoComObra, obraSugeridaAplicada } =
      sugerirObraPadraoSeOmitida(
        resultadoPipeline.extracao,
        contextoAprendido.perfilRemetente
      );

    if (obraSugeridaAplicada) {
      resultadoPipeline.logsAjuste.push(
        `[CONTEXTO_OBRA_REMETENTE] Obra padrão sugerida aplicada: ${obraSugeridaAplicada}.`
      );
    }

    // Auto-aprendizado de pedidos exclusivos de vale (ex.: "N vale por favor" + "<nome> <valor> reais")
    if (
      resultadoPipeline.pedidoExclusivoVales.isExclusivoVales &&
      resultadoPipeline.pedidoExclusivoVales.vales.length > 0
    ) {
      void registrarAprendizadoPedidoExclusivoVales({
        tenantId: targetTenantId,
        pedidoVales: resultadoPipeline.pedidoExclusivoVales,
        textoOriginal: textoMensagem,
        remetenteTelefone: contextoRemetente?.remetenteTelefone || null,
        remetenteNome: contextoRemetente?.remetenteNome || null,
      }).catch(() => {});
    }

    // Auto-aprendizado: se acionou a 2ª passagem complementar, grava assinatura estrutural
    // para que futuras mensagens semelhantes sejam extraídas em 1 única passada
    if (resultadoPipeline.segundaPassagemExecutada) {
      const assinaturaInfo = extrairAssinaturaEstruturalMensagem(
        textoMensagem,
        resultadoPipeline.sanitizacao,
        extracaoComObra
      );
      void registrarRegraAprendida({
        tenantId: targetTenantId,
        tipoRegra: 'ASSINATURA_ESTRUTURAL',
        origemPadrao: assinaturaInfo.assinatura,
        destinoCanonico: assinaturaInfo.descricaoDestino,
        origemAprendizado: 'AUTO_PASSAGEM_2',
        remetenteTelefone: contextoRemetente?.remetenteTelefone || null,
        remetenteNome: contextoRemetente?.remetenteNome || null,
        exemploMensagem: textoMensagem.slice(0, 240),
        criadoPor: 'Auto-Aprendizado Passagem 2',
      }).catch(() => {});

      if (contextoRemetente?.remetenteTelefone) {
        void atualizarPerfilRemetenteValidado({
          tenantId: targetTenantId,
          remetenteTelefone: contextoRemetente.remetenteTelefone,
          remetenteNome: contextoRemetente.remetenteNome || undefined,
          habitosAdicionais: assinaturaInfo.habitosDetectados,
        }).catch(() => {});
      }
    }

    if (resultadoPipeline.logsAjuste.length > 0) {
      console.log(
        `[EXTRACAO_2_PASSAGENS] ${resultadoPipeline.logsAjuste.join(' | ')}`
      );
    }

    if (extracaoComObra.obras.length > 0) {
      return extracaoComObra;
    }

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
  } catch (error) {
    console.error(
      'Erro na extração NLP via Gemini (acionando fallback determinístico):',
      error
    );
    const fallback = reconciliarExtracaoComParserDeterministico(
      textoMensagem,
      null,
      opcoesTenant
    );
    const { extracao: fallbackComObra } = sugerirObraPadraoSeOmitida(
      fallback,
      contextoAprendido.perfilRemetente
    );
    if (fallbackComObra.obras.length > 0) {
      return fallbackComObra;
    }
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

