// Tipi del dominio, allineati alle migrazioni in supabase/migrations.
// In Fase 1 verranno affiancati dai tipi generati con `supabase gen types typescript`.

export type UUID = string;
/** Pseudonimo della cartella clinica: un tipo distinto per non confonderlo con l'id del paziente. */
export type PseudoId = string & { readonly __brand: 'PseudoId' };
export type ISODate = string;      // '2026-10-01'
export type ISODateTime = string;  // '2026-10-01T09:30:00Z'

export type RuoloApp = 'pediatra' | 'segreteria' | 'sostituto' | 'tutore' | 'nessuno';
export type Sesso = 'M' | 'F';

// ---------- schema anagrafica ----------
export interface Studio {
  id: UUID;
  nome: string;
  asl: string;
  indirizzo: string;
  telefono: string | null;
  email: string | null;
  pec: string | null;
}

export interface Pediatra {
  id: UUID;
  studio_id: UUID;
  nome: string;
  cognome: string;
  codice_regionale: string;
  email: string;
  massimale_assistiti: number;
  titolo: string;
  specializzazione: string;
  ordine_provincia: string | null;
  ordine_numero: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  telefono: string | null;
  pec: string | null;
}

export interface Paziente {
  id: UUID;
  studio_id: UUID;
  pediatra_id: UUID;
  nome: string;
  cognome: string;
  data_nascita: ISODate;
  sesso: Sesso;
  data_scelta_pediatra: ISODate;
  stato: 'attivo' | 'revocato' | 'maggiorenne';
}

export interface Tutore {
  id: UUID;
  studio_id: UUID;
  utente_id: UUID | null;
  nome: string;
  cognome: string;
  email: string;
  telefono: string | null;
}

export type TipoRelazione = 'madre' | 'padre' | 'tutore_legale' | 'affidatario';

export interface RelazioneTutela {
  paziente_id: UUID;
  tutore_id: UUID;
  tipo: TipoRelazione;
  responsabilita_genitoriale: boolean;
  limitazioni: string | null;
  valida_dal: ISODate;
  valida_al: ISODate | null;
}

export type FinalitaConsenso =
  | 'dati_sanitari'
  | 'portale'
  | 'comunicazioni'
  | 'condivisione_altro_genitore'
  | 'whatsapp';

export type StatoConsenso = 'concesso' | 'negato' | 'revocato' | 'da_rinnovare';

export interface Consenso {
  id: UUID;
  paziente_id: UUID;
  tutore_id: UUID;
  finalita: FinalitaConsenso;
  versione_informativa: string;
  stato: StatoConsenso;
  canale: 'portale' | 'cartaceo_studio';
  registrato_il: ISODateTime;
}

export type TipoAppuntamento = 'visita' | 'bilancio_salute' | 'vaccino' | 'urgenza' | 'certificato';
export type StatoAppuntamento = 'richiesto' | 'confermato' | 'annullato' | 'svolto' | 'non_presentato';

export interface Appuntamento {
  id: UUID;
  studio_id: UUID;
  pediatra_id: UUID;
  paziente_id: UUID;
  prenotato_da: UUID;
  inizio: ISODateTime;
  fine: ISODateTime;
  tipo: TipoAppuntamento;
  stato: StatoAppuntamento;
  note_segreteria: string | null;
}

// ---------- schema clinica (nessun dato identificativo) ----------
export interface CartellaClinica {
  pseudo_id: PseudoId;
  sesso: Sesso;
  gruppo_sanguigno: string | null;
  allergie: string[];
  patologie_croniche: string[];
  note_anamnesi: string | null;
  fattori_rischio: string[];
  aggiornata_il: ISODateTime;
}

export interface Visita {
  id: UUID;
  pseudo_id: PseudoId;
  pediatra_id: UUID;
  appuntamento_id: UUID | null;
  data: ISODateTime;
  motivo: string;
  esame_obiettivo: string | null;
  diagnosi_icd9cm: string[];
  terapia: string | null;
  tipo: TipoVisita;
  anamnesi: string | null;
  temperatura_c: number | null;
  frequenza_cardiaca: number | null;
  frequenza_respiratoria: number | null;
  saturazione_o2: number | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  indicazioni_genitori: string | null;
  prossimo_controllo: ISODate | null;
}

export type TipoVisita = 'ambulatoriale' | 'urgenza' | 'bilancio_salute' | 'controllo' | 'domiciliare';

export interface Misurazione {
  id: UUID;
  pseudo_id: PseudoId;
  visita_id: UUID | null;
  eta_giorni: number;
  peso_kg: number | null;
  altezza_cm: number | null;
  circonferenza_cranica_cm: number | null;
  bmi: number | null;
  creato_il: ISODateTime;
}

export interface Vaccinazione {
  id: UUID;
  pseudo_id: PseudoId;
  vaccino: string;
  dose: number;
  data: ISODate;
  lotto: string | null;
  note: string | null;
}

// ---------- risultati delle RPC (schema api) ----------
export interface FiglioPortale {
  paziente_id: UUID;
  pseudo_id: PseudoId;
  nome: string;
  data_nascita: ISODate;
  sesso: Sesso;
}

export interface EsitoVerificaAudit {
  eventi_verificati: number;
  primo_evento_non_valido: number | null;
}

export interface BilancioInScadenza {
  paziente_id: UUID;
  nome: string;
  cognome: string;
  data_nascita: ISODate;
  eta_mesi: number;
  descrizione: string;
  data_prevista: ISODate;
  in_ritardo: boolean;
}

export interface ConsensoIncompleto {
  paziente_id: UUID;
  nome: string;
  cognome: string;
  finalita: 'dati_sanitari' | 'portale';
  stato: 'parziale' | 'assente';
  mancanti: string[];
}

export interface EventoAttivita {
  avvenuto_il: ISODateTime;
  ruolo: string;
  azione: string;
  tabella: string | null;
  paziente: string | null;
}

export interface ControlloCatalogo {
  codice: string;
  nome: string;
  descrizione: string;
  azione_pediatra: string;
  finestra_da_giorni: number;
  finestra_a_giorni: number;
  destinatari: 'tutti' | 'fattori_rischio';
  fonte: string;
  fonte_url: string;
  ordine: number;
}

export type EsitoControllo = 'nella_norma' | 'da_approfondire' | 'inviato_specialista' | 'non_eseguibile';

export interface ControlloEseguito {
  id: UUID;
  pseudo_id: PseudoId;
  codice_controllo: string;
  data: ISODate;
  esito: EsitoControllo;
  note: string | null;
}

export interface ControlloInScadenza {
  paziente_id: UUID;
  nome: string;
  cognome: string;
  codice: string;
  controllo: string;
  dal: ISODate;
  al: ISODate;
  scaduto: boolean;
}

export interface DoseCalendario {
  codice: string;
  vaccino: string;
  dose: number;
  eta_da_giorni: number;
  eta_a_giorni: number;
  obbligatoria: boolean;
  quando: string;
  note: string | null;
  ordine: number;
}

export type CategoriaAllergene = 'alimento' | 'farmaco' | 'inalante' | 'veleno' | 'contatto';

export interface Allergene {
  codice: string;
  nome: string;
  categoria: CategoriaAllergene;
  note: string | null;
  ordine: number;
}

export interface TestAllergologico {
  codice: string;
  nome: string;
  descrizione: string;
  quando: string;
  ordine: number;
}

export interface AllergiaPaziente {
  id: UUID;
  pseudo_id: PseudoId;
  allergene: string;
  dettaglio: string | null;
  reazione: string | null;
  gravita: 'lieve' | 'moderata' | 'grave' | 'anafilassi';
  stato: 'sospetta' | 'confermata' | 'risolta';
  test: string[];
  data_diagnosi: ISODate | null;
  note: string | null;
}

/** Scheda del catalogo malattie rare e patologie croniche (consultazione, non diagnosi). */
export interface Patologia {
  codice: string;
  nome: string;
  sinonimi: string[];
  tipo: 'rara' | 'cronica';
  area: string;
  esenzione: string | null;
  orpha: number | null;
  icd9cm: string[];
  descrizione: string;
  segni_allarme: string[];
  diagnosi: string;
  follow_up: string[];
  specialisti: string;
  emergenza: string | null;
  note: string | null;
  fonti: { titolo: string; url: string }[];
  ordine: number;
}

export interface PatologiaPaziente {
  id: UUID;
  pseudo_id: UUID;
  patologia: string;
  stato: 'sospetta' | 'confermata' | 'esclusa';
  data_diagnosi: string | null;
  esenzione_attiva: boolean;
  centro_riferimento: string | null;
  note: string | null;
  creato_il: string;
}

/** Prestazione del catalogo regionale importato dal file ufficiale. */
export interface Prestazione {
  id: UUID;
  studio_id: UUID;
  regione: string;
  codice_regionale: string;
  codice_nazionale: string | null;
  descrizione: string;
  branca: string | null;
  nota_erogabilita: string | null;
  attivo: boolean;
  versione: string;
  importato_il: ISODateTime;
}

export interface PrestazionePrescritta {
  codice_regionale: string;
  codice_nazionale: string | null;
  descrizione: string;
  branca: string | null;
  quantita: number;
}

export type PrioritaPrescrizione = 'U' | 'B' | 'D' | 'P';

/** Promemoria di prescrizione (da ricopiare nel software di ricetta elettronica). */
export interface Prescrizione {
  id: UUID;
  pseudo_id: PseudoId;
  visita_id: UUID | null;
  pediatra_id: UUID;
  data: ISODateTime;
  accesso: 'primo' | 'successivo';
  priorita: PrioritaPrescrizione | null;
  quesito: string;
  esenzione: string | null;
  prestazioni: PrestazionePrescritta[];
  note: string | null;
}

export interface MembroStudio {
  utente_id: UUID;
  studio_id: UUID;
  ruolo: 'pediatra' | 'segreteria' | 'sostituto';
  attivo: boolean;
  amministratore: boolean;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  creato_il: ISODateTime;
}

export interface Sostituzione {
  id: UUID;
  studio_id: UUID;
  titolare_id: UUID;
  sostituto_id: UUID;
  dal: ISODate;
  al: ISODate;
  consegne: string | null;
  creato_il: ISODateTime;
  revocata_il: ISODateTime | null;
}

export interface Notifica {
  id: UUID;
  tipo: string;
  titolo: string;
  testo: string | null;
  link: string | null;
  creato_il: ISODateTime;
  letta_il: ISODateTime | null;
}

export interface VoceStorico {
  id: number;
  operazione: 'INSERT' | 'UPDATE';
  campi: string[];
  prima: Record<string, unknown> | null;
  dopo: Record<string, unknown>;
  autore: UUID | null;
  avvenuto_il: ISODateTime;
}
