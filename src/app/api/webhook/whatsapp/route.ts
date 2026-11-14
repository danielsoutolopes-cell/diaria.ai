import { NextRequest, NextResponse } from 'next/server';
import { extrairDadosMensagem } from '@/lib/gemini';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadToR2 } from '@/services/r2Storage';
import crypto from 'crypto';

// Mutex em memória para evitar concorrência e mensagens duplicadas do WhatsApp
const processedMessageIds = new Set<string>();
const processingLocks = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Compatível com Baileys / Evolution API v2 / Webhook padrão
    const messageId = body?.data?.key?.id || body?.messageId || body?.id || `msg-${Date.now()}`;
    const remoteJid = body?.data?.key?.remoteJid || body?.from || '';
    const senderNumber = remoteJid.replace(/[^0-9]/g, '');

    // Detecção de foto / recibo (imageMessage)
    const imageMessage =
      body?.data?.message?.imageMessage ||
      body?.message?.imageMessage ||
      body?.imageMessage;

    const base64Image =
      body?.data?.base64 ||
      body?.base64 ||
      body?.data?.message?.imageMessage?.jpegThumbnail;

    const imageMediaUrl =
      body?.data?.mediaUrl ||
      body?.mediaUrl ||
      body?.url;

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
      body?.message ||
      (comprovanteUrl ? 'Comprovante de vale anexado' : '');

    if (!messageText && !comprovanteUrl) {
      return NextResponse.json({ status: 'ignored', reason: 'Mensagem sem texto ou anexo.' });
    }

    // Trava de deduplicação (Mutex)
    if (processedMessageIds.has(messageId)) {
      return NextResponse.json({ status: 'duplicate', messageId });
    }

    const now = Date.now();
    const lockTime = processingLocks.get(remoteJid);
    if (lockTime && now - lockTime < 3000) {
      return NextResponse.json({ status: 'locked', reason: 'Aguarde processamento anterior.' }, { status: 429 });
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

    // Processamento via Gemini AI (Extração Multi-Contexto)
    const extracao = await extrairDadosMensagem(messageText);

    // Gerar token de aprovação seguro para o link mágico do WhatsApp da Patrícia
    const tokenAprovacao = crypto.randomBytes(24).toString('hex');
    const tenantId = '00000000-0000-0000-0000-000000000001'; // Default tenant

    // Salvar no Supabase
    for (const obra of extracao.obras) {
      // 1. Localizar ou registrar obra
      let obraId: string | null = null;
      const { data: obraExistente } = await supabaseAdmin
        .from('obras_config')
        .select('id')
        .ilike('nome', `%${obra.nome_obra}%`)
        .limit(1)
        .single();

      if (obraExistente?.id) {
        obraId = obraExistente.id;
      } else {
        const { data: novaObra } = await supabaseAdmin
          .from('obras_config')
          .insert({
            tenant_id: tenantId,
            nome: obra.nome_obra.toUpperCase(),
            local: 'Canteiro Volante',
            tipo_obra: 'PISCINA',
          })
          .select('id')
          .single();
        obraId = novaObra?.id || null;
      }

      // 2. Criar lote de ponto
      const { data: lote } = await supabaseAdmin
        .from('ponto_lote')
        .insert({
          tenant_id: tenantId,
          obra_id: obraId,
          texto_original: messageText,
          status_validacao: 'PENDENTE',
          token_aprovacao: tokenAprovacao,
        })
        .select('id')
        .single();

      const loteId = lote?.id;

      // 3. Registrar detalhes de ponto
      if (loteId && obra.apontamentos?.length) {
        for (const ap of obra.apontamentos) {
          await supabaseAdmin.from('ponto_detalhe').insert({
            tenant_id: tenantId,
            ponto_lote_id: loteId,
            nome_trabalhador: ap.nome,
            fracao_dia: ap.fracao,
            motivo_excecao: ap.motivo || null,
          });

          await supabaseAdmin.from('lancamentos_financeiros').insert({
            tenant_id: tenantId,
            obra_id: obraId,
            nome_trabalhador: ap.nome,
            tipo_lancamento: 'PONTO',
            fracao_dia: ap.fracao,
            valor_monetario: 0.0,
            status: 'PENDENTE',
            data_referencia: new Date().toISOString().split('T')[0],
            observacao: ap.motivo || 'Apontamento via WhatsApp Bot',
            ponto_lote_id: loteId,
            comprovante_url: null,
          });
        }
      }

      // 4. Registrar vales com o comprovante_url do Cloudflare R2
      if (obra.vales?.length) {
        for (const vale of obra.vales) {
          await supabaseAdmin.from('lancamentos_financeiros').insert({
            tenant_id: tenantId,
            obra_id: obraId,
            nome_trabalhador: vale.nome,
            tipo_lancamento: 'VALE',
            fracao_dia: 0,
            valor_monetario: vale.valor,
            status: 'PENDENTE',
            data_referencia: new Date().toISOString().split('T')[0],
            observacao: 'Adiantamento de Vale via WhatsApp Bot',
            ponto_lote_id: loteId,
            comprovante_url: comprovanteUrl,
          });
        }
      } else if (comprovanteUrl) {
        // Se enviou foto de recibo sem o NLP extrair valor explícito, registra lançamento pendente com o comprovante
        await supabaseAdmin.from('lancamentos_financeiros').insert({
          tenant_id: tenantId,
          obra_id: obraId,
          nome_trabalhador: 'A Identificar (Foto de Recibo)',
          tipo_lancamento: 'VALE',
          fracao_dia: 0,
          valor_monetario: 0.0,
          status: 'PENDENTE',
          data_referencia: new Date().toISOString().split('T')[0],
          observacao: 'Comprovante/Recibo enviado via WhatsApp',
          ponto_lote_id: loteId,
          comprovante_url: comprovanteUrl,
        });
      }
    }

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://diaria-ai.onrender.com';
    const validationUrl = `${appUrl}/validacoes?token=${tokenAprovacao}`;

    return NextResponse.json({
      status: 'success',
      messageId,
      extracao,
      comprovanteUrl,
      validationUrl,
      whatsappNotification: {
        destinatario: 'Patrícia (Admin)',
        mensagem: `🚨 *Novo Apontamento Pendente*\nRecebido de: ${senderNumber}\n${comprovanteUrl ? `📎 Recibo Anexado: ${comprovanteUrl}\n` : ''}Link de Validação: ${validationUrl}`,
      },
    });
  } catch (error) {
    console.error('Erro no processamento do webhook WhatsApp:', error);
    return NextResponse.json({ error: 'Erro interno no webhook.' }, { status: 500 });
  }
}
