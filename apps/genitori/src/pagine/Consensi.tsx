import type { FinalitaConsenso, StatoConsenso } from '@pls/shared';
import { useEffect, useRef, useState } from 'react';
import Firma from '../componenti/Firma';
import { dataOra, FINALITA, STATO_CONSENSO } from '../lib/formato';
import { supabase } from '../lib/supabase';

interface VoceConsenso {
  paziente_id: string; nome_figlio: string; finalita: FinalitaConsenso; titolo: string; versione: string;
  stato: StatoConsenso | null; canale: 'portale' | 'cartaceo_studio' | null; registrato_il: string | null; firmato: boolean; letta: boolean;
  versione_firmata: string | null;
}
interface Informativa { titolo: string; testo: string; versione: string }

/**
 * Consensi del genitore, figlio per figlio. Prima si apre l'informativa (l'apertura viene
 * registrata), poi si sceglie e si firma sullo schermo. Visibili anche prima del consenso
 * al portale, che è proprio uno di questi.
 */
export default function Consensi({ onCambio }: { onCambio: () => void }) {
  const [voci, setVoci] = useState<VoceConsenso[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperta, setAperta] = useState<VoceConsenso | null>(null);

  async function carica() {
    const { data, error } = await supabase.schema('api').rpc('portale_consensi');
    if (error) { setErrore(error.message); setVoci([]); return; }
    setVoci((data ?? []) as VoceConsenso[]);
  }
  useEffect(() => { void carica(); }, []);

  const figli = [...new Map((voci ?? []).map((v) => [v.paziente_id, v.nome_figlio])).entries()];
  const daFirmare = (voci ?? []).filter((v) => !v.stato || v.stato === 'da_rinnovare').length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Consensi e informative</h2>
        <p className="text-sm text-slate-600">
          {daFirmare ? `${daFirmare} in attesa di una tua scelta.` : 'Hai espresso tutte le tue scelte.'} «Dati sanitari» e «Portale genitori» servono per vedere i dati dei figli; gli altri sono facoltativi. Puoi cambiare idea in qualsiasi momento: la nuova scelta sostituisce la precedente.
        </p>
      </div>
      {errore && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{errore}</p>}
      {voci === null && <p className="text-slate-500">Caricamento…</p>}
      {voci?.length === 0 && !errore && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nessun figlio collegato al tuo account con responsabilità genitoriale.</p>}
      {figli.map(([id, nome]) => (
        <section key={id} className="rounded-xl border border-slate-200 bg-white">
          <h3 className="border-b border-slate-100 px-4 py-2 font-medium">{nome}</h3>
          <ul className="divide-y divide-slate-100">
            {voci!.filter((v) => v.paziente_id === id).map((v) => (
              <li key={v.finalita} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{FINALITA[v.finalita]}</p>
                  <p className="text-xs text-slate-500">
                    {v.stato && v.registrato_il
                      ? `${v.canale === 'portale' ? (v.firmato ? 'Firmato sul portale' : 'Dal portale') : 'Firmato in studio'} il ${dataOra(v.registrato_il)}${v.stato === 'da_rinnovare' && v.versione_firmata ? ` (informativa ${v.versione_firmata}, ora aggiornata)` : ''}`
                      : 'Non ancora espresso'}
                  </p>
                </div>
                {v.stato
                  ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATO_CONSENSO[v.stato].classe}`}>{STATO_CONSENSO[v.stato].testo}</span>
                  : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">Da esprimere</span>}
                <button onClick={() => setAperta(v)} className="rounded-lg border border-sky-700 px-3 py-1 text-sm font-medium text-sky-800 hover:bg-sky-50">
                  {v.stato && v.stato !== 'da_rinnovare' ? 'Rivedi' : 'Leggi e firma'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {aperta && (
        <ModuloFirma voce={aperta} onChiudi={() => setAperta(null)} onFirmato={() => { setAperta(null); void carica(); onCambio(); }} />
      )}
    </div>
  );
}

function ModuloFirma({ voce, onChiudi, onFirmato }: { voce: VoceConsenso; onChiudi: () => void; onFirmato: () => void }) {
  const [info, setInfo] = useState<Informativa | null>(null);
  // Nessuna scelta preimpostata: il genitore deve sceglierla.
  const [scelta, setScelta] = useState<'concesso' | 'negato' | 'revocato' | null>(null);
  const [firma, setFirma] = useState<{ immagine: string; tratti: number } | null>(null);
  const [letta, setLetta] = useState(false);
  const [presaVisione, setPresaVisione] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const chiudi = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let annullato = false;
    void (async () => {
      const { data, error } = await supabase.schema('anagrafica').from('informative')
        .select('titolo, testo, versione').eq('finalita', voce.finalita).eq('attiva', true).single();
      if (annullato) return;
      if (error) return setErrore(`Informativa non disponibile: ${error.message}`);
      // L'apertura dell'informativa viene registrata: solo dopo si può firmare.
      const r = await supabase.schema('api').rpc('segna_informativa_letta', { p_paziente_id: voce.paziente_id, p_finalita: voce.finalita });
      if (annullato) return;
      if (r.error) return setErrore(r.error.message);
      setInfo(data as Informativa);
      setLetta(true);
    })();
    return () => { annullato = true; };
  }, [voce]);

  // Finestra modale: focus sul pulsante Chiudi, Esc per chiudere, pagina sotto bloccata.
  useEffect(() => {
    chiudi.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi(); };
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = overflow; };
  }, [onChiudi]);

  async function invia() {
    setErrore(null);
    if (!letta) return setErrore('Attendi il caricamento dell\'informativa.');
    if (!scelta) return setErrore('Scegli se dare o non dare il consenso.');
    if (!presaVisione) return setErrore('Conferma di aver letto l\'informativa.');
    if (!firma) return setErrore('Firma nel riquadro prima di inviare.');
    if (firma.immagine.length > 290_000) return setErrore('Firma troppo complessa: cancellala e rifirma più semplice.');
    setInvio(true);
    const { error } = await supabase.schema('api').rpc('firma_consenso', {
      p_paziente_id: voce.paziente_id, p_finalita: voce.finalita, p_stato: scelta,
      p_firma: firma.immagine, p_tratti: firma.tratti, p_dispositivo: navigator.userAgent.slice(0, 300),
    });
    setInvio(false);
    if (error) return setErrore(error.message);
    onFirmato();
  }

  const opzioni: ['concesso' | 'negato' | 'revocato', string][] = voce.stato === 'concesso'
    ? [['revocato', 'Revoco il consenso'], ['concesso', 'Confermo il consenso']]
    : [['concesso', 'Do il consenso'], ['negato', 'Non do il consenso']];

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="titolo-consenso">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{voce.nome_figlio}</p>
            <h3 id="titolo-consenso" className="text-lg font-semibold">{info?.titolo ?? FINALITA[voce.finalita]}</h3>
          </div>
          <button ref={chiudi} onClick={onChiudi} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">Chiudi</button>
        </div>
        {errore && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">{errore}</p>}
        {!info ? (!errore && <p className="text-slate-500">Caricamento dell'informativa…</p>) : (
          <>
            <div className="max-h-64 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{info.testo}</div>
            <p className="mt-1 text-xs text-slate-500">Informativa versione {info.versione}</p>
            <fieldset className="mt-4 space-y-2">
              <legend className="mb-1 text-sm font-medium">La tua scelta</legend>
              {opzioni.map(([k, t]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="scelta" checked={scelta === k} onChange={() => setScelta(k)} /> {t}
                </label>
              ))}
            </fieldset>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={presaVisione} onChange={(e) => setPresaVisione(e.target.checked)} className="mt-0.5" />
              Ho letto l'informativa
            </label>
            <div className="mt-4">
              <p className="mb-1 text-sm font-medium">Firma</p>
              <Firma onCambio={setFirma} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Vengono registrati data, ora, versione dell'informativa e un'impronta
              di quanto firmato. È una firma elettronica semplice: se lo studio te lo chiede, il consenso può essere firmato anche su carta.
            </p>
            <button onClick={() => void invia()} disabled={invio || !firma || !letta || !scelta || !presaVisione}
                    className="mt-4 w-full rounded-lg bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50">
              {invio ? 'Invio…' : 'Firma e invia'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
