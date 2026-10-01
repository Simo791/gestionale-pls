import type { ClaimsApp, Paziente, Pediatra, TipoRelazione } from '@pls/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { q, useDati } from '../lib/dati';
import { ETICHETTA_RELAZIONE, fmtGiornoIso, oggiIso } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';
import { Bottone, Errore, Pannello } from './ui';

const CF = /^[A-Z0-9]{16}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Campo = ({ etichetta, children, largo }: { etichetta: string; children: ReactNode; largo?: boolean }) => (
  <label className={`text-sm ${largo ? 'md:col-span-2' : ''}`}>
    <span className="block text-slate-500">{etichetta}</span>
    {children}
  </label>
);
const stileInput = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';

/**
 * Accesso senza appuntamento (es. urgenza): cerca un bambino già in carico oppure
 * registra un nuovo bambino con i dati minimi, poi apre direttamente la visita.
 */
export default function AccessoRapido({ claims, onChiudi }: { claims: ClaimsApp; onChiudi: () => void }) {
  const isPediatra = claims.app_ruolo === 'pediatra';
  const [scheda, setScheda] = useState<'cerca' | 'nuovo'>('cerca');
  const [testo, setTesto] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const [b, setB] = useState({ nome: '', cognome: '', cf: '', nascita: '', sesso: 'M' as 'M' | 'F', pediatra: isPediatra ? claims.sub : '' });
  const [conGenitore, setConGenitore] = useState(true);
  const [g, setG] = useState({ tipo: 'madre' as TipoRelazione, nome: '', cognome: '', cf: '', email: '', telefono: '' });

  const pediatri = useDati(() => q<Pediatra[]>(supabase.schema('anagrafica').from('pediatri').select('*').order('cognome')), []);
  const trovati = useDati(
    async () => {
      const t = testo.trim().replace(/[^\p{L}\s'-]/gu, ''); // niente caratteri speciali nel filtro PostgREST
      if (t.length < 2) return [];
      return q<Paziente[]>(supabase.schema('anagrafica').from('pazienti')
        .select('id, nome, cognome, data_nascita, sesso, stato').or(`cognome.ilike.%${t}%,nome.ilike.%${t}%`)
        .order('cognome').limit(8));
    },
    [testo],
  );

  // Il pediatra va dritto alla visita; la segreteria apre la scheda (i dati clinici non le sono accessibili).
  const vai = (id: string) => {
    window.location.hash = isPediatra ? link('assistiti', id, 'visita') : link('assistiti', id);
    onChiudi();
  };

  async function registra(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    const cf = b.cf.trim().toUpperCase();
    if (!CF.test(cf)) return setErrore('Il codice fiscale del bambino deve avere 16 caratteri (lo trovi sulla tessera sanitaria).');
    if (!b.pediatra) return setErrore('Scegli il pediatra.');
    if (conGenitore) {
      if (!g.nome.trim() || !g.cognome.trim()) return setErrore('Inserisci nome e cognome del genitore, oppure togli la spunta.');
      if (!CF.test(g.cf.trim().toUpperCase())) return setErrore('Il codice fiscale del genitore deve avere 16 caratteri.');
      if (!EMAIL.test(g.email.trim())) return setErrore('Serve un\'email valida del genitore (per il portale e le comunicazioni).');
    }
    setInvio(true);
    const { data, error } = await supabase.schema('api').rpc('registra_paziente_rapido', {
      p_nome: b.nome, p_cognome: b.cognome, p_codice_fiscale: cf, p_data_nascita: b.nascita, p_sesso: b.sesso,
      p_pediatra_id: b.pediatra,
      p_genitore: conGenitore
        ? { tipo: g.tipo, nome: g.nome.trim(), cognome: g.cognome.trim(), codice_fiscale: g.cf.trim().toUpperCase(), email: g.email.trim(), telefono: g.telefono.trim() }
        : null,
    });
    setInvio(false);
    if (error) return setErrore(error.code === '23505' ? 'Questo bambino è già registrato: cercalo nella scheda «Già in carico».' : error.message);
    vai(data as string);
  }

  return (
    <Pannello titolo="Accesso senza appuntamento" sottotitolo="Urgenza o visita non prenotata"
              azione={<button onClick={onChiudi} className="text-sm text-slate-500 underline">Chiudi</button>}>
      <div role="tablist" className="mb-3 flex gap-1">
        {([['cerca', 'Già in carico'], ['nuovo', 'Nuovo bambino']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={scheda === k} onClick={() => { setScheda(k); setErrore(null); }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${scheda === k ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200' : 'text-slate-600 hover:bg-slate-50'}`}>
            {t}
          </button>
        ))}
      </div>
      {errore && <div className="mb-3"><Errore messaggio={errore} /></div>}

      {scheda === 'cerca' ? (
        <div className="space-y-2">
          <input autoFocus value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cognome o nome del bambino"
                 aria-label="Cerca bambino" className={stileInput} />
          <ul className="divide-y divide-slate-100">
            {(trovati.dati ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span><span className="font-medium text-slate-900">{p.cognome} {p.nome}</span>
                  <span className="text-slate-500"> · nato/a il {fmtGiornoIso(p.data_nascita)}</span></span>
                <Bottone variante="primario" onClick={() => vai(p.id)}>{isPediatra ? 'Apri visita' : 'Apri scheda'}</Bottone>
              </li>
            ))}
          </ul>
          {testo.trim().length >= 2 && trovati.dati?.length === 0 && (
            <p className="text-sm text-slate-600">Nessun bambino trovato. <button className="text-teal-700 underline" onClick={() => setScheda('nuovo')}>Registralo ora</button></p>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => void registra(e)} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Campo etichetta="Nome del bambino"><input required value={b.nome} onChange={(e) => setB({ ...b, nome: e.target.value })} className={stileInput} /></Campo>
            <Campo etichetta="Cognome"><input required value={b.cognome} onChange={(e) => setB({ ...b, cognome: e.target.value })} className={stileInput} /></Campo>
            <Campo etichetta="Codice fiscale (tessera sanitaria)">
              <input required value={b.cf} onChange={(e) => setB({ ...b, cf: e.target.value.toUpperCase() })} maxLength={16} className={`${stileInput} font-mono`} />
            </Campo>
            <Campo etichetta="Data di nascita">
              <input required type="date" max={oggiIso()} value={b.nascita} onChange={(e) => setB({ ...b, nascita: e.target.value })} className={stileInput} />
            </Campo>
            <Campo etichetta="Sesso">
              <select value={b.sesso} onChange={(e) => setB({ ...b, sesso: e.target.value as 'M' | 'F' })} className={stileInput}>
                <option value="M">Maschio</option><option value="F">Femmina</option>
              </select>
            </Campo>
            <Campo etichetta="Pediatra">
              <select required value={b.pediatra} onChange={(e) => setB({ ...b, pediatra: e.target.value })} className={stileInput}>
                <option value="">— scegli —</option>
                {(pediatri.dati ?? []).map((m) => <option key={m.id} value={m.id}>{m.titolo} {m.nome} {m.cognome}</option>)}
              </select>
            </Campo>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={conGenitore} onChange={(e) => setConGenitore(e.target.checked)} /> Registra anche il genitore presente</label>
            </legend>
            {conGenitore && (
              <div className="grid gap-3 md:grid-cols-2">
                <Campo etichetta="Relazione">
                  <select value={g.tipo} onChange={(e) => setG({ ...g, tipo: e.target.value as TipoRelazione })} className={stileInput}>
                    {(Object.keys(ETICHETTA_RELAZIONE) as TipoRelazione[]).map((t) => <option key={t} value={t}>{ETICHETTA_RELAZIONE[t]}</option>)}
                  </select>
                </Campo>
                <Campo etichetta="Codice fiscale del genitore">
                  <input value={g.cf} onChange={(e) => setG({ ...g, cf: e.target.value.toUpperCase() })} maxLength={16} className={`${stileInput} font-mono`} />
                </Campo>
                <Campo etichetta="Nome"><input value={g.nome} onChange={(e) => setG({ ...g, nome: e.target.value })} className={stileInput} /></Campo>
                <Campo etichetta="Cognome"><input value={g.cognome} onChange={(e) => setG({ ...g, cognome: e.target.value })} className={stileInput} /></Campo>
                <Campo etichetta="Email"><input type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} className={stileInput} /></Campo>
                <Campo etichetta="Telefono (WhatsApp)"><input value={g.telefono} onChange={(e) => setG({ ...g, telefono: e.target.value })} className={stileInput} /></Campo>
                <p className="text-xs text-slate-500 md:col-span-2">Se il genitore è già registrato (es. per un fratello) viene riconosciuto dal codice fiscale e collegato.</p>
              </div>
            )}
          </fieldset>

          <p className="text-xs text-slate-500">
            Dopo la visita completa l'anagrafica e fai firmare l'informativa e i consensi: il bambino comparirà tra i «consensi da completare» finché mancano.
          </p>
          <Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Registrazione…' : isPediatra ? 'Registra e apri la visita' : 'Registra'}</Bottone>
        </form>
      )}
    </Pannello>
  );
}
