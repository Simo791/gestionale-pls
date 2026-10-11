// Edge Function pubblica: il genitore apre i documenti dal link personale.
// Nessun accesso con password: link segreto (valido 30 giorni) + data di nascita del
// bambino come codice di verifica, con 5 tentativi. Il controllo e la registrazione
// del ritiro li fa il database (api.ritiro_documenti); qui si creano solo link di
// scaricamento validi 5 minuti per i PDF dello Storage privato.

import { createClient } from 'npm:@supabase/supabase-js@2';

const origine = (() => { try { return new URL(Deno.env.get('APP_URL') ?? '').origin; } catch { return '*'; } })();
const CORS = {
  'Access-Control-Allow-Origin': origine,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const risposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return risposta({ errore: 'Metodo non consentito' }, 405);

  const { token, codice } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return risposta({ ok: false, motivo: 'link_non_valido' });
  if (typeof codice !== 'string' || codice.length > 20) return risposta({ ok: false, motivo: 'codice_errato', tentativi_rimasti: undefined });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim().slice(0, 64) || null;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.schema('api').rpc('ritiro_documenti', { p_token: token, p_codice: codice, p_ip: ip });
  if (error) return risposta({ ok: false, motivo: 'errore' }, 500);
  const esito = data as { ok: boolean; motivo?: string; tentativi_rimasti?: number; descrizione?: string; scade_il?: string;
    documenti?: { nome: string; percorso: string }[] };
  if (!esito.ok) return risposta(esito);

  const documenti = [];
  for (const d of esito.documenti ?? []) {
    const { data: firmato, error: errUrl } = await admin.storage.from('documenti').createSignedUrl(d.percorso, 300, { download: d.nome });
    if (errUrl) console.error('Link di scaricamento non creato', d.percorso, errUrl.message);
    if (firmato?.signedUrl) documenti.push({ nome: d.nome, url: firmato.signedUrl });
  }
  if (documenti.length === 0) return risposta({ ok: false, motivo: 'non_disponibile' });
  return risposta({ ok: true, descrizione: esito.descrizione, scade_il: esito.scade_il, documenti });
});
