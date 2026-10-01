import { useCallback, useEffect, useState } from 'react';

/** Risposta di Supabase: dati oppure errore. */
interface Risposta {
  data: unknown;
  error: { message: string } | null;
}

/** Trasforma una risposta di Supabase in dati tipizzati o in un'eccezione leggibile. */
export async function q<T>(richiesta: PromiseLike<Risposta>): Promise<T> {
  const { data, error } = await richiesta;
  if (error) throw new Error(error.message);
  return data as T;
}

export interface StatoDati<T> {
  dati: T | null;
  errore: string | null;
  caricamento: boolean;
  ricarica: () => void;
}

/**
 * Carica dati quando cambia una delle dipendenze e ignora le risposte arrivate
 * dopo che l'utente ha già cambiato pagina.
 */
export function useDati<T>(carica: () => Promise<T>, dipendenze: readonly unknown[]): StatoDati<T> {
  const [versione, setVersione] = useState(0);
  const [stato, setStato] = useState<Omit<StatoDati<T>, 'ricarica'>>({
    dati: null,
    errore: null,
    caricamento: true,
  });

  useEffect(() => {
    let attivo = true;
    setStato((s) => ({ ...s, caricamento: true, errore: null }));
    carica()
      .then((dati) => attivo && setStato({ dati, errore: null, caricamento: false }))
      .catch((e: unknown) =>
        attivo && setStato({ dati: null, errore: e instanceof Error ? e.message : String(e), caricamento: false }),
      );
    return () => {
      attivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dipendenze, versione]);

  const ricarica = useCallback(() => setVersione((v) => v + 1), []);
  return { ...stato, ricarica };
}
