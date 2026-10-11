import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Esito {
  ok: boolean;
  motivo?: 'link_non_valido' | 'revocato' | 'scaduto' | 'non_disponibile' | 'bloccato' | 'codice_errato' | 'errore';
  tentativi_rimasti?: number;
  descrizione?: string;
  scade_il?: string;
  documenti?: { nome: string; url: string }[];
}

const MESSAGGI: Record<NonNullable<Esito['motivo']>, string> = {
  link_non_valido: 'Il link non è valido. Controlla di averlo copiato per intero o chiedi allo studio di inviarlo di nuovo.',
  revocato: 'Lo studio ha disattivato questo link. Contatta lo studio.',
  scaduto: 'Il link è scaduto. Chiedi allo studio di inviare di nuovo i documenti.',
  non_disponibile: 'I documenti non sono ancora disponibili. Riprova più tardi.',
  bloccato: 'Troppi tentativi con una data errata: per sicurezza il link è bloccato. Contatta lo studio.',
  codice_errato: 'La data di nascita non corrisponde.',
  errore: 'Servizio momentaneamente non disponibile. Riprova più tardi.',
};

/**
 * Pagina pubblica per il genitore: dal link personale, con la data di nascita del bambino,
 * scarica i documenti della visita (link di scaricamento validi pochi minuti).
 */
export default function RitiroDocumenti({ token }: { token: string }) {
  const [data, setData] = useState('');
  const [esito, setEsito] = useState<Esito | null>(null);
  const [invio, setInvio] = useState(false);

  async function verifica(e: FormEvent) {
    e.preventDefault();
    setInvio(true);
    const [a, m, g] = data.split('-');
    const { data: r, error } = await supabase.functions.invoke('ritiro-documenti', { body: { token, codice: `${g}${m}${a}` } });
    setInvio(false);
    setEsito(error ? { ok: false, motivo: 'errore' } : (r as Esito));
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-semibold text-slate-900">Documenti dallo studio pediatrico</h1>
      {esito?.ok ? (
        <section className="mt-4 space-y-3">
          <p className="text-slate-700">{esito.descrizione}</p>
          <ul className="space-y-2">
            {esito.documenti?.map((d) => (
              <li key={d.url}>
                <a href={d.url} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 font-medium text-teal-800 hover:border-teal-600">
                  {d.nome} <span className="text-sm">Scarica</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            I pulsanti valgono pochi minuti: se scadono, ricarica la pagina e inserisci di nuovo la data.
            Il link resta attivo fino al {esito.scade_il ? new Date(esito.scade_il).toLocaleDateString('it-IT') : '—'}. Conserva i documenti in un posto sicuro.
          </p>
        </section>
      ) : esito && esito.motivo !== 'codice_errato' && esito.motivo !== 'errore' ? (
        <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">{MESSAGGI[esito.motivo ?? 'errore']}</p>
      ) : (
        <form onSubmit={(e) => void verifica(e)} className="mt-4 space-y-3">
          <p className="text-slate-700">Per aprire i documenti inserisci la <b>data di nascita del bambino</b>.</p>
          <input type="date" required value={data} onChange={(e) => setData(e.target.value)} max={new Date().toLocaleDateString('sv-SE')}
                 className="w-full rounded-lg border border-slate-300 px-3 py-2" aria-label="Data di nascita del bambino" />
          {esito?.motivo === 'codice_errato' && (
            <p role="alert" className="text-sm text-rose-700">{MESSAGGI.codice_errato}{esito.tentativi_rimasti !== undefined ? ` Tentativi rimasti: ${esito.tentativi_rimasti}.` : ''}</p>
          )}
          {esito?.motivo === 'errore' && <p role="alert" className="text-sm text-rose-700">{MESSAGGI.errore}</p>}
          <button type="submit" disabled={invio || !data} className="w-full rounded-lg bg-teal-700 px-4 py-2 font-medium text-white disabled:opacity-50">
            {invio ? 'Verifica…' : 'Apri i documenti'}
          </button>
          <p className="text-xs text-slate-500">Ogni apertura viene registrata dallo studio. Se non aspettavi questi documenti, chiudi la pagina e avvisa lo studio.</p>
        </form>
      )}
    </main>
  );
}
