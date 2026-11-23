import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  consolidarContasCaixinha,
  deduplicarMovimentosCaixinha,
  isLancamentoSinteticoConsolidado,
  type MovimentoCaixaCampo,
} from '@/lib/caixinhaDeduplicacao';

describe('Caixinha de Campo V21 — Anti-Duplicidade do Gil & Unificação no Menu', () => {
  it('1. Elimina dupla contagem entre consolidado sintético pré-implantação (SQL) e os 12 lançamentos itemizados reais (JSONB)', () => {
    // Reproduz o bug exato auditado (R$ 1.400,00 / R$ 1.091,56 / R$ 308,44)
    const movimentosSqlSinteticos: MovimentoCaixaCampo[] = [
      {
        id: '91568b3a-c054-4ced-93bd-0ebd66f757ce',
        encarregado: 'Gil',
        encarregadoOrigem: 'Gil / Gil335Revest',
        obra: 'PISCINA PORTO SEGURO',
        data: '2026-11-13',
        hora: '09:00',
        tipo: 'ENTRADA_PIX',
        categoria: 'Suprimento PIX',
        descricao:
          'Entradas PIX consolidadas (Pré-implantação 13/11 — Gil + Gil335Revest)',
        valor: 700.0,
        status: 'APROVADO',
        isPreImplantacao: true,
        enviadoPor: 'Patrícia Grubel',
        criadoEm: '2026-11-13T12:00:00.000Z',
      },
      {
        id: '6001dc0f-14ff-44c0-9175-75f6d6069b49',
        encarregado: 'Gil',
        encarregadoOrigem: 'Gil / Gil335Revest',
        obra: 'PISCINA PORTO SEGURO',
        data: '2026-11-13',
        hora: '17:30',
        tipo: 'NOTA_DESPESA',
        categoria: 'Material / Despesas de Campo',
        descricao:
          'Saídas e notas comprovadas (Pré-implantação 13/11 — Gil + Gil335Revest)',
        valor: 546.94,
        status: 'APROVADO',
        isPreImplantacao: true,
        enviadoPor: 'Gil',
        criadoEm: '2026-11-13T20:30:00.000Z',
      },
    ];

    const movimentosItemizadosReais: MovimentoCaixaCampo[] = [
      { id: '954f', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-13', hora: '09:00', tipo: 'ENTRADA_PIX', categoria: 'Suprimento PIX', descricao: 'PIX enviado em 13/11', valor: 200, status: 'APROVADO', isPreImplantacao: true, enviadoPor: 'Administração', criadoEm: '2026-11-19T17:56:30Z' },
      { id: 'e98d', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-13', hora: '14:00', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Nota Fiscal 13/11 — 97', valor: 97, status: 'APROVADO', isPreImplantacao: true, enviadoPor: 'Gil', criadoEm: '2026-11-19T17:56:30Z' },
      { id: 'ec42', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-13', hora: '14:05', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Nota Fiscal 13/11 — 37,47', valor: 37.47, status: 'APROVADO', isPreImplantacao: true, enviadoPor: 'Gil', criadoEm: '2026-11-19T17:56:30Z' },
      { id: '83a5', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '07:34', tipo: 'ENTRADA_PIX', categoria: 'Suprimento PIX', descricao: 'PIX Joabson materiais', valor: 200, status: 'APROVADO', enviadoPor: 'Joabson', criadoEm: '2026-11-19T16:18:49Z' },
      { id: '929f', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '08:20', tipo: 'ENTRADA_PIX', categoria: 'Suprimento PIX', descricao: 'PIX Joabson bombas', valor: 200, status: 'APROVADO', enviadoPor: 'Joabson', criadoEm: '2026-11-19T16:18:49Z' },
      { id: '72d7', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '08:37', tipo: 'NOTA_DESPESA', categoria: 'Locação de Equipamento', descricao: 'Locação Bomba', valor: 200, status: 'APROVADO', enviadoPor: 'Gil', criadoEm: '2026-11-19T16:18:49Z' },
      { id: 'a8b8', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '08:52', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Cupom Material #1', valor: 48, status: 'APROVADO', enviadoPor: 'Gil', criadoEm: '2026-11-19T16:18:49Z' },
      { id: '778c', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '09:04', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Cupom Material #2', valor: 9.99, status: 'APROVADO', enviadoPor: 'Gil', criadoEm: '2026-11-19T16:18:49Z' },
      { id: 'ae90', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '09:04', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Cupom Material #3', valor: 31.19, status: 'APROVADO', enviadoPor: 'Gil', criadoEm: '2026-11-19T16:18:49Z' },
      { id: 'caf3', encarregado: 'Gil', obra: 'OBRA BAHIA (PORTO SEGURO)', data: '2026-11-20', hora: '09:22', tipo: 'ENTRADA_PIX', categoria: 'Suprimento PIX', descricao: 'PIX Gilvan', valor: 100, status: 'PENDENTE', enviadoPor: 'Administração', criadoEm: '2026-11-20T12:22:20Z' },
      { id: '3780', encarregado: 'Gil', obra: 'OBRA BAHIA (PORTO SEGURO)', data: '2026-11-20', hora: '09:24', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Pataxo Materiais', valor: 85, status: 'PENDENTE', enviadoPor: 'Administração', criadoEm: '2026-11-20T12:24:04Z' },
      { id: 'daf4', encarregado: 'Gil', obra: 'OBRA BAHIA (PORTO SEGURO)', data: '2026-11-20', hora: '09:24', tipo: 'NOTA_DESPESA', categoria: 'Combustível', descricao: 'Alcool Safra', valor: 35.97, status: 'PENDENTE', enviadoPor: 'Administração', criadoEm: '2026-11-20T12:24:35Z' },
    ];

    assert.equal(isLancamentoSinteticoConsolidado(movimentosSqlSinteticos[0]), true);
    assert.equal(isLancamentoSinteticoConsolidado(movimentosItemizadosReais[0]), false);

    // Mescla SQL sintético + JSONB itemizado + duplicata exata no SQL
    const limpos = deduplicarMovimentosCaixinha(
      [...movimentosSqlSinteticos, movimentosItemizadosReais[0]],
      movimentosItemizadosReais
    );
    assert.equal(limpos.length, 12, 'Deve manter exatamente os 12 movimentos reais sem os 2 sintéticos sobrepostos');

    const contas = consolidarContasCaixinha(limpos);
    assert.equal(contas.length, 1, 'Gil e Gil (Gilvan) devem unificar em 1 única conta');
    assert.equal(contas[0].encarregado, 'Gil');
    assert.equal(contas[0].totalRecebido, 700);
    assert.equal(contas[0].totalComprovado, 544.62);
    assert.equal(contas[0].saldoEmMaos, 155.38);
  });

  it('2. Preserva fallback sintético caso não exista nenhum lançamento itemizado para o encarregado', () => {
    const somenteSintetico: MovimentoCaixaCampo[] = [
      {
        id: 'v11-preimp-2026-11-13-gil-entradas-700',
        encarregado: 'Gil',
        obra: 'PISCINA PORTO SEGURO',
        data: '2026-11-13',
        hora: '09:00',
        tipo: 'ENTRADA_PIX',
        categoria: 'Suprimento PIX',
        descricao: 'Entradas PIX consolidadas (Pré-implantação 13/11)',
        valor: 700,
        status: 'APROVADO',
        isPreImplantacao: true,
        enviadoPor: 'Patrícia Grubel',
        criadoEm: '2026-11-13T12:00:00Z',
      },
    ];
    const resultado = deduplicarMovimentosCaixinha(somenteSintetico, []);
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].valor, 700);
  });

  it('3. Menu unificado em uma única entrada "Caixinha de Campo" (/caixinha) com Reembolsos integrado', () => {
    const repoRoot = process.cwd();
    const sidebar = fs.readFileSync(
      path.join(repoRoot, 'src/components/Sidebar.tsx'),
      'utf8'
    );
    const mobileHeader = fs.readFileSync(
      path.join(repoRoot, 'src/components/MobileHeader.tsx'),
      'utf8'
    );
    const commandPalette = fs.readFileSync(
      path.join(repoRoot, 'src/components/CommandPalette.tsx'),
      'utf8'
    );
    const caixinhaPage = fs.readFileSync(
      path.join(repoRoot, 'src/app/caixinha/page.tsx'),
      'utf8'
    );
    const reembolsosPage = fs.readFileSync(
      path.join(repoRoot, 'src/app/reembolsos/page.tsx'),
      'utf8'
    );
    const migrationV21 = fs.readFileSync(
      path.join(repoRoot, 'supabase/migration_v21_deduplicacao_caixinha_gil.sql'),
      'utf8'
    );

    assert.ok(
      sidebar.includes("name: 'Caixinha de Campo'") &&
        sidebar.includes("href: '/caixinha'") &&
        !sidebar.includes("href: '/reembolsos'"),
      'Sidebar deve ter apenas uma entrada Caixinha de Campo (/caixinha), sem /reembolsos duplicado'
    );
    assert.ok(
      mobileHeader.includes("name: 'Caixinha de Campo'") &&
        !mobileHeader.includes("href: '/reembolsos'"),
      'MobileHeader não deve duplicar /reembolsos'
    );
    assert.ok(
      !commandPalette.includes("href: '/reembolsos'"),
      'CommandPalette deve direcionar apenas para /caixinha'
    );
    assert.ok(
      caixinhaPage.includes('ReembolsosPanel') &&
        caixinhaPage.includes('CaixaCampoPanel'),
      '/caixinha deve integrar CaixaCampoPanel e ReembolsosPanel na mesma tela'
    );
    assert.ok(
      reembolsosPage.includes('/caixinha?secao=reembolsos'),
      'Rota legada /reembolsos deve redirecionar suavemente para /caixinha?secao=reembolsos'
    );
    assert.ok(
      migrationV21.includes("tenant_id = '00000000-0000-0000-0000-000000000001'") &&
        migrationV21.includes('ON CONFLICT (id) DO NOTHING'),
      'Migration V21 deve ser isolada ao tenant Jhoston e idempotente'
    );
  });
});
