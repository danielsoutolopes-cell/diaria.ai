-- ==============================================================================
-- MIGRATION V22: Setup Intermack (Subempreita) — Chave PIX opcional em Empreiteiros
-- Isolamento estrito por tenant_id (Intermack). Execução 100% idempotente.
-- ==============================================================================

ALTER TABLE public.empreiteiros_diario
  ADD COLUMN IF NOT EXISTS chave_pix TEXT;
