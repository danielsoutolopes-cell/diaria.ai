import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  executarAuditoriaInterna,
  type FuncionarioAuditoriaInput,
  type LancamentoAuditoriaInput,
  type LoteAuditoriaInput,
} from '@/services/auditoriaEngine';
import {
  CADENCIA_PADRAO_SAUDE,
  OPCOES_CADENCIA_SAUDE,
  calcularProximaExecucaoCadencia,
  formatarDataHoraBrasilia,
  validarCadenciaSaude,
  verificarExecucaoCadenciaDevida,
} from '@/services/saudeCadenciaService';

const OBRA_CIVIL_ID = '11111111-1111-1111-1111-111111111111';
const OBRA_INATIVA_ID = '99999999-9999-9999-9999-999999999999';

function criarFuncionariosBase(): FuncionarioAuditoriaInput[] {
  return [
    {
      id: 'func-1',
      nomeTrabalhador: 'Gil',
      chavePix: '11999990001',
      valorDiaria: 400,
      valorDiariaObra: 400,
      valorDiariaPiscina: 400,
      regimeRemuneracao: 'DIARIA',
      ativo: true,
    },
    {
      id: 'func-2',
      nomeTrabalhador: 'Manoel',
      chavePix: '11999990002',
      valorDiaria: 230,
      valorDiariaObra: 230,
      valorDiariaPiscina: 230,
      regimeRemuneracao: 'DIARIA',
      ativo: true,
    },
  ];
}

describe('Saúde do Sistema & Caça-Fantasmas (V18)', () => {
  it('1. Base limpa retorna Health Score 100 (EXCELENTE) e 6 pilares OK', () => {
    const funcionarios = criarFuncionariosBase();
    const lotes: LoteAuditoriaInput[] = [
      {
        id: 'lote-ok-1',
        dataReferencia: '2026-11-21',
        mensagemOriginal: 'Quase Tudo: Gil 1.0, Manoel 1.0',
        status: 'VALIDADO',
        remetenteNome: 'Gil',
        createdAt: '2026-11-21T19:00:00Z',
        obraNome: 'Quase Tudo',
      },
    ];
    const lancamentos: LancamentoAuditoriaInput[] = [
      {
        id: 'lanc-ok-1',
        nomeTrabalhador: 'Gil',
        obraId: OBRA_CIVIL_ID,
        obraNome: 'Quase Tudo',
        obraTipo: 'CIVIL',
        tipoLancamento: 'PONTO',
        fracaoDia: 1,
        valorMonetario: 400,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: 'Dia normal',
        comprovanteUrl: null,
        valeEtapa: null,
        loteId: 'lote-ok-1',
        createdAt: '2026-11-21T19:01:00Z',
        chaveIdempotencia: 'idemp-ok-1',
      },
      {
        id: 'lanc-ok-2',
        nomeTrabalhador: 'Manoel',
        obraId: OBRA_CIVIL_ID,
        obraNome: 'Quase Tudo',
        obraTipo: 'CIVIL',
        tipoLancamento: 'VALE',
        fracaoDia: 0,
        valorMonetario: 100,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: 'Vale confirmado',
        comprovanteUrl: 'https://r2.example.com/pix-manoel.jpg',
        valeEtapa: 'CONFIRMADO_PIX',
        loteId: 'lote-ok-1',
        createdAt: '2026-11-21T19:02:00Z',
        chaveIdempotencia: 'vale:v17:ok-2',
        solicitadoPor: 'Gilvan - Gil',
        dataHoraSolicitacao: '2026-11-21T15:00:00-03:00',
      },
    ];

    const relatorio = executarAuditoriaInterna({
      lancamentos,
      funcionarios,
      lotes,
      obrasAtivasIds: [OBRA_CIVIL_ID],
      dataCorteFormatada: '22/11/2026 às 11:40',
      agoraRef: new Date('2026-11-22T15:00:00Z'),
    });

    assert.equal(relatorio.anomalias.length, 0);
    assert.equal(relatorio.saudeSistema.scoreGeral, 100);
    assert.equal(relatorio.saudeSistema.nivel, 'EXCELENTE');
    assert.equal(relatorio.saudeSistema.duplicadosDetectados, 0);
    assert.equal(relatorio.saudeSistema.fantasmasDetectados, 0);
    assert.equal(relatorio.saudeSistema.lotesFantasmasDetectados, 0);
    assert.equal(relatorio.saudeSistema.pilares.length, 6);
    assert.ok(
      relatorio.saudeSistema.pilares.every((p) => p.status === 'OK'),
      'Todos os 6 pilares devem estar OK em base saudável'
    );
    assert.equal(relatorio.saudeSistema.dataCorteFormatada, '22/11/2026 às 11:40');
  });

  it('2. Detecta Diária duplicada, Vale duplicado (preservando metadados mais ricos) e Cadastro duplicado', () => {
    const funcionarios: FuncionarioAuditoriaInput[] = [
      ...criarFuncionariosBase(),
      {
        id: 'func-dup',
        nomeTrabalhador: 'Gilvan - Gil',
        chavePix: '11999990001',
        valorDiaria: 400,
        valorDiariaObra: 400,
        valorDiariaPiscina: 400,
        regimeRemuneracao: 'DIARIA',
        ativo: true,
      },
    ];

    const lancamentos: LancamentoAuditoriaInput[] = [
      // Duas diárias idênticas no mesmo dia/obra/fração
      {
        id: 'diaria-1',
        nomeTrabalhador: 'Manoel',
        obraId: OBRA_CIVIL_ID,
        obraNome: 'Quase Tudo',
        obraTipo: 'CIVIL',
        tipoLancamento: 'PONTO',
        fracaoDia: 1,
        valorMonetario: 230,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: null,
        comprovanteUrl: null,
        valeEtapa: null,
        loteId: null,
        createdAt: '2026-11-21T18:00:00Z',
        chaveIdempotencia: 'diaria-idemp-1',
      },
      {
        id: 'diaria-2',
        nomeTrabalhador: 'Manoel',
        obraId: OBRA_CIVIL_ID,
        obraNome: 'Quase Tudo',
        obraTipo: 'CIVIL',
        tipoLancamento: 'PONTO',
        fracaoDia: 1,
        valorMonetario: 230,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: null,
        comprovanteUrl: null,
        valeEtapa: null,
        loteId: null,
        createdAt: '2026-11-21T18:05:00Z',
        chaveIdempotencia: 'diaria-idemp-2',
      },
      // Dois vales duplicados na mesma janela: o primeiro tem comprovante + solicitante (deve ser mantido)
      {
        id: 'vale-rico',
        nomeTrabalhador: 'Manoel',
        obraId: OBRA_CIVIL_ID,
        obraNome: 'Quase Tudo',
        obraTipo: 'CIVIL',
        tipoLancamento: 'VALE',
        fracaoDia: 0,
        valorMonetario: 100,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: 'Vale PIX completo',
        comprovanteUrl: 'https://r2.example.com/comprovante.jpg',
        valeEtapa: 'CONFIRMADO_PIX',
        loteId: null,
        createdAt: '2026-11-21T14:00:00Z',
        chaveIdempotencia: 'vale-idemp-rico',
        solicitadoPor: 'Gilvan - Gil',
        dataHoraSolicitacao: '2026-11-21T11:00:00-03:00',
        aprovadoPor: 'Patrícia',
      },
      {
        id: 'vale-pobre-dup',
        nomeTrabalhador: 'Manoel',
        obraId: OBRA_CIVIL_ID,
        obraNome: 'Quase Tudo',
        obraTipo: 'CIVIL',
        tipoLancamento: 'VALE',
        fracaoDia: 0,
        valorMonetario: 100,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: 'Duplicado sem comprovante',
        comprovanteUrl: null,
        valeEtapa: 'SOLICITADO',
        loteId: null,
        createdAt: '2026-11-21T14:05:00Z',
        chaveIdempotencia: null,
      },
    ];

    const relatorio = executarAuditoriaInterna({
      lancamentos,
      funcionarios,
      lotes: [],
      obrasAtivasIds: [OBRA_CIVIL_ID],
      agoraRef: new Date('2026-11-22T15:00:00Z'),
    });

    const tipos = relatorio.anomalias.map((a) => a.tipo);
    assert.ok(tipos.includes('DUPLICIDADE_SUSPEITA'), 'Deve detectar diária duplicada');
    assert.ok(tipos.includes('VALE_DUPLICADO'), 'Deve detectar vale duplicado');
    assert.ok(tipos.includes('FUNCIONARIO_DUPLICADO'), 'Deve detectar cadastro duplicado');
    assert.ok(tipos.includes('SEM_CHAVE_IDEMPOTENCIA'), 'Deve sinalizar vale sem chave de idempotência');

    const anomaliaValeDup = relatorio.anomalias.find((a) => a.tipo === 'VALE_DUPLICADO');
    assert.ok(anomaliaValeDup, 'Anomalia VALE_DUPLICADO deve existir');
    assert.equal(
      anomaliaValeDup.lancamentoId,
      'vale-pobre-dup',
      'Deve sugerir descartar o vale com menos metadados, preservando o mais completo'
    );
    assert.equal(anomaliaValeDup.acaoCorretiva.tipo, 'DESCARTAR_DUPLICIDADE');
    assert.equal(anomaliaValeDup.acaoCorretiva.podeAprovarUmClique, true);
    assert.ok(relatorio.saudeSistema.duplicadosDetectados >= 2);
    assert.ok(relatorio.saudeSistema.cadastrosDuplicadosDetectados >= 1);
    assert.ok(relatorio.saudeSistema.scoreGeral < 90);
  });

  it('3. Caça-Fantasmas detecta data anômala, valor zerado, obra órfã, trabalhador sem cadastro e lote fantasma', () => {
    const funcionarios = criarFuncionariosBase();
    const lotes: LoteAuditoriaInput[] = [
      {
        id: 'lote-fantasma-1',
        dataReferencia: '2026-11-21',
        mensagemOriginal: 'Obra teste: ninguém gravado no banco',
        status: 'VALIDADO',
        remetenteNome: 'Gilvan - Gil',
        createdAt: '2026-11-21T18:00:00Z',
        obraNome: 'Quase Tudo',
      },
    ];

    const lancamentos: LancamentoAuditoriaInput[] = [
      // Fantasma 1: data de março criada em novembro (desvio > 45 dias)
      {
        id: 'fantasma-data',
        nomeTrabalhador: 'Manoel',
        obraId: OBRA_CIVIL_ID,
        obraNome: 'Quase Tudo',
        obraTipo: 'CIVIL',
        tipoLancamento: 'PONTO',
        fracaoDia: 1,
        valorMonetario: 230,
        status: 'PENDENTE',
        dataReferencia: '2026-03-30',
        observacao: 'Data deslocada',
        comprovanteUrl: null,
        valeEtapa: null,
        loteId: null,
        createdAt: '2026-11-21T16:00:00Z',
        chaveIdempotencia: 'fantasma-1',
      },
      // Fantasma 2: valor zerado + obra órfã + trabalhador não cadastrado
      {
        id: 'fantasma-orfao',
        nomeTrabalhador: 'Visitante Fantasma',
        obraId: OBRA_INATIVA_ID,
        obraNome: 'Obra Desativada',
        obraTipo: 'CIVIL',
        tipoLancamento: 'PONTO',
        fracaoDia: 1,
        valorMonetario: 0,
        status: 'VALIDADO',
        dataReferencia: '2026-11-21',
        observacao: null,
        comprovanteUrl: null,
        valeEtapa: null,
        loteId: null,
        createdAt: '2026-11-21T16:10:00Z',
        chaveIdempotencia: 'fantasma-2',
      },
    ];

    const relatorio = executarAuditoriaInterna({
      lancamentos,
      funcionarios,
      lotes,
      obrasAtivasIds: [OBRA_CIVIL_ID],
      agoraRef: new Date('2026-11-22T15:00:00Z'),
    });

    const fantasmas = relatorio.anomalias.filter((a) => a.tipo === 'REGISTRO_FANTASMA');
    const lotesFantasmas = relatorio.anomalias.filter((a) => a.tipo === 'LOTE_FANTASMA');

    assert.ok(
      fantasmas.length >= 4,
      `Esperava >= 4 alertas REGISTRO_FANTASMA (data anômala, valor zerado, obra órfã, sem cadastro), obteve ${fantasmas.length}`
    );
    assert.equal(lotesFantasmas.length, 1, 'Deve detectar 1 LOTE_FANTASMA');
    assert.equal(relatorio.saudeSistema.lotesFantasmasDetectados, 1);
    assert.ok(relatorio.saudeSistema.fantasmasDetectados >= 5);
    assert.equal(relatorio.cruzamentoLotes[0]?.isFantasma, true);
  });

  it('4. Integridade da Aba em /relatorios e isolamento multi-tenant em /api/auditoria', () => {
    const repoRoot = process.cwd();
    const relatoriosSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/relatorios/page.tsx'),
      'utf8'
    );
    const apiAuditoriaSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/auditoria/route.ts'),
      'utf8'
    );

    assert.ok(
      relatoriosSrc.includes('SaudeSistemaPanel') &&
        relatoriosSrc.includes("abaAtiva === 'saude'") &&
        relatoriosSrc.includes('Saúde &amp; IA'),
      '/relatorios deve montar a aba Saúde & IA com SaudeSistemaPanel'
    );
    assert.ok(
      apiAuditoriaSrc.includes(".eq('tenant_id', tenantId)") &&
        apiAuditoriaSrc.includes("action === 'aplicar-lote-seguro'") &&
        apiAuditoriaSrc.includes("tipoAcao === 'PREENCHER_IDEMPOTENCIA'"),
      '/api/auditoria deve preservar isolamento por tenant_id e suportar aplicar-lote-seguro + PREENCHER_IDEMPOTENCIA'
    );
  });

  it('5. Cadência configurável (Sob Demanda + 19:30 padrão, Manual, 6h, 12h) calcula próxima execução em BRT', () => {
    assert.equal(CADENCIA_PADRAO_SAUDE, 'SOB_DEMANDA_19H30');
    assert.equal(OPCOES_CADENCIA_SAUDE.length, 4);
    assert.equal(validarCadenciaSaude('INVALIDA'), 'SOB_DEMANDA_19H30');
    assert.equal(validarCadenciaSaude('CADA_6H'), 'CADA_6H');
    assert.equal(validarCadenciaSaude('MANUAL'), 'MANUAL');

    // Antes das 19:30 BRT (14:00 BRT = 17:00 UTC) -> próxima é hoje às 19:30
    const antes1930 = new Date('2026-11-22T17:00:00Z');
    const proxHoje = calcularProximaExecucaoCadencia('SOB_DEMANDA_19H30', antes1930);
    assert.equal(proxHoje.proximaExecucaoFormatada, '22/11/2026 às 19:30');
    assert.equal(proxHoje.proximaExecucaoIso, '2026-11-22T19:30:00-03:00');

    // Depois das 19:30 BRT (20:10 BRT = 23:10 UTC) -> próxima é amanhã às 19:30
    const depois1930 = new Date('2026-11-22T23:10:00Z');
    const proxAmanha = calcularProximaExecucaoCadencia('SOB_DEMANDA_19H30', depois1930);
    assert.equal(proxAmanha.proximaExecucaoFormatada, '23/11/2026 às 19:30');
    assert.equal(proxAmanha.proximaExecucaoIso, '2026-11-23T19:30:00-03:00');

    // Manual -> null (sem agendamento automático)
    const proxManual = calcularProximaExecucaoCadencia('MANUAL', antes1930);
    assert.equal(proxManual.proximaExecucaoIso, null);
    assert.equal(proxManual.proximaExecucaoFormatada, null);

    // A cada 6h (07:00, 13:00, 19:00) às 14:00 BRT -> 19:00 hoje
    const prox6h = calcularProximaExecucaoCadencia('CADA_6H', antes1930);
    assert.equal(prox6h.proximaExecucaoFormatada, '22/11/2026 às 19:00');

    // A cada 12h (07:30, 19:30) às 06:00 BRT (09:00 UTC) -> 07:30 hoje
    const manhaCedo = new Date('2026-11-22T09:00:00Z');
    const prox12h = calcularProximaExecucaoCadencia('CADA_12H', manhaCedo);
    assert.equal(prox12h.proximaExecucaoFormatada, '22/11/2026 às 07:30');

    // Formatação Brasília
    assert.equal(
      formatarDataHoraBrasilia('2026-11-22T22:30:00Z'),
      '22/11/2026 às 19:30'
    );
  });

  it('6. Idempotência por slot de cadência evita execuções duplicadas no mesmo horário', () => {
    // Antes do slot das 19:30 BRT -> não devida
    const antesSlot = new Date('2026-11-22T21:00:00Z'); // 18:00 BRT
    assert.equal(
      verificarExecucaoCadenciaDevida('SOB_DEMANDA_19H30', null, antesSlot).devida,
      false
    );

    // Após 19:30 BRT (19:35 BRT = 22:35 UTC) sem execução prévia -> devida no slot 19:30
    const aposSlot = new Date('2026-11-22T22:35:00Z');
    const check1 = verificarExecucaoCadenciaDevida('SOB_DEMANDA_19H30', null, aposSlot);
    assert.equal(check1.devida, true);
    assert.equal(check1.slotAtual, '19:30');

    // Já executou às 19:31 BRT no mesmo dia -> NÃO devida novamente
    const check2 = verificarExecucaoCadenciaDevida(
      'SOB_DEMANDA_19H30',
      '2026-11-22T19:31:00-03:00',
      aposSlot
    );
    assert.equal(check2.devida, false);
    assert.equal(check2.slotAtual, '19:30');

    // Cadência CADA_12H: executou às 07:32 BRT, chegou 19:35 BRT -> devida no slot 19:30
    const check12h = verificarExecucaoCadenciaDevida(
      'CADA_12H',
      '2026-11-22T07:32:00-03:00',
      aposSlot
    );
    assert.equal(check12h.devida, true);
    assert.equal(check12h.slotAtual, '19:30');

    // MANUAL nunca é devida no cron
    assert.equal(
      verificarExecucaoCadenciaDevida('MANUAL', null, aposSlot).devida,
      false
    );
  });

  it('7. Fim do loop piscando, exibição do último laudo salvo, histórico auditável e cron multi-tenant', () => {
    const repoRoot = process.cwd();
    const panelSrc = fs.readFileSync(
      path.join(repoRoot, 'src/components/SaudeSistemaPanel.tsx'),
      'utf8'
    );
    const relatoriosSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/relatorios/page.tsx'),
      'utf8'
    );
    const apiAuditoriaSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/auditoria/route.ts'),
      'utf8'
    );
    const cronSrc = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/cron/saude-sistema/route.ts'),
      'utf8'
    );
    const cadenciaSvcSrc = fs.readFileSync(
      path.join(repoRoot, 'src/services/saudeCadenciaService.ts'),
      'utf8'
    );

    // Anti-flicker: callback estável via ref + setResumoSaude direto (sem arrow inline)
    assert.ok(
      panelSrc.includes('onScoreCarregadoRef') &&
        panelSrc.includes('carregandoInicial') &&
        panelSrc.includes('varrendo') &&
        !panelSrc.includes('setLoading('),
      'SaudeSistemaPanel deve usar onScoreCarregadoRef e separar carregandoInicial de varrendo'
    );
    assert.ok(
      relatoriosSrc.includes('onScoreCarregado={setResumoSaude}'),
      '/relatorios deve passar referência estável setResumoSaude para evitar re-renders em loop'
    );

    // UI exibe último laudo, seletor de cadência e histórico auditável
    assert.ok(
      panelSrc.includes('Histórico Auditável de Laudos') &&
        panelSrc.includes('Executar Varredura') &&
        panelSrc.includes('OPCOES_CADENCIA_SAUDE'),
      'SaudeSistemaPanel deve exibir botão Executar Varredura, seletor de cadência e Histórico Auditável'
    );

    // API /api/auditoria + /api/cron/saude-sistema + persistência com tenant_id
    assert.ok(
      apiAuditoriaSrc.includes("action === 'executar-varredura'") &&
        apiAuditoriaSrc.includes("action === 'configurar-cadencia'") &&
        apiAuditoriaSrc.includes('obterEstadoSaudeSistema'),
      '/api/auditoria deve suportar último laudo salvo, executar-varredura e configurar-cadencia'
    );
    assert.ok(
      cronSrc.includes('verificarExecucaoCadenciaDevida') &&
        cronSrc.includes("origem: 'CADENCIA'") &&
        cadenciaSvcSrc.includes(".eq('tenant_id', tenantId)"),
      '/api/cron/saude-sistema e saudeCadenciaService devem preservar isolamento por tenant_id e idempotência por slot'
    );
  });
});
