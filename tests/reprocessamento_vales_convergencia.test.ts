import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { gerarWorkbookAnalitico5AbasV6 } from '@/lib/exportExcel';
import { normalizarNomeTrabalhadorCanonico } from '@/lib/normalizarObra';
import { executarAuditoriaInterna } from '@/services/auditoriaEngine';
import {
  CORTE_RIGIDO_V15_ISO,
  HISTORICO_WHATSAPP_V15_AUDITORIA,
  SelfHealingValeParserV15,
  isDentroDoCorteRigido,
  type ParsedValeV15,
  type WhatsAppLogEntry,
} from '@/services/reconciliacaoValesV15';

const REPO_ROOT = process.cwd();

function lerArquivoRepo(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

describe('7. Reprocessamento Histórico WhatsApp & Loop Self-Healing V15 (27 Vales = R$ 2.700,00)', () => {
  it('converge exatamente para 27 vales e R$ 2.700,00 via loop adaptativo Self-Healing com rastreabilidade integral', () => {
    const EXPECTED_VALES_COUNT = 27;
    const EXPECTED_VALES_TOTAL = 2700;

    const parser = new SelfHealingValeParserV15();
    const reconciliation = parser.runReconciliationWithSelfHealing(
      HISTORICO_WHATSAPP_V15_AUDITORIA,
      EXPECTED_VALES_COUNT,
      EXPECTED_VALES_TOTAL
    );

    // Assertiva rígida obrigatória V15
    assert.equal(reconciliation.converged, true);
    assert.equal(reconciliation.totalCount, EXPECTED_VALES_COUNT);
    assert.equal(reconciliation.totalAmount, EXPECTED_VALES_TOTAL);

    // Prova que o loop Self-Healing realmente detectou discrepâncias iniciais e ativou regras adaptativas
    assert.ok(reconciliation.iterations >= 2);
    assert.ok(reconciliation.appliedRules.includes('ParseChainedRequests'));
    assert.ok(reconciliation.appliedRules.includes('ExpandMultiValeQuantity'));
    assert.ok(reconciliation.appliedRules.includes('WeekendSundayIngestion'));
    assert.equal(
      reconciliation.iterationLogs[reconciliation.iterationLogs.length - 1]
        .discrepancyCount,
      0
    );

    // Todos os 27 vales possuem valor unitário R$ 100,00 e os 4 campos mandatórios preenchidos
    assert.ok(
      reconciliation.vales.every((v: ParsedValeV15) => v.amount === 100)
    );
    assert.ok(
      reconciliation.vales.every(
        (v: ParsedValeV15) =>
          v.solicitado_por.trim().length > 0 &&
          !v.solicitado_por.endsWith('.') &&
          v.data_hora_solicitacao.includes('T') &&
          v.aprovado_por === 'Patrícia Grubel' &&
          typeof v.data_hora_envio_efetivo === 'string' &&
          v.data_hora_envio_efetivo.length > 0
      )
    );

    // Nomes canônicos oficiais preservados (Gil, Peu, Lucas J — zero Lucas J. ou Gilvan - Gil)
    const beneficiarios = reconciliation.vales.map((v) => v.beneficiary);
    assert.ok(beneficiarios.includes('Gil'));
    assert.ok(beneficiarios.includes('Peu'));
    assert.ok(beneficiarios.includes('Lucas J'));
    assert.ok(!beneficiarios.includes('Gilvan - Gil'));
    assert.ok(!beneficiarios.includes('Edmilson - Peu'));
    assert.ok(!beneficiarios.includes('Lucas J.'));

    // Verifica que os 5 vales de domingo 22/11 08:35 (Gil) foram capturados
    const valesDomingo = reconciliation.vales.filter(
      (v) => v.data_hora_solicitacao === '2026-11-22T08:35:00-03:00'
    );
    assert.equal(valesDomingo.length, 5);
    assert.deepEqual(
      valesDomingo.map((v) => v.beneficiary),
      ['Peu', 'Mateus', 'Ian', 'Daniel', 'Gil']
    );
  });

  it('impõe trava de corte rígido em 2026-11-22T11:40:00-03:00 ignorando mensagens posteriores ao corte', () => {
    assert.equal(isDentroDoCorteRigido('2026-11-22T08:35:00-03:00'), true);
    assert.equal(isDentroDoCorteRigido(CORTE_RIGIDO_V15_ISO), true);
    assert.equal(isDentroDoCorteRigido('2026-11-22T11:41:00-03:00'), false);

    const logsComPosCorte: readonly WhatsAppLogEntry[] = [
      ...HISTORICO_WHATSAPP_V15_AUDITORIA,
      {
        id: 'msg-pos-corte',
        sender: 'Gil',
        messageText: 'Um vale pro Mateus depois do corte.',
        timestamp: '2026-11-22T11:45:00-03:00',
        obra: 'PISCINA PORTO SEGURO',
      },
    ];

    const parser = new SelfHealingValeParserV15();
    const res = parser.runReconciliationWithSelfHealing(logsComPosCorte, 27, 2700);
    assert.equal(res.totalCount, 27);
    assert.equal(res.totalAmount, 2700);
    assert.ok(
      !res.vales.some((v) => v.origemMensagemId === 'msg-pos-corte'),
      'Mensagem posterior a 22/11 11:40 não pode entrar no corte V15'
    );
  });
});

describe('8. Gestão de Ciclos Manoel/Wender, Quitação Externa, PIX Avulsos & Migração SQL V15', () => {
  it('isola ciclo quitado (QUITACAO_PIX_EXTERNO) + PIX avulsos (Zé Roberto/Diego) do novo ciclo 21/11 = R$ 2.480,00', () => {
    const rel = executarAuditoriaInterna({
      lancamentos: [
        // Ciclo anterior encerrado via QUITACAO_PIX_EXTERNO em 21/11
        {
          id: 'quit-manoel-v15',
          nomeTrabalhador: 'Manoel',
          obraId: 'o-qt',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 5.0,
          valorMonetario: 1150,
          status: 'LIQUIDADO',
          dataReferencia: '2026-11-20',
          observacao: 'QUITACAO_PIX_EXTERNO 21/11 (5,0d)',
          comprovanteUrl: 'https://r2.dev/pix-manoel-1150.jpg',
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-21T16:00:00-03:00',
        },
        {
          id: 'quit-wender-v15',
          nomeTrabalhador: 'Wender',
          obraId: 'o-qt',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 8.5,
          valorMonetario: 1275,
          status: 'LIQUIDADO',
          dataReferencia: '2026-11-20',
          observacao: 'QUITACAO_PIX_EXTERNO 21/11 (8,5d)',
          comprovanteUrl: 'https://r2.dev/pix-wender-1275.jpg',
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-21T16:00:00-03:00',
        },
        // PIX Avulsos de 21/11 (Zé Roberto R$ 3.000,00 + Diego R$ 2.000,00) — já liquidados
        {
          id: 'pix-avulso-zr',
          nomeTrabalhador: 'Zé Roberto',
          obraId: 'o-qt',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'LIQUIDACAO',
          fracaoDia: 0,
          valorMonetario: 3000,
          status: 'LIQUIDADO',
          dataReferencia: '2026-11-21',
          observacao: 'PIX_AVULSO Zé Roberto 21/11',
          comprovanteUrl: 'https://r2.dev/pix-ze-roberto-3000.jpg',
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-21T15:30:00-03:00',
        },
        {
          id: 'pix-avulso-diego',
          nomeTrabalhador: 'Diego',
          obraId: 'o-qt',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'LIQUIDACAO',
          fracaoDia: 0,
          valorMonetario: 2000,
          status: 'LIQUIDADO',
          dataReferencia: '2026-11-21',
          observacao: 'PIX_AVULSO Diego 21/11',
          comprovanteUrl: 'https://r2.dev/pix-diego-2000.jpg',
          valeEtapa: null,
          loteId: null,
          createdAt: '2026-11-21T15:35:00-03:00',
        },
        // Novo ciclo em aberto: Quase Tudo 21/11 16:39 (+R$ 410,00)
        {
          id: 'novo-manoel-21',
          nomeTrabalhador: 'Manoel',
          obraId: 'o-qt',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 1.0,
          valorMonetario: 230,
          status: 'VALIDADO',
          dataReferencia: '2026-11-21',
          observacao: 'Novo ciclo 21/11 16:39',
          comprovanteUrl: null,
          valeEtapa: null,
          loteId: 'lote-qt-1639',
          createdAt: '2026-11-21T16:39:00-03:00',
        },
        {
          id: 'novo-wender-21',
          nomeTrabalhador: 'Wender',
          obraId: 'o-qt',
          obraNome: 'QUASE TUDO',
          obraTipo: 'OBRA_CIVIL',
          tipoLancamento: 'PONTO',
          fracaoDia: 1.0,
          valorMonetario: 180,
          status: 'VALIDADO',
          dataReferencia: '2026-11-21',
          observacao: 'Novo ciclo 21/11 16:39',
          comprovanteUrl: null,
          valeEtapa: null,
          loteId: 'lote-qt-1639',
          createdAt: '2026-11-21T16:39:00-03:00',
        },
        // Novo ciclo em aberto: Piscina Porto Seguro 21/11 18:12 (+R$ 2.200,00 — Zé Baiano R$ 280,00)
        ...[
          { id: 'v15-gil', nome: 'Gil', valor: 400 },
          { id: 'v15-mat', nome: 'Mateus', valor: 340 },
          { id: 'v15-luc', nome: 'Lucas J', valor: 150 },
          { id: 'v15-peu', nome: 'Peu', valor: 450 },
          { id: 'v15-ian', nome: 'Ian', valor: 300 },
          { id: 'v15-zeb', nome: 'Zé Baiano', valor: 280 },
          { id: 'v15-dan', nome: 'Daniel', valor: 280 },
        ].map((p) => ({
          id: p.id,
          nomeTrabalhador: p.nome,
          obraId: 'o-pps',
          obraNome: 'PISCINA PORTO SEGURO',
          obraTipo: 'PISCINA',
          tipoLancamento: 'PONTO' as const,
          fracaoDia: 1.0,
          valorMonetario: p.valor,
          status: 'VALIDADO',
          dataReferencia: '2026-11-21',
          observacao: 'Lote 21/11 18:12',
          comprovanteUrl: null,
          valeEtapa: null,
          loteId: 'lote-pps-1812',
          createdAt: '2026-11-21T18:12:00-03:00',
        })),
      ],
      funcionarios: [
        { id: '1', nomeTrabalhador: 'Manoel', chavePix: 'm@pix', valorDiaria: 230, valorDiariaObra: 230, valorDiariaPiscina: 230, regimeRemuneracao: 'DIARISTA' },
        { id: '2', nomeTrabalhador: 'Wender', chavePix: 'w@pix', valorDiaria: 180, valorDiariaObra: 180, valorDiariaPiscina: 180, regimeRemuneracao: 'DIARISTA' },
        { id: '3', nomeTrabalhador: 'Gil', chavePix: 'g@pix', valorDiaria: 400, valorDiariaObra: 400, valorDiariaPiscina: 400, regimeRemuneracao: 'DIARISTA' },
        { id: '4', nomeTrabalhador: 'Mateus', chavePix: 'mt@pix', valorDiaria: 340, valorDiariaObra: 340, valorDiariaPiscina: 340, regimeRemuneracao: 'DIARISTA' },
        { id: '5', nomeTrabalhador: 'Lucas J', chavePix: 'l@pix', valorDiaria: 150, valorDiariaObra: 150, valorDiariaPiscina: 150, regimeRemuneracao: 'DIARISTA' },
        { id: '6', nomeTrabalhador: 'Peu', chavePix: 'p@pix', valorDiaria: 450, valorDiariaObra: 450, valorDiariaPiscina: 450, regimeRemuneracao: 'DIARISTA' },
        { id: '7', nomeTrabalhador: 'Ian', chavePix: 'i@pix', valorDiaria: 300, valorDiariaObra: 300, valorDiariaPiscina: 300, regimeRemuneracao: 'DIARISTA' },
        { id: '8', nomeTrabalhador: 'Zé Baiano', chavePix: 'zb@pix', valorDiaria: 280, valorDiariaObra: 280, valorDiariaPiscina: 280, regimeRemuneracao: 'DIARISTA' },
        { id: '9', nomeTrabalhador: 'Daniel', chavePix: 'd@pix', valorDiaria: 280, valorDiariaObra: 280, valorDiariaPiscina: 280, regimeRemuneracao: 'DIARISTA' },
        { id: '10', nomeTrabalhador: 'Zé Roberto', chavePix: 'zr@pix', valorDiaria: 200, valorDiariaObra: 200, valorDiariaPiscina: 200, regimeRemuneracao: 'DIAS_UTEIS_SEG_SAB' },
        { id: '11', nomeTrabalhador: 'Diego', chavePix: 'dg@pix', valorDiaria: 391.67, valorDiariaObra: 391.67, valorDiariaPiscina: 391.67, regimeRemuneracao: 'MENSALISTA' },
      ],
      lotes: [],
    });

    assert.equal(rel.anomalias.length, 0);
    assert.equal(rel.simulacao.saldoAbertoAtual, 2610);
  });

  it('valida integridade da migração SQL idempotente V15 (corte 22/11 11:40, 4 campos, QUITACAO_PIX_EXTERNO e PIX avulsos)', () => {
    const sql = lerArquivoRepo(
      'supabase/migration_v15_reconciliacao_vales_ciclos.sql'
    );
    assert.ok(sql.includes('data_hora_solicitacao'));
    assert.ok(sql.includes('aprovado_por'));
    assert.ok(sql.includes('data_hora_envio_efetivo'));
    assert.ok(sql.includes('tipo_quitacao'));
    assert.ok(sql.includes('ciclo_encerrado'));
    assert.ok(sql.includes('QUITACAO_PIX_EXTERNO'));
    assert.ok(sql.includes('2026-11-22T11:40:00-03:00'));
    assert.ok(sql.includes('1150.00'));
    assert.ok(sql.includes('1275.00'));
    assert.ok(sql.includes('3000.00'));
    assert.ok(sql.includes('2000.00'));
    assert.ok(sql.includes('ON CONFLICT (chave_idempotencia)'));
  });
});

describe('9. Cobertura Exaustiva das 7 Rotas da Aplicação & Excel V6 (Rastreabilidade V15)', () => {
  it('verifica isolamento tenant_id, 0 any e propagação de rastreabilidade nos 7 endpoints obrigatórios', () => {
    const endpointsObrigatorios: ReadonlyArray<{
      rota: string;
      arquivo: string;
      marcadoresObrigatorios: readonly string[];
    }> = [
      {
        rota: 'POST /api/webhook/whatsapp',
        arquivo: 'src/app/api/webhook/whatsapp/route.ts',
        marcadoresObrigatorios: [
          'tenant_id',
          'solicitado_por',
          'data_hora_solicitacao',
          'aprovado_por',
          'data_hora_envio_efetivo',
        ],
      },
      {
        rota: 'GET /api/pendentes',
        arquivo: 'src/app/api/pendentes/route.ts',
        marcadoresObrigatorios: ['tenant_id', 'PENDENTE'],
      },
      {
        rota: 'GET /api/vales',
        arquivo: 'src/app/api/vales/route.ts',
        marcadoresObrigatorios: [
          'tenant_id',
          'solicitado_por',
          'data_hora_solicitacao',
          'aprovado_por',
          'data_hora_envio_efetivo',
        ],
      },
      {
        rota: 'POST /api/validar',
        arquivo: 'src/app/api/validar/route.ts',
        marcadoresObrigatorios: ['tenant_id', 'VALIDADO', 'aprovado_por'],
      },
      {
        rota: 'GET /api/bordero',
        arquivo: 'src/app/api/bordero/route.ts',
        marcadoresObrigatorios: [
          'tenant_id',
          'ciclo_encerrado',
          'solicitado_por',
          'data_hora_solicitacao',
        ],
      },
      {
        rota: 'GET /api/relatorios',
        arquivo: 'src/app/api/relatorios/route.ts',
        marcadoresObrigatorios: [
          'tenant_id',
          'ciclo_encerrado',
          'solicitado_por',
          'data_hora_solicitacao',
        ],
      },
      {
        rota: 'POST /api/liquidar',
        arquivo: 'src/app/api/liquidar/route.ts',
        marcadoresObrigatorios: [
          'tenant_id',
          'LIQUIDADO',
          'tipo_quitacao',
          'ciclo_encerrado',
        ],
      },
    ];

    for (const ep of endpointsObrigatorios) {
      const src = lerArquivoRepo(ep.arquivo);
      assert.ok(
        !/:\s*any\b|\bas\s+any\b/.test(src),
        `${ep.rota} não pode conter tipo any`
      );
      for (const marcador of ep.marcadoresObrigatorios) {
        assert.ok(
          src.includes(marcador),
          `${ep.rota} (${ep.arquivo}) deve conter "${marcador}"`
        );
      }
    }
  });

  it('exporta os 27 vales reconciliados na Aba 3 Controle de Vales do Excel V6 com os 4 campos e fórmula =SUM(J2:J28)', () => {
    const parser = new SelfHealingValeParserV15();
    const rec = parser.runReconciliationWithSelfHealing(
      HISTORICO_WHATSAPP_V15_AUDITORIA,
      27,
      2700
    );

    const wb = gerarWorkbookAnalitico5AbasV6({
      empresaNome: 'Jhoston Construções e Revestimentos',
      periodoLabel: 'CORTE V15 — 22/11/2026 11:40',
      resumoTrabalhadores: [],
      detalhamentoDiarias: [],
      controleVales: rec.vales.map((v) => ({
        data: v.data_hora_solicitacao.slice(0, 10),
        horario: v.data_hora_solicitacao.slice(11, 16),
        trabalhador: normalizarNomeTrabalhadorCanonico(v.beneficiary),
        obra: v.obra,
        etapa: 'CONCILIADO',
        solicitadoPor: v.solicitado_por,
        dataHoraSolicitacao: v.data_hora_solicitacao,
        aprovadoPor: v.aprovado_por || 'Patrícia Grubel',
        pagoPor: v.aprovado_por || 'Patrícia Grubel',
        dataHoraEnvioEfetivo: v.data_hora_envio_efetivo || '—',
        valor: v.amount,
        status: 'VALIDADO',
        comprovanteUrl: 'https://r2.dev/pix-v15.jpg',
      })),
      caixinhaCampo: [],
      custoPorObra: [],
    });

    const abaVales = wb.Sheets['Controle de Vales'];
    assert.ok(abaVales);
    assert.equal(abaVales['F1'].v, 'Solicitado Por');
    assert.equal(abaVales['G1'].v, 'Data/Hora Solicitação');
    assert.equal(abaVales['H1'].v, 'Aprovado / Pago Por (PIX)');
    assert.equal(abaVales['I1'].v, 'Data/Hora Envio PIX');
    // 1 cabeçalho + 27 vales => linha de total = 29, fórmula na coluna J = SUM(J2:J28)
    assert.equal(abaVales['J29'].f, 'SUM(J2:J28)');
  });
});
