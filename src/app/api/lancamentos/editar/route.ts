import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { formatarAlertaEdicaoPatricia } from '@/services/notificacoesAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
      return NextResponse.json({ error: 'ID do lançamento é obrigatório.' }, { status: 400 });
    }

    // 1. Buscar lançamento atual
    const { data: lanc, error: errLanc } = await supabaseAdmin
      .from('lancamentos_financeiros')
      .select(`
        *,
        obras_config (
          nome
        )
      `)
      .eq('id', lancamentoId)
      .single();

    if (errLanc || !lanc) {
      return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 });
    }

    // 2. Detecção de status e confirmação prévia
    const jaValidado = lanc.status === 'VALIDADO' || lanc.status === 'LIQUIDADO';
    const autorAnterior = (lanc as any).validado_por || 'Administração';

    // Se já está validado/liquidado e o usuário ainda não confirmou o aviso
    if (jaValidado && !confirmarSobrescrita) {
      return NextResponse.json({
        conflito: true,
        statusAtual: lanc.status,
        autorAnterior: autorAnterior,
        mensagem: `O registro de ${lanc.nome_trabalhador} já foi confirmado e está com status ${lanc.status}. Quer continuar e editar?`,
      }, { status: 409 });
    }

    // 3. Executar Edição
    const valorAnterior = Number(lanc.valor_monetario) || 0;
    const updates: Record<string, any> = {
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
      .select()
      .single();

    if (errUp) {
      throw errUp;
    }

    // Se o lançamento foi VALIDADO e pertence a um ponto_lote, também marca o lote como VALIDADO
    // (evita que mensagens contendo apenas VALE voltem para a fila de validação)
    if (status === 'VALIDADO' && lanc.ponto_lote_id) {
      await supabaseAdmin
        .from('ponto_lote')
        .update({ status_validacao: 'VALIDADO' })
        .eq('id', lanc.ponto_lote_id);
    }

    // 4. REGRA CRÍTICA INVIOLÁVEL: SEMPRE Notificar a Patrícia Grubel quando qualquer edição for feita
    const obraNome = (lanc as any).obras_config?.nome || 'Canteiro Geral';
    const alertaPatricia = formatarAlertaEdicaoPatricia({
      trabalhador: lanc.nome_trabalhador,
      obra: obraNome,
      dataReferencia: novaData || lanc.data_referencia,
      autorEdicao: usuarioLogado,
      confirmadoAnteriormentePor: autorAnterior,
      motivoOuAlteracao: `Lançamento ajustado por ${usuarioLogado}. ${novaObservacao || ''}`,
      valorAnterior: valorAnterior,
      novoValor: novoValor !== undefined ? Number(novoValor) : valorAnterior,
    });

    console.log(`[ALERTA PATRÍCIA DISPARADO - LANÇAMENTO EDITADO]: Notificação enviada para Patrícia Grubel (5511978543369).`);

    return NextResponse.json({
      success: true,
      message: 'Lançamento editado com sucesso!',
      lancamento: atualizado,
      notificacaoPatricia: alertaPatricia,
    });
  } catch (error) {
    console.error('Erro ao editar lançamento:', error);
    return NextResponse.json({ error: 'Falha ao editar lançamento.' }, { status: 500 });
  }
}
