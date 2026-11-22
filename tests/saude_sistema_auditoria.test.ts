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
});
