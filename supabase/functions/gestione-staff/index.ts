// Edge Function: l'amministratore dello studio aggiunge un membro dello staff
// (segreteria o sostituto). Serve la service role per creare l'utente in Auth,
// quindi l'operazione non può stare nel frontend.
//
// Sicurezza: la richiesta deve arrivare con il JWT dell'utente (verify_jwt attivo);
// la funzione rilegge il token e accetta solo app_ruolo = pediatra con app_admin = true.
// Il nuovo utente accede poi con il codice via email e configura il secondo fattore.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const risposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function leggiClaims(jwt: string): Record<string, unknown> | null {
  try {
    const p = jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(p.padEnd(Math.ceil(p.length / 4) * 4, '=')));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return risposta({ errore: 'Metodo non consentito' }, 405);

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Verifica il token con Auth (firma e scadenza), poi legge i claim applicativi.
  const { data: chi, error: errUtente } = await admin.auth.getUser(jwt);
  const claims = leggiClaims(jwt);
  if (errUtente || !chi.user || !claims) return risposta({ errore: 'Non autenticato' }, 401);
  if (claims.app_ruolo !== 'pediatra' || claims.app_admin !== true || !claims.app_studio_id) {
    return risposta({ errore: 'Solo l\'amministratore dello studio può aggiungere membri' }, 403);
  }
  if (claims.aal !== 'aal2') return risposta({ errore: 'Serve il secondo fattore di autenticazione' }, 403);

  const { email, nome, cognome, ruolo } = await req.json().catch(() => ({}));
  const em = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return risposta({ errore: 'Email non valida' }, 400);
  if (!['segreteria', 'sostituto'].includes(ruolo)) return risposta({ errore: 'Ruolo non valido' }, 400);
  if (!String(nome ?? '').trim() || !String(cognome ?? '').trim()) return risposta({ errore: 'Nome e cognome obbligatori' }, 400);

  // Crea l'utente (email già confermata: l'accesso avviene comunque solo con il codice inviato a quella casella).
  let utenteId: string | undefined;
  const creato = await admin.auth.admin.createUser({ email: em, email_confirm: true });
  if (creato.error) {
    // Utente già esistente: lo cerchiamo (prime pagine sono sufficienti per uno studio).
    const { data: elenco } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    utenteId = elenco?.users.find((u) => u.email?.toLowerCase() === em)?.id;
    if (!utenteId) return risposta({ errore: `Creazione utente non riuscita: ${creato.error.message}` }, 400);
  } else {
    utenteId = creato.data.user.id;
  }

  const db = admin.schema('anagrafica');
  const { data: esistente } = await db.from('membri_studio').select('studio_id, ruolo').eq('utente_id', utenteId).maybeSingle();
  if (esistente && esistente.studio_id !== claims.app_studio_id) {
    return risposta({ errore: 'Questa email appartiene a un altro studio' }, 409);
  }
  if (esistente && esistente.ruolo === 'pediatra') return risposta({ errore: 'Questa email è di un pediatra titolare' }, 409);
  const { data: tutore } = await db.from('tutori').select('id').eq('utente_id', utenteId).maybeSingle();
  if (tutore) return risposta({ errore: 'Questa email è già usata da un genitore: usa un\'email diversa per lo staff' }, 409);

  const { error } = await db.from('membri_studio').upsert({
    utente_id: utenteId, studio_id: claims.app_studio_id, ruolo, attivo: true,
    nome: String(nome).trim(), cognome: String(cognome).trim(), email: em, aggiornato_il: new Date().toISOString(),
  });
  if (error) return risposta({ errore: error.message }, 400);

  await admin.schema('api').rpc('registra_evento_staff', {
    p_autore: chi.user.id, p_utente: utenteId, p_studio: claims.app_studio_id, p_ruolo: ruolo,
  });
  return risposta({ utente_id: utenteId });
});
