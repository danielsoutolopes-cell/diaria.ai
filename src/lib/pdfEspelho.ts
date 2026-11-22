export interface LinhaEspelhoPDF {
  nome: string;
  dias: Record<
    number,
    {
      fracao: number;
      tipo: string;
      obs: string;
      valor: number;
      partes?: Array<{ obra: string; fracao: number; valor: number }>;
    }
  >;
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

function simboloDia(cell?: {
  fracao: number;
  tipo: string;
  partes?: Array<{ obra: string; fracao: number }>;
}): string {
  if (!cell) return '.';
  if (cell.tipo === 'RATEIO' || (cell.partes && cell.partes.length >= 2))
    return 'R';
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
  ops.push('(Legenda: 1=Integral | 1/2=Meio Dia | R=Rateio 1/2+1/2 | C=Chuva R$120 | V=Viagem | P=Parado | .=Sem registro) Tj');

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

/**
 * Gera PDF Paisagem (A4 Landscape: 842 x 595 pt) em formato de GRADE DE CALENDÁRIO (7 colunas: DOM a SAB)
 * fiel ao Relatório 5 da tela (KPIs no topo + caixinhas por dia com colaboradores e total do dia).
 */
export function gerarPdfCalendarioBase64(params: {
  mes: string;
  diasNoMes: number;
  linhas: LinhaEspelhoPDF[];
  incluirValores: boolean;
}): { base64: string; fileName: string } {
  const { mes, diasNoMes, linhas, incluirValores } = params;
  const [anoStr, mesStr] = mes.split('-');
  const primeiroDiaSemana = new Date(Number(anoStr), Number(mesStr) - 1, 1).getDay();

  // Mapear dados por dia
  const porDia = new Map<
    number,
    { itens: Array<{ nome: string; sym: string }>; totalValor: number; temChuva: boolean }
  >();
  let custoTotalMes = 0;
  let custoChuvaMes = 0;
  const diasChuvaSet = new Set<number>();

  for (let d = 1; d <= diasNoMes; d++) {
    porDia.set(d, { itens: [], totalValor: 0, temChuva: false });
  }

  for (const l of linhas) {
    for (let d = 1; d <= diasNoMes; d++) {
      const cell = l.dias[d];
      if (!cell) continue;
      const bucket = porDia.get(d)!;
      bucket.itens.push({ nome: l.nome.slice(0, 12), sym: simboloDia(cell) });
      bucket.totalValor += Number(cell.valor || 0);
      custoTotalMes += Number(cell.valor || 0);
      if (cell.tipo === 'CHUVA') {
        bucket.temChuva = true;
        custoChuvaMes += Number(cell.valor || 0);
        diasChuvaSet.add(d);
      }
    }
  }

  const ops: string[] = [];

  // Faixa escura do cabeçalho
  ops.push('0.06 0.09 0.16 rg');
  ops.push('24 532 794 42 re f');
  ops.push('1 1 1 rg');
  ops.push('BT /F2 13 Tf 1 0 0 1 36 555 Tm');
  ops.push(
    `(${sanitize(
      `PONTO PATRICIA - RELATORIO 5: CALENDARIO VISUAL DE OBRA (${mes}) ${
        incluirValores ? '' : '[OPERACIONAL]'
      }`
    )}) Tj ET`
  );
  ops.push('0.75 0.82 0.90 rg');
  ops.push('BT /F1 8 Tf 1 0 0 1 36 540 Tm');
  ops.push(
    `(${sanitize(
      incluirValores
        ? `Custo Total Mes: R$ ${custoTotalMes.toFixed(2)}  |  Impacto Chuva: R$ ${custoChuvaMes.toFixed(2)} (${diasChuvaSet.size} dias)  |  Legenda: 1=Int, 1/2=Meio, C=Chuva, V=Viagem`
        : `Dias com Chuva: ${diasChuvaSet.size} dia(s)  |  Colaboradores ativos: ${linhas.length}  |  Legenda: 1=Int, 1/2=Meio, C=Chuva, V=Viagem`
    )}) Tj ET`
  );

  // Cabeçalho dos 7 dias da semana
  const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  const startX = 24;
  const colW = 794 / 7; // ~113.4 pt
  const headerY = 508;

  for (let c = 0; c < 7; c++) {
    const x = startX + c * colW;
    ops.push('0.93 0.95 0.97 rg');
    ops.push(`${x.toFixed(1)} ${headerY} ${(colW - 3).toFixed(1)} 18 re f`);
    ops.push('0.20 0.25 0.33 rg');
    ops.push(`BT /F2 8 Tf 1 0 0 1 ${(x + 42).toFixed(1)} ${(headerY + 6).toFixed(1)} Tm (${diasSemana[c]}) Tj ET`);
  }

  // Grade do calendário (até 6 semanas)
  const totalSlots = primeiroDiaSemana + diasNoMes;
  const numRows = Math.ceil(totalSlots / 7);
  const gridTop = 502;
  const gridHeight = 472;
  const rowH = gridHeight / numRows;

  for (let r = 0; r < numRows; r++) {
    const yBottom = gridTop - (r + 1) * rowH;
    for (let c = 0; c < 7; c++) {
      const slotIdx = r * 7 + c;
      const dayNum = slotIdx - primeiroDiaSemana + 1;
      const x = startX + c * colW;

      // Borda da célula
      ops.push('0.82 0.85 0.90 RG 0.6 w');
      ops.push(`${x.toFixed(1)} ${(yBottom + 3).toFixed(1)} ${(colW - 3).toFixed(1)} ${(rowH - 4).toFixed(1)} re S`);

      if (dayNum >= 1 && dayNum <= diasNoMes) {
        const info = porDia.get(dayNum)!;
        const yTopText = yBottom + rowH - 12;

        // Número do dia
        ops.push('0.08 0.12 0.20 rg');
        ops.push(`BT /F2 8 Tf 1 0 0 1 ${(x + 5).toFixed(1)} ${yTopText.toFixed(1)} Tm (${String(dayNum).padStart(2, '0')}) Tj ET`);

        // Total do dia em verde (somente se incluirValores)
        if (incluirValores && info.totalValor > 0) {
          ops.push('0.02 0.55 0.35 rg');
          ops.push(
            `BT /F2 7 Tf 1 0 0 1 ${(x + colW - 46).toFixed(1)} ${yTopText.toFixed(1)} Tm (R$ ${info.totalValor.toFixed(0)}) Tj ET`
          );
        }

        // Lista de colaboradores no dia
        ops.push('0.22 0.27 0.35 rg');
        const maxLinhasCell = Math.max(3, Math.floor((rowH - 18) / 8.5));
        const visiveis = info.itens.slice(0, maxLinhasCell);
        let cy = yTopText - 10;
        for (const it of visiveis) {
          const lineStr = `${it.nome.padEnd(13, ' ')} ${it.sym}`;
          ops.push(`BT /F1 6.5 Tf 1 0 0 1 ${(x + 5).toFixed(1)} ${cy.toFixed(1)} Tm (${sanitize(lineStr)}) Tj ET`);
          cy -= 8.2;
        }
        if (info.itens.length > visiveis.length) {
          ops.push(
            `BT /F2 6 Tf 1 0 0 1 ${(x + 5).toFixed(1)} ${(cy + 1).toFixed(1)} Tm (+${info.itens.length - visiveis.length} mais...) Tj ET`
          );
        }
      }
    }
  }

  // Rodapé
  ops.push('0.45 0.50 0.58 rg');
  ops.push(
    `BT /F1 7 Tf 1 0 0 1 24 14 Tm (${sanitize(
      `Emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} | Ponto Patricia (Diaria.AI)`
    )}) Tj ET`
  );

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
    fileName: `Calendario-Obra-${mes}${incluirValores ? '' : '-Operacional'}.pdf`,
  };
}
