import type { ClaimsApp, MembroStudio, Sostituzione } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { etichettaRuolo, fmtGiornoIso, oggiIso } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Errore, Pannello, Vuoto } from './ui';

const stileInput = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';
const nomeMembro = (m: MembroStudio | undefined) =>
  m ? (`${m.nome ?? ''} ${m.cognome ?? ''}`.trim() || m.email || 'Senza nome') : '—';

/**
 * Staff dello studio (solo amministratore) e sostituzioni (pediatra titolare).
 * Il passaggio titolare → sostituto è a date: durante il periodo il sostituto vede le
 * cartelle dei suoi assistiti e riceve le notifiche; a fine periodo tutto torna al titolare.
 */
export default function GestioneStaff({ claims }: { claims: ClaimsApp }) {
  const membri = useDati(() => q<MembroStudio[]>(supabase.schema('anagrafica').from('membri_studio').select('*').order('ruolo')), []);
  const sostituzioni = useDati(
    () => q<Sostituzione[]>(supabase.schema('anagrafica').from('sostituzioni').select('*').eq('titolare_id', claims.sub)
      .gte('al', oggiIso()).is('revocata_il', null).order('dal')),
    [],
  );
  const [nuovo, setNuovo] = useState({ nome: '', cognome: '', email: '', ruolo: 'segreteria' as 'segreteria' | 'sostituto' });
  const [turno, setTurno] = useState({ sostituto: '', dal: oggiIso(), al: oggiIso(), consegne: '' });
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  const [invio, setInvio] = useState(false);

  async function aggiungi(e: FormEvent) {
    e.preventDefault();
    setEsito(null);
    setInvio(true);
    const { data, error } = await supabase.functions.invoke('gestione-staff', { body: nuovo });
    setInvio(false);
    const errore = (data as { errore?: string } | null)?.errore ?? error?.message;
    if (errore) return setEsito({ ok: false, testo: `Aggiunta non riuscita: ${errore}` });
    setEsito({ ok: true, testo: `${nuovo.nome} ${nuovo.cognome} aggiunto come ${etichettaRuolo(nuovo.ruolo).toLowerCase()}. Accede con il codice via email e configura il secondo fattore.` });
    setNuovo({ nome: '', cognome: '', email: '', ruolo: nuovo.ruolo });
    membri.ricarica();
  }

  async function attiva(m: MembroStudio, attivo: boolean) {
    setEsito(null);
    const { error } = await supabase.schema('api').rpc('imposta_membro', { p_utente: m.utente_id, p_attivo: attivo });
    if (error) return setEsito({ ok: false, testo: error.message });
    setEsito({ ok: true, testo: `${nomeMembro(m)} ${attivo ? 'riattivato' : 'disattivato'}. L'effetto è completo al rinnovo della sua sessione (entro un'ora).` });
    membri.ricarica();
  }

  async function avviaSostituzione(e: FormEvent) {
    e.preventDefault();
    setEsito(null);
    const { error } = await supabase.schema('api').rpc('attiva_sostituzione', {
      p_sostituto: turno.sostituto, p_dal: turno.dal, p_al: turno.al, p_consegne: turno.consegne,
    });
    if (error) return setEsito({ ok: false, testo: error.message });
    setEsito({ ok: true, testo: 'Sostituzione attivata: il sostituto ha ricevuto una notifica con le consegne.' });
    setTurno({ ...turno, consegne: '' });
    sostituzioni.ricarica();
  }

  async function revoca(s: Sostituzione) {
    setEsito(null);
    const { error } = await supabase.schema('api').rpc('revoca_sostituzione', { p_id: s.id });
    if (error) return setEsito({ ok: false, testo: error.message });
    setEsito({ ok: true, testo: 'Sostituzione revocata: l\'accesso del sostituto è chiuso.' });
    sostituzioni.ricarica();
  }

  const sostituti = (membri.dati ?? []).filter((m) => m.ruolo === 'sostituto' && m.attivo);

  return (
    <>
      {esito && <p role="status" className={`rounded-lg p-3 text-sm ${esito.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{esito.testo}</p>}

      {claims.app_admin && (
        <Pannello titolo="Staff dello studio" sottotitolo="Sei amministratore: aggiungi e disattivi segreteria e sostituti">
          {membri.errore ? <Errore messaggio={membri.errore} /> : (
            <ul className="divide-y divide-slate-100">
              {(membri.dati ?? []).map((m) => (
                <li key={m.utente_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{nomeMembro(m)}</p>
                    <p className="text-slate-500">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tono={m.ruolo === 'pediatra' ? 'info' : 'neutro'}>{etichettaRuolo(m.ruolo)}</Badge>
                    {m.amministratore && <Badge tono="ok">Amministratore</Badge>}
                    {!m.attivo && <Badge tono="attenzione">Disattivato</Badge>}
                    {!m.amministratore && m.utente_id !== claims.sub && (
                      <Bottone variante={m.attivo ? 'pericolo' : 'secondario'} onClick={() => void attiva(m, !m.attivo)}>
                        {m.attivo ? 'Disattiva' : 'Riattiva'}
                      </Bottone>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(e) => void aggiungi(e)} className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
            <p className="text-sm font-medium text-slate-800 md:col-span-2">Aggiungi un membro</p>
            <label className="text-sm"><span className="block text-slate-500">Nome</span>
              <input required value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} className={stileInput} /></label>
            <label className="text-sm"><span className="block text-slate-500">Cognome</span>
              <input required value={nuovo.cognome} onChange={(e) => setNuovo({ ...nuovo, cognome: e.target.value })} className={stileInput} /></label>
            <label className="text-sm"><span className="block text-slate-500">Email (servirà per accedere)</span>
              <input required type="email" value={nuovo.email} onChange={(e) => setNuovo({ ...nuovo, email: e.target.value })} className={stileInput} /></label>
            <label className="text-sm"><span className="block text-slate-500">Ruolo</span>
              <select value={nuovo.ruolo} onChange={(e) => setNuovo({ ...nuovo, ruolo: e.target.value as 'segreteria' | 'sostituto' })} className={stileInput}>
                <option value="segreteria">Segreteria (agenda, anagrafiche, consensi: niente dati clinici)</option>
                <option value="sostituto">Sostituto (dati clinici solo nei periodi di sostituzione)</option>
              </select></label>
            <div className="md:col-span-2"><Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Aggiunta…' : 'Aggiungi'}</Bottone></div>
          </form>
        </Pannello>
      )}

      {claims.app_ruolo === 'pediatra' && (
        <Pannello titolo="Sostituzioni" sottotitolo="Passaggio dei tuoi assistiti a un sostituto per un periodo">
          {(sostituzioni.dati ?? []).length === 0 ? <Vuoto testo="Nessuna sostituzione in corso o programmata." /> : (
            <ul className="divide-y divide-slate-100">
              {sostituzioni.dati?.map((s) => (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">
                      {nomeMembro((membri.dati ?? []).find((m) => m.utente_id === s.sostituto_id))} · dal {fmtGiornoIso(s.dal)} al {fmtGiornoIso(s.al)}
                    </p>
                    {s.consegne && <p className="whitespace-pre-line text-slate-600">Consegne: {s.consegne}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.dal <= oggiIso() ? <Badge tono="ok">In corso</Badge> : <Badge>Programmata</Badge>}
                    <Bottone variante="pericolo" onClick={() => void revoca(s)}>Revoca</Bottone>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {sostituti.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              Nessun sostituto attivo nello studio.{claims.app_admin ? ' Aggiungilo nel riquadro «Staff dello studio».' : ' Chiedi all\'amministratore di aggiungerlo.'}
            </p>
          ) : (
            <form onSubmit={(e) => void avviaSostituzione(e)} className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-3">
              <label className="text-sm"><span className="block text-slate-500">Sostituto</span>
                <select required value={turno.sostituto} onChange={(e) => setTurno({ ...turno, sostituto: e.target.value })} className={stileInput}>
                  <option value="">— scegli —</option>
                  {sostituti.map((m) => <option key={m.utente_id} value={m.utente_id}>{nomeMembro(m)}</option>)}
                </select></label>
              <label className="text-sm"><span className="block text-slate-500">Dal</span>
                <input type="date" required min={oggiIso()} value={turno.dal} onChange={(e) => setTurno({ ...turno, dal: e.target.value })} className={stileInput} /></label>
              <label className="text-sm"><span className="block text-slate-500">Al</span>
                <input type="date" required min={turno.dal} value={turno.al} onChange={(e) => setTurno({ ...turno, al: e.target.value })} className={stileInput} /></label>
              <label className="text-sm md:col-span-3"><span className="block text-slate-500">Consegne per il sostituto (arrivano come notifica)</span>
                <textarea rows={3} value={turno.consegne} onChange={(e) => setTurno({ ...turno, consegne: e.target.value })}
                          placeholder="Es. bambini da ricontrollare, esami in attesa di referto" className={stileInput} /></label>
              <p className="text-xs text-slate-500 md:col-span-3">
                Durante il periodo il sostituto vede le cartelle dei tuoi assistiti (con secondo fattore) e riceve le richieste di appuntamento al posto tuo.
                Ogni accesso resta nel registro. Nelle consegne evita dati clinici non necessari.
              </p>
              <div className="md:col-span-3"><Bottone type="submit" variante="primario">Attiva sostituzione</Bottone></div>
            </form>
          )}
        </Pannello>
      )}
    </>
  );
}
