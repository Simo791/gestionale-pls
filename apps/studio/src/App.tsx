import { richiedeMfa, usaAppStudio, type ClaimsApp } from '@pls/shared';
import { useEffect, useState } from 'react';
import Layout from './componenti/Layout';
import { q, useDati } from './lib/dati';
import { sezioneSpecialista, useRotta } from './lib/rotta';
import { esci, useSessione } from './lib/sessione';
import { supabase } from './lib/supabase';
import Accesso from './pagine/Accesso';
import Account from './pagine/Account';
import Agenda from './pagine/Agenda';
import Amministrazione from './pagine/Amministrazione';
import Allergologia from './pagine/Allergologia';
import Assistiti from './pagine/Assistiti';
import Auxologia from './pagine/Auxologia';
import Consensi from './pagine/Consensi';
import Cruscotto from './pagine/Cruscotto';
import Patologie from './pagine/Patologie';
import Registro from './pagine/Registro';
import SchedaAllergologica from './pagine/SchedaAllergologica';
import SchedaAuxologica from './pagine/SchedaAuxologica';
import RitiroDocumenti from './pagine/RitiroDocumenti';
import SchedaPaziente from './pagine/SchedaPaziente';
import SecondoFattore from './pagine/SecondoFattore';

/** Sequenza: login con codice email → secondo fattore TOTP → applicazione. */
export default function App() {
  const { caricamento, sessione, claims } = useSessione();
  // Se il link del genitore viene incollato in una scheda già aperta, la pagina si aggiorna.
  const [, setHash] = useState(window.location.hash);
  useEffect(() => {
    const f = () => setHash(window.location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  // Link inviato al genitore: pagina pubblica di ritiro dei documenti, senza accesso.
  const ritiro = /^#\/ritiro\/([0-9a-f]{48})$/.exec(window.location.hash)?.[1];
  if (ritiro) return <RitiroDocumenti token={ritiro} />;

  if (caricamento) return <p className="p-6 text-slate-500">Caricamento…</p>;
  if (!sessione || !claims) return <Accesso titolo="Gestionale PLS · Studio" creaNuoviUtenti={false} />;

  if (!usaAppStudio(claims.app_ruolo)) {
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

  // Lo specialista (non amministratore) vede solo il proprio modulo e il proprio account.
  const modulo = sezioneSpecialista(claims);
  const sezione = modulo && rotta.sezione !== 'account' ? modulo : rotta.sezione;

  let pagina;
  switch (sezione) {
    case 'allergologia':
      pagina = rotta.sezione === 'allergologia' && rotta.id && claims.app_allergologia
        ? <SchedaAllergologica key={rotta.id} id={rotta.id} claims={claims} />
        : <Allergologia claims={claims} />;
      break;
    case 'auxologia':
      pagina = rotta.sezione === 'auxologia' && rotta.id && claims.app_auxologia
        ? <SchedaAuxologica key={rotta.id} id={rotta.id} claims={claims} />
        : <Auxologia claims={claims} />;
      break;
    case 'agenda':
      pagina = <Agenda claims={claims} />;
      break;
    case 'assistiti':
      pagina = rotta.id ? <SchedaPaziente key={rotta.id} id={rotta.id} claims={claims} azione={rotta.azione} /> : <Assistiti />;
      break;
    case 'consensi':
      pagina = <Consensi />;
      break;
    case 'registro':
      pagina = claims.app_ruolo === 'pediatra' || claims.app_admin ? <Registro /> : <Cruscotto claims={claims} />;
      break;
    case 'amministrazione':
      pagina = claims.app_admin ? <Amministrazione claims={claims} sezione={rotta.id} /> : <Cruscotto claims={claims} />;
      break;
    case 'patologie':
      pagina = <Patologie key={rotta.id ?? 'catalogo'} claims={claims} codice={rotta.id} />;
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
