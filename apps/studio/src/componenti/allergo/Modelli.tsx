import type { ClaimsApp } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../../lib/dati';
import { supabase } from '../../lib/supabase';
import Finestra from '../Finestra';
import { Badge, Bottone, Caricamento, Errore, Pannello } from '../ui';
import { PACCHETTI, PROFILI, SEZIONI_MODELLO, type ImpostazioniReferto, type ModelloAllergo } from './referto';
import { stileInput } from './Registro';

type Bozza = Pick<ModelloAllergo, 'codice' | 'nome' | 'profilo' | 'sezione' | 'testo'> & { id?: string };

function Editor({ bozza, studio, onFatto }: { bozza: Bozza; studio: string; onFatto: () => void }) {
  const [b, setB] = useState(bozza);
  const [errore, setErrore] = useState<string | null>(null);
  async function salva(e: FormEvent) {
    e.preventDefault();
    const t = supabase.schema('anagrafica').from('allergo_modelli');
    const dati = { nome: b.nome.trim(), profilo: b.profilo, sezione: b.sezione, testo: b.testo, aggiornato_il: new Date().toISOString() };
    const { error } = b.id ? await t.update(dati).eq('id', b.id) : await t.insert({ ...dati, codice: b.codice, studio_id: studio });
    if (error) setErrore(error.message); else onFatto();
  }
  return (
    <form onSubmit={(e) => void salva(e)} className="grid gap-3 text-sm md:grid-cols-3">
      {errore && <div className="md:col-span-3"><Errore messaggio={errore} /></div>}
      <label className="md:col-span-3"><span className="block text-slate-500">Nome</span>
        <input required value={b.nome} onChange={(e) => setB({ ...b, nome: e.target.value })} className={stileInput} /></label>
      <label><span className="block text-slate-500">Profilo</span>
        <select value={b.profilo} onChange={(e) => setB({ ...b, profilo: e.target.value })} className={stileInput}>
          {Object.entries(PROFILI).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select></label>
      <label><span className="block text-slate-500">Sezione del referto</span>
        <select value={b.sezione} onChange={(e) => setB({ ...b, sezione: e.target.value as Bozza['sezione'] })} className={stileInput}>
          {Object.entries(SEZIONI_MODELLO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select></label>
      <p className="self-end text-xs text-slate-500">Segnaposto: {'{{nome}} {{peso}} {{prossimo_controllo}}'}</p>
      <label className="md:col-span-3"><span className="block text-slate-500">Testo (righe che iniziano con «-» = elenco puntato)</span>
        <textarea required rows={16} value={b.testo} onChange={(e) => setB({ ...b, testo: e.target.value })} className={`${stileInput} font-mono text-[13px]`} /></label>
      <div className="md:col-span-3"><Bottone type="submit" variante="primario">Salva modello</Bottone></div>
    </form>
  );
}

/** Modelli di testo: predefiniti (sola lettura) e personalizzati dello studio. */
export function GestioneModelli({ claims }: { claims: ClaimsApp }) {
  const modelli = useDati(() => q<ModelloAllergo[]>(supabase.schema('anagrafica').from('allergo_modelli').select('*').order('ordine')), []);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [profilo, setProfilo] = useState('asma');

  if (modelli.errore) return <Errore messaggio={modelli.errore} />;
  if (!modelli.dati) return <Caricamento />;
  const studio = modelli.dati.filter((m) => m.studio_id);
  const perCodice = new Map(studio.map((m) => [m.codice, m]));
  const elenco = [...modelli.dati.filter((m) => !m.studio_id), ...studio.filter((m) => !modelli.dati!.some((p) => !p.studio_id && p.codice === m.codice))]
    .filter((m) => m.profilo === profilo);

  async function attiva(m: ModelloAllergo, attivo: boolean) {
    await supabase.schema('anagrafica').from('allergo_modelli').update({ attivo }).eq('id', m.id);
    modelli.ricarica();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {Object.entries(PROFILI).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setProfilo(k)}
                  className={`rounded-full border px-3 py-1 text-sm ${profilo === k ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 text-slate-700'}`}>{t}</button>
        ))}
        <span className="ml-auto"><Bottone variante="primario" onClick={() => setBozza({ codice: `mio_${Date.now().toString(36)}`, nome: '', profilo, sezione: 'piano', testo: '' })}>+ Nuovo modello</Bottone></span>
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {elenco.map((p) => {
          const mio = p.studio_id ? p : perCodice.get(p.codice);
          const mostrato = mio ?? p;
          return (
            <li key={p.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{mostrato.nome} <span className="text-xs font-normal text-slate-400">→ {SEZIONI_MODELLO[mostrato.sezione]}</span></p>
                <span className="flex items-center gap-2">
                  {mio ? <Badge tono="info">{p.studio_id ? 'Dello studio' : 'Personalizzato'}</Badge> : <Badge>Predefinito</Badge>}
                  {mio && !mio.attivo && <Badge tono="attenzione">Disattivato</Badge>}
                  {mio
                    ? <>
                        <button onClick={() => setBozza({ ...mio })} className="text-xs text-teal-700 underline">Modifica</button>
                        <button onClick={() => void attiva(mio, !mio.attivo)} className="text-xs text-slate-500 underline">{mio.attivo ? 'Disattiva' : 'Riattiva'}</button>
                      </>
                    : <button onClick={() => setBozza({ codice: p.codice, nome: p.nome, profilo: p.profilo, sezione: p.sezione, testo: p.testo })} className="text-xs text-teal-700 underline">Personalizza</button>}
                </span>
              </div>
              <p className="line-clamp-2 whitespace-pre-line text-xs text-slate-500">{mostrato.testo}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">
        I modelli predefiniti sono ricavati dai referti dell'ambulatorio. «Personalizza» crea la versione dello studio, che da quel momento
        sostituisce il predefinito nelle visite. Modelli per tipo di bambino: {PACCHETTI.map((x) => x.nome).join(', ')}.
      </p>
      {bozza && claims.app_studio_id && (
        <Finestra titolo={bozza.id ? 'Modifica modello' : 'Nuovo modello'} onChiudi={() => setBozza(null)} larga>
          <Editor bozza={bozza} studio={claims.app_studio_id} onFatto={() => { setBozza(null); modelli.ricarica(); }} />
        </Finestra>
      )}
    </div>
  );
}

/** Intestazione, luogo, firma e contatti del referto (per medico). */
export function ImpostazioniRefertoForm({ claims, onFatto }: { claims: ClaimsApp; onFatto?: () => void }) {
  const dati = useDati(() => q<ImpostazioniReferto | null>(supabase.schema('anagrafica').from('allergo_impostazioni').select('*').eq('utente_id', claims.sub).maybeSingle()), [claims.sub]);
  const [v, setV] = useState<Partial<ImpostazioniReferto> | null>(null);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  if (dati.errore) return <Errore messaggio={dati.errore} />;
  if (dati.caricamento) return <Caricamento />;
  const x: Partial<ImpostazioniReferto> = v ?? dati.dati ?? {
    intestazione: 'Ambulatorio di Allergologia', qualifica: 'Allergologo pediatra',
    chiusura: 'Per eventuali necessità e/o informazioni si consiglia di contattare la sottoscritta all\'indirizzo email: {{email}}, specificando nell\'oggetto «all\'attenzione di {{firma}}».',
  };
  const campo = (k: keyof ImpostazioniReferto, t: string, aiuto?: string) => (
    <label className="text-sm"><span className="block text-slate-500">{t}</span>
      <input value={String(x[k] ?? '')} onChange={(e) => setV({ ...x, [k]: e.target.value })} className={stileInput} />
      {aiuto && <span className="text-xs text-slate-400">{aiuto}</span>}</label>
  );
  async function salva(e: FormEvent) {
    e.preventDefault();
    const riga = {
      utente_id: claims.sub, studio_id: claims.app_studio_id, intestazione: x.intestazione?.trim() || 'Ambulatorio di Allergologia',
      sottotitolo: x.sottotitolo?.trim() || null, luogo: x.luogo?.trim() || null, firma: x.firma?.trim() || null, qualifica: x.qualifica?.trim() || null,
      email_contatti: x.email_contatti?.trim() || null, chiusura: x.chiusura?.trim() || null, aggiornato_il: new Date().toISOString(),
    };
    const { error } = await supabase.schema('anagrafica').from('allergo_impostazioni').upsert(riga);
    setEsito(error ? { ok: false, testo: error.message } : { ok: true, testo: 'Impostazioni salvate.' });
    if (!error) { dati.ricarica(); onFatto?.(); }
  }
  return (
    <form onSubmit={(e) => void salva(e)} className="grid gap-3 md:grid-cols-2">
      {esito && <p className={`md:col-span-2 rounded-lg p-2 text-sm ${esito.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{esito.testo}</p>}
      {campo('intestazione', 'Intestazione', 'Es. Ambulatorio di Allergologia')}
      {campo('sottotitolo', 'Sottotitolo', 'Es. U.O. di Pediatria')}
      {campo('luogo', 'Luogo (prima della data)', 'Es. Catanzaro')}
      {campo('firma', 'Firma', 'Es. Dott.ssa Maria Rossi')}
      {campo('qualifica', 'Qualifica')}
      {campo('email_contatti', 'Email per i contatti')}
      <label className="text-sm md:col-span-2"><span className="block text-slate-500">Frase di chiusura ({'{{email}}'} e {'{{firma}}'} vengono sostituiti)</span>
        <textarea rows={3} value={String(x.chiusura ?? '')} onChange={(e) => setV({ ...x, chiusura: e.target.value })} className={stileInput} /></label>
      <div className="md:col-span-2"><Bottone type="submit" variante="primario">Salva impostazioni</Bottone></div>
    </form>
  );
}

export function PannelloImpostazioni({ claims }: { claims: ClaimsApp }) {
  return (
    <div className="space-y-6">
      <Pannello titolo="Referto" sottotitolo="Intestazione, luogo, firma e contatti stampati nei referti"><ImpostazioniRefertoForm claims={claims} /></Pannello>
      <Pannello titolo="Modelli di testo" sottotitolo="Per tipo di bambino allergico: esame obiettivo, conclusioni, piano di cura"><GestioneModelli claims={claims} /></Pannello>
    </div>
  );
}
