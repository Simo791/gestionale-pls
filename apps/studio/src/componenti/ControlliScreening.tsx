import type { ControlloCatalogo, ControlloEseguito, EsitoControllo } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Caricamento, Errore, type Tono } from './ui';

const ESITI: Record<EsitoControllo, { testo: string; tono: Tono }> = {
  nella_norma: { testo: 'Nella norma', tono: 'ok' },
  da_approfondire: { testo: 'Da approfondire', tono: 'attenzione' },
  inviato_specialista: { testo: 'Inviato allo specialista', tono: 'attenzione' },
  non_eseguibile: { testo: 'Non eseguibile', tono: 'neutro' },
};

const piuGiorni = (iso: string, n: number) => {
  const [a, m, g] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a!, m! - 1, g! + n));
  return d.toISOString().slice(0, 10);
};

type Stato = { testo: string; tono: Tono };

function statoControllo(dal: string, al: string, eseguito: ControlloEseguito | undefined, oggi: string): Stato {
  if (eseguito) return ESITI[eseguito.esito];
  if (oggi < dal) return { testo: 'Futuro', tono: 'neutro' };
  if (oggi <= al) return { testo: 'Da fare ora', tono: 'info' };
  return { testo: 'Scaduto', tono: 'errore' };
}

/**
 * Screening e controlli del bambino secondo il catalogo (con fonti), esiti registrati
 * e registrazione di un nuovo esito. Visibile solo con la cartella aperta.
 */
export default function ControlliScreening({
  pseudoId,
  dataNascita,
  fattoriRischio,
}: {
  pseudoId: string;
  dataNascita: string;
  fattoriRischio: string[];
}) {
  const [aperto, setAperto] = useState<string | null>(null);
  const [esito, setEsito] = useState<EsitoControllo>('nella_norma');
  const [data, setData] = useState(oggiIso());
  const [note, setNote] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [mostraFonte, setMostraFonte] = useState<string | null>(null);

  const catalogo = useDati(
    () => q<ControlloCatalogo[]>(supabase.schema('anagrafica').from('catalogo_controlli').select('*').order('ordine')),
    [],
  );
  const eseguiti = useDati(
    () => q<ControlloEseguito[]>(supabase.schema('clinica').from('controlli_eseguiti').select('*').eq('pseudo_id', pseudoId).order('data', { ascending: false })),
    [pseudoId],
  );

  async function registra(e: FormEvent, codice: string) {
    e.preventDefault();
    setErrore(null);
    const { error } = await supabase.schema('clinica').from('controlli_eseguiti')
      .insert({ pseudo_id: pseudoId, codice_controllo: codice, data, esito, note: note.trim() || null });
    if (error) return setErrore(`Registrazione non riuscita: ${error.message}`);
    setAperto(null);
    setNote('');
    eseguiti.ricarica();
  }

  if (catalogo.errore || eseguiti.errore) return <Errore messaggio={catalogo.errore ?? eseguiti.errore ?? ''} />;
  if (catalogo.caricamento || eseguiti.caricamento) return <Caricamento righe={5} />;

  const oggi = oggiIso();
  const voci = (catalogo.dati ?? []).filter((c) => c.destinatari === 'tutti' || fattoriRischio.length > 0);

  return (
    <div className="space-y-3">
      {fattoriRischio.length > 0 && (
        <p className="text-sm text-slate-600">
          Fattori di rischio: {fattoriRischio.map((f) => <Badge key={f} tono="attenzione">{f}</Badge>)}
        </p>
      )}
      {errore && <Errore messaggio={errore} />}
      <ul className="divide-y divide-slate-100">
        {voci.map((c) => {
          const dal = piuGiorni(dataNascita, c.finestra_da_giorni);
          const al = piuGiorni(dataNascita, c.finestra_a_giorni);
          const eseguito = (eseguiti.dati ?? []).find((e) => e.codice_controllo === c.codice);
          const stato = statoControllo(dal, al, eseguito, oggi);
          return (
            <li key={c.codice} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{c.nome}</p>
                  <p className="text-sm text-slate-500">
                    Finestra: {fmtGiornoIso(dal)} – {fmtGiornoIso(al)}
                    {eseguito && <> · eseguito il {fmtGiornoIso(eseguito.data)}{eseguito.note && ` · ${eseguito.note}`}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tono={stato.tono}>{stato.testo}</Badge>
                  {!eseguito && (
                    <Bottone onClick={() => { setAperto(aperto === c.codice ? null : c.codice); setEsito('nella_norma'); setData(oggi); }}>
                      Registra esito
                    </Bottone>
                  )}
                  <button onClick={() => setMostraFonte(mostraFonte === c.codice ? null : c.codice)}
                          className="text-xs text-teal-700 underline" aria-expanded={mostraFonte === c.codice}>
                    Dettagli e fonte
                  </button>
                </div>
              </div>

              {mostraFonte === c.codice && (
                <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <p>{c.descrizione}</p>
                  <p className="mt-1"><strong>Cosa fa il pediatra:</strong> {c.azione_pediatra}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Fonte: <a href={c.fonte_url} target="_blank" rel="noreferrer" className="underline">{c.fonte}</a>
                  </p>
                </div>
              )}

              {aperto === c.codice && (
                <form onSubmit={(e) => void registra(e, c.codice)} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
                  <label className="text-sm">
                    <span className="block text-slate-500">Data</span>
                    <input type="date" value={data} max={oggi} onChange={(e) => setData(e.target.value)} required
                           className="rounded-lg border border-slate-300 px-2 py-1" />
                  </label>
                  <label className="text-sm">
                    <span className="block text-slate-500">Esito</span>
                    <select value={esito} onChange={(e) => setEsito(e.target.value as EsitoControllo)}
                            className="rounded-lg border border-slate-300 px-2 py-1">
                      {(Object.keys(ESITI) as EsitoControllo[]).map((k) => <option key={k} value={k}>{ESITI[k].testo}</option>)}
                    </select>
                  </label>
                  <label className="min-w-48 flex-1 text-sm">
                    <span className="block text-slate-500">Note (facoltative)</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                           className="w-full rounded-lg border border-slate-300 px-2 py-1" />
                  </label>
                  <Bottone type="submit" variante="primario">Salva</Bottone>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">
        Catalogo di consultazione con fonti: non sostituisce il giudizio clinico e va aggiornato quando cambiano le raccomandazioni.
      </p>
    </div>
  );
}
