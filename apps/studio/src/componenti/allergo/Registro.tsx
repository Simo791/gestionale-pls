import type { RigaAllergo } from '@pls/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { q, useDati } from '../../lib/dati';
import { supabase } from '../../lib/supabase';
import Finestra from '../Finestra';
import { Bottone, Caricamento, Errore, Pannello, Vuoto } from '../ui';

export type TipoCampo = 'testo' | 'area' | 'numero' | 'data' | 'dataora' | 'select' | 'si_no';

export interface Campo {
  nome: string;
  etichetta: string;
  tipo: TipoCampo;
  opzioni?: readonly (readonly [string, string])[];
  obbligatorio?: boolean;
  /** Occupa tutta la larghezza del modulo. */
  ampio?: boolean;
  passo?: string;
  aiuto?: string;
  segnaposto?: string;
}

export type Valori = Record<string, string | boolean>;

export const stileInput = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';
export const oggi = () => new Date().toISOString().slice(0, 10);

/** Valori del modulo → riga per il database ('' = null, numeri convertiti). */
export function comeRiga(campi: Campo[], v: Valori): Record<string, unknown> {
  const riga: Record<string, unknown> = {};
  for (const c of campi) {
    const x = v[c.nome];
    if (c.tipo === 'si_no') riga[c.nome] = x === true;
    else if (typeof x !== 'string' || x.trim() === '') riga[c.nome] = null;
    else if (c.tipo === 'numero') riga[c.nome] = Number(x.replace(',', '.'));
    else if (c.tipo === 'dataora') riga[c.nome] = new Date(x).toISOString();
    else riga[c.nome] = x.trim();
  }
  return riga;
}

/** Riga del database → valori del modulo. */
export function comeValori(campi: Campo[], r: Record<string, unknown> | null): Valori {
  const v: Valori = {};
  for (const c of campi) {
    const x = r?.[c.nome];
    if (c.tipo === 'si_no') v[c.nome] = x === true;
    else if (x == null) v[c.nome] = '';
    else if (c.tipo === 'dataora') {
      const d = new Date(String(x));
      v[c.nome] = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    } else v[c.nome] = String(x);
  }
  return v;
}

export function CampoModulo({ c, v, onChange }: { c: Campo; v: Valori; onChange: (v: Valori) => void }) {
  const valore = v[c.nome];
  const imposta = (x: string | boolean) => onChange({ ...v, [c.nome]: x });
  const classe = `text-sm ${c.ampio || c.tipo === 'area' ? 'md:col-span-2' : ''}`;
  if (c.tipo === 'si_no') {
    return (
      <label className={`${classe} flex items-center gap-2 self-end py-1.5`}>
        <input type="checkbox" checked={valore === true} onChange={(e) => imposta(e.target.checked)} /> {c.etichetta}
      </label>
    );
  }
  const testo = typeof valore === 'string' ? valore : '';
  return (
    <label className={classe}>
      <span className="block text-slate-500">{c.etichetta}{c.obbligatorio && ' *'}</span>
      {c.tipo === 'area' ? (
        <textarea rows={3} required={c.obbligatorio} value={testo} placeholder={c.segnaposto}
                  onChange={(e) => imposta(e.target.value)} className={stileInput} />
      ) : c.tipo === 'select' ? (
        <select required={c.obbligatorio} value={testo} onChange={(e) => imposta(e.target.value)} className={stileInput}>
          {!c.obbligatorio && <option value="">—</option>}
          {c.obbligatorio && testo === '' && <option value="">— scegli —</option>}
          {c.opzioni?.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      ) : (
        <input
          type={c.tipo === 'numero' ? 'number' : c.tipo === 'data' ? 'date' : c.tipo === 'dataora' ? 'datetime-local' : 'text'}
          step={c.tipo === 'numero' ? (c.passo ?? 'any') : undefined}
          required={c.obbligatorio} value={testo} placeholder={c.segnaposto}
          onChange={(e) => imposta(e.target.value)} className={stileInput}
        />
      )}
      {c.aiuto && <span className="text-xs text-slate-400">{c.aiuto}</span>}
    </label>
  );
}

/**
 * Modulo di inserimento/modifica di una riga clinica del modulo Allergologia.
 * `trasforma` completa la riga prima del salvataggio (es. esito calcolato);
 * `suggerimento` mostra un aiuto calcolato mentre si compila.
 */
export function ModuloRiga({ tabella, pseudo, campi, riga, iniziali, trasforma, suggerimento, onFatto }: {
  tabella: string;
  pseudo: string;
  campi: Campo[];
  riga: RigaAllergo | null;
  iniziali?: Valori;
  trasforma?: (r: Record<string, unknown>) => Record<string, unknown>;
  suggerimento?: (v: Valori) => ReactNode;
  onFatto: () => void;
}) {
  const [v, setV] = useState<Valori>(() => ({ ...comeValori(campi, null), ...iniziali, ...(riga ? comeValori(campi, riga) : {}) }));
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInvio(true);
    try {
      let dati = comeRiga(campi, v);
      if (trasforma) dati = trasforma(dati);
      const t = supabase.schema('clinica').from(tabella);
      const { error } = riga ? await t.update(dati).eq('id', riga.id) : await t.insert({ ...dati, pseudo_id: pseudo });
      if (error) throw new Error(error.message);
      onFatto();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally {
      setInvio(false);
    }
  }

  return (
    <form onSubmit={(e) => void salva(e)} className="grid gap-3 md:grid-cols-2">
      {errore && <div className="md:col-span-2"><Errore messaggio={errore} /></div>}
      {campi.map((c) => <CampoModulo key={c.nome} c={c} v={v} onChange={setV} />)}
      {suggerimento && <div className="md:col-span-2">{suggerimento(v)}</div>}
      <div className="md:col-span-2 flex items-center gap-3">
        <Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Salvataggio…' : riga ? 'Salva modifiche' : 'Registra'}</Bottone>
        <span className="text-xs text-slate-500">Ogni inserimento e modifica resta nel registro accessi.</span>
      </div>
    </form>
  );
}

/** Carica le righe di una tabella clinica del modulo per lo pseudonimo. */
export function useRighe(tabella: string, pseudo: string, ordine: string, aggiorna = 0) {
  return useDati(
    () => q<RigaAllergo[]>(supabase.schema('clinica').from(tabella).select('*').eq('pseudo_id', pseudo).order(ordine, { ascending: false })),
    [tabella, pseudo, ordine, aggiorna],
  );
}

/**
 * Registro generico: elenco delle righe + inserimento e modifica in finestra.
 * Nessuna cancellazione: i dati clinici si correggono, e la correzione è tracciata.
 */
export default function Registro({
  titolo, sottotitolo, tabella, pseudo, campi, ordine = 'data', riassunto, iniziali, trasforma, suggerimento,
  filtro, vuoto = 'Nessun dato registrato.', azioniExtra, onCambio, aggiorna = 0, etichettaNuovo = 'Aggiungi',
}: {
  titolo: string;
  sottotitolo?: string;
  tabella: string;
  pseudo: string;
  campi: Campo[];
  ordine?: string;
  riassunto: (r: RigaAllergo) => ReactNode;
  iniziali?: () => Valori;
  trasforma?: (r: Record<string, unknown>) => Record<string, unknown>;
  suggerimento?: (v: Valori) => ReactNode;
  filtro?: (r: RigaAllergo) => boolean;
  vuoto?: string;
  azioniExtra?: ReactNode;
  onCambio?: () => void;
  aggiorna?: number;
  etichettaNuovo?: string;
}) {
  const righe = useRighe(tabella, pseudo, ordine, aggiorna);
  const [aperta, setAperta] = useState<RigaAllergo | 'nuova' | null>(null);
  const elenco = (righe.dati ?? []).filter((r) => !filtro || filtro(r));

  return (
    <Pannello titolo={titolo} sottotitolo={sottotitolo}
              azione={<div className="flex flex-wrap gap-2">{azioniExtra}<Bottone variante="primario" onClick={() => setAperta('nuova')}>{etichettaNuovo}</Bottone></div>}>
      {righe.errore ? <Errore messaggio={righe.errore} /> : righe.caricamento ? <Caricamento /> :
        elenco.length === 0 ? <Vuoto testo={vuoto} /> : (
        <ul className="divide-y divide-slate-100">
          {elenco.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">{riassunto(r)}</div>
              <button onClick={() => setAperta(r)} className="shrink-0 text-xs text-teal-700 underline">Modifica</button>
            </li>
          ))}
        </ul>
      )}
      {aperta && (
        <Finestra titolo={aperta === 'nuova' ? `${titolo}: nuovo` : `${titolo}: modifica`} onChiudi={() => setAperta(null)} larga>
          <ModuloRiga tabella={tabella} pseudo={pseudo} campi={campi} riga={aperta === 'nuova' ? null : aperta}
                      iniziali={aperta === 'nuova' ? iniziali?.() : undefined} trasforma={trasforma} suggerimento={suggerimento}
                      onFatto={() => { setAperta(null); righe.ricarica(); onCambio?.(); }} />
        </Finestra>
      )}
    </Pannello>
  );
}

/** Valore testuale di un campo di riga (per i riassunti). */
export const s = (r: RigaAllergo, k: string) => (r[k] == null ? '' : String(r[k]));
export const giorno = (iso: unknown) => (iso ? new Date(String(iso).length === 10 ? `${iso}T12:00:00` : String(iso)).toLocaleDateString('it-IT') : '—');
