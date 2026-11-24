-- ============================================================================
-- MIGRATION V28: Índices Compostos de Performance Multi-Tenant (Fase 3 Final)
-- Acelera /api/bordero, /api/relatorios, /api/pendentes, /api/vales e /api/auditoria.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant_tipo_data
  ON public.lancamentos_financeiros (tenant_id, tipo_lancamento, data_referencia DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant_status_data
  ON public.lancamentos_financeiros (tenant_id, status, data_referencia DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant_obra_data
  ON public.lancamentos_financeiros (tenant_id, obra_id, data_referencia DESC);

CREATE INDEX IF NOT EXISTS idx_ponto_lote_tenant_status
  ON public.ponto_lote (tenant_id, status_validacao, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_funcionarios_tenant_ativo
  ON public.funcionarios_obra (tenant_id, ativo, nome_trabalhador);

CREATE INDEX IF NOT EXISTS idx_obras_tenant_ativo
  ON public.obras_config (tenant_id, ativo, nome);
