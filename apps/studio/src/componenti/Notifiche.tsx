import type { Notifica } from '@pls/shared';
import { useEffect, useState } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtDataOra } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Bottone } from './ui';

const AGGIORNAMENTO_MS = 60_000;

/** Notifiche dell'utente (solo le proprie: lo impone la RLS), aggiornate ogni minuto. */
export function useNotifiche() {
  const dati = useDati(
    () => q<Notifica[]>(supabase.schema('anagrafica').from('notifiche').select('*').order('creato_il', { ascending: false }).limit(30)),
    [],
  );
  useEffect(() => {
    const t = window.setInterval(() => dati.ricarica(), AGGIORNAMENTO_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function segnaLette(ids: string[]) {
    if (ids.length === 0) return;
    await supabase.schema('anagrafica').from('notifiche').update({ letta_il: new Date().toISOString() }).in('id', ids);
    dati.ricarica();
  }
  const elenco = dati.dati ?? [];
  return { elenco, nonLette: elenco.filter((n) => !n.letta_il), segnaLette, errore: dati.errore };
}

function Voce({ n, onApri }: { n: Notifica; onApri: () => void }) {
  return (
    <li className={`py-2 text-sm ${n.letta_il ? 'text-slate-500' : ''}`}>
      <a href={n.link ?? '#/cruscotto'} onClick={onApri} className="block hover:underline">
        <span className={n.letta_il ? '' : 'font-semibold text-slate-900'}>{n.titolo}</span>
      </a>
      {n.testo && <p className="whitespace-pre-line text-slate-600">{n.testo}</p>}
      <p className="text-xs text-slate-400">{fmtDataOra(n.creato_il)}</p>
    </li>
  );
}

/** Campanella nella barra: numero di notifiche non lette ed elenco a comparsa. */
export function Campanella({ lato = 'sinistra' }: { lato?: 'sinistra' | 'destra' }) {
  const { elenco, nonLette, segnaLette } = useNotifiche();
  const [aperta, setAperta] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setAperta((v) => !v)} aria-label={`Notifiche: ${nonLette.length} non lette`}
              className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 004 0" />
        </svg>
        {nonLette.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-semibold text-white">{nonLette.length}</span>
        )}
      </button>
      {aperta && (
        <div className={`absolute ${lato === 'sinistra' ? 'left-0' : 'right-0'} z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg`}>
          <div className="mb-1 flex items-center justify-between">
            <p className="font-semibold text-slate-900">Notifiche</p>
            {nonLette.length > 0 && <button className="text-xs text-teal-700 underline" onClick={() => void segnaLette(nonLette.map((n) => n.id))}>Segna tutte come lette</button>}
          </div>
          {elenco.length === 0 ? <p className="text-sm text-slate-500">Nessuna notifica.</p> : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {elenco.map((n) => <Voce key={n.id} n={n} onApri={() => { setAperta(false); void segnaLette([n.id]); }} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Riquadro in cima al cruscotto: le notifiche non lette appena si accede. */
export function NotificheNonLette() {
  const { nonLette, segnaLette } = useNotifiche();
  if (nonLette.length === 0) return null;
  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-teal-900">Hai {nonLette.length} {nonLette.length === 1 ? 'notifica' : 'notifiche'} da leggere</h2>
        <Bottone onClick={() => void segnaLette(nonLette.map((n) => n.id))}>Segna come lette</Bottone>
      </div>
      <ul className="divide-y divide-teal-100">
        {nonLette.slice(0, 5).map((n) => <Voce key={n.id} n={n} onApri={() => void segnaLette([n.id])} />)}
      </ul>
    </section>
  );
}
