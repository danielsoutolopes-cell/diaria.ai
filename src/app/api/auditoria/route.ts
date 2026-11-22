import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { normalizarNomeObraCanonica } from '@/lib/normalizarObra';
import {
  formatarDataHoraCorteBR,
  resolverDataHoraCorteValidacao,
} from '@/lib/formatarDataCorte';
import { gerarChaveIdempotenciaVale } from '@/lib/valeIdempotencia';
import {
  executarAuditoriaInterna,
  type FuncionarioAuditoriaInput,
  type LancamentoAuditoriaInput,
  type LoteAuditoriaInput,
  type TipoAcaoCorretiva,
} from '@/services/auditoriaEngine';

export const dynamic = 'force-dynamic';

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
  mensagem_original: string | null;
  status: string;
  remetente_nome?: string | null;
  created_at?: string | null;
  obras_config: ObraRel | ObraRel[] | null;
}

interface ItemCorrecaoLote {
  tipoAcao: 'NORMALIZAR_NOME' | 'PREENCHER_IDEMPOTENCIA';
  lancamentoId: string;
  novoNome?: string;
}

interface AuditoriaPostBody {
  action?: 'aplicar-correcao' | 'aplicar-lote-seguro' | 'analisar-ia';
  periodo?: string;
  tipoAcao?: TipoAcaoCorretiva;
  lancamentoId?: string;
  novoNome?: string;
  novoValor?: number;
  motivo?: string;
  executadoPor?: string;
  itensLote?: ItemCorrecaoLote[];
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

async function carregarSnapshotAuditoria(tenantId: string, periodo: string) {
  const dataInicio = calcularDataInicioPeriodo(periodo);

  // 1. Lançamentos isolados por tenant_id (incluindo colunas de rastreabilidade & idempotência)
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

  // 2. Funcionários, Obras ativas e Parâmetros de Corte — todos isolados por tenant_id
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

  // 3. Lotes do WhatsApp (ponto_lote) isolados por tenant_id
  let loteQuery = supabaseAdmin
    .from('ponto_lote')
    .select(`
      id,
      data_referencia,
      mensagem_original,
      status,
      remetente_nome,
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
      mensagemOriginal: l.mensagem_original || '',
      status: l.status,
      remetenteNome: l.remetente_nome || null,
      createdAt: l.created_at || null,
      obraNome: normalizarNomeObraCanonica(obraRel.nome, obraRel.tipo_obra),
    };
  });

  return executarAuditoriaInterna({
    lancamentos,
    funcionarios,
    lotes,
    obrasAtivasIds,
    dataCorteFormatada,
  });
}

async function preencherIdempotenciaVale(
  tenantId: string,
  lancamentoId: string,
  agoraIso: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error: errFetch } = await supabaseAdmin
    .from('lancamentos_financeiros')
    .select('id, nome_trabalhador, data_referencia, horario_origem, data_hora_solicitacao, valor_monetario')
    .eq('tenant_id', tenantId)
    .eq('id', lancamentoId)
    .maybeSingle();

  if (errFetch || !row) {
    return { ok: false, error: errFetch?.message || 'Lançamento não encontrado.' };
  }

  const typed = row as {
    id: string;
    nome_trabalhador: string;
    data_referencia: string;
    horario_origem?: string | null;
    data_hora_solicitacao?: string | null;
    valor_monetario: number | string;
  };

  const chave = gerarChaveIdempotenciaVale({
    tenantId,
    trabalhador: typed.nome_trabalhador,
    dataReferencia: typed.data_referencia,
    janelaSolicitacao: typed.horario_origem || typed.data_hora_solicitacao,
    valor: Number(typed.valor_monetario || 100),
  });

  const { error: errUpd } = await supabaseAdmin
    .from('lancamentos_financeiros')
    .update({
      chave_idempotencia: chave,
      updated_at: agoraIso,
    })
    .eq('tenant_id', tenantId)
    .eq('id', lancamentoId);

  if (errUpd) return { ok: false, error: errUpd.message };
  return { ok: true };
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const periodo = searchParams.get('periodo') || 'quinzenal';

    const relatorio = await carregarSnapshotAuditoria(activeTenant.id, periodo);

    return NextResponse.json({
      success: true,
      tenant: {
        id: activeTenant.id,
        slug: activeTenant.slug,
        nome: activeTenant.nome,
      },
      periodo,
      ...relatorio,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro ao executar auditoria interna.';
    console.error('[AUDITORIA][GET] Erro:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as AuditoriaPostBody;
    const action = body.action || 'aplicar-correcao';

    // 1. Diagnóstico Executivo de Saúde do Sistema Assistido por IA (Gemini 2.5 Flash)
    if (action === 'analisar-ia') {
      const periodo = body.periodo || 'quinzenal';
      const snapshot = await carregarSnapshotAuditoria(activeTenant.id, periodo);
      const saude = snapshot.saudeSistema;

      const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^"|"$/g, '');
      if (!apiKey) {
        const resumoFallback =
          snapshot.anomalias.length === 0
            ? `Saúde do Sistema ${saude.scoreGeral}/100 (${saude.nivel}) para ${activeTenant.nome}: zero duplicados, zero fantasmas e ${snapshot.totalLancamentosAnalisados} lançamentos íntegros. Folha liberada para fechamento PIX.`
            : `Saúde do Sistema ${saude.scoreGeral}/100 (${saude.nivel}): ${saude.duplicadosDetectados} duplicado(s), ${saude.fantasmasDetectados} registro(s) fantasma(s) e ${snapshot.anomalias.length} alerta(s) no total. Impacto financeiro estimado das correções: R$ ${snapshot.simulacao.impactoCorrecoesDelta.toFixed(2)}.`;

        return NextResponse.json({
          success: true,
          motor: 'HEURISTICO',
          parecerIa: resumoFallback,
        });
      }

      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `
Você é o Auditor Principal e Engenheiro de Confiabilidade do sistema diaria.ai.
Analise o Relatório de Saúde do Sistema da empresa ${activeTenant.nome} (período: ${periodo}) e escreva um diagnóstico executivo claro em português (máximo 6 tópicos objetivos, sem tabelas markdown complexas) priorizando o que Patrícia/Daniel precisam resolver antes do pagamento PIX:
- Score de Saúde Geral: ${saude.scoreGeral}/100 (${saude.nivel})
- Ponto de corte ativo: ${saude.dataCorteFormatada || 'Sem corte configurado'}
- Lançamentos analisados: ${snapshot.totalLancamentosAnalisados} | Lotes WhatsApp: ${snapshot.totalLotesAnalisados}
- Duplicados detectados (diárias + vales): ${saude.duplicadosDetectados} | Cadastros duplicados: ${saude.cadastrosDuplicadosDetectados}
- Registros Fantasmas (datas anômalas, valor zerado, obras órfãs, lotes vazios): ${saude.fantasmasDetectados}
- Cobertura de Idempotência de Vales: ${saude.coberturaIdempotenciaPct}% | Cobertura PIX Equipe: ${saude.coberturaPixEquipePct}%
- Saldo aberto atual: R$ ${snapshot.simulacao.saldoAbertoAtual.toFixed(2)} | Impacto das correções: R$ ${snapshot.simulacao.impactoCorrecoesDelta.toFixed(2)} | Projetado: R$ ${snapshot.simulacao.saldoProjetadoPosCorrecoes.toFixed(2)}
- Pilares:
${saude.pilares.map((p) => `  * ${p.titulo}: ${p.nota}/100 [${p.status}] — ${p.resumo}`).join('\n')}
- Principais Anomalias (${snapshot.anomalias.length}):
${snapshot.anomalias
  .slice(0, 15)
  .map(
    (a) =>
      `  * [${a.severidade}][${a.tipo}] ${a.titulo} | ${a.trabalhadorCanonico} (${a.obraNome} ${a.dataReferencia}) | Antes: ${a.antes.valor} -> Depois: ${a.depoisSugerido.valor}`
  )
  .join('\n')}
`;
        const result = await model.generateContent(prompt);
        return NextResponse.json({
          success: true,
          motor: 'GEMINI',
          parecerIa: result.response.text().trim(),
        });
      } catch (err) {
        console.warn('[AUDITORIA][IA] Fallback:', err);
        return NextResponse.json({
          success: true,
          motor: 'HEURISTICO',
          parecerIa: `Saúde ${saude.scoreGeral}/100 (${saude.nivel}): ${saude.duplicadosDetectados} duplicado(s) e ${saude.fantasmasDetectados} fantasma(s) em ${snapshot.totalLancamentosAnalisados} lançamentos. Impacto líquido estimado: R$ ${snapshot.simulacao.impactoCorrecoesDelta.toFixed(2)}.`,
        });
      }
    }

    // 2. Aplicar Lote Seguro (somente normalização de nomes e backfill de idempotência — nunca descarta sem clique individual)
    if (action === 'aplicar-lote-seguro') {
      const itens = Array.isArray(body.itensLote) ? body.itensLote : [];
      if (itens.length === 0) {
        return NextResponse.json(
          { error: 'Nenhum ajuste seguro informado.' },
          { status: 400 }
        );
      }

      const agoraIso = new Date().toISOString();
      let aplicados = 0;

      for (const item of itens) {
        if (item.tipoAcao === 'NORMALIZAR_NOME' && item.novoNome) {
          const { error } = await supabaseAdmin
            .from('lancamentos_financeiros')
            .update({
              nome_trabalhador: item.novoNome,
              updated_at: agoraIso,
            })
            .eq('tenant_id', activeTenant.id)
            .eq('id', item.lancamentoId);
          if (!error) aplicados++;
        } else if (item.tipoAcao === 'PREENCHER_IDEMPOTENCIA') {
          const resIdemp = await preencherIdempotenciaVale(
            activeTenant.id,
            item.lancamentoId,
            agoraIso
          );
          if (resIdemp.ok) aplicados++;
        }
      }

      return NextResponse.json({
        success: true,
        aplicados,
        message: `${aplicados} ajuste(s) seguro(s) aplicado(s) com sucesso.`,
      });
    }

    // 3. Aplicar Correção Individual em 1 Clique (Human-in-the-Loop estrito, isolado por tenant_id)
    if (!body.lancamentoId || !body.tipoAcao) {
      return NextResponse.json(
        { error: 'lancamentoId e tipoAcao são obrigatórios.' },
        { status: 400 }
      );
    }

    const agoraIso = new Date().toISOString();
    const autor = body.executadoPor || 'Patrícia Grubel';

    if (body.tipoAcao === 'NORMALIZAR_NOME') {
      if (!body.novoNome) {
        return NextResponse.json(
          { error: 'novoNome obrigatório para NORMALIZAR_NOME.' },
          { status: 400 }
        );
      }
      const { error } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({
          nome_trabalhador: body.novoNome,
          updated_at: agoraIso,
        })
        .eq('tenant_id', activeTenant.id)
        .eq('id', body.lancamentoId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (body.tipoAcao === 'CORRIGIR_VALOR') {
      if (typeof body.novoValor !== 'number' || Number.isNaN(body.novoValor)) {
        return NextResponse.json(
          { error: 'novoValor numérico obrigatório para CORRIGIR_VALOR.' },
          { status: 400 }
        );
      }
      const { error } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({
          valor_monetario: Number(body.novoValor.toFixed(2)),
          observacao:
            body.motivo || `Valor corrigido via Auditoria Interna (${autor})`,
          updated_at: agoraIso,
        })
        .eq('tenant_id', activeTenant.id)
        .eq('id', body.lancamentoId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (body.tipoAcao === 'DESCARTAR_DUPLICIDADE') {
      // Soft Delete auditado (nunca DELETE destrutivo)
      const { error } = await supabaseAdmin
        .from('lancamentos_financeiros')
        .update({
          status: 'DESCARTADO',
          observacao:
            body.motivo ||
            `Registro duplicado/fantasma descartado via Saúde do Sistema (${autor})`,
          updated_at: agoraIso,
        })
        .eq('tenant_id', activeTenant.id)
        .eq('id', body.lancamentoId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (body.tipoAcao === 'PREENCHER_IDEMPOTENCIA') {
      const resIdemp = await preencherIdempotenciaVale(
        activeTenant.id,
        body.lancamentoId,
        agoraIso
      );
      if (!resIdemp.ok) {
        return NextResponse.json(
          { error: resIdemp.error || 'Falha ao gravar chave de idempotência.' },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Esta anomalia requer revisão manual em Borderô/Validação.' },
        { status: 400 }
      );
    }

    // Registra trilha de auditoria em parametros_sistema do tenant
    try {
      const { data: paramData } = await supabaseAdmin
        .from('parametros_sistema')
        .select('id, configuracoes')
        .eq('tenant_id', activeTenant.id)
        .maybeSingle();

      const configs =
        (paramData?.configuracoes as Record<string, unknown> | null) || {};
      const historico = Array.isArray(configs.auditoria_correcoes_log)
        ? (configs.auditoria_correcoes_log as Array<Record<string, unknown>>)
        : [];

      const novoLog = {
        dataHora: agoraIso,
        executadoPor: autor,
        tipoAcao: body.tipoAcao,
        lancamentoId: body.lancamentoId,
        novoNome: body.novoNome || null,
        novoValor: body.novoValor ?? null,
        motivo: body.motivo || null,
      };

      const novasConfigs = {
        ...configs,
        auditoria_correcoes_log: [novoLog, ...historico].slice(0, 200),
      };

      if (paramData?.id) {
        await supabaseAdmin
          .from('parametros_sistema')
          .update({ configuracoes: novasConfigs })
          .eq('id', paramData.id)
          .eq('tenant_id', activeTenant.id);
      } else {
        await supabaseAdmin.from('parametros_sistema').insert({
          tenant_id: activeTenant.id,
          configuracoes: novasConfigs,
        });
      }
    } catch {
      // Log de auditoria best-effort
    }

    return NextResponse.json({
      success: true,
      message: 'Correção aplicada com sucesso e registrada na trilha de auditoria.',
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro ao aplicar correção de auditoria.';
    console.error('[AUDITORIA][POST] Erro:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
