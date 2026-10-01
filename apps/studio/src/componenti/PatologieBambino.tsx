import type { MembroStudio, Patologia, PatologiaPaziente, VoceStorico } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';
import Storico from './Storico';
import { Badge, Bottone, Caricamento, Errore, Vuoto, type Tono } from './ui';

export const STATI_PATOLOGIA: Record<PatologiaPaziente['stato'], { testo: string; tono: Tono }> = {
  sospetta: { testo: 'Sospetta', tono: 'attenzione' },
  confermata: { testo: 'Confermata', tono: 'info' },
  esclusa: { testo: 'Esclusa', tono: 'neutro' },
};

const ETICHETTE_CAMPI: Record<string, string> = {
  stato: 'Stato', data_diagnosi: 'Data diagnosi', esenzione_attiva: 'Esenzione attiva',
  centro_riferimento: 'Centro di riferimento', note: 'Note', patologia: 'Patologia',
};

/** Riga in modifica: tutti i campi clinici, salvati in un'unica modifica tracciata. */
function ModificaRiga({ r, conEsenzione, onFatto }: { r: PatologiaPaziente; conEsenzione: boolean; onFatto: (errore?: string) => void }) {
  const [m, setM] = useState({ stato: r.stato, data: r.data_diagnosi ?? '', esenzione: r.esenzione_attiva, centro: r.centro_riferimento ?? '', note: r.note ?? '' });
  async function salva(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.schema('clinica').from('patologie_paziente').update({
      stato: m.stato, data_diagnosi: m.data || null, esenzione_attiva: m.esenzione,
      centro_riferimento: m.centro.trim() || null, note: m.note.trim() || null,
    }).eq('id', r.id);
    onFatto(error?.message);
  }
  const stile = 'w-full rounded-lg border border-slate-300 px-2 py-1';
  return (
    <form onSubmit={(e) => void salva(e)} className="mt-2 grid w-full gap-2 rounded-lg bg-slate-50 p-2 text-sm md:grid-cols-2">
      <label><span className="block text-xs text-slate-500">Stato</span>
        <select value={m.stato} onChange={(e) => setM({ ...m, stato: e.target.value as PatologiaPaziente['stato'] })} className={stile}>
          {(Object.keys(STATI_PATOLOGIA) as PatologiaPaziente['stato'][]).map((s) => <option key={s} value={s}>{STATI_PATOLOGIA[s].testo}</option>)}
        </select></label>
      <label><span className="block text-xs text-slate-500">Data della diagnosi</span>
        <input type="date" max={oggiIso()} value={m.data} onChange={(e) => setM({ ...m, data: e.target.value })} className={stile} /></label>
      <label><span className="block text-xs text-slate-500">Centro di riferimento</span>
        <input value={m.centro} onChange={(e) => setM({ ...m, centro: e.target.value })} className={stile} /></label>
      <label className="flex items-end gap-2 pb-1 text-xs text-slate-700">
        <input type="checkbox" disabled={!conEsenzione} checked={m.esenzione} onChange={(e) => setM({ ...m, esenzione: e.target.checked })} /> Esenzione attiva</label>
      <label className="md:col-span-2"><span className="block text-xs text-slate-500">Note</span>
        <input value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} className={stile} /></label>
      <div className="flex gap-2 md:col-span-2">
        <Bottone type="submit" variante="primario">Salva modifiche</Bottone>
        <Bottone onClick={() => onFatto()}>Annulla</Bottone>
      </div>
    </form>
  );
}

/** Patologie del bambino collegate al catalogo, con stato, esenzione e centro di riferimento. */
export default function PatologieBambino({ pseudoId }: { pseudoId: string }) {
  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState({
    patologia: '', stato: 'sospetta' as PatologiaPaziente['stato'], data: '', esenzione: false, centro: '', note: '',
  });
  const [errore, setErrore] = useState<string | null>(null);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [conStorico, setConStorico] = useState<string | null>(null);

  const storico = useDati(
    async () => (conStorico
      ? q<VoceStorico[]>(supabase.schema('clinica').from('patologie_storico').select('*').eq('riga_id', conStorico).order('avvenuto_il', { ascending: false }))
      : []),
    [conStorico],
  );
  const autori = useDati(async () => new Map(
    (await q<MembroStudio[]>(supabase.schema('anagrafica').from('membri_studio').select('utente_id, nome, cognome, email')))
      .map((m) => [m.utente_id, `${m.nome ?? ''} ${m.cognome ?? ''}`.trim() || m.email || 'utente'] as [string, string]),
  ), []);

  const catalogo = useDati(() => q<Patologia[]>(supabase.schema('anagrafica').from('catalogo_patologie').select('*').order('nome')), []);
  const elenco = useDati(
    () => q<PatologiaPaziente[]>(supabase.schema('clinica').from('patologie_paziente').select('*').eq('pseudo_id', pseudoId).order('creato_il')),
    [pseudoId],
  );

  const scheda = (c: string) => catalogo.dati?.find((p) => p.codice === c);

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    const { error } = await supabase.schema('clinica').from('patologie_paziente').insert({
      pseudo_id: pseudoId,
      patologia: form.patologia,
      stato: form.stato,
      data_diagnosi: form.data || null,
      esenzione_attiva: form.esenzione,
      centro_riferimento: form.centro.trim() || null,
      note: form.note.trim() || null,
    });
    if (error) {
      return setErrore(error.code === '23505' ? 'Questa patologia è già registrata per il bambino.' : `Salvataggio non riuscito: ${error.message}`);
    }
    setAperto(false);
    setForm({ patologia: '', stato: 'sospetta', data: '', esenzione: false, centro: '', note: '' });
    elenco.ricarica();
  }

  if (catalogo.errore || elenco.errore) return <Errore messaggio={catalogo.errore ?? elenco.errore ?? ''} />;
  if (catalogo.caricamento || elenco.caricamento) return <Caricamento />;

  const scelta = scheda(form.patologia);

  return (
    <div className="space-y-3">
      {errore && <Errore messaggio={errore} />}
      {(elenco.dati ?? []).length === 0 ? <Vuoto testo="Nessuna patologia registrata." /> : (
        <ul className="divide-y divide-slate-100">
          {elenco.dati?.map((r) => {
            const p = scheda(r.patologia);
            return (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div>
                  <a href={link('patologie', r.patologia)} className="font-medium text-slate-900 hover:underline">{p?.nome ?? r.patologia}</a>
                  <p className="text-slate-600">
                    {p?.esenzione ? `Esenzione ${p.esenzione}${r.esenzione_attiva ? ' (attiva)' : ' (non ancora rilasciata)'}` : 'Nessun codice di esenzione nazionale'}
                    {r.data_diagnosi && ` · dal ${fmtGiornoIso(r.data_diagnosi)}`}
                    {r.centro_riferimento && ` · ${r.centro_riferimento}`}
                  </p>
                  {r.note && <p className="text-xs text-slate-500">{r.note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tono={STATI_PATOLOGIA[r.stato].tono}>{STATI_PATOLOGIA[r.stato].testo}</Badge>
                  <button className="text-xs text-teal-700 underline" onClick={() => setInModifica(inModifica === r.id ? null : r.id)}>Modifica</button>
                  <button className="text-xs text-teal-700 underline" onClick={() => setConStorico(conStorico === r.id ? null : r.id)}>
                    {conStorico === r.id ? 'Nascondi storico' : 'Storico modifiche'}
                  </button>
                </div>
                {inModifica === r.id && (
                  <ModificaRiga r={r} conEsenzione={!!p?.esenzione}
                                onFatto={(err) => { if (err) setErrore(err); else { setInModifica(null); elenco.ricarica(); storico.ricarica(); } }} />
                )}
                {conStorico === r.id && (
                  <div className="mt-2 w-full">
                    <Storico voci={storico.dati ?? []} etichette={ETICHETTE_CAMPI} autori={autori.dati ?? undefined} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Bottone variante="primario" onClick={() => setAperto((v) => !v)}>+ Aggiungi patologia</Bottone>

      {aperto && (
        <form onSubmit={(e) => void salva(e)} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
          <label className="text-sm md:col-span-2">
            <span className="block text-slate-500">Patologia (dal catalogo)</span>
            <select value={form.patologia} onChange={(e) => setForm({ ...form, patologia: e.target.value })} required
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
              <option value="">— scegli —</option>
              {(['rara', 'cronica'] as const).map((t) => (
                <optgroup key={t} label={t === 'rara' ? 'Malattie rare' : 'Patologie croniche'}>
                  {(catalogo.dati ?? []).filter((p) => p.tipo === t).map((p) => (
                    <option key={p.codice} value={p.codice}>{p.nome}{p.esenzione ? ` (${p.esenzione})` : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {scelta && <span className="text-xs text-slate-500">{scelta.descrizione} <a className="text-teal-700 underline" href={link('patologie', scelta.codice)}>Apri la scheda</a></span>}
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Stato</span>
            <select value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value as PatologiaPaziente['stato'] })}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
              {(Object.keys(STATI_PATOLOGIA) as PatologiaPaziente['stato'][]).map((s) => <option key={s} value={s}>{STATI_PATOLOGIA[s].testo}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Data della diagnosi</span>
            <input type="date" value={form.data} max={oggiIso()} onChange={(e) => setForm({ ...form, data: e.target.value })}
                   className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Centro di riferimento</span>
            <input value={form.centro} onChange={(e) => setForm({ ...form, centro: e.target.value })} placeholder="Es. centro regionale, reparto"
                   className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.esenzione} disabled={!scelta?.esenzione}
                   onChange={(e) => setForm({ ...form, esenzione: e.target.checked })} />
            Esenzione già rilasciata dalla ASL
          </label>
          <label className="text-sm md:col-span-2">
            <span className="block text-slate-500">Note</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                   className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
          <div className="md:col-span-2"><Bottone type="submit" variante="primario">Salva</Bottone></div>
        </form>
      )}
      <p className="text-xs text-slate-500">
        Il catalogo è di consultazione: lo stato della patologia lo stabilisce il medico. Le patologie non si cancellano: si segnano come escluse, e ogni modifica resta nello storico con autore, data e valori precedenti. Per l'esenzione serve la certificazione di un presidio della rete malattie rare (malattie rare) o di una struttura specialistica del Servizio sanitario (patologie croniche), presentata alla ASL.
      </p>
    </div>
  );
}
