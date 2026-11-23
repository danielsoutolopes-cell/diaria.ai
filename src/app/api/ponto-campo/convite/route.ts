import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isDanielOuPatricia } from '@/lib/tenant';
import { iniciarOuObterBaileys } from '@/lib/whatsapp';
import { lerEstadosFeatureFlagsTenant } from '@/services/featureFlagsStorage';
import { JHOSTON_TENANT_ID } from '@/lib/pontoCampo';

export const dynamic = 'force-dynamic';

function verificarAdmin(req: NextRequest): boolean {
  const rawUser = req.cookies.get('diaria_user')?.value
    ? decodeURIComponent(req.cookies.get('diaria_user')?.value || '')
    : 'Patrícia Grubel';
  return isDanielOuPatricia(rawUser);
}

function normalizarTelefoneBrasil(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('55') && digitos.length >= 12) return digitos;
  return `55${digitos}`;
}

export async function GET(req: NextRequest) {
  if (!verificarAdmin(req)) {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });
  }

  const [estados, resFuncs] = await Promise.all([
    lerEstadosFeatureFlagsTenant(JHOSTON_TENANT_ID),
    supabaseAdmin
      .from('funcionarios_obra')
      .select('id, nome_trabalhador, telefone')
      .eq('tenant_id', JHOSTON_TENANT_ID)
      .eq('ativo', true)
      .order('nome_trabalhador', { ascending: true }),
  ]);

  const emHomologacao = estados.FF_PWA_PONTO_CAMPO === 'HOMOLOGACAO';
  const contatos = (resFuncs.data || []).map((f) => ({
    id: String(f.id),
    nome: String(f.nome_trabalhador),
    telefone: f.telefone ? String(f.telefone) : '',
  }));

  return NextResponse.json({
    success: true,
    estado: estados.FF_PWA_PONTO_CAMPO,
    pinVigente: emHomologacao ? '0000' : '1234',
    contatos,
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!verificarAdmin(req)) {
      return NextResponse.json(
        { error: 'Envio de convite exclusivo de Patrícia e Daniel.' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      destino?: string;
      nomeResponsavel?: string;
    };
    const destinoBruto = String(body.destino || '').trim();
    const nomeResp = String(body.nomeResponsavel || 'Diego').trim();

    if (!destinoBruto) {
      return NextResponse.json(
        { error: 'Informe um número de WhatsApp ou selecione no dropdown.' },
        { status: 400 }
      );
    }

    const estados = await lerEstadosFeatureFlagsTenant(JHOSTON_TENANT_ID);
    const emHomologacao = estados.FF_PWA_PONTO_CAMPO === 'HOMOLOGACAO';
    const pinVigente = emHomologacao ? '0000' : '1234';
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'https://diaria-ai.fly.dev';
    const linkPwa = `${baseUrl.replace(/\/$/, '')}/ponto`;

    const mensagemPronta = [
      `📲 *Ponto de Campo — Jhoston*${emHomologacao ? ' *(EM HOMOLOGAÇÃO)*' : ''}`,
      '',
      `Olá, *${nomeResp}*! Segue o acesso ao aplicativo de marcação de ponto e relatório semanal:`,
      `🔗 *Link:* ${linkPwa}`,
      `🔑 *PIN de Acesso:* *${pinVigente}*${emHomologacao ? ' _(senha temporária de homologação)_' : ''}`,
      '',
      '✅ *Regras básicas de uso:*',
      '1. Abra o link no celular e toque em *Adicionar à tela inicial* para instalar como app.',
      '2. Entre com seu nome + PIN e ative a *Digital / Face ID* para entrar em 1 toque.',
      '3. Marque o ponto diário da obra (funciona mesmo sem sinal).',
      '4. Envie o *Relatório Semanal com 3 fotos* até toda *quinta-feira*.',
    ].join('\n');

    let enviadoWhatsapp = false;
    const telefoneNorm = normalizarTelefoneBrasil(destinoBruto);
    if (telefoneNorm.length >= 12) {
      try {
        const wa = await iniciarOuObterBaileys();
        const sock = global.__baileysSocket;
        if (wa.status === 'CONNECTED' && sock) {
          await sock.sendMessage(`${telefoneNorm}@s.whatsapp.net`, {
            text: mensagemPronta,
          });
          enviadoWhatsapp = true;
        }
      } catch (err) {
        console.warn('[ponto-campo/convite] Falha ao enviar via Baileys:', err);
      }
    }

    return NextResponse.json({
      success: true,
      enviadoWhatsapp,
      pinVigente,
      mensagemPronta,
      message: enviadoWhatsapp
        ? `Convite enviado no WhatsApp (${destinoBruto}) com PIN ${pinVigente}!`
        : `Mensagem pronta gerada com PIN ${pinVigente} (copie ou envie pelo WhatsApp).`,
    });
  } catch (err) {
    console.error('[ponto-campo/convite POST]', err);
    return NextResponse.json(
      { error: 'Erro ao gerar/enviar convite.' },
      { status: 500 }
    );
  }
}
