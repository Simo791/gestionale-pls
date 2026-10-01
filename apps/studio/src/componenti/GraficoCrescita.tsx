import {
  GIORNI_PER_MESE,
  curvePercentili,
  etaDaGiorni,
  etaMassimaMesi,
  fmtPercentile,
  percentileMisura,
  type Indicatore,
  type Misurazione,
  type Sesso,
} from '@pls/shared';
import { useState } from 'react';

const INDICATORI: { id: Indicatore; etichetta: string; unita: string; campo: keyof Misurazione }[] = [
  { id: 'peso', etichetta: 'Peso', unita: 'kg', campo: 'peso_kg' },
  { id: 'altezza', etichetta: 'Lunghezza / altezza', unita: 'cm', campo: 'altezza_cm' },
  { id: 'circonferenza_cranica', etichetta: 'Circonferenza cranica', unita: 'cm', campo: 'circonferenza_cranica_cm' },
];

// Geometria (unità del viewBox; l'SVG si adatta alla larghezza disponibile)
const W = 720;
const H = 380;
const M = { top: 16, right: 44, bottom: 40, left: 48 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

// Colori: fasce di riferimento neutre, la serie del bambino è l'unico colore.
const SERIE = '#2a78d6';

function passoPulito(intervallo: number, tacche: number) {
  const grezzo = intervallo / tacche;
  const potenza = Math.pow(10, Math.floor(Math.log10(grezzo)));
  const passo = [1, 2, 5, 10].map((m) => m * potenza).find((p) => p >= grezzo) ?? 10 * potenza;
  return passo;
}

/** Fine dell'asse X: abbastanza da contenere l'età del bambino, a gradini leggibili. */
function fineAsse(etaMesi: number, massimo: number) {
  const fine = etaMesi <= 22 ? 24 : etaMesi <= 56 ? 60 : Math.ceil((etaMesi + 6) / 24) * 24;
  return Math.min(fine, massimo);
}

const etichettaEta = (mesi: number, fine: number) =>
  fine <= 24 ? `${mesi} m` : mesi === 0 ? '0' : `${mesi / 12} a`;

interface Props {
  sesso: Sesso;
  etaOggiGiorni: number;
  misure: Misurazione[];
  nome: string;
  /** Per la stampa: mostra un solo indicatore, senza schede né interazioni. */
  indicatoreFisso?: Indicatore;
}

/**
 * Curve di crescita OMS (percentili 3–15–50–85–97) con le misurazioni del bambino.
 * Un solo asse Y per grafico; un grafico per indicatore, scelto con le schede.
 */
export default function GraficoCrescita({ sesso, etaOggiGiorni, misure, nome, indicatoreFisso }: Props) {
  const [indicatoreScelto, setIndicatore] = useState<Indicatore>('peso');
  const indicatore = indicatoreFisso ?? indicatoreScelto;
  const [attivo, setAttivo] = useState<number | null>(null);

  const def = INDICATORI.find((i) => i.id === indicatore)!;
  const massimo = etaMassimaMesi(indicatore, sesso);
  const punti = misure
    .map((m) => ({ giorni: m.eta_giorni, valore: m[def.campo] as number | null }))
    .filter((p): p is { giorni: number; valore: number } => p.valore !== null && p.giorni / GIORNI_PER_MESE <= massimo)
    .sort((a, b) => a.giorni - b.giorni);

  const etaMesi = Math.max(etaOggiGiorni, ...punti.map((p) => p.giorni)) / GIORNI_PER_MESE;
  const fine = fineAsse(etaMesi, massimo);
  const curve = curvePercentili(indicatore, sesso, fine);

  const valori = [...curve.flatMap((c) => [c.p3, c.p97]), ...punti.map((p) => p.valore)];
  const passoY = passoPulito(Math.max(...valori) - Math.min(...valori), 6);
  const yMin = Math.floor(Math.min(...valori) / passoY) * passoY;
  const yMax = Math.ceil(Math.max(...valori) / passoY) * passoY;

  const x = (mesi: number) => M.left + (mesi / fine) * PW;
  const y = (v: number) => M.top + PH - ((v - yMin) / (yMax - yMin)) * PH;

  const linea = (sel: (c: (typeof curve)[number]) => number) =>
    curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.mesi).toFixed(1)},${y(sel(c)).toFixed(1)}`).join('');
  const fascia = (basso: (c: (typeof curve)[number]) => number, alto: (c: (typeof curve)[number]) => number) =>
    `${linea(alto)}${[...curve].reverse().map((c) => `L${x(c.mesi).toFixed(1)},${y(basso(c)).toFixed(1)}`).join('')}Z`;

  const passoX = fine <= 24 ? 3 : fine <= 60 ? 6 : 12;
  const tackeX = Array.from({ length: Math.floor(fine / passoX) + 1 }, (_, i) => i * passoX);
  const tackeY = Array.from({ length: Math.round((yMax - yMin) / passoY) + 1 }, (_, i) => yMin + i * passoY);
  const ultima = curve[curve.length - 1];

  const puntoAttivo = attivo !== null ? punti[attivo] : undefined;
  const percAttivo = puntoAttivo ? percentileMisura(indicatore, sesso, puntoAttivo.giorni, puntoAttivo.valore) : null;

  return (
    <div>
      {indicatoreFisso && <p className="mb-1 font-semibold">{INDICATORI.find((i) => i.id === indicatoreFisso)?.etichetta} ({INDICATORI.find((i) => i.id === indicatoreFisso)?.unita})</p>}
      {!indicatoreFisso && <div role="tablist" aria-label="Indicatore" className="mb-3 flex flex-wrap gap-1">
        {INDICATORI.map((i) => {
          const disponibile = i.id !== 'circonferenza_cranica' || etaOggiGiorni / GIORNI_PER_MESE <= 72;
          if (!disponibile) return null;
          return (
            <button
              key={i.id}
              role="tab"
              aria-selected={indicatore === i.id}
              onClick={() => { setIndicatore(i.id); setAttivo(null); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                indicatore === i.id ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {i.etichetta}
            </button>
          );
        })}
      </div>}

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
             aria-label={`${def.etichetta} di ${nome} rispetto ai percentili OMS`}>
          {/* Griglia e assi, recessivi */}
          {tackeY.map((v) => (
            <g key={`y${v}`}>
              <line x1={M.left} x2={M.left + PW} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
              <text x={M.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{v}</text>
            </g>
          ))}
          {tackeX.map((m) => (
            <text key={`x${m}`} x={x(m)} y={M.top + PH + 18} textAnchor="middle" fontSize="11" fill="#64748b">
              {etichettaEta(m, fine)}
            </text>
          ))}
          <text x={M.left + PW / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="#64748b">Età</text>
          <text x={12} y={M.top + PH / 2} textAnchor="middle" fontSize="11" fill="#64748b"
                transform={`rotate(-90 12 ${M.top + PH / 2})`}>{def.unita}</text>
          <line x1={M.left} x2={M.left + PW} y1={M.top + PH} y2={M.top + PH} stroke="#94a3b8" strokeWidth="1" />

          {/* Fasce dei percentili OMS: 3–97 e 15–85, mediana tratteggiata */}
          <path d={fascia((c) => c.p3, (c) => c.p97)} fill="#e2e8f0" fillOpacity="0.55" />
          <path d={fascia((c) => c.p15, (c) => c.p85)} fill="#cbd5e1" fillOpacity="0.55" />
          <path d={linea((c) => c.p50)} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="5 4" />
          {ultima && ([['97', ultima.p97], ['85', ultima.p85], ['50', ultima.p50], ['15', ultima.p15], ['3', ultima.p3]] as const).map(([et, v]) => (
            <text key={et} x={M.left + PW + 6} y={y(v) + 4} fontSize="11" fill="#64748b">{et}°</text>
          ))}

          {/* Misurazioni del bambino */}
          {punti.length > 1 && (
            <path
              d={punti.map((p, i) => `${i ? 'L' : 'M'}${x(p.giorni / GIORNI_PER_MESE).toFixed(1)},${y(p.valore).toFixed(1)}`).join('')}
              fill="none" stroke={SERIE} strokeWidth="2" strokeLinejoin="round"
            />
          )}
          {punti.map((p, i) => {
            const cx = x(p.giorni / GIORNI_PER_MESE);
            const cy = y(p.valore);
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={attivo === i ? 6 : 4.5} fill={SERIE} stroke="#ffffff" strokeWidth="2" />
                {/* Area di aggancio più grande del punto, anche da tastiera */}
                {!indicatoreFisso && <circle
                  cx={cx} cy={cy} r={14} fill="transparent" tabIndex={0}
                  aria-label={`${etaDaGiorni(p.giorni)}: ${p.valore} ${def.unita}`}
                  onMouseEnter={() => setAttivo(i)} onMouseLeave={() => setAttivo(null)}
                  onFocus={() => setAttivo(i)} onBlur={() => setAttivo(null)}
                  style={{ cursor: 'default', outline: 'none' }}
                />}
              </g>
            );
          })}
        </svg>

        {puntoAttivo && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(x(puntoAttivo.giorni / GIORNI_PER_MESE) / W) * 100}%`,
              top: `calc(${(y(puntoAttivo.valore) / H) * 100}% - 10px)`,
            }}
          >
            <p className="font-medium text-slate-900">{etaDaGiorni(puntoAttivo.giorni)}</p>
            <p className="tabular-nums text-slate-700">{puntoAttivo.valore} {def.unita}</p>
            <p className="text-slate-500">Percentile OMS: {fmtPercentile(percAttivo)}</p>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: SERIE }} />
        Misurazioni di {nome} · fascia chiara: 3°–97° percentile · fascia scura: 15°–85° · tratteggio: mediana.
        Riferimento OMS ({fine <= 60 ? 'Child Growth Standards 2006' : 'Standards 2006 e Growth Reference 2007'}), {sesso === 'M' ? 'maschi' : 'femmine'}.
        {punti.length === 0 && ' Nessuna misurazione per questo indicatore.'}
      </p>
    </div>
  );
}
