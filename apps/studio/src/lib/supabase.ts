import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chiaveAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !chiaveAnon) {
  throw new Error('Mancano VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY: copia .env.example in .env.local');
}

/**
 * Client unico dell'app. La chiave anon è pubblica: cosa si può leggere lo
 * decidono le policy RLS nel database in base al JWT dell'utente.
 */
export const supabase = createClient(url, chiaveAnon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
