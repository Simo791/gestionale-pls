import type { CampoModello, ModelloTesto } from '@pls/shared';
import { q, useDati } from '../lib/dati';
import { supabase } from '../lib/supabase';

/** Menu per inserire un modello di testo (definiti in Account), raggruppati per patologia. */
export default function InserisciModello({ campo, onInserisci }: { campo: CampoModello; onInserisci: (testo: string) => void }) {
  const modelli = useDati(
    () => q<ModelloTesto[]>(supabase.schema('anagrafica').from('modelli_testo').select('*').eq('campo', campo).order('patologia').order('nome')),
    [campo],
  );
  const elenco = modelli.dati ?? [];
  if (elenco.length === 0) return null;
  const patologie = [...new Set(elenco.map((m) => m.patologia))];
  return (
    <select value="" aria-label="Inserisci un modello"
            onChange={(e) => { const m = elenco.find((x) => x.id === e.target.value); if (m) onInserisci(m.testo); }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700">
      <option value="">+ Inserisci modello…</option>
      {patologie.map((p) => (
        <optgroup key={p} label={p}>
          {elenco.filter((m) => m.patologia === p).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
