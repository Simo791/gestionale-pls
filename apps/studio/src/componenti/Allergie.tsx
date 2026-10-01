import type { Allergene, AllergiaPaziente, CategoriaAllergene, TestAllergologico } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Caricamento, Errore, Vuoto, type Tono } from './ui';

export const CATEGORIE: Record<CategoriaAllergene, string> = {
  alimento: 'Alimenti',
  farmaco: 'Farmaci',
  inalante: 'Inalanti',
  veleno: 'Veleno di imenotteri',
  contatto: 'Contatto',
};

export const GRAVITA: Record<AllergiaPaziente['gravita'], { testo: string; tono: Tono }> = {
  lieve: { testo: 'Lieve', tono: 'neutro' },
  moderata: { testo: 'Moderata', tono: 'attenzione' },
  grave: { testo: 'Grave', tono: 'errore' },
  anafilassi: { testo: 'Anafilassi', tono: 'errore' },
};

export const STATI: Record<AllergiaPaziente['stato'], string> = {
  sospetta: 'Sospetta',
  confermata: 'Confermata',
  risolta: 'Risolta',
};

export const FONTI_ALLERGIE =
  'Alimenti: allergeni dell’Allegato II del Reg. UE 1169/2011. Farmaci: studio multicentrico italiano (SIPPS 2017, beta-lattamici 70% dei casi sospetti). ' +
  'Inalanti: Fondazione Salus Pueri. Test diagnostici: Ospedale Pediatrico Bambino Gesù.';

/** Allergie strutturate del bambino + catalogo dei test allergologici disponibili. */
export default function Allergie({ pseudoId, legacy }: { pseudoId: string; legacy: string[] }) {
  const [nuova, setNuova] = useState(false);
  const [mostraTest, setMostraTest] = useState(false);
  const [form, setForm] = useState({
    allergene: '', dettaglio: '', reazione: '', gravita: 'lieve' as AllergiaPaziente['gravita'],
    stato: 'sospetta' as AllergiaPaziente['stato'], test: [] as string[], data: oggiIso(), note: '',
  });
  const [errore, setErrore] = useState<string | null>(null);

  const allergeni = useDati(() => q<Allergene[]>(supabase.schema('anagrafica').from('catalogo_allergeni').select('*').order('ordine')), []);
  const test = useDati(() => q<TestAllergologico[]>(supabase.schema('anagrafica').from('catalogo_test_allergologici').select('*').order('ordine')), []);
  const allergie = useDati(
    () => q<AllergiaPaziente[]>(supabase.schema('clinica').from('allergie').select('*').eq('pseudo_id', pseudoId).order('creato_il')),
    [pseudoId],
  );

  const nomeAllergene = (c: string) => allergeni.dati?.find((a) => a.codice === c)?.nome ?? c;
  const nomeTest = (c: string) => test.dati?.find((t) => t.codice === c)?.nome ?? c;

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    const { error } = await supabase.schema('clinica').from('allergie').insert({
      pseudo_id: pseudoId,
      allergene: form.allergene,
      dettaglio: form.dettaglio.trim() || null,
      reazione: form.reazione.trim() || null,
      gravita: form.gravita,
      stato: form.stato,
      test: form.test,
      data_diagnosi: form.data || null,
      note: form.note.trim() || null,
    });
    if (error) return setErrore(`Salvataggio non riuscito: ${error.message}`);
    setNuova(false);
    setForm({ ...form, allergene: '', dettaglio: '', reazione: '', test: [], note: '' });
    allergie.ricarica();
  }

  async function aggiornaStato(a: AllergiaPaziente, stato: AllergiaPaziente['stato']) {
    const { error } = await supabase.schema('clinica').from('allergie').update({ stato }).eq('id', a.id);
    if (error) setErrore(error.message);
    else allergie.ricarica();
  }

  if (allergeni.errore || allergie.errore) return <Errore messaggio={allergeni.errore ?? allergie.errore ?? ''} />;
  if (allergeni.caricamento || allergie.caricamento) return <Caricamento />;

  const perCategoria = (Object.keys(CATEGORIE) as CategoriaAllergene[]).map((cat) => ({
    cat,
    voci: (allergeni.dati ?? []).filter((a) => a.categoria === cat),
  }));

  return (
    <div className="space-y-3">
      {errore && <Errore messaggio={errore} />}
      {(allergie.dati ?? []).length === 0 ? <Vuoto testo="Nessuna allergia registrata." /> : (
        <ul className="divide-y divide-slate-100">
          {allergie.dati?.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-medium text-slate-900">
                  {nomeAllergene(a.allergene)}{a.dettaglio && ` — ${a.dettaglio}`}
                </p>
                <p className="text-slate-600">
                  {a.reazione ?? 'Reazione non descritta'}
                  {a.data_diagnosi && ` · dal ${fmtGiornoIso(a.data_diagnosi)}`}
                  {a.test.length > 0 && ` · test: ${a.test.map(nomeTest).join(', ')}`}
                </p>
                {a.note && <p className="text-xs text-slate-500">{a.note}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tono={GRAVITA[a.gravita].tono}>{GRAVITA[a.gravita].testo}</Badge>
                <select value={a.stato} onChange={(e) => void aggiornaStato(a, e.target.value as AllergiaPaziente['stato'])}
                        aria-label="Stato dell'allergia" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                  {(Object.keys(STATI) as AllergiaPaziente['stato'][]).map((s) => <option key={s} value={s}>{STATI[s]}</option>)}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
      {legacy.length > 0 && (
        <p className="text-xs text-slate-500">Annotazioni precedenti in cartella: {legacy.join(', ')}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Bottone variante="primario" onClick={() => setNuova((v) => !v)}>+ Aggiungi allergia</Bottone>
        <Bottone onClick={() => setMostraTest((v) => !v)}>{mostraTest ? 'Nascondi' : 'Mostra'} test allergologici</Bottone>
      </div>

      {nuova && (
        <form onSubmit={(e) => void salva(e)} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="block text-slate-500">Allergene</span>
            <select value={form.allergene} onChange={(e) => setForm({ ...form, allergene: e.target.value })} required
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
              <option value="">— scegli —</option>
              {perCategoria.map(({ cat, voci }) => (
                <optgroup key={cat} label={CATEGORIE[cat]}>
                  {voci.map((v) => <option key={v.codice} value={v.codice}>{v.nome}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Dettaglio (es. nome del farmaco)</span>
            <input value={form.dettaglio} onChange={(e) => setForm({ ...form, dettaglio: e.target.value })}
                   className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="block text-slate-500">Reazione osservata</span>
            <input value={form.reazione} onChange={(e) => setForm({ ...form, reazione: e.target.value })}
                   placeholder="Es. orticaria al volto 20 minuti dopo l'assunzione"
                   className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Gravità</span>
            <select value={form.gravita} onChange={(e) => setForm({ ...form, gravita: e.target.value as AllergiaPaziente['gravita'] })}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
              {(Object.keys(GRAVITA) as AllergiaPaziente['gravita'][]).map((g) => <option key={g} value={g}>{GRAVITA[g].testo}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Stato</span>
            <select value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value as AllergiaPaziente['stato'] })}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
              {(Object.keys(STATI) as AllergiaPaziente['stato'][]).map((s) => <option key={s} value={s}>{STATI[s]}</option>)}
            </select>
          </label>
          <fieldset className="text-sm md:col-span-2">
            <legend className="text-slate-500">Test eseguiti</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {(test.dati ?? []).map((t) => (
                <label key={t.codice} className="flex items-center gap-1">
                  <input type="checkbox" checked={form.test.includes(t.codice)}
                         onChange={(e) => setForm({ ...form, test: e.target.checked ? [...form.test, t.codice] : form.test.filter((x) => x !== t.codice) })} />
                  {t.nome}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm">
            <span className="block text-slate-500">Data della diagnosi o dell'episodio</span>
            <input type="date" value={form.data} max={oggiIso()} onChange={(e) => setForm({ ...form, data: e.target.value })}
                   className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Note</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                   className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
          <div className="md:col-span-2"><Bottone type="submit" variante="primario">Salva allergia</Bottone></div>
        </form>
      )}

      {mostraTest && (
        <div className="rounded-lg bg-slate-50 p-3">
          <ul className="space-y-2 text-sm">
            {(test.dati ?? []).map((t) => (
              <li key={t.codice}>
                <p className="font-medium text-slate-900">{t.nome}</p>
                <p className="text-slate-600">{t.descrizione}</p>
                <p className="text-xs text-slate-500">Quando: {t.quando}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-500">{FONTI_ALLERGIE}</p>
    </div>
  );
}
