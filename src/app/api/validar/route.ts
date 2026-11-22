import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { formatarAlertaEdicaoPatricia } from '@/services/notificacoesAdmin';
import { formatarTicketPontoWhatsApp } from '@/services/ticketPonto';

interface AjusteValidacaoItem {
  detalheId?: string;
  lancamentoId?: string;
  fracao_dia: number;
  valor_diaria?: number;
  trabalhador?: string;
  obra?: string;
}

interface ValidarRequestBody {
  loteId?: string;
  token?: string;
  ajustes?: AjusteValidacaoItem[];
  usuarioLogado?: string;
  confirmarSobrescrita?: boolean;
}

interface ObraConfigRel {
  nome: string | null;
}

interface PontoLoteQueryRow {
  id: string;
  tenant_id: string;
  data_referencia: string;
  texto_original: string | null;
  status_validacao: string;
  validado_por: string | null;
  validado_em: string | null;
  obras_config: ObraConfigRel | ObraConfigRel[] | null;
}

interface PontoDetalheTicketRow {
  nome_trabalhador: string;
  fracao_dia: number | string | null;
  motivo_excecao: string | null;
}

function extrairNomeObra(rel: ObraConfigRel | ObraConfigRel[] | null): string {
  if (!rel) return 'CANTEIRO DE OBRAS';
  if (Array.isArray(rel)) return rel[0]?.nome || 'CANTEIRO DE OBRAS';
  return rel.nome || 'CANTEIRO DE OBRAS';
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as ValidarRequestBody;
    const {
      loteId,
      token,
      ajustes,
      usuarioLogado = 'Patrícia Grubel',
      confirmarSobrescrita = false,
    } = body;

    if (!loteId && !token) {
      return NextResponse.json(
        { error: 'Identificador do lote ou token é obrigatório.' },
        { status: 400 }
      );
    }

    // 1. Localizar lote com isolamento estrito de tenant_id
    let query = supabaseAdmin.from('ponto_lote').select(`
      id,
      tenant_id,
      data_referencia,
      texto_original,
      status_validacao,
      validado_por,
      validado_em,
      obras_config (
        nome
      )
    `);
    if (token) {
      query = query.eq('token_aprovacao', token);
    } else {
      query = query.eq('id', loteId as string).eq('tenant_id', activeTenant.id);
    }

    const { data: loteRaw, error: errLote } = await query.single();
    const lote = loteRaw as unknown as PontoLoteQueryRow | null;
    if (errLote || !lote) {
      return NextResponse.json(
        { error: 'Lote não encontrado para a empresa ativa.' },
        { status: 404 }
      );
    }

    // Tenant autoritativo do lote (garante isolamento absoluto nas atualizações filhas)
    const loteTenantId = lote.tenant_id || activeTenant.id;

    // 2. Detecção de Conflito de Validação entre Múltiplos Administradores (Patrícia vs Daniel)
    const jaValidado = lote.status_validacao === 'VALIDADO';
    const validadoAnteriormentePor = lote.validado_por || 'Outro Administrador';

    if (jaValidado && !confirmarSobrescrita) {
      return NextResponse.json(
        {
          conflito: true,
          validadoPor: validadoAnteriormentePor,
          validadoEm: lote.validado_em,
          mensagem: `O registro já foi confirmado por ${validadoAnteriormentePor}. Quer continuar e alterar?`,
        },
        { status: 409 }
      );
    }

    // 3. Atualizar frações ajustadas com trava de tenant_id
    const alteracoesRealizadas: string[] = [];
    if (ajustes && Array.isArray(ajustes)) {
      for (const item of ajustes) {
        if (item.detalheId) {
          await supabaseAdmin
            .from('ponto_detalhe')
            .update({ fracao_dia: item.fracao_dia })
            .eq('id', item.detalheId)
            .eq('tenant_id', loteTenantId);
        }
        if (item.lancamentoId) {
          const { error: errValV15 } = await supabaseAdmin
            .from('lancamentos_financeiros')
            .update({
              fracao_dia: item.fracao_dia,
              valor_monetario: (item.valor_diaria || 150) * item.fracao_dia,
              status: 'VALIDADO',
              aprovado_por: usuarioLogado,
            })
            .eq('id', item.lancamentoId)
            .eq('tenant_id', loteTenantId);

          if (errValV15) {
            await supabaseAdmin
              .from('lancamentos_financeiros')
              .update({
                fracao_dia: item.fracao_dia,
                valor_monetario: (item.valor_diaria || 150) * item.fracao_dia,
                status: 'VALIDADO',
              })
              .eq('id', item.lancamentoId)
              .eq('tenant_id', loteTenantId);
          }
        }
        if (item.trabalhador) {
          alteracoesRealizadas.push(
            `${item.trabalhador}: fração ajustada para ${item.fracao_dia} (R$ ${((item.valor_diaria || 150) * item.fracao_dia).toFixed(2)})`
          );
        }
      }
    }

    // 4. Atualizar status de todos os lançamentos financeiros vinculados ao lote (sem alterar itens LIQUIDADO/DESCARTADO)
    await supabaseAdmin
      .from('lancamentos_financeiros')
      .update({ status: 'VALIDADO' })
      .eq('tenant_id', loteTenantId)
      .eq('ponto_lote_id', lote.id)
      .eq('status', 'PENDENTE');

    // 5. Marcar lote como validado registrando o autor da ação
    const agora = new Date().toISOString();
    const usuarioLimpoPre = decodeURIComponent(String(usuarioLogado))
      .replace(/%20/g, ' ')
      .trim();
    const { error: errUpdateLote } = await supabaseAdmin
      .from('ponto_lote')
      .update({
        status_validacao: 'VALIDADO',
        validado_por: usuarioLimpoPre,
        validado_em: agora,
      })
      .eq('id', lote.id)
      .eq('tenant_id', loteTenantId);

    if (errUpdateLote) {
      console.warn(
        '[VALIDAR] Fallback update status_validacao em ponto_lote:',
        errUpdateLote.message
      );
      await supabaseAdmin
        .from('ponto_lote')
        .update({ status_validacao: 'VALIDADO' })
        .eq('id', lote.id)
        .eq('tenant_id', loteTenantId);
    }

    // 6. GERAÇÃO DO TICKET DE MARCAÇÃO DE PONTO HOMOLOGADO (SEM VALORES EM R$)
    const obraNome = extrairNomeObra(lote.obras_config);
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

    const { data: detalhesLoteRaw } = await supabaseAdmin
      .from('ponto_detalhe')
      .select('nome_trabalhador, fracao_dia, motivo_excecao')
      .eq('tenant_id', loteTenantId)
      .eq('ponto_lote_id', lote.id);

    const detalhesLote =
      (detalhesLoteRaw as unknown as PontoDetalheTicketRow[] | null) || [];

    const usuarioLimpo = decodeURIComponent(String(usuarioLogado))
      .replace(/%20/g, ' ')
      .trim();
    const ticketTexto = formatarTicketPontoWhatsApp({
      loteId: lote.id,
      obraNome,
      dataReferencia: lote.data_referencia,
      apontadoPorTelefone: remetenteTel,
      dataHoraEnvioOriginal: timestampEnvio,
      homologadoPor: usuarioLimpo,
      dataHoraHomologacao: new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      }),
      apontamentos: detalhesLote.map((d) => ({
        nome: d.nome_trabalhador,
        fracao: Number(d.fracao_dia) || 1.0,
        motivo: d.motivo_excecao || 'Integral',
      })),
      totalColaboradores: detalhesLote.length,
      sha256Hash: sha256Original,
    });

    // Disparo real no WhatsApp privado de Daniel e Patrícia via Baileys local
    const destinatarios = ['5511988139833', '5511978543369'];
    for (const phone of destinatarios) {
      fetch('http://127.0.0.1:3001/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: ticketTexto }),
      }).catch((err) =>
        console.error(`Erro ao enviar ticket para ${phone}:`, err)
      );
    }

    // 7. REGRA CRÍTICA INVIOLÁVEL: Se foi uma reedição/alteração, SEMPRE notificar Patrícia Grubel
    if (jaValidado) {
      formatarAlertaEdicaoPatricia({
        trabalhador:
          alteracoesRealizadas.length > 0
            ? alteracoesRealizadas.join(', ')
            : 'Colaboradores do Lote',
        obra: obraNome,
        dataReferencia: lote.data_referencia,
        autorEdicao: usuarioLogado,
        confirmadoAnteriormentePor: validadoAnteriormentePor,
        motivoOuAlteracao:
          alteracoesRealizadas.length > 0
            ? `Lote reeditado e aprovado com novos valores: ${alteracoesRealizadas.join('; ')}`
            : 'Lote revalidado no sistema.',
      });
      console.log(
        `[ALERTA PATRÍCIA DISPARADO]: Registro alterado por ${usuarioLogado}. Notificação enviada para Patrícia Grubel (5511978543369).`
      );
    }

    return NextResponse.json({
      success: true,
      message: jaValidado
        ? 'Registro reeditado e atualizado com sucesso!'
        : 'Ponto validado com sucesso! Folha atualizada.',
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
    return NextResponse.json(
      { error: 'Falha ao validar ponto.' },
      { status: 500 }
    );
  }
}

