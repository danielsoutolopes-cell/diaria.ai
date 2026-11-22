import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  deduplicarValesPreservandoMetadados,
  gerarChaveIdempotenciaVale,
  type RegistroValeDeduplicavel,
} from '@/lib/valeIdempotencia';
import { TENANTS } from '@/lib/tenant';

describe('12. Deduplicação de Vales (31 -> 27 = R$ 2.700,00), Idempotência & Dropdown Solicitado por (V17)', () => {
  it('gera chave determinística por tenant_id + trabalhador canônico + data + janela e isola Jhoston vs Intermack', () => {
    const k1 = gerarChaveIdempotenciaVale({
      tenantId: TENANTS.jhoston.id,
      trabalhador: 'Gilvan (Gil)',
      dataReferencia: '2026-11-22',
      janelaSolicitacao: '08:35',
      valor: 100,
    });
    const k2 = gerarChaveIdempotenciaVale({
      tenantId: TENANTS.jhoston.id,
      trabalhador: 'Gil335Revest',
      dataReferencia: '2026-11-22',
      janelaSolicitacao: '08:39', // mesma janela de 15min (08:30)
      valor: 100,
    });
    const kIntermack = gerarChaveIdempotenciaVale({
      tenantId: TENANTS.intermack.id,
      trabalhador: 'Gilvan (Gil)',
      dataReferencia: '2026-11-22',
      janelaSolicitacao: '08:35',
      valor: 100,
    });

    assert.equal(k1, k2);
    assert.notEqual(k1, kIntermack);

    const kLucas1 = gerarChaveIdempotenciaVale({
      tenantId: TENANTS.jhoston.id,
      trabalhador: 'Lucas.j.',
      dataReferencia: '2026-11-20',
      janelaSolicitacao: '17:00',
      valor: 100,
    });
    const kLucas2 = gerarChaveIdempotenciaVale({
      tenantId: TENANTS.jhoston.id,
      trabalhador: 'Lucas J',
      dataReferencia: '2026-11-20',
      janelaSolicitacao: '17:00',
      valor: 100,
    });
    assert.equal(kLucas1, kLucas2);
  });

  it('deduplica registros mantendo os metadados mais completos (comprovante_pix_url, solicitado_por e data_hora_solicitacao)', () => {
    const amostra: RegistroValeDeduplicavel[] = [
      {
        id: 'dup-sem-pix',
        tenant_id: TENANTS.jhoston.id,
        nome_trabalhador: 'DANIEL',
        data_referencia: '2026-11-21',
        valor_monetario: 100,
        horario_origem: '12:37',
        solicitado_por: null,
        comprovante_pix_url: null,
        status: 'PENDENTE',
        created_at: '2026-11-21T15:37:00Z',
      },
      {
        id: 'oficial-com-pix',
        tenant_id: TENANTS.jhoston.id,
        nome_trabalhador: 'Daniel',
        data_referencia: '2026-11-21',
        valor_monetario: 100,
        horario_origem: '12:37',
        solicitado_por: 'Gilvan - Gil',
        data_hora_solicitacao: '2026-11-21T12:37:00-03:00',
        comprovante_pix_url: 'https://r2.diaria.ai/pix-daniel-21-11.jpg',
        status: 'VALIDADO',
        created_at: '2026-11-21T17:05:00Z',
      },
    ];

    const { unicos, duplicadosRemovidos } =
      deduplicarValesPreservandoMetadados(amostra);

    assert.equal(unicos.length, 1);
    assert.equal(duplicadosRemovidos.length, 1);
    assert.equal(unicos[0].id, 'oficial-com-pix');
    assert.equal(unicos[0].solicitado_por, 'Gilvan - Gil');
    assert.ok(unicos[0].comprovante_pix_url);
  });

  it('valida SQL de migração V17 (31 -> 27 vales + índice único) e dropdown Solicitado por em /validacao/vales', () => {
    const repoRoot = process.cwd();
    const sqlPath = path.join(
      repoRoot,
      'supabase/migration_v17_deduplicacao_vales_idempotencia.sql'
    );
    const pagePath = path.join(repoRoot, 'src/app/validacao/vales/page.tsx');
    const routePath = path.join(repoRoot, 'src/app/api/vales/route.ts');

    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.match(sql, /bb91fed5-25e6-4cd5-8d97-c3a1eaaedf9c/);
    assert.match(sql, /86690c22-d3cf-455d-b82a-0c613c3e3a9e/);
    assert.match(sql, /0223d32b-26cc-4415-84c5-73e1b0eda0df/);
    assert.match(sql, /901fa19a-1cd1-4735-bce0-dbcc16475637/);
    assert.match(sql, /idx_lancamentos_vale_idempotencia_janela/);

    const pageCode = fs.readFileSync(pagePath, 'utf8');
    assert.match(pageCode, /aria-label="Solicitado por"/);
    assert.match(pageCode, /useState<string>\('Gilvan - Gil'\)/);
    assert.doesNotMatch(pageCode, /placeholder="Solicitado por\.\.\."/);

    const routeCode = fs.readFileSync(routePath, 'utf8');
    assert.match(routeCode, /solicitantes/);
    assert.match(routeCode, /solicitantePadrao/);
    assert.match(routeCode, /gerarChaveIdempotenciaVale/);
  });
});
