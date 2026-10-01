import { schemaCodice } from '@pls/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { esci } from '../lib/sessione';
import { supabase } from '../lib/supabase';

interface Iscrizione {
  factorId: string;
  qrCode: string;   // immagine SVG come data URL, da mostrare all'utente
  segreto: string;  // da digitare a mano se il QR non si legge
}

/**
 * Secondo fattore TOTP (Google Authenticator, Microsoft Authenticator, ecc.).
 * Primo accesso: mostra il QR da scansionare. Accessi successivi: chiede solo il codice.
 * Il database concede i dati clinici solo a sessioni di livello aal2.
 */
export default function SecondoFattore() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [iscrizione, setIscrizione] = useState<Iscrizione | null>(null);
  const [codice, setCodice] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    // In sviluppo React esegue l'effetto due volte: il flag evita doppie iscrizioni.
    let annullato = false;
    void (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (annullato) return;
      if (error) return setErrore('Impossibile leggere i fattori di autenticazione.');
      const verificato = data.totp.find((f) => f.status === 'verified');
      if (verificato) return setFactorId(verificato.id);

      // Pulizia di iscrizioni lasciate a metà, poi nuova iscrizione con QR.
      for (const f of data.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      if (annullato) return;
      const iscr = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Gestionale PLS' });
      if (annullato) return;
      if (iscr.error) return setErrore('Impossibile attivare il secondo fattore.');
      setFactorId(iscr.data.id);
      setIscrizione({ factorId: iscr.data.id, qrCode: iscr.data.totp.qr_code, segreto: iscr.data.totp.secret });
    })();
    return () => {
      annullato = true;
    };
  }, []);

  async function verifica(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    const dati = schemaCodice.safeParse({ codice });
    if (!dati.success) return setErrore(dati.error.issues[0]?.message ?? 'Codice non valido');
    setInCorso(true);
    setErrore(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: dati.data.codice });
    setInCorso(false);
    // In caso di successo la sessione passa ad aal2 e App mostra il cruscotto.
    if (error) setErrore("Codice errato. Controlla l'ora del telefono e riprova.");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">Verifica in due passaggi</h1>
      {iscrizione ? (
        <div className="mb-4 space-y-2 text-sm text-slate-600">
          <p>Scansiona il QR con un'app di autenticazione, poi inserisci il codice che mostra.</p>
          <img src={iscrizione.qrCode} alt="QR code per l'app di autenticazione" className="mx-auto h-48 w-48" />
          <p className="break-all text-xs">Codice manuale: <code>{iscrizione.segreto}</code></p>
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-600">Inserisci il codice della tua app di autenticazione.</p>
      )}

      <form onSubmit={verifica} className="space-y-3">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codice}
          onChange={(e) => setCodice(e.target.value)}
          aria-label="Codice a 6 cifre"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-xl tracking-widest"
          required
        />
        <button disabled={inCorso || !factorId} className="w-full rounded-lg bg-sky-700 py-2 font-medium text-white disabled:opacity-50">
          {inCorso ? 'Verifica…' : 'Conferma'}
        </button>
        <button type="button" onClick={() => void esci()} className="w-full text-sm text-slate-600 underline">
          Esci
        </button>
      </form>

      {errore && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{errore}</p>}
    </main>
  );
}
