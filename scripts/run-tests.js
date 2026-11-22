const { execFileSync } = require('child_process');
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

try {
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
      files: [path.join(repoRoot, 'tests/pos_quatro_fases_e2e.test.ts')],
    })
  );

  execFileSync('npx', ['tsc', '-p', tsCfgPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  rewriteAliasImports(outDir);

  const testFileCompiled = path.join(
    outDir,
    'tests/pos_quatro_fases_e2e.test.js'
  );

  execFileSync(process.execPath, ['--test', testFileCompiled], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_PATH: path.join(repoRoot, 'node_modules'),
    },
  });
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
