import {
  avvisoVitaAltezza, criteriSospensioneGh, fmtPercentileFine, fmtSds, pubarcaPrecoce, valutaPuberta, type AuxoPaziente, type RigaAllergo,
} from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../../lib/dati';
import { supabase } from '../../lib/supabase';
import { accoda, compila, modelliEffettivi, type ModelloAllergo } from '../allergo/referto';
import { giorno, oggi, s, stileInput } from '../allergo/Registro';
import { Badge, Bottone, Caricamento, Errore, Pannello } from '../ui';
import { analizzaMisure, n, targetDaCartella, type MisuraAnalizzata } from './analisi';
import { TIPI_VISITA_AUXO } from './definizioni';

type CampiVisita = Record<'data' | 'tipo' | 'motivo' | 'anamnesi' | 'decorso' | 'esame_obiettivo' | 'esami_eseguiti' | 'conclusioni' |
  'diagnosi_testo' | 'piano' | 'prossimo_controllo', string>;
const CAMPI_MISURA_VISITA = ['altezza_cm', 'posizione', 'peso_kg', 'cc_cm', 'vita_cm', 'altezza_seduto_cm', 'apertura_braccia_cm',
  'pas_mmhg', 'pad_mmhg', 'velocita_sds', 'velocita_riferimento'] as const;
type CampoMisura = (typeof CAMPI_MISURA_VISITA)[number];
const CAMPI_PUB = ['tanner_b', 'tanner_g', 'tanner_ph', 'testicolo_dx_ml', 'testicolo_sx_ml', 'menarca'] as const;
type CampoPub = (typeof CAMPI_PUB)[number];

const NUMERICI = new Set<string>(['altezza_cm', 'peso_kg', 'cc_cm', 'vita_cm', 'altezza_seduto_cm', 'apertura_braccia_cm', 'pas_mmhg', 'pad_mmhg',
  'velocita_sds', 'tanner_b', 'tanner_g', 'tanner_ph', 'testicolo_dx_ml', 'testicolo_sx_ml']);

const oraLocale = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const str = (v: unknown) => (v == null ? '' : String(v));
/** '' → null, numeri con la virgola → numero. */
function valoreDb(k: string, x: string): unknown {
  const t = x.trim();
  if (!t) return null;
  if (k === 'menarca') return t === 'true';
  return NUMERICI.has(k) ? Number(t.replace(',', '.')) : t;
}

function Area({ etichetta, valore, onChange, righe = 4, modelli, onModello }: {
  etichetta: string; valore: string; onChange: (v: string) => void; righe?: number;
  modelli?: ModelloAllergo[]; onModello?: (m: ModelloAllergo) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="flex flex-wrap items-center gap-2 font-medium text-slate-700">
        {etichetta}
        {modelli?.map((m) => (
          <button key={m.id} type="button" onClick={() => onModello?.(m)} title={m.testo}
                  className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-normal text-teal-800 hover:bg-teal-100">+ {m.nome}</button>
        ))}
      </span>
      <textarea rows={righe} value={valore} onChange={(e) => onChange(e.target.value)} className={`${stileInput} font-[inherit]`} />
    </label>
  );
}

/**
 * Visita auxologica: testo del referto, misure del giorno (con DS calcolate mentre si scrive),
 * stadio puberale, modelli di testo e visita precedente a fianco. Le misure e lo stadio puberale
 * si salvano nelle rispettive tabelle collegati alla visita: grafici e calcoli li ritrovano.
 */
export default function VisitaAuxologica({ pseudo, paziente, visita, visite, misure, cartella, terapieGh, onChiudi, onSalvata }: {
  pseudo: string; paziente: AuxoPaziente; visita: RigaAllergo | null; visite: RigaAllergo[]; misure: RigaAllergo[];
  cartella: Record<string, unknown> | null; terapieGh: boolean; onChiudi: () => void; onSalvata: () => void;
}) {
  const collegate = useDati(async () => {
    if (!visita) return { misura: null, puberta: null };
    const [m, p] = await Promise.all([
      q<RigaAllergo[]>(supabase.schema('clinica').from('auxo_misure').select('*').eq('visita_id', visita.id).order('creato_il').limit(1)),
      q<RigaAllergo[]>(supabase.schema('clinica').from('auxo_puberta').select('*').eq('visita_id', visita.id).order('creato_il').limit(1)),
    ]);
    return { misura: m[0] ?? null, puberta: p[0] ?? null };
  }, [visita?.id]);
  // Misura dello stesso giorno già registrata da «Misure» (senza visita): si collega a questa visita invece di duplicarla.
  const giornoIniziale = new Date(visita ? String(visita.data) : Date.now()).toLocaleDateString('sv-SE');
  const delGiorno = misure.find((x) => !x.visita_id && String(x.data).slice(0, 10) === giornoIniziale) ?? null;
  const modelli = useDati(() => q<ModelloAllergo[]>(supabase.schema('anagrafica').from('auxo_modelli').select('*').order('ordine')), []);

  if (collegate.errore) return <Errore messaggio={collegate.errore} />;
  if (collegate.caricamento || !collegate.dati) return <Caricamento />;
  return (
    <Editor pseudo={pseudo} paziente={paziente} visita={visita} visite={visite} misure={misure} cartella={cartella} terapieGh={terapieGh}
            misuraIniziale={collegate.dati.misura ?? delGiorno} pubertaIniziale={collegate.dati.puberta}
            modelli={modelli.dati ? [...modelliEffettivi(modelli.dati).values()] : []} onChiudi={onChiudi} onSalvata={onSalvata} />
  );
}

function Editor({ pseudo, paziente: p, visita, visite, misure, cartella, terapieGh, misuraIniziale, pubertaIniziale, modelli, onChiudi, onSalvata }: {
  pseudo: string; paziente: AuxoPaziente; visita: RigaAllergo | null; visite: RigaAllergo[]; misure: RigaAllergo[];
  cartella: Record<string, unknown> | null; terapieGh: boolean; misuraIniziale: RigaAllergo | null; pubertaIniziale: RigaAllergo | null;
  modelli: ModelloAllergo[]; onChiudi: () => void; onSalvata: () => void;
}) {
  const precedenti = visite.filter((x) => x.id !== visita?.id && (!visita || Date.parse(String(x.data)) < Date.parse(String(visita.data))));
  const [c, setC] = useState<CampiVisita>(() => ({
    data: oraLocale(visita ? String(visita.data) : undefined),
    tipo: visita ? s(visita, 'tipo') : precedenti.length ? (terapieGh ? 'terapia_gh' : 'controllo') : 'prima_visita',
    motivo: visita ? s(visita, 'motivo') : precedenti.length ? 'Controllo auxologico' : '',
    anamnesi: str(visita?.anamnesi), decorso: str(visita?.decorso), esame_obiettivo: str(visita?.esame_obiettivo),
    esami_eseguiti: str(visita?.esami_eseguiti), conclusioni: str(visita?.conclusioni), diagnosi_testo: str(visita?.diagnosi_testo),
    piano: str(visita?.piano), prossimo_controllo: str(visita?.prossimo_controllo),
  }));
  const [m, setM] = useState<Record<CampoMisura, string>>(() =>
    Object.fromEntries(CAMPI_MISURA_VISITA.map((k) => [k, str(misuraIniziale?.[k])])) as Record<CampoMisura, string>);
  const [pb, setPb] = useState<Record<CampoPub, string>>(() =>
    Object.fromEntries(CAMPI_PUB.map((k) => [k, str(pubertaIniziale?.[k])])) as Record<CampoPub, string>);
  const [idVisita, setIdVisita] = useState<string | null>(visita?.id ?? null);
  const [idMisura, setIdMisura] = useState<string | null>(misuraIniziale?.id ?? null);
  const [idPuberta, setIdPuberta] = useState<string | null>(pubertaIniziale?.id ?? null);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  const giornoVisita = c.data.slice(0, 10);
  const conMisure = CAMPI_MISURA_VISITA.some((k) => k !== 'posizione' && k !== 'velocita_riferimento' && m[k].trim());
  const conPuberta = CAMPI_PUB.some((k) => pb[k].trim());

  // Calcoli dal vivo: le misure della visita come se fossero già salvate.
  const riga: RigaAllergo = {
    id: 'questa-visita', pseudo_id: pseudo, data: giornoVisita,
    ...Object.fromEntries(CAMPI_MISURA_VISITA.map((k) => [k, valoreDb(k, m[k])])),
  };
  const alt = Number(m.altezza_cm.replace(',', '.'));
  const pes = Number(m.peso_kg.replace(',', '.'));
  if (alt > 0 && pes > 0) riga.bmi = Math.round((pes / (alt / 100) ** 2) * 100) / 100;
  const altre = misure.filter((x) => x.id !== idMisura && String(x.data) <= giornoVisita);
  let analisi: MisuraAnalizzata | null = null;
  try {
    analisi = conMisure && giornoVisita >= p.data_nascita ? analizzaMisure(p.data_nascita, p.sesso, [...altre, riga]).find((x) => x.riga.id === 'questa-visita') ?? null : null;
  } catch { analisi = null; }
  const target = targetDaCartella(cartella, p.sesso);
  const eta = analisi?.anni ?? (Date.parse(giornoVisita) - Date.parse(p.data_nascita)) / (365.25 * 86_400_000);
  const pub = conPuberta ? valutaPuberta({
    sesso: p.sesso, eta, b: pb.tanner_b ? Number(pb.tanner_b) : null, g: pb.tanner_g ? Number(pb.tanner_g) : null,
    ph: pb.tanner_ph ? Number(pb.tanner_ph) : null, menarca: pb.menarca ? pb.menarca === 'true' : null,
    testicoli_ml: pb.testicolo_dx_ml || pb.testicolo_sx_ml ? Math.max(Number(pb.testicolo_dx_ml || 0), Number(pb.testicolo_sx_ml || 0)) : null,
  }) : null;
  const pubarca = conPuberta && pubarcaPrecoce({
    sesso: p.sesso, eta, b: pb.tanner_b ? Number(pb.tanner_b) : null, g: pb.tanner_g ? Number(pb.tanner_g) : null,
    ph: pb.tanner_ph ? Number(pb.tanner_ph) : null,
    testicoli_ml: pb.testicolo_dx_ml || pb.testicolo_sx_ml ? Math.max(Number(pb.testicolo_dx_ml || 0), Number(pb.testicolo_sx_ml || 0)) : null,
  });

  const perSezione = (sezione: string) => modelli.filter((x) => x.sezione === sezione);
  const usaModello = (campo: keyof CampiVisita) => (x: ModelloAllergo) =>
    setC((prev) => ({ ...prev, [campo]: accoda(prev[campo], compila(x.testo, { nome: p.nome, peso: m.peso_kg.replace('.', ','), prossimoControllo: prev.prossimo_controllo })) }));
  const area = (campo: keyof CampiVisita, etichetta: string, sezione?: string, righe = 4) => (
    <Area etichetta={etichetta} valore={c[campo]} righe={righe} onChange={(x) => setC({ ...c, [campo]: x })}
          modelli={sezione ? perSezione(sezione) : undefined} onModello={usaModello(campo)} />
  );
  const LIMITI: Partial<Record<CampoMisura, [string, string]>> = {
    altezza_cm: ['30', '230'], peso_kg: ['0.3', '250'], cc_cm: ['25', '70'], vita_cm: ['30', '200'], altezza_seduto_cm: ['15', '130'],
    apertura_braccia_cm: ['30', '240'], pas_mmhg: ['50', '250'], pad_mmhg: ['20', '160'], velocita_sds: ['-8', '8'],
  };
  const input = (k: CampoMisura, etichetta: string, passo = '0.1') => (
    <label className="text-sm"><span className="block text-slate-500">{etichetta}</span>
      <input type="number" step={passo} inputMode="decimal" min={LIMITI[k]?.[0]} max={LIMITI[k]?.[1]} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} className={stileInput} /></label>
  );
  const scelta = (k: CampoPub, etichetta: string, opzioni: [string, string][]) => (
    <label className="text-sm"><span className="block text-slate-500">{etichetta}</span>
      <select value={pb[k]} onChange={(e) => setPb({ ...pb, [k]: e.target.value })} className={stileInput}>
        <option value="">—</option>
        {opzioni.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select></label>
  );
  const tanner = [1, 2, 3, 4, 5].map((x) => [String(x), String(x)] as [string, string]);
  const prader = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25].map((x) => [String(x), `${x} ml`] as [string, string]);

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (!c.motivo.trim()) return setErrore('Indica il motivo della visita.');
    if (c.prossimo_controllo && c.prossimo_controllo < giornoVisita) return setErrore('Il prossimo controllo precede la data della visita.');
    if (giornoVisita < p.data_nascita) return setErrore('La data della visita precede la nascita.');
    if (idMisura && !conMisure) return setErrore('Le misure già registrate non si cancellano: correggi i valori (le modifiche restano nel registro).');
    if (idPuberta && !conPuberta) return setErrore('Lo stadio puberale già registrato non si cancella: correggi i valori.');
    if ((m.pas_mmhg.trim() === '') !== (m.pad_mmhg.trim() === '')) return setErrore('Inserisci sia la pressione sistolica sia la diastolica.');
    if (m.velocita_sds.trim() && !m.altezza_cm.trim()) return setErrore('La velocità in DS richiede la statura del giorno.');
    if (m.altezza_seduto_cm.trim() && m.altezza_cm.trim() && Number(m.altezza_seduto_cm) >= Number(m.altezza_cm)) return setErrore('L\'altezza da seduto deve essere minore della statura.');
    setInvio(true);
    try {
      const cli = supabase.schema('clinica');
      const quando = new Date(c.data).getTime();
      const precedente = [...visite].filter((x) => x.id !== idVisita && Date.parse(String(x.data)) < quando)
        .sort((a, b) => Date.parse(String(b.data)) - Date.parse(String(a.data)))[0];
      const datiVisita = {
        data: new Date(c.data).toISOString(), tipo: c.tipo, motivo: c.motivo.trim(),
        ...Object.fromEntries((['anamnesi', 'decorso', 'esame_obiettivo', 'esami_eseguiti', 'conclusioni', 'diagnosi_testo', 'piano'] as const)
          .map((k) => [k, c[k].trim() || null])),
        prossimo_controllo: c.prossimo_controllo || null,
        visita_precedente_id: precedente?.id ?? null,
      };
      let id = idVisita;
      if (id) {
        const { error } = await cli.from('auxo_visite').update(datiVisita).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        // La fotografia dell'anamnesi si prende solo alla prima registrazione: le correzioni successive non cambiano il referto storico.
        const { data, error } = await cli.from('auxo_visite').insert({ ...datiVisita, pseudo_id: pseudo, anamnesi_snapshot: cartella, modelli: [] }).select('id').single();
        if (error) throw new Error(error.message);
        id = (data as { id: string }).id;
        setIdVisita(id);
      }

      if (conMisure) {
        const riga = { data: giornoVisita, visita_id: id, ...Object.fromEntries(CAMPI_MISURA_VISITA.map((k) => [k, valoreDb(k, m[k])])) };
        if (idMisura) {
          const { error } = await cli.from('auxo_misure').update(riga).eq('id', idMisura);
          if (error) throw new Error(`Visita salvata, misure non salvate: ${error.message}`);
        } else {
          const { data, error } = await cli.from('auxo_misure').insert({ ...riga, pseudo_id: pseudo }).select('id').single();
          if (error) throw new Error(`Visita salvata, misure non salvate: ${error.message}`);
          setIdMisura((data as { id: string }).id);
        }
      }
      if (conPuberta) {
        const riga = { data: giornoVisita, visita_id: id, ...Object.fromEntries(CAMPI_PUB.map((k) => [k, valoreDb(k, pb[k])])) };
        if (idPuberta) {
          const { error } = await cli.from('auxo_puberta').update(riga).eq('id', idPuberta);
          if (error) throw new Error(`Visita salvata, stadio puberale non salvato: ${error.message}`);
        } else {
          const { data, error } = await cli.from('auxo_puberta').insert({ ...riga, pseudo_id: pseudo }).select('id').single();
          if (error) throw new Error(`Visita salvata, stadio puberale non salvato: ${error.message}`);
          setIdPuberta((data as { id: string }).id);
        }
      }
      onSalvata();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally {
      setInvio(false);
    }
  }

  const prec = precedenti[0];
  return (
    <form onSubmit={(e) => void salva(e)} className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <Pannello titolo={visita ? `Visita del ${giorno(visita.data)}` : 'Nuova visita auxologica'}
                  azione={<Bottone onClick={onChiudi}>{idVisita && !visita ? 'Chiudi (visita già salvata)' : 'Chiudi senza salvare'}</Bottone>}>
          {errore && <div className="mb-3"><Errore messaggio={errore} /></div>}
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm"><span className="block text-slate-500">Data e ora</span>
              <input type="datetime-local" required value={c.data} min={`${p.data_nascita}T00:00`} max={oraLocale()} onChange={(e) => setC({ ...c, data: e.target.value })} className={stileInput} /></label>
            <label className="text-sm"><span className="block text-slate-500">Tipo</span>
              <select value={c.tipo} onChange={(e) => setC({ ...c, tipo: e.target.value })} className={stileInput}>
                {Object.entries(TIPI_VISITA_AUXO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select></label>
            <label className="text-sm"><span className="block text-slate-500">Motivo *</span>
              <input required value={c.motivo} onChange={(e) => setC({ ...c, motivo: e.target.value })} className={stileInput} placeholder="Es. Bassa statura" /></label>
          </div>
          <div className="mt-3 space-y-3">
            {area('anamnesi', c.tipo === 'prima_visita' ? 'Anamnesi patologica prossima' : 'Anamnesi', 'anamnesi')}
            {c.tipo !== 'prima_visita' && area('decorso', 'Decorso dall\'ultimo controllo', 'decorso', 3)}
          </div>
        </Pannello>

        <Pannello titolo="Misure di oggi" sottotitolo="Statura allo stadiometro al millimetro; le DS si calcolano mentre scrivi">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {input('altezza_cm', 'Statura (cm)')}
            <label className="text-sm"><span className="block text-slate-500">Misurata</span>
              <select value={m.posizione} onChange={(e) => setM({ ...m, posizione: e.target.value })} className={stileInput}>
                <option value="">Automatico (età)</option><option value="sdraiato">Da sdraiato</option><option value="in_piedi">In piedi</option>
              </select></label>
            {input('peso_kg', 'Peso (kg)', '0.01')}
            {input('cc_cm', 'Circonferenza cranica (cm)')}
            {input('vita_cm', 'Circonferenza vita (cm)')}
            {input('altezza_seduto_cm', 'Altezza da seduto (cm)')}
            {input('apertura_braccia_cm', 'Apertura braccia (cm)')}
            {input('pas_mmhg', 'PA sistolica (mmHg)', '1')}
            {input('pad_mmhg', 'PA diastolica (mmHg)', '1')}
            {input('velocita_sds', 'Velocità in DS (da tabelle)', '0.01')}
            <label className="text-sm sm:col-span-2"><span className="block text-slate-500">Tabelle di velocità usate</span>
              <input value={m.velocita_riferimento} onChange={(e) => setM({ ...m, velocita_riferimento: e.target.value })} className={stileInput} placeholder="Es. Tanner-Whitehouse" /></label>
          </div>
          {analisi && (
            <dl className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {analisi.sdsAltezza && <div><dt className="text-slate-500">Statura</dt><dd className="font-medium">{fmtSds(analisi.sdsAltezza.z)} · {fmtPercentileFine(analisi.sdsAltezza.percentile)} pc <span className="text-xs text-slate-500">({analisi.sdsAltezza.curva})</span></dd></div>}
              {analisi.sdsPeso && <div><dt className="text-slate-500">Peso</dt><dd className="font-medium">{fmtSds(analisi.sdsPeso.z)} · {fmtPercentileFine(analisi.sdsPeso.percentile)} pc</dd></div>}
              {analisi.bmi != null && <div><dt className="text-slate-500">BMI</dt><dd className="font-medium">{n(analisi.bmi, 1)} kg/m²{analisi.sdsBmi ? ` · ${fmtSds(analisi.sdsBmi.z)}` : ''}</dd></div>}
              {analisi.classePeso && <div><dt className="text-slate-500">Peso (OMS, consensus SIEDP-SIP)</dt><dd><Badge tono={analisi.classePeso.classe === 'normale' ? 'ok' : 'attenzione'}>{analisi.classePeso.etichetta}</Badge> <span className="text-xs text-slate-500">{fmtPercentileFine(analisi.classePeso.percentile)} pc</span></dd></div>}
              {analisi.sdsCc && <div><dt className="text-slate-500">Circonferenza cranica</dt><dd className="font-medium">{fmtSds(analisi.sdsCc.z)}</dd></div>}
              {analisi.velocita && <div><dt className="text-slate-500">Velocità di crescita</dt><dd className="font-medium">{n(analisi.velocita.cmAnno)} cm/anno <span className="text-xs text-slate-500">dal {giorno(analisi.velocita.da)}</span>{analisi.velocita.avviso && <span className="block text-xs text-amber-700">{analisi.velocita.avviso}</span>}</dd></div>}
              {analisi.deltaSdsAnno != null && <div><dt className="text-slate-500">Variazione DS statura</dt><dd className="font-medium">{fmtSds(analisi.deltaSdsAnno)}/anno</dd></div>}
              {target && analisi.sdsAltezza?.riferimento === 'cacciari' && target.sds != null && <div><dt className="text-slate-500">Statura − target</dt><dd className="font-medium">{fmtSds(analisi.sdsAltezza.z - target.sds)}</dd></div>}
              {analisi.vitaAltezza != null && <div><dt className="text-slate-500">Vita / statura</dt><dd className={avvisoVitaAltezza(analisi.vitaAltezza, analisi.mesi, analisi.classePeso?.classe) ? 'font-medium text-amber-700' : 'font-medium'}>{n(analisi.vitaAltezza, 2)}{avvisoVitaAltezza(analisi.vitaAltezza, analisi.mesi, analisi.classePeso?.classe) ? ' (> 0,5 con eccesso ponderale: considerare lo screening della steatosi epatica)' : ''}</dd></div>}
              {terapieGh && analisi.velocita?.affidabile && criteriSospensioneGh(p.sesso, analisi.velocita.cmAnno, null).map((x) => <div key={x} className="text-amber-700 sm:col-span-2">{x}</div>)}
            </dl>
          )}
        </Pannello>

        <Pannello titolo="Stadio puberale (Tanner)" sottotitolo="Facoltativo: compila se valutato oggi">
          <div className="grid gap-3 sm:grid-cols-4">
            {p.sesso === 'F' ? <>
              {scelta('tanner_b', 'Mammella (B)', tanner)}
              {scelta('tanner_ph', 'Peli pubici (PH)', tanner)}
              {scelta('menarca', 'Menarca', [['false', 'Non ancora'], ['true', 'Avvenuto']])}
            </> : <>
              {scelta('tanner_g', 'Genitali (G)', tanner)}
              {scelta('tanner_ph', 'Peli pubici (PH)', tanner)}
              {scelta('testicolo_dx_ml', 'Testicolo dx', prader)}
              {scelta('testicolo_sx_ml', 'Testicolo sx', prader)}
            </>}
          </div>
          {pub && pub.esito !== 'dati_insufficienti' && (
            <p className="mt-2 text-sm"><Badge tono={pub.esito === 'nei_limiti' ? 'ok' : 'attenzione'}>{pub.testo}</Badge>
              {pubarca && <span className="ml-2"><Badge tono="attenzione">Pubarca prima {p.sesso === 'F' ? 'degli 8' : 'dei 9'} anni senza segni gonadici documentati</Badge></span>}</p>
          )}
        </Pannello>

        <Pannello titolo="Referto">
          <div className="space-y-3">
            {area('esame_obiettivo', 'Esame obiettivo', 'esame_obiettivo')}
            {area('esami_eseguiti', 'Esami ed accertamenti in visione', undefined, 3)}
            {area('conclusioni', 'Conclusioni', 'conclusioni')}
            {area('diagnosi_testo', 'Diagnosi (una per riga)', undefined, 2)}
            {area('piano', 'Indicazioni e piano', 'piano', 5)}
            <label className="block max-w-xs text-sm"><span className="block text-slate-500">Prossimo controllo</span>
              <input type="date" value={c.prossimo_controllo} min={giornoVisita || oggi()} onChange={(e) => setC({ ...c, prossimo_controllo: e.target.value })} className={stileInput} /></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva la visita'}</Bottone>
            <span className="text-xs text-slate-500">Misure e stadio puberale si salvano con la visita; ogni modifica resta nel registro accessi.</span>
          </div>
        </Pannello>
      </div>

      <aside className="space-y-3 text-sm lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="font-semibold text-amber-900">Visita precedente</p>
          {!prec ? <p className="text-slate-600">Nessuna: è la prima visita.</p> : (
            <div className="space-y-1">
              <p className="text-amber-900">{giorno(prec.data)} · {TIPI_VISITA_AUXO[s(prec, 'tipo')] ?? ''}</p>
              {prec.conclusioni ? <p className="whitespace-pre-line text-slate-700">{s(prec, 'conclusioni')}</p> : null}
              {prec.piano ? <p className="whitespace-pre-line text-slate-600">{s(prec, 'piano')}</p> : null}
              <button type="button" className="text-xs text-teal-700 underline"
                      onClick={() => setC({ ...c, decorso: accoda(c.decorso, s(prec, 'conclusioni')) })}>Importa le conclusioni nel decorso</button>
            </div>
          )}
        </div>
        {target && <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-slate-500">Target genetico</p><p className="font-medium">{n(target.cm)} cm (intervallo {n(target.min)}–{n(target.max)}) · {fmtSds(target.sds)}</p></div>}
        <p className="text-xs text-slate-500">
          I valori calcolati (DS, percentili, classificazioni) sono un supporto: la valutazione clinica resta del medico.
        </p>
      </aside>
    </form>
  );
}
