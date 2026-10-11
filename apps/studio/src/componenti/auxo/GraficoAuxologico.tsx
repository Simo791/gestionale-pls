import {
  lmsAEta, lmsBmi, valoreDaZ, type Lms, type Riferimento, type Sesso, type TargetGenetico,
} from '@pls/shared';
import { useState } from 'react';
import { n, type MisuraAnalizzata } from './analisi';

export type IndicatoreAuxo = 'altezza' | 'peso' | 'bmi' | 'circonferenza_cranica';

export const INDICATORI_AUXO: { id: IndicatoreAuxo; etichetta: string; unita: string }[] = [
  { id: 'altezza', etichetta: 'Statura', unita: 'cm' },
  { id: 'peso', etichetta: 'Peso', unita: 'kg' },
  { id: 'bmi', etichetta: 'BMI', unita: 'kg/m²' },
  { id: 'circonferenza_cranica', etichetta: 'Circonferenza cranica', unita: 'cm' },
];

/** Linee in DS (convenzione auxologica): −2, −1, 0, +1, +2 (≈ 2°, 16°, 50°, 84°, 98° percentile). */
const LINEE_DS = [-2, -1, 0, 1, 2] as const;

/** Copertura delle curve (mesi) per indicatore e riferimento. */
function copertura(ind: IndicatoreAuxo, rif: Riferimento): [number, number] | null {
  if (ind === 'circonferenza_cranica') return rif === 'oms' ? [0, 60] : null;
  if (rif === 'cacciari') return [24, 240];
  return ind === 'peso' ? [0, 120] : ind === 'bmi' ? [0, 228] : [0, 228];
}

function lms(ind: IndicatoreAuxo, sesso: Sesso, mesi: number, rif: Riferimento): Lms | null {
  return ind === 'bmi' ? lmsBmi(sesso, mesi, rif) : lmsAEta(ind, sesso, mesi, rif);
}

const valore = (m: MisuraAnalizzata, ind: IndicatoreAuxo) =>
  ind === 'altezza' ? m.altezza : ind === 'peso' ? m.peso : ind === 'bmi' ? m.bmi : m.cc;

const W = 720;
const H = 400;
const M = { top: 16, right: 64, bottom: 40, left: 48 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

function passo(intervallo: number, tacche: number) {
  const grezzo = intervallo / tacche;
  const p = Math.pow(10, Math.floor(Math.log10(grezzo)));
  return [1, 2, 5, 10].map((x) => x * p).find((x) => x >= grezzo) ?? 10 * p;
}

export interface PuntoEtaOssea { etaOssea: number; etaCronologica: number; altezza: number }

/**
 * Grafico auxologico: curve in DS (−2…+2) del riferimento scelto, misure del bambino,
 * bersaglio genetico (± 8,5 cm) all'età adulta e, per la statura, età ossea (punto vuoto
 * collegato alla misura corrispondente). Per la stampa: `fisso` (niente controlli).
 */
export default function GraficoAuxologico({ sesso, misure, target, etaOssea = [], indicatoreIniziale = 'altezza', fisso = false }: {
  sesso: Sesso;
  misure: readonly MisuraAnalizzata[];
  target?: TargetGenetico | null;
  etaOssea?: readonly PuntoEtaOssea[];
  indicatoreIniziale?: IndicatoreAuxo;
  fisso?: boolean;
}) {
  const etaMax = Math.max(0, ...misure.map((m) => m.mesi));
  const [ind, setInd] = useState<IndicatoreAuxo>(indicatoreIniziale);
  const [rifScelto, setRif] = useState<Riferimento | null>(null);
  const rifPredefinito: Riferimento = ind === 'circonferenza_cranica' || etaMax < 24 ? 'oms' : 'cacciari';
  const rif: Riferimento = ind === 'circonferenza_cranica' ? 'oms' : (rifScelto ?? rifPredefinito);
  const cop = copertura(ind, rif);
  const info = INDICATORI_AUXO.find((x) => x.id === ind)!;

  const controlli = !fisso && (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm print:hidden">
      {INDICATORI_AUXO.map((x) => (
        <button key={x.id} type="button" onClick={() => setInd(x.id)}
                className={`rounded-full border px-3 py-1 ${ind === x.id ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 text-slate-700'}`}>{x.etichetta}</button>
      ))}
      {ind !== 'circonferenza_cranica' && (
        <select value={rif} onChange={(e) => setRif(e.target.value as Riferimento)} aria-label="Curve di riferimento"
                className="ml-auto rounded-lg border border-slate-300 px-2 py-1">
          <option value="cacciari">Curve italiane (Cacciari 2006, 2–20 anni)</option>
          <option value="oms">Curve OMS (0–19 anni)</option>
        </select>
      )}
    </div>
  );

  if (!cop) return <div>{controlli}<p className="text-sm text-slate-500">Curve non disponibili per questo indicatore.</p></div>;

  // Asse X: dall'inizio della curva (o poco prima della prima misura) fino all'età adulta per la statura.
  const misureInd = misure.filter((m) => valore(m, ind) != null && m.mesi >= cop[0] && m.mesi <= cop[1]);
  const minDati = Math.min(...misureInd.map((m) => m.mesi), etaMax);
  const x0 = Math.max(cop[0], Math.floor((Number.isFinite(minDati) ? minDati : cop[0]) / 12) * 12 - 12);
  const x1 = ind === 'altezza' && target && rif === 'cacciari' ? cop[1]
    : Math.min(cop[1], Math.max(x0 + 24, Math.ceil((etaMax + 12) / 12) * 12));
  if (x1 <= x0) return <div>{controlli}<p className="text-sm text-slate-500">Nessuna misura nell'intervallo delle curve.</p></div>;

  const curve = LINEE_DS.map((z) => {
    const punti: [number, number][] = [];
    for (let m = x0; m <= x1; m += 1) {
      const l = lms(ind, sesso, m, rif);
      if (l) punti.push([m, valoreDaZ(l, z)]);
    }
    return { z, punti };
  });
  const tutti = [...curve.flatMap((c) => c.punti.map((p) => p[1])), ...misureInd.map((m) => valore(m, ind)!)];
  if (ind === 'altezza' && target) tutti.push(target.min, target.max);
  let y0 = Math.min(...tutti);
  let y1 = Math.max(...tutti);
  const py = passo(y1 - y0, 8);
  y0 = Math.floor(y0 / py) * py;
  y1 = Math.ceil(y1 / py) * py;
  const sx = (m: number) => M.left + ((m - x0) / (x1 - x0)) * PW;
  const sy = (v: number) => M.top + PH - ((v - y0) / (y1 - y0)) * PH;
  const tickX: number[] = [];
  const passoX = x1 - x0 <= 36 ? 6 : x1 - x0 <= 96 ? 12 : 24;
  for (let m = Math.ceil(x0 / passoX) * passoX; m <= x1; m += passoX) tickX.push(m);
  const tickY: number[] = [];
  for (let v = y0; v <= y1 + 1e-9; v += py) tickY.push(Math.round(v * 100) / 100);
  const serie = [...misureInd].sort((a, b) => a.mesi - b.mesi);
  const colore = fisso ? '#000' : '#2a78d6';

  return (
    <div>
      {controlli}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
           aria-label={`${info.etichetta}: curve ${rif === 'oms' ? 'OMS' : 'Cacciari'} con le misure del bambino`}>
        <rect x={M.left} y={M.top} width={PW} height={PH} fill="none" stroke="#cbd5e1" />
        {tickY.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.left} x2={M.left + PW} y1={sy(v)} y2={sy(v)} stroke="#eef2f7" />
            <text x={M.left - 6} y={sy(v) + 4} fontSize="11" textAnchor="end" fill="#475569">{n(v, py < 1 ? 1 : 0)}</text>
          </g>
        ))}
        {tickX.map((m) => (
          <g key={`x${m}`}>
            <line x1={sx(m)} x2={sx(m)} y1={M.top} y2={M.top + PH} stroke="#eef2f7" />
            <text x={sx(m)} y={M.top + PH + 16} fontSize="11" textAnchor="middle" fill="#475569">{x1 - x0 <= 36 ? `${m} m` : `${m / 12}`}</text>
          </g>
        ))}
        <text x={M.left + PW / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="#475569">Età ({x1 - x0 <= 36 ? 'mesi' : 'anni'})</text>
        <text x={12} y={M.top + PH / 2} fontSize="11" textAnchor="middle" fill="#475569" transform={`rotate(-90 12 ${M.top + PH / 2})`}>{info.etichetta} ({info.unita})</text>

        {/* Fascia tra −2 e +2 DS */}
        {curve[0] && curve[4] && (
          <path d={`M${curve[4].punti.map(([m, v]) => `${sx(m)},${sy(v)}`).join('L')}L${[...curve[0].punti].reverse().map(([m, v]) => `${sx(m)},${sy(v)}`).join('L')}Z`}
                fill={fisso ? '#f3f4f6' : '#f0fdfa'} />
        )}
        {curve.map((c) => (
          <g key={c.z}>
            <polyline points={c.punti.map(([m, v]) => `${sx(m)},${sy(v)}`).join(' ')} fill="none"
                      stroke={c.z === 0 ? '#334155' : '#94a3b8'} strokeWidth={c.z === 0 ? 1.4 : 1} strokeDasharray={Math.abs(c.z) === 1 ? '4 3' : undefined} />
            {c.punti.length > 0 && (
              <text x={sx(c.punti[c.punti.length - 1]![0]) + 4} y={sy(c.punti[c.punti.length - 1]![1]) + 4} fontSize="10" fill="#475569">
                {c.z === 0 ? '0 DS' : `${c.z > 0 ? '+' : '−'}${Math.abs(c.z)} DS`}
              </text>
            )}
          </g>
        ))}

        {/* Target genetico all'età adulta (20 anni, curve italiane) */}
        {ind === 'altezza' && target && rif === 'cacciari' && x1 === 240 && (
          <g>
            <line x1={sx(240) - 6} x2={sx(240) - 6} y1={sy(target.max)} y2={sy(target.min)} stroke="#b45309" strokeWidth="3" />
            <line x1={sx(240) - 12} x2={sx(240)} y1={sy(target.cm)} y2={sy(target.cm)} stroke="#b45309" strokeWidth="2" />
            <text x={sx(240) - 14} y={sy(target.max) - 4} fontSize="10" textAnchor="end" fill="#b45309">Target {n(target.cm)} ± 8,5 cm</text>
          </g>
        )}

        {/* Età ossea: punto vuoto alla stessa statura, collegato alla misura */}
        {ind === 'altezza' && etaOssea.map((e, i) => {
          const a = e.etaCronologica * 12;
          const o = e.etaOssea * 12;
          if (o < x0 || o > x1 || a < x0 || a > x1) return null;
          return (
            <g key={`eo${i}`}>
              <line x1={sx(a)} x2={sx(o)} y1={sy(e.altezza)} y2={sy(e.altezza)} stroke={colore} strokeDasharray="3 3" />
              <circle cx={sx(o)} cy={sy(e.altezza)} r="4.5" fill="#fff" stroke={colore} strokeWidth="1.6" />
            </g>
          );
        })}

        {serie.length > 1 && (
          <polyline points={serie.map((m) => `${sx(m.mesi)},${sy(valore(m, ind)!)}`).join(' ')} fill="none" stroke={colore} strokeWidth="1.6" />
        )}
        {serie.map((m) => (
          <circle key={m.riga.id} cx={sx(m.mesi)} cy={sy(valore(m, ind)!)} r="3.8" fill={colore}>
            <title>{`${m.data}: ${n(valore(m, ind), ind === 'peso' || ind === 'bmi' ? 1 : 1)} ${info.unita}`}</title>
          </circle>
        ))}
      </svg>
      <p className="mt-1 text-xs text-slate-500">
        Curve {rif === 'oms' ? 'OMS (WHO 2006 fino a 5 anni, WHO 2007 dopo)' : 'italiane SIEDP (Cacciari et al., 2006)'}: linee a −2, −1, 0, +1, +2 DS
        (circa 2°, 16°, 50°, 84°, 98° percentile).{ind === 'altezza' && etaOssea.length > 0 ? ' Cerchio vuoto: età ossea alla stessa statura.' : ''}
        {ind === 'altezza' && target && rif !== 'cacciari' ? ' Il target genetico si mostra con le curve italiane.' : ''}
      </p>
    </div>
  );
}
