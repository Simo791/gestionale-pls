import { etaLeggibile, type Appuntamento, type FiglioPortale, type Misurazione } from '@pls/shared';
import { useEffect, useState } from 'react';
import { esci } from '../lib/sessione';
import { supabase } from '../lib/supabase';

interface DatiFiglio {
  figlio: FiglioPortale;
  ultimaMisura: Misurazione | null;
  prossimo: Appuntamento | null;
}

interface Accesso {
  avvenuto_il: string;
  ruolo: string;
  azione: string;
}

const oggiISO = () => new Date().toISOString().slice(0, 10);

/**
 * Portale genitori, Fase 0: elenco dei figli visibili (relazione valida + consenso
 * al portale), ultima misurazione, prossimo appuntamento e registro accessi.
 */
export default function Figli() {
  const [dati, setDati] = useState<DatiFiglio[] | null>(null);
  const [registro, setRegistro] = useState<{ nome: string; righe: Accesso[] } | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.schema('api').rpc('miei_figli');
      const figli = (data ?? []) as FiglioPortale[];
      const risultati = await Promise.all(
        figli.map(async (figlio): Promise<DatiFiglio> => {
          const [misure, appuntamenti] = await Promise.all([
            supabase.schema('clinica').from('misurazioni').select('*')
              .eq('pseudo_id', figlio.pseudo_id).order('eta_giorni', { ascending: false }).limit(1),
            supabase.schema('anagrafica').from('appuntamenti').select('*')
              .eq('paziente_id', figlio.paziente_id).gte('inizio', new Date().toISOString())
              .order('inizio').limit(1),
          ]);
          return {
            figlio,
            ultimaMisura: ((misure.data ?? []) as Misurazione[])[0] ?? null,
            prossimo: ((appuntamenti.data ?? []) as Appuntamento[])[0] ?? null,
          };
        }),
      );
      setDati(risultati);
    })();
  }, []);

  async function mostraRegistro(figlio: FiglioPortale) {
    const { data } = await supabase.schema('api').rpc('registro_accessi', { p_paziente_id: figlio.paziente_id });
    setRegistro({ nome: figlio.nome, righe: (data ?? []) as Accesso[] });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">I miei figli</h1>
        <button onClick={() => void esci()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Esci</button>
      </header>

      {dati === null && <p className="text-slate-500">Caricamento…</p>}
      {dati?.length === 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Nessun figlio visibile. Lo studio deve registrare il collegamento e il tuo consenso all'uso del portale.
        </p>
      )}

      <ul className="space-y-4">
        {dati?.map(({ figlio, ultimaMisura, prossimo }) => (
          <li key={figlio.paziente_id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-lg font-medium">{figlio.nome}</p>
            <p className="mb-3 text-sm text-slate-500">{etaLeggibile(figlio.data_nascita, oggiISO())}</p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Ultimo peso</dt>
              <dd>{ultimaMisura?.peso_kg ? `${ultimaMisura.peso_kg} kg` : '—'}</dd>
              <dt className="text-slate-500">Ultima altezza</dt>
              <dd>{ultimaMisura?.altezza_cm ? `${ultimaMisura.altezza_cm} cm` : '—'}</dd>
              <dt className="text-slate-500">Prossimo appuntamento</dt>
              <dd>{prossimo ? new Date(prossimo.inizio).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd>
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
