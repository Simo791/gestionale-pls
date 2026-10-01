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
}

export interface Pediatra {
  id: UUID;
  studio_id: UUID;
  nome: string;
  cognome: string;
  codice_regionale: string;
  email: string;
  massimale_assistiti: number;
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
}

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
