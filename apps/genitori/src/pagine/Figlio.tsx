import { etaLeggibile, type FiglioPortale, type PrestazionePrescritta } from '@pls/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { dataOra, giorno, oggiISO, PRIORITA, STATO_APPUNTAMENTO, TIPO_APPUNTAMENTO, TIPO_CERTIFICATO, TIPO_VISITA } from '../lib/formato';
import { supabase } from '../lib/supabase';

interface Appuntamento { id: string; inizio: string; tipo: string; stato: string }
interface VisitaPortale { id: string; data: string; tipo: string; motivo: string; terapia: string | null; indicazioni: string | null; prossimo_controllo: string | null }
interface CertificatoPortale {
  id: string; data: string; tipo: string; valido_fino: string | null;
  contenuto: { allergeni?: { nome: string }[]; tracce?: boolean; rischio_grave?: boolean; farmaco_emergenza?: string | null; scuola?: string | null; note?: string | null } | null;
}
interface PrescrizionePortale { id: string; data: string; priorita: string | null; quesito: string; prestazioni: PrestazionePrescritta[] }
interface Storico { appuntamenti: Appuntamento[]; visite: VisitaPortale[]; certificati: CertificatoPortale[]; prescrizioni: PrescrizionePortale[]; misure: Misura[]; vaccini: Vaccino[] }
interface Misura { id: string; eta_giorni: number; peso_kg: number | null; altezza_cm: number | null; circonferenza_cranica_cm: number | null }
interface Vaccino { id: string; vaccino: string; dose: number; data: string }
interface Accesso { avvenuto_il: string; ruolo: string; azione: string }

/** Data di una misura dall'età in giorni. */
const dataMisura = (nascita: string, giorni: number) => {
  const d = new Date(`${nascita}T12:00:00`);
  d.setDate(d.getDate() + giorni);
  return d.toLocaleDateString('it-IT', { dateStyle: 'medium' });
};
const num = (x: number | null) => (x == null ? '—' : String(x).replace('.', ','));
const RUOLI: Record<string, string> = {
  pediatra: 'Pediatra', sostituto: 'Pediatra sostituto', segreteria: 'Segreteria', allergologo: 'Allergologo', tutore: 'Genitore', nessuno: 'Sistema',
};
const AZIONI: Record<string, string> = {
  APERTURA_CARTELLA: 'Apertura della cartella', APERTURA_CARTELLA_LETTURA: 'Consultazione della cartella (segreteria)',
  CONSULTAZIONE_PORTALE: 'Consultazione dal portale', FIRMA_CONSENSO: 'Firma di un consenso', LETTURA_CODICE_FISCALE: 'Lettura del codice fiscale',
  INSERT: 'Inserimento di dati', UPDATE: 'Modifica di dati', DELETE: 'Cancellazione di dati', SELECT: 'Consultazione',
};

function Sezione({ titolo, conteggio, aperta = false, children }: { titolo: string; conteggio?: number; aperta?: boolean; children: ReactNode }) {
  return (
    <details open={aperta} className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-slate-400 transition group-open:rotate-90" aria-hidden="true">›</span>
        <span className="flex-1 font-medium">{titolo}</span>
        {conteggio !== undefined && <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-700">{conteggio}</span>}
      </summary>
      <div className="border-t border-slate-100 px-4 py-3 text-sm">{children}</div>
    </details>
  );
}

/**
 * Scheda del figlio nel portale: appuntamenti futuri e passati, visite con indicazioni
 * e terapia, documenti (certificati, prescrizioni), crescita e vaccinazioni.
 * Nessuna nota interna dello studio esce verso il portale.
 */
export default function Figlio({ figlio, onIndietro }: { figlio: FiglioPortale; onIndietro: () => void }) {
  const [prossimi, setProssimi] = useState<Appuntamento[] | null>(null);
  const [storico, setStorico] = useState<Storico | null>(null);
  const [accessi, setAccessi] = useState<Accesso[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [daStampare, setDaStampare] = useState<ReactNode>(null);

  useEffect(() => {
    void (async () => {
      const api = supabase.schema('api');
      // Misure e vaccini arrivano dalla stessa RPC dello storico (solo campi per la famiglia, consultazione registrata).
      const [p, s] = await Promise.all([
        api.rpc('appuntamenti_figlio', { p_paziente_id: figlio.paziente_id }),
        api.rpc('portale_storico_figlio', { p_paziente_id: figlio.paziente_id }),
      ]);
      const primo = [p.error, s.error].find(Boolean);
      if (primo) setErrore(/non autorizzato/i.test(primo.message) ? 'per vedere visite e documenti serve il consenso «Dati sanitari» di almeno un genitore' : primo.message);
      setProssimi((p.data ?? []) as Appuntamento[]);
      setStorico((s.data as Storico | null) ?? { appuntamenti: [], visite: [], certificati: [], prescrizioni: [], misure: [], vaccini: [] });
    })();
  }, [figlio]);

  // La stampa parte dal clic (alcuni telefoni bloccano window.print fuori dal gesto dell'utente).
  function stampa(contenuto: ReactNode) {
    flushSync(() => setDaStampare(contenuto));
    window.addEventListener('afterprint', () => setDaStampare(null), { once: true });
    window.print();
  }

  async function caricaAccessi() {
    const { data, error } = await supabase.schema('api').rpc('registro_accessi', { p_paziente_id: figlio.paziente_id });
    if (error) return setErrore(`Registro accessi non disponibile: ${error.message}`);
    setAccessi((data ?? []) as Accesso[]);
  }

  const intestazione = (titolo: string) => (
    <div className="mb-4 border-b border-black pb-2">
      <p className="text-sm">{figlio.nome} · nato/a il {giorno(figlio.data_nascita)}</p>
      <h1 className="text-xl font-semibold">{titolo}</h1>
      <p className="text-xs">Copia per la famiglia stampata dal portale genitori il {giorno(oggiISO())}. Non sostituisce il documento firmato dal medico.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <button onClick={onIndietro} className="text-sm text-sky-700 underline">‹ Tutti i figli</button>
      <p className="text-sm text-slate-500">{etaLeggibile(figlio.data_nascita, oggiISO())}</p>
      {errore && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">Alcuni dati non sono disponibili: {errore}</p>}

      <Sezione titolo="Prossimi appuntamenti" conteggio={prossimi?.length} aperta>
        {prossimi === null ? 'Caricamento…' : prossimi.length === 0 ? <p className="text-slate-500">Nessun appuntamento in programma.</p> : (
          <ul className="divide-y divide-slate-100">
            {prossimi.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span>{dataOra(a.inizio)} · {TIPO_APPUNTAMENTO[a.tipo as keyof typeof TIPO_APPUNTAMENTO] ?? a.tipo}</span>
                <span className={`text-xs ${a.stato === 'richiesto' ? 'text-amber-800' : 'text-emerald-800'}`}>{STATO_APPUNTAMENTO[a.stato]}</span>
              </li>
            ))}
          </ul>
        )}
      </Sezione>

      <Sezione titolo="Visite" conteggio={storico?.visite.length}>
        {!storico ? 'Caricamento…' : storico.visite.length === 0 ? <p className="text-slate-500">Nessuna visita registrata.</p> : (
          <ul className="space-y-2">
            {storico.visite.map((v) => {
              const corpo = (
                <dl className="space-y-1">
                  <div><dt className="inline text-slate-500">Motivo: </dt><dd className="inline">{v.motivo}</dd></div>
                  {v.terapia && <div><dt className="text-slate-500">Terapia</dt><dd className="whitespace-pre-line">{v.terapia}</dd></div>}
                  {v.indicazioni && <div><dt className="text-slate-500">Indicazioni per i genitori</dt><dd className="whitespace-pre-line">{v.indicazioni}</dd></div>}
                  {v.prossimo_controllo && <div><dt className="inline text-slate-500">Prossimo controllo: </dt><dd className="inline">{giorno(v.prossimo_controllo)}</dd></div>}
                </dl>
              );
              return (
                <li key={v.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="font-medium">{dataOra(v.data)} · {TIPO_VISITA[v.tipo as keyof typeof TIPO_VISITA] ?? v.tipo}</p>
                    <button onClick={() => stampa(<>{intestazione(`Visita del ${dataOra(v.data)}`)}{corpo}</>)} className="text-xs text-sky-700 underline">Stampa</button>
                  </div>
                  {corpo}
                </li>
              );
            })}
          </ul>
        )}
      </Sezione>

      <Sezione titolo="Documenti" conteggio={storico ? storico.certificati.length + storico.prescrizioni.length : undefined}>
        {!storico ? 'Caricamento…' : storico.certificati.length + storico.prescrizioni.length === 0 ? <p className="text-slate-500">Nessun documento.</p> : (
          <ul className="space-y-2">
            {storico.certificati.map((c) => {
              const corpo = (
                <div className="space-y-1">
                  {c.contenuto?.allergeni?.length ? <p>Alimenti da escludere: {c.contenuto.allergeni.map((a) => a.nome).join(', ')}</p> : null}
                  {c.contenuto?.tracce && <p className="font-medium">Escludere anche le tracce.</p>}
                  {c.contenuto?.rischio_grave && <p className="font-medium text-rose-800">Rischio di reazione allergica grave.</p>}
                  {c.contenuto?.farmaco_emergenza && <p>Farmaco d'emergenza: {c.contenuto.farmaco_emergenza}</p>}
                  {c.contenuto?.scuola && <p>Scuola: {c.contenuto.scuola}</p>}
                  {c.contenuto?.note && <p className="whitespace-pre-line">{c.contenuto.note}</p>}
                  {c.valido_fino && <p>Valido fino al {giorno(c.valido_fino)}</p>}
                </div>
              );
              return (
                <li key={c.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{giorno(c.data)} · {TIPO_CERTIFICATO[c.tipo] ?? c.tipo}</p>
                    <button onClick={() => stampa(<>{intestazione(`${TIPO_CERTIFICATO[c.tipo] ?? 'Certificato'} del ${giorno(c.data)}`)}{corpo}</>)} className="text-xs text-sky-700 underline">Stampa</button>
                  </div>
                  {corpo}
                </li>
              );
            })}
            {storico.prescrizioni.map((x) => {
              const corpo = (
                <div className="space-y-1">
                  {x.quesito && <p><span className="text-slate-500">Quesito diagnostico: </span>{x.quesito}</p>}
                  <ul className="list-disc pl-5">{x.prestazioni.map((p, i) => <li key={i}>{p.descrizione}{p.quantita > 1 ? ` × ${p.quantita}` : ''}</li>)}</ul>
                  {x.priorita && <p className="text-slate-600">Priorità: {PRIORITA[x.priorita] ?? x.priorita}</p>}
                  <p className="text-xs text-slate-500">Per prenotare serve la ricetta elettronica (codice NRE) che ti consegna lo studio.</p>
                </div>
              );
              return (
                <li key={x.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{giorno(x.data)} · Prescrizione di esami o visite</p>
                    <button onClick={() => stampa(<>{intestazione(`Prescrizione del ${giorno(x.data)}`)}{corpo}</>)} className="text-xs text-sky-700 underline">Stampa</button>
                  </div>
                  {corpo}
                </li>
              );
            })}
          </ul>
        )}
      </Sezione>

      <Sezione titolo="Appuntamenti passati" conteggio={storico?.appuntamenti.length}>
        {!storico ? 'Caricamento…' : storico.appuntamenti.length === 0 ? <p className="text-slate-500">Nessun appuntamento passato.</p> : (
          <ul className="divide-y divide-slate-100">
            {storico.appuntamenti.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>{dataOra(a.inizio)} · {TIPO_APPUNTAMENTO[a.tipo as keyof typeof TIPO_APPUNTAMENTO] ?? a.tipo}</span>
                <span className="text-xs text-slate-500">{STATO_APPUNTAMENTO[a.stato] ?? a.stato}</span>
              </li>
            ))}
          </ul>
        )}
      </Sezione>

      <Sezione titolo="Crescita" conteggio={(storico?.misure.length ?? 0)}>
        {(storico?.misure.length ?? 0) === 0 ? <p className="text-slate-500">Nessuna misura registrata.</p> : (
          <table className="w-full text-left tabular-nums">
            <thead className="text-xs text-slate-500"><tr><th className="py-1 font-medium">Data</th><th className="py-1 font-medium">Peso kg</th><th className="py-1 font-medium">Altezza cm</th><th className="py-1 font-medium">Circ. cranica cm</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {storico?.misure.map((m) => <tr key={m.id}><td className="py-1">{dataMisura(figlio.data_nascita, m.eta_giorni)}</td><td>{num(m.peso_kg)}</td><td>{num(m.altezza_cm)}</td><td>{num(m.circonferenza_cranica_cm)}</td></tr>)}
            </tbody>
          </table>
        )}
      </Sezione>

      <Sezione titolo="Vaccinazioni" conteggio={(storico?.vaccini.length ?? 0)}>
        {(storico?.vaccini.length ?? 0) === 0 ? <p className="text-slate-500">Nessuna vaccinazione registrata dallo studio.</p> : (
          <ul className="divide-y divide-slate-100">
            {storico?.vaccini.map((v) => <li key={v.id} className="flex justify-between gap-2 py-1.5"><span>{v.vaccino}, dose {v.dose}</span><span className="text-slate-500">{giorno(v.data)}</span></li>)}
          </ul>
        )}
      </Sezione>

      <Sezione titolo="Chi ha consultato i dati">
        {accessi === null ? (
          <button onClick={() => void caricaAccessi()} className="text-sky-700 underline">Mostra il registro degli accessi</button>
        ) : accessi.length === 0 ? <p className="text-slate-500">Nessun accesso registrato.</p> : (
          <ul className="space-y-1">{accessi.map((r, i) => <li key={i}>{dataOra(r.avvenuto_il)} · {RUOLI[r.ruolo] ?? r.ruolo} · {AZIONI[r.azione] ?? r.azione}</li>)}</ul>
        )}
      </Sezione>

      {createPortal(<div className="area-stampa p-8 text-black">{daStampare}</div>, document.body)}
    </div>
  );
}
