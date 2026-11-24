-- ============================================================================
-- MIGRATION V27: Persistência Contínua da Sessão WhatsApp (Baileys) no Supabase
-- Permite hibernação inteligente no Render sem perda de credenciais/chaves.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.baileys_session_state (
  session_id TEXT NOT NULL DEFAULT 'default',
  key_name TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, key_name)
);

CREATE INDEX IF NOT EXISTS idx_baileys_session_state_updated
  ON public.baileys_session_state (session_id, updated_at DESC);

ALTER TABLE public.baileys_session_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baileys_session_service_role_only" ON public.baileys_session_state;
CREATE POLICY "baileys_session_service_role_only"
  ON public.baileys_session_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.baileys_session_state FROM anon, authenticated;
GRANT ALL ON public.baileys_session_state TO service_role;
