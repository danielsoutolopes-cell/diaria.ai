-- ==============================================================================
-- MIGRATION V20: Diário de Obra — Cadastro Separado de Empreiteiros/Encarregados
-- e Funcionários (com apelidos, documento e vínculo empreiteiro_id)
-- Isolamento estrito por tenant_id (Jhoston e Intermack). Execução idempotente.
-- ==============================================================================

-- 1. Cadastro de Empreiteiros / Encarregados de Campo
CREATE TABLE IF NOT EXISTS public.empreiteiros_diario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  nome TEXT NOT NULL,
  apelidos TEXT[] NOT NULL DEFAULT '{}'::text[],
  documento TEXT,
  telefone TEXT,
  etapa_padrao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empreiteiros_diario_tenant_ativo
  ON public.empreiteiros_diario (tenant_id, ativo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_empreiteiros_diario_tenant_nome
  ON public.empreiteiros_diario (tenant_id, UPPER(TRIM(nome)))
  WHERE ativo = TRUE;

-- 2. Cadastro de Funcionários vinculados a Empreiteiro / Encarregado
CREATE TABLE IF NOT EXISTS public.funcionarios_empreiteiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  empreiteiro_id UUID REFERENCES public.empreiteiros_diario(id) ON DELETE SET NULL,
  nome_oficial TEXT NOT NULL,
  apelidos TEXT[] NOT NULL DEFAULT '{}'::text[],
  documento TEXT,
  funcao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_empreiteiro_tenant_emp
  ON public.funcionarios_empreiteiro (tenant_id, empreiteiro_id, ativo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_funcionarios_empreiteiro_tenant_nome
  ON public.funcionarios_empreiteiro (
    tenant_id,
    COALESCE(empreiteiro_id, '00000000-0000-0000-0000-000000000000'::uuid),
    UPPER(TRIM(nome_oficial))
  )
  WHERE ativo = TRUE;

-- 3. RLS Multi-Tenant (Row Level Security)
ALTER TABLE public.empreiteiros_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionarios_empreiteiro ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'empreiteiros_diario'
      AND policyname = 'empreiteiros_diario_tenant_isolation'
  ) THEN
    CREATE POLICY empreiteiros_diario_tenant_isolation
      ON public.empreiteiros_diario
      USING (
        tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, tenant_id)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'funcionarios_empreiteiro'
      AND policyname = 'funcionarios_empreiteiro_tenant_isolation'
  ) THEN
    CREATE POLICY funcionarios_empreiteiro_tenant_isolation
      ON public.funcionarios_empreiteiro
      USING (
        tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, tenant_id)
      );
  END IF;
END $$;
