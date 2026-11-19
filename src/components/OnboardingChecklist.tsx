'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { getActiveTenantFromBrowser, TENANTS, type TenantConfig } from '@/lib/tenant';

interface StepItem {
  id: string;
  titulo: string;
  descricao: string;
  href: string;
  cta: string;
}

export default function OnboardingChecklist() {
  const [tenant, setTenant] = useState<TenantConfig>(TENANTS.jhonton);
  const [concluidos, setConcluidos] = useState<string[]>([]);
  const [recolhido, setRecolhido] = useState<boolean>(false);
  const [oculto, setOculto] = useState<boolean>(true);

  useEffect(() => {
    const t = getActiveTenantFromBrowser();
    setTenant(t);
    try {
      const dismissed = localStorage.getItem(`onboarding_dismissed_${t.slug}`);
      const saved = localStorage.getItem(`onboarding_steps_${t.slug}`);
      if (saved) setConcluidos(JSON.parse(saved) as string[]);
      setOculto(dismissed === 'true');
    } catch {
      setOculto(false);
    }
  }, []);

  const steps: StepItem[] =
    tenant.modo === 'EMPREITA'
      ? [
          {
            id: 'grupos',
            titulo: '1. Vincular grupos do WhatsApp às obras',
            descricao: 'Conecte cada grupo de obra à empresa e ambiente (Interno/Externo).',
            href: '/config-geral',
            cta: 'Abrir Hub',
          },
          {
            id: 'proposta',
            titulo: '2. Subir PDF da proposta da obra',
            descricao: 'A IA extrai etapas e pesos automaticamente para acompanhar medições.',
            href: '/medicoes',
            cta: 'Subir Proposta',
          },
          {
            id: 'efetivo',
            titulo: '3. Conferir efetivo do dia',
            descricao: 'Valide presença (Dia Inteiro / Meio Dia) por mensagem recebida.',
            href: '/validacoes',
            cta: 'Ver Fila',
          },
          {
            id: 'diario',
            titulo: '4. Gerar primeiro Diário de Obra (2–3 fotos)',
            descricao: 'Salve o resumo refinado por IA e envie o PDF direto no WhatsApp.',
            href: '/diario-obra',
            cta: 'Criar Diário',
          },
        ]
      : [
          {
            id: 'whatsapp',
            titulo: '1. Conectar conta do WhatsApp',
            descricao: 'Emparelhe via Pairing Code (8 dígitos) ou QR Code.',
            href: '/whatsapp',
            cta: 'Conectar',
          },
          {
            id: 'setup',
            titulo: '2. Conferir obras, equipes e apelidos',
            descricao: 'Cadastre apelidos de campo para a IA reconhecer automaticamente.',
            href: '/setup',
            cta: 'Abrir Setup',
          },
          {
            id: 'validacoes',
            titulo: '3. Aprovar mensagens pendentes',
            descricao: 'Revise cada card por horário e valide diárias e vales.',
            href: '/validacoes',
            cta: 'Validar',
          },
          {
            id: 'fechamento',
            titulo: '4. Conferir Fechamento & Pagamentos (PIX)',
            descricao: 'Escolha quais vales descontar e gere o PIX Copia e Cola.',
            href: '/bordero',
            cta: 'Fechamento',
          },
        ];

  if (oculto) return null;

  function toggleStep(id: string) {
    const next = concluidos.includes(id)
      ? concluidos.filter((x) => x !== id)
      : [...concluidos, id];
    setConcluidos(next);
    try {
      localStorage.setItem(`onboarding_steps_${tenant.slug}`, JSON.stringify(next));
    } catch {}
  }

  function handleDispensar() {
    setOculto(true);
    try {
      localStorage.setItem(`onboarding_dismissed_${tenant.slug}`, 'true');
    } catch {}
  }

  const progresso = Math.round((concluidos.length / steps.length) * 100);

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Primeiros Passos • {tenant.nome} ({concluidos.length} de {steps.length} concluídos)
            </h3>
            <div className="w-48 h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRecolhido((p) => !p)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
            aria-label={recolhido ? 'Expandir checklist' : 'Recolher checklist'}
          >
            {recolhido ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={handleDispensar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
            title="Ocultar guia de primeiros passos"
            aria-label="Ocultar checklist"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!recolhido && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {steps.map((s) => {
            const done = concluidos.includes(s.id);
            return (
              <div
                key={s.id}
                className={`p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                  done
                    ? 'bg-emerald-50/40 border-emerald-200/70'
                    : 'bg-white border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => toggleStep(s.id)}
                    className="mt-0.5 text-emerald-600 shrink-0"
                    aria-label={`Marcar etapa ${s.titulo}`}
                  >
                    {done ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300 hover:text-emerald-500" />
                    )}
                  </button>
                  <div>
                    <p
                      className={`text-xs font-bold ${
                        done ? 'line-through text-slate-400' : 'text-slate-900'
                      }`}
                    >
                      {s.titulo}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {s.descricao}
                    </p>
                  </div>
                </div>

                <Link
                  href={s.href}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold shrink-0 flex items-center gap-1"
                >
                  <span>{s.cta}</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
