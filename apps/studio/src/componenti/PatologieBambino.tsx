import type { Patologia, PatologiaPaziente } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Caricamento, Errore, Vuoto, type Tono } from './ui';

export const STATI_PATOLOGIA: Record<PatologiaPaziente['stato'], { testo: string; tono: Tono }> = {
  sospetta: { testo: 'Sospetta', tono: 'attenzione' },
  confermata: { testo: 'Confermata', tono: 'info' },
  esclusa: { testo: 'Esclusa', tono: 'neutro' },
};

/** Patologie del bambino collegate al catalogo, con stato, esenzione e centro di riferimento. */
export default function PatologieBambino({ pseudoId }: { pseudoId: string }) {
  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState({
    patologia: '', stato: 'sospetta' as PatologiaPaziente['stato'], data: '', esenzione: false, centro: '', note: '',
  });
  const [errore, setErrore] = useState<string | null>(null);

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

  async function aggiorna(id: string, campi: Partial<Pick<PatologiaPaziente, 'stato' | 'esenzione_attiva'>>) {
    setErrore(null);
    const { error } = await supabase.schema('clinica').from('patologie_paziente').update(campi).eq('id', id);
    if (error) setErrore(error.message);
    else elenco.ricarica();
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
                  <select value={r.stato} onChange={(e) => void aggiorna(r.id, { stato: e.target.value as PatologiaPaziente['stato'] })}
                          aria-label="Stato della patologia" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                    {(Object.keys(STATI_PATOLOGIA) as PatologiaPaziente['stato'][]).map((s) => <option key={s} value={s}>{STATI_PATOLOGIA[s].testo}</option>)}
                  </select>
                  {p?.esenzione && (
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input type="checkbox" checked={r.esenzione_attiva} onChange={(e) => void aggiorna(r.id, { esenzione_attiva: e.target.checked })} />
                      Esenzione attiva
                    </label>
                  )}
                </div>
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
        Il catalogo è di consultazione: lo stato della patologia lo stabilisce il medico. Per l'esenzione serve la certificazione di un presidio della rete malattie rare (malattie rare) o di una struttura specialistica del Servizio sanitario (patologie croniche), presentata alla ASL.
      </p>
    </div>
  );
}
