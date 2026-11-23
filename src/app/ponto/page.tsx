'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckSquare,
  Camera,
  Lock,
  LogOut,
  Search,
  Send,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building2,
  Users,
  Clock,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import {
  OPCOES_TIPO_DIARIA_CAMPO,
  obterDataBrasilISO,
  type StatusRelatorioSemanalObra,
  type TipoDiariaCampo,
} from '@/lib/pontoCampo';

interface EncarregadoPublico {
  id: string;
  nome: string;
}

interface EncarregadoSessao {
  id: string;
  nome: string;
  obrasVinculadas: string[];
}

interface ColaboradorCampo {
  id: string;
  nome: string;
}

interface ItemFilaOfflinePonto {
  id: string;
  obraNome: string;
  data: string;
  itens: Array<{ colaboradorId: string; nome: string; tipo: TipoDiariaCampo }>;
  observacao: string;
  criadoEm: string;
}

const OFFLINE_QUEUE_KEY = 'diaria_ponto_campo_outbox_v1';

type AbaPonto = 'PONTO' | 'RELATORIO';

export default function PontoCampoPage() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [autenticado, setAutenticado] = useState(false);
  const [encarregadosLista, setEncarregadosLista] = useState<
    EncarregadoPublico[]
  >([]);
  const [encarregado, setEncarregado] = useState<EncarregadoSessao | null>(
    null
  );
  const [colaboradores, setColaboradores] = useState<ColaboradorCampo[]>([]);
  const [statusRelatorios, setStatusRelatorios] = useState<
    StatusRelatorioSemanalObra[]
  >([]);

  // Login PIN
  const [selectedEncId, setSelectedEncId] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [entrando, setEntrando] = useState(false);

  // Navegação e feedback
  const [aba, setAba] = useState<AbaPonto>('PONTO');
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro' | 'info';
    texto: string;
  } | null>(null);
  const [online, setOnline] = useState(true);
  const [filaOffline, setFilaOffline] = useState<ItemFilaOfflinePonto[]>([]);

  // Aba 1: Marcação de Ponto
  const [obraPonto, setObraPonto] = useState('');
  const [dataPonto, setDataPonto] = useState(() => obterDataBrasilISO());
  const [buscaColab, setBuscaColab] = useState('');
  const [selecionados, setSelecionados] = useState<
    Record<string, TipoDiariaCampo>
  >({});
  const [obsPonto, setObsPonto] = useState('');
  const [enviandoPonto, setEnviandoPonto] = useState(false);

  // Aba 2: Relatório Semanal (3 Fotos)
  const [obraRelatorio, setObraRelatorio] = useState('');
  const [dataRelatorio, setDataRelatorio] = useState(() =>
    obterDataBrasilISO()
  );
  const [resumoRelatorio, setResumoRelatorio] = useState('');
  const [fotosFiles, setFotosFiles] = useState<File[]>([]);
  const [fotosPreviews, setFotosPreviews] = useState<string[]>([]);
  const [enviandoRelatorio, setEnviandoRelatorio] = useState(false);

  const mostrarFeedback = useCallback(
    (tipo: 'sucesso' | 'erro' | 'info', texto: string) => {
      setFeedback({ tipo, texto });
      setTimeout(() => setFeedback(null), 5000);
    },
    []
  );

  const carregarFilaOffline = useCallback(() => {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!raw) {
        setFilaOffline([]);
        return;
      }
      const parsed = JSON.parse(raw) as ItemFilaOfflinePonto[];
      setFilaOffline(Array.isArray(parsed) ? parsed : []);
    } catch {
      setFilaOffline([]);
    }
  }, []);

  const salvarFilaOffline = useCallback((lista: ItemFilaOfflinePonto[]) => {
    setFilaOffline(lista);
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(lista));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const carregarSessao = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ponto-campo/auth', { cache: 'no-store' });
      const data = (await res.json()) as {
        enabled?: boolean;
        autenticado?: boolean;
        encarregados?: EncarregadoPublico[];
        encarregado?: EncarregadoSessao;
        colaboradores?: ColaboradorCampo[];
        statusRelatorios?: StatusRelatorioSemanalObra[];
      };

      setEnabled(data.enabled === true);
      setAutenticado(data.autenticado === true);
      if (data.encarregados) {
        setEncarregadosLista(data.encarregados);
        if (!selectedEncId && data.encarregados.length > 0) {
          setSelectedEncId(data.encarregados[0].id);
        }
      }
      if (data.autenticado && data.encarregado) {
        setEncarregado(data.encarregado);
        setColaboradores(data.colaboradores || []);
        setStatusRelatorios(data.statusRelatorios || []);
        if (data.encarregado.obrasVinculadas.length > 0) {
          setObraPonto((prev) => prev || data.encarregado!.obrasVinculadas[0]);
          setObraRelatorio(
            (prev) => prev || data.encarregado!.obrasVinculadas[0]
          );
        }
      } else {
        setEncarregado(null);
      }
    } catch {
      mostrarFeedback(
        'info',
        'Sem conexão no momento. Se já estiver logado, seus envios ficam na fila offline.'
      );
    } finally {
      setLoading(false);
    }
  }, [mostrarFeedback, selectedEncId]);

  const sincronizarFilaOffline = useCallback(async () => {
    if (!navigator.onLine) return;
    let lista: ItemFilaOfflinePonto[] = [];
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      lista = raw ? (JSON.parse(raw) as ItemFilaOfflinePonto[]) : [];
    } catch {
      return;
    }
    if (!Array.isArray(lista) || lista.length === 0) return;

    const restantes: ItemFilaOfflinePonto[] = [];
    let sincronizados = 0;
    for (const item of lista) {
      try {
        const res = await fetch('/api/ponto-campo/ponto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            obraNome: item.obraNome,
            data: item.data,
            itens: item.itens,
            observacao: item.observacao,
          }),
        });
        if (res.ok) {
          sincronizados++;
        } else {
          restantes.push(item);
        }
      } catch {
        restantes.push(item);
      }
    }
    salvarFilaOffline(restantes);
    if (sincronizados > 0) {
      mostrarFeedback(
        'sucesso',
        `${sincronizados} ponto(s) da fila offline sincronizado(s) com sucesso!`
      );
    }
  }, [mostrarFeedback, salvarFilaOffline]);

  useEffect(() => {
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    carregarFilaOffline();
    void carregarSessao();

    const handleOnline = () => {
      setOnline(true);
      void sincronizarFilaOffline();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [carregarFilaOffline, carregarSessao, sincronizarFilaOffline]);

  const colaboradoresFiltrados = useMemo(() => {
    const q = buscaColab.trim().toLowerCase();
    if (!q) return colaboradores;
    return colaboradores.filter((c) => c.nome.toLowerCase().includes(q));
  }, [colaboradores, buscaColab]);

  const totalSelecionados = useMemo(
    () => Object.keys(selecionados).length,
    [selecionados]
  );

  async function handleLoginPin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEncId || pinInput.trim().length < 4) {
      mostrarFeedback('erro', 'Selecione seu nome e digite o PIN de 4 dígitos.');
      return;
    }
    setEntrando(true);
    try {
      const res = await fetch('/api/ponto-campo/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encarregadoId: selectedEncId,
          pin: pinInput.trim(),
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        mostrarFeedback('erro', data.error || 'PIN incorreto.');
        return;
      }
      setPinInput('');
      await carregarSessao();
    } catch {
      mostrarFeedback('erro', 'Erro de conexão ao validar PIN.');
    } finally {
      setEntrando(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/ponto-campo/auth', { method: 'DELETE' });
    setAutenticado(false);
    setEncarregado(null);
    setSelecionados({});
  }

  function toggleColaborador(id: string) {
    setSelecionados((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = 'NORMAL';
      }
      return next;
    });
  }

  function alterarTipoDiaria(id: string, tipo: TipoDiariaCampo) {
    setSelecionados((prev) => ({
      ...prev,
      [id]: tipo,
    }));
  }

  async function handleEnviarPonto(e: React.FormEvent) {
    e.preventDefault();
    if (!obraPonto) {
      mostrarFeedback('erro', 'Selecione a obra.');
      return;
    }
    const itens = Object.entries(selecionados)
      .map(([colabId, tipo]) => {
        const colab = colaboradores.find((c) => c.id === colabId);
        return colab ? { colaboradorId: colab.id, nome: colab.nome, tipo } : null;
      })
      .filter(
        (x): x is { colaboradorId: string; nome: string; tipo: TipoDiariaCampo } =>
          x !== null
      );

    if (itens.length === 0) {
      mostrarFeedback('erro', 'Marque pelo menos 1 colaborador presente.');
      return;
    }

    if (!navigator.onLine) {
      const novoItem: ItemFilaOfflinePonto = {
        id: `${Date.now()}`,
        obraNome: obraPonto,
        data: dataPonto,
        itens,
        observacao: obsPonto.trim(),
        criadoEm: new Date().toISOString(),
      };
      salvarFilaOffline([...filaOffline, novoItem]);
      setSelecionados({});
      setObsPonto('');
      mostrarFeedback(
        'info',
        'Sem sinal: ponto salvo no celular e será enviado automaticamente quando a internet voltar!'
      );
      return;
    }

    setEnviandoPonto(true);
    try {
      const res = await fetch('/api/ponto-campo/ponto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obraNome: obraPonto,
          data: dataPonto,
          itens,
          observacao: obsPonto.trim(),
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        mostrarFeedback('erro', data.error || 'Falha ao enviar ponto.');
        return;
      }
      setSelecionados({});
      setObsPonto('');
      mostrarFeedback(
        'sucesso',
        data.message || 'Ponto enviado para validação da Patrícia!'
      );
    } catch {
      mostrarFeedback('erro', 'Erro de conexão ao enviar ponto.');
    } finally {
      setEnviandoPonto(false);
    }
  }

  function handleSelecionarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 3);
    setFotosFiles(files);
    const previews = files.map((f) => URL.createObjectURL(f));
    setFotosPreviews(previews);
  }

  function removerFoto(index: number) {
    setFotosFiles((prev) => prev.filter((_, i) => i !== index));
    setFotosPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleEnviarRelatorio(e: React.FormEvent) {
    e.preventDefault();
    if (!obraRelatorio) {
      mostrarFeedback('erro', 'Selecione a obra do relatório.');
      return;
    }
    if (fotosFiles.length === 0) {
      mostrarFeedback('erro', 'Anexe pelo menos 1 foto (até 3 fotos).');
      return;
    }
    if (!resumoRelatorio.trim()) {
      mostrarFeedback('erro', 'Escreva um breve relato do andamento da obra.');
      return;
    }

    setEnviandoRelatorio(true);
    try {
      const fd = new FormData();
      fd.append('obraNome', obraRelatorio);
      fd.append('data', dataRelatorio);
      fd.append('resumo', resumoRelatorio.trim());
      for (const file of fotosFiles) {
        fd.append('fotos', file);
      }

      const res = await fetch('/api/ponto-campo/relatorio', {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        statusRelatorios?: StatusRelatorioSemanalObra[];
      };
      if (!res.ok || !data.success) {
        mostrarFeedback('erro', data.error || 'Falha ao enviar relatório.');
        return;
      }
      if (data.statusRelatorios) setStatusRelatorios(data.statusRelatorios);
      setResumoRelatorio('');
      setFotosFiles([]);
      setFotosPreviews([]);
      mostrarFeedback(
        'sucesso',
        data.message || 'Relatório semanal enviado com sucesso!'
      );
    } catch {
      mostrarFeedback('erro', 'Erro de conexão ao enviar relatório.');
    } finally {
      setEnviandoRelatorio(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <RefreshCw className="w-7 h-7 text-emerald-700 animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">
            Carregando Ponto de Campo...
          </p>
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl border border-slate-200 p-6 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
            EM HOMOLOGAÇÃO
          </span>
          <h1 className="text-base font-black text-slate-900">
            App de Campo desativado
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            O PWA de Marcação de Ponto (<code>FF_PWA_PONTO_CAMPO</code>) está
            em homologação e atualmente desligado em{' '}
            <strong>Configuração Geral</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (!autenticado || !encarregado) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-950 to-slate-900 flex items-center justify-center p-5">
        <form
          onSubmit={handleLoginPin}
          className="max-w-sm w-full bg-white rounded-3xl p-6 shadow-2xl space-y-5"
        >
          <div className="text-center space-y-1.5">
            <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
              EM HOMOLOGAÇÃO
            </span>
            <h1 className="text-xl font-black text-slate-950">
              Ponto de Campo
            </h1>
            <p className="text-xs text-slate-500">
              Acesso exclusivo para encarregados em obra
            </p>
          </div>

          {feedback && (
            <div className="p-3 rounded-2xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{feedback.texto}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Encarregado
            </label>
            <select
              value={selectedEncId}
              onChange={(e) => setSelectedEncId(e.target.value)}
              className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {encarregadosLista.map((enc) => (
                <option key={enc.id} value={enc.id}>
                  {enc.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              PIN de Acesso (4 dígitos)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              placeholder="••••"
              value={pinInput}
              onChange={(e) =>
                setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-center text-2xl tracking-[0.5em] font-black text-slate-950 outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <button
            type="submit"
            disabled={entrando}
            className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black shadow-md transition-all disabled:opacity-50"
          >
            {entrando ? 'Entrando...' : 'Acessar Ponto de Campo'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header fixo mobile */}
      <header className="sticky top-0 z-20 bg-emerald-950 text-white px-4 py-3.5 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-tight">
                Ponto de Campo
              </h1>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-400 text-amber-950">
                HOMOLOGAÇÃO
              </span>
            </div>
            <p className="text-[11px] text-emerald-200 font-medium">
              Encarregado: <strong className="text-white">{encarregado.nome}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="p-2 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-emerald-100"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Status Offline / Fila */}
        {(!online || filaOffline.length > 0) && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-700" />
              <span className="font-semibold">
                {!online
                  ? 'Modo Offline ativo — envios ficam salvos no celular.'
                  : `${filaOffline.length} ponto(s) aguardando sincronização.`}
              </span>
            </div>
            {online && filaOffline.length > 0 && (
              <button
                type="button"
                onClick={() => void sincronizarFilaOffline()}
                className="px-2.5 py-1 rounded-xl bg-amber-600 text-white font-bold text-[11px]"
              >
                Sincronizar
              </button>
            )}
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
              feedback.tipo === 'sucesso'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : feedback.tipo === 'erro'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-sky-50 text-sky-800 border-sky-200'
            }`}
          >
            {feedback.tipo === 'sucesso' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.texto}</span>
          </div>
        )}

        {/* Seletor de Abas */}
        <div className="grid grid-cols-2 gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
          <button
            type="button"
            onClick={() => setAba('PONTO')}
            className={`py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              aba === 'PONTO'
                ? 'bg-emerald-700 text-white shadow'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Marcar Ponto</span>
          </button>
          <button
            type="button"
            onClick={() => setAba('RELATORIO')}
            className={`py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              aba === 'RELATORIO'
                ? 'bg-emerald-700 text-white shadow'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Relatório (3 Fotos)</span>
          </button>
        </div>

        {/* ABA 1: MARCAÇÃO DE PONTO */}
        {aba === 'PONTO' && (
          <form onSubmit={handleEnviarPonto} className="space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3 shadow-sm">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Obra *</span>
                </label>
                <select
                  value={obraPonto}
                  onChange={(e) => setObraPonto(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900"
                >
                  {encarregado.obrasVinculadas.map((obra) => (
                    <option key={obra} value={obra}>
                      {obra}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Data do Ponto *</span>
                </label>
                <input
                  type="date"
                  value={dataPonto}
                  onChange={(e) => setDataPonto(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-700" />
                  <span>Equipe na Obra</span>
                </h2>
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 tabular-nums">
                  {totalSelecionados} marcado(s)
                </span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={buscaColab}
                  onChange={(e) => setBuscaColab(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900"
                />
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {colaboradoresFiltrados.map((colab) => {
                  const tipoAtual = selecionados[colab.id];
                  const marcado = Boolean(tipoAtual);
                  return (
                    <div
                      key={colab.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        marcado
                          ? 'bg-emerald-50/70 border-emerald-300'
                          : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => toggleColaborador(colab.id)}
                          className="h-5 w-5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                        />
                        <span className="text-sm font-bold text-slate-900">
                          {colab.nome}
                        </span>
                      </label>

                      {marcado && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5 pl-8">
                          {OPCOES_TIPO_DIARIA_CAMPO.map((op) => (
                            <button
                              key={op.codigo}
                              type="button"
                              onClick={() =>
                                alterarTipoDiaria(colab.id, op.codigo)
                              }
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                                tipoAtual === op.codigo
                                  ? 'bg-emerald-700 text-white border-emerald-700'
                                  : 'bg-white text-slate-700 border-slate-200'
                              }`}
                            >
                              {op.labelCurto}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1 pt-1">
                <label className="text-xs font-bold text-slate-700">
                  Observação (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex.: Chuva à tarde, saída mais cedo..."
                  value={obsPonto}
                  onChange={(e) => setObsPonto(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={enviandoPonto || totalSelecionados === 0}
              className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>
                {enviandoPonto
                  ? 'Enviando Ponto...'
                  : `Enviar Ponto do Dia (${totalSelecionados})`}
              </span>
            </button>
          </form>
        )}

        {/* ABA 2: RELATÓRIO SEMANAL (3 FOTOS — ATÉ QUINTA-FEIRA) */}
        {aba === 'RELATORIO' && (
          <form onSubmit={handleEnviarRelatorio} className="space-y-4">
            {/* Status semanal por obra */}
            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2.5 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                <Clock className="w-4 h-4 text-emerald-700" />
                <span>Prazo Semanal (até Quinta-feira)</span>
              </div>
              <div className="space-y-2">
                {statusRelatorios.map((st) => (
                  <div
                    key={st.obraNome}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs"
                  >
                    <span className="font-bold text-slate-800 truncate">
                      {st.obraNome}
                    </span>
                    {st.situacaoPrazo === 'ENVIADO' ? (
                      <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        ✓ Enviado esta semana
                      </span>
                    ) : st.situacaoPrazo === 'HOJE_QUINTA' ? (
                      <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                        Enviar hoje (Quinta)
                      </span>
                    ) : st.situacaoPrazo === 'ATRASADO' ? (
                      <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                        Pendente (prazo Quinta)
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        Enviar até Quinta
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3 shadow-sm">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Obra *
                </label>
                <select
                  value={obraRelatorio}
                  onChange={(e) => setObraRelatorio(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900"
                >
                  {encarregado.obrasVinculadas.map((obra) => (
                    <option key={obra} value={obra}>
                      {obra}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Data *
                </label>
                <input
                  type="date"
                  value={dataRelatorio}
                  onChange={(e) => setDataRelatorio(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Fotos da Obra (até 3 fotos) *
                </label>
                <label className="flex flex-col items-center justify-center gap-1.5 p-5 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 cursor-pointer hover:bg-emerald-50">
                  <Camera className="w-6 h-6 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-900">
                    Tirar ou selecionar até 3 fotos
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleSelecionarFotos}
                    className="hidden"
                  />
                </label>

                {fotosPreviews.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {fotosPreviews.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-xl overflow-hidden border border-slate-200"
                      >
                        <img
                          src={src}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removerFoto(idx)}
                          className="absolute top-1 right-1 p-1 rounded-lg bg-slate-900/75 text-white"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Relatório do Andamento *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Descreva resumidamente o que foi executado na obra nesta semana..."
                  value={resumoRelatorio}
                  onChange={(e) => setResumoRelatorio(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={enviandoRelatorio}
              className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>
                {enviandoRelatorio
                  ? 'Enviando Relatório...'
                  : 'Enviar Relatório da Obra'}
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
