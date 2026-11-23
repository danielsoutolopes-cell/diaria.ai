'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  HardHat,
  Users,
  Building2,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  RefreshCw,
  Wrench,
  CreditCard,
  Phone,
  MapPin,
  FileBadge,
  Layers,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import {
  ETAPAS_PADRAO_OBRA,
  normalizarTextoBusca,
  type EmpreiteiroDiarioRecord,
  type FuncionarioEmpreiteiroRecord,
} from '@/lib/diarioObraRelatorio';

interface ObraIntermackItem {
  id: string;
  nome: string;
  local: string;
  alias_fornecedor?: string;
  cep_entrega?: string;
  complemento_entrega?: string;
  contato_recebimento?: string;
  ativo: boolean;
}

type AbaIntermack = 'EMPREITEIROS' | 'FUNCIONARIOS' | 'OBRAS';

function formatarTelefoneBR(valor: string): string {
  const nums = valor.replace(/\D/g, '').slice(0, 11);
  if (nums.length <= 2) return nums;
  if (nums.length <= 6) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
  if (nums.length <= 10)
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 6)}-${nums.slice(6)}`;
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
}

const ETAPAS_INICIAIS_PADRAO: readonly string[] = [
  'Demolição',
  'Hidráulica',
  'Elétrica',
  'Gesso',
  'Revestimentos',
  'Acabamento',
];

export default function SetupIntermackPanel() {
  const [abaAtiva, setAbaAtiva] = useState<AbaIntermack>('EMPREITEIROS');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  // Dados carregados da Intermack
  const [empreiteiros, setEmpreiteiros] = useState<EmpreiteiroDiarioRecord[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioEmpreiteiroRecord[]>(
    []
  );
  const [obras, setObras] = useState<ObraIntermackItem[]>([]);
  const [etapasPorObra, setEtapasPorObra] = useState<Record<string, string[]>>({});

  // =========================================================================
  // ABA 1: EMPREITEIROS / ENCARREGADOS
  // =========================================================================
  const [editEmpId, setEditEmpId] = useState<string | null>(null);
  const [empNome, setEmpNome] = useState('');
  const [empApelidos, setEmpApelidos] = useState('');
  const [empDocumento, setEmpDocumento] = useState('');
  const [empEtapaPadrao, setEmpEtapaPadrao] = useState('Hidráulica');
  const [empTelefone, setEmpTelefone] = useState('');
  const [empPix, setEmpPix] = useState('');
  const [empTambemAtuaNaObra, setEmpTambemAtuaNaObra] = useState(true);
  const [salvandoEmp, setSalvandoEmp] = useState(false);
  const [incluindoNaEquipeId, setIncluindoNaEquipeId] = useState<string | null>(
    null
  );

  // =========================================================================
  // ABA 2: FUNCIONÁRIOS / EQUIPE (vinculados ao Empreiteiro, PIX não exigido)
  // =========================================================================
  const [editFuncId, setEditFuncId] = useState<string | null>(null);
  const [funcNomeOficial, setFuncNomeOficial] = useState('');
  const [funcEmpreiteiroId, setFuncEmpreiteiroId] = useState('');
  const [funcApelidos, setFuncApelidos] = useState('');
  const [funcDocumento, setFuncDocumento] = useState('');
  const [funcEtapa, setFuncEtapa] = useState('');
  const [salvandoFunc, setSalvandoFunc] = useState(false);
  const [filtroEmpLista, setFiltroEmpLista] = useState('');
  const [buscaFunc, setBuscaFunc] = useState('');

  // =========================================================================
  // ABA 3: OBRAS & ETAPAS (Intermack — com logística de entrega + etapas)
  // =========================================================================
  const [novaObraNome, setNovaObraNome] = useState('');
  const [novaObraAlias, setNovaObraAlias] = useState('');
  const [novaObraCep, setNovaObraCep] = useState('');
  const [novaObraEndereco, setNovaObraEndereco] = useState('');
  const [novaObraComplemento, setNovaObraComplemento] = useState('');
  const [novaObraContato, setNovaObraContato] = useState('');
  const [novaObraApelidos, setNovaObraApelidos] = useState('');
  const [novaObraEtapas, setNovaObraEtapas] = useState<string[]>([
    ...ETAPAS_INICIAIS_PADRAO,
  ]);
  const [novaEtapaAvulsa, setNovaEtapaAvulsa] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvandoObra, setSalvandoObra] = useState(false);

  // Edição rápida de etapas em obras existentes
  const [obraEditandoEtapas, setObraEditandoEtapas] = useState<string | null>(null);
  const [etapasDraft, setEtapasDraft] = useState<string[]>([]);
  const [etapaCustomDraft, setEtapaCustomDraft] = useState('');
  const [salvandoEtapas, setSalvandoEtapas] = useState(false);

  function mostrarFeedback(tipo: 'sucesso' | 'erro', texto: string) {
    setFeedback({ tipo, texto });
    setTimeout(() => setFeedback(null), 4500);
  }

  const carregarTudo = useCallback(async () => {
    setLoading(true);
    try {
      const [resEquipes, resObras, resEtapas] = await Promise.all([
        fetch('/api/diario-obra/equipes', { cache: 'no-store' }),
        fetch('/api/obras', { cache: 'no-store' }),
        fetch('/api/diario-obra/etapas', { cache: 'no-store' }),
      ]);
      const dEquipes = (await resEquipes.json()) as {
        empreiteiros?: EmpreiteiroDiarioRecord[];
        funcionarios?: FuncionarioEmpreiteiroRecord[];
      };
      const dObras = (await resObras.json()) as {
        obras?: ObraIntermackItem[];
      };
      const dEtapas = (await resEtapas.json()) as {
        etapasPorObra?: Record<string, string[]>;
      };

      setEmpreiteiros(dEquipes.empreiteiros || []);
      setFuncionarios(dEquipes.funcionarios || []);
      setObras((dObras.obras || []).filter((o) => o.ativo !== false));
      setEtapasPorObra(dEtapas.etapasPorObra || {});
    } catch (err) {
      console.error('Erro ao carregar Setup Intermack:', err);
      mostrarFeedback('erro', 'Falha ao carregar cadastros da Intermack.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregarTudo();
  }, [carregarTudo]);

  // Todas as etapas disponíveis (padrão + cadastradas nas obras da Intermack)
  const todasEtapasDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const et of ETAPAS_PADRAO_OBRA) {
      mapa.set(normalizarTextoBusca(et), et);
    }
    for (const lista of Object.values(etapasPorObra)) {
      for (const et of lista) {
        const chave = normalizarTextoBusca(et);
        if (chave && !mapa.has(chave)) mapa.set(chave, et);
      }
    }
    return Array.from(mapa.values());
  }, [etapasPorObra]);

  // Contagem de funcionários por empreiteiro
  const qtdFuncionariosPorEmp = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const f of funcionarios) {
      if (f.empreiteiroId) {
        mapa.set(f.empreiteiroId, (mapa.get(f.empreiteiroId) || 0) + 1);
      }
    }
    return mapa;
  }, [funcionarios]);

  const funcionariosFiltrados = useMemo(() => {
    const termo = normalizarTextoBusca(buscaFunc);
    const digitos = buscaFunc.replace(/\D/g, '');
    return funcionarios.filter((f) => {
      if (filtroEmpLista && f.empreiteiroId !== filtroEmpLista) return false;
      if (!termo) return true;
      if (normalizarTextoBusca(f.nomeOficial).includes(termo)) return true;
      if (f.apelidos.some((a) => normalizarTextoBusca(a).includes(termo)))
        return true;
      if (normalizarTextoBusca(f.empreiteiroNome).includes(termo)) return true;
      if (normalizarTextoBusca(f.funcao).includes(termo)) return true;
      if (f.documento) {
        if (normalizarTextoBusca(f.documento).includes(termo)) return true;
        if (digitos.length >= 3 && f.documento.replace(/\D/g, '').includes(digitos))
          return true;
      }
      return false;
    });
  }, [funcionarios, filtroEmpLista, buscaFunc]);

  // =========================================================================
  // HANDLERS EMPREITEIRO
  // =========================================================================
  function empreiteiroJaNaEquipe(emp: EmpreiteiroDiarioRecord): boolean {
    const nomeNorm = normalizarTextoBusca(emp.nome);
    if (!nomeNorm) return false;
    return funcionarios.some(
      (f) =>
        f.empreiteiroId === emp.id &&
        normalizarTextoBusca(f.nomeOficial) === nomeNorm
    );
  }

  async function handleIncluirEmpreiteiroNaEquipe(
    emp: EmpreiteiroDiarioRecord
  ) {
    if (empreiteiroJaNaEquipe(emp)) {
      mostrarFeedback(
        'sucesso',
        `${emp.nome} já está incluído em Funcionários / Equipe.`
      );
      return;
    }
    setIncluindoNaEquipeId(emp.id);
    try {
      const res = await fetch('/api/diario-obra/equipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'funcionario',
          nomeOficial: emp.nome.trim(),
          empreiteiroId: emp.id,
          apelidos: emp.apelidos.join(', '),
          documento: emp.documento || null,
          funcao: emp.etapaPadrao || null,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        empreiteiros?: EmpreiteiroDiarioRecord[];
        funcionarios?: FuncionarioEmpreiteiroRecord[];
      };
      if (!res.ok || !data.success) {
        mostrarFeedback(
          'erro',
          data.error || 'Falha ao incluir empreiteiro na equipe de campo.'
        );
        return;
      }
      if (data.empreiteiros) setEmpreiteiros(data.empreiteiros);
      if (data.funcionarios) setFuncionarios(data.funcionarios);
      mostrarFeedback(
        'sucesso',
        `${emp.nome} replicado em Funcionários / Equipe e disponível no Diário de Obra!`
      );
    } catch {
      mostrarFeedback(
        'erro',
        'Erro de conexão ao incluir empreiteiro na equipe.'
      );
    } finally {
      setIncluindoNaEquipeId(null);
    }
  }

  function limparFormEmp() {
    setEditEmpId(null);
    setEmpNome('');
    setEmpApelidos('');
    setEmpDocumento('');
    setEmpEtapaPadrao('Hidráulica');
    setEmpTelefone('');
    setEmpPix('');
    setEmpTambemAtuaNaObra(true);
  }

  async function handleSalvarEmpreiteiro(e: React.FormEvent) {
    e.preventDefault();
    if (!empNome.trim()) return;
    const nomeTrim = empNome.trim();
    const apelidosTrim = empApelidos;
    const docTrim = empDocumento.trim() || null;
    const etapaTrim = empEtapaPadrao.trim() || null;
    const replicarNaEquipe = !editEmpId && empTambemAtuaNaObra;

    setSalvandoEmp(true);
    try {
      const res = await fetch('/api/diario-obra/equipes', {
        method: editEmpId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'empreiteiro',
          id: editEmpId || undefined,
          nome: nomeTrim,
          apelidos: apelidosTrim,
          documento: docTrim,
          etapaPadrao: etapaTrim,
          telefone: empTelefone.trim() || null,
          chavePix: empPix.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        empreiteiros?: EmpreiteiroDiarioRecord[];
        funcionarios?: FuncionarioEmpreiteiroRecord[];
      };
      if (!res.ok || !data.success) {
        mostrarFeedback('erro', data.error || 'Falha ao salvar empreiteiro.');
        return;
      }
      const listaEmps = data.empreiteiros || empreiteiros;
      if (data.empreiteiros) setEmpreiteiros(data.empreiteiros);
      if (data.funcionarios) setFuncionarios(data.funcionarios);

      let replicadoComSucesso = false;
      if (replicarNaEquipe) {
        const nomeNorm = normalizarTextoBusca(nomeTrim);
        const empCriado = listaEmps.find(
          (item) => normalizarTextoBusca(item.nome) === nomeNorm
        );
        if (empCriado) {
          const resFunc = await fetch('/api/diario-obra/equipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipo: 'funcionario',
              nomeOficial: empCriado.nome.trim(),
              empreiteiroId: empCriado.id,
              apelidos: apelidosTrim,
              documento: docTrim,
              funcao: etapaTrim,
            }),
          });
          const dataFunc = (await resFunc.json()) as {
            success?: boolean;
            empreiteiros?: EmpreiteiroDiarioRecord[];
            funcionarios?: FuncionarioEmpreiteiroRecord[];
          };
          if (resFunc.ok && dataFunc.success) {
            if (dataFunc.empreiteiros) setEmpreiteiros(dataFunc.empreiteiros);
            if (dataFunc.funcionarios) setFuncionarios(dataFunc.funcionarios);
            replicadoComSucesso = true;
          }
        }
      }

      mostrarFeedback(
        'sucesso',
        editEmpId
          ? 'Empreiteiro atualizado e sincronizado com o Diário de Obra!'
          : replicadoComSucesso
            ? 'Empreiteiro cadastrado e incluído automaticamente em Funcionários / Equipe!'
            : 'Empreiteiro cadastrado e disponível no Diário de Obra!'
      );
      limparFormEmp();
    } catch {
      mostrarFeedback('erro', 'Erro de conexão ao salvar empreiteiro.');
    } finally {
      setSalvandoEmp(false);
    }
  }

  // =========================================================================
  // HANDLERS FUNCIONÁRIO (EQUIPE DO EMPREITEIRO)
  // =========================================================================
  function limparFormFunc() {
    setEditFuncId(null);
    setFuncNomeOficial('');
    setFuncApelidos('');
    setFuncDocumento('');
    setFuncEtapa('');
  }

  async function handleSalvarFuncionario(e: React.FormEvent) {
    e.preventDefault();
    if (!funcNomeOficial.trim() || !funcEmpreiteiroId) {
      mostrarFeedback(
        'erro',
        'Informe o Nome Oficial e selecione o Empreiteiro / Encarregado.'
      );
      return;
    }
    setSalvandoFunc(true);
    try {
      const res = await fetch('/api/diario-obra/equipes', {
        method: editFuncId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'funcionario',
          id: editFuncId || undefined,
          nomeOficial: funcNomeOficial.trim(),
          empreiteiroId: funcEmpreiteiroId,
          apelidos: funcApelidos,
          documento: funcDocumento.trim() || null,
          funcao: funcEtapa.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        empreiteiros?: EmpreiteiroDiarioRecord[];
        funcionarios?: FuncionarioEmpreiteiroRecord[];
      };
      if (!res.ok || !data.success) {
        mostrarFeedback('erro', data.error || 'Falha ao salvar funcionário.');
        return;
      }
      if (data.empreiteiros) setEmpreiteiros(data.empreiteiros);
      if (data.funcionarios) setFuncionarios(data.funcionarios);
      mostrarFeedback(
        'sucesso',
        editFuncId
          ? 'Funcionário atualizado!'
          : 'Funcionário vinculado à equipe e disponível no Diário de Obra!'
      );
      limparFormFunc();
    } catch {
      mostrarFeedback('erro', 'Erro de conexão ao salvar funcionário.');
    } finally {
      setSalvandoFunc(false);
    }
  }

  async function handleRemoverEquipe(
    tipo: 'empreiteiro' | 'funcionario',
    id: string
  ) {
    try {
      const res = await fetch(
        `/api/diario-obra/equipes?tipo=${tipo}&id=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        empreiteiros?: EmpreiteiroDiarioRecord[];
        funcionarios?: FuncionarioEmpreiteiroRecord[];
      };
      if (!res.ok || !data.success) {
        mostrarFeedback('erro', data.error || 'Falha ao remover cadastro.');
        return;
      }
      if (data.empreiteiros) setEmpreiteiros(data.empreiteiros);
      if (data.funcionarios) setFuncionarios(data.funcionarios);
      mostrarFeedback('sucesso', 'Cadastro removido.');
    } catch {
      mostrarFeedback('erro', 'Erro ao remover registro.');
    }
  }

  // =========================================================================
  // HANDLERS OBRAS & ETAPAS (INTERMACK)
  // =========================================================================
  async function buscarCepIntermack(cepDigitado: string) {
    const limpo = cepDigitado.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (!data.erro && data.logradouro) {
        const montado = `${data.logradouro}, nº __ - ${data.bairro || ''} - ${data.localidade || ''}/${data.uf || ''}`;
        setNovaObraEndereco((prev) => (prev.trim() ? prev : montado));
      }
    } catch {
      // Silencioso offline
    } finally {
      setBuscandoCep(false);
    }
  }

  function toggleEtapaNovaObra(etapa: string) {
    setNovaObraEtapas((prev) =>
      prev.includes(etapa) ? prev.filter((e) => e !== etapa) : [...prev, etapa]
    );
  }

  function adicionarEtapaCustomNovaObra() {
    const limpa = novaEtapaAvulsa.trim();
    if (!limpa) return;
    if (
      !novaObraEtapas.some(
        (e) => normalizarTextoBusca(e) === normalizarTextoBusca(limpa)
      )
    ) {
      setNovaObraEtapas((prev) => [...prev, limpa]);
    }
    setNovaEtapaAvulsa('');
  }

  async function handleCadastrarObraIntermack(e: React.FormEvent) {
    e.preventDefault();
    if (!novaObraNome.trim() || !novaObraAlias.trim() || !novaObraEndereco.trim()) {
      mostrarFeedback(
        'erro',
        'Preencha Nome da Obra, Alias p/ Fornecedor e Endereço de Entrega.'
      );
      return;
    }
    setSalvandoObra(true);
    try {
      const apelidosLista = novaObraApelidos
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean);

      const res = await fetch('/api/obras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: novaObraNome.trim().toUpperCase(),
          alias_fornecedor: novaObraAlias.trim(),
          cep_entrega: novaObraCep.trim(),
          local: novaObraEndereco.trim(),
          complemento_entrega: novaObraComplemento.trim(),
          contato_recebimento: novaObraContato.trim(),
          tipo_obra: 'OBRA_CIVIL',
          apelidos: apelidosLista,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        obra?: ObraIntermackItem;
        error?: string;
      };
      if (!res.ok || !data.obra) {
        mostrarFeedback('erro', data.error || 'Erro ao cadastrar obra.');
        return;
      }

      // Salvar etapas da obra imediatamente para alimentar o /diario-obra
      if (novaObraEtapas.length > 0) {
        const resEt = await fetch('/api/diario-obra/etapas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            obraNome: data.obra.nome,
            etapas: novaObraEtapas,
          }),
        });
        const dEt = (await resEt.json()) as {
          etapasPorObra?: Record<string, string[]>;
        };
        if (dEt.etapasPorObra) setEtapasPorObra(dEt.etapasPorObra);
      }

      setObras((prev) => [data.obra as ObraIntermackItem, ...prev]);
      setNovaObraNome('');
      setNovaObraAlias('');
      setNovaObraCep('');
      setNovaObraEndereco('');
      setNovaObraComplemento('');
      setNovaObraContato('');
      setNovaObraApelidos('');
      setNovaObraEtapas([...ETAPAS_INICIAIS_PADRAO]);
      mostrarFeedback(
        'sucesso',
        'Obra e etapas cadastradas — já disponíveis no Diário de Obra!'
      );
    } catch {
      mostrarFeedback('erro', 'Erro de comunicação ao salvar obra.');
    } finally {
      setSalvandoObra(false);
    }
  }

  function iniciarEdicaoEtapasObra(obraNome: string) {
    const chave = normalizarTextoBusca(obraNome);
    setObraEditandoEtapas(obraNome);
    setEtapasDraft(
      etapasPorObra[chave] && etapasPorObra[chave].length > 0
        ? [...etapasPorObra[chave]]
        : [...ETAPAS_INICIAIS_PADRAO]
    );
    setEtapaCustomDraft('');
  }

  async function salvarEtapasObraExistente(obraNome: string) {
    setSalvandoEtapas(true);
    try {
      const res = await fetch('/api/diario-obra/etapas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obraNome,
          etapas: etapasDraft,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        etapasPorObra?: Record<string, string[]>;
        error?: string;
      };
      if (!res.ok || !data.success) {
        mostrarFeedback('erro', data.error || 'Erro ao salvar etapas.');
        return;
      }
      if (data.etapasPorObra) setEtapasPorObra(data.etapasPorObra);
      setObraEditandoEtapas(null);
      mostrarFeedback(
        'sucesso',
        `Etapas de ${obraNome} salvas e sincronizadas com o Diário de Obra!`
      );
    } catch {
      mostrarFeedback('erro', 'Erro de conexão ao salvar etapas.');
    } finally {
      setSalvandoEtapas(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header + 3 Abas Superiores (Exclusivo Intermack) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Layers className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
              Intermack • Gestão de Subempreita
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-950 mt-1">
            Obras, Empreiteiros &amp; Equipes
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Cadastre Empreiteiros, vincule Funcionários (com apelidos e CPF/RG) e configure Etapas de Obra para o Diário de Obra.
          </p>
        </div>

        <div className="flex flex-wrap items-center bg-slate-200/70 p-1.5 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setAbaAtiva('EMPREITEIROS')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              abaAtiva === 'EMPREITEIROS'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <HardHat className="w-4 h-4" />
            <span>Empreiteiros / Encarregados ({empreiteiros.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('FUNCIONARIOS')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              abaAtiva === 'FUNCIONARIOS'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Funcionários / Equipe ({funcionarios.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('OBRAS')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              abaAtiva === 'OBRAS'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Obras &amp; Etapas ({obras.length})</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* ABA 1: EMPREITEIROS / ENCARREGADOS                                */}
      {/* ================================================================= */}
      {abaAtiva === 'EMPREITEIROS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <form
            onSubmit={handleSalvarEmpreiteiro}
            className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">
                  Subempreitada
                </span>
                <h2 className="text-base font-black text-slate-950">
                  {editEmpId
                    ? 'Editar Empreiteiro'
                    : 'Novo Empreiteiro / Encarregado'}
                </h2>
              </div>
              {editEmpId && (
                <button
                  type="button"
                  onClick={limparFormEmp}
                  className="p-1.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Nome *</label>
              <input
                type="text"
                required
                placeholder="Ex: Alexandre Reis, Edson"
                value={empNome}
                onChange={(e) => setEmpNome(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Apelidos (separados por vírgula)
              </label>
              <input
                type="text"
                placeholder="Ex: Alex, Reis, Edinho"
                value={empApelidos}
                onChange={(e) => setEmpApelidos(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Documento (CPF / CNPJ)
              </label>
              <input
                type="text"
                placeholder="000.000.000-00 ou CNPJ"
                value={empDocumento}
                onChange={(e) => setEmpDocumento(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Especialidade / Etapa Padrão
              </label>
              <select
                value={empEtapaPadrao}
                onChange={(e) => setEmpEtapaPadrao(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
              >
                <option value="">Sem etapa padrão</option>
                {todasEtapasDisponiveis.map((et) => (
                  <option key={et} value={et}>
                    {et}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  WhatsApp / Celular
                </label>
                <input
                  type="text"
                  placeholder="(11) 9...."
                  value={empTelefone}
                  onChange={(e) =>
                    setEmpTelefone(formatarTelefoneBR(e.target.value))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Chave PIX (opcional)
                </label>
                <input
                  type="text"
                  placeholder="CPF, CNPJ, Tel..."
                  value={empPix}
                  onChange={(e) => setEmpPix(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900"
                />
              </div>
            </div>

            {!editEmpId && (
              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={empTambemAtuaNaObra}
                  onChange={(e) => setEmpTambemAtuaNaObra(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-[11px] leading-snug text-slate-700">
                  <strong className="text-slate-900">
                    Também atua na obra
                  </strong>{' '}
                  — incluir automaticamente em <em>Funcionários / Equipe</em>{' '}
                  para apontar no Diário de Obra.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={salvandoEmp}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {editEmpId ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{salvandoEmp ? 'Atualizando...' : 'Atualizar Empreiteiro'}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>{salvandoEmp ? 'Salvando...' : 'Salvar Empreiteiro'}</span>
                </>
              )}
            </button>
          </form>

          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-950 text-base">
                Empreiteiros Cadastrados ({empreiteiros.length})
              </h2>
              <button
                type="button"
                onClick={() => void carregarTudo()}
                className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            {loading ? (
              <div className="bg-white p-10 text-center rounded-3xl border border-slate-200 text-xs text-slate-500">
                Carregando empreiteiros...
              </div>
            ) : empreiteiros.length === 0 ? (
              <div className="bg-white p-10 text-center rounded-3xl border border-slate-200 space-y-2">
                <HardHat className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-800">
                  Nenhum empreiteiro cadastrado na Intermack
                </p>
                <p className="text-xs text-slate-500">
                  Cadastre o primeiro empreiteiro ao lado (ex.: Alexandre Reis, Edson) para vincular os funcionários da equipe.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {empreiteiros.map((emp) => {
                  const qtdEquipe = qtdFuncionariosPorEmp.get(emp.id) || 0;
                  const jaNaEquipe = empreiteiroJaNaEquipe(emp);
                  const incluindo = incluindoNaEquipeId === emp.id;
                  return (
                    <div
                      key={emp.id}
                      className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-black text-sm text-slate-950">
                            {emp.nome}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {emp.etapaPadrao && (
                              <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                                {emp.etapaPadrao}
                              </span>
                            )}
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full tabular-nums">
                              {qtdEquipe} funcionário(s)
                            </span>
                            {jaNaEquipe && (
                              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                Atua na Obra
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                        {emp.documento && (
                          <p className="flex items-center gap-1.5 text-[11px]">
                            <FileBadge className="w-3.5 h-3.5 text-slate-400" />
                            <span>Doc: {emp.documento}</span>
                          </p>
                        )}
                        {emp.telefone && (
                          <p className="flex items-center gap-1.5 text-[11px]">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{emp.telefone}</span>
                          </p>
                        )}
                        {emp.chavePix && (
                          <p className="flex items-center gap-1.5 text-[11px] font-mono">
                            <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                            <span>PIX: {emp.chavePix}</span>
                          </p>
                        )}
                        {emp.apelidos.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            <span className="text-[10px] font-bold text-slate-400">
                              Apelidos:
                            </span>
                            {emp.apelidos.map((ap, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg"
                              >
                                {ap}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRemoverEquipe('empreiteiro', emp.id)}
                          className="px-2.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remover</span>
                        </button>
                        <div className="flex items-center gap-1.5">
                          {!jaNaEquipe && (
                            <button
                              type="button"
                              disabled={incluindo}
                              onClick={() =>
                                void handleIncluirEmpreiteiroNaEquipe(emp)
                              }
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-[11px] font-bold flex items-center gap-1 border border-emerald-200 disabled:opacity-50"
                            >
                              <Users className="w-3 h-3" />
                              <span>
                                {incluindo
                                  ? 'Incluindo...'
                                  : '+ Incluir na Equipe'}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditEmpId(emp.id);
                              setEmpNome(emp.nome);
                              setEmpApelidos(emp.apelidos.join(', '));
                              setEmpDocumento(emp.documento || '');
                              setEmpEtapaPadrao(emp.etapaPadrao || '');
                              setEmpTelefone(emp.telefone || '');
                              setEmpPix(emp.chavePix || '');
                            }}
                            className="px-3 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-xl text-[11px] font-bold flex items-center gap-1 border border-slate-200"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Editar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* ABA 2: FUNCIONÁRIOS / EQUIPE (vinculados ao Empreiteiro)          */}
      {/* ================================================================= */}
      {abaAtiva === 'FUNCIONARIOS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <form
            onSubmit={handleSalvarFuncionario}
            className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">
                  Equipe de Campo
                </span>
                <h2 className="text-base font-black text-slate-950">
                  {editFuncId ? 'Editar Funcionário' : 'Novo Funcionário'}
                </h2>
              </div>
              {editFuncId && (
                <button
                  type="button"
                  onClick={limparFormFunc}
                  className="p-1.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Nome Oficial *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Antônio Carlos, Juninho"
                value={funcNomeOficial}
                onChange={(e) => setFuncNomeOficial(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Empreiteiro / Encarregado *
              </label>
              <select
                required
                value={funcEmpreiteiroId}
                onChange={(e) => {
                  const id = e.target.value;
                  setFuncEmpreiteiroId(id);
                  const emp = empreiteiros.find((item) => item.id === id);
                  if (emp?.etapaPadrao && !funcEtapa) {
                    setFuncEtapa(emp.etapaPadrao);
                  }
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
              >
                <option value="">Selecione o empreiteiro...</option>
                {empreiteiros.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nome}
                    {emp.etapaPadrao ? ` (${emp.etapaPadrao})` : ''}
                  </option>
                ))}
              </select>
              {empreiteiros.length === 0 && (
                <p className="text-[11px] text-amber-700 font-semibold">
                  Cadastre primeiro um empreiteiro na aba &quot;Empreiteiros / Encarregados&quot;.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Apelidos (separados por vírgula)
              </label>
              <input
                type="text"
                placeholder="Ex: Tom, Tonho"
                value={funcApelidos}
                onChange={(e) => setFuncApelidos(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Documento (CPF / RG)
              </label>
              <input
                type="text"
                placeholder="CPF ou RG para portaria"
                value={funcDocumento}
                onChange={(e) => setFuncDocumento(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Etapa / Especialidade
              </label>
              <select
                value={funcEtapa}
                onChange={(e) => setFuncEtapa(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900"
              >
                <option value="">Herdar etapa do empreiteiro</option>
                {todasEtapasDisponiveis.map((et) => (
                  <option key={et} value={et}>
                    {et}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
              Pagamento via empreiteiro — Chave PIX individual não é obrigatória.
            </p>

            <button
              type="submit"
              disabled={salvandoFunc || empreiteiros.length === 0}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {editFuncId ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{salvandoFunc ? 'Atualizando...' : 'Atualizar Funcionário'}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>{salvandoFunc ? 'Salvando...' : 'Salvar Funcionário'}</span>
                </>
              )}
            </button>
          </form>

          <div className="lg:col-span-2 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-extrabold text-slate-950 text-base">
                Funcionários / Equipe ({funcionariosFiltrados.length})
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filtroEmpLista}
                  onChange={(e) => setFiltroEmpLista(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"
                >
                  <option value="">Todos os empreiteiros</option>
                  {empreiteiros.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome}
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar nome, apelido ou doc..."
                    value={buscaFunc}
                    onChange={(e) => setBuscaFunc(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                  />
                </div>
              </div>
            </div>

            {funcionariosFiltrados.length === 0 ? (
              <div className="bg-white p-10 text-center rounded-3xl border border-slate-200 space-y-2">
                <Users className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500">
                  Nenhum funcionário encontrado para o filtro atual.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {funcionariosFiltrados.map((f) => (
                  <div
                    key={f.id}
                    className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-2.5"
                  >
                    <div>
                      <h3 className="font-black text-sm text-slate-950">
                        {f.nomeOficial}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                          {f.empreiteiroNome || 'Sem empreiteiro'}
                        </span>
                        {f.funcao && (
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Wrench className="w-2.5 h-2.5" />
                            <span>{f.funcao}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                      {f.documento && (
                        <p className="text-[11px] flex items-center gap-1.5">
                          <FileBadge className="w-3.5 h-3.5 text-slate-400" />
                          <span>CPF/RG: {f.documento}</span>
                        </p>
                      )}
                      {f.apelidos.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-400">
                            Apelidos:
                          </span>
                          {f.apelidos.map((ap, i) => (
                            <span
                              key={i}
                              className="text-[10px] font-bold bg-indigo-50/70 text-indigo-800 px-2 py-0.5 rounded-lg"
                            >
                              {ap}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => void handleRemoverEquipe('funcionario', f.id)}
                        className="px-2.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditFuncId(f.id);
                          setFuncNomeOficial(f.nomeOficial);
                          setFuncEmpreiteiroId(f.empreiteiroId || '');
                          setFuncApelidos(f.apelidos.join(', '));
                          setFuncDocumento(f.documento || '');
                          setFuncEtapa(f.funcao || '');
                        }}
                        className="px-3 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-xl text-[11px] font-bold flex items-center gap-1 border border-slate-200"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* ABA 3: OBRAS & ETAPAS (alimenta /diario-obra automaticamente)     */}
      {/* ================================================================= */}
      {abaAtiva === 'OBRAS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <form
            onSubmit={handleCadastrarObraIntermack}
            className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3.5"
          >
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">
                Canteiros &amp; Frentes
              </span>
              <h2 className="text-base font-black text-slate-950">
                Nova Obra &amp; Etapas
              </h2>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Nome da Obra *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Apartamento Itaim"
                value={novaObraNome}
                onChange={(e) => setNovaObraNome(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Alias / Cliente p/ Fornecedores *
              </label>
              <input
                type="text"
                required
                placeholder="Identificação na NF / Pedido"
                value={novaObraAlias}
                onChange={(e) => setNovaObraAlias(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">CEP</label>
                <input
                  type="text"
                  placeholder="00000-000"
                  value={novaObraCep}
                  onChange={(e) => {
                    setNovaObraCep(e.target.value);
                    void buscarCepIntermack(e.target.value);
                  }}
                  className="w-full px-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Endereço de Entrega * {buscandoCep && '(buscando...)'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Rua, nº, bairro, cidade"
                  value={novaObraEndereco}
                  onChange={(e) => setNovaObraEndereco(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Complemento / Portaria"
                value={novaObraComplemento}
                onChange={(e) => setNovaObraComplemento(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs"
              />
              <input
                type="text"
                placeholder="Quem recebe na obra"
                value={novaObraContato}
                onChange={(e) => setNovaObraContato(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs"
              />
            </div>

            <input
              type="text"
              placeholder="Apelidos da obra (vírgula)"
              value={novaObraApelidos}
              onChange={(e) => setNovaObraApelidos(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs"
            />

            {/* Etapas da Obra */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 block">
                Etapas da Obra ({novaObraEtapas.length})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ETAPAS_PADRAO_OBRA.map((et) => {
                  const ativa = novaObraEtapas.includes(et);
                  return (
                    <button
                      key={et}
                      type="button"
                      onClick={() => toggleEtapaNovaObra(et)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                        ativa
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {et}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Outra etapa (ex: Forro Acústico)..."
                  value={novaEtapaAvulsa}
                  onChange={(e) => setNovaEtapaAvulsa(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarEtapaCustomNovaObra();
                    }
                  }}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
                <button
                  type="button"
                  onClick={adicionarEtapaCustomNovaObra}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold"
                >
                  + Add
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={salvandoObra}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md disabled:opacity-50"
            >
              {salvandoObra ? 'Salvando Obra...' : 'Salvar Obra & Etapas'}
            </button>
          </form>

          <div className="lg:col-span-2 space-y-3">
            <h2 className="font-extrabold text-slate-950 text-base">
              Obras Ativas &amp; Etapas ({obras.length})
            </h2>

            {obras.length === 0 ? (
              <div className="bg-white p-10 text-center rounded-3xl border border-slate-200 text-xs text-slate-500">
                Nenhuma obra cadastrada para a Intermack ainda.
              </div>
            ) : (
              <div className="space-y-3.5">
                {obras.map((o) => {
                  const chave = normalizarTextoBusca(o.nome);
                  const etapasObra = etapasPorObra[chave] || [];
                  const editandoEsta = obraEditandoEtapas === o.nome;

                  return (
                    <div
                      key={o.id}
                      className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-black text-sm text-slate-950">
                            {o.nome}
                          </h3>
                          {o.alias_fornecedor && (
                            <p className="text-[11px] font-bold text-indigo-700">
                              Alias p/ Fornecedor: {o.alias_fornecedor}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{o.local}</span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            editandoEsta
                              ? setObraEditandoEtapas(null)
                              : iniciarEdicaoEtapasObra(o.nome)
                          }
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] font-bold flex items-center gap-1"
                        >
                          <Wrench className="w-3 h-3" />
                          <span>
                            {editandoEsta ? 'Fechar Etapas' : 'Configurar Etapas'}
                          </span>
                        </button>
                      </div>

                      {/* Etapas cadastradas */}
                      {!editandoEsta ? (
                        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                          {etapasObra.length > 0 ? (
                            etapasObra.map((et) => (
                              <span
                                key={et}
                                className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg"
                              >
                                {et}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Usando etapas padrão no Diário de Obra (clique em Configurar Etapas para personalizar).
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from(
                              new Set([...ETAPAS_PADRAO_OBRA, ...etapasDraft])
                            ).map((et) => {
                              const ativa = etapasDraft.includes(et);
                              return (
                                <button
                                  key={et}
                                  type="button"
                                  onClick={() =>
                                    setEtapasDraft((prev) =>
                                      prev.includes(et)
                                        ? prev.filter((item) => item !== et)
                                        : [...prev, et]
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                                    ativa
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {et}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Adicionar etapa personalizada..."
                              value={etapaCustomDraft}
                              onChange={(e) => setEtapaCustomDraft(e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const limpa = etapaCustomDraft.trim();
                                if (!limpa) return;
                                if (!etapasDraft.includes(limpa)) {
                                  setEtapasDraft((prev) => [...prev, limpa]);
                                }
                                setEtapaCustomDraft('');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold"
                            >
                              + Add
                            </button>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setObraEditandoEtapas(null)}
                              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={salvandoEtapas}
                              onClick={() => void salvarEtapasObraExistente(o.nome)}
                              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black"
                            >
                              {salvandoEtapas ? 'Salvando...' : 'Salvar Etapas'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
