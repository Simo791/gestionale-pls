import { act, cAct, poem, scorad, uas7, type Esito } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import Finestra from '../Finestra';
import { Badge, Bottone, Caricamento, Errore, Pannello, Vuoto } from '../ui';
import { giorno, oggi, stileInput, useRighe } from './Registro';
import Scorad, { comeInputScorad, statoScoradIniziale } from './Scorad';

export type Scala = 'c_act' | 'act' | 'scorad' | 'poem' | 'uas7';

export const NOMI_SCALA: Record<Scala, { nome: string; descrizione: string; fonte: string }> = {
  c_act: { nome: 'c-ACT', descrizione: 'Controllo dell\'asma, 4–11 anni (≤ 19 = non ben controllato)', fonte: 'Liu AH et al., J Allergy Clin Immunol 2007;119:817' },
  act: { nome: 'ACT', descrizione: 'Controllo dell\'asma, da 12 anni (≥ 20 ben controllato, ≤ 15 scarsamente)', fonte: 'Nathan RA et al., J Allergy Clin Immunol 2004;113:59' },
  scorad: { nome: 'SCORAD', descrizione: 'Gravità della dermatite atopica (< 25 lieve, 25–50 moderata, > 50 grave)', fonte: 'European Task Force on AD, Dermatology 1993; fasce: Oranje AP et al., BJD 2007' },
  poem: { nome: 'POEM', descrizione: 'Eczema riferito dal paziente/genitore, ultima settimana (0–28)', fonte: 'Charman CR et al., Arch Dermatol 2004; fasce: BJD 2013' },
  uas7: { nome: 'UAS7', descrizione: 'Attività dell\'orticaria in 7 giorni (0–42; ≤ 6 ben controllata)', fonte: 'Linee guida EAACI/GA²LEN/EuroGuiDerm/APAAACI, Allergy 2022' },
};

// Le domande dei questionari c-ACT e ACT sono protette da licenza: qui solo l'argomento di ciascuna voce.
const VOCI_CACT = [
  ['Bambino · come sta oggi con l\'asma', 3], ['Bambino · fastidio nel correre, fare sport, giocare', 3],
  ['Bambino · tosse per l\'asma', 3], ['Bambino · risvegli notturni per l\'asma', 3],
  ['Genitore · giorni con sintomi diurni (4 settimane)', 5], ['Genitore · giorni con sibili diurni (4 settimane)', 5],
  ['Genitore · notti con risvegli (4 settimane)', 5],
] as const;
const VOCI_ACT = ['Limitazione delle attività', 'Mancanza di respiro', 'Sintomi notturni o al risveglio', 'Uso del farmaco al bisogno', 'Giudizio sul controllo'];
const VOCI_POEM = ['Prurito', 'Sonno disturbato', 'Sanguinamento', 'Essudazione o secrezione', 'Screpolature', 'Desquamazione', 'Secchezza o ruvidità'];
const FREQ_POEM = ['0 · nessun giorno', '1 · 1–2 giorni', '2 · 3–4 giorni', '3 · 5–6 giorni', '4 · tutti i giorni'];

const sel = (n: number, valore: number, onChange: (v: number) => void, da = 0, etichette?: string[]) => (
  <select value={valore} onChange={(e) => onChange(Number(e.target.value))} className={stileInput}>
    {Array.from({ length: n - da + 1 }, (_, i) => i + da).map((v) => <option key={v} value={v}>{etichette?.[v - da] ?? v}</option>)}
  </select>
);

export function ModuloScala({ scala, pseudo, sotto2anni, onFatto, dataIniziale }: { scala: Scala; pseudo: string; sotto2anni: boolean; onFatto: () => void; dataIniziale?: string }) {
  const [data, setData] = useState(dataIniziale ?? oggi());
  const [note, setNote] = useState('');
  const [vCact, setVCact] = useState<number[]>([3, 3, 3, 3, 5, 5, 5]);
  const [vAct, setVAct] = useState<number[]>([5, 5, 5, 5, 5]);
  const [vPoem, setVPoem] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [sc, setSc] = useState(() => statoScoradIniziale(sotto2anni));
  const [giorni, setGiorni] = useState(Array.from({ length: 7 }, () => ({ pomfi: 0, prurito: 0 })));
  const [errore, setErrore] = useState<string | null>(null);

  let esito: Esito | null = null;
  let dettagli: Record<string, unknown> = {};
  let extra: string | null = null;
  try {
    if (scala === 'c_act') { esito = cAct(vCact); dettagli = { voci: vCact }; }
    if (scala === 'act') { esito = act(vAct); dettagli = { voci: vAct }; }
    if (scala === 'poem') { esito = poem(vPoem); dettagli = { voci: vPoem }; }
    if (scala === 'uas7') { esito = uas7(giorni); dettagli = { giorni }; }
    if (scala === 'scorad') {
      const inp = comeInputScorad(sc);
      const r = scorad(inp);
      esito = r;
      dettagli = { sotto2anni: sc.sotto2anni, regioni: sc.regioni, A: inp.estensione, B: sc.intensita, prurito: sc.prurito, sonno: sc.sonno, oggettivo: r.oggettivo };
      extra = `SCORAD oggettivo ${r.oggettivo} (${r.livelloOggettivo})`;
    }
  } catch (e) {
    esito = null;
    extra = e instanceof Error ? e.message : String(e);
  }

  const imposta = (arr: number[], i: number, v: number) => arr.map((x, j) => (j === i ? v : x));

  async function salva(e: FormEvent) {
    e.preventDefault();
    if (!esito) return;
    const { error } = await supabase.schema('clinica').from('allergo_punteggi').insert({
      pseudo_id: pseudo, data, scala, punteggio: esito.totale, dettagli: { ...dettagli, livello: esito.livello }, note: note.trim() || null,
    });
    if (error) setErrore(error.message); else onFatto();
  }

  return (
    <form onSubmit={(e) => void salva(e)} className="space-y-3 text-sm">
      {errore && <Errore messaggio={errore} />}
      <p className="text-slate-600">{NOMI_SCALA[scala].descrizione}. <span className="text-xs text-slate-400">Fonte: {NOMI_SCALA[scala].fonte}.</span></p>
      <label className="block w-48"><span className="block text-slate-500">Data</span>
        <input type="date" required value={data} onChange={(e) => setData(e.target.value)} className={stileInput} /></label>

      {scala === 'c_act' && (
        <div className="grid gap-2 md:grid-cols-2">
          {VOCI_CACT.map(([t, max], i) => (
            <label key={t}><span className="block text-slate-500">{t} (0–{max})</span>{sel(max, vCact[i]!, (v) => setVCact(imposta(vCact, i, v)))}</label>
          ))}
        </div>
      )}
      {scala === 'act' && (
        <div className="grid gap-2 md:grid-cols-2">
          {VOCI_ACT.map((t, i) => (
            <label key={t}><span className="block text-slate-500">{t} (1–5)</span>{sel(5, vAct[i]!, (v) => setVAct(imposta(vAct, i, v)), 1)}</label>
          ))}
        </div>
      )}
      {scala === 'poem' && (
        <div className="grid gap-2 md:grid-cols-2">
          {VOCI_POEM.map((t, i) => (
            <label key={t}><span className="block text-slate-500">{t}: giorni nell'ultima settimana</span>{sel(4, vPoem[i]!, (v) => setVPoem(imposta(vPoem, i, v)), 0, FREQ_POEM)}</label>
          ))}
        </div>
      )}
      {scala === 'uas7' && (
        <table className="w-full text-left">
          <thead className="text-xs text-slate-500"><tr><th>Giorno</th><th>Pomfi (0 nessuno · 1 &lt;20 · 2 20–50 · 3 &gt;50)</th><th>Prurito (0–3)</th></tr></thead>
          <tbody>
            {giorni.map((g, i) => (
              <tr key={i}>
                <td className="pr-2">{i + 1}</td>
                <td className="pr-2">{sel(3, g.pomfi, (v) => setGiorni(giorni.map((x, j) => (j === i ? { ...x, pomfi: v } : x))))}</td>
                <td>{sel(3, g.prurito, (v) => setGiorni(giorni.map((x, j) => (j === i ? { ...x, prurito: v } : x))))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {scala === 'scorad' && <Scorad stato={sc} onChange={setSc} />}

      <div className="rounded-lg bg-slate-50 p-3">
        {esito ? <p className="flex flex-wrap items-center gap-2"><Badge tono={esito.tono}>{esito.etichetta}</Badge>{extra && <span className="text-slate-600">{extra}</span>}</p>
          : <p className="text-rose-700">{extra}</p>}
        <p className="mt-1 text-xs text-slate-500">Calcolo automatico di supporto: l'interpretazione clinica resta del medico.</p>
      </div>
      <label className="block"><span className="block text-slate-500">Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={stileInput} /></label>
      <Bottone type="submit" variante="primario" disabled={!esito}>Registra punteggio</Bottone>
    </form>
  );
}

const TONO_LIVELLO: Record<string, 'ok' | 'attenzione' | 'errore'> = {
  controllato: 'ok', non_controllato: 'errore', non_ben_controllato: 'attenzione', scarsamente_controllato: 'errore',
  lieve: 'ok', moderata: 'attenzione', grave: 'errore', molto_grave: 'errore', assente: 'ok', controllata: 'ok',
};

/** Punteggi validati di un'area, con calcolatore e andamento nel tempo. */
export default function Punteggi({ titolo, scale, pseudo, onCambio, sotto2anni = false }: { titolo: string; scale: Scala[]; pseudo: string; onCambio?: () => void; sotto2anni?: boolean }) {
  const righe = useRighe('allergo_punteggi', pseudo, 'data');
  const [aperta, setAperta] = useState<Scala | null>(null);
  const elenco = (righe.dati ?? []).filter((r) => scale.includes(r.scala as Scala));

  return (
    <Pannello titolo={titolo} sottotitolo={scale.map((s) => NOMI_SCALA[s].nome).join(' · ')}
              azione={<div className="flex flex-wrap gap-2">{scale.map((s) => <Bottone key={s} variante="primario" onClick={() => setAperta(s)}>Nuovo {NOMI_SCALA[s].nome}</Bottone>)}</div>}>
      {righe.errore ? <Errore messaggio={righe.errore} /> : righe.caricamento ? <Caricamento /> : elenco.length === 0 ? <Vuoto testo="Nessun punteggio registrato." /> : (
        <div className="space-y-3">
          {scale.map((s) => {
            const serie = elenco.filter((r) => r.scala === s);
            if (serie.length === 0) return null;
            const max = s === 'scorad' ? 103 : s === 'uas7' ? 42 : s === 'poem' ? 28 : s === 'c_act' ? 27 : 25;
            return (
              <div key={s}>
                <p className="mb-1 text-sm font-medium text-slate-800">{NOMI_SCALA[s].nome}</p>
                <ul className="space-y-1">
                  {serie.map((r) => {
                    const livello = String((r.dettagli as { livello?: string } | null)?.livello ?? '');
                    const valore = Number(r.punteggio);
                    return (
                      <li key={r.id} className="flex items-center gap-3 text-sm">
                        <span className="w-24 tabular-nums text-slate-600">{giorno(r.data)}</span>
                        <span className="w-12 text-right font-semibold tabular-nums">{valore}</span>
                        <span className="h-2 flex-1 rounded bg-slate-100" aria-hidden="true">
                          <span className="block h-2 rounded bg-teal-600" style={{ width: `${Math.min(100, (valore / max) * 100)}%` }} />
                        </span>
                        {livello && <Badge tono={TONO_LIVELLO[livello] ?? 'neutro'}>{livello.replace(/_/g, ' ')}</Badge>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {aperta && (
        <Finestra titolo={`${NOMI_SCALA[aperta].nome}: nuovo punteggio`} onChiudi={() => setAperta(null)} larga={aperta === 'scorad' ? 'xl' : true}>
          <ModuloScala scala={aperta} pseudo={pseudo} sotto2anni={sotto2anni} onFatto={() => { setAperta(null); righe.ricarica(); onCambio?.(); }} />
        </Finestra>
      )}
    </Pannello>
  );
}
