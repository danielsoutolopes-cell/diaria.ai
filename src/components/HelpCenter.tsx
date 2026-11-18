'use client';

import React, { useState } from 'react';
import {
  HelpCircle,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Terminal,
  Sparkles,
  MessageSquare,
  Wallet,
  FileSpreadsheet,
  Smartphone,
  Copy,
  Check,
} from 'lucide-react';

interface AccordionItem {
  id: string;
  titulo: string;
  icone: React.ReactNode;
  resumo: string;
  conteudo: React.ReactNode;
}

const ATALHOS_TERMINAL = [
  { cmd: '/pendentes', desc: 'Lista todos os lotes e vales aguardando validação da Patrícia.' },
  { cmd: '/resumo [obra]', desc: 'Mostra o resumo financeiro e de equipe da obra informada.' },
  { cmd: '/extrato [nome]', desc: 'Exibe o histórico dia a dia de diárias e vales do colaborador.' },
];

export default function HelpCenter() {
  const [abertoId, setAbertoId] = useState<string>('ia-mensagens');
  const [copiadoCmd, setCopiadoCmd] = useState<string | null>(null);
  const [mostrarGuiaFlutuante, setMostrarGuiaFlutuante] = useState<boolean>(true);

  function copiarComando(cmd: string) {
    navigator.clipboard.writeText(cmd);
    setCopiadoCmd(cmd);
    setTimeout(() => setCopiadoCmd(null), 2000);
  }

  const secoes: AccordionItem[] = [
    {
      id: 'ia-mensagens',
      titulo: 'Como a IA lê mensagens',
      icone: <MessageSquare className="w-5 h-5 text-emerald-600" />,
      resumo: 'Padrões ideais de envio pelo WhatsApp para extração 100% automática de obra, data, chuva e equipe.',
      conteudo: (
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            O motor de IA (Gemini) identifica automaticamente a <strong>obra</strong>, a <strong>data de referência</strong>, o <strong>motivo</strong> (normal, chuva, viagem, parado) e cada <strong>colaborador</strong>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
              <div className="flex items-center gap-1.5 text-emerald-800 font-black text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>EXEMPLO CORRETO (Ideal)</span>
              </div>
              <pre className="text-[11px] text-emerald-950 bg-white/80 p-3 rounded-xl border border-emerald-200/60 whitespace-pre-wrap font-sans">
{`Segunda dia 16/11 piscina porto seguro. Diárias de chuva.

Gil
Mateus
Peu
Ian`}
              </pre>
              <p className="text-[11px] text-emerald-700">
                ✓ Tem obra, data, condição (chuva) e lista clara de nomes.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-2">
              <div className="flex items-center gap-1.5 text-rose-800 font-black text-xs">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>EXEMPLO INCORRETO (Ambíguo)</span>
              </div>
              <pre className="text-[11px] text-rose-950 bg-white/80 p-3 rounded-xl border border-rose-200/60 whitespace-pre-wrap font-sans">
{`Bom dia, hoje foi todo mundo lá naquela obra de sempre e dei um dinheiro pro menino.`}
              </pre>
              <p className="text-[11px] text-rose-700">
                ✗ Falta nome da obra, nomes dos operários e valor do vale.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'vales-extras',
      titulo: 'Ajustando Vales e Extras',
      icone: <Wallet className="w-5 h-5 text-amber-600" />,
      resumo: 'Como definir valores de vales pedidos sem valor e evitar duplicidade de diárias no mesmo dia.',
      conteudo: (
        <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
          <p>• Quando um encarregado pede vale <strong>sem informar o valor</strong> (ex: <em>&quot;3 vales: Ian, Daniel, Mateus&quot;</em>), o sistema cria o pedido com valor pendente na tela <strong>Validações Pendentes</strong>.</p>
          <p>• Digite o valor liberado (ex: <code>100</code>), clique em <strong>OK</strong> para somar no lote e depois em <strong>Aprovar Todos</strong>.</p>
          <p>• <strong>Barreira Anti-Duplicidade:</strong> O mesmo colaborador não pode receber mais que <code>1.0</code> diária integral no mesmo dia em obras diferentes.</p>
        </div>
      ),
    },
    {
      id: 'bordero-pix',
      titulo: 'Fechamento de Borderô e PIX',
      icone: <FileSpreadsheet className="w-5 h-5 text-indigo-600" />,
      resumo: 'Como funciona o fechamento semanal de sexta-feira, rateio mensalista (Diego) e pagamento via PIX.',
      conteudo: (
        <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
          <p>• Somente lançamentos com status <strong>VALIDADO</strong> entram no <strong>Fechamento (Borderô)</strong>.</p>
          <p>• Os vales validados são descontados automaticamente do bruto semanal para gerar o <strong>Líquido a Pagar</strong>.</p>
          <p>• Colaboradores mensalistas com rateio semanal (ex: Diego — R$ 8.700,00 / 4 = <strong>R$ 2.175,00/semana</strong>) já entram calculados automaticamente.</p>
        </div>
      ),
    },
    {
      id: 'falhas-whatsapp',
      titulo: 'Resolução de Falhas no WhatsApp',
      icone: <Smartphone className="w-5 h-5 text-sky-600" />,
      resumo: 'O que fazer se o QR Code travar ou o iPhone/Android demorar para parear.',
      conteudo: (
        <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
          <p>• Acesse <strong>Configuração do Bot (WhatsApp)</strong> e clique em <strong>Diagnóstico Rápido</strong> para testar a saúde do motor Baileys.</p>
          <p>• Em aparelhos <strong>iPhone (iOS)</strong>, se a câmera falhar, utilize a opção <strong>Código de 8 Dígitos</strong> ou clique em <strong>Limpar Memória &amp; Reiniciar Socket</strong>.</p>
          <p>• Após conectar uma única vez no servidor Fly.io, a sessão fica salva no disco permanente <code>/data</code> e reconecta sozinha.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8 relative">
      {/* Header Manual Vivo */}
      <div className="bg-gradient-to-r from-slate-900 to-emerald-950 text-white p-6 rounded-3xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Manual Vivo • Ponto Patrícia</span>
          </div>
          <h2 className="text-2xl font-black">Central de Ajuda Interativa</h2>
          <p className="text-xs text-slate-300 max-w-2xl">
            Guias práticos, exemplos de mensagens para encarregados e atalhos rápidos para operação diária.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMostrarGuiaFlutuante((v) => !v)}
          className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all self-start md:self-center"
        >
          <Terminal className="w-4 h-4 text-emerald-300" />
          <span>{mostrarGuiaFlutuante ? 'Ocultar Atalhos' : 'Mostrar Atalhos'}</span>
        </button>
      </div>

      {/* Acordeões Categorizados */}
      <div className="space-y-3">
        {secoes.map((sec) => {
          const aberto = abertoId === sec.id;
          return (
            <div
              key={sec.id}
              className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden transition-all"
            >
              <button
                type="button"
                onClick={() => setAbertoId(aberto ? '' : sec.id)}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 bg-slate-100 rounded-2xl">{sec.icone}</div>
                  <div>
                    <h3 className="text-sm font-black text-slate-950">{sec.titulo}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{sec.resumo}</p>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                    aberto ? 'rotate-180 text-emerald-600' : ''
                  }`}
                />
              </button>

              {aberto && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-100 animate-in fade-in duration-150">
                  {sec.conteudo}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabela Flutuante de Atalhos do Chat/Terminal */}
      {mostrarGuiaFlutuante && (
        <div className="bg-slate-950 text-white p-5 rounded-3xl border border-slate-800 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-300">
                Guia Rápido de Comandos (Chat / Terminal IA)
              </h4>
            </div>
            <span className="text-[10px] text-slate-400">Clique para copiar</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ATALHOS_TERMINAL.map((at) => (
              <button
                key={at.cmd}
                type="button"
                onClick={() => copiarComando(at.cmd)}
                className="text-left p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all flex flex-col justify-between gap-2 group"
              >
                <div className="flex items-center justify-between w-full">
                  <code className="text-xs font-black text-emerald-400">{at.cmd}</code>
                  {copiadoCmd === at.cmd ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{at.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
