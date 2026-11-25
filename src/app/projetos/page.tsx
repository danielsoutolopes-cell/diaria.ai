'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  FolderLock,
  Upload,
  Download,
  Send,
  Trash2,
  Building2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { ProjetoPdfRecord } from '@/app/api/projetos/route';

const CATEGORIAS_PROJETO = [
  'Arquitetura',
  'Hidráulica',
  'Elétrica',
  'Gesso / Forro',
  'Estrutural',
  'Marcenaria / Layout',
  'Outros',
] as const;

const CATEGORIAS_DOCUMENTO = [
  'Relatório Diário de Obra (RDO)',
  'ART / RRT',
  'Autorização de Condomínio',
  'Contrato / Proposta',
  'Ata de Reunião',
  'Memorial Descritivo',
  'Outros Documentos',
] as const;

const SET_CATEGORIAS_DOCUMENTO = new Set<string>(CATEGORIAS_DOCUMENTO);

function formatarKB(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function CofreProjetosPage() {
  const [abaCofre, setAbaCofre] = useState<'PROJETOS' | 'DOCUMENTOS'>('PROJETOS');
  const [carregando, setCarregando] = useState(true);
  const [obras, setObras] = useState<string[]>([]);
  const [projetos, setProjetos] = useState<ProjetoPdfRecord[]>([]);
  const [filtroObra, setFiltroObra] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [destinoZap, setDestinoZap] = useState('');
  const [enviandoZapId, setEnviandoZapId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  // Formulário de Upload
  const [obraNome, setObraNome] = useState('');
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState<string>('Arquitetura');
  const [revisao, setRevisao] = useState('Rev. 01');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/projetos', { cache: 'no-store' });
      const data = (await res.json()) as {
        obras?: string[];
        projetos?: ProjetoPdfRecord[];
      };
      const listaObras = data.obras || [];
      setObras(listaObras);
      setProjetos(data.projetos || []);
      if (listaObras.length > 0) {
        setObraNome((prev) => prev || listaObras[0]);
      }
    } catch {
      setFeedback({ tipo: 'erro', texto: 'Falha ao carregar Cofre de Projetos.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const categoriasAtivas =
    abaCofre === 'DOCUMENTOS' ? CATEGORIAS_DOCUMENTO : CATEGORIAS_PROJETO;

  const projetosFiltrados = useMemo(() => {
    return projetos.filter((p) => {
      const ehDoc = SET_CATEGORIAS_DOCUMENTO.has(p.categoria);
      if (abaCofre === 'DOCUMENTOS' && !ehDoc) return false;
      if (abaCofre === 'PROJETOS' && ehDoc) return false;
      if (filtroObra && p.obraNome !== filtroObra) return false;
      if (filtroCategoria && p.categoria !== filtroCategoria) return false;
      return true;
    });
  }, [projetos, abaCofre, filtroObra, filtroCategoria]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo || !obraNome || !titulo.trim()) {
      setFeedback({
        tipo: 'erro',
        texto: 'Selecione a obra, informe o título e anexe a planta em PDF.',
      });
      return;
    }
    setEnviando(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      fd.append('obraNome', obraNome);
      fd.append('titulo', titulo.trim());
      fd.append('categoria', categoria);
      fd.append('revisao', revisao.trim() || 'Rev. 01');

      const res = await fetch('/api/projetos', { method: 'POST', body: fd });
      const data = (await res.json()) as {
        success?: boolean;
        projetos?: ProjetoPdfRecord[];
        error?: string;
      };
      if (!res.ok || !data.success) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Falha ao salvar planta PDF.',
        });
        return;
      }
      if (data.projetos) setProjetos(data.projetos);
      setTitulo('');
      setArquivo(null);
      setFeedback({
        tipo: 'sucesso',
        texto: 'Planta PDF compactada e guardada com segurança no Cofre!',
      });
    } catch {
      setFeedback({ tipo: 'erro', texto: 'Erro de conexão ao enviar PDF.' });
    } finally {
      setEnviando(false);
    }
  }

  async function handleEnviarZap(proj: ProjetoPdfRecord) {
    setEnviandoZapId(proj.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/projetos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enviar-whatsapp',
          id: proj.id,
          destino: destinoZap.trim(),
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        enviadoWhatsapp?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Erro ao enviar planta no WhatsApp.',
        });
        return;
      }
      if (!data.enviadoWhatsapp) {
        const linkDownload = `${window.location.origin}/api/projetos?download=${proj.id}`;
        const texto = `📐 *Projeto (${proj.categoria} • ${proj.revisao})*\n🏗️ Obra: ${proj.obraNome}\n📄 ${proj.titulo}\n🔗 Baixar PDF: ${linkDownload}`;
        window.open(
          `https://wa.me/?text=${encodeURIComponent(texto)}`,
          '_blank',
          'noopener,noreferrer'
        );
      }
      setFeedback({
        tipo: 'sucesso',
        texto: data.message || 'Planta enviada via WhatsApp!',
      });
    } catch {
      setFeedback({ tipo: 'erro', texto: 'Erro de conexão ao enviar no Zap.' });
    } finally {
      setEnviandoZapId(null);
    }
  }

  async function handleRemover(id: string) {
    try {
      const res = await fetch(`/api/projetos?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = (await res.json()) as {
        success?: boolean;
        projetos?: ProjetoPdfRecord[];
      };
      if (res.ok && data.projetos) setProjetos(data.projetos);
    } catch {
      // ignora
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950 flex items-center gap-2">
            <FolderLock className="w-6 h-6 text-indigo-600" />
            <span>Cofre de Projetos &amp; Documentos (PDF)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Armazenamento seguro de plantas e documentos da obra em PDF com
            ultracompactação automática (GZIP) e envio direto via WhatsApp.
          </p>
          <div className="inline-flex p-1 mt-3 rounded-2xl bg-slate-100 border border-slate-200 gap-1">
            <button
              type="button"
              onClick={() => {
                setAbaCofre('PROJETOS');
                setCategoria(CATEGORIAS_PROJETO[0]);
                setFiltroCategoria('');
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
                abaCofre === 'PROJETOS'
                  ? 'bg-white text-indigo-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Plantas &amp; Projetos
            </button>
            <button
              type="button"
              onClick={() => {
                setAbaCofre('DOCUMENTOS');
                setCategoria(CATEGORIAS_DOCUMENTO[0]);
                setFiltroCategoria('');
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
                abaCofre === 'DOCUMENTOS'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cofre de Documentos (RDO / Contratos / ART)
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 self-start"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`}
          />
          <span>Atualizar</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload de Planta PDF */}
        <form
          onSubmit={handleUpload}
          className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3.5 h-fit"
        >
          <h2 className="text-sm font-black text-slate-950 flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-600" />
            <span>Guardar Nova Planta (PDF)</span>
          </h2>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Obra *</label>
            <select
              value={obraNome}
              onChange={(e) => setObraNome(e.target.value)}
              className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
            >
              {obras.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              Título da Planta *
            </label>
            <input
              type="text"
              required
              placeholder="Ex.: Planta Baixa Demolição e Construção"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Disciplina
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
              >
                {categoriasAtivas.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Revisão
              </label>
              <input
                type="text"
                placeholder="Rev. 01"
                value={revisao}
                onChange={(e) => setRevisao(e.target.value)}
                className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
              />
            </div>
          </div>

          <label className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 cursor-pointer hover:bg-indigo-50">
            <FileText className="w-6 h-6 text-indigo-600" />
            <span className="text-xs font-bold text-indigo-900 text-center">
              {arquivo ? arquivo.name : 'Selecionar planta (.PDF)'}
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            />
          </label>

          <button
            type="submit"
            disabled={enviando}
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-sm disabled:opacity-50"
          >
            {enviando
              ? 'Compactando e salvando...'
              : 'Compactar e Guardar no Cofre'}
          </button>
        </form>

        {/* Lista de Plantas */}
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col sm:flex-row gap-2">
            <select
              value={filtroObra}
              onChange={(e) => setFiltroObra(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700"
            >
              <option value="">Todas as obras</option>
              {obras.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700"
            >
              <option value="">Todas as disciplinas</option>
              {categoriasAtivas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="WhatsApp p/ envio direto (opcional)"
              value={destinoZap}
              onChange={(e) => setDestinoZap(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
            />
          </div>

          {carregando ? (
            <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
              Carregando plantas...
            </div>
          ) : projetosFiltrados.length === 0 ? (
            <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-2">
              <FolderLock className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-800">
                Nenhuma planta PDF no Cofre ainda
              </p>
              <p className="text-xs text-slate-500">
                Envie o primeiro projeto em PDF ao lado para compactar e deixar
                pronto para envio no WhatsApp.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {projetosFiltrados.map((p) => {
                const economia =
                  p.tamanhoOriginalBytes > 0
                    ? Math.max(
                        0,
                        Math.round(
                          (1 -
                            p.tamanhoCompactadoBytes / p.tamanhoOriginalBytes) *
                            100
                        )
                      )
                    : 0;
                return (
                  <div
                    key={p.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {p.categoria}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {p.revisao}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums">
                          {formatarKB(p.tamanhoCompactadoBytes)}
                          {economia > 0 ? ` (−${economia}%)` : ''}
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-slate-950 truncate">
                        {p.titulo}
                      </h3>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{p.obraNome}</span>
                        <span>•</span>
                        <span className="font-mono">{p.arquivoNome}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`/api/projetos?download=${p.id}`}
                        className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </a>
                      <button
                        type="button"
                        disabled={enviandoZapId === p.id}
                        onClick={() => void handleEnviarZap(p)}
                        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {enviandoZapId === p.id ? '...' : 'Zap'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemover(p.id)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Remover projeto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
