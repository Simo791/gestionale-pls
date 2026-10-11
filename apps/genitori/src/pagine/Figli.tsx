import { etaLeggibile, type FiglioPortale } from '@pls/shared';
import { useEffect, useState } from 'react';
import { esci } from '../lib/sessione';
import { supabase } from '../lib/supabase';

interface ProssimoAppuntamento { id: string; inizio: string; fine: string; tipo: string; stato: 'richiesto' | 'confermato' }

interface DatiFiglio {
  figlio: FiglioPortale;
  peso: number | null;
  altezza: number | null;
  /** Prossimo appuntamento confermato e, se c'è, richiesta in attesa di conferma. */
  prossimo: ProssimoAppuntamento | null;
  inAttesa: ProssimoAppuntamento | null;
}

interface Accesso {
  avvenuto_il: string;
  ruolo: string;
  azione: string;
}

/** Data di oggi nel fuso locale (toISOString darebbe il giorno UTC). */
const oggiISO = () => new Date().toLocaleDateString('sv-SE');

/**
 * Portale genitori, Fase 0: elenco dei figli visibili (relazione valida + consenso
 * al portale), ultima misurazione, prossimo appuntamento e registro accessi.
 */
export default function Figli() {
  const [dati, setDati] = useState<DatiFiglio[] | null>(null);
  const [registro, setRegistro] = useState<{ nome: string; righe: Accesso[] } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await supabase.schema('api').rpc('miei_figli');
        if (error) throw new Error(error.message);
        const figli = (data ?? []) as FiglioPortale[];
        const ultimo = async (colonna: 'peso_kg' | 'altezza_cm', pseudo: string) => {
          const r = await supabase.schema('clinica').from('misurazioni').select(colonna)
            .eq('pseudo_id', pseudo).not(colonna, 'is', null).order('eta_giorni', { ascending: false }).limit(1);
          if (r.error) throw new Error(r.error.message);
          return ((r.data ?? [])[0] as Record<string, number> | undefined)?.[colonna] ?? null;
        };
        const risultati = await Promise.all(
          figli.map(async (figlio): Promise<DatiFiglio> => {
            // Gli appuntamenti arrivano da una RPC che restituisce solo data, tipo e stato
            // (le note interne dello studio non escono mai verso il portale).
            const [peso, altezza, app] = await Promise.all([
              ultimo('peso_kg', figlio.pseudo_id), ultimo('altezza_cm', figlio.pseudo_id),
              supabase.schema('api').rpc('appuntamenti_figlio', { p_paziente_id: figlio.paziente_id }),
            ]);
            if (app.error) throw new Error(app.error.message);
            const elenco = (app.data ?? []) as ProssimoAppuntamento[];
            return {
              figlio, peso, altezza,
              prossimo: elenco.find((a) => a.stato === 'confermato') ?? null,
              inAttesa: elenco.find((a) => a.stato === 'richiesto') ?? null,
            };
          }),
        );
        setDati(risultati);
      } catch (e) {
        setErrore(e instanceof Error ? e.message : String(e));
        setDati([]);
      }
    })();
  }, []);

  async function mostraRegistro(figlio: FiglioPortale) {
    const { data, error } = await supabase.schema('api').rpc('registro_accessi', { p_paziente_id: figlio.paziente_id });
    if (error) return setErrore(`Registro accessi non disponibile: ${error.message}`);
    setRegistro({ nome: figlio.nome, righe: (data ?? []) as Accesso[] });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">I miei figli</h1>
        <button onClick={() => void esci()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Esci</button>
      </header>

      {dati === null && <p className="text-slate-500">Caricamento…</p>}
      {errore && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">Si è verificato un errore: {errore}. Riprova più tardi.</p>}
      {dati?.length === 0 && !errore && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Nessun figlio visibile. Lo studio deve registrare il collegamento e il tuo consenso all'uso del portale.
        </p>
      )}

      <ul className="space-y-4">
        {dati?.map(({ figlio, peso, altezza, prossimo, inAttesa }) => (
          <li key={figlio.paziente_id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-lg font-medium">{figlio.nome}</p>
            <p className="mb-3 text-sm text-slate-500">{etaLeggibile(figlio.data_nascita, oggiISO())}</p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Ultimo peso</dt>
              <dd>{peso != null ? `${String(peso).replace('.', ',')} kg` : '—'}</dd>
              <dt className="text-slate-500">Ultima altezza</dt>
              <dd>{altezza != null ? `${String(altezza).replace('.', ',')} cm` : '—'}</dd>
              <dt className="text-slate-500">Prossimo appuntamento</dt>
              <dd>{prossimo ? new Date(prossimo.inizio).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd>
              {inAttesa && <>
                <dt className="text-slate-500">Richiesta in attesa</dt>
                <dd>{new Date(inAttesa.inizio).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })} (da confermare)</dd>
              </>}
            </dl>
            <button onClick={() => void mostraRegistro(figlio)} className="mt-3 text-sm text-sky-700 underline">
              Chi ha consultato i dati
            </button>
          </li>
        ))}
      </ul>

      {registro && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">Accessi ai dati di {registro.nome}</h2>
          <ul className="space-y-1">
            {registro.righe.map((r, i) => (
              <li key={i}>
                {new Date(r.avvenuto_il).toLocaleString('it-IT')} · {r.ruolo} · {r.azione}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
