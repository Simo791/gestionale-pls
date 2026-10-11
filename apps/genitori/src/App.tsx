import { useEffect, useState } from 'react';
import { esci, useSessione } from './lib/sessione';
import { supabase } from './lib/supabase';
import Accesso from './pagine/Accesso';
import Figli from './pagine/Figli';

/**
 * Primo accesso di un genitore: l'account Supabase viene creato al login con codice,
 * poi api.collega_account_tutore() lo associa al tutore registrato dallo studio con
 * la stessa email. Rinnovando la sessione, il JWT riceve app_ruolo = 'tutore'.
 */
export default function App() {
  const { caricamento, sessione, claims } = useSessione();
  const [collegamentoTentato, setCollegamentoTentato] = useState(false);
  const [erroreCollegamento, setErroreCollegamento] = useState<string | null>(null);

  useEffect(() => {
    if (!claims || claims.app_ruolo !== 'nessuno' || collegamentoTentato) return;
    setCollegamentoTentato(true);
    void (async () => {
      const { data, error } = await supabase.schema('api').rpc('collega_account_tutore');
      if (error) return setErroreCollegamento(error.message);
      if ((data as number | null) && (data as number) > 0) await supabase.auth.refreshSession();
    })();
  }, [claims, collegamentoTentato]);

  if (caricamento) return <p className="p-6 text-slate-500">Caricamento…</p>;
  if (!sessione || !claims) return <Accesso titolo="Gestionale PLS · Genitori" creaNuoviUtenti />;

  if (claims.app_ruolo !== 'tutore') {
    return (
      <main className="mx-auto max-w-sm px-4 py-16 text-center">
        <p className="mb-4">
          {claims.app_ruolo !== 'nessuno'
            ? 'Questo account appartiene allo staff dello studio: usa l’app dello studio. Per il portale genitori serve un’email diversa.'
            : erroreCollegamento
            ? `Non è stato possibile verificare l’account: ${erroreCollegamento}`
            : collegamentoTentato
            ? "Il tuo account non è ancora associato a nessun bambino. Chiedi allo studio di registrare questa email."
            : 'Verifica dell’account in corso…'}
        </p>
        <button onClick={() => void esci()} className="rounded-lg border border-slate-300 px-3 py-1.5">Esci</button>
      </main>
    );
  }

  return <Figli />;
}
