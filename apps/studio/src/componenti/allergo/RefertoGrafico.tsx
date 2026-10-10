import { etaEstesa, type AllergoPaziente, type RigaAllergo, type Studio } from '@pls/shared';
import type { CSSProperties, ReactNode } from 'react';
import { fmtDataOra, fmtGiornoIso } from '../../lib/formato';
import type { ImpostazioniReferto } from './referto';
import { MappaCorporea as Mappa } from './Scorad';
import { righeMedico } from './stampa';
import {
  datiDelGiorno, giornoVisita, SCALE_REFERTO, TabellaAltriTest, TabellaIgE, TabellaPrick, TabellaPunteggi, TabellaSpirometria,
} from './tabelleReferto';

/**
 * Referto grafico della visita allergologica, pensato per bambini e famiglie:
 * colori tenui per sezione e icone. I test sono riportati come VALORI (tabelle), senza giudizi
 * automatici; i grafici compaiono solo dove aiutano la famiglia (andamento nel tempo, zone della pelle).
 */

// Colori di stato (fissi) e colori tenui delle sezioni.
// Tinte delle righe del piano di cura scritte dal medico (✅ migliora, ❌ non migliora, ➡ attenzione).
const TINTA = { bene: '#dcfce7', attenzione: '#fef3c7', critico: '#fee2e2' } as const;

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

// ---------------------------------------------------------------- andamento nel tempo
/**
 * Grafico dell'andamento di una misura nelle visite (solo se ci sono almeno due valori):
 * mostra i valori registrati e le date, senza soglie né giudizi automatici.
 */
function Andamento({ titolo, punti, unita, min, max }: { titolo: string; punti: { data: string; valore: number }[]; unita: string; min: number; max: number }) {
  if (punti.length < 2) return null;
  const W = 520, H = 120, L = 34, B = 22, T = 14;
  const x = (i: number) => L + 20 + (i / (punti.length - 1)) * (W - L - 20 - 36);
  const y = (v: number) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const d = punti.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.valore)}`).join(' ');
  const passi = [min, (min + max) / 2, max];
  return (
    <figure className="mt-2 rounded-xl bg-white/80 p-2" style={{ breakInside: 'avoid' }}>
      <figcaption className="text-[9.5pt] font-semibold text-slate-700">{titolo}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${titolo}: ${punti.map((p) => `${p.valore}${unita} il ${dataIt(p.data)}`).join(', ')}`}>
        {passi.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - 10} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
            <text x={L - 6} y={y(v) + 3} fontSize={9} textAnchor="end" fill="#64748b">{num(v)}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="#0f766e" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {punti.map((p, i) => (
          <g key={p.data + i}>
            <circle cx={x(i)} cy={y(p.valore)} r={5} fill="#ffffff" stroke="#0f766e" strokeWidth={2.5} />
            <text x={x(i)} y={y(p.valore) - 9} fontSize={10} textAnchor="middle" fill="#0f172a" fontWeight={700}>{num(p.valore)}{unita}</text>
            <text x={x(i)} y={H - 6} fontSize={9} textAnchor="middle" fill="#64748b">{dataIt(p.data)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

const SCALE_MAX: Record<string, [number, number]> = { c_act: [0, 27], act: [5, 25], scorad: [0, 103], poem: [0, 28], uas7: [0, 42] };

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

const dataIt = (iso: unknown) => new Date(String(iso).length === 10 ? `${iso}T12:00:00` : String(iso)).toLocaleDateString('it-IT');
const dataLunga = (iso: unknown) => new Date(String(iso).length === 10 ? `${iso}T12:00:00` : String(iso)).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export interface DatiGrafici { test: RigaAllergo[]; spirometrie: RigaAllergo[]; punteggi: RigaAllergo[] }

export function RefertoGrafico({ impostazioni, studio, paziente, codiceFiscale, visita, anamnesi, prima, dati }: {
  impostazioni: ImpostazioniReferto | null; studio: Studio | null; paziente: AllergoPaziente; codiceFiscale: string | null;
  visita: RigaAllergo; anamnesi: Record<string, unknown>; prima: RigaAllergo | null; dati: DatiGrafici;
}) {
  const giorno = giornoVisita(visita.data);
  const g = datiDelGiorno(giorno, dati);
  const noteTest = g.noteLibere(visita.test_eseguiti);
  // Andamenti: solo dati registrati fino a questa visita, almeno due valori.
  const finoA = (r: RigaAllergo[]) => r.filter((x) => String(x.data).slice(0, 10) <= giorno).sort((a2, b2) => String(a2.data).localeCompare(String(b2.data)));
  const andamentoFev1 = finoA(dati.spirometrie).filter((x) => x.fev1_pct != null).slice(-6).map((x) => ({ data: String(x.data), valore: Number(x.fev1_pct) }));
  const scaleDelGiorno = [...new Set(g.punteggi.map((p) => String(p.scala)))];
  const regioniScorad = (g.punteggi.find((p) => p.scala === 'scorad')?.dettagli as { regioni?: Record<string, number> } | null)?.regioni;
  const controllo = visita.tipo !== 'prima_visita' && prima && prima.id !== visita.id;
  const firma = impostazioni?.firma ?? '';
  const medico = righeMedico(impostazioni);
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

      {(g.prick.length > 0 || g.ige.length > 0 || g.altri.length > 0 || noteTest) && (
        <Riquadro s="test" titolo="Test allergologici">
          <div className="space-y-2">
            {g.prick.length > 0 && <TabellaPrick righe={g.prick} stile="colori" />}
            {g.ige.length > 0 && <TabellaIgE righe={g.ige} stile="colori" />}
            {g.altri.length > 0 && <TabellaAltriTest righe={g.altri} stile="colori" />}
            {noteTest && <div className="rounded-xl bg-white/70 p-2"><TestoColorato testo={noteTest} /></div>}
          </div>
        </Riquadro>
      )}

      {g.spirometria && (
        <Riquadro s="respiro" titolo="Il respiro: spirometria">
          <TabellaSpirometria s={g.spirometria} stile="colori" />
          <Andamento titolo="FEV₁ nelle visite (% del previsto)" punti={andamentoFev1} unita="%" min={Math.min(40, ...andamentoFev1.map((p) => p.valore))} max={Math.max(140, ...andamentoFev1.map((p) => p.valore))} />
        </Riquadro>
      )}

      {g.punteggi.length > 0 && (
        <Riquadro s="punteggi" titolo="I punteggi della visita">
          <TabellaPunteggi righe={g.punteggi} stile="colori" />
          {regioniScorad && Object.values(regioniScorad).some((v) => v > 0) && (
            <div className="mt-2 flex items-center gap-3 rounded-xl bg-white/80 p-2" style={{ breakInside: 'avoid' }}>
              <Mappa regioni={regioniScorad} lato="fronte" altezza={90} /><Mappa regioni={regioniScorad} lato="retro" altezza={90} />
              <p className="text-[9.5pt] text-slate-700">Zone della pelle interessate dalla dermatite oggi (più scuro = area più estesa).</p>
            </div>
          )}
          {scaleDelGiorno.map((sc) => {
            const [min, max] = SCALE_MAX[sc] ?? [0, 30];
            const punti = finoA(dati.punteggi).filter((p) => p.scala === sc).slice(-6).map((p) => ({ data: String(p.data), valore: Number(p.punteggio) }));
            return <Andamento key={sc} titolo={`${SCALE_REFERTO[sc]?.nome ?? sc} nelle visite`} punti={punti} unita="" min={min} max={max} />;
          })}
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
          <p className="text-[8.5pt] text-slate-500">Il medico</p>
          {medico.length ? medico.map((r, i) => <p key={r} className={i === 0 ? 'font-semibold' : 'text-[9pt] text-slate-600'}>{r}</p>) : <p className="font-semibold">Il medico</p>}
        </div>
      </div>
      <p className="mt-4 border-t border-slate-200 pt-1 text-[7.5pt] text-slate-500">
        Referto redatto e firmato dal medico; i valori dei test sono riportati come misurati. Documento sanitario contenente dati personali
        relativi alla salute (Reg. UE 2016/679): conservare e trasmettere con riservatezza. Generato il {fmtDataOra(new Date())}.
      </p>
    </article>
  );
}
