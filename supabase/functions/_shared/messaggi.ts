import { dataOraItaliana, linkGoogleCalendar } from './calendario.ts';

/** Riga restituita da api.invio_messaggi_dovuti(). */
export interface MessaggioDovuto {
  id: string;
  tipo: 'conferma' | 'promemoria';
  giorni_prima: number;
  tentativi: number;
  telefono: string;
  nome_genitore: string;
  studio_nome: string;
  studio_indirizzo: string;
  studio_telefono: string | null;
  inizio: string;
  fine: string;
}

/** Nomi dei template da far approvare su Meta (categoria "Utility", lingua italiano). */
export const TEMPLATE = {
  conferma: 'pls_conferma_appuntamento',
  promemoria: 'pls_promemoria_controllo',
} as const;

/** Numero in formato internazionale senza "+" e spazi, come lo vuole WhatsApp. */
export function numeroWhatsApp(telefono: string): string | null {
  let cifre = telefono.replace(/[^\d+]/g, '');
  if (cifre.startsWith('+')) cifre = cifre.slice(1);
  else if (cifre.startsWith('00')) cifre = cifre.slice(2);
  else if (cifre.startsWith('3') && cifre.length === 10) cifre = `39${cifre}`; // cellulare italiano senza prefisso
  return /^\d{8,15}$/.test(cifre) ? cifre : null;
}

/**
 * Corpo della richiesta a WhatsApp Cloud API per un messaggio template.
 * I parametri seguono l'ordine delle variabili {{1}}, {{2}}… dei template (vedi docs/whatsapp.md).
 */
export function corpoTemplate(m: MessaggioDovuto, destinatario: string) {
  const inizio = new Date(m.inizio);
  const { data, ora } = dataOraItaliana(inizio);
  const link = linkGoogleCalendar({
    titolo: `Appuntamento pediatrico - ${m.studio_nome}`,
    inizio,
    fine: new Date(m.fine),
    luogo: m.studio_indirizzo,
    dettagli: `Per disdire o spostare: ${m.studio_telefono ?? 'contattare lo studio'}`,
  });
  const telefonoStudio = m.studio_telefono ?? 'lo studio';
  const parametri = [m.nome_genitore, m.studio_nome, data, ora, m.studio_indirizzo, link, telefonoStudio];
  return {
    messaging_product: 'whatsapp',
    to: destinatario,
    type: 'template',
    template: {
      name: TEMPLATE[m.tipo],
      language: { code: 'it' },
      components: [{ type: 'body', parameters: parametri.map((text) => ({ type: 'text', text })) }],
    },
  };
}
