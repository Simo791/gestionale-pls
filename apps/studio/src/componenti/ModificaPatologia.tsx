import type { Patologia } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { AREE } from './SchedaPatologia';
import { Bottone, Errore } from './ui';

export const ETICHETTE_CATALOGO: Record<string, string> = {
  nome: 'Nome', sinonimi: 'Sinonimi', area: 'Area', esenzione: 'Codice di esenzione', orpha: 'ORPHAcode',
  icd9cm: 'ICD-9-CM', descrizione: 'Descrizione', segni_allarme: 'Segni d\'allarme', diagnosi: 'Diagnosi',
  follow_up: 'Follow-up', specialisti: 'Specialisti', emergenza: 'Urgenze', note: 'Note', fonti: 'Fonti',
};

const righe = (xs: string[]) => xs.join('\n');
const aRighe = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** Modifica di una scheda del catalogo (solo amministratore): ogni salvataggio finisce nello storico. */
export default function ModificaPatologia({ p, onFatto }: { p: Patologia; onFatto: (salvata: boolean) => void }) {
  const [f, setF] = useState({
    nome: p.nome, sinonimi: righe(p.sinonimi), area: p.area, esenzione: p.esenzione ?? '', orpha: p.orpha?.toString() ?? '',
    icd9cm: p.icd9cm.join(', '), descrizione: p.descrizione, segni_allarme: righe(p.segni_allarme), diagnosi: p.diagnosi,
    follow_up: righe(p.follow_up), specialisti: p.specialisti, emergenza: p.emergenza ?? '', note: p.note ?? '',
    fonti: p.fonti.map((x) => `${x.titolo} | ${x.url}`).join('\n'), motivo: '',
  });
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (!f.motivo.trim()) return setErrore('Indica il motivo della modifica e la fonte (es. aggiornamento elenco regionale).');
    if (f.esenzione && !(p.tipo === 'rara' ? /^R[A-Z0-9]{5}$/ : /^0?[A-Z0-9]{3}$/).test(f.esenzione.trim())) {
      return setErrore(p.tipo === 'rara' ? 'Il codice di malattia rara ha la forma R + 5 caratteri (es. RN0680).' : 'Il codice di patologia cronica ha 3 caratteri (es. 059) o 4 (es. 0A02).');
    }
    const fonti = aRighe(f.fonti).map((r) => { const [titolo, url] = r.split('|').map((x) => x.trim()); return { titolo: titolo ?? '', url: url ?? '' }; });
    if (fonti.some((x) => !/^https?:\/\//.test(x.url))) return setErrore('Ogni fonte va scritta come «titolo | https://indirizzo».');
    const { error } = await supabase.schema('anagrafica').from('catalogo_patologie').update({
      nome: f.nome.trim(), sinonimi: aRighe(f.sinonimi), area: f.area, esenzione: f.esenzione.trim() || null,
      orpha: f.orpha.trim() ? Number(f.orpha) : null, icd9cm: f.icd9cm.split(/[\s,;]+/).filter(Boolean),
      descrizione: f.descrizione.trim(), segni_allarme: aRighe(f.segni_allarme), diagnosi: f.diagnosi.trim(),
      follow_up: aRighe(f.follow_up), specialisti: f.specialisti.trim(), emergenza: f.emergenza.trim() || null,
      note: f.note.trim() || null,
      fonti,
    }).eq('codice', p.codice);
    if (error) return setErrore(error.message);
    // Il motivo viene allegato alla voce di storico appena creata.
    await supabase.schema('api').rpc('motiva_modifica_catalogo', { p_codice: p.codice, p_motivo: f.motivo.trim() });
    onFatto(true);
  }

  const area = (k: keyof typeof f, t: string, aiuto?: string, rows = 3) => (
    <label className="text-sm md:col-span-2"><span className="block text-slate-500">{t}</span>
      <textarea rows={rows} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
      {aiuto && <span className="text-xs text-slate-500">{aiuto}</span>}</label>
  );
  const campo = (k: keyof typeof f, t: string) => (
    <label className="text-sm"><span className="block text-slate-500">{t}</span>
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" /></label>
  );

  return (
    <form onSubmit={(e) => void salva(e)} className="grid gap-3 md:grid-cols-2">
      {errore && <div className="md:col-span-2"><Errore messaggio={errore} /></div>}
      {campo('nome', 'Nome')}
      <label className="text-sm"><span className="block text-slate-500">Area</span>
        <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
          {Object.entries(AREE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      {campo('esenzione', 'Codice di esenzione')}
      {campo('orpha', 'ORPHAcode (solo numero)')}
      {campo('icd9cm', 'ICD-9-CM (separati da virgola)')}
      {area('sinonimi', 'Sinonimi', 'Uno per riga', 2)}
      {area('descrizione', 'Descrizione')}
      {area('segni_allarme', 'Segni d\'allarme', 'Uno per riga', 5)}
      {area('diagnosi', 'Diagnosi')}
      {area('follow_up', 'Follow-up e controlli', 'Uno per riga', 4)}
      {area('specialisti', 'A chi riferirsi', undefined, 2)}
      {area('emergenza', 'Situazioni di urgenza', undefined, 2)}
      {area('note', 'Note', undefined, 2)}
      {area('fonti', 'Fonti specifiche', 'Una per riga: titolo | https://indirizzo', 3)}
      {area('motivo', 'Motivo della modifica e fonte (obbligatorio, resta nello storico)', undefined, 2)}
      <div className="flex gap-2 md:col-span-2">
        <Bottone type="submit" variante="primario">Salva la scheda</Bottone>
        <Bottone onClick={() => onFatto(false)}>Annulla</Bottone>
      </div>
    </form>
  );
}
