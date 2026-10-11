import { etaEstesa, type AuxoPaziente, type ClaimsApp } from '@pls/shared';
import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { GestioneModelli, ImpostazioniRefertoForm, type ConfigReferto } from '../componenti/allergo/Modelli';
import { COLONNE_PAZIENTE_AUXO, PROFILI_AUXO } from '../componenti/auxo/definizioni';
import Finestra from '../componenti/Finestra';
import { Badge, Bottone, Caricamento, Errore, Pannello, Vuoto } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

interface Promemoria { paziente_id: string; tipo: 'controllo' | 'piano_terapeutico'; data: string; dettaglio: string | null }

export const CONFIG_AUXO: ConfigReferto = {
  tabellaModelli: 'auxo_modelli', tabellaImpostazioni: 'auxo_impostazioni', profili: PROFILI_AUXO, profiloIniziale: 'generale',
  intestazione: 'Ambulatorio di Auxologia ed Endocrinologia pediatrica', qualifica: 'Pediatra auxologo',
  chiusura: 'Per eventuali necessità e/o informazioni contattare l\'ambulatorio all\'indirizzo email: {{email}}.',
  segnaposto: '{{nome}} {{peso}} {{prossimo_controllo}}',
  nota: 'I modelli predefiniti sono testi di partenza da adattare al singolo bambino; non contengono dosi. «Personalizza» crea la versione dello studio, che da quel momento sostituisce il predefinito nelle visite.',
};

const stile = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';

/** Nuovo paziente auxologico: anagrafica propria, non collegata agli assistiti del pediatra. */
function NuovoPaziente({ onCreato }: { onCreato: (id: string) => void }) {
  const [f, setF] = useState({ nome: '', cognome: '', cf: '', nascita: '', sesso: '', luogo: '', residenza: '', genitore: '', telefono: '', email: '', curante: '', inviato: '' });
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const campo = (k: keyof typeof f, etichetta: string, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="text-sm"><span className="block text-slate-500">{etichetta}</span>
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: k === 'cf' ? e.target.value.toUpperCase() : e.target.value })} className={stile} {...extra} /></label>
  );

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInvio(true);
    const { data, error } = await supabase.schema('api').rpc('auxo_registra_paziente', {
      p_nome: f.nome, p_cognome: f.cognome, p_codice_fiscale: f.cf, p_data_nascita: f.nascita, p_sesso: f.sesso,
      p_genitore_nome: f.genitore, p_genitore_telefono: f.telefono, p_genitore_email: f.email, p_pediatra_curante: f.curante, p_inviato_da: f.inviato, p_luogo_nascita: f.luogo, p_residenza: f.residenza,
    });
    setInvio(false);
    if (error) return setErrore(error.message);
    onCreato(data as string);
  }

  return (
    <form onSubmit={(e) => void salva(e)} className="grid gap-3 md:grid-cols-2">
      {errore && <div className="md:col-span-2"><Errore messaggio={errore} /></div>}
      {campo('nome', 'Nome *', { required: true })}
      {campo('cognome', 'Cognome *', { required: true })}
      {campo('cf', 'Codice fiscale *', { required: true, pattern: '[A-Z0-9]{16}', maxLength: 16, title: '16 caratteri' })}
      {campo('nascita', 'Data di nascita *', { required: true, type: 'date', max: oggiIso() })}
      <label className="text-sm"><span className="block text-slate-500">Sesso *</span>
        <select required value={f.sesso} onChange={(e) => setF({ ...f, sesso: e.target.value })} className={stile}><option value="">— scegli —</option><option value="F">Femmina</option><option value="M">Maschio</option></select></label>
      {campo('luogo', 'Luogo di nascita')}
      {campo('residenza', 'Residenza (comune, indirizzo)')}
      {campo('genitore', 'Genitore / tutore (nome e cognome)')}
      {campo('telefono', 'Telefono del genitore', { type: 'tel' })}
      {campo('email', 'Email del genitore', { type: 'email' })}
      {campo('curante', 'Pediatra curante')}
      {campo('inviato', 'Inviato da')}
      <p className="text-xs text-slate-500 md:col-span-2">
        Il paziente viene registrato solo nel modulo Auxologia: non compare tra gli assistiti del pediatra e i suoi dati clinici
        sono conservati con pseudonimo. Il codice fiscale è cifrato. Data di nascita e sesso non si possono modificare dopo (da essi dipendono età e DS): controllali. Raccogli l'informativa e il consenso al trattamento prima della visita.
      </p>
      <div className="md:col-span-2"><Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Registrazione…' : 'Registra e apri la cartella'}</Bottone></div>
    </form>
  );
}

/** Modulo spento (o utente non abilitato): l'amministratore lo attiva da qui. */
function ModuloNonAttivo({ admin }: { admin: boolean }) {
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  // Il token può essere vecchio (modulo attivato o abilitazione concessa nel frattempo): si rinnova una volta.
  useEffect(() => { void supabase.auth.refreshSession(); }, []);

  async function attiva() {
    setErrore(null);
    setInvio(true);
    const { error } = await supabase.schema('api').rpc('imposta_auxologia', { p_attiva: true });
    if (error) {
      setInvio(false);
      return setErrore(error.message.includes('imposta_auxologia')
        ? 'Il database non ha ancora il modulo: esegui «pnpm supabase db push» e riprova.'
        : error.message);
    }
    // Nuovo token con app_auxologia: il menu e la pagina si aggiornano da soli.
    const { error: e2 } = await supabase.auth.refreshSession();
    setInvio(false);
    if (e2) setErrore('Modulo attivato: esci e rientra per vederlo.');
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Auxologia</h1>
      <Pannello titolo="Modulo non attivo" sottotitolo="Ambulatorio di auxologia pediatrica (crescita, pubertà, ormone della crescita) con anagrafica pazienti separata">
        {errore && <div className="mb-3"><Errore messaggio={errore} /></div>}
        {admin ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Il modulo è spento per lo studio. Una volta attivo lo vedono solo gli amministratori e i medici che accetti
              (Amministrazione → Moduli specialistici). I pazienti si registrano qui da zero: non sono collegati agli assistiti.
            </p>
            <Bottone variante="primario" onClick={() => void attiva()} disabled={invio}>{invio ? 'Attivazione…' : 'Attiva il modulo Auxologia'}</Bottone>
          </div>
        ) : (
          <p className="text-sm text-slate-700">Non sei abilitato al modulo. Chiedi all'amministratore dello studio di accettarti, poi esci e rientra.</p>
        )}
      </Pannello>
    </div>
  );
}

export default function Auxologia({ claims }: { claims: ClaimsApp }) {
  const [cerca, setCerca] = useState('');
  const [archiviati, setArchiviati] = useState(false);
  const [nuovo, setNuovo] = useState(false);
  const [vista, setVista] = useState<'pazienti' | 'impostazioni'>('pazienti');
  const abilitato = claims.app_auxologia;

  const pazienti = useDati(
    async () => (abilitato ? q<AuxoPaziente[]>(supabase.schema('anagrafica').from('auxo_pazienti').select(COLONNE_PAZIENTE_AUXO).order('cognome').order('nome')) : []),
    [abilitato],
  );
  const promemoria = useDati(async () => (abilitato ? q<Promemoria[]>(supabase.schema('api').rpc('auxo_promemoria')) : []), [abilitato]);

  if (!abilitato) return <ModuloNonAttivo admin={claims.app_admin} />;

  const testo = cerca.trim().toLowerCase();
  const elenco = (pazienti.dati ?? []).filter((p) =>
    (archiviati || p.stato === 'attivo') &&
    (!testo || `${p.cognome} ${p.nome}`.toLowerCase().includes(testo) || `${p.nome} ${p.cognome}`.toLowerCase().includes(testo)));
  const nomi = new Map((pazienti.dati ?? []).map((p) => [p.id, `${p.cognome} ${p.nome}`]));
  const oggi = oggiIso();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Auxologia</h1>
          <p className="text-sm text-slate-500">Ambulatorio di auxologia pediatrica · {pazienti.dati?.filter((p) => p.stato === 'attivo').length ?? '…'} pazienti in carico · anagrafica separata dagli assistiti</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Bottone onClick={() => setVista(vista === 'pazienti' ? 'impostazioni' : 'pazienti')}>{vista === 'pazienti' ? 'Modelli e referto' : '← Pazienti'}</Bottone>
          <Bottone variante="primario" onClick={() => setNuovo(true)}>+ Nuovo paziente</Bottone>
        </div>
      </div>

      {vista === 'impostazioni' ? (
        <div className="space-y-6">
          <Pannello titolo="Referto" sottotitolo="Intestazione, luogo, firma e contatti stampati nei referti"><ImpostazioniRefertoForm claims={claims} cfg={CONFIG_AUXO} /></Pannello>
          <Pannello titolo="Modelli di testo" sottotitolo="Esame obiettivo, conclusioni, indicazioni per tipo di problema"><GestioneModelli claims={claims} cfg={CONFIG_AUXO} /></Pannello>
        </div>
      ) : <>

      {(promemoria.dati ?? []).length > 0 && (
        <Pannello titolo="Da fare" sottotitolo="Controlli entro 30 giorni e piani terapeutici in scadenza entro 30">
          <ul className="divide-y divide-slate-100 text-sm">
            {promemoria.dati?.map((r, i) => (
              <li key={`${r.paziente_id}-${r.tipo}-${i}`} className="flex flex-wrap items-center gap-3 py-2">
                <a href={link('auxologia', r.paziente_id)} className="font-medium text-slate-900 hover:underline">{nomi.get(r.paziente_id) ?? '—'}</a>
                {r.tipo === 'controllo'
                  ? <Badge tono={r.data < oggi ? 'errore' : 'info'}>Controllo {r.data < oggi ? 'scaduto il' : 'il'} {fmtGiornoIso(r.data)}</Badge>
                  : <Badge tono={r.data < oggi ? 'errore' : 'attenzione'}>Piano terapeutico {r.dettaglio}: {r.data < oggi ? 'scaduto il' : 'scade il'} {fmtGiornoIso(r.data)}</Badge>}
              </li>
            ))}
          </ul>
        </Pannello>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per nome o cognome" aria-label="Cerca paziente"
               className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={archiviati} onChange={(e) => setArchiviati(e.target.checked)} /> Mostra archiviati</label>
      </div>

      <Pannello titolo={`${elenco.length} pazienti`}>
        {pazienti.errore ? <Errore messaggio={pazienti.errore} /> : pazienti.caricamento ? <Caricamento righe={6} /> :
          elenco.length === 0 ? <Vuoto testo={pazienti.dati?.length ? 'Nessun paziente corrisponde alla ricerca.' : 'Nessun paziente registrato: inizia con «Nuovo paziente».'} /> : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Paziente</th>
                  <th className="px-4 py-2 font-medium">Nato/a il · età</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Genitore</th>
                  <th className="px-4 py-2 font-medium">Inviato da</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {elenco.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <a href={link('auxologia', p.id)} className="font-medium text-slate-900 hover:underline">{p.cognome} {p.nome}</a>
                      <span className="ml-2 text-xs text-slate-500">{p.sesso}</span>
                      {p.stato === 'archiviato' && <span className="ml-2"><Badge>Archiviato</Badge></span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className="block text-base font-medium tabular-nums text-slate-900">{fmtGiornoIso(p.data_nascita)}</span>
                      <span className="block text-sm text-slate-700">{etaEstesa(p.data_nascita, oggi)}</span>
                    </td>
                    <td className="hidden px-4 py-2 text-slate-600 md:table-cell">{[p.genitore_nome, p.genitore_telefono].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{p.inviato_da ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Pannello>

      </>}

      {nuovo && (
        <Finestra titolo="Nuovo paziente auxologico" onChiudi={() => setNuovo(false)} larga>
          <NuovoPaziente onCreato={(id) => { window.location.hash = link('auxologia', id); }} />
        </Finestra>
      )}
    </div>
  );
}
