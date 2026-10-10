import type { AllergoCartella, AllergoPaziente, RigaAllergo } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../../lib/dati';
import { supabase } from '../../lib/supabase';
import Finestra from '../Finestra';
import { Badge, Bottone, Errore, Pannello } from '../ui';
import { CAMPI_SPIRO, TIPI_VISITA } from './definizioni';
import { ModuloScala, NOMI_SCALA, type Scala } from './Punteggi';
import { accoda, compila, modelliEffettivi, PACCHETTI, PROFILI, SEZIONI_MODELLO, testoTest, type ModelloAllergo } from './referto';
import { giorno, ModuloRiga, oggi, s, stileInput } from './Registro';
import { PannelloPrick } from './TestAllergologici';

type Campi = {
  data: string; tipo: string; motivo: string; anamnesi: string; decorso: string; esame_obiettivo: string;
  peso_kg: string; altezza_cm: string; saturazione: string; test_eseguiti: string; conclusioni: string;
  diagnosi_testo: string; piano: string; prossimo_controllo: string;
};
type CampiCartella = Record<'anamnesi_familiare' | 'anamnesi_fisiologica' | 'anamnesi_remota' | 'abitazione' |
  'animali' | 'fumo_dettaglio' | 'farmaci' | 'alimentazione' | 'sport', string>;

export const VOCI_CARTELLA: [keyof CampiCartella, string][] = [
  ['anamnesi_familiare', 'Anamnesi familiare'], ['anamnesi_fisiologica', 'Anamnesi fisiologica'], ['anamnesi_remota', 'Anamnesi patologica remota'],
  ['abitazione', 'Abitazione'], ['animali', 'Animali domestici'], ['fumo_dettaglio', 'Fumo passivo'], ['farmaci', 'Farmaci'],
  ['alimentazione', 'Alimentazione'], ['sport', 'Sport'],
];

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

/** Riepilogo della visita precedente, da consultare e da cui riprendere i testi. */
function VisitaPrecedente({ v, prima, onRiprendi }: { v: RigaAllergo; prima: RigaAllergo | null; onRiprendi: (campo: keyof Campi, testo: string) => void }) {
  const blocco = (titolo: string, campo: keyof Campi | null, testo: unknown) => testo ? (
    <div className="border-t border-amber-100 pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{titolo}</p>
        {campo && <button type="button" onClick={() => onRiprendi(campo, String(testo))} className="text-xs text-teal-700 underline">Riprendi</button>}
      </div>
      <p className="whitespace-pre-line text-slate-700">{String(testo)}</p>
    </div>
  ) : null;
  return (
    <aside className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm lg:sticky lg:top-4 lg:max-h-[85vh] lg:overflow-y-auto">
      <p className="font-semibold text-amber-900">Visita precedente · {giorno(v.data)} <Badge>{TIPI_VISITA[s(v, 'tipo')]}</Badge></p>
      {prima && prima.id !== v.id && <p className="text-xs text-amber-800">Prima osservazione clinica: {giorno(prima.data)}</p>}
      <p className="text-slate-600">{[v.peso_kg && `Peso ${s(v, 'peso_kg')} kg`, v.altezza_cm && `${s(v, 'altezza_cm')} cm`].filter(Boolean).join(' · ')}</p>
      {blocco('Anamnesi prossima', 'anamnesi', v.anamnesi)}
      {blocco('Decorso', null, v.decorso)}
      {blocco('Test eseguiti', null, v.test_eseguiti)}
      {blocco('Conclusioni', 'conclusioni', v.conclusioni)}
      {blocco('Diagnosi', 'diagnosi_testo', v.diagnosi_testo)}
      {blocco('Piano di cura', 'piano', v.piano)}
      {v.prossimo_controllo ? <p className="border-t border-amber-100 pt-2 text-amber-900">Controllo previsto: {giorno(v.prossimo_controllo)}</p> : null}
    </aside>
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

  const modelli = useDati(() => q<ModelloAllergo[]>(supabase.schema('anagrafica').from('allergo_modelli').select('*').order('ordine')), []);
  const effettivi = modelliEffettivi(modelli.dati ?? []);
  const [profilo, setProfilo] = useState<string | null>(null);
  const [usati, setUsati] = useState<string[]>(() => (visita?.modelli as string[] | undefined) ?? []);

  const [strumento, setStrumento] = useState<null | 'prick' | 'spirometria' | Scala>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const etaAnni = (Date.parse(f.data) - Date.parse(paziente.data_nascita)) / (365.25 * 86_400_000);

  function inserisci(m: ModelloAllergo) {
    const testo = compila(m.testo, { nome: `${paziente.nome} ${paziente.cognome}`, peso: f.peso_kg || str(ultimoPeso), prossimoControllo: f.prossimo_controllo });
    const campo: keyof Campi = m.sezione === 'esame_obiettivo' ? 'esame_obiettivo' : m.sezione === 'anamnesi' ? 'anamnesi' : m.sezione;
    setF((x) => {
      // Non duplica un blocco già presente; l'esame obiettivo si inserisce solo se vuoto.
      if (x[campo].includes(testo.slice(0, 60)) || (m.sezione === 'esame_obiettivo' && x.esame_obiettivo.trim())) return x;
      return { ...x, [campo]: accoda(x[campo], testo) };
    });
    setUsati((u) => (u.includes(m.codice) ? u : [...u, m.codice]));
  }

  function applicaPacchetto(codici: string[]) {
    for (const c of codici) {
      const m = effettivi.get(c);
      if (m) inserisci(m);
    }
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
      if (anamnesi) {
        const { error } = await supabase.schema('clinica').from('allergo_cartelle')
          .update({ ...Object.fromEntries(Object.entries(anamnesi).map(([k, v]) => [k, v.trim() || null])), aggiornata_il: new Date().toISOString() })
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

      <div className={`grid gap-4 ${precedente ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
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
                    <span>{m.nome} <span className="text-xs text-slate-400">→ {SEZIONI_MODELLO[m.sezione]}</span>{usati.includes(m.codice) && <span className="ml-1 text-xs text-teal-700">✓ inserito</span>}</span>
                    <button type="button" onClick={() => inserisci(m)} className="text-xs text-teal-700 underline">Inserisci</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-amber-700">I modelli sono testi di partenza: verificare sempre farmaci e posologie in base a età ({Math.floor(etaAnni)} anni) e peso.</p>
          </Pannello>

          {/* Anamnesi della cartella */}
          <Pannello titolo="Anamnesi (dalla cartella)" sottotitolo="Familiare, fisiologica, remota e ambiente: si aggiorna anche la cartella"
                    azione={<button type="button" onClick={() => setCartellaAperta(!cartellaAperta)} className="text-sm text-teal-700 underline">{cartellaAperta ? 'Chiudi' : 'Apri'}</button>}>
            {cartellaAperta ? (
              <div className="grid gap-3 md:grid-cols-2">
                {VOCI_CARTELLA.map(([k, t]) => (
                  <div key={k} className={['anamnesi_familiare', 'anamnesi_fisiologica', 'anamnesi_remota'].includes(k) ? 'md:col-span-2' : ''}>
                    <Area etichetta={t} valore={valoriCartella[k]} righe={['anamnesi_familiare', 'anamnesi_fisiologica', 'anamnesi_remota'].includes(k) ? 3 : 1}
                          onChange={(v) => setAnamnesi({ ...valoriCartella, [k]: v })} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="line-clamp-3 text-sm text-slate-600">{VOCI_CARTELLA.filter(([k]) => valoriCartella[k]).map(([k, t]) => `${t}: ${valoriCartella[k]}`).join(' · ') || 'Anamnesi non ancora compilata.'}</p>
            )}
          </Pannello>

          <Pannello titolo={controllo ? 'Controllo clinico' : 'Anamnesi patologica prossima'}>
            <div className="space-y-3">
              {controllo && <Area etichetta={`Controllo clinico del ${giorno(f.data)}`} aiuto="Decorso dall'ultima visita, aderenza, sintomi, reazioni" valore={f.decorso} onChange={(v) => imposta('decorso', v)} />}
              <Area etichetta={controllo ? 'Anamnesi patologica prossima (se aggiornata)' : 'Anamnesi patologica prossima'} valore={f.anamnesi}
                    righe={controllo ? 3 : 6} onChange={(v) => imposta('anamnesi', v)} />
            </div>
          </Pannello>

          <Pannello titolo="Esame obiettivo">
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

          <Pannello titolo="Test eseguiti" sottotitolo="Registra i test della giornata, poi genera il testo del referto"
                    azione={<div className="flex flex-wrap gap-1">
                      <Bottone onClick={() => setStrumento('prick')}>Prick test</Bottone>
                      <Bottone onClick={() => setStrumento('spirometria')}>Spirometria</Bottone>
                      {(['scorad', 'poem', etaAnni >= 12 ? 'act' : 'c_act', 'uas7'] as Scala[]).map((x) => <Bottone key={x} onClick={() => setStrumento(x)}>{NOMI_SCALA[x].nome}</Bottone>)}
                    </div>}>
            <Area etichetta="Testo nel referto" valore={f.test_eseguiti} righe={6} onChange={(v) => imposta('test_eseguiti', v)} />
            <button type="button" onClick={() => void generaTest()} className="mt-1 text-sm text-teal-700 underline">Genera dai test registrati il {giorno(f.data.slice(0, 10))}</button>
          </Pannello>

          <Pannello titolo="Conclusioni e diagnosi">
            <div className="space-y-3">
              <Area etichetta="Conclusioni" valore={f.conclusioni} onChange={(v) => imposta('conclusioni', v)} />
              <Area etichetta="Diagnosi" aiuto="Una per riga" valore={f.diagnosi_testo} righe={3} onChange={(v) => imposta('diagnosi_testo', v)} />
            </div>
          </Pannello>

          <Pannello titolo="Piano di cura">
            <Area etichetta="Indicazioni e terapia" aiuto="Le righe che iniziano con «-» diventano un elenco puntato nel referto" valore={f.piano} righe={16} onChange={(v) => imposta('piano', v)} />
            <label className="mt-3 block w-56 text-sm"><span className="block text-slate-500">Prossimo controllo</span>
              <input type="date" min={oggi()} value={f.prossimo_controllo} onChange={(e) => imposta('prossimo_controllo', e.target.value)} className={stileInput} /></label>
          </Pannello>

          <div className="flex justify-end gap-2">
            <Bottone onClick={onChiudi}>Annulla</Bottone>
            <Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva visita'}</Bottone>
          </div>
        </div>

        {precedente && <VisitaPrecedente v={precedente} prima={prima} onRiprendi={(campo, testo) => { if (!f[campo].includes(testo)) imposta(campo, accoda(f[campo], testo)); }} />}
      </div>
    </form>

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
