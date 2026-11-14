'use client';

import React, { useState } from 'react';
import { Send, Bot, User, Sparkles, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import { NLPExtracaoResponse } from '@/types/database';
import { processarMensagemNLP } from '@/actions/nlp';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  data?: NLPExtracaoResponse;
}

const quickPrompts = [
  'Obra Bahia, José e Pedro trabalharam de manhã e dei 50 de vale pra cada',
  'Jabaquara: choveu após o almoço, equipe dispensada às 13h',
  'Aloca o Miguel em Alphaville com diária de piscina e vale de R$ 100',
];

export default function TerminalIA() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Olá, Patrícia ✨! Sou seu assistente de Inteligência Artificial de Campo. Você pode ditar ou digitar qualquer apontamento em linguagem natural de obra que eu traduzo instantaneamente em diárias, frações por chuva e vales.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  async function handleSend(texto?: string) {
    const userText = (texto || input).trim();
    if (!userText || loading) return;

    setInput('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Invocação direta da Server Action do Next.js 14
      const resultado = await processarMensagemNLP(userText);

      if (resultado.success && resultado.extracao) {
        const extracao = resultado.extracao;
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: `Entendido perfeitamente! Extraí ${extracao.obras?.length || 0} canteiro(s) da sua mensagem. Os dados foram organizados e aguardam sua aprovação na tela de Validações.`,
          data: extracao,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        throw new Error(resultado.error || 'Erro no processamento');
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: 'bot',
          text: 'Houve uma oscilação na conexão com o Gemini via Server Action. Por favor, tente novamente.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col h-[540px] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1.5px] shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-slate-950 animate-pulse"></span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-tight text-white">Assistente Executivo de Campo</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                Next.js Server Actions
              </span>
            </div>
            <p className="text-[11px] text-slate-400">NLP Multi-Contexto • Gemini 1.5 Flash</p>
          </div>
        </div>

        <span className="text-[11px] text-slate-400 hidden sm:inline-block">
          Omnichannel WhatsApp + Web
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-3.5 ${
              m.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-xl text-xs flex items-center justify-center shrink-0 shadow-sm ${
                m.sender === 'user'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 text-emerald-400 border border-slate-800'
              }`}
            >
              {m.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-sm shadow-sm transition-all ${
                m.sender === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-none'
                  : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-none'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

              {/* Renderização de Extração */}
              {m.data?.obras && m.data.obras.length > 0 && (
                <div className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-3">
                  {m.data.obras.map((obra, idx) => (
                    <div
                      key={idx}
                      className="bg-gradient-to-b from-slate-50 to-white rounded-xl p-3.5 border border-slate-200/80 text-xs text-slate-700 shadow-sm"
                    >
                      <div className="font-bold text-emerald-800 flex items-center gap-1.5 mb-2 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Obra: {obra.nome_obra}</span>
                        {obra.setup && (
                          <span className="ml-auto text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-semibold">
                            Setup Inicial
                          </span>
                        )}
                      </div>

                      {obra.apontamentos?.length > 0 && (
                        <div className="mb-2.5">
                          <span className="font-semibold text-slate-900 block mb-1">
                            Presenças Extraídas:
                          </span>
                          <div className="space-y-1">
                            {obra.apontamentos.map((ap, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between bg-slate-100/70 px-2.5 py-1 rounded-lg"
                              >
                                <span className="font-medium text-slate-800">{ap.nome}</span>
                                <div className="flex items-center gap-2">
                                  {ap.motivo && (
                                    <span className="text-[11px] text-slate-500 italic">
                                      {ap.motivo}
                                    </span>
                                  )}
                                  <span className="font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded text-[11px]">
                                    {ap.fracao}x diária
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {obra.vales?.length > 0 && (
                        <div>
                          <span className="font-semibold text-slate-900 block mb-1">
                            Vales Registrados:
                          </span>
                          <div className="space-y-1">
                            {obra.vales.map((v, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between bg-rose-50/70 border border-rose-100 px-2.5 py-1 rounded-lg"
                              >
                                <span className="font-medium text-rose-900">{v.nome}</span>
                                <span className="font-bold text-rose-700">
                                  R$ {v.valor.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <span
                className={`block text-[10px] mt-2 ${
                  m.sender === 'user' ? 'text-emerald-100 text-right' : 'text-slate-400'
                }`}
              >
                {m.timestamp}
              </span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/80 w-fit text-slate-600 text-xs shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span className="font-medium">O Gemini 1.5 Flash está analisando via Server Action...</span>
          </div>
        )}
      </div>

      {/* Suggested Quick Pills */}
      <div className="px-5 py-2.5 bg-slate-100/70 border-t border-slate-200/60 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="text-[11px] text-slate-500 font-semibold shrink-0">Sugestões rápidas:</span>
        {quickPrompts.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(q)}
            className="px-3 py-1 rounded-full bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200/80 transition-all shrink-0 text-xs flex items-center gap-1 shadow-sm font-medium"
          >
            <span>{q.slice(0, 36)}...</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 bg-white border-t border-slate-200 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite ou cole mensagens de WhatsApp das obras..."
          className="flex-1 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-bold transition-all shadow-md shadow-emerald-700/20"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>Enviar</span>
        </button>
      </form>
    </div>
  );
}
