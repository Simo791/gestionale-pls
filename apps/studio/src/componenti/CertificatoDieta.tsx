import type { Certificato } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q } from '../lib/dati';
import { DIETE, fineAnnoScolastico } from '../lib/diete';
import { oggiIso } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Bottone, Errore } from './ui';

export interface AllergeneCertificato {
  codice: string;
  nome: string;
  dettaglio: string | null;
  gravita: string;
}

export interface ContenutoDieta {
  allergeni: AllergeneCertificato[];
  tracce: boolean;
  rischio_grave: boolean;
  farmaco_emergenza: string | null;
  scuola: string | null;
  note: string | null;
}

/**
 * Prepara il certificato per la dieta speciale a scuola/mensa o la dieta di esclusione
 * per la famiglia, a partire dalle allergie alimentari registrate. Il documento è salvato
 * in cartella (con traccia nel registro) e poi stampato.
 */
export default function CertificatoDieta({ pseudoId, tipo, allergie, preselezionate, onSalvato }: {
  pseudoId: string;
  tipo: 'dieta_speciale' | 'dieta_esclusione';
  allergie: AllergeneCertificato[];
  preselezionate: string[];
  onSalvato: (c: Certificato) => void;
}) {
  const grave = allergie.some((a) => preselezionate.includes(a.codice) && (a.gravita === 'grave' || a.gravita === 'anafilassi'));
  const [scelte, setScelte] = useState<string[]>(preselezionate);
  const [f, setF] = useState({
    tracce: grave, rischio: grave, farmaco: grave ? 'Adrenalina autoiniettabile secondo piano d\'emergenza allegato' : '',
    scuola: '', note: '', valido: fineAnnoScolastico(),
  });
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    const allergeni = allergie.filter((a) => scelte.includes(a.codice));
    if (allergeni.length === 0) return setErrore('Seleziona almeno un allergene.');
    const contenuto: ContenutoDieta = {
      allergeni, tracce: f.tracce, rischio_grave: f.rischio, farmaco_emergenza: f.farmaco.trim() || null,
      scuola: f.scuola.trim() || null, note: f.note.trim() || null,
    };
    try {
      const c = await q<Certificato>(supabase.schema('clinica').from('certificati').insert({
        pseudo_id: pseudoId, tipo, contenuto, valido_fino: tipo === 'dieta_speciale' ? f.valido : null,
      }).select('*').single());
      onSalvato(c);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    }
  }

  const stile = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';
  return (
    <form onSubmit={(e) => void salva(e)} className="space-y-3 text-sm">
      {errore && <Errore messaggio={errore} />}
      <fieldset>
        <legend className="mb-1 text-slate-500">Allergeni da escludere</legend>
        {allergie.map((a) => (
          <label key={a.codice} className="flex items-center gap-2">
            <input type="checkbox" checked={scelte.includes(a.codice)}
                   onChange={(e) => setScelte(e.target.checked ? [...scelte, a.codice] : scelte.filter((x) => x !== a.codice))} />
            {a.nome}{a.dettaglio && ` (${a.dettaglio})`}
            {!DIETE[a.codice] && <span className="text-xs text-amber-700"> · nessuna scheda dieta predefinita</span>}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.tracce} onChange={(e) => setF({ ...f, tracce: e.target.checked })} />
        Escludere anche le tracce («può contenere…»)</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.rischio} onChange={(e) => setF({ ...f, rischio: e.target.checked })} />
        Rischio di reazioni gravi</label>
      {tipo === 'dieta_speciale' && (
        <div className="grid gap-3 md:grid-cols-2">
          <label><span className="block text-slate-500">Scuola / servizio di ristorazione</span>
            <input value={f.scuola} onChange={(e) => setF({ ...f, scuola: e.target.value })} className={stile} /></label>
          <label><span className="block text-slate-500">Valido fino al</span>
            <input type="date" min={oggiIso()} value={f.valido} onChange={(e) => setF({ ...f, valido: e.target.value })} className={stile} /></label>
          <label className="md:col-span-2"><span className="block text-slate-500">Farmaco d'emergenza (se previsto)</span>
            <input value={f.farmaco} onChange={(e) => setF({ ...f, farmaco: e.target.value })} className={stile} /></label>
        </div>
      )}
      <label className="block"><span className="block text-slate-500">Note</span>
        <textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={stile} /></label>
      <p className="text-xs text-slate-500">
        {tipo === 'dieta_speciale'
          ? 'Il certificato riporta solo le informazioni necessarie alla ristorazione scolastica. La somministrazione di farmaci a scuola segue il protocollo della scuola e dell\'ASP.'
          : 'Elenco degli alimenti da evitare e dei termini da cercare in etichetta, da personalizzare per il bambino.'}
      </p>
      <Bottone type="submit" variante="primario">Salva e stampa</Bottone>
    </form>
  );
}
