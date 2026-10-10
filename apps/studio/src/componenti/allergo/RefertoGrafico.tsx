import { etaEstesa, type AllergoPaziente, type RigaAllergo, type Studio } from '@pls/shared';
import type { ReactNode } from 'react';
import { fmtDataOra, fmtGiornoIso } from '../../lib/formato';
import type { ImpostazioniReferto } from './referto';
import { MappaCorporea } from './Scorad';
import { righeMedico } from './stampa';
import {
  datiDelGiorno, giornoVisita, SCALE_REFERTO, TabellaAltriTest, TabellaIgE, TabellaPrick, TabellaPunteggi, TabellaSpirometria,
} from './tabelleReferto';

/**
 * Referto per la famiglia: impaginazione professionale e sobria (intestazione e dati
 * in bianco e nero, poco inchiostro), solo il bordo di alcuni riquadri colorato.
 * I test sono VALORI in tabella, senza giudizi automatici; i grafici compaiono solo
 * dove aiutano (andamento nelle visite, zone della pelle dello SCORAD).
 * Si legge bene anche stampato in bianco e nero.
 */

// Bordi colorati (tenui ma visibili anche in scala di grigi) per alcuni riquadri.
const BORDO = { test: '#f59e0b', respiro: '#3b82f6', punteggi: '#a855f7', piano: '#14b8a6' } as const;

const num = (v: unknown, d = 1) => Number(v).toLocaleString('it-IT', { maximumFractionDigits: d });
const dataIt = (iso: unknown) => new Date(String(iso).length === 10 ? `${iso}T12:00:00` : String(iso)).toLocaleDateString('it-IT');
const dataLunga = (iso: unknown) => new Date(String(iso).length === 10 ? `${iso}T12:00:00` : String(iso))
  .toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const Titolo = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-1 mt-3 border-b border-slate-400 pb-0.5 text-[10.5pt] font-bold uppercase tracking-wide text-slate-900" style={{ breakAfter: 'avoid' }}>{children}</h2>
);

/** Riquadro con solo il bordo colorato (sfondo bianco). */
function Riquadro({ bordo, titolo, children }: { bordo: string; titolo: string; children: ReactNode }) {
  return (
    <section className="mt-3 rounded-xl border-2 bg-white px-3 pb-2 pt-1.5" style={{ borderColor: bordo, breakInside: 'avoid' }}>
      <h2 className="mb-1.5 text-[10.5pt] font-bold uppercase tracking-wide text-slate-900">{titolo}</h2>
      {children}
    </section>
  );
}

const Voce = ({ titolo, testo }: { titolo: string; testo: unknown }) => (testo ? <p className="mb-0.5"><b>{titolo}:</b> {String(testo)}</p> : null);

/** Testo del medico: righe «-» come elenco; ✅ ❌ ➡ in grassetto (nessun riempimento colorato). */
function Testo({ testo }: { testo: string | null | undefined }) {
  if (!testo?.trim()) return null;
  return (
    <div className="space-y-0.5">
      {testo.split('\n').map((r, i) => {
        const t = r.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (/^(✅|❌|➡)/.test(t) || /^Pr\//.test(t)) return <p key={i} className="font-semibold">{t}</p>;
        if (/^-\s+/.test(t)) {
          return (
            <p key={i} className={`flex gap-2 ${/^\s{2,}-/.test(r) ? 'ml-5' : ''}`}>
              <span className="shrink-0">•</span><span>{t.replace(/^-\s+/, '')}</span>
            </p>
          );
        }
        if (/^\s{2,}/.test(r)) return <p key={i} className="ml-4">{t}</p>;
        return <p key={i}>{t}</p>;
      })}
    </div>
  );
}

/** Andamento di una misura nelle visite (solo con almeno due valori; nessuna soglia né giudizio). */
function Andamento({ titolo, punti, unita, min, max }: { titolo: string; punti: { data: string; valore: number }[]; unita: string; min: number; max: number }) {
  if (punti.length < 2) return null;
  const W = 520, H = 110, L = 34, B = 22, T = 14;
  const x = (i: number) => L + 20 + (i / (punti.length - 1)) * (W - L - 20 - 36);
  const y = (v: number) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const d = punti.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.valore)}`).join(' ');
  return (
    <figure className="mt-2" style={{ breakInside: 'avoid' }}>
      <figcaption className="text-[9.5pt] font-semibold">{titolo}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${titolo}: ${punti.map((p) => `${p.valore}${unita} il ${dataIt(p.data)}`).join(', ')}`}>
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - 10} y1={y(v)} y2={y(v)} stroke="#d4d4d8" />
            <text x={L - 6} y={y(v) + 3} fontSize={9} textAnchor="end" fill="#52525b">{num(v)}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="#27272a" strokeWidth={2} strokeLinejoin="round" />
        {punti.map((p, i) => (
          <g key={p.data + i}>
            <circle cx={x(i)} cy={y(p.valore)} r={4.5} fill="#ffffff" stroke="#27272a" strokeWidth={2} />
            <text x={x(i)} y={y(p.valore) - 9} fontSize={10} textAnchor="middle" fill="#000000" fontWeight={700}>{num(p.valore)}{unita}</text>
            <text x={x(i)} y={H - 6} fontSize={9} textAnchor="middle" fill="#52525b">{dataIt(p.data)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

const SCALE_MAX: Record<string, [number, number]> = { c_act: [0, 27], act: [5, 25], scorad: [0, 103], poem: [0, 28], uas7: [0, 42] };

export interface DatiGrafici { test: RigaAllergo[]; spirometrie: RigaAllergo[]; punteggi: RigaAllergo[] }

export function RefertoGrafico({ impostazioni, studio, paziente, codiceFiscale, visita, anamnesi, prima, dati }: {
  impostazioni: ImpostazioniReferto | null; studio: Studio | null; paziente: AllergoPaziente; codiceFiscale: string | null;
  visita: RigaAllergo; anamnesi: Record<string, unknown>; prima: RigaAllergo | null; dati: DatiGrafici;
}) {
  const giorno = giornoVisita(visita.data);
  const g = datiDelGiorno(giorno, dati);
  const noteTest = g.noteLibere(visita.test_eseguiti);
  const finoA = (r: RigaAllergo[]) => r.filter((x) => String(x.data).slice(0, 10) <= giorno).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const andamentoFev1 = finoA(dati.spirometrie).filter((x) => x.fev1_pct != null).slice(-6).map((x) => ({ data: String(x.data), valore: Number(x.fev1_pct) }));
  const scaleDelGiorno = [...new Set(g.punteggi.map((p) => String(p.scala)))];
  const regioniScorad = (g.punteggi.find((p) => p.scala === 'scorad')?.dettagli as { regioni?: Record<string, number> } | null)?.regioni;
  const controllo = visita.tipo !== 'prima_visita' && prima && prima.id !== visita.id;
  const medico = righeMedico(impostazioni);
  const chiusura = (impostazioni?.chiusura ?? '').replace(/\{\{email\}\}/g, impostazioni?.email_contatti ?? '___')
    .replace(/\{\{firma\}\}/g, impostazioni?.firma || 'del medico');
  const diagnosi = String(visita.diagnosi_testo ?? '').split('\n').map((d) => d.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
  const ora = new Date(String(visita.data)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const cella = 'border border-slate-400 px-2 py-0.5 align-top';
  const testa = `${cella} bg-gray-100 text-left font-semibold`;
  const misura = (v: unknown, u: string) => (v != null ? `${num(v)} ${u}` : '—');

  return (
    <article className="text-[10.5pt] leading-snug text-black">
      {/* Intestazione schematica, in bianco e nero */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-2">
        <div>
          <p className="text-[14pt] font-bold">{impostazioni?.intestazione ?? 'Ambulatorio di Allergologia'}</p>
          {impostazioni?.sottotitolo && <p>{impostazioni.sottotitolo}</p>}
          {studio?.nome && <p>{studio.nome}</p>}
          <p className="text-[9pt]">{[studio?.indirizzo, impostazioni?.telefono && `Tel. ${impostazioni.telefono}`, impostazioni?.email_contatti].filter(Boolean).join(' · ')}</p>
        </div>
        {medico.length > 0 && <div className="text-right text-[9.5pt]">{medico.map((r, i) => <p key={r} className={i === 0 ? 'font-semibold' : ''}>{r}</p>)}</div>}
      </header>

      <div className="mb-2 mt-3 flex items-end justify-between">
        <h1 className="text-[13pt] font-bold uppercase tracking-wide">Referto di visita allergologica</h1>
        <p className="text-right">{[impostazioni?.luogo, dataIt(visita.data)].filter(Boolean).join(', ')} · ore {ora}</p>
      </div>

      <table className="w-full border-collapse text-[10pt]">
        <tbody>
          <tr><th className={testa}>Paziente</th><td className={`${cella} font-semibold`}>{paziente.cognome} {paziente.nome}</td>
            <th className={testa}>Visita</th><td className={cella}>{controllo ? 'Controllo clinico' : 'Prima visita'}</td></tr>
          <tr><th className={testa}>{paziente.sesso === 'F' ? 'Nata' : 'Nato'}</th>
            <td className={cella}>{paziente.luogo_nascita ? `a ${paziente.luogo_nascita} ` : ''}il {fmtGiornoIso(paziente.data_nascita)} ({etaEstesa(paziente.data_nascita, giorno)})</td>
            <th className={testa}>Codice fiscale</th><td className={`${cella} font-mono`}>{codiceFiscale ?? '—'}</td></tr>
          <tr><th className={testa}>Residenza</th><td className={cella}>{paziente.residenza ?? '—'}</td>
            <th className={testa}>Pediatra curante</th><td className={cella}>{paziente.pediatra_curante ?? '—'}</td></tr>
          <tr><th className={testa}>Peso · altezza</th><td className={cella}>{misura(visita.peso_kg, 'kg')} · {misura(visita.altezza_cm, 'cm')}{visita.saturazione != null ? ` · SpO₂ ${visita.saturazione}%` : ''}</td>
            <th className={testa}>Prossimo controllo</th><td className={`${cella} font-semibold`}>{visita.prossimo_controllo ? dataIt(visita.prossimo_controllo) : 'da programmare'}</td></tr>
        </tbody>
      </table>

      <Titolo>Anamnesi</Titolo>
      <Voce titolo="Familiare" testo={anamnesi.anamnesi_familiare} />
      <Voce titolo="Fisiologica" testo={anamnesi.anamnesi_fisiologica} />
      <Voce titolo="Patologica remota" testo={anamnesi.anamnesi_remota} />
      <div className="grid grid-cols-2 gap-x-6">
        <Voce titolo="Abitazione" testo={anamnesi.abitazione} />
        <Voce titolo="Animali" testo={anamnesi.animali} />
        <Voce titolo="Fumo passivo" testo={anamnesi.fumo_dettaglio} />
        <Voce titolo="Farmaci" testo={anamnesi.farmaci} />
        <Voce titolo="Alimentazione" testo={anamnesi.alimentazione} />
        <Voce titolo="Sport" testo={anamnesi.sport} />
        <Voce titolo="Sonno" testo={anamnesi.sonno} />
      </div>

      {controllo ? (
        <>
          <Titolo>Prima osservazione clinica ({dataIt(prima!.data)})</Titolo>
          <Testo testo={String(prima!.anamnesi ?? '')} />
          {visita.anamnesi ? <><Titolo>Anamnesi patologica</Titolo><Testo testo={String(visita.anamnesi)} /></> : null}
          <Titolo>Controllo clinico del {dataIt(visita.data)}</Titolo>
          <Testo testo={String(visita.decorso ?? '')} />
        </>
      ) : (
        <><Titolo>Anamnesi patologica prossima</Titolo><Testo testo={String(visita.anamnesi ?? '')} /></>
      )}

      {visita.esame_obiettivo ? <><Titolo>Esame obiettivo</Titolo><Testo testo={String(visita.esame_obiettivo)} /></> : null}

      {(g.prick.length > 0 || g.ige.length > 0 || g.altri.length > 0 || noteTest) && (
        <Riquadro bordo={BORDO.test} titolo="Test allergologici">
          <div className="space-y-2">
            {g.prick.length > 0 && <TabellaPrick righe={g.prick} stile="colori" />}
            {g.ige.length > 0 && <TabellaIgE righe={g.ige} stile="colori" />}
            {g.altri.length > 0 && <TabellaAltriTest righe={g.altri} stile="colori" />}
            {noteTest && <Testo testo={noteTest} />}
          </div>
        </Riquadro>
      )}

      {g.spirometria && (
        <Riquadro bordo={BORDO.respiro} titolo={`Spirometria${g.spirometria.feno_ppb != null ? ' e FeNO' : ''}`}>
          <TabellaSpirometria s={g.spirometria} stile="colori" />
          <Andamento titolo="FEV₁ nelle visite (% del previsto)" punti={andamentoFev1} unita="%"
            min={Math.min(40, ...andamentoFev1.map((p) => p.valore))} max={Math.max(140, ...andamentoFev1.map((p) => p.valore))} />
        </Riquadro>
      )}

      {g.punteggi.length > 0 && (
        <Riquadro bordo={BORDO.punteggi} titolo="Punteggi">
          <TabellaPunteggi righe={g.punteggi} stile="colori" />
          {regioniScorad && Object.values(regioniScorad).some((v) => v > 0) && (
            <div className="mt-2 flex items-center gap-3" style={{ breakInside: 'avoid' }}>
              <MappaCorporea regioni={regioniScorad} lato="fronte" altezza={80} /><MappaCorporea regioni={regioniScorad} lato="retro" altezza={80} />
              <p className="text-[9pt]">SCORAD: zone della pelle interessate il giorno della visita (più scuro = area più estesa).</p>
            </div>
          )}
          {scaleDelGiorno.map((sc) => {
            const [min, max] = SCALE_MAX[sc] ?? [0, 30];
            const punti = finoA(dati.punteggi).filter((p) => p.scala === sc).slice(-6).map((p) => ({ data: String(p.data), valore: Number(p.punteggio) }));
            return <Andamento key={sc} titolo={`${SCALE_REFERTO[sc]?.nome ?? sc} nelle visite`} punti={punti} unita="" min={min} max={max} />;
          })}
        </Riquadro>
      )}

      {visita.conclusioni ? <><Titolo>Conclusioni</Titolo><Testo testo={String(visita.conclusioni)} /></> : null}
      {diagnosi.length > 0 && <><Titolo>Diagnosi</Titolo><ol className="ml-5 list-decimal">{diagnosi.map((d) => <li key={d}>{d}</li>)}</ol></>}

      {visita.piano ? <Riquadro bordo={BORDO.piano} titolo="Piano di cura"><Testo testo={String(visita.piano)} /></Riquadro> : null}

      <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-6" style={{ breakInside: 'avoid' }}>
        <div className="space-y-1.5">
          {visita.prossimo_controllo ? <p><b>Prossimo controllo:</b> <span className="capitalize">{dataLunga(visita.prossimo_controllo)}</span></p> : null}
          {chiusura.trim() && <p className="text-[9.5pt]">{chiusura}</p>}
        </div>
        <div className="w-64 text-center">
          <p className="text-[9pt]">Il medico</p>
          {medico.map((r, i) => <p key={r} className={i === 0 ? 'font-semibold' : 'text-[9pt]'}>{r}</p>)}
          <div className="mt-8 border-b border-black" />
          <p className="text-[8pt] text-gray-600">firma</p>
        </div>
      </div>
      <p className="mt-4 border-t border-gray-300 pt-1 text-[7.5pt] text-gray-600">
        Referto redatto e firmato dal medico; i valori dei test sono riportati come misurati. Documento sanitario contenente dati personali
        relativi alla salute (Reg. UE 2016/679): conservare e trasmettere con riservatezza. Generato il {fmtDataOra(new Date())}.
      </p>
    </article>
  );
}
