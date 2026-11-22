-- ============================================================================
-- DIÁRIA.AI — MIGRAÇÃO V15 (IDEMPOTENTE / NÃO DESTRUTIVA)
-- Acerto de BD (Corte Rígido 2026-11-22T11:40:00-03:00),
-- Rastreabilidade Integral de Vales (27 vales = R$ 2.700,00),
-- Encerramento Ciclo Anterior Manoel/Wender (QUITACAO_PIX_EXTERNO),
-- Novo Ciclo Pós-21/11 (Quase Tudo 16:39 + Piscina Porto Seguro 18:12)
-- e Comprovantes PIX Avulsos (Zé Roberto R$ 3.000,00 + Diego R$ 2.000,00).
-- ============================================================================

-- 1. EVOLUÇÃO DE SCHEMA — RASTREABILIDADE DE VALES & ENCERRAMENTO DE CICLO
ALTER TABLE lancamentos_financeiros
    ADD COLUMN IF NOT EXISTS data_hora_solicitacao TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS aprovado_por VARCHAR(120),
    ADD COLUMN IF NOT EXISTS data_hora_envio_efetivo TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS tipo_quitacao VARCHAR(40),
    ADD COLUMN IF NOT EXISTS ciclo_encerrado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS chave_idempotencia VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lancamentos_chave_idempotencia
    ON lancamentos_financeiros(chave_idempotencia)
    WHERE chave_idempotencia IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant_ciclo_encerrado
    ON lancamentos_financeiros(tenant_id, status, ciclo_encerrado);

CREATE INDEX IF NOT EXISTS idx_lancamentos_vales_solicitacao
    ON lancamentos_financeiros(tenant_id, tipo_lancamento, data_hora_solicitacao);

ALTER TABLE ciclos_financeiros
    ADD COLUMN IF NOT EXISTS tipo_quitacao VARCHAR(40) DEFAULT 'LIQUIDACAO_BORDERO',
    ADD COLUMN IF NOT EXISTS ciclo_encerrado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS chave_idempotencia VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ciclos_chave_idempotencia
    ON ciclos_financeiros(chave_idempotencia)
    WHERE chave_idempotencia IS NOT NULL;

-- Backfill seguro de rastreabilidade nos vales legados já gravados
UPDATE lancamentos_financeiros
SET
    solicitado_por = COALESCE(NULLIF(TRIM(solicitado_por), ''), 'Gil'),
    data_hora_solicitacao = COALESCE(
        data_hora_solicitacao,
        (data_referencia::text || ' ' || COALESCE(NULLIF(TRIM(horario_origem), ''), '12:00') || ':00-03')::timestamptz
    ),
    aprovado_por = COALESCE(
        aprovado_por,
        pago_por,
        CASE WHEN status IN ('VALIDADO', 'LIQUIDADO') THEN 'Patrícia Grubel' ELSE NULL END
    ),
    data_hora_envio_efetivo = COALESCE(
        data_hora_envio_efetivo,
        CASE WHEN status IN ('VALIDADO', 'LIQUIDADO') THEN COALESCE(liquidado_em, updated_at, created_at) ELSE NULL END
    )
WHERE tipo_lancamento = 'VALE'
  AND status <> 'DESCARTADO';

-- 2. GARANTIR OBRAS CANÔNICAS DA JHOSTON (TENANT ...0001)
DO $$
DECLARE
    v_jhoston_id UUID := '00000000-0000-0000-0000-000000000001';
    v_obra_quase_tudo UUID;
    v_obra_piscina_ps UUID;
    v_ciclo_manoel UUID;
    v_ciclo_wender UUID;
    v_vales_existentes INTEGER;
    v_i INTEGER;
BEGIN
    SELECT id INTO v_obra_quase_tudo
    FROM obras_config
    WHERE tenant_id = v_jhoston_id AND UPPER(nome) LIKE '%QUASE TUDO%'
    LIMIT 1;

    IF v_obra_quase_tudo IS NULL THEN
        INSERT INTO obras_config (tenant_id, nome, local, tipo_obra, valor_diaria_padrao, ativo)
        VALUES (v_jhoston_id, 'QUASE TUDO', 'São Paulo / SP', 'OBRA_CIVIL', 180.00, TRUE)
        RETURNING id INTO v_obra_quase_tudo;
    END IF;

    SELECT id INTO v_obra_piscina_ps
    FROM obras_config
    WHERE tenant_id = v_jhoston_id AND UPPER(nome) LIKE '%PISCINA%PORTO SEGURO%'
    LIMIT 1;

    IF v_obra_piscina_ps IS NULL THEN
        INSERT INTO obras_config (tenant_id, nome, local, tipo_obra, valor_diaria_padrao, ativo)
        VALUES (v_jhoston_id, 'PISCINA PORTO SEGURO', 'Porto Seguro / BA', 'PISCINA', 280.00, TRUE)
        RETURNING id INTO v_obra_piscina_ps;
    END IF;

    -- 3. ENCERRAMENTO DO CICLO ANTERIOR (QUITACAO_PIX_EXTERNO EM 21/11/2026)
    -- Manoel: R$ 1.150,00 (5,0 diárias) | Wender: R$ 1.275,00 (8,5 diárias)
    INSERT INTO ciclos_financeiros (
        tenant_id, nome_trabalhador_canonico, obra_nome, status,
        data_inicio, data_corte_quitacao, valor_quitado, quitado_por,
        observacao, tipo_quitacao, ciclo_encerrado, chave_idempotencia
    ) VALUES (
        v_jhoston_id, 'Manoel', 'QUASE TUDO', 'QUITADO',
        '2026-11-16', '2026-11-21T16:00:00-03:00', 1150.00, 'Patrícia Grubel',
        'Ciclo anterior quitado via PIX externo em 21/11/2026 (5,0 diárias = R$ 1.150,00)',
        'QUITACAO_PIX_EXTERNO', TRUE, 'v15-ciclo-quitado-manoel-2026-11-21'
    )
    ON CONFLICT (chave_idempotencia) DO UPDATE SET
        status = 'QUITADO',
        tipo_quitacao = 'QUITACAO_PIX_EXTERNO',
        ciclo_encerrado = TRUE
    RETURNING id INTO v_ciclo_manoel;

    INSERT INTO ciclos_financeiros (
        tenant_id, nome_trabalhador_canonico, obra_nome, status,
        data_inicio, data_corte_quitacao, valor_quitado, quitado_por,
        observacao, tipo_quitacao, ciclo_encerrado, chave_idempotencia
    ) VALUES (
        v_jhoston_id, 'Wender', 'QUASE TUDO', 'QUITADO',
        '2026-11-12', '2026-11-21T16:00:00-03:00', 1275.00, 'Patrícia Grubel',
        'Ciclo anterior quitado via PIX externo em 21/11/2026 (8,5 diárias = R$ 1.275,00)',
        'QUITACAO_PIX_EXTERNO', TRUE, 'v15-ciclo-quitado-wender-2026-11-21'
    )
    ON CONFLICT (chave_idempotencia) DO UPDATE SET
        status = 'QUITADO',
        tipo_quitacao = 'QUITACAO_PIX_EXTERNO',
        ciclo_encerrado = TRUE
    RETURNING id INTO v_ciclo_wender;

    -- Marca todos os pontos anteriores a 21/11 de Manoel e Wender/Weslen como LIQUIDADO / ciclo_encerrado
    UPDATE lancamentos_financeiros
    SET
        status = 'LIQUIDADO',
        tipo_quitacao = 'QUITACAO_PIX_EXTERNO',
        ciclo_encerrado = TRUE,
        ciclo_id = COALESCE(ciclo_id, v_ciclo_manoel),
        liquidado_em = COALESCE(liquidado_em, '2026-11-21T16:00:00-03:00'::timestamptz)
    WHERE tenant_id = v_jhoston_id
      AND tipo_lancamento = 'PONTO'
      AND UPPER(nome_trabalhador) LIKE '%MANOEL%'
      AND data_referencia < '2026-11-21';

    UPDATE lancamentos_financeiros
    SET
        status = 'LIQUIDADO',
        tipo_quitacao = 'QUITACAO_PIX_EXTERNO',
        ciclo_encerrado = TRUE,
        ciclo_id = COALESCE(ciclo_id, v_ciclo_wender),
        liquidado_em = COALESCE(liquidado_em, '2026-11-21T16:00:00-03:00'::timestamptz)
    WHERE tenant_id = v_jhoston_id
      AND tipo_lancamento = 'PONTO'
      AND (UPPER(nome_trabalhador) LIKE '%WENDER%' OR UPPER(nome_trabalhador) LIKE '%WESLEN%')
      AND data_referencia < '2026-11-21';

    -- 4. NOVO CICLO DE CONTAGEM (A PARTIR DE 21/11/2026)
    -- 4.1 Quase Tudo (21/11 16:39): Manoel R$ 230,00 + Wender R$ 180,00 = R$ 410,00
    INSERT INTO lancamentos_financeiros (
        tenant_id, obra_id, nome_trabalhador, tipo_lancamento, fracao_dia,
        valor_monetario, status, data_referencia, horario_origem, observacao,
        ciclo_encerrado, chave_idempotencia
    ) VALUES
        (v_jhoston_id, v_obra_quase_tudo, 'Manoel', 'PONTO', 1.0, 230.00, 'VALIDADO', '2026-11-21', '16:39',
         'Novo ciclo pós-quitação 21/11 16:39 — Quase Tudo', FALSE, 'v15-novo-ciclo-2026-11-21-1639-manoel'),
        (v_jhoston_id, v_obra_quase_tudo, 'Wender', 'PONTO', 1.0, 180.00, 'VALIDADO', '2026-11-21', '16:39',
         'Novo ciclo pós-quitação 21/11 16:39 — Quase Tudo', FALSE, 'v15-novo-ciclo-2026-11-21-1639-wender')
    ON CONFLICT (chave_idempotencia) DO NOTHING;

    -- 4.2 Piscina Porto Seguro (21/11 18:12): 7 trabalhadores = R$ 2.070,00
    INSERT INTO lancamentos_financeiros (
        tenant_id, obra_id, nome_trabalhador, tipo_lancamento, fracao_dia,
        valor_monetario, status, data_referencia, horario_origem, observacao,
        ciclo_encerrado, chave_idempotencia
    ) VALUES
        (v_jhoston_id, v_obra_piscina_ps, 'Gil', 'PONTO', 1.0, 400.00, 'VALIDADO', '2026-11-21', '18:12',
         'Lote sábado 21/11 18:12 — Piscina Porto Seguro', FALSE, 'v15-lote-2026-11-21-1812-gil'),
        (v_jhoston_id, v_obra_piscina_ps, 'Mateus', 'PONTO', 1.0, 340.00, 'VALIDADO', '2026-11-21', '18:12',
         'Lote sábado 21/11 18:12 — Piscina Porto Seguro', FALSE, 'v15-lote-2026-11-21-1812-mateus'),
        (v_jhoston_id, v_obra_piscina_ps, 'Lucas J', 'PONTO', 1.0, 150.00, 'VALIDADO', '2026-11-21', '18:12',
         'Lote sábado 21/11 18:12 — Piscina Porto Seguro', FALSE, 'v15-lote-2026-11-21-1812-lucas-j'),
        (v_jhoston_id, v_obra_piscina_ps, 'Peu', 'PONTO', 1.0, 450.00, 'VALIDADO', '2026-11-21', '18:12',
         'Lote sábado 21/11 18:12 — Piscina Porto Seguro', FALSE, 'v15-lote-2026-11-21-1812-peu'),
        (v_jhoston_id, v_obra_piscina_ps, 'Ian', 'PONTO', 1.0, 300.00, 'VALIDADO', '2026-11-21', '18:12',
         'Lote sábado 21/11 18:12 — Piscina Porto Seguro', FALSE, 'v15-lote-2026-11-21-1812-ian'),
        (v_jhoston_id, v_obra_piscina_ps, 'Zé Baiano', 'PONTO', 1.0, 150.00, 'VALIDADO', '2026-11-21', '18:12',
         'Lote sábado 21/11 18:12 — Piscina Porto Seguro', FALSE, 'v15-lote-2026-11-21-1812-ze-baiano'),
        (v_jhoston_id, v_obra_piscina_ps, 'Daniel', 'PONTO', 1.0, 280.00, 'VALIDADO', '2026-11-21', '18:12',
         'Lote sábado 21/11 18:12 — Piscina Porto Seguro', FALSE, 'v15-lote-2026-11-21-1812-daniel')
    ON CONFLICT (chave_idempotencia) DO NOTHING;

    -- 4.3 Comprovantes PIX avulsos de 21/11/2026 (Zé Roberto R$ 3.000,00 + Diego R$ 2.000,00)
    INSERT INTO lancamentos_financeiros (
        tenant_id, obra_id, nome_trabalhador, tipo_lancamento, fracao_dia,
        valor_monetario, status, data_referencia, horario_origem, observacao,
        aprovado_por, pago_por, data_hora_envio_efetivo, liquidado_em,
        tipo_quitacao, ciclo_encerrado, chave_idempotencia
    ) VALUES
        (v_jhoston_id, v_obra_quase_tudo, 'Zé Roberto', 'LIQUIDACAO', 0, 3000.00, 'LIQUIDADO', '2026-11-21', '15:30',
         'Comprovante PIX avulso registrado em 21/11/2026 — Zé Roberto (R$ 3.000,00)',
         'Patrícia Grubel', 'Patrícia Grubel', '2026-11-21T15:30:00-03:00', '2026-11-21T15:30:00-03:00',
         'PIX_AVULSO', TRUE, 'v15-pix-avulso-2026-11-21-ze-roberto-3000'),
        (v_jhoston_id, v_obra_quase_tudo, 'Diego', 'LIQUIDACAO', 0, 2000.00, 'LIQUIDADO', '2026-11-21', '15:35',
         'Comprovante PIX avulso registrado em 21/11/2026 — Diego (R$ 2.000,00)',
         'Patrícia Grubel', 'Patrícia Grubel', '2026-11-21T15:35:00-03:00', '2026-11-21T15:35:00-03:00',
         'PIX_AVULSO', TRUE, 'v15-pix-avulso-2026-11-21-diego-2000')
    ON CONFLICT (chave_idempotencia) DO NOTHING;

    -- 5. RECONCILIAÇÃO DOS VALES COM RASTREABILIDADE INTEGRAL (20/11, 21/11, 22/11 = 13 vales)
    INSERT INTO lancamentos_financeiros (
        tenant_id, obra_id, nome_trabalhador, tipo_lancamento, fracao_dia,
        valor_monetario, status, data_referencia, horario_origem, observacao,
        vale_etapa, solicitado_por, data_hora_solicitacao, aprovado_por, pago_por,
        data_hora_envio_efetivo, ciclo_encerrado, chave_idempotencia
    ) VALUES
        -- 20/11/2026 (5 vales = R$ 500,00)
        (v_jhoston_id, v_obra_piscina_ps, 'Lucas J', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-20', '17:00',
         'Reconciliação V15 — Vale 20/11 (WhatsApp Log)', 'CONCILIADO', 'WhatsApp Log',
         '2026-11-20T17:00:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-20T18:00:00-03:00',
         FALSE, 'v15-vale-2026-11-20-lucas-j'),
        (v_jhoston_id, v_obra_piscina_ps, 'Ian', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-20', '17:00',
         'Reconciliação V15 — Vale 20/11 (WhatsApp Log)', 'CONCILIADO', 'WhatsApp Log',
         '2026-11-20T17:00:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-20T18:00:00-03:00',
         FALSE, 'v15-vale-2026-11-20-ian'),
        (v_jhoston_id, v_obra_piscina_ps, 'Mateus', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-20', '17:00',
         'Reconciliação V15 — Vale 20/11 (WhatsApp Log)', 'CONCILIADO', 'WhatsApp Log',
         '2026-11-20T17:00:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-20T18:00:00-03:00',
         FALSE, 'v15-vale-2026-11-20-mateus'),
        (v_jhoston_id, v_obra_piscina_ps, 'Daniel', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-20', '17:00',
         'Reconciliação V15 — Vale 20/11 (WhatsApp Log)', 'CONCILIADO', 'WhatsApp Log',
         '2026-11-20T17:00:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-20T18:00:00-03:00',
         FALSE, 'v15-vale-2026-11-20-daniel'),
        (v_jhoston_id, v_obra_piscina_ps, 'Peu', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-20', '17:00',
         'Reconciliação V15 — Vale 20/11 (WhatsApp Log)', 'CONCILIADO', 'WhatsApp Log',
         '2026-11-20T17:00:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-20T18:00:00-03:00',
         FALSE, 'v15-vale-2026-11-20-peu'),

        -- 21/11/2026 12:29 (1 vale = R$ 100,00 — "Uma vale pra o Mateus por favor.")
        (v_jhoston_id, v_obra_piscina_ps, 'Mateus', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-21', '12:29',
         'Solicitado via WhatsApp: "Uma vale pra o Mateus por favor." (PIX 14:06)', 'CONCILIADO', 'Gil',
         '2026-11-21T12:29:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-21T14:06:00-03:00',
         FALSE, 'v15-vale-2026-11-21-1229-mateus'),

        -- 21/11/2026 12:37 (2 vales = R$ 200,00 — "Pra o Daniel e o Ian também por favor. Vale.")
        (v_jhoston_id, v_obra_piscina_ps, 'Daniel', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-21', '12:37',
         'Solicitado via WhatsApp: "Pra o Daniel e o Ian também por favor. Vale." (PIX 14:05)', 'CONCILIADO', 'Gil',
         '2026-11-21T12:37:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-21T14:05:00-03:00',
         FALSE, 'v15-vale-2026-11-21-1237-daniel'),
        (v_jhoston_id, v_obra_piscina_ps, 'Ian', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-21', '12:37',
         'Solicitado via WhatsApp: "Pra o Daniel e o Ian também por favor. Vale." (PIX 14:05)', 'CONCILIADO', 'Gil',
         '2026-11-21T12:37:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-21T14:05:00-03:00',
         FALSE, 'v15-vale-2026-11-21-1237-ian'),

        -- 22/11/2026 08:35 (5 vales = R$ 500,00 — "Bom dia Patrícia. 5 vale por favor.")
        (v_jhoston_id, v_obra_piscina_ps, 'Peu', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-22', '08:35',
         'Solicitado via WhatsApp domingo: "Bom dia Patrícia. 5 vale por favor."', 'CONCILIADO', 'Gil',
         '2026-11-22T08:35:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-22T09:15:00-03:00',
         FALSE, 'v15-vale-2026-11-22-0835-peu'),
        (v_jhoston_id, v_obra_piscina_ps, 'Mateus', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-22', '08:35',
         'Solicitado via WhatsApp domingo: "Bom dia Patrícia. 5 vale por favor."', 'CONCILIADO', 'Gil',
         '2026-11-22T08:35:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-22T09:15:00-03:00',
         FALSE, 'v15-vale-2026-11-22-0835-mateus'),
        (v_jhoston_id, v_obra_piscina_ps, 'Ian', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-22', '08:35',
         'Solicitado via WhatsApp domingo: "Bom dia Patrícia. 5 vale por favor."', 'CONCILIADO', 'Gil',
         '2026-11-22T08:35:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-22T09:15:00-03:00',
         FALSE, 'v15-vale-2026-11-22-0835-ian'),
        (v_jhoston_id, v_obra_piscina_ps, 'Daniel', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-22', '08:35',
         'Solicitado via WhatsApp domingo: "Bom dia Patrícia. 5 vale por favor."', 'CONCILIADO', 'Gil',
         '2026-11-22T08:35:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-22T09:15:00-03:00',
         FALSE, 'v15-vale-2026-11-22-0835-daniel'),
        (v_jhoston_id, v_obra_piscina_ps, 'Gil', 'VALE', 0, 100.00, 'VALIDADO', '2026-11-22', '08:35',
         'Solicitado via WhatsApp domingo: "Bom dia Patrícia. 5 vale por favor."', 'CONCILIADO', 'Gil',
         '2026-11-22T08:35:00-03:00', 'Patrícia Grubel', 'Patrícia Grubel', '2026-11-22T09:15:00-03:00',
         FALSE, 'v15-vale-2026-11-22-0835-gil')
    ON CONFLICT (chave_idempotencia) DO NOTHING;

    -- 6. TRAVA DE CORTE RÍGIDO: 2026-11-22T11:40:00-03:00
    UPDATE ponto_lote
    SET
        status_validacao = 'VALIDADO',
        validado_por = COALESCE(validado_por, 'Corte Rígido V15 (22/11 11:40)'),
        validado_em = COALESCE(validado_em, '2026-11-22T11:40:00-03:00'::timestamptz)
    WHERE tenant_id = v_jhoston_id
      AND status_validacao = 'PENDENTE'
      AND created_at <= '2026-11-22T11:40:00-03:00'::timestamptz;

    UPDATE lancamentos_financeiros
    SET status = 'VALIDADO'
    WHERE tenant_id = v_jhoston_id
      AND status = 'PENDENTE'
      AND created_at <= '2026-11-22T11:40:00-03:00'::timestamptz;

    -- Persistir corte rígido em parametros_sistema (Jhoston)
    UPDATE parametros_sistema
    SET configuracoes = COALESCE(configuracoes, '{}'::jsonb) || jsonb_build_object(
        'data_corte_operacional', '2026-11-22',
        'data_hora_corte_rigido', '2026-11-22T11:40:00-03:00',
        'corte_v15_aplicado', true,
        'corte_aplicado_por', 'Sprint V15 (Corte 22/11 11:40)'
    )
    WHERE tenant_id = v_jhoston_id;

    -- Log informativo da contagem final de vales conciliados
    SELECT COUNT(*) INTO v_vales_existentes
    FROM lancamentos_financeiros
    WHERE tenant_id = v_jhoston_id
      AND tipo_lancamento = 'VALE'
      AND status <> 'DESCARTADO'
      AND created_at <= '2026-11-22T11:40:00-03:00'::timestamptz;

    RAISE NOTICE 'V15 concluída com sucesso. Vales ativos até o corte 22/11 11:40: %', v_vales_existentes;
END $$;
