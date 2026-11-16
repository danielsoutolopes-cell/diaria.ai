'use client';

import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  User,
  AlertCircle,
  ExternalLink,
  Plus,
  RefreshCw,
  Clock,
  Shield,
  Layers,
} from 'lucide-react';
import { PedidoReembolso, PagamentoReembolso } from '@/types/database';

export default function ReembolsosPage() {
  const [reembolsos, setReembolsos] = useState<PedidoReembolso[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [termoBusca, setTermoBusca] = useState('');

  // Modais de Operação
  const [modalAprovacao, setModalAprovacao] = useState<{ aberto: boolean; item: PedidoReembolso | null; valor: string }>({
    aberto: false,
    item: null,
    valor: '',
  });

  const [modalPagamento, setModalPagamento] = useState<{
    aberto: boolean;
    item: PedidoReembolso | null;
    valorPago: string;
    forma: string;
    obs: string;
  }>({
    aberto: false,
    item: null,
    valorPago: '',
    forma: 'PIX',
    obs: '',
  });

  const [modalComprovante, setModalComprovante] = useState<string | null>(null);

  async function carregarReembolsos() {
    setLoading(true);
    try {
      const res = await fetch('/api/reembolsos');
      const data = await res.json();
      if (data.reembolsos) {
        setReembolsos(data.reembolsos);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarReembolsos();
  }, []);

  async function handleAprovar() {
    if (!modalAprovacao.item) return;
    try {
      const res = await fetch('/api/reembolsos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'aprovar',
          reembolsoId: modalAprovacao.item.id,
          valorAprovado: parseFloat(modalAprovacao.valor.replace(',', '.')),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setModalAprovacao({ aberto: false, item: null, valor: '' });
        carregarReembolsos();
      } else {
        alert(data.error || 'Erro ao aprovar.');
      }
    } catch (e) {
      alert('Falha na requisição.');
    }
  }

  async function handleRecusar(id: string) {
    const motivo = prompt('Motivo da recusa da despesa:');
    if (!motivo) return;

    try {
      const res = await fetch('/api/reembolsos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recusar',
          reembolsoId: id,
          motivoRecusa: motivo,
        }),
      });
      const data = await res.json();
      if (data.success) {
        carregarReembolsos();
      }
    } catch (e) {
      alert('Erro ao recusar.');
    }
  }

  async function handleRegistrarPagamento() {
    if (!modalPagamento.item) return;
    try {
      const res = await fetch('/api/reembolsos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pagar',
          reembolsoId: modalPagamento.item.id,
          valorPago: parseFloat(modalPagamento.valorPago.replace(',', '.')),
          formaPagamento: modalPagamento.forma,
          observacao: modalPagamento.obs,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setModalPagamento({ aberto: false, item: null, valorPago: '', forma: 'PIX', obs: '' });
        carregarReembolsos();
      } else {
        alert(data.error || 'Erro ao registrar pagamento.');
      }
    } catch (e) {
      alert('Falha na requisição.');
    }
  }

  // Filtragem
  const filtrados = reembolsos.filter((r) => {
    const matchStatus = filtroStatus === 'TODOS' || r.status === filtroStatus;
    const matchBusca =
      (r.solicitante_nome || '').toLowerCase().includes(termoBusca.toLowerCase()) ||
      (r.descricao || '').toLowerCase().includes(termoBusca.toLowerCase()) ||
      (r.categoria || '').toLowerCase().includes(termoBusca.toLowerCase());
    return matchStatus && matchBusca;
  });

  // Indicadores
  const totalPendente = reembolsos
    .filter((r) => r.status === 'APROVADO' || r.status === 'PAGO_PARCIAL')
    .reduce((acc, r) => acc + (Number(r.valor_aprovado) - Number(r.valor_pago)), 0);

  const totalAguardandoAnalise = reembolsos
    .filter((r) => r.status === 'PENDENTE_ANALISE')
    .reduce((acc, r) => acc + Number(r.valor_solicitado), 0);

  const totalLiquidado = reembolsos
    .filter((r) => r.status === 'LIQUIDADO')
    .reduce((acc, r) => acc + Number(r.valor_pago), 0);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Receipt className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
              Gestão de Despesas & Caixa de Campo
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              Alinhamento Patrícia x Joabson
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-950">Reembolsos & Adiantamentos</h1>
          <p className="text-xs text-slate-500">
            Aprovação e liquidação flexível (parcial ou total) de combustível, pedágio e materiais sem emissão de tickets no WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={carregarReembolsos}
            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all"
            title="Atualizar lista"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-amber-50/70 border border-amber-200/80 p-5 rounded-3xl space-y-1">
          <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-600" />
            Aguardando Alinhamento
          </span>
          <div className="text-2xl font-black text-amber-950">
            R$ {totalAguardandoAnalise.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-amber-700">
            {reembolsos.filter((r) => r.status === 'PENDENTE_ANALISE').length} pedido(s) para Patrícia conversar com Joabson
          </p>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200/80 p-5 rounded-3xl space-y-1">
          <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Saldo a Reembolsar (Aberto)
          </span>
          <div className="text-2xl font-black text-emerald-950">
            R$ {totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-emerald-700">
            Aprovados prontos para baixa parcial ou total via Pix
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl space-y-1">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-slate-500" />
            Total Quitado
          </span>
          <div className="text-2xl font-black text-slate-900">
            R$ {totalLiquidado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500">
            {reembolsos.filter((r) => r.status === 'LIQUIDADO').length} despesa(s) 100% liquidadas
          </p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200/90 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            placeholder="Buscar por solicitante, descrição..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['TODOS', 'PENDENTE_ANALISE', 'APROVADO', 'PAGO_PARCIAL', 'LIQUIDADO', 'RECUSADO'].map((st) => (
            <button
              key={st}
              onClick={() => setFiltroStatus(st)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                filtroStatus === st
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'TODOS'
                ? 'Todos'
                : st === 'PENDENTE_ANALISE'
                ? 'Aguardando'
                : st === 'APROVADO'
                ? 'Aprovado'
                : st === 'PAGO_PARCIAL'
                ? 'Parcial'
                : st === 'LIQUIDADO'
                ? 'Liquidado'
                : 'Recusado'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Pedidos */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs">Carregando despesas de campo...</div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-slate-200 text-slate-500 space-y-2">
          <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">Nenhum reembolso encontrado</h3>
          <p className="text-xs text-slate-400">
            Assim que fotos de notas ou mensagens de despesas chegarem nos grupos de obra, elas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtrados.map((item) => {
            const saldoAberto = Math.max(0, Number(item.valor_aprovado) - Number(item.valor_pago));

            return (
              <div
                key={item.id}
                className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Linha Superior: Status e Categoria */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full tracking-wider ${
                        item.status === 'PENDENTE_ANALISE'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300/60'
                          : item.status === 'APROVADO'
                          ? 'bg-blue-100 text-blue-900 border border-blue-300/60'
                          : item.status === 'PAGO_PARCIAL'
                          ? 'bg-purple-100 text-purple-900 border border-purple-300/60'
                          : item.status === 'LIQUIDADO'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300/60'
                          : 'bg-rose-100 text-rose-900 border border-rose-300/60'
                      }`}
                    >
                      {item.status === 'PENDENTE_ANALISE'
                        ? 'Aguardando Patrícia'
                        : item.status === 'APROVADO'
                        ? 'Aprovado (Aberto)'
                        : item.status === 'PAGO_PARCIAL'
                        ? 'Pago Parcial'
                        : item.status === 'LIQUIDADO'
                        ? 'Liquidado'
                        : 'Recusado'}
                    </span>

                    <span className="text-[11px] font-bold text-slate-400 font-mono">
                      {new Date(item.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  {/* Solicitante e Descrição */}
                  <div>
                    <h3 className="font-extrabold text-slate-950 text-sm flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      {item.solicitante_nome}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">{item.descricao || 'Sem descrição textual.'}</p>
                  </div>

                  {/* Resumo Financeiro */}
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Valor Solicitado:</span>
                      <strong className="text-slate-800">
                        R$ {Number(item.valor_solicitado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>

                    {item.status !== 'PENDENTE_ANALISE' && item.status !== 'RECUSADO' && (
                      <>
                        <div className="flex justify-between text-slate-500">
                          <span>Valor Aprovado Patrícia:</span>
                          <strong className="text-emerald-700">
                            R$ {Number(item.valor_aprovado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>

                        <div className="flex justify-between text-slate-500">
                          <span>Total Já Pago:</span>
                          <strong className="text-slate-900">
                            R$ {Number(item.valor_pago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>

                        <div className="flex justify-between border-t border-slate-200 pt-1 text-slate-900 font-bold">
                          <span>Saldo Restante a Pagar:</span>
                          <span className={saldoAberto > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                            R$ {saldoAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Comprovante em Anexo */}
                  {item.comprovante_url && (
                    <button
                      onClick={() => setModalComprovante(item.comprovante_url!)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1.5 underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Visualizar Cupom / Nota Fiscal
                    </button>
                  )}
                </div>

                {/* Botões de Ação para a Patrícia */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  {item.status === 'PENDENTE_ANALISE' && (
                    <>
                      <button
                        onClick={() =>
                          setModalAprovacao({
                            aberto: true,
                            item,
                            valor: String(item.valor_solicitado || ''),
                          })
                        }
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all text-center"
                      >
                        Aprovar Despesa
                      </button>
                      <button
                        onClick={() => handleRecusar(item.id)}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all"
                      >
                        Recusar
                      </button>
                    </>
                  )}

                  {(item.status === 'APROVADO' || item.status === 'PAGO_PARCIAL') && (
                    <button
                      onClick={() =>
                        setModalPagamento({
                          aberto: true,
                          item,
                          valorPago: String(saldoAberto),
                          forma: 'PIX',
                          obs: '',
                        })
                      }
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5"
                    >
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      Dar Baixa / Registrar Pagamento Pix
                    </button>
                  )}

                  {item.status === 'LIQUIDADO' && (
                    <div className="w-full text-center text-[11px] font-bold text-emerald-700 py-1 bg-emerald-50 rounded-xl">
                      ✓ Despesa Totalmente Liquidada
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Aprovação */}
      {modalAprovacao.aberto && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <h3 className="text-base font-black text-slate-950">Aprovar Reembolso</h3>
            <p className="text-xs text-slate-500">
              Confirme com o Joabson o valor acordado para esta despesa:
            </p>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700">Valor Aprovado (R$):</label>
              <input
                type="text"
                value={modalAprovacao.valor}
                onChange={(e) => setModalAprovacao({ ...modalAprovacao, valor: e.target.value })}
                placeholder="Ex: 150.00"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setModalAprovacao({ aberto: false, item: null, valor: '' })}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleAprovar}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Pagamento / Baixa Parcial */}
      {modalPagamento.aberto && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <h3 className="text-base font-black text-slate-950">Registrar Pagamento de Reembolso</h3>
            <p className="text-xs text-slate-500">
              Digite o valor transferido via Pix (pode ser parcial ou o saldo total):
            </p>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">Valor Pago Agora (R$):</label>
                <input
                  type="text"
                  value={modalPagamento.valorPago}
                  onChange={(e) => setModalPagamento({ ...modalPagamento, valorPago: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">Observação / Comprovante:</label>
                <input
                  type="text"
                  value={modalPagamento.obs}
                  onChange={(e) => setModalPagamento({ ...modalPagamento, obs: e.target.value })}
                  placeholder="Ex: Pix efetuado pelo Nubank"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setModalPagamento({ aberto: false, item: null, valorPago: '', forma: 'PIX', obs: '' })}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                Voltar
              </button>
              <button
                onClick={handleRegistrarPagamento}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                Efetivar Baixa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualização de Cupom */}
      {modalComprovante && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-4 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-800">Cupom / Nota Fiscal Anexa</span>
              <button
                onClick={() => setModalComprovante(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-2xl border border-slate-100">
              <img src={modalComprovante} alt="Comprovante" className="w-full h-auto object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
