-- ========================================================
-- Ponto Patrícia / Diária.AI - Multi-Tenant Database Schema
-- Supabase PostgreSQL Engine
-- ========================================================

-- Habilitar extensão para geração de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- --------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE tipo_obra_enum AS ENUM ('PISCINA', 'OBRA_CIVIL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE nivel_permissao_enum AS ENUM ('APONTAMENTO', 'CONSULTA', 'MASTER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tipo_lancamento_enum AS ENUM ('PONTO', 'VALE', 'LIQUIDACAO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_lancamento_enum AS ENUM ('PENDENTE', 'VALIDADO', 'LIQUIDADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_validacao_enum AS ENUM ('PENDENTE', 'VALIDADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- --------------------------------------------------------
-- 2. TABELAS PRINCIPAIS
-- --------------------------------------------------------

-- Tabela: obras_config
CREATE TABLE IF NOT EXISTS obras_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    local VARCHAR(255) NOT NULL,
    tipo_obra tipo_obra_enum NOT NULL DEFAULT 'PISCINA',
    valor_diaria_padrao NUMERIC(10, 2) NOT NULL DEFAULT 150.00,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Migração retroativa caso a tabela já exista
ALTER TABLE obras_config ADD COLUMN IF NOT EXISTS valor_diaria_padrao NUMERIC(10, 2) NOT NULL DEFAULT 150.00;

-- Tabela: funcionarios_obra
CREATE TABLE IF NOT EXISTS funcionarios_obra (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    obra_id UUID REFERENCES obras_config(id) ON DELETE SET NULL,
    nome_trabalhador VARCHAR(255) NOT NULL,
    funcao VARCHAR(100) DEFAULT 'OPERACIONAL',
    valor_diaria NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    chave_pix VARCHAR(255),
    telefone VARCHAR(50),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela: encarregados_obras
CREATE TABLE IF NOT EXISTS encarregados_obras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    telefone_encarregado VARCHAR(50) NOT NULL,
    nome VARCHAR(255),
    obra_id UUID REFERENCES obras_config(id) ON DELETE CASCADE,
    nivel_permissao nivel_permissao_enum NOT NULL DEFAULT 'APONTAMENTO',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela: ponto_lote (Cabeçalho de Apontamento da IA/WhatsApp)
CREATE TABLE IF NOT EXISTS ponto_lote (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    obra_id UUID REFERENCES obras_config(id) ON DELETE CASCADE,
    data_referencia DATE NOT NULL DEFAULT CURRENT_DATE,
    texto_original TEXT NOT NULL,
    status_validacao status_validacao_enum NOT NULL DEFAULT 'PENDENTE',
    token_aprovacao VARCHAR(128) NOT NULL UNIQUE,
    validado_por VARCHAR(255),
    validado_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela: ponto_detalhe (Linhas de Trabalhadores do Lote)
CREATE TABLE IF NOT EXISTS ponto_detalhe (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    ponto_lote_id UUID NOT NULL REFERENCES ponto_lote(id) ON DELETE CASCADE,
    funcionario_id UUID REFERENCES funcionarios_obra(id) ON DELETE SET NULL,
    nome_trabalhador VARCHAR(255) NOT NULL,
    fracao_dia NUMERIC(3, 2) NOT NULL DEFAULT 1.00,
    motivo_excecao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela: lancamentos_financeiros (Extrato Consolidado e Liquidação)
CREATE TABLE IF NOT EXISTS lancamentos_financeiros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    obra_id UUID REFERENCES obras_config(id) ON DELETE SET NULL,
    funcionario_id UUID REFERENCES funcionarios_obra(id) ON DELETE SET NULL,
    nome_trabalhador VARCHAR(255) NOT NULL,
    tipo_lancamento tipo_lancamento_enum NOT NULL,
    fracao_dia NUMERIC(3, 2) DEFAULT 1.00,
    valor_monetario NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status status_lancamento_enum NOT NULL DEFAULT 'PENDENTE',
    data_referencia DATE NOT NULL DEFAULT CURRENT_DATE,
    observacao TEXT,
    ponto_lote_id UUID REFERENCES ponto_lote(id) ON DELETE SET NULL,
    comprovante_url TEXT,
    liquidado_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantir adição de comprovante_url caso a tabela já exista
ALTER TABLE lancamentos_financeiros ADD COLUMN IF NOT EXISTS comprovante_url TEXT;

-- --------------------------------------------------------
-- 3. ÍNDICES DE PERFORMANCE
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_obras_tenant ON obras_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_tenant ON funcionarios_obra(tenant_id, obra_id);
CREATE INDEX IF NOT EXISTS idx_encarregados_telefone ON encarregados_obras(telefone_encarregado);
CREATE INDEX IF NOT EXISTS idx_ponto_lote_token ON ponto_lote(token_aprovacao);
CREATE INDEX IF NOT EXISTS idx_ponto_lote_status ON ponto_lote(tenant_id, status_validacao);
CREATE INDEX IF NOT EXISTS idx_lancamentos_financeiros_status ON lancamentos_financeiros(tenant_id, obra_id, status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_financeiros_data ON lancamentos_financeiros(tenant_id, data_referencia);

-- --------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) MULTI-TENANT
-- --------------------------------------------------------
ALTER TABLE obras_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE encarregados_obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto_lote ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto_detalhe ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos_financeiros ENABLE ROW LEVEL SECURITY;

-- Funções utilitárias de Tenant
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- Políticas para obras_config
CREATE POLICY "Tenant isolation for obras_config" ON obras_config
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Políticas para funcionarios_obra
CREATE POLICY "Tenant isolation for funcionarios_obra" ON funcionarios_obra
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Políticas para encarregados_obras
CREATE POLICY "Tenant isolation for encarregados_obras" ON encarregados_obras
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Políticas para ponto_lote
CREATE POLICY "Tenant isolation for ponto_lote" ON ponto_lote
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Políticas para ponto_detalhe
CREATE POLICY "Tenant isolation for ponto_detalhe" ON ponto_detalhe
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Políticas para lancamentos_financeiros
CREATE POLICY "Tenant isolation for lancamentos_financeiros" ON lancamentos_financeiros
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- --------------------------------------------------------
-- 5. WHATSAPP BOT: SESSÃO & GRUPOS MONITORADOS
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_grupos_monitorados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    group_jid VARCHAR(255) NOT NULL,
    nome_grupo VARCHAR(255) NOT NULL,
    obra_id UUID REFERENCES obras_config(id) ON DELETE SET NULL,
    monitorar BOOLEAN NOT NULL DEFAULT TRUE,
    total_mensagens_processadas INT NOT NULL DEFAULT 0,
    ultima_sincronizacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id, group_jid)
);

ALTER TABLE whatsapp_grupos_monitorados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for whatsapp_grupos_monitorados" ON whatsapp_grupos_monitorados
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- --------------------------------------------------------
-- 6. GESTÃO FOTOGRÁFICA DE OBRAS & DATE STAMP
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS obras_fotos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    obra_id UUID REFERENCES obras_config(id) ON DELETE SET NULL,
    autor_telefone VARCHAR(50),
    autor_nome VARCHAR(255),
    url_original TEXT NOT NULL,
    url_estampada TEXT NOT NULL,
    descricao TEXT,
    etapa_obra VARCHAR(100) DEFAULT 'GERAL',
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    clima_resumo VARCHAR(255),
    sha256_hash VARCHAR(64),
    data_foto TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE obras_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for obras_fotos" ON obras_fotos
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- --------------------------------------------------------
-- 7. PARÂMETROS DO SISTEMA & REGRAS DE DIÁRIAS (CHUVA, VIAGEM, PARADO)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS parametros_sistema (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    configuracoes JSONB NOT NULL DEFAULT '{
        "dia_viagem_padrao": 120.00,
        "dia_chuva_padrao": 120.00,
        "dia_parado_padrao": 120.00,
        "diaria_piscina_padrao": 150.00,
        "diaria_civil_padrao": 180.00
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE parametros_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for parametros_sistema" ON parametros_sistema
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Inserir default para o tenant padrão
INSERT INTO parametros_sistema (tenant_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;

-- --------------------------------------------------------
-- 8. SEED DE SUPER USUÁRIOS (RBAC MASTER)
-- --------------------------------------------------------
-- Inserção dos 3 Super Usuários Globais na tabela encarregados_obras
INSERT INTO encarregados_obras (
    tenant_id,
    telefone_encarregado,
    nome,
    nivel_permissao,
    ativo
) VALUES 
    ('00000000-0000-0000-0000-000000000001', '5511978543369', 'Patricia Grubel', 'MASTER', TRUE),
    ('00000000-0000-0000-0000-000000000001', '5511913192703', 'Daniel Lopes', 'MASTER', TRUE),
    ('00000000-0000-0000-0000-000000000001', '5524998424641', 'Joabson Nascimento', 'MASTER', TRUE)
ON CONFLICT DO NOTHING;


-- --------------------------------------------------------
-- 9. TABELA DE DIÁRIAS VARIÁVEIS POR OBRA (trabalhador_obra_valores)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS trabalhador_obra_valores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    funcionario_id UUID REFERENCES funcionarios_obra(id) ON DELETE CASCADE,
    nome_trabalhador VARCHAR(255) NOT NULL,
    obra_id UUID REFERENCES obras_config(id) ON DELETE CASCADE,
    nome_obra VARCHAR(255),
    valor_diaria NUMERIC(10, 2) NOT NULL, -- Ex: 220.00 na Quase Tudo, 200.00 no Jabaquara
    observacao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE trabalhador_obra_valores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for trabalhador_obra_valores" ON trabalhador_obra_valores
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- --------------------------------------------------------
-- 10. MÓDULO DE REEMBOLSOS (pedidos_reembolso & pagamentos_reembolso)
-- --------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE status_reembolso_enum AS ENUM ('PENDENTE_ANALISE', 'APROVADO', 'PAGO_PARCIAL', 'LIQUIDADO', 'RECUSADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS pedidos_reembolso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    obra_id UUID REFERENCES obras_config(id) ON DELETE SET NULL,
    nome_obra VARCHAR(255),
    solicitante_nome VARCHAR(255) NOT NULL, -- Ex: Joabson
    solicitante_telefone VARCHAR(50),
    categoria VARCHAR(100) DEFAULT 'OUTROS', -- COMBUSTIVEL, MATERIAL, ALIMENTACAO, PEDAGIO
    descricao TEXT,
    valor_solicitado NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    valor_aprovado NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    valor_pago NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    saldo_pendente NUMERIC(10, 2) GENERATED ALWAYS AS (valor_aprovado - valor_pago) STORED,
    status status_reembolso_enum NOT NULL DEFAULT 'PENDENTE_ANALISE',
    comprovante_url TEXT,
    motivo_recusa TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE pedidos_reembolso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for pedidos_reembolso" ON pedidos_reembolso
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- Histórico de Abates / Pagamentos de Reembolso (Data Livre e Parcial)
CREATE TABLE IF NOT EXISTS pagamentos_reembolso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    reembolso_id UUID NOT NULL REFERENCES pedidos_reembolso(id) ON DELETE CASCADE,
    valor_pago NUMERIC(10, 2) NOT NULL,
    data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
    forma_pagamento VARCHAR(50) DEFAULT 'PIX',
    comprovante_pix_url TEXT,
    registrado_por VARCHAR(100) NOT NULL DEFAULT 'PATRICIA',
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE pagamentos_reembolso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for pagamentos_reembolso" ON pagamentos_reembolso
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR auth.role() = 'service_role'
        OR auth.uid() IS NOT NULL
    );

-- --------------------------------------------------------
-- 11. REGIME DE REMUNERAÇÃO MULTI-CICLO (DIARISTA, SEMANALISTA, QUINZENALISTA)
-- --------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE regime_remuneracao_enum AS ENUM ('DIARISTA', 'SEMANALISTA', 'QUINZENALISTA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ciclo_pagamento_enum AS ENUM ('SEMANAL', 'QUINZENAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE funcionarios_obra 
ADD COLUMN IF NOT EXISTS regime_remuneracao regime_remuneracao_enum NOT NULL DEFAULT 'DIARISTA',
ADD COLUMN IF NOT EXISTS ciclo_pagamento ciclo_pagamento_enum NOT NULL DEFAULT 'QUINZENAL',
ADD COLUMN IF NOT EXISTS valor_base_contratual NUMERIC(10, 2) DEFAULT 0.00;

-- --------------------------------------------------------
-- 12. VÍNCULO BIUNÍVOCO: ENCARREGADO <-> FUNCIONÁRIO (AUTORRECEPÇÃO DE SALÁRIO)
-- --------------------------------------------------------
ALTER TABLE encarregados_obras
ADD COLUMN IF NOT EXISTS funcionario_id UUID REFERENCES funcionarios_obra(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS regime_remuneracao VARCHAR(50) DEFAULT 'SEMANALISTA',
ADD COLUMN IF NOT EXISTS valor_salario_fixo NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(255);

ALTER TABLE funcionarios_obra
ADD COLUMN IF NOT EXISTS is_encarregado BOOLEAN NOT NULL DEFAULT FALSE;
