import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  auditarContagemListaExtracao,
  executarPipelineDuasPassagens,
  extrairDataReferenciaTexto,
  extrairListaTrabalhadoresDeterministica,
  higienizarMensagemParaExtracao,
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

describe('Pipeline 2 Passagens + Checagem de Contagem (Anti-Truncamento Domingo 22/11)', () => {
  it('1. Passagem 1 — Sanitização cirúrgica limpa pontos/iniciais/quebras preservando texto original e decimais (0.5, 1.0, 120.00, 230.00)', () => {
    const sanDomingo = higienizarMensagemParaExtracao(MENSAGEM_DOMINGO_PISCINA);

    // Texto original bruto preservado 100% intacto para auditoria ("Ver Mensagem Original")
    assert.equal(sanDomingo.textoOriginal, MENSAGEM_DOMINGO_PISCINA);
    assert.equal(
      sanDomingo.textoHigienizado,
      [
        'Domingo 22 de novembro piscina porto seguro',
        'Gil',
        'Mateus',
        'Lucas J',
        'Peu',
        'Ian',
        'José baiano',
        'Daniel',
      ].join('\n')
    );
    assert.equal(sanDomingo.candidatosLista.length, 7);
    assert.ok(sanDomingo.alteracoesAplicadas.includes('NORMALIZAR_INICIAIS_COM_PONTO'));
    assert.ok(sanDomingo.alteracoesAplicadas.includes('REMOVER_PONTOS_FINAIS_TEXTO'));
    assert.ok(sanDomingo.alteracoesAplicadas.includes('COLAPSAR_QUEBRAS_E_RUIDO'));

    // Preserva intactos decimais e valores monetários
    const msgComValores = `Obra Quase Tudo.\n\nGil. 1.0\nManoel 0.5\nWender 22 chuva 120.00\nDaniel. 230.00`;
    const sanValores = higienizarMensagemParaExtracao(msgComValores);
    assert.equal(sanValores.textoOriginal, msgComValores);
    assert.ok(sanValores.textoHigienizado.includes('1.0'), 'Deve preservar 1.0');
    assert.ok(sanValores.textoHigienizado.includes('0.5'), 'Deve preservar 0.5');
    assert.ok(sanValores.textoHigienizado.includes('120.00'), 'Deve preservar 120.00');
    assert.ok(sanValores.textoHigienizado.includes('230.00'), 'Deve preservar 230.00');
    assert.ok(!sanValores.textoHigienizado.includes('Tudo.'), 'Deve remover ponto final em Tudo.');
    assert.ok(!sanValores.textoHigienizado.includes('Gil.'), 'Deve remover ponto final em Gil.');
    assert.ok(!sanValores.textoHigienizado.includes('Daniel.'), 'Deve remover ponto final em Daniel.');
  });

  it('2. Passagem 2 + Auditoria de Contagem dispara automaticamente 2ª passagem focada quando IA retorna 2/7 e entrega 7/7', async () => {
    const promptsEnviados: string[] = [];
    let chamada = 0;

    const resultado = await executarPipelineDuasPassagens({
      textoOriginal: MENSAGEM_DOMINGO_PISCINA,
      executarExtracaoLLM: async (promptTexto: string): Promise<NLPExtracaoResponse> => {
        promptsEnviados.push(promptTexto);
        chamada += 1;

        if (chamada === 1) {
          // Simula a falha real: IA extrai apenas 2 trabalhadores (Gil e Mateus)
          return {
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
        }

        // Passagem 2B focada nos 5 faltantes
        return {
          obras: [
            {
              nome_obra: 'PISCINA PORTO SEGURO',
              data_referencia: '2026-11-22',
              apontamentos: [
                { nome: 'Lucas J', fracao: 1.0, motivo: 'NORMAL' },
                { nome: 'Peu', fracao: 1.0, motivo: 'NORMAL' },
                { nome: 'Ian', fracao: 1.0, motivo: 'NORMAL' },
                { nome: 'José baiano', fracao: 1.0, motivo: 'NORMAL' },
                { nome: 'Daniel', fracao: 1.0, motivo: 'NORMAL' },
              ],
              vales: [],
              setup: false,
            },
          ],
        };
      },
    });

    assert.equal(chamada, 2, 'Deve disparar automaticamente a 2ª passagem focada');
    assert.equal(resultado.segundaPassagemExecutada, true);
    assert.equal(resultado.auditoriaPassagem1.qtdEsperadaLista, 7);
    assert.equal(resultado.auditoriaPassagem1.qtdExtraida, 2);
    assert.equal(resultado.auditoriaPassagem1.nomesFaltantes.length, 5);
    assert.ok(
      promptsEnviados[0].includes('Lucas J') && !promptsEnviados[0].includes('seguro.'),
      '1ª chamada deve receber o texto higienizado'
    );
    assert.ok(
      promptsEnviados[1].includes('SEGUNDA PASSAGEM FOCADA') &&
        promptsEnviados[1].includes('Edmilson - Peu') &&
        promptsEnviados[1].includes('Zé Baiano'),
      '2ª chamada deve focar explicitamente nos nomes faltantes'
    );
    assert.ok(
      resultado.logsAjuste.some((l) => l.includes('[AUDITORIA_CONTAGEM]')),
      'Deve registrar o ajuste aplicado em log'
    );

    assert.equal(resultado.extracao.obras.length, 1);
    const bloco = resultado.extracao.obras[0];
    assert.equal(bloco.nome_obra, 'PISCINA PORTO SEGURO');
    assert.equal(bloco.data_referencia, '2026-11-22');
    assert.equal(bloco.apontamentos.length, 7);
    assert.deepEqual(
      bloco.apontamentos.map((a) => a.nome),
      SETE_OFICIAIS_ESPERADOS
    );
    assert.equal(normalizarNomeTrabalhadorCanonico('Lucas. J'), 'Lucas J');
  });

  it('3. Extrai todos os 7 trabalhadores em formatos variados (linhas em branco, linha única) e ignora pedido puro de vale', () => {
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

    // Verifica auditoria de contagem quando extração já vem 7/7 (não dispara divergência)
    const audOk = auditarContagemListaExtracao(SETE_OFICIAIS_ESPERADOS, resBranco);
    assert.equal(audOk.divergenciaDetectada, false);
    assert.equal(audOk.nomesFaltantes.length, 0);

    // Safety-net também garante 7/7 mesmo se a 2ª passagem LLM falhar
    const rec = reconciliarExtracaoComParserDeterministico(
      MENSAGEM_DOMINGO_PISCINA,
      {
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
      }
    );
    assert.equal(rec.obras[0]?.apontamentos.length, 7);

    // Mensagem puramente de vale não gera apontamentos falsos de diária
    const resVale = extrairListaTrabalhadoresDeterministica(
      'Um vale pro Mateus por favor.'
    );
    assert.equal(resVale.obras.length, 0);
  });

  it('4. Respeita isolamento multi-tenant (Intermack vs Jhoston) e preserva mensagem original no webhook', () => {
    const msgIntermack = `Domingo 22 de novembro Reforma Alphaville.\n\nCarlos. A\nRoberto Silva\nMarcos. P`;
    const sanIntermack = higienizarMensagemParaExtracao(msgIntermack, {
      obrasOficiais: ['REFORMA ALPHAVILLE'],
      funcionariosOficiais: ['Carlos A.', 'Roberto Silva', 'Marcos P.'],
    });

    assert.equal(sanIntermack.textoOriginal, msgIntermack);
    assert.equal(sanIntermack.candidatosLista.length, 3);
    assert.deepEqual(sanIntermack.candidatosLista, [
      'Carlos A.',
      'Roberto Silva',
      'Marcos P.',
    ]);

    const repoRoot = process.cwd();
    const geminiSrc = fs.readFileSync(
      path.join(repoRoot, 'src/lib/gemini.ts'),
      'utf8'
    );
    const webhookSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/webhook/whatsapp/route.ts'),
      'utf8'
    );
    const nlpRouteSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/nlp/route.ts'),
      'utf8'
    );

    assert.ok(
      geminiSrc.includes('executarPipelineDuasPassagens') &&
        geminiSrc.includes('maxOutputTokens: 4096') &&
        geminiSrc.includes(".eq('tenant_id', targetTenantId)"),
      'src/lib/gemini.ts deve usar executarPipelineDuasPassagens com maxOutputTokens: 4096 e isolamento tenant_id'
    );
    assert.ok(
      webhookSrc.includes('[MENSAGEM_ORIGINAL]\\n${messageText}'),
      'Webhook deve preservar a mensagem original bruta sem alteração para auditoria'
    );
    assert.ok(
      nlpRouteSrc.includes('extrairDadosMensagem(mensagem, tenantId)'),
      '/api/nlp deve propagar tenantId para extrairDadosMensagem'
    );
  });
});
