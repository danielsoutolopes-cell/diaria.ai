import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { gerarWorkbookAnalitico5AbasV6 } from '@/lib/exportExcel';
import {
  gerarTokenExtratoColaborador,
  verificarTokenExtratoColaborador,
} from '@/lib/extratoToken';
import { TENANTS } from '@/lib/tenant';
import {
  executarMatchingConciliacaoPix,
  parseExtratoCSV,
  parseExtratoOFX,
} from '@/services/conciliacaoBancaria';
import {
  FEATURE_FLAGS_CATALOGO,
  FEATURE_FLAGS_DEFAULT,
  normalizarFeatureFlags,
} from '@/services/featureFlagsStorage';
import {
  formatarResumoDiario19hWhatsApp,
  isConfirmacaoOkEncarregado,
  isJanelaResumoDiario19h,
} from '@/services/resumoDiario19h';

const REPO_ROOT = process.cwd();

describe('10. Correção Extrato Analítico 5 Abas (Custo por Obra + Caixinha) & Sprint V16', () => {
  it('garante que /relatorios não gera mais Extrato Analítico em aba única e inclui Caixinha no Custo por Obra (=F+H)', () => {
    const relPage = fs.readFileSync(
      path.join(REPO_ROOT, 'src/app/relatorios/page.tsx'),
      'utf8'
    );
    assert.ok(
      !relPage.includes("exportarParaExcel(linhas, `extrato-analitico-"),
      'Botão Extrato Analítico não pode chamar exportarParaExcel (1 aba)'
    );
    assert.ok(
      relPage.includes('void handleExportarExcel5AbasV6()'),
      'handleExportarAnaliticoXls deve delegar para handleExportarExcel5AbasV6 (5 abas)'
    );

    const wb = gerarWorkbookAnalitico5AbasV6({
      empresaNome: 'Jhoston Construções e Revestimentos',
      periodoLabel: 'QUINZENAL',
      resumoTrabalhadores: [
        {
          trabalhador: 'Gil',
          obras: 'PISCINA PORTO SEGURO',
          chavePix: '11999990000',
          qtdDiarias: 1,
          totalDiariasValor: 400,
          totalValesValor: 100,
          liquidoPagar: 300,
          quitadoAnterior: 0,
          caixinhaEmMaos: 153.06,
        },
      ],
      detalhamentoDiarias: [
        {
          data: '2026-11-18',
          trabalhador: 'Wender',
          obra: 'QUASE TUDO',
          tipologiaRegra: 'RATEIO ½+½ • OBRA CIVIL',
          fracao: 0.5,
          valor: 90,
          status: 'VALIDADO',
          observacao: '0,5d QUASE TUDO + 0,5d PORTO IMPERIAL',
        },
      ],
      controleVales: [
        {
          data: '2026-11-21',
          horario: '12:29',
          trabalhador: 'Mateus',
          obra: 'PISCINA PORTO SEGURO',
          etapa: 'CONCILIADO',
          solicitadoPor: 'Gil',
          dataHoraSolicitacao: '2026-11-21T12:29:00-03:00',
          aprovadoPor: 'Patrícia Grubel',
          pagoPor: 'Patrícia Grubel',
          dataHoraEnvioEfetivo: '2026-11-21T14:06:00-03:00',
          valor: 100,
          status: 'VALIDADO',
          comprovanteUrl: 'https://r2.dev/mateus.jpg',
        },
      ],
      caixinhaCampo: [
        {
          data: '2026-11-13',
          hora: '09:00',
          encarregado: 'Gil',
          perfisUnificados: 'Gil / Gilvan / Gil335Revest',
          obra: 'PISCINA PORTO SEGURO',
          tipo: 'ENTRADA_PIX',
          categoria: 'Suprimento PIX',
          descricao: 'Pré-implantação 13/11',
          preImplantacao: 'SIM (13/11/2026)',
          entrada: 700,
          saida: 0,
        },
        {
          data: '2026-11-13',
          hora: '17:30',
          encarregado: 'Gil',
          perfisUnificados: 'Gil / Gilvan / Gil335Revest',
          obra: 'PISCINA PORTO SEGURO',
          tipo: 'NOTA_DESPESA',
          categoria: 'Material',
          descricao: 'Pré-implantação 13/11',
          preImplantacao: 'SIM (13/11/2026)',
          entrada: 0,
          saida: 546.94,
        },
      ],
      custoPorObra: [
        {
          obra: 'PISCINA PORTO SEGURO',
          tipologia: 'PISCINA',
          qtdTrabalhadores: 7,
          diariasAbertas: 2070,
          diariasQuitadas: 0,
          totalDiarias: 2070,
          valesRelacionados: 300,
          despesasCaixinha: 546.94,
          custoTotalObra: 2616.94,
        },
      ],
    });

    assert.deepEqual(wb.SheetNames, [
      'Resumo por Trabalhador',
      'Detalhamento de Diárias',
      'Controle de Vales',
      'Caixinha de Campo',
      'Custo por Obra',
    ]);
    const wsObra = wb.Sheets['Custo por Obra'];
    assert.equal(wsObra['H1'].v, 'Despesas Caixinha (R$)');
    assert.equal(wsObra['I1'].v, 'Custo Total Obra (R$)');
    assert.equal(wsObra['I2'].f, 'F2+H2');
    assert.equal(wsObra['I3'].f, 'SUM(I2:I2)');
  });

  it('Feature Flags V16: inicia desligadas por padrão, suporta normalização segura e catálogo em homologação', () => {
    assert.equal(FEATURE_FLAGS_DEFAULT.FF_RESUMO_DIARIO_19H, false);
    assert.equal(FEATURE_FLAGS_DEFAULT.FF_EXTRATO_COLABORADOR_LINK, false);
    assert.equal(FEATURE_FLAGS_CATALOGO.length, 2);

    const parsed = normalizarFeatureFlags({
      FF_RESUMO_DIARIO_19H: true,
      FF_EXTRATO_COLABORADOR_LINK: 'true',
    });
    assert.equal(parsed.FF_RESUMO_DIARIO_19H, true);
    assert.equal(parsed.FF_EXTRATO_COLABORADOR_LINK, false);
  });

  it('Feature 1 V16: parseia extratos OFX (C6/Itaú) e CSV (Santander) e executa matching inteligente PIX', () => {
    const ofxSample = `
<OFX>
  <BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
    <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20261121140600
      <TRNAMT>-100.00
      <FITID>C6-001
      <MEMO>PIX ENVIADO MATEUS SILVA
    </STMTTRN>
    <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20261121121700
      <TRNAMT>-1150.00
      <FITID>C6-002
      <MEMO>PIX ENVIADO MANOEL NETO
    </STMTTRN>
    <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20261121150000
      <TRNAMT>-432.10
      <FITID>C6-003
      <MEMO>PIX ENVIADO FORNECEDOR DESCONHECIDO
    </STMTTRN>
  </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

    const txsOfx = parseExtratoOFX(ofxSample, 'C6_BANK', 'extrato-c6.ofx');
    assert.equal(txsOfx.length, 3);

    const relOfx = executarMatchingConciliacaoPix({
      conteudoArquivo: ofxSample,
      nomeArquivo: 'extrato-c6.ofx',
      bancoForcado: 'C6_BANK',
      registrosSistema: [
        {
          id: 'lanc-mateus-100',
          origem: 'LANCAMENTO_FINANCEIRO',
          tipo: 'VALE',
          trabalhador: 'Mateus',
          obra: 'PISCINA PORTO SEGURO',
          data: '2026-11-21',
          valor: 100,
          status: 'VALIDADO',
        },
        {
          id: 'lanc-manoel-1150',
          origem: 'LANCAMENTO_FINANCEIRO',
          tipo: 'PONTO',
          trabalhador: 'Manoel',
          obra: 'QUASE TUDO',
          data: '2026-11-21',
          valor: 1150,
          status: 'LIQUIDADO',
        },
      ],
    });

    assert.equal(relOfx.formato, 'OFX');
    assert.equal(relOfx.bancoDetectado, 'C6_BANK');
    assert.equal(relOfx.qtdConciliadoExato, 2);
    assert.equal(relOfx.qtdDivergencias, 1);

    const csvSantander = [
      'Data;Historico;Valor (R$)',
      '21/11/2026;PIX ENVIADO EDMILSON PEREIRA;-450,00',
      '21/11/2026;CREDITO CLIENTE;5000,00',
    ].join('\n');

    const txsCsv = parseExtratoCSV(csvSantander, 'SANTANDER', 'santander.csv');
    assert.equal(txsCsv.length, 1);
    assert.equal(txsCsv[0].valorSaida, 450);

    const relCsv = executarMatchingConciliacaoPix({
      conteudoArquivo: csvSantander,
      nomeArquivo: 'santander.csv',
      bancoForcado: 'SANTANDER',
      registrosSistema: [
        {
          id: 'lanc-peu-450',
          origem: 'LANCAMENTO_FINANCEIRO',
          tipo: 'PONTO',
          trabalhador: 'Peu',
          obra: 'PISCINA PORTO SEGURO',
          data: '2026-11-21',
          valor: 450,
          status: 'VALIDADO',
        },
      ],
    });
    // Edmilson no extrato casa com nome canônico Peu no sistema!
    assert.equal(relCsv.qtdConciliadoExato, 1);
  });

  it('Feature 2 V16 (EM HOMOLOGAÇÃO): formata Resumo Diário 19h sem valores e reconhece confirmação OK dos encarregados', () => {
    // 2026-11-21 é sábado; 19:15 BRT = 22:15 UTC
    assert.equal(
      isJanelaResumoDiario19h(new Date('2026-11-21T22:15:00Z')),
      true
    );
    // 2026-11-22 é domingo -> não dispara domingo
    assert.equal(
      isJanelaResumoDiario19h(new Date('2026-11-22T22:15:00Z')),
      false
    );

    const msg = formatarResumoDiario19hWhatsApp({
      empresaNome: 'Jhoston',
      obraNome: 'PISCINA PORTO SEGURO',
      dataIso: '2026-11-21',
      presencas: [
        { trabalhador: 'Gil', fracao: 1 },
        { trabalhador: 'Peu', fracao: 1 },
        { trabalhador: 'Lucas J', fracao: 0.5, observacao: 'Rateio ½+½' },
      ],
    });
    assert.ok(msg.includes('EM HOMOLOGAÇÃO'));
    assert.ok(msg.includes('Gil'));
    assert.ok(msg.includes('Lucas J'));
    assert.ok(!msg.includes('R$'), 'Resumo para grupo de obra não pode exibir R$');

    assert.equal(isConfirmacaoOkEncarregado('OK'), true);
    assert.equal(isConfirmacaoOkEncarregado('Tudo ok!'), true);
    assert.equal(isConfirmacaoOkEncarregado('Confirmado ✅'), true);
    assert.equal(
      isConfirmacaoOkEncarregado('Hoje trabalhou Mateus e Daniel'),
      false
    );
  });

  it('Feature 3 V16 (EM HOMOLOGAÇÃO): gera e valida token HMAC-SHA256 do Portal /extrato/[token] e rejeita adulteração/expiração', () => {
    const agoraMs = Date.parse('2026-11-22T12:00:00-03:00');
    const gerado = gerarTokenExtratoColaborador({
      tenantId: TENANTS.jhoston.id,
      trabalhador: 'Gilvan (Gil)',
      periodoDias: 15,
      expiraEmHoras: 24,
      agoraMs,
    });

    assert.equal(gerado.payload.trabalhadorCanonico, 'Gil');
    const valid = verificarTokenExtratoColaborador(
      gerado.token,
      agoraMs + 3600 * 1000
    );
    assert.equal(valid.valido, true);
    if (valid.valido) {
      assert.equal(valid.payload.tenantId, TENANTS.jhoston.id);
      assert.equal(valid.payload.trabalhadorCanonico, 'Gil');
    }

    // Rejeita adulteração
    const adulterado = `${gerado.token.slice(0, -3)}xxx`;
    assert.equal(
      verificarTokenExtratoColaborador(adulterado, agoraMs).valido,
      false
    );

    // Rejeita token expirado (+25h)
    const expirado = verificarTokenExtratoColaborador(
      gerado.token,
      agoraMs + 25 * 3600 * 1000
    );
    assert.equal(expirado.valido, false);
  });
});
