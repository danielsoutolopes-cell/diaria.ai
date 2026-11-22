-- ============================================================================
-- Migração Idempotente — Logística de Entrega & Alias de Cliente p/ Fornecedores
-- Especialmente voltada ao módulo de Compras da Intermack (não destrutiva)
-- ============================================================================

ALTER TABLE public.obras_config
  ADD COLUMN IF NOT EXISTS alias_fornecedor TEXT,
  ADD COLUMN IF NOT EXISTS cep_entrega TEXT,
  ADD COLUMN IF NOT EXISTS complemento_entrega TEXT,
  ADD COLUMN IF NOT EXISTS contato_recebimento TEXT;

COMMENT ON COLUMN public.obras_config.alias_fornecedor IS
  'Nome do cliente que identifica a obra/pedido junto aos fornecedores (cotação, entrega e NF)';
COMMENT ON COLUMN public.obras_config.cep_entrega IS
  'CEP do endereço de entrega de materiais da obra';
COMMENT ON COLUMN public.obras_config.complemento_entrega IS
  'Complemento, bloco, andar, portaria de serviço e observações/regras de descarga';
COMMENT ON COLUMN public.obras_config.contato_recebimento IS
  'Nome e WhatsApp do responsável por receber entregas na obra';
