import type { Appuntamento, Paziente, Richiamo } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { ETICHETTA_TIPO, fmtDataOra, fmtGiornoIso, isoGiorno, oggiIso } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Caricamento, Errore, Vuoto } from './ui';

const stile = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';
const piuGiorniIso = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoGiorno(d); };

/**
 * Esito della telefonata di conferma quando il genitore non accetta l'appuntamento:
 * spostarlo subito a un'altra data oppure annullarlo e metterlo nella lista da ricontattare.
 */
export function RifiutoAppuntamento({ a, nome, onFatto }: { a: Appuntamento; nome: string; onFatto: () => void }) {
  const durataMin = Math.round((new Date(a.fine).getTime() - new Date(a.inizio).getTime()) / 60_000);
  // Bambino non presentato: l'appuntamento resta registrato, se ne crea uno nuovo.
  const assente = a.stato === 'non_presentato';
  type Scelta = 'riprogramma' | 'richiamo' | 'annulla';
  const opzioni: [Scelta, string][] = assente
    ? [['riprogramma', 'Fissa ora un nuovo appuntamento'], ['richiamo', 'Aggiungi alla lista da ricontattare']]
    : [['riprogramma', 'Riprogramma ora a un\'altra data'], ['richiamo', 'Annulla e aggiungi alla lista da ricontattare'], ['annulla', 'Annulla soltanto']];
  const [scelta, setScelta] = useState<'riprogramma' | 'richiamo' | 'annulla'>('riprogramma');
  const [nuova, setNuova] = useState({ giorno: piuGiorniIso(7), ora: '09:00' });
  const [richiamo, setRichiamo] = useState({ dal: piuGiorniIso(7), motivo: '' });
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const ana = () => supabase.schema('anagrafica');

  async function conferma(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInvio(true);
    try {
      if (scelta === 'riprogramma') {
        const inizio = new Date(`${nuova.giorno}T${nuova.ora}:00`);
        if (Number.isNaN(inizio.getTime()) || inizio.getTime() < Date.now()) throw new Error('Scegli una data e un\'ora future.');
        const fine = new Date(inizio.getTime() + durataMin * 60_000);
        // Nuovo orario: il database rigenera conferma e promemoria WhatsApp.
        const { error } = assente
          ? await ana().from('appuntamenti').insert({
              studio_id: a.studio_id, pediatra_id: a.pediatra_id, paziente_id: a.paziente_id, tipo: a.tipo,
              inizio: inizio.toISOString(), fine: fine.toISOString(), stato: 'confermato',
              note_segreteria: `Riprogrammato dopo assenza del ${fmtDataOra(a.inizio)}`,
            })
          : await ana().from('appuntamenti')
              .update({ inizio: inizio.toISOString(), fine: fine.toISOString(), stato: 'confermato' }).eq('id', a.id);
        if (error) throw new Error(error.message);
      } else {
        if (!assente) {
          const { error } = await ana().from('appuntamenti').update({ stato: 'annullato' }).eq('id', a.id);
          if (error) throw new Error(error.message);
        }
        if (scelta === 'richiamo') {
          const { error: e2 } = await ana().from('richiami').insert({
            paziente_id: a.paziente_id, appuntamento_id: a.id, tipo_visita: a.tipo,
            ricontattare_dal: richiamo.dal, motivo: richiamo.motivo.trim() || null,
          });
          if (e2) throw new Error(e2.message);
        }
      }
      onFatto();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally {
      setInvio(false);
    }
  }

  return (
    <form onSubmit={(e) => void conferma(e)} className="space-y-3 text-sm">
      <p className="text-slate-700">{nome} · {ETICHETTA_TIPO[a.tipo]} del {fmtDataOra(a.inizio)}</p>
      {errore && <Errore messaggio={errore} />}
      <fieldset className="space-y-1">
        {opzioni.map(([k, t]) => (
          <label key={k} className="flex items-center gap-2"><input type="radio" name="esito" checked={scelta === k} onChange={() => setScelta(k)} /> {t}</label>
        ))}
      </fieldset>
      {scelta === 'riprogramma' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="block text-slate-500">Nuova data</span>
            <input type="date" min={oggiIso()} required value={nuova.giorno} onChange={(e) => setNuova({ ...nuova, giorno: e.target.value })} className={stile} /></label>
          <label><span className="block text-slate-500">Ora</span>
            <input type="time" step={300} required value={nuova.ora} onChange={(e) => setNuova({ ...nuova, ora: e.target.value })} className={stile} /></label>
          <p className="text-xs text-slate-500 sm:col-span-2">Durata invariata ({durataMin} minuti). Ai genitori con consenso arriva la nuova conferma WhatsApp.</p>
        </div>
      )}
      {scelta === 'richiamo' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="block text-slate-500">Ricontattare dal</span>
            <input type="date" min={oggiIso()} required value={richiamo.dal} onChange={(e) => setRichiamo({ ...richiamo, dal: e.target.value })} className={stile} /></label>
          <label><span className="block text-slate-500">Nota (solo organizzativa)</span>
            <input value={richiamo.motivo} onChange={(e) => setRichiamo({ ...richiamo, motivo: e.target.value })}
                   placeholder="Es. chiamare dopo le 17, fuori sede fino al 20" className={stile} /></label>
          <p className="text-xs text-slate-500 sm:col-span-2">Dal giorno indicato il bambino compare nella lista «Da ricontattare» in Agenda e in Home.</p>
        </div>
      )}
      <Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Conferma'}</Bottone>
    </form>
  );
}

type RichiamoConPaziente = Richiamo & { pazienti: Pick<Paziente, 'nome' | 'cognome'> | null };

/** Lista dei pazienti da ricontattare per fissare un appuntamento. */
export function ElencoRichiami({ onFissa, aggiorna }: { onFissa: (r: Richiamo) => void; aggiorna: number }) {
  const elenco = useDati(
    () => q<RichiamoConPaziente[]>(supabase.schema('anagrafica').from('richiami').select('*, pazienti(nome, cognome)')
      .eq('stato', 'aperto').order('ricontattare_dal')),
    [aggiorna],
  );
  const [errore, setErrore] = useState<string | null>(null);
  const oggi = oggiIso();

  async function chiudi(r: Richiamo) {
    const { error } = await supabase.schema('anagrafica').from('richiami')
      .update({ stato: 'chiuso', chiuso_il: new Date().toISOString() }).eq('id', r.id);
    if (error) setErrore(error.message); else elenco.ricarica();
  }

  if (elenco.errore) return <Errore messaggio={elenco.errore} />;
  if (elenco.caricamento) return <Caricamento />;
  return (
    <div className="space-y-2">
      {errore && <Errore messaggio={errore} />}
      {(elenco.dati ?? []).length === 0 ? <Vuoto testo="Nessun paziente da ricontattare." /> : (
        <ul className="divide-y divide-slate-100">
          {elenco.dati?.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <a href={link('assistiti', r.paziente_id)} className="font-medium text-slate-900 hover:underline">
                  {r.pazienti ? `${r.pazienti.cognome} ${r.pazienti.nome}` : '—'}
                </a>
                <span className="ml-2 text-slate-500">{ETICHETTA_TIPO[r.tipo_visita]}</span>
                {r.motivo && <p className="text-xs text-slate-500">{r.motivo}</p>}
              </div>
              {r.ricontattare_dal <= oggi
                ? <Badge tono="attenzione">Da chiamare{r.ricontattare_dal < oggi ? ` dal ${fmtGiornoIso(r.ricontattare_dal)}` : ' oggi'}</Badge>
                : <Badge>Dal {fmtGiornoIso(r.ricontattare_dal)}</Badge>}
              <Bottone variante="primario" onClick={() => onFissa(r)}>Fissa appuntamento</Bottone>
              <button onClick={() => void chiudi(r)} className="text-xs text-slate-500 underline">Non serve più</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
