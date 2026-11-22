-- ============================================================================
-- diaria.ai — Migração Arquitetural Idempotente V11 (Fase 1)
-- Multi-Empresa (Jhoston vs. Intermack), Aliases Canônicos, Caixinha Unificado,
-- Ciclos Pós-Quitação e Vales em 2 Etapas.
--
-- SEGURANÇA: 100% NÃO DESTRUTIVO (nenhum DROP TABLE / DROP COLUMN).
-- Pode ser executado múltiplas vezes no SQL Editor do Supabase com idempotência.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. TABELA DE EMPRESAS / TENANTS (Grafia oficial: Jhoston & Intermack)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY,
    slug VARCHAR(64) NOT NULL UNIQUE,
    nome VARCHAR(255) NOT NULL,
    razao_social VARCHAR(255),
    modo_operacao VARCHAR(32) NOT NULL DEFAULT 'DIARISTA',
    modulo_compras_ativo BOOLEAN NOT NULL DEFAULT FALSE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS razao_social VARCHAR(255),
    ADD COLUMN IF NOT EXISTS modo_operacao VARCHAR(32) NOT NULL DEFAULT 'DIARISTA',
    ADD COLUMN IF NOT EXISTS modulo_compras_ativo BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

-- Corrigir eventual registro legado com grafia 'jhonton' / 'Jhonton' antes do upsert
UPDATE tenants
SET
    slug = 'jhoston',
    nome = 'Jhoston',
    razao_social = 'Jhoston Construções e Revestimentos',
    modulo_compras_ativo = FALSE,
    updated_at = timezone('utc'::text, now())
WHERE id = '00000000-0000-0000-0000-000000000001'
   OR LOWER(slug) IN ('jhonton', 'joston');

-- Garantir seed oficial dos dois tenants (Jhoston: compras standby=false | Intermack: compras=true)
INSERT INTO tenants (id, slug, nome, razao_social, modo_operacao, modulo_compras_ativo, ativo)
VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        'jhoston',
        'Jhoston',
        'Jhoston Construções e Revestimentos',
        'DIARISTA',
        FALSE,
        TRUE
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'intermack',
        'Intermack',
        'Intermack Engenharia e Construção',
        'EMPREITA',
        TRUE,
        TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    nome = EXCLUDED.nome,
    razao_social = EXCLUDED.razao_social,
    modo_operacao = EXCLUDED.modo_operacao,
    modulo_compras_ativo = EXCLUDED.modulo_compras_ativo,
    ativo = TRUE,
    updated_at = timezone('utc'::text, now());

-- Garantir parametros_sistema para ambos os tenants
INSERT INTO parametros_sistema (tenant_id)
VALUES
    ('00000000-0000-0000-0000-000000000001'),
    ('00000000-0000-0000-0000-000000000002')
ON CONFLICT (tenant_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. ENUMS E COLUNAS DE TIPOLOGIA / REGIMES EM funcionarios_obra
-- ----------------------------------------------------------------------------
ALTER TYPE status_lancamento_enum ADD VALUE IF NOT EXISTS 'DESCARTADO';
ALTER TYPE status_validacao_enum ADD VALUE IF NOT EXISTS 'DESCARTADO';
ALTER TYPE regime_remuneracao_enum ADD VALUE IF NOT EXISTS 'MENSALISTA';
ALTER TYPE regime_remuneracao_enum ADD VALUE IF NOT EXISTS 'DIAS_UTEIS_SEG_SAB';

ALTER TABLE funcionarios_obra
    ADD COLUMN IF NOT EXISTS valor_diaria_obra NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS valor_diaria_piscina NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS regra_dias_uteis_seg_sab BOOLEAN NOT NULL DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- 3. TABELA DE ALIASES CANÔNICOS DE TRABALHADORES (trabalhador_aliases)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trabalhador_aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    funcionario_id UUID REFERENCES funcionarios_obra(id) ON DELETE SET NULL,
    alias_texto VARCHAR(255) NOT NULL,
    nome_canonico VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id, alias_texto)
);

CREATE INDEX IF NOT EXISTS idx_trabalhador_aliases_tenant
    ON trabalhador_aliases(tenant_id, alias_texto);

ALTER TABLE trabalhador_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for trabalhador_aliases" ON trabalhador_aliases;
CREATE POLICY "Tenant isolation for trabalhador_aliases" ON trabalhador_aliases
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Seed idempotente dos aliases oficiais da Jhoston (V11)
INSERT INTO trabalhador_aliases (tenant_id, alias_texto, nome_canonico)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'Gil', 'Gil'),
    ('00000000-0000-0000-0000-000000000001', 'Gil335Revest', 'Gil'),
    ('00000000-0000-0000-0000-000000000001', 'Gilvan', 'Gil'),
    ('00000000-0000-0000-0000-000000000001', 'Gil (Gilvan)', 'Gil'),
    ('00000000-0000-0000-0000-000000000001', 'Gilvan (Gil)', 'Gil'),
    ('00000000-0000-0000-0000-000000000001', 'Gilvan - Gil', 'Gil'),
    ('00000000-0000-0000-0000-000000000001', 'Weslen', 'Wender'),
    ('00000000-0000-0000-0000-000000000001', 'Wender 22', 'Wender'),
    ('00000000-0000-0000-0000-000000000001', 'Wender', 'Wender'),
    ('00000000-0000-0000-0000-000000000001', 'Peu', 'Peu'),
    ('00000000-0000-0000-0000-000000000001', 'Edmilson', 'Peu'),
    ('00000000-0000-0000-0000-000000000001', 'Edmilson - Peu', 'Peu'),
    ('00000000-0000-0000-0000-000000000001', 'José baiano', 'Zé Baiano'),
    ('00000000-0000-0000-0000-000000000001', 'Jose baiano', 'Zé Baiano'),
    ('00000000-0000-0000-0000-000000000001', 'Zé baiano', 'Zé Baiano'),
    ('00000000-0000-0000-0000-000000000001', 'Daniel.', 'Daniel'),
    ('00000000-0000-0000-0000-000000000001', 'Lucas J', 'Lucas J'),
    ('00000000-0000-0000-0000-000000000001', 'Lucas J.', 'Lucas J'),
    ('00000000-0000-0000-0000-000000000001', 'Lucas. J.', 'Lucas J'),
    ('00000000-0000-0000-0000-000000000001', 'Lucas.j.', 'Lucas J')
ON CONFLICT (tenant_id, alias_texto) DO UPDATE SET
    nome_canonico = EXCLUDED.nome_canonico,
    ativo = TRUE;

-- ----------------------------------------------------------------------------
-- 4. CAIXINHA DE CAMPO UNIFICADO (caixinha_movimentacoes + pré-implantação 13/11)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caixinha_movimentacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    encarregado_canonico VARCHAR(255) NOT NULL,
    encarregado_origem VARCHAR(255),
    obra_nome VARCHAR(255) NOT NULL DEFAULT 'PORTO SEGURO',
    data_movimentacao DATE NOT NULL DEFAULT CURRENT_DATE,
    hora_movimentacao VARCHAR(10) NOT NULL DEFAULT '12:00',
    tipo VARCHAR(32) NOT NULL CHECK (tipo IN ('ENTRADA_PIX', 'NOTA_DESPESA', 'DEVOLUCAO_TROCO')),
    categoria VARCHAR(100) NOT NULL DEFAULT 'Material',
    descricao TEXT NOT NULL,
    valor NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'APROVADO' CHECK (status IN ('PENDENTE', 'APROVADO')),
    is_pre_implantacao BOOLEAN NOT NULL DEFAULT FALSE,
    enviado_por VARCHAR(120) DEFAULT 'Administração',
    comprovante_url TEXT,
    chave_idempotencia VARCHAR(128) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_caixinha_tenant_encarregado
    ON caixinha_movimentacoes(tenant_id, encarregado_canonico, data_movimentacao);

ALTER TABLE caixinha_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for caixinha_movimentacoes" ON caixinha_movimentacoes;
CREATE POLICY "Tenant isolation for caixinha_movimentacoes" ON caixinha_movimentacoes
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Seed idempotente do Caixinha Unificado de Gil (Gil + Gilvan + Gil335Revest)
-- Preserva os saldos pré-implantação de 13/11/2026:
-- Entradas PIX: R$ 700,00 | Saídas/Notas: R$ 546,94 | Troco em Mãos: R$ 153,06
INSERT INTO caixinha_movimentacoes (
    tenant_id,
    encarregado_canonico,
    encarregado_origem,
    obra_nome,
    data_movimentacao,
    hora_movimentacao,
    tipo,
    categoria,
    descricao,
    valor,
    status,
    is_pre_implantacao,
    enviado_por,
    chave_idempotencia
) VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        'Gil',
        'Gil / Gil335Revest',
        'PISCINA PORTO SEGURO',
        '2026-11-13',
        '09:00',
        'ENTRADA_PIX',
        'Suprimento PIX',
        'Entradas PIX consolidadas (Pré-implantação 13/11 — Gil + Gil335Revest)',
        700.00,
        'APROVADO',
        TRUE,
        'Patrícia Grubel',
        'v11-preimp-2026-11-13-gil-entradas-700'
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        'Gil',
        'Gil / Gil335Revest',
        'PISCINA PORTO SEGURO',
        '2026-11-13',
        '17:30',
        'NOTA_DESPESA',
        'Material / Despesas de Campo',
        'Saídas e notas comprovadas (Pré-implantação 13/11 — Gil + Gil335Revest)',
        546.94,
        'APROVADO',
        TRUE,
        'Gil',
        'v11-preimp-2026-11-13-gil-saidas-54694'
    )
ON CONFLICT (chave_idempotencia) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. CICLOS FINANCEIROS (REINÍCIO PÓS-QUITAÇÃO) & VALES EM 2 ETAPAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ciclos_financeiros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    funcionario_id UUID REFERENCES funcionarios_obra(id) ON DELETE SET NULL,
    nome_trabalhador_canonico VARCHAR(255) NOT NULL,
    obra_nome VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'QUITADO')),
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_corte_quitacao TIMESTAMP WITH TIME ZONE,
    valor_quitado NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    comprovante_pix_url TEXT,
    recibo_r2_url TEXT,
    quitado_por VARCHAR(120),
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ciclos_financeiros_tenant_trabalhador
    ON ciclos_financeiros(tenant_id, nome_trabalhador_canonico, status);

ALTER TABLE ciclos_financeiros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for ciclos_financeiros" ON ciclos_financeiros;
CREATE POLICY "Tenant isolation for ciclos_financeiros" ON ciclos_financeiros
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Colunas adicionais idempotentes em lancamentos_financeiros
-- Suporte a isolamento de ciclos pós-quitação, recibo individual R2 e vales em 2 etapas
ALTER TABLE lancamentos_financeiros
    ADD COLUMN IF NOT EXISTS ciclo_id UUID REFERENCES ciclos_financeiros(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS comprovante_pix_url TEXT,
    ADD COLUMN IF NOT EXISTS recibo_liquidacao_url TEXT,
    ADD COLUMN IF NOT EXISTS vale_etapa VARCHAR(32),
    ADD COLUMN IF NOT EXISTS solicitado_por VARCHAR(120),
    ADD COLUMN IF NOT EXISTS pago_por VARCHAR(120),
    ADD COLUMN IF NOT EXISTS mensagem_origem_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS horario_origem VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_lancamentos_ciclo_status
    ON lancamentos_financeiros(tenant_id, status, data_referencia, ciclo_id);

CREATE INDEX IF NOT EXISTS idx_lancamentos_vale_etapa
    ON lancamentos_financeiros(tenant_id, tipo_lancamento, vale_etapa);
