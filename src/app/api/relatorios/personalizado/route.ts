import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { type LinhaEspelhoPDF } from '@/lib/pdfEspelho';

export const dynamic = 'force-dynamic';

type ModoConteudo = 'PRESENCA' | 'DIARIAS' | 'VALES' | 'COMPLETO';

function sanitize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function gerarPdfPersonalizado(params: {
  mes: string;
  periodoLabel: string;
  obraLabel: string;
  modoConteudo: ModoConteudo;
  diasVisiveis: number[];
  linhas: LinhaEspelhoPDF[];
}): { base64: string; fileName: string } {
  const { mes, periodoLabel, obraLabel, modoConteudo, diasVisiveis, linhas } = params;
  const ops: string[] = [];

  const tituloModo =
    modoConteudo === 'PRESENCA'
      ? 'SOMENTE PRESENCA (SEM VALORES)'
      : modoConteudo === 'DIARIAS'
        ? 'SOMENTE DIARIAS (SEM VALES)'
        : modoConteudo === 'VALES'
          ? 'SOMENTE VALES DESCONTADOS'
          : 'COMPLETO (DIARIAS + VALES + LIQUIDO)';

  // Cabeçalho executivo
  ops.push('0.059 0.090 0.165 rg 20 532 802 46 re f');
  ops.push('0.063 0.725 0.506 rg 20 532 6 46 re f');
  ops.push('BT 1 1 1 rg /F4 12 Tf 1 0 0 1 36 558 Tm');
  ops.push(`(${sanitize(`RELATORIO PERSONALIZADO — ${obraLabel.toUpperCase()} (${mes} • ${periodoLabel})`)}) Tj`);
  ops.push('0.64 0.72 0.82 rg /F3 8 Tf 1 0 0 1 36 542 Tm');
  ops.push(`(${sanitize(`MODO: ${tituloModo} | COLABORADORES SELECIONADOS: ${linhas.length}`)}) Tj ET`);

  const tableTopY = 514;
  ops.push(`0.12 0.16 0.23 rg 20 ${tableTopY - 14} 802 18 re f`);

  let header = 'COLABORADOR'.padEnd(16, ' ');
  for (const d of diasVisiveis) {
    header += String(d).padStart(3, ' ');
  }
  if (modoConteudo === 'PRESENCA') header += '   DIAS';
  else if (modoConteudo === 'DIARIAS') header += '   DIAS   DIARIAS(R$)';
  else if (modoConteudo === 'VALES') header += '    VALES(R$)';
  else header += '   DIAS   DIARIAS    VALES   LIQUIDO';

  ops.push('BT 1 1 1 rg /F2 6.5 Tf');
  ops.push(`1 0 0 1 26 ${tableTopY - 8} Tm (${sanitize(header)}) Tj ET`);

  let y = tableTopY - 26;
  let totalDiasG = 0;
  let totalDiariasG = 0;
  let totalValesG = 0;
  let totalLiqG = 0;

  linhas.forEach((l, idx) => {
    if (y < 52) return;
    if (idx % 2 === 1) {
      ops.push(`0.97 0.98 0.99 rg 20 ${y - 4} 802 14 re f`);
    }
    const vales = Number(l.totalVales || 0);
    const pago = Number(l.totalPago || 0);
    const liq =
      typeof l.saldoAPagar === 'number'
        ? l.saldoAPagar
        : Math.max(0, Number(l.totalValor || 0) - pago - vales);

    totalDiasG += Number(l.totalDias || 0);
    totalDiariasG += Number(l.totalValor || 0);
    totalValesG += vales;
    totalLiqG += liq;

    let row = l.nome.slice(0, 15).padEnd(16, ' ');
    for (const d of diasVisiveis) {
      const cel = l.dias[d];
      let sym = '.';
      if (modoConteudo === 'VALES') {
        sym = cel && Number(cel.valeDia || 0) > 0 ? String(Math.round(Number(cel.valeDia))) : '.';
      } else if (modoConteudo === 'DIARIAS') {
        sym = cel && cel.valor > 0 ? String(Math.round(cel.valor)) : '.';
      } else if (cel && cel.tipo !== 'VALE_ONLY') {
        if (cel.tipo === 'CHUVA') sym = 'C';
        else if (cel.tipo === 'VIAGEM') sym = 'V';
        else if (cel.tipo === 'RATEIO') sym = 'R';
        else if (cel.fracao === 0.5) sym = '1/2';
        else sym = '1';
      }
      row += sym.padStart(3, ' ');
    }

    if (modoConteudo === 'PRESENCA') {
      row += l.totalDias.toFixed(1).padStart(7, ' ');
    } else if (modoConteudo === 'DIARIAS') {
      row += l.totalDias.toFixed(1).padStart(7, ' ') + l.totalValor.toFixed(2).padStart(14, ' ');
    } else if (modoConteudo === 'VALES') {
      row += vales.toFixed(2).padStart(13, ' ');
    } else {
      row +=
        l.totalDias.toFixed(1).padStart(7, ' ') +
        l.totalValor.toFixed(2).padStart(10, ' ') +
        vales.toFixed(2).padStart(9, ' ') +
        liq.toFixed(2).padStart(10, ' ');
    }

    ops.push('BT 0.10 0.14 0.20 rg /F1 6.5 Tf');
    ops.push(`1 0 0 1 26 ${y} Tm (${sanitize(row)}) Tj ET`);
    y -= 14;
  });

  // Rodapé TOTAL
  const footY = Math.max(34, y - 4);
  ops.push(`0.059 0.090 0.165 rg 20 ${footY} 802 16 re f`);
  let footTxt = `TOTAL (${linhas.length} colab.) | DIAS: ${totalDiasG.toFixed(1)}`;
  if (modoConteudo === 'DIARIAS') footTxt += ` | TOTAL DIARIAS: R$ ${totalDiariasG.toFixed(2)}`;
  else if (modoConteudo === 'VALES') footTxt = `TOTAL (${linhas.length} colab.) | TOTAL VALES: R$ ${totalValesG.toFixed(2)}`;
  else if (modoConteudo === 'COMPLETO')
    footTxt += ` | DIARIAS: R$ ${totalDiariasG.toFixed(2)} | VALES: -R$ ${totalValesG.toFixed(2)} | LIQUIDO: R$ ${totalLiqG.toFixed(2)}`;

  ops.push(`BT 1 1 1 rg /F4 8 Tf 1 0 0 1 28 ${footY + 5} Tm (${sanitize(footTxt)}) Tj ET`);

  const streamContent = ops.join('\n');
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R >> >> /Contents 8 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `8 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return {
    base64: Buffer.from(pdf, 'utf8').toString('base64'),
    fileName: `Relatorio-${modoConteudo.toLowerCase()}-${mes}.pdf`,
  };
}

export async function GET(req: NextRequest) {
  const tenant = getActiveTenantFromRequest(req);
  const { data: joabsonRow } = await supabaseAdmin
    .from('funcionarios_obra')
    .select('nome_trabalhador, telefone')
    .eq('tenant_id', tenant.id)
    .ilike('nome_trabalhador', '%joabson%')
    .limit(1)
    .maybeSingle();

  const telJoabson = String(joabsonRow?.telefone || '').replace(/\D/g, '');
  return NextResponse.json({
    destinatarios: [
      { id: 'patricia', nome: 'Patrícia Grubel', telefone: '5511978543369' },
      { id: 'daniel', nome: 'Daniel Lopes', telefone: '5511988139833' },
      { id: 'joabson', nome: 'Joabson', telefone: telJoabson || '5511999999999' },
    ],
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      acao: 'BAIXAR' | 'ENVIAR_ZAP';
      telefone?: string;
      nomeDestinatario?: string;
      mes: string;
      periodoLabel: string;
      obraLabel: string;
      modoConteudo: ModoConteudo;
      diasVisiveis: number[];
      linhas: LinhaEspelhoPDF[];
    };

    const { base64, fileName } = gerarPdfPersonalizado({
      mes: body.mes,
      periodoLabel: body.periodoLabel || 'MENSAL',
      obraLabel: body.obraLabel || 'TODAS AS OBRAS',
      modoConteudo: body.modoConteudo || 'PRESENCA',
      diasVisiveis: body.diasVisiveis || [],
      linhas: body.linhas || [],
    });

    if (body.acao === 'BAIXAR') {
      return NextResponse.json({ success: true, pdfBase64: base64, fileName });
    }

    const tel = String(body.telefone || '').replace(/\D/g, '');
    if (!tel) {
      return NextResponse.json({ error: 'Informe o telefone do destinatário.' }, { status: 400 });
    }

    const baileysBase = (
      process.env.BAILEYS_SERVER_URL ||
      process.env.BAILEYS_LOCAL_URL ||
      'http://127.0.0.1:3001'
    ).replace(/\/+$/, '');

    const caption =
      `📄 *RELATÓRIO PERSONALIZADO (${body.mes})*\n` +
      `🏗️ Obra: ${body.obraLabel}\n` +
      `📊 Modo: ${body.modoConteudo}\n` +
      `👥 Colaboradores: ${(body.linhas || []).length}\n` +
      `_Enviado pelo Ponto Patrícia (Diária.AI)_`;

    let enviado = false;
    try {
      const r = await fetch(`${baileysBase}/send-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: tel,
          to: tel,
          jid: `${tel}@s.whatsapp.net`,
          fileName,
          mimetype: 'application/pdf',
          base64,
          caption,
        }),
      });
      enviado = r.ok;
    } catch {
      enviado = false;
    }

    return NextResponse.json({
      success: true,
      enviadoViaWhatsApp: enviado,
      pdfBase64: base64,
      fileName,
      message: enviado
        ? `PDF enviado no WhatsApp para ${body.nomeDestinatario || tel}!`
        : 'PDF gerado para download (verifique o telefone/conexão do WhatsApp).',
    });
  } catch (err) {
    console.error('[POST /api/relatorios/personalizado]', err);
    return NextResponse.json({ error: 'Falha ao gerar relatório personalizado.' }, { status: 500 });
  }
}
