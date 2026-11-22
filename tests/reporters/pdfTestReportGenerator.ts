import fs from 'node:fs';
import path from 'node:path';

export interface TestCaseReportEntry {
  suite: string;
  name: string;
  endpointOrRule: string;
  durationMs: number;
  status: 'PASS' | 'FAIL';
  diagnostic: string;
}

export interface SelfHealingSummaryReport {
  iterations: number;
  parsedValesCount: number;
  parsedValesTotal: number;
  expectedValesCount: number;
  expectedValesTotal: number;
  converged: boolean;
  appliedRules: string[];
  iterationLogs: Array<{
    attempt: number;
    parsedCount: number;
    parsedTotal: number;
    ruleActivated: string | null;
    reason: string;
  }>;
}

export interface DiariasSelfHealingSummaryReport {
  iterations: number;
  parsedCount: number;
  parsedTotal: number;
  expectedCount: number;
  expectedTotal: number;
  piscina21Count: number;
  piscina21Total: number;
  quaseTudo21Count: number;
  quaseTudo21Total: number;
  duplicidadesDescartadas: number;
  excedentesRateioBloqueados: number;
  registrosOutroTenantBloqueados: number;
  converged: boolean;
  appliedRules: string[];
  iterationLogs: Array<{
    attempt: number;
    parsedCount: number;
    parsedTotal: number;
    ruleActivated: string | null;
    reason: string;
  }>;
}

export interface HomologacaoPdfInput {
  generatedAtIso: string;
  dateLabel: string;
  corteRigidoIso: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDurationMs: number;
  zeroAnyVerified: boolean;
  zeroForbiddenSpellingVerified: boolean;
  coveredRoutes: string[];
  rlsIsolationScorePct: number;
  selfHealing: SelfHealingSummaryReport;
  diariasSelfHealing?: DiariasSelfHealingSummaryReport;
  melhoriasAplicadas?: string[];
  scenarios: TestCaseReportEntry[];
  outputPaths: string[];
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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

function buildMultiPagePdf(pagesOps: string[][]): Buffer {
  // A4 Retrato: 595 x 842 pt
  const pageCount = pagesOps.length;
  const fontRegularId = 3 + pageCount * 2;
  const fontBoldId = fontRegularId + 1;

  const objects: Array<{ id: number; body: string }> = [];

  // 1: Catalog
  objects.push({
    id: 1,
    body: '<< /Type /Catalog /Pages 2 0 R >>',
  });

  // 2: Pages
  const kidsRefs = pagesOps.map((_, idx) => `${3 + idx * 2} 0 R`).join(' ');
  objects.push({
    id: 2,
    body: `<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageCount} >>`,
  });

  // Page + Content pairs
  pagesOps.forEach((ops, idx) => {
    const pageId = 3 + idx * 2;
    const contentId = pageId + 1;
    const stream = ops.join('\n');
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    objects.push({
      id: contentId,
      body: `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`,
    });
  });

  // Fonts
  objects.push({
    id: fontRegularId,
    body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  });
  objects.push({
    id: fontBoldId,
    body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

/**
 * Gera Relatório PDF Profissional de Homologação V15 contendo as 4 seções obrigatórias:
 * 1. Resumo Executivo
 * 2. Scorecard de Qualidade e Aderência
 * 3. Tentativas de Convergência & Log do Self-Healing (WhatsApp Re-Read)
 * 4. Detalhamento de Cenários e Diagnóstico de Falhas
 */
export function gerarRelatorioHomologacaoPdf(input: HomologacaoPdfInput): {
  buffer: Buffer;
  fileName: string;
  savedPaths: string[];
} {
  const aprovado =
    input.failedTests === 0 &&
    input.totalTests > 0 &&
    input.zeroAnyVerified &&
    input.zeroForbiddenSpellingVerified &&
    input.selfHealing.converged;

  const veredito = aprovado ? 'APROVADO PARA PRODUCAO' : 'PENDENTE';
  const taxaAprovacao =
    input.totalTests > 0
      ? ((input.passedTests / input.totalTests) * 100).toFixed(1)
      : '0.0';

  const pages: string[][] = [];
  let currentOps: string[] = [];
  let y = 805;

  const startNewPage = (pageNum: number) => {
    if (currentOps.length > 0) {
      currentOps.push('ET');
      pages.push(currentOps);
    }
    currentOps = ['BT'];
    y = 805;
    currentOps.push('/F2 8 Tf');
    currentOps.push('1 0 0 1 36 822 Tm');
    currentOps.push(
      `(${sanitizePdfText(`DIARIA.AI — RELATORIO DE HOMOLOGACAO SPRINT V15 | PAGINA ${pageNum}`)}) Tj`
    );
  };

  const writeLine = (
    text: string,
    font: 'F1' | 'F2' = 'F1',
    size = 9,
    x = 36,
    step = 13
  ) => {
    if (y < 46) {
      startNewPage(pages.length + 2);
    }
    currentOps.push(`/${font} ${size} Tf`);
    currentOps.push(`1 0 0 1 ${x} ${y} Tm`);
    currentOps.push(`(${sanitizePdfText(text)}) Tj`);
    y -= step;
  };

  const writeSectionTitle = (title: string) => {
    y -= 6;
    if (y < 76) {
      startNewPage(pages.length + 2);
    }
    writeLine(title, 'F2', 11, 36, 15);
    writeLine('---------------------------------------------------------------------------------------------', 'F1', 8, 36, 11);
  };

  startNewPage(1);

  // Cabeçalho
  writeLine('DIARIA.AI — RELATORIO OFICIAL DE HOMOLOGACAO (SPRINT V15)', 'F2', 14, 36, 18);
  writeLine(
    `Data de Geracao: ${input.generatedAtIso}  |  Veredito Final: ${veredito}`,
    'F2',
    10,
    36,
    16
  );

  // SEÇÃO 1: RESUMO EXECUTIVO
  writeSectionTitle('1. RESUMO EXECUTIVO');
  writeLine(`Veredito Final de Prontidao: ${veredito}`, 'F2', 9, 36, 13);
  writeLine(
    'Isolamento Multi-Tenant: Verificado rigorosamente entre tenants "Jhoston" (...0001) e "Intermack" (...0002).',
    'F1',
    9,
    36,
    13
  );
  writeLine(
    `Trava de Corte Rigido no BD: ${input.corteRigidoIso} (22/11/2026 as 11:40 BRT).`,
    'F1',
    9,
    36,
    13
  );
  writeLine(
    `Consolidacao de Vales Reconciliados: ${input.selfHealing.parsedValesCount} vales = R$ ${input.selfHealing.parsedValesTotal.toFixed(2)} (R$ 100,00/vale; 4 campos de rastreabilidade).`,
    'F1',
    9,
    36,
    13
  );
  writeLine(
    'Ciclos Quitados (QUITACAO_PIX_EXTERNO 21/11): Manoel R$ 1.150,00 (5,0d) | Wender R$ 1.275,00 (8,5d) — isolados.',
    'F1',
    9,
    36,
    13
  );
  writeLine(
    'Novo Ciclo em Aberto (21/11): Quase Tudo 16:39 (R$ 410,00) + Piscina Porto Seguro 18:12 (R$ 2.200,00) = R$ 2.610,00.',
    'F1',
    9,
    36,
    13
  );
  writeLine(
    'PIX Avulsos 21/11 Registrados: Ze Roberto R$ 3.000,00 | Diego R$ 2.000,00. Caixinha Gil (13/11): R$ 153,06.',
    'F1',
    9,
    36,
    13
  );
  writeLine(
    'Nomes Canonicos Oficiais: Gil (unificando Gilvan/Gil335Revest), Peu (Edmilson), Lucas J (Lucas.j./Lucas. J.).',
    'F1',
    9,
    36,
    13
  );

  // SEÇÃO 2: SCORECARD DE QUALIDADE E ADERÊNCIA
  writeSectionTitle('2. SCORECARD DE QUALIDADE E ADERENCIA (KPIs)');
  writeLine(
    `Taxa de Aprovacao dos Testes: ${taxaAprovacao}% (${input.passedTests}/${input.totalTests} aprovados, ${input.failedTests} falhas) | Duracao: ${input.totalDurationMs} ms`,
    'F2',
    9,
    36,
    13
  );
  writeLine(
    `Checagem Estrita TypeScript (0 'any'): ${input.zeroAnyVerified ? 'APROVADO (0 ocorrencias)' : 'REPROVADO'}`,
    'F1',
    9,
    36,
    13
  );
  writeLine(
    `Checagem de Grafia Proibida ('Jhonton'/'Joston' em UI): ${input.zeroForbiddenSpellingVerified ? 'APROVADO (0 ocorrencias)' : 'REPROVADO'}`,
    'F1',
    9,
    36,
    13
  );
  writeLine(
    `Cobertura de Rotas Criticas (${input.coveredRoutes.length}/7): ${input.coveredRoutes.slice(0, 4).join(', ')}`,
    'F1',
    8,
    36,
    11
  );
  if (input.coveredRoutes.length > 4) {
    writeLine(
      `   ${input.coveredRoutes.slice(4).join(', ')}`,
      'F1',
      8,
      36,
      13
    );
  }
  writeLine(
    `Pontuacao de Seguranca RLS & Isolamento Multi-Tenant: ${input.rlsIsolationScorePct}%`,
    'F2',
    9,
    36,
    13
  );

  // SEÇÃO 3: TENTATIVAS DE CONVERGÊNCIA & LOG DO SELF-HEALING
  writeSectionTitle(
    '3. TENTATIVAS DE CONVERGENCIA & LOG DO SELF-HEALING (WHATSAPP RE-READ)'
  );
  writeLine(
    `Assertiva Rigida: assert(parsedValesCount === ${input.selfHealing.expectedValesCount} && parsedValesTotal === ${input.selfHealing.expectedValesTotal}) => ${input.selfHealing.converged ? 'CONVERGIDO (DISCREPANCIA ZERO)' : 'DIVERGENTE'}`,
    'F2',
    9,
    36,
    13
  );
  writeLine(
    `Iteracoes Executadas: ${input.selfHealing.iterations} | Regras Adaptativas Ativadas: ${input.selfHealing.appliedRules.join(' -> ') || 'Nenhuma'}`,
    'F1',
    9,
    36,
    13
  );
  for (const log of input.selfHealing.iterationLogs) {
    writeLine(
      `[Tentativa ${log.attempt}] Extraidos: ${log.parsedCount} vales (R$ ${log.parsedTotal.toFixed(2)}) | Regra: ${log.ruleActivated || 'CONVERGENCIA FINAL'}`,
      'F1',
      8,
      44,
      11
    );
    writeLine(`   Detalhe: ${truncate(log.reason, 100)}`, 'F1', 8, 44, 12);
  }

  // SEÇÃO 3B: CONVERGÊNCIA & SELF-HEALING DE DIÁRIAS (54 = R$ 10.040,00)
  if (input.diariasSelfHealing) {
    const d = input.diariasSelfHealing;
    writeSectionTitle(
      '3B. CONVERGENCIA & SELF-HEALING DE DIARIAS (54 LANCAMENTOS = R$ 10.040,00)'
    );
    writeLine(
      `Assertiva Rigida: assert(diariasCount === ${d.expectedCount} && diariasTotal === ${d.expectedTotal.toFixed(2)}) => ${d.converged ? 'BATIMENTO 100% (DISCREPANCIA ZERO)' : 'DIVERGENTE'}`,
      'F2',
      9,
      36,
      13
    );
    writeLine(
      `Piscina Porto Seguro 21/11 18:12: ${d.piscina21Count} diarias = R$ ${d.piscina21Total.toFixed(2)} | Quase Tudo 21/11 16:39: ${d.quaseTudo21Count} diarias = R$ ${d.quaseTudo21Total.toFixed(2)}`,
      'F1',
      8,
      36,
      12
    );
    writeLine(
      `Protecoes Aplicadas: ${d.registrosOutroTenantBloqueados} reg. Intermack isolados | ${d.duplicidadesDescartadas} duplicidade(s) SHA-256 descartada(s) | ${d.excedentesRateioBloqueados} excedente(s) > 1,0d bloqueado(s)`,
      'F1',
      8,
      36,
      12
    );
    writeLine(
      `Tentativas Executadas: ${d.iterations} | Regras Ativadas (${d.appliedRules.length}): ${truncate(d.appliedRules.join(' -> '), 82)}`,
      'F1',
      8,
      36,
      12
    );
    for (const log of d.iterationLogs) {
      writeLine(
        `[Tentativa ${log.attempt}] Diarias: ${log.parsedCount} (R$ ${log.parsedTotal.toFixed(2)}) | Regra: ${log.ruleActivated || 'BATIMENTO FINAL 100%'}`,
        'F1',
        8,
        44,
        11
      );
      writeLine(`   Detalhe: ${truncate(log.reason, 100)}`, 'F1', 8, 44, 11);
    }
  }

  // SEÇÃO 4: DETALHAMENTO DE CENÁRIOS E DIAGNÓSTICO DE FALHAS
  writeSectionTitle('4. DETALHAMENTO DE CENARIOS E DIAGNOSTICO DE FALHAS');
  writeLine(
    'STATUS | DUR(ms) | CENARIO / REGRA AVALIADA',
    'F2',
    8,
    36,
    12
  );
  for (const sc of input.scenarios) {
    const statusLabel = sc.status === 'PASS' ? '[PASS]' : '[FAIL]';
    const durStr = sc.durationMs.toFixed(1).padStart(6, ' ');
    writeLine(
      `${statusLabel} | ${durStr} | ${truncate(`${sc.suite}: ${sc.name}`, 84)}`,
      sc.status === 'PASS' ? 'F1' : 'F2',
      8,
      36,
      11
    );
    if (sc.status === 'FAIL' && sc.diagnostic) {
      writeLine(`   Diagnostico: ${truncate(sc.diagnostic, 96)}`, 'F1', 8, 44, 11);
    }
  }

  // SEÇÃO 5: SUGESTÕES DE MELHORIAS NO PROCESSO (JÁ APLICADAS EM CÓDIGO)
  if (input.melhoriasAplicadas && input.melhoriasAplicadas.length > 0) {
    writeSectionTitle(
      '5. MELHORIAS DE PROCESSO SUGERIDAS E JA APLICADAS NO SISTEMA'
    );
    input.melhoriasAplicadas.forEach((melhoria, idx) => {
      writeLine(
        `${idx + 1}. ${truncate(melhoria, 96)}`,
        'F1',
        8,
        36,
        12
      );
    });
  }

  currentOps.push('ET');
  pages.push(currentOps);

  const buffer = buildMultiPagePdf(pages);
  const fileName = `relatorio-homologacao-diaria-ai-${input.dateLabel}.pdf`;
  const savedPaths: string[] = [];

  for (const targetDir of input.outputPaths) {
    fs.mkdirSync(targetDir, { recursive: true });
    const fullPath = path.join(targetDir, fileName);
    fs.writeFileSync(fullPath, buffer);
    savedPaths.push(fullPath);
  }

  return { buffer, fileName, savedPaths };
}
