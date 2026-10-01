import type { ClaimsApp, Prescrizione, PrestazionePrescritta, Prestazione, PrioritaPrescrizione } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { PRIORITA, fmtData } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Caricamento, Errore, Vuoto } from './ui';

const stileInput = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';
const MAX_PER_RICETTA = 8;

/** Ricerche rapide frequenti in pediatria: cercano nel catalogo importato, non contengono codici. */
const RICERCHE_RAPIDE = ['Emocromo', 'Proteina C reattiva', 'Transglutaminasi', 'Immunoglobuline', 'TSH', 'Ferritina', 'Urine',
  'Urinocoltura', 'Tampone', 'IgE', 'Ecografia', 'Elettrocardiogramma', 'Spirometria', 'Prima visita'];

export const REGOLE_RICETTA = [
  'Classi di priorità U, B, D, P (Piano nazionale di governo delle liste d\'attesa 2019-2021): obbligatorie per il primo accesso.',
  'Quesito diagnostico sempre indicato.',
  'Fino a 8 prestazioni per ricetta, della stessa branca specialistica.',
  'In Calabria le ricette specialistiche emesse dal 30/12/2024 valgono 180 giorni dalla prescrizione (DCA 442/2024).',
];

/** Prescrizioni del bambino: promemoria da ricopiare nel software di ricetta elettronica. */
export default function Prescrizioni({
  claims, pseudoId, visitaId, esenzioni, onStampa,
}: {
  claims: ClaimsApp;
  pseudoId: string;
  visitaId?: string;
  esenzioni: { codice: string; nome: string }[];
  onStampa: (p: Prescrizione) => void;
}) {
  const [nuova, setNuova] = useState(!!visitaId);
  const [testo, setTesto] = useState('');
  const [scelte, setScelte] = useState<PrestazionePrescritta[]>([]);
  const [form, setForm] = useState({ accesso: 'primo' as 'primo' | 'successivo', priorita: 'P' as PrioritaPrescrizione | '', quesito: '', esenzione: '', note: '' });
  const [errore, setErrore] = useState<string | null>(null);

  const catalogo = useDati(async () => {
    const { count, error } = await supabase.schema('anagrafica').from('catalogo_prestazioni')
      .select('versione', { count: 'exact' }).eq('attivo', true).limit(1);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, []);
  const risultati = useDati(async () => {
    const t = testo.trim().replace(/[%,()*]/g, ' ');
    if (t.length < 2) return [];
    return q<Prestazione[]>(supabase.schema('anagrafica').from('catalogo_prestazioni').select('*').eq('attivo', true)
      .or(`descrizione.ilike.%${t}%,codice_regionale.ilike.${t}%,codice_nazionale.ilike.${t}%`).order('descrizione').limit(25));
  }, [testo]);
  const elenco = useDati(
    () => q<Prescrizione[]>(supabase.schema('clinica').from('prescrizioni').select('*').eq('pseudo_id', pseudoId).order('data', { ascending: false }).limit(20)),
    [pseudoId],
  );

  const branche = [...new Set(scelte.map((s) => s.branca).filter(Boolean))];

  function aggiungi(p: Prestazione) {
    if (scelte.length >= MAX_PER_RICETTA) return setErrore(`Al massimo ${MAX_PER_RICETTA} prestazioni per ricetta: salva questa e preparane un'altra.`);
    if (scelte.some((s) => s.codice_regionale === p.codice_regionale)) return;
    setErrore(null);
    setScelte([...scelte, { codice_regionale: p.codice_regionale, codice_nazionale: p.codice_nazionale, descrizione: p.descrizione, branca: p.branca, quantita: 1 }]);
  }

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (scelte.length === 0) return setErrore('Aggiungi almeno una prestazione.');
    if (!form.quesito.trim()) return setErrore('Il quesito diagnostico è obbligatorio.');
    if (form.accesso === 'primo' && !form.priorita) return setErrore('Per il primo accesso indica la classe di priorità.');
    try {
      const salvata = await q<Prescrizione>(supabase.schema('clinica').from('prescrizioni').insert({
        pseudo_id: pseudoId, visita_id: visitaId ?? null, accesso: form.accesso, priorita: form.priorita || null,
        quesito: form.quesito.trim(), esenzione: form.esenzione || null, prestazioni: scelte, note: form.note.trim() || null,
      }).select('*').single());
      setScelte([]);
      setForm({ ...form, quesito: '', note: '' });
      setNuova(false);
      elenco.ricarica();
      onStampa(salvata);
    } catch (err) {
      setErrore(`Salvataggio non riuscito: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (catalogo.caricamento || elenco.caricamento) return <Caricamento />;
  if (catalogo.errore || elenco.errore) return <Errore messaggio={catalogo.errore ?? elenco.errore ?? ''} />;

  return (
    <div className="space-y-3">
      {catalogo.dati === 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Il catalogo regionale delle prestazioni non è ancora stato importato.{' '}
          {claims.app_ruolo === 'pediatra'
            ? <>Importalo da <a className="underline" href={link('account')}>Account › Catalogo prestazioni</a> con il file ufficiale della Regione Calabria.</>
            : 'Il pediatra può importarlo dalla pagina Account.'}
        </p>
      )}

      {(elenco.dati ?? []).length === 0 ? <Vuoto testo="Nessuna prescrizione." /> : (
        <ul className="divide-y divide-slate-100">
          {elenco.dati?.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {fmtData(p.data)} · {p.prestazioni.map((x) => x.descrizione).join(', ')}
                </p>
                <p className="text-slate-600">Quesito: {p.quesito}{p.esenzione && ` · esenzione ${p.esenzione}`}</p>
              </div>
              <div className="flex items-center gap-2">
                {p.priorita && <Badge tono={p.priorita === 'U' ? 'errore' : p.priorita === 'B' ? 'attenzione' : 'neutro'}>Priorità {p.priorita}</Badge>}
                <Bottone onClick={() => onStampa(p)}>PDF</Bottone>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!nuova ? (
        <Bottone variante="primario" onClick={() => setNuova(true)} disabled={catalogo.dati === 0}>+ Nuova prescrizione</Bottone>
      ) : (
        <form onSubmit={(e) => void salva(e)} className="space-y-3 rounded-lg border border-slate-200 p-3">
          {errore && <Errore messaggio={errore} />}
          <div>
            <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cerca prestazione per descrizione o codice"
                   aria-label="Cerca prestazione" className={stileInput} />
            <div className="mt-2 flex flex-wrap gap-1">
              {RICERCHE_RAPIDE.map((r) => (
                <button type="button" key={r} onClick={() => setTesto(r)} className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">{r}</button>
              ))}
            </div>
            {(risultati.dati ?? []).length > 0 && (
              <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {risultati.dati?.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => aggiungi(p)} className="w-full px-3 py-1.5 text-left text-sm hover:bg-teal-50">
                      <span className="font-mono text-xs text-slate-500">{p.codice_regionale}{p.codice_nazionale && ` · ${p.codice_nazionale}`}</span>{' '}
                      <span className="text-slate-900">{p.descrizione}</span>
                      {p.branca && <span className="text-xs text-slate-500"> · {p.branca}</span>}
                      {p.nota_erogabilita && <span className="block text-xs text-amber-800">Nota: {p.nota_erogabilita}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {testo.trim().length >= 2 && risultati.dati?.length === 0 && <p className="mt-1 text-xs text-slate-500">Nessuna prestazione trovata nel catalogo.</p>}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">Prestazioni sulla ricetta ({scelte.length}/{MAX_PER_RICETTA})</p>
            {scelte.length === 0 ? <p className="text-sm text-slate-500">Nessuna.</p> : (
              <ul className="text-sm">
                {scelte.map((s, i) => (
                  <li key={s.codice_regionale} className="flex items-center gap-2 py-1">
                    <span className="font-mono text-xs text-slate-500">{s.codice_regionale}</span>
                    <span className="flex-1">{s.descrizione}</span>
                    <input type="number" min={1} max={9} value={s.quantita} aria-label="Quantità"
                           onChange={(e) => setScelte(scelte.map((x, j) => (j === i ? { ...x, quantita: Math.max(1, Number(e.target.value) || 1) } : x)))}
                           className="w-14 rounded border border-slate-300 px-1 py-0.5" />
                    <button type="button" onClick={() => setScelte(scelte.filter((_, j) => j !== i))} className="text-xs text-red-700 underline">Togli</button>
                  </li>
                ))}
              </ul>
            )}
            {branche.length > 1 && (
              <p className="mt-1 text-xs text-amber-800">Branche diverse ({branche.join(', ')}): sulla ricetta SSN vanno prestazioni della stessa branca, prepara ricette separate.</p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="block text-slate-500">Tipo di accesso</span>
              <select value={form.accesso} onChange={(e) => setForm({ ...form, accesso: e.target.value as 'primo' | 'successivo' })} className={stileInput}>
                <option value="primo">Primo accesso</option>
                <option value="successivo">Accesso successivo (controllo)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-500">Classe di priorità</span>
              <select value={form.priorita} onChange={(e) => setForm({ ...form, priorita: e.target.value as PrioritaPrescrizione | '' })} className={stileInput}>
                {form.accesso === 'successivo' && <option value="">Non indicata</option>}
                {(Object.keys(PRIORITA) as PrioritaPrescrizione[]).map((k) => <option key={k} value={k}>{PRIORITA[k]}</option>)}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-slate-500">Quesito diagnostico</span>
              <input required value={form.quesito} onChange={(e) => setForm({ ...form, quesito: e.target.value })}
                     placeholder="Es. sospetta celiachia in bambino con anemia sideropenica" className={stileInput} />
            </label>
            <label className="text-sm">
              <span className="block text-slate-500">Esenzione</span>
              <select value={form.esenzione} onChange={(e) => setForm({ ...form, esenzione: e.target.value })} className={stileInput}>
                <option value="">Nessuna / da verificare</option>
                {esenzioni.map((x) => <option key={x.codice} value={x.codice}>{x.codice} · {x.nome}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-500">Note</span>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={stileInput} />
            </label>
          </div>
          <div className="flex gap-2">
            <Bottone type="submit" variante="primario">Salva e stampa il promemoria</Bottone>
            <Bottone onClick={() => { setNuova(false); setScelte([]); }}>Annulla</Bottone>
          </div>
        </form>
      )}
      <ul className="list-disc pl-5 text-xs text-slate-500">
        <li>Promemoria da ricopiare nel software di ricetta elettronica (Sistema TS): non è una ricetta valida.</li>
        {REGOLE_RICETTA.map((r) => <li key={r}>{r}</li>)}
      </ul>
    </div>
  );
}
