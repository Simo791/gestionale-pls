import { useState, type ReactElement } from 'react';
import { documentoInPdf, nomeFile } from '../lib/pdf';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Errore } from './ui';

export interface DocumentoInviabile {
  id: string;
  titolo: string;
  /** Costruisce il documento (lo stesso della stampa). */
  crea: () => Promise<ReactElement>;
  /** Scelto in partenza (predefinito: sì). */
  preselezionato?: boolean;
}

export interface Destinatario {
  chiave: string;
  nome: string;
  ruolo: string;
  email: string | null;
  telefono: string | null;
  tutoreId?: string | null;
  /** Consenso «invio documenti» registrato: true, false (negato/revocato) o null (non espresso). */
  consenso?: boolean | null;
}

type Canale = 'email' | 'whatsapp';
type Fase = { tipo: 'scelta' } | { tipo: 'lavoro'; testo: string } | { tipo: 'manuale'; id: string; testo: string; link: string; canale: Canale; destinatario: string }
  | { tipo: 'fatto'; testo: string };

const stileInput = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';

/** Testo del messaggio: nessun nome, nessun dato sanitario; solo link e scadenza. */
function testoMessaggio(nomeStudio: string, link: string, scade: string) {
  const data = new Date(scade).toLocaleDateString('it-IT');
  return `${nomeStudio} le ha inviato dei documenti. Può scaricarli entro il ${data} da questo link personale: ${link}\n`
    + 'Per aprirli le verrà chiesta la data di nascita del bambino. Se non aspettava questo messaggio, lo ignori e avvisi lo studio.';
}

/**
 * Invio dei documenti di una visita al genitore, via email o WhatsApp.
 * I PDF vanno nello spazio privato dello studio; al genitore arriva un link personale
 * (30 giorni, revocabile) che chiede la data di nascita del bambino.
 * Se le credenziali di email/WhatsApp non sono configurate, si apre l'email o WhatsApp
 * dello studio con il messaggio già pronto.
 */
export default function InviaDocumenti({ documenti, destinatari, pazienteId, allergoPazienteId, studioId, nomeStudio, descrizione, onChiudi }: {
  documenti: DocumentoInviabile[];
  destinatari: Destinatario[];
  pazienteId?: string;
  allergoPazienteId?: string;
  studioId: string;
  nomeStudio?: string;
  descrizione: string;
  onChiudi: () => void;
}) {
  const [scelti, setScelti] = useState<Set<string>>(() => new Set(documenti.filter((d) => d.preselezionato !== false).map((d) => d.id)));
  const [canale, setCanale] = useState<Canale>('email');
  const [chi, setChi] = useState<string>(destinatari.find((d) => d.consenso !== false && (d.email || d.telefono))?.chiave ?? 'nuovo');
  const [nuovo, setNuovo] = useState({ nome: '', recapito: '' });
  const [conferma, setConferma] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fase, setFase] = useState<Fase>({ tipo: 'scelta' });

  const scelto = destinatari.find((d) => d.chiave === chi) ?? null;
  const recapito = scelto ? (canale === 'email' ? scelto.email : scelto.telefono) ?? '' : nuovo.recapito.trim();
  const studio = nomeStudio || 'Lo studio pediatrico';

  async function invia() {
    setErrore(null);
    const elenco = documenti.filter((d) => scelti.has(d.id));
    if (elenco.length === 0) return setErrore('Scegli almeno un documento.');
    if (!recapito) return setErrore(canale === 'email' ? 'Manca l\'indirizzo email.' : 'Manca il numero di telefono.');
    if (scelto?.consenso === false) return setErrore('Questo genitore ha negato o revocato il consenso all\'invio dei documenti.');
    if (!conferma) return setErrore('Conferma che il genitore ha chiesto o accettato di ricevere i documenti su questo recapito.');
    try {
      setFase({ tipo: 'lavoro', testo: 'Preparazione dell\'invio…' });
      const { data, error } = await supabase.schema('api').rpc('prepara_invio', {
        p_paziente_id: pazienteId ?? null, p_allergo_paziente_id: allergoPazienteId ?? null, p_tutore_id: scelto?.tutoreId ?? null,
        p_canale: canale, p_destinatario: recapito, p_destinatario_nome: scelto?.nome ?? nuovo.nome, p_descrizione: descrizione, p_conferma: true,
      });
      if (error) throw new Error(error.message);
      const { id, token, scade_il } = (data as { id: string; token: string; scade_il: string }[])[0]!;

      const caricati: { nome: string; percorso: string }[] = [];
      for (const [i, d] of elenco.entries()) {
        setFase({ tipo: 'lavoro', testo: `Creazione del PDF ${i + 1} di ${elenco.length}: ${d.titolo}…` });
        const pdf = await documentoInPdf(await d.crea());
        const percorso = `${studioId}/${id}/${i + 1}.pdf`;
        const up = await supabase.storage.from('documenti').upload(percorso, pdf, { contentType: 'application/pdf', upsert: false });
        if (up.error) throw new Error(`Caricamento non riuscito: ${up.error.message}`);
        caricati.push({ nome: nomeFile(d.titolo), percorso });
      }
      const c = await supabase.schema('api').rpc('completa_invio', { p_id: id, p_documenti: caricati });
      if (c.error) throw new Error(c.error.message);

      setFase({ tipo: 'lavoro', testo: 'Invio del messaggio…' });
      const link = `${window.location.origin}${window.location.pathname}#/ritiro/${token}`;
      const r = await supabase.functions.invoke('invia-documenti', { body: { id, token, origine: `${window.location.origin}${window.location.pathname}` } });
      // Con una risposta di errore il corpo sta in error.context (non in data).
      let esito = r.data as { modalita?: string; testo?: string; link?: string; errore?: string } | null;
      if (r.error) {
        try { esito = await (r.error as { context?: Response }).context?.json() ?? null; } catch { esito = null; }
        if (esito?.errore) setErrore(`Invio automatico non riuscito (${esito.errore}): invialo tu con il testo qui sotto.`);
      }
      if (!r.error && esito?.modalita === 'automatico') {
        return setFase({ tipo: 'fatto', testo: `Inviato a ${recapito}. Il link scade il ${new Date(scade_il).toLocaleDateString('it-IT')}.` });
      }
      // Credenziali non configurate (o servizio non raggiungibile): invio dallo studio, testo già pronto.
      setFase({ tipo: 'manuale', id, canale, destinatario: recapito, link: esito?.link ?? link, testo: esito?.testo ?? testoMessaggio(studio, link, scade_il) });
    } catch (e) {
      setFase({ tipo: 'scelta' });
      setErrore(e instanceof Error ? e.message : String(e));
    }
  }

  async function segnaInviato(id: string) {
    const { error } = await supabase.schema('api').rpc('esito_invio', { p_id: id, p_stato: 'consegnato_manualmente' });
    if (error) return setErrore(error.message);
    setFase({ tipo: 'fatto', testo: 'Invio registrato. Puoi vederlo (e revocare il link) in Amministrazione › Invii di documenti.' });
  }

  if (fase.tipo === 'lavoro') return <p className="py-6 text-center text-sm text-slate-600" role="status">{fase.testo}</p>;
  if (fase.tipo === 'fatto') {
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{fase.testo}</p>
        <Bottone onClick={onChiudi}>Chiudi</Bottone>
      </div>
    );
  }
  if (fase.tipo === 'manuale') {
    const numero = fase.destinatario.replace(/\D/g, '');
    const href = fase.canale === 'email'
      ? `mailto:${encodeURIComponent(fase.destinatario)}?subject=${encodeURIComponent(`Documenti da ${studio}`)}&body=${encodeURIComponent(fase.testo)}`
      : `https://wa.me/${numero}?text=${encodeURIComponent(fase.testo)}`;
    return (
      <div className="space-y-3 text-sm">
        {errore && <Errore messaggio={errore} />}
        <p className="text-slate-700">I documenti sono pronti. Invia tu il messaggio con {fase.canale === 'email' ? 'la tua email' : 'WhatsApp'} (l'invio automatico si attiva in Amministrazione › Integrazioni).</p>
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-slate-800">{fase.testo}</pre>
        <div className="flex flex-wrap gap-2">
          <a href={href} target="_blank" rel="noreferrer" className="rounded-lg bg-teal-700 px-3 py-1.5 font-medium text-white hover:bg-teal-800">
            {fase.canale === 'email' ? 'Apri l\'email' : 'Apri WhatsApp'}
          </a>
          <Bottone onClick={() => void navigator.clipboard?.writeText(fase.testo)}>Copia il testo</Bottone>
          <Bottone variante="primario" onClick={() => void segnaInviato(fase.id)}>Ho inviato il messaggio</Bottone>
        </div>
        <p className="text-xs text-slate-500">Il link funziona già: se non invii il messaggio, puoi revocarlo da Amministrazione › Invii di documenti.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      {errore && <Errore messaggio={errore} />}
      <fieldset>
        <legend className="mb-1 font-medium text-slate-800">Documenti della visita</legend>
        {documenti.length === 0 ? <p className="text-slate-500">Nessun documento per questa visita.</p> : documenti.map((d) => (
          <label key={d.id} className="flex items-center gap-2 py-0.5">
            <input type="checkbox" checked={scelti.has(d.id)}
                   onChange={(e) => { const s = new Set(scelti); if (e.target.checked) s.add(d.id); else s.delete(d.id); setScelti(s); }} />
            {d.titolo}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-1 font-medium text-slate-800">Come</legend>
        <div className="flex gap-2">
          {(['email', 'whatsapp'] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCanale(c)} aria-pressed={canale === c}
                    className={`rounded-lg border px-3 py-1.5 font-medium ${canale === c ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
              {c === 'email' ? 'Email' : 'WhatsApp'}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 font-medium text-slate-800">A chi</legend>
        <div className="space-y-1">
          {destinatari.map((d) => {
            const r = canale === 'email' ? d.email : d.telefono;
            const bloccato = !r || d.consenso === false;
            return (
              <label key={d.chiave} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${chi === d.chiave ? 'border-teal-600 bg-teal-50' : 'border-slate-200'} ${bloccato ? 'opacity-60' : ''}`}>
                <input type="radio" name="destinatario" checked={chi === d.chiave} disabled={bloccato} onChange={() => setChi(d.chiave)} />
                <span className="font-medium text-slate-900">{d.nome}</span>
                <span className="text-slate-500">{d.ruolo} · {r ?? (canale === 'email' ? 'nessuna email in anagrafica' : 'nessun telefono in anagrafica')}</span>
                {d.consenso === true && <Badge tono="ok">Consenso all'invio</Badge>}
                {d.consenso === false && <Badge tono="errore">Ha negato l'invio</Badge>}
              </label>
            );
          })}
          <label className={`block rounded-lg border px-3 py-2 ${chi === 'nuovo' ? 'border-teal-600 bg-teal-50' : 'border-slate-200'}`}>
            <span className="flex items-center gap-2"><input type="radio" name="destinatario" checked={chi === 'nuovo'} onChange={() => setChi('nuovo')} />
              <span className="font-medium text-slate-900">{canale === 'email' ? 'Altro indirizzo email' : 'Altro numero WhatsApp'}</span></span>
            {chi === 'nuovo' && (
              <span className="mt-2 grid gap-2 sm:grid-cols-2">
                <input value={nuovo.nome} maxLength={120} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} placeholder="Nome e cognome" className={stileInput} aria-label="Nome del destinatario" />
                <input value={nuovo.recapito} maxLength={254} onChange={(e) => setNuovo({ ...nuovo, recapito: e.target.value })}
                       placeholder={canale === 'email' ? 'nome@esempio.it' : '+39 333 1234567'} inputMode={canale === 'email' ? 'email' : 'tel'}
                       className={stileInput} aria-label={canale === 'email' ? 'Email' : 'Numero di telefono'} />
              </span>
            )}
          </label>
        </div>
      </fieldset>

      <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-amber-900">
        <input type="checkbox" checked={conferma} onChange={(e) => setConferma(e.target.checked)} className="mt-0.5" />
        <span>Il genitore ha chiesto o accettato di ricevere i documenti su questo recapito, che appartiene a lui
          (o a chi lui ha indicato). La conferma resta nel registro.</span>
      </label>

      <p className="text-xs text-slate-500">
        Il messaggio contiene solo un link personale (valido 30 giorni, revocabile), senza nomi né dati sanitari.
        Per aprire i documenti viene chiesta la data di nascita del bambino; ogni apertura è registrata.
      </p>
      <div className="flex gap-2">
        <Bottone variante="primario" onClick={() => void invia()}>Invia {scelti.size} {scelti.size === 1 ? 'documento' : 'documenti'}</Bottone>
        <Bottone onClick={onChiudi}>Annulla</Bottone>
      </div>
    </div>
  );
}
