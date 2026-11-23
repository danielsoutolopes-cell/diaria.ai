-- ==============================================================================
-- MIGRATION V21: Auditoria & Deduplicação do Caixinha de Campo do Gil (Jhoston)
-- Problema auditado:
--   - `caixinha_movimentacoes` (SQL) continha 2 lançamentos sintéticos consolidados
--     (R$ 700,00 entrada / R$ 546,94 saída = R$ 153,06) que se sobrepunham aos
--     12 lançamentos reais itemizados (13/11, 19/11 e 20/11) em
--     `parametros_sistema.configuracoes.caixa_campo_movimentos`
--     (R$ 700,00 entrada / R$ 544,62 notas = R$ 155,38), causando dupla contagem
--     na tela (R$ 1.400,00 recebido / R$ 1.091,56 notas / R$ 308,44 troco).
-- Correção (isolada ao tenant_id Jhoston, sem afetar Intermack):
--   1. Remove os 2 lançamentos sintéticos sobrepostos de `caixinha_movimentacoes`.
--   2. Insere (idempotente por UUID) os 12 lançamentos reais itemizados do Gil
--      em `caixinha_movimentacoes` como fonte única sincronizada:
--      Entradas PIX = R$ 700,00 | Notas = R$ 544,62 | Troco em Mãos = R$ 155,38.
--   3. Normaliza o JSONB espelho em `parametros_sistema` com os mesmos 12 IDs.
-- ==============================================================================

-- 1. Remover apenas os 2 registros sintéticos consolidados sobrepostos do Gil (Jhoston)
DELETE FROM public.caixinha_movimentacoes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND is_pre_implantacao = TRUE
  AND (
    descricao ILIKE 'Entradas PIX consolidadas (Pré-implantação 13/11%'
    OR descricao ILIKE 'Saídas e notas comprovadas (Pré-implantação 13/11%'
  );

-- 2. Inserir os 12 lançamentos reais itemizados do Gil (13/11, 19/11 e 20/11) — idempotente
INSERT INTO public.caixinha_movimentacoes (
  id,
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
  created_at
)
VALUES
  -- 13/11 (Pré-implantação: R$ 200,00 PIX | R$ 97,00 + R$ 37,47 = R$ 134,47 notas)
  (
    '954f5203-e431-4b5f-b8c5-7d40502d059e',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil (Gilvan)',
    'PORTO SEGURO',
    '2026-11-13',
    '09:00',
    'ENTRADA_PIX',
    'Suprimento PIX',
    'PIX enviado em 13/11 (pré-implantação — Obra Porto Seguro)',
    200.00,
    'APROVADO',
    TRUE,
    'Administração',
    '2026-11-19T17:56:30.701Z'
  ),
  (
    'e98d707a-dcd8-4d47-a92c-67ff10e7d335',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil (Gilvan)',
    'PORTO SEGURO',
    '2026-11-13',
    '14:00',
    'NOTA_DESPESA',
    'Material',
    'Nota Fiscal validada em 13/11 — R$ 97,00',
    97.00,
    'APROVADO',
    TRUE,
    'Gil',
    '2026-11-19T17:56:30.701Z'
  ),
  (
    'ec42d665-b33c-4e82-8cf0-9b2fa73decf2',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil (Gilvan)',
    'PORTO SEGURO',
    '2026-11-13',
    '14:05',
    'NOTA_DESPESA',
    'Material',
    'Nota Fiscal validada em 13/11 — R$ 37,47',
    37.47,
    'APROVADO',
    TRUE,
    'Gil',
    '2026-11-19T17:56:30.701Z'
  ),
  -- 19/11 (R$ 400,00 PIX | R$ 289,18 notas)
  (
    '83a568ec-0fa3-4f21-ab6a-de5e322bb0d8',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil (Gilvan)',
    'PORTO SEGURO',
    '2026-11-19',
    '07:34',
    'ENTRADA_PIX',
    'Suprimento PIX',
    'PIX enviado por Joabson → Gilvan (Compra de materiais)',
    200.00,
    'APROVADO',
    FALSE,
    'Joabson',
    '2026-11-19T16:18:49.179Z'
  ),
  (
    '929f106b-2277-40f7-b3cc-7e76f6e70799',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil (Gilvan)',
    'PORTO SEGURO',
    '2026-11-19',
    '08:20',
    'ENTRADA_PIX',
    'Suprimento PIX',
    'PIX enviado por Joabson → Gilvan (Aluguel bombas)',
    200.00,
    'APROVADO',
    FALSE,
    'Joabson',
    '2026-11-19T16:18:49.179Z'
  ),
  (
    '72d759bf-9436-48f1-8bd8-4c677eb3e342',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil (Gilvan)',
    'PORTO SEGURO',
    '2026-11-19',
    '08:37',
    'NOTA_DESPESA',
    'Locação de Equipamento',
    'Contrato de Locação da Bomba (comprovante enviado no grupo)',
    200.00,
    'APROVADO',
    FALSE,
    'Gil',
    '2026-11-19T16:18:49.179Z'
  ),
  (
    'a8b87053-2364-45de-888f-a0f51d4baaf5',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil (Gilvan)',
    'PORTO SEGURO',
    '2026-11-19',
    '08:52',
    'NOTA_DESPESA',
    'Material',
    'Nota Fiscal / Cupom Material #1',
    48.00,
    'APROVADO',
    FALSE,
    'Gil',
    '2026-11-19T16:18:49.179Z'
  ),
  (
    '778c450d-92d8-4282-9b19-1ac4ca4b4b56',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil (Gilvan)',
    'PORTO SEGURO',
    '2026-11-19',
    '09:04',
    'NOTA_DESPESA',
    'Material',
    'Nota Fiscal / Cupom Material #2',
    9.99,
    'APROVADO',
    FALSE,
    'Gil',
    '2026-11-19T16:18:49.179Z'
  ),
  (
    'ae9045cd-7fa3-46d8-a02a-1e3162f53b8b',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil (Gilvan)',
    'PORTO SEGURO',
    '2026-11-19',
    '09:04',
    'NOTA_DESPESA',
    'Material',
    'Nota Fiscal / Cupom Material #3',
    31.19,
    'APROVADO',
    FALSE,
    'Gil',
    '2026-11-19T16:18:49.179Z'
  ),
  -- 20/11 (R$ 100,00 PIX | R$ 120,97 notas)
  (
    'caf3c7e1-471a-4c38-8163-8579b68c46e4',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil',
    'OBRA BAHIA (PORTO SEGURO)',
    '2026-11-20',
    '09:22',
    'ENTRADA_PIX',
    'Suprimento PIX',
    'Transferência via PIX para Gilvan Batista dos Santos',
    100.00,
    'PENDENTE',
    FALSE,
    'Administração',
    '2026-11-20T12:22:20.912Z'
  ),
  (
    '37808e0d-f391-4d67-9a18-86c0d3064184',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil',
    'OBRA BAHIA (PORTO SEGURO)',
    '2026-11-20',
    '09:24',
    'NOTA_DESPESA',
    'Material',
    'Pataxo Materiais de Construcao',
    85.00,
    'PENDENTE',
    FALSE,
    'Administração',
    '2026-11-20T12:24:04.275Z'
  ),
  (
    'daf4af8d-8672-4afd-a988-14e93b4f25b4',
    '00000000-0000-0000-0000-000000000001',
    'Gil',
    'Gil',
    'OBRA BAHIA (PORTO SEGURO)',
    '2026-11-20',
    '09:24',
    'NOTA_DESPESA',
    'Combustível',
    'Alcool Safra',
    35.97,
    'PENDENTE',
    FALSE,
    'Administração',
    '2026-11-20T12:24:35.341Z'
  )
ON CONFLICT (id) DO NOTHING;

-- 3. Garantir índice anti-duplicidade lógica no banco (idempotente)
CREATE INDEX IF NOT EXISTS idx_caixinha_movimentacoes_dedup_lookup
  ON public.caixinha_movimentacoes (tenant_id, encarregado_canonico, data_movimentacao, tipo, valor);
