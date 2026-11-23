-- ==============================================================================
-- MIGRATION V26: Aprendizado de Pedidos Exclusivos de Vale por Remetente (Gil)
-- Registra regras estruturais ("N vale por favor" + "<nome> <valor> reais") e
-- aliases ("José baiano" -> "Zé Baiano", "Lucas. J." -> "Lucas J.") isolados
-- estritamente ao tenant Jhoston, sem gerar diárias indevidas.
-- Execução 100% idempotente.
-- ==============================================================================

-- 1. Atualiza ou cria perfil do remetente Gil no tenant Jhoston com hábitos de lista exclusiva de vales
INSERT INTO public.sender_profiles (
  tenant_id,
  remetente_telefone,
  remetente_nome,
  obra_padrao_sugerida,
  habitos_escrita,
  total_mensagens_validadas,
  ultimo_envio_em
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '5524993212989',
  'Gil',
  'PISCINA PORTO SEGURO',
  '{
    "usaPontoFinalCabecalho": true,
    "usaLinhasEmBranco": true,
    "usaIniciaisComPonto": true,
    "enviaListaExclusivaVales": true,
    "usaValorExplicitoLinhaVale": true,
    "expressoesRecorrentes": ["Bom dia Patrícia 6 vale por favor."]
  }'::jsonb,
  1,
  NOW()
)
ON CONFLICT (tenant_id, remetente_telefone) DO UPDATE
SET
  remetente_nome = 'Gil',
  habitos_escrita = COALESCE(public.sender_profiles.habitos_escrita, '{}'::jsonb) || '{
    "enviaListaExclusivaVales": true,
    "usaValorExplicitoLinhaVale": true
  }'::jsonb,
  updated_at = NOW();

-- 2. Regras estruturais, expressão recorrente e aliases aprendidos para o Gil (Jhoston)
INSERT INTO public.parser_learning_rules (
  tenant_id,
  remetente_telefone,
  remetente_nome,
  tipo_regra,
  origem_padrao,
  destino_canonico,
  origem_aprendizado,
  confianca,
  ocorrencias,
  exemplo_mensagem,
  ativo,
  criado_por
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '5524993212989',
    'Gil',
    'ASSINATURA_ESTRUTURAL',
    'CABECALHO_VALE_POR_FAVOR+LISTA_VERTICAL+VALOR_POR_LINHA',
    'SOMENTE_VALES (0 diárias • valor explícito "<nome> <valor> reais" por linha + fallback R$ 100,00)',
    'AUTO_PASSAGEM_2',
    1.00,
    1,
    E'Bom dia Patrícia 6 vale por favor.\nMateus\nIan\nPeu\nLucas. J.\nJosé baiano 50 reais.\nGil',
    TRUE,
    'Auto-Aprendizado Vales Exclusivos'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '5524993212989',
    'Gil',
    'EXPRESSAO_RECORRENTE',
    'N vale por favor',
    'PEDIDO_EXCLUSIVO_VALES (apontamentos: [], valor por linha ou padrão R$ 100,00)',
    'AUTO_PASSAGEM_2',
    1.00,
    1,
    'Bom dia Patrícia 6 vale por favor.',
    TRUE,
    'Auto-Aprendizado Vales Exclusivos'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '5524993212989',
    'Gil',
    'ALIAS_TRABALHADOR',
    'José baiano',
    'Zé Baiano',
    'AUTO_PASSAGEM_2',
    1.00,
    1,
    'José baiano 50 reais.',
    TRUE,
    'Auto-Aprendizado Vales Exclusivos'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '5524993212989',
    'Gil',
    'ALIAS_TRABALHADOR',
    'Lucas. J.',
    'Lucas J.',
    'AUTO_PASSAGEM_2',
    1.00,
    1,
    'Lucas. J.',
    TRUE,
    'Auto-Aprendizado Vales Exclusivos'
  )
ON CONFLICT DO NOTHING;
