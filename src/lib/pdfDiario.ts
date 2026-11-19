import type { DiarioObraRegistro } from '@/app/api/diario-obra/route';

function sanitizePdfText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function wrapLines(text: string, maxChars: number): string[] {
  const result: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      result.push('');
      continue;
    }
    let current = '';
    for (const w of words) {
      if ((current + ' ' + w).trim().length <= maxChars) {
        current = (current + ' ' + w).trim();
      } else {
        if (current) result.push(current);
        current = w;
      }
    }
    if (current) result.push(current);
  }
  return result;
}

/**
 * Gera um PDF válido em Base64 do Diário de Obra (sem dependências nativas pesadas),
 * pronto para envio direto via WhatsApp (Baileys / Evolution API) ou download.
 */
export function gerarPdfDiarioBase64(diario: DiarioObraRegistro): {
  base64: string;
  fileName: string;
} {
  const lines: Array<{ text: string; size: number; bold?: boolean }> = [];

  lines.push({
    text: `${diario.empresaNome.toUpperCase()} - RELATORIO DIARIO DE OBRA (RDO)`,
    size: 14,
    bold: true,
  });
  lines.push({ text: '--------------------------------------------------------------------', size: 10 });
  lines.push({ text: `Obra: ${diario.obraNome}`, size: 11, bold: true });
  lines.push({
    text: `Data: ${diario.data}  |  ${
      diario.ambiente === 'INTERNO'
        ? `Condominio/Acesso: ${diario.statusCondominio || 'Acesso Normal'}`
        : `Clima: ${diario.clima}`
    }`,
    size: 10,
  });
  if (diario.empreiteiro) {
    lines.push({ text: `Empreiteiro / Equipe: ${diario.empreiteiro}`, size: 10 });
  }
  lines.push({ text: '', size: 8 });
  lines.push({
    text: `EFETIVO PRESENTE (${diario.efetivo.length} profissional(is)):`,
    size: 11,
    bold: true,
  });

  if (diario.efetivo.length === 0) {
    lines.push({ text: '- Nenhum profissional registrado.', size: 10 });
  } else {
    for (const e of diario.efetivo) {
      const p = e.periodo === 'INTEGRAL' ? 'Dia Inteiro' : 'Meio Dia';
      lines.push({ text: `- ${e.nome} (${p})`, size: 10 });
    }
  }

  lines.push({ text: '', size: 8 });
  lines.push({ text: 'RESUMO DAS ATIVIDADES:', size: 11, bold: true });
  for (const l of wrapLines(diario.resumo || 'Sem resumo informado.', 82)) {
    lines.push({ text: l, size: 10 });
  }

  if (diario.ocorrencias) {
    lines.push({ text: '', size: 8 });
    lines.push({ text: 'OCORRENCIAS / PENDENCIAS:', size: 11, bold: true });
    for (const l of wrapLines(diario.ocorrencias, 82)) {
      lines.push({ text: l, size: 10 });
    }
  }

  lines.push({ text: '', size: 8 });
  lines.push({
    text: `Registro Fotografico: ${diario.fotos.length} foto(s) arquivada(s) no sistema.`,
    size: 10,
  });
  lines.push({
    text: `Emitido por: ${diario.criadoPor} em ${new Date(diario.criadoEm).toLocaleString('pt-BR')}`,
    size: 9,
  });

  // Montar stream de conteúdo PDF (A4: 595 x 842 pt)
  let y = 795;
  const streamOps: string[] = ['BT'];
  for (const line of lines) {
    if (y < 55) break;
    const font = line.bold ? '/F2' : '/F1';
    streamOps.push(`${font} ${line.size} Tf`);
    streamOps.push(`1 0 0 1 45 ${y} Tm`);
    streamOps.push(`(${sanitizePdfText(line.text)}) Tj`);
    y -= line.size + 6;
  }
  streamOps.push('ET');
  const streamContent = streamOps.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
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

  const safeObra = diario.obraNome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    base64: Buffer.from(pdf, 'utf8').toString('base64'),
    fileName: `RDO-${diario.tenantSlug}-${safeObra}-${diario.data}.pdf`,
  };
}
