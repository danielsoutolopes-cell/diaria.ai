'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  Check,
  Trash2,
  ImagePlus,
  X,
} from 'lucide-react';
import { NLPExtracaoResponse } from '@/types/database';
import { processarMensagemNLP } from '@/actions/nlp';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  imagemPreview?: string;
  timestamp: string;
  data?: NLPExtracaoResponse;
  faltando?: string[];
  confirmado?: boolean;
  cancelado?: boolean;
  textoOriginalAcumulado?: string;
}

const quickPrompts = [
  'Vale de R$ 100,00 para o Peu, Obra Porto Seguro, hoje',
  'Obra Bahia, José e Pedro trabalharam o dia todo',
];

function verificarPendenciasExtracao(extracao: NLPExtracaoResponse): string[] {
  const pendencias: string[] = [];
  if (!extracao.obras || extracao.obras.length === 0) {
    pendencias.push('Não consegui identificar nenhuma obra, colaborador ou vale na mensagem.');
    return pendencias;
  }

  for (const obra of extracao.obras) {
    const nomeObra = (obra.nome_obra || '').trim().toUpperCase();
    if (!nomeObra || nomeObra === 'GERAL' || nomeObra === 'A IDENTIFICAR') {
      pendencias.push('Faltou informar o **nome da Obra** (ex.: Porto Seguro, Quase Tudo).');
    }
    const temApontamento = (obra.apontamentos?.length || 0) > 0;
    const temVale = (obra.vales?.length || 0) > 0;
    if (!temApontamento && !temVale) {
      pendencias.push(`Na obra ${obra.nome_obra}, faltou informar os nomes dos colaboradores ou vales.`);
    }
    for (const vale of obra.vales || []) {
      if (!vale.valor || Number(vale.valor) <= 0) {
        pendencias.push(`Faltou informar o **valor em R$** do vale para ${vale.nome}.`);
      }
    }
  }
  return pendencias;
}

export default function TerminalIA() {
  const [input, setInput] = useState('');
  const [imagemAnexo, setImagemAnexo] = useState<{
    base64: string;
    mimeType: string;
    preview: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [enviandoValidacaoId, setEnviandoValidacaoId] = useState<string | null>(null);
  const [contextoRascunho, setContextoRascunho] = useState<string>('');
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    let nome = 'Patrícia Grubel';
    if (userCookie) {
      const raw = userCookie.split('=')[1] || '';
      try {
        nome = decodeURIComponent(decodeURIComponent(raw)).trim();
      } catch {
        nome = decodeURIComponent(raw).replace(/%20/g, ' ').trim();
      }
    }
    setUsuarioAtual(nome);
    const primeiroNome = nome.split(' ')[0] || 'Patrícia';
    setMessages([
      {
        id: 'welcome',
        sender: 'bot',
        text: `Olá, ${primeiroNome} ✨! Sou seu assistente de campo com Pré-Validação inteligente. Digite seu apontamento ou vale: eu confiro se falta alguma informação e só envio para a fila de Validação depois do seu "De Acordo".`,
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ]);
  }, []);

  function carregarImagemFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      setImagemAnexo({
        base64: result,
        mimeType: file.type || 'image/jpeg',
        preview: result,
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleSend(texto?: string) {
    const userText = (texto || input).trim();
    const imgAtual = texto ? null : imagemAnexo;
    if ((!userText && !imgAtual) || loading) return;

    setInput('');
    if (imgAtual) setImagemAnexo(null);
    const hora = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userText || '📷 Imagem enviada para leitura IA',
      imagemPreview: imgAtual?.preview,
      timestamp: hora,
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const textoAcumulado = contextoRascunho
      ? `${contextoRascunho}\nComplemento do usuário: ${userText}`
      : userText;

    try {
      let resultado: {
        success?: boolean;
        extracao?: NLPExtracaoResponse;
        mensagemOriginal?: string;
        error?: string;
      };

      if (imgAtual) {
        const res = await fetch('/api/nlp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mensagem: textoAcumulado,
            imagemBase64: imgAtual.base64,
            imagemMimeType: imgAtual.mimeType,
          }),
        });
        resultado = (await res.json()) as {
          success?: boolean;
          extracao?: NLPExtracaoResponse;
          mensagemOriginal?: string;
          error?: string;
        };
      } else {
        resultado = await processarMensagemNLP(textoAcumulado);
      }

      if (resultado.success && resultado.extracao) {
        const extracao = resultado.extracao;
        const faltando = verificarPendenciasExtracao(extracao);
        const textoFinal = resultado.mensagemOriginal || textoAcumulado;
        setContextoRascunho(textoFinal);

        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text:
            faltando.length > 0
              ? 'Quase lá! Antes de subir para a fila de Validação, notei que faltou alguma informação — basta responder abaixo para eu completar:'
              : 'Tudo completo! Confira o rascunho abaixo e clique em "De Acordo" para enviar para a fila de Validação (ou digite qualquer ajuste):',
          data: extracao,
          faltando,
          textoOriginalAcumulado: textoFinal,
          timestamp: hora,
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        throw new Error(resultado.error || 'Erro no processamento');
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: 'bot',
          text: 'Houve uma oscilação na conexão com o Gemini. Por favor, tente novamente.',
          timestamp: hora,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeAcordo(msg: ChatMessage) {
    if (!msg.data) return;
    setEnviandoValidacaoId(msg.id);
    try {
      const res = await fetch('/api/terminal/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extracao: msg.data,
          mensagemOriginal: msg.textoOriginalAcumulado || msg.text,
          usuarioLogado: usuarioAtual,
        }),
      });
      const d = (await res.json()) as { success?: boolean; message?: string };
      if (d.success) {
        setContextoRascunho('');
        setMessages((prev) => [
          ...prev.map((m) => (m.id === msg.id ? { ...m, confirmado: true } : m)),
          {
            id: `ok-${Date.now()}`,
            sender: 'bot',
            text: `✅ Confirmado! ${d.message || 'Enviado para a fila de Validação com sucesso.'}`,
            timestamp: new Date().toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEnviandoValidacaoId(null);
    }
  }

  function handleCancelarRascunho(msgId: string) {
    setContextoRascunho('');
    setMessages((prev) => [
      ...prev.map((m) => (m.id === msgId ? { ...m, cancelado: true } : m)),
      {
        id: `cancel-${Date.now()}`,
        sender: 'bot',
        text: 'Rascunho cancelado. Nada foi gravado no banco de dados.',
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ]);
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
              <h3 className="font-bold text-sm tracking-tight text-white">
                Assistente Executivo de Campo
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                Pré-Validação IA
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Omnichannel Multimodal (Texto + Imagem) • Gemini 2.5 Flash
            </p>
          </div>
        </div>

        <span className="text-[11px] text-slate-400 hidden sm:inline-block">
          Só sobe após De Acordo
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
              {m.sender === 'user' ? (
                <User className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>

            <div
              className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-sm shadow-sm transition-all ${
                m.sender === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-none'
                  : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-none'
              }`}
            >
              {m.imagemPreview && (
                <img
                  src={m.imagemPreview}
                  alt="Imagem anexada"
                  className="mb-2 max-h-48 rounded-xl border border-white/20 object-contain"
                />
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

              {/* Alertas de informações faltantes */}
              {m.faltando && m.faltando.length > 0 && !m.cancelado && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                  {m.faltando.map((f, i) => (
                    <p
                      key={i}
                      className="text-xs font-semibold text-amber-900 flex items-start gap-1.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Card de Rascunho + Botões De Acordo / Cancelar */}
              {m.data?.obras && m.data.obras.length > 0 && (
                <div className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-3">
                  {m.data.obras.map((obra, idx) => (
                    <div
                      key={idx}
                      className="bg-gradient-to-b from-slate-50 to-white rounded-xl p-3.5 border border-slate-200/80 text-xs text-slate-700 shadow-sm space-y-2"
                    >
                      <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Obra: {obra.nome_obra}</span>
                      </div>

                      {obra.apontamentos?.length > 0 && (
                        <div>
                          <span className="font-semibold text-slate-900 block mb-1">
                            Diárias:
                          </span>
                          <ul className="space-y-0.5 pl-2">
                            {obra.apontamentos.map((ap, i) => (
                              <li key={i}>
                                • <strong>{ap.nome}</strong> — {ap.fracao}x{' '}
                                {ap.motivo ? `(${ap.motivo})` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {obra.vales?.length > 0 && (
                        <div>
                          <span className="font-semibold text-rose-800 block mb-1">
                            Vales:
                          </span>
                          <ul className="space-y-0.5 pl-2">
                            {obra.vales.map((v, i) => (
                              <li key={i}>
                                • <strong>{v.nome}</strong> — R${' '}
                                {Number(v.valor || 0).toFixed(2)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}

                  {!m.confirmado && !m.cancelado && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDeAcordo(m)}
                        disabled={enviandoValidacaoId === m.id}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>
                          {enviandoValidacaoId === m.id
                            ? 'Enviando...'
                            : 'De Acordo — Enviar para Validação'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCancelarRascunho(m.id)}
                        className="px-3 py-2 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 text-xs font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Cancelar</span>
                      </button>
                    </div>
                  )}

                  {m.confirmado && (
                    <Link
                      href="/validacoes"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:underline"
                    >
                      <span>Abrir Fila de Validações</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              )}

              <span
                className={`text-[10px] block mt-1.5 ${
                  m.sender === 'user' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                {m.timestamp}
              </span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 pl-11">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Analisando e conferindo informações...</span>
          </div>
        )}
      </div>

      {/* Quick Prompts & Input */}
      <div className="p-4 bg-white border-t border-slate-200/80 space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-semibold text-slate-400 shrink-0">
            Sugestões:
          </span>
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(p)}
              className="text-[11px] px-3 py-1 rounded-full bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-800 border border-slate-200/70 transition-colors shrink-0"
            >
              {p}
            </button>
          ))}
        </div>

        {imagemAnexo && (
          <div className="flex items-center gap-2 p-2 rounded-2xl bg-emerald-50 border border-emerald-200 w-fit">
            <img
              src={imagemAnexo.preview}
              alt="Preview"
              className="w-12 h-12 rounded-xl object-cover border border-emerald-200"
            />
            <span className="text-xs font-bold text-emerald-900">
              Imagem pronta para leitura IA
            </span>
            <button
              type="button"
              onClick={() => setImagemAnexo(null)}
              className="p-1 rounded-lg bg-white text-slate-500 hover:text-rose-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex items-center gap-2"
        >
          <label
            title="Anexar print ou foto (ou use Ctrl+V)"
            className="p-3 rounded-2xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 cursor-pointer transition-colors shrink-0"
          >
            <ImagePlus className="w-4 h-4" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) carregarImagemFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                  const file = item.getAsFile();
                  if (file) {
                    carregarImagemFile(file);
                    break;
                  }
                }
              }
            }}
            placeholder={
              contextoRascunho
                ? 'Responda o que faltou ou cole um print (Ctrl+V)...'
                : 'Digite ou cole um print (Ctrl+V) de ponto, vale ou PIX...'
            }
            className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900"
          />
          <button
            type="submit"
            disabled={loading || (!input.trim() && !imagemAnexo)}
            className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>Enviar</span>
          </button>
        </form>
      </div>
    </div>
  );
}
