import type { AllergoCartella, AllergoPaziente, RigaAllergo } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../../lib/dati';
import { supabase } from '../../lib/supabase';
import Finestra from '../Finestra';
import { Bottone, Caricamento, Errore, Pannello } from '../ui';
import { CAMPI_SPIRO, TIPI_VISITA } from './definizioni';
import { ModuloScala, NOMI_SCALA, type Scala } from './Punteggi';
import AnamnesiGuidata from './ModuloAnamnesi';
import { scelteIniziali, type Scelte } from './anamnesiTesti';
import { OPZIONI_PREDEFINITE, resocontoVisite, type DatiResoconto, type OpzioniResoconto } from './resoconto';
import { accoda, compila, modelliEffettivi, PACCHETTI, PROFILI, SEZIONI_MODELLO, testoTest, type ModelloAllergo } from './referto';
import { giorno, ModuloRiga, oggi, s, stileInput } from './Registro';
import { PannelloPrick } from './TestAllergologici';

type Campi = {
  data: string; tipo: string; motivo: string; anamnesi: string; decorso: string; esame_obiettivo: string;
  peso_kg: string; altezza_cm: string; saturazione: string; test_eseguiti: string; conclusioni: string;
  diagnosi_testo: string; piano: string; prossimo_controllo: string;
};
type CampiCartella = Record<'anamnesi_familiare' | 'anamnesi_fisiologica' | 'anamnesi_remota' | 'abitazione' |
  'animali' | 'fumo_dettaglio' | 'farmaci' | 'alimentazione' | 'sport' | 'sonno', string>;

export const VOCI_CARTELLA: [keyof CampiCartella, string][] = [
  ['anamnesi_familiare', 'Anamnesi familiare'], ['anamnesi_fisiologica', 'Anamnesi fisiologica'], ['anamnesi_remota', 'Anamnesi patologica remota'],
  ['abitazione', 'Abitazione'], ['animali', 'Animali domestici'], ['fumo_dettaglio', 'Fumo passivo'], ['farmaci', 'Farmaci'],
  ['alimentazione', 'Alimentazione'], ['sport', 'Sport'], ['sonno', 'Sonno'],
];
/** Voci a testo libero; le altre (abitazione, fumo, alimenti, farmaci, sport, sonno) hanno i menu guidati. */
const VOCI_LIBERE: (keyof CampiCartella)[] = ['anamnesi_familiare', 'anamnesi_fisiologica', 'anamnesi_remota', 'animali'];

const oraLocale = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const str = (v: unknown) => (v == null ? '' : String(v));

function Area({ etichetta, valore, onChange, righe = 4, aiuto }: { etichetta: string; valore: string; onChange: (v: string) => void; righe?: number; aiuto?: string }) {
  return (
    <label className="block text-sm">
      <span className="block font-medium text-slate-700">{etichetta}</span>
      {aiuto && <span className="block text-xs text-slate-400">{aiuto}</span>}
      <textarea rows={righe} value={valore} onChange={(e) => onChange(e.target.value)} className={`${stileInput} font-[inherit]`} />
    </label>
  );
}

// Sezioni importabili da una visita precedente: [campo della visita precedente, campo di destinazione, titolo].
const SEZIONI_IMPORTABILI: [keyof Campi, keyof Campi, string][] = [
  ['anamnesi', 'anamnesi', 'Anamnesi patologica prossima'],
  ['decorso', 'decorso', 'Controllo clinico (decorso)'],
  ['esame_obiettivo', 'esame_obiettivo', 'Esame obiettivo'],
  ['test_eseguiti', 'test_eseguiti', 'Test eseguiti'],
  ['conclusioni', 'conclusioni', 'Conclusioni'],
  ['diagnosi_testo', 'diagnosi_testo', 'Diagnosi'],
  ['piano', 'piano', 'Piano di cura'],
];

/** Visita precedente (a scelta tra tutte quelle passate) con importazione per sezione. */
function VisitaPrecedente({ precedenti, prima, controllo, onImporta, onResoconto }: {
  precedenti: RigaAllergo[]; prima: RigaAllergo | null; controllo: boolean;
  onImporta: (voci: { campo: keyof Campi; testo: string; titolo: string }[], modo: 'aggiungi' | 'sostituisci') => void;
  onResoconto: () => void;
}) {
  const [id, setId] = useState(precedenti[0]?.id ?? '');
  const v = precedenti.find((x) => x.id === id) ?? precedenti[0]!;
  // Nella prima visita il decorso non c'è: va nell'anamnesi.
  const dest = (c: keyof Campi): keyof Campi => (c === 'decorso' && !controllo ? 'anamnesi' : c);
  const disponibili = SEZIONI_IMPORTABILI.filter(([da]) => s(v, da).trim());
  const voce = (da: keyof Campi, a: keyof Campi, titolo: string) => ({ campo: dest(a), testo: s(v, da), titolo });
  return (
    <aside className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm lg:sticky lg:top-4 lg:max-h-[88vh] lg:overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-amber-900">Visite precedenti</p>
        <span className="text-xs text-amber-800">{precedenti.length}</span>
      </div>
      <select value={v.id} onChange={(e) => setId(e.target.value)} aria-label="Visita da consultare" className={stileInput}>
        {precedenti.map((x) => <option key={x.id} value={x.id}>{giorno(x.data)} · {TIPI_VISITA[s(x, 'tipo')]}</option>)}
      </select>
      {prima && <p className="text-xs text-amber-800">Prima osservazione clinica: {giorno(prima.data)}</p>}
      <button type="button" onClick={onResoconto}
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm font-medium text-amber-900 hover:bg-amber-100">
        📋 Resoconto di tutte le visite precedenti
        <span className="block text-xs font-normal text-amber-800">Da usare come anamnesi patologica nel controllo</span>
      </button>
      {disponibili.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-amber-100 pt-2">
          <Bottone variante="primario" onClick={() => onImporta(disponibili.map(([da, a, t]) => voce(da, a, t)), 'aggiungi')}>Importa tutte le sezioni</Bottone>
        </div>
      )}
      <p className="text-slate-600">{[v.peso_kg && `Peso ${s(v, 'peso_kg')} kg`, v.altezza_cm && `${s(v, 'altezza_cm')} cm`].filter(Boolean).join(' · ')}</p>
      {disponibili.map(([da, a, titolo]) => (
        <div key={da} className="border-t border-amber-100 pt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{titolo}</p>
            <span className="flex gap-2">
              <button type="button" onClick={() => onImporta([voce(da, a, titolo)], 'aggiungi')} className="text-xs text-teal-700 underline">Importa</button>
              <button type="button" onClick={() => onImporta([voce(da, a, titolo)], 'sostituisci')} className="text-xs text-slate-500 underline">Sostituisci</button>
            </span>
          </div>
          <p className="max-h-40 overflow-y-auto whitespace-pre-line text-slate-700">{s(v, da)}</p>
        </div>
      ))}
      {v.prossimo_controllo ? <p className="border-t border-amber-100 pt-2 text-amber-900">Controllo previsto: {giorno(v.prossimo_controllo)}</p> : null}
    </aside>
  );
}

/** Finestra del resoconto: scelta delle voci, anteprima modificabile, inserimento. */
function FinestraResoconto({ pseudo, visite, primaDel, controllo, onInserisci, onChiudi }: {
  pseudo: string; visite: RigaAllergo[]; primaDel: string; controllo: boolean;
  onInserisci: (testo: string, campo: keyof Campi, modo: 'aggiungi' | 'sostituisci') => void; onChiudi: () => void;
}) {
  const dati = useDati(async () => {
    const leggi = (t: string) => q<RigaAllergo[]>(supabase.schema('clinica').from(t).select('*').eq('pseudo_id', pseudo));
    const [test, spirometrie, punteggi, terapie, immunoterapie, reazioni] = await Promise.all(
      ['allergo_test', 'allergo_spirometrie', 'allergo_punteggi', 'allergo_terapie', 'allergo_immunoterapie', 'allergo_reazioni'].map(leggi));
    return { test: test!, spirometrie: spirometrie!, punteggi: punteggi!, terapie: terapie!, immunoterapie: immunoterapie!, reazioni: reazioni! } satisfies DatiResoconto;
  }, [pseudo]);
  const [o, setO] = useState<OpzioniResoconto>(OPZIONI_PREDEFINITE);
  const [testo, setTesto] = useState<string | null>(null);
  const generato = dati.dati ? resocontoVisite(visite, dati.dati, o, primaDel) : '';
  const valore = testo ?? generato;
  const [campo, setCampo] = useState<keyof Campi>(controllo ? 'anamnesi' : 'anamnesi');
  const casella = (k: Exclude<keyof OpzioniResoconto, 'piano'>, t: string) => (
    <label className="flex items-center gap-2"><input type="checkbox" checked={o[k]} onChange={(e) => { setO({ ...o, [k]: e.target.checked }); setTesto(null); }} /> {t}</label>
  );
  return (
    <Finestra titolo="Resoconto delle visite precedenti" onChiudi={onChiudi} larga="xl">
      {dati.errore && <Errore messaggio={dati.errore} />}
      <div className="grid gap-4 md:grid-cols-[230px_1fr]">
        <div className="space-y-1.5 text-sm">
          <p className="font-medium text-slate-800">Per ogni visita</p>
          {casella('anamnesi', 'Anamnesi e decorso')}
          {casella('misure', 'Peso e altezza')}
          {casella('esame', 'Esame obiettivo')}
          {casella('test', 'Test eseguiti')}
          {casella('conclusioni', 'Conclusioni')}
          {casella('diagnosi', 'Diagnosi')}
          <label className="block"><span className="block text-slate-500">Piano di cura</span>
            <select value={o.piano} onChange={(e) => { setO({ ...o, piano: e.target.value as OpzioniResoconto['piano'] }); setTesto(null); }} className={stileInput}>
              <option value="nessuno">Non includere</option>
              <option value="farmaci">Solo le prescrizioni (righe «Pr/»)</option>
              <option value="completo">Completo</option>
            </select></label>
          <p className="pt-2 font-medium text-slate-800">Sintesi finale</p>
          {casella('andamento', 'Andamento punteggi e spirometria')}
          {casella('positivi', 'Test positivi')}
          {casella('terapie', 'Terapie e immunoterapia')}
          {casella('reazioni', 'Reazioni e anafilassi')}
        </div>
        <div className="space-y-2">
          {dati.caricamento ? <Caricamento /> : (
            <textarea rows={22} value={valore} onChange={(e) => setTesto(e.target.value)} aria-label="Testo del resoconto" className={`${stileInput} font-mono text-[12.5px]`} />
          )}
          {testo !== null && <button type="button" onClick={() => setTesto(null)} className="text-xs text-slate-500 underline">Annulla le modifiche e rigenera</button>}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm">Inserisci in{' '}
              <select value={campo} onChange={(e) => setCampo(e.target.value as keyof Campi)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                <option value="anamnesi">Anamnesi patologica prossima</option>
                {controllo && <option value="decorso">Controllo clinico</option>}
              </select></label>
            <Bottone variante="primario" disabled={!valore.trim()} onClick={() => onInserisci(valore, campo, 'sostituisci')}>Sostituisci il testo</Bottone>
            <Bottone disabled={!valore.trim()} onClick={() => onInserisci(valore, campo, 'aggiungi')}>Aggiungi in coda</Bottone>
          </div>
          <p className="text-xs text-slate-500">Il testo è modificabile prima dell'inserimento. Nel referto le righe «-» diventano elenchi puntati.</p>
        </div>
      </div>
    </Finestra>
  );
}

/**
 * Visita allergologica (prima visita o controllo) con la struttura dei referti
 * dell'ambulatorio. Nel controllo è sempre visibile la visita precedente.
 */
export default function VisitaAllergologica({ pseudo, paziente, visita, visite, onChiudi, onSalvata }: {
  pseudo: string; paziente: AllergoPaziente; visita: RigaAllergo | null; visite: RigaAllergo[];
  onChiudi: () => void; onSalvata: (id: string) => void;
}) {
  // visite: tutte le visite del paziente, dalla più recente.
  const precedente = visita
    ? (visita.visita_precedente_id ? visite.find((x) => x.id === visita.visita_precedente_id) : visite.find((x) => String(x.data) < String(visita.data))) ?? null
    : visite[0] ?? null;
  const prima = [...visite].reverse().find((x) => x.tipo === 'prima_visita') ?? visite[visite.length - 1] ?? null;
  const ultimoPeso = visite.find((x) => x.peso_kg != null)?.peso_kg;

  const [f, setF] = useState<Campi>(() => {
    if (visita) {
      return {
        data: oraLocale(String(visita.data)), tipo: s(visita, 'tipo'), motivo: s(visita, 'motivo'), anamnesi: s(visita, 'anamnesi'),
        decorso: s(visita, 'decorso'), esame_obiettivo: s(visita, 'esame_obiettivo'), peso_kg: s(visita, 'peso_kg'), altezza_cm: s(visita, 'altezza_cm'),
        saturazione: s(visita, 'saturazione'), test_eseguiti: s(visita, 'test_eseguiti'), conclusioni: s(visita, 'conclusioni'),
        diagnosi_testo: s(visita, 'diagnosi_testo'), piano: s(visita, 'piano'), prossimo_controllo: s(visita, 'prossimo_controllo'),
      };
    }
    const controllo = !!precedente;
    return {
      data: oraLocale(), tipo: controllo ? 'controllo' : 'prima_visita', motivo: controllo ? 'Controllo clinico' : 'Prima visita allergologica',
      anamnesi: '', decorso: '', esame_obiettivo: '', peso_kg: '', altezza_cm: '', saturazione: '', test_eseguiti: '', conclusioni: '',
      // Nel controllo diagnosi e piano partono da quelli della visita precedente.
      diagnosi_testo: controllo ? s(precedente, 'diagnosi_testo') : '', piano: controllo ? s(precedente, 'piano') : '', prossimo_controllo: '',
    };
  });
  const imposta = (k: keyof Campi, v: string) => setF((x) => ({ ...x, [k]: v }));

  const cartella = useDati(() => q<AllergoCartella & Record<string, unknown>>(supabase.schema('clinica').from('allergo_cartelle').select('*').eq('pseudo_id', pseudo).single()), [pseudo]);
  const [anamnesi, setAnamnesi] = useState<CampiCartella | null>(null);
  const valoriCartella: CampiCartella = anamnesi ?? Object.fromEntries(VOCI_CARTELLA.map(([k]) => [k, str(cartella.dati?.[k])])) as CampiCartella;
  const [cartellaAperta, setCartellaAperta] = useState(!visita && !precedente);
  const [scelte, setScelte] = useState<Scelte | null>(null);
  const scelteCorrenti = scelte ?? scelteIniziali(cartella.dati?.anamnesi_scelte as Scelte | undefined, cartella.dati as Record<string, string | null> ?? {});

  const modelli = useDati(() => q<ModelloAllergo[]>(supabase.schema('anagrafica').from('allergo_modelli').select('*').order('ordine')), []);
  const effettivi = modelliEffettivi(modelli.dati ?? []);
  const [profilo, setProfilo] = useState<string | null>(null);
  const [resoconto, setResoconto] = useState(false);
  // Tutte le visite precedenti a questa, dalla più recente.
  const precedenti = visite.filter((x) => x.id !== visita?.id && (!visita || String(x.data) < String(visita.data)));
  const [avviso, setAvviso] = useState<string | null>(null);
  const [modelloEo, setModelloEo] = useState('');
  const [evidenzia, setEvidenzia] = useState<string | null>(null);
  const cornice = (campo: string) => `scroll-mt-4 rounded-xl transition-shadow ${evidenzia === campo ? 'ring-4 ring-amber-300' : ''}`;
  const [usati, setUsati] = useState<string[]>(() => (visita?.modelli as string[] | undefined) ?? []);

  const [strumento, setStrumento] = useState<null | 'prick' | 'spirometria' | Scala>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const etaAnni = (Date.parse(f.data) - Date.parse(paziente.data_nascita)) / (365.25 * 86_400_000);

  // Dove finisce ogni modello: il «decorso» va nell'anamnesi se è una prima visita.
  const campoDi = (m: ModelloAllergo): keyof Campi =>
    m.sezione === 'decorso' && f.tipo === 'prima_visita' ? 'anamnesi' : m.sezione;
  const NOMI_CAMPO: Partial<Record<keyof Campi, string>> = {
    piano: 'Piano di cura', esame_obiettivo: 'Esame obiettivo', conclusioni: 'Conclusioni', anamnesi: 'Anamnesi patologica prossima', decorso: 'Controllo clinico',
  };

  /** Applica un modello a un insieme di campi; dice se il testo è stato davvero inserito. */
  function applica(x: Campi, m: ModelloAllergo, modo: 'aggiungi' | 'sostituisci' | 'se_vuoto'): { x: Campi; inserito: boolean } {
    const testo = compila(m.testo, { nome: `${paziente.nome} ${paziente.cognome}`, peso: f.peso_kg || str(ultimoPeso), prossimoControllo: f.prossimo_controllo });
    const campo = campoDi(m);
    if (modo === 'sostituisci') return { x: { ...x, [campo]: testo }, inserito: true };
    if (x[campo].includes(testo.slice(0, 60))) return { x, inserito: false };
    if (modo === 'se_vuoto' && x[campo].trim()) return { x, inserito: false };
    return { x: { ...x, [campo]: accoda(x[campo], testo) }, inserito: true };
  }

  function mostra(campo: keyof Campi, testo: string) {
    setAvviso(testo);
    setEvidenzia(campo);
    window.setTimeout(() => document.getElementById(`sez-${campo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    window.setTimeout(() => setEvidenzia(null), 2500);
  }

  function inserisci(m: ModelloAllergo, modo: 'aggiungi' | 'sostituisci' = 'aggiungi') {
    const r = applica(f, m, modo);
    const campo = campoDi(m);
    if (!r.inserito) return mostra(campo, `«${m.nome}» è già presente in ${NOMI_CAMPO[campo]}.`);
    setF(r.x);
    setUsati((u) => (u.includes(m.codice) ? u : [...u, m.codice]));
    mostra(campo, `Inserito in «${NOMI_CAMPO[campo]}»: modifica il testo se serve.`);
  }

  function applicaPacchetto(codici: string[]) {
    let x = f;
    const sezioni = new Set<string>();
    const nuovi: string[] = [];
    for (const c of codici) {
      const m = effettivi.get(c);
      if (!m) continue;
      // L'esame obiettivo del modello entra solo se il campo è vuoto (non cancella quanto già scritto).
      const r = applica(x, m, m.sezione === 'esame_obiettivo' ? 'se_vuoto' : 'aggiungi');
      if (r.inserito) { x = r.x; sezioni.add(NOMI_CAMPO[campoDi(m)] ?? ''); nuovi.push(m.codice); }
    }
    setF(x);
    setUsati((u) => [...new Set([...u, ...nuovi])]);
    mostra('piano', nuovi.length ? `Inseriti ${nuovi.length} blocchi in: ${[...sezioni].join(', ')}.` : 'I testi di questo modello sono già presenti.');
  }

  async function generaTest() {
    const [test, spirometrie, punteggi] = await Promise.all(['allergo_test', 'allergo_spirometrie', 'allergo_punteggi'].map((t) =>
      q<RigaAllergo[]>(supabase.schema('clinica').from(t).select('*').eq('pseudo_id', pseudo).eq('data', f.data.slice(0, 10)))));
    const testo = testoTest(f.data.slice(0, 10), { test: test ?? [], spirometrie: spirometrie ?? [], punteggi: punteggi ?? [] });
    if (!testo) return setErrore('Nessun test registrato in questa data: usa i pulsanti «Prick test», «Spirometria», «SCORAD»… e poi rigenera.');
    setErrore(null);
    imposta('test_eseguiti', testo);
  }

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInvio(true);
    try {
      if (anamnesi || scelte) {
        const { error } = await supabase.schema('clinica').from('allergo_cartelle')
          .update({ ...Object.fromEntries(Object.entries(valoriCartella).map(([k, v]) => [k, v.trim() || null])),
                    ...(scelte ? { anamnesi_scelte: scelte } : {}), aggiornata_il: new Date().toISOString() })
          .eq('pseudo_id', pseudo);
        if (error) throw new Error(error.message);
      }
      const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
      const t = (v: string) => (v.trim() === '' ? null : v.trim());
      const riga = {
        data: new Date(f.data).toISOString(), tipo: f.tipo, motivo: f.motivo.trim() || 'Visita allergologica',
        anamnesi: t(f.anamnesi), decorso: t(f.decorso), esame_obiettivo: t(f.esame_obiettivo), peso_kg: n(f.peso_kg), altezza_cm: n(f.altezza_cm),
        saturazione: n(f.saturazione), test_eseguiti: t(f.test_eseguiti), conclusioni: t(f.conclusioni), diagnosi_testo: t(f.diagnosi_testo),
        piano: t(f.piano), prossimo_controllo: t(f.prossimo_controllo), modelli: usati,
        visita_precedente_id: f.tipo === 'prima_visita' ? null : precedente?.id ?? null,
        anamnesi_snapshot: valoriCartella, aggiornata_il: new Date().toISOString(),
      };
      const tab = supabase.schema('clinica').from('allergo_visite');
      const { data, error } = visita
        ? await tab.update(riga).eq('id', visita.id).select('id').single()
        : await tab.insert({ ...riga, pseudo_id: pseudo }).select('id').single();
      if (error) throw new Error(error.message);
      onSalvata((data as { id: string }).id);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally {
      setInvio(false);
    }
  }

  const controllo = f.tipo !== 'prima_visita';
  const modelliProfilo = profilo ? [...effettivi.values()].filter((m) => m.profilo === profilo).sort((a, b) => a.ordine - b.ordine) : [];

  return (
    <>
    <form onSubmit={(e) => void salva(e)} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900">{visita ? 'Modifica visita' : controllo ? 'Nuovo controllo clinico' : 'Prima visita allergologica'}</h2>
        <div className="flex gap-2">
          <Bottone onClick={onChiudi}>Annulla</Bottone>
          <Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva visita'}</Bottone>
        </div>
      </div>
      {errore && <Errore messaggio={errore} />}

      <div className={`grid gap-4 ${precedenti.length ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
        <div className="space-y-4">
          {/* Intestazione della visita */}
          <Pannello titolo="Visita">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="text-sm"><span className="block text-slate-500">Data e ora</span>
                <input type="datetime-local" required value={f.data} onChange={(e) => imposta('data', e.target.value)} className={stileInput} /></label>
              <label className="text-sm"><span className="block text-slate-500">Tipo</span>
                <select value={f.tipo} onChange={(e) => imposta('tipo', e.target.value)} className={stileInput}>
                  {Object.entries(TIPI_VISITA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select></label>
              <label className="text-sm md:col-span-2"><span className="block text-slate-500">Motivo</span>
                <input required value={f.motivo} onChange={(e) => imposta('motivo', e.target.value)} className={stileInput} /></label>
            </div>
          </Pannello>

          {/* Modelli per tipo di bambino */}
          <Pannello titolo="Modelli per tipo di bambino" sottotitolo="Inseriscono esame obiettivo, conclusioni e piano di cura tipici: poi adatta il testo al bambino">
            {modelli.errore && <Errore messaggio={modelli.errore} />}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {PACCHETTI.map((p) => (
                <button key={p.codice} type="button" onClick={() => applicaPacchetto(p.modelli)}
                        className="rounded-lg border border-slate-200 p-2 text-left hover:border-teal-600 hover:bg-teal-50">
                  <span className="block text-sm font-medium text-slate-900">{p.nome}</span>
                  <span className="block text-xs text-slate-500">{p.descrizione}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Singoli blocchi</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(PROFILI).map(([k, t]) => (
                <button key={k} type="button" onClick={() => setProfilo(profilo === k ? null : k)}
                        className={`rounded-full border px-3 py-1 text-sm ${profilo === k ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 text-slate-700'}`}>{t}</button>
              ))}
            </div>
            {modelliProfilo.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {modelliProfilo.map((m) => (
                  <li key={m.codice} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{m.nome} <span className="text-xs text-slate-400">→ {NOMI_CAMPO[campoDi(m)] ?? SEZIONI_MODELLO[m.sezione]}</span>{usati.includes(m.codice) && <span className="ml-1 text-xs text-teal-700">✓ inserito</span>}</span>
                    {m.sezione === 'esame_obiettivo' ? (
                      <span className="flex gap-3">
                        <button type="button" onClick={() => inserisci(m, 'sostituisci')} className="text-xs text-teal-700 underline">Sostituisci</button>
                        <button type="button" onClick={() => inserisci(m)} className="text-xs text-teal-700 underline">Aggiungi</button>
                      </span>
                    ) : <button type="button" onClick={() => inserisci(m)} className="text-xs text-teal-700 underline">Inserisci</button>}
                  </li>
                ))}
              </ul>
            )}
            {avviso && <p role="status" className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">{avviso}</p>}
            <p className="mt-2 text-xs text-amber-700">I modelli sono testi di partenza: verificare sempre farmaci e posologie in base a età ({Math.floor(etaAnni)} anni) e peso.</p>
          </Pannello>

          {/* Anamnesi della cartella */}
          <Pannello titolo="Anamnesi (dalla cartella)" sottotitolo="Familiare, fisiologica, remota e ambiente: si aggiorna anche la cartella"
                    azione={<button type="button" onClick={() => setCartellaAperta(!cartellaAperta)} className="text-sm text-teal-700 underline">{cartellaAperta ? 'Chiudi' : 'Apri'}</button>}>
            {cartellaAperta ? (
              <div className="space-y-3">
                {VOCI_CARTELLA.filter(([k]) => VOCI_LIBERE.includes(k)).map(([k, t]) => (
                  <Area key={k} etichetta={t} valore={valoriCartella[k]} righe={k === 'animali' ? 1 : 3}
                        onChange={(v) => setAnamnesi({ ...valoriCartella, [k]: v })} />
                ))}
                {cartella.dati && (
                  <AnamnesiGuidata scelte={scelteCorrenti} onChange={(nuove, testi) => { setScelte(nuove); setAnamnesi({ ...valoriCartella, ...testi }); }} />
                )}
              </div>
            ) : (
              <p className="line-clamp-3 text-sm text-slate-600">{VOCI_CARTELLA.filter(([k]) => valoriCartella[k]).map(([k, t]) => `${t}: ${valoriCartella[k]}`).join(' · ') || 'Anamnesi non ancora compilata.'}</p>
            )}
          </Pannello>

          <div id="sez-anamnesi" className={cornice(controllo ? 'decorso' : 'anamnesi')}><span id="sez-decorso" />
          <Pannello titolo={controllo ? 'Controllo clinico' : 'Anamnesi patologica prossima'}
                    azione={precedenti.length > 0 ? <Bottone onClick={() => setResoconto(true)}>📋 Resoconto visite precedenti</Bottone> : undefined}>
            <div className="space-y-3">
              {controllo && <Area etichetta={`Controllo clinico del ${giorno(f.data)}`} aiuto="Decorso dall'ultima visita, aderenza, sintomi, reazioni" valore={f.decorso} onChange={(v) => imposta('decorso', v)} />}
              <Area etichetta={controllo ? 'Anamnesi patologica prossima (se aggiornata)' : 'Anamnesi patologica prossima'} valore={f.anamnesi}
                    righe={controllo ? 3 : 6} onChange={(v) => imposta('anamnesi', v)} />
            </div>
          </Pannello>

          </div>
          <div id="sez-esame_obiettivo" className={cornice('esame_obiettivo')}>
          <Pannello titolo="Esame obiettivo" sottotitolo="Il peso si scrive nel suo campo: nel referto compare accanto al titolo"
                    azione={
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={modelloEo} onChange={(e) => setModelloEo(e.target.value)} aria-label="Modello di esame obiettivo" className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                          <option value="">Modello per patologia…</option>
                          {[...effettivi.values()].filter((m) => m.sezione === 'esame_obiettivo').sort((a, b) => a.ordine - b.ordine)
                            .map((m) => <option key={m.codice} value={m.codice}>{m.nome}</option>)}
                        </select>
                        <Bottone disabled={!modelloEo} onClick={() => { const m = effettivi.get(modelloEo); if (m) inserisci(m, 'sostituisci'); }}>Sostituisci</Bottone>
                        <Bottone disabled={!modelloEo} onClick={() => { const m = effettivi.get(modelloEo); if (m) inserisci(m); }}>Aggiungi</Bottone>
                      </div>
                    }>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm"><span className="block text-slate-500">Peso (kg){ultimoPeso != null && !f.peso_kg ? ` · ultimo ${String(ultimoPeso).replace('.', ',')}` : ''}</span>
                <input inputMode="decimal" value={f.peso_kg} onChange={(e) => imposta('peso_kg', e.target.value)} className={stileInput} /></label>
              <label className="text-sm"><span className="block text-slate-500">Altezza (cm)</span>
                <input inputMode="decimal" value={f.altezza_cm} onChange={(e) => imposta('altezza_cm', e.target.value)} className={stileInput} /></label>
              <label className="text-sm"><span className="block text-slate-500">SpO₂ (%)</span>
                <input inputMode="numeric" value={f.saturazione} onChange={(e) => imposta('saturazione', e.target.value)} className={stileInput} /></label>
              <div className="md:col-span-3"><Area etichetta="Esame obiettivo" valore={f.esame_obiettivo} onChange={(v) => imposta('esame_obiettivo', v)} /></div>
            </div>
          </Pannello>

          </div>
          <Pannello titolo="Test eseguiti" sottotitolo="Registra i test della giornata, poi genera il testo del referto"
                    azione={<div className="flex flex-wrap gap-1">
                      <Bottone onClick={() => setStrumento('prick')}>Prick test</Bottone>
                      <Bottone onClick={() => setStrumento('spirometria')}>Spirometria</Bottone>
                      {(['scorad', 'poem', etaAnni >= 12 ? 'act' : 'c_act', 'uas7'] as Scala[]).map((x) => <Bottone key={x} onClick={() => setStrumento(x)}>{NOMI_SCALA[x].nome}</Bottone>)}
                    </div>}>
            <Area etichetta="Testo nel referto" valore={f.test_eseguiti} righe={6} onChange={(v) => imposta('test_eseguiti', v)} />
            <button type="button" onClick={() => void generaTest()} className="mt-1 text-sm text-teal-700 underline">Genera dai test registrati il {giorno(f.data.slice(0, 10))}</button>
          </Pannello>

          <div id="sez-conclusioni" className={cornice('conclusioni')}>
          <Pannello titolo="Conclusioni e diagnosi">
            <div className="space-y-3">
              <Area etichetta="Conclusioni" valore={f.conclusioni} onChange={(v) => imposta('conclusioni', v)} />
              <Area etichetta="Diagnosi" aiuto="Una per riga" valore={f.diagnosi_testo} righe={3} onChange={(v) => imposta('diagnosi_testo', v)} />
            </div>
          </Pannello>

          </div>
          <div id="sez-piano" className={cornice('piano')}>
          <Pannello titolo="Piano di cura">
            <Area etichetta="Indicazioni e terapia" aiuto="Le righe che iniziano con «-» diventano un elenco puntato nel referto" valore={f.piano} righe={16} onChange={(v) => imposta('piano', v)} />
            <label className="mt-3 block w-56 text-sm"><span className="block text-slate-500">Prossimo controllo</span>
              <input type="date" min={oggi()} value={f.prossimo_controllo} onChange={(e) => imposta('prossimo_controllo', e.target.value)} className={stileInput} /></label>
          </Pannello>
          </div>

          <div className="flex justify-end gap-2">
            <Bottone onClick={onChiudi}>Annulla</Bottone>
            <Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva visita'}</Bottone>
          </div>
        </div>

        {precedenti.length > 0 && (
          <VisitaPrecedente precedenti={precedenti} prima={prima} controllo={controllo} onResoconto={() => setResoconto(true)}
            onImporta={(voci, modo) => {
              setF((x) => {
                let y = x;
                for (const v of voci) {
                  if (modo === 'sostituisci') y = { ...y, [v.campo]: v.testo };
                  else if (!y[v.campo].includes(v.testo.trim())) y = { ...y, [v.campo]: accoda(y[v.campo], v.testo) };
                }
                return y;
              });
              mostra(voci[0]!.campo, voci.length > 1 ? `Importate ${voci.length} sezioni dalla visita precedente.` : `Importato «${voci[0]!.titolo}» ${modo === 'sostituisci' ? '(sostituito)' : ''}.`);
            }} />
        )}
      </div>
    </form>

      {resoconto && (
        <FinestraResoconto pseudo={pseudo} visite={precedenti} primaDel={visita ? String(visita.data) : new Date(f.data).toISOString()} controllo={controllo}
          onChiudi={() => setResoconto(false)}
          onInserisci={(testo, campo, modo) => {
            setResoconto(false);
            setF((x) => ({ ...x, [campo]: modo === 'sostituisci' ? testo : accoda(x[campo], testo) }));
            mostra(campo, 'Resoconto inserito: rileggi e completa il testo.');
          }} />
      )}
      {strumento === 'prick' && (
        <Finestra titolo="Seduta di prick test" onChiudi={() => setStrumento(null)} larga>
          <PannelloPrick pseudo={pseudo} dataIniziale={f.data.slice(0, 10)} onFatto={() => { setStrumento(null); void generaTest(); }} />
        </Finestra>
      )}
      {strumento === 'spirometria' && (
        <Finestra titolo="Spirometria e FeNO" onChiudi={() => setStrumento(null)} larga>
          <ModuloRiga tabella="allergo_spirometrie" pseudo={pseudo} campi={CAMPI_SPIRO} riga={null} iniziali={{ data: f.data.slice(0, 10) }}
                      onFatto={() => { setStrumento(null); void generaTest(); }} />
        </Finestra>
      )}
      {strumento && strumento !== 'prick' && strumento !== 'spirometria' && (
        <Finestra titolo={`${NOMI_SCALA[strumento].nome}: nuovo punteggio`} onChiudi={() => setStrumento(null)} larga={strumento === 'scorad' ? 'xl' : true}>
          <ModuloScala scala={strumento} pseudo={pseudo} sotto2anni={etaAnni < 2} dataIniziale={f.data.slice(0, 10)} onFatto={() => { setStrumento(null); void generaTest(); }} />
        </Finestra>
      )}
    </>
  );
}
