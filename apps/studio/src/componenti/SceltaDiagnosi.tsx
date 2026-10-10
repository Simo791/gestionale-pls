import type { Diagnosi } from '@pls/shared';
import { useState } from 'react';
import { q, useDati } from '../lib/dati';
import { supabase } from '../lib/supabase';

const CODICE_ICD9 = /^(V\d{2}(\.\d{1,2})?|E\d{3}(\.\d)?|\d{3}(\.\d{1,2})?)$/;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Diagnosi scelte per nome (con sinonimi) dal catalogo; il codice ICD-9-CM si aggiunge da sé. */
export default function SceltaDiagnosi({ valore, onChange }: { valore: string[]; onChange: (codici: string[]) => void }) {
  const [testo, setTesto] = useState('');
  const [aperto, setAperto] = useState(false);
  const catalogo = useDati(() => q<Diagnosi[]>(supabase.schema('anagrafica').from('catalogo_diagnosi').select('*').order('descrizione')), []);
  const tutte = catalogo.dati ?? [];
  const descr = (c: string) => tutte.find((d) => d.codice === c)?.descrizione;

  const t = norm(testo.trim());
  const risultati = tutte.filter((d) => !valore.includes(d.codice) &&
    (!t || norm(d.descrizione).includes(t) || d.sinonimi.some((x) => norm(x).includes(t)) || d.codice.startsWith(testo.trim()))).slice(0, 12);
  const codiceLibero = testo.trim().toUpperCase();
  const offriCodice = CODICE_ICD9.test(codiceLibero) && !tutte.some((d) => d.codice === codiceLibero) && !valore.includes(codiceLibero);

  const aggiungi = (c: string) => { onChange([...valore, c]); setTesto(''); };

  return (
    <div className="text-sm">
      <span className="block text-slate-500">Diagnosi</span>
      {valore.length > 0 && (
        <ul className="mb-1 flex flex-wrap gap-1">
          {valore.map((c) => (
            <li key={c} className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-teal-900 ring-1 ring-teal-200">
              {descr(c) ?? 'Codice'} <span className="font-mono text-xs text-teal-700">{c}</span>
              <button type="button" aria-label={`Togli ${c}`} onClick={() => onChange(valore.filter((x) => x !== c))} className="px-1 text-teal-700">×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input value={testo} onChange={(e) => { setTesto(e.target.value); setAperto(true); }} onFocus={() => setAperto(true)}
               onBlur={() => window.setTimeout(() => setAperto(false), 150)}
               placeholder="Scrivi il nome: es. otite, bronchiolite, faringite…" aria-label="Cerca diagnosi"
               className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
        {aperto && (risultati.length > 0 || offriCodice) && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {risultati.map((d) => (
              <li key={d.codice}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => aggiungi(d.codice)}
                        className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-teal-50">
                  <span>{d.descrizione}</span><span className="font-mono text-xs text-slate-500">{d.codice}</span>
                </button>
              </li>
            ))}
            {offriCodice && (
              <li><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => aggiungi(codiceLibero)}
                          className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-teal-50">Usa il codice {codiceLibero} (non presente in elenco)</button></li>
            )}
          </ul>
        )}
      </div>
      <span className="text-xs text-slate-500">Codici ICD-9-CM (versione italiana 2007). Lasciare vuoto se non pertinente.</span>
    </div>
  );
}
