import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  alterarSelecaoFuncionario,
  desmarcarTodosGlobal,
  extrairObrasComDiariasEmAberto,
  listarAvisosValesAbertosParaObra,
  marcarTodosGlobal,
  selecionarPagarPorObra,
  type FuncionarioBorderoSelecionavel,
  type LancamentoBorderoSelecionavel,
} from '@/lib/borderoSelecao';

interface LancamentoMock extends LancamentoBorderoSelecionavel {
  data: string;
}

interface FuncionarioMock extends FuncionarioBorderoSelecionavel<LancamentoMock> {
  regime: 'DIARISTA' | 'SEMANALISTA';
}

function criarCenarioBordero(): FuncionarioMock[] {
  return [
    {
      id: 'func-gil',
      nome: 'Gil',
      obra: 'PISCINA PORTO SEGURO',
      regime: 'DIARISTA',
      lancamentos: [
        {
          id: 'gil-p1',
          data: '2026-11-21',
          tipo: 'PONTO',
          obra: 'PISCINA PORTO SEGURO',
          valor: 400,
          selecionado: true,
        },
        {
          id: 'gil-p2',
          data: '2026-11-20',
          tipo: 'PONTO',
          obra: 'PORTO SEGURO',
          valor: 400,
          selecionado: true,
        },
        {
          id: 'gil-v1',
          data: '2026-11-20',
          tipo: 'VALE',
          obra: 'PISCINA PORTO SEGURO',
          valor: 100,
          selecionado: true,
        },
      ],
    },
    {
      id: 'func-manoel',
      nome: 'Manoel',
      obra: 'QUASE TUDO',
      regime: 'DIARISTA',
      lancamentos: [
        {
          id: 'man-p1',
          data: '2026-11-21',
          tipo: 'PONTO',
          obra: 'QUASE TUDO',
          valor: 230,
          selecionado: true,
        },
        {
          id: 'man-v1',
          data: '2026-11-21',
          tipo: 'VALE',
          obra: 'QUASE TUDO',
          valor: 100,
          selecionado: true,
        },
      ],
    },
    {
      id: 'func-peu',
      nome: 'Peu',
      obra: 'PISCINA PORTO SEGURO',
      regime: 'DIARISTA',
      lancamentos: [
        {
          id: 'peu-p1',
          data: '2026-11-21',
          tipo: 'PONTO',
          obra: 'PISCINA PORTO SEGURO',
          valor: 450,
          selecionado: true,
        },
      ],
    },
  ];
}

function calcularLiquidoTotal(lista: readonly FuncionarioMock[]): number {
  return lista.reduce((acc, f) => {
    const bruto = f.lancamentos
      .filter((l) => l.tipo === 'PONTO' && l.selecionado)
      .reduce((s, l) => s + l.valor, 0);
    const vales = f.lancamentos
      .filter((l) => l.tipo === 'VALE' && l.selecionado)
      .reduce((s, l) => s + l.valor, 0);
    return acc + Math.max(0, bruto - vales);
  }, 0);
}

describe('Borderô — Seleção Global, Por Funcionário & Pagar por Obra', () => {
  it('1. Desmarcar Todos (Global) zera todos os lançamentos para R$ 0,00 e Marcar Todos restaura tudo', () => {
    const inicial = criarCenarioBordero();
    assert.ok(calcularLiquidoTotal(inicial) > 0);

    const zerado = desmarcarTodosGlobal(inicial);
    assert.equal(calcularLiquidoTotal(zerado), 0);
    assert.ok(
      zerado.every((f) => f.lancamentos.every((l) => l.selecionado === false)),
      'Todos os lançamentos de todos os funcionários devem estar desmarcados'
    );

    const remarcado = marcarTodosGlobal(zerado);
    assert.ok(
      remarcado.every((f) => f.lancamentos.every((l) => l.selecionado === true)),
      'Marcar Todos deve selecionar todos os lançamentos novamente'
    );
    assert.equal(calcularLiquidoTotal(remarcado), calcularLiquidoTotal(inicial));
  });

  it('2. Marcar Todos / Desmarcar do Funcionário atua exclusivamente no card daquele colaborador', () => {
    const base = desmarcarTodosGlobal(criarCenarioBordero());

    const soManoelMarcado = alterarSelecaoFuncionario(base, 'func-manoel', true);
    const gil = soManoelMarcado.find((f) => f.id === 'func-gil');
    const manoel = soManoelMarcado.find((f) => f.id === 'func-manoel');
    const peu = soManoelMarcado.find((f) => f.id === 'func-peu');

    assert.ok(manoel?.lancamentos.every((l) => l.selecionado === true));
    assert.ok(gil?.lancamentos.every((l) => l.selecionado === false));
    assert.ok(peu?.lancamentos.every((l) => l.selecionado === false));
    assert.equal(calcularLiquidoTotal(soManoelMarcado), 130); // 230 - 100 vale

    const todosMarcados = marcarTodosGlobal(base);
    const semGil = alterarSelecaoFuncionario(todosMarcados, 'func-gil', false);
    assert.ok(
      semGil.find((f) => f.id === 'func-gil')?.lancamentos.every((l) => !l.selecionado)
    );
    assert.ok(
      semGil.find((f) => f.id === 'func-manoel')?.lancamentos.every((l) => l.selecionado)
    );
    assert.ok(
      semGil.find((f) => f.id === 'func-peu')?.lancamentos.every((l) => l.selecionado)
    );
  });

  it('3. Pagar por Obra seleciona SOMENTE diárias da obra escolhida e gera aviso discreto de vales em aberto', () => {
    const base = criarCenarioBordero();
    const obras = extrairObrasComDiariasEmAberto(base);

    assert.deepEqual(
      obras.map((o) => o.nome),
      ['PISCINA PORTO SEGURO', 'PORTO SEGURO', 'QUASE TUDO']
    );
    assert.equal(obras[0].qtdDiarias, 2);
    assert.equal(obras[0].valorTotalDiarias, 850); // Gil 400 + Peu 450

    const filtradoPiscina = selecionarPagarPorObra(base, 'PISCINA PORTO SEGURO');
    assert.equal(calcularLiquidoTotal(filtradoPiscina), 850);

    // Somente as diárias de PISCINA PORTO SEGURO devem estar marcadas; vales e outras obras desmarcados
    const gil = filtradoPiscina.find((f) => f.id === 'func-gil');
    assert.equal(gil?.lancamentos.find((l) => l.id === 'gil-p1')?.selecionado, true);
    assert.equal(gil?.lancamentos.find((l) => l.id === 'gil-p2')?.selecionado, false);
    assert.equal(gil?.lancamentos.find((l) => l.id === 'gil-v1')?.selecionado, false);

    const manoel = filtradoPiscina.find((f) => f.id === 'func-manoel');
    assert.ok(manoel?.lancamentos.every((l) => l.selecionado === false));

    // Aviso discreto de vales em aberto: apenas Gil (tem diária na Piscina + vale R$ 100 aberto)
    const avisos = listarAvisosValesAbertosParaObra(
      filtradoPiscina,
      'PISCINA PORTO SEGURO'
    );
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].funcionarioId, 'func-gil');
    assert.equal(avisos[0].qtdValesAbertos, 1);
    assert.equal(avisos[0].valorTotalValesAbertos, 100);
  });

  it('4. Integridade da tela /bordero e isolamento multi-tenant preservado em /api/bordero', () => {
    const repoRoot = process.cwd();
    const borderoPageSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/bordero/page.tsx'),
      'utf8'
    );
    const borderoApiSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/bordero/route.ts'),
      'utf8'
    );

    assert.ok(
      borderoPageSrc.includes('Desmarcar Todos') &&
        borderoPageSrc.includes('Marcar Todos') &&
        borderoPageSrc.includes('Pagar por Obra') &&
        borderoPageSrc.includes('handleMarcarTodosFuncionario') &&
        borderoPageSrc.includes('handleSelecionarObraPagamento'),
      '/bordero deve expor os 3 controles solicitados'
    );
    assert.ok(
      borderoApiSrc.includes(".eq('tenant_id', activeTenant.id)"),
      '/api/bordero deve manter isolamento estrito por tenant_id'
    );
  });
});
