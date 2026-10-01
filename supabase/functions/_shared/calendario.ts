/**
 * Link "Aggiungi a Google Calendar" per il genitore: apre il suo calendario con
 * l'evento già compilato. Nessun dato sanitario e nessun nome del bambino nel testo.
 */
export interface EventoCalendario {
  titolo: string;
  inizio: Date;
  fine: Date;
  luogo?: string;
  dettagli?: string;
}

const formatoUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function linkGoogleCalendar(e: EventoCalendario): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.titolo,
    dates: `${formatoUtc(e.inizio)}/${formatoUtc(e.fine)}`,
    ctz: 'Europe/Rome',
  });
  if (e.luogo) p.set('location', e.luogo);
  if (e.dettagli) p.set('details', e.dettagli);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Data e ora in italiano, sempre nel fuso di Roma (le Edge Functions girano in UTC). */
export function dataOraItaliana(d: Date): { data: string; ora: string } {
  return {
    data: d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }),
    ora: d.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }),
  };
}
