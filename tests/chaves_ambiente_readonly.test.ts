import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFINICOES_CHAVES_AMBIENTE,
  mascararValorChave,
  montarListaChavesAmbiente,
} from '../src/lib/chavesAmbiente';

const ROOT = process.cwd();

describe('Chaves de Ambiente & Integrações — Somente Leitura (Super Admin /config-geral)', () => {
  it('1. Mascara segredos por padrão e só inclui valorCompleto quando explicitamente solicitado', () => {
    const fakeEnv: Record<string, string | undefined> = {
      RENDER_APP_URL: 'https://diaria-ai.onrender.com',
      CRON_SECRET: 'super-secret-cron-987654',
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9_abcdef',
      GEMINI_API_KEY: 'AIzaSyTestKey1234567890',
      CLOUDFLARE_R2_ACCOUNT_ID: 'acc-12345',
      CLOUDFLARE_R2_BUCKET_NAME: 'diaria-ai',
      CLOUDFLARE_R2_ACCESS_KEY_ID: 'r2-access-key-0001',
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'r2-secret-key-9999',
    };

    const ocultas = montarListaChavesAmbiente(fakeEnv, false);
    assert.equal(ocultas.length, DEFINICOES_CHAVES_AMBIENTE.length);

    const cronOculto = ocultas.find((c) => c.nome === 'CRON_SECRET');
    assert.ok(cronOculto);
    assert.equal(cronOculto.status, 'CONFIGURADA');
    assert.equal(cronOculto.valorCompleto, undefined);
    assert.equal(cronOculto.valorMascarado, 'supe••••••••7654');

    const renderUrl = ocultas.find((c) => c.nome === 'RENDER_APP_URL');
    assert.ok(renderUrl);
    assert.equal(renderUrl.valorCompleto, 'https://diaria-ai.onrender.com');

    const reveladas = montarListaChavesAmbiente(fakeEnv, true);
    const cronRevelado = reveladas.find((c) => c.nome === 'CRON_SECRET');
    assert.equal(cronRevelado?.valorCompleto, 'super-secret-cron-987654');

    assert.equal(mascararValorChave('', true), '— (não configurada)');
  });

  it('2. Rota /api/config-geral/chaves-ambiente bloqueia não-Super Admin (403) e escrita (405)', () => {
    const routePath = path.join(
      ROOT,
      'src',
      'app',
      'api',
      'config-geral',
      'chaves-ambiente',
      'route.ts'
    );
    const src = fs.readFileSync(routePath, 'utf8');

    assert.match(src, /isDanielOuPatricia/);
    assert.match(src, /status:\s*403/);
    assert.match(src, /status:\s*405/);
    assert.match(src, /export async function POST\s*\(/);
    assert.match(src, /export async function PUT\s*\(/);
    assert.match(src, /export async function PATCH\s*\(/);
    assert.match(src, /export async function DELETE\s*\(/);
    assert.match(src, /baileys_session_state/);
  });

  it('3. Painel é Somente Leitura em /config-geral e nunca aparece em /setup', () => {
    const panelPath = path.join(
      ROOT,
      'src',
      'components',
      'ChavesAmbienteReadOnlyPanel.tsx'
    );
    const configGeralPath = path.join(
      ROOT,
      'src',
      'app',
      'config-geral',
      'page.tsx'
    );
    const setupPath = path.join(ROOT, 'src', 'app', 'setup', 'page.tsx');

    const panelSrc = fs.readFileSync(panelPath, 'utf8');
    const configSrc = fs.readFileSync(configGeralPath, 'utf8');
    const setupSrc = fs.readFileSync(setupPath, 'utf8');

    assert.match(panelSrc, /SOMENTE LEITURA · SUPER ADMIN/);
    assert.match(panelSrc, /readOnly/);
    assert.match(panelSrc, /disabled/);
    assert.doesNotMatch(panelSrc, /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/);
    assert.match(configSrc, /ChavesAmbienteReadOnlyPanel/);
    assert.doesNotMatch(setupSrc, /ChavesAmbienteReadOnlyPanel/);
    assert.doesNotMatch(setupSrc, /chaves-ambiente/);
  });
});
