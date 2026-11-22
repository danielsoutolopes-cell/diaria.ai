import crypto from 'crypto';

export interface ItemReciboLiquidacao {
  data: string;
  obra: string;
  tipo: 'PONTO' | 'VALE';
  fracao: number;
  valor: number;
  descricao: string;
}

export interface GerarReciboLiquidacaoParams {
  empresaRazaoSocial: string;
  nomeTrabalhador: string;
  chavePix: string;
  quitadoPor: string;
  dataHoraQuitacao: string;
  itens: ItemReciboLiquidacao[];
  observacao?: string;
}

function sanitizePdfText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function formatBRLPlain(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

/**
 * Gera o Comprovante Detalhado Individual de Liquidação PIX (Prompt 7) em PDF A4 Retrato (595 x 842 pt)
 * retornando Base64, Buffer (para upload no R2), nome do arquivo e hash SHA-256 pericial.
 */
export function gerarPdfReciboLiquidacao(params: GerarReciboLiquidacaoParams): {
  base64: string;
  buffer: Buffer;
  fileName: string;
  sha256: string;
  totalBruto: number;
  totalVales: number;
  totalLiquido: number;
  resumoTextoWhatsApp: string;
} {
  const pontos = params.itens.filter((i) => i.tipo === 'PONTO');
  const vales = params.itens.filter((i) => i.tipo === 'VALE');

  const totalBruto = Number(
    pontos.reduce((acc, p) => acc + Number(p.valor || 0), 0).toFixed(2)
  );
  const totalVales = Number(
    vales.reduce((acc, v) => acc + Number(v.valor || 0), 0).toFixed(2)
  );
  const totalLiquido = Math.max(0, Number((totalBruto - totalVales).toFixed(2)));
  const totalDias = Number(
    pontos.reduce((acc, p) => acc + Number(p.fracao || 0), 0).toFixed(2)
  );

  const sha256 = crypto
    .createHash('sha256')
    .update(
      `${params.empresaRazaoSocial}|${params.nomeTrabalhador}|${totalLiquido.toFixed(2)}|${params.dataHoraQuitacao}|${params.itens.length}`
    )
    .digest('hex');

  const ops: string[] = ['BT'];
  let y = 800;

  const writeLine = (
    texto: string,
    font: 'F1' | 'F2' = 'F1',
    size = 9,
    x = 40,
    stepY = 14
  ) => {
    if (y < 45) return;
    ops.push(`/${font} ${size} Tf`);
    ops.push(`1 0 0 1 ${x} ${y} Tm`);
    ops.push(`(${sanitizePdfText(texto)}) Tj`);
    y -= stepY;
  };

  // Cabeçalho
  writeLine(params.empresaRazaoSocial.toUpperCase(), 'F2', 13, 40, 16);
  writeLine(
    'COMPROVANTE DETALHADO INDIVIDUAL DE LIQUIDACAO PIX',
    'F2',
    10,
    40,
    18
  );
  writeLine(
    '--------------------------------------------------------------------------------',
    'F1',
    8,
    40,
    14
  );
  writeLine(`Colaborador: ${params.nomeTrabalhador}`, 'F2', 10, 40, 14);
  writeLine(`Chave PIX:   ${params.chavePix || 'Nao informada'}`, 'F1', 9, 40, 14);
  writeLine(`Quitado por: ${params.quitadoPor} em ${params.dataHoraQuitacao}`, 'F1', 9, 40, 14);
  writeLine(`Hash SHA256: ${sha256.slice(0, 32)}`, 'F1', 8, 40, 18);

  // Diárias liquidadas
  writeLine(`1. DIARIAS LIQUIDADAS (${totalDias} dia(s))`, 'F2', 10, 40, 14);
  writeLine(
    'DATA        OBRA                      FRACAO   VALOR          REGRA / OBS',
    'F2',
    8,
    40,
    12
  );
  for (const p of pontos) {
    const linha =
      `${p.data.padEnd(11, ' ')} ` +
      `${p.obra.slice(0, 24).padEnd(25, ' ')} ` +
      `${(String(p.fracao) + 'd').padEnd(8, ' ')} ` +
      `${formatBRLPlain(p.valor).padEnd(14, ' ')} ` +
      `${p.descricao.slice(0, 26)}`;
    writeLine(linha, 'F1', 8, 40, 12);
  }
  if (pontos.length === 0) {
    writeLine('Nenhuma diaria vinculada neste recibo.', 'F1', 8, 40, 12);
  }
  y -= 8;

  // Vales deduzidos
  writeLine(`2. VALES ABATIDOS (${vales.length} lancamento(s))`, 'F2', 10, 40, 14);
  if (vales.length > 0) {
    for (const v of vales) {
      const linha =
        `${v.data.padEnd(11, ' ')} ` +
        `${v.obra.slice(0, 24).padEnd(25, ' ')} ` +
        `${'- ' + formatBRLPlain(v.valor).padEnd(14, ' ')} ` +
        `${v.descricao.slice(0, 30)}`;
      writeLine(linha, 'F1', 8, 40, 12);
    }
  } else {
    writeLine('Nenhum vale deduzido nesta liquidacao.', 'F1', 8, 40, 12);
  }

  y -= 10;
  writeLine(
    '--------------------------------------------------------------------------------',
    'F1',
    8,
    40,
    14
  );
  writeLine(`TOTAL BRUTO DIARIAS:  ${formatBRLPlain(totalBruto)}`, 'F2', 10, 40, 14);
  writeLine(`TOTAL VALES ABATIDOS: - ${formatBRLPlain(totalVales)}`, 'F2', 10, 40, 14);
  writeLine(
    `VALOR LIQUIDO PAGO VIA PIX: ${formatBRLPlain(totalLiquido)}`,
    'F2',
    12,
    40,
    18
  );

  if (params.observacao) {
    writeLine(`Obs.: ${params.observacao.slice(0, 90)}`, 'F1', 8, 40, 14);
  }

  writeLine(
    'Nota: Esta quitacao encerra exclusivamente os lancamentos listados acima.',
    'F1',
    8,
    40,
    12
  );
  writeLine(
    'Novos apontamentos posteriores iniciam automaticamente um novo ciclo em aberto.',
    'F1',
    8,
    40,
    12
  );

  ops.push('ET');
  const streamContent = ops.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
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
  const slugTrab = params.nomeTrabalhador
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const dataCurta = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
  const fileName = `Recibo-PIX-${slugTrab}-${dataCurta}.pdf`;

  const resumoTextoWhatsApp =
    `🧾 *COMPROVANTE DETALHADO DE PAGAMENTO PIX*\n` +
    `*${params.empresaRazaoSocial}*\n` +
    `--------------------------------------\n` +
    `👤 *Colaborador:* ${params.nomeTrabalhador}\n` +
    `📅 *Diárias Liquidadas:* ${totalDias}d (${formatBRLPlain(totalBruto)})\n` +
    `💸 *Vales Abatidos:* - ${formatBRLPlain(totalVales)}\n` +
    `✅ *Líquido Pago via PIX:* *${formatBRLPlain(totalLiquido)}*\n` +
    `🕒 *Quitado em:* ${params.dataHoraQuitacao}\n` +
    `🔐 *Autenticação:* \`${sha256.slice(0, 16)}\``;

  return {
    base64: buffer.toString('base64'),
    buffer,
    fileName,
    sha256,
    totalBruto,
    totalVales,
    totalLiquido,
    resumoTextoWhatsApp,
  };
}
