-- Migration V24: Rastreabilidade de Emissor do PIX e Data/Hora Exata no Caixinha de Campo
-- Idempotente e isolada por tenant_id (Jhoston & Intermack)

ALTER TABLE public.caixinha_movimentacoes
  ADD COLUMN IF NOT EXISTS emissor_pix VARCHAR(120),
  ADD COLUMN IF NOT EXISTS data_hora_envio TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS origem_emissor VARCHAR(40),
  ADD COLUMN IF NOT EXISTS origem_data_hora VARCHAR(40);

-- Backfill idempotente para movimentos já existentes (sem alterar valores ou saldos)
UPDATE public.caixinha_movimentacoes
SET
  emissor_pix = CASE
    WHEN tipo = 'ENTRADA_PIX' AND (emissor_pix IS NULL OR BTRIM(emissor_pix) = '') THEN
      CASE
        WHEN LOWER(COALESCE(enviado_por, '')) LIKE '%patr%' THEN 'Patrícia'
        WHEN LOWER(COALESCE(enviado_por, '')) LIKE '%daniel%' THEN 'Daniel'
        WHEN LOWER(COALESCE(enviado_por, '')) LIKE '%joabson%' THEN 'Joabson'
        ELSE COALESCE(NULLIF(BTRIM(enviado_por), ''), 'Patrícia')
      END
    ELSE emissor_pix
  END,
  data_hora_envio = COALESCE(
    data_hora_envio,
    (
      data_movimentacao::text || ' ' ||
      CASE
        WHEN hora_movimentacao ~ '^[0-2][0-9]:[0-5][0-9]$' THEN hora_movimentacao
        ELSE '12:00'
      END || ':00-03'
    )::timestamptz
  ),
  origem_emissor = COALESCE(origem_emissor, 'MANUAL'),
  origem_data_hora = COALESCE(origem_data_hora, 'MANUAL')
WHERE data_hora_envio IS NULL
   OR (tipo = 'ENTRADA_PIX' AND (emissor_pix IS NULL OR BTRIM(emissor_pix) = ''));

CREATE INDEX IF NOT EXISTS idx_caixinha_tenant_data_hora_envio
  ON public.caixinha_movimentacoes (tenant_id, data_hora_envio DESC);
