import { schemaCodice, schemaEmail } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  titolo: string;
  /** Lo studio crea gli account dello staff: qui il login non deve crearne di nuovi. */
  creaNuoviUtenti: boolean;
}

/** Login senza password: email → codice a 6 cifre ricevuto via email (OTP). */
export default function Accesso({ titolo, creaNuoviUtenti }: Props) {
  const [email, setEmail] = useState('');
  const [codice, setCodice] = useState('');
  const [fase, setFase] = useState<'email' | 'codice'>('email');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function inviaCodice(e: FormEvent) {
    e.preventDefault();
    const dati = schemaEmail.safeParse({ email });
    if (!dati.success) return setErrore(dati.error.issues[0]?.message ?? 'Email non valida');
    setInCorso(true);
    setErrore(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: dati.data.email,
      options: { shouldCreateUser: creaNuoviUtenti },
    });
    setInCorso(false);
    if (error?.status === 429) return setErrore('Troppi tentativi: riprova tra qualche minuto.');
    if (error && !error.status) return setErrore('Connessione non riuscita. Riprova.');
    // Per gli altri errori (es. email non registrata) passiamo comunque al codice:
    // così non riveliamo quali email sono presenti nel sistema.
    setEmail(dati.data.email);
    setFase('codice');
  }

  async function verifica(e: FormEvent) {
    e.preventDefault();
    const dati = schemaCodice.safeParse({ codice });
    if (!dati.success) return setErrore(dati.error.issues[0]?.message ?? 'Codice non valido');
    setInCorso(true);
    setErrore(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: dati.data.codice, type: 'email' });
    setInCorso(false);
    if (error) setErrore('Codice errato o scaduto.');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">{titolo}</h1>
      <p className="mb-6 text-sm text-slate-600">
        {fase === 'email'
          ? 'Inserisci la tua email: ti inviamo un codice di accesso.'
          : `Abbiamo inviato un codice a ${email}.`}
      </p>

      {fase === 'email' ? (
        <form onSubmit={inviaCodice} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          />
          <button disabled={inCorso} className="w-full rounded-lg bg-sky-700 py-2 font-medium text-white disabled:opacity-50">
            {inCorso ? 'Invio…' : 'Invia codice'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifica} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="codice">Codice a 6 cifre</label>
          <input
            id="codice"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codice}
            onChange={(e) => setCodice(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-xl tracking-widest"
            required
          />
          <button disabled={inCorso} className="w-full rounded-lg bg-sky-700 py-2 font-medium text-white disabled:opacity-50">
            {inCorso ? 'Verifica…' : 'Accedi'}
          </button>
          <button type="button" onClick={() => setFase('email')} className="w-full text-sm text-slate-600 underline">
            Cambia email
          </button>
        </form>
      )}

      {errore && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{errore}</p>}
    </main>
  );
}
