import type { DoseCalendario, Vaccinazione } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Caricamento, Errore, type Tono } from './ui';

export const FONTE_CALENDARIO =
  'Piano Nazionale Prevenzione Vaccinale 2023-2025 (prorogato al 31/12/2026) e calendari regionali che lo recepiscono. ' +
  'Vaccinazioni obbligatorie: Legge 119/2017. Verificare sempre il calendario della propria Regione.';

const piuGiorni = (iso: string, n: number) => {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, g! + n)).toISOString().slice(0, 10);
};

export interface RigaLibretto {
  dose: DoseCalendario;
  dal: string;
  al: string;
  eseguita: Vaccinazione | undefined;
  stato: { testo: string; tono: Tono };
}

/** Incrocia il calendario con le vaccinazioni registrate. */
export function righeLibretto(calendario: DoseCalendario[], vaccini: Vaccinazione[], dataNascita: string): RigaLibretto[] {
  const oggi = oggiIso();
  return calendario.map((dose) => {
    const dal = piuGiorni(dataNascita, dose.eta_da_giorni);
    const al = piuGiorni(dataNascita, dose.eta_a_giorni);
    const eseguita = vaccini.find((v) => v.vaccino === dose.vaccino && v.dose === dose.dose);
    const stato: RigaLibretto['stato'] = eseguita
      ? { testo: 'Eseguita', tono: 'ok' }
      : oggi < dal
        ? { testo: 'Programmata', tono: 'neutro' }
        : oggi <= al
          ? { testo: 'Da fare ora', tono: 'info' }
          : { testo: 'In ritardo', tono: dose.obbligatoria ? 'errore' : 'attenzione' };
    return { dose, dal, al, eseguita, stato };
  });
}

/** Libretto vaccinale: calendario nazionale, dosi eseguite, ritardi, registrazione di una dose. */
export default function LibrettoVaccinale({
  pseudoId,
  dataNascita,
  vaccini,
  onCambiato,
}: {
  pseudoId: string;
  dataNascita: string;
  vaccini: Vaccinazione[];
  onCambiato: () => void;
}) {
  const [aperta, setAperta] = useState<string | null>(null);
  const [data, setData] = useState(oggiIso());
  const [lotto, setLotto] = useState('');
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

  if (calendario.errore) return <Errore messaggio={calendario.errore} />;
  if (calendario.caricamento || !calendario.dati) return <Caricamento righe={6} />;

  const righe = righeLibretto(calendario.dati, vaccini, dataNascita);
  // Dosi registrate che non corrispondono al calendario (es. recuperi, viaggi)
  const extra = vaccini.filter((v) => !calendario.dati!.some((d) => d.vaccino === v.vaccino && d.dose === v.dose));
  const inRitardo = righe.filter((r) => r.stato.testo === 'In ritardo');

  return (
    <div className="space-y-3">
      {inRitardo.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {inRitardo.length} {inRitardo.length === 1 ? 'dose risulta' : 'dosi risultano'} in ritardo
          {inRitardo.some((r) => r.dose.obbligatoria) && ', di cui almeno una obbligatoria'}.
        </p>
      )}
      {errore && <Errore messaggio={errore} />}
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vaccino</th>
              <th className="px-4 py-2 font-medium">Quando</th>
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
                  {r.eseguita ? <>{fmtGiornoIso(r.eseguita.data)}{r.eseguita.lotto && <span className="block text-xs">Lotto {r.eseguita.lotto}</span>}</> : '—'}
                </td>
                <td className="px-4 py-2"><Badge tono={r.stato.tono}>{r.stato.testo}</Badge></td>
                <td className="px-4 py-2 text-right">
                  {!r.eseguita && (
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
      <p className="text-xs text-slate-500">{FONTE_CALENDARIO} L'influenza è raccomandata ogni anno dai 6 mesi ai 6 anni.</p>
    </div>
  );
}
