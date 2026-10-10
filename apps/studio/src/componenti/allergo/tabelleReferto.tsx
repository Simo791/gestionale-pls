import type { RigaAllergo } from '@pls/shared';
import type { ReactNode } from 'react';
import { testoTest } from './referto';

/**
 * Tabelle dei valori misurati per i referti: riportano SOLO i dati registrati
 * (nessuna interpretazione automatica, nessun giudizio calcolato dal programma).
 * L'interpretazione clinica è quella scritta e firmata dal medico.
 */
export interface DatiGiornata { test: RigaAllergo[]; spirometrie: RigaAllergo[]; punteggi: RigaAllergo[] }

const n = (v: unknown, cifre = 2) => (v == null || v === '' ? '—' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: cifre }));
const TIPO_TEST: Record<string, string> = {
  prick: 'Prick test', prick_by_prick: 'Prick by prick', ige_specifiche: 'IgE specifiche', ige_componenti: 'IgE molecolari',
  ige_totali: 'IgE totali', patch: 'Patch test', intradermo: 'Intradermoreazione', altro: 'Altro',
};
export const SCALE_REFERTO: Record<string, { nome: string; intervallo: string; descrizione: string }> = {
  c_act: { nome: 'C-ACT', intervallo: '0–27', descrizione: 'questionario di controllo dell\'asma (4–11 anni)' },
  act: { nome: 'ACT', intervallo: '5–25', descrizione: 'questionario di controllo dell\'asma (da 12 anni)' },
  scorad: { nome: 'SCORAD', intervallo: '0–103', descrizione: 'indice di gravità della dermatite atopica' },
  poem: { nome: 'POEM', intervallo: '0–28', descrizione: 'questionario sull\'eczema nell\'ultima settimana' },
  uas7: { nome: 'UAS7', intervallo: '0–42', descrizione: 'punteggio di attività dell\'orticaria in 7 giorni' },
};

const controllo = (r: RigaAllergo) => /istamina|controllo|salina/i.test(String(r.allergene));
export const giornoVisita = (data: unknown) => new Date(String(data)).toLocaleDateString('sv-SE');

/** Dati strutturati registrati nel giorno della visita. */
export function datiDelGiorno(giorno: string, d: DatiGiornata) {
  const delGiorno = (r: RigaAllergo[]) => r.filter((x) => String(x.data).slice(0, 10) === giorno);
  const test = delGiorno(d.test);
  return {
    prick: test.filter((t) => t.tipo === 'prick' || t.tipo === 'prick_by_prick')
      .sort((a, b) => Number(controllo(a)) - Number(controllo(b))),
    ige: test.filter((t) => String(t.tipo).startsWith('ige_')),
    altri: test.filter((t) => !String(t.tipo).startsWith('ige_') && t.tipo !== 'prick' && t.tipo !== 'prick_by_prick'),
    spirometria: delGiorno(d.spirometrie)[0] ?? null,
    punteggi: delGiorno(d.punteggi),
    /** Testo libero dei test da stampare solo se il medico l'ha cambiato rispetto a quello generato dai dati. */
    noteLibere: (testoEseguiti: unknown) => {
      const t = String(testoEseguiti ?? '').trim();
      return t && t !== testoTest(giorno, d).trim() ? t : '';
    },
  };
}

export type StileTabella = 'classico' | 'colori';

function Tabella({ stile, intestazioni, righe, allinea }: { stile: StileTabella; intestazioni: string[]; righe: ReactNode[][]; allinea?: ('l' | 'r')[] }) {
  const cella = stile === 'classico' ? 'border border-black px-2 py-0.5' : 'border border-slate-300 px-2 py-0.5';
  const testa = stile === 'classico' ? 'border border-black bg-gray-100 px-2 py-0.5 text-left' : 'border border-slate-300 bg-gray-100 px-2 py-0.5 text-left text-[9pt] font-semibold';
  return (
    <table className="w-full border-collapse text-[10pt]" style={{ breakInside: 'avoid' }}>
      <thead><tr>{intestazioni.map((h, i) => <th key={h} className={`${testa} ${allinea?.[i] === 'r' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>
        {righe.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={`${cella} ${allinea?.[j] === 'r' ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Prick test: titolo per metodica, allergeni affiancati su 4 colonne (allergene · mm). */
export function TabellaPrick({ righe, stile }: { righe: RigaAllergo[]; stile: StileTabella }) {
  const COLONNE = 4;
  const gruppi = (['prick', 'prick_by_prick'] as const).map((t) => [t, righe.filter((r) => r.tipo === t)] as const).filter(([, r]) => r.length);
  const cella = stile === 'classico' ? 'border border-black px-1.5 py-0.5' : 'border border-slate-300 px-1.5 py-0.5';
  const testa = `${cella} bg-gray-100 text-left text-[9pt] font-semibold`;
  return (
    <div className="space-y-2">
      {gruppi.map(([tipo, elenco]) => {
        const file: RigaAllergo[][] = [];
        for (let i = 0; i < elenco.length; i += COLONNE) file.push(elenco.slice(i, i + COLONNE));
        return (
          <div key={tipo} style={{ breakInside: 'avoid' }}>
            <p className="mb-0.5 font-semibold">{TIPO_TEST[tipo]}</p>
            <table className="w-full table-fixed border-collapse text-[9.5pt]">
              <colgroup>{Array.from({ length: COLONNE }, (_, i) => [<col key={`a${i}`} />, <col key={`m${i}`} style={{ width: '9%' }} />])}</colgroup>
              <thead><tr>{Array.from({ length: COLONNE }, (_, i) => [
                <th key={`a${i}`} className={testa}>Allergene</th>, <th key={`m${i}`} className={`${testa} text-right`}>mm</th>])}</tr></thead>
              <tbody>
                {file.map((fila, i) => (
                  <tr key={i}>
                    {Array.from({ length: COLONNE }, (_, j) => {
                      const r = fila[j];
                      return [
                        <td key={`a${j}`} className={`${cella} leading-tight`}>{r ? (controllo(r) ? <i>{String(r.allergene)}</i> : String(r.allergene)) : ''}</td>,
                        <td key={`m${j}`} className={`${cella} text-right tabular-nums`}>{r ? (r.valore == null ? '—' : n(r.valore, 1)) : ''}</td>,
                      ];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function TabellaIgE({ righe, stile }: { righe: RigaAllergo[]; stile: StileTabella }) {
  return (
    <Tabella stile={stile} intestazioni={['Allergene / componente', 'Esame', 'Valore', 'Unità']} allinea={['l', 'l', 'r', 'l']}
      righe={righe.map((r) => [String(r.allergene), TIPO_TEST[String(r.tipo)] ?? String(r.tipo), n(r.valore), String(r.unita ?? 'kUA/L')])} />
  );
}

export function TabellaAltriTest({ righe, stile }: { righe: RigaAllergo[]; stile: StileTabella }) {
  return (
    <Tabella stile={stile} intestazioni={['Test', 'Allergene', 'Lettura']}
      righe={righe.map((r) => [TIPO_TEST[String(r.tipo)] ?? String(r.tipo), String(r.allergene),
        [r.valore != null && `${n(r.valore)} ${r.unita ?? ''}`.trim(), r.note].filter(Boolean).join(' · ') || String(r.esito ?? '—')])} />
  );
}

export function TabellaSpirometria({ s, stile }: { s: RigaAllergo; stile: StileTabella }) {
  const righe: ReactNode[][] = [];
  if (s.fev1_l != null || s.fev1_pct != null) righe.push(['FEV₁', s.fev1_l != null ? `${n(s.fev1_l)} L` : '—', s.fev1_pct != null ? `${n(s.fev1_pct, 1)}%` : '—']);
  if (s.fvc_l != null || s.fvc_pct != null) righe.push(['FVC', s.fvc_l != null ? `${n(s.fvc_l)} L` : '—', s.fvc_pct != null ? `${n(s.fvc_pct, 1)}%` : '—']);
  if (s.fev1_fvc != null) righe.push(['FEV₁/FVC', `${n(s.fev1_fvc, 1)}%`, '']);
  if (s.fef2575_pct != null) righe.push(['FEF₂₅₋₇₅', '—', `${n(s.fef2575_pct, 1)}%`]);
  if (s.fev1_post_l != null) righe.push(['FEV₁ dopo broncodilatatore', `${n(s.fev1_post_l)} L`,
    s.reversibilita_pct != null ? `variazione ${Number(s.reversibilita_pct) > 0 ? '+' : ''}${n(s.reversibilita_pct, 1)}%` : '']);
  if (s.feno_ppb != null) righe.push(['FeNO', `${s.feno_ppb} ppb`, '']);
  return (
    <div>
      <Tabella stile={stile} intestazioni={['Parametro', 'Valore misurato', '% del previsto']} allinea={['l', 'r', 'r']} righe={righe} />
      {s.note ? <p className="mt-1 text-[9pt]">{String(s.note)}</p> : null}
    </div>
  );
}

export function TabellaPunteggi({ righe, stile }: { righe: RigaAllergo[]; stile: StileTabella }) {
  return (
    <Tabella stile={stile} intestazioni={['Scala', 'Punteggio', 'Intervallo']} allinea={['l', 'r', 'r']}
      righe={righe.map((p) => {
        const sc = SCALE_REFERTO[String(p.scala)];
        return [<span key="n"><b>{sc?.nome ?? String(p.scala)}</b>{sc ? ` – ${sc.descrizione}` : ''}</span>, n(p.punteggio, 1), sc?.intervallo ?? ''];
      })} />
  );
}
