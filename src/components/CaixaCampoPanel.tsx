'use client';

import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Trash2,
  Plus,
  Sparkles,
  Camera,
  ArrowRightCircle,
  Clock,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';

import { formatarNomeExibicaoTrabalhador } from '@/lib/normalizarObra';
import {
  EMISSORES_PIX_PADRAO,
  formatarDataHoraBr,
  LABELS_ORIGEM_RASTREABILIDADE,
  montarDataHoraEnvioIso,
  obterDataHoraBrasilia,
  type OrigemRastreabilidadeCaixinha,
} from '@/lib/caixinhaPixRastreabilidade';

interface MovimentoCaixaCampo {
  id: string;
  encarregado: string;
  encarregadoOrigem?: string;
  obra: string;
  data: string;
  hora: string;
  dataHoraEnvio?: string | null;
  tipo: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO';
  categoria: string;
  descricao: string;
  valor: number;
  status: 'PENDENTE' | 'APROVADO';
  isPreImplantacao?: boolean;
  enviadoPor: string;
  emissorPix?: string | null;
  origemEmissor?: OrigemRastreabilidadeCaixinha | null;
  origemDataHora?: OrigemRastreabilidadeCaixinha | null;
}

interface ContaEncarregado {
  encarregado: string;
  aliasesUnificados?: string[];
  possuiPreImplantacao?: boolean;
  totalRecebido: number;
  totalComprovado: number;
  totalDevolvido: number;
  saldoEmMaos: number;
  movimentos: MovimentoCaixaCampo[];
}

interface LeituraOcrResponse {
  tipo?: 'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO';
  valor?: number;
  categoria?: string;
  descricao?: string;
  destinatario?: string | null;
  emissorPix?: string | null;
  origemEmissor?: OrigemRastreabilidadeCaixinha;
  labelOrigemEmissor?: string;
  data?: string;
  hora?: string;
  dataHoraEnvio?: string;
  origemDataHora?: OrigemRastreabilidadeCaixinha;
  labelOrigemDataHora?: string;
  comprovanteCortado?: boolean;
}

interface CaixaCampoPanelProps {
  onDadosAtualizados?: () => void;
}

export default function CaixaCampoPanel({
  onDadosAtualizados,
}: CaixaCampoPanelProps) {
  const [contas, setContas] = useState<ContaEncarregado[]>([]);
  const [funcionarios, setFuncionarios] = useState<string[]>([]);
  const [obras, setObras] = useState<string[]>([]);
  const [emissoresPix, setEmissoresPix] = useState<string[]>([
    ...EMISSORES_PIX_PADRAO,
  ]);
  const [loading, setLoading] = useState(true);
  const [lendoIA, setLendoIA] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pdfMenuAberto, setPdfMenuAberto] = useState<string | null>(null);
  const [enviandoPdfPara, setEnviandoPdfPara] = useState<string | null>(null);

  // Form rápido com Portador x Emissor do PIX + Data e Hora (HH:MM)
  const [encarregado, setEncarregado] = useState('');
  const [emissorPix, setEmissorPix] = useState<string>('Patrícia');
  const [obra, setObra] = useState('');
  const [dataMov, setDataMov] = useState(() => obterDataHoraBrasilia().data);
  const [horaMov, setHoraMov] = useState(() => obterDataHoraBrasilia().hora);
  const [tipo, setTipo] = useState<
    'ENTRADA_PIX' | 'NOTA_DESPESA' | 'DEVOLUCAO_TROCO'
  >('ENTRADA_PIX');
  const [categoria, setCategoria] = useState('Suprimento PIX');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [filtroConta, setFiltroConta] = useState<string>('TODOS');
  const [origemEmissor, setOrigemEmissor] =
    useState<OrigemRastreabilidadeCaixinha>('MANUAL');
  const [origemDataHora, setOrigemDataHora] =
    useState<OrigemRastreabilidadeCaixinha>('MANUAL');
  const [ocrRastreio, setOcrRastreio] = useState<{
    comprovanteCortado: boolean;
    labelOrigemEmissor: string;
    labelOrigemDataHora: string;
  } | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const [resCaixa, resFuncs, resObras] = await Promise.all([
        fetch('/api/caixa-campo', { cache: 'no-store' }),
        fetch('/api/funcionarios', { cache: 'no-store' }),
        fetch('/api/obras', { cache: 'no-store' }),
      ]);
      const dCaixa = (await resCaixa.json()) as {
        contas?: ContaEncarregado[];
        emissoresPix?: string[];
      };
      const dFuncs = (await resFuncs.json()) as {
        funcionarios?: Array<{ nome_trabalhador: string }>;
      };
      const dObras = (await resObras.json()) as {
        obras?: Array<{ nome: string }>;
      };

      setContas(dCaixa.contas || []);
      if (Array.isArray(dCaixa.emissoresPix) && dCaixa.emissoresPix.length > 0) {
        setEmissoresPix(dCaixa.emissoresPix);
      }

      const listaFuncs = Array.from(
        new Set(
          (dFuncs.funcionarios || [])
            .map((f) =>
              f.nome_trabalhador?.trim()
                ? formatarNomeExibicaoTrabalhador(f.nome_trabalhador)
                : ''
            )
            .filter(Boolean)
        )
      );
      setFuncionarios(listaFuncs);
      if (!encarregado && listaFuncs.length > 0) setEncarregado(listaFuncs[0]);

      const listaObras = Array.from(
        new Set(
          (dObras.obras || []).map((o) => o.nome?.trim()).filter(Boolean)
        )
      );
      setObras(listaObras);
      if (!obra && listaObras.length > 0) setObra(listaObras[0]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function mostrarAviso(msg: string) {
    setAviso(msg);
    setTimeout(() => setAviso(null), 5000);
  }

  async function handleLerFotoIA(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLendoIA(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        if (typeof reader.result !== 'string') return;
        const res = await fetch('/api/caixa-campo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ler-nota-ia',
            imagemBase64: reader.result,
            imagemMimeType: file.type || 'image/jpeg',
            arquivoLastModifiedMs: file.lastModified || null,
          }),
        });
        const d = (await res.json()) as {
          leitura?: LeituraOcrResponse;
          error?: string;
        };
        if (!res.ok || !d.leitura) {
          setAviso(`Não foi possível ler o arquivo com IA: ${d.error || `HTTP ${res.status}`}`);
          return;
        }
        if (d.leitura) {
          const l = d.leitura;
          if (l.tipo) setTipo(l.tipo);
          if (l.valor) setValor(String(l.valor));
          if (l.categoria) setCategoria(l.categoria);
          if (l.descricao) setDescricao(l.descricao);
          if (l.data) setDataMov(l.data);
          if (l.hora) setHoraMov(l.hora);

          if (l.destinatario) {
            const destNorm = formatarNomeExibicaoTrabalhador(l.destinatario);
            const matchColab = funcionarios.find(
              (f) => f.toLowerCase() === destNorm.toLowerCase()
            );
            if (matchColab) setEncarregado(matchColab);
          }

          if (l.emissorPix) {
            setEmissorPix(l.emissorPix);
            setEmissoresPix((prev) =>
              prev.includes(l.emissorPix as string)
                ? prev
                : [...prev, l.emissorPix as string]
            );
          }

          const origEm = l.origemEmissor || 'OCR_COMPROVANTE';
          const origDt = l.origemDataHora || 'OCR_COMPROVANTE';
          setOrigemEmissor(origEm);
          setOrigemDataHora(origDt);
          setOcrRastreio({
            comprovanteCortado: Boolean(l.comprovanteCortado),
            labelOrigemEmissor:
              l.labelOrigemEmissor || LABELS_ORIGEM_RASTREABILIDADE[origEm],
            labelOrigemDataHora:
              l.labelOrigemDataHora || LABELS_ORIGEM_RASTREABILIDADE[origDt],
          });

          mostrarAviso(
            l.comprovanteCortado
              ? 'Comprovante cortado detectado: Emissor e/ou Horário preenchidos por fallback inteligente. Confira e ajuste se necessário antes de lançar.'
              : 'Leitura automática concluída! Confira Emissor, Data/Hora e clique em + para lançar.'
          );
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLendoIA(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleRegistrar(e: React.FormEvent) {
    e.preventDefault();
    if (!encarregado || !descricao.trim() || !valor) return;
    const horaLimpa = horaMov || obterDataHoraBrasilia().hora;
    const dataHoraEnvio = montarDataHoraEnvioIso(dataMov, horaLimpa);

    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'registrar',
        encarregado,
        emissorPix: tipo === 'ENTRADA_PIX' ? emissorPix || 'Patrícia' : null,
        obra: obra || 'GERAL',
        data: dataMov,
        hora: horaLimpa,
        dataHoraEnvio,
        tipo,
        categoria:
          tipo === 'ENTRADA_PIX'
            ? 'Suprimento PIX'
            : categoria || 'Material',
        descricao,
        valor: Number(valor.replace(',', '.')),
        origemEmissor,
        origemDataHora,
      }),
    });
    setDescricao('');
    setValor('');
    setOcrRastreio(null);
    setOrigemEmissor('MANUAL');
    setOrigemDataHora('MANUAL');
    mostrarAviso('Movimento registrado na Conta Corrente de Caixa de Campo.');
    await carregar();
    onDadosAtualizados?.();
  }

  async function handleLiquidarDireto(c: ContaEncarregado) {
    if (c.saldoEmMaos === 0) return;
    const isTroco = c.saldoEmMaos > 0;
    const agoraBr = obterDataHoraBrasilia();
    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'registrar',
        encarregado: c.encarregado,
        emissorPix: isTroco ? null : emissorPix || 'Patrícia',
        obra: c.movimentos[0]?.obra || obra || 'GERAL',
        data: agoraBr.data,
        hora: agoraBr.hora,
        dataHoraEnvio: montarDataHoraEnvioIso(agoraBr.data, agoraBr.hora),
        tipo: isTroco ? 'DEVOLUCAO_TROCO' : 'ENTRADA_PIX',
        categoria: isTroco ? 'Devolução de Troco' : 'Pagamento de Reembolso',
        descricao: isTroco
          ? `Devolução de troco via PIX (${c.encarregado})`
          : `Quitação de reembolso via PIX avulso (${c.encarregado})`,
        valor: Math.abs(c.saldoEmMaos),
        origemEmissor: 'MANUAL',
        origemDataHora: 'MANUAL',
      }),
    });
    mostrarAviso(
      isTroco
        ? `Devolução de troco de R$ ${Math.abs(c.saldoEmMaos).toFixed(2)} registrada!`
        : `Reembolso de R$ ${Math.abs(c.saldoEmMaos).toFixed(2)} quitado via PIX!`
    );
    await carregar();
    onDadosAtualizados?.();
  }

  async function handleLevarParaFechamento(c: ContaEncarregado) {
    if (c.saldoEmMaos === 0) return;
    const res = await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'levar-fechamento',
        encarregado: c.encarregado,
        obra: c.movimentos[0]?.obra || obra || 'GERAL',
        valor: c.saldoEmMaos,
      }),
    });
    const d = (await res.json()) as { message?: string };
    if (d.message) mostrarAviso(d.message);
    await carregar();
    onDadosAtualizados?.();
  }

  async function handleExtratoPdf(
    c: ContaEncarregado,
    acao: 'BAIXAR' | 'ENVIAR_ZAP',
    destinatarioTipo?: 'COLABORADOR' | 'PATRICIA' | 'DANIEL' | 'JOABSON'
  ) {
    setEnviandoPdfPara(c.encarregado);
    setAviso(null);
    try {
      const res = await fetch('/api/caixa-campo/extrato-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao,
          destinatarioTipo,
          colaborador: c.encarregado,
          totalRecebido: c.totalRecebido,
          totalNotas: c.totalComprovado,
          saldoFinal: c.saldoEmMaos,
          movimentos: c.movimentos.map((m) => ({
            data: m.data,
            hora: m.hora,
            obra: m.obra,
            tipo: m.tipo,
            descricao: m.descricao,
            emissorPix: m.emissorPix,
            valor: m.valor,
          })),
        }),
      });
      const d = (await res.json()) as {
        pdfBase64?: string;
        fileName?: string;
        enviadoViaWhatsApp?: boolean;
        message?: string;
        error?: string;
      };
      if (d.error) {
        setAviso(d.error);
        return;
      }
      if (d.message) setAviso(d.message);
      if ((acao === 'BAIXAR' || !d.enviadoViaWhatsApp) && d.pdfBase64 && d.fileName) {
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${d.pdfBase64}`;
        a.download = d.fileName;
        a.click();
      }
      setPdfMenuAberto(null);
    } finally {
      setEnviandoPdfPara(null);
    }
  }

  function handleCopiarExtratoZap(c: ContaEncarregado) {
    const linhas = c.movimentos
      .map((m) => {
        const dtBr = formatarDataHoraBr(m.data, m.hora);
        const emissorInfo =
          m.tipo === 'ENTRADA_PIX' && (m.emissorPix || m.enviadoPor)
            ? ` | PIX de ${m.emissorPix || m.enviadoPor}`
            : '';
        return `${m.tipo === 'ENTRADA_PIX' ? '🟢 +' : '🔴 −'}R$ ${Number(m.valor).toFixed(2)} | ${dtBr}${emissorInfo} — ${m.descricao} (${m.obra})`;
      })
      .join('\n');
    const resumoSaldo =
      c.saldoEmMaos > 0
        ? `Troco em mãos: R$ ${c.saldoEmMaos.toFixed(2)}`
        : c.saldoEmMaos < 0
          ? `Reembolso a receber: R$ ${Math.abs(c.saldoEmMaos).toFixed(2)}`
          : 'Saldo zerado ✓';
    const texto =
      `📋 *EXTRATO CAIXA DE CAMPO — ${c.encarregado.toUpperCase()}*\n` +
      `Recebido: R$ ${c.totalRecebido.toFixed(2)} | Notas: R$ ${c.totalComprovado.toFixed(2)}\n` +
      `⚖️ *${resumoSaldo}*\n\n${linhas}`;
    void navigator.clipboard.writeText(texto);
    mostrarAviso(`Extrato de ${c.encarregado} copiado para o WhatsApp!`);
  }

  async function handleAprovar(id: string) {
    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'aprovar', id }),
    });
    await carregar();
    onDadosAtualizados?.();
  }

  async function handleExcluir(id: string) {
    await fetch('/api/caixa-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'excluir', id }),
    });
    await carregar();
    onDadosAtualizados?.();
  }

  const isEntradaPix = tipo === 'ENTRADA_PIX';

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden mb-8">
      <div className="px-6 py-4 bg-gradient-to-r from-slate-950 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Wallet className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="text-sm font-black tracking-tight">
              Conta Corrente de Caixa de Campo &amp; Reembolsos
            </h2>
            <p className="text-[11px] text-slate-400">
              Saldo positivo = troco em mãos • Saldo negativo = reembolso a pagar • Liquidação 100% humana
            </p>
          </div>
        </div>

        <label className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all">
          <Camera className="w-3.5 h-3.5" />
          <span>{lendoIA ? 'Lendo arquivo com IA...' : 'Ler Nota / PIX / PDF com IA'}</span>
          <input
            type="file"
            accept="image/*,application/pdf,.pdf"
            onChange={handleLerFotoIA}
            className="hidden"
          />
        </label>
      </div>

      <div className="p-6 space-y-6">
        {aviso && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900">
            {aviso}
          </div>
        )}

        {/* Seção 1: Novo Lançamento */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center">
                1
              </span>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Novo Lançamento (PIX Enviado ou Nota Fiscal)
              </h3>
            </div>

            {ocrRastreio && (
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                {ocrRastreio.comprovanteCortado && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    Comprovante cortado (fallback ativo)
                  </span>
                )}
                {isEntradaPix && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                      origemEmissor === 'OCR_COMPROVANTE'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-900 border-amber-200'
                    }`}
                  >
                    <UserCheck className="w-3 h-3" />
                    Emissor: {LABELS_ORIGEM_RASTREABILIDADE[origemEmissor]}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                    origemDataHora === 'OCR_COMPROVANTE'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-sky-50 text-sky-900 border-sky-200'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  Horário: {LABELS_ORIGEM_RASTREABILIDADE[origemDataHora]}
                </span>
              </div>
            )}
          </div>

          <form
            onSubmit={handleRegistrar}
            className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3"
          >
            {/* Linha 1: Tipo, Portador do Caixinha, Emissor do PIX (quando PIX) e Obra */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className={isEntradaPix ? 'sm:col-span-3' : 'sm:col-span-4'}>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Tipo de Movimento
                </label>
                <select
                  value={tipo}
                  onChange={(e) => {
                    const novoTipo = e.target.value as
                      | 'ENTRADA_PIX'
                      | 'NOTA_DESPESA'
                      | 'DEVOLUCAO_TROCO';
                    setTipo(novoTipo);
                    if (novoTipo === 'ENTRADA_PIX') {
                      setCategoria('Suprimento PIX');
                    } else if (novoTipo === 'NOTA_DESPESA') {
                      setCategoria('Material');
                    } else {
                      setCategoria('Devolução de Troco');
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                >
                  <option value="ENTRADA_PIX">🟢 Entrada PIX</option>
                  <option value="NOTA_DESPESA">🔴 Nota / Despesa</option>
                  <option value="DEVOLUCAO_TROCO">🔵 Devolução Troco</option>
                </select>
              </div>

              <div className={isEntradaPix ? 'sm:col-span-3' : 'sm:col-span-4'}>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Colaborador / Portador do Caixinha
                </label>
                <select
                  value={encarregado}
                  onChange={(e) => setEncarregado(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                >
                  <option value="">Selecionar portador...</option>
                  {funcionarios.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              {isEntradaPix && (
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-emerald-700 mb-1">
                    Emissor / Quem Enviou o PIX
                  </label>
                  <select
                    value={emissorPix}
                    onChange={(e) => {
                      setEmissorPix(e.target.value);
                      setOrigemEmissor('MANUAL');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50/40 text-xs font-bold text-slate-900"
                  >
                    {emissoresPix.map((em) => (
                      <option key={em} value={em}>
                        {em}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={isEntradaPix ? 'sm:col-span-3' : 'sm:col-span-4'}>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Obra / Destino
                </label>
                <select
                  value={obra}
                  onChange={(e) => setObra(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                >
                  <option value="">Obra...</option>
                  {obras.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Linha 2: Data, Hora (HH:MM), Descrição, Valor e Botão Salvar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Data
                </label>
                <input
                  type="date"
                  value={dataMov}
                  onChange={(e) => {
                    setDataMov(e.target.value);
                    setOrigemDataHora('MANUAL');
                  }}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 tabular-nums"
                  title="Data do lançamento (aceita datas retroativas)"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Hora (HH:MM)
                </label>
                <input
                  type="time"
                  value={horaMov}
                  onChange={(e) => {
                    setHoraMov(e.target.value);
                    setOrigemDataHora('MANUAL');
                  }}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 tabular-nums"
                  title="Hora exata do envio/comprovante (HH:MM)"
                />
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Descrição
                </label>
                <input
                  type="text"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder={
                    isEntradaPix
                      ? 'Ex: Suprimento PIX p/ material obra...'
                      : 'Descrição (ex: Aluguel bomba, Material...)'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Valor (R$)
                </label>
                <input
                  type="text"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black tabular-nums"
                />
              </div>

              <div className="sm:col-span-1">
                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center"
                  title="Lançar movimento"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Seção 2: Extrato por Colaborador (Saldos & Liquidação) */}
        {contas.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center">
                2
              </span>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Extrato por Colaborador • Saldos &amp; Liquidação ({contas.length})
              </h3>
            </div>
            <select
              value={filtroConta}
              onChange={(e) => setFiltroConta(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
            >
              <option value="TODOS">
                Todos com lançamentos ({contas.length})
              </option>
              {contas.map((c) => (
                <option key={c.encarregado} value={c.encarregado}>
                  {c.encarregado} —{' '}
                  {c.saldoEmMaos > 0
                    ? `Troco R$ ${c.saldoEmMaos.toFixed(2)}`
                    : c.saldoEmMaos < 0
                      ? `Reembolso R$ ${Math.abs(c.saldoEmMaos).toFixed(2)}`
                      : 'Zerado'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Contas por Encarregado / Colaborador */}
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-24 rounded-2xl bg-slate-100" />
          </div>
        ) : contas.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">
            Nenhum movimento de Caixa de Campo registrado ainda.
          </p>
        ) : (
          contas
            .filter(
              (c) => filtroConta === 'TODOS' || c.encarregado === filtroConta
            )
            .map((c) => (
              <div
                key={c.encarregado}
                className="rounded-2xl border border-slate-200 overflow-hidden"
              >
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-black text-slate-950">
                      {formatarNomeExibicaoTrabalhador(c.encarregado)}
                    </span>
                    {c.possuiPreImplantacao && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Pré-implantação preservada
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 tabular-nums">
                      Recebido: R$ {c.totalRecebido.toFixed(2)}
                    </span>
                    <span className="font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 tabular-nums">
                      Notas: R$ {c.totalComprovado.toFixed(2)}
                    </span>
                    <span
                      className={`font-black px-3 py-1 rounded-lg border tabular-nums ${
                        c.saldoEmMaos > 0
                          ? 'text-amber-900 bg-amber-100 border-amber-300'
                          : c.saldoEmMaos < 0
                            ? 'text-indigo-900 bg-indigo-100 border-indigo-300'
                            : 'text-emerald-900 bg-emerald-100 border-emerald-300'
                      }`}
                    >
                      {c.saldoEmMaos > 0
                        ? `Troco em Mãos: R$ ${c.saldoEmMaos.toFixed(2)}`
                        : c.saldoEmMaos < 0
                          ? `Reembolso a Pagar: R$ ${Math.abs(c.saldoEmMaos).toFixed(2)}`
                          : 'Saldo Zerado ✓'}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleCopiarExtratoZap(c)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold"
                      title="Copiar extrato formatado para enviar no WhatsApp"
                    >
                      📋 Copiar Zap
                    </button>

                    <div className="relative">
                      <button
                        type="button"
                        disabled={enviandoPdfPara === c.encarregado}
                        onClick={() =>
                          setPdfMenuAberto((prev) =>
                            prev === c.encarregado ? null : c.encarregado
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-50"
                        title="Gerar ou enviar PDF formato Extrato Bancário no WhatsApp"
                      >
                        {enviandoPdfPara === c.encarregado
                          ? '⏳ Enviando...'
                          : '📄 PDF Extrato ▾'}
                      </button>

                      {pdfMenuAberto === c.encarregado && (
                        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 text-left">
                          <button
                            type="button"
                            onClick={() => void handleExtratoPdf(c, 'ENVIAR_ZAP', 'COLABORADOR')}
                            className="w-full px-3 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-emerald-50 text-left"
                          >
                            📱 Enviar p/ {c.encarregado}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExtratoPdf(c, 'ENVIAR_ZAP', 'PATRICIA')}
                            className="w-full px-3 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-emerald-50 text-left"
                          >
                            📱 Enviar p/ Patrícia
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExtratoPdf(c, 'ENVIAR_ZAP', 'DANIEL')}
                            className="w-full px-3 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-emerald-50 text-left"
                          >
                            📱 Enviar p/ Daniel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExtratoPdf(c, 'ENVIAR_ZAP', 'JOABSON')}
                            className="w-full px-3 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-emerald-50 text-left"
                          >
                            📱 Enviar p/ Joabson
                          </button>
                          <div className="my-1 border-t border-slate-100" />
                          <button
                            type="button"
                            onClick={() => void handleExtratoPdf(c, 'BAIXAR')}
                            className="w-full px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 text-left"
                          >
                            ⬇️ Baixar PDF Bancário
                          </button>
                        </div>
                      )}
                    </div>

                    {c.saldoEmMaos !== 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleLiquidarDireto(c)}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold"
                        >
                          {c.saldoEmMaos > 0
                            ? '🔵 Devolver Troco'
                            : '🟢 Pagar Reembolso'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLevarParaFechamento(c)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1"
                          title="Levar este saldo opcionalmente para Fechamento & Pagamentos (PIX)"
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                          <span>Levar p/ Fechamento</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {c.movimentos.map((m) => {
                    const emissorExibir =
                      m.tipo === 'ENTRADA_PIX'
                        ? m.emissorPix || m.enviadoPor || 'Patrícia'
                        : null;
                    const origemTag =
                      m.origemEmissor &&
                      m.origemEmissor !== 'MANUAL' &&
                      m.tipo === 'ENTRADA_PIX'
                        ? LABELS_ORIGEM_RASTREABILIDADE[m.origemEmissor]
                        : null;

                    return (
                      <div
                        key={m.id}
                        className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          {m.tipo === 'ENTRADA_PIX' ? (
                            <ArrowDownCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <ArrowUpCircle className="w-4 h-4 text-rose-500 shrink-0" />
                          )}
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-slate-900">
                                {m.descricao}
                              </span>
                              {emissorExibir && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <UserCheck className="w-3 h-3" />
                                  PIX de {emissorExibir}
                                </span>
                              )}
                              {origemTag && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                  {origemTag}
                                </span>
                              )}
                              {m.isPreImplantacao && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                  Pré-implantação
                                </span>
                              )}
                            </div>
                            <span className="text-slate-500 block text-[11px] tabular-nums">
                              {m.obra} • {formatarDataHoraBr(m.data, m.hora)} •{' '}
                              {m.categoria}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span
                            className={`font-black text-sm tabular-nums ${
                              m.tipo === 'ENTRADA_PIX'
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {m.tipo === 'ENTRADA_PIX' ? '+' : '−'} R${' '}
                            {Number(m.valor).toFixed(2)}
                          </span>

                          {m.status === 'PENDENTE' ? (
                            <button
                              type="button"
                              onClick={() => handleAprovar(m.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold"
                            >
                              Conferir
                            </button>
                          ) : (
                            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              OK
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleExcluir(m.id)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
        )}
      </div>
    </section>
  );
}
