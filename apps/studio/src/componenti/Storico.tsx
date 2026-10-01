import type { VoceStorico } from '@pls/shared';
import { fmtDataOra } from '../lib/formato';

const valore = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sì' : 'no';
  if (Array.isArray(v)) return v.length ? v.join('; ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** Elenco delle modifiche (chi, quando, cosa: valore prima → dopo). */
export default function Storico({ voci, etichette, autori }: {
  voci: (VoceStorico & { autore_nome?: string | null; motivo?: string | null })[];
  etichette: Record<string, string>;
  autori?: Map<string, string>;
}) {
  if (voci.length === 0) return <p className="text-xs text-slate-500">Nessuna modifica registrata.</p>;
  return (
    <ol className="space-y-2 border-l-2 border-slate-200 pl-3 text-xs">
      {voci.map((v) => {
        const campi = v.campi.filter((c) => c in etichette);
        return (
          <li key={v.id}>
            <p className="text-slate-500">
              {fmtDataOra(v.avvenuto_il)} · {v.autore_nome || (v.autore && autori?.get(v.autore)) || 'utente'} ·{' '}
              {v.operazione === 'INSERT' ? 'creazione' : 'modifica'}
            </p>
            {v.motivo && <p className="italic text-slate-600">Motivo: {v.motivo}</p>}
            {v.operazione === 'UPDATE' && (
              <ul className="text-slate-700">
                {campi.map((c) => (
                  <li key={c}><span className="font-medium">{etichette[c]}</span>: {valore(v.prima?.[c])} → {valore(v.dopo[c])}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
