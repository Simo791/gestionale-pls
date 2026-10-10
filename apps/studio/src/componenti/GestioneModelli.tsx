import type { CampoModello, ClaimsApp, ModelloTesto } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Errore, Pannello, Vuoto } from './ui';

export const CAMPI_MODELLO: Record<CampoModello, string> = {
  esame_obiettivo: 'Esame obiettivo',
  terapia: 'Terapia',
  anamnesi: 'Anamnesi',
  indicazioni: 'Indicazioni ai genitori',
};

const vuoto = { id: '', campo: 'esame_obiettivo' as CampoModello, patologia: '', nome: '', testo: '' };
const stile = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';

/** Modelli di testo nominati per patologia, da inserire con un clic durante la visita. */
export default function GestioneModelli({ claims }: { claims: ClaimsApp }) {
  const modelli = useDati(() => q<ModelloTesto[]>(supabase.schema('anagrafica').from('modelli_testo').select('*').order('patologia').order('nome')), []);
  const patologieCatalogo = useDati(() => q<{ nome: string }[]>(supabase.schema('anagrafica').from('catalogo_patologie').select('nome').order('nome')), []);
  const [f, setF] = useState(vuoto);
  const [filtro, setFiltro] = useState<CampoModello | ''>('');
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    const dati = { campo: f.campo, patologia: f.patologia.trim(), nome: f.nome.trim(), testo: f.testo.trim(), aggiornato_il: new Date().toISOString() };
    const t = supabase.schema('anagrafica').from('modelli_testo');
    const { error } = f.id ? await t.update(dati).eq('id', f.id) : await t.insert(dati);
    if (error) return setErrore(error.message);
    setF({ ...vuoto, campo: f.campo, patologia: f.patologia });
    modelli.ricarica();
  }

  async function elimina(m: ModelloTesto) {
    const { error } = await supabase.schema('anagrafica').from('modelli_testo').delete().eq('id', m.id);
    if (error) setErrore(error.message); else modelli.ricarica();
  }

  const elenco = (modelli.dati ?? []).filter((m) => !filtro || m.campo === filtro);
  const suggerimenti = [...new Set([...(modelli.dati ?? []).map((m) => m.patologia), ...(patologieCatalogo.dati ?? []).map((p) => p.nome),
    'Faringite', 'Otite media acuta', 'Bronchiolite', 'Gastroenterite', 'Bilancio di salute', 'Febbre', 'Dermatite atopica', 'Congiuntivite'])].sort();

  return (
    <Pannello titolo="Modelli per la visita" sottotitolo="Testi pronti per esame obiettivo, terapia, anamnesi e indicazioni, organizzati per patologia">
      {errore && <div className="mb-3"><Errore messaggio={errore} /></div>}
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="text-slate-500">Mostra</span>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as CampoModello | '')} className="rounded-lg border border-slate-300 px-2 py-1">
          <option value="">Tutti</option>
          {(Object.keys(CAMPI_MODELLO) as CampoModello[]).map((c) => <option key={c} value={c}>{CAMPI_MODELLO[c]}</option>)}
        </select>
      </div>
      {elenco.length === 0 ? <Vuoto testo="Nessun modello." /> : (
        <ul className="divide-y divide-slate-100">
          {elenco.map((m) => (
            <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{m.patologia} · {m.nome} <Badge>{CAMPI_MODELLO[m.campo]}</Badge></p>
                <p className="line-clamp-2 whitespace-pre-line text-slate-600">{m.testo}</p>
              </div>
              {m.autore === claims.sub && (
                <div className="flex gap-2">
                  <button className="text-xs text-teal-700 underline" onClick={() => setF({ id: m.id, campo: m.campo, patologia: m.patologia, nome: m.nome, testo: m.testo })}>Modifica</button>
                  <button className="text-xs text-red-700 underline" onClick={() => void elimina(m)}>Elimina</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void salva(e)} className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-3 text-sm md:grid-cols-3">
        <p className="font-medium text-slate-800 md:col-span-3">{f.id ? 'Modifica modello' : 'Nuovo modello'}</p>
        <label><span className="block text-slate-500">Campo</span>
          <select value={f.campo} onChange={(e) => setF({ ...f, campo: e.target.value as CampoModello })} className={stile}>
            {(Object.keys(CAMPI_MODELLO) as CampoModello[]).map((c) => <option key={c} value={c}>{CAMPI_MODELLO[c]}</option>)}
          </select></label>
        <label><span className="block text-slate-500">Patologia</span>
          <input required list="patologie-modelli" value={f.patologia} onChange={(e) => setF({ ...f, patologia: e.target.value })} className={stile} />
          <datalist id="patologie-modelli">{suggerimenti.map((p) => <option key={p} value={p} />)}</datalist></label>
        <label><span className="block text-slate-500">Nome del modello</span>
          <input required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Es. forma lieve" className={stile} /></label>
        <label className="md:col-span-3"><span className="block text-slate-500">Testo</span>
          <textarea required rows={4} value={f.testo} onChange={(e) => setF({ ...f, testo: e.target.value })} className={stile} /></label>
        <div className="flex gap-2 md:col-span-3">
          <Bottone type="submit" variante="primario">{f.id ? 'Salva modifiche' : 'Aggiungi modello'}</Bottone>
          {f.id && <Bottone onClick={() => setF(vuoto)}>Annulla</Bottone>}
        </div>
      </form>
    </Pannello>
  );
}
