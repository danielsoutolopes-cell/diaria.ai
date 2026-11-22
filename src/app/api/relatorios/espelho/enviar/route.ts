import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import {
  gerarPdfEspelhoBase64,
  gerarPdfCalendarioBase64,
  type LinhaEspelhoPDF,
} from '@/lib/pdfEspelho';
import { uploadToR2 } from '@/services/r2Storage';

export const dynamic = 'force-dynamic';

export interface DestinatarioWhatsApp {
  nome: string;
  telefone: string;
  papel: 'ADMIN' | 'ENCARREGADO' | 'COLABORADOR';
  podeVerValores: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const lista: DestinatarioWhatsApp[] = [
      {
        nome: 'Patrícia Grubel (Admin)',
        telefone: '5511978543369',
        papel: 'ADMIN',
        podeVerValores: true,
      },
      {
        nome: 'Daniel Lopes (Diretoria)',
        telefone: '5511988139833',
        papel: 'ADMIN',
        podeVerValores: true,
      },
    ];

    const vistos = new Set<string>(lista.map((d) => d.telefone));

    // Puxar encarregados isolados por tenant_id
    const { data: encs } = await supabaseAdmin
      .from('encarregados_obras')
      .select('nome, telefone_encarregado')
      .eq('tenant_id', activeTenant.id)
      .eq('ativo', true);

    for (const e of encs || []) {
      const tel = String(e.telefone_encarregado || '').replace(/\D/g, '');
      if (!tel || vistos.has(tel)) continue;
      vistos.add(tel);
      lista.push({
        nome: `${e.nome || 'Encarregado'} (Encarregado)`,
        telefone: tel,
        papel: 'ENCARREGADO',
        podeVerValores: false,
      });
    }

    // Puxar funcionários com telefone cadastrado isolados por tenant_id
    const { data: funcs } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('nome_trabalhador, telefone')
      .eq('tenant_id', activeTenant.id)
      .eq('ativo', true);

    for (const f of funcs || []) {
      const tel = String(f.telefone || '').replace(/\D/g, '');
      if (!tel || vistos.has(tel)) continue;
      vistos.add(tel);
      lista.push({
        nome: String(f.nome_trabalhador || 'Colaborador'),
        telefone: tel,
        papel: 'COLABORADOR',
        podeVerValores: false,
      });
    }

    return NextResponse.json({ destinatarios: lista });
  } catch (error) {
    console.error('Erro em GET /api/relatorios/espelho/enviar:', error);
    return NextResponse.json({ destinatarios: [] }, { status: 500 });
  }
}

interface EnviarEspelhoBody {
  telefone: string;
  nomeDestinatario?: string;
  podeVerValores?: boolean;
  tipoRelatorio?: 'ESPELHO' | 'CALENDARIO';
  mes: string;
  diasNoMes: number;
  linhas: LinhaEspelhoPDF[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EnviarEspelhoBody;
    const telLimpo = String(body.telefone || '').replace(/\D/g, '');
    if (!telLimpo) {
      return NextResponse.json(
        { error: 'Selecione um destinatário com telefone válido.' },
        { status: 400 }
      );
    }

    // Regra de Sigilo: somente Patrícia e Daniel podem receber valores em R$
    const isAdmin =
      telLimpo.includes('11978543369') || telLimpo.includes('11988139833');
    const incluirValores = Boolean(isAdmin && body.podeVerValores !== false);

    const { base64, fileName } =
      body.tipoRelatorio === 'CALENDARIO'
        ? gerarPdfCalendarioBase64({
            mes: body.mes,
            diasNoMes: body.diasNoMes,
            linhas: body.linhas || [],
            incluirValores,
          })
        : gerarPdfEspelhoBase64({
            mes: body.mes,
            diasNoMes: body.diasNoMes,
            linhas: body.linhas || [],
            incluirValores,
          });

    // 1. Sobe o PDF no Cloudflare R2 para ter link permanente caso precise de fallback
    let pdfUrl: string | null = null;
    try {
      const up = await uploadToR2(
        Buffer.from(base64, 'base64'),
        `${fileName.replace('.pdf', '')}-${Date.now()}.pdf`,
        'application/pdf'
      );
      if (up.success && up.url) pdfUrl = up.url;
    } catch {
      pdfUrl = null;
    }

    const baileysLocal = process.env.BAILEYS_LOCAL_URL || 'http://127.0.0.1:3001';
    const caption =
      `📅 *ESPELHO DO PONTO MENSAL (${body.mes})*\n` +
      `👤 Destinatário: ${body.nomeDestinatario || telLimpo}\n` +
      `👥 Colaboradores: ${(body.linhas || []).length}\n` +
      (pdfUrl ? `📄 *PDF Direto:* ${pdfUrl}\n` : '') +
      `\n_Enviado automaticamente pelo Ponto Patrícia (Diária.AI)._`;

    let enviado = false;
    // 2. Tenta enviar o PDF Base64 direto via /send-document no Baileys local (127.0.0.1:3001)
    try {
      const resDoc = await fetch(`${baileysLocal}/send-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: telLimpo,
          to: telLimpo,
          jid: `${telLimpo}@s.whatsapp.net`,
          fileName,
          mimetype: 'application/pdf',
          base64,
          caption,
        }),
      });
      if (resDoc.ok) enviado = true;
    } catch {
      enviado = false;
    }

    // 3. Fallback garantido via /send-message (mesma rota usada no Ticket de Ponto Homologado!)
    if (!enviado) {
      try {
        const resMsg = await fetch(`${baileysLocal}/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: telLimpo,
            message: caption,
          }),
        });
        if (resMsg.ok) enviado = true;
      } catch (err) {
        console.error('Erro ao enviar Espelho via Baileys local:', err);
      }
    }

    return NextResponse.json({
      success: true,
      enviadoViaWhatsApp: enviado,
      fileName,
      pdfUrl,
      pdfBase64: base64,
      incluirValores,
      message: enviado
        ? `✅ Enviado direto no WhatsApp para ${body.nomeDestinatario || telLimpo}!`
        : `PDF (${fileName}) gerado em Base64 (download iniciado). Baileys local não respondeu.`,
    });
  } catch (error) {
    console.error('Erro em POST /api/relatorios/espelho/enviar:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar/enviar PDF do Espelho do Ponto.' },
      { status: 500 }
    );
  }
}
