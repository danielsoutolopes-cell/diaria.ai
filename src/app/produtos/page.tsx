'use client';

import React from 'react';
import Link from 'next/link';
import {
  Layers,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Waves,
  Building2,
  FileCheck2,
  Receipt,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Workflow,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface ProdutoItem {
  id: string;
  nome: string;
  subtitulo: string;
  tagline: string;
  url: string;
  corAcento: string;
  badge: string;
  descricao: string;
  destaques: string[];
  icone: any;
  status: 'EM OPERAÇÃO' | 'PILOTO' | 'PRODUÇÃO ATIVA';
}

export default function ProdutosPage() {
  const produtos: ProdutoItem[] = [
    {
      id: 'diaria-ai',
      nome: 'Ponto Patrícia (Diária.AI)',
      subtitulo: 'Micro-ERP de Campo & Gestão Financeira com IA Human-in-the-Loop',
      tagline: 'O fim dos papéis rasurados e das sextas-feiras exaustivas de fechamento.',
      url: '/',
      corAcento: 'from-emerald-500 to-teal-500',
      badge: 'PRODUTO CORE',
      status: 'PRODUÇÃO ATIVA',
      icone: Receipt,
      descricao:
        'Captura de apontamentos e vales via WhatsApp em linguagem natural, validação humana soberana da folha, date stamp indelével em fotos de canteiro e fechamento instantâneo de borderô com PIX Copia & Cola e QR Code dinâmico.',
      destaques: [
        'Interpretação de áudios e textos de encarregados via Gemini 1.5 Flash',
        'Abatimento opcional de vales com manutenção do saldo a dever',
        'Date Stamp pericial com clima, coordenadas GPS e hash SHA-256',
        'Exportação executiva para planilhas Excel (.xlsx) e envio no WhatsApp',
      ],
    },
    {
      id: 'gapad-hub',
      nome: 'GADAP Hub',
      subtitulo: 'Gestão e Inteligência Fiscal para Obras e Prestadores de Serviços',
      tagline: 'Ação Operacional é Fato Gerador Fiscal.',
      url: 'https://gapad-hub.vercel.app',
      corAcento: 'from-cyan-500 to-blue-600',
      badge: 'INTELIGÊNCIA FISCAL',
      status: 'EM OPERAÇÃO',
      icone: ShieldCheck,
      descricao:
        'Conecta o avanço físico dos canteiros de obras às obrigações contábeis e tributárias em tempo real. Monitora retenções, faturamento, emissão de notas fiscais de serviço e conformidade regulatória sem burocracia desnecessária.',
      destaques: [
        'Cruzamento automático entre avanço de obra e emissão fiscal',
        'Controle de retenções de impostos na fonte (INSS, ISS, IRRF)',
        'Dashboard gerencial com conciliação contábil em tempo real',
        'Segurança jurídica e blindagem tributária para construtoras',
      ],
    },
    {
      id: 'jhpcs',
      nome: 'JHPCS • JHoston Pools Control System',
      subtitulo: 'Revestimentos Monolíticos, Inteligência Química & Auditoria de Garantias',
      tagline: 'Engenharia química e blindagem técnica para o setor de piscinas de alto padrão.',
      url: 'https://jhpcs.vercel.app',
      corAcento: 'from-sky-400 to-indigo-600',
      badge: 'ENGENHARIA & GARANTIA',
      status: 'EM OPERAÇÃO',
      icone: Waves,
      descricao:
        'Plataforma técnica especializada no ciclo de vida de piscinas e revestimentos monolíticos. Realiza o rastreamento pericial de parâmetros químicos da água (pH, alcalinidade, dureza cálcica), laudos técnicos digitais e auditoria preventiva para emissão e manutenção de termos de garantia de fábrica.',
      destaques: [
        'Algoritmos de balanceamento químico (Índice de Saturação de Langelier)',
        'Auditoria pericial de patologias em revestimentos e alvenaria',
        'Emissão de termos de garantia técnica com assinatura digital e QR Code',
        'Histórico evolutivo de manutenção para construtoras e proprietários',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#080C16] text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Glow de Fundo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-cyan-500/10 via-emerald-500/5 to-transparent blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-cyan-500/30 text-cyan-400 text-xs font-bold tracking-widest uppercase shadow-lg shadow-cyan-950/50 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Ecossistema Integrado de Soluções</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            Nossos Produtos & Plataformas
          </h1>
          <p className="text-base text-slate-400 leading-relaxed">
            Uma suíte tecnológica completa desenvolvida pela{' '}
            <strong className="text-white">GADAP</strong> para conectar o campo, a engenharia química e a
            controladoria fiscal em uma experiência única e sem atrito.
          </p>
        </div>

        {/* Grade de Produtos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {produtos.map((p) => {
            const Icone = p.icone;
            const isExternal = p.url.startsWith('http');

            return (
              <div
                key={p.id}
                className="relative rounded-3xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all duration-300 flex flex-col justify-between overflow-hidden group hover:shadow-2xl hover:shadow-cyan-950/30"
              >
                {/* Linha decorativa no topo */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${p.corAcento}`} />

                <div className="p-8 space-y-6">
                  {/* Topo do Card */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 uppercase tracking-wider">
                      {p.badge}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {p.status}
                    </span>
                  </div>

                  {/* Ícone e Título */}
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                      <Icone className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white group-hover:text-cyan-300 transition-colors">
                        {p.nome}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 font-medium">{p.subtitulo}</p>
                    </div>
                  </div>

                  {/* Tagline */}
                  <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-[11px] font-medium text-slate-300 italic">
                    "{p.tagline}"
                  </div>

                  {/* Descrição */}
                  <p className="text-xs text-slate-400 leading-relaxed">{p.descricao}</p>

                  {/* Destaques Técnicos */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Recursos Principais:
                    </span>
                    <ul className="space-y-1.5">
                      {p.destaques.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-[11px] text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Rodapé com Botão */}
                <div className="p-6 pt-0 bg-transparent">
                  {isExternal ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 border border-slate-700"
                    >
                      <span>Acessar Plataforma</span>
                      <ExternalLink className="w-4 h-4 text-cyan-400" />
                    </a>
                  ) : (
                    <Link
                      href={p.url}
                      className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-950/40"
                    >
                      <span>Abrir Painel Atual</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bloco de Integração do Ecossistema */}
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
                Sinergia Operacional
              </span>
              <h3 className="text-2xl font-black text-white">Como as três pontas se conectam?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                O <strong>Ponto Patrícia</strong> cuida das pessoas e dos pagamentos em campo; o{' '}
                <strong>JHPCS</strong> blinda a qualidade técnica da piscina e a garantia química do revestimento; e o{' '}
                <strong>GADAP Hub</strong> transforma toda a movimentação operacional em tranquilidade fiscal e contábil.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/gadap"
                className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold text-center border border-slate-700 transition-all"
              >
                Conheça a Marca GADAP
              </Link>
              <Link
                href="/"
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 text-xs font-black text-center transition-all shadow-lg shadow-cyan-950/40"
              >
                Ir para o Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

