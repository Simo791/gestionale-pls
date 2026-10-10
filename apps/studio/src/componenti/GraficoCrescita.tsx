import {
  GIORNI_PER_MESE,
  RIFERIMENTI,
  curvePercentili,
  disponibile,
  etaDaGiorni,
  etaMassimaMesi,
  etaMinimaMesi,
  fmtPercentile,
  percentileMisura,
  riferimentoPredefinito,
  type Indicatore,
  type Misurazione,
  type Percentile,
  type Riferimento,
  type Sesso,
} from '@pls/shared';
import { useState } from 'react';

const INDICATORI: { id: Indicatore; etichetta: string; unita: string; campo: keyof Misurazione }[] = [
  { id: 'peso', etichetta: 'Peso', unita: 'kg', campo: 'peso_kg' },
  { id: 'altezza', etichetta: 'Lunghezza / altezza', unita: 'cm', campo: 'altezza_cm' },
  { id: 'circonferenza_cranica', etichetta: 'Circonferenza cranica', unita: 'cm', campo: 'circonferenza_cranica_cm' },
];

export type SceltaCurva = 'auto' | Riferimento;

// Geometria (unità del viewBox; l'SVG si adatta alla larghezza disponibile)
const W = 720;
const H = 380;
const M = { top: 16, right: 44, bottom: 40, left: 48 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;
const SERIE = '#2a78d6'; // unico colore: la serie del bambino

function passoPulito(intervallo: number, tacche: number) {
  const grezzo = intervallo / tacche;
  const potenza = Math.pow(10, Math.floor(Math.log10(grezzo)));
  return [1, 2, 5, 10].map((m) => m * potenza).find((p) => p >= grezzo) ?? 10 * potenza;
}

/** Fine dell'asse X: abbastanza da contenere l'età del bambino, a gradini leggibili. */
function fineAsse(etaMesi: number, inizio: number, massimo: number) {
  const fine = etaMesi <= 22 && inizio === 0 ? 24 : etaMesi <= 56 ? 60 : Math.ceil((etaMesi + 6) / 24) * 24;
  return Math.max(Math.min(fine, massimo), inizio + 12);
}

const etichettaEta = (mesi: number, durata: number) =>
  durata <= 24 ? `${mesi} m` : mesi === 0 ? '0' : `${mesi / 12} a`;

/** Riferimento effettivo per un indicatore, data la scelta dell'utente. */
export function riferimentoEffettivo(scelta: SceltaCurva, indicatore: Indicatore, etaGiorni: number): Riferimento {
  if (indicatore === 'circonferenza_cranica') return 'oms';
  return scelta === 'auto' ? riferimentoPredefinito(etaGiorni, indicatore) : scelta;
}

interface Props {
  sesso: Sesso;
  etaOggiGiorni: number;
  misure: Misurazione[];
  nome: string;
  /** Per la stampa: mostra un solo indicatore, senza schede né interazioni. */
  indicatoreFisso?: Indicatore;
  /** Curva scelta (se assente, il grafico gestisce da sé la scelta). */
  curva?: SceltaCurva;
  onCurva?: (c: SceltaCurva) => void;
}

/**
 * Curve di crescita con le misurazioni del bambino.
 * Predefinito: OMS fino a 5 anni (con circonferenza cranica), curve italiane Cacciari dai 5 ai 20 anni;
 * il pediatra può comunque scegliere OMS (0–19 anni) o Cacciari (2–20 anni).
 */
export default function GraficoCrescita({ sesso, etaOggiGiorni, misure, nome, indicatoreFisso, curva, onCurva }: Props) {
  const [indicatoreScelto, setIndicatore] = useState<Indicatore>('peso');
  const [curvaInterna, setCurvaInterna] = useState<SceltaCurva>('auto');
  const scelta = curva ?? curvaInterna;
  const setScelta = onCurva ?? setCurvaInterna;
  const [attivo, setAttivo] = useState<number | null>(null);

  const etaOggiMesi = etaOggiGiorni / GIORNI_PER_MESE;
  const ccVisibile = scelta !== 'cacciari' && etaOggiMesi <= 72;
  const indicatore = indicatoreFisso ?? (indicatoreScelto === 'circonferenza_cranica' && !ccVisibile ? 'peso' : indicatoreScelto);
  const rif = riferimentoEffettivo(scelta, indicatore, etaOggiGiorni);
  const conf = RIFERIMENTI[rif];
  const def = INDICATORI.find((i) => i.id === indicatore)!;

  const inizioTab = etaMinimaMesi(indicatore, sesso, rif);
  const massimo = etaMassimaMesi(indicatore, sesso, rif);
  const punti = misure
    .map((m) => ({ giorni: m.eta_giorni, valore: m[def.campo] as number | null }))
    .filter((p): p is { giorni: number; valore: number } =>
      p.valore !== null && p.giorni / GIORNI_PER_MESE >= inizioTab && p.giorni / GIORNI_PER_MESE <= massimo)
    .sort((a, b) => a.giorni - b.giorni);

  const etaMesi = Math.max(etaOggiMesi, ...punti.map((p) => p.giorni / GIORNI_PER_MESE));
  const fine = fineAsse(etaMesi, inizioTab, massimo);
  const curve = curvePercentili(indicatore, sesso, fine, rif);
  const durata = fine - inizioTab;

  const pmin = conf.percentili[0]!;
  const pmax = conf.percentili[conf.percentili.length - 1]!;
  const valori = [...curve.flatMap((c) => [c.valori[pmin]!, c.valori[pmax]!]), ...punti.map((p) => p.valore)];
  const passoY = valori.length ? passoPulito(Math.max(...valori) - Math.min(...valori), 6) : 1;
  const yMin = Math.floor(Math.min(...valori) / passoY) * passoY;
  const yMax = Math.ceil(Math.max(...valori) / passoY) * passoY;

  const x = (mesi: number) => M.left + ((mesi - inizioTab) / durata) * PW;
  const y = (v: number) => M.top + PH - ((v - yMin) / (yMax - yMin)) * PH;
  const linea = (p: Percentile) => curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.mesi).toFixed(1)},${y(c.valori[p]!).toFixed(1)}`).join('');
  const fascia = (basso: Percentile, alto: Percentile) =>
    `${linea(alto)}${[...curve].reverse().map((c) => `L${x(c.mesi).toFixed(1)},${y(c.valori[basso]!).toFixed(1)}`).join('')}Z`;

  const passoX = durata <= 24 ? 3 : durata <= 60 ? 6 : 12;
  const tackeX = Array.from({ length: Math.floor(durata / passoX) + 1 }, (_, i) => inizioTab + i * passoX);
  const tackeY = Array.from({ length: Math.round((yMax - yMin) / passoY) + 1 }, (_, i) => yMin + i * passoY);
  const ultima = curve[curve.length - 1];
  const [fi, fs] = conf.fasciaInterna;

  const puntoAttivo = attivo !== null ? punti[attivo] : undefined;
  const percAttivo = puntoAttivo ? percentileMisura(indicatore, sesso, puntoAttivo.giorni, puntoAttivo.valore, rif) : null;
  const fuoriTabella = indicatore === 'peso' && rif === 'oms' && etaOggiMesi > massimo;

  return (
    <div>
      {indicatoreFisso && <p className="mb-1 font-semibold">{def.etichetta} ({def.unita}) · curve {conf.nome}</p>}
      {!indicatoreFisso && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="Indicatore" className="flex flex-wrap gap-1">
            {INDICATORI.filter((i) => i.id !== 'circonferenza_cranica' || ccVisibile).map((i) => (
              <button key={i.id} role="tab" aria-selected={indicatore === i.id}
                      onClick={() => { setIndicatore(i.id); setAttivo(null); }}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                        indicatore === i.id ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200' : 'text-slate-600 hover:bg-slate-50'}`}>
                {i.etichetta}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Curve
            <select value={scelta} onChange={(e) => { setScelta(e.target.value as SceltaCurva); setAttivo(null); }}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
              <option value="auto">Automatiche (OMS fino a 5 anni, poi Cacciari)</option>
              <option value="oms">OMS (0–19 anni)</option>
              <option value="cacciari">Cacciari SIEDP (2–20 anni)</option>
            </select>
          </label>
        </div>
      )}

      {!disponibile(indicatore, rif) || curve.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Le curve {conf.nome} non coprono questa misura o questa età.</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
               aria-label={`${def.etichetta} di ${nome} rispetto ai percentili ${conf.nome}`}>
            {tackeY.map((v) => (
              <g key={`y${v}`}>
                <line x1={M.left} x2={M.left + PW} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
                <text x={M.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{v}</text>
              </g>
            ))}
            {tackeX.map((m) => (
              <text key={`x${m}`} x={x(m)} y={M.top + PH + 18} textAnchor="middle" fontSize="11" fill="#64748b">{etichettaEta(m, durata)}</text>
            ))}
            <text x={M.left + PW / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="#64748b">Età</text>
            <text x={12} y={M.top + PH / 2} textAnchor="middle" fontSize="11" fill="#64748b" transform={`rotate(-90 12 ${M.top + PH / 2})`}>{def.unita}</text>
            <line x1={M.left} x2={M.left + PW} y1={M.top + PH} y2={M.top + PH} stroke="#94a3b8" strokeWidth="1" />

            {/* Fasce dei percentili, linee intermedie sottili, mediana tratteggiata */}
            <path d={fascia(pmin, pmax)} fill="#e2e8f0" fillOpacity="0.55" />
            <path d={fascia(fi, fs)} fill="#cbd5e1" fillOpacity="0.55" />
            {conf.percentili.filter((p) => p !== 50 && p !== pmin && p !== pmax && p !== fi && p !== fs).map((p) => (
              <path key={p} d={linea(p)} fill="none" stroke="#94a3b8" strokeWidth="0.8" />
            ))}
            <path d={linea(50)} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="5 4" />
            {ultima && conf.percentili.map((p) => (
              <text key={p} x={M.left + PW + 6} y={y(ultima.valori[p]!) + 4} fontSize="10" fill="#64748b">{p}°</text>
            ))}

            {punti.length > 1 && (
              <path d={punti.map((p, i) => `${i ? 'L' : 'M'}${x(p.giorni / GIORNI_PER_MESE).toFixed(1)},${y(p.valore).toFixed(1)}`).join('')}
                    fill="none" stroke={SERIE} strokeWidth="2" strokeLinejoin="round" />
            )}
            {punti.map((p, i) => {
              const cx = x(p.giorni / GIORNI_PER_MESE);
              const cy = y(p.valore);
              return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={attivo === i ? 6 : 4.5} fill={SERIE} stroke="#ffffff" strokeWidth="2" />
                  {!indicatoreFisso && (
                    <circle cx={cx} cy={cy} r={14} fill="transparent" tabIndex={0}
                            aria-label={`${etaDaGiorni(p.giorni)}: ${p.valore} ${def.unita}`}
                            onMouseEnter={() => setAttivo(i)} onMouseLeave={() => setAttivo(null)}
                            onFocus={() => setAttivo(i)} onBlur={() => setAttivo(null)}
                            style={{ cursor: 'default', outline: 'none' }} />
                  )}
                </g>
              );
            })}
          </svg>

          {puntoAttivo && (
            <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
                 style={{ left: `${(x(puntoAttivo.giorni / GIORNI_PER_MESE) / W) * 100}%`, top: `calc(${(y(puntoAttivo.valore) / H) * 100}% - 10px)` }}>
              <p className="font-medium text-slate-900">{etaDaGiorni(puntoAttivo.giorni)}</p>
              <p className="tabular-nums text-slate-700">{puntoAttivo.valore} {def.unita}</p>
              <p className="text-slate-500">Percentile {conf.nome}: {fmtPercentile(percAttivo)}</p>
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-slate-500">
        <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: SERIE }} />
        Misurazioni di {nome} · fascia chiara: {pmin}°–{pmax}° percentile · fascia scura: {fi}°–{fs}° · tratteggio: mediana.
        Riferimento: {conf.fonte}; {sesso === 'M' ? 'maschi' : 'femmine'}.
        {fuoriTabella && ' Il peso OMS è disponibile fino a 10 anni: oltre, usa le curve Cacciari.'}
        {punti.length === 0 && ' Nessuna misurazione per questo indicatore in questo intervallo di età.'}
      </p>
    </div>
  );
}
