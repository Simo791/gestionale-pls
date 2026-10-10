import type { RigaAllergo } from '@pls/shared';

/** Modello di testo (tabella anagrafica.allergo_modelli). */
export interface ModelloAllergo {
  id: string;
  studio_id: string | null;
  codice: string;
  nome: string;
  profilo: string;
  sezione: 'piano' | 'conclusioni' | 'esame_obiettivo' | 'anamnesi' | 'decorso';
  testo: string;
  ordine: number;
  attivo: boolean;
}

export interface ImpostazioniReferto {
  utente_id: string;
  studio_id: string;
  intestazione: string;
  sottotitolo: string | null;
  luogo: string | null;
  firma: string | null;
  qualifica: string | null;
  email_contatti: string | null;
  chiusura: string | null;
}

export const PROFILI: Record<string, string> = {
  asma: 'Asma', rinite: 'Rinite / oculorinite', dermatite: 'Dermatite atopica', alimenti: 'Allergia alimentare',
  anafilassi: 'Anafilassi', pollini_alimenti: 'LTP / PR-10 / profilline', immunoterapia: 'Immunoterapia',
  orticaria: 'Orticaria', generale: 'Generale',
};

export const SEZIONI_MODELLO: Record<ModelloAllergo['sezione'], string> = {
  piano: 'Piano di cura', conclusioni: 'Conclusioni', esame_obiettivo: 'Esame obiettivo', anamnesi: 'Anamnesi prossima', decorso: 'Decorso (controllo)',
};

/**
 * Modelli per tipo di bambino allergico: ogni modello di visita inserisce, nell'ordine,
 * i blocchi di testo indicati (codici di allergo_modelli). Ricavati dai referti
 * dell'ambulatorio: da rivedere e personalizzare.
 */
export interface Pacchetto { codice: string; nome: string; descrizione: string; modelli: string[]; strumenti: string[] }

export const PACCHETTI: Pacchetto[] = [
  { codice: 'asma_bambino', nome: 'Bambino con asma (< 12 anni)', descrizione: 'Broncospasmo para-infettivo o da sforzo, piano d\'azione con salbutamolo e ICS',
    modelli: ['eo_normale', 'asma_conclusioni', 'diario', 'fumo', 'profilassi_acari', 'asma_piano_azione', 'asma_fondo_ics', 'asma_controllo_spiro'],
    strumenti: ['prick', 'spirometria', 'c_act'] },
  { codice: 'asma_ragazzo', nome: 'Ragazzo con asma (≥ 12 anni)', descrizione: 'Terapia di fondo e al bisogno con budesonide/formoterolo (MART)',
    modelli: ['eo_normale', 'asma_conclusioni', 'diario', 'profilassi_acari', 'asma_mart', 'rinite', 'asma_vaccino', 'asma_controllo_spiro'],
    strumenti: ['prick', 'spirometria', 'act'] },
  { codice: 'rinite', nome: 'Rinocongiuntivite allergica', descrizione: 'Antistaminico, steroide nasale, collirio a gradini; profilassi ambientale',
    modelli: ['rinite_eo', 'diario', 'fumo', 'profilassi_pollini', 'profilassi_acari', 'rinite', 'orl', 'controllo'],
    strumenti: ['prick'] },
  { codice: 'dermatite', nome: 'Dermatite atopica', descrizione: 'Educazione, emollienti, terapia delle lesioni accese, prurito',
    modelli: ['dermatite_eo', 'dermatite', 'dermatite_controllo'], strumenti: ['scorad', 'poem'] },
  { codice: 'anafilassi_alimenti', nome: 'Allergia alimentare con anafilassi', descrizione: 'Evitamento rigoroso, autoiniettore × 2, piano d\'azione',
    modelli: ['eo_normale', 'anafilassi_conclusioni', 'diario', 'alimenti_anafilassi', 'controllo'], strumenti: ['prick', 'ige'] },
  { codice: 'crostacei', nome: 'Allergia a crostacei e molluschi', descrizione: 'Anche vapori di cottura; autoiniettore e piano d\'azione',
    modelli: ['eo_normale', 'anafilassi_conclusioni', 'diario', 'fumo', 'crostacei_molluschi', 'alimenti_anafilassi', 'controllo'], strumenti: ['prick', 'ige'] },
  { codice: 'alimenti', nome: 'Allergia alimentare senza anafilassi', descrizione: 'Dieta di esclusione e rivalutazione per la reintroduzione',
    modelli: ['eo_normale', 'diario', 'alimenti_dieta', 'controllo'], strumenti: ['prick', 'ige'] },
  { codice: 'pollini_alimenti', nome: 'Sindrome orale allergica (LTP / PR-10 / profilline)', descrizione: 'Gestione dei panallergeni e della rinite',
    modelli: ['eo_normale', 'diario', 'profilassi_pollini', 'ltp_pr10_profilina', 'rinite', 'controllo'], strumenti: ['prick', 'ige'] },
  { codice: 'immunoterapia', nome: 'Controllo in immunoterapia', descrizione: 'Aderenza, effetti collaterali, rinnovo del piano terapeutico',
    modelli: ['decorso_benessere', 'eo_normale', 'diario', 'ait', 'rinite', 'controllo'], strumenti: [] },
  { codice: 'orticaria', nome: 'Orticaria', descrizione: 'Antistaminico, diario dei fattori scatenanti, UAS7',
    modelli: ['eo_normale', 'diario', 'orticaria', 'controllo'], strumenti: ['uas7'] },
];

/** Modelli effettivi: quelli dello studio sostituiscono il predefinito con lo stesso codice. */
export function modelliEffettivi(tutti: ModelloAllergo[]): Map<string, ModelloAllergo> {
  const m = new Map<string, ModelloAllergo>();
  for (const x of [...tutti].sort((a, b) => (a.studio_id ? 1 : 0) - (b.studio_id ? 1 : 0))) m.set(x.codice, x);
  for (const [k, v] of m) if (!v.attivo) m.delete(k);
  return m;
}

const dataIt = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('it-IT');

/** Sostituisce i segnaposto {{nome}}, {{peso}}, {{prossimo_controllo}}. */
export function compila(testo: string, d: { nome: string; peso: string; prossimoControllo: string }): string {
  return testo
    .replace(/\{\{nome\}\}/g, d.nome)
    .replace(/\{\{peso\}\}/g, d.peso || '___')
    .replace(/\{\{prossimo_controllo\}\}/g, d.prossimoControllo ? `il ${dataIt(d.prossimoControllo)}` : 'in data da programmare');
}

/** Aggiunge un blocco a un testo esistente, separato da una riga vuota. */
export const accoda = (attuale: string, blocco: string) => (attuale.trim() ? `${attuale.trimEnd()}\n${blocco}` : blocco);

const num = (v: unknown) => String(v).replace('.', ',');

/** Testo «test eseguiti» del referto a partire dai dati strutturati della giornata. */
export function testoTest(giorno: string, d: { test: RigaAllergo[]; spirometrie: RigaAllergo[]; punteggi: RigaAllergo[] }): string {
  const parti: string[] = [];
  const delGiorno = <T extends RigaAllergo>(r: T[], campo = 'data') => r.filter((x) => String(x[campo]).slice(0, 10) === giorno);
  const test = delGiorno(d.test);
  const prick = test.filter((t) => t.tipo === 'prick' || t.tipo === 'prick_by_prick');
  if (prick.length) {
    parti.push('Eseguiti SPT per');
    const controlli = prick.filter((t) => /istamina|controllo/i.test(String(t.allergene)));
    for (const t of [...prick.filter((x) => !controlli.includes(x)), ...controlli]) {
      const istamina = /istamina/i.test(String(t.allergene));
      const valore = t.esito === 'negativo' && !istamina ? 'negativo' : t.valore != null ? `${num(t.valore)} mm` : String(t.esito ?? '');
      parti.push(`- ${t.allergene} : ${valore}`);
    }
  }
  const ige = test.filter((t) => String(t.tipo).startsWith('ige'));
  if (ige.length) {
    parti.push('IgE specifiche');
    for (const t of ige) parti.push(`- ${t.allergene}: ${t.valore != null ? `${num(t.valore)} ${t.unita ?? ''}`.trim() : ''}${t.esito === 'negativo' ? ' (negativo)' : ''}`);
  }
  for (const t of test.filter((x) => !String(x.tipo).startsWith('ige') && x.tipo !== 'prick' && x.tipo !== 'prick_by_prick')) {
    parti.push(`- ${t.tipo === 'patch' ? 'Patch test' : 'Test'} ${t.allergene}: ${t.esito ?? ''}${t.valore != null ? ` (${num(t.valore)} ${t.unita ?? ''})` : ''}`);
  }
  for (const s of delGiorno(d.spirometrie)) {
    const base = [s.fev1_pct != null && `FEV1 ${num(s.fev1_pct)}%`, s.fvc_pct != null && `FVC ${num(s.fvc_pct)}%`, s.fev1_fvc != null && `FEV1/FVC ${num(s.fev1_fvc)}%`,
      s.fef2575_pct != null && `FEF25-75 ${num(s.fef2575_pct)}%`].filter(Boolean).join(', ');
    if (base) parti.push(`Spirometria basale: ${base}`);
    if (s.reversibilita_pct != null) {
      const r = Number(s.reversibilita_pct);
      parti.push(`Test di broncoreversibilità: FEV1 ${r > 0 ? '+' : ''}${num(r)}% (${r >= 12 ? 'positivo' : 'negativo'})`);
    }
    if (s.feno_ppb != null) parti.push(`FeNO: ${s.feno_ppb} ppb`);
    if (s.note) parti.push(String(s.note));
  }
  for (const p of delGiorno(d.punteggi)) {
    const nomi: Record<string, string> = { c_act: 'C-ACT', act: 'ACT', scorad: 'SCORAD', poem: 'POEM', uas7: 'UAS7' };
    const livello = String((p.dettagli as { livello?: string } | null)?.livello ?? '').replace(/_/g, ' ');
    parti.push(`${nomi[String(p.scala)] ?? p.scala}: ${num(p.punteggio)}${livello ? ` (${livello})` : ''}`);
  }
  return parti.join('\n');
}
