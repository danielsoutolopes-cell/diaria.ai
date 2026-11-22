import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  TENANTS,
  normalizeTenantSlug,
  resolveTenantConfig,
  isDanielOuPatricia,
} from '@/lib/tenant';
import {
  normalizarNomeObraCanonica,
  normalizarNomeTrabalhadorCanonico,
} from '@/lib/normalizarObra';
import {
  extrairPedidosValeNaturais,
  interpretarLegendaComprovantePix,
  registrarContextoSolicitacaoVale,
  obterContextoSolicitacaoVale,
} from '@/services/valesNlp';
import {
  calcularBrutoPorRegime,
  contarDiasUteisSegSab,
} from '@/services/regimesRemuneracao';
import { gerarPayloadPix } from '@/lib/pix';
import { gerarPdfEspelhoBase64 } from '@/lib/pdfEspelho';
import { gerarWorkbookAnalitico5AbasV6 } from '@/lib/exportExcel';
import { gerarPdfReciboLiquidacao } from '@/lib/pdfReciboLiquidacao';
import { gerarPdfFinanceiroQuinzenalBase64 } from '@/lib/pdfFinanceiroQuinzenal';
import {
  obterSextasQuinzenaisDoMes,
  isJanelaDisparoQuinzenal,
  proximaDataDisparoQuinzenal,
} from '@/services/agendadorQuinzenal';
import {
  isMensagemPedidoCompra,
  extrairItensCompraHeuristico,
  formatarMensagemPedidoWhatsApp,
  formatarMensagemCategoriaWhatsApp,
} from '@/services/pedidosComprasNlp';
import {
  executarAuditoriaInterna,
  type FuncionarioAuditoriaInput,
  type LancamentoAuditoriaInput,
} from '@/services/auditoriaEngine';

const REPO_ROOT = process.cwd();

function listarArquivosRecursivo(dir: string, extensoes: string[]): string[] {
  const resultado: string[] = [];
  if (!fs.existsSync(dir)) return resultado;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      resultado.push(...listarArquivosRecursivo(full, extensoes));
    } else if (extensoes.some((ext) => entry.name.endsWith(ext))) {
      resultado.push(full);
    }
  }
  return resultado;
}

describe('1. Multi-Tenant, Grafia Oficial (Jhoston) & Isolamento (tenant_id)', () => {
  it('impõe grafia oficial Jhoston com fallback retrocompatível para slugs legados', () => {
    assert.equal(TENANTS.jhoston.nome, 'Jhoston');
    assert.equal(
      TENANTS.jhoston.razaoSocial,
      'Jhoston Construções e Revestimentos'
    );
    assert.equal(TENANTS.jhoston.moduloComprasAtivo, false);

    assert.equal(TENANTS.intermack.nome, 'Intermack');
    assert.equal(
      TENANTS.intermack.razaoSocial,
      'Intermack Engenharia e Construção'
    );
    assert.equal(TENANTS.intermack.moduloComprasAtivo, true);

    assert.equal(normalizeTenantSlug('jhonton'), 'jhoston');
    assert.equal(normalizeTenantSlug('joston'), 'jhoston');
    assert.equal(normalizeTenantSlug('JHOSTON'), 'jhoston');
    assert.equal(normalizeTenantSlug('intermack'), 'intermack');
    assert.equal(normalizeTenantSlug(TENANTS.intermack.id), 'intermack');
  });

  it('isola acesso Intermack exclusivamente para Patrícia Grubel e Daniel Lopes', () => {
    assert.equal(isDanielOuPatricia('Patrícia Grubel'), true);
    assert.equal(isDanielOuPatricia('Daniel Lopes'), true);
    assert.equal(isDanielOuPatricia('Encarregado Externo'), false);

    assert.equal(
      resolveTenantConfig('intermack', 'Patrícia Grubel').slug,
      'intermack'
    );
    assert.equal(
      resolveTenantConfig('intermack', 'Daniel Lopes').slug,
      'intermack'
    );
    assert.equal(
      resolveTenantConfig('intermack', 'Encarregado Externo').slug,
      'jhoston'
    );
  });

  it('confirma zero grafias incorretas Jhonton/Joston em páginas UI e componentes', () => {
    const uiFiles = [
      ...listarArquivosRecursivo(path.join(REPO_ROOT, 'src/components'), [
        '.ts',
        '.tsx',
      ]),
      ...listarArquivosRecursivo(path.join(REPO_ROOT, 'src/app'), ['.tsx']),
    ];
    assert.ok(uiFiles.length > 20, 'Deve inspecionar arquivos de UI');

    const violacoes: string[] = [];
    for (const file of uiFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (/jhonton|joston/i.test(content)) {
        violacoes.push(path.relative(REPO_ROOT, file));
      }
    }
    assert.deepEqual(violacoes, []);
  });

  it('confirma isolamento estrito por tenant_id nas rotas críticas com supabaseAdmin', () => {
    const rotasCriticas = [
      'src/app/api/relatorios/route.ts',
      'src/app/api/relatorios/excel-v6/route.ts',
      'src/app/api/relatorios/espelho/route.ts',
      'src/app/api/relatorios/espelho/enviar/route.ts',
      'src/app/api/webhook/whatsapp/route.ts',
      'src/app/api/liquidar/route.ts',
      'src/app/api/liquidar/ocr/route.ts',
      'src/app/api/validar/route.ts',
      'src/app/api/vales/route.ts',
      'src/app/api/caixa-campo/route.ts',
      'src/app/api/recibo-liquidacao/route.ts',
      'src/app/api/cron/relatorio-quinzenal/route.ts',
      'src/app/api/compras/route.ts',
      'src/app/api/auditoria/route.ts',
      'src/app/api/obras/route.ts',
      'src/app/api/obras/fotos/route.ts',
      'src/app/api/funcionarios/route.ts',
      'src/app/api/reembolsos/route.ts',
      'src/app/api/lancamentos/editar/route.ts',
      'src/app/api/lancamentos/excluir/route.ts',
    ];

    for (const relPath of rotasCriticas) {
      const fullPath = path.join(REPO_ROOT, relPath);
      const src = fs.readFileSync(fullPath, 'utf8');
      assert.ok(
        src.includes('tenant_id'),
        `Rota ${relPath} deve aplicar isolamento por tenant_id`
      );
      assert.ok(
        src.includes(".eq('tenant_id'") || src.includes('tenant_id:'),
        `Rota ${relPath} deve filtrar ou persistir com tenant_id`
      );
    }
  });
});

describe('2. Vales em 2 Etapas + NLP Natural/Complementar + Omnichannel', () => {
  it('aplica valor padrão R$ 100,00 quando omitido e preserva valor explícito', () => {
    const grupoId = '120363000001@g.us';

    const pedido1 = extrairPedidosValeNaturais(
      'Uma vale pra o Mateus por favor.',
      grupoId
    );
    assert.equal(pedido1.length, 1);
    assert.equal(pedido1[0].nomeTrabalhador, 'Mateus');
    assert.equal(pedido1[0].valor, 100);

    registrarContextoSolicitacaoVale(grupoId, {
      solicitadoPor: 'Gilvan - Gil',
      obra: 'PISCINA PORTO SEGURO',
      dataReferencia: '2026-11-21',
      valorPadrao: 100,
    });

    const ctx = obterContextoSolicitacaoVale(grupoId);
    assert.ok(ctx !== null);
    assert.equal(ctx?.obra, 'PISCINA PORTO SEGURO');

    // Mensagem complementar encadeada no mesmo grupo
    const pedido2 = extrairPedidosValeNaturais(
      'Pra o Daniel e o Ian também por favor. Vale.',
      grupoId
    );
    const nomes2 = pedido2.map((p) => p.nomeTrabalhador).sort();
    assert.deepEqual(nomes2, ['Daniel', 'Ian']);
    assert.ok(pedido2.every((p) => p.valor === 100));

    // Valor explícito preservado (não cai para 100)
    const pedidoExplicito = extrairPedidosValeNaturais(
      'Manda um vale de R$ 250,00 pro Manoel',
      grupoId
    );
    assert.equal(pedidoExplicito.length, 1);
    assert.equal(pedidoExplicito[0].nomeTrabalhador, 'Manoel');
    assert.equal(pedidoExplicito[0].valor, 250);
  });

  it('pareia legendas informais de comprovantes PIX (Daniel/Ian/Mateus vale bahia)', () => {
    const pDaniel = interpretarLegendaComprovantePix('Daniel vlw bahia');
    assert.equal(pDaniel.isComprovanteVale, true);
    assert.equal(pDaniel.nomeTrabalhador, 'Daniel');
    assert.equal(pDaniel.obraSugerida, 'PISCINA PORTO SEGURO');

    const pIan = interpretarLegendaComprovantePix('Ian vale bahia');
    assert.equal(pIan.isComprovanteVale, true);
    assert.equal(pIan.nomeTrabalhador, 'Ian');

    const pMateus = interpretarLegendaComprovantePix('Mateus vale bahia');
    assert.equal(pMateus.isComprovanteVale, true);
    assert.equal(pMateus.nomeTrabalhador, 'Mateus');
  });

  it('garante visibilidade imediata de vales validados via Terminal Omnichannel', () => {
    const srcTerminal = fs.readFileSync(
      path.join(REPO_ROOT, 'src/app/api/terminal/confirmar/route.ts'),
      'utf8'
    );
    assert.ok(
      srcTerminal.includes("status: isAdminConfirmando ? 'VALIDADO' : 'PENDENTE'"),
      'Terminal Omnichannel deve marcar vales confirmados por admin como VALIDADO (e PENDENTE para não-admin)'
    );
    assert.ok(
      srcTerminal.includes("vale_etapa: isAdminConfirmando ? 'CONCILIADO' : 'SOLICITADO'"),
      'Terminal Omnichannel deve conciliar vales confirmados por admin imediatamente'
    );
    assert.ok(
      srcTerminal.includes('Number(vale.valor) > 0 ? Number(vale.valor) : 100.0'),
      'Terminal Omnichannel deve aplicar padrão R$ 100,00 quando o valor do vale for omitido'
    );
  });
});

describe('3. Rateio Multi-Obra (0,5 + 0,5), Dia de Chuva (R$ 120,00), Espelho, PIX & Excel V6', () => {
  it('preserva separação entre PISCINA PORTO SEGURO e PORTO SEGURO', () => {
    assert.equal(
      normalizarNomeObraCanonica('Piscina Porto Seguro', 'PISCINA'),
      'PISCINA PORTO SEGURO'
    );
    assert.equal(
      normalizarNomeObraCanonica('Porto Seguro', 'OBRA_CIVIL'),
      'PORTO SEGURO'
    );
    assert.equal(
      normalizarNomeObraCanonica('Quase tudo', 'OBRA_CIVIL'),
      'QUASE TUDO'
    );
  });

  it('permite rateio 0,5 + 0,5 (soma <= 1,0), alerta soma > 1,0 e aplica Chuva = R$ 120,00', () => {
    const funcionarios: FuncionarioAuditoriaInput[] = [
      {
        id: 'f-wender',
        nomeTrabalhador: 'Wender',
        chavePix: 'wender@pix.br',
        valorDiaria: 180,
        valorDiariaObra: 180,
        valorDiariaPiscina: 180,
        regimeRemuneracao: 'DIARISTA',
      },
      {
        id: 'f-manoel',
        nomeTrabalhador: 'Manoel',
        chavePix: 'manoel@pix.br',
        valorDiaria: 230,
        valorDiariaObra: 230,
        valorDiariaPiscina: 230,
        regimeRemuneracao: 'DIARISTA',
      },
    ];

    // Cenário A: Rateio 0,5 + 0,5 válido (soma = 1,0) + Dia de Chuva = R$ 120,00 válido
    const auditOk = executarAuditoriaInterna({
      lancamentos: [
        {
          id: 'r1',
          nomeTrabalhador: 'Wender',
          obraId: 'o1',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 0.5,
          valorMonetario: 90,
          status: 'VALIDADO',
          dataReferencia: '2026-11-18',
          observacao: 'Rateio manhã',
          comprovanteUrl: null,
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-18T17:00:00Z',
        },
        {
          id: 'r2',
          nomeTrabalhador: 'Wender',
          obraId: 'o2',
          obraNome: 'PORTO IMPERIAL',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 0.5,
          valorMonetario: 90,
          status: 'VALIDADO',
          dataReferencia: '2026-11-18',
          observacao: 'Rateio tarde',
          comprovanteUrl: null,
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-18T17:05:00Z',
        },
        {
          id: 'c1',
          nomeTrabalhador: 'Manoel',
          obraId: 'o1',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 1,
          valorMonetario: 120,
          status: 'VALIDADO',
          dataReferencia: '2026-11-19',
          observacao: 'Dia de chuva',
          comprovanteUrl: null,
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-19T17:00:00Z',
        },
      ],
      funcionarios,
      lotes: [],
    });

    assert.equal(auditOk.anomalias.length, 0);
    assert.equal(auditOk.simulacao.saldoAbertoAtual, 300);

    // Cenário B: Soma > 1,0 entre obras + Chuva cobrada errada (R$ 230 em vez de R$ 120)
    const auditErro = executarAuditoriaInterna({
      lancamentos: [
        {
          id: 'e1',
          nomeTrabalhador: 'Wender',
          obraId: 'o1',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 1,
          valorMonetario: 180,
          status: 'VALIDADO',
          dataReferencia: '2026-11-18',
          observacao: 'Integral',
          comprovanteUrl: null,
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-18T17:00:00Z',
        },
        {
          id: 'e2',
          nomeTrabalhador: 'Wender',
          obraId: 'o2',
          obraNome: 'PORTO IMPERIAL',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 0.5,
          valorMonetario: 90,
          status: 'VALIDADO',
          dataReferencia: '2026-11-18',
          observacao: 'Meio dia excedente',
          comprovanteUrl: null,
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-18T17:05:00Z',
        },
        {
          id: 'c2',
          nomeTrabalhador: 'Manoel',
          obraId: 'o1',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 1,
          valorMonetario: 230,
          status: 'VALIDADO',
          dataReferencia: '2026-11-19',
          observacao: 'Dia de chuva',
          comprovanteUrl: null,
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-19T17:00:00Z',
        },
      ],
      funcionarios,
      lotes: [],
    });

    const tipos = auditErro.anomalias.map((a) => a.tipo);
    assert.ok(tipos.includes('SOMA_DIARIA_ACIMA_1'));
    assert.ok(tipos.includes('PRECO_FORA_REGRA'));
    const chuvaAnom = auditErro.anomalias.find(
      (a) => a.tipo === 'PRECO_FORA_REGRA'
    );
    assert.equal(chuvaAnom?.acaoCorretiva.novoValor, 120);
    assert.equal(chuvaAnom?.impactoFinanceiroDelta, -110);
  });

  it('renderiza Rateio (R / ½+½) no Espelho PDF, discrimina 0,5d Obra X + 0,5d Obra Y no PIX e gera Excel V6 5 abas com =SUM', () => {
    const espelhoPdf = gerarPdfEspelhoBase64({
      mes: '2026-11',
      diasNoMes: 30,
      incluirValores: true,
      linhas: [
        {
          nome: 'Wender',
          dias: {
            18: {
              fracao: 1,
              tipo: 'RATEIO',
              obs: '0,5d QUASE TUDO + 0,5d PORTO IMPERIAL',
              valor: 180,
              partes: [
                { obra: 'QUASE TUDO', fracao: 0.5, valor: 90 },
                { obra: 'PORTO IMPERIAL', fracao: 0.5, valor: 90 },
              ],
            },
          },
          totalDias: 1,
          totalValor: 180,
        },
      ],
    });
    const decodedPdf = Buffer.from(espelhoPdf.base64, 'base64').toString('utf8');
    assert.ok(decodedPdf.startsWith('%PDF-1.4'));
    assert.ok(decodedPdf.includes('R=Rateio 1/2+1/2'));

    const pixPayload = gerarPayloadPix({
      chavePix: 'wender@pix.br',
      nomeRecebedor: 'Wender',
      valor: 180,
      descricao: 'Pgto: 0,5d QUASE TUDO + 0,5d PORTO IMPERIAL',
    });
    assert.ok(pixPayload.includes('0,5d QUASE TUDO + 0,5d PORTO IMPERIAL'));
    assert.ok(pixPayload.includes('5406180.00'));

    const wb = gerarWorkbookAnalitico5AbasV6({
      empresaNome: 'Jhoston Construções e Revestimentos',
      periodoLabel: 'QUINZENAL',
      resumoTrabalhadores: [
        {
          trabalhador: 'Gilvan - Gil',
          obras: 'PISCINA PORTO SEGURO',
          chavePix: '11999990000',
          qtdDiarias: 1,
          totalDiariasValor: 400,
          totalValesValor: 0,
          liquidoPagar: 400,
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
          observacao: '0,5d Quase Tudo + 0,5d Porto Imperial',
        },
        {
          data: '2026-11-19',
          trabalhador: 'Manoel',
          obra: 'QUASE TUDO',
          tipologiaRegra: 'CHUVA (R$ 120,00 fixo)',
          fracao: 1,
          valor: 120,
          status: 'VALIDADO',
          observacao: 'Dia de chuva',
        },
      ],
      controleVales: [
        {
          data: '2026-11-21',
          horario: '14:06',
          trabalhador: 'Mateus',
          obra: 'PISCINA PORTO SEGURO',
          etapa: 'PAGO_CONFIRMADO',
          solicitadoPor: 'Gilvan - Gil',
          pagoPor: 'Patrícia Grubel',
          valor: 100,
          status: 'VALIDADO',
          comprovanteUrl: 'https://r2.dev/mateus.jpg',
        },
      ],
      caixinhaCampo: [
        {
          data: '2026-11-13',
          hora: '09:00',
          encarregado: 'Gilvan - Gil',
          perfisUnificados: 'Gil / Gil335Revest',
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
          encarregado: 'Gilvan - Gil',
          perfisUnificados: 'Gil / Gil335Revest',
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
    assert.equal(wb.Sheets['Resumo por Trabalhador']['G3'].f, 'SUM(G2:G2)');
    assert.equal(wb.Sheets['Caixinha de Campo']['J4'].f, 'SUM(J2:J3)');
    assert.equal(wb.Sheets['Caixinha de Campo']['K4'].f, 'SUM(K2:K3)');
    assert.equal(wb.Sheets['Caixinha de Campo']['J5'].f, 'J4-K4');
  });
});

describe('4. Caixinha Unificado (Gilvan - Gil) & Pré-Implantação (13/11/2026)', () => {
  it('unifica Gil e Gil335Revest em Gilvan - Gil e demais aliases canônicos V11', () => {
    assert.equal(normalizarNomeTrabalhadorCanonico('Gil'), 'Gilvan - Gil');
    assert.equal(
      normalizarNomeTrabalhadorCanonico('Gil335Revest'),
      'Gilvan - Gil'
    );
    assert.equal(normalizarNomeTrabalhadorCanonico('Weslen'), 'Wender');
    assert.equal(normalizarNomeTrabalhadorCanonico('Wender 22'), 'Wender');
    assert.equal(normalizarNomeTrabalhadorCanonico('Peu'), 'Peu');
    assert.equal(normalizarNomeTrabalhadorCanonico('Edmilson'), 'Peu');
    assert.equal(normalizarNomeTrabalhadorCanonico('Edmilson - Peu'), 'Peu');
    assert.equal(normalizarNomeTrabalhadorCanonico('José baiano'), 'Zé Baiano');
    assert.equal(normalizarNomeTrabalhadorCanonico('Daniel.'), 'Daniel');
    assert.equal(normalizarNomeTrabalhadorCanonico('Lucas. J.'), 'Lucas J.');
  });

  it('preserva saldo pré-implantação 13/11 (700 - 546,94 = 153,06) sem desconto automático da folha', () => {
    const entradas = 700.0;
    const saidas = 546.94;
    const trocoEmMaos = Number((entradas - saidas).toFixed(2));
    assert.equal(trocoEmMaos, 153.06);

    const pdfQuinz = gerarPdfFinanceiroQuinzenalBase64({
      empresaRazaoSocial: 'Jhoston Construções e Revestimentos',
      dataReferenciaLabel: '27/11/2026 18:00',
      linhas: [
        {
          nome: 'Gilvan - Gil',
          obras: 'PISCINA PORTO SEGURO',
          chavePix: '11999990000',
          diariasQtd: 1,
          diariasValor: 400,
          valesValor: 0,
          liquidoPagar: 400, // NÃO abate 153,06 automaticamente
          caixinhaEmMaos: trocoEmMaos,
        },
      ],
      totalQuitadoAnterior: 0,
    });
    assert.equal(pdfQuinz.totalLiquidoAberto, 400);
    const pdfStr = pdfQuinz.buffer.toString('utf8');
    assert.ok(pdfStr.includes('153.06'));
    assert.ok(pdfStr.includes('sem desconto automatico'));
  });
});

describe('5. Reinício Pós-Quitação (21/11), Lotes 16:39 / 18:12 & Regimes Especiais', () => {
  it('isola ciclo quitado de Manoel (1.150) e Wender (1.275) e soma novo ciclo 21/11 = R$ 2.480,00', () => {
    const lancamentos21Nov: LancamentoAuditoriaInput[] = [
      // Ciclos anteriores LIQUIDADOS em 21/11 via PIX da Patrícia
      {
        id: 'quit-manoel',
        nomeTrabalhador: 'Manoel',
        obraId: 'o-qt',
        obraNome: 'QUASE TUDO',
        obraTipo: 'OBRA_CIVIL',
        tipoLancamento: 'PONTO',
        fracaoDia: 5,
        valorMonetario: 1150,
        status: 'LIQUIDADO',
        dataReferencia: '2026-11-20',
        observacao: 'Ciclo anterior quitado via PIX',
        comprovanteUrl: 'https://r2.dev/pix-manoel.jpg',
        valeEtapa: null,
        loteId: null,
        createdAt: '2026-11-21T10:00:00Z',
      },
      {
        id: 'quit-wender',
        nomeTrabalhador: 'Wender',
        obraId: 'o-qt',
        obraNome: 'QUASE TUDO',
        obraTipo: 'OBRA_CIVIL',
        tipoLancamento: 'PONTO',
        fracaoDia: 8.5,
        valorMonetario: 1275,
        status: 'LIQUIDADO',
        dataReferencia: '2026-11-20',
        observacao: 'Ciclo anterior quitado via PIX',
        comprovanteUrl: 'https://r2.dev/pix-wender.jpg',
        valeEtapa: null,
        loteId: null,
        createdAt: '2026-11-21T10:05:00Z',
      },
      // Novo ciclo Quase Tudo 21/11 16:39 (+R$ 410,00)
      {
        id: 'qt-manoel-21',
        nomeTrabalhador: 'Manoel',
        obraId: 'o-qt',
        obraNome: 'QUASE TUDO',
        obraTipo: 'OBRA_CIVIL',
        tipoLancamento: 'PONTO',
        fracaoDia: 1,
        valorMonetario: 230,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: 'Novo ciclo 21/11 16:39',
        comprovanteUrl: null,
        valeEtapa: null,
        loteId: 'lote-qt-1639',
        createdAt: '2026-11-21T19:39:00Z',
      },
      {
        id: 'qt-wender-21',
        nomeTrabalhador: 'Wender',
        obraId: 'o-qt',
        obraNome: 'QUASE TUDO',
        obraTipo: 'OBRA_CIVIL',
        tipoLancamento: 'PONTO',
        fracaoDia: 1,
        valorMonetario: 180,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: 'Novo ciclo 21/11 16:39',
        comprovanteUrl: null,
        valeEtapa: null,
        loteId: 'lote-qt-1639',
        createdAt: '2026-11-21T19:39:00Z',
      },
      // Lote Piscina Porto Seguro 21/11 18:12 — 7 trabalhadores (+R$ 2.070,00)
      ...[
        { id: 'ps-gil', nome: 'Gilvan - Gil', valor: 400 },
        { id: 'ps-mat', nome: 'Mateus', valor: 340 },
        { id: 'ps-luc', nome: 'Lucas J.', valor: 150 },
        { id: 'ps-peu', nome: 'Peu', valor: 450 },
        { id: 'ps-ian', nome: 'Ian', valor: 300 },
        { id: 'ps-zeb', nome: 'Zé Baiano', valor: 150 },
        { id: 'ps-dan', nome: 'Daniel', valor: 280 },
      ].map((p) => ({
        id: p.id,
        nomeTrabalhador: p.nome,
        obraId: 'o-pps',
        obraNome: 'PISCINA PORTO SEGURO',
        obraTipo: 'PISCINA',
        tipoLancamento: 'PONTO' as const,
        fracaoDia: 1,
        valorMonetario: p.valor,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: 'Lote sábado 21/11 18:12',
        comprovanteUrl: null,
        valeEtapa: null,
        loteId: 'lote-pps-1812',
        createdAt: '2026-11-21T21:12:00Z',
      })),
    ];

    const funcs21Nov: FuncionarioAuditoriaInput[] = [
      { id: '1', nomeTrabalhador: 'Manoel', chavePix: 'm@pix', valorDiaria: 230, valorDiariaObra: 230, valorDiariaPiscina: 230, regimeRemuneracao: 'DIARISTA' },
      { id: '2', nomeTrabalhador: 'Wender', chavePix: 'w@pix', valorDiaria: 180, valorDiariaObra: 180, valorDiariaPiscina: 180, regimeRemuneracao: 'DIARISTA' },
      { id: '3', nomeTrabalhador: 'Gilvan - Gil', chavePix: 'g@pix', valorDiaria: 400, valorDiariaObra: 400, valorDiariaPiscina: 400, regimeRemuneracao: 'DIARISTA' },
      { id: '4', nomeTrabalhador: 'Mateus', chavePix: 'mt@pix', valorDiaria: 340, valorDiariaObra: 340, valorDiariaPiscina: 340, regimeRemuneracao: 'DIARISTA' },
      { id: '5', nomeTrabalhador: 'Lucas J.', chavePix: 'l@pix', valorDiaria: 150, valorDiariaObra: 150, valorDiariaPiscina: 150, regimeRemuneracao: 'DIARISTA' },
      { id: '6', nomeTrabalhador: 'Peu', chavePix: 'p@pix', valorDiaria: 450, valorDiariaObra: 450, valorDiariaPiscina: 450, regimeRemuneracao: 'DIARISTA' },
      { id: '7', nomeTrabalhador: 'Ian', chavePix: 'i@pix', valorDiaria: 300, valorDiariaObra: 300, valorDiariaPiscina: 300, regimeRemuneracao: 'DIARISTA' },
      { id: '8', nomeTrabalhador: 'Zé Baiano', chavePix: 'zb@pix', valorDiaria: 150, valorDiariaObra: 150, valorDiariaPiscina: 150, regimeRemuneracao: 'DIARISTA' },
      { id: '9', nomeTrabalhador: 'Daniel', chavePix: 'd@pix', valorDiaria: 280, valorDiariaObra: 280, valorDiariaPiscina: 280, regimeRemuneracao: 'DIARISTA' },
    ];

    const rel = executarAuditoriaInterna({
      lancamentos: lancamentos21Nov,
      funcionarios: funcs21Nov,
      lotes: [],
    });

    assert.equal(rel.anomalias.length, 0);
    // Quase Tudo (410) + Piscina Porto Seguro (2.070) = 2.480 em aberto (ciclos liquidados 1.150 + 1.275 isolados)
    assert.equal(rel.simulacao.saldoAbertoAtual, 2480);
  });

  it('calcula regimes especiais: Mensalista Diego (R$ 2.350/sem) e Dias Úteis Seg–Sáb Zé Roberto (10d = R$ 2.000)', () => {
    const diego = calcularBrutoPorRegime({
      nomeTrabalhador: 'Diego',
      regimeRemuneracao: 'MENSALISTA',
      valorBaseContratual: 2350,
      somaPontosBrutos: 0,
      somaFracoesPontos: 5,
    });
    assert.equal(diego.totalBruto, 2350);
    assert.equal(diego.regimeAplicado, 'MENSALISTA');

    // 10 dias úteis Seg–Sáb (ex.: 09/11/2026 seg até 19/11/2026 qui, pulando domingo 15/11)
    assert.equal(contarDiasUteisSegSab('2026-11-09', '2026-11-19'), 10);
    const zeRoberto = calcularBrutoPorRegime({
      nomeTrabalhador: 'Zé Roberto',
      regimeRemuneracao: 'DIAS_UTEIS_SEG_SAB',
      diariaPadrao: 200,
      regraDiasUteisSegSab: true,
      somaPontosBrutos: 0,
      somaFracoesPontos: 0,
      dataInicioPeriodo: '2026-11-09',
      dataFimPeriodo: '2026-11-19',
    });
    assert.equal(zeRoberto.totalDiasConsiderados, 10);
    assert.equal(zeRoberto.totalBruto, 2000);
  });
});

describe('6. Recibo Individual PIX, Compras Intermack/Jhoston & Cron Quinzenal PDF Paisagem', () => {
  it('gera Recibo Detalhado Individual de Liquidação PIX em PDF A4 Retrato com SHA-256', () => {
    const recibo = gerarPdfReciboLiquidacao({
      empresaRazaoSocial: 'Jhoston Construções e Revestimentos',
      nomeTrabalhador: 'Manoel',
      chavePix: 'manoel@pix.br',
      quitadoPor: 'Patrícia Grubel',
      dataHoraQuitacao: '21/11/2026 11:30',
      itens: [
        {
          data: '2026-11-16',
          obra: 'QUASE TUDO',
          tipo: 'PONTO',
          fracao: 5,
          valor: 1150,
          descricao: '5 diárias ciclo anterior',
        },
        {
          data: '2026-11-18',
          obra: 'QUASE TUDO',
          tipo: 'VALE',
          fracao: 1,
          valor: 100,
          descricao: 'Vale almoço',
        },
      ],
    });

    const pdfStr = recibo.buffer.toString('utf8');
    assert.ok(pdfStr.startsWith('%PDF-1.4'));
    assert.ok(pdfStr.includes('[0 0 595 842]'));
    assert.equal(recibo.totalBruto, 1150);
    assert.equal(recibo.totalVales, 100);
    assert.equal(recibo.totalLiquido, 1050);
    assert.equal(recibo.sha256.length, 64);
    assert.ok(recibo.resumoTextoWhatsApp.includes('Manoel'));
  });

  it('agrupa Pedido de Compras na Intermack (ativo) mantendo Jhoston em standby', () => {
    assert.equal(TENANTS.intermack.moduloComprasAtivo, true);
    assert.equal(TENANTS.jhoston.moduloComprasAtivo, false);

    assert.equal(
      isMensagemPedidoCompra(
        'Precisamos comprar urgente 20 sacos de cimento, 3 rolos de fio 2.5mm e 6 tubos pvc 50mm'
      ),
      true
    );
    assert.equal(
      isMensagemPedidoCompra('Hoje na obra: Manoel dia inteiro e Wender meio dia'),
      false
    );

    const itens = extrairItensCompraHeuristico(
      '20 sacos de cimento urgente, 3 rolos de fio 2.5mm, 6 tubos pvc 50mm, 10 sacos argamassa AC3'
    );
    assert.equal(itens.length, 4);
    assert.equal(itens[0].categoria, 'Alvenaria & Estrutura');
    assert.equal(itens[1].categoria, 'Elétrica');
    assert.equal(itens[2].categoria, 'Hidráulica');
    assert.equal(itens[3].categoria, 'Acabamento & Revestimento');

    const dadosEntrega = {
      aliasFornecedor: 'Cliente Corporativo Alpha Ltda',
      enderecoEntrega: 'Av. Brigadeiro Faria Lima, 2000 - São Paulo/SP',
      cepEntrega: '01451-000',
      complementoObservacao: 'Torre B, 12º andar • Portaria Serviço 08h–17h',
      contatoRecebimento: 'Mestre Carlos (11 99999-8888)',
    };

    const msg = formatarMensagemPedidoWhatsApp({
      empresaNome: 'Intermack',
      obraNome: 'Obra Corporativa',
      solicitadoPor: 'Mestre Carlos',
      dataHoraLabel: '22/11/2026 09:00',
      itens,
      dadosEntrega,
    });
    assert.ok(msg.includes('PEDIDO DE COMPRAS — INTERMACK'));
    assert.ok(msg.includes('Cliente / Ref. Fornecedor:* Cliente Corporativo Alpha Ltda'));
    assert.ok(msg.includes('Av. Brigadeiro Faria Lima, 2000 - São Paulo/SP (CEP: 01451-000)'));
    assert.ok(msg.includes('Torre B, 12º andar • Portaria Serviço 08h–17h'));
    assert.ok(msg.includes('Mestre Carlos (11 99999-8888)'));
    assert.ok(msg.includes('Mensagem pronta para copiar e encaminhar ao fornecedor'));

    // Cópia isolada de uma única categoria ("Copiar só esta categoria")
    const msgEletrica = formatarMensagemCategoriaWhatsApp({
      empresaNome: 'Intermack',
      obraNome: 'Obra Corporativa',
      solicitadoPor: 'Mestre Carlos',
      dataHoraLabel: '22/11/2026 09:00',
      categoria: 'Elétrica',
      itens,
      dadosEntrega,
    });
    assert.ok(msgEletrica.includes('PEDIDO DE COMPRAS (ELÉTRICA) — INTERMACK'));
    assert.ok(msgEletrica.includes('Cliente Corporativo Alpha Ltda'));
    assert.ok(msgEletrica.includes('Av. Brigadeiro Faria Lima, 2000'));
    assert.ok(msgEletrica.includes('fio 2.5mm'));
    assert.equal(msgEletrica.includes('cimento'), false);

    // Backend /api/obras exige Endereço e Alias de Fornecedor na Intermack
    const obrasApiSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/app/api/obras/route.ts'),
      'utf8'
    );
    assert.ok(obrasApiSrc.includes('Endereço de Entrega completo é obrigatório'));
    assert.ok(obrasApiSrc.includes('Alias (Nome do Cliente p/ Fornecedores) é obrigatório'));
  });

  it('valida janela quinzenal (2ª e última sexta 18:00 America/Sao_Paulo) e gera PDF Paisagem Base64', () => {
    // Nov/2026: 2ª sexta = 13, última sexta = 27
    assert.deepEqual(obterSextasQuinzenaisDoMes(2026, 11), {
      segundaSexta: 13,
      ultimaSexta: 27,
    });
    // Dez/2026: 2ª sexta = 11, última sexta = 25
    assert.deepEqual(obterSextasQuinzenaisDoMes(2026, 12), {
      segundaSexta: 11,
      ultimaSexta: 25,
    });

    // 18:00 BRT = 21:00 UTC
    assert.equal(
      isJanelaDisparoQuinzenal(new Date('2026-11-13T21:00:00Z')).deveDisparar,
      true
    );
    assert.equal(
      isJanelaDisparoQuinzenal(new Date('2026-11-27T21:05:00Z')).deveDisparar,
      true
    );
    // 3ª sexta (20/11) não dispara
    assert.equal(
      isJanelaDisparoQuinzenal(new Date('2026-11-20T21:00:00Z')).deveDisparar,
      false
    );
    // 17:59 BRT não dispara
    assert.equal(
      isJanelaDisparoQuinzenal(new Date('2026-11-27T20:59:00Z')).deveDisparar,
      false
    );
    assert.equal(
      proximaDataDisparoQuinzenal(new Date('2026-11-22T15:00:00Z')),
      '27/11/2026 às 18:00 (BRT)'
    );

    const pdfQuinzenal = gerarPdfFinanceiroQuinzenalBase64({
      empresaRazaoSocial: 'Jhoston Construções e Revestimentos',
      dataReferenciaLabel: '27/11/2026 18:00',
      linhas: [
        {
          nome: 'Manoel',
          obras: 'QUASE TUDO',
          chavePix: 'manoel@pix.br',
          diariasQtd: 1,
          diariasValor: 230,
          valesValor: 0,
          liquidoPagar: 230,
          caixinhaEmMaos: 0,
        },
        {
          nome: 'Wender',
          obras: 'QUASE TUDO',
          chavePix: 'wender@pix.br',
          diariasQtd: 1,
          diariasValor: 180,
          valesValor: 0,
          liquidoPagar: 180,
          caixinhaEmMaos: 0,
        },
      ],
      totalQuitadoAnterior: 2425,
    });
    const pdfStr = Buffer.from(pdfQuinzenal.base64, 'base64').toString('utf8');
    assert.ok(pdfStr.startsWith('%PDF-1.4'));
    assert.ok(pdfStr.includes('[0 0 842 595]')); // A4 Landscape
    assert.equal(pdfQuinzenal.totalLiquidoAberto, 410);
  });
});
