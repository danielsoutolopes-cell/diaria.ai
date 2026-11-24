import {
  agruparEfetivoPorEmpreiteiro,
  formatarNomeFuncionarioComMetadados,
  isSubempreitaHabilitada,
  montarTextoOcorrencia,
  sanitizarStatusCondominio,
  type DiarioObraRegistro,
} from '@/lib/diarioObraRelatorio';

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
 * Gera um PDF válido em Base64 do Diário de Obra:
 * - Intermack: agrupa por Empreiteiro / Encarregado exibindo Etapa executada
 *   e relação de funcionários (com apelidos e documento) + filtro opcional.
 * - Jhoston: preserva o formato direto de efetivo sem estrutura de subempreita.
 */
export function gerarPdfDiarioBase64(
  diario: DiarioObraRegistro,
  filtroEmpreiteiro?: string | null
): {
  base64: string;
  fileName: string;
} {
  const subempreitaAtiva = isSubempreitaHabilitada(diario.tenantSlug);
  const ocorrenciaFinal = montarTextoOcorrencia(
    diario.ocorrenciaTipo,
    diario.ocorrencias
  );

  const lines: Array<{ text: string; size: number; bold?: boolean }> = [];

  lines.push({
    text: `${diario.empresaNome.toUpperCase()} - RELATORIO DIARIO DE OBRA (RDO)`,
    size: 13,
    bold: true,
  });
  lines.push({
    text: '-------------------------------------------------------------------------',
    size: 10,
  });
  lines.push({ text: `Obra: ${diario.obraNome}`, size: 11, bold: true });
  lines.push({
    text: `Data: ${diario.data}  |  ${
      diario.ambiente === 'INTERNO'
        ? `Condominio / Acesso: ${sanitizarStatusCondominio(diario.statusCondominio)}`
        : `Clima: ${diario.clima || 'Ensolarado'}`
    }`,
    size: 10,
  });

  if (subempreitaAtiva) {
    const grupos = agruparEfetivoPorEmpreiteiro(diario, filtroEmpreiteiro);
    const totalPresentes = grupos.reduce((acc, g) => acc + g.totalProfissionais, 0);

    if (filtroEmpreiteiro) {
      lines.push({
        text: `Filtro por Empreiteiro / Encarregado: ${filtroEmpreiteiro}`,
        size: 10,
        bold: true,
      });
    }

    lines.push({ text: '', size: 7 });
    lines.push({
      text: `EQUIPES E EFETIVO PRESENTE (${totalPresentes} profissional(is)):`,
      size: 11,
      bold: true,
    });

    if (grupos.length === 0) {
      lines.push({
        text: '- Nenhum profissional encontrado para o filtro selecionado.',
        size: 10,
      });
    } else {
      for (const grupo of grupos) {
        const etapasTxt =
          grupo.etapas.length > 0 ? grupo.etapas.join(', ') : 'Servico geral';
        lines.push({
          text: `Empreiteiro / Encarregado: ${grupo.empreiteiroNome} (${grupo.totalProfissionais} prof. | ${grupo.totalHomensDia.toFixed(1)} H/D)`,
          size: 10,
          bold: true,
        });
        lines.push({
          text: `  Etapa / Frente de Servico: ${etapasTxt}`,
          size: 9,
        });
        if (grupo.funcionarios.length === 0) {
          lines.push({ text: '  - Sem funcionarios listados.', size: 9 });
        } else {
          for (const func of grupo.funcionarios) {
            const periodoTxt =
              func.periodo === 'INTEGRAL' ? 'Dia Inteiro' : 'Meio Dia';
            const etapaDet =
              func.etapaNome && grupo.etapas.length > 1
                ? ` | ${func.etapaNome}`
                : '';
            const linhaFunc = `  - ${formatarNomeFuncionarioComMetadados(func)}${etapaDet} (${periodoTxt})`;
            for (const wrapped of wrapLines(linhaFunc, 86)) {
              lines.push({ text: wrapped, size: 9 });
            }
          }
        }
        lines.push({ text: '', size: 5 });
      }
    }
  } else {
    // Fluxo direto Jhoston (sem subempreita)
    lines.push({ text: '', size: 7 });
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
    lines.push({ text: '', size: 7 });
  }

  lines.push({ text: 'RESUMO DAS ATIVIDADES:', size: 11, bold: true });
  for (const l of wrapLines(diario.resumo || 'Sem resumo informado.', 84)) {
    lines.push({ text: l, size: 10 });
  }

  if (ocorrenciaFinal) {
    lines.push({ text: '', size: 7 });
    lines.push({ text: 'OCORRENCIA / IMPEDIMENTO:', size: 11, bold: true });
    for (const l of wrapLines(ocorrenciaFinal, 84)) {
      lines.push({ text: l, size: 10 });
    }
  }

  lines.push({ text: '', size: 7 });
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
    streamOps.push(`1 0 0 1 42 ${y} Tm`);
    streamOps.push(`(${sanitizePdfText(line.text)}) Tj`);
    y -= line.size + 5;
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
  const safeEmp =
    subempreitaAtiva && filtroEmpreiteiro
      ? `-${filtroEmpreiteiro
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`
      : '';

  return {
    base64: Buffer.from(pdf, 'utf8').toString('base64'),
    fileName: `RDO-${diario.tenantSlug}-${safeObra}${safeEmp}-${diario.data}.pdf`,
  };
}


/**
 * Versão com miniaturas fotográficas embutidas (jsPDF) para download/envio ao cliente.
 * Mantém gerarPdfDiarioBase64 síncrona intacta para retrocompatibilidade.
 */
export async function gerarPdfDiarioComFotosBase64(
  diario: DiarioObraRegistro,
  filtroEmpreiteiro?: string | null
): Promise<{ base64: string; fileName: string }> {
  const { jsPDF } = await import('jspdf');
  const subempreitaAtiva = isSubempreitaHabilitada(diario.tenantSlug);
  const ocorrenciaFinal = montarTextoOcorrencia(
    diario.ocorrenciaTipo,
    diario.ocorrencias
  );

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 14;

  const checkPage = (need = 10) => {
    if (y + need > 282) {
      doc.addPage();
      y = 14;
    }
  };

  // Cabeçalho
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(
    sanitizePdfText(`${diario.empresaNome.toUpperCase()} - RELATORIO DIARIO DE OBRA (RDO)`),
    12,
    11
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    sanitizePdfText(
      `Obra: ${diario.obraNome}  |  Data: ${diario.data}  |  ${
        diario.ambiente === 'INTERNO'
          ? `Acesso: ${sanitizarStatusCondominio(diario.statusCondominio)}`
          : `Clima: ${diario.clima || 'Ensolarado'}`
      }`
    ),
    12,
    18
  );

  y = 32;
  doc.setTextColor(15, 23, 42);

  // Equipes / Efetivo
  if (subempreitaAtiva) {
    const grupos = agruparEfetivoPorEmpreiteiro(diario, filtroEmpreiteiro);
    const totalPresentes = grupos.reduce((a, g) => a + g.totalProfissionais, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(
      sanitizePdfText(`EQUIPES E EFETIVO PRESENTE (${totalPresentes} profissional(is))`),
      12,
      y
    );
    y += 6;

    for (const grupo of grupos) {
      checkPage(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(
        sanitizePdfText(
          `${grupo.empreiteiroNome} (${grupo.totalProfissionais} prof. | ${grupo.totalHomensDia.toFixed(1)} H/D) — Etapa: ${grupo.etapas.join(', ') || 'Geral'}`
        ),
        12,
        y
      );
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      for (const f of grupo.funcionarios) {
        checkPage(6);
        const label = formatarNomeFuncionarioComMetadados(f);
        doc.text(
          sanitizePdfText(`• ${label} (${f.periodo === 'MEIO_DIA' ? 'Meio Dia' : 'Integral'})`),
          16,
          y
        );
        y += 4.8;
      }
      y += 2;
    }
  } else if (Array.isArray(diario.efetivo) && diario.efetivo.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`EFETIVO PRESENTE (${diario.efetivo.length})`, 12, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const f of diario.efetivo) {
      checkPage(6);
      doc.text(
        sanitizePdfText(`• ${f.nome} (${f.periodo === 'MEIO_DIA' ? 'Meio Dia' : 'Integral'})`),
        15,
        y
      );
      y += 4.8;
    }
    y += 3;
  }

  // Resumo
  checkPage(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('RESUMO DAS ATIVIDADES', 12, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  const resumoLinhas = wrapLines(sanitizePdfText(diario.resumo || 'Sem resumo.'), 95);
  for (const linha of resumoLinhas) {
    checkPage(6);
    doc.text(linha, 12, y);
    y += 4.8;
  }

  if (ocorrenciaFinal) {
    y += 4;
    checkPage(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('OCORRENCIAS / IMPEDIMENTOS', 12, y);
    y += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    for (const linha of wrapLines(sanitizePdfText(ocorrenciaFinal), 95)) {
      checkPage(6);
      doc.text(linha, 12, y);
      y += 4.8;
    }
  }

  // Miniaturas fotográficas (até 3 fotos lado a lado)
  const fotosLista = Array.isArray(diario.fotos) ? diario.fotos.slice(0, 3) : [];
  if (fotosLista.length > 0) {
    y += 6;
    checkPage(58);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`REGISTRO FOTOGRAFICO (${fotosLista.length} foto(s))`, 12, y);
    y += 5;

    const thumbW = 58;
    const thumbH = 44;
    const gap = 6;
    let col = 0;

    for (const fotoUrl of fotosLista) {
      try {
        let dataUrl = '';
        let fmt: 'JPEG' | 'PNG' = 'JPEG';
        if (fotoUrl.startsWith('data:image/')) {
          dataUrl = fotoUrl;
          fmt = fotoUrl.includes('image/png') ? 'PNG' : 'JPEG';
        } else if (fotoUrl.startsWith('http')) {
          const r = await fetch(fotoUrl);
          if (r.ok) {
            const contentType = r.headers.get('content-type') || 'image/jpeg';
            fmt = contentType.includes('png') ? 'PNG' : 'JPEG';
            const buf = Buffer.from(await r.arrayBuffer());
            dataUrl = `data:${contentType};base64,${buf.toString('base64')}`;
          }
        }
        if (dataUrl) {
          const x = 12 + col * (thumbW + gap);
          doc.addImage(dataUrl, fmt, x, y, thumbW, thumbH);
          doc.setDrawColor(203, 213, 225);
          doc.rect(x, y, thumbW, thumbH);
          col++;
        }
      } catch {
        // ignora foto inacessível sem quebrar geração do PDF
      }
    }
    if (col > 0) y += thumbH + 6;
  }

  const slugObra = sanitizePdfText(diario.obraNome || 'obra')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const fileName = `RDO-${diario.tenantSlug}-${slugObra}-${diario.data}.pdf`;
  const base64 = Buffer.from(doc.output('arraybuffer')).toString('base64');
  return { base64, fileName };
}
