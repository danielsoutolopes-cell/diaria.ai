import { NextRequest, NextResponse } from 'next/server';
import { extrairDadosMensagem } from '@/lib/gemini';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadToR2 } from '@/services/r2Storage';
import {
  formatarTicketEncarregado,
  formatarTicketFinanceiroAdministracao,
} from '@/services/notificacoesAdmin';
import { calcularValorDiariaCanteiro } from '@/services/calculoDiarias';
import { normalizeTenantSlug, TENANTS } from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import {
  analisarImagemPixComGemini,
  extrairPedidosValeNaturais,
  interpretarLegendaComprovantePix,
  obterContextoSolicitacaoVale,
  registrarContextoSolicitacaoVale,
} from '@/services/valesNlp';
import {
  agruparItensCompraComGemini,
  formatarMensagemPedidoWhatsApp,
  isMensagemPedidoCompra,
  type PedidoCompraRecord,
} from '@/services/pedidosComprasNlp';
import { buscarLogisticaPorNomeObra } from '@/services/obrasLogisticaStorage';
import { lerFeatureFlagsTenant } from '@/services/featureFlagsStorage';
import {
  isConfirmacaoOkEncarregado,
  type HomologacaoDiaria19hRecord,
} from '@/services/resumoDiario19h';
import crypto from 'crypto';

// Mutex em memória para evitar concorrência e mensagens duplicadas do WhatsApp
const processedMessageIds = new Set<string>();
const processingLocks = new Map<string, number>();

interface WhatsAppImageMessage {
  caption?: string;
  jpegThumbnail?: string;
}

interface WhatsAppWebhookBody {
  messageId?: string;
  id?: string;
  from?: string;
  participant?: string;
  text?: string;
  message?: string | { imageMessage?: WhatsAppImageMessage };
  imageMessage?: WhatsAppImageMessage;
  base64?: string;
  mediaUrl?: string;
  url?: string;
  messageTimestamp?: number | string;
  data?: {
    key?: {
      id?: string;
      remoteJid?: string;
      participant?: string;
    };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: WhatsAppImageMessage;
    };
    base64?: string;
    mediaUrl?: string;
    messageTimestamp?: number | string;
    pushName?: string;
  };
}

interface GrupoMapeadoConfig {
  jid: string;
  empresa?: string;
  obraNome: string;
  ambiente: 'INTERNO' | 'EXTERNO';
  ativo: boolean;
}

interface PontoAbertoDiaRow {
  nome_trabalhador: string;
  fracao_dia: number | string | null;
  obra_id: string | null;
  status: string;
}

function getHojeBrasiliaISO(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
}

function inferirTipoObra(
  nomeObraCanonico: string,
  empresaSlug: 'jhoston' | 'intermack'
): 'PISCINA' | 'OBRA_CIVIL' {
  if (empresaSlug === 'intermack') return 'OBRA_CIVIL';
  const upper = nomeObraCanonico.toUpperCase();
  if (upper.includes('PISCINA')) return 'PISCINA';
  if (
    upper.includes('QUASE TUDO') ||
    upper.includes('OBRA') ||
    upper.includes('IMPERIAL') ||
    upper.includes('REFORMA')
  ) {
    return 'OBRA_CIVIL';
  }
  return 'PISCINA';
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as WhatsAppWebhookBody;

    // Compatível com Baileys / Evolution API v2 / Webhook padrão
    const messageId =
      body?.data?.key?.id || body?.messageId || body?.id || `msg-${Date.now()}`;
    const remoteJid = body?.data?.key?.remoteJid || body?.from || '';
    // Em grupos, key.participant é o telefone real do encarregado que digitou
    const participantJid =
      body?.data?.key?.participant || body?.participant || remoteJid;
    const senderNumber = participantJid.replace(/[^0-9]/g, '');

    // Detecção de foto / recibo (imageMessage)
    const msgObj =
      typeof body?.message === 'object' && body.message !== null
        ? body.message
        : undefined;
    const imageMessage =
      body?.data?.message?.imageMessage ||
      msgObj?.imageMessage ||
      body?.imageMessage;

    const base64Image =
      body?.data?.base64 ||
      body?.base64 ||
      body?.data?.message?.imageMessage?.jpegThumbnail;

    const imageMediaUrl = body?.data?.mediaUrl || body?.mediaUrl || body?.url;

    let comprovanteUrl: string | null = null;

    // Se a mensagem contiver foto, faz upload para o Cloudflare R2
    if (imageMessage || base64Image || imageMediaUrl) {
      try {
        let buffer: Buffer | null = null;

        if (base64Image) {
          const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
          buffer = Buffer.from(cleanBase64, 'base64');
        } else if (imageMediaUrl) {
          const imgRes = await fetch(imageMediaUrl);
          const arrayBuf = await imgRes.arrayBuffer();
          buffer = Buffer.from(arrayBuf);
        }

        if (buffer) {
          const uploadResult = await uploadToR2(
            buffer,
            `recibo-whatsapp-${senderNumber}-${Date.now()}.jpg`,
            'image/jpeg'
          );
          if (uploadResult.success) {
            comprovanteUrl = uploadResult.url;
          }
        }
      } catch (errUpload) {
        console.error('Erro ao processar imagem para o Cloudflare R2:', errUpload);
      }
    }

    // Texto da mensagem (ou legenda da foto)
    const messageText =
      body?.data?.message?.conversation ||
      body?.data?.message?.extendedTextMessage?.text ||
      imageMessage?.caption ||
      body?.text ||
      (typeof body?.message === 'string' ? body.message : '') ||
      (comprovanteUrl ? 'Comprovante de vale anexado' : '');

    if (!messageText && !comprovanteUrl) {
      return NextResponse.json({
        status: 'ignored',
        reason: 'Mensagem sem texto ou anexo.',
      });
    }

    // Trava de deduplicação (Mutex)
    if (processedMessageIds.has(messageId)) {
      return NextResponse.json({ status: 'duplicate', messageId });
    }

    const now = Date.now();
    const lockTime = processingLocks.get(remoteJid);
    if (lockTime && now - lockTime < 3000) {
      return NextResponse.json(
        { status: 'locked', reason: 'Aguarde processamento anterior.' },
        { status: 429 }
      );
    }

    processingLocks.set(remoteJid, now);
    processedMessageIds.add(messageId);

    // Limitar o tamanho do cache do Set
    if (processedMessageIds.size > 2000) {
      const it = processedMessageIds.values();
      for (let i = 0; i < 500; i++) {
        const item = it.next().value;
        if (item) {
          processedMessageIds.delete(item);
        }
      }
    }

    const MASTER_TENANT_ID = TENANTS.jhoston.id;
    let tenantId = MASTER_TENANT_ID; // Default tenant (Jhoston)
    let empresaAtivaSlug: 'jhoston' | 'intermack' = 'jhoston';

    // Roteamento Multi-Empresa (1 conta WhatsApp -> N grupos de obras Jhoston / Intermack)
    const { data: paramCorte } = await supabaseAdmin
      .from('parametros_sistema')
      .select('configuracoes')
      .eq('tenant_id', MASTER_TENANT_ID)
      .maybeSingle();

    const configsSistema = (paramCorte?.configuracoes || {}) as Record<
      string,
      unknown
    >;
    const configGeral = (configsSistema.config_geral_global || {}) as {
      gruposWhatsApp?: GrupoMapeadoConfig[];
    };

    const grupoMapeado = (configGeral.gruposWhatsApp || []).find(
      (g) =>
        g.ativo && g.jid && remoteJid && g.jid.trim() === remoteJid.trim()
    );
    if (grupoMapeado) {
      empresaAtivaSlug = normalizeTenantSlug(grupoMapeado.empresa);
      if (empresaAtivaSlug === 'intermack') {
        tenantId = TENANTS.intermack.id;
        console.log(
          `[ROTEAMENTO MULTI-EMPRESA] Grupo ${remoteJid} roteado para INTERMACK (${grupoMapeado.obraNome} • ${grupoMapeado.ambiente}).`
        );
      }
    }

    const {
      resolverDataHoraCorteValidacao,
      formatarDataHoraCorteBR,
    } = await import('@/lib/formatarDataCorte');
    const corteConfigurado = resolverDataHoraCorteValidacao(configsSistema);

    const rawMsgTimestamp =
      body?.data?.messageTimestamp || body?.messageTimestamp || null;
    if (corteConfigurado && rawMsgTimestamp) {
      const tsMs =
        Number(rawMsgTimestamp) > 1e12
          ? Number(rawMsgTimestamp)
          : Number(rawMsgTimestamp) * 1000;
      if (!Number.isNaN(tsMs)) {
        const temHorarioExplicito = corteConfigurado.includes('T') || /\d{2}:\d{2}/.test(corteConfigurado);
        let antesOuIgualCorte = false;
        if (temHorarioExplicito) {
          const corteMs = Date.parse(corteConfigurado);
          if (!Number.isNaN(corteMs)) {
            antesOuIgualCorte = tsMs <= corteMs;
          }
        } else {
          const dataMsgBR = new Date(tsMs).toLocaleDateString('en-CA', {
            timeZone: 'America/Sao_Paulo',
          });
          antesOuIgualCorte = dataMsgBR <= corteConfigurado;
        }

        if (antesOuIgualCorte) {
          const corteLegivel = formatarDataHoraCorteBR(corteConfigurado) || corteConfigurado;
          console.log(
            `[CORTE OPERACIONAL] Mensagem ${messageId} ignorada (corte <= ${corteLegivel}).`
          );
          return NextResponse.json({
            status: 'ignored',
            reason: `Mensagem anterior ao ponto de corte operacional (${corteLegivel}).`,
            messageId,
          });
        }
      }
    }

    // Prompt 8: Gerador Inteligente de Pedido de Compras por Grupo de Obra (ativo na Intermack; standby na Jhoston)
    if (
      TENANTS[empresaAtivaSlug].moduloComprasAtivo &&
      !comprovanteUrl &&
      isMensagemPedidoCompra(messageText)
    ) {
      const obraNomeCompra =
        grupoMapeado?.obraNome || 'Obra Intermack (Grupo WhatsApp)';
      const { itens, motor } = await agruparItensCompraComGemini(
        messageText,
        obraNomeCompra
      );

      if (itens.length > 0) {
        const agoraCompra = new Date();
        const dataHoraLabel = agoraCompra.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        });
        const solicitanteCompra =
          body?.data?.pushName || senderNumber || 'Grupo de Obra';
        const logisticaObra = await buscarLogisticaPorNomeObra(
          tenantId,
          obraNomeCompra
        );
        const dadosEntrega = logisticaObra
          ? {
              aliasFornecedor: logisticaObra.aliasFornecedor,
              enderecoEntrega: logisticaObra.enderecoEntrega,
              cepEntrega: logisticaObra.cepEntrega,
              complementoObservacao: logisticaObra.complementoObservacao,
              contatoRecebimento: logisticaObra.contatoRecebimento,
            }
          : undefined;
        const mensagemFormatada = formatarMensagemPedidoWhatsApp({
          empresaNome: TENANTS[empresaAtivaSlug].nome,
          obraNome: obraNomeCompra,
          solicitadoPor: solicitanteCompra,
          dataHoraLabel,
          itens,
          dadosEntrega,
        });

        let enviadoPatricia = false;
        try {
          const resZap = await fetch('http://127.0.0.1:3001/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: '5511978543369',
              message: mensagemFormatada,
            }),
          });
          enviadoPatricia = resZap.ok;
        } catch {
          enviadoPatricia = false;
        }

        const novoPedido: PedidoCompraRecord = {
          id: `pc-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          tenantId,
          empresaNome: TENANTS[empresaAtivaSlug].nome,
          obraNome: obraNomeCompra,
          dadosEntrega,
          grupoJid: remoteJid,
          solicitadoPor: solicitanteCompra,
          textoOriginal: messageText,
          itens,
          mensagemFormatada,
          status: enviadoPatricia ? 'ENVIADO_PATRICIA' : 'NOVO',
          enviadoWhatsAppPatricia: enviadoPatricia,
          criadoEm: agoraCompra.toISOString(),
          atualizadoEm: agoraCompra.toISOString(),
        };

        const { data: paramIntermack } = await supabaseAdmin
          .from('parametros_sistema')
          .select('id, configuracoes')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        const cfgIntermack =
          (paramIntermack?.configuracoes as Record<string, unknown> | null) || {};
        const pedidosAtuais = Array.isArray(cfgIntermack.pedidos_compras)
          ? (cfgIntermack.pedidos_compras as PedidoCompraRecord[])
          : [];

        const novasCfg = {
          ...cfgIntermack,
          pedidos_compras: [novoPedido, ...pedidosAtuais].slice(0, 150),
        };

        if (paramIntermack?.id) {
          await supabaseAdmin
            .from('parametros_sistema')
            .update({ configuracoes: novasCfg })
            .eq('id', paramIntermack.id)
            .eq('tenant_id', tenantId);
        } else {
          await supabaseAdmin.from('parametros_sistema').insert({
            tenant_id: tenantId,
            configuracoes: novasCfg,
          });
        }

        console.log(
          `[PEDIDO-COMPRAS][${TENANTS[empresaAtivaSlug].nome}] ${itens.length} item(ns) agrupado(s) via ${motor} para ${obraNomeCompra}.`
        );

        return NextResponse.json({
          status: 'pedido_compra_processado',
          empresa: TENANTS[empresaAtivaSlug].nome,
          obraNome: obraNomeCompra,
          totalItens: itens.length,
          motor,
          enviadoPatricia,
          pedidoId: novoPedido.id,
        });
      }
    }

    // Verificação de Intenção de Reembolso / Despesa de Campo
    const textLower = (messageText || '').toLowerCase();
    const isPalavraReembolso =
      textLower.includes('reembolso') ||
      textLower.includes('gasolina') ||
      textLower.includes('combustivel') ||
      textLower.includes('combustível') ||
      textLower.includes('nota fiscal') ||
      textLower.includes('cupom') ||
      textLower.includes('pedagio') ||
      textLower.includes('pedágio') ||
      textLower.includes('despesa') ||
      textLower.includes('gasto na obra');

    const isPedidoReembolso =
      Boolean(comprovanteUrl) &&
      (isPalavraReembolso ||
        textLower.includes('nf') ||
        textLower.includes('r$'));

    if (isPedidoReembolso) {
      console.log(
        `[WHATSAPP WEBHOOK]: Pedido de Reembolso detectado de ${senderNumber} com comprovante: ${comprovanteUrl}`
      );

      let categoria:
        | 'COMBUSTIVEL'
        | 'MATERIAL'
        | 'ALIMENTACAO'
        | 'PEDAGIO'
        | 'OUTROS' = 'OUTROS';
      if (
        textLower.includes('gasolina') ||
        textLower.includes('combustivel') ||
        textLower.includes('combustível') ||
        textLower.includes('posto')
      ) {
        categoria = 'COMBUSTIVEL';
      } else if (
        textLower.includes('material') ||
        textLower.includes('deposito') ||
        textLower.includes('depósito') ||
        textLower.includes('cimento') ||
        textLower.includes('cano')
      ) {
        categoria = 'MATERIAL';
      } else if (
        textLower.includes('pedagio') ||
        textLower.includes('pedágio') ||
        textLower.includes('sem parar')
      ) {
        categoria = 'PEDAGIO';
      } else if (
        textLower.includes('almoco') ||
        textLower.includes('almoço') ||
        textLower.includes('refeicao') ||
        textLower.includes('refeição')
      ) {
        categoria = 'ALIMENTACAO';
      }

      const matchValor = messageText.match(/(?:r\$|reais)?\s*(\d+[.,]?\d*)/i);
      let valorSolicitado = 0.0;
      if (matchValor && matchValor[1]) {
        valorSolicitado = parseFloat(matchValor[1].replace(',', '.'));
      }

      const { data: enc } = await supabaseAdmin
        .from('encarregados_obras')
        .select('nome')
        .eq('tenant_id', tenantId)
        .eq('telefone_encarregado', senderNumber)
        .limit(1)
        .maybeSingle();

      const nomeSolicitante =
        enc?.nome ||
        (senderNumber.includes('998424641')
          ? 'Joabson Nascimento'
          : 'Encarregado de Campo');

      const { data: reembolsoCriado } = await supabaseAdmin
        .from('pedidos_reembolso')
        .insert({
          tenant_id: tenantId,
          solicitante_nome: nomeSolicitante,
          solicitante_telefone: senderNumber,
          categoria,
          descricao: messageText,
          valor_solicitado: valorSolicitado,
          valor_aprovado: 0.0,
          valor_pago: 0.0,
          status: 'PENDENTE_ANALISE',
          comprovante_url: comprovanteUrl,
        })
        .select('id')
        .single();

      const textoAlertaReembolso =
        `🧾 *NOVO PEDIDO DE REEMBOLSO DE CAMPO [SIGILOSO]*\n` +
        `*Ponto Patrícia (Diária.AI)*\n` +
        `--------------------------------------\n` +
        `👤 *Solicitante:* ${nomeSolicitante} (${senderNumber})\n` +
        `🏷️ *Categoria:* ${categoria}\n` +
        `💵 *Valor Citado:* ${valorSolicitado > 0 ? `R$ ${valorSolicitado.toFixed(2)}` : 'A apurar na foto'}\n` +
        `📝 *Descrição:* ${messageText}\n` +
        (comprovanteUrl ? `📎 *Comprovante:* ${comprovanteUrl}\n` : '') +
        `\n💬 *Orientações:* Patrícia, alinhe diretamente com o ${nomeSolicitante.split(' ')[0]} para validação.\n` +
        `🔗 *Painel de Reembolsos:* ${process.env.APP_URL || 'https://diaria-ai.fly.dev'}/caixinha?secao=reembolsos\n` +
        `\n_Nota: O remetente NÃO recebeu confirmação por WhatsApp para sigilo de valores._`;

      return NextResponse.json({
        status: 'success',
        tipo: 'REEMBOLSO_REGISTRADO',
        reembolsoId: reembolsoCriado?.id,
        whatsappNotifications: [
          {
            destinatario: 'Patrícia Grubel',
            telefone: '5511978543369',
            isPrivadoEncarregado: false,
            contemValores: true,
            mensagem: textoAlertaReembolso,
          },
          {
            destinatario: 'Daniel Lopes',
            telefone: '5511988139833',
            isPrivadoEncarregado: false,
            contemValores: true,
            mensagem: textoAlertaReembolso,
          },
        ],
      });
    }

    const hojeBrasilia = getHojeBrasiliaISO();
    const horaBrasilia = new Date().toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    });

    // FEATURE 2 (V16 — EM HOMOLOGAÇÃO): Confirmação "OK" do Encarregado no Resumo Diário 19h
    if (messageText && isConfirmacaoOkEncarregado(messageText)) {
      const ff = await lerFeatureFlagsTenant(tenantId);
      if (ff.FF_RESUMO_DIARIO_19H) {
        const { data: paramHom } = await supabaseAdmin
          .from('parametros_sistema')
          .select('id, configuracoes')
          .eq('tenant_id', tenantId)
          .limit(1)
          .maybeSingle();

        const cfgs = (paramHom?.configuracoes || {}) as Record<string, unknown>;
        const homList: HomologacaoDiaria19hRecord[] = Array.isArray(
          cfgs.homologacoes_diarias_19h
        )
          ? (cfgs.homologacoes_diarias_19h as HomologacaoDiaria19hRecord[])
          : [];

        const pendenteHoje = homList.find(
          (h) =>
            h.dataIso === hojeBrasilia &&
            h.status === 'AGUARDANDO_OK' &&
            (!h.grupoJid || h.grupoJid === remoteJid)
        );

        if (pendenteHoje) {
          const { data: encOk } = await supabaseAdmin
            .from('encarregados_obras')
            .select('nome')
            .eq('tenant_id', tenantId)
            .eq('telefone_encarregado', senderNumber)
            .limit(1)
            .maybeSingle();

          const quemHomologou = normalizarNomeTrabalhadorCanonico(
            encOk?.nome || senderNumber || 'Encarregado'
          );
          pendenteHoje.status = 'HOMOLOGADO_ENCARREGADO';
          pendenteHoje.homologadoPor = quemHomologou;
          pendenteHoje.homologadoEm = new Date().toISOString();

          if (paramHom?.id) {
            await supabaseAdmin
              .from('parametros_sistema')
              .update({
                configuracoes: {
                  ...cfgs,
                  homologacoes_diarias_19h: homList,
                },
              })
              .eq('id', paramHom.id);
          }

          return NextResponse.json({
            status: 'success',
            tipo: 'RESUMO_19H_HOMOLOGADO_OK',
            obra: pendenteHoje.obraNome,
            homologadoPor: quemHomologou,
            whatsappNotifications: [],
          });
        }
      }
    }

    // FLUXO VALES ETAPA 2 & SUPRIMENTO CAIXINHA: Comprovante PIX enviado no WhatsApp
    // Ex.: "Daniel vlw bahia", "caixinha gil", ou print Nubank cortado sem pagador/horário
    if (comprovanteUrl && (empresaAtivaSlug === 'jhoston' || empresaAtivaSlug === 'intermack')) {
      const legendaPix = interpretarLegendaComprovantePix(messageText);
      const rawMsgTimestamp =
        body?.data?.messageTimestamp ?? body?.messageTimestamp ?? null;
      const remetentePushName = body?.data?.pushName || null;
      const isLegendaCaixinha =
        /\b(caixinha|suprimento|caixa\s+de\s+campo|pra\s+material|para\s+material|troco\s+obra)\b/i.test(
          messageText || ''
        );

      let leituraOcr = null;
      if (
        base64Image &&
        (legendaPix.isComprovanteVale ||
          isLegendaCaixinha ||
          !messageText ||
          messageText.length < 60)
      ) {
        try {
          leituraOcr = await analisarImagemPixComGemini({
            imagemBase64: base64Image,
            legenda: messageText,
            remetenteNome: remetentePushName,
            remetenteTelefone: senderNumber || null,
            whatsappTimestamp: rawMsgTimestamp,
          });
        } catch (errOcr) {
          console.warn('[WEBHOOK PIX OCR] Fallback para legenda:', errOcr);
        }
      }

      // A) Suprimento PIX para Caixinha de Campo (com fallback de emissor_pix e data_hora_envio)
      if (
        (isLegendaCaixinha ||
          leituraOcr?.tipoDocumento === 'SUPRIMENTO_CAIXINHA') &&
        !legendaPix.isComprovanteVale &&
        leituraOcr &&
        leituraOcr.valor > 0
      ) {
        const portadorBruto =
          leituraOcr.nomeTrabalhador ||
          leituraOcr.nomeOriginalLido ||
          'Gil';
        const portadorCanonico = normalizarNomeTrabalhadorCanonico(portadorBruto);
        const obraCaixinha = normalizarNomeObraCanonica(
          leituraOcr.obraSugerida || grupoMapeado?.obraNome || 'PISCINA PORTO SEGURO',
          empresaAtivaSlug === 'intermack' ? 'OBRA_CIVIL' : 'PISCINA'
        );
        const dataCaixinha = leituraOcr.data || hojeBrasilia;
        const horaCaixinha = leituraOcr.hora || horaBrasilia;
        const dataHoraEnvioCaixinha =
          leituraOcr.dataHoraEnvio || `${dataCaixinha}T${horaCaixinha}:00-03:00`;
        const emissorCaixinha = leituraOcr.pagador || 'Patrícia';
        const origemEmissorCaixinha =
          leituraOcr.origemPagador || 'INFERIDO_WHATSAPP';
        const origemDataHoraCaixinha =
          leituraOcr.origemDataHora || 'INFERIDO_WHATSAPP';
        const novoIdCaixinha = crypto.randomUUID();
        const descCaixinha =
          (messageText || '').trim() ||
          `Suprimento PIX Caixinha (${portadorCanonico})`;

        await supabaseAdmin
          .from('caixinha_movimentacoes')
          .insert({
            id: novoIdCaixinha,
            tenant_id: tenantId,
            encarregado_canonico: portadorCanonico,
            encarregado_origem: portadorBruto,
            obra_nome: obraCaixinha,
            data_movimentacao: dataCaixinha,
            hora_movimentacao: horaCaixinha,
            data_hora_envio: dataHoraEnvioCaixinha,
            tipo: 'ENTRADA_PIX',
            categoria: 'Suprimento PIX',
            descricao: descCaixinha,
            valor: leituraOcr.valor,
            status: 'PENDENTE',
            is_pre_implantacao: false,
            enviado_por: emissorCaixinha,
            emissor_pix: emissorCaixinha,
            origem_emissor: origemEmissorCaixinha,
            origem_data_hora: origemDataHoraCaixinha,
            comprovante_url: comprovanteUrl,
          })
          .then(({ error }) => {
            if (error) console.warn('[WEBHOOK CAIXINHA SQL]:', error.message);
          });

        return NextResponse.json({
          status: 'success',
          tipo: 'CAIXINHA_PIX_INGESTAO',
          portador: portadorCanonico,
          emissorPix: emissorCaixinha,
          origemEmissor: origemEmissorCaixinha,
          dataHoraEnvio: dataHoraEnvioCaixinha,
          origemDataHora: origemDataHoraCaixinha,
          valor: leituraOcr.valor,
          comprovanteUrl,
          whatsappNotifications: [],
        });
      }

      const isComprovanteVale =
        empresaAtivaSlug === 'jhoston' &&
        (legendaPix.isComprovanteVale ||
          leituraOcr?.tipoDocumento === 'COMPROVANTE_PIX_VALE');
      const nomeValePix =
        legendaPix.nomeTrabalhador || leituraOcr?.nomeTrabalhador || null;

      if (isComprovanteVale && nomeValePix) {
        const nomeCanonico = normalizarNomeTrabalhadorCanonico(nomeValePix);
        const valorConfirmado =
          leituraOcr && leituraOcr.valor > 0
            ? leituraOcr.valor
            : legendaPix.valorSugerido || 100.0;
        const dataConfirmacao = leituraOcr?.data || hojeBrasilia;

        // Tenta parear com uma solicitação aberta (Etapa 1: SOLICITADO) do mesmo trabalhador no tenant
        const { data: pendentesVale } = await supabaseAdmin
          .from('lancamentos_financeiros')
          .select('id, nome_trabalhador, valor_monetario')
          .eq('tenant_id', tenantId)
          .eq('tipo_lancamento', 'VALE')
          .eq('status', 'PENDENTE')
          .order('created_at', { ascending: false });

        const solicitacaoAberta = (
          (pendentesVale as Array<{
            id: string;
            nome_trabalhador: string;
            valor_monetario: number | string;
          }> | null) || []
        ).find(
          (v) =>
            normalizarNomeTrabalhadorCanonico(v.nome_trabalhador).toUpperCase() ===
            nomeCanonico.toUpperCase()
        );

        const agoraEnvioIso = new Date().toISOString();
        const pagadorPix = leituraOcr?.pagador || 'Patrícia Grubel';

        if (solicitacaoAberta) {
          const { error: errUpdV15 } = await supabaseAdmin
            .from('lancamentos_financeiros')
            .update({
              valor_monetario: valorConfirmado,
              status: 'VALIDADO',
              vale_etapa: 'CONCILIADO',
              aprovado_por: pagadorPix,
              pago_por: pagadorPix,
              data_hora_envio_efetivo: agoraEnvioIso,
              comprovante_url: comprovanteUrl,
              comprovante_pix_url: comprovanteUrl,
              observacao: `Vale pareado via PIX (${messageText || 'Comprovante OCR'})`,
              updated_at: agoraEnvioIso,
            })
            .eq('tenant_id', tenantId)
            .eq('id', solicitacaoAberta.id);

          if (errUpdV15) {
            await supabaseAdmin
              .from('lancamentos_financeiros')
              .update({
                valor_monetario: valorConfirmado,
                status: 'VALIDADO',
                vale_etapa: 'CONCILIADO',
                pago_por: pagadorPix,
                comprovante_url: comprovanteUrl,
                comprovante_pix_url: comprovanteUrl,
                observacao: `Vale pareado via PIX (${messageText || 'Comprovante OCR'})`,
                updated_at: agoraEnvioIso,
              })
              .eq('tenant_id', tenantId)
              .eq('id', solicitacaoAberta.id);
          }
        } else {
          const obraSugerida = normalizarNomeObraCanonica(
            leituraOcr?.obraSugerida || legendaPix.obraSugerida || 'PISCINA PORTO SEGURO',
            'PISCINA'
          );
          const { data: obraMatch } = await supabaseAdmin
            .from('obras_config')
            .select('id')
            .eq('tenant_id', tenantId)
            .ilike('nome', obraSugerida)
            .limit(1)
            .maybeSingle();

          const dataHoraSolIso = `${dataConfirmacao}T${horaBrasilia}:00-03:00`;
          const { gerarChaveIdempotenciaVale } = await import('@/lib/valeIdempotencia');
          const chaveIdempotenciaPix = gerarChaveIdempotenciaVale({
            tenantId,
            trabalhador: nomeCanonico,
            dataReferencia: dataConfirmacao,
            janelaSolicitacao: horaBrasilia,
            valor: valorConfirmado,
          });

          const { data: valeJaExistentePix } = await supabaseAdmin
            .from('lancamentos_financeiros')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('chave_idempotencia', chaveIdempotenciaPix)
            .neq('status', 'DESCARTADO')
            .limit(1)
            .maybeSingle();

          if (valeJaExistentePix?.id) {
            await supabaseAdmin
              .from('lancamentos_financeiros')
              .update({
                status: 'VALIDADO',
                vale_etapa: 'CONCILIADO',
                comprovante_url: comprovanteUrl,
                comprovante_pix_url: comprovanteUrl,
                aprovado_por: pagadorPix,
                pago_por: pagadorPix,
                data_hora_envio_efetivo: agoraEnvioIso,
                updated_at: agoraEnvioIso,
              })
              .eq('tenant_id', tenantId)
              .eq('id', valeJaExistentePix.id);
          } else {
            const { error: errInsV15 } = await supabaseAdmin
              .from('lancamentos_financeiros')
              .insert({
                tenant_id: tenantId,
                obra_id: obraMatch?.id || null,
                nome_trabalhador: nomeCanonico,
                tipo_lancamento: 'VALE',
                fracao_dia: 0,
                valor_monetario: valorConfirmado,
                status: 'VALIDADO',
                data_referencia: dataConfirmacao,
                observacao: `Vale confirmado via PIX WhatsApp (${messageText || 'OCR'})`,
                comprovante_url: comprovanteUrl,
                comprovante_pix_url: comprovanteUrl,
                vale_etapa: 'CONCILIADO',
                solicitado_por: 'Gilvan - Gil',
                data_hora_solicitacao: dataHoraSolIso,
                aprovado_por: pagadorPix,
                pago_por: pagadorPix,
                data_hora_envio_efetivo: agoraEnvioIso,
                mensagem_origem_id: messageId,
                horario_origem: horaBrasilia,
                chave_idempotencia: chaveIdempotenciaPix,
              });

            if (errInsV15) {
              await supabaseAdmin.from('lancamentos_financeiros').insert({
                tenant_id: tenantId,
                obra_id: obraMatch?.id || null,
                nome_trabalhador: nomeCanonico,
                tipo_lancamento: 'VALE',
                fracao_dia: 0,
                valor_monetario: valorConfirmado,
                status: 'VALIDADO',
                data_referencia: dataConfirmacao,
                observacao: `Vale confirmado via PIX WhatsApp (${messageText || 'OCR'})`,
                comprovante_url: comprovanteUrl,
                comprovante_pix_url: comprovanteUrl,
                vale_etapa: 'CONCILIADO',
                solicitado_por: 'Gilvan - Gil',
                pago_por: pagadorPix,
                mensagem_origem_id: messageId,
                horario_origem: horaBrasilia,
              });
            }
          }
        }

        return NextResponse.json({
          status: 'success',
          tipo: 'VALE_PIX_CONCILIADO',
          trabalhador: nomeCanonico,
          valor: valorConfirmado,
          pareadoComSolicitacao: Boolean(solicitacaoAberta),
          comprovanteUrl,
          whatsappNotifications: [],
        });
      }
    }

    // Extração NLP isolada pelo tenantId resolvido + contexto do remetente para aprendizado contínuo
    const extracao = await extrairDadosMensagem(messageText, tenantId, {
      remetenteTelefone: senderNumber || null,
      remetenteNome: body?.data?.pushName || null,
    });

    // Enriquecimento determinístico para pedidos naturais e complementares encadeados de vale (Prompt 11)
    // Ex.: Msg 1: "Uma vale pra o Mateus por favor." | Msg 2: "Pra o Daniel e o Ian também por favor. Vale."
    const valesNaturais = extrairPedidosValeNaturais(messageText, remoteJid);
    if (valesNaturais.length > 0 && empresaAtivaSlug === 'jhoston') {
      const ctxAnterior = obterContextoSolicitacaoVale(remoteJid);
      if (extracao.obras.length === 0) {
        extracao.obras.push({
          nome_obra: ctxAnterior?.obra || 'PISCINA PORTO SEGURO',
          data_referencia: ctxAnterior?.dataReferencia || hojeBrasilia,
          apontamentos: [],
          vales: [],
          setup: false,
        });
      }
      const alvoObra = extracao.obras[0];
      const existentesSet = new Set(
        (alvoObra.vales || []).map((v) =>
          normalizarNomeTrabalhadorCanonico(v.nome).toUpperCase()
        )
      );
      for (const vn of valesNaturais) {
        if (!existentesSet.has(vn.nomeTrabalhador.toUpperCase())) {
          alvoObra.vales = [
            ...(alvoObra.vales || []),
            { nome: vn.nomeTrabalhador, valor: vn.valor },
          ];
          existentesSet.add(vn.nomeTrabalhador.toUpperCase());
        }
      }

      registrarContextoSolicitacaoVale(remoteJid, {
        solicitadoPor: senderNumber || 'Gil',
        obra: normalizarNomeObraCanonica(alvoObra.nome_obra || ctxAnterior?.obra),
        dataReferencia: alvoObra.data_referencia || hojeBrasilia,
        valorPadrao: valesNaturais[0]?.valor || 100.0,
      });
    }

    let ultimoLoteId: string | undefined = undefined;
    const primeiroTokenAprovacao = crypto.randomBytes(24).toString('hex');

    for (let idxObra = 0; idxObra < extracao.obras.length; idxObra++) {
      const obra = extracao.obras[idxObra];
      // Token único por bloco de obra (impede colisão UNIQUE em mensagens multi-obra 0,5 + 0,5)
      const tokenAprovacaoBloco =
        idxObra === 0
          ? primeiroTokenAprovacao
          : crypto.randomBytes(24).toString('hex');

      const nomeObraBruto =
        empresaAtivaSlug === 'intermack' && grupoMapeado?.obraNome
          ? grupoMapeado.obraNome
          : obra.nome_obra || grupoMapeado?.obraNome || 'PORTO SEGURO';

      const tipoObraInferido = inferirTipoObra(nomeObraBruto, empresaAtivaSlug);
      const nomeObraFinal = normalizarNomeObraCanonica(
        nomeObraBruto,
        tipoObraInferido
      );

      // 1. Localizar ou registrar obra no tenant ativo
      let obraId: string | null = null;
      const { data: obraExata } = await supabaseAdmin
        .from('obras_config')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('nome', nomeObraFinal)
        .limit(1)
        .maybeSingle();

      if (obraExata?.id) {
        obraId = obraExata.id;
      } else {
        const { data: novaObra } = await supabaseAdmin
          .from('obras_config')
          .insert({
            tenant_id: tenantId,
            nome: nomeObraFinal,
            local:
              grupoMapeado?.ambiente === 'INTERNO'
                ? 'Reforma Interna (Apto)'
                : 'Canteiro de Obras',
            tipo_obra: tipoObraInferido,
          })
          .select('id')
          .single();
        obraId = novaObra?.id || null;
      }

      // 2. Criar lote de ponto com Carimbo Temporal & Metadados Periciais
      const agoraBrasilia = new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      });
      const dataRefLote = obra.data_referencia || hojeBrasilia;
      const sha256Pericial = crypto
        .createHash('sha256')
        .update(`${senderNumber}|${remoteJid}|${messageText}|${agoraBrasilia}`)
        .digest('hex');

      const cabecalhoPericial =
        `[ORIGEM_WHATSAPP]\n` +
        `Remetente: ${senderNumber}\n` +
        `Grupo/JID: ${remoteJid}\n` +
        `Timestamp: ${agoraBrasilia}\n` +
        `SHA256: ${sha256Pericial}\n` +
        `[MENSAGEM_ORIGINAL]\n${messageText}`;

      const { data: lote } = await supabaseAdmin
        .from('ponto_lote')
        .insert({
          tenant_id: tenantId,
          obra_id: obraId,
          data_referencia: dataRefLote,
          texto_original: cabecalhoPericial,
          status_validacao: 'PENDENTE',
          token_aprovacao: tokenAprovacaoBloco,
        })
        .select('id')
        .single();

      const loteId = lote?.id;
      if (loteId) ultimoLoteId = loteId;

      // 3. Registrar detalhes de ponto com cálculo hierárquico e isolamento de ciclos pós-quitação
      if (loteId && obra.apontamentos?.length) {
        const { data: pontosAbertosDia } = await supabaseAdmin
          .from('lancamentos_financeiros')
          .select('nome_trabalhador, fracao_dia, obra_id, status')
          .eq('tenant_id', tenantId)
          .eq('tipo_lancamento', 'PONTO')
          .eq('data_referencia', dataRefLote)
          .in('status', ['PENDENTE', 'VALIDADO']);

        const listaAbertos = (pontosAbertosDia as PontoAbertoDiaRow[] | null) || [];

        for (const ap of obra.apontamentos) {
          const nomeExibicao = ap.nome.trim() || normalizarNomeTrabalhadorCanonico(ap.nome);
          const nomeCanonico = normalizarNomeTrabalhadorCanonico(nomeExibicao);
          const nomeChave = nomeCanonico.toUpperCase();
          const fracaoAp = Number(ap.fracao ?? 1.0);

          const somaFracoesAbertas = listaAbertos
            .filter(
              (p) =>
                normalizarNomeTrabalhadorCanonico(p.nome_trabalhador).toUpperCase() ===
                nomeChave
            )
            .reduce((acc, p) => acc + (Number(p.fracao_dia) || 0), 0);

          if (somaFracoesAbertas + fracaoAp > 1.0 + 1e-6) {
            console.warn(
              `[DUPLICIDADE BLOQUEADA - CICLO ABERTO] ${nomeCanonico} já possui ${somaFracoesAbertas} diária(s) em aberto em ${dataRefLote}.`
            );
            continue;
          }

          const calculo = await calcularValorDiariaCanteiro({
            tenantId,
            nomeTrabalhador: nomeCanonico,
            obraId,
            nomeObra: nomeObraFinal,
            tipoObra: tipoObraInferido,
            fracao: fracaoAp,
            motivo: ap.motivo,
          });

          await supabaseAdmin.from('ponto_detalhe').insert({
            tenant_id: tenantId,
            ponto_lote_id: loteId,
            nome_trabalhador: nomeExibicao,
            fracao_dia: fracaoAp,
            motivo_excecao: ap.motivo || null,
          });

          await supabaseAdmin.from('lancamentos_financeiros').insert({
            tenant_id: tenantId,
            obra_id: obraId,
            nome_trabalhador: nomeExibicao,
            tipo_lancamento: 'PONTO',
            fracao_dia: fracaoAp,
            valor_monetario:
              empresaAtivaSlug === 'intermack' ? 0 : calculo.valorFinal,
            status: 'PENDENTE',
            data_referencia: dataRefLote,
            observacao: ap.motivo
              ? `${ap.motivo} | ${calculo.descricaoRegra}`
              : calculo.descricaoRegra,
            ponto_lote_id: loteId,
            comprovante_url: null,
            mensagem_origem_id: messageId,
            horario_origem: horaBrasilia,
          });

          listaAbertos.push({
            nome_trabalhador: nomeCanonico,
            fracao_dia: fracaoAp,
            obra_id: obraId,
            status: 'PENDENTE',
          });
        }
      }

      // 4. Registrar vales em 2 etapas com rastreabilidade completa (solicitado_por / vale_etapa / horário)
      if (obra.vales?.length) {
        const { data: encSolicitante } = await supabaseAdmin
          .from('encarregados_obras')
          .select('nome')
          .eq('tenant_id', tenantId)
          .eq('telefone_encarregado', senderNumber)
          .limit(1)
          .maybeSingle();

        const nomeSolicitanteVale =
          encSolicitante?.nome || senderNumber || 'Gil';

        const { gerarChaveIdempotenciaVale } = await import('@/lib/valeIdempotencia');
        for (const vale of obra.vales) {
          const nomeValeCanonico = normalizarNomeTrabalhadorCanonico(vale.nome);
          const valorVale = Number(vale.valor) > 0 ? Number(vale.valor) : 100.0;
          const dataHoraSolicitacao = `${dataRefLote}T${horaBrasilia}:00-03:00`;
          const agoraIsoVale = new Date().toISOString();
          const chaveIdempotenciaVale = gerarChaveIdempotenciaVale({
            tenantId,
            trabalhador: nomeValeCanonico,
            dataReferencia: dataRefLote,
            janelaSolicitacao: horaBrasilia,
            valor: valorVale,
          });

          const { data: valeJaExiste } = await supabaseAdmin
            .from('lancamentos_financeiros')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('chave_idempotencia', chaveIdempotenciaVale)
            .neq('status', 'DESCARTADO')
            .limit(1)
            .maybeSingle();

          if (valeJaExiste?.id) {
            if (comprovanteUrl) {
              await supabaseAdmin
                .from('lancamentos_financeiros')
                .update({
                  status: 'VALIDADO',
                  vale_etapa: 'CONCILIADO',
                  comprovante_url: comprovanteUrl,
                  comprovante_pix_url: comprovanteUrl,
                  aprovado_por: 'Patrícia Grubel',
                  pago_por: 'Patrícia Grubel',
                  data_hora_envio_efetivo: agoraIsoVale,
                  updated_at: agoraIsoVale,
                })
                .eq('tenant_id', tenantId)
                .eq('id', valeJaExiste.id);
            }
            continue;
          }

          const { error: errValeV15 } = await supabaseAdmin
            .from('lancamentos_financeiros')
            .insert({
              tenant_id: tenantId,
              obra_id: obraId,
              nome_trabalhador: nomeValeCanonico,
              tipo_lancamento: 'VALE',
              fracao_dia: 0,
              valor_monetario: valorVale,
              status: comprovanteUrl ? 'VALIDADO' : 'PENDENTE',
              data_referencia: dataRefLote,
              observacao: comprovanteUrl
                ? 'Vale confirmado com comprovante PIX via WhatsApp'
                : Number(vale.valor) > 0
                  ? 'Solicitação de Vale via WhatsApp (aguardando envio PIX)'
                  : 'Solicitação de Vale via WhatsApp (Padrão R$ 100,00 — aguardando envio PIX)',
              ponto_lote_id: loteId,
              comprovante_url: comprovanteUrl,
              comprovante_pix_url: comprovanteUrl,
              vale_etapa: comprovanteUrl ? 'CONCILIADO' : 'SOLICITADO',
              solicitado_por: nomeSolicitanteVale,
              data_hora_solicitacao: dataHoraSolicitacao,
              aprovado_por: comprovanteUrl ? 'Patrícia Grubel' : null,
              pago_por: comprovanteUrl ? 'Patrícia Grubel' : null,
              data_hora_envio_efetivo: comprovanteUrl ? agoraIsoVale : null,
              mensagem_origem_id: messageId,
              horario_origem: horaBrasilia,
              chave_idempotencia: chaveIdempotenciaVale,
            });

          if (errValeV15) {
            await supabaseAdmin.from('lancamentos_financeiros').insert({
              tenant_id: tenantId,
              obra_id: obraId,
              nome_trabalhador: nomeValeCanonico,
              tipo_lancamento: 'VALE',
              fracao_dia: 0,
              valor_monetario: valorVale,
              status: comprovanteUrl ? 'VALIDADO' : 'PENDENTE',
              data_referencia: dataRefLote,
              observacao: comprovanteUrl
                ? 'Vale confirmado com comprovante PIX via WhatsApp'
                : Number(vale.valor) > 0
                  ? 'Solicitação de Vale via WhatsApp (aguardando envio PIX)'
                  : 'Solicitação de Vale via WhatsApp (Padrão R$ 100,00 — aguardando envio PIX)',
              ponto_lote_id: loteId,
              comprovante_url: comprovanteUrl,
              comprovante_pix_url: comprovanteUrl,
              vale_etapa: comprovanteUrl ? 'CONCILIADO' : 'SOLICITADO',
              solicitado_por: nomeSolicitanteVale,
              pago_por: comprovanteUrl ? 'Patrícia Grubel' : null,
              mensagem_origem_id: messageId,
              horario_origem: horaBrasilia,
            });
          }
        }
      } else if (comprovanteUrl) {
        await supabaseAdmin.from('lancamentos_financeiros').insert({
          tenant_id: tenantId,
          obra_id: obraId,
          nome_trabalhador: 'A Identificar (Foto de Recibo)',
          tipo_lancamento: 'VALE',
          fracao_dia: 0,
          valor_monetario: 0.0,
          status: 'PENDENTE',
          data_referencia: dataRefLote,
          observacao: 'Comprovante/Recibo enviado via WhatsApp',
          ponto_lote_id: loteId,
          comprovante_url: comprovanteUrl,
          comprovante_pix_url: comprovanteUrl,
          vale_etapa: 'PIX_ENVIADO',
          mensagem_origem_id: messageId,
          horario_origem: horaBrasilia,
        });
      }
    }

    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://diaria-ai.fly.dev';
    const validationUrl = `${appUrl}/validacoes?token=${primeiroTokenAprovacao}`;

    const primeiraObra = extracao.obras?.[0];
    const todosMotivos = (primeiraObra?.apontamentos || []).map((a) =>
      (a.motivo || '').toUpperCase()
    );
    let tipoEvento: 'VIAGEM' | 'CHUVA' | 'MEIO_PERIODO' | 'NORMAL' = 'NORMAL';

    if (todosMotivos.some((m) => m.includes('VIAGEM'))) {
      tipoEvento = 'VIAGEM';
    } else if (todosMotivos.some((m) => m.includes('CHUVA'))) {
      tipoEvento = 'CHUVA';
    } else if (
      todosMotivos.some(
        (m) => m.includes('MEIO_PERIODO') || m.includes('MEIO DIA')
      )
    ) {
      tipoEvento = 'MEIO_PERIODO';
    }

    const colaboradoresNomes = (primeiraObra?.apontamentos || []).map((a) =>
      normalizarNomeTrabalhadorCanonico(a.nome)
    );
    const colaboradoresComStatus = (primeiraObra?.apontamentos || []).map((a) => ({
      nome: normalizarNomeTrabalhadorCanonico(a.nome),
      status: a.motivo
        ? a.motivo
        : a.fracao === 0.5
          ? 'Meio Período'
          : 'Integral',
    }));
    const obraNome = normalizarNomeObraCanonica(
      primeiraObra?.nome_obra || 'CANTEIRO DE OBRAS'
    );
    const dataRef = primeiraObra?.data_referencia || hojeBrasilia;

    const valesList = primeiraObra?.vales || [];
    const totalValesMonetario = valesList.reduce(
      (acc, v) => acc + (Number(v.valor) || 0),
      0
    );

    const ticketEncarregadoTexto = formatarTicketEncarregado({
      obra: obraNome,
      dataReferencia: dataRef,
      colaboradores: colaboradoresComStatus,
      valesQtd: valesList.length,
      loteId: ultimoLoteId,
    });

    const ticketAdmin = formatarTicketFinanceiroAdministracao({
      obra: obraNome,
      dataReferencia: dataRef,
      encarregadoTelefone: senderNumber,
      totalColaboradores: colaboradoresNomes.length,
      colaboradoresNomes,
      totalValesMonetario,
      valesDetalhados: valesList.map((v) => ({
        nome: normalizarNomeTrabalhadorCanonico(v.nome),
        valor: Number(v.valor) || 100,
      })),
      tipoEvento,
      linkAcao: validationUrl,
    });

    const notificacoesFinais = [
      {
        destinatario: 'Encarregado da Obra',
        telefone: senderNumber,
        isPrivadoEncarregado: true,
        contemValores: false,
        mensagem: ticketEncarregadoTexto,
      },
      ...ticketAdmin.destinatarios.map((dest) => ({
        destinatario: dest.nome,
        telefone: dest.telefone,
        isPrivadoEncarregado: false,
        contemValores: true,
        mensagem: ticketAdmin.texto,
      })),
    ];

    return NextResponse.json({
      status: 'success',
      messageId,
      extracao,
      comprovanteUrl,
      validationUrl,
      whatsappNotifications: notificacoesFinais,
    });
  } catch (error) {
    console.error('Erro no processamento do webhook WhatsApp:', error);
    return NextResponse.json(
      { error: 'Erro interno no webhook.' },
      { status: 500 }
    );
  }
}
