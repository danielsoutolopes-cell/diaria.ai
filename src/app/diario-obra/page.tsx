'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  HardHat,
  Wrench,
  AlertTriangle,
  Download,
  Search,
} from 'lucide-react';
import {
  getActiveTenantFromBrowser,
  TENANTS,
  type TenantConfig,
} from '@/lib/tenant';
import {
  OPCOES_CLIMA,
  OPCOES_CONDOMINIO_ACESSO,
  OPCOES_OCORRENCIA_IMPEDIMENTO,
  agruparEfetivoPorEmpreiteiro,
  extrairEmpreiteirosDoDiario,
  filtrarFuncionariosPorEmpreiteiroEBusca,
  formatarNomeFuncionarioComMetadados,
  gerarCsvRelatorioEmpreiteiro,
  gerarTextoWhatsAppConsolidadoEmpreiteiro,
  gerarTextoWhatsAppDiario,
  isSubempreitaHabilitada,
  montarOpcoesEtapasObra,
  montarTextoOcorrencia,
  normalizarTextoBusca,
  sanitizarStatusCondominio,
  type DiarioObraRegistro,
  type EfetivoItem,
  type EmpreiteiroDiarioRecord,
  type FuncionarioEmpreiteiroRecord,
} from '@/lib/diarioObraRelatorio';
import DiarioEquipesModal from '@/components/DiarioEquipesModal';

interface ObraOption {
  id: string;
  nome: string;
  tipoObra?: string | null;
}

export default function DiarioObraPage() {
  const [activeTenant, setActiveTenant] = useState<TenantConfig>(TENANTS.jhoston);
  const [usuarioAtual, setUsuarioAtual] = useState<string>('Patrícia Grubel');
  const [diarios, setDiarios] = useState<DiarioObraRegistro[]>([]);
  const [obras, setObras] = useState<ObraOption[]>([]);
  const [etapasPorObra, setEtapasPorObra] = useState<
    Record<string, Array<{ id: string | null; nome: string }>>
  >({});
  const [empreiteiros, setEmpreiteiros] = useState<EmpreiteiroDiarioRecord[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioEmpreiteiroRecord[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [puxandoEfetivo, setPuxandoEfetivo] = useState(false);

  // Formulário principal
  const [obraId, setObraId] = useState('');
  const [obraNome, setObraNome] = useState('');
  const [ambiente, setAmbiente] = useState<'INTERNO' | 'EXTERNO'>('EXTERNO');
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0]);
  const [clima, setClima] = useState<string>('Ensolarado');
  const [statusCondominio, setStatusCondominio] = useState<string>('Acesso Normal');

  // Ocorrência / Impedimento separado (exibido apenas quando aplicável)
  const [temOcorrencia, setTemOcorrencia] = useState(false);
  const [ocorrenciaTipo, setOcorrenciaTipo] = useState<string>(
    OPCOES_OCORRENCIA_IMPEDIMENTO[0]
  );
  const [ocorrencias, setOcorrencias] = useState('');

  // Subempreita (EXCLUSIVO Intermack)
  const [empreiteiroId, setEmpreiteiroId] = useState('');
  const [etapaNome, setEtapaNome] = useState('');
  const [etapaCustom, setEtapaCustom] = useState('');
  const [buscaFuncionario, setBuscaFuncionario] = useState('');
  const [funcionarioSelecionadoId, setFuncionarioSelecionadoId] = useState('');
  const [mostrarTodosFuncionarios, setMostrarTodosFuncionarios] = useState(false);

  // Fluxo direto (Jhoston) + Efetivo comum
  const [efetivo, setEfetivo] = useState<EfetivoItem[]>([]);
  const [novoNomeDireto, setNovoNomeDireto] = useState('');
  const [novoPeriodo, setNovoPeriodo] = useState<'INTEGRAL' | 'MEIO_DIA'>(
    'INTEGRAL'
  );
  const [resumo, setResumo] = useState('');
  const [fotosBase64, setFotosBase64] = useState<string[]>([]);

  // Cadastro rápido de obra inline
  const [novaObraAberta, setNovaObraAberta] = useState(false);
  const [novaObraNome, setNovaObraNome] = useState('');
  const [novaObraAlias, setNovaObraAlias] = useState('');
  const [novaObraEndereco, setNovaObraEndereco] = useState('');
  const [salvandoObra, setSalvandoObra] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  // Modal de gerenciamento / cadastro rápido de Empreiteiros & Funcionários (Intermack)
  const [modalEquipesAberto, setModalEquipesAberto] = useState(false);
  const [modalEquipesAba, setModalEquipesAba] = useState<
    'empreiteiros' | 'funcionarios'
  >('empreiteiros');

  // Filtros do Histórico e Relatório por Encarregado (Intermack)
  const [filtroHistoricoObra, setFiltroHistoricoObra] = useState('');
  const [filtroHistoricoEmpreiteiro, setFiltroHistoricoEmpreiteiro] = useState('');
  const [filtroModalEmpreiteiro, setFiltroModalEmpreiteiro] = useState('');

  // Visualização / Impressão PDF e WhatsApp
  const [diarioSelecionado, setDiarioSelecionado] =
    useState<DiarioObraRegistro | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [copiadoConsolidado, setCopiadoConsolidado] = useState(false);
  const [refinandoIA, setRefinandoIA] = useState(false);
  const [enviandoZapId, setEnviandoZapId] = useState<string | null>(null);
  const [destinoZap, setDestinoZap] = useState('');
  const [avisoEnvio, setAvisoEnvio] = useState<string | null>(null);
  const [mapaGruposObra, setMapaGruposObra] = useState<
    Array<{ jid: string; obraNome: string }>
  >([]);

  const subempreitaAtiva = isSubempreitaHabilitada(activeTenant.slug);

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

  useEffect(() => {
    fetch('/api/config-geral')
      .then((r) => r.json())
      .then(
        (d: {
          configGeral?: {
            gruposWhatsApp?: Array<{
              jid: string;
              obraNome: string;
              ativo?: boolean;
            }>;
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

  async function carregarDiarios() {
    setLoading(true);
    try {
      const res = await fetch('/api/diario-obra');
      const d = (await res.json()) as {
        diarios?: DiarioObraRegistro[];
        obras?: ObraOption[];
        etapasPorObra?: Record<string, Array<{ id: string | null; nome: string }>>;
        empreiteiros?: EmpreiteiroDiarioRecord[];
        funcionarios?: FuncionarioEmpreiteiroRecord[];
      };
      setDiarios(d.diarios || []);
      setObras(d.obras || []);
      setEtapasPorObra(d.etapasPorObra || {});
      setEmpreiteiros(d.empreiteiros || []);
      setFuncionarios(d.funcionarios || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Etapas disponíveis para a obra selecionada (Intermack)
  const opcoesEtapas = useMemo(() => {
    const chaveObra = normalizarTextoBusca(obraNome);
    const daObra = chaveObra ? etapasPorObra[chaveObra] || [] : [];
    return montarOpcoesEtapasObra(daObra);
  }, [obraNome, etapasPorObra]);

  const empreiteiroAtual = useMemo(
    () => empreiteiros.find((e) => e.id === empreiteiroId) || null,
    [empreiteiros, empreiteiroId]
  );

  // Funcionários filtrados por empreiteiro selecionado + busca por nome/apelido/doc
  const funcionariosDisponiveis = useMemo(() => {
    return filtrarFuncionariosPorEmpreiteiroEBusca(
      funcionarios,
      mostrarTodosFuncionarios ? null : empreiteiroId || null,
      buscaFuncionario,
      false
    );
  }, [funcionarios, empreiteiroId, buscaFuncionario, mostrarTodosFuncionarios]);

  // Lista única de empreiteiros presentes no histórico + cadastro (Intermack)
  const opcoesEmpreiteirosHistorico = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const emp of empreiteiros) {
      mapa.set(normalizarTextoBusca(emp.nome), emp.nome);
    }
    for (const d of diarios) {
      for (const nome of extrairEmpreiteirosDoDiario(d)) {
        const chave = normalizarTextoBusca(nome);
        if (chave && !mapa.has(chave)) mapa.set(chave, nome);
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [empreiteiros, diarios]);

  const diariosFiltrados = useMemo(() => {
    const obraNorm = normalizarTextoBusca(filtroHistoricoObra);
    const empNorm = normalizarTextoBusca(filtroHistoricoEmpreiteiro);
    return diarios.filter((d) => {
      if (obraNorm && normalizarTextoBusca(d.obraNome) !== obraNorm) return false;
      if (subempreitaAtiva && empNorm) {
        return agruparEfetivoPorEmpreiteiro(d, filtroHistoricoEmpreiteiro).length > 0;
      }
      return true;
    });
  }, [diarios, filtroHistoricoObra, filtroHistoricoEmpreiteiro, subempreitaAtiva]);

  function handleSelecionarObraDropdown(valor: string) {
    if (valor === '__NOVA_OBRA__') {
      setNovaObraAberta(true);
      return;
    }
    const encontrada = obras.find((o) => o.id === valor);
    if (encontrada) {
      setObraId(encontrada.id);
      setObraNome(encontrada.nome);
    } else {
      setObraId('');
      setObraNome('');
    }
  }

  async function handleCriarObraRapida(e: React.FormEvent) {
    e.preventDefault();
    if (!novaObraNome.trim()) return;
    setSalvandoObra(true);
    setErroForm(null);
    try {
      const res = await fetch('/api/obras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: novaObraNome.trim(),
          alias_fornecedor: subempreitaAtiva ? novaObraAlias.trim() : undefined,
          local: subempreitaAtiva
            ? novaObraEndereco.trim()
            : 'Canteiro Volante',
          tipo_obra: subempreitaAtiva ? 'OBRA_CIVIL' : 'PISCINA',
        }),
      });
      const d = (await res.json()) as {
        success?: boolean;
        error?: string;
        obra?: { id: string; nome: string; tipo_obra?: string };
      };
      if (!res.ok || !d.success || !d.obra) {
        setErroForm(d.error || 'Não foi possível cadastrar a obra.');
        return;
      }
      const criada: ObraOption = {
        id: d.obra.id,
        nome: d.obra.nome,
        tipoObra: d.obra.tipo_obra || null,
      };
      setObras((prev) =>
        [...prev, criada].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      );
      setObraId(criada.id);
      setObraNome(criada.nome);
      setNovaObraNome('');
      setNovaObraAlias('');
      setNovaObraEndereco('');
      setNovaObraAberta(false);
    } catch {
      setErroForm('Erro de comunicação ao cadastrar obra.');
    } finally {
      setSalvandoObra(false);
    }
  }

  function handleSelecionarEmpreiteiro(idSelecionado: string) {
    if (idSelecionado === '__NOVO_EMP__') {
      setModalEquipesAba('empreiteiros');
      setModalEquipesAberto(true);
      return;
    }
    setEmpreiteiroId(idSelecionado);
    setFuncionarioSelecionadoId('');
    const emp = empreiteiros.find((e) => e.id === idSelecionado);
    if (emp?.etapaPadrao && !etapaNome) {
      setEtapaNome(emp.etapaPadrao);
    }
  }

  function resolverEtapaAtiva(): { id: string | null; nome: string | null } {
    if (etapaNome === '__OUTRA__') {
      const limpa = etapaCustom.trim();
      return { id: null, nome: limpa || null };
    }
    const found = opcoesEtapas.find((op) => op.nome === etapaNome);
    return {
      id: found?.id || null,
      nome: etapaNome.trim() || null,
    };
  }

  function handleAdicionarFuncionarioIntermack() {
    const func = funcionarios.find((f) => f.id === funcionarioSelecionadoId);
    if (!func) return;

    const etapaAtiva = resolverEtapaAtiva();
    const empVinculado =
      empreiteiroAtual ||
      empreiteiros.find((e) => e.id === func.empreiteiroId) ||
      null;

    const etapaFinalNome =
      etapaAtiva.nome || func.funcao || empVinculado?.etapaPadrao || null;

    const jaExiste = efetivo.some(
      (item) =>
        item.funcionarioId === func.id &&
        normalizarTextoBusca(item.etapaNome) ===
          normalizarTextoBusca(etapaFinalNome)
    );
    if (jaExiste) return;

    setEfetivo((prev) => [
      ...prev,
      {
        funcionarioId: func.id,
        nome: func.nomeOficial,
        apelidos: func.apelidos,
        documento: func.documento,
        empreiteiroId: empVinculado?.id || func.empreiteiroId || null,
        empreiteiroNome: empVinculado?.nome || func.empreiteiroNome || null,
        etapaId: etapaAtiva.id,
        etapaNome: etapaFinalNome,
        periodo: novoPeriodo,
      },
    ]);
    setFuncionarioSelecionadoId('');
    setBuscaFuncionario('');
  }

  function handleAdicionarProfissionalDireto() {
    const limpo = novoNomeDireto.trim();
    if (!limpo) return;
    setEfetivo((prev) => [...prev, { nome: limpo, periodo: novoPeriodo }]);
    setNovoNomeDireto('');
  }

  function handleRepetirUltimoEfetivo() {
    const ultimo =
      diarios.find(
        (d) =>
          obraNome.trim() &&
          normalizarTextoBusca(d.obraNome) === normalizarTextoBusca(obraNome) &&
          d.efetivo.length > 0
      ) || diarios.find((d) => d.efetivo.length > 0);
    if (ultimo && ultimo.efetivo.length > 0) {
      setEfetivo(ultimo.efetivo);
    }
  }

  async function handlePuxarEfetivo() {
    setPuxandoEfetivo(true);
    try {
      const etapaAtiva = subempreitaAtiva ? resolverEtapaAtiva() : { nome: null };
      const res = await fetch('/api/diario-obra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'efetivo-dia',
          obraNome,
          data,
          etapaNome: etapaAtiva.nome,
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

  async function handleRefinarResumoIA() {
    if (!resumo.trim()) {
      alert('Digite primeiro um rascunho no campo Resumo antes de clicar em Refinar IA.');
      return;
    }
    setRefinandoIA(true);
    try {
      const etapaAtiva = subempreitaAtiva ? resolverEtapaAtiva() : { nome: null };
      const res = await fetch('/api/diario-obra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refinar',
          obraNome,
          etapaNome: etapaAtiva.nome,
          empreiteiro: empreiteiroAtual?.nome,
          resumo,
        }),
      });
      const d = (await res.json()) as { resumoRefinado?: string; error?: string };
      if (!res.ok || !d.resumoRefinado) {
        alert(d.error || 'Não foi possível refinar o texto com IA agora.');
        return;
      }
      setResumo(d.resumoRefinado);
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao refinar texto com IA.');
    } finally {
      setRefinandoIA(false);
    }
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
    setErroForm(null);
    if (!obraNome.trim()) {
      setErroForm('Selecione uma obra para continuar.');
      return;
    }
    if (!resumo.trim()) {
      setErroForm('Informe o resumo das atividades.');
      return;
    }

    setSalvando(true);
    try {
      const etapaAtiva = subempreitaAtiva
        ? resolverEtapaAtiva()
        : { id: null, nome: null };
      const res = await fetch('/api/diario-obra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'salvar',
          obraId: obraId || null,
          obraNome,
          ambiente,
          data,
          clima,
          statusCondominio:
            ambiente === 'INTERNO'
              ? sanitizarStatusCondominio(statusCondominio)
              : undefined,
          ocorrenciaTipo: temOcorrencia ? ocorrenciaTipo : '',
          ocorrencias: temOcorrencia ? ocorrencias : '',
          empreiteiroId: subempreitaAtiva ? empreiteiroAtual?.id || null : null,
          empreiteiro: subempreitaAtiva ? empreiteiroAtual?.nome || '' : '',
          etapaId: etapaAtiva.id,
          etapaNome: etapaAtiva.nome,
          efetivo,
          resumo,
          fotosBase64,
          usuarioLogado: usuarioAtual,
        }),
      });
      const d = (await res.json()) as {
        success?: boolean;
        diario?: DiarioObraRegistro;
        diarios?: DiarioObraRegistro[];
        error?: string;
      };
      if (!d.success) {
        setErroForm(d.error || 'Falha ao salvar diário.');
        return;
      }
      if (d.diarios) setDiarios(d.diarios);
      setResumo('');
      setTemOcorrencia(false);
      setOcorrencias('');
      setFotosBase64([]);
      setEfetivo([]);
      if (d.diario) {
        setFiltroModalEmpreiteiro('');
        setDiarioSelecionado(d.diario);
      }
    } catch (err) {
      console.error(err);
      setErroForm('Erro de conexão ao salvar diário.');
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

  async function handleEnviarPdfWhatsApp(
    diario: DiarioObraRegistro,
    filtroEmp?: string
  ) {
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
          filtroEmpreiteiro: subempreitaAtiva ? filtroEmp || undefined : undefined,
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

  function handleCopiarWhatsApp(
    diario: DiarioObraRegistro,
    filtroEmp?: string
  ) {
    const texto = gerarTextoWhatsAppDiario(
      diario,
      subempreitaAtiva ? filtroEmp || undefined : undefined
    );
    void navigator.clipboard.writeText(texto).catch(() => {});
    setCopiadoId(diario.id);
    setTimeout(() => setCopiadoId(null), 2500);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  function handleCopiarRelatorioConsolidado() {
    const texto = gerarTextoWhatsAppConsolidadoEmpreiteiro(
      diariosFiltrados,
      filtroHistoricoEmpreiteiro || undefined,
      filtroHistoricoObra || undefined
    );
    void navigator.clipboard.writeText(texto).catch(() => {});
    setCopiadoConsolidado(true);
    setTimeout(() => setCopiadoConsolidado(false), 2500);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  function handleExportarCsvEmpreiteiro() {
    const csv = gerarCsvRelatorioEmpreiteiro(
      diariosFiltrados,
      filtroHistoricoEmpreiteiro || undefined,
      filtroHistoricoObra || undefined
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const slugEmp = filtroHistoricoEmpreiteiro
      ? `-${filtroHistoricoEmpreiteiro.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      : '';
    link.href = url;
    link.download = `relatorio-diario-${activeTenant.slug}${slugEmp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const gruposModal = useMemo(() => {
    if (!diarioSelecionado || !subempreitaAtiva) return [];
    return agruparEfetivoPorEmpreiteiro(
      diarioSelecionado,
      filtroModalEmpreiteiro || undefined
    );
  }, [diarioSelecionado, subempreitaAtiva, filtroModalEmpreiteiro]);

  const empreiteirosDoDiarioModal = useMemo(() => {
    if (!diarioSelecionado || !subempreitaAtiva) return [];
    return extrairEmpreiteirosDoDiario(diarioSelecionado);
  }, [diarioSelecionado, subempreitaAtiva]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Cabeçalho enxuto e mobile-first */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80 print:hidden">
        <div>
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-0.5 rounded-full border mb-1.5 ${
              subempreitaAtiva
                ? 'text-indigo-800 bg-indigo-50 border-indigo-200'
                : 'text-emerald-800 bg-emerald-50 border-emerald-200'
            }`}
          >
            <Camera className="w-3 h-3" />
            <span>{activeTenant.nome}</span>
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
            Diário de Obra
          </h1>
        </div>

        {subempreitaAtiva && (
          <button
            type="button"
            onClick={() => {
              setModalEquipesAba('empreiteiros');
              setModalEquipesAberto(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-2xs"
          >
            <HardHat className="w-3.5 h-3.5 text-indigo-600" />
            <span>Equipes ({empreiteiros.length}/{funcionarios.length})</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
        {/* Formulário de Novo Diário */}
        <form
          onSubmit={handleSalvarDiario}
          className="lg:col-span-7 bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-black text-slate-900">
              Novo Registro
            </span>
            <button
              type="button"
              onClick={() =>
                setAmbiente((prev) =>
                  prev === 'INTERNO' ? 'EXTERNO' : 'INTERNO'
                )
              }
              className="text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg"
            >
              {ambiente === 'INTERNO' ? 'Obra Interna' : 'Obra Externa'} ⇄
            </button>
          </div>

          {erroForm && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
              {erroForm}
            </div>
          )}

          {/* Obra (Dropdown), Data e Acesso/Clima */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  Obra *
                </label>
                <button
                  type="button"
                  onClick={() => setNovaObraAberta((v) => !v)}
                  className="text-[11px] font-bold text-indigo-600 hover:underline"
                >
                  {novaObraAberta ? 'Cancelar' : '+ Nova obra'}
                </button>
              </div>
              <select
                required
                value={obraId}
                onChange={(e) => handleSelecionarObraDropdown(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Selecione a obra ativa...</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
                <option value="__NOVA_OBRA__">+ Cadastrar nova obra...</option>
              </select>

              {novaObraAberta && (
                <div className="mt-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nome da obra *"
                      value={novaObraNome}
                      onChange={(e) => setNovaObraNome(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    />
                    {subempreitaAtiva && (
                      <input
                        type="text"
                        placeholder="Alias p/ fornecedor *"
                        value={novaObraAlias}
                        onChange={(e) => setNovaObraAlias(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                      />
                    )}
                  </div>
                  {subempreitaAtiva && (
                    <input
                      type="text"
                      placeholder="Endereço completo de entrega *"
                      value={novaObraEndereco}
                      onChange={(e) => setNovaObraEndereco(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    />
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={salvandoObra || !novaObraNome.trim()}
                      onClick={(ev) => void handleCriarObraRapida(ev)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {salvandoObra ? 'Salvando...' : 'Salvar Obra'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Data *
              </label>
              <input
                type="date"
                required
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 tabular-nums focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-slate-400" />
                {ambiente === 'INTERNO' ? 'Condomínio / Acesso' : 'Clima'}
              </label>
              {ambiente === 'INTERNO' ? (
                <select
                  value={statusCondominio}
                  onChange={(e) => setStatusCondominio(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {OPCOES_CONDOMINIO_ACESSO.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={clima}
                  onChange={(e) => setClima(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {OPCOES_CLIMA.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ============================================================== */}
          {/* BLOCO DE EFETIVO: SUBEMPREITA (Intermack) vs DIRETO (Jhoston)  */}
          {/* ============================================================== */}
          {subempreitaAtiva ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Equipe &amp; Presença ({efetivo.length})</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {diarios.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRepetirUltimoEfetivo}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-[11px] font-bold text-indigo-800"
                    >
                      Repetir Último
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePuxarEfetivo}
                    disabled={puxandoEfetivo}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-slate-700 flex items-center gap-1"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${puxandoEfetivo ? 'animate-spin' : ''}`}
                    />
                    <span>Puxar Dia</span>
                  </button>
                </div>
              </div>

              {/* Dropdown 1: Empreiteiro / Encarregado + Dropdown 2: Etapa / Serviço */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <HardHat className="w-3 h-3 text-slate-400" />
                      Empreiteiro / Encarregado
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setModalEquipesAba('empreiteiros');
                        setModalEquipesAberto(true);
                      }}
                      className="text-[10px] font-black text-indigo-600 hover:underline"
                    >
                      + Novo
                    </button>
                  </div>
                  <select
                    value={empreiteiroId}
                    onChange={(e) => handleSelecionarEmpreiteiro(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                  >
                    <option value="">Todos / Selecione o empreiteiro...</option>
                    {empreiteiros.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nome}
                        {emp.apelidos.length > 0
                          ? ` (${emp.apelidos[0]})`
                          : ''}
                      </option>
                    ))}
                    <option value="__NOVO_EMP__">
                      + Cadastrar empreiteiro...
                    </option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <Wrench className="w-3 h-3 text-slate-400" />
                    Etapa / Serviço
                  </label>
                  <select
                    value={etapaNome}
                    onChange={(e) => setEtapaNome(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                  >
                    <option value="">Selecione a etapa...</option>
                    {opcoesEtapas.some((e) => e.origem === 'OBRA') && (
                      <optgroup label="Etapas desta Obra">
                        {opcoesEtapas
                          .filter((e) => e.origem === 'OBRA')
                          .map((et) => (
                            <option key={`obra-${et.nome}`} value={et.nome}>
                              {et.nome}
                            </option>
                          ))}
                      </optgroup>
                    )}
                    <optgroup label="Frentes de Serviço">
                      {opcoesEtapas
                        .filter((e) => e.origem === 'PADRAO')
                        .map((et) => (
                          <option key={`padrao-${et.nome}`} value={et.nome}>
                            {et.nome}
                          </option>
                        ))}
                    </optgroup>
                    <option value="__OUTRA__">Outra etapa...</option>
                  </select>
                  {etapaNome === '__OUTRA__' && (
                    <input
                      type="text"
                      placeholder="Nome da etapa..."
                      value={etapaCustom}
                      onChange={(e) => setEtapaCustom(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    />
                  )}
                </div>
              </div>

              {/* Dropdown 3: Funcionário (busca por nome/apelido/doc + cadastro rápido) */}
              <div className="space-y-2 pt-1 border-t border-slate-200/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-slate-700">
                    Funcionário (nome ou apelido)
                  </label>
                  <div className="flex items-center gap-3">
                    {empreiteiroId && (
                      <label className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mostrarTodosFuncionarios}
                          onChange={(e) =>
                            setMostrarTodosFuncionarios(e.target.checked)
                          }
                          className="rounded border-slate-300"
                        />
                        <span>Todos os cadastros</span>
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setModalEquipesAba('funcionarios');
                        setModalEquipesAberto(true);
                      }}
                      className="text-[10px] font-black text-indigo-600 hover:underline"
                    >
                      + Novo funcionário
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-4 relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar nome/apelido..."
                      value={buscaFuncionario}
                      onChange={(e) => setBuscaFuncionario(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                    />
                  </div>
                  <select
                    value={funcionarioSelecionadoId}
                    onChange={(e) => {
                      if (e.target.value === '__NOVO_FUNC__') {
                        setModalEquipesAba('funcionarios');
                        setModalEquipesAberto(true);
                        return;
                      }
                      setFuncionarioSelecionadoId(e.target.value);
                    }}
                    className="sm:col-span-5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                  >
                    <option value="">
                      {funcionariosDisponiveis.length === 0
                        ? 'Nenhum funcionário nesta equipe'
                        : `Selecionar funcionário (${funcionariosDisponiveis.length})...`}
                    </option>
                    {funcionariosDisponiveis.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatarNomeFuncionarioComMetadados({
                          nome: f.nomeOficial,
                          apelidos: f.apelidos,
                          documento: f.documento,
                        })}
                      </option>
                    ))}
                    <option value="__NOVO_FUNC__">
                      + Cadastrar funcionário...
                    </option>
                  </select>
                  <select
                    value={novoPeriodo}
                    onChange={(e) =>
                      setNovoPeriodo(e.target.value as 'INTEGRAL' | 'MEIO_DIA')
                    }
                    className="sm:col-span-2 px-2 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"
                  >
                    <option value="INTEGRAL">Inteiro</option>
                    <option value="MEIO_DIA">½ Dia</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAdicionarFuncionarioIntermack}
                    disabled={!funcionarioSelecionadoId}
                    className="sm:col-span-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center disabled:opacity-40"
                    title="Adicionar à presença"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Lista de Presença (com etapa editável por funcionário) */}
              {efetivo.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {efetivo.map((item, idx) => (
                    <div
                      key={`${item.funcionarioId || item.nome}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 truncate">
                          {formatarNomeFuncionarioComMetadados(item)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.empreiteiroNome || 'Sem empreiteiro'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          value={item.etapaNome || ''}
                          onChange={(e) =>
                            setEfetivo((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? { ...row, etapaNome: e.target.value || null }
                                  : row
                              )
                            )
                          }
                          className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 max-w-[130px]"
                          title="Etapa executada por este funcionário"
                        >
                          <option value="">Etapa...</option>
                          {opcoesEtapas.map((et) => (
                            <option key={et.nome} value={et.nome}>
                              {et.nome}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setEfetivo((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      periodo:
                                        row.periodo === 'INTEGRAL'
                                          ? 'MEIO_DIA'
                                          : 'INTEGRAL',
                                    }
                                  : row
                              )
                            )
                          }
                          className={`text-[10px] px-2 py-1 rounded-lg font-black ${
                            item.periodo === 'INTEGRAL'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.periodo === 'INTEGRAL' ? 'Inteiro' : '½ Dia'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEfetivo((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-rose-600 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Fluxo Direto Jhoston (sem estrutura de subempreita) */
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Efetivo Presente ({efetivo.length})
                </span>
                <div className="flex items-center gap-1.5">
                  {diarios.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRepetirUltimoEfetivo}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800"
                    >
                      Repetir Último
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePuxarEfetivo}
                    disabled={puxandoEfetivo}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-slate-700 flex items-center gap-1"
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
                  value={novoNomeDireto}
                  onChange={(e) => setNovoNomeDireto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAdicionarProfissionalDireto();
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
                  onClick={handleAdicionarProfissionalDireto}
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
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.periodo === 'INTEGRAL' ? 'Inteiro' : '½ Dia'}
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
          )}

          {/* Fotos (até 3) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-slate-400" />
                Fotos ({fotosBase64.length}/3)
              </span>
            </label>

            {fotosBase64.length < 3 && (
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleUploadFotos}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
              />
            )}

            {fotosBase64.length > 0 && (
              <div className="grid grid-cols-3 gap-2.5 pt-1">
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
                        setFotosBase64((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
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

          {/* Resumo das Atividades */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Resumo das Atividades *
              </label>
              <button
                type="button"
                onClick={handleRefinarResumoIA}
                disabled={refinandoIA || !resumo.trim()}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                <span>{refinandoIA ? 'Refinando...' : 'Refinar IA'}</span>
              </button>
            </div>
            <textarea
              required
              rows={3}
              placeholder="Descreva os serviços executados no dia..."
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* Ocorrência / Impedimento (separado de Condomínio / Acesso — exibido somente quando aplicável) */}
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={temOcorrencia}
                onChange={(e) => {
                  setTemOcorrencia(e.target.checked);
                  if (!e.target.checked) setOcorrencias('');
                }}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Registrar ocorrência / impedimento</span>
            </label>

            {temOcorrencia && (
              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                <select
                  value={ocorrenciaTipo}
                  onChange={(e) => setOcorrenciaTipo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-xs font-bold text-slate-900"
                >
                  {OPCOES_OCORRENCIA_IMPEDIMENTO.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Detalhes da ocorrência (opcional)..."
                  value={ocorrencias}
                  onChange={(e) => setOcorrencias(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-xs text-slate-900"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={salvando}
            className={`w-full py-3 rounded-2xl text-white text-sm font-black shadow-md transition-all flex items-center justify-center gap-2 ${
              subempreitaAtiva
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{salvando ? 'Salvando...' : 'Salvar Diário'}</span>
          </button>
        </form>

        {/* Histórico & Relatório por Empreiteiro */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Registrados ({diariosFiltrados.length})
            </h2>
            {subempreitaAtiva && diariosFiltrados.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopiarRelatorioConsolidado}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold flex items-center gap-1"
                  title="Copiar relatório consolidado filtrado para WhatsApp"
                >
                  {copiadoConsolidado ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Zap</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportarCsvEmpreiteiro}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1"
                  title="Exportar CSV por Empreiteiro"
                >
                  <Download className="w-3 h-3" />
                  <span>CSV</span>
                </button>
              </div>
            )}
          </div>

          {/* Filtros do histórico */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={filtroHistoricoObra}
              onChange={(e) => setFiltroHistoricoObra(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              <option value="">Todas as obras</option>
              {obras.map((o) => (
                <option key={o.id} value={o.nome}>
                  {o.nome}
                </option>
              ))}
            </select>

            {subempreitaAtiva && (
              <select
                value={filtroHistoricoEmpreiteiro}
                onChange={(e) => setFiltroHistoricoEmpreiteiro(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
              >
                <option value="">Todos os empreiteiros</option>
                {opcoesEmpreiteirosHistorico.map((empNome) => (
                  <option key={empNome} value={empNome}>
                    {empNome}
                  </option>
                ))}
              </select>
            )}
          </div>

          <input
            type="text"
            placeholder="Grupo / WhatsApp p/ PDF (opcional)"
            value={destinoZap}
            onChange={(e) => setDestinoZap(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700"
          />

          {avisoEnvio && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-900">
              {avisoEnvio}
            </div>
          )}

          {loading ? (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
              Carregando...
            </div>
          ) : diariosFiltrados.length === 0 ? (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2">
              <Camera className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">
                Nenhum diário encontrado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {diariosFiltrados.map((d) => {
                const gruposCard = subempreitaAtiva
                  ? agruparEfetivoPorEmpreiteiro(
                      d,
                      filtroHistoricoEmpreiteiro || undefined
                    )
                  : [];
                const ocorrenciaCard = montarTextoOcorrencia(
                  d.ocorrenciaTipo,
                  d.ocorrencias
                );

                return (
                  <div
                    key={d.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {d.obraNome}
                        </span>
                        <p className="text-xs text-slate-500 mt-1 font-medium tabular-nums">
                          {d.data} •{' '}
                          {d.ambiente === 'INTERNO'
                            ? sanitizarStatusCondominio(d.statusCondominio)
                            : d.clima}{' '}
                          • {d.efetivo.length} prof.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleExcluirDiario(d.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {subempreitaAtiva && gruposCard.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {gruposCard.map((g) => (
                          <span
                            key={g.empreiteiroNome}
                            className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
                          >
                            {g.empreiteiroNome}
                            {g.etapas.length > 0
                              ? ` • ${g.etapas.join(', ')}`
                              : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-slate-700 line-clamp-2">
                      {d.resumo}
                    </p>

                    {ocorrenciaCard && (
                      <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg truncate">
                        ⚠️ {ocorrenciaCard}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFiltroModalEmpreiteiro(
                            subempreitaAtiva ? filtroHistoricoEmpreiteiro : ''
                          );
                          setDiarioSelecionado(d);
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Relatório</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleEnviarPdfWhatsApp(
                            d,
                            filtroHistoricoEmpreiteiro
                          )
                        }
                        disabled={enviandoZapId === d.id}
                        className="py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{enviandoZapId === d.id ? '...' : 'PDF'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleCopiarWhatsApp(d, filtroHistoricoEmpreiteiro)
                        }
                        className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1"
                      >
                        {copiadoId === d.id ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiadoId === d.id ? 'OK' : 'Zap'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Cadastro de Empreiteiros & Funcionários (Exclusivo Intermack) */}
      {subempreitaAtiva && (
        <DiarioEquipesModal
          aberto={modalEquipesAberto}
          abaInicial={modalEquipesAba}
          empreiteiroInicialId={empreiteiroId}
          empreiteiros={empreiteiros}
          funcionarios={funcionarios}
          onClose={() => setModalEquipesAberto(false)}
          onAtualizado={({
            empreiteiros: novosEmp,
            funcionarios: novosFunc,
            novoEmpreiteiroId,
            novoFuncionarioId,
          }) => {
            setEmpreiteiros(novosEmp);
            setFuncionarios(novosFunc);
            if (novoEmpreiteiroId) setEmpreiteiroId(novoEmpreiteiroId);
            if (novoFuncionarioId) setFuncionarioSelecionadoId(novoFuncionarioId);
          }}
        />
      )}

      {/* Modal / Folha de Impressão PDF do Diário de Obra */}
      {diarioSelecionado && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:static print:bg-white print:p-0">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-5 sm:p-8 shadow-2xl space-y-5 my-auto print:shadow-none print:rounded-none print:p-0">
            {/* Barra de ações (oculta na impressão) */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 print:hidden">
              {subempreitaAtiva && empreiteirosDoDiarioModal.length > 0 ? (
                <select
                  value={filtroModalEmpreiteiro}
                  onChange={(e) => setFiltroModalEmpreiteiro(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  <option value="">Todos os Empreiteiros</option>
                  {empreiteirosDoDiarioModal.map((nome) => (
                    <option key={nome} value={nome}>
                      Empreiteiro: {nome}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Relatório Diário de Obra
                </span>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleCopiarWhatsApp(
                      diarioSelecionado,
                      filtroModalEmpreiteiro
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Zap</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleEnviarPdfWhatsApp(
                      diarioSelecionado,
                      filtroModalEmpreiteiro
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-bold flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Baixar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
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
                <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight uppercase">
                  {diarioSelecionado.empresaNome}
                </h2>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Relatório Diário de Obra (RDO)
                </p>
              </div>
              <div className="text-right text-xs text-slate-700 space-y-0.5 tabular-nums">
                <p className="font-black text-slate-950 text-sm">
                  {diarioSelecionado.obraNome}
                </p>
                <p>Data: {diarioSelecionado.data}</p>
                <p>
                  {diarioSelecionado.ambiente === 'INTERNO'
                    ? `Acesso: ${sanitizarStatusCondominio(diarioSelecionado.statusCondominio)}`
                    : `Clima: ${diarioSelecionado.clima}`}
                </p>
              </div>
            </div>

            {/* Equipes e Efetivo */}
            {subempreitaAtiva ? (
              <div className="space-y-3">
                {gruposModal.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    Nenhum profissional encontrado para o filtro selecionado.
                  </p>
                ) : (
                  gruposModal.map((grupo) => (
                    <div
                      key={grupo.empreiteiroNome}
                      className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-400 block">
                            Empreiteiro / Encarregado
                          </span>
                          <span className="text-sm font-black text-slate-900">
                            {grupo.empreiteiroNome}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black uppercase text-slate-400 block">
                            Etapa / Serviço
                          </span>
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                            {grupo.etapas.length > 0
                              ? grupo.etapas.join(', ')
                              : 'Serviço geral'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {grupo.funcionarios.length > 0 ? (
                          grupo.funcionarios.map((f, idx) => (
                            <span
                              key={`${f.nome}-${idx}`}
                              className="text-xs font-semibold bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-slate-800"
                            >
                              {formatarNomeFuncionarioComMetadados(f)}
                              {f.etapaNome && grupo.etapas.length > 1
                                ? ` • ${f.etapaNome}`
                                : ''}{' '}
                              ({f.periodo === 'INTEGRAL' ? 'Inteiro' : '½ Dia'})
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">
                            Sem efetivo listado
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black uppercase text-slate-400 block">
                  Efetivo Presente ({diarioSelecionado.efetivo.length})
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {diarioSelecionado.efetivo.length > 0 ? (
                    diarioSelecionado.efetivo.map((e, i) => (
                      <span
                        key={i}
                        className="text-xs font-semibold bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-slate-800"
                      >
                        {e.nome} (
                        {e.periodo === 'INTEGRAL' ? 'Inteiro' : '½ Dia'})
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">
                      Não informado
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Resumo e Ocorrência (somente se houver) */}
            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                  Resumo das Atividades
                </h3>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {diarioSelecionado.resumo}
                </p>
              </div>

              {montarTextoOcorrencia(
                diarioSelecionado.ocorrenciaTipo,
                diarioSelecionado.ocorrencias
              ) && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-800 mb-1">
                    Ocorrência / Impedimento
                  </h3>
                  <p className="text-xs text-amber-950">
                    {montarTextoOcorrencia(
                      diarioSelecionado.ocorrenciaTipo,
                      diarioSelecionado.ocorrencias
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Grade de Fotos */}
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
              <span className="tabular-nums">
                {new Date(diarioSelecionado.criadoEm).toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
