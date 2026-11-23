import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  OPCOES_CONDOMINIO_ACESSO,
  OPCOES_OCORRENCIA_IMPEDIMENTO,
  agruparEfetivoPorEmpreiteiro,
  filtrarFuncionariosPorEmpreiteiroEBusca,
  formatarNomeFuncionarioComMetadados,
  gerarCsvRelatorioEmpreiteiro,
  gerarTextoWhatsAppConsolidadoEmpreiteiro,
  gerarTextoWhatsAppDiario,
  isSubempreitaHabilitada,
  montarOpcoesEtapasObra,
  montarTextoOcorrencia,
  parsearApelidosLista,
  sanitizarStatusCondominio,
  type DiarioObraRegistro,
  type FuncionarioEmpreiteiroRecord,
} from '@/lib/diarioObraRelatorio';
import { gerarPdfDiarioBase64 } from '@/lib/pdfDiario';

const TENANT_INTERMACK_ID = '00000000-0000-0000-0000-000000000002';
const TENANT_JHOSTON_ID = '00000000-0000-0000-0000-000000000001';

describe('Diário de Obra V20 — Subempreita exclusiva Intermack vs Fluxo Direto Jhoston', () => {
  it('1. Ativação condicional estrita por tenant_id: subempreita habilitada SOMENTE na Intermack', () => {
    assert.equal(isSubempreitaHabilitada('intermack'), true);
    assert.equal(isSubempreitaHabilitada(TENANT_INTERMACK_ID), true);
    assert.equal(isSubempreitaHabilitada('jhoston'), false);
    assert.equal(isSubempreitaHabilitada(TENANT_JHOSTON_ID), false);
    assert.equal(isSubempreitaHabilitada(''), false);
  });

  it('2. Separa Condomínio / Acesso de Ocorrência / Impedimento (Falta de Material fora de Acesso)', () => {
    assert.ok(
      !OPCOES_CONDOMINIO_ACESSO.some((o) =>
        o.toLowerCase().includes('falta de material')
      ),
      'Condomínio / Acesso não deve misturar Falta de Material do Cliente'
    );
    assert.ok(
      OPCOES_OCORRENCIA_IMPEDIMENTO.includes('Falta de Material do Cliente'),
      'Falta de Material do Cliente deve estar em Ocorrência / Impedimento'
    );
    assert.equal(
      sanitizarStatusCondominio('Falta de Material do Cliente'),
      'Acesso Normal'
    );
    assert.equal(
      sanitizarStatusCondominio('Restrição de Barulho / Horário'),
      'Restrição de Horário / Barulho'
    );
    assert.equal(montarTextoOcorrencia('', ''), '');
    assert.equal(
      montarTextoOcorrencia('Falta de Material do Cliente', 'Sem porcelanato na obra'),
      'Falta de Material do Cliente: Sem porcelanato na obra'
    );
  });

  it('3. Busca por Empreiteiro, Apelidos e Documento + Merge de Etapas da Obra com Etapas Padrão', () => {
    const funcs: FuncionarioEmpreiteiroRecord[] = [
      {
        id: 'f-1',
        tenantId: TENANT_INTERMACK_ID,
        empreiteiroId: 'emp-alex',
        empreiteiroNome: 'Alexandre Reis',
        nomeOficial: 'Antônio Silva',
        apelidos: parsearApelidosLista('Tom, Tonho, Tom'),
        documento: '123.456.789-00',
        ativo: true,
      },
      {
        id: 'f-2',
        tenantId: TENANT_INTERMACK_ID,
        empreiteiroId: 'emp-edson',
        empreiteiroNome: 'Edson',
        nomeOficial: 'Carlos Júnior',
        apelidos: parsearApelidosLista('Juninho'),
        documento: 'RG 44.555.666-1',
        ativo: true,
      },
    ];

    assert.deepEqual(funcs[0].apelidos, ['Tom', 'Tonho']);

    // Filtro por empreiteiro Alexandre Reis + busca por apelido "Tonho"
    const resTonho = filtrarFuncionariosPorEmpreiteiroEBusca(
      funcs,
      'emp-alex',
      'tonho'
    );
    assert.equal(resTonho.length, 1);
    assert.equal(resTonho[0].id, 'f-1');

    // Busca por documento sem pontos
    const resDoc = filtrarFuncionariosPorEmpreiteiroEBusca(
      funcs,
      'emp-alex',
      '123456'
    );
    assert.equal(resDoc.length, 1);
    assert.equal(resDoc[0].nomeOficial, 'Antônio Silva');

    // Isolamento de equipe: buscar "Juninho" dentro da equipe do Alexandre retorna 0
    const resIsolado = filtrarFuncionariosPorEmpreiteiroEBusca(
      funcs,
      'emp-alex',
      'Juninho'
    );
    assert.equal(resIsolado.length, 0);

    // Formatação com apelidos e documento
    assert.equal(
      formatarNomeFuncionarioComMetadados({
        nome: 'Antônio Silva',
        apelidos: ['Tom', 'Tonho'],
        documento: '123.456.789-00',
      }),
      'Antônio Silva (Tom, Tonho) • Doc: 123.456.789-00'
    );

    // Etapas da obra cadastradas no topo + padrão sem duplicar "Hidráulica"
    const opcoesEtapas = montarOpcoesEtapasObra([
      { id: 'et-1', nome: 'Hidráulica' },
      { id: 'et-2', nome: 'Forro Acústico Sala' },
    ]);
    assert.equal(opcoesEtapas[0].nome, 'Hidráulica');
    assert.equal(opcoesEtapas[0].origem, 'OBRA');
    assert.equal(opcoesEtapas[1].nome, 'Forro Acústico Sala');
    assert.equal(
      opcoesEtapas.filter((e) => e.nome === 'Hidráulica').length,
      1,
      'Não deve duplicar etapa padrão já cadastrada na obra'
    );
  });

  it('4. Relatório Intermack agrupa/filtra por Empreiteiro (WhatsApp, PDF e CSV) enquanto Jhoston mantém fluxo direto', () => {
    const diarioIntermack: DiarioObraRegistro = {
      id: 'rdo-int-1',
      tenantSlug: 'intermack',
      empresaNome: 'Intermack',
      obraId: 'obra-1',
      obraNome: 'APARTAMENTO ITAIM',
      ambiente: 'INTERNO',
      data: '2026-11-23',
      clima: 'Ensolarado',
      statusCondominio: 'Restrição de Horário / Barulho',
      ocorrenciaTipo: '',
      ocorrencias: '',
      empreiteiroId: 'emp-alex',
      empreiteiro: 'Alexandre Reis',
      etapaNome: 'Hidráulica',
      efetivo: [
        {
          funcionarioId: 'f-1',
          nome: 'Antônio Silva',
          apelidos: ['Tom', 'Tonho'],
          documento: '123.456.789-00',
          empreiteiroId: 'emp-alex',
          empreiteiroNome: 'Alexandre Reis',
          etapaNome: 'Hidráulica',
          periodo: 'INTEGRAL',
        },
        {
          funcionarioId: 'f-2',
          nome: 'Carlos Júnior',
          apelidos: ['Juninho'],
          documento: 'RG 44.555.666-1',
          empreiteiroId: 'emp-edson',
          empreiteiroNome: 'Edson',
          etapaNome: 'Gesso',
          periodo: 'MEIO_DIA',
        },
      ],
      resumo: 'Passagem de tubulação nos banheiros e fechamento de sanca.',
      fotos: ['https://example.com/foto1.jpg'],
      criadoPor: 'Patrícia Grubel',
      criadoEm: '2026-11-23T18:00:00Z',
    };

    const gruposTodos = agruparEfetivoPorEmpreiteiro(diarioIntermack);
    assert.equal(gruposTodos.length, 2);
    assert.equal(gruposTodos[0].empreiteiroNome, 'Alexandre Reis');
    assert.deepEqual(gruposTodos[0].etapas, ['Hidráulica']);
    assert.equal(gruposTodos[1].empreiteiroNome, 'Edson');
    assert.deepEqual(gruposTodos[1].etapas, ['Gesso']);

    // Filtro somente Alexandre Reis no WhatsApp
    const zapAlex = gerarTextoWhatsAppDiario(diarioIntermack, 'Alexandre Reis');
    assert.ok(zapAlex.includes('Alexandre Reis'));
    assert.ok(zapAlex.includes('Hidráulica'));
    assert.ok(zapAlex.includes('Antônio Silva (Tom, Tonho) • Doc: 123.456.789-00'));
    assert.ok(!zapAlex.includes('Juninho'), 'Filtro de empreiteiro deve excluir equipe de Edson');
    assert.ok(
      !zapAlex.includes('Ocorrência / Impedimento'),
      'Não deve exibir bloco de ocorrência quando não houver impedimento'
    );

    // Consolidado e CSV filtrados por Edson
    const consolidadoEdson = gerarTextoWhatsAppConsolidadoEmpreiteiro(
      [diarioIntermack],
      'Edson'
    );
    assert.ok(consolidadoEdson.includes('Edson'));
    assert.ok(consolidadoEdson.includes('Gesso'));
    assert.ok(consolidadoEdson.includes('Carlos Júnior (Juninho)'));
    assert.ok(!consolidadoEdson.includes('Alexandre Reis'));

    const csvEdson = gerarCsvRelatorioEmpreiteiro([diarioIntermack], 'Edson');
    assert.ok(csvEdson.includes('Edson;Gesso;Carlos Júnior;Juninho;RG 44.555.666-1;Meio Dia'));
    assert.ok(!csvEdson.includes('Alexandre Reis'));

    // PDF filtrado por Alexandre Reis
    const pdfAlex = gerarPdfDiarioBase64(diarioIntermack, 'Alexandre Reis');
    assert.ok(pdfAlex.fileName.includes('alexandre-reis'));
    const pdfDecoded = Buffer.from(pdfAlex.base64, 'base64').toString('utf8');
    assert.ok(pdfDecoded.includes('Empreiteiro / Encarregado: Alexandre Reis'));
    assert.ok(pdfDecoded.includes('Hidraulica'));
    assert.ok(!pdfDecoded.includes('Juninho'));

    // Jhoston preserva formato direto (sem blocos de subempreita)
    const diarioJhoston: DiarioObraRegistro = {
      id: 'rdo-jho-1',
      tenantSlug: 'jhoston',
      empresaNome: 'Jhoston',
      obraNome: 'PISCINA PORTO SEGURO',
      ambiente: 'EXTERNO',
      data: '2026-11-23',
      clima: 'Ensolarado',
      empreiteiro: '',
      efetivo: [{ nome: 'Gilvan - Gil', periodo: 'INTEGRAL' }],
      resumo: 'Revestimento lateral concluído.',
      ocorrencias: '',
      fotos: [],
      criadoPor: 'Patrícia Grubel',
      criadoEm: '2026-11-23T18:00:00Z',
    };

    const zapJhoston = gerarTextoWhatsAppDiario(diarioJhoston);
    assert.ok(zapJhoston.includes('Gilvan - Gil (Dia Inteiro)'));
    assert.ok(!zapJhoston.includes('*Empreiteiro:*'));
    assert.ok(!zapJhoston.includes('*Etapa / Serviço:*'));

    const pdfJhoston = gerarPdfDiarioBase64(diarioJhoston);
    const pdfJhoStr = Buffer.from(pdfJhoston.base64, 'base64').toString('utf8');
    assert.ok(pdfJhoStr.includes('EFETIVO PRESENTE \\(1 profissional'));
    assert.ok(pdfJhoStr.includes('Gilvan - Gil \\(Dia Inteiro\\)'));
    assert.ok(!pdfJhoStr.includes('Empreiteiro / Encarregado:'));
  });

  it('5. Guardas de isolamento tenant_id e bloqueio Intermack-only nas rotas e UI', () => {
    const repoRoot = process.cwd();
    const equipesApi = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/diario-obra/equipes/route.ts'),
      'utf8'
    );
    const diarioApi = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/diario-obra/route.ts'),
      'utf8'
    );
    const diarioPage = fs.readFileSync(
      path.join(repoRoot, 'src/app/diario-obra/page.tsx'),
      'utf8'
    );
    const migrationSql = fs.readFileSync(
      path.join(repoRoot, 'supabase/migration_v20_diario_obra_empreiteiros.sql'),
      'utf8'
    );

    assert.ok(
      equipesApi.includes("slug === 'intermack'") &&
        equipesApi.includes('status: 403'),
      '/api/diario-obra/equipes deve restringir escrita exclusivamente à Intermack'
    );
    assert.ok(
      diarioApi.includes('isSubempreitaHabilitada') &&
        diarioApi.includes(".eq('tenant_id', activeTenant.id)"),
      '/api/diario-obra deve isolar por tenant_id e condicionar subempreita à Intermack'
    );
    assert.ok(
      diarioPage.includes('subempreitaAtiva') &&
        diarioPage.includes('OPCOES_CONDOMINIO_ACESSO') &&
        diarioPage.includes('OPCOES_OCORRENCIA_IMPEDIMENTO'),
      '/diario-obra UI deve condicionar subempreita à Intermack e separar Acesso de Ocorrência'
    );
    assert.ok(
      migrationSql.includes('empreiteiros_diario') &&
        migrationSql.includes('funcionarios_empreiteiro') &&
        migrationSql.includes('ENABLE ROW LEVEL SECURITY'),
      'Migration V20 deve criar tabelas com RLS multi-tenant'
    );
  });

  it('6. /setup condicional: Intermack exibe 3 abas de subempreita sem duplicar FeatureFlags (centralizadas em /config-geral) e Jhoston preserva cadastro diarista', () => {
    const repoRoot = process.cwd();
    const setupPage = fs.readFileSync(
      path.join(repoRoot, 'src/app/setup/page.tsx'),
      'utf8'
    );
    const setupIntermack = fs.readFileSync(
      path.join(repoRoot, 'src/components/SetupIntermackPanel.tsx'),
      'utf8'
    );
    const etapasApi = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/diario-obra/etapas/route.ts'),
      'utf8'
    );
    const diarioApi = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/diario-obra/route.ts'),
      'utf8'
    );
    const migrationV22 = fs.readFileSync(
      path.join(repoRoot, 'supabase/migration_v22_intermack_setup_subempreita.sql'),
      'utf8'
    );

    // /setup condicional + SEM FeatureFlags duplicada (centralizadas em /config-geral) + Jhoston intacta
    assert.ok(
      setupPage.includes('if (isIntermack)') &&
        setupPage.includes('<SetupIntermackPanel />') &&
        !setupPage.includes('FeatureFlagsHomologacaoPanel') &&
        setupPage.includes('Chave PIX para Pagamento *'),
      '/setup deve renderizar SetupIntermackPanel só para Intermack, não duplicar FeatureFlagsHomologacaoPanel e manter cadastro Jhoston intacto'
    );

    // 3 abas obrigatórias no SetupIntermackPanel + PIX individual não obrigatório
    assert.ok(
      setupIntermack.includes('Empreiteiros / Encarregados') &&
        setupIntermack.includes('Funcionários / Equipe') &&
        setupIntermack.includes('Obras &amp; Etapas') &&
        setupIntermack.includes('Chave PIX (opcional)') &&
        setupIntermack.includes('Chave PIX individual não é obrigatória'),
      'SetupIntermackPanel deve conter as 3 abas exigidas e não exigir PIX individual para funcionários de subempreita'
    );

    // Etapas da obra integradas com /api/diario-obra e isoladas por tenant_id
    assert.ok(
      etapasApi.includes('isSubempreitaHabilitada') &&
        etapasApi.includes(".eq('tenant_id', activeTenant.id)") &&
        etapasApi.includes('status: 403') &&
        diarioApi.includes('etapas_por_obra_v22'),
      '/api/diario-obra/etapas deve ser exclusivo Intermack com tenant_id e alimentar /api/diario-obra'
    );
    assert.ok(
      migrationV22.includes('ALTER TABLE public.empreiteiros_diario') &&
        migrationV22.includes('chave_pix'),
      'Migration V22 deve adicionar chave_pix opcional em empreiteiros_diario'
    );
  });
});
