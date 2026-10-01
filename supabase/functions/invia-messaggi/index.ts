// Edge Function: invia i messaggi WhatsApp in coda (conferme e promemoria).
// La chiama ogni 5 minuti un job pianificato (vedi docs/whatsapp.md).
//
// Variabili d'ambiente (Dashboard → Edge Functions → Secrets):
//   INVIO_SEGRETO            segreto condiviso con il job pianificato (obbligatorio)
//   WHATSAPP_TOKEN           token di accesso di WhatsApp Cloud API (facoltativo)
//   WHATSAPP_PHONE_NUMBER_ID id del numero mittente (facoltativo)
// Senza WHATSAPP_TOKEN la funzione lavora in SIMULAZIONE: non invia nulla, registra
// i messaggi come "simulato" e ne scrive il contenuto nei log. Utile per la demo.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono forniti automaticamente da Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corpoTemplate, numeroWhatsApp, type MessaggioDovuto } from '../_shared/messaggi.ts';

const VERSIONE_GRAPH = 'v23.0';

Deno.serve(async (req) => {
  const segreto = Deno.env.get('INVIO_SEGRETO');
  if (!segreto || req.headers.get('Authorization') !== `Bearer ${segreto}`) {
    return new Response('Non autorizzato', { status: 401 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  }).schema('api');

  const token = Deno.env.get('WHATSAPP_TOKEN');
  const numeroMittente = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const simulazione = !token || !numeroMittente;

  const { data, error } = await db.rpc('invio_messaggi_dovuti', { p_limite: 50 });
  if (error) return new Response(`Errore lettura coda: ${error.message}`, { status: 500 });

  const esiti = { inviati: 0, simulati: 0, errori: 0 };
  for (const m of (data ?? []) as MessaggioDovuto[]) {
    const destinatario = numeroWhatsApp(m.telefono);
    if (!destinatario) {
      await db.rpc('invio_esito_messaggio', { p_id: m.id, p_stato: 'errore', p_id_messaggio: null, p_errore: 'Numero di telefono non valido' });
      esiti.errori++;
      continue;
    }
    const corpo = corpoTemplate(m, destinatario);

    if (simulazione) {
      console.log('[SIMULAZIONE] messaggio', m.id, JSON.stringify(corpo.template));
      await db.rpc('invio_esito_messaggio', { p_id: m.id, p_stato: 'simulato', p_id_messaggio: null, p_errore: null });
      esiti.simulati++;
      continue;
    }

    try {
      const risposta = await fetch(`https://graph.facebook.com/${VERSIONE_GRAPH}/${numeroMittente}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const json = await risposta.json();
      if (!risposta.ok) throw new Error(json?.error?.message ?? `HTTP ${risposta.status}`);
      await db.rpc('invio_esito_messaggio', {
        p_id: m.id, p_stato: 'inviato', p_id_messaggio: json?.messages?.[0]?.id ?? null, p_errore: null,
      });
      esiti.inviati++;
    } catch (e) {
      await db.rpc('invio_esito_messaggio', {
        p_id: m.id, p_stato: 'errore', p_id_messaggio: null, p_errore: e instanceof Error ? e.message : String(e),
      });
      esiti.errori++;
    }
  }

  return Response.json({ simulazione, ...esiti });
});
