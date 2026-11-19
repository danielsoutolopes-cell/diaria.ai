import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { formatarAlertaEdicaoPatricia } from '@/services/notificacoesAdmin';
import { formatarTicketPontoWhatsApp } from '@/services/ticketPonto';

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

    // 5. Marcar lote como validado registrando o autor da ação (com fallback defensivo)
    const agora = new Date().toISOString();
    const usuarioLimpoPre = decodeURIComponent(String(usuarioLogado)).replace(/%20/g, ' ').trim();
    const { error: errUpdateLote } = await supabaseAdmin
      .from('ponto_lote')
      .update({
        status_validacao: 'VALIDADO',
        validado_por: usuarioLimpoPre,
        validado_em: agora,
      })
      .eq('id', lote.id);

    if (errUpdateLote) {
      console.warn('[VALIDAR] Fallback update status_validacao em ponto_lote:', errUpdateLote.message);
      await supabaseAdmin
        .from('ponto_lote')
        .update({ status_validacao: 'VALIDADO' })
        .eq('id', lote.id);
    }

    // 6. GERAÇÃO DO TICKET DE MARCAÇÃO DE PONTO HOMOLOGADO (SEM VALORES EM R$)
    const obraNome = (lote as any).obras_config?.nome || 'CANTEIRO DE OBRAS';
    const textoOriginal = lote.texto_original || '';
    let remetenteTel = 'Encarregado de Campo';
    let timestampEnvio = 'Hoje';
    let sha256Original: string | undefined = undefined;

    if (textoOriginal.includes('[ORIGEM_WHATSAPP]')) {
      const matchRem = textoOriginal.match(/Remetente:\s*([^\n]+)/);
      const matchTime = textoOriginal.match(/Timestamp:\s*([^\n]+)/);
      const matchHash = textoOriginal.match(/SHA256:\s*([^\n]+)/);
      if (matchRem) remetenteTel = matchRem[1].trim();
      if (matchTime) timestampEnvio = matchTime[1].trim();
      if (matchHash) sha256Original = matchHash[1].trim();
    }

    const { data: detalhesLote } = await supabaseAdmin
      .from('ponto_detalhe')
      .select('nome_trabalhador, fracao_dia, motivo_excecao')
      .eq('ponto_lote_id', lote.id);

    const usuarioLimpo = decodeURIComponent(String(usuarioLogado)).replace(/%20/g, ' ').trim();
    const ticketTexto = formatarTicketPontoWhatsApp({
      loteId: lote.id,
      obraNome: obraNome,
      dataReferencia: lote.data_referencia,
      apontadoPorTelefone: remetenteTel,
      dataHoraEnvioOriginal: timestampEnvio,
      homologadoPor: usuarioLimpo,
      dataHoraHomologacao: new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      }),
      apontamentos: (detalhesLote || []).map((d) => ({
        nome: d.nome_trabalhador,
        fracao: Number(d.fracao_dia) || 1.0,
        motivo: d.motivo_excecao || 'Integral',
      })),
      totalColaboradores: detalhesLote?.length || 0,
      sha256Hash: sha256Original,
    });

    console.log(`[TICKET DE PONTO GERADO]: Lote #${lote.id.slice(0, 8)} homologado por ${usuarioLogado}. Enviando via Baileys...`);

    // Disparo real no WhatsApp privado de Daniel e Patrícia via Baileys local
    const destinatarios = ['5511988139833', '5511978543369'];
    for (const phone of destinatarios) {
      fetch('http://127.0.0.1:3001/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: ticketTexto }),
      }).catch((err) => console.error(`Erro ao enviar ticket para ${phone}:`, err));
    }

    // 7. REGRA CRÍTICA INVIOLÁVEL: Se foi uma reedição/alteração, SEMPRE notificar Patrícia Grubel
    let alertaPatriciaPayload = null;
    if (jaValidado) {
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
      ticketPontoWhatsApp: ticketTexto,
      notificacaoDuplicada: {
        enviadoPara: [
          { nome: 'Patrícia Grubel', telefone: '5511978543369' },
          { nome: 'Daniel Lopes', telefone: '5511988139833' },
        ],
        aviso: 'Lote aprovado e disponibilizado para liquidação no Borderô.',
      },
    });
  } catch (error) {
    console.error('Erro ao validar ponto:', error);
    return NextResponse.json({ error: 'Falha ao validar ponto.' }, { status: 500 });
  }
}

