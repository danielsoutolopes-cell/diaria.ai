import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  extrairDataReferenciaTexto,
  extrairListaTrabalhadoresDeterministica,
  reconciliarExtracaoComParserDeterministico,
} from '@/lib/extracaoDiariasParser';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';
import type { NLPExtracaoResponse } from '@/types/database';

const MENSAGEM_DOMINGO_PISCINA = `Domingo 22 de novembro piscina porto seguro.

Gil
Mateus
Lucas. J
Peu
Ian
José baiano
Daniel`;

const SETE_OFICIAIS_ESPERADOS = [
  'Gilvan - Gil',
  'Mateus',
  'Lucas J.',
  'Edmilson - Peu',
  'Ian',
  'Zé Baiano',
  'Daniel',
];

describe('Extração de Diárias — Anti-Truncamento (Pontos / Quebras / Domingo 22/11)', () => {
  it('1. Extrai todos os 7 trabalhadores da mensagem exata de Domingo 22/11 sem truncar em "seguro." ou "Lucas. J"', () => {
    const res = extrairListaTrabalhadoresDeterministica(MENSAGEM_DOMINGO_PISCINA);

    assert.equal(res.obras.length, 1);
    const bloco = res.obras[0];
    assert.equal(bloco.nome_obra, 'PISCINA PORTO SEGURO');
    assert.equal(bloco.data_referencia, '2026-11-22');
    assert.equal(bloco.apontamentos.length, 7);
    assert.deepEqual(
      bloco.apontamentos.map((a) => a.nome),
      SETE_OFICIAIS_ESPERADOS
    );
    assert.ok(
      bloco.apontamentos.every((a) => a.fracao === 1.0 && a.motivo === 'NORMAL'),
      'Todos os 7 apontamentos devem ter fracao 1.0 e motivo NORMAL'
    );
    assert.equal(normalizarNomeTrabalhadorCanonico('Lucas. J'), 'Lucas J');
  });

  it('2. Safety-net recupera os 5 trabalhadores faltantes quando a IA trunca em apenas 2 (Gil e Mateus)', () => {
    const respostaTruncadaIA: NLPExtracaoResponse = {
      obras: [
        {
          nome_obra: 'PISCINA PORTO SEGURO',
          data_referencia: '2026-11-22',
          apontamentos: [
            { nome: 'Gil', fracao: 1.0, motivo: 'NORMAL' },
            { nome: 'Mateus', fracao: 1.0, motivo: 'NORMAL' },
          ],
          vales: [],
          setup: false,
        },
      ],
    };

    const reconciliado = reconciliarExtracaoComParserDeterministico(
      MENSAGEM_DOMINGO_PISCINA,
      respostaTruncadaIA
    );

    assert.equal(reconciliado.obras.length, 1);
    const bloco = reconciliado.obras[0];
    assert.equal(bloco.nome_obra, 'PISCINA PORTO SEGURO');
    assert.equal(bloco.data_referencia, '2026-11-22');
    assert.equal(bloco.apontamentos.length, 7);
    assert.deepEqual(
      bloco.apontamentos.map((a) => a.nome),
      SETE_OFICIAIS_ESPERADOS
    );
  });

  it('3. Suporta linhas em branco entre nomes, lista em linha única com pontos e ignora pedido puro de vale', () => {
    const msgComLinhasEmBranco = `Domingo 22 de novembro piscina porto seguro.\n\nGil\n\nMateus\n\nLucas. J\n\nPeu\n\nIan\n\nJosé baiano\n\nDaniel.`;
    const resBranco = extrairListaTrabalhadoresDeterministica(msgComLinhasEmBranco);
    assert.equal(resBranco.obras[0]?.apontamentos.length, 7);
    assert.deepEqual(
      resBranco.obras[0]?.apontamentos.map((a) => a.nome),
      SETE_OFICIAIS_ESPERADOS
    );

    const msgLinhaUnica =
      'Domingo 22/11 Piscina Porto Seguro: Gil, Mateus, Lucas. J, Peu, Ian, José baiano, Daniel.';
    const resLinha = extrairListaTrabalhadoresDeterministica(msgLinhaUnica);
    assert.equal(resLinha.obras[0]?.data_referencia, '2026-11-22');
    assert.equal(resLinha.obras[0]?.apontamentos.length, 7);

    assert.equal(
      extrairDataReferenciaTexto('Domingo 22 de novembro piscina porto seguro.'),
      '2026-11-22'
    );

    // Mensagem puramente de vale não deve criar apontamentos falsos de diária
    const resVale = extrairListaTrabalhadoresDeterministica(
      'Um vale pro Mateus por favor.'
    );
    assert.equal(resVale.obras.length, 0);
  });

  it('4. Respeita isolamento multi-tenant (Intermack vs Jhoston) e configuração anti-truncamento em gemini.ts', () => {
    const msgIntermack = `Domingo 22 de novembro Reforma Alphaville.\n\nCarlos A.\nRoberto Silva\nMarcos. P`;
    const resIntermack = extrairListaTrabalhadoresDeterministica(msgIntermack, {
      obrasOficiais: ['REFORMA ALPHAVILLE'],
      funcionariosOficiais: ['Carlos A.', 'Roberto Silva', 'Marcos P.'],
    });

    assert.equal(resIntermack.obras.length, 1);
    assert.equal(resIntermack.obras[0].nome_obra, 'REFORMA ALPHAVILLE');
    assert.equal(resIntermack.obras[0].data_referencia, '2026-11-22');
    assert.deepEqual(
      resIntermack.obras[0].apontamentos.map((a) => a.nome),
      ['Carlos A.', 'Roberto Silva', 'Marcos P.']
    );

    const repoRoot = process.cwd();
    const geminiSrc = fs.readFileSync(
      path.join(repoRoot, 'src/lib/gemini.ts'),
      'utf8'
    );
    const nlpRouteSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/nlp/route.ts'),
      'utf8'
    );

    assert.ok(
      geminiSrc.includes('maxOutputTokens: 4096') &&
        geminiSrc.includes('reconciliarExtracaoComParserDeterministico') &&
        geminiSrc.includes(".eq('tenant_id', targetTenantId)"),
      'src/lib/gemini.ts deve definir maxOutputTokens: 4096, isolamento por tenant_id e reconciliador determinístico'
    );
    assert.ok(
      nlpRouteSrc.includes('extrairDadosMensagem(mensagem, tenantId)'),
      '/api/nlp deve propagar tenantId para extrairDadosMensagem'
    );
  });
});
