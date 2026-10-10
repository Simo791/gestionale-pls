import { etaEstesa, livelloFeno, type AllergoPaziente, type RigaAllergo, type Studio } from '@pls/shared';
import type { CSSProperties, ReactNode } from 'react';
import { fmtDataOra, fmtGiornoIso } from '../../lib/formato';
import { testoTest, type ImpostazioniReferto } from './referto';
import { MappaCorporea } from './Scorad';

/**
 * Referto grafico della visita allergologica, pensato per bambini e famiglie:
 * colori tenui per sezione, prick test, IgE, spirometria e punteggi schematizzati.
 * Lo stato (bene / attenzione / alterato) usa sempre colore + etichetta, mai solo il colore.
 */

// Colori di stato (fissi) e colori tenui delle sezioni.
const STATO = { bene: '#0ca30c', attenzione: '#fab219', alterato: '#ec835a', critico: '#d03b3b', neutro: '#cbd5e1' } as const;
type Stato = keyof typeof STATO;
const TINTA: Record<Stato, string> = { bene: '#dcfce7', attenzione: '#fef3c7', alterato: '#ffedd5', critico: '#fee2e2', neutro: '#f1f5f9' };

const SEZIONI = {
  anamnesi: { fondo: '#f0f9ff', bordo: '#7dd3fc', inchiostro: '#0369a1' },
  storia: { fondo: '#f5f3ff', bordo: '#c4b5fd', inchiostro: '#6d28d9' },
  esame: { fondo: '#f0fdf4', bordo: '#86efac', inchiostro: '#15803d' },
  test: { fondo: '#fff7ed', bordo: '#fdba74', inchiostro: '#c2410c' },
  respiro: { fondo: '#eff6ff', bordo: '#93c5fd', inchiostro: '#1d4ed8' },
  punteggi: { fondo: '#fefce8', bordo: '#fde047', inchiostro: '#a16207' },
  diagnosi: { fondo: '#fdf2f8', bordo: '#f9a8d4', inchiostro: '#be185d' },
  piano: { fondo: '#f0fdfa', bordo: '#5eead4', inchiostro: '#0f766e' },
} as const;
type Sezione = keyof typeof SEZIONI;

// Icone (tratto 24×24)
const ICONE: Record<Sezione | 'casa' | 'fumo' | 'mela' | 'pillola' | 'pallone' | 'luna' | 'calendario' | 'bilancia' | 'righello' | 'cuore' | 'zampa', string> = {
  anamnesi: 'M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h12M9 7h6M9 11h6',
  storia: 'M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  esame: 'M6 3v6a4 4 0 008 0V3M10 13v3a5 5 0 0010 0v-2M20 12a2 2 0 100-4 2 2 0 000 4z',
  test: 'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M7 15h10',
  respiro: 'M12 4v8M12 12c-2 0-3 2-5 2-2 0-3 2-3 4v1c0 1 1 2 2 2 3 0 6-2 6-6M12 12c2 0 3 2 5 2 2 0 3 2 3 4v1c0 1-1 2-2 2-3 0-6-2-6-6',
  punteggi: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  diagnosi: 'M9 3h6v3H9zM6 5H5a1 1 0 00-1 1v14a1 1 0 001 1h14a1 1 0 001-1V6a1 1 0 00-1-1h-1M9 13l2 2 4-4',
  piano: 'M12 21s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 11c0 5.5-7 10-7 10z',
  casa: 'M3 11l9-7 9 7M5 10v10h14V10',
  fumo: 'M3 16h14v3H3zM19 16v3M21 16v3M17 12c0-2-2-2-2-4s2-2 2-4M20 12c0-2-2-2-2-4',
  mela: 'M12 7c-3-2-8-1-8 5s4 9 6 9c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 6-3 6-9s-5-7-8-5zM12 7c0-2 1-4 3-4',
  pillola: 'M10.5 20.5a5 5 0 01-7-7l7-7a5 5 0 017 7zM8.5 8.5l7 7',
  pallone: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7l4 3-1.5 4.5h-5L8 10z',
  luna: 'M20 14A8 8 0 0110 4a8 8 0 1010 10z',
  calendario: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  bilancia: 'M5 5h14l-2 14H7zM9 9a3 3 0 006 0',
  righello: 'M4 20L20 4M7 17l2 2M10 14l2 2M13 11l2 2M16 8l2 2',
  cuore: 'M3 12h4l2-5 4 10 2-5h6',
  zampa: 'M8 11a2 2 0 100-4 2 2 0 000 4zM16 11a2 2 0 100-4 2 2 0 000 4zM5 15a2 2 0 100-4 2 2 0 000 4zM19 15a2 2 0 100-4 2 2 0 000 4zM12 13c-3 0-5 3-5 5s2 2 5 2 5 0 5-2-2-5-5-5z',
};
const Icona = ({ n, colore, dim = 18 }: { n: keyof typeof ICONE; colore: string; dim?: number }) => (
  <svg viewBox="0 0 24 24" width={dim} height={dim} fill="none" stroke={colore} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONE[n]} />
  </svg>
);

function Riquadro({ s, titolo, icona, children }: { s: Sezione; titolo: string; icona?: keyof typeof ICONE; children: ReactNode }) {
  const c = SEZIONI[s];
  return (
    <section className="mb-3 rounded-2xl border-2 p-3" style={{ background: c.fondo, borderColor: c.bordo, breakInside: 'avoid' }}>
      <h2 className="mb-2 flex items-center gap-2 text-[12pt] font-bold" style={{ color: c.inchiostro }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white" style={{ border: `2px solid ${c.bordo}` }}><Icona n={icona ?? s} colore={c.inchiostro} /></span>
        {titolo}
      </h2>
      <div className="text-[10.5pt] text-slate-800">{children}</div>
    </section>
  );
}

const Etichetta = ({ stato, children }: { stato: Stato; children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9pt] font-semibold text-slate-800" style={{ background: TINTA[stato] }}>
    <span className="inline-block h-2 w-2 rounded-full" style={{ background: STATO[stato] }} />{children}
  </span>
);

const num = (v: unknown, d = 1) => Number(v).toLocaleString('it-IT', { maximumFractionDigits: d });

/** Testo con elenchi e righe evidenziate (✅ migliora, ❌ non migliora, ➡ attenzione). */
function TestoColorato({ testo }: { testo: string | null | undefined }) {
  if (!testo?.trim()) return null;
  const righe = testo.split('\n');
  return (
    <div className="space-y-1">
      {righe.map((r, i) => {
        const t = r.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (/^✅/.test(t)) return <p key={i} className="rounded-lg px-2 py-1 font-semibold" style={{ background: TINTA.bene }}>{t}</p>;
        if (/^❌/.test(t)) return <p key={i} className="rounded-lg px-2 py-1 font-semibold" style={{ background: TINTA.critico }}>{t}</p>;
        if (/^➡/.test(t)) return <p key={i} className="rounded-lg px-2 py-1" style={{ background: TINTA.attenzione }}>{t}</p>;
        if (/^Pr\//.test(t)) return <p key={i} className="font-semibold text-slate-900">{t}</p>;
        if (/^-\s+/.test(t)) {
          const rientro = /^\s{2,}-/.test(r);
          return (
            <p key={i} className={`flex gap-2 ${rientro ? 'ml-5' : ''}`}>
              <span className="mt-[0.45em] inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SEZIONI.piano.bordo }} />
              <span>{t.replace(/^-\s+/, '')}</span>
            </p>
          );
        }
        if (/^\s{2,}/.test(r)) return <p key={i} className="ml-4 text-slate-700">{t}</p>;
        return <p key={i}>{t}</p>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------- prick test
function GraficoPrick({ righe }: { righe: RigaAllergo[] }) {
  const istamina = righe.find((r) => /istamina/i.test(String(r.allergene)));
  const negativo = righe.find((r) => /controllo\s*[-−]|salina|negativo/i.test(String(r.allergene)) && !/istamina/i.test(String(r.allergene)));
  const allergeni = righe.filter((r) => r !== istamina && r !== negativo)
    .sort((a, b) => Number(b.valore ?? 0) - Number(a.valore ?? 0));
  const ordinate = [...allergeni, ...(istamina ? [istamina] : []), ...(negativo ? [negativo] : [])];
  const neg = Number(negativo?.valore ?? 0);
  const soglia = neg + 3;
  const max = Math.max(10, Math.ceil(Math.max(...ordinate.map((r) => Number(r.valore ?? 0)), soglia) + 2));
  const L = 190, W = 300, H = 20, top = 18;
  const x = (mm: number) => L + (mm / max) * W;
  const alt = top + ordinate.length * H + 22;
  const positivi = allergeni.filter((r) => r.esito === 'positivo');
  return (
    <div>
      <p className="mb-1 text-[9.5pt] text-slate-700">
        Diametro del pomfo in millimetri. È <b>positivo</b> se supera di almeno 3 mm il controllo negativo.
        {positivi.length ? ` Positivi: ${positivi.map((r) => r.allergene).join(', ')}.` : ' Nessun allergene positivo.'}
      </p>
      <svg viewBox={`0 0 560 ${alt}`} className="w-full" role="img" aria-label="Grafico del prick test">
        {Array.from({ length: Math.floor(max / 2) + 1 }, (_, i) => i * 2).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 4} y2={alt - 20} stroke="#e2e8f0" strokeWidth={1} />
            <text x={x(t)} y={alt - 6} fontSize={9} textAnchor="middle" fill="#64748b">{t}</text>
          </g>
        ))}
        <text x={L + W} y={alt - 6} dx={22} fontSize={9} fill="#64748b">mm</text>
        {ordinate.map((r, i) => {
          const v = Number(r.valore ?? 0);
          const y = top + i * H;
          const controllo = r === istamina || r === negativo;
          const pos = r.esito === 'positivo' && !controllo;
          const colore = r === istamina ? '#3987e5' : r === negativo ? '#94a3b8' : pos ? STATO.alterato : STATO.neutro;
          return (
            <g key={String(r.id)}>
              <text x={L - 8} y={y + 13} fontSize={10} textAnchor="end" fill={controllo ? '#475569' : '#0f172a'} fontStyle={controllo ? 'italic' : 'normal'}>
                {String(r.allergene).length > 30 ? `${String(r.allergene).slice(0, 29)}…` : String(r.allergene)}
              </text>
              {v > 0 && <rect x={L} y={y + 3} width={Math.max(4, x(v) - L)} height={H - 6} rx={4} fill={colore} />}
              {v > 0 && <circle cx={x(v) - 7} cy={y + H / 2} r={4} fill="#ffffff" opacity={0.85} />}
              <text x={x(v) + 6} y={y + 13} fontSize={10} fill="#0f172a" fontWeight={pos ? 700 : 400}>
                {v ? `${num(v)} mm` : '0'}{controllo ? '' : pos ? '  ● positivo' : '  negativo'}
              </text>
            </g>
          );
        })}
        <line x1={x(soglia)} x2={x(soglia)} y1={top - 6} y2={alt - 20} stroke={STATO.critico} strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={x(soglia)} y={10} fontSize={9} textAnchor="middle" fill={STATO.critico}>soglia {num(soglia)} mm</text>
      </svg>
      <p className="mt-1 flex flex-wrap gap-3 text-[9pt] text-slate-600">
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: STATO.alterato }} />positivo</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: STATO.neutro }} />negativo</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: '#3987e5' }} />istamina (controllo positivo)</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: '#94a3b8' }} />controllo negativo</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- IgE (scala logaritmica, classi)
const CLASSI_IGE: [number, number, string][] = [[0.1, 0.35, '0'], [0.35, 0.7, '1'], [0.7, 3.5, '2'], [3.5, 17.5, '3'], [17.5, 50, '4'], [50, 100, '5']];
const BLU = ['#f1f5f9', '#cde2fb', '#a9ccf5', '#86b6ef', '#3987e5', '#1c5cab'];
function GraficoIgE({ righe }: { righe: RigaAllergo[] }) {
  const L = 190, W = 330, H = 20, top = 22;
  const lx = (v: number) => L + ((Math.log10(Math.min(100, Math.max(0.1, v))) + 1) / 3) * W;
  const alt = top + righe.length * H + 22;
  return (
    <div>
      <p className="mb-1 text-[9.5pt] text-slate-700">IgE specifiche (kUA/L, scala logaritmica). Da 0,35 kUA/L si parla di sensibilizzazione: va sempre letta insieme alla storia clinica.</p>
      <svg viewBox={`0 0 580 ${alt}`} className="w-full" role="img" aria-label="Grafico delle IgE specifiche">
        {CLASSI_IGE.map(([a, b, c], i) => (
          <g key={c}>
            <rect x={lx(a)} y={top - 4} width={lx(b) - lx(a) - 2} height={righe.length * H + 4} fill={BLU[i]} opacity={0.45} rx={3} />
            <text x={(lx(a) + lx(b)) / 2} y={12} fontSize={8.5} textAnchor="middle" fill="#475569">classe {c}</text>
          </g>
        ))}
        {[0.1, 0.35, 1, 3.5, 10, 17.5, 50, 100].map((t) => (
          <text key={t} x={lx(t)} y={alt - 6} fontSize={8.5} textAnchor="middle" fill="#64748b">{num(t, 2)}</text>
        ))}
        {righe.map((r, i) => {
          const v = Number(r.valore ?? 0);
          const y = top + i * H;
          const pos = v >= 0.35;
          return (
            <g key={String(r.id)}>
              <text x={L - 8} y={y + 12} fontSize={10} textAnchor="end" fill="#0f172a">{String(r.allergene).slice(0, 32)}</text>
              <line x1={L} x2={lx(v)} y1={y + 8} y2={y + 8} stroke={pos ? '#1c5cab' : '#94a3b8'} strokeWidth={2} />
              <circle cx={lx(v)} cy={y + 8} r={5.5} fill={pos ? '#1c5cab' : '#ffffff'} stroke={pos ? '#ffffff' : '#94a3b8'} strokeWidth={2} />
              <text x={lx(v) + 9} y={y + 12} fontSize={10} fill="#0f172a" fontWeight={pos ? 700 : 400}>{num(v, 2)} {String(r.unita ?? 'kUA/L')}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- barre a zone (spirometria, FeNO)
function BarraZone({ etichetta, valore, unita, min, max, zone, nota }: {
  etichetta: string; valore: number; unita: string; min: number; max: number;
  zone: { da: number; a: number; stato: Stato; testo: string }[]; nota?: string;
}) {
  const W = 330, L = 0;
  const x = (v: number) => L + ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * W;
  const attuale = zone.find((z) => valore >= z.da && valore < z.a) ?? zone[zone.length - 1]!;
  return (
    <div className="grid grid-cols-[150px_1fr_auto] items-center gap-3 py-1">
      <div><p className="font-semibold text-slate-900">{etichetta}</p>{nota && <p className="text-[8.5pt] text-slate-500">{nota}</p>}</div>
      <svg viewBox="0 0 340 34" className="w-full" role="img" aria-label={`${etichetta}: ${valore}${unita}`}>
        {zone.map((z) => <rect key={z.da} x={x(z.da)} y={8} width={Math.max(0, x(z.a) - x(z.da) - 2)} height={10} rx={4} fill={TINTA[z.stato]} stroke={STATO[z.stato]} strokeWidth={0.8} />)}
        <path d={`M${x(valore) - 6},2 L${x(valore) + 6},2 L${x(valore)},10 Z`} fill="#0f172a" />
        <rect x={x(valore) - 1.5} y={6} width={3} height={14} fill="#0f172a" rx={1} />
        <text x={x(min)} y={31} fontSize={8.5} fill="#64748b">{min}</text>
        <text x={x(max)} y={31} fontSize={8.5} fill="#64748b" textAnchor="end">{max}</text>
      </svg>
      <div className="text-right">
        <p className="text-[13pt] font-bold tabular-nums text-slate-900">{num(valore)}{unita}</p>
        <Etichetta stato={attuale.stato}>{attuale.testo}</Etichetta>
      </div>
    </div>
  );
}

function Spirometria({ s, etaAnni }: { s: RigaAllergo; etaAnni: number }) {
  const pct = (z: string) => [{ da: 0, a: 60, stato: 'critico' as Stato, testo: 'ridotto' }, { da: 60, a: 80, stato: 'attenzione' as Stato, testo: 'lievemente ridotto' }, { da: 80, a: 151, stato: 'bene' as Stato, testo: z }];
  const bambino = etaAnni < 12;
  const rev = s.reversibilita_pct == null ? null : Number(s.reversibilita_pct);
  const feno = s.feno_ppb == null ? null : Number(s.feno_ppb);
  const [f1, f2] = bambino ? [20, 35] : [25, 50];
  return (
    <div>
      {s.fev1_pct != null && <BarraZone etichetta="FEV₁" nota="aria espirata nel 1° secondo, % del previsto" valore={Number(s.fev1_pct)} unita="%" min={0} max={150} zone={pct('nella norma')} />}
      {s.fvc_pct != null && <BarraZone etichetta="FVC" nota="capacità vitale forzata, % del previsto" valore={Number(s.fvc_pct)} unita="%" min={0} max={150} zone={pct('nella norma')} />}
      {s.fev1_fvc != null && (
        <BarraZone etichetta="FEV₁/FVC" nota={bambino ? 'nei bambini di solito > 90%' : 'di norma > 80%'} valore={Number(s.fev1_fvc)} unita="%" min={50} max={100}
          zone={bambino
            ? [{ da: 0, a: 80, stato: 'critico', testo: 'ostruzione' }, { da: 80, a: 90, stato: 'attenzione', testo: 'da valutare' }, { da: 90, a: 101, stato: 'bene', testo: 'nella norma' }]
            : [{ da: 0, a: 70, stato: 'critico', testo: 'ostruzione' }, { da: 70, a: 80, stato: 'attenzione', testo: 'da valutare' }, { da: 80, a: 101, stato: 'bene', testo: 'nella norma' }]} />
      )}
      {s.fef2575_pct != null && <BarraZone etichetta="FEF₂₅₋₇₅" nota="piccole vie aeree, % del previsto" valore={Number(s.fef2575_pct)} unita="%" min={0} max={150}
        zone={[{ da: 0, a: 65, stato: 'attenzione', testo: 'ridotto' }, { da: 65, a: 151, stato: 'bene', testo: 'nella norma' }]} />}
      {rev != null && s.fev1_l != null && s.fev1_post_l != null && (
        <div className="mt-2 grid grid-cols-[150px_1fr_auto] items-center gap-3 rounded-xl bg-white/70 p-2">
          <div><p className="font-semibold text-slate-900">Test di broncoreversibilità</p><p className="text-[8.5pt] text-slate-500">FEV₁ prima e dopo il broncodilatatore</p></div>
          <svg viewBox="0 0 340 44" className="w-full" role="img" aria-label="FEV1 prima e dopo broncodilatatore">
            {[['Prima', Number(s.fev1_l), '#94a3b8', 4], ['Dopo', Number(s.fev1_post_l), '#3987e5', 24]].map(([t, v, c, y]) => (
              <g key={t as string}>
                <text x={0} y={(y as number) + 11} fontSize={9.5} fill="#334155">{t as string}</text>
                <rect x={38} y={y as number} width={(Number(v) / Math.max(Number(s.fev1_l), Number(s.fev1_post_l))) * 230} height={14} rx={4} fill={c as string} />
                <text x={38 + (Number(v) / Math.max(Number(s.fev1_l), Number(s.fev1_post_l))) * 230 + 6} y={(y as number) + 11} fontSize={9.5} fill="#0f172a">{num(v, 2)} L</text>
              </g>
            ))}
          </svg>
          <div className="text-right">
            <p className="text-[13pt] font-bold tabular-nums text-slate-900">{rev > 0 ? '+' : ''}{num(rev)}%</p>
            <Etichetta stato={rev >= 12 ? 'alterato' : 'bene'}>{rev >= 12 ? 'positivo (≥ 12%)' : 'negativo'}</Etichetta>
          </div>
        </div>
      )}
      {feno != null && (
        <BarraZone etichetta="FeNO" nota="ossido nitrico esalato (infiammazione)" valore={feno} unita=" ppb" min={0} max={bambino ? 70 : 100}
          zone={[{ da: 0, a: f1, stato: 'bene', testo: 'basso' }, { da: f1, a: f2 + 0.01, stato: 'attenzione', testo: 'intermedio' }, { da: f2 + 0.01, a: 1000, stato: 'alterato', testo: 'elevato' }]} />
      )}
      {feno != null && <p className="text-[8.5pt] text-slate-500">FeNO {livelloFeno(feno, etaAnni)} secondo le soglie ATS per età.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- punteggi
type Banda = [number, number, Stato, string];
const SCALE: Record<string, { nome: string; sotto: string; min: number; max: number; bande: Banda[] }> = {
  c_act: { nome: 'C-ACT', sotto: 'controllo dell\'asma (4–11 anni)', min: 0, max: 27, bande: [[0, 19.5, 'critico', 'non ben controllato'], [19.5, 27, 'bene', 'ben controllato']] },
  act: { nome: 'ACT', sotto: 'controllo dell\'asma (da 12 anni)', min: 5, max: 25, bande: [[5, 15.5, 'critico', 'scarso controllo'], [15.5, 19.5, 'attenzione', 'non ben controllato'], [19.5, 25, 'bene', 'ben controllato']] },
  scorad: { nome: 'SCORAD', sotto: 'gravità della dermatite atopica', min: 0, max: 103, bande: [[0, 25, 'bene', 'lieve'], [25, 50, 'attenzione', 'moderata'], [50, 103, 'critico', 'grave']] },
  poem: { nome: 'POEM', sotto: 'eczema nell\'ultima settimana (genitori)', min: 0, max: 28, bande: [[0, 2.5, 'bene', 'assente'], [2.5, 7.5, 'bene', 'lieve'], [7.5, 16.5, 'attenzione', 'moderato'], [16.5, 24.5, 'alterato', 'grave'], [24.5, 28, 'critico', 'molto grave']] },
  uas7: { nome: 'UAS7', sotto: 'attività dell\'orticaria in 7 giorni', min: 0, max: 42, bande: [[0, 6.5, 'bene', 'controllata'], [6.5, 15.5, 'attenzione', 'lieve'], [15.5, 27.5, 'alterato', 'moderata'], [27.5, 42, 'critico', 'grave']] },
};

function Punteggio({ p, storico }: { p: RigaAllergo; storico: RigaAllergo[] }) {
  const sc = SCALE[String(p.scala)];
  if (!sc) return null;
  const v = Number(p.punteggio);
  const W = 300;
  const x = (n: number) => 6 + ((Math.min(sc.max, Math.max(sc.min, n)) - sc.min) / (sc.max - sc.min)) * W;
  const banda = sc.bande.find(([a, b]) => v >= a && v < b) ?? sc.bande[sc.bande.length - 1]!;
  const serie = storico.filter((r) => r.scala === p.scala && String(r.data) <= String(p.data)).sort((a, b) => String(a.data).localeCompare(String(b.data))).slice(-6);
  const regioni = (p.dettagli as { regioni?: Record<string, number> } | null)?.regioni;
  return (
    <div className="grid grid-cols-[150px_1fr_auto] items-center gap-3 border-b border-dashed border-yellow-200 py-2 last:border-0">
      <div>
        <p className="text-[12pt] font-bold text-slate-900">{sc.nome}</p>
        <p className="text-[8.5pt] text-slate-500">{sc.sotto}</p>
      </div>
      <div>
        <svg viewBox="0 0 312 44" className="w-full" role="img" aria-label={`${sc.nome}: ${v}, ${banda[3]}`}>
          {sc.bande.map(([a, b, st, t]) => (
            <g key={a}>
              <rect x={x(a)} y={14} width={Math.max(0, x(b) - x(a) - 2)} height={12} rx={5} fill={TINTA[st]} stroke={STATO[st]} strokeWidth={0.8} />
              {x(b) - x(a) > 40 && <text x={(x(a) + x(b)) / 2} y={39} fontSize={8} textAnchor="middle" fill="#475569">{t}</text>}
            </g>
          ))}
          <path d={`M${x(v) - 6},3 L${x(v) + 6},3 L${x(v)},12 Z`} fill="#0f172a" />
          <rect x={x(v) - 1.5} y={11} width={3} height={18} rx={1} fill="#0f172a" />
        </svg>
        {serie.length >= 2 && (
          <div className="flex items-center gap-2 text-[8.5pt] text-slate-500">
            <span>Andamento:</span>
            <svg viewBox="0 0 160 30" width={160} height={30} role="img" aria-label={`Andamento ${sc.nome}`}>
              {(() => {
                const px = (i: number) => 6 + (i / (serie.length - 1)) * 148;
                const py = (n: number) => 26 - ((n - sc.min) / (sc.max - sc.min)) * 22;
                const d = serie.map((r, i) => `${i ? 'L' : 'M'}${px(i)},${py(Number(r.punteggio))}`).join(' ');
                return <>
                  <path d={d} fill="none" stroke="#a16207" strokeWidth={2} strokeLinejoin="round" />
                  {serie.map((r, i) => <circle key={String(r.id)} cx={px(i)} cy={py(Number(r.punteggio))} r={3.5} fill="#ffffff" stroke="#a16207" strokeWidth={2} />)}
                </>;
              })()}
            </svg>
            <span>{serie.map((r) => num(r.punteggio)).join(' → ')}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-right">
        {regioni && Object.values(regioni).some((x2) => x2 > 0) && (
          <span className="flex gap-1"><MappaCorporea regioni={regioni} lato="fronte" altezza={58} /><MappaCorporea regioni={regioni} lato="retro" altezza={58} /></span>
        )}
        <div>
          <p className="text-[16pt] font-bold tabular-nums text-slate-900">{num(v)}</p>
          <Etichetta stato={banda[2]}>{banda[3]}</Etichetta>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- decorazioni
function Decorazione() {
  return (
    <svg viewBox="0 0 160 90" width={150} height={84} aria-hidden="true">
      <path d="M40 60 q-4 14 2 28" stroke="#94a3b8" fill="none" strokeWidth={1.2} />
      <ellipse cx={40} cy={38} rx={16} ry={20} fill="#fda4af" />
      <ellipse cx={34} cy={30} rx={4} ry={6} fill="#ffffff" opacity={0.6} />
      <path d="M78 52 q4 18 -2 36" stroke="#94a3b8" fill="none" strokeWidth={1.2} />
      <ellipse cx={78} cy={30} rx={15} ry={19} fill="#93c5fd" />
      <ellipse cx={72} cy={23} rx={4} ry={6} fill="#ffffff" opacity={0.6} />
      <path d="M114 62 q-3 14 3 26" stroke="#94a3b8" fill="none" strokeWidth={1.2} />
      <ellipse cx={114} cy={42} rx={14} ry={18} fill="#fde68a" />
      <ellipse cx={109} cy={35} rx={3.5} ry={5.5} fill="#ffffff" opacity={0.6} />
      <path d="M145 12 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z" fill="#c4b5fd" />
      <path d="M10 8 l2 4 4 .5 -3 3 .7 4 -3.7 -2 -3.7 2 .7 -4 -3 -3 4 -.5z" fill="#86efac" />
    </svg>
  );
}

function Tessera({ icona, titolo, valore, colore }: { icona: keyof typeof ICONE; titolo: string; valore: string; colore: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border-2 bg-white px-3 py-2" style={{ borderColor: colore }}>
      <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `${colore}33` }}><Icona n={icona} colore="#334155" /></span>
      <div><p className="text-[8.5pt] uppercase tracking-wide text-slate-500">{titolo}</p><p className="text-[11.5pt] font-bold text-slate-900">{valore}</p></div>
    </div>
  );
}

const giornoLocale = (iso: unknown) => new Date(String(iso)).toLocaleDateString('sv-SE'); // AAAA-MM-GG nel fuso locale
const dataIt = (iso: unknown) => new Date(String(iso).length === 10 ? `${iso}T12:00:00` : String(iso)).toLocaleDateString('it-IT');
const dataLunga = (iso: unknown) => new Date(String(iso).length === 10 ? `${iso}T12:00:00` : String(iso)).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export interface DatiGrafici { test: RigaAllergo[]; spirometrie: RigaAllergo[]; punteggi: RigaAllergo[] }

export function RefertoGrafico({ impostazioni, studio, paziente, codiceFiscale, visita, anamnesi, prima, dati }: {
  impostazioni: ImpostazioniReferto | null; studio: Studio | null; paziente: AllergoPaziente; codiceFiscale: string | null;
  visita: RigaAllergo; anamnesi: Record<string, unknown>; prima: RigaAllergo | null; dati: DatiGrafici;
}) {
  const giorno = giornoLocale(visita.data);
  const delGiorno = (r: RigaAllergo[]) => r.filter((x) => String(x.data).slice(0, 10) === giorno);
  const test = delGiorno(dati.test);
  const prick = test.filter((t) => t.tipo === 'prick' || t.tipo === 'prick_by_prick');
  const ige = test.filter((t) => String(t.tipo).startsWith('ige_') && t.tipo !== 'ige_totali' && t.valore != null);
  const spiro = delGiorno(dati.spirometrie)[0];
  const punteggi = delGiorno(dati.punteggi);
  const generato = testoTest(giorno, { test: dati.test, spirometrie: dati.spirometrie, punteggi: dati.punteggi });
  const noteTest = String(visita.test_eseguiti ?? '').trim();
  const mostraNoteTest = noteTest && noteTest !== generato.trim();
  const etaAnni = (Date.parse(giorno) - Date.parse(paziente.data_nascita)) / (365.25 * 86_400_000);
  const controllo = visita.tipo !== 'prima_visita' && prima && prima.id !== visita.id;
  const firma = impostazioni?.firma ?? '';
  const chiusura = (impostazioni?.chiusura ?? '').replace(/\{\{email\}\}/g, impostazioni?.email_contatti ?? '___').replace(/\{\{firma\}\}/g, firma || 'del medico');
  const diagnosi = String(visita.diagnosi_testo ?? '').split('\n').map((d) => d.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
  const coloriDiagnosi = ['#fbcfe8', '#bae6fd', '#bbf7d0', '#fde68a', '#ddd6fe', '#fed7aa'];
  const ambiente: [keyof typeof ICONE, string, unknown][] = [
    ['casa', 'Abitazione', anamnesi.abitazione], ['zampa', 'Animali', anamnesi.animali], ['fumo', 'Fumo passivo', anamnesi.fumo_dettaglio],
    ['mela', 'Alimentazione', anamnesi.alimentazione], ['pillola', 'Farmaci', anamnesi.farmaci], ['pallone', 'Sport', anamnesi.sport], ['luna', 'Sonno', anamnesi.sonno],
  ];

  return (
    <article className="text-[10.5pt] leading-snug text-slate-900" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as CSSProperties}>
      {/* Intestazione */}
      <header className="mb-3 flex items-center justify-between overflow-hidden rounded-3xl px-5 py-3" style={{ background: 'linear-gradient(110deg,#ccfbf1 0%,#e0f2fe 55%,#ede9fe 100%)' }}>
        <div>
          <p className="text-[16pt] font-extrabold text-teal-900">{impostazioni?.intestazione ?? 'Ambulatorio di Allergologia'}</p>
          <p className="text-[10pt] text-slate-700">{[impostazioni?.sottotitolo ?? studio?.nome, studio?.indirizzo].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 inline-block rounded-full bg-white/80 px-3 py-0.5 text-[10pt] font-semibold text-slate-800">
            {controllo ? 'Visita di controllo' : 'Prima visita allergologica'} · {[impostazioni?.luogo, dataIt(visita.data)].filter(Boolean).join(', ')}
          </p>
        </div>
        <Decorazione />
      </header>

      {/* Paziente */}
      <div className="mb-3 flex items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3" style={{ breakInside: 'avoid' }}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[18pt] font-extrabold text-white"
             style={{ background: paziente.sesso === 'F' ? '#f472b6' : '#38bdf8' }}>
          {paziente.nome[0]}{paziente.cognome[0]}
        </div>
        <div className="flex-1">
          <p className="text-[15pt] font-bold">{paziente.nome} {paziente.cognome}</p>
          <p className="text-slate-700">
            {paziente.sesso === 'F' ? 'Nata' : 'Nato'}{paziente.luogo_nascita ? ` a ${paziente.luogo_nascita}` : ''} il {fmtGiornoIso(paziente.data_nascita)} · <b>{etaEstesa(paziente.data_nascita, giorno)}</b>
          </p>
          <p className="text-[9.5pt] text-slate-500">
            {[paziente.residenza && `Residenza: ${paziente.residenza}`, codiceFiscale && `C.F. ${codiceFiscale}`, paziente.pediatra_curante && `PdF: ${paziente.pediatra_curante}`,
              paziente.genitore_telefono && `Tel. ${paziente.genitore_telefono}`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {/* In breve */}
      <div className="mb-3 grid grid-cols-4 gap-2" style={{ breakInside: 'avoid' }}>
        <Tessera icona="bilancia" titolo="Peso" valore={visita.peso_kg != null ? `${num(visita.peso_kg)} kg` : '—'} colore="#86efac" />
        <Tessera icona="righello" titolo="Altezza" valore={visita.altezza_cm != null ? `${num(visita.altezza_cm)} cm` : '—'} colore="#93c5fd" />
        <Tessera icona="cuore" titolo="Saturazione" valore={visita.saturazione != null ? `${visita.saturazione}%` : '—'} colore="#fda4af" />
        <Tessera icona="calendario" titolo="Prossimo controllo" valore={visita.prossimo_controllo ? dataIt(visita.prossimo_controllo) : 'da programmare'} colore="#fde68a" />
      </div>

      {/* Anamnesi */}
      <Riquadro s="anamnesi" titolo="La storia del bambino">
        {[['Familiare', anamnesi.anamnesi_familiare], ['Fisiologica', anamnesi.anamnesi_fisiologica], ['Patologica remota', anamnesi.anamnesi_remota]]
          .filter(([, t]) => t).map(([n, t]) => <p key={n as string} className="mb-1"><b>Anamnesi {String(n).toLowerCase()}:</b> {String(t)}</p>)}
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {ambiente.filter(([, , t]) => t).map(([ic, n, t]) => (
            <p key={n} className="flex gap-2"><span className="mt-0.5"><Icona n={ic} colore={SEZIONI.anamnesi.inchiostro} dim={16} /></span><span><b>{n}:</b> {String(t)}</span></p>
          ))}
        </div>
      </Riquadro>

      <Riquadro s="storia" titolo={controllo ? 'Come è andata dall\'ultima visita' : 'Perché siamo qui'}>
        {controllo ? (
          <>
            <p className="mb-1 text-[9.5pt] font-semibold uppercase tracking-wide text-violet-700">Prima osservazione clinica · {dataIt(prima!.data)}</p>
            <TestoColorato testo={String(prima!.anamnesi ?? '')} />
            {visita.anamnesi ? <div className="mt-2"><TestoColorato testo={String(visita.anamnesi)} /></div> : null}
            <p className="mb-1 mt-3 text-[9.5pt] font-semibold uppercase tracking-wide text-violet-700">Controllo clinico del {dataIt(visita.data)}</p>
            <TestoColorato testo={String(visita.decorso ?? '')} />
          </>
        ) : <TestoColorato testo={String(visita.anamnesi ?? '')} />}
      </Riquadro>

      {visita.esame_obiettivo ? <Riquadro s="esame" titolo="Visita medica"><TestoColorato testo={String(visita.esame_obiettivo)} /></Riquadro> : null}

      {(prick.length > 0 || ige.length > 0 || mostraNoteTest) && (
        <Riquadro s="test" titolo="Test allergologici">
          {prick.length > 0 && <GraficoPrick righe={prick} />}
          {ige.length > 0 && <div className="mt-3"><GraficoIgE righe={ige} /></div>}
          {mostraNoteTest && <div className="mt-2 rounded-xl bg-white/70 p-2"><TestoColorato testo={noteTest} /></div>}
        </Riquadro>
      )}

      {spiro && (
        <Riquadro s="respiro" titolo="Il respiro: spirometria">
          <Spirometria s={spiro} etaAnni={etaAnni} />
          <p className="mt-1 text-[8.5pt] text-slate-500">Valori in % del previsto per età, sesso e altezza. Le fasce colorate sono indicative: l'interpretazione è del medico.</p>
        </Riquadro>
      )}

      {punteggi.length > 0 && (
        <Riquadro s="punteggi" titolo="I punteggi della visita">
          {punteggi.map((p) => <Punteggio key={String(p.id)} p={p} storico={dati.punteggi} />)}
        </Riquadro>
      )}

      {(visita.conclusioni || diagnosi.length > 0) && (
        <Riquadro s="diagnosi" titolo="Conclusioni e diagnosi">
          {visita.conclusioni ? <TestoColorato testo={String(visita.conclusioni)} /> : null}
          {diagnosi.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {diagnosi.map((d, i) => <span key={d} className="rounded-full px-3 py-1 text-[10pt] font-semibold text-slate-900" style={{ background: coloriDiagnosi[i % coloriDiagnosi.length] }}>{d}</span>)}
            </div>
          )}
        </Riquadro>
      )}

      {visita.piano ? <Riquadro s="piano" titolo="Cosa fare a casa: piano di cura"><TestoColorato testo={String(visita.piano)} /></Riquadro> : null}

      {/* Controllo, contatti e firma */}
      <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-4" style={{ breakInside: 'avoid' }}>
        <div className="space-y-2">
          {visita.prossimo_controllo ? (
            <div className="inline-flex items-center gap-3 rounded-2xl border-2 px-4 py-2" style={{ borderColor: '#fde047', background: '#fefce8' }}>
              <Icona n="calendario" colore="#a16207" dim={26} />
              <div><p className="text-[8.5pt] uppercase tracking-wide text-amber-800">Prossimo controllo</p><p className="text-[12pt] font-bold capitalize">{dataLunga(visita.prossimo_controllo)}</p></div>
            </div>
          ) : null}
          {chiusura.trim() && <p className="text-[9.5pt] text-slate-700">{chiusura}</p>}
          <p className="text-[10pt] font-semibold text-teal-800">⭐ Grazie {paziente.nome} per la collaborazione!</p>
        </div>
        <div className="w-64 text-center">
          <div className="mb-1 h-10 border-b border-slate-400" />
          <p className="font-semibold">{firma || 'Il medico'}</p>
          {impostazioni?.qualifica && <p className="text-[9pt] text-slate-600">{impostazioni.qualifica}</p>}
        </div>
      </div>
      <p className="mt-4 text-[7.5pt] text-slate-400">Documento generato il {fmtDataOra(new Date())}. Contiene dati sanitari: conservare e trasmettere con riservatezza.</p>
    </article>
  );
}
