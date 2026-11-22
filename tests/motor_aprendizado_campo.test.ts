import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  aplicarRegrasAprendidasTexto,
  extrairAssinaturaEstruturalMensagem,
  extrairRemetenteDeTextoLote,
  gerarBlocoFewShotPrompt,
  sugerirObraPadraoSeOmitida,
  type ContextoAprendizadoRemetente,
} from '@/services/aprendizadoCampoService';
import { higienizarMensagemParaExtracao } from '@/lib/extracaoDiariasParser';
import { TENANTS } from '@/lib/tenant';
import type { NLPExtracaoResponse } from '@/types/database';

const MENSAGEM_DOMINGO_PISCINA = `Domingo 22 de novembro piscina porto seguro.

Gil
Mateus
Lucas. J
Peu
Ian
José baiano
Daniel`;

describe('Motor de Aprendizado Contínuo por Remetente (V18) & Diária Zé Baiano R$ 280 (V19)', () => {
  it('1. Aplica aliases aprendidos antes da IA e injeta bloco few-shot dinâmico com hábitos e obra padrão do remetente', () => {
    const contexto: ContextoAprendizadoRemetente = {
      tenantId: TENANTS.jhoston.id,
      remetenteTelefone: '5511988887777',
      perfilRemetente: {
        id: 'sp-gil',
        tenant_id: TENANTS.jhoston.id,
        remetente_telefone: '5511988887777',
        remetente_nome: 'Gilvan - Gil',
        obra_padrao_sugerida: 'PISCINA PORTO SEGURO',
        habitos_escrita: {
          usaPontoFinalCabecalho: true,
          usaLinhasEmBranco: true,
          usaIniciaisComPonto: true,
        },
        total_mensagens_validadas: 12,
        ultimo_envio_em: '2026-11-22T17:18:00Z',
      },
      regrasAtivas: [
        {
          id: 'r1',
          tenant_id: TENANTS.jhoston.id,
          remetente_telefone: '5511988887777',
          remetente_nome: 'Gilvan - Gil',
          tipo_regra: 'ALIAS_TRABALHADOR',
          origem_padrao: 'Lucas J',
          destino_canonico: 'Lucas J.',
          origem_aprendizado: 'CORRECAO_HUMANA',
          confianca: 1,
          ocorrencias: 4,
          exemplo_mensagem: null,
          ativo: true,
          criado_por: 'Patrícia Grubel',
        },
        {
          id: 'r2',
          tenant_id: TENANTS.jhoston.id,
          remetente_telefone: null,
          remetente_nome: null,
          tipo_regra: 'ALIAS_TRABALHADOR',
          origem_padrao: 'José baiano',
          destino_canonico: 'Zé Baiano',
          origem_aprendizado: 'SEED_OFICIAL',
          confianca: 1,
          ocorrencias: 5,
          exemplo_mensagem: null,
          ativo: true,
          criado_por: 'Sistema',
        },
        {
          id: 'r3',
          tenant_id: TENANTS.jhoston.id,
          remetente_telefone: '5511988887777',
          remetente_nome: 'Gilvan - Gil',
          tipo_regra: 'EXPRESSAO_RECORRENTE',
          origem_padrao: '5 vale por favor',
          destino_canonico: 'VALE_LOTE_5_TRABALHADORES',
          origem_aprendizado: 'AUTO_PASSAGEM_2',
          confianca: 1,
          ocorrencias: 2,
          exemplo_mensagem: '5 vale por favor',
          ativo: true,
          criado_por: 'Sistema IA',
        },
      ],
    };

    const san = higienizarMensagemParaExtracao(MENSAGEM_DOMINGO_PISCINA);
    const { textoEnriquecido, regrasAplicadas } = aplicarRegrasAprendidasTexto(
      san.textoHigienizado,
      contexto
    );

    assert.ok(textoEnriquecido.includes('Lucas J.'), 'Deve aplicar alias aprendido Lucas J -> Lucas J.');
    assert.ok(textoEnriquecido.includes('Zé Baiano'), 'Deve aplicar alias aprendido José baiano -> Zé Baiano');
    assert.ok(regrasAplicadas.length >= 2);

    const fewShot = gerarBlocoFewShotPrompt(contexto);
    assert.ok(fewShot.includes('PERFIL DO REMETENTE ATIVO: Gilvan - Gil'));
    assert.ok(fewShot.includes('PISCINA PORTO SEGURO'));
    assert.ok(fewShot.includes('5 vale por favor'));
    assert.ok(fewShot.includes('abrevia iniciais com ponto'));
  });

  it('2. Extrai assinatura estrutural quando 2ª passagem é acionada e sugere obra padrão quando remetente omite canteiro', () => {
    const san = higienizarMensagemParaExtracao(MENSAGEM_DOMINGO_PISCINA);
    const extracaoSemObra: NLPExtracaoResponse = {
      obras: [
        {
          nome_obra: 'GERAL',
          data_referencia: '2026-11-22',
          apontamentos: [
            { nome: 'Gilvan - Gil', fracao: 1.0, motivo: 'NORMAL' },
            { nome: 'Zé Baiano', fracao: 1.0, motivo: 'NORMAL' },
          ],
          vales: [],
          setup: false,
        },
      ],
    };

    const assinatura = extrairAssinaturaEstruturalMensagem(
      MENSAGEM_DOMINGO_PISCINA,
      san,
      extracaoSemObra
    );
    assert.ok(assinatura.assinatura.includes('CABECALHO_PONTO_FINAL'));
    assert.ok(assinatura.assinatura.includes('LINHA_EM_BRANCO'));
    assert.ok(assinatura.assinatura.includes('INICIAL_COM_PONTO'));
    assert.equal(assinatura.habitosDetectados.usaIniciaisComPonto, true);

    const sugestao = sugerirObraPadraoSeOmitida(extracaoSemObra, {
      id: 'sp-gil',
      tenant_id: TENANTS.jhoston.id,
      remetente_telefone: '5511988887777',
      remetente_nome: 'Gilvan - Gil',
      obra_padrao_sugerida: 'PISCINA PORTO SEGURO',
      habitos_escrita: {},
      total_mensagens_validadas: 8,
      ultimo_envio_em: '2026-11-22T17:18:00Z',
    });

    assert.equal(sugestao.obraSugeridaAplicada, 'PISCINA PORTO SEGURO');
    assert.equal(sugestao.extracao.obras[0].nome_obra, 'PISCINA PORTO SEGURO');

    const tel = extrairRemetenteDeTextoLote(
      '[ORIGEM_WHATSAPP]\nRemetente: 5511988887777\nGrupo/JID: 123@g.us'
    );
    assert.equal(tel, '5511988887777');
  });

  it('3. Verifica migrações SQL V18 (Aprendizado Multi-Tenant) e V19 (Zé Baiano R$ 280,00) + hooks de correção humana', () => {
    const repoRoot = process.cwd();
    const sqlV18 = fs.readFileSync(
      path.join(repoRoot, 'supabase/migration_v18_motor_aprendizado_campo.sql'),
      'utf8'
    );
    const sqlV19 = fs.readFileSync(
      path.join(repoRoot, 'supabase/migration_v19_ze_baiano_diaria_280.sql'),
      'utf8'
    );
    const apiAprendizado = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/aprendizado/route.ts'),
      'utf8'
    );
    const apiValidar = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/validar/route.ts'),
      'utf8'
    );
    const apiVales = fs.readFileSync(
      path.join(repoRoot, 'src/app/api/vales/route.ts'),
      'utf8'
    );
    const validacoesPage = fs.readFileSync(
      path.join(repoRoot, 'src/app/validacoes/page.tsx'),
      'utf8'
    );

    assert.ok(
      sqlV18.includes('CREATE TABLE IF NOT EXISTS public.sender_profiles') &&
        sqlV18.includes('CREATE TABLE IF NOT EXISTS public.parser_learning_rules') &&
        sqlV18.includes('ENABLE ROW LEVEL SECURITY'),
      'V18 deve criar tabelas idempotentes com RLS multi-tenant'
    );
    assert.ok(
      sqlV19.includes('valor_diaria_piscina = 280.00') &&
        sqlV19.includes("data_referencia IN ('2026-11-20', '2026-11-21')") &&
        sqlV19.includes("NOT ILIKE '%CHUVA%'"),
      'V19 deve atualizar Zé Baiano para R$ 280,00 preservando dias de chuva'
    );
    assert.ok(
      apiAprendizado.includes('getActiveTenantFromRequest(req)') &&
        apiValidar.includes('registrarCorrecaoHumanaAprendizado') &&
        apiVales.includes('registrarCorrecaoHumanaAprendizado') &&
        validacoesPage.includes('MemoriaAprendizadoPanel'),
      'Hooks de correção humana, API multi-tenant /api/aprendizado e UI discreta devem estar conectados'
    );
  });
});
