import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TENANTS } from '@/lib/tenant';
import {
  ESPERADO_AUDITORIA_DIARIAS,
  HISTORICO_DIARIAS_AUDITORIA_V16,
  SelfHealingDiariaParserV16,
  isLancamentoPosQuitacao,
} from '@/services/reconciliacaoDiariasV16';

describe('11. Reprocessamento Histórico de Diárias & Loop Self-Healing (54 Diárias = R$ 9.780,00)', () => {
  it('converge exatamente para 54 lançamentos = R$ 9.780,00 (Base R$ 7.710,00 + Piscina 21/11 18:12 R$ 2.070,00) com isolamento tenant_id', () => {
    const parser = new SelfHealingDiariaParserV16();
    const res = parser.runReconciliationWithSelfHealing(
      HISTORICO_DIARIAS_AUDITORIA_V16,
      TENANTS.jhoston.id,
      ESPERADO_AUDITORIA_DIARIAS.totalCount,
      ESPERADO_AUDITORIA_DIARIAS.totalAmount
    );

    // 1. Assertiva obrigatória de batimento exato (54 lançamentos = R$ 9.780,00)
    assert.equal(res.converged, true);
    assert.equal(res.totalCount, 54);
    assert.equal(res.totalAmount, 9780.0);

    // 2. Base até 21/11 16:39 = 47 lançamentos / R$ 7.710,00
    const baseAte1639 = res.diarias.filter(
      (d) => d.loteTag !== '2026-11-21-1812'
    );
    const totalBase = Number(
      baseAte1639.reduce((acc, d) => acc + d.valorFinal, 0).toFixed(2)
    );
    assert.equal(baseAte1639.length, 47);
    assert.equal(totalBase, 7710.0);

    // 3. Lote Piscina Porto Seguro (21/11 18:12) = 7 diárias / R$ 2.070,00
    assert.equal(res.lotePiscina21Count, 7);
    assert.equal(res.lotePiscina21Total, 2070.0);
    const piscina21Map = new Map(
      res.diarias
        .filter((d) => d.loteTag === '2026-11-21-1812')
        .map((d) => [d.trabalhadorCanonico, d.valorFinal])
    );
    assert.equal(piscina21Map.get('Gil'), 400);
    assert.equal(piscina21Map.get('Mateus'), 340);
    assert.equal(piscina21Map.get('Lucas J'), 150);
    assert.equal(piscina21Map.get('Peu'), 450);
    assert.equal(piscina21Map.get('Ian'), 300);
    assert.equal(piscina21Map.get('Zé Baiano'), 150);
    assert.equal(piscina21Map.get('Daniel'), 280);

    // 4. Novo ciclo Quase Tudo (21/11 16:39) = Manoel R$ 230 + Wender R$ 180 = R$ 410,00 (sem zerar retroativamente)
    assert.equal(res.novoCicloQuaseTudo21Count, 2);
    assert.equal(res.novoCicloQuaseTudo21Total, 410.0);
    const qt21Map = new Map(
      res.diarias
        .filter((d) => d.loteTag === '2026-11-21-1639')
        .map((d) => [d.trabalhadorCanonico, d])
    );
    assert.equal(qt21Map.get('Manoel')?.valorFinal, 230);
    assert.equal(qt21Map.get('Manoel')?.posQuitacaoNovoCiclo, true);
    assert.equal(qt21Map.get('Wender')?.valorFinal, 180);
    assert.equal(qt21Map.get('Wender')?.posQuitacaoNovoCiclo, true);

    // 5. Isolamento estrito Jhoston vs Intermack + Deduplicação SHA-256 + Teto diário <= 1,0d
    assert.equal(res.registrosOutroTenantBloqueados, 2);
    assert.ok(
      res.diarias.every((d) => d.tenantId === TENANTS.jhoston.id),
      'Nenhum registro da Intermack pode vazar para a Jhoston'
    );
    assert.equal(res.duplicidadesDescartadas, 1);
    assert.equal(res.excedentesRateioBloqueados, 1);

    // 6. Regra de Chuva (1,0d = R$ 120,00 | 0,5d = R$ 60,00)
    const chuvaManoel = res.diarias.find((d) => d.id === 'd-19-1');
    const chuvaDanielMeio = res.diarias.find((d) => d.id === 'd-19-3');
    assert.equal(chuvaManoel?.valorFinal, 120);
    assert.equal(chuvaDanielMeio?.valorFinal, 60);

    // 7. Loop de aprendizado registrou todas as iterações até discrepância zero
    assert.equal(res.iterations, 6);
    assert.equal(res.appliedRules.length, 5);
    assert.equal(
      res.iterationLogs[res.iterationLogs.length - 1].discrepancyCount,
      0
    );
    assert.equal(
      res.iterationLogs[res.iterationLogs.length - 1].discrepancyAmount,
      0
    );
  });

  it('isola estritamente consultas do tenant Intermack sem vazar dados da Jhoston e valida guarda pós-quitação por timestamp', () => {
    const parserInter = new SelfHealingDiariaParserV16();
    parserInter.enableRule('IsolateTenantIdStrict');
    parserInter.enableRule('IncludeWeekendEveningBatches24x7');
    parserInter.enableRule('PreservePostQuitacaoNewCycle');
    parserInter.enableRule('NormalizeCanonicalAliasesAndSplitObras');
    parserInter.enableRule('EnforceRateioCapAndRainPricing');

    const batchInter = parserInter.parseBatch(
      HISTORICO_DIARIAS_AUDITORIA_V16,
      TENANTS.intermack.id
    );
    assert.equal(batchInter.diarias.length, 2);
    assert.ok(
      batchInter.diarias.every((d) => d.tenantId === TENANTS.intermack.id)
    );
    assert.equal(
      batchInter.diarias.reduce((acc, d) => acc + d.valorFinal, 0),
      0,
      'Intermack (modo empreita) não mistura valores monetários da Jhoston'
    );

    // Guarda pós-quitação por timestamp completo (mesmo dia, horas distintas)
    assert.equal(
      isLancamentoPosQuitacao(
        '2026-11-21T16:39:00-03:00',
        '2026-11-21T12:17:00-03:00'
      ),
      true
    );
    assert.equal(
      isLancamentoPosQuitacao(
        '2026-11-21T11:00:00-03:00',
        '2026-11-21T12:17:00-03:00'
      ),
      false
    );
  });
});
