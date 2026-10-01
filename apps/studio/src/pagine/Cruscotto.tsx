import {
  etaInGiorni,
  etaLeggibile,
  type Appuntamento,
  type ClaimsApp,
  type EsitoVerificaAudit,
  type Misurazione,
  type Paziente,
  type Studio,
} from '@pls/shared';
import { useEffect, useState } from 'react';
import { esci } from '../lib/sessione';
import { supabase } from '../lib/supabase';

type AppuntamentoConPaziente = Appuntamento & { pazienti: Pick<Paziente, 'nome' | 'cognome'> | null };

const oggiISO = () => new Date().toISOString().slice(0, 10);
const ETICHETTE_TIPO: Record<Appuntamento['tipo'], string> = {
  visita: 'Visita',
  bilancio_salute: 'Bilancio di salute',
  vaccino: 'Vaccino',
  urgenza: 'Urgenza',
  certificato: 'Certificato',
};

/**
 * Cruscotto di Fase 0: dimostra che i permessi funzionano.
 * - la segreteria vede pazienti e agenda, ma non può aprire le cartelle;
 * - il pediatra (con MFA) apre la cartella: lo pseudonimo arriva dal database
 *   e l'apertura finisce nell'audit log;
 * - il semaforo verifica l'integrità della catena di audit.
 */
export default function Cruscotto({ claims }: { claims: ClaimsApp }) {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [pazienti, setPazienti] = useState<Paziente[]>([]);
  const [agenda, setAgenda] = useState<AppuntamentoConPaziente[]>([]);
  const [audit, setAudit] = useState<EsitoVerificaAudit | null>(null);
  const [aperto, setAperto] = useState<{ paziente: Paziente; misure: Misurazione[] } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const isPediatra = claims.app_ruolo === 'pediatra' || claims.app_ruolo === 'sostituto';

  useEffect(() => {
    const ana = supabase.schema('anagrafica');
    void ana.from('studi').select('*').single().then(({ data }) => setStudio(data as Studio | null));
    void ana
      .from('pazienti')
      .select('id, studio_id, pediatra_id, nome, cognome, data_nascita, sesso, data_scelta_pediatra, stato')
      .order('cognome')
      .then(({ data, error }) => (error ? setErrore(error.message) : setPazienti((data ?? []) as Paziente[])));
    void ana
      .from('appuntamenti')
      .select('*, pazienti(nome, cognome)')
      .gte('inizio', new Date().toISOString())
      .order('inizio')
      .limit(10)
      .then(({ data }) => setAgenda((data ?? []) as AppuntamentoConPaziente[]));
    if (claims.app_ruolo === 'pediatra') {
      void supabase
        .schema('api')
        .rpc('verifica_audit')
        .then(({ data }) => setAudit(((data ?? []) as EsitoVerificaAudit[])[0] ?? null));
    }
  }, [claims.app_ruolo]);

  async function apriCartella(paziente: Paziente) {
    setErrore(null);
    const { data: pseudoId, error } = await supabase
      .schema('api')
      .rpc('apri_cartella', { p_paziente_id: paziente.id });
    if (error) return setErrore('Accesso alla cartella non consentito.');
    const { data } = await supabase
      .schema('clinica')
      .from('misurazioni')
      .select('*')
      .eq('pseudo_id', pseudoId as string)
      .order('eta_giorni');
    setAperto({ paziente, misure: (data ?? []) as Misurazione[] });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{studio?.nome ?? 'Studio'}</h1>
          <p className="text-sm text-slate-600">
            {claims.email} · ruolo <strong>{claims.app_ruolo}</strong>
          </p>
        </div>
        <button onClick={() => void esci()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          Esci
        </button>
      </header>

      {errore && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{errore}</p>}

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <Kpi etichetta="Assistiti" valore={String(pazienti.length)} />
        <Kpi etichetta="Prossimi appuntamenti" valore={String(agenda.length)} />
        {claims.app_ruolo === 'pediatra' && (
          <Kpi
            etichetta="Registro di audit"
            valore={!audit ? '…' : audit.primo_evento_non_valido === null ? 'Integro' : `Alterato (#${audit.primo_evento_non_valido})`}
            colore={!audit ? 'neutro' : audit.primo_evento_non_valido === null ? 'verde' : 'rosso'}
          />
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Assistiti</h2>
          <ul className="divide-y divide-slate-100">
            {pazienti.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>
                  {p.cognome} {p.nome}
                  <span className="ml-2 text-sm text-slate-500">{etaLeggibile(p.data_nascita, oggiISO())}</span>
                </span>
                {isPediatra && (
                  <button onClick={() => void apriCartella(p)} className="text-sm text-sky-700 underline">
                    Apri cartella
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Agenda</h2>
          <ul className="divide-y divide-slate-100">
            {agenda.map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <strong>{new Date(a.inizio).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</strong>{' '}
                {ETICHETTE_TIPO[a.tipo]} · {a.pazienti ? `${a.pazienti.cognome} ${a.pazienti.nome}` : '—'}
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{a.stato}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {aperto && (
        <section className="mt-6 rounded-xl border border-sky-200 bg-white p-4">
          <h2 className="mb-1 font-semibold">
            Cartella di {aperto.paziente.nome} {aperto.paziente.cognome}
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Apertura registrata nell'audit log. Oggi: {etaInGiorni(aperto.paziente.data_nascita, oggiISO())} giorni di vita.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th>Età (giorni)</th><th>Peso (kg)</th><th>Altezza (cm)</th><th>Circ. cranica (cm)</th><th>BMI</th></tr>
            </thead>
            <tbody>
              {aperto.misure.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td>{m.eta_giorni}</td><td>{m.peso_kg ?? '—'}</td><td>{m.altezza_cm ?? '—'}</td>
                  <td>{m.circonferenza_cranica_cm ?? '—'}</td><td>{m.bmi ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Kpi({ etichetta, valore, colore = 'neutro' }: { etichetta: string; valore: string; colore?: 'neutro' | 'verde' | 'rosso' }) {
  const stile = { neutro: 'border-slate-200', verde: 'border-emerald-300 bg-emerald-50', rosso: 'border-red-300 bg-red-50' }[colore];
  return (
    <div className={`rounded-xl border bg-white p-4 ${stile}`}>
      <p className="text-sm text-slate-600">{etichetta}</p>
      <p className="text-2xl font-semibold">{valore}</p>
    </div>
  );
}
