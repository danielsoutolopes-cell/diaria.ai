import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { gerarChaveIdempotenciaVale } from '@/lib/valeIdempotencia';
import type { TipoAcaoCorretiva } from '@/services/auditoriaEngine';
import { executarVarreduraSaudeTenant } from '@/services/saudeSnapshotRunner';
import {
  obterEstadoSaudeSistema,
  OPCOES_CADENCIA_SAUDE,
  salvarConfiguracaoCadenciaSaude,
  salvarExecucaoLaudoSaude,
  validarCadenciaSaude,
  type CadenciaSaudeSistema,
} from '@/services/saudeCadenciaService';

export const dynamic = 'force-dynamic';

interface ItemCorrecaoLote {
  tipoAcao: 'NORMALIZAR_NOME' | 'PREENCHER_IDEMPOTENCIA';
  lancamentoId: string;
  novoNome?: string;
}

interface AuditoriaPostBody {
  action?:
    | 'aplicar-correcao'
    | 'aplicar-lote-seguro'
    | 'analisar-ia'
    | 'executar-varredura'
    | 'configurar-cadencia';
  periodo?: string;
  cadencia?: CadenciaSaudeSistema;
  tipoAcao?: TipoAcaoCorretiva;
  lancamentoId?: string;
  novoNome?: string;
  novoValor?: number;
  motivo?: string;
  executadoPor?: string;
  itensLote?: ItemCorrecaoLote[];
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
    const periodo = searchParams.get('periodo') || '15d';
    const forcar = searchParams.get('forcar') === '1';
    const executadoPor = searchParams.get('executadoPor') || 'Consulta Inicial';

    const estadoSalvo = await obterEstadoSaudeSistema(activeTenant.id);

    // Se já existe um último laudo salvo para este período e não foi solicitada nova varredura,
    // retorna imediatamente o laudo estável + histórico + cadência sem re-varrer em loop
    if (
      !forcar &&
      estadoSalvo.ultimoLaudo &&
      estadoSalvo.ultimoLaudo.meta.periodo === periodo
    ) {
      return NextResponse.json({
        success: true,
        tenant: {
          id: activeTenant.id,
          slug: activeTenant.slug,
          nome: activeTenant.nome,
        },
        periodo,
        cacheHit: true,
        cadenciaConfig: estadoSalvo.config,
        opcoesCadencia: OPCOES_CADENCIA_SAUDE,
        proximaExecucaoIso: estadoSalvo.proximaExecucaoIso,
        proximaExecucaoFormatada: estadoSalvo.proximaExecucaoFormatada,
        ultimoLaudoMeta: estadoSalvo.ultimoLaudo.meta,
        historico: estadoSalvo.historico,
        ...estadoSalvo.ultimoLaudo.relatorio,
      });
    }

    // Executa varredura estrutural limpa, salva no histórico auditável e fixa o resultado
    const { relatorio, totalValesAuditados } =
      await executarVarreduraSaudeTenant(activeTenant.id, periodo);

    const salvo = await salvarExecucaoLaudoSaude({
      tenantId: activeTenant.id,
      relatorio,
      totalValesAuditados,
      periodo,
      origem: 'MANUAL',
      executadoPor: forcar ? executadoPor : 'Carga Inicial Auditada',
    });

    return NextResponse.json({
      success: true,
      tenant: {
        id: activeTenant.id,
        slug: activeTenant.slug,
        nome: activeTenant.nome,
      },
      periodo,
      cacheHit: false,
      cadenciaConfig: salvo.config,
      opcoesCadencia: OPCOES_CADENCIA_SAUDE,
      proximaExecucaoIso: salvo.proximaExecucaoIso,
      proximaExecucaoFormatada: salvo.proximaExecucaoFormatada,
      ultimoLaudoMeta: salvo.ultimoLaudo.meta,
      historico: salvo.historico,
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

    // 0A. Configurar cadência de execução por tenant (Sob Demanda + 19:30 padrão, Manual, 6h, 12h)
    if (action === 'configurar-cadencia') {
      const novaCadencia = validarCadenciaSaude(body.cadencia);
      const atualizado = await salvarConfiguracaoCadenciaSaude({
        tenantId: activeTenant.id,
        cadencia: novaCadencia,
        atualizadoPor: body.executadoPor || 'Administração',
      });

      return NextResponse.json({
        success: true,
        cadenciaConfig: atualizado.config,
        proximaExecucaoIso: atualizado.proximaExecucaoIso,
        proximaExecucaoFormatada: atualizado.proximaExecucaoFormatada,
        message: 'Cadência de varredura salva com sucesso!',
      });
    }

    // 0B. Executar nova varredura manual e salvar laudo no histórico auditável
    if (action === 'executar-varredura') {
      const periodo = body.periodo || '15d';
      const { relatorio, totalValesAuditados } =
        await executarVarreduraSaudeTenant(activeTenant.id, periodo);

      const salvo = await salvarExecucaoLaudoSaude({
        tenantId: activeTenant.id,
        relatorio,
        totalValesAuditados,
        periodo,
        origem: 'MANUAL',
        executadoPor: body.executadoPor || 'Administração',
      });

      return NextResponse.json({
        success: true,
        tenant: {
          id: activeTenant.id,
          slug: activeTenant.slug,
          nome: activeTenant.nome,
        },
        periodo,
        cadenciaConfig: salvo.config,
        opcoesCadencia: OPCOES_CADENCIA_SAUDE,
        proximaExecucaoIso: salvo.proximaExecucaoIso,
        proximaExecucaoFormatada: salvo.proximaExecucaoFormatada,
        ultimoLaudoMeta: salvo.ultimoLaudo.meta,
        historico: salvo.historico,
        ...relatorio,
      });
    }

    // 1. Diagnóstico Executivo de Saúde do Sistema Assistido por IA (Gemini 2.5 Flash)
    if (action === 'analisar-ia') {
      const periodo = body.periodo || '15d';
      const { relatorio: snapshot } = await executarVarreduraSaudeTenant(
        activeTenant.id,
        periodo
      );
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
