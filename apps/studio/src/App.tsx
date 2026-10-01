import { isStaff, richiedeMfa } from '@pls/shared';
import { esci, useSessione } from './lib/sessione';
import Accesso from './pagine/Accesso';
import Cruscotto from './pagine/Cruscotto';
import SecondoFattore from './pagine/SecondoFattore';

/** Sequenza: login con codice email → secondo fattore TOTP → cruscotto. */
export default function App() {
  const { caricamento, sessione, claims } = useSessione();

  if (caricamento) return <p className="p-6 text-slate-500">Caricamento…</p>;
  if (!sessione || !claims) return <Accesso titolo="Gestionale PLS · Studio" creaNuoviUtenti={false} />;

  if (!isStaff(claims.app_ruolo)) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16 text-center">
        <p className="mb-4">Questo account non è abilitato all'app dello studio.</p>
        <button onClick={() => void esci()} className="rounded-lg border border-slate-300 px-3 py-1.5">Esci</button>
      </main>
    );
  }

  if (richiedeMfa(claims.app_ruolo) && claims.aal !== 'aal2') return <SecondoFattore />;

  return <Cruscotto claims={claims} />;
}
