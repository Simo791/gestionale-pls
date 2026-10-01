import type { ClaimsApp, Paziente, TipoAppuntamento } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { ETICHETTA_TIPO } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Bottone, Errore } from './ui';

const TIPI = Object.keys(ETICHETTA_TIPO) as TipoAppuntamento[];

/**
 * Inserimento di un appuntamento da parte dello staff: nasce confermato, quindi il
 * database accoda in automatico la conferma WhatsApp (con link a Google Calendar)
 * e gli eventuali promemoria per i genitori che hanno dato il consenso.
 */
export default function NuovoAppuntamento({
  claims,
  giornoIniziale,
  onCreato,
  onAnnulla,
}: {
  claims: ClaimsApp;
  giornoIniziale: string;
  onCreato: () => void;
  onAnnulla: () => void;
}) {
  const [cerca, setCerca] = useState('');
  const [pazienteId, setPazienteId] = useState('');
  const [giorno, setGiorno] = useState(giornoIniziale);
  const [ora, setOra] = useState('09:00');
  const [durata, setDurata] = useState(20);
  const [tipo, setTipo] = useState<TipoAppuntamento>('visita');
  const [note, setNote] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const pazienti = useDati(
    () => q<Pick<Paziente, 'id' | 'nome' | 'cognome' | 'pediatra_id' | 'data_nascita'>[]>(
      supabase.schema('anagrafica').from('pazienti').select('id, nome, cognome, pediatra_id, data_nascita')
        .eq('stato', 'attivo').order('cognome').order('nome'),
    ),
    [],
  );

  const testo = cerca.trim().toLowerCase();
  const filtrati = (pazienti.dati ?? []).filter((p) => !testo || `${p.cognome} ${p.nome}`.toLowerCase().includes(testo));

  async function salva(e: FormEvent) {
    e.preventDefault();
    const paziente = pazienti.dati?.find((p) => p.id === pazienteId);
    if (!paziente) return setErrore('Scegli il bambino.');
    const inizio = new Date(`${giorno}T${ora}:00`); // ora locale del browser (Italia)
    if (Number.isNaN(inizio.getTime())) return setErrore('Data o ora non valida.');
    if (inizio.getTime() < Date.now()) return setErrore("L'appuntamento è nel passato.");
    const fine = new Date(inizio.getTime() + durata * 60_000);

    setInCorso(true);
    setErrore(null);
    const { error } = await supabase.schema('anagrafica').from('appuntamenti').insert({
      studio_id: claims.app_studio_id,
      pediatra_id: paziente.pediatra_id,
      paziente_id: paziente.id,
      inizio: inizio.toISOString(),
      fine: fine.toISOString(),
      tipo,
      stato: 'confermato',
      note_segreteria: note.trim() || null,
    });
    setInCorso(false);
    if (error) return setErrore(`Salvataggio non riuscito: ${error.message}`);
    onCreato();
  }

  return (
    <form onSubmit={(e) => void salva(e)} className="space-y-3 rounded-xl border border-teal-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Nuovo appuntamento</h2>
      {errore && <Errore messaggio={errore} />}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="block text-slate-500">Cerca bambino</span>
          <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cognome o nome"
                 className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="block text-slate-500">Bambino</span>
          <select value={pazienteId} onChange={(e) => setPazienteId(e.target.value)} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">— scegli ({filtrati.length}) —</option>
            {filtrati.map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-500">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAppuntamento)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {TIPI.map((t) => <option key={t} value={t}>{ETICHETTA_TIPO[t]}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">
            <span className="block text-slate-500">Giorno</span>
            <input type="date" value={giorno} onChange={(e) => setGiorno(e.target.value)} required
                   className="w-full rounded-lg border border-slate-300 px-2 py-2" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Ora</span>
            <input type="time" value={ora} step={300} onChange={(e) => setOra(e.target.value)} required
                   className="w-full rounded-lg border border-slate-300 px-2 py-2" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Minuti</span>
            <select value={durata} onChange={(e) => setDurata(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-2 py-2">
              {[10, 15, 20, 30, 40, 60].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <label className="text-sm md:col-span-2">
          <span className="block text-slate-500">Nota per la segreteria (facoltativa, niente dati clinici)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
                 placeholder="Es. ecografia anche, controllo vista"
                 className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
      </div>

      <p className="text-xs text-slate-500">
        Alla conferma partono in automatico il messaggio WhatsApp con il link a Google Calendar e, per i
        bilanci di salute, i promemoria a 30 e 5 giorni (solo ai genitori con consenso WhatsApp).
      </p>
      <div className="flex gap-2">
        <Bottone type="submit" variante="primario" disabled={inCorso}>{inCorso ? 'Salvataggio…' : 'Salva appuntamento'}</Bottone>
        <Bottone onClick={onAnnulla}>Annulla</Bottone>
      </div>
    </form>
  );
}
