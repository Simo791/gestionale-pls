/**
 * Lettura di file CSV esportati da Excel (separatore ";" o ",", campi tra
 * virgolette, virgolette raddoppiate, a capo dentro i campi, BOM iniziale).
 * Serve all'importazione del catalogo regionale delle prestazioni.
 */
export function leggiCsv(testo: string): string[][] {
  const t = testo.replace(/^﻿/, '');
  const primaRiga = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primaRiga.match(/;/g)?.length ?? 0) >= (primaRiga.match(/,/g)?.length ?? 0) ? ';' : ',';
  const righe: string[][] = [];
  let riga: string[] = [];
  let campo = '';
  let tra = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (tra) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else tra = false;
      } else campo += c;
    } else if (c === '"') tra = true;
    else if (c === sep) { riga.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      riga.push(campo); campo = '';
      if (riga.some((x) => x.trim() !== '')) righe.push(riga);
      riga = [];
    } else campo += c;
  }
  riga.push(campo);
  if (riga.some((x) => x.trim() !== '')) righe.push(riga);
  return righe;
}

export type CampoCatalogo = 'codice_regionale' | 'codice_nazionale' | 'descrizione' | 'branca' | 'nota_erogabilita';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Propone a quale colonna corrisponde ciascun campo, leggendo le intestazioni
 * (es. "Cod Reg", "Codice SSN", "Descrizione Regione", "Branca1", "Nota Erogabilità").
 * Restituisce l'indice di colonna o -1; l'utente può sempre correggere.
 */
export function proponiColonne(intestazioni: string[]): Record<CampoCatalogo, number> {
  const h = intestazioni.map(norm);
  const trova = (prova: (x: string) => boolean, esclusi: number[] = []) =>
    h.findIndex((x, i) => !esclusi.includes(i) && prova(x));
  const reg = trova((x) => /\bcod/.test(x) && /\breg/.test(x));
  const naz = trova((x) => /\bcod/.test(x) && /(ssn|naz|dm|lea|nomencl)/.test(x), [reg]);
  const descr = (() => {
    const preferita = trova((x) => /descr/.test(x) && /reg/.test(x));
    return preferita >= 0 ? preferita : trova((x) => /descr/.test(x));
  })();
  return {
    codice_regionale: reg >= 0 ? reg : trova((x) => /^cod/.test(x), [naz]),
    codice_nazionale: naz,
    descrizione: descr,
    branca: trova((x) => /branca/.test(x)),
    nota_erogabilita: trova((x) => /nota/.test(x)),
  };
}
