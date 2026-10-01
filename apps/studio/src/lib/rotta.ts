import { useEffect, useState } from 'react';

/**
 * Navigazione minima basata sull'hash dell'URL (#/agenda, #/assistiti/<id>):
 * niente librerie aggiuntive, il tasto "indietro" del browser funziona e
 * ogni pagina ha un indirizzo che si può salvare nei preferiti.
 */
export type Sezione = 'cruscotto' | 'agenda' | 'assistiti' | 'consensi' | 'registro';

export interface Rotta {
  sezione: Sezione;
  id?: string;
}

const SEZIONI: readonly Sezione[] = ['cruscotto', 'agenda', 'assistiti', 'consensi', 'registro'];

function leggi(): Rotta {
  const [sezione, id] = window.location.hash.replace(/^#\/?/, '').split('/');
  return {
    sezione: SEZIONI.includes(sezione as Sezione) ? (sezione as Sezione) : 'cruscotto',
    id: id || undefined,
  };
}

export function useRotta(): Rotta {
  const [rotta, setRotta] = useState<Rotta>(leggi);
  useEffect(() => {
    const aggiorna = () => {
      setRotta(leggi());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', aggiorna);
    return () => window.removeEventListener('hashchange', aggiorna);
  }, []);
  return rotta;
}

export const link = (sezione: Sezione, id?: string) => `#/${sezione}${id ? `/${id}` : ''}`;
