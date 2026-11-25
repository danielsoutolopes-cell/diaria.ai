-- Migration V29: Controle de Adiantamento de Diárias (Crédito em Dias com Abatimento Automático)
-- Separado de Vales/Caixinha: registra quantidade de diárias adiantadas e abate automaticamente nos próximos apontamentos.

CREATE TABLE IF NOT EXISTS public.adiantamentos_diarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios_obra(id) ON DELETE CASCADE,
  obra_id UUID REFERENCES public.obras_config(id) ON DELETE SET NULL,
  data_adiantamento DATE NOT NULL DEFAULT CURRENT_DATE,
  quantidade_diarias NUMERIC(6, 2) NOT NULL CHECK (quantidade_diarias > 0),
  quantidade_restante NUMERIC(6, 2) NOT NULL CHECK (quantidade_restante >= 0),
  valor_unitario NUMERIC(10, 2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'QUITADO', 'CANCELADO')),
  observacao TEXT,
  criado_por TEXT DEFAULT 'ADMIN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adiantamentos_diarias_tenant_func_status
  ON public.adiantamentos_diarias (tenant_id, funcionario_id, status);

ALTER TABLE public.adiantamentos_diarias ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'adiantamentos_diarias' AND policyname = 'adiantamentos_diarias_tenant_all'
  ) THEN
    CREATE POLICY adiantamentos_diarias_tenant_all
      ON public.adiantamentos_diarias
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
