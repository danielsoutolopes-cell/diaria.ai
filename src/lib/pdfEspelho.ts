export interface LinhaEspelhoPDF {
  nome: string;
  dias: Record<number, { fracao: number; tipo: string; obs: string; valor: number }>;
  totalDias: number;
  totalValor: number;
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

function simboloDia(cell?: { fracao: number; tipo: string }): string {
  if (!cell) return '.';
  if (cell.tipo === 'CHUVA') return 'C';
  if (cell.tipo === 'VIAGEM') return 'V';
  if (cell.tipo === 'PARADO') return 'P';
  if (cell.fracao === 0.5) return '1/2';
  if (cell.fracao === 0) return 'F';
  return '1';
}

/**
 * Gera PDF Paisagem (A4 Landscape: 842 x 595 pt) em Base64 do Relatório 4 (Espelho do Ponto).
 * Respeita sigilo: incluirValores = true apenas para Patrícia e Daniel.
 */
export function gerarPdfEspelhoBase64(params: {
  mes: string;
  diasNoMes: number;
  linhas: LinhaEspelhoPDF[];
  incluirValores: boolean;
}): { base64: string; fileName: string } {
  const { mes, diasNoMes, linhas, incluirValores } = params;
  const ops: string[] = ['BT'];

  // Cabeçalho
  ops.push('/F2 13 Tf');
  ops.push('1 0 0 1 30 560 Tm');
  ops.push(
    `(${sanitize(
      `PONTO PATRICIA - RELATORIO 4: ESPELHO DO PONTO (${mes}) ${
        incluirValores ? '[EXECUTIVO]' : '[OPERACIONAL SEM VALORES]'
      }`
    )}) Tj`
  );

  ops.push('/F1 8 Tf');
  ops.push('1 0 0 1 30 544 Tm');
  ops.push('(Legenda: 1=Integral | 1/2=Meio Dia | C=Chuva | V=Viagem | P=Parado | .=Sem registro) Tj');

  // Cabeçalho da grade
  let headerLine = 'COLABORADOR'.padEnd(18, ' ');
  for (let d = 1; d <= diasNoMes; d++) {
    headerLine += String(d).padStart(2, '0') + ' ';
  }
  headerLine += ' DIAS';
  if (incluirValores) headerLine += '   TOTAL(R$)';

  ops.push('/F2 7 Tf');
  ops.push('1 0 0 1 30 524 Tm');
  ops.push(`(${sanitize(headerLine)}) Tj`);

  let y = 508;
  ops.push('/F1 7 Tf');

  for (const linha of linhas) {
    if (y < 40) break;
    const nomeCurto = linha.nome.slice(0, 16).padEnd(18, ' ');
    let row = nomeCurto;
    for (let d = 1; d <= diasNoMes; d++) {
      const sym = simboloDia(linha.dias[d]);
      row += sym.padStart(2, ' ') + ' ';
    }
    row += String(linha.totalDias.toFixed(1)).padStart(5, ' ');
    if (incluirValores) {
      row += `  R$ ${linha.totalValor.toFixed(2)}`;
    }
    ops.push(`1 0 0 1 30 ${y} Tm`);
    ops.push(`(${sanitize(row)}) Tj`);
    y -= 14;
  }

  ops.push('/F1 7 Tf');
  ops.push('1 0 0 1 30 22 Tm');
  ops.push(
    `(${sanitize(
      `Emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} | Ponto Patricia (Diaria.AI)`
    )}) Tj`
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

  return {
    base64: Buffer.from(pdf, 'utf8').toString('base64'),
    fileName: `Espelho-Ponto-${mes}${incluirValores ? '' : '-Operacional'}.pdf`,
  };
}
