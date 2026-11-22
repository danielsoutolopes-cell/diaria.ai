export interface LinhaFinanceiroQuinzenal {
  nome: string;
  obras: string;
  chavePix: string;
  diariasQtd: number;
  diariasValor: number;
  valesValor: number;
  liquidoPagar: number;
  caixinhaEmMaos: number;
}

export interface GerarPdfFinanceiroQuinzenalParams {
  empresaRazaoSocial: string;
  dataReferenciaLabel: string;
  linhas: LinhaFinanceiroQuinzenal[];
  totalQuitadoAnterior: number;
}

function sanitizePdf(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function money(val: number): string {
  return `R$ ${val.toFixed(2)}`;
}

/**
 * Gera Relatório Financeiro Quinzenal Consolidado em PDF Paisagem (A4 Landscape: 842 x 595 pt)
 * em Base64 (Prompt 5) — exibe exclusivamente saldos em aberto respeitando liquidação parcial seletiva,
 * mantendo Caixinha de Campo em coluna informativa própria sem desconto automático.
 */
export function gerarPdfFinanceiroQuinzenalBase64(
  params: GerarPdfFinanceiroQuinzenalParams
): {
  base64: string;
  buffer: Buffer;
  fileName: string;
  totalDiariasAberto: number;
  totalValesAberto: number;
  totalLiquidoAberto: number;
} {
  const totalDiariasAberto = Number(
    params.linhas.reduce((acc, l) => acc + l.diariasValor, 0).toFixed(2)
  );
  const totalValesAberto = Number(
    params.linhas.reduce((acc, l) => acc + l.valesValor, 0).toFixed(2)
  );
  const totalLiquidoAberto = Number(
    params.linhas.reduce((acc, l) => acc + l.liquidoPagar, 0).toFixed(2)
  );
  const totalCaixinha = Number(
    params.linhas.reduce((acc, l) => acc + l.caixinhaEmMaos, 0).toFixed(2)
  );

  const ops: string[] = ['BT'];
  let y = 558;

  const line = (
    text: string,
    font: 'F1' | 'F2' = 'F1',
    size = 8,
    x = 28,
    step = 13
  ) => {
    if (y < 36) return;
    ops.push(`/${font} ${size} Tf`);
    ops.push(`1 0 0 1 ${x} ${y} Tm`);
    ops.push(`(${sanitizePdf(text)}) Tj`);
    y -= step;
  };

  line(
    `${params.empresaRazaoSocial.toUpperCase()} - RELATORIO FINANCEIRO QUINZENAL (SALDOS EM ABERTO)`,
    'F2',
    12,
    28,
    16
  );
  line(
    `Referencia: ${params.dataReferenciaLabel} | Destinatarios Exclusivos: Patricia Grubel e Daniel Lopes (Sigiloso)`,
    'F1',
    8,
    28,
    16
  );

  const header =
    'COLABORADOR'.padEnd(18, ' ') +
    'OBRA(S)'.padEnd(26, ' ') +
    'CHAVE PIX'.padEnd(24, ' ') +
    'DIAS'.padStart(6, ' ') +
    'DIARIAS'.padStart(13, ' ') +
    'VALES'.padStart(12, ' ') +
    'LIQUIDO PIX'.padStart(14, ' ') +
    'CAIXINHA*'.padStart(12, ' ');

  line(header, 'F2', 8, 28, 12);
  line('-'.repeat(125), 'F1', 8, 28, 12);

  for (const l of params.linhas) {
    const row =
      l.nome.slice(0, 16).padEnd(18, ' ') +
      l.obras.slice(0, 24).padEnd(26, ' ') +
      (l.chavePix || 'Nao informada').slice(0, 22).padEnd(24, ' ') +
      l.diariasQtd.toFixed(1).padStart(6, ' ') +
      money(l.diariasValor).padStart(13, ' ') +
      money(l.valesValor).padStart(12, ' ') +
      money(l.liquidoPagar).padStart(14, ' ') +
      (l.caixinhaEmMaos > 0 ? money(l.caixinhaEmMaos) : '-').padStart(12, ' ');
    line(row, 'F1', 8, 28, 13);
  }

  if (params.linhas.length === 0) {
    line(
      'Nenhum saldo em aberto no ciclo atual (todos os lancamentos validados foram liquidados).',
      'F1',
      9,
      28,
      14
    );
  }

  line('-'.repeat(125), 'F1', 8, 28, 14);

  const totalsRow =
    'TOTAIS DO CICLO ABERTO'.padEnd(74, ' ') +
    money(totalDiariasAberto).padStart(13, ' ') +
    money(totalValesAberto).padStart(12, ' ') +
    money(totalLiquidoAberto).padStart(14, ' ') +
    money(totalCaixinha).padStart(12, ' ');
  line(totalsRow, 'F2', 8, 28, 18);

  line(
    `Ciclo Anterior Quitado no Periodo (Informativo - NAO somado ao aberto): ${money(params.totalQuitadoAnterior)}`,
    'F1',
    8,
    28,
    13
  );
  line(
    '*Caixinha de Campo: mantido em coluna propria sem desconto automatico na folha de pagamento.',
    'F1',
    8,
    28,
    13
  );
  line(
    `Emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (America/Sao_Paulo) | diaria.ai`,
    'F1',
    7,
    28,
    12
  );

  ops.push('ET');
  const streamContent = ops.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const buffer = Buffer.from(pdf, 'utf8');
  const hoje = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });

  return {
    base64: buffer.toString('base64'),
    buffer,
    fileName: `Relatorio-Financeiro-Quinzenal-${hoje}.pdf`,
    totalDiariasAberto,
    totalValesAberto,
    totalLiquidoAberto,
  };
}
