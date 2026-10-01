import { isStaff, richiedeMfa, type ClaimsApp } from '@pls/shared';
import Layout from './componenti/Layout';
import { q, useDati } from './lib/dati';
import { useRotta } from './lib/rotta';
import { esci, useSessione } from './lib/sessione';
import { supabase } from './lib/supabase';
import Accesso from './pagine/Accesso';
import Account from './pagine/Account';
import Agenda from './pagine/Agenda';
import Assistiti from './pagine/Assistiti';
import Consensi from './pagine/Consensi';
import Cruscotto from './pagine/Cruscotto';
import Registro from './pagine/Registro';
import SchedaPaziente from './pagine/SchedaPaziente';
import SecondoFattore from './pagine/SecondoFattore';

/** Sequenza: login con codice email → secondo fattore TOTP → applicazione. */
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

  return <Applicazione claims={claims} />;
}

function Applicazione({ claims }: { claims: ClaimsApp }) {
  const rotta = useRotta();
  const studio = useDati(
    () => q<{ nome: string }>(supabase.schema('anagrafica').from('studi').select('nome').single()),
    [],
  );

  let pagina;
  switch (rotta.sezione) {
    case 'agenda':
      pagina = <Agenda claims={claims} />;
      break;
    case 'assistiti':
      pagina = rotta.id ? <SchedaPaziente key={rotta.id} id={rotta.id} claims={claims} /> : <Assistiti />;
      break;
    case 'consensi':
      pagina = <Consensi />;
      break;
    case 'registro':
      pagina = claims.app_ruolo === 'pediatra' ? <Registro /> : <Cruscotto claims={claims} />;
      break;
    case 'account':
      pagina = <Account claims={claims} />;
      break;
    default:
      pagina = <Cruscotto claims={claims} />;
  }

  return (
    <Layout claims={claims} rotta={rotta} nomeStudio={studio.dati?.nome ?? 'Studio'}>
      {pagina}
    </Layout>
  );
}
