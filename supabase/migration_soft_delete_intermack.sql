-- ========================================================
-- Migração Idempotente: Soft Delete (DESCARTADO) + Multi-Empresa (Intermack)
-- Executar no SQL Editor do Supabase (100% seguro / não destrutivo)
-- ========================================================

-- 1. Adicionar 'DESCARTADO' nos ENUMs de status para suportar Exclusão Auditada (Soft Delete)
ALTER TYPE status_lancamento_enum ADD VALUE IF NOT EXISTS 'DESCARTADO';
ALTER TYPE status_validacao_enum ADD VALUE IF NOT EXISTS 'DESCARTADO';

-- 2. Garantir registro inicial de parametros_sistema para o tenant da Intermack
INSERT INTO parametros_sistema (tenant_id, configuracoes)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '{"modo_operacao": "EMPREITA", "ambiente_padrao": "INTERNO", "diarios_obra": [], "medicoes_escopo": []}'::jsonb
)
ON CONFLICT DO NOTHING;
