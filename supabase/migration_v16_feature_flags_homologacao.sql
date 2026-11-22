-- ============================================================================
-- DIÁRIA.AI — MIGRAÇÃO V16 (IDEMPOTENTE / NÃO DESTRUTIVA)
-- Governança de Feature Flags de Homologação por Tenant (Jhoston / Intermack),
-- Conciliação Bancária Automática OFX/CSV e Homologação Diária 19h ("OK").
-- ============================================================================

-- 1. FEATURE FLAGS DE HOMOLOGAÇÃO NA TABELA TENANTS
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS feature_flags_homologacao JSONB NOT NULL DEFAULT '{
        "FF_RESUMO_DIARIO_19H": false,
        "FF_EXTRATO_COLABORADOR_LINK": false
    }'::jsonb;

UPDATE tenants
SET feature_flags_homologacao = COALESCE(
    feature_flags_homologacao,
    '{"FF_RESUMO_DIARIO_19H": false, "FF_EXTRATO_COLABORADOR_LINK": false}'::jsonb
)
WHERE feature_flags_homologacao IS NULL;

-- 2. HISTÓRICO DE CONCILIAÇÃO BANCÁRIA (OFX / CSV — C6, ITAÚ, SANTANDER)
CREATE TABLE IF NOT EXISTS conciliacao_bancaria_registros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    banco VARCHAR(40) NOT NULL DEFAULT 'OUTRO',
    arquivo_nome VARCHAR(255) NOT NULL,
    fit_id VARCHAR(160),
    data_transacao DATE NOT NULL,
    descricao_extrato TEXT NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    status_match VARCHAR(32) NOT NULL CHECK (status_match IN ('CONCILIADO_EXATO', 'SUGESTAO_MATCH', 'DIVERGENCIA', 'APROVADO_MANUAL')),
    lancamento_id UUID REFERENCES lancamentos_financeiros(id) ON DELETE SET NULL,
    aprovado_por VARCHAR(120),
    aprovado_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conciliacao_tenant_data
    ON conciliacao_bancaria_registros(tenant_id, data_transacao DESC);

ALTER TABLE conciliacao_bancaria_registros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for conciliacao_bancaria_registros" ON conciliacao_bancaria_registros;
CREATE POLICY "Tenant isolation for conciliacao_bancaria_registros" ON conciliacao_bancaria_registros
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );
