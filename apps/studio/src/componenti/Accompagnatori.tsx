import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { supabase } from '../lib/supabase';
import Finestra from './Finestra';
import { Badge, Bottone, Caricamento, Errore, Vuoto } from './ui';

/** Persona che accompagna il bambino oltre ai genitori (anagrafica del bambino). */
export interface Accompagnatore {
  id: string;
  paziente_id: string;
  nome: string;
  cognome: string;
  parentela: string;
  telefono: string | null;
  delega: boolean;
  note: string | null;
  attivo: boolean;
}

export const PARENTELE = [
  'Nonna materna', 'Nonno materno', 'Nonna paterna', 'Nonno paterno', 'Zia', 'Zio',
  'Sorella maggiorenne', 'Fratello maggiorenne', 'Cugina', 'Cugino', 'Compagno/a del genitore',
  'Baby-sitter', 'Educatore/educatrice', 'Altro familiare', 'Altro',
] as const;

export const nomeAccompagnatore = (a: Pick<Accompagnatore, 'parentela' | 'nome' | 'cognome'>) => `${a.parentela} (${a.nome} ${a.cognome})`;

/**
 * Nelle visite i presenti si salvano come riferimenti opachi ("t:<id>" genitore,
 * "a:<id>" accompagnatore): i nomi restano nell'anagrafica. Le visite più vecchie
 * hanno il testo libero, che si mostra così com'è.
 */
export function etichettePresenti(codici: string[] | null | undefined, nomi: Map<string, string>): string {
  return (codici ?? []).map((c) => nomi.get(c)
    ?? (/^t:[0-9a-f-]{36}$/.test(c) ? 'Genitore (non più collegato)' : /^a:[0-9a-f-]{36}$/.test(c) ? 'Accompagnatore (non più in anagrafica)' : c)).join(', ');
}

export function useAccompagnatori(pazienteId: string) {
  return useDati(
    () => q<Accompagnatore[]>(supabase.schema('anagrafica').from('accompagnatori')
      .select('id, paziente_id, nome, cognome, parentela, telefono, delega, note, attivo')
      .eq('paziente_id', pazienteId).order('attivo', { ascending: false }).order('cognome')),
    [pazienteId],
  );
}

const stileInput = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';

/** Campi minimi di un accompagnatore: nome, cognome e grado di parentela sono obbligatori. */
export function CampiAccompagnatore({ v, onChange }: {
  v: { nome: string; cognome: string; parentela: string; delega: boolean; telefono?: string };
  onChange: (v: { nome: string; cognome: string; parentela: string; delega: boolean; telefono?: string }) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-sm"><span className="block text-slate-500">Nome *</span>
        <input value={v.nome} maxLength={80} onChange={(e) => onChange({ ...v, nome: e.target.value })} className={stileInput} /></label>
      <label className="text-sm"><span className="block text-slate-500">Cognome *</span>
        <input value={v.cognome} maxLength={80} onChange={(e) => onChange({ ...v, cognome: e.target.value })} className={stileInput} /></label>
      <label className="text-sm"><span className="block text-slate-500">Grado di parentela *</span>
        <select value={v.parentela} onChange={(e) => onChange({ ...v, parentela: e.target.value })} className={stileInput}>
          <option value="">— scegli —</option>
          {PARENTELE.map((p) => <option key={p} value={p}>{p}</option>)}
        </select></label>
      {v.telefono !== undefined && (
        <label className="text-sm"><span className="block text-slate-500">Telefono</span>
          <input value={v.telefono} maxLength={30} onChange={(e) => onChange({ ...v, telefono: e.target.value })} className={stileInput} /></label>
      )}
      <label className="flex items-center gap-2 self-end py-1.5 text-sm sm:col-span-2">
        <input type="checkbox" checked={v.delega} onChange={(e) => onChange({ ...v, delega: e.target.checked })} />
        Delega scritta dei genitori acquisita
      </label>
    </div>
  );
}

export const accompagnatoreValido = (v: { nome: string; cognome: string; parentela: string }) =>
  v.nome.trim() !== '' && v.cognome.trim() !== '' && v.parentela !== '';

/** Pannello nell'anagrafica del bambino: chi può accompagnarlo, con delega e recapito. */
export function PannelloAccompagnatori({ pazienteId, studioId }: { pazienteId: string; studioId: string }) {
  const elenco = useAccompagnatori(pazienteId);
  const [modifica, setModifica] = useState<Accompagnatore | 'nuovo' | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function cambiaStato(a: Accompagnatore) {
    setErrore(null);
    const { error } = await supabase.schema('anagrafica').from('accompagnatori').update({ attivo: !a.attivo }).eq('id', a.id);
    if (error) setErrore(error.message); else elenco.ricarica();
  }

  return (
    <div className="space-y-2">
      {errore && <Errore messaggio={errore} />}
      {elenco.errore ? <Errore messaggio={elenco.errore} /> : elenco.caricamento ? <Caricamento /> :
        elenco.dati?.length === 0 ? <Vuoto testo="Nessun altro accompagnatore registrato." /> : (
        <ul className="divide-y divide-slate-100">
          {elenco.dati?.map((a) => (
            <li key={a.id} className={`flex flex-wrap items-center gap-2 py-2 text-sm ${a.attivo ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{a.nome} {a.cognome} <span className="font-normal text-slate-500">{a.parentela}</span></p>
                <p className="text-xs text-slate-500">{[a.telefono, a.note].filter(Boolean).join(' · ')}</p>
              </div>
              {a.delega ? <Badge tono="ok">Delega acquisita</Badge> : <Badge tono="attenzione">Senza delega scritta</Badge>}
              {!a.attivo && <Badge>Non più autorizzato</Badge>}
              <button onClick={() => setModifica(a)} className="text-xs text-teal-700 underline">Modifica</button>
              <button onClick={() => void cambiaStato(a)} className="text-xs text-slate-600 underline">{a.attivo ? 'Disattiva' : 'Riattiva'}</button>
            </li>
          ))}
        </ul>
      )}
      <Bottone onClick={() => setModifica('nuovo')}>+ Aggiungi accompagnatore</Bottone>
      {modifica && (
        <Finestra titolo={modifica === 'nuovo' ? 'Nuovo accompagnatore' : 'Modifica accompagnatore'} onChiudi={() => setModifica(null)}>
          <ModuloAccompagnatore pazienteId={pazienteId} studioId={studioId} esistente={modifica === 'nuovo' ? null : modifica}
                                onFatto={() => { setModifica(null); elenco.ricarica(); }} />
        </Finestra>
      )}
    </div>
  );
}

function ModuloAccompagnatore({ pazienteId, studioId, esistente, onFatto }: {
  pazienteId: string; studioId: string; esistente: Accompagnatore | null; onFatto: () => void;
}) {
  const [v, setV] = useState({
    nome: esistente?.nome ?? '', cognome: esistente?.cognome ?? '', parentela: esistente?.parentela ?? '',
    delega: esistente?.delega ?? false, telefono: esistente?.telefono ?? '',
  });
  const [note, setNote] = useState(esistente?.note ?? '');
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  async function salva(e: FormEvent) {
    e.preventDefault();
    if (!accompagnatoreValido(v)) return setErrore('Nome, cognome e grado di parentela sono obbligatori.');
    setInvio(true);
    const riga = { nome: v.nome.trim(), cognome: v.cognome.trim(), parentela: v.parentela, delega: v.delega,
      telefono: v.telefono?.trim() || null, note: note.trim() || null };
    const t = supabase.schema('anagrafica').from('accompagnatori');
    const { error } = esistente ? await t.update(riga).eq('id', esistente.id)
      : await t.insert({ ...riga, paziente_id: pazienteId, studio_id: studioId });
    setInvio(false);
    if (error) setErrore(error.message); else onFatto();
  }

  return (
    <form onSubmit={(e) => void salva(e)} className="space-y-3">
      {errore && <Errore messaggio={errore} />}
      <CampiAccompagnatore v={v} onChange={(x) => setV({ ...v, ...x })} />
      <label className="block text-sm"><span className="block text-slate-500">Note</span>
        <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={stileInput}
                  placeholder="Es. delega valida per l'anno scolastico, documento verificato" /></label>
      <Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</Bottone>
    </form>
  );
}
