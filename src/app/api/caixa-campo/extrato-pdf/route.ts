import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface MovimentoExtrato {
  data: string;
  hora?: string;
  obra: string;
  tipo: string;
  descricao: string;
  emissorPix?: string | null;
  valor: number;
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

/**
 * Gera PDF A4 Retrato (595 x 842 pt) estilo Extrato Bancário com saldo acumulado linha a linha.
 */
function gerarPdfExtratoBancario(params: {
  colaborador: string;
  totalRecebido: number;
  totalNotas: number;
  saldoFinal: number;
  movimentos: MovimentoExtrato[];
}): { base64: string; fileName: string } {
  const { colaborador, totalRecebido, totalNotas, saldoFinal, movimentos } = params;
  const ops: string[] = [];

  // Cabeçalho bancário escuro (#0F172A + barra esmeralda)
  ops.push('0.059 0.090 0.165 rg 24 764 547 56 re f');
  ops.push('0.063 0.725 0.506 rg 24 764 6 56 re f');
  ops.push('BT 1 1 1 rg /F4 13 Tf 1 0 0 1 40 798 Tm');
  ops.push(`(${sanitize('EXTRATO DE CONTA CORRENTE — CAIXINHA DE CAMPO')}) Tj`);
  ops.push('0.64 0.72 0.82 rg /F3 8.5 Tf 1 0 0 1 40 780 Tm');
  ops.push(
    `(${sanitize(
      `TITULAR: ${colaborador.toUpperCase()}  |  EMITIDO EM: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
    )}) Tj ET`
  );

  // 3 Cards KPI
  const kpis = [
    {
      label: 'TOTAL RECEBIDO (PIX)',
      val: `+ R$ ${totalRecebido.toFixed(2)}`,
      bg: '0.92 0.99 0.96',
      fg: '0.02 0.47 0.34',
    },
    {
      label: 'TOTAL NOTAS / SAIDAS',
      val: `- R$ ${totalNotas.toFixed(2)}`,
      bg: '1.00 0.95 0.95',
      fg: '0.75 0.12 0.24',
    },
    {
      label: saldoFinal >= 0 ? 'TROCO EM MAOS (SALDO)' : 'A REEMBOLSAR (SALDO)',
      val: `R$ ${Math.abs(saldoFinal).toFixed(2)}`,
      bg: '1.00 0.97 0.88',
      fg: '0.57 0.25 0.05',
    },
  ];
  kpis.forEach((k, i) => {
    const x = 24 + i * 185;
    ops.push(`${k.bg} rg ${x} 712 177 42 re f`);
    ops.push(`0.85 0.88 0.92 RG 0.5 w ${x} 712 177 42 re S`);
    ops.push(`BT 0.40 0.45 0.52 rg /F4 7 Tf 1 0 0 1 ${x + 10} 740 Tm (${sanitize(k.label)}) Tj`);
    ops.push(`${k.fg} rg /F4 11.5 Tf 1 0 0 1 ${x + 10} 722 Tm (${sanitize(k.val)}) Tj ET`);
  });

  // Cabeçalho da tabela de extrato
  ops.push('0.12 0.16 0.23 rg 24 684 547 18 re f');
  ops.push('BT 1 1 1 rg /F2 7.5 Tf 1 0 0 1 30 690 Tm');
  ops.push(
    `(${sanitize(
      'DATA/HORA'.padEnd(13, ' ') +
        'HISTORICO / OBRA'.padEnd(38, ' ') +
        'MOVIMENTO'.padStart(13, ' ') +
        'SALDO APOS'.padStart(13, ' ')
    )}) Tj ET`
  );

  // Ordenar cronologicamente para saldo acumulado real
  const ordenados = [...movimentos].sort((a, b) =>
    `${a.data} ${a.hora || '00:00'}`.localeCompare(`${b.data} ${b.hora || '00:00'}`)
  );

  let y = 668;
  let saldoAcum = 0;

  ordenados.forEach((m, idx) => {
    if (y < 54) return;
    if (idx % 2 === 1) {
      ops.push(`0.97 0.98 0.99 rg 24 ${y - 4} 547 15 re f`);
    }
    const ehEntrada = m.tipo === 'ENTRADA_PIX' || m.tipo === 'DEVOLUCAO_TROCO';
    const val = Math.abs(Number(m.valor || 0));
    saldoAcum = Number((saldoAcum + (ehEntrada ? val : -val)).toFixed(2));

    const dataCurta = m.data.includes('-')
      ? `${m.data.split('-')[2]}/${m.data.split('-')[1]}`
      : m.data.slice(0, 5);
    const dtHora = `${dataCurta} ${(m.hora || '').slice(0, 5)}`.trim().padEnd(13, ' ');
    const hist = `${m.descricao}${m.emissorPix ? ` (${m.emissorPix})` : ''}`.slice(0, 36).padEnd(38, ' ');
    const movStr = `${ehEntrada ? '+' : '-'}${val.toFixed(2)}`.padStart(13, ' ');
    const salStr = `${saldoAcum.toFixed(2)}`.padStart(13, ' ');

    ops.push(`BT ${ehEntrada ? '0.02 0.42 0.30' : '0.68 0.10 0.20'} rg /F1 7.2 Tf`);
    ops.push(`1 0 0 1 30 ${y} Tm (${sanitize(dtHora + hist + movStr + salStr)}) Tj ET`);
    y -= 15;
  });

  // Rodapé de saldo final
  const footY = Math.max(36, y - 6);
  ops.push(`0.059 0.090 0.165 rg 24 ${footY} 547 18 re f`);
  ops.push(
    `BT 1 1 1 rg /F4 8.5 Tf 1 0 0 1 32 ${footY + 6} Tm (${sanitize(
      `SALDO FINAL CONSOLIDADO (${colaborador.toUpperCase()}): ${saldoFinal >= 0 ? 'TROCO EM MAOS' : 'A REEMBOLSAR'} R$ ${Math.abs(saldoFinal).toFixed(2)}`
    )}) Tj ET`
  );

  ops.push(
    `BT 0.45 0.50 0.56 rg /F3 7 Tf 1 0 0 1 24 18 Tm (${sanitize(
      'Ponto Patricia (Diaria.AI) — Extrato auditavel de Caixinha de Campo'
    )}) Tj ET`
  );

  const streamContent = ops.join('\n');
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R >> >> /Contents 8 0 R >>\nendobj\n',
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

  const slug = colaborador
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  return {
    base64: Buffer.from(pdf, 'utf8').toString('base64'),
    fileName: `Extrato-Caixinha-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const tenant = getActiveTenantFromRequest(req);
    const body = (await req.json()) as {
      acao: 'BAIXAR' | 'ENVIAR_ZAP';
      destinatarioTipo?: 'COLABORADOR' | 'PATRICIA' | 'DANIEL' | 'JOABSON';
      telefoneCustom?: string;
      colaborador: string;
      totalRecebido: number;
      totalNotas: number;
      saldoFinal: number;
      movimentos: MovimentoExtrato[];
    };

    const { base64, fileName } = gerarPdfExtratoBancario({
      colaborador: body.colaborador,
      totalRecebido: Number(body.totalRecebido || 0),
      totalNotas: Number(body.totalNotas || 0),
      saldoFinal: Number(body.saldoFinal || 0),
      movimentos: body.movimentos || [],
    });

    if (body.acao === 'BAIXAR') {
      return NextResponse.json({ success: true, pdfBase64: base64, fileName });
    }

    let tel = String(body.telefoneCustom || '').replace(/\D/g, '');
    if (!tel) {
      if (body.destinatarioTipo === 'PATRICIA') tel = '5511978543369';
      else if (body.destinatarioTipo === 'DANIEL') tel = '5511988139833';
      else {
        const busca = body.destinatarioTipo === 'JOABSON' ? 'joabson' : body.colaborador;
        const { data: row } = await supabaseAdmin
          .from('funcionarios_obra')
          .select('telefone')
          .eq('tenant_id', tenant.id)
          .ilike('nome_trabalhador', `%${busca}%`)
          .limit(1)
          .maybeSingle();
        tel = String(row?.telefone || '').replace(/\D/g, '');
      }
    }

    if (!tel) {
      return NextResponse.json({
        success: true,
        enviadoViaWhatsApp: false,
        pdfBase64: base64,
        fileName,
        message: 'Telefone não encontrado no cadastro — PDF baixado automaticamente.',
      });
    }

    const baileysBase = (
      process.env.BAILEYS_SERVER_URL ||
      process.env.BAILEYS_LOCAL_URL ||
      'http://127.0.0.1:3001'
    ).replace(/\/+$/, '');

    const caption =
      `🏦 *EXTRATO CAIXINHA DE CAMPO — ${body.colaborador.toUpperCase()}*\n` +
      `📥 Recebido (PIX): R$ ${Number(body.totalRecebido || 0).toFixed(2)}\n` +
      `🧾 Notas/Saídas: R$ ${Number(body.totalNotas || 0).toFixed(2)}\n` +
      `💰 Saldo Atual: R$ ${Number(body.saldoFinal || 0).toFixed(2)}\n` +
      `_Ponto Patrícia (Diária.AI)_`;

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
        ? `Extrato Bancário PDF enviado no WhatsApp (${tel})!`
        : 'PDF baixado automaticamente (verifique a conexão do WhatsApp).',
    });
  } catch (err) {
    console.error('[POST /api/caixa-campo/extrato-pdf]', err);
    return NextResponse.json({ error: 'Falha ao gerar extrato PDF.' }, { status: 500 });
  }
}
