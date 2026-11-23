import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  consolidarContasCaixinha,
  deduplicarMovimentosCaixinha,
  isLancamentoSinteticoConsolidado,
  type MovimentoCaixaCampo,
} from '@/lib/caixinhaDeduplicacao';
import { formatarNomeExibicaoTrabalhador } from '@/lib/normalizarObra';
import { formatarTicketPontoWhatsApp } from '@/services/ticketPonto';
import {
  aplicarFallbackOcrCaixinha,
  EMISSORES_PIX_PADRAO,
  extrairEmissoresPixAtivos,
  formatarDataHoraBr,
  isEmissorPixPadrao,
  listarEmissoresPixTenant,
  normalizarEmissorPix,
  normalizarListaEmissoresConfig,
} from '@/lib/caixinhaPixRastreabilidade';

describe('Caixinha de Campo V21 — Anti-Duplicidade do Gil & Unificação no Menu', () => {
  it('1. Elimina dupla contagem entre consolidado sintético pré-implantação (SQL) e os 12 lançamentos itemizados reais (JSONB)', () => {
    // Reproduz o bug exato auditado (R$ 1.400,00 / R$ 1.091,56 / R$ 308,44)
    const movimentosSqlSinteticos: MovimentoCaixaCampo[] = [
      {
        id: '91568b3a-c054-4ced-93bd-0ebd66f757ce',
        encarregado: 'Gil',
        encarregadoOrigem: 'Gil / Gil335Revest',
        obra: 'PISCINA PORTO SEGURO',
        data: '2026-11-13',
        hora: '09:00',
        tipo: 'ENTRADA_PIX',
        categoria: 'Suprimento PIX',
        descricao:
          'Entradas PIX consolidadas (Pré-implantação 13/11 — Gil + Gil335Revest)',
        valor: 700.0,
        status: 'APROVADO',
        isPreImplantacao: true,
        enviadoPor: 'Patrícia Grubel',
        criadoEm: '2026-11-13T12:00:00.000Z',
      },
      {
        id: '6001dc0f-14ff-44c0-9175-75f6d6069b49',
        encarregado: 'Gil',
        encarregadoOrigem: 'Gil / Gil335Revest',
        obra: 'PISCINA PORTO SEGURO',
        data: '2026-11-13',
        hora: '17:30',
        tipo: 'NOTA_DESPESA',
        categoria: 'Material / Despesas de Campo',
        descricao:
          'Saídas e notas comprovadas (Pré-implantação 13/11 — Gil + Gil335Revest)',
        valor: 546.94,
        status: 'APROVADO',
        isPreImplantacao: true,
        enviadoPor: 'Gil',
        criadoEm: '2026-11-13T20:30:00.000Z',
      },
    ];

    const movimentosItemizadosReais: MovimentoCaixaCampo[] = [
      { id: '954f', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-13', hora: '09:00', tipo: 'ENTRADA_PIX', categoria: 'Suprimento PIX', descricao: 'PIX enviado em 13/11', valor: 200, status: 'APROVADO', isPreImplantacao: true, enviadoPor: 'Administração', criadoEm: '2026-11-19T17:56:30Z' },
      { id: 'e98d', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-13', hora: '14:00', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Nota Fiscal 13/11 — 97', valor: 97, status: 'APROVADO', isPreImplantacao: true, enviadoPor: 'Gil', criadoEm: '2026-11-19T17:56:30Z' },
      { id: 'ec42', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-13', hora: '14:05', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Nota Fiscal 13/11 — 37,47', valor: 37.47, status: 'APROVADO', isPreImplantacao: true, enviadoPor: 'Gil', criadoEm: '2026-11-19T17:56:30Z' },
      { id: '83a5', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '07:34', tipo: 'ENTRADA_PIX', categoria: 'Suprimento PIX', descricao: 'PIX Joabson materiais', valor: 200, status: 'APROVADO', enviadoPor: 'Joabson', criadoEm: '2026-11-19T16:18:49Z' },
      { id: '929f', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '08:20', tipo: 'ENTRADA_PIX', categoria: 'Suprimento PIX', descricao: 'PIX Joabson bombas', valor: 200, status: 'APROVADO', enviadoPor: 'Joabson', criadoEm: '2026-11-19T16:18:49Z' },
      { id: '72d7', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '08:37', tipo: 'NOTA_DESPESA', categoria: 'Locação de Equipamento', descricao: 'Locação Bomba', valor: 200, status: 'APROVADO', enviadoPor: 'Gil', criadoEm: '2026-11-19T16:18:49Z' },
      { id: 'a8b8', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '08:52', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Cupom Material #1', valor: 48, status: 'APROVADO', enviadoPor: 'Gil', criadoEm: '2026-11-19T16:18:49Z' },
      { id: '778c', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '09:04', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Cupom Material #2', valor: 9.99, status: 'APROVADO', enviadoPor: 'Gil', criadoEm: '2026-11-19T16:18:49Z' },
      { id: 'ae90', encarregado: 'Gil (Gilvan)', obra: 'PORTO SEGURO', data: '2026-11-19', hora: '09:04', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Cupom Material #3', valor: 31.19, status: 'APROVADO', enviadoPor: 'Gil', criadoEm: '2026-11-19T16:18:49Z' },
      { id: 'caf3', encarregado: 'Gil', obra: 'OBRA BAHIA (PORTO SEGURO)', data: '2026-11-20', hora: '09:22', tipo: 'ENTRADA_PIX', categoria: 'Suprimento PIX', descricao: 'PIX Gilvan', valor: 100, status: 'PENDENTE', enviadoPor: 'Administração', criadoEm: '2026-11-20T12:22:20Z' },
      { id: '3780', encarregado: 'Gil', obra: 'OBRA BAHIA (PORTO SEGURO)', data: '2026-11-20', hora: '09:24', tipo: 'NOTA_DESPESA', categoria: 'Material', descricao: 'Pataxo Materiais', valor: 85, status: 'PENDENTE', enviadoPor: 'Administração', criadoEm: '2026-11-20T12:24:04Z' },
      { id: 'daf4', encarregado: 'Gil', obra: 'OBRA BAHIA (PORTO SEGURO)', data: '2026-11-20', hora: '09:24', tipo: 'NOTA_DESPESA', categoria: 'Combustível', descricao: 'Alcool Safra', valor: 35.97, status: 'PENDENTE', enviadoPor: 'Administração', criadoEm: '2026-11-20T12:24:35Z' },
    ];

    assert.equal(isLancamentoSinteticoConsolidado(movimentosSqlSinteticos[0]), true);
    assert.equal(isLancamentoSinteticoConsolidado(movimentosItemizadosReais[0]), false);

    // Mescla SQL sintético + JSONB itemizado + duplicata exata no SQL
    const limpos = deduplicarMovimentosCaixinha(
      [...movimentosSqlSinteticos, movimentosItemizadosReais[0]],
      movimentosItemizadosReais
    );
    assert.equal(limpos.length, 12, 'Deve manter exatamente os 12 movimentos reais sem os 2 sintéticos sobrepostos');

    const contas = consolidarContasCaixinha(limpos);
    assert.equal(contas.length, 1, 'Gil e Gil (Gilvan) devem unificar em 1 única conta');
    assert.equal(contas[0].encarregado, 'Gil');
    assert.equal(contas[0].totalRecebido, 700);
    assert.equal(contas[0].totalComprovado, 544.62);
    assert.equal(contas[0].saldoEmMaos, 155.38);
  });

  it('2. Preserva fallback sintético caso não exista nenhum lançamento itemizado para o encarregado', () => {
    const somenteSintetico: MovimentoCaixaCampo[] = [
      {
        id: 'v11-preimp-2026-11-13-gil-entradas-700',
        encarregado: 'Gil',
        obra: 'PISCINA PORTO SEGURO',
        data: '2026-11-13',
        hora: '09:00',
        tipo: 'ENTRADA_PIX',
        categoria: 'Suprimento PIX',
        descricao: 'Entradas PIX consolidadas (Pré-implantação 13/11)',
        valor: 700,
        status: 'APROVADO',
        isPreImplantacao: true,
        enviadoPor: 'Patrícia Grubel',
        criadoEm: '2026-11-13T12:00:00Z',
      },
    ];
    const resultado = deduplicarMovimentosCaixinha(somenteSintetico, []);
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].valor, 700);
  });

  it('3. Menu unificado em uma única entrada "Caixinha de Campo" (/caixinha) com Reembolsos integrado', () => {
    const repoRoot = process.cwd();
    const sidebar = fs.readFileSync(
      path.join(repoRoot, 'src/components/Sidebar.tsx'),
      'utf8'
    );
    const mobileHeader = fs.readFileSync(
      path.join(repoRoot, 'src/components/MobileHeader.tsx'),
      'utf8'
    );
    const commandPalette = fs.readFileSync(
      path.join(repoRoot, 'src/components/CommandPalette.tsx'),
      'utf8'
    );
    const caixinhaPage = fs.readFileSync(
      path.join(repoRoot, 'src/app/caixinha/page.tsx'),
      'utf8'
    );
    const reembolsosPage = fs.readFileSync(
      path.join(repoRoot, 'src/app/reembolsos/page.tsx'),
      'utf8'
    );
    const migrationV21 = fs.readFileSync(
      path.join(repoRoot, 'supabase/migration_v21_deduplicacao_caixinha_gil.sql'),
      'utf8'
    );

    assert.ok(
      sidebar.includes("name: 'Caixinha de Campo'") &&
        sidebar.includes("href: '/caixinha'") &&
        !sidebar.includes("href: '/reembolsos'"),
      'Sidebar deve ter apenas uma entrada Caixinha de Campo (/caixinha), sem /reembolsos duplicado'
    );
    assert.ok(
      mobileHeader.includes("name: 'Caixinha de Campo'") &&
        !mobileHeader.includes("href: '/reembolsos'"),
      'MobileHeader não deve duplicar /reembolsos'
    );
    assert.ok(
      !commandPalette.includes("href: '/reembolsos'"),
      'CommandPalette deve direcionar apenas para /caixinha'
    );
    assert.ok(
      caixinhaPage.includes('ReembolsosPanel') &&
        caixinhaPage.includes('CaixaCampoPanel'),
      '/caixinha deve integrar CaixaCampoPanel e ReembolsosPanel na mesma tela'
    );
    assert.ok(
      reembolsosPage.includes('/caixinha?secao=reembolsos'),
      'Rota legada /reembolsos deve redirecionar suavemente para /caixinha?secao=reembolsos'
    );
    assert.ok(
      migrationV21.includes("tenant_id = '00000000-0000-0000-0000-000000000001'") &&
        migrationV21.includes('ON CONFLICT (id) DO NOTHING'),
      'Migration V21 deve ser isolada ao tenant Jhoston e idempotente'
    );
  });

  it('4. Exibição limpa do Gil: sempre "Gil" na UI, Caixinha e Tickets sem vazar Gilvan/Gil335Revest', () => {
    const variacoesGil = [
      'Gil',
      'GIL',
      'Gilvan',
      'Gilvan - Gil',
      'Gil (Gilvan)',
      'Gil335Revest',
      'Gil + Gil335Revest',
      'Gil / Gilvan / Gil335Revest',
      'Gilvan Batista dos Santos',
      '24993212989',
      '5524993212989@s.whatsapp.net',
    ];

    for (const variacao of variacoesGil) {
      assert.equal(
        formatarNomeExibicaoTrabalhador(variacao),
        'Gil',
        `Esperava "Gil" limpo para "${variacao}"`
      );
    }

    // Ticket WhatsApp nunca exibe Gilvan - Gil ou Gil335Revest
    const ticket = formatarTicketPontoWhatsApp({
      loteId: 'abcdef12-3456-7890-abcd-ef1234567890',
      obraNome: 'PISCINA PORTO SEGURO',
      dataReferencia: '2026-11-23',
      apontadoPorTelefone: '5524993212989',
      dataHoraEnvioOriginal: '18:00',
      homologadoPor: 'Patrícia Grubel',
      dataHoraHomologacao: '23/11/2026 18:10',
      apontamentos: [
        { nome: 'Gilvan - Gil', fracao: 1, motivo: 'NORMAL' },
        { nome: 'Gil335Revest', fracao: 0.5, motivo: 'MEIO' },
      ],
      totalColaboradores: 2,
    });
    assert.ok(ticket.includes('• Gil.......................'));
    assert.ok(!ticket.includes('Gilvan'));
    assert.ok(!ticket.includes('Gil335Revest'));

    // CaixaCampoPanel não renderiza badge concatenado "Unificado: ..."
    const repoRoot = process.cwd();
    const caixaPanel = fs.readFileSync(
      path.join(repoRoot, 'src/components/CaixaCampoPanel.tsx'),
      'utf8'
    );
    assert.ok(
      !caixaPanel.includes("aliasesUnificados.join(' + ')") &&
        !caixaPanel.includes('Unificado:'),
      'CaixaCampoPanel não deve exibir badge concatenado de apelidos no card'
    );
  });

  it('5. V24 Fallback Inteligente OCR: comprovante Nubank cortado herda emissor e horário do WhatsApp (ou barra de status) e normaliza emissores', () => {
    // Normalização de emissores (nomes e telefones)
    assert.equal(normalizarEmissorPix('Patrícia Grubel'), 'Patrícia');
    assert.equal(normalizarEmissorPix('5511978543369'), 'Patrícia');
    assert.equal(normalizarEmissorPix('Daniel Lopes'), 'Daniel');
    assert.equal(normalizarEmissorPix('5524998424641'), 'Joabson');
    assert.equal(normalizarEmissorPix('Jhoston Construções LTDA'), 'Conta Empresa');
    assert.equal(normalizarEmissorPix('não visível'), null);

    const listaEmissores = listarEmissoresPixTenant([
      'Patrícia Grubel',
      'Joabson Nascimento',
      'Daniel Lopes',
      'Conta Empresa',
    ]);
    assert.deepEqual(listaEmissores, [
      'Patrícia',
      'Joabson',
      'Daniel',
      'Conta Empresa',
    ]);

    // Cenário A: Comprovante Nubank cortado enviado via WhatsApp pelo Joabson às 14:32 BRT (17:32 UTC)
    const tsUnix = Math.floor(Date.parse('2026-11-23T14:32:00-03:00') / 1000);
    const cortadoZap = aplicarFallbackOcrCaixinha(
      {
        tipo: 'ENTRADA_PIX',
        valor: 300,
        categoria: 'Suprimento PIX',
        descricao: 'PIX p/ material obra',
        destinatario: 'Gilvan - Gil',
        emissorPix: null,
        data: null,
        hora: null,
        comprovanteCortado: true,
      },
      {
        remetenteNome: 'Joabson Nascimento',
        remetenteTelefone: '5524998424641',
        whatsappTimestamp: tsUnix,
      }
    );
    assert.equal(cortadoZap.destinatario, 'Gil');
    assert.equal(cortadoZap.emissorPix, 'Joabson');
    assert.equal(cortadoZap.origemEmissor, 'INFERIDO_WHATSAPP');
    assert.equal(cortadoZap.labelOrigemEmissor, 'Inferido via WhatsApp');
    assert.equal(cortadoZap.data, '2026-11-23');
    assert.equal(cortadoZap.hora, '14:32');
    assert.equal(cortadoZap.dataHoraEnvio, '2026-11-23T14:32:00-03:00');
    assert.equal(cortadoZap.origemDataHora, 'INFERIDO_WHATSAPP');
    assert.equal(cortadoZap.comprovanteCortado, true);
    assert.equal(formatarDataHoraBr(cortadoZap.data, cortadoZap.hora), '23/11/2026 às 14:32');

    // Cenário B: Print cortado no upload manual mas com relógio da barra superior visível ("09:47")
    const cortadoTela = aplicarFallbackOcrCaixinha(
      {
        tipo: 'ENTRADA_PIX',
        valor: 200,
        destinatario: 'Gil',
        emissorPix: null,
        data: '23/11/2026',
        hora: null,
        horaBarraStatus: '09:47',
      },
      {
        usuarioLogado: 'Patrícia Grubel',
      }
    );
    assert.equal(cortadoTela.emissorPix, 'Patrícia');
    assert.equal(cortadoTela.origemEmissor, 'INFERIDO_OPERADOR');
    assert.equal(cortadoTela.data, '2026-11-23');
    assert.equal(cortadoTela.hora, '09:47');
    assert.equal(cortadoTela.origemDataHora, 'CAPTURADO_TELA');
    assert.equal(cortadoTela.comprovanteCortado, true);

    // Cenário C: Comprovante completo (OCR direto sem corte)
    const completo = aplicarFallbackOcrCaixinha({
      tipo: 'ENTRADA_PIX',
      valor: 500,
      destinatario: 'Gil',
      emissorPix: 'Daniel Lopes',
      data: '2026-11-23',
      hora: '16:15',
      comprovanteCortado: false,
    });
    assert.equal(completo.emissorPix, 'Daniel');
    assert.equal(completo.origemEmissor, 'OCR_COMPROVANTE');
    assert.equal(completo.labelOrigemEmissor, 'OCR Comprovante');
    assert.equal(completo.origemDataHora, 'OCR_COMPROVANTE');
    assert.equal(completo.comprovanteCortado, false);
  });

  it('6. V24 Integridade estrutural: UI separa Portador x Emissor + Hora (HH:MM), API/Webhook persistem emissor_pix/data_hora_envio e Migration V24 idempotente', () => {
    const repoRoot = process.cwd();
    const caixaPanel = fs.readFileSync(
      path.join(repoRoot, 'src/components/CaixaCampoPanel.tsx'),
      'utf8'
    );
    const caixaApi = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/caixa-campo/route.ts'),
      'utf8'
    );
    const webhookApi = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/webhook/whatsapp/route.ts'),
      'utf8'
    );
    const migrationV24 = fs.readFileSync(
      path.join(repoRoot, 'supabase/migration_v24_caixinha_emissor_pix_horario.sql'),
      'utf8'
    );

    assert.ok(
      caixaPanel.includes('Colaborador / Portador do Caixinha') &&
        caixaPanel.includes('Emissor / Quem Enviou o PIX') &&
        caixaPanel.includes('Hora (HH:MM)') &&
        caixaPanel.includes('type="time"') &&
        caixaPanel.includes('PIX de {emissorExibir}') &&
        caixaPanel.includes('formatarDataHoraBr(m.data, m.hora)'),
      'CaixaCampoPanel deve separar Portador x Emissor do PIX, incluir Hora (HH:MM) e exibir Emissor + dd/mm/aaaa às HH:mm no extrato'
    );

    assert.ok(
      caixaApi.includes('emissor_pix') &&
        caixaApi.includes('data_hora_envio') &&
        caixaApi.includes('origem_emissor') &&
        caixaApi.includes('origem_data_hora') &&
        caixaApi.includes('aplicarFallbackOcrCaixinha') &&
        caixaApi.includes('horaBarraStatus'),
      '/api/caixa-campo deve extrair/persistir emissor_pix, data_hora_envio e aplicar fallback inteligente no OCR'
    );

    assert.ok(
      webhookApi.includes('whatsappTimestamp') &&
        webhookApi.includes('remetenteNome') &&
        webhookApi.includes('CAIXINHA_PIX_INGESTAO') &&
        webhookApi.includes('emissor_pix'),
      'Webhook WhatsApp deve propagar remetente/timestamp ao OCR e ingerir PIX de caixinha com rastreabilidade'
    );

    assert.ok(
      migrationV24.includes('ADD COLUMN IF NOT EXISTS emissor_pix') &&
        migrationV24.includes('ADD COLUMN IF NOT EXISTS data_hora_envio') &&
        migrationV24.includes('ADD COLUMN IF NOT EXISTS origem_emissor') &&
        migrationV24.includes('ADD COLUMN IF NOT EXISTS origem_data_hora'),
      'Migration V24 deve criar as colunas de rastreabilidade de forma idempotente'
    );
  });

  it('7. V25 Emissores PIX Caixinha: Patrícia e Joabson obrigatórios por padrão + gestão no /setup da Jhoston isolada por tenant_id (vales inalterados)', () => {
    // 1. Opções iniciais obrigatórias: Patrícia e Joabson
    assert.deepEqual([...EMISSORES_PIX_PADRAO], ['Patrícia', 'Joabson']);
    assert.equal(isEmissorPixPadrao('Patrícia'), true);
    assert.equal(isEmissorPixPadrao('Joabson Nascimento'), true);
    assert.equal(isEmissorPixPadrao('Daniel'), false);

    // 2. Merge de emissores adicionais cadastrados respeitando ativo/inativo e sem duplicidade
    const config = normalizarListaEmissoresConfig([
      { id: '1', nome: 'Daniel', ativo: true },
      { id: '2', nome: 'Financeiro Obra', ativo: false },
      { id: '3', nome: 'Patrícia Grubel', ativo: false }, // padrão nunca desativa
      { id: '4', nome: 'Conta Empresa', ativo: true },
    ]);
    assert.equal(config.length, 5);
    assert.equal(config[0].nome, 'Patrícia');
    assert.equal(config[0].padrao, true);
    assert.equal(config[0].ativo, true);
    assert.equal(config[1].nome, 'Joabson');
    assert.equal(config[1].padrao, true);
    assert.equal(config[1].ativo, true);

    const ativosDropdown = extrairEmissoresPixAtivos(config, [
      'Financeiro Obra', // inativo na config -> não entra no dropdown
      'Sócio Externo',
    ]);
    assert.deepEqual(ativosDropdown, [
      'Patrícia',
      'Joabson',
      'Daniel',
      'Conta Empresa',
      'Sócio Externo',
    ]);

    // 3. Integridade de /setup (contexto Jhoston), /api/caixa-campo/emissores e /api/caixa-campo
    const repoRoot = process.cwd();
    const setupPage = fs.readFileSync(
      path.join(repoRoot, 'src/app/setup/page.tsx'),
      'utf8'
    );
    const setupIntermack = fs.readFileSync(
      path.join(repoRoot, 'src/components/SetupIntermackPanel.tsx'),
      'utf8'
    );
    const emissoresApi = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/caixa-campo/emissores/route.ts'),
      'utf8'
    );
    const caixaApi = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/caixa-campo/route.ts'),
      'utf8'
    );

    assert.ok(
      setupPage.includes('<EmissoresPixCaixinhaSetup />') &&
        !setupIntermack.includes('EmissoresPixCaixinhaSetup'),
      '/setup deve exibir gestão de emissores da Caixinha no contexto Jhoston sem alterar SetupIntermackPanel'
    );
    assert.ok(
      emissoresApi.includes(".eq('tenant_id', tenantId)") &&
        emissoresApi.includes('emissores_pix_caixinha') &&
        caixaApi.includes('emissores_pix_caixinha'),
      'API de emissores e /api/caixa-campo devem isolar emissores_pix_caixinha por tenant_id e alimentar o dropdown'
    );
  });
});
