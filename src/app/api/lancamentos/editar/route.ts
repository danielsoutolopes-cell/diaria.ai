import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { formatarAlertaEdicaoPatricia } from '@/services/notificacoesAdmin';
import type { StatusLancamento } from '@/types/database';

interface EditarLancamentoBody {
  lancamentoId?: string;
  novaFracao?: number;
  novoValor?: number;
  novaData?: string;
  novaObservacao?: string;
  status?: StatusLancamento;
  usuarioLogado?: string;
  confirmarSobrescrita?: boolean;
}

interface ObraRel {
  nome: string | null;
}

interface LancamentoEditRow {
  id: string;
  tenant_id: string;
  nome_trabalhador: string;
  valor_monetario: number | string | null;
  data_referencia: string;
  status: string;
  ponto_lote_id: string | null;
  validado_por?: string | null;
  obras_config: ObraRel | ObraRel[] | null;
}

interface LancamentoUpdatePayload {
  updated_at: string;
  fracao_dia?: number;
  valor_monetario?: number;
  data_referencia?: string;
  observacao?: string;
  status?: StatusLancamento;
}

function extrairNomeObra(rel: ObraRel | ObraRel[] | null): string {
  if (!rel) return 'Canteiro Geral';
  if (Array.isArray(rel)) return rel[0]?.nome || 'Canteiro Geral';
  return rel.nome || 'Canteiro Geral';
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as EditarLancamentoBody;
    const {
      lancamentoId,
      novaFracao,
      novoValor,
      novaData,
      novaObservacao,
      status,
      usuarioLogado = 'Patrícia Grubel',
      confirmarSobrescrita = false,
    } = body;

    if (!lancamentoId) {
      return NextResponse.json(
        { error: 'ID do lançamento é obrigatório.' },
        { status: 400 }
      );
    }

    // 1. Buscar lançamento atual isolado por tenant_id
    const { data: lancRaw, error: errLanc } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        id,
        tenant_id,
        nome_trabalhador,
        valor_monetario,
        data_referencia,
        status,
        ponto_lote_id,
        obras_config (
          nome
        )
      `)
      .eq('id', lancamentoId)
      .eq('tenant_id', activeTenant.id)
      .single();

    const lanc = lancRaw as unknown as LancamentoEditRow | null;
    if (errLanc || !lanc) {
      return NextResponse.json(
        { error: 'Lançamento não encontrado para a empresa ativa.' },
        { status: 404 }
      );
    }

    // 2. Detecção de status e confirmação prévia
    const jaValidado = lanc.status === 'VALIDADO' || lanc.status === 'LIQUIDADO';
    const autorAnterior = lanc.validado_por || 'Administração';

    if (jaValidado && !confirmarSobrescrita) {
      return NextResponse.json(
        {
          conflito: true,
          statusAtual: lanc.status,
          autorAnterior,
          mensagem: `O registro de ${lanc.nome_trabalhador} já foi confirmado e está com status ${lanc.status}. Quer continuar e editar?`,
        },
        { status: 409 }
      );
    }

    // 3. Executar Edição com trava estrita de tenant_id
    const valorAnterior = Number(lanc.valor_monetario) || 0;
    const updates: LancamentoUpdatePayload = {
      updated_at: new Date().toISOString(),
    };

    if (novaFracao !== undefined) updates.fracao_dia = Number(novaFracao);
    if (novoValor !== undefined) updates.valor_monetario = Number(novoValor);
    if (novaData) updates.data_referencia = novaData;
    if (novaObservacao !== undefined) updates.observacao = novaObservacao;
    if (status) updates.status = status;

    const { data: atualizado, error: errUp } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .update(updates)
      .eq('id', lancamentoId)
      .eq('tenant_id', activeTenant.id)
      .select()
      .single();

    if (errUp) {
      throw errUp;
    }

    // Se o lançamento foi VALIDADO e pertence a um ponto_lote, também marca o lote como VALIDADO
    if (status === 'VALIDADO' && lanc.ponto_lote_id) {
      await supabaseAdmin
        .from('ponto_lote')
        .update({ status_validacao: 'VALIDADO' })
        .eq('id', lanc.ponto_lote_id)
        .eq('tenant_id', activeTenant.id);
    }

    // 4. REGRA CRÍTICA INVIOLÁVEL: SEMPRE Notificar a Patrícia Grubel quando qualquer edição for feita
    const obraNome = extrairNomeObra(lanc.obras_config);
    const alertaPatricia = formatarAlertaEdicaoPatricia({
      trabalhador: lanc.nome_trabalhador,
      obra: obraNome,
      dataReferencia: novaData || lanc.data_referencia,
      autorEdicao: usuarioLogado,
      confirmadoAnteriormentePor: autorAnterior,
      motivoOuAlteracao: `Lançamento ajustado por ${usuarioLogado}. ${novaObservacao || ''}`,
      valorAnterior,
      novoValor: novoValor !== undefined ? Number(novoValor) : valorAnterior,
    });

    console.log(
      '[ALERTA PATRÍCIA DISPARADO - LANÇAMENTO EDITADO]: Notificação enviada para Patrícia Grubel (5511978543369).'
    );

    return NextResponse.json({
      success: true,
      message: 'Lançamento editado com sucesso!',
      lancamento: atualizado,
      notificacaoPatricia: alertaPatricia,
    });
  } catch (error) {
    console.error('Erro ao editar lançamento:', error);
    return NextResponse.json(
      { error: 'Falha ao editar lançamento.' },
      { status: 500 }
    );
  }
}
