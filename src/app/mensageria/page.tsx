'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Sparkles,
  Send,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  User,
  Bot,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  FileCode2,
  Lock,
} from 'lucide-react';

interface MensagemChat {
  remetente: 'USUARIO' | 'ASSISTENTE';
  texto: string;
  dataHora: string;
}

interface SolicitacaoItem {
  id: string;
  autor: string;
  titulo: string;
  descricaoOriginal: string;
  conversaChat: MensagemChat[];
  promptTecnicoGerado: string;
  status: 'ABERTO' | 'CONCLUIDO';
  criadoEm: string;
  fechadoEm?: string | null;
  fechadoPor?: string | null;
}

export default function MensageriaPage() {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoItem[]>([]);
  const [solicitacaoAtiva, setSolicitacaoAtiva] = useState<SolicitacaoItem | null>(null);
  const [chatMensagens, setChatMensagens] = useState<MensagemChat[]>([
    {
      remetente: 'ASSISTENTE',
      texto: 'Olá Patrícia! Qual relatório ou funcionalidade você está sentindo falta no sistema? Me conte com suas palavras e eu vou estruturar tudo para o Daniel implementar.',
      dataHora: 'Agora',
    },
  ]);
  const [inputMensagem, setInputMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [promptCopiado, setPromptCopiado] = useState(false);
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Detecta usuário ativo a partir do cookie
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    if (userCookie) {
      const nome = decodeURIComponent(userCookie.split('=')[1]);
      if (nome) setUsuarioAtual(nome);
    }
    carregarSolicitacoes();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMensagens]);

  async function carregarSolicitacoes() {
    try {
      const res = await fetch('/api/mensageria');
      const data = await res.json();
      if (data && data.solicitacoes) {
        setSolicitacoes(data.solicitacoes);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleEnviarMensagem(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMensagem.trim() || enviando) return;

    const texto = inputMensagem.trim();
    setInputMensagem('');
    setEnviando(true);

    const novoHistorico: MensagemChat[] = [
      ...chatMensagens,
      { remetente: 'USUARIO', texto, dataHora: 'Agora' },
    ];
    setChatMensagens(novoHistorico);

    try {
      const res = await fetch('/api/mensageria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagemUsuario: texto,
          historico: chatMensagens,
          autor: usuarioAtual,
        }),
      });

      const data = await res.json();
      if (data.success && data.respostaParaPatricia) {
        setChatMensagens(data.historicoAtualizado || novoHistorico);

        if (data.compreendido && data.solicitacao) {
          setSolicitacaoAtiva(data.solicitacao);
          carregarSolicitacoes();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEnviando(false);
    }
  }

  async function handleFecharChamado(id: string) {
    try {
      const res = await fetch('/api/mensageria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'FECHAR',
          solicitacaoId: id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        carregarSolicitacoes();
        if (solicitacaoAtiva?.id === id) {
          setSolicitacaoAtiva(data.solicitacao);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  function handleCopiarPrompt(prompt: string) {
    navigator.clipboard.writeText(prompt);
    setPromptCopiado(true);
    setTimeout(() => setPromptCopiado(false), 2500);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-800 bg-indigo-50 px-3 py-1 rounded-full w-fit mb-2 border border-indigo-200/80 shadow-sm">
            <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
            <span>Central de Mensageria & Novas Demandas</span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Solicitação de Relatórios & Features
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Converse com a IA para estruturar novos relatórios. O sistema gera um prompt pronto para o Daniel colar na IDE e fechar o pedido.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Painel Esquerdo: Chat Inteligente com o Gemini */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col h-[650px]">
          <div className="p-4 px-6 bg-gradient-to-r from-slate-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
                <Bot className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span>Arquiteto de Requisitos (IA)</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Online
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">Atendimento à Patrícia Grubel</p>
              </div>
            </div>

            <button
              onClick={() => {
                setChatMensagens([
                  {
                    remetente: 'ASSISTENTE',
                    texto: 'Olá Patrícia! Qual relatório ou funcionalidade você está sentindo falta no sistema? Me conte com suas palavras e eu vou estruturar tudo para o Daniel implementar.',
                    dataHora: 'Agora',
                  },
                ]);
                setSolicitacaoAtiva(null);
              }}
              className="text-xs text-indigo-300 hover:text-white font-medium hover:underline"
            >
              Nova Conversa
            </button>
          </div>

          {/* Mensagens do Chat */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/60">
            {chatMensagens.map((msg, i) => {
              const isUser = msg.remetente === 'USUARIO';
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                      isUser
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    }`}
                  >
                    {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  </div>

                  <div
                    className={`max-w-[80%] p-4 rounded-2xl text-xs leading-relaxed space-y-1 ${
                      isUser
                        ? 'bg-emerald-600 text-white rounded-tr-none shadow-md shadow-emerald-700/15'
                        : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-none shadow-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.texto}</p>
                    <span
                      className={`text-[10px] block text-right font-medium ${
                        isUser ? 'text-emerald-100' : 'text-slate-400'
                      }`}
                    >
                      {msg.dataHora}
                    </span>
                  </div>
                </div>
              );
            })}
            {enviando && (
              <div className="flex items-center gap-2 text-xs text-indigo-600 font-semibold bg-indigo-50 p-3 rounded-2xl w-fit">
                <Sparkles className="w-4 h-4 animate-spin text-indigo-600" />
                <span>O Arquiteto de IA está analisando sua necessidade...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input de envio */}
          <form onSubmit={handleEnviarMensagem} className="p-4 bg-white border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={inputMensagem}
              onChange={(e) => setInputMensagem(e.target.value)}
              placeholder="Descreva o relatório ou necessidade (ex: Preciso de um relatório que some diárias por função)..."
              disabled={enviando}
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={enviando || !inputMensagem.trim()}
              className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 active:scale-95 shrink-0"
              title="Enviar mensagem"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Painel Direito: Prompt Técnico para a IDE & Chamados */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card do Prompt Técnico Gerado */}
          {solicitacaoAtiva?.promptTecnicoGerado ? (
            <div className="bg-slate-950 text-white p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-extrabold text-sm text-white">
                    Prompt Pronto para IDE
                  </h3>
                </div>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
                  Antigravity / Cursor
                </span>
              </div>

              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-300">
                  {solicitacaoAtiva.titulo}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Daniel, copie este prompt técnico e cole diretamente aqui na conversa do agente para implementar.
                </p>
              </div>

              <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-[11px] font-mono text-slate-300 max-h-56 overflow-y-auto whitespace-pre-wrap select-all">
                {solicitacaoAtiva.promptTecnicoGerado}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => handleCopiarPrompt(solicitacaoAtiva.promptTecnicoGerado)}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 active:scale-95"
                >
                  {promptCopiado ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Prompt Copiado com Sucesso!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Prompt para a IDE</span>
                    </>
                  )}
                </button>

                {solicitacaoAtiva.status === 'ABERTO' && (
                  <button
                    type="button"
                    onClick={() => handleFecharChamado(solicitacaoAtiva.id)}
                    className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-md shadow-emerald-600/20"
                    title="Fechar pedido após implementar"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Fechar Pedido</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Fluxo de Mensageria Inteligente</span>
              </div>
              <h3 className="font-black text-base text-slate-950">
                Como Funciona a Criação de Features?
              </h3>
              <ol className="list-decimal pl-4 space-y-2 text-xs text-slate-600 leading-relaxed">
                <li>A Patrícia descreve no chat o relatório ou ajuste que gostaria de ter.</li>
                <li>O Gemini faz perguntas para afunilar colunas, filtros e periodicidade.</li>
                <li>Ao confirmar o entendimento, o sistema gera o <strong>Prompt Técnico de Engenharia</strong>.</li>
                <li>Um aviso automático vai para o WhatsApp do <strong>Daniel Lopes</strong> com o link do pedido.</li>
                <li>O Daniel copia o prompt, cola na IDE para codificar e clica em <strong>"Fechar Pedido"</strong>.</li>
              </ol>
            </div>
          )}

          {/* Histórico de Solicitações Anteriores */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-950">
                Pedidos Registrados ({solicitacoes.length})
              </h3>
              <button
                onClick={carregarSolicitacoes}
                className="text-xs text-indigo-600 font-bold hover:underline"
              >
                Atualizar
              </button>
            </div>

            {solicitacoes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                Nenhum pedido de relatório registrado até o momento.
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {solicitacoes.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSolicitacaoAtiva(item)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                      solicitacaoAtiva?.id === item.id
                        ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {item.titulo}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          item.status === 'CONCLUIDO'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.status === 'CONCLUIDO' ? 'Concluído' : 'Aberto'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {item.descricaoOriginal}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>Por: {item.autor}</span>
                      <span>{new Date(item.criadoEm).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
