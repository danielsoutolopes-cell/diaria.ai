import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { type LinhaEspelhoPDF } from '@/lib/pdfEspelho';

export const dynamic = 'force-dynamic';

export interface SecoesSelecionadas {
  presenca: boolean;
  diarias: boolean;
  vales: boolean;
  liquido: boolean;
}

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
  secoes: SecoesSelecionadas;
  diasVisiveis: number[];
  linhas: LinhaEspelhoPDF[];
}): { base64: string; fileName: string } {
  const { mes, periodoLabel, obraLabel, secoes, diasVisiveis, linhas } = params;
  const ops: string[] = [];

  const tags: string[] = [];
  if (secoes.presenca) tags.push('PRESENCA');
  if (secoes.diarias) tags.push('DIARIAS');
  if (secoes.vales) tags.push('VALES');
  if (secoes.liquido) tags.push('LIQUIDO');
  if (tags.length === 0) tags.push('PRESENCA');

  // Cabeçalho executivo
  ops.push('0.059 0.090 0.165 rg 20 532 802 46 re f');
  ops.push('0.063 0.725 0.506 rg 20 532 6 46 re f');
  ops.push('BT 1 1 1 rg /F4 12 Tf 1 0 0 1 36 558 Tm');
  ops.push(
    `(${sanitize(
      `RELATORIO PERSONALIZADO — ${obraLabel.toUpperCase()} (${mes} • ${periodoLabel})`
    )}) Tj`
  );
  ops.push('0.64 0.72 0.82 rg /F3 8 Tf 1 0 0 1 36 542 Tm');
  ops.push(
    `(${sanitize(
      `SECOES: ${tags.join(' + ')} | COLABORADORES: ${linhas.length}`
    )}) Tj ET`
  );

  const tableTopY = 514;
  ops.push(`0.12 0.16 0.23 rg 20 ${tableTopY - 14} 802 18 re f`);

  let totalDiasG = 0;
  let totalDiariasG = 0;
  let totalPagoG = 0;
  let totalValesG = 0;
  let totalLiqG = 0;

  if (secoes.presenca) {
    // Modo com grade de dias (sempre símbolos compactos — ZERO encavalamento!)
    let header = 'COLABORADOR'.padEnd(14, ' ');
    for (const d of diasVisiveis) {
      header += String(d).padStart(2, ' ') + ' ';
    }
    header += ' DIAS';
    if (secoes.diarias) header += '  DIARIAS(R$)';
    if (secoes.vales) header += '   VALES(R$)';
    if (secoes.liquido) header += '  LIQUIDO(R$)';

    ops.push('BT 1 1 1 rg /F2 6.2 Tf');
    ops.push(`1 0 0 1 24 ${tableTopY - 8} Tm (${sanitize(header)}) Tj ET`);

    let y = tableTopY - 26;
    linhas.forEach((l, idx) => {
      if (y < 58) return;
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
      totalPagoG += pago;
      totalValesG += vales;
      totalLiqG += liq;

      let row = l.nome.slice(0, 13).padEnd(14, ' ');
      for (const d of diasVisiveis) {
        const cel = l.dias[d];
        let sym = '.';
        if (cel && cel.tipo !== 'VALE_ONLY') {
          if (cel.tipo === 'CHUVA') sym = 'C';
          else if (cel.tipo === 'VIAGEM') sym = 'V';
          else if (cel.tipo === 'PARADO') sym = 'P';
          else if (cel.tipo === 'RATEIO') sym = 'R';
          else if (cel.fracao === 0.5) sym = '1/2';
          else sym = '1';
        }
        row += sym.padStart(2, ' ') + ' ';
      }
      row += l.totalDias.toFixed(1).padStart(5, ' ');
      if (secoes.diarias) row += l.totalValor.toFixed(2).padStart(13, ' ');
      if (secoes.vales) row += vales.toFixed(2).padStart(12, ' ');
      if (secoes.liquido) row += liq.toFixed(2).padStart(13, ' ');

      ops.push('BT 0.10 0.14 0.20 rg /F1 6.2 Tf');
      ops.push(`1 0 0 1 24 ${y} Tm (${sanitize(row)}) Tj ET`);
      y -= 14;
    });

    const footY = Math.max(38, y - 4);
    ops.push(`0.059 0.090 0.165 rg 20 ${footY} 802 16 re f`);
    const partsFoot = [`TOTAL (${linhas.length} colab.)`, `DIAS: ${totalDiasG.toFixed(1)}`];
    if (secoes.diarias) partsFoot.push(`DIARIAS: R$ ${totalDiariasG.toFixed(2)}`);
    if (secoes.vales) partsFoot.push(`VALES: -R$ ${totalValesG.toFixed(2)}`);
    if (secoes.liquido) partsFoot.push(`LIQUIDO A PAGAR: R$ ${totalLiqG.toFixed(2)}`);
    ops.push(`BT 1 1 1 rg /F4 8 Tf 1 0 0 1 28 ${footY + 5} Tm (${sanitize(partsFoot.join('  |  '))}) Tj ET`);
  } else {
    // Modo Financeiro Limpo (sem grade de 31 dias) — fonte grande 9pt super legível!
    let header = 'COLABORADOR'.padEnd(26, ' ') + 'DIAS'.padStart(8, ' ');
    if (secoes.diarias) header += 'DIARIAS (R$)'.padStart(18, ' ');
    if (secoes.vales) header += 'VALES (R$)'.padStart(16, ' ');
    if (secoes.liquido) {
      header += 'JA PAGO (R$)'.padStart(16, ' ');
      header += 'LIQUIDO A PAGAR'.padStart(18, ' ');
    }

    ops.push('BT 1 1 1 rg /F2 9 Tf');
    ops.push(`1 0 0 1 32 ${tableTopY - 9} Tm (${sanitize(header)}) Tj ET`);

    let y = tableTopY - 30;
    linhas.forEach((l, idx) => {
      if (y < 60) return;
      if (idx % 2 === 1) {
        ops.push(`0.97 0.98 0.99 rg 20 ${y - 5} 802 18 re f`);
      }
      const vales = Number(l.totalVales || 0);
      const pago = Number(l.totalPago || 0);
      const liq =
        typeof l.saldoAPagar === 'number'
          ? l.saldoAPagar
          : Math.max(0, Number(l.totalValor || 0) - pago - vales);

      totalDiasG += Number(l.totalDias || 0);
      totalDiariasG += Number(l.totalValor || 0);
      totalPagoG += pago;
      totalValesG += vales;
      totalLiqG += liq;

      let row = l.nome.slice(0, 24).padEnd(26, ' ') + l.totalDias.toFixed(1).padStart(8, ' ');
      if (secoes.diarias) row += `R$ ${l.totalValor.toFixed(2)}`.padStart(18, ' ');
      if (secoes.vales) row += `R$ ${vales.toFixed(2)}`.padStart(16, ' ');
      if (secoes.liquido) {
        row += `R$ ${pago.toFixed(2)}`.padStart(16, ' ');
        row += `R$ ${liq.toFixed(2)}`.padStart(18, ' ');
      }

      ops.push('BT 0.10 0.14 0.20 rg /F1 9 Tf');
      ops.push(`1 0 0 1 32 ${y} Tm (${sanitize(row)}) Tj ET`);
      y -= 18;
    });

    const footY = Math.max(40, y - 6);
    ops.push(`0.059 0.090 0.165 rg 20 ${footY} 802 18 re f`);
    const partsFoot = [`TOTAL (${linhas.length} colab.)`, `DIAS: ${totalDiasG.toFixed(1)}`];
    if (secoes.diarias) partsFoot.push(`DIARIAS: R$ ${totalDiariasG.toFixed(2)}`);
    if (secoes.vales) partsFoot.push(`VALES: -R$ ${totalValesG.toFixed(2)}`);
    if (secoes.liquido) {
      partsFoot.push(`PAGO: R$ ${totalPagoG.toFixed(2)}`);
      partsFoot.push(`LIQUIDO: R$ ${totalLiqG.toFixed(2)}`);
    }
    ops.push(`BT 1 1 1 rg /F4 8.5 Tf 1 0 0 1 32 ${footY + 6} Tm (${sanitize(partsFoot.join('  |  '))}) Tj ET`);
  }

  // Legenda clara no rodapé
  ops.push('BT 0.45 0.50 0.56 rg /F3 7.5 Tf 1 0 0 1 20 18 Tm');
  ops.push(
    `(${sanitize(
      `Legenda: 1=Integral | 1/2=Meio Dia | C=Chuva | V=Viagem | R=Rateio | P=Parado | .=Sem registro | Emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} | Ponto Patricia (Diaria.AI)`
    )}) Tj ET`
  );

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
    fileName: `Relatorio-${tags.join('-').toLowerCase()}-${mes}.pdf`,
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
      { id: 'joabson', nome: 'Joabson', telefone: telJoabson || '' },
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
      secoes?: SecoesSelecionadas;
      diasVisiveis: number[];
      linhas: LinhaEspelhoPDF[];
    };

    const secoes: SecoesSelecionadas = body.secoes || {
      presenca: true,
      diarias: false,
      vales: false,
      liquido: false,
    };

    const { base64, fileName } = gerarPdfPersonalizado({
      mes: body.mes,
      periodoLabel: body.periodoLabel || 'MENSAL',
      obraLabel: body.obraLabel || 'TODAS AS OBRAS',
      secoes,
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
      `📄 *RELATÓRIO PERSONALIZADO (${body.mes} • ${body.periodoLabel})*\n` +
      `🏗️ Obra: ${body.obraLabel}\n` +
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
