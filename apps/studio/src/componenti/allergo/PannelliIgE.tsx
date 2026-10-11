import {
  CATEGORIE_ALLERGENE, componentiDi, esitoComponente, esitoIgE, GRUPPI_COMPONENTI, PANNELLO_IGE, PIATTAFORME,
  type CategoriaIgE, type Componente, type Piattaforma,
} from '@pls/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { Badge, Bottone, Errore } from '../ui';
import { oggi, stileInput } from './Registro';

const numero = (x: string) => Number(x.replace(',', '.'));
const valido = (x: string) => x.trim() !== '' && Number.isFinite(numero(x)) && numero(x) >= 0;
const ORDINE: CategoriaIgE[] = ['alimenti', 'inalanti', 'altro'];
const TONO = { positivo: 'errore', dubbio: 'attenzione', negativo: 'ok' } as const;

/** Data di registrazione (= giorno della visita, per il referto) e data del prelievo. */
function Date2({ data, setData, prelievo, setPrelievo }: { data: string; setData: (v: string) => void; prelievo: string; setPrelievo: (v: string) => void }) {
  return (
    <>
      <label><span className="block text-slate-500">Data di registrazione *</span>
        <input type="date" required value={data} onChange={(e) => setData(e.target.value)} className={stileInput} />
        <span className="text-xs text-slate-400">Il referto della visita di questo giorno li riporta.</span></label>
      <label><span className="block text-slate-500">Data del prelievo</span>
        <input type="date" value={prelievo} max={data} onChange={(e) => setPrelievo(e.target.value)} className={stileInput} />
        <span className="text-xs text-slate-400">Quella indicata dal laboratorio.</span></label>
    </>
  );
}

// -----------------------------------------------------------------------------
// IgE totali e specifiche su estratto
// -----------------------------------------------------------------------------
export function PannelloIgE({ pseudo, onFatto, dataIniziale }: { pseudo: string; onFatto: () => void; dataIniziale?: string }) {
  const [data, setData] = useState(dataIniziale ?? oggi());
  const [prelievo, setPrelievo] = useState('');
  const [metodica, setMetodica] = useState('ImmunoCAP');
  const [totali, setTotali] = useState('');
  const [valori, setValori] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<{ nome: string; valore: string }[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  const compilati = [
    ...PANNELLO_IGE.filter((e) => (valori[e.codice] ?? '').trim() !== '').map((e) => ({ nome: e.nome, valore: valori[e.codice]! })),
    ...extra.filter((x) => x.nome.trim() && x.valore.trim()).map((x) => ({ nome: x.nome.trim(), valore: x.valore })),
  ];

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (totali.trim() && !valido(totali)) return setErrore('IgE totali: inserisci un numero.');
    const errati = compilati.filter((c) => !valido(c.valore)).map((c) => c.nome);
    if (errati.length) return setErrore(`Valore non numerico per: ${errati.join(', ')}.`);
    if (!totali.trim() && compilati.length === 0) return setErrore('Inserisci almeno un valore.');
    const comune = { pseudo_id: pseudo, data, data_prelievo: prelievo || null, metodica: metodica.trim() || null };
    const righe = [
      ...(totali.trim() ? [{ ...comune, tipo: 'ige_totali', allergene: 'IgE totali', valore: numero(totali), unita: 'kU/L', esito: null }] : []),
      ...compilati.map((c) => ({ ...comune, tipo: 'ige_specifiche', allergene: c.nome, valore: numero(c.valore), unita: 'kUA/L', esito: esitoIgE(numero(c.valore)) })),
    ];
    setInvio(true);
    const { error } = await supabase.schema('clinica').from('allergo_test').insert(righe);
    setInvio(false);
    if (error) setErrore(error.message); else onFatto();
  }

  return (
    <form onSubmit={(e) => void salva(e)} className="space-y-3 text-sm">
      {errore && <Errore messaggio={errore} />}
      <div className="grid gap-3 md:grid-cols-4">
        <Date2 data={data} setData={setData} prelievo={prelievo} setPrelievo={setPrelievo} />
        <label><span className="block text-slate-500">Metodica</span>
          <input value={metodica} onChange={(e) => setMetodica(e.target.value)} className={stileInput} placeholder="Es. ImmunoCAP" /></label>
        <label><span className="block text-slate-500">IgE totali (kU/L)</span>
          <input inputMode="decimal" value={totali} onChange={(e) => setTotali(e.target.value)} className={stileInput} /></label>
      </div>
      <p className="text-xs text-slate-500">IgE specifiche in kUA/L: compila solo gli allergeni dosati. Sensibilizzazione da 0,35 kUA/L (0,10–0,34 bassa); i valori di riferimento
        delle IgE totali dipendono dall'età e dal laboratorio. Il referto riporta solo i valori, divisi tra alimenti e inalanti.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {ORDINE.map((cat) => (
          <fieldset key={cat} className="min-w-0 rounded-lg border border-slate-200 p-2">
            <legend className="px-1 font-medium text-slate-700">{CATEGORIE_ALLERGENE[cat].split(' (')[0]}</legend>
            <div className="space-y-1">
              {PANNELLO_IGE.filter((e) => e.categoria === cat).map((e) => {
                const v = valori[e.codice] ?? '';
                const esito = valido(v) ? esitoIgE(numero(v)) : null;
                return (
                  <label key={e.codice} className="flex items-center gap-2">
                    <span className="w-9 shrink-0 text-xs text-slate-400">{e.codice}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={e.nome}>{e.nome}</span>
                    <input inputMode="decimal" value={v} aria-label={`${e.nome}, kUA/L`} onChange={(x) => setValori({ ...valori, [e.codice]: x.target.value })}
                           className="w-16 shrink-0 rounded-lg border border-slate-300 px-2 py-0.5 text-right" />
                    <span className="w-5 shrink-0">{esito && <Badge tono={TONO[esito]}>{esito === 'positivo' ? '+' : esito === 'dubbio' ? '±' : '−'}</Badge>}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-slate-500">Altri allergeni (estratti non in elenco)</p>
        {extra.map((x, i) => (
          <div key={i} className="flex gap-2">
            <input value={x.nome} placeholder="Allergene" aria-label="Allergene" className={stileInput}
                   onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))} />
            <input inputMode="decimal" value={x.valore} placeholder="kUA/L" aria-label="Valore kUA/L" className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-right"
                   onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, valore: e.target.value } : y)))} />
          </div>
        ))}
        <button type="button" onClick={() => setExtra([...extra, { nome: '', valore: '' }])} className="text-sm text-teal-700 underline">+ Aggiungi allergene</button>
      </div>
      <Bottone type="submit" variante="primario" disabled={invio}>
        {invio ? 'Salvataggio…' : `Registra (${totali.trim() ? 'IgE totali + ' : ''}${compilati.length} specifiche)`}
      </Bottone>
    </form>
  );
}

// -----------------------------------------------------------------------------
// IgE su componenti molecolari (ISAC E112i, ALEX², ImmunoCAP singoli)
// -----------------------------------------------------------------------------
export function PannelloMolecolare({ pseudo, onFatto, dataIniziale }: { pseudo: string; onFatto: () => void; dataIniziale?: string }) {
  const [piattaforma, setPiattaforma] = useState<Piattaforma>('ISAC');
  const [data, setData] = useState(dataIniziale ?? oggi());
  const [prelievo, setPrelievo] = useState('');
  const [totali, setTotali] = useState('');
  const [scelti, setScelti] = useState<Record<string, string>>({}); // codice → valore
  const [altriNegativi, setAltriNegativi] = useState(true);
  const [cerca, setCerca] = useState('');
  const [extra, setExtra] = useState<{ nome: string; valore: string }[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  const P = PIATTAFORME[piattaforma];
  const disponibili = useMemo(() => componentiDi(piattaforma), [piattaforma]);
  const perCodice = useMemo(() => new Map(disponibili.map((c) => [c.codice, c])), [disponibili]);
  const filtro = cerca.trim().toLowerCase();
  const visibile = (c: Componente) => !filtro || [c.codice, c.fonte, c.famiglia, c.gruppo].some((t) => t.toLowerCase().includes(filtro));
  const selezionati = Object.keys(scelti).filter((k) => perCodice.has(k)).map((k) => perCodice.get(k)!);

  function cambiaPiattaforma(p: Piattaforma) {
    setPiattaforma(p);
    setAltriNegativi(p !== 'ImmunoCAP');
    // Tiene i positivi già segnati se esistono anche sul nuovo pannello.
    const nuovi = new Set(componentiDi(p).map((c) => c.codice));
    setScelti(Object.fromEntries(Object.entries(scelti).filter(([k]) => nuovi.has(k))));
  }
  const commuta = (c: Componente) => {
    const { [c.codice]: presente, ...resto } = scelti;
    setScelti(presente === undefined ? { ...scelti, [c.codice]: '' } : resto);
  };

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    const voci = [...selezionati.map((c) => ({ nome: c.codice, valore: scelti[c.codice] ?? '' })),
      ...extra.filter((x) => x.nome.trim()).map((x) => ({ nome: x.nome.trim(), valore: x.valore }))];
    const mancanti = voci.filter((v) => !valido(v.valore)).map((v) => v.nome);
    if (mancanti.length) return setErrore(`Inserisci il valore (${P.unita}) per: ${mancanti.join(', ')}.`);
    if (totali.trim() && !valido(totali)) return setErrore('IgE totali: inserisci un numero.');
    if (voci.length === 0 && !altriNegativi && !totali.trim()) return setErrore('Segna almeno un componente positivo, oppure indica che il pannello è tutto negativo.');
    const comune = { pseudo_id: pseudo, data, data_prelievo: prelievo || null, metodica: P.nome };
    const soglia = String(P.cutoff).replace('.', ',');
    const righe = [
      ...(totali.trim() ? [{ ...comune, tipo: 'ige_totali', allergene: 'IgE totali', valore: numero(totali), unita: 'kU/L', esito: null, note: null }] : []),
      ...voci.map((v) => ({ ...comune, tipo: 'ige_componenti', allergene: v.nome, valore: numero(v.valore), unita: P.unita,
        esito: esitoComponente(numero(v.valore), piattaforma), note: null })),
      ...(altriNegativi ? [{ ...comune, tipo: 'ige_componenti', allergene: voci.length ? 'Altri componenti del pannello' : 'Tutti i componenti del pannello',
        valore: null, unita: P.unita, esito: 'negativo', note: `non rilevabili (< ${soglia} ${P.unita})` }] : []),
    ];
    setInvio(true);
    const { error } = await supabase.schema('clinica').from('allergo_test').insert(righe);
    setInvio(false);
    if (error) setErrore(error.message); else onFatto();
  }

  return (
    <form onSubmit={(e) => void salva(e)} className="space-y-3 text-sm">
      {errore && <Errore messaggio={errore} />}
      <div className="grid gap-3 md:grid-cols-4">
        <label><span className="block text-slate-500">Piattaforma *</span>
          <select value={piattaforma} onChange={(e) => cambiaPiattaforma(e.target.value as Piattaforma)} className={stileInput}>
            {(Object.keys(PIATTAFORME) as Piattaforma[]).map((p) => <option key={p} value={p}>{PIATTAFORME[p].nome}</option>)}
          </select>
          <span className="text-xs text-slate-400">{disponibili.length} componenti · {P.unita} · {P.nota}</span></label>
        <Date2 data={data} setData={setData} prelievo={prelievo} setPrelievo={setPrelievo} />
        <label><span className="block text-slate-500">IgE totali (kU/L)</span>
          <input inputMode="decimal" value={totali} onChange={(e) => setTotali(e.target.value)} className={stileInput} /></label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-2">
          <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} className={stileInput}
                 placeholder="Cerca componente, fonte o famiglia (es. Ara h, nocciola, LTP)" aria-label="Cerca componente"
                 onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
          <p className="text-xs text-slate-500">Clicca solo i componenti <b>positivi</b> e inserisci il valore a destra. Passa sopra un componente per vedere la famiglia proteica.</p>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {ORDINE.map((cat) => {
              const gruppi = GRUPPI_COMPONENTI.filter((g) => g.categoria === cat)
                .map((g) => ({ ...g, voci: disponibili.filter((c) => c.gruppo === g.gruppo && visibile(c)) })).filter((g) => g.voci.length);
              if (!gruppi.length) return null;
              return (
                <section key={cat}>
                  <h4 className="sticky top-0 z-10 bg-white py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{CATEGORIE_ALLERGENE[cat]}</h4>
                  <div className="space-y-2">
                    {gruppi.map((g) => (
                      <div key={g.gruppo}>
                        <p className="text-xs font-medium text-slate-600">{g.gruppo}</p>
                        <div className="mt-0.5 space-y-0.5">
                          {[...new Set(g.voci.map((c) => c.fonte))].map((fonte) => (
                            <div key={fonte} className="flex flex-wrap items-center gap-1">
                              <span className="w-40 shrink-0 truncate text-xs text-slate-500" title={fonte}>{fonte}</span>
                              {g.voci.filter((c) => c.fonte === fonte).map((c) => {
                                const on = scelti[c.codice] !== undefined;
                                return (
                                  <button key={c.codice} type="button" onClick={() => commuta(c)} title={`${c.codice}: ${c.famiglia}${c.ruo ? ' · solo ricerca (RUO)' : ''}`}
                                          aria-pressed={on}
                                          className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-600'}`}>
                                    {c.codice}{c.ruo ? '*' : ''}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          {piattaforma === 'ALEX' && <p className="text-xs text-slate-400">* solo per uso di ricerca (RUO) sul pannello ALEX².</p>}
        </div>

        <aside className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="font-medium text-slate-800">Positivi ({selezionati.length})</p>
          {selezionati.length === 0 && <p className="text-xs text-slate-500">Nessun componente selezionato.</p>}
          {ORDINE.map((cat) => {
            const elenco = selezionati.filter((c) => c.categoria === cat);
            if (!elenco.length) return null;
            return (
              <div key={cat}>
                <p className="text-xs font-semibold uppercase text-slate-500">{CATEGORIE_ALLERGENE[cat].split(' (')[0]}</p>
                {elenco.map((c) => {
                  const v = scelti[c.codice] ?? '';
                  const sotto = valido(v) && numero(v) < P.cutoff;
                  return (
                    <div key={c.codice} className="py-0.5">
                      <div className="flex items-center gap-1">
                        <span className="flex-1 truncate" title={`${c.fonte} · ${c.famiglia}`}><b>{c.codice}</b> <span className="text-xs text-slate-500">{c.fonte}</span></span>
                        <input inputMode="decimal" value={v} aria-label={`${c.codice}, ${P.unita}`} autoFocus={v === ''}
                               onChange={(e) => setScelti({ ...scelti, [c.codice]: e.target.value })}
                               onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                               className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right" />
                        <button type="button" onClick={() => commuta(c)} aria-label={`Togli ${c.codice}`} className="px-1 text-slate-400 hover:text-rose-700">×</button>
                      </div>
                      <p className="text-[11px] text-slate-500">{c.famiglia}{sotto ? ` · sotto il cut-off (${P.cutoff} ${P.unita})` : ''}</p>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="space-y-1 border-t border-slate-200 pt-2">
            <p className="text-xs text-slate-500">Componente non in elenco</p>
            {extra.map((x, i) => (
              <div key={i} className="flex gap-1">
                <input value={x.nome} placeholder="Es. Pru p 7" aria-label="Componente" className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-0.5"
                       onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))} />
                <input inputMode="decimal" value={x.valore} placeholder={P.unita} aria-label={`Valore ${P.unita}`} className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right"
                       onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, valore: e.target.value } : y)))} />
              </div>
            ))}
            <button type="button" onClick={() => setExtra([...extra, { nome: '', valore: '' }])} className="text-xs text-teal-700 underline">+ Aggiungi</button>
          </div>
          <label className="flex items-start gap-2 border-t border-slate-200 pt-2 text-xs">
            <input type="checkbox" checked={altriNegativi} onChange={(e) => setAltriNegativi(e.target.checked)} className="mt-0.5" />
            <span>{selezionati.length + extra.length ? 'Tutti gli altri componenti' : 'Tutti i componenti'} del pannello sono risultati non rilevabili
              (&lt; {String(P.cutoff).replace('.', ',')} {P.unita}): lo scrive nel referto.</span>
          </label>
        </aside>
      </div>

      <Bottone type="submit" variante="primario" disabled={invio}>{invio ? 'Salvataggio…' : `Registra ${P.nome}`}</Bottone>
    </form>
  );
}
