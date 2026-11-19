-- ========================================================
-- Unificação de Nomenclatura: GERAL / OBRA BAHIA (PORTO SEGURO) -> PORTO SEGURO
-- Executar no SQL Editor do Supabase
-- ========================================================

DO $$
DECLARE
    v_porto_seguro_id UUID;
BEGIN
    -- 1. Localiza ou cria a obra canônica 'PORTO SEGURO'
    SELECT id INTO v_porto_seguro_id
    FROM obras_config
    WHERE UPPER(TRIM(nome)) = 'PORTO SEGURO'
    LIMIT 1;

    IF v_porto_seguro_id IS NULL THEN
        SELECT id INTO v_porto_seguro_id
        FROM obras_config
        WHERE UPPER(nome) LIKE '%PORTO SEGURO%'
        LIMIT 1;

        IF v_porto_seguro_id IS NOT NULL THEN
            UPDATE obras_config SET nome = 'PORTO SEGURO' WHERE id = v_porto_seguro_id;
        END IF;
    END IF;

    -- 2. Reaponta todos os lançamentos, lotes e funcionários de 'GERAL' ou variações de Porto Seguro para a obra canônica
    IF v_porto_seguro_id IS NOT NULL THEN
        UPDATE lancamentos_financeiros
        SET obra_id = v_porto_seguro_id
        WHERE obra_id IN (
            SELECT id FROM obras_config
            WHERE id <> v_porto_seguro_id
              AND (UPPER(TRIM(nome)) IN ('GERAL', 'OBRA GERAL', 'CANTEIRO GERAL') OR UPPER(nome) LIKE '%PORTO SEGURO%')
        );

        UPDATE ponto_lote
        SET obra_id = v_porto_seguro_id
        WHERE obra_id IN (
            SELECT id FROM obras_config
            WHERE id <> v_porto_seguro_id
              AND (UPPER(TRIM(nome)) IN ('GERAL', 'OBRA GERAL', 'CANTEIRO GERAL') OR UPPER(nome) LIKE '%PORTO SEGURO%')
        );

        UPDATE funcionarios_obra
        SET obra_id = v_porto_seguro_id
        WHERE obra_id IN (
            SELECT id FROM obras_config
            WHERE id <> v_porto_seguro_id
              AND (UPPER(TRIM(nome)) IN ('GERAL', 'OBRA GERAL', 'CANTEIRO GERAL') OR UPPER(nome) LIKE '%PORTO SEGURO%')
        );

        -- Desativa os cadastros duplicados/antigos
        UPDATE obras_config
        SET ativo = FALSE
        WHERE id <> v_porto_seguro_id
          AND (UPPER(TRIM(nome)) IN ('GERAL', 'OBRA GERAL', 'CANTEIRO GERAL') OR UPPER(nome) LIKE '%PORTO SEGURO%');
    END IF;
END $$;
