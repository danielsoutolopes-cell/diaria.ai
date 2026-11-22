'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  Banknote,
  Calendar,
  CloudRain,
  FlaskConical,
  GitFork,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

interface ExtratoDiariaItem {
  id: string;
  data: string;
  obra: string;
  fracao: number;
  valor: number;
  status: string;
  isChuva: boolean;
  isRateio: boolean;
  observacao: string;
}

interface ExtratoValeItem {
  id: string;
  data: string;
  obra: string;
  valor: number;
  status: string;
  solicitadoPor: string;
  observacao: string;
}

interface ExtratoPortalResponse {
  success?: boolean;
  emHomologacao?: boolean;
  empresaNome: string;
  trabalhador: string;
  periodoDias: number;
  validoAteIso: string;
  resumo: {
    totalDiariasQtd: number;
    totalDiariasValor: number;
    totalValesValor: number;
    liquidoEstimado: number;
    qtdDiasChuva: number;
    qtdRateios: number;
  };
  diarias: ExtratoDiariaItem[];
  vales: ExtratoValeItem[];
  error?: string;
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ExtratoColaboradorPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || '';
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<ExtratoPortalResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      if (!token) {
        setErro('Link inválido.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/extrato-colaborador?token=${encodeURIComponent(token)}`,
          { cache: 'no-store' }
        );
        const json = (await res.json()) as ExtratoPortalResponse;
        if (!res.ok || !json.success) {
          setErro(json.error || 'Não foi possível abrir seu extrato.');
          return;
        }
        setDados(json);
      } catch {
        setErro('Erro de conexão ao carregar o extrato.');
      } finally {
        setLoading(false);
      }
    }
    void carregar();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          <p className="text-sm font-bold">Validando link seguro do extrato...</p>
        </div>
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-rose-200 shadow-sm p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <h1 className="text-lg font-black text-slate-950">
            Link indisponível
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            {erro || 'Este link expirou ou foi desativado pela administração.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header Mobile-First */}
        <div className="bg-slate-950 text-white rounded-3xl p-6 space-y-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40">
              <FlaskConical className="w-3 h-3" />
              <span>EM HOMOLOGAÇÃO</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Link Seguro (Sem Login)</span>
            </span>
          </div>

          <div>
            <p className="text-xs text-slate-400">{dados.empresaNome}</p>
            <h1 className="text-2xl font-black tracking-tight mt-0.5">
              Extrato de {dados.trabalhador}
            </h1>
            <p className="text-[11px] text-slate-400 mt-1">
              Últimos {dados.periodoDias} dias • Válido até{' '}
              {new Date(dados.validoAteIso).toLocaleDateString('pt-BR')}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
            <div className="bg-white/10 rounded-2xl p-3">
              <span className="text-[10px] text-slate-300 block">Diárias</span>
              <span className="text-base font-black tabular-nums">
                {dados.resumo.totalDiariasQtd}d
              </span>
            </div>
            <div className="bg-white/10 rounded-2xl p-3">
              <span className="text-[10px] text-slate-300 block">Bruto</span>
              <span className="text-base font-black tabular-nums">
                {formatBRL(dados.resumo.totalDiariasValor)}
              </span>
            </div>
            <div className="bg-white/10 rounded-2xl p-3">
              <span className="text-[10px] text-rose-300 block">Vales</span>
              <span className="text-base font-black text-rose-300 tabular-nums">
                -{formatBRL(dados.resumo.totalValesValor)}
              </span>
            </div>
            <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-2xl p-3">
              <span className="text-[10px] text-emerald-200 block">Líquido</span>
              <span className="text-base font-black text-emerald-300 tabular-nums">
                {formatBRL(dados.resumo.liquidoEstimado)}
              </span>
            </div>
          </div>
        </div>

        {/* Diárias Computadas */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Diárias Computadas ({dados.diarias.length})</span>
            </h2>
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
              {dados.resumo.qtdDiasChuva > 0 && (
                <span className="inline-flex items-center gap-1 text-sky-700">
                  <CloudRain className="w-3.5 h-3.5" />
                  {dados.resumo.qtdDiasChuva} chuva
                </span>
              )}
              {dados.resumo.qtdRateios > 0 && (
                <span className="inline-flex items-center gap-1 text-indigo-700">
                  <GitFork className="w-3.5 h-3.5" />
                  {dados.resumo.qtdRateios} rateio
                </span>
              )}
            </div>
          </div>

          {dados.diarias.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Nenhuma diária registrada neste período.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {dados.diarias.map((d) => (
                <div
                  key={d.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900 tabular-nums">
                        {d.data}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                        {d.obra}
                      </span>
                      {d.isChuva && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                          Chuva R$ 120
                        </span>
                      )}
                      {d.isRateio && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Rateio ½+½
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {d.fracao === 0.5 ? '½ diária' : `${d.fracao} diária`} •{' '}
                      {d.observacao}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-sm font-black text-slate-950 tabular-nums block">
                      {formatBRL(d.valor)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {d.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vales Descontados */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Banknote className="w-4 h-4 text-rose-600" />
              <span>Vales Registrados ({dados.vales.length})</span>
            </h2>
          </div>

          {dados.vales.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Nenhum vale descontado neste período.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {dados.vales.map((v) => (
                <div
                  key={v.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-black text-slate-900 tabular-nums">
                      {v.data} • {v.obra}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Solicitado por {v.solicitadoPor} • {v.observacao}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-black text-rose-600 tabular-nums block">
                      -{formatBRL(v.valor)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {v.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
