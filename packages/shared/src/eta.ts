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
  const [an, mn, gn] = dataNascita.split('-').map(Number);
  const [ao, mo, go] = oggi.split('-').map(Number);
  if (!an || !mn || !gn || !ao || !mo || !go) throw new Error('Data non valida');
  let mesi = (ao - an) * 12 + (mo - mn);
  if (go < gn) mesi -= 1;
  if (mesi < 0) throw new Error('Data di nascita futura');
  if (mesi < 1) return `${etaInGiorni(dataNascita, oggi)} giorni`;
  if (mesi < 24) return mesi === 1 ? '1 mese' : `${mesi} mesi`;
  const anni = Math.floor(mesi / 12);
  const resto = mesi % 12;
  if (resto === 0) return `${anni} anni`;
  return `${anni} anni e ${resto} ${resto === 1 ? 'mese' : 'mesi'}`;
}
