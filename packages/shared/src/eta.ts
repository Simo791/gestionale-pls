import type { ISODate } from './tipi';

const GIORNO_MS = 86_400_000;

/** Converte 'YYYY-MM-DD' in millisecondi UTC, senza effetti del fuso orario locale. */
function utc(data: ISODate): number {
  const [a, m, g] = data.split('-').map(Number);
  if (!a || !m || !g) throw new Error(`Data non valida: ${data}`);
  return Date.UTC(a, m - 1, g);
}

/**
 * Età in giorni alla data della misurazione. La calcola il frontend (che conosce la
 * data di nascita) così lo schema clinica conserva l'età e non la data di nascita.
 */
export function etaInGiorni(dataNascita: ISODate, dataMisurazione: ISODate): number {
  const giorni = Math.round((utc(dataMisurazione) - utc(dataNascita)) / GIORNO_MS);
  if (giorni < 0) throw new Error('La misurazione non può precedere la nascita');
  return giorni;
}

/** Età leggibile per l'interfaccia: "3 mesi", "2 anni e 4 mesi". */
export function etaLeggibile(dataNascita: ISODate, oggi: ISODate): string {
  // Stesso calcolo di etaEstesa (fine mese e anni bisestili): portale e studio mostrano la stessa età.
  const { anni: a, mesi: m } = etaComponenti(dataNascita, oggi);
  const mesi = a * 12 + m;
  if (mesi < 1) return `${etaInGiorni(dataNascita, oggi)} giorni`;
  if (mesi < 24) return mesi === 1 ? '1 mese' : `${mesi} mesi`;
  const anni = Math.floor(mesi / 12);
  const resto = mesi % 12;
  if (resto === 0) return `${anni} anni`;
  return `${anni} anni e ${resto} ${resto === 1 ? 'mese' : 'mesi'}`;
}

/** Età leggibile a partire dai giorni di vita (usata per le misurazioni in cartella). */
export function etaDaGiorni(giorni: number): string {
  if (giorni < 0) throw new Error('Età negativa');
  if (giorni < 60) return giorni === 1 ? '1 giorno' : `${giorni} giorni`;
  const mesi = Math.floor(giorni / 30.4375);
  if (mesi < 24) return `${mesi} mesi`;
  const anni = Math.floor(mesi / 12);
  const resto = mesi % 12;
  if (resto === 0) return `${anni} anni`;
  return `${anni} anni e ${resto} ${resto === 1 ? 'mese' : 'mesi'}`;
}

/** Aggiunge mesi a una data; se il giorno non esiste (es. 31 febbraio) usa l'ultimo del mese. */
function piuMesiUtc(data: ISODate, mesi: number): number {
  const [a, m, g] = data.split('-').map(Number) as [number, number, number];
  const ultimo = new Date(Date.UTC(a, m - 1 + mesi + 1, 0)).getUTCDate();
  return Date.UTC(a, m - 1 + mesi, Math.min(g, ultimo));
}

/** Età in anni, mesi e giorni compiuti (calendario). */
export function etaComponenti(dataNascita: ISODate, oggi: ISODate): { anni: number; mesi: number; giorni: number } {
  const fine = utc(oggi);
  if (fine < utc(dataNascita)) throw new Error('Data di nascita futura');
  let totaleMesi = 0;
  while (piuMesiUtc(dataNascita, totaleMesi + 1) <= fine) totaleMesi++;
  const giorni = Math.round((fine - piuMesiUtc(dataNascita, totaleMesi)) / GIORNO_MS);
  return { anni: Math.floor(totaleMesi / 12), mesi: totaleMesi % 12, giorni };
}

/** Età estesa: "2 anni, 4 mesi e 12 giorni" (le parti a zero si omettono). */
export function etaEstesa(dataNascita: ISODate, oggi: ISODate): string {
  const { anni, mesi, giorni } = etaComponenti(dataNascita, oggi);
  const parti = [
    anni ? `${anni} ${anni === 1 ? 'anno' : 'anni'}` : '',
    mesi ? `${mesi} ${mesi === 1 ? 'mese' : 'mesi'}` : '',
    giorni || (!anni && !mesi) ? `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}` : '',
  ].filter(Boolean);
  return parti.length > 1 ? `${parti.slice(0, -1).join(', ')} e ${parti[parti.length - 1]}` : parti[0]!;
}
