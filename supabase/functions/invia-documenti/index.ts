// Edge Function: invia al genitore il link per ritirare i documenti di una visita.
//
// Chiamata dall'app con il JWT del medico che ha preparato l'invio (verify_jwt attivo).
// Il messaggio NON contiene nomi né dati sanitari: solo il link personale e la scadenza.
// I PDF restano nello Storage privato; il genitore li apre dal link con la data di
// nascita del bambino (funzione «ritiro-documenti»).
//
// Secrets (Dashboard › Edge Functions › Secrets) — tutti facoltativi:
//   APP_URL                      indirizzo pubblico dell'app (es. https://studio.esempio.it)
//   RESEND_API_KEY, EMAIL_MITTENTE   invio automatico delle email (Resend)
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_DOCUMENTI
//                                invio automatico su WhatsApp (modello approvato da Meta)
// Senza credenziali la funzione risponde «manuale»: l'app apre l'email o WhatsApp
// dello studio con il testo già pronto, e lo studio lo invia.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const risposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const VERSIONE_GRAPH = 'v23.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return risposta({ errore: 'Metodo non consentito' }, 405);

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: chi, error: errUtente } = await admin.auth.getUser(jwt);
  if (errUtente || !chi.user) return risposta({ errore: 'Non autenticato' }, 401);

  const { id, token, origine } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return risposta({ errore: 'Richiesta non valida' }, 400);

  // Il database verifica che il token sia di questo invio e che lo chieda chi l'ha preparato.
  const { data: dati, error: errDati } = await admin.schema('api').rpc('dati_invio', { p_id: id, p_token: token, p_utente: chi.user.id });
  if (errDati) return risposta({ errore: 'Servizio non disponibile' }, 500);
  if (!dati) return risposta({ errore: 'Invio non trovato' }, 404);
  const invio = dati as { canale: 'email' | 'whatsapp'; destinatario: string; scade_il: string; nome_studio: string;
    integrazione: { attiva: boolean; impostazioni: Record<string, string> } | null };

  const appUrl = Deno.env.get('APP_URL');
  const base = (appUrl ?? (typeof origine === 'string' && /^https?:\/\//.test(origine) ? origine : '')).replace(/\/$/, '');
  const link = `${base}/#/ritiro/${token}`;
  const scadenza = new Date(invio.scade_il).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
  const nomeStudio = invio.nome_studio || 'Lo studio pediatrico';
  const testo = `${nomeStudio} le ha inviato dei documenti. Può scaricarli entro il ${scadenza} da questo link personale: ${link}\n`
    + `Per aprirli le verrà chiesta la data di nascita del bambino. Se non aspettava questo messaggio, lo ignori e avvisi lo studio.`;

  const esito = async (stato: string, errore: string | null = null) =>
    admin.schema('api').rpc('esito_invio', { p_id: id, p_stato: stato, p_errore: errore });

  try {
    const integ = invio.integrazione;
    const modalita = integ?.impostazioni?.modalita;
    // Invio automatico solo con l'indirizzo pubblico dell'app configurato (il link non dipende dal browser).
    if (!appUrl) return risposta({ modalita: 'manuale', testo, link });
    if (invio.canale === 'email') {
      const chiave = Deno.env.get('RESEND_API_KEY');
      const mittente = Deno.env.get('EMAIL_MITTENTE');
      if (!chiave || !mittente || !integ?.attiva || modalita !== 'automatica') return risposta({ modalita: 'manuale', testo, link });
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: mittente, to: [invio.destinatario], subject: `Documenti da ${nomeStudio}`, text: testo }),
      });
      if (!r.ok) throw new Error(`Email non inviata (${r.status})`);
    } else {
      const tokenWa = Deno.env.get('WHATSAPP_TOKEN');
      const numero = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
      const reale = integ?.attiva && modalita === 'reale';
      if (!tokenWa || !numero || !reale) return risposta({ modalita: 'manuale', testo, link });
      const r = await fetch(`https://graph.facebook.com/${VERSIONE_GRAPH}/${numero}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenWa}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: invio.destinatario.replace(/^\+/, ''), type: 'template',
          template: {
            name: Deno.env.get('WHATSAPP_TEMPLATE_DOCUMENTI') ?? 'documenti_disponibili', language: { code: 'it' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: nomeStudio }, { type: 'text', text: scadenza }, { type: 'text', text: link }] }],
          },
        }),
      });
      if (!r.ok) throw new Error(`WhatsApp non inviato (${r.status})`);
    }
    const { error: errEsito } = await esito('inviato');
    if (errEsito) console.error('Esito non registrato', errEsito.message);
    return risposta({ modalita: 'automatico' });
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e);
    await esito('errore', messaggio);
    return risposta({ errore: messaggio, modalita: 'manuale', testo, link }, 502);
  }
});
