import { estensioneScorad, GRADI_INTENSITA, REGIONI_SCORAD, scorad, VOCI_INTENSITA_SCORAD, type InputScorad } from '@pls/shared';
import { useState } from 'react';
import { q, useDati } from '../../lib/dati';
import { supabase } from '../../lib/supabase';
import { Badge } from '../ui';

export interface ImmagineScorad { id?: string; voce: number; grado: number; immagine: string; didascalia: string | null; fonte: string }

/** Descrizione dei gradi 1–3 per ciascuno dei sei segni (guida alla valutazione). */
export const DESCRIZIONI_GRADI: string[][] = [
  ['rosa tenue, appena percettibile', 'rosso netto', 'rosso intenso, violaceo'],
  ['lieve rilievo palpabile', 'papule ben evidenti, edema definito', 'edema marcato, papule confluenti'],
  ['tracce di essudato, croste sottili', 'essudazione e croste evidenti', 'essudazione diffusa, croste spesse'],
  ['poche escoriazioni superficiali', 'escoriazioni multiple', 'escoriazioni diffuse e profonde, sanguinanti'],
  ['lieve ispessimento, pieghe accentuate', 'ispessimento evidente', 'cute spessa con pieghe marcate'],
  ['secchezza lieve', 'secchezza con desquamazione', 'xerosi marcata, desquamazione e fissurazioni'],
];

/**
 * Calcolatore SCORAD sul modello di eSCORAD (dermatools): età, mappa corporea fronte/retro
 * con la percentuale interessata di ogni regione (A), sei segni di intensità 0–3 (B),
 * prurito e perdita di sonno 0–10 (C), risultato con gravità.
 */
export interface StatoScorad {
  sotto2anni: boolean;
  regioni: Record<string, number>;
  intensita: number[];
  prurito: number;
  sonno: number;
}

export const statoScoradIniziale = (sotto2anni: boolean): StatoScorad =>
  ({ sotto2anni, regioni: {}, intensita: [0, 0, 0, 0, 0, 0], prurito: 0, sonno: 0 });

export const comeInputScorad = (s: StatoScorad): InputScorad =>
  ({ estensione: estensioneScorad(s.regioni, s.sotto2anni), intensita: s.intensita, prurito: s.prurito, sonno: s.sonno });

// Sagoma semplificata (viewBox 0 0 120 250). Nella vista frontale il lato destro del
// bambino è a sinistra di chi guarda.
const FORME: Record<string, string> = {
  testa: 'M60 4c9 0 15 7 15 17s-6 18-15 18-15-8-15-18S51 4 60 4zM53 37h14v9H53z',
  tronco: 'M40 46h40c4 0 6 3 6 7l-3 70H37l-3-70c0-4 2-7 6-7z',
  arto_sx_vista: 'M34 50c-6 2-9 6-10 12L16 120l-2 14c0 3 5 4 6 1l4-13 12-58z',
  arto_dx_vista: 'M86 50c6 2 9 6 10 12l8 58 2 14c0 3-5 4-6 1l-4-13-12-58z',
  genitali: 'M52 123h16l-3 12h-10z',
  gamba_sx_vista: 'M37 123h21l-2 112c0 5-3 9-8 9h-6c-3 0-4-3-3-6l2-10z',
  gamba_dx_vista: 'M62 123h21l-4 105 2 10c1 3 0 6-3 6h-6c-5 0-8-4-8-9z',
};

function forma(codice: string): string {
  if (codice.startsWith('testa')) return FORME.testa!;
  if (codice.startsWith('tronco')) return FORME.tronco!;
  if (codice === 'genitali') return FORME.genitali!;
  const fronte = codice.endsWith('_ant');
  const destro = codice.includes('_dx_');
  const aSinistraDellaVista = fronte ? destro : !destro;
  if (codice.startsWith('arto_sup')) return aSinistraDellaVista ? FORME.arto_sx_vista! : FORME.arto_dx_vista!;
  return aSinistraDellaVista ? FORME.gamba_sx_vista! : FORME.gamba_dx_vista!;
}

const colore = (pct: number) =>
  pct <= 0 ? '#f1f5f9' : pct <= 25 ? '#99f6e4' : pct <= 50 ? '#2dd4bf' : pct <= 75 ? '#0d9488' : '#115e59';

function Sagoma({ lato, stato, scelta, onScegli }: { lato: 'fronte' | 'retro'; stato: StatoScorad; scelta: string | null; onScegli: (c: string) => void }) {
  return (
    <figure className="text-center">
      <svg viewBox="0 0 120 250" className="mx-auto h-64 w-auto" role="group" aria-label={`Mappa corporea, ${lato}`}>
        {REGIONI_SCORAD.filter((r) => r.lato === lato).map((r) => {
          const pct = stato.regioni[r.codice] ?? 0;
          return (
            <path key={r.codice} d={forma(r.codice)} fill={colore(pct)} stroke={scelta === r.codice ? '#f59e0b' : '#64748b'}
                  strokeWidth={scelta === r.codice ? 2.5 : 1} className="cursor-pointer" role="button" tabIndex={0}
                  aria-label={`${r.nome}: ${pct}%`} onClick={() => onScegli(r.codice)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onScegli(r.codice); }}>
              <title>{`${r.nome} (${lato}) · ${pct}% interessato`}</title>
            </path>
          );
        })}
      </svg>
      <figcaption className="text-xs text-slate-500"><span className="font-medium uppercase tracking-wide">{lato === 'fronte' ? 'Fronte' : 'Retro'}</span>
        <span className="block">{lato === 'fronte' ? 'destra del bambino a sinistra' : 'destra del bambino a destra'}</span></figcaption>
    </figure>
  );
}

/** Mappa corporea statica (per i referti): regioni colorate per % interessata. */
export function MappaCorporea({ regioni, lato, altezza = 120 }: { regioni: Record<string, number>; lato: 'fronte' | 'retro'; altezza?: number }) {
  return (
    <svg viewBox="0 0 120 250" style={{ height: altezza, width: 'auto' }} role="img" aria-label={`Estensione della dermatite, ${lato}`}>
      {REGIONI_SCORAD.filter((r) => r.lato === lato).map((r) => (
        <path key={r.codice} d={forma(r.codice)} fill={colore(regioni[r.codice] ?? 0)} stroke="#64748b" strokeWidth={1} />
      ))}
    </svg>
  );
}

const PASSI = [0, 10, 25, 50, 75, 100];

export default function Scorad({ stato, onChange }: { stato: StatoScorad; onChange: (s: StatoScorad) => void }) {
  const [scelta, setScelta] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ImmagineScorad | null>(null);
  const caricate = useDati(() => q<ImmagineScorad[]>(supabase.schema('anagrafica').from('allergo_scorad_immagini').select('voce, grado, immagine, didascalia, fonte')), []);
  const immagini = new Map((caricate.dati ?? []).map((x) => [`${x.voce}-${x.grado}`, x]));
  const regione = REGIONI_SCORAD.find((r) => r.codice === scelta);
  const input = comeInputScorad(stato);
  const r = scorad(input);
  const b = input.intensita.reduce((x, y) => x + y, 0);
  const c = stato.prurito + stato.sonno;

  return (
    <div className="space-y-5 text-sm">
      {/* Età */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-800">Età del bambino</span>
        {[[true, 'Sotto i 2 anni'], [false, '2 anni o più']].map(([v, t]) => (
          <button key={String(v)} type="button" onClick={() => onChange({ ...stato, sotto2anni: v as boolean })}
                  className={`rounded-full border px-3 py-1 ${stato.sotto2anni === v ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
            {t as string}
          </button>
        ))}
      </div>

      {/* A: estensione */}
      <section>
        <h3 className="font-semibold text-slate-900">A · Estensione <span className="font-normal text-slate-500">— tocca una regione e indica quanta parte è interessata</span></h3>
        <div className="mt-2 grid items-start gap-4 md:grid-cols-[1fr_1fr_1.2fr]">
          <Sagoma lato="fronte" stato={stato} scelta={scelta} onScegli={setScelta} />
          <Sagoma lato="retro" stato={stato} scelta={scelta} onScegli={setScelta} />
          <div className="rounded-lg border border-slate-200 p-3">
            {regione ? (
              <>
                <p className="font-medium text-slate-900">{regione.nome} · {regione.lato}</p>
                <p className="text-xs text-slate-500">Vale il {regione.peso[stato.sotto2anni ? 'sotto2anni' : 'da2anni']}% della superficie corporea</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {PASSI.map((p) => (
                    <button key={p} type="button" onClick={() => onChange({ ...stato, regioni: { ...stato.regioni, [regione.codice]: p } })}
                            className={`rounded-lg border px-2 py-1 tabular-nums ${(stato.regioni[regione.codice] ?? 0) === p ? 'border-teal-700 bg-teal-50 font-semibold text-teal-800' : 'border-slate-300'}`}>
                      {p}%
                    </button>
                  ))}
                </div>
                <label className="mt-2 block text-xs text-slate-500">Altro valore (%)
                  <input type="number" min={0} max={100} value={stato.regioni[regione.codice] ?? 0}
                         onChange={(e) => onChange({ ...stato, regioni: { ...stato.regioni, [regione.codice]: Math.max(0, Math.min(100, Number(e.target.value))) } })}
                         className="ml-2 w-20 rounded border border-slate-300 px-1 py-0.5" /></label>
              </>
            ) : <p className="text-slate-500">Nessuna regione selezionata.</p>}
            <ul className="mt-3 space-y-0.5 text-xs text-slate-600">
              {REGIONI_SCORAD.filter((x) => (stato.regioni[x.codice] ?? 0) > 0).map((x) => (
                <li key={x.codice}>{x.nome} ({x.lato}): {stato.regioni[x.codice]}%</li>
              ))}
            </ul>
            <p className="mt-2 font-medium text-slate-900">A = {input.estensione}%</p>
          </div>
        </div>
      </section>

      {/* B: intensità */}
      <section>
        <h3 className="font-semibold text-slate-900">B · Intensità <span className="font-normal text-slate-500">— su un'area rappresentativa media; la xerosi si valuta sulla cute non lesionata</span></h3>
        <div className="mt-2 space-y-3">
          {VOCI_INTENSITA_SCORAD.map((voce, i) => (
            <div key={voce}>
              <p className="mb-1 text-slate-800">{voce}</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="radiogroup" aria-label={voce}>
                {GRADI_INTENSITA.map((g, v) => {
                  const foto = immagini.get(`${i}-${v}`);
                  const scelto = stato.intensita[i] === v;
                  return (
                    <div key={g} className={`rounded-lg border p-1.5 ${scelto ? 'border-teal-700 bg-teal-50 ring-1 ring-teal-700' : 'border-slate-200 bg-white'}`}>
                      <button type="button" role="radio" aria-checked={scelto} className="w-full text-left"
                              onClick={() => onChange({ ...stato, intensita: stato.intensita.map((x, j) => (j === i ? v : x)) })}>
                        <span className={`font-medium ${scelto ? 'text-teal-800' : 'text-slate-800'}`}>{v} · {g.toLowerCase()}</span>
                        {v > 0 && <span className="block text-xs leading-snug text-slate-500">{DESCRIZIONI_GRADI[i]?.[v - 1]}</span>}
                      </button>
                      {foto && (
                        <button type="button" onClick={() => setZoom(foto)} className="mt-1 block w-full" aria-label={`Immagine di riferimento: ${voce} grado ${v}`}>
                          <img src={foto.immagine} alt={`${voce}, grado ${v}`} className="h-16 w-full rounded object-cover" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-1 text-slate-600">B = {b} / 18</p>
      </section>

      {/* C: sintomi soggettivi */}
      <section>
        <h3 className="font-semibold text-slate-900">C · Sintomi soggettivi <span className="font-normal text-slate-500">— media degli ultimi 3 giorni/notti (0 = assente, 10 = fortissimo)</span></h3>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {([['prurito', 'Prurito'], ['sonno', 'Perdita di sonno']] as const).map(([k, t]) => (
            <label key={k} className="block">
              <span className="flex justify-between text-slate-700"><span>{t}</span><span className="font-semibold tabular-nums">{stato[k]}</span></span>
              <input type="range" min={0} max={10} step={0.5} value={stato[k]} onChange={(e) => onChange({ ...stato, [k]: Number(e.target.value) })}
                     className="w-full accent-teal-700" />
            </label>
          ))}
        </div>
        <p className="mt-1 text-slate-600">C = {c} / 20</p>
      </section>

      {/* Risultato */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">SCORAD = A/5 + 7B/2 + C</p>
        <div className="mt-1 flex flex-wrap items-end gap-4">
          <p className="text-3xl font-semibold tabular-nums text-slate-900">{r.totale}</p>
          <Badge tono={r.tono}>Dermatite atopica {r.livello}</Badge>
          <p className="text-slate-600">SCORAD oggettivo {r.oggettivo} · {r.livelloOggettivo}</p>
        </div>
        <div className="relative mt-3 h-3 rounded-full" style={{ background: 'linear-gradient(90deg,#10b981 0%,#10b981 24%,#f59e0b 24%,#f59e0b 49%,#ef4444 49%,#ef4444 100%)' }} aria-hidden="true">
          <span className="absolute -top-1 h-5 w-1 rounded bg-slate-900" style={{ left: `${Math.min(100, (r.totale / 103) * 100)}%` }} />
        </div>
        <p className="mt-1 flex justify-between text-xs text-slate-500"><span>0 · lieve &lt; 25</span><span>moderata 25–50</span><span>grave &gt; 50 · 103</span></p>
        <p className="mt-2 text-xs text-slate-500">A {input.estensione}/{stato.sotto2anni ? 96 : 100} · B {b}/18 · C {c}/20. Fasce: Oranje 2007 (oggettivo: Kunz 1997).</p>
      </section>
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
          <figure className="max-w-3xl rounded-xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
            <img src={zoom.immagine} alt={zoom.didascalia ?? 'Immagine di riferimento'} className="max-h-[75vh] w-auto rounded" />
            <figcaption className="mt-2 text-sm text-slate-700">
              {VOCI_INTENSITA_SCORAD[zoom.voce]} · grado {zoom.grado} ({GRADI_INTENSITA[zoom.grado]?.toLowerCase()}){zoom.didascalia ? ` — ${zoom.didascalia}` : ''}
              <span className="block text-xs text-slate-500">Fonte: {zoom.fonte}</span>
            </figcaption>
            <button type="button" onClick={() => setZoom(null)} className="mt-2 text-sm text-teal-700 underline">Chiudi</button>
          </figure>
        </div>
      )}
    </div>
  );
}
