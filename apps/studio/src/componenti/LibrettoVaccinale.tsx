import type { DoseCalendario, Vaccinazione } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { supabase } from '../lib/supabase';
import Finestra from './Finestra';
import { Badge, Bottone, Caricamento, Errore, type Tono } from './ui';

export const FONTE_CALENDARIO =
  'Piano Nazionale Prevenzione Vaccinale 2023-2025 (prorogato al 31/12/2026) e calendari regionali che lo recepiscono. ' +
  'Vaccinazioni obbligatorie: Legge 119/2017. Verificare sempre il calendario della propria Regione.';

const piuGiorni = (iso: string, n: number) => {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, g! + n)).toISOString().slice(0, 10);
};
const giorniTra = (da: string, a: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86_400_000);

export type LivelloDose = 'eseguita' | 'scaduta' | 'imminente' | 'a_breve' | 'futura';

/**
 * Stati delle dosi (data prevista = inizio della finestra del calendario):
 *  - scaduta (rosso): la finestra è chiusa e la dose non è documentata → verifica e recupero;
 *  - imminente (arancione): finestra già aperta o che si apre entro 30 giorni → prenotare/confermare;
 *  - a breve (giallo): si apre tra 31 e 90 giorni → programmare;
 *  - futura (grigio): oltre 90 giorni → resta in calendario, nessuna notifica.
 */
export const LIVELLI: Record<LivelloDose, { testo: string; classe: string; descrizione: string; tono: Tono }> = {
  scaduta: {
    testo: 'scaduta', tono: 'errore', classe: 'bg-red-50 text-red-800 ring-red-200',
    descrizione: 'Vaccinazione scaduta o da recuperare: la data prevista è trascorsa e non risulta documentata la somministrazione. Richiede verifica e programmazione del recupero.',
  },
  imminente: {
    testo: 'imminente', tono: 'attenzione', classe: 'bg-orange-50 text-orange-800 ring-orange-300',
    descrizione: 'Vaccinazione imminente, entro 30 giorni: da prenotare o confermare. È la priorità organizzativa più alta tra le vaccinazioni future.',
  },
  a_breve: {
    testo: 'a breve', tono: 'attenzione', classe: 'bg-yellow-50 text-yellow-800 ring-yellow-300',
    descrizione: 'Vaccinazione a breve termine, tra 31 e 90 giorni: da programmare, verificando appuntamenti e disponibilità.',
  },
  futura: {
    testo: 'futura', tono: 'neutro', classe: 'bg-slate-100 text-slate-600 ring-slate-200',
    descrizione: 'Oltre 90 giorni: resta nel calendario vaccinale, senza notifiche.',
  },
  eseguita: { testo: 'eseguita', tono: 'ok', classe: 'bg-emerald-50 text-emerald-800 ring-emerald-200', descrizione: 'Somministrazione documentata.' },
};

export interface RigaLibretto {
  dose: DoseCalendario;
  dal: string;
  al: string;
  eseguita: Vaccinazione | undefined;
  livello: LivelloDose;
  /** Giorni all'apertura della finestra (negativo se già aperta). */
  giorni: number;
  stato: { testo: string; tono: Tono };
}

/** Incrocia il calendario con le vaccinazioni registrate e assegna lo stato a ogni dose. */
export function righeLibretto(calendario: DoseCalendario[], vaccini: Vaccinazione[], dataNascita: string, oggi = oggiIso()): RigaLibretto[] {
  return calendario.map((dose) => {
    const dal = piuGiorni(dataNascita, dose.eta_da_giorni);
    const al = piuGiorni(dataNascita, dose.eta_a_giorni);
    const eseguita = vaccini.find((v) => v.vaccino === dose.vaccino && v.dose === dose.dose);
    const giorni = giorniTra(oggi, dal);
    const livello: LivelloDose = eseguita ? 'eseguita'
      : oggi > al ? 'scaduta'
        : giorni <= 30 ? 'imminente'
          : giorni <= 90 ? 'a_breve'
            : 'futura';
    return { dose, dal, al, eseguita, livello, giorni, stato: { testo: LIVELLI[livello].testo, tono: LIVELLI[livello].tono } };
  });
}

export function BadgeLivello({ livello }: { livello: LivelloDose }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${LIVELLI[livello].classe}`}>
      ({LIVELLI[livello].testo})
    </span>
  );
}

/** Libretto vaccinale: calendario nazionale, stati delle dosi, registrazione e correzione del lotto. */
export default function LibrettoVaccinale({
  pseudoId, dataNascita, vaccini, onCambiato, onStampaAvviso, solaLettura = false,
}: {
  /** Consultazione senza modifiche (segreteria autorizzata). */
  solaLettura?: boolean;
  pseudoId: string;
  dataNascita: string;
  vaccini: Vaccinazione[];
  onCambiato: () => void;
  /** Stampa per i genitori il promemoria della dose con le indicazioni prima e dopo il vaccino. */
  onStampaAvviso?: (r: RigaLibretto) => void;
}) {
  const [aperta, setAperta] = useState<string | null>(null);
  const [data, setData] = useState(oggiIso());
  const [lotto, setLotto] = useState('');
  const [modificaLotto, setModificaLotto] = useState<{ id: string; valore: string } | null>(null);
  const [dettaglio, setDettaglio] = useState<RigaLibretto | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const calendario = useDati(
    () => q<DoseCalendario[]>(supabase.schema('anagrafica').from('calendario_vaccinale').select('*').order('ordine')),
    [],
  );

  async function registra(e: FormEvent, d: DoseCalendario) {
    e.preventDefault();
    setErrore(null);
    const { error } = await supabase.schema('clinica').from('vaccinazioni')
      .insert({ pseudo_id: pseudoId, vaccino: d.vaccino, dose: d.dose, data, lotto: lotto.trim() || null });
    if (error) return setErrore(`Registrazione non riuscita: ${error.message}`);
    setAperta(null);
    setLotto('');
    onCambiato();
  }

  async function salvaLotto(e: FormEvent) {
    e.preventDefault();
    if (!modificaLotto) return;
    setErrore(null);
    const { error } = await supabase.schema('clinica').from('vaccinazioni')
      .update({ lotto: modificaLotto.valore.trim() || null }).eq('id', modificaLotto.id);
    if (error) return setErrore(`Modifica del lotto non riuscita: ${error.message}`);
    setModificaLotto(null);
    onCambiato();
  }

  if (calendario.errore) return <Errore messaggio={calendario.errore} />;
  if (calendario.caricamento || !calendario.dati) return <Caricamento righe={6} />;

  const righe = righeLibretto(calendario.dati, vaccini, dataNascita);
  const extra = vaccini.filter((v) => !calendario.dati!.some((d) => d.vaccino === v.vaccino && d.dose === v.dose));
  const conta = (l: LivelloDose) => righe.filter((r) => r.livello === l).length;
  const cliccabile = (r: RigaLibretto) => r.livello === 'scaduta' || r.livello === 'imminente' || r.livello === 'a_breve';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {(['scaduta', 'imminente', 'a_breve'] as LivelloDose[]).filter((l) => conta(l) > 0).map((l) => (
          <span key={l} className={`rounded-lg px-3 py-1.5 ring-1 ring-inset ${LIVELLI[l].classe}`}>
            {conta(l)} {conta(l) === 1 ? 'dose' : 'dosi'} ({LIVELLI[l].testo})
            {l === 'scaduta' && righe.some((r) => r.livello === 'scaduta' && r.dose.obbligatoria) && ', anche obbligatorie'}
          </span>
        ))}
      </div>
      {errore && <Errore messaggio={errore} />}
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vaccino</th>
              <th className="px-4 py-2 font-medium">Finestra prevista</th>
              <th className="px-4 py-2 font-medium">Somministrazione</th>
              <th className="px-4 py-2 font-medium">Stato</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {righe.map((r) => (
              <tr key={r.dose.codice} className="align-top">
                <td className="px-4 py-2">
                  <span className="font-medium text-slate-900">{r.dose.vaccino}</span>
                  <span className="text-slate-500"> · dose {r.dose.dose}</span>
                  {r.dose.obbligatoria && <span className="ml-2"><Badge>Obbligatoria</Badge></span>}
                  {r.dose.note && <p className="text-xs text-slate-500">{r.dose.note}</p>}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {r.dose.quando}
                  <p className="text-xs text-slate-500">{fmtGiornoIso(r.dal)} – {fmtGiornoIso(r.al)}</p>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {r.eseguita ? (
                    <>
                      {fmtGiornoIso(r.eseguita.data)}
                      {modificaLotto?.id === r.eseguita.id ? (
                        <form onSubmit={(e) => void salvaLotto(e)} className="mt-1 flex gap-1">
                          <input autoFocus value={modificaLotto.valore} onChange={(e) => setModificaLotto({ ...modificaLotto, valore: e.target.value })}
                                 aria-label="Lotto" className="w-28 rounded border border-slate-300 px-1 py-0.5 text-xs" />
                          <button type="submit" className="text-xs text-teal-700 underline">Salva</button>
                          <button type="button" onClick={() => setModificaLotto(null)} className="text-xs text-slate-500 underline">Annulla</button>
                        </form>
                      ) : (
                        <span className="block text-xs">
                          Lotto {r.eseguita.lotto ?? '—'}{' '}
                          {!solaLettura && <button onClick={() => setModificaLotto({ id: r.eseguita!.id, valore: r.eseguita!.lotto ?? '' })} className="text-teal-700 underline">modifica</button>}
                        </span>
                      )}
                    </>
                  ) : '—'}
                </td>
                <td className="px-4 py-2">
                  {cliccabile(r)
                    ? <button onClick={() => setDettaglio(r)} title={r.livello === 'scaduta' ? 'Recupero e stampa per i genitori' : 'Finestra e promemoria per i genitori'}><BadgeLivello livello={r.livello} /></button>
                    : <BadgeLivello livello={r.livello} />}
                </td>
                <td className="px-4 py-2 text-right">
                  {!r.eseguita && !solaLettura && (
                    <button onClick={() => { setAperta(aperta === r.dose.codice ? null : r.dose.codice); setData(oggiIso()); }}
                            className="text-xs text-teal-700 underline">Registra</button>
                  )}
                  {aperta === r.dose.codice && (
                    <form onSubmit={(e) => void registra(e, r.dose)} className="mt-2 flex flex-wrap justify-end gap-2">
                      <input type="date" value={data} max={oggiIso()} onChange={(e) => setData(e.target.value)} required
                             aria-label="Data somministrazione" className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                      <input value={lotto} onChange={(e) => setLotto(e.target.value)} placeholder="Lotto"
                             aria-label="Lotto" className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                      <Bottone type="submit" variante="primario">Salva</Bottone>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {extra.length > 0 && (
        <p className="text-sm text-slate-600">
          Altre dosi registrate: {extra.map((v) => `${v.vaccino} (dose ${v.dose}, ${fmtGiornoIso(v.data)})`).join('; ')}
        </p>
      )}
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer text-slate-500">Legenda degli stati</summary>
        <ul className="mt-1 space-y-1">
          {(['scaduta', 'imminente', 'a_breve', 'futura'] as LivelloDose[]).map((l) => (
            <li key={l}><BadgeLivello livello={l} /> {LIVELLI[l].descrizione}</li>
          ))}
        </ul>
      </details>
      <p className="text-xs text-slate-500">{FONTE_CALENDARIO} L'influenza è raccomandata ogni anno dai 6 mesi ai 6 anni.</p>

      {dettaglio && (
        <Finestra titolo={`${dettaglio.dose.vaccino} · dose ${dettaglio.dose.dose}`} onChiudi={() => setDettaglio(null)}>
          <div className="space-y-3 text-sm">
            <p><BadgeLivello livello={dettaglio.livello} /> <span className="text-slate-600">{LIVELLI[dettaglio.livello].descrizione}</span></p>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1">
              <dt className="text-slate-500">Quando</dt><dd>{dettaglio.dose.quando}</dd>
              <dt className="text-slate-500">Da eseguire</dt>
              <dd className="font-semibold">{dettaglio.livello === 'scaduta'
                ? <span className="text-red-700">URGENTE: da recuperare appena possibile</span>
                : <>dal {fmtGiornoIso(dettaglio.dal)} al {fmtGiornoIso(dettaglio.al)}</>}</dd>
              {dettaglio.livello === 'scaduta' && <><dt className="text-slate-500">Finestra prevista</dt><dd>{fmtGiornoIso(dettaglio.dal)} – {fmtGiornoIso(dettaglio.al)} (trascorsa)</dd></>}
              <dt className="text-slate-500">Obbligatoria</dt><dd>{dettaglio.dose.obbligatoria ? 'Sì (Legge 119/2017)' : 'No, raccomandata'}</dd>
              {dettaglio.dose.note && <><dt className="text-slate-500">Note</dt><dd>{dettaglio.dose.note}</dd></>}
            </dl>
            {onStampaAvviso && (
              <Bottone variante="primario" onClick={() => onStampaAvviso(dettaglio)}>Stampa per i genitori (con indicazioni prima e dopo)</Bottone>
            )}
          </div>
        </Finestra>
      )}
    </div>
  );
}
