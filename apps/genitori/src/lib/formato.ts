import type { FinalitaConsenso, StatoConsenso, TipoAppuntamento, TipoVisita } from '@pls/shared';

export const TIPO_APPUNTAMENTO: Record<TipoAppuntamento, string> = {
  visita: 'Visita', bilancio_salute: 'Bilancio di salute', vaccino: 'Vaccinazione', urgenza: 'Urgenza', certificato: 'Certificato',
};
export const TIPO_VISITA: Record<TipoVisita, string> = {
  ambulatoriale: 'Visita ambulatoriale', urgenza: 'Urgenza', bilancio_salute: 'Bilancio di salute', controllo: 'Controllo', domiciliare: 'Visita domiciliare',
};
export const STATO_APPUNTAMENTO: Record<string, string> = {
  richiesto: 'In attesa di conferma', confermato: 'Confermato', annullato: 'Annullato', svolto: 'Svolto', non_presentato: 'Non presentato',
};
export const FINALITA: Record<FinalitaConsenso, string> = {
  dati_sanitari: 'Dati sanitari', portale: 'Portale genitori', comunicazioni: 'Comunicazioni dello studio',
  condivisione_altro_genitore: 'Condivisione con l’altro genitore', whatsapp: 'Promemoria WhatsApp',
};
export const STATO_CONSENSO: Record<StatoConsenso, { testo: string; classe: string }> = {
  concesso: { testo: 'Dato', classe: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  negato: { testo: 'Negato', classe: 'bg-slate-100 text-slate-700 ring-slate-200' },
  revocato: { testo: 'Revocato', classe: 'bg-slate-100 text-slate-700 ring-slate-200' },
  da_rinnovare: { testo: 'Da rinnovare', classe: 'bg-amber-50 text-amber-900 ring-amber-200' },
};
export const TIPO_CERTIFICATO: Record<string, string> = {
  dieta_speciale: 'Certificato dieta speciale (scuola / mensa)', dieta_esclusione: 'Dieta di esclusione', generico: 'Certificato',
};
export const PRIORITA: Record<string, string> = {
  U: 'Urgente, entro 72 ore', B: 'Breve, entro 10 giorni', D: 'Differibile, entro 30 giorni (visite) o 60 giorni (accertamenti)', P: 'Programmata, entro 120 giorni',
};

export const dataOra = (iso: string) => new Date(iso).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
export const giorno = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('it-IT', { dateStyle: 'medium' });
/** Data di oggi nel fuso locale (toISOString darebbe il giorno UTC). */
export const oggiISO = () => new Date().toLocaleDateString('sv-SE');
