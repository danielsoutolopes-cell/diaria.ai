-- ==============================================================================
-- MIGRATION V18: Motor de Aprendizado Contínuo por Remetente/Ajudante de Campo
-- Tabelas multi-tenant (Jhoston e Intermack) com isolamento estrito por tenant_id
-- Execução 100% idempotente.
-- ==============================================================================

-- 1. Perfis de escrita e contexto padrão de obra por remetente do WhatsApp
CREATE TABLE IF NOT EXISTS public.sender_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  remetente_telefone TEXT NOT NULL,
  remetente_nome TEXT NOT NULL,
  obra_padrao_sugerida TEXT,
  habitos_escrita JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_mensagens_validadas INTEGER NOT NULL DEFAULT 0,
  ultimo_envio_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sender_profiles_tenant_tel UNIQUE (tenant_id, remetente_telefone)
);

CREATE INDEX IF NOT EXISTS idx_sender_profiles_tenant
  ON public.sender_profiles (tenant_id);

-- 2. Regras de aprendizado do parser (aliases, assinaturas estruturais, expressões e frações)
CREATE TABLE IF NOT EXISTS public.parser_learning_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sender_profile_id UUID REFERENCES public.sender_profiles(id) ON DELETE SET NULL,
  remetente_telefone TEXT,
  remetente_nome TEXT,
  tipo_regra TEXT NOT NULL CHECK (
    tipo_regra IN (
      'ALIAS_TRABALHADOR',
      'ALIAS_OBRA',
      'ASSINATURA_ESTRUTURAL',
      'EXPRESSAO_RECORRENTE',
      'FRACAO_PADRAO'
    )
  ),
  origem_padrao TEXT NOT NULL,
  destino_canonico TEXT NOT NULL,
  origem_aprendizado TEXT NOT NULL DEFAULT 'AUTO_PASSAGEM_2' CHECK (
    origem_aprendizado IN (
      'SEED_OFICIAL',
      'AUTO_PASSAGEM_2',
      'CORRECAO_HUMANA',
      'MANUAL_ADMIN'
    )
  ),
  confianca NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  ocorrencias INTEGER NOT NULL DEFAULT 1,
  exemplo_mensagem TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parser_learning_rules_tenant_ativo
  ON public.parser_learning_rules (tenant_id, ativo, tipo_regra);

CREATE INDEX IF NOT EXISTS idx_parser_learning_rules_sender
  ON public.parser_learning_rules (tenant_id, remetente_telefone)
  WHERE remetente_telefone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parser_learning_rules_dedup
  ON public.parser_learning_rules (
    tenant_id,
    tipo_regra,
    UPPER(TRIM(origem_padrao)),
    COALESCE(remetente_telefone, '')
  );

-- 3. RLS Multi-Tenant (segurança em nível de linha)
ALTER TABLE public.sender_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parser_learning_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sender_profiles'
      AND policyname = 'sender_profiles_tenant_isolation'
  ) THEN
    CREATE POLICY sender_profiles_tenant_isolation
      ON public.sender_profiles
      USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, tenant_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parser_learning_rules'
      AND policyname = 'parser_learning_rules_tenant_isolation'
  ) THEN
    CREATE POLICY parser_learning_rules_tenant_isolation
      ON public.parser_learning_rules
      USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, tenant_id));
  END IF;
END $$;

-- 4. Semente idempotente de aliases e assinaturas reais auditadas (Jhoston)
INSERT INTO public.parser_learning_rules (
  tenant_id,
  tipo_regra,
  origem_padrao,
  destino_canonico,
  origem_aprendizado,
  confianca,
  ocorrencias,
  exemplo_mensagem,
  criado_por
)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'ALIAS_TRABALHADOR', 'Lucas. J', 'Lucas J.', 'SEED_OFICIAL', 1.00, 5, 'Domingo 22 de novembro piscina porto seguro.', 'Sistema'),
  ('00000000-0000-0000-0000-000000000001', 'ALIAS_TRABALHADOR', 'José baiano', 'Zé Baiano', 'SEED_OFICIAL', 1.00, 5, 'Domingo 22 de novembro piscina porto seguro.', 'Sistema'),
  ('00000000-0000-0000-0000-000000000001', 'ALIAS_TRABALHADOR', 'Wender 22', 'Wender', 'SEED_OFICIAL', 1.00, 4, 'Quase tudo: Manoel e Wender 22', 'Sistema'),
  ('00000000-0000-0000-0000-000000000001', 'ALIAS_TRABALHADOR', 'Weslen', 'Wender', 'SEED_OFICIAL', 1.00, 4, 'Quase tudo: Manoel e Weslen', 'Sistema'),
  ('00000000-0000-0000-0000-000000000001', 'ALIAS_TRABALHADOR', 'Gil.', 'Gilvan - Gil', 'SEED_OFICIAL', 1.00, 6, 'Domingo 22 de novembro piscina porto seguro.', 'Sistema'),
  ('00000000-0000-0000-0000-000000000001', 'ALIAS_TRABALHADOR', 'Peu', 'Edmilson - Peu', 'SEED_OFICIAL', 1.00, 6, 'Domingo 22 de novembro piscina porto seguro.', 'Sistema'),
  ('00000000-0000-0000-0000-000000000001', 'EXPRESSAO_RECORRENTE', '5 vale por favor', 'VALE_LOTE_5_TRABALHADORES (R$ 100,00 padrão cada)', 'SEED_OFICIAL', 1.00, 2, '5 vale por favor', 'Sistema'),
  ('00000000-0000-0000-0000-000000000001', 'ASSINATURA_ESTRUTURAL', 'CABECALHO_PONTO_FINAL+LINHA_EM_BRANCO+INICIAL_COM_PONTO', 'LISTA_VERTICAL_COMPLETA_SEM_TRUNCAMENTO', 'SEED_OFICIAL', 1.00, 3, 'Domingo 22 de novembro piscina porto seguro.\n\nGil\nMateus\nLucas. J\nPeu\nIan\nJosé baiano\nDaniel', 'Sistema')
ON CONFLICT DO NOTHING;
