import { useEffect, useState } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtDataOra } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Caricamento, Errore, type Tono } from './ui';

type Tipo = 'whatsapp' | 'google_calendar' | 'email';
interface Integrazione {
  tipo: Tipo; attiva: boolean; stato: 'da_configurare' | 'configurata' | 'attiva' | 'sospesa' | 'errore';
  impostazioni: Record<string, string>; ultimo_errore: string | null; aggiornato_il: string;
}

const STATO: Record<Integrazione['stato'], { testo: string; tono: Tono }> = {
  da_configurare: { testo: 'Da configurare', tono: 'neutro' },
  configurata: { testo: 'Impostata, in attesa delle credenziali', tono: 'info' },
  attiva: { testo: 'Attiva', tono: 'ok' },
  sospesa: { testo: 'Sospesa', tono: 'attenzione' },
  errore: { testo: 'Errore', tono: 'errore' },
};

const stileInput = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';

interface Definizione {
  tipo: Tipo; titolo: string; descrizione: string;
  campi: { chiave: string; etichetta: string; aiuto?: string; opzioni?: [string, string][] }[];
  passi: string[];
}

const DEFINIZIONI: Definizione[] = [
  {
    tipo: 'email', titolo: 'Email (invio dei documenti delle visite)',
    descrizione: 'Invia automaticamente al genitore il link personale ai documenti della visita. Finché non è attiva, l\'app apre la tua email con il messaggio già pronto.',
    campi: [
      { chiave: 'indirizzo_mittente', etichetta: 'Indirizzo mittente', aiuto: 'Es. documenti@studiopediatrico.it (dominio verificato)' },
      { chiave: 'nome_mittente', etichetta: 'Nome visualizzato', aiuto: 'Es. Studio pediatrico Dott.ssa Rossi' },
      { chiave: 'modalita', etichetta: 'Modalità', opzioni: [['manuale', 'Manuale (si apre la tua email)'], ['automatica', 'Automatica']] },
    ],
    passi: [
      'Crea un account su un servizio di invio email con server in UE e contratto per il trattamento dei dati (es. Resend, Brevo).',
      'Verifica il dominio dello studio (record DNS SPF e DKIM) per non finire nello spam.',
      'In Supabase › Edge Functions › Secrets inserisci RESEND_API_KEY, EMAIL_MITTENTE (es. «Studio <documenti@dominio.it>») e APP_URL (indirizzo dell\'app).',
      'Distribuisci le funzioni «invia-documenti» e «ritiro-documenti».',
      'Aggiorna il registro dei trattamenti con il nuovo fornitore.',
    ],
  },
  {
    tipo: 'whatsapp', titolo: 'WhatsApp Business (promemoria e documenti)',
    descrizione: 'Conferme e promemoria ai genitori che hanno dato il consenso «WhatsApp» e link ai documenti delle visite. Il testo non contiene mai il nome del bambino o dati sanitari. Finché non è attiva, l\'app apre WhatsApp con il messaggio già pronto.',
    campi: [
      { chiave: 'numero_mittente', etichetta: 'Numero mittente (come appare ai genitori)', aiuto: 'Es. +39 0961 000000' },
      { chiave: 'nome_mittente', etichetta: 'Nome visualizzato', aiuto: 'Es. Studio pediatrico Dott.ssa Rossi' },
      { chiave: 'modalita', etichetta: 'Modalità', opzioni: [['simulazione', 'Simulazione (non invia, registra soltanto)'], ['reale', 'Invio reale']] },
    ],
    passi: [
      'Crea l’account WhatsApp Business Platform (Meta) dello studio e registra il numero.',
      'Fai approvare i modelli di messaggio «conferma», «promemoria» e «documenti_disponibili» (lingua italiano; per i documenti 3 variabili: studio, scadenza, link).',
      'In Supabase › Edge Functions › Secrets inserisci WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID e APP_URL (mai qui).',
      'Pianifica la funzione «invia-messaggi» ogni 5 minuti (vedi docs/whatsapp.md) e passa la modalità a «Invio reale».',
      'Firma con Meta l’accordo sul trattamento dei dati (DPA) e aggiorna il registro dei trattamenti.',
    ],
  },
  {
    tipo: 'google_calendar', titolo: 'Google Calendar (agenda dello studio)',
    descrizione: 'Copia gli appuntamenti sul calendario Google dello studio in forma anonima: titolo generico e orario, senza nome del bambino né motivo. Il collegamento tra appuntamento ed evento resta solo nel gestionale.',
    campi: [
      { chiave: 'calendario', etichetta: 'Calendario di destinazione', aiuto: 'Es. Agenda studio (un calendario dedicato, non quello personale)' },
      { chiave: 'titolo_evento', etichetta: 'Titolo degli eventi', aiuto: 'Es. Appuntamento (senza nomi)' },
      { chiave: 'direzione', etichetta: 'Sincronizzazione', opzioni: [['verso_google', 'Dal gestionale a Google (consigliata)'], ['occupato_da_google', 'Anche gli impegni Google come «occupato»']] },
    ],
    passi: [
      'Crea in Google Workspace un calendario dedicato all’agenda dello studio.',
      'Crea in Google Cloud un service account con accesso solo a quel calendario (API Google Calendar).',
      'Inserisci la chiave del service account nei Secrets delle Edge Functions di Supabase (mai qui).',
      'Attiva la funzione di sincronizzazione (da sviluppare): userà la tabella di mappa appuntamento ↔ evento già pronta.',
      'Verifica con Google il contratto per il trattamento dei dati (Workspace DPA) e aggiorna il registro dei trattamenti.',
    ],
  },
];

/** Percorso delle integrazioni: impostazioni non segrete qui, credenziali solo nei Secrets di Supabase. */
export default function Integrazioni() {
  const dati = useDati(() => q<Integrazione[]>(supabase.schema('anagrafica').from('integrazioni').select('*')), []);
  if (dati.errore) return <Errore messaggio={dati.errore} />;
  if (dati.caricamento) return <Caricamento />;
  return (
    <div className="space-y-4">
      {DEFINIZIONI.map((d) => <Scheda key={d.tipo} d={d} attuale={dati.dati?.find((x) => x.tipo === d.tipo) ?? null} onSalvata={dati.ricarica} />)}
      <p className="text-xs text-slate-500">
        Nessun token o chiave si salva nel database o nel browser: il database rifiuta impostazioni con nomi diversi da quelli previsti.
        Le credenziali vanno solo nei Secrets delle Edge Functions di Supabase, che le usano lato server.
      </p>
    </div>
  );
}

function Scheda({ d, attuale, onSalvata }: { d: Definizione; attuale: Integrazione | null; onSalvata: () => void }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [attiva, setAttiva] = useState(false);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  useEffect(() => { setV(attuale?.impostazioni ?? {}); setAttiva(attuale?.attiva ?? false); }, [attuale]);
  const stato = STATO[attuale?.stato ?? 'da_configurare'];

  async function salva() {
    setEsito(null);
    const impostazioni = Object.fromEntries(Object.entries(v).filter(([, x]) => x.trim() !== '').map(([k, x]) => [k, x.trim()]));
    const { error } = await supabase.schema('api').rpc('imposta_integrazione', { p_tipo: d.tipo, p_attiva: attiva, p_impostazioni: impostazioni });
    if (error) return setEsito({ ok: false, testo: error.message });
    setEsito({ ok: true, testo: 'Impostazioni salvate.' });
    onSalvata();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-semibold text-slate-900">{d.titolo}</h3><p className="text-slate-600">{d.descrizione}</p></div>
        <Badge tono={stato.tono}>{stato.testo}</Badge>
      </div>
      {esito && <p role="status" className={`mt-2 rounded-lg p-2 ${esito.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{esito.testo}</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {d.campi.map((c) => (
          <label key={c.chiave}><span className="block text-slate-500">{c.etichetta}</span>
            {c.opzioni ? (
              <select value={v[c.chiave] ?? ''} onChange={(e) => setV({ ...v, [c.chiave]: e.target.value })} className={stileInput}>
                <option value="">—</option>
                {c.opzioni.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            ) : <input value={v[c.chiave] ?? ''} onChange={(e) => setV({ ...v, [c.chiave]: e.target.value })} className={stileInput} />}
            {c.aiuto && <span className="text-xs text-slate-400">{c.aiuto}</span>}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2"><input type="checkbox" checked={attiva} onChange={(e) => setAttiva(e.target.checked)} /> Integrazione abilitata</label>
        <Bottone variante="primario" onClick={() => void salva()}>Salva</Bottone>
        {attuale && <span className="text-xs text-slate-500">Ultima modifica {fmtDataOra(attuale.aggiornato_il)}</span>}
        {attuale?.ultimo_errore && <span className="text-xs text-rose-700">Ultimo errore: {attuale.ultimo_errore}</span>}
      </div>
      <details className="mt-3 rounded-lg bg-slate-50 p-3">
        <summary className="cursor-pointer font-medium text-slate-700">Cosa serve per attivarla</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">{d.passi.map((p) => <li key={p}>{p}</li>)}</ol>
      </details>
    </section>
  );
}
