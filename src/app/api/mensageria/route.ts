import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { listarSolicitacoesMensageria, salvarSolicitacaoMensageria } from '@/services/mensageriaStorage';
import { ADMINISTRADORES_PADRAO } from '@/services/notificacoesAdmin';

export const dynamic = 'force-dynamic';

const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^"|"$/g, '');
const genAI = new GoogleGenerativeAI(apiKey);

export async function GET() {
  try {
    const lista = await listarSolicitacoesMensageria();
    return NextResponse.json({ success: true, solicitacoes: lista });
  } catch (err) {
    console.error('Erro GET /api/mensageria:', err);
    return NextResponse.json({ success: false, solicitacoes: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { acao, solicitacaoId, mensagemUsuario, historico = [], autor = 'Patrícia Grubel' } = body;

    // Ação 1: Fechar / Concluir chamado pelo Daniel
    if (acao === 'FECHAR') {
      if (!solicitacaoId) {
        return NextResponse.json({ error: 'ID da solicitação é obrigatório' }, { status: 400 });
      }

      const lista = await listarSolicitacoesMensageria();
      const solicitacao = lista.find((s) => s.id === solicitacaoId);
      if (!solicitacao) {
        return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      solicitacao.status = 'CONCLUIDO';
      solicitacao.fechadoEm = new Date().toISOString();
      solicitacao.fechadoPor = 'Daniel Lopes';

      await salvarSolicitacaoMensageria(solicitacao);

      return NextResponse.json({
        success: true,
        message: 'Chamado fechado com sucesso por Daniel Lopes!',
        solicitacao,
      });
    }

    // Ação 2: Interagir no Chat com o Gemini para entender a necessidade e gerar o prompt de engenharia
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
      systemInstruction: `
Você é o Arquiteto de Software e Engenheiro de Requisitos do ecossistema Ponto Patrícia (Diária.AI).
A Administradora Patrícia Grubel está conversando com você porque precisa de uma nova funcionalidade, relatório específico ou ajuste no sistema.

SEU PAPEL:
1. Converse de forma atenciosa, amigável e profissional com a Patrícia.
2. Faça perguntas pontuais para entender exatamente:
   - Qual relatório ou informação ela precisa ver?
   - Quais colunas ou cálculos específicos são necessários?
   - Qual o filtro ou periodicidade (por obra, por quinzena, por trabalhador)?
   - Se precisa de exportação em Excel (.xlsx) ou disparo no WhatsApp.
3. Se você já tiver entendido com clareza a necessidade, defina "compreendido": true e gere o campo "promptTecnicoParaIDE":
   - O prompt técnico deve ser extremamente detalhado e pronto para o desenvolvedor Daniel Lopes colar na IDE (Antigravity/Cursor/VS Code).
   - O prompt deve conter:
     * Título do Requisito;
     * Contexto de Negócio;
     * Arquitetura de arquivos sugerida em Next.js 14 App Router (ex: src/app/relatorios/..., src/app/api/...);
     * Estrutura de dados e colunas necessárias;
     * Regras de negócio e cálculos estritos (sempre em TypeScript com strict: true).

RETORNE ESTRITAMENTE um JSON neste formato:
{
  "respostaParaPatricia": "Texto amigável conversando com a Patrícia...",
  "compreendido": false,
  "titulo": "Título curto da solicitação",
  "promptTecnicoParaIDE": "Prompt técnico completo para a IDE (se compreendido for true, senão deixe vazio)"
}
`,
    });

    // Monta o prompt de conversa
    const promptHistorico = `
Histórico da conversa:
${historico.map((h: any) => `${h.remetente}: ${h.texto}`).join('\n')}

Nova mensagem da Patrícia:
"${mensagemUsuario}"
`;

    const result = await model.generateContent(promptHistorico);
    const textResp = result.response.text().trim();
    const parsed = JSON.parse(textResp);

    const agora = new Date().toLocaleString('pt-BR');
    const novoHistorico = [
      ...historico,
      { remetente: 'USUARIO', texto: mensagemUsuario, dataHora: agora },
      { remetente: 'ASSISTENTE', texto: parsed.respostaParaPatricia, dataHora: agora },
    ];

    let solicitacaoSalva = null;
    let notificacaoDaniel = null;

    // Se o Gemini já compreendeu e gerou o prompt técnico, salva o chamado e notifica o Daniel Lopes
    if (parsed.compreendido && parsed.promptTecnicoParaIDE) {
      solicitacaoSalva = await salvarSolicitacaoMensageria({
        id: solicitacaoId || undefined,
        autor: autor,
        titulo: parsed.titulo || 'Nova Solicitação de Relatório',
        descricaoOriginal: mensagemUsuario,
        conversaChat: novoHistorico,
        promptTecnicoGerado: parsed.promptTecnicoParaIDE,
        status: 'ABERTO',
        criadoEm: new Date().toISOString(),
      });

      const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://diaria-ai.onrender.com';
      const linkChamado = `${appUrl}/mensageria`;

      notificacaoDaniel = {
        destinatario: 'Daniel Lopes',
        telefone: '5511913192703',
        texto: `🔔 *NOVA SOLICITAÇÃO DE FEATURE / RELATÓRIO*\n` +
          `*Ponto Patrícia (Diária.AI)*\n` +
          `--------------------------------------\n` +
          `Olá *Daniel Lopes*, a Patrícia Grubel solicitou um novo relatório/funcionalidade no sistema:\n\n` +
          `📌 *Título:* ${parsed.titulo || 'Nova Demanda'}\n` +
          `👤 *Solicitante:* ${autor}\n` +
          `💡 *Status:* Prompt técnico compilado pela IA e aguardando implementação.\n\n` +
          `🔗 *Ver Solicitação & Copiar Prompt para IDE:* ${linkChamado}\n\n` +
          `_Acesse para copiar o prompt e fechar o pedido após implantar na IDE._`,
      };

      console.log(`[MENSAGERIA]: Notificação enviada para Daniel Lopes (5511913192703).`);
    }

    return NextResponse.json({
      success: true,
      respostaParaPatricia: parsed.respostaParaPatricia,
      compreendido: parsed.compreendido,
      titulo: parsed.titulo,
      promptTecnicoParaIDE: parsed.promptTecnicoParaIDE || null,
      historicoAtualizado: novoHistorico,
      solicitacao: solicitacaoSalva,
      notificacaoDaniel,
    });
  } catch (err) {
    console.error('Erro POST /api/mensageria:', err);
    return NextResponse.json({ error: 'Falha ao processar solicitação de mensageria' }, { status: 500 });
  }
}
