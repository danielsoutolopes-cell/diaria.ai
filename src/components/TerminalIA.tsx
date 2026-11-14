'use client';

import React, { useState } from 'react';
import { Send, Bot, User, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { NLPExtracaoResponse } from '@/types/database';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  data?: NLPExtracaoResponse;
}

export default function TerminalIA() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Olá, Patrícia! Sou o Terminal de IA do Ponto Patrícia. Você pode digitar instruções em linguagem natural de canteiro de obras (ex: "Obra Bahia, José e Pedro trabalharam de manhã e dei 50 de vale pra cada"). O Gemini 1.5 Flash fará a extração multi-contexto instantânea.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
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
      const res = await fetch('/api/nlp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: userText }),
      });

      const json = await res.json();
      const extracao: NLPExtracaoResponse = json.extracao;

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: `Extração concluída com sucesso! Identifiquei ${extracao.obras?.length || 0} obra(s).`,
        data: extracao,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: 'bot',
          text: 'Houve uma falha ao comunicar com o modelo Gemini. Por favor, tente novamente.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[520px] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500 rounded-lg text-slate-950">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Terminal de IA (Omnichannel NLP)</h3>
            <p className="text-xs text-slate-400">Powered by Google Gemini 1.5 Flash</p>
          </div>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
          NLP Ativo
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-50">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-3 ${
              m.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div
              className={`p-2 rounded-xl text-xs flex items-center justify-center shrink-0 ${
                m.sender === 'user'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-emerald-400'
              }`}
            >
              {m.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                m.sender === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-none'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>

              {/* Renderização Estruturada dos Dados Extraídos */}
              {m.data?.obras && m.data.obras.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                  {m.data.obras.map((obra, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700"
                    >
                      <div className="font-bold text-emerald-700 flex items-center gap-1.5 mb-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Obra: {obra.nome_obra} {obra.setup ? '(Setup Inicial)' : ''}
                      </div>

                      {obra.apontamentos?.length > 0 && (
                        <div className="mb-2">
                          <span className="font-semibold text-slate-900">Diárias/Presenças:</span>
                          <ul className="list-disc list-inside mt-0.5 text-slate-600">
                            {obra.apontamentos.map((ap, i) => (
                              <li key={i}>
                                {ap.nome} — Fração: <strong>{ap.fracao}x</strong>{' '}
                                {ap.motivo ? `(${ap.motivo})` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {obra.vales?.length > 0 && (
                        <div>
                          <span className="font-semibold text-slate-900">Vales Solicitados:</span>
                          <ul className="list-disc list-inside mt-0.5 text-slate-600">
                            {obra.vales.map((v, i) => (
                              <li key={i}>
                                {v.nome} — R$ {v.valor.toFixed(2)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <span
                className={`block text-[10px] mt-1.5 ${
                  m.sender === 'user' ? 'text-emerald-100 text-right' : 'text-slate-400'
                }`}
              >
                {m.timestamp}
              </span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Processando com Gemini 1.5 Flash...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex: Obra Bahia, José e Pedro trabalharam de manhã e dei 50 de vale..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-semibold transition-all shadow-md shadow-emerald-700/20"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>Enviar</span>
        </button>
      </form>
    </div>
  );
}
