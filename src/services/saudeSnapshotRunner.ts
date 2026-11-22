import { supabaseAdmin } from '@/lib/supabase';
import { normalizarNomeObraCanonica } from '@/lib/normalizarObra';
import {
  formatarDataHoraCorteBR,
  resolverDataHoraCorteValidacao,
} from '@/lib/formatarDataCorte';
import {
  executarAuditoriaInterna,
  type FuncionarioAuditoriaInput,
  type LancamentoAuditoriaInput,
  type LoteAuditoriaInput,
  type RelatorioAuditoriaInterna,
} from '@/services/auditoriaEngine';

interface ObraRel {
  nome: string | null;
  tipo_obra: string | null;
}

interface LancamentoDbRow {
  id: string;
  nome_trabalhador: string;
  obra_id: string | null;
  tipo_lancamento: string;
  fracao_dia: number | string | null;
  valor_monetario: number | string | null;
  status: string;
  data_referencia: string;
  observacao: string | null;
  comprovante_url?: string | null;
  comprovante_pix_url?: string | null;
  vale_etapa?: string | null;
  lote_id?: string | null;
  created_at?: string | null;
  chave_idempotencia?: string | null;
  horario_origem?: string | null;
  solicitado_por?: string | null;
  data_hora_solicitacao?: string | null;
  aprovado_por?: string | null;
  data_hora_envio_efetivo?: string | null;
  obras_config: ObraRel | ObraRel[] | null;
}

interface FuncionarioDbRow {
  id: string;
  nome_trabalhador: string;
  chave_pix: string | null;
  valor_diaria: number | string | null;
  valor_diaria_obra?: number | string | null;
  valor_diaria_piscina?: number | string | null;
  regime_remuneracao?: string | null;
  ativo?: boolean | null;
}

interface LoteDbRow {
  id: string;
  data_referencia: string;
  mensagem_original?: string | null;
  texto_original?: string | null;
  status?: string | null;
  status_validacao?: string | null;
  remetente_nome?: string | null;
  created_at?: string | null;
  obras_config: ObraRel | ObraRel[] | null;
}

function extrairObra(rel: ObraRel | ObraRel[] | null | undefined): ObraRel {
  if (!rel) return { nome: null, tipo_obra: null };
  return Array.isArray(rel) ? rel[0] || { nome: null, tipo_obra: null } : rel;
}

function calcularDataInicioPeriodo(periodo: string): string | null {
  if (periodo === 'todos') return null;
  let dias = 15;
  if (periodo === 'semanal' || periodo === '7d') dias = 7;
  else if (periodo === 'mensal' || periodo === '30d') dias = 30;
  else if (periodo === 'trimestral' || periodo === '90d') dias = 90;

  const dt = new Date();
  dt.setDate(dt.getDate() - dias);
  return dt.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Executa a varredura estrutural completa de Saúde do Sistema & Caça-Fantasmas
 * com isolamento estrito por tenant_id (Jhoston e Intermack).
 */
export async function executarVarreduraSaudeTenant(
  tenantId: string,
  periodo: string
): Promise<{
  relatorio: RelatorioAuditoriaInterna;
  totalValesAuditados: number;
}> {
  const dataInicio = calcularDataInicioPeriodo(periodo);

  // 1. Lançamentos isolados por tenant_id
  let lancQuery = supabaseAdmin
    .from('lancamentos_financeiros')
    .select(`
      id,
      nome_trabalhador,
      obra_id,
      tipo_lancamento,
      fracao_dia,
      valor_monetario,
      status,
      data_referencia,
      observacao,
      comprovante_url,
      comprovante_pix_url,
      vale_etapa,
      lote_id,
      created_at,
      chave_idempotencia,
      horario_origem,
      solicitado_por,
      data_hora_solicitacao,
      aprovado_por,
      data_hora_envio_efetivo,
      obras_config (
        nome,
        tipo_obra
      )
    `)
    .eq('tenant_id', tenantId)
    .order('data_referencia', { ascending: false });

  if (dataInicio) {
    lancQuery = lancQuery.gte('data_referencia', dataInicio);
  }

  let lancRows: LancamentoDbRow[] = [];
  const resLanc = await lancQuery;
  if (resLanc.error) {
    let fallbackQuery = supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        nome_trabalhador,
        obra_id,
        tipo_lancamento,
        fracao_dia,
        valor_monetario,
        status,
        data_referencia,
        observacao,
        lote_id,
        created_at,
        obras_config (
          nome,
          tipo_obra
        )
      `)
      .eq('tenant_id', tenantId)
      .order('data_referencia', { ascending: false });
    if (dataInicio) {
      fallbackQuery = fallbackQuery.gte('data_referencia', dataInicio);
    }
    const resFallback = await fallbackQuery;
    lancRows = (resFallback.data as unknown as LancamentoDbRow[] | null) || [];
  } else {
    lancRows = (resLanc.data as unknown as LancamentoDbRow[] | null) || [];
  }

  // 2. Funcionários, Obras ativas e Parâmetros de Corte — isolados por tenant_id
  const [resFuncs, resObras, resParams] = await Promise.all([
    supabaseAdmin
      .from('funcionarios_obra')
      .select(
        'id, nome_trabalhador, chave_pix, valor_diaria, valor_diaria_obra, valor_diaria_piscina, regime_remuneracao, ativo'
      )
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('obras_config')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('ativo', true),
    supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);

  let funcRows: FuncionarioDbRow[] = [];
  if (resFuncs.error) {
    const resFuncsFb = await supabaseAdmin
      .from('funcionarios_obra')
      .select('id, nome_trabalhador, chave_pix, valor_diaria, ativo')
      .eq('tenant_id', tenantId);
    funcRows = (resFuncsFb.data as unknown as FuncionarioDbRow[] | null) || [];
  } else {
    funcRows = (resFuncs.data as unknown as FuncionarioDbRow[] | null) || [];
  }

  const obrasAtivasIds = (
    (resObras.data as Array<{ id: string }> | null) || []
  ).map((o) => o.id);

  const configsParam =
    (resParams.data?.configuracoes as Record<string, unknown> | null) || {};
  const dataCorteFormatada = formatarDataHoraCorteBR(
    resolverDataHoraCorteValidacao(configsParam)
  );

  // 3. Lotes do WhatsApp (ponto_lote) isolados por tenant_id (com fallback de coluna texto_original)
  let loteQuery = supabaseAdmin
    .from('ponto_lote')
    .select(`
      id,
      data_referencia,
      texto_original,
      status_validacao,
      created_at,
      obras_config (
        nome,
        tipo_obra
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (dataInicio) {
    loteQuery = loteQuery.gte('data_referencia', dataInicio);
  }

  const resLotes = await loteQuery;
  const loteRows = (resLotes.data as unknown as LoteDbRow[] | null) || [];

  const lancamentos: LancamentoAuditoriaInput[] = lancRows.map((r) => {
    const obraRel = extrairObra(r.obras_config);
    return {
      id: r.id,
      nomeTrabalhador: r.nome_trabalhador,
      obraId: r.obra_id,
      obraNome: obraRel.nome || 'Obra Geral',
      obraTipo: obraRel.tipo_obra,
      tipoLancamento: r.tipo_lancamento === 'VALE' ? 'VALE' : 'PONTO',
      fracaoDia: Number(r.fracao_dia ?? 1),
      valorMonetario: Number(r.valor_monetario ?? 0),
      status: r.status,
      dataReferencia: r.data_referencia,
      observacao: r.observacao,
      comprovanteUrl: r.comprovante_pix_url || r.comprovante_url || null,
      valeEtapa: r.vale_etapa || null,
      loteId: r.lote_id || null,
      createdAt: r.created_at || null,
      chaveIdempotencia: r.chave_idempotencia ?? null,
      horarioOrigem: r.horario_origem ?? null,
      solicitadoPor: r.solicitado_por ?? null,
      dataHoraSolicitacao: r.data_hora_solicitacao ?? null,
      aprovadoPor: r.aprovado_por ?? null,
      dataHoraEnvioEfetivo: r.data_hora_envio_efetivo ?? null,
    };
  });

  const totalValesAuditados = lancamentos.filter(
    (l) => l.tipoLancamento === 'VALE' && l.status !== 'DESCARTADO'
  ).length;

  const funcionarios: FuncionarioAuditoriaInput[] = funcRows.map((f) => ({
    id: f.id,
    nomeTrabalhador: f.nome_trabalhador,
    chavePix: f.chave_pix,
    valorDiaria: f.valor_diaria !== null ? Number(f.valor_diaria) : null,
    valorDiariaObra:
      f.valor_diaria_obra !== undefined && f.valor_diaria_obra !== null
        ? Number(f.valor_diaria_obra)
        : null,
    valorDiariaPiscina:
      f.valor_diaria_piscina !== undefined && f.valor_diaria_piscina !== null
        ? Number(f.valor_diaria_piscina)
        : null,
    regimeRemuneracao: f.regime_remuneracao || null,
    ativo: f.ativo !== false,
  }));

  const lotes: LoteAuditoriaInput[] = loteRows.map((l) => {
    const obraRel = extrairObra(l.obras_config);
    return {
      id: l.id,
      dataReferencia: l.data_referencia,
      mensagemOriginal: l.texto_original || l.mensagem_original || '',
      status: l.status_validacao || l.status || 'PENDENTE',
      remetenteNome: l.remetente_nome || null,
      createdAt: l.created_at || null,
      obraNome: normalizarNomeObraCanonica(obraRel.nome, obraRel.tipo_obra),
    };
  });

  const relatorio = executarAuditoriaInterna({
    lancamentos,
    funcionarios,
    lotes,
    obrasAtivasIds,
    dataCorteFormatada,
  });

  return { relatorio, totalValesAuditados };
}
