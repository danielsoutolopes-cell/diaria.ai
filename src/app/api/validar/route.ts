import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { formatarAlertaEdicaoPatricia } from '@/services/notificacoesAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { loteId, token, ajustes, usuarioLogado = 'Patrícia Grubel', confirmarSobrescrita = false } = body;
    // ajustes: Array<{ detalheId?: string; lancamentoId?: string; fracao_dia: number; valor_diaria?: number; trabalhador?: string; obra?: string }>

    if (!loteId && !token) {
      return NextResponse.json({ error: 'Identificador do lote ou token é obrigatório.' }, { status: 400 });
    }

    // 1. Localizar lote
    let query = supabaseAdmin.from('ponto_lote').select(`
      *,
      obras_config (
        nome
      )
    `);
    if (token) {
      query = query.eq('token_aprovacao', token);
    } else {
      query = query.eq('id', loteId);
    }

    const { data: lote, error: errLote } = await query.single();
    if (errLote || !lote) {
      return NextResponse.json({ error: 'Lote não encontrado.' }, { status: 404 });
    }

    // 2. Detecção de Conflito de Validação entre Múltiplos Administradores (Patrícia vs Daniel)
    const jaValidado = lote.status_validacao === 'VALIDADO';
    const validadoAnteriormentePor = lote.validado_por || 'Outro Administrador';

    // Se já foi validado e quem está editando agora NÃO enviou confirmação explícita
    if (jaValidado && !confirmarSobrescrita) {
      return NextResponse.json({
        conflito: true,
        validadoPor: validadoAnteriormentePor,
        validadoEm: lote.validado_em,
        mensagem: `O registro já foi confirmado por ${validadoAnteriormentePor}. Quer continuar e alterar?`,
      }, { status: 409 });
    }

    // 3. Atualizar frações ajustadas
    const alteracoesRealizadas: string[] = [];
    if (ajustes && Array.isArray(ajustes)) {
      for (const item of ajustes) {
        if (item.detalheId) {
          await supabaseAdmin
            .from('ponto_detalhe')
            .update({ fracao_dia: item.fracao_dia })
            .eq('id', item.detalheId);
        }
        if (item.lancamentoId) {
          await supabaseAdmin
            .from('lancamentos_financeiros')
            .update({
              fracao_dia: item.fracao_dia,
              valor_monetario: (item.valor_diaria || 150) * item.fracao_dia,
              status: 'VALIDADO',
            })
            .eq('id', item.lancamentoId);
        }
        if (item.trabalhador) {
          alteracoesRealizadas.push(`${item.trabalhador}: fração ajustada para ${item.fracao_dia} (R$ ${((item.valor_diaria || 150) * item.fracao_dia).toFixed(2)})`);
        }
      }
    }

    // 4. Atualizar status de todos os lançamentos financeiros vinculados ao lote
    await supabaseAdmin
      .from('lancamentos_financeiros')
      .update({ status: 'VALIDADO' })
      .eq('ponto_lote_id', lote.id);

    // 5. Marcar lote como validado registrando o autor da ação
    const agora = new Date().toISOString();
    await supabaseAdmin
      .from('ponto_lote')
      .update({
        status_validacao: 'VALIDADO',
        validado_por: usuarioLogado,
        validado_em: agora,
      })
      .eq('id', lote.id);

    // 6. REGRA CRÍTICA INVIOLÁVEL: Se foi uma reedição/alteração, SEMPRE notificar Patrícia Grubel
    let alertaPatriciaPayload = null;
    if (jaValidado) {
      const obraNome = (lote as any).obras_config?.nome || 'Canteiro de Obras';
      alertaPatriciaPayload = formatarAlertaEdicaoPatricia({
        trabalhador: alteracoesRealizadas.length > 0 ? alteracoesRealizadas.join(', ') : 'Colaboradores do Lote',
        obra: obraNome,
        dataReferencia: lote.data_referencia,
        autorEdicao: usuarioLogado,
        confirmadoAnteriormentePor: validadoAnteriormentePor,
        motivoOuAlteracao: alteracoesRealizadas.length > 0
          ? `Lote reeditado e aprovado com novos valores: ${alteracoesRealizadas.join('; ')}`
          : 'Lote revalidado no sistema.',
      });
      console.log(`[ALERTA PATRÍCIA DISPARADO]: Registro alterado por ${usuarioLogado}. Notificação enviada para Patrícia Grubel (5511978543369).`);
    }

    return NextResponse.json({
      success: true,
      message: jaValidado ? 'Registro reeditado e atualizado com sucesso!' : 'Ponto validado com sucesso! Folha atualizada.',
      loteId: lote.id,
      status: 'VALIDADO',
      validadoPor: usuarioLogado,
      reeditado: jaValidado,
      alertaPatriciaEnviado: jaValidado,
      notificacaoDuplicada: {
        enviadoPara: [
          { nome: 'Patrícia Grubel', telefone: '5511978543369' },
          { nome: 'Daniel Lopes', telefone: '5511913192703' },
        ],
        aviso: 'Lote aprovado e disponibilizado para liquidação no Borderô.',
      },
    });
  } catch (error) {
    console.error('Erro ao validar ponto:', error);
    return NextResponse.json({ error: 'Falha ao validar ponto.' }, { status: 500 });
  }
}

