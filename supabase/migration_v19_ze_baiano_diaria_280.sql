-- ==============================================================================
-- MIGRATION V19: Atualização da Diária Normal de Zé Baiano (R$ 150,00 -> R$ 280,00)
-- Tenant: Jhoston (00000000-0000-0000-0000-000000000001) — Isolamento estrito.
-- Preserva intactos os dias de chuva (R$ 120,00) e o dia 2026-11-22 (já R$ 280,00).
-- Execução 100% idempotente.
-- ==============================================================================

-- 1. Fixar cadastro base / obra / piscina do Zé Baiano em R$ 280,00/dia
UPDATE public.funcionarios_obra
SET
  valor_diaria = 280.00,
  valor_diaria_obra = 280.00,
  valor_diaria_piscina = 280.00
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND (
    UPPER(TRIM(nome_trabalhador)) IN ('ZÉ BAIANO', 'ZE BAIANO', 'JOSÉ BAIANO', 'JOSE BAIANO')
    OR LOWER(nome_trabalhador) LIKE '%baiano%'
  );

-- 2. Atualizar os lançamentos de diária normal ainda em R$ 150,00 (2026-11-20 Porto Seguro e 2026-11-21 18:12 Piscina Porto Seguro)
UPDATE public.lancamentos_financeiros
SET
  valor_monetario = 280.00,
  observacao = CASE
    WHEN observacao ILIKE '%150%' THEN REPLACE(observacao, '150.00', '280.00')
    WHEN observacao IS NULL OR TRIM(observacao) = '' THEN 'NORMAL | Diária Zé Baiano ajustada para R$ 280.00/dia'
    ELSE observacao || ' | Diária ajustada para R$ 280,00'
  END,
  updated_at = NOW()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND tipo_lancamento = 'PONTO'
  AND status <> 'DESCARTADO'
  AND (
    UPPER(TRIM(nome_trabalhador)) IN ('ZÉ BAIANO', 'ZE BAIANO', 'JOSÉ BAIANO', 'JOSE BAIANO')
    OR LOWER(nome_trabalhador) LIKE '%baiano%'
  )
  AND data_referencia IN ('2026-11-20', '2026-11-21')
  AND valor_monetario = 150.00
  AND COALESCE(observacao, '') NOT ILIKE '%CHUVA%';
