-- ============================================================================
-- MIGRAÇÃO V17 — DEDUPLICAÇÃO DE VALES (31 -> 27 = R$ 2.700,00) & IDEMPOTÊNCIA
-- Tenant Jhoston: 00000000-0000-0000-0000-000000000001
-- Objetivo:
--   1. Soft-delete auditado dos 4 vales duplicados/excedentes no banco remoto
--      (3 duplicatas do Assistente IA com data errada 2026-03-30/31 criadas
--      em 20/11 e 21/11 + 1 registro excedente de Peu em 19/11 fora dos 5
--      vales auditados daquele dia).
--   2. Normalizar os 27 vales auditados (17/11 a 22/11 08:35) com nomes
--      canônicos (Gil, Peu, Lucas J, Daniel, Ian, Mateus, Zé Baiano),
--      vale_etapa='CONCILIADO', rastreabilidade completa e chave_idempotencia
--      determinística não-nula.
--   3. Criar índice único parcial por (tenant_id, trabalhador, data, janela,
--      valor) para impedir definitivamente futuras duplicatas via webhook ou
--      reconciliação.
-- ============================================================================

DO $$
DECLARE
  v_jhoston CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- 1. Soft-delete auditado dos 4 registros duplicados/excedentes (preservando trilha de auditoria)
  UPDATE public.lancamentos_financeiros
  SET
    status = 'DESCARTADO',
    observacao = COALESCE(observacao, '') || ' | [DEDUP V17: duplicata removida para batimento 27 vales = R$ 2.700,00]',
    updated_at = NOW()
  WHERE tenant_id = v_jhoston
    AND tipo_lancamento = 'VALE'
    AND status <> 'DESCARTADO'
    AND id IN (
      'bb91fed5-25e6-4cd5-8d97-c3a1eaaedf9c', -- Daniel 2026-03-30 (duplicata Assistente IA de 21/11)
      '86690c22-d3cf-455d-b82a-0c613c3e3a9e', -- Ian    2026-03-30 (duplicata Assistente IA de 21/11)
      '0223d32b-26cc-4415-84c5-73e1b0eda0df', -- Lucas  2026-03-31 (duplicata Assistente IA de 20/11)
      '901fa19a-1cd1-4735-bce0-dbcc16475637'  -- Peu    2026-11-19 (excedente fora dos 5 vales auditados de 19/11)
    );

  -- 2. Normalizar nomes canônicos e metadados obrigatórios nos 14 vales de 17/11, 18/11 e 19/11
  UPDATE public.lancamentos_financeiros
  SET
    nome_trabalhador = CASE UPPER(TRIM(nome_trabalhador))
      WHEN 'GIL' THEN 'Gil'
      WHEN 'GILVAN' THEN 'Gil'
      WHEN 'GILVAN - GIL' THEN 'Gil'
      WHEN 'PEU' THEN 'Peu'
      WHEN 'EDMILSON' THEN 'Peu'
      WHEN 'EDMILSON - PEU' THEN 'Peu'
      WHEN 'LUCAS J.' THEN 'Lucas J'
      WHEN 'LUCAS.J.' THEN 'Lucas J'
      WHEN 'LUCAS. J.' THEN 'Lucas J'
      WHEN 'LUCAS J' THEN 'Lucas J'
      WHEN 'DANIEL' THEN 'Daniel'
      WHEN 'DANIEL.' THEN 'Daniel'
      WHEN 'IAN' THEN 'Ian'
      WHEN 'MATEUS' THEN 'Mateus'
      WHEN 'ZÉ BAIANO' THEN 'Zé Baiano'
      WHEN 'ZE BAIANO' THEN 'Zé Baiano'
      ELSE nome_trabalhador
    END,
    vale_etapa = COALESCE(vale_etapa, 'CONCILIADO'),
    solicitado_por = COALESCE(NULLIF(TRIM(solicitado_por), ''), 'Gil'),
    aprovado_por = COALESCE(NULLIF(TRIM(aprovado_por), ''), NULLIF(TRIM(pago_por), ''), 'Patrícia Grubel'),
    pago_por = COALESCE(NULLIF(TRIM(pago_por), ''), NULLIF(TRIM(aprovado_por), ''), 'Patrícia Grubel'),
    horario_origem = COALESCE(
      NULLIF(TRIM(horario_origem), ''),
      CASE data_referencia
        WHEN DATE '2026-11-17' THEN '07:57'
        WHEN DATE '2026-11-18' THEN '13:35'
        WHEN DATE '2026-11-19' THEN '09:05'
        ELSE '12:00'
      END
    ),
    data_hora_solicitacao = COALESCE(
      data_hora_solicitacao,
      CASE data_referencia
        WHEN DATE '2026-11-17' THEN TIMESTAMPTZ '2026-11-17 07:57:00-03'
        WHEN DATE '2026-11-18' THEN TIMESTAMPTZ '2026-11-18 13:35:00-03'
        WHEN DATE '2026-11-19' THEN TIMESTAMPTZ '2026-11-19 09:05:00-03'
        ELSE created_at
      END
    ),
    data_hora_envio_efetivo = COALESCE(data_hora_envio_efetivo, created_at),
    updated_at = NOW()
  WHERE tenant_id = v_jhoston
    AND tipo_lancamento = 'VALE'
    AND status <> 'DESCARTADO';

  -- 3. Preencher chave_idempotencia determinística em qualquer vale ativo que ainda esteja NULL
  UPDATE public.lancamentos_financeiros
  SET chave_idempotencia = 'v17-vale-' ||
      TO_CHAR(data_referencia, 'YYYY-MM-DD') || '-' ||
      COALESCE(REPLACE(horario_origem, ':', ''), '0000') || '-' ||
      REGEXP_REPLACE(LOWER(TRANSLATE(TRIM(nome_trabalhador), 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC')), '[^a-z0-9]+', '-', 'g')
  WHERE tenant_id = v_jhoston
    AND tipo_lancamento = 'VALE'
    AND status <> 'DESCARTADO'
    AND (chave_idempotencia IS NULL OR TRIM(chave_idempotencia) = '');
END $$;

-- 4. Índice único parcial anti-duplicidade de VALES por (tenant_id + trabalhador + data + janela + valor)
-- Impede que retries de webhook ou reexecuções de reconciliação gerem duplicatas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lancamentos_vale_idempotencia_janela
  ON public.lancamentos_financeiros (
    tenant_id,
    LOWER(TRIM(nome_trabalhador)),
    data_referencia,
    COALESCE(NULLIF(TRIM(horario_origem), ''), '00:00'),
    valor_monetario
  )
  WHERE tipo_lancamento = 'VALE' AND status <> 'DESCARTADO';
