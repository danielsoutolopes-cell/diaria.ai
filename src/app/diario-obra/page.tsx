'use client';

import React, { useState, useEffect } from 'react';
import {
  Camera,
  Calendar,
  Building2,
  Users,
  Sun,
  Plus,
  Trash2,
  Printer,
  Copy,
  Check,
  RefreshCw,
  FileText,
  Sparkles,
  X,
} from 'lucide-react';
import {
  getActiveTenantFromBrowser,
  TENANTS,
  type TenantConfig,
} from '@/lib/tenant';

interface EfetivoItem {
  nome: string;
  periodo: 'INTEGRAL' | 'MEIO_DIA';
}

interface DiarioObraRegistro {
  id: string;
  tenantSlug: string;
  empresaNome: string;
  obraNome: string;
  ambiente?: 'INTERNO' | 'EXTERNO';
  data: string;
  clima: string;
  statusCondominio?: string;
  empreiteiro: string;
  efetivo: EfetivoItem[];
  resumo: string;
  ocorrencias: string;
  fotos: string[];
  criadoPor: string;
  criadoEm: string;
}

export default function DiarioObraPage() {
  const [activeTenant, setActiveTenant] = useState<TenantConfig>(TENANTS.jhoston);
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');
  const [diarios, setDiarios] = useState<DiarioObraRegistro[]>([]);
  const [obras, setObras] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [puxandoEfetivo, setPuxandoEfetivo] = useState(false);

  // Formulário do novo diário
  const [obraNome, setObraNome] = useState('');
  const [ambiente, setAmbiente] = useState<'INTERNO' | 'EXTERNO'>('EXTERNO');
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0]);
  const [clima, setClima] = useState('Ensolarado');
  const [statusCondominio, setStatusCondominio] = useState('Acesso Normal');
  const [empreiteiro, setEmpreiteiro] = useState('');
  const [efetivo, setEfetivo] = useState<EfetivoItem[]>([]);
  const [novoNome, setNovoNome] = useState('');
  const [novoPeriodo, setNovoPeriodo] = useState<'INTEGRAL' | 'MEIO_DIA'>('INTEGRAL');
  const [resumo, setResumo] = useState('');
  const [ocorrencias, setOcorrencias] = useState('');
  const [fotosBase64, setFotosBase64] = useState<string[]>([]);

  // Visualização / Impressão PDF e cópia WhatsApp
  const [diarioSelecionado, setDiarioSelecionado] =
    useState<DiarioObraRegistro | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [refinandoIA, setRefinandoIA] = useState(false);
  const [enviandoZapId, setEnviandoZapId] = useState<string | null>(null);
  const [destinoZap, setDestinoZap] = useState('');
  const [avisoEnvio, setAvisoEnvio] = useState<string | null>(null);
  const [mapaGruposObra, setMapaGruposObra] = useState<
    Array<{ jid: string; obraNome: string }>
  >([]);

  useEffect(() => {
    fetch('/api/config-geral')
      .then((r) => r.json())
      .then(
        (d: {
          configGeral?: {
            gruposWhatsApp?: Array<{ jid: string; obraNome: string; ativo?: boolean }>;
          };
        }) => {
          const ativos = (d.configGeral?.gruposWhatsApp || []).filter(
            (g) => g.ativo !== false
          );
          setMapaGruposObra(ativos);
        }
      )
      .catch(() => {});
  }, []);

  // Auto-preenche o JID do grupo vinculado quando a obra muda
  useEffect(() => {
    if (!obraNome.trim() || mapaGruposObra.length === 0) return;
    const match = mapaGruposObra.find(
      (g) =>
        g.obraNome.toUpperCase() === obraNome.trim().toUpperCase() ||
        g.obraNome.toUpperCase().includes(obraNome.trim().toUpperCase())
    );
    if (match?.jid) {
      setDestinoZap(match.jid);
    }
  }, [obraNome, mapaGruposObra]);

  function handleRepetirUltimoEfetivo() {
    const ultimo =
      diarios.find(
        (d) =>
          obraNome.trim() &&
          d.obraNome.toUpperCase().includes(obraNome.trim().toUpperCase()) &&
          d.efetivo.length > 0
      ) || diarios.find((d) => d.efetivo.length > 0);
    if (ultimo && ultimo.efetivo.length > 0) {
      setEfetivo(ultimo.efetivo);
    }
  }

  async function handleRefinarResumoIA() {
    if (!resumo.trim()) return;
    setRefinandoIA(true);
    try {
      const res = await fetch('/api/diario-obra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refinar',
          obraNome,
          resumo,
        }),
      });
      const d = (await res.json()) as { resumoRefinado?: string };
      if (d.resumoRefinado) setResumo(d.resumoRefinado);
    } catch (e) {
      console.error(e);
    } finally {
      setRefinandoIA(false);
    }
  }

  async function handleEnviarPdfWhatsApp(diario: DiarioObraRegistro) {
    setEnviandoZapId(diario.id);
    setAvisoEnvio(null);
    try {
      const res = await fetch('/api/diario-obra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enviar-whatsapp',
          id: diario.id,
          destinoJid: destinoZap.trim() || undefined,
        }),
      });
      const d = (await res.json()) as {
        message?: string;
        pdfBase64?: string;
        fileName?: string;
      };
      if (d.message) {
        setAvisoEnvio(d.message);
        setTimeout(() => setAvisoEnvio(null), 5000);
      }
      // Também oferece download automático do PDF gerado caso queira encaminhar manualmente
      if (d.pdfBase64 && d.fileName) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${d.pdfBase64}`;
        link.download = d.fileName;
        link.click();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEnviandoZapId(null);
    }
  }

  const isIntermack = activeTenant.slug === 'intermack';

  useEffect(() => {
    const tenant = getActiveTenantFromBrowser();
    setActiveTenant(tenant);
    setAmbiente(tenant.slug === 'intermack' ? 'INTERNO' : 'EXTERNO');
    const cookies = document.cookie.split('; ');
    const userCookie = cookies.find((c) => c.startsWith('diaria_user='));
    if (userCookie) {
      const nome = decodeURIComponent(userCookie.split('=')[1]);
      if (nome) setUsuarioAtual(nome);
    }
    void carregarDiarios();
  }, []);

  async function carregarDiarios() {
    setLoading(true);
    try {
      const res = await fetch('/api/diario-obra');
      const d = (await res.json()) as {
        diarios?: DiarioObraRegistro[];
        obras?: { id: string; nome: string }[];
      };
      setDiarios(d.diarios || []);
      setObras(d.obras || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handlePuxarEfetivo() {
    setPuxandoEfetivo(true);
    try {
      const res = await fetch('/api/diario-obra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'efetivo-dia',
          obraNome,
          data,
        }),
      });
      const d = (await res.json()) as { efetivo?: EfetivoItem[] };
      if (d.efetivo && d.efetivo.length > 0) {
        setEfetivo(d.efetivo);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPuxandoEfetivo(false);
    }
  }

  function handleAdicionarProfissional() {
    const limpo = novoNome.trim();
    if (!limpo) return;
    setEfetivo((prev) => [...prev, { nome: limpo, periodo: novoPeriodo }]);
    setNovoNome('');
  }

  function handleUploadFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const espacoRestante = 3 - fotosBase64.length;
    const selecionados = files.slice(0, espacoRestante);

    selecionados.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setFotosBase64((prev) =>
            prev.length < 3 ? [...prev, reader.result as string] : prev
          );
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  async function handleSalvarDiario(e: React.FormEvent) {
    e.preventDefault();
    if (!obraNome.trim() || !resumo.trim()) return;
    setSalvando(true);
    try {
      const res = await fetch('/api/diario-obra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'salvar',
          obraNome,
          ambiente,
          data,
          clima,
          statusCondominio,
          empreiteiro,
          efetivo,
          resumo,
          ocorrencias,
          fotosBase64,
          usuarioLogado: usuarioAtual,
        }),
      });
      const d = (await res.json()) as {
        success?: boolean;
        diario?: DiarioObraRegistro;
        diarios?: DiarioObraRegistro[];
      };
      if (d.success) {
        if (d.diarios) setDiarios(d.diarios);
        setResumo('');
        setOcorrencias('');
        setFotosBase64([]);
        setEfetivo([]);
        if (d.diario) setDiarioSelecionado(d.diario);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluirDiario(id: string) {
    try {
      const res = await fetch('/api/diario-obra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'excluir', id }),
      });
      const d = (await res.json()) as { diarios?: DiarioObraRegistro[] };
      if (d.diarios) setDiarios(d.diarios);
      if (diarioSelecionado?.id === id) setDiarioSelecionado(null);
    } catch (err) {
      console.error(err);
    }
  }

  function handleCopiarWhatsApp(diario: DiarioObraRegistro) {
    const listaEfetivo =
      diario.efetivo.length > 0
        ? diario.efetivo
            .map(
              (e) =>
                `• ${e.nome} (${e.periodo === 'INTEGRAL' ? 'Dia Inteiro' : 'Meio Dia'})`
            )
            .join('\n')
        : '• Não informado';

    const texto =
      `📋 *DIÁRIO DE OBRA — ${diario.empresaNome.toUpperCase()}*\n` +
      `🏗️ *Obra:* ${diario.obraNome}\n` +
      `📅 *Data:* ${diario.data} | ☀️ *Clima:* ${diario.clima}\n` +
      (diario.empreiteiro ? `👷 *Empreiteiro:* ${diario.empreiteiro}\n` : '') +
      `\n👥 *Efetivo Presente (${diario.efetivo.length}):*\n${listaEfetivo}\n` +
      `\n📝 *Resumo das Atividades:*\n${diario.resumo}\n` +
      (diario.ocorrencias ? `\n⚠️ *Ocorrências / Pendências:*\n${diario.ocorrencias}\n` : '') +
      `\n📸 *Fotos registradas:* ${diario.fotos.length} foto(s) anexada(s) no relatório.`;

    void navigator.clipboard.writeText(texto);
    setCopiadoId(diario.id);
    setTimeout(() => setCopiadoId(null), 2500);
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 print:hidden">
        <div>
          <div
            className={`flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full w-fit mb-2 border ${
              isIntermack
                ? 'text-indigo-800 bg-indigo-50 border-indigo-200'
                : 'text-emerald-800 bg-emerald-50 border-emerald-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>
              {activeTenant.nome} • Diário de Obra Expresso (2 a 3 Fotos)
            </span>
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Diário de Obra & Relatório Fotográfico
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Registre o efetivo presente (Dia Inteiro / Meio Dia), anexe de 2 a 3 fotos e gere o relatório limpo para PDF ou WhatsApp.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:hidden">
        {/* Formulário de Novo Diário */}
        <form
          onSubmit={handleSalvarDiario}
          className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-5"
        >
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Sparkles
              className={`w-4 h-4 ${
                isIntermack ? 'text-indigo-600' : 'text-emerald-600'
              }`}
            />
            <span>Novo Registro de Diário de Obra</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                Obra *
              </label>
              <input
                type="text"
                list="lista-obras-diario"
                required
                placeholder="Ex: Obra Intermack 01"
                value={obraNome}
                onChange={(e) => setObraNome(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <datalist id="lista-obras-diario">
                {obras.map((o) => (
                  <option key={o.id} value={o.nome} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Data *
              </label>
              <input
                type="date"
                required
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-slate-400" />
                  {ambiente === 'INTERNO'
                    ? 'Condomínio / Acesso (Obra Interna)'
                    : 'Clima (Obra Externa)'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAmbiente((prev) =>
                      prev === 'INTERNO' ? 'EXTERNO' : 'INTERNO'
                    )
                  }
                  className="text-[10px] font-black text-indigo-600 hover:underline"
                >
                  Trocar p/ {ambiente === 'INTERNO' ? 'Externa' : 'Interna'}
                </button>
              </label>
              {ambiente === 'INTERNO' ? (
                <select
                  value={statusCondominio}
                  onChange={(e) => setStatusCondominio(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Acesso Normal">Acesso Normal</option>
                  <option value="Restrição de Barulho / Horário">
                    Restrição de Barulho / Horário
                  </option>
                  <option value="Aguardando Liberação Portaria">
                    Aguardando Liberação Portaria
                  </option>
                  <option value="Falta de Material do Cliente">
                    Falta de Material do Cliente
                  </option>
                </select>
              ) : (
                <select
                  value={clima}
                  onChange={(e) => setClima(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Ensolarado">Ensolarado</option>
                  <option value="Nublado">Nublado</option>
                  <option value="Chuva Parcial">Chuva Parcial</option>
                  <option value="Chuva Forte">Chuva Forte</option>
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                Empreiteiro / Equipe
              </label>
              <input
                type="text"
                placeholder="Ex: Empreiteiro Carlos"
                value={empreiteiro}
                onChange={(e) => setEmpreiteiro(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Efetivo Presente (Dia Inteiro / Meio Dia — sem Falta e sem R$) */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Efetivo Presente ({efetivo.length})
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {diarios.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRepetirUltimoEfetivo}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-[11px] font-bold text-indigo-800"
                    title="Copia os nomes do último diário registrado para esta obra"
                  >
                    Repetir Último Diário
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePuxarEfetivo}
                  disabled={puxandoEfetivo}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-slate-700 flex items-center gap-1.5"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${puxandoEfetivo ? 'animate-spin' : ''}`}
                  />
                  <span>Puxar das Validações</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Nome do profissional..."
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdicionarProfissional();
                  }
                }}
                className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              />
              <select
                value={novoPeriodo}
                onChange={(e) =>
                  setNovoPeriodo(e.target.value as 'INTEGRAL' | 'MEIO_DIA')
                }
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"
              >
                <option value="INTEGRAL">Dia Inteiro</option>
                <option value="MEIO_DIA">Meio Dia</option>
              </select>
              <button
                type="button"
                onClick={handleAdicionarProfissional}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {efetivo.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {efetivo.map((item, idx) => (
                  <div
                    key={`${item.nome}-${idx}`}
                    className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                  >
                    <span>{item.nome}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                        item.periodo === 'INTEGRAL'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.periodo === 'INTEGRAL' ? 'Dia Inteiro' : 'Meio Dia'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEfetivo((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upload de 2 a 3 Fotos */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-slate-400" />
                Fotos da Evolução (até 3 fotos)
              </span>
              <span className="text-[11px] text-slate-400">
                {fotosBase64.length}/3 selecionadas
              </span>
            </label>

            {fotosBase64.length < 3 && (
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleUploadFotos}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
              />
            )}

            {fotosBase64.length > 0 && (
              <div className="grid grid-cols-3 gap-3 pt-2">
                {fotosBase64.map((src, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100"
                  >
                    <img
                      src={src}
                      alt={`Foto ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFotosBase64((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-slate-950/75 text-white hover:bg-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumo Rápido */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Resumo Rápido das Atividades *
              </label>
              <button
                type="button"
                onClick={handleRefinarResumoIA}
                disabled={refinandoIA || !resumo.trim()}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                <span>{refinandoIA ? 'Refinando...' : 'Refinar com IA'}</span>
              </button>
            </div>
            <textarea
              required
              rows={3}
              placeholder="Ex: Execução de alvenaria no pavimento térreo, conferência de prumo e organização do canteiro."
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Ocorrências / Pendências (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Aguardando entrega de cimento amanhã às 08h."
              value={ocorrencias}
              onChange={(e) => setOcorrencias(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={salvando}
            className={`w-full py-3 rounded-2xl text-white text-sm font-black shadow-md transition-all flex items-center justify-center gap-2 ${
              isIntermack
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>
              {salvando ? 'Salvando Diário...' : 'Salvar e Gerar Relatório'}
            </span>
          </button>
        </form>

        {/* Histórico de Diários */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
              Diários Registrados ({diarios.length})
            </h2>
            <input
              type="text"
              placeholder="JID do Grupo ou Telefone p/ envio do PDF (opcional)"
              value={destinoZap}
              onChange={(e) => setDestinoZap(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700"
            />
            {avisoEnvio && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-900">
                {avisoEnvio}
              </div>
            )}
          </div>

          {loading ? (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
              Carregando diários...
            </div>
          ) : diarios.length === 0 ? (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2">
              <Camera className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">
                Nenhum diário registrado para <strong>{activeTenant.nome}</strong> ainda.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {diarios.map((d) => (
                <div
                  key={d.id}
                  className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                        {d.obraNome}
                      </span>
                      <p className="text-xs text-slate-500 mt-1 font-medium">
                        📅 {d.data} • ☀️ {d.clima} • 👥 {d.efetivo.length} presente(s)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleExcluirDiario(d.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                      title="Excluir diário"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-700 line-clamp-2">{d.resumo}</p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDiarioSelecionado(d)}
                      className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Ver / Imprimir PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEnviarPdfWhatsApp(d)}
                      disabled={enviandoZapId === d.id}
                      className="py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5"
                      title="Gerar PDF em Base64 e enviar para o grupo do WhatsApp"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>
                        {enviandoZapId === d.id ? 'Enviando...' : 'PDF Zap'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopiarWhatsApp(d)}
                      className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5"
                    >
                      {copiadoId === d.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Zap</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal / Folha de Impressão PDF do Diário de Obra */}
      {diarioSelecionado && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:static print:bg-white print:p-0">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-auto print:shadow-none print:rounded-none print:p-0">
            {/* Ações (ocultas na impressão) */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 print:hidden">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                Pré-visualização do Relatório (PDF)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir / Salvar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiarioSelecionado(null)}
                  className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cabeçalho Timbrado */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <h2 className="text-2xl font-black text-slate-950 tracking-tight uppercase">
                  {diarioSelecionado.empresaNome}
                </h2>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Relatório Diário de Obra (RDO)
                </p>
              </div>
              <div className="text-right text-xs text-slate-700 space-y-0.5">
                <p className="font-black text-slate-950 text-sm">
                  {diarioSelecionado.obraNome}
                </p>
                <p>Data: {diarioSelecionado.data}</p>
                <p>Clima: {diarioSelecionado.clima}</p>
              </div>
            </div>

            {/* Empreiteiro e Efetivo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block">
                  Empreiteiro / Responsável
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {diarioSelecionado.empreiteiro || 'Equipe de Campo'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block">
                  Efetivo Presente ({diarioSelecionado.efetivo.length})
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {diarioSelecionado.efetivo.length > 0 ? (
                    diarioSelecionado.efetivo.map((e, i) => (
                      <span
                        key={i}
                        className="text-xs font-semibold bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-800"
                      >
                        {e.nome} ({e.periodo === 'INTEGRAL' ? 'Inteiro' : '½ Dia'})
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">Não informado</span>
                  )}
                </div>
              </div>
            </div>

            {/* Resumo e Ocorrências */}
            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                  Resumo das Atividades Executadas
                </h3>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {diarioSelecionado.resumo}
                </p>
              </div>

              {diarioSelecionado.ocorrencias && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-800 mb-1">
                    Ocorrências / Pendências
                  </h3>
                  <p className="text-xs text-amber-950">
                    {diarioSelecionado.ocorrencias}
                  </p>
                </div>
              )}
            </div>

            {/* Grade de Fotos (2 a 3 fotos) */}
            {diarioSelecionado.fotos.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Registro Fotográfico ({diarioSelecionado.fotos.length})
                </h3>
                <div
                  className={`grid gap-3 ${
                    diarioSelecionado.fotos.length === 1
                      ? 'grid-cols-1'
                      : diarioSelecionado.fotos.length === 2
                        ? 'grid-cols-2'
                        : 'grid-cols-3'
                  }`}
                >
                  {diarioSelecionado.fotos.map((url, idx) => (
                    <div
                      key={idx}
                      className="aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100"
                    >
                      <img
                        src={url}
                        alt={`Registro ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
              <span>Emitido por {diarioSelecionado.criadoPor}</span>
              <span>
                {new Date(diarioSelecionado.criadoEm).toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
