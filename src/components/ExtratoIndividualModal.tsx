'use client';

import React, { useState } from 'react';

export interface ExtratoObraResumo {
  nome?: string | null;
  tipo_obra?: string | null;
}

export interface ExtratoLancamentoItem {
  id: string;
  nome_trabalhador: string;
  tipo_lancamento: string;
  fracao_dia?: number | string | null;
  valor_monetario?: number | string | null;
  status: string;
  data_referencia: string;
  created_at?: string | null;
  observacao?: string | null;
  comprovante_url?: string | null;
  obras_config?: ExtratoObraResumo | ExtratoObraResumo[] | null;
}

export interface ExtratoIndividualModalProps {
  nome: string;
  chavePix: string;
  lancamentos: ExtratoLancamentoItem[];
  onClose: () => void;
  onAtualizar: () => Promise<void>;
}

interface AcaoExtratoState {
  tipo: 'EDITAR' | 'EXCLUIR';
  item: ExtratoLancamentoItem;
  novoValor: string;
  novaFracao: string;
  novaData: string;
  novaObservacao: string;
  prefixoPatricia: string;
  prefixoDaniel: string;
  pinPatricia: string;
  pinDaniel: string;
  exigeDuplaAlcada: boolean;
  erro: string | null;
  salvando: boolean;
}

function extrairNomeObra(
  obrasConfig: ExtratoObraResumo | ExtratoObraResumo[] | null | undefined
): string {
  if (!obrasConfig) return 'Geral';
  if (Array.isArray(obrasConfig)) return obrasConfig[0]?.nome || 'Geral';
  return obrasConfig.nome || 'Geral';
}

function verificarMaisDe24Horas(item: ExtratoLancamentoItem): boolean {
  const agora = Date.now();
  const vinteQuatroHorasMs = 24 * 60 * 60 * 1000;
  if (item.created_at) {
    const ts = Date.parse(item.created_at);
    if (!Number.isNaN(ts)) {
      return agora - ts > vinteQuatroHorasMs;
    }
  }
  const tsRef = Date.parse(`${item.data_referencia}T12:00:00-03:00`);
  if (!Number.isNaN(tsRef)) {
    return agora - tsRef > vinteQuatroHorasMs;
  }
  return false;
}

export default function ExtratoIndividualModal({
  nome,
  chavePix,
  lancamentos,
  onClose,
  onAtualizar,
}: ExtratoIndividualModalProps) {
  const [acaoExtrato, setAcaoExtrato] = useState<AcaoExtratoState | null>(null);

  async function iniciarAcao(
    tipo: 'EDITAR' | 'EXCLUIR',
    item: ExtratoLancamentoItem
  ) {
    const passou24h = verificarMaisDe24Horas(item);
    let prefPat = '';
    let prefDan = '';
    if (passou24h) {
      try {
        const r = await fetch('/api/dupla-alcada/pin?prefixos=1', {
          cache: 'no-store',
        });
        const d = (await r.json()) as {
          prefixoPatricia?: string;
          prefixoDaniel?: string;
        };
        prefPat = d.prefixoPatricia || '';
        prefDan = d.prefixoDaniel || '';
      } catch {
        // fallback: backend ainda validará
      }
    }

    setAcaoExtrato({
      tipo,
      item,
      novoValor: String(Number(item.valor_monetario || 0)),
      novaFracao: String(Number(item.fracao_dia || 1)),
      novaData: item.data_referencia,
      novaObservacao: item.observacao || '',
      prefixoPatricia: prefPat,
      prefixoDaniel: prefDan,
      pinPatricia: '',
      pinDaniel: '',
      exigeDuplaAlcada: passou24h,
      erro: null,
      salvando: false,
    });
  }

  async function confirmarAcao() {
    if (!acaoExtrato) return;
    setAcaoExtrato((prev) =>
      prev ? { ...prev, salvando: true, erro: null } : null
    );

    try {
      const endpoint =
        acaoExtrato.tipo === 'EDITAR'
          ? '/api/lancamentos/editar'
          : '/api/lancamentos/excluir';

      const pinPat8 =
        acaoExtrato.pinPatricia.length === 4 && acaoExtrato.prefixoPatricia
          ? `${acaoExtrato.prefixoPatricia}${acaoExtrato.pinPatricia}`
          : acaoExtrato.pinPatricia || undefined;
      const pinDan8 =
        acaoExtrato.pinDaniel.length === 4 && acaoExtrato.prefixoDaniel
          ? `${acaoExtrato.prefixoDaniel}${acaoExtrato.pinDaniel}`
          : acaoExtrato.pinDaniel || undefined;

      const payload =
        acaoExtrato.tipo === 'EDITAR'
          ? {
              lancamentoId: acaoExtrato.item.id,
              novoValor: Number(acaoExtrato.novoValor),
              novaFracao: Number(acaoExtrato.novaFracao),
              novaData: acaoExtrato.novaData,
              novaObservacao: acaoExtrato.novaObservacao,
              confirmarSobrescrita: true,
              pinPatricia: pinPat8,
              pinDaniel: pinDan8,
            }
          : {
              lancamentoId: acaoExtrato.item.id,
              pinPatricia: pinPat8,
              pinDaniel: pinDan8,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        exigeDuplaAlcada?: boolean;
      };

      if (!res.ok) {
        let prefPat = acaoExtrato.prefixoPatricia;
        let prefDan = acaoExtrato.prefixoDaniel;
        if (data.exigeDuplaAlcada && (!prefPat || !prefDan)) {
          try {
            const r = await fetch('/api/dupla-alcada/pin?prefixos=1', {
              cache: 'no-store',
            });
            const d = (await r.json()) as {
              prefixoPatricia?: string;
              prefixoDaniel?: string;
            };
            prefPat = d.prefixoPatricia || prefPat;
            prefDan = d.prefixoDaniel || prefDan;
          } catch {
            // ignora
          }
        }
        setAcaoExtrato((prev) =>
          prev
            ? {
                ...prev,
                salvando: false,
                prefixoPatricia: prefPat,
                prefixoDaniel: prefDan,
                exigeDuplaAlcada:
                  data.exigeDuplaAlcada || prev.exigeDuplaAlcada,
                erro: data.error || 'Não foi possível concluir a operação.',
              }
            : null
        );
        return;
      }

      setAcaoExtrato(null);
      await onAtualizar();
    } catch {
      setAcaoExtrato((prev) =>
        prev ? { ...prev, salvando: false, erro: 'Erro de conexão.' } : null
      );
    }
  }

  const itensColaborador = lancamentos.filter(
    (l) => l.nome_trabalhador?.trim().toLowerCase() === nome.trim().toLowerCase()
  );

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-950">{nome}</h3>
            <p className="text-xs text-slate-500">
              Extrato individual dia a dia • PIX:{' '}
              <span className="font-mono">{chavePix || 'Não informada'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"
          >
            Fechar
          </button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
          {acaoExtrato && (
            <div className="mb-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-slate-900">
                  {acaoExtrato.tipo === 'EDITAR'
                    ? `Editar lançamento (${acaoExtrato.item.data_referencia})`
                    : `Confirmar exclusão (${acaoExtrato.item.data_referencia})`}
                </h4>
                <button
                  type="button"
                  onClick={() => setAcaoExtrato(null)}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                >
                  Cancelar
                </button>
              </div>

              {acaoExtrato.tipo === 'EDITAR' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600">
                      Valor (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={acaoExtrato.novoValor}
                      onChange={(e) =>
                        setAcaoExtrato((prev) =>
                          prev ? { ...prev, novoValor: e.target.value } : null
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600">
                      Fração
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={acaoExtrato.novaFracao}
                      onChange={(e) =>
                        setAcaoExtrato((prev) =>
                          prev ? { ...prev, novaFracao: e.target.value } : null
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600">
                      Data
                    </label>
                    <input
                      type="date"
                      value={acaoExtrato.novaData}
                      onChange={(e) =>
                        setAcaoExtrato((prev) =>
                          prev ? { ...prev, novaData: e.target.value } : null
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-600">
                      Motivo / Observação
                    </label>
                    <input
                      type="text"
                      value={acaoExtrato.novaObservacao}
                      onChange={(e) =>
                        setAcaoExtrato((prev) =>
                          prev
                            ? { ...prev, novaObservacao: e.target.value }
                            : null
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                    />
                  </div>
                </div>
              )}

              {acaoExtrato.exigeDuplaAlcada && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-amber-900">
                      🔒 Registro &gt; 24h — Exige Dupla Alçada (2 chaves de 8
                      dígitos • 3 min)
                    </span>
                    <a
                      href="/chaves-autorizacao"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-black text-emerald-700 underline"
                    >
                      Abrir Tela de PIN (3 min) ↗
                    </a>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white">
                      <span className="text-[11px] font-mono font-black text-slate-500 shrink-0">
                        Patrícia: {acaoExtrato.prefixoPatricia || '••••'}-
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="4 últimos"
                        value={acaoExtrato.pinPatricia}
                        onChange={(e) =>
                          setAcaoExtrato((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  pinPatricia: e.target.value
                                    .replace(/\D/g, '')
                                    .slice(0, 8),
                                }
                              : null
                          )
                        }
                        className="w-full text-xs font-mono font-black tracking-widest outline-none text-slate-950"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white">
                      <span className="text-[11px] font-mono font-black text-slate-500 shrink-0">
                        Daniel: {acaoExtrato.prefixoDaniel || '••••'}-
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="4 últimos"
                        value={acaoExtrato.pinDaniel}
                        onChange={(e) =>
                          setAcaoExtrato((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  pinDaniel: e.target.value
                                    .replace(/\D/g, '')
                                    .slice(0, 8),
                                }
                              : null
                          )
                        }
                        className="w-full text-xs font-mono font-black tracking-widest outline-none text-slate-950"
                      />
                    </div>
                  </div>
                </div>
              )}

              {acaoExtrato.erro && (
                <p className="text-[11px] font-bold text-rose-700">
                  {acaoExtrato.erro}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={acaoExtrato.salvando}
                  onClick={() => void confirmarAcao()}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 ${
                    acaoExtrato.tipo === 'EXCLUIR'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-700 hover:bg-emerald-800'
                  }`}
                >
                  {acaoExtrato.salvando
                    ? 'Processando...'
                    : acaoExtrato.tipo === 'EDITAR'
                      ? 'Confirmar Edição'
                      : 'Confirmar Exclusão'}
                </button>
              </div>
            </div>
          )}

          {itensColaborador.map((l) => (
            <div
              key={l.id}
              className="py-3 flex items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-900">
                    {l.data_referencia}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                    {extrairNomeObra(l.obras_config)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      l.tipo_lancamento === 'VALE'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {l.tipo_lancamento} ({l.fracao_dia || 1}x)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {l.observacao || 'Apontamento de campo'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-slate-900 tabular-nums">
                  R$ {Number(l.valor_monetario || 0).toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => void iniciarAcao('EDITAR', l)}
                  className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 rounded-lg font-bold text-[11px] border border-slate-200 transition-all"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => void iniciarAcao('EXCLUIR', l)}
                  className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 rounded-lg font-bold text-[11px] border border-rose-200/70 transition-all"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
