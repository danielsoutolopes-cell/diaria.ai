'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Shield,
  Compass,
  Cpu,
  HeartHandshake,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Layers,
  Users,
  Anchor,
  Globe2,
  Lock,
} from 'lucide-react';

export default function GadapPage() {
  return (
    <div className="min-h-screen bg-[#080C16] text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Glow Effects Decorativos no Fundo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-cyan-500/10 via-amber-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* Hero Section */}
      <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-20 space-y-12">
        {/* Badge Institucional */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-cyan-500/30 text-cyan-400 text-xs font-bold tracking-widest uppercase shadow-lg shadow-cyan-950/50 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Ecossistema Corporativo de Tecnologia</span>
          </div>
        </div>

        {/* Logo & Headline */}
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative w-44 h-44 sm:w-56 sm:h-56 p-2 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-2xl shadow-cyan-950/40 hover:border-cyan-500/50 transition-all duration-500 group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 to-amber-500/10 rounded-3xl blur-xl group-hover:blur-2xl transition-all" />
            <img
              src="/images/gadap-logo.png"
              alt="GADAP Logo - Geometric Bulldog & Tech Shield"
              className="relative w-full h-full object-cover rounded-2xl drop-shadow-md"
              onError={(e) => {
                // Fallback para SVG se png falhar
                (e.target as HTMLImageElement).src = '/images/gadap-logo.svg';
              }}
            />
          </div>

          <div className="space-y-3 max-w-3xl">
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white">
              A Alma & Força por trás da{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-amber-400">
                GADAP
              </span>
            </h1>
            <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto font-normal">
              Muito mais do que um acrônimo familiar: uma convergência milenar entre{' '}
              <strong className="text-slate-200">flexibilidade tecnológica</strong>,{' '}
              <strong className="text-slate-200">conduta ética inabalável</strong> e{' '}
              <strong className="text-slate-200">força de proteção</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link
              href="/"
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/25 active:scale-95 flex items-center gap-2"
            >
              <span>Acessar Ponto Patrícia</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/ajuda"
              className="px-6 py-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider transition-all active:scale-95"
            >
              Manual & Central de Ajuda
            </Link>
          </div>
        </div>

        {/* Os 3 Pilares Fonéticos e Linguísticos da Marca */}
        <div className="pt-10 space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-xs font-black tracking-widest text-cyan-400 uppercase">
              Origem & Significado da Marca
            </h2>
            <p className="text-2xl font-black text-white">O Anagrama que Molda Nossos Princípios</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pilar 1: ADAP */}
            <div className="relative p-8 rounded-3xl bg-slate-900/70 border border-slate-800/90 hover:border-cyan-500/40 transition-all duration-300 space-y-4 group">
              <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                <Cpu className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-widest">
                  Latim & Inglês • Adaptare / Adapt
                </span>
                <h3 className="text-xl font-black text-white">Inovação & Adaptabilidade</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                A terminação fonética remete imediatamente à flexibilidade. No universo de sistemas modernos,
                rigidez gera medo e atrito. Um ecossistema <strong>adaptável</strong> é amigável, acolhe a
                informalidade de campo do canteiro de obras e traduz mensagens espontâneas de WhatsApp em
                dados estruturados.
              </p>
              <div className="pt-2 text-[11px] font-semibold text-cyan-300/80 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sistemas que se moldam à rotina real humana</span>
              </div>
            </div>

            {/* Pilar 2: ADAB */}
            <div className="relative p-8 rounded-3xl bg-slate-900/70 border border-slate-800/90 hover:border-amber-500/40 transition-all duration-300 space-y-4 group">
              <div className="w-12 h-12 rounded-2xl bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <HeartHandshake className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-widest">
                  Árabe & Turco • Adab / Adap
                </span>
                <h3 className="text-xl font-black text-white">Ética, Respeito & Clareza</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                No oriente, <em>Adab</em> descreve conduta moral irretocável, etiqueta, respeito e honradez.
                Isso traduz nossa exigência de um software transparente, sem pegadinhas contratuais e com respeito
                integral ao trabalhador de campo. Aqui, a decisão de descontar um vale é humana e justa,
                construindo relações de profunda confiança.
              </p>
              <div className="pt-2 text-[11px] font-semibold text-amber-300/80 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Human-in-the-Loop com sensibilidade de equipe</span>
              </div>
            </div>

            {/* Pilar 3: GADA */}
            <div className="relative p-8 rounded-3xl bg-slate-900/70 border border-slate-800/90 hover:border-cyan-500/40 transition-all duration-300 space-y-4 group">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6 text-cyan-400" />
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-widest">
                  Sânscrito • गदा (Gada)
                </span>
                <h3 className="text-xl font-black text-white">Solidez & O Guardião</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Na tradição clássica, a <em>Gada</em> é a insígnia da força absoluta, autoridade justa e proteção
                inabalável. Essa raiz se materializa na figura do <strong>Bulldog Guardião</strong> em nosso emblema:
                um guardião vigilante e incansável da infraestrutura, dos dados contábeis e da segurança jurídica
                das obras contra fraudes e contestações.
              </p>
              <div className="pt-2 text-[11px] font-semibold text-cyan-300/80 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Proteção criptográfica e prova pericial SHA-256</span>
              </div>
            </div>
          </div>
        </div>

        {/* O Simbolismo do Emblema (Hexágono + Bulldog Nobre) */}
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
                Anatomia Visual da Marca
              </span>
              <h3 className="text-2xl font-black text-white">Por que o Bulldog Geométrico e o Escudo?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                O bulldog não foi escolhido por agressividade, mas pela nobreza de sua lealdade, firmeza de postura
                e determinação inabalável. No nosso logotipo:
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <span className="text-cyan-400 font-bold block text-sm">Escudo Hexagonal</span>
                <span className="text-slate-400 text-[11px]">Estrutura estável da geometria natural e blindagem digital de dados.</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <span className="text-amber-400 font-bold block text-sm">Nodos Conectados</span>
                <span className="text-slate-400 text-[11px]">Conectividade fluida entre a obra volante e o escritório central.</span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>Inspirado na família • Criado para transformar a gestão de campo</span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              GADAP TECNOLOGIA • EST. 2026
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
