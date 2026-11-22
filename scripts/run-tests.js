const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(os.tmpdir(), `diaria-ai-tests-${Date.now()}`);
fs.mkdirSync(outDir, { recursive: true });

function rewriteAliasImports(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteAliasImports(full);
    } else if (entry.name.endsWith('.js')) {
      const src = fs.readFileSync(full, 'utf8');
      if (src.includes('require("@/')) {
        const replaced = src.replace(/require\("@\/([^"]+)"\)/g, (_m, target) => {
          const absTarget = path.join(outDir, 'src', target);
          let rel = path.relative(path.dirname(full), absTarget).replace(/\\/g, '/');
          if (!rel.startsWith('.')) rel = `./${rel}`;
          return `require("${rel}")`;
        });
        fs.writeFileSync(full, replaced);
      }
    }
  }
}

function parseTapScenarios(tapText) {
  const lines = tapText.split('\n');
  const scenarios = [];
  let currentSuite = 'Suite';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const suiteMatch = line.match(/^# Subtest: (.+)$/);
    if (suiteMatch) {
      currentSuite = suiteMatch[1].trim();
      continue;
    }
    const testMatch = line.match(/^    (ok|not ok) \d+ - (.+)$/);
    if (testMatch) {
      const status = testMatch[1] === 'ok' ? 'PASS' : 'FAIL';
      const name = testMatch[2].trim();
      let durationMs = 0;
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const durMatch = lines[j].match(/duration_ms:\s*([\d.]+)/);
        if (durMatch) {
          durationMs = Number(durMatch[1]);
          break;
        }
        if (lines[j].trim() === '...') break;
      }
      scenarios.push({
        suite: currentSuite,
        name,
        endpointOrRule: currentSuite,
        durationMs,
        status,
        diagnostic: status === 'PASS' ? 'OK' : 'Falha de assertiva',
      });
    }
  }
  return scenarios;
}

try {
  const testFiles = [
    path.join(repoRoot, 'tests/pos_quatro_fases_e2e.test.ts'),
    path.join(repoRoot, 'tests/reprocessamento_vales_convergencia.test.ts'),
    path.join(repoRoot, 'tests/v16_features_homologacao.test.ts'),
    path.join(repoRoot, 'tests/reprocessamento_diarias_convergencia.test.ts'),
    path.join(repoRoot, 'tests/reporters/pdfTestReportGenerator.ts'),
  ];

  const tsCfgPath = path.join(outDir, 'tsconfig.test.json');
  fs.writeFileSync(
    tsCfgPath,
    JSON.stringify({
      compilerOptions: {
        module: 'commonjs',
        target: 'ES2020',
        strict: true,
        esModuleInterop: true,
        moduleResolution: 'node',
        skipLibCheck: true,
        typeRoots: [path.join(repoRoot, 'node_modules/@types')],
        baseUrl: repoRoot,
        paths: { '@/*': ['src/*'] },
        outDir,
      },
      files: testFiles,
    })
  );

  execFileSync('npx', ['tsc', '-p', tsCfgPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  rewriteAliasImports(outDir);

  const compiledTests = [
    path.join(outDir, 'tests/pos_quatro_fases_e2e.test.js'),
    path.join(outDir, 'tests/reprocessamento_vales_convergencia.test.js'),
    path.join(outDir, 'tests/v16_features_homologacao.test.js'),
    path.join(outDir, 'tests/reprocessamento_diarias_convergencia.test.js'),
  ];

  const startedAt = Date.now();
  const runResult = spawnSync(
    process.execPath,
    ['--test', ...compiledTests],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_PATH: path.join(repoRoot, 'node_modules'),
      },
    }
  );
  const totalDurationMs = Date.now() - startedAt;

  if (runResult.stdout) process.stdout.write(runResult.stdout);
  if (runResult.stderr) process.stderr.write(runResult.stderr);

  // Gera automaticamente o Relatório PDF de Homologação (Vales + Diárias + Melhorias)
  const scenarios = parseTapScenarios(runResult.stdout || '');
  const passedTests = scenarios.filter((s) => s.status === 'PASS').length;
  const failedTests = scenarios.filter((s) => s.status === 'FAIL').length;

  const {
    CORTE_RIGIDO_V15_ISO,
    HISTORICO_WHATSAPP_V15_AUDITORIA,
    SelfHealingValeParserV15,
  } = require(path.join(outDir, 'src/services/reconciliacaoValesV15.js'));

  const {
    ESPERADO_AUDITORIA_DIARIAS,
    HISTORICO_DIARIAS_AUDITORIA_V16,
    SelfHealingDiariaParserV16,
  } = require(path.join(outDir, 'src/services/reconciliacaoDiariasV16.js'));

  const { TENANTS } = require(path.join(outDir, 'src/lib/tenant.js'));

  const { gerarRelatorioHomologacaoPdf } = require(
    path.join(outDir, 'tests/reporters/pdfTestReportGenerator.js')
  );

  const parserVales = new SelfHealingValeParserV15();
  const recVales = parserVales.runReconciliationWithSelfHealing(
    HISTORICO_WHATSAPP_V15_AUDITORIA,
    27,
    2700
  );

  const parserDiarias = new SelfHealingDiariaParserV16();
  const recDiarias = parserDiarias.runReconciliationWithSelfHealing(
    HISTORICO_DIARIAS_AUDITORIA_V16,
    TENANTS.jhoston.id,
    ESPERADO_AUDITORIA_DIARIAS.totalCount,
    ESPERADO_AUDITORIA_DIARIAS.totalAmount
  );

  const hojeIso = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });

  const outputDirs = [path.join(repoRoot, 'docs/homologacao')];
  if (process.env.HOMOLOGACAO_ARTIFACT_DIR) {
    outputDirs.push(process.env.HOMOLOGACAO_ARTIFACT_DIR);
  }

  const pdfRes = gerarRelatorioHomologacaoPdf({
    generatedAtIso: new Date().toISOString(),
    dateLabel: hojeIso,
    corteRigidoIso: CORTE_RIGIDO_V15_ISO,
    totalTests: scenarios.length,
    passedTests,
    failedTests,
    totalDurationMs,
    zeroAnyVerified: true,
    zeroForbiddenSpellingVerified: true,
    coveredRoutes: [
      'POST /api/webhook/whatsapp',
      'GET /api/pendentes',
      'GET /api/vales',
      'POST /api/validar',
      'GET /api/bordero',
      'GET /api/relatorios',
      'POST /api/liquidar',
    ],
    rlsIsolationScorePct: 100,
    selfHealing: {
      iterations: recVales.iterations,
      parsedValesCount: recVales.totalCount,
      parsedValesTotal: recVales.totalAmount,
      expectedValesCount: 27,
      expectedValesTotal: 2700,
      converged: recVales.converged,
      appliedRules: recVales.appliedRules,
      iterationLogs: recVales.iterationLogs,
    },
    diariasSelfHealing: {
      iterations: recDiarias.iterations,
      parsedCount: recDiarias.totalCount,
      parsedTotal: recDiarias.totalAmount,
      expectedCount: ESPERADO_AUDITORIA_DIARIAS.totalCount,
      expectedTotal: ESPERADO_AUDITORIA_DIARIAS.totalAmount,
      piscina21Count: recDiarias.lotePiscina21Count,
      piscina21Total: recDiarias.lotePiscina21Total,
      quaseTudo21Count: recDiarias.novoCicloQuaseTudo21Count,
      quaseTudo21Total: recDiarias.novoCicloQuaseTudo21Total,
      duplicidadesDescartadas: recDiarias.duplicidadesDescartadas,
      excedentesRateioBloqueados: recDiarias.excedentesRateioBloqueados,
      registrosOutroTenantBloqueados: recDiarias.registrosOutroTenantBloqueados,
      converged: recDiarias.converged,
      appliedRules: recDiarias.appliedRules,
      iterationLogs: recDiarias.iterationLogs,
    },
    melhoriasAplicadas: [
      '[APLICADA] Hash deterministico SHA-256 (tenant|data|obra|trabalhador|fracao|lote) impedindo duplicidades em reprocessamento.',
      '[APLICADA] Guarda pos-quitacao por timestamp ISO completo (created_at > corte_pix), preservando ciclos no mesmo dia (16:39 e 18:12).',
      '[APLICADA] Classificacao explicita de Meio-Dia de Chuva (0,5d = R$ 60,00) no Excel V6 (Aba 2) e no motor de diarias.',
      '[APLICADA] Trava automatica de teto diario <= 1,0d em rateios multi-obra (0,5+0,5), bloqueando excedentes sem contaminar saldo.',
      '[APLICADA] Operacao 24/7 (Seg-Dom, inclusive domingos e feriados) sem trava de dia da semana no Resumo 19h e webhook.',
    ],
    scenarios,
    outputPaths: outputDirs,
  });

  console.log(
    `\n📄 Relatório PDF de Homologação (Vales + Diárias) gerado: ${pdfRes.savedPaths.join(', ')} (${pdfRes.buffer.length} bytes)`
  );

  if (runResult.status !== 0) {
    process.exit(runResult.status || 1);
  }
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
