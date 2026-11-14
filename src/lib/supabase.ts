import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lzkwouvczhpcrudqkixs.supabase.co';
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_KJs-1GHZuWKt0aPHOH4oaA_0AkcZc2i';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || supabasePublishableKey;

// Cliente público para o frontend / anon
export const supabase = createClient(supabaseUrl, supabasePublishableKey);

// Cliente administrativo seguro para rotas do servidor (bypass de RLS quando necessário no backend)
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
