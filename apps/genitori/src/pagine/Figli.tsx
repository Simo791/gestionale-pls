import { etaLeggibile, type FiglioPortale } from '@pls/shared';
import { useEffect, useState } from 'react';
import { dataOra, oggiISO } from '../lib/formato';
import { esci } from '../lib/sessione';
import { supabase } from '../lib/supabase';
import Consensi from './Consensi';
import Figlio from './Figlio';

interface ProssimoAppuntamento { id: string; inizio: string; fine: string; tipo: string; stato: 'richiesto' | 'confermato' }
interface DatiFiglio { figlio: FiglioPortale; prossimo: ProssimoAppuntamento | null; inAttesa: ProssimoAppuntamento | null }

/**
 * Portale genitori: i figli (visibili con relazione valida e consenso al portale),
 * la scheda di ciascuno e i consensi da leggere e firmare.
 */
export default function Figli() {
  const [vista, setVista] = useState<'figli' | 'consensi'>('figli');
  const [dati, setDati] = useState<DatiFiglio[] | null>(null);
  const [aperto, setAperto] = useState<FiglioPortale | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [daFirmare, setDaFirmare] = useState(0);
  const [versione, setVersione] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const [figliR, consensiR] = await Promise.all([
          supabase.schema('api').rpc('miei_figli'),
          supabase.schema('api').rpc('portale_consensi'),
        ]);
        if (figliR.error) throw new Error(figliR.error.message);
        if (consensiR.error) setErrore(`consensi non disponibili (${consensiR.error.message})`);
        else setDaFirmare(((consensiR.data ?? []) as { stato: string | null }[]).filter((c) => !c.stato || c.stato === 'da_rinnovare').length);
        const figli = (figliR.data ?? []) as FiglioPortale[];
        const risultati = await Promise.all(figli.map(async (figlio): Promise<DatiFiglio> => {
          // Solo data, tipo e stato: le note interne dello studio non escono verso il portale.
          // Un errore su un figlio non nasconde gli altri.
          const app = await supabase.schema('api').rpc('appuntamenti_figlio', { p_paziente_id: figlio.paziente_id });
          if (app.error) return { figlio, prossimo: null, inAttesa: null };
          const elenco = (app.data ?? []) as ProssimoAppuntamento[];
          return { figlio, prossimo: elenco.find((a) => a.stato === 'confermato') ?? null, inAttesa: elenco.find((a) => a.stato === 'richiesto') ?? null };
        }));
        setDati(risultati);
      } catch (e) {
        setErrore(e instanceof Error ? e.message : String(e));
        setDati([]);
      }
    })();
  }, [versione]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700">Portale genitori</p>
          <h1 className="text-xl font-semibold">{vista === 'consensi' ? 'Consensi' : aperto ? aperto.nome : 'I miei figli'}</h1>
        </div>
        <button onClick={() => void esci()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Esci</button>
      </header>
      <nav className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm" aria-label="Sezioni del portale">
        {([['figli', 'Figli'], ['consensi', `Consensi${daFirmare ? ` (${daFirmare})` : ''}`]] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setVista(k); setAperto(null); }} aria-current={vista === k ? 'page' : undefined}
                  className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${vista === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>{t}</button>
        ))}
      </nav>

      {vista === 'consensi' ? <Consensi onCambio={() => setVersione((v) => v + 1)} />
        : aperto ? <Figlio figlio={aperto} onIndietro={() => setAperto(null)} />
        : (
        <>
          {dati === null && <p className="text-slate-500">Caricamento…</p>}
          {errore && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">Si è verificato un errore: {errore}. Riprova più tardi.</p>}
          {daFirmare > 0 && (
            <button onClick={() => setVista('consensi')} className="mb-4 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-900">
              {daFirmare === 1 ? 'Un consenso è' : `${daFirmare} consensi sono`} in attesa di una tua scelta. <span className="underline">Apri i consensi</span>
            </button>
          )}
          {dati?.length === 0 && !errore && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Nessun figlio visibile. Per vedere i dati serve il tuo consenso «Portale genitori» (sezione Consensi); per visite e documenti
              anche il consenso «Dati sanitari». Se non vedi tuo figlio nemmeno tra i consensi, chiedi allo studio di registrare il collegamento.
            </p>
          )}
          <ul className="space-y-3">
            {dati?.map(({ figlio, prossimo, inAttesa }) => (
              <li key={figlio.paziente_id}>
                <button onClick={() => setAperto(figlio)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-sky-600">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-lg font-medium">{figlio.nome}</p>
                      <p className="text-sm text-slate-500">{etaLeggibile(figlio.data_nascita, oggiISO())}</p>
                    </div>
                    <span className="text-sm text-sky-700">Apri ›</span>
                  </div>
                  <p className="mt-2 text-sm">
                    <span className="text-slate-500">Prossimo appuntamento: </span>{prossimo ? dataOra(prossimo.inizio) : '—'}
                    {inAttesa && <span className="block text-amber-800">Richiesta del {dataOra(inAttesa.inizio)} in attesa di conferma</span>}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
