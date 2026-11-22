import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest, isDanielOuPatricia } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import { calcularValorDiariaCanteiro } from '@/services/calculoDiarias';
import type { NLPExtracaoResponse } from '@/types/database';
import crypto from 'crypto';

interface ConfirmarTerminalBody {
  extracao: NLPExtracaoResponse;
  mensagemOriginal: string;
  usuarioLogado?: string;
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const tenantId = activeTenant.id;
    const body = (await req.json()) as ConfirmarTerminalBody;
    const {
      extracao,
      mensagemOriginal,
      usuarioLogado = 'Patrícia Grubel',
    } = body;

    if (!extracao?.obras || extracao.obras.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma obra encontrada para enviar à validação.' },
        { status: 400 }
      );
    }

    const hojeBR = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });
    const horaBR = new Date().toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    });
    const agoraBR = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
    const isAdminConfirmando = isDanielOuPatricia(usuarioLogado);

    let totalPontos = 0;
    let totalVales = 0;
    const lotesCriados: string[] = [];

    for (const obra of extracao.obras) {
      const tipoObraInferido =
        activeTenant.slug === 'intermack'
          ? 'OBRA_CIVIL'
          : (obra.nome_obra || '').toUpperCase().includes('QUASE TUDO')
            ? 'OBRA_CIVIL'
            : 'PISCINA';
      const nomeObraCanonica = normalizarNomeObraCanonica(
        obra.nome_obra,
        tipoObraInferido
      );
      const dataRef = obra.data_referencia || hojeBR;

      // 1. Localizar ou criar obra no tenant ativo
      let obraId: string | null = null;
      const { data: obraExistente } = await supabaseAdmin
        .from('obras_config')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('nome', nomeObraCanonica)
        .limit(1)
        .maybeSingle();

      if (obraExistente?.id) {
        obraId = obraExistente.id;
      } else {
        const { data: novaObra } = await supabaseAdmin
          .from('obras_config')
          .insert({
            tenant_id: tenantId,
            nome: nomeObraCanonica,
            local:
              activeTenant.slug === 'intermack'
                ? 'Reforma Interna (Apto)'
                : 'Canteiro de Obras',
            tipo_obra: tipoObraInferido,
          })
          .select('id')
          .single();
        obraId = novaObra?.id || null;
      }

      // 2. Criar ponto_lote com cabeçalho pericial
      const tokenAprovacao = crypto.randomBytes(24).toString('hex');
      const sha256 = crypto
        .createHash('sha256')
        .update(`${usuarioLogado}|TERMINAL_WEB|${mensagemOriginal}|${agoraBR}`)
        .digest('hex');

      const cabecalho =
        `[ORIGEM_WHATSAPP]\n` +
        `Remetente: Terminal IA (${usuarioLogado})\n` +
        `Grupo/JID: web-terminal-${activeTenant.slug}\n` +
        `Timestamp: ${agoraBR}\n` +
        `SHA256: ${sha256}\n` +
        `[MENSAGEM_ORIGINAL]\n${mensagemOriginal}`;

      const apenasValesAdmin =
        isAdminConfirmando &&
        (!obra.apontamentos || obra.apontamentos.length === 0) &&
        Boolean(obra.vales && obra.vales.length > 0);

      const { data: lote } = await supabaseAdmin
        .from('ponto_lote')
        .insert({
          tenant_id: tenantId,
          obra_id: obraId,
          data_referencia: dataRef,
          texto_original: cabecalho,
          status_validacao: apenasValesAdmin ? 'VALIDADO' : 'PENDENTE',
          validado_por: apenasValesAdmin ? usuarioLogado : null,
          validado_em: apenasValesAdmin ? new Date().toISOString() : null,
          token_aprovacao: tokenAprovacao,
        })
        .select('id')
        .single();

      const loteId = lote?.id || null;
      if (loteId) lotesCriados.push(loteId);

      // 3. Registrar apontamentos (PONTO) com nomes canônicos e hierarquia de preços V11
      if (loteId && obra.apontamentos?.length) {
        for (const ap of obra.apontamentos) {
          const fracao = Number(ap.fracao ?? 1.0);
          if (activeTenant.modo === 'EMPREITA' && fracao <= 0) continue;
          const nomeCanonico = normalizarNomeTrabalhadorCanonico(ap.nome);

          const calculo = await calcularValorDiariaCanteiro({
            tenantId,
            nomeTrabalhador: nomeCanonico,
            obraId,
            nomeObra: nomeObraCanonica,
            tipoObra: tipoObraInferido,
            fracao,
            motivo: ap.motivo,
          });

          await supabaseAdmin.from('ponto_detalhe').insert({
            tenant_id: tenantId,
            ponto_lote_id: loteId,
            nome_trabalhador: nomeCanonico,
            fracao_dia: fracao,
            motivo_excecao: ap.motivo || null,
          });

          await supabaseAdmin.from('lancamentos_financeiros').insert({
            tenant_id: tenantId,
            obra_id: obraId,
            nome_trabalhador: nomeCanonico,
            tipo_lancamento: 'PONTO',
            fracao_dia: fracao,
            valor_monetario:
              activeTenant.modo === 'EMPREITA' ? 0 : calculo.valorFinal,
            status: 'PENDENTE',
            data_referencia: dataRef,
            observacao: ap.motivo
              ? `${ap.motivo} | Terminal IA`
              : `Terminal IA (De Acordo) | ${calculo.descricaoRegra}`,
            ponto_lote_id: loteId,
            horario_origem: horaBR,
          });
          totalPontos++;
        }
      }

      // 4. Registrar vales (VALE) — Consistência Omnichannel + Idempotência V17:
      // Vales confirmados via Terminal/Omnichannel por Patrícia ou Daniel ficam imediatamente VALIDADO + CONCILIADO
      if (obra.vales?.length) {
        const { gerarChaveIdempotenciaVale } = await import('@/lib/valeIdempotencia');
        for (const vale of obra.vales) {
          const nomeValeCanonico = normalizarNomeTrabalhadorCanonico(vale.nome);
          const valorVale = Number(vale.valor) > 0 ? Number(vale.valor) : 100.0;
          const chaveIdempotencia = gerarChaveIdempotenciaVale({
            tenantId,
            trabalhador: nomeValeCanonico,
            dataReferencia: dataRef,
            janelaSolicitacao: horaBR,
            valor: valorVale,
          });

          const { data: existente } = await supabaseAdmin
            .from('lancamentos_financeiros')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('chave_idempotencia', chaveIdempotencia)
            .neq('status', 'DESCARTADO')
            .limit(1)
            .maybeSingle();

          if (existente?.id) {
            continue;
          }

          await supabaseAdmin.from('lancamentos_financeiros').insert({
            tenant_id: tenantId,
            obra_id: obraId,
            nome_trabalhador: nomeValeCanonico,
            tipo_lancamento: 'VALE',
            fracao_dia: 0,
            valor_monetario: valorVale,
            status: isAdminConfirmando ? 'VALIDADO' : 'PENDENTE',
            data_referencia: dataRef,
            observacao: isAdminConfirmando
              ? `Vale validado via Omnichannel (${usuarioLogado})`
              : 'Vale lançado via Assistente IA (aguardando envio PIX)',
            ponto_lote_id: loteId,
            vale_etapa: isAdminConfirmando ? 'CONCILIADO' : 'SOLICITADO',
            solicitado_por: usuarioLogado,
            data_hora_solicitacao: `${dataRef}T${horaBR}:00-03:00`,
            aprovado_por: isAdminConfirmando ? usuarioLogado : null,
            pago_por: isAdminConfirmando ? usuarioLogado : null,
            data_hora_envio_efetivo: isAdminConfirmando ? new Date().toISOString() : null,
            horario_origem: horaBR,
            chave_idempotencia: chaveIdempotencia,
          });
          totalVales++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      lotesCriados,
      totalPontos,
      totalVales,
      message: isAdminConfirmando && totalVales > 0 && totalPontos === 0
        ? `${totalVales} vale(s) validado(s) via Omnichannel e sincronizado(s) imediatamente no painel e extrato!`
        : `Enviado para a fila de Validação (${totalPontos} ponto(s) e ${totalVales} vale(s)).`,
    });
  } catch (error) {
    console.error('Erro em POST /api/terminal/confirmar:', error);
    return NextResponse.json(
      { error: 'Falha ao enviar rascunho para validação.' },
      { status: 500 }
    );
  }
}
