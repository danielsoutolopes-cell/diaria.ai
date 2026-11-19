import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { gerarPdfEspelhoBase64, type LinhaEspelhoPDF } from '@/lib/pdfEspelho';

export const dynamic = 'force-dynamic';

export interface DestinatarioWhatsApp {
  nome: string;
  telefone: string;
  papel: 'ADMIN' | 'ENCARREGADO' | 'COLABORADOR';
  podeVerValores: boolean;
}

export async function GET() {
  try {
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

    // Puxar encarregados (incluindo Joabson, Gil, etc.)
    const { data: encs } = await supabaseAdmin
      .from('encarregados_obras')
      .select('nome, telefone_encarregado')
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

    // Puxar funcionários com telefone cadastrado
    const { data: funcs } = await supabaseAdmin
      .from('funcionarios_obra')
      .select('nome_trabalhador, telefone')
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

    const { base64, fileName } = gerarPdfEspelhoBase64({
      mes: body.mes,
      diasNoMes: body.diasNoMes,
      linhas: body.linhas || [],
      incluirValores,
    });

    const baileysBase =
      process.env.BAILEYS_API_URL ||
      process.env.WHATSAPP_API_URL ||
      'https://diaria-ai.onrender.com';

    let enviado = false;
    try {
      const resDoc = await fetch(`${baileysBase}/send-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: telLimpo,
          phone: telLimpo,
          jid: `${telLimpo}@s.whatsapp.net`,
          fileName,
          mimetype: 'application/pdf',
          base64,
          caption: `📅 *RELATÓRIO 4 — ESPELHO DO PONTO (${body.mes})*\nEnviado para ${body.nomeDestinatario || telLimpo}.`,
        }),
      });
      enviado = resDoc.ok;
    } catch (err) {
      console.error('Erro ao enviar PDF do Espelho via Baileys:', err);
    }

    return NextResponse.json({
      success: true,
      enviadoViaWhatsApp: enviado,
      fileName,
      pdfBase64: base64,
      incluirValores,
      message: enviado
        ? `PDF (${fileName}) enviado no WhatsApp para ${body.nomeDestinatario || telLimpo}!`
        : `PDF (${fileName}) gerado em Base64 (download iniciado). Verifique a conexão Baileys para disparo direto.`,
    });
  } catch (error) {
    console.error('Erro em POST /api/relatorios/espelho/enviar:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar/enviar PDF do Espelho do Ponto.' },
      { status: 500 }
    );
  }
}
