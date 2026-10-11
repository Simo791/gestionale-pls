import type { RigaAllergo } from '@pls/shared';
import { FASI_AIT, VIE_AIT } from './definizioni';

/**
 * Resoconto di tutte le visite precedenti, da usare come anamnesi patologica nel
 * controllo clinico: per ogni visita i testi scelti, poi l'andamento dei dati strutturati
 * (punteggi, spirometria, peso), i test positivi, le terapie, l'immunoterapia e le reazioni.
 */
export interface OpzioniResoconto {
  anamnesi: boolean;
  esame: boolean;
  test: boolean;
  conclusioni: boolean;
  diagnosi: boolean;
  piano: 'nessuno' | 'farmaci' | 'completo';
  misure: boolean;
  andamento: boolean;
  positivi: boolean;
  terapie: boolean;
  reazioni: boolean;
}

export const OPZIONI_PREDEFINITE: OpzioniResoconto = {
  anamnesi: true, esame: false, test: true, conclusioni: true, diagnosi: true, piano: 'farmaci',
  misure: true, andamento: true, positivi: true, terapie: true, reazioni: true,
};

export interface DatiResoconto {
  test: RigaAllergo[]; spirometrie: RigaAllergo[]; punteggi: RigaAllergo[];
  terapie: RigaAllergo[]; immunoterapie: RigaAllergo[]; reazioni: RigaAllergo[];
}

const d = (iso: unknown) => new Date(String(iso).length === 10 ? `${iso}T12:00:00` : String(iso)).toLocaleDateString('it-IT');
const n = (v: unknown, cifre = 1) => Number(v).toLocaleString('it-IT', { maximumFractionDigits: cifre });
const unaRiga = (t: unknown) => String(t ?? '').split('\n').map((x) => x.trim().replace(/^-\s+/, '')).filter(Boolean)
  .reduce((acc, x) => (acc ? `${acc}${/[.!?:]$/.test(acc) ? ' ' : '; '}${x}` : x), '');
const TIPO: Record<string, string> = { prima_visita: 'Prima visita', controllo: 'Controllo', urgenza: 'Visita urgente', test: 'Seduta di test', altro: 'Visita' };
const SCALE: Record<string, string> = { c_act: 'C-ACT', act: 'ACT', scorad: 'SCORAD', poem: 'POEM', uas7: 'UAS7' };

/** Dal piano di cura tiene solo le prescrizioni (righe «Pr/» e la posologia che segue). */
export function farmaciDelPiano(piano: unknown): string {
  const righe = String(piano ?? '').split('\n');
  const out: string[] = [];
  righe.forEach((r, i) => {
    const t = r.trim();
    if (/^Pr\//i.test(t)) {
      const segue = (righe[i + 1] ?? '').trim();
      out.push(`${t.replace(/^Pr\/\s*/i, '').replace(/:$/, '')}${segue && !/^Pr\//i.test(segue) && /^(S\/|-|\d)/.test(segue) ? ` ${segue.replace(/^(S\/|-)\s*/, '')}` : ''}`);
    }
  });
  return out.join('; ');
}

const serie = (righe: RigaAllergo[], valore: (r: RigaAllergo) => string | null, data = 'data') =>
  [...righe].sort((a, b) => String(a[data]).localeCompare(String(b[data])))
    .map((r) => { const v = valore(r); return v ? `${v} (${d(r[data])})` : null; })
    .filter(Boolean).join(' → ');

export function resocontoVisite(visite: RigaAllergo[], dati: DatiResoconto, o: OpzioniResoconto, primaDel?: string): string {
  // visite precedenti, dalla più vecchia
  const elenco = [...visite].filter((v) => !primaDel || String(v.data) < primaDel).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  if (!elenco.length) return '';
  const limite = primaDel ? new Date(primaDel).toLocaleDateString('sv-SE') : '9999';
  const prima = <T extends RigaAllergo>(r: T[], campo = 'data') => r.filter((x) => String(x[campo]).slice(0, 10) < limite);
  const out: string[] = [];

  out.push(`Resoconto delle visite precedenti (${elenco.length} ${elenco.length === 1 ? 'visita' : 'visite'}, dal ${d(elenco[0]!.data)} al ${d(elenco[elenco.length - 1]!.data)})`);
  for (const v of elenco) {
    out.push('');
    out.push(`${TIPO[String(v.tipo)] ?? 'Visita'} del ${d(v.data)}${v.motivo && !/^(controllo clinico|prima visita allergologica)$/i.test(String(v.motivo)) ? ` – ${v.motivo}` : ''}`);
    if (o.anamnesi && v.anamnesi) out.push(`- ${v.tipo === 'prima_visita' ? 'Anamnesi' : 'Anamnesi aggiornata'}: ${unaRiga(v.anamnesi)}`);
    if (o.anamnesi && v.decorso) out.push(`- Decorso: ${unaRiga(v.decorso)}`);
    if (o.misure && (v.peso_kg != null || v.altezza_cm != null)) {
      out.push(`- ${[v.peso_kg != null && `Peso ${n(v.peso_kg)} kg`, v.altezza_cm != null && `altezza ${n(v.altezza_cm)} cm`].filter(Boolean).join(', ')}`);
    }
    if (o.esame && v.esame_obiettivo) out.push(`- Esame obiettivo: ${unaRiga(v.esame_obiettivo)}`);
    if (o.test && v.test_eseguiti) out.push(`- Test: ${unaRiga(v.test_eseguiti).replace(/^Eseguiti SPT per;\s*/i, 'SPT: ')}`);
    if (o.conclusioni && v.conclusioni) out.push(`- Conclusioni: ${unaRiga(v.conclusioni)}`);
    if (o.diagnosi && v.diagnosi_testo) out.push(`- Diagnosi: ${unaRiga(v.diagnosi_testo)}`);
    if (o.piano === 'farmaci') { const f = farmaciDelPiano(v.piano); if (f) out.push(`- Terapia indicata: ${f}`); }
    if (o.piano === 'completo' && v.piano) out.push(`- Piano di cura: ${unaRiga(v.piano)}`);
  }

  const sintesi: string[] = [];
  if (o.andamento) {
    const punteggi = prima(dati.punteggi);
    for (const scala of Object.keys(SCALE)) {
      const s = serie(punteggi.filter((p) => p.scala === scala), (p) => {
        const liv = String((p.dettagli as { livello?: string } | null)?.livello ?? '').replace(/_/g, ' ');
        return `${n(p.punteggio)}${liv ? ` ${liv}` : ''}`;
      });
      if (s) sintesi.push(`- ${SCALE[scala]}: ${s}`);
    }
    const spiro = prima(dati.spirometrie);
    const fev1 = serie(spiro, (s) => (s.fev1_pct != null ? `${n(s.fev1_pct)}%` : null));
    if (fev1) sintesi.push(`- FEV1: ${fev1}`);
    const ratio = serie(spiro, (s) => (s.fev1_fvc != null ? `${n(s.fev1_fvc)}%` : null));
    if (ratio) sintesi.push(`- FEV1/FVC: ${ratio}`);
    const rev = serie(spiro, (s) => (s.reversibilita_pct != null ? `${Number(s.reversibilita_pct) > 0 ? '+' : ''}${n(s.reversibilita_pct)}%${Number(s.reversibilita_pct) >= 12 ? ' positivo' : ''}` : null));
    if (rev) sintesi.push(`- Test di broncoreversibilità: ${rev}`);
    const feno = serie(spiro, (s) => (s.feno_ppb != null ? `${s.feno_ppb} ppb` : null));
    if (feno) sintesi.push(`- FeNO: ${feno}`);
    if (o.misure) {
      const peso = serie(elenco.filter((v) => v.peso_kg != null), (v) => `${n(v.peso_kg)} kg`);
      if (peso && elenco.filter((v) => v.peso_kg != null).length > 1) sintesi.push(`- Peso: ${peso}`);
    }
  }
  if (o.positivi) {
    const test = prima(dati.test).filter((t) => t.esito === 'positivo' && !/istamina|controllo/i.test(String(t.allergene)));
    const perAllergene = new Map<string, RigaAllergo>();
    for (const t of [...test].sort((a, b) => String(a.data).localeCompare(String(b.data)))) perAllergene.set(`${t.tipo}|${t.allergene}`, t);
    const testo = [...perAllergene.values()].map((t) => `${t.allergene} ${t.valore != null ? `${n(t.valore, 2)} ${t.unita ?? ''}`.trim() : ''} (${d(t.data)})`.replace(/\s+\(/, ' (')).join('; ');
    if (testo) sintesi.push(`- Test positivi (ultimo valore): ${testo}`);
  }
  if (o.terapie) {
    const oggi = limite;
    const terapie = prima(dati.terapie, 'dal');
    const inCorso = terapie.filter((t) => !t.al || String(t.al) >= oggi);
    const sospese = terapie.filter((t) => t.al && String(t.al) < oggi);
    if (inCorso.length) sintesi.push(`- Terapie in corso: ${inCorso.map((t) => `${t.farmaco}${t.posologia ? ` ${t.posologia}` : ''} (dal ${d(t.dal)})`).join('; ')}`);
    if (sospese.length) sintesi.push(`- Terapie precedenti: ${sospese.map((t) => `${t.farmaco} (${d(t.dal)}–${d(t.al)})`).join('; ')}`);
    const ait = prima(dati.immunoterapie, 'inizio');
    if (ait.length) sintesi.push(`- Immunoterapia: ${ait.map((a) => `${a.allergene}, ${VIE_AIT[String(a.via)] ?? a.via}${a.prodotto ? ` (${a.prodotto})` : ''} dal ${d(a.inizio)}, ${FASI_AIT[String(a.fase)]?.toLowerCase() ?? a.fase}`).join('; ')}`);
  }
  if (o.reazioni) {
    const r = prima(dati.reazioni);
    if (r.length) sintesi.push(`- Reazioni: ${[...r].sort((a, b) => String(a.data).localeCompare(String(b.data))).map((x) =>
      `${d(x.data)} ${x.causa ?? x.causa_categoria}${x.anafilassi ? ' – anafilassi' : ''}${x.adrenalina ? ', adrenalina' : ''}${x.pronto_soccorso ? ', pronto soccorso' : ''}`).join('; ')}`);
  }
  if (sintesi.length) {
    out.push('');
    out.push('Andamento e sintesi');
    out.push(...sintesi);
  }
  return out.join('\n');
}
