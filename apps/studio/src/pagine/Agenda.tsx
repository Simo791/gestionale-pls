import type { Appuntamento, Paziente, StatoAppuntamento } from '@pls/shared';
import { useState } from 'react';
import { Badge, Bottone, Caricamento, Errore, Pannello, Vuoto } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { ETICHETTA_TIPO, STATO_APPUNTAMENTO, fmtGiornoLungo, fmtOra, isoGiorno } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

type AppConPaziente = Appuntamento & { pazienti: Pick<Paziente, 'nome' | 'cognome'> | null };

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function lunediDi(d: Date) {
  const l = new Date(d);
  l.setHours(0, 0, 0, 0);
  l.setDate(l.getDate() - ((l.getDay() + 6) % 7));
  return l;
}

const piuGiorni = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Agenda settimanale: scegli il giorno, gestisci conferme ed esiti degli appuntamenti. */
export default function Agenda() {
  const [giorno, setGiorno] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [soloDaConfermare, setSoloDaConfermare] = useState(false);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const lunedi = lunediDi(giorno);
  const settimana = useDati(
    () =>
      q<AppConPaziente[]>(
        supabase.schema('anagrafica').from('appuntamenti').select('*, pazienti(nome, cognome)')
          .gte('inizio', lunedi.toISOString()).lt('inizio', piuGiorni(lunedi, 7).toISOString()).order('inizio'),
      ),
    [lunedi.getTime()],
  );

  const delGiorno = (settimana.dati ?? []).filter(
    (a) => isoGiorno(new Date(a.inizio)) === isoGiorno(giorno) && (!soloDaConfermare || a.stato === 'richiesto'),
  );

  async function cambiaStato(id: string, stato: StatoAppuntamento) {
    setInCorso(id);
    setErrore(null);
    const { error } = await supabase.schema('anagrafica').from('appuntamenti').update({ stato }).eq('id', id);
    setInCorso(null);
    if (error) setErrore(`Aggiornamento non riuscito: ${error.message}`);
    else settimana.ricarica();
  }

  const adesso = Date.now();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Agenda</h1>
          <p className="text-sm capitalize text-slate-500">{fmtGiornoLungo(giorno)}</p>
        </div>
        <div className="flex gap-2">
          <Bottone onClick={() => setGiorno(piuGiorni(lunedi, -7))}>‹ Settimana</Bottone>
          <Bottone onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setGiorno(d); }}>Oggi</Bottone>
          <Bottone onClick={() => setGiorno(piuGiorni(lunedi, 7))}>Settimana ›</Bottone>
        </div>
      </div>

      {/* Striscia della settimana con il numero di appuntamenti per giorno */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {GIORNI.map((nome, i) => {
          const d = piuGiorni(lunedi, i);
          const iso = isoGiorno(d);
          const delGiornoTutti = (settimana.dati ?? []).filter((a) => isoGiorno(new Date(a.inizio)) === iso && a.stato !== 'annullato');
          const daConfermare = delGiornoTutti.filter((a) => a.stato === 'richiesto').length;
          const selezionato = iso === isoGiorno(giorno);
          return (
            <button
              key={iso}
              onClick={() => setGiorno(d)}
              className={`rounded-lg border px-1 py-2 text-center ${selezionato ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <span className="block text-xs text-slate-500">{nome}</span>
              <span className="block font-semibold text-slate-900">{d.getDate()}</span>
              <span className="block text-xs tabular-nums text-slate-600">{delGiornoTutti.length || '–'}</span>
              {daConfermare > 0 && <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-amber-500" title={`${daConfermare} da confermare`} />}
            </button>
          );
        })}
      </div>

      <Pannello
        titolo={`${delGiorno.length} appuntamenti`}
        azione={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={soloDaConfermare} onChange={(e) => setSoloDaConfermare(e.target.checked)} />
            Solo da confermare
          </label>
        }
      >
        {errore && <div className="mb-3"><Errore messaggio={errore} /></div>}
        {settimana.errore ? <Errore messaggio={settimana.errore} /> : settimana.caricamento ? <Caricamento righe={6} /> :
          delGiorno.length === 0 ? <Vuoto testo="Nessun appuntamento." /> : (
          <ul className="divide-y divide-slate-100">
            {delGiorno.map((a) => {
              const passato = new Date(a.inizio).getTime() < adesso;
              const occupato = inCorso === a.id;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="w-24 text-sm font-medium tabular-nums text-slate-900">
                    {fmtOra(a.inizio)}–{fmtOra(a.fine)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a href={link('assistiti', a.paziente_id)} className="font-medium text-slate-800 hover:underline">
                      {a.pazienti ? `${a.pazienti.cognome} ${a.pazienti.nome}` : '—'}
                    </a>
                    <p className="text-sm text-slate-500">
                      {ETICHETTA_TIPO[a.tipo]}
                      {a.note_segreteria && <> · <span className="italic">{a.note_segreteria}</span></>}
                    </p>
                  </div>
                  <Badge tono={STATO_APPUNTAMENTO[a.stato].tono}>{STATO_APPUNTAMENTO[a.stato].testo}</Badge>
                  <div className="flex gap-2">
                    {a.stato === 'richiesto' && (
                      <>
                        <Bottone variante="primario" disabled={occupato} onClick={() => void cambiaStato(a.id, 'confermato')}>Conferma</Bottone>
                        <Bottone variante="pericolo" disabled={occupato} onClick={() => void cambiaStato(a.id, 'annullato')}>Rifiuta</Bottone>
                      </>
                    )}
                    {a.stato === 'confermato' && passato && (
                      <>
                        <Bottone variante="primario" disabled={occupato} onClick={() => void cambiaStato(a.id, 'svolto')}>Svolto</Bottone>
                        <Bottone disabled={occupato} onClick={() => void cambiaStato(a.id, 'non_presentato')}>Non presentato</Bottone>
                      </>
                    )}
                    {a.stato === 'confermato' && !passato && (
                      <Bottone variante="pericolo" disabled={occupato} onClick={() => void cambiaStato(a.id, 'annullato')}>Annulla</Bottone>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Pannello>
    </div>
  );
}
