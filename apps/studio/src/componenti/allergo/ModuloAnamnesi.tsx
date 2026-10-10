import type { ReactNode } from 'react';
import {
  FUMATORI, LUOGHI_ABITAZIONE, REAZIONI_ALIMENTI, REAZIONI_FARMACI, SINTOMI_SFORZO, testiDaScelte, UMIDITA, VOCI_SONNO,
  type Reazione, type Scelte, type TestiAnamnesi,
} from './anamnesiTesti';
import { stileInput } from './Registro';

const chip = (attivo: boolean) =>
  `rounded-full border px-3 py-1 text-sm ${attivo ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-600'}`;

function Chips({ opzioni, scelte, onChange, singola = false }: { opzioni: readonly string[]; scelte: string[]; onChange: (v: string[]) => void; singola?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {opzioni.map((o) => {
        const attivo = scelte.includes(o);
        return (
          <button key={o} type="button" aria-pressed={attivo} className={chip(attivo)}
                  onClick={() => onChange(attivo ? scelte.filter((x) => x !== o) : singola ? [o] : [...scelte, o])}>{o}</button>
        );
      })}
    </div>
  );
}

function SiNo({ valore, si, no, onChange }: { valore: string; si: string; no: string; onChange: (v: 'si' | 'no' | '') => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" className={chip(valore === 'no')} onClick={() => onChange(valore === 'no' ? '' : 'no')}>{no}</button>
      <button type="button" className={chip(valore === 'si')} onClick={() => onChange(valore === 'si' ? '' : 'si')}>{si}</button>
    </div>
  );
}

function Riquadro({ titolo, testo, children }: { titolo: string; testo: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-800">{titolo}</legend>
      {children}
      <p className="text-xs text-slate-500">Nel referto: <span className="text-slate-800">{testo || '—'}</span></p>
    </fieldset>
  );
}

const Nota = ({ valore, onChange, segnaposto = 'Altro / note' }: { valore: string; onChange: (v: string) => void; segnaposto?: string }) => (
  <input value={valore} onChange={(e) => onChange(e.target.value)} placeholder={segnaposto} className={stileInput} />
);

function Reazioni({ voci, tipi, segnaposto, onChange }: { voci: Reazione[]; tipi: readonly string[]; segnaposto: string; onChange: (v: Reazione[]) => void }) {
  const righe = voci.length ? voci : [{ sostanza: '', tipo: '', quando: '' }];
  const imposta = (i: number, r: Partial<Reazione>) => onChange(righe.map((x, j) => (j === i ? { ...x, ...r } : x)));
  return (
    <div className="space-y-1">
      {righe.map((r, i) => (
        <div key={i} className="grid gap-1 sm:grid-cols-[1.3fr_1.3fr_1fr_auto]">
          <input value={r.sostanza} onChange={(e) => imposta(i, { sostanza: e.target.value })} placeholder={segnaposto} aria-label="Sostanza" className={stileInput} />
          <select value={r.tipo} onChange={(e) => imposta(i, { tipo: e.target.value })} aria-label="Tipo di reazione" className={stileInput}>
            <option value="">— tipo di reazione —</option>
            {tipi.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={r.quando} onChange={(e) => imposta(i, { quando: e.target.value })} placeholder="Quando / dettagli" aria-label="Quando" className={stileInput} />
          <button type="button" onClick={() => onChange(righe.filter((_, j) => j !== i))} className="px-2 text-slate-400 hover:text-rose-600" aria-label="Rimuovi">×</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...righe, { sostanza: '', tipo: '', quando: '' }])} className="text-sm text-teal-700 underline">+ altra reazione</button>
    </div>
  );
}

/** Abitazione, fumo passivo, alimentazione, farmaci, sport e sonno con menu a scelta. */
export default function AnamnesiGuidata({ scelte, onChange }: { scelte: Scelte; onChange: (s: Scelte, testi: TestiAnamnesi) => void }) {
  const t = testiDaScelte(scelte);
  const aggiorna = (parz: Partial<Scelte>) => {
    const nuove = { ...scelte, ...parz };
    onChange(nuove, testiDaScelte(nuove));
  };
  const a = scelte.abitazione!;
  const f = scelte.fumo!;
  const al = scelte.alimenti!;
  const fa = scelte.farmaci!;
  const sp = scelte.sport!;
  const so = scelte.sonno!;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Riquadro titolo="Abitazione" testo={t.abitazione}>
        <Chips opzioni={LUOGHI_ABITAZIONE} scelte={a.luoghi} onChange={(luoghi) => aggiorna({ abitazione: { ...a, luoghi } })} />
        <Chips opzioni={UMIDITA} scelte={a.umidita ? [a.umidita] : []} singola onChange={(v) => aggiorna({ abitazione: { ...a, umidita: v[0] ?? '' } })} />
        <Nota valore={a.note} onChange={(note) => aggiorna({ abitazione: { ...a, note } })} segnaposto="Es. parietaria nel giardino di casa" />
      </Riquadro>

      <Riquadro titolo="Fumo passivo" testo={t.fumo_dettaglio}>
        <SiNo valore={f.esposto} no="NO" si="SI" onChange={(esposto) => aggiorna({ fumo: { ...f, esposto, chi: esposto === 'si' ? f.chi : [] } })} />
        {f.esposto === 'si' && (
          <>
            <Chips opzioni={FUMATORI} scelte={f.chi} onChange={(chi) => aggiorna({ fumo: { ...f, chi } })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ecig} onChange={(e) => aggiorna({ fumo: { ...f, ecig: e.target.checked } })} /> Anche sigarette elettroniche</label>
          </>
        )}
        <Nota valore={f.note} onChange={(note) => aggiorna({ fumo: { ...f, note } })} segnaposto="Es. fuma in casa / solo all'esterno" />
      </Riquadro>

      <Riquadro titolo="Alimentazione" testo={t.alimentazione}>
        <SiNo valore={al.reazioni} no="Mai reazioni avverse ad alimenti" si="Reazione avversa a…" onChange={(reazioni) => aggiorna({ alimenti: { ...al, reazioni } })} />
        {al.reazioni === 'si' && <Reazioni voci={al.voci} tipi={REAZIONI_ALIMENTI} segnaposto="Alimento (es. kiwi, gambero)" onChange={(voci) => aggiorna({ alimenti: { ...al, voci } })} />}
        <Nota valore={al.note} onChange={(note) => aggiorna({ alimenti: { ...al, note } })} segnaposto="Es. tollera pesca sbucciata, frutta secca" />
      </Riquadro>

      <Riquadro titolo="Farmaci" testo={t.farmaci}>
        <SiNo valore={fa.reazioni} no="Ben tollerati i farmaci assunti" si="Reazione avversa a…" onChange={(reazioni) => aggiorna({ farmaci: { ...fa, reazioni } })} />
        {fa.reazioni === 'si' && <Reazioni voci={fa.voci} tipi={REAZIONI_FARMACI} segnaposto="Farmaco (es. amoxicillina)" onChange={(voci) => aggiorna({ farmaci: { ...fa, voci } })} />}
        <Nota valore={fa.note} onChange={(note) => aggiorna({ farmaci: { ...fa, note } })} />
      </Riquadro>

      <Riquadro titolo="Sport" testo={t.sport}>
        <SiNo valore={sp.pratica} no="Non pratica sport" si="Pratica sport" onChange={(pratica) => aggiorna({ sport: { ...sp, pratica } })} />
        {sp.pratica === 'si' && <input value={sp.quale} onChange={(e) => aggiorna({ sport: { ...sp, quale: e.target.value } })} placeholder="Quale sport (es. calcio, nuoto)" className={stileInput} />}
        <SiNo valore={sp.sintomi} no="Senza sintomi da sforzo" si="Con sintomi da sforzo" onChange={(sintomi) => aggiorna({ sport: { ...sp, sintomi, quali: sintomi === 'si' ? sp.quali : [] } })} />
        {sp.sintomi === 'si' && <Chips opzioni={SINTOMI_SFORZO} scelte={sp.quali} onChange={(quali) => aggiorna({ sport: { ...sp, quali } })} />}
        <Nota valore={sp.note} onChange={(note) => aggiorna({ sport: { ...sp, note } })} segnaposto="Es. regrediscono spontaneamente con il riposo" />
      </Riquadro>

      <Riquadro titolo="Sonno" testo={t.sonno}>
        <Chips opzioni={VOCI_SONNO} scelte={so.voci} onChange={(voci) => aggiorna({ sonno: { ...so, voci } })} />
        <Nota valore={so.note} onChange={(note) => aggiorna({ sonno: { ...so, note } })} segnaposto="Es. mai visita ORL" />
      </Riquadro>
    </div>
  );
}
