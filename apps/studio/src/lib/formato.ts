import type { FinalitaConsenso, PrioritaPrescrizione, StatoAppuntamento, StatoConsenso, TipoAppuntamento, TipoRelazione, TipoVisita } from '@pls/shared';
import type { Tono } from '../componenti/ui';

const FUSO = 'Europe/Rome';

export const fmtData = (d: string | Date) =>
  new Date(d).toLocaleDateString('it-IT', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });

export const fmtOra = (d: string | Date) =>
  new Date(d).toLocaleTimeString('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });

export const fmtDataOra = (d: string | Date) => `${fmtData(d)} ${fmtOra(d)}`;

export const fmtGiornoLungo = (d: Date) =>
  d.toLocaleDateString('it-IT', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** 'YYYY-MM-DD' di una data, nel fuso dell'utente. */
export const isoGiorno = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Una data ISO senza ora ('2026-10-02') formattata senza slittamenti di fuso. */
export const fmtGiornoIso = (iso: string) => {
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
};

export const oggiIso = () => isoGiorno(new Date());

export const ETICHETTA_TIPO: Record<TipoAppuntamento, string> = {
  visita: 'Visita',
  bilancio_salute: 'Bilancio di salute',
  vaccino: 'Vaccinazione',
  urgenza: 'Urgenza',
  certificato: 'Certificato',
};

export const STATO_APPUNTAMENTO: Record<StatoAppuntamento, { testo: string; tono: Tono }> = {
  richiesto: { testo: 'Da confermare', tono: 'attenzione' },
  confermato: { testo: 'Confermato', tono: 'info' },
  svolto: { testo: 'Svolto', tono: 'ok' },
  non_presentato: { testo: 'Non presentato', tono: 'errore' },
  annullato: { testo: 'Annullato', tono: 'neutro' },
};

export const ETICHETTA_FINALITA: Record<FinalitaConsenso, string> = {
  dati_sanitari: 'Dati sanitari',
  portale: 'Portale genitori',
  comunicazioni: 'Comunicazioni',
  condivisione_altro_genitore: 'Condivisione con l’altro genitore',
  whatsapp: 'WhatsApp',
};

export const STATO_CONSENSO: Record<StatoConsenso, { testo: string; tono: Tono }> = {
  concesso: { testo: 'Concesso', tono: 'ok' },
  negato: { testo: 'Negato', tono: 'errore' },
  revocato: { testo: 'Revocato', tono: 'errore' },
  da_rinnovare: { testo: 'Da rinnovare', tono: 'attenzione' },
};

export const ETICHETTA_RELAZIONE: Record<TipoRelazione, string> = {
  madre: 'Madre',
  padre: 'Padre',
  tutore_legale: 'Tutore legale',
  affidatario: 'Affidatario',
};

const AZIONI: Record<string, string> = {
  INSERT: 'Inserimento',
  UPDATE: 'Modifica',
  DELETE: 'Cancellazione',
  APERTURA_CARTELLA: 'Apertura cartella',
  LETTURA_CODICE_FISCALE: 'Lettura codice fiscale',
  COLLEGAMENTO_TUTORE: 'Collegamento account genitore',
  IMPORTA_CATALOGO_PRESTAZIONI: 'Importazione catalogo prestazioni',
};
export const etichettaAzione = (a: string) => AZIONI[a] ?? a;

const TABELLE: Record<string, string> = {
  'anagrafica.pazienti': 'Anagrafica bambino',
  'anagrafica.tutori': 'Anagrafica genitore',
  'anagrafica.relazioni_tutela': 'Relazione di tutela',
  'anagrafica.consensi': 'Consenso',
  'anagrafica.appuntamenti': 'Appuntamento',
  'clinica.cartelle': 'Cartella clinica',
  'clinica.visite': 'Visita',
  'clinica.misurazioni': 'Misurazione',
  'clinica.vaccinazioni': 'Vaccinazione',
  'clinica.allergie': 'Allergia',
  'clinica.controlli_eseguiti': 'Controllo / screening',
  'clinica.patologie_paziente': 'Patologia',
  'clinica.prescrizioni': 'Prescrizione',
  'anagrafica.pediatri': 'Profilo del medico',
  'anagrafica.studi': 'Dati dello studio',
  'anagrafica.catalogo_prestazioni': 'Catalogo prestazioni',
};

export const ETICHETTA_TIPO_VISITA: Record<TipoVisita, string> = {
  ambulatoriale: 'Visita ambulatoriale',
  urgenza: 'Urgenza',
  bilancio_salute: 'Bilancio di salute',
  controllo: 'Controllo',
  domiciliare: 'Visita domiciliare',
};

/** Classi di priorità della ricetta (Piano nazionale di governo delle liste d'attesa 2019-2021). */
export const PRIORITA: Record<PrioritaPrescrizione, string> = {
  U: 'U · Urgente, entro 72 ore',
  B: 'B · Breve, entro 10 giorni',
  D: 'D · Differibile, entro 30 giorni (visite) o 60 giorni (accertamenti)',
  P: 'P · Programmata, entro 120 giorni',
};
export const etichettaTabella = (t: string | null) => (t ? (TABELLE[t] ?? t) : '—');

export const etichettaRuolo = (r: string) =>
  ({ pediatra: 'Pediatra', segreteria: 'Segreteria', sostituto: 'Sostituto', tutore: 'Genitore', nessuno: 'Sistema' })[r] ?? r;
