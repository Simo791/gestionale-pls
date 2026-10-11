import {
  classificaPeso, giorniTra, misuraPerVelocita, rapportoVitaAltezza, sdsMisura, targetGenetico, variazioneSdsAnno,
  velocitaCrescita, GIORNI_PER_MESE, type ClassificazionePeso, type ISODate, type RigaAllergo, type Sds, type Sesso,
  type TargetGenetico, type Velocita,
} from '@pls/shared';

/** Riga di clinica.auxo_misure come arriva dal database. */
export type RigaMisura = RigaAllergo;

const num = (x: unknown): number | null => (x == null || x === '' ? null : Number(x));
export const dataDi = (r: RigaAllergo) => String(r.data).slice(0, 10) as ISODate;

export interface MisuraAnalizzata {
  riga: RigaMisura;
  data: ISODate;
  /** Età in mesi (giorni / 30,4375). */
  mesi: number;
  /** Età in anni decimali (giorni / 365,25), come la scrive il database. */
  anni: number;
  altezza: number | null;
  sdraiato: boolean | undefined;
  peso: number | null;
  bmi: number | null;
  cc: number | null;
  sdsAltezza: Sds | null;
  sdsPeso: Sds | null;
  sdsBmi: Sds | null;
  sdsCc: Sds | null;
  /** Classificazione del peso (Consensus SIEDP-SIP 2018, curve OMS). */
  classePeso: ClassificazionePeso | null;
  velocita: Velocita | null;
  /** DS di velocità inserita dal medico (da tabelle). */
  velocitaSds: number | null;
  /** Variazione del DS staturale per anno rispetto alla misura usata per la velocità (stessa curva). */
  deltaSdsAnno: number | null;
  vitaAltezza: number | null;
  sedutoAltezza: number | null;
  /** Apertura delle braccia − statura (cm). */
  bracciaMenoStatura: number | null;
}

/**
 * Analizza le misure di un paziente: DS e percentili (Cacciari dai 2 anni, OMS prima e per la
 * circonferenza cranica), classificazione del peso (OMS, consensus italiana), velocità di crescita
 * e variazione del DS rispetto a una misura di almeno 6 mesi prima (la più vicina a un anno).
 * Ordinate dalla più recente.
 */
export function analizzaMisure(nascita: ISODate, sesso: Sesso, righe: readonly RigaMisura[]): MisuraAnalizzata[] {
  const base = righe
    .map((r) => {
      const data = dataDi(r);
      const giorni = giorniTra(nascita, data);
      const mesi = giorni / GIORNI_PER_MESE;
      const altezza = num(r.altezza_cm);
      const peso = num(r.peso_kg);
      const bmi = num(r.bmi);
      const cc = num(r.cc_cm);
      const sdraiato = r.posizione == null ? undefined : r.posizione === 'sdraiato';
      return {
        riga: r, data, mesi, anni: giorni / 365.25, altezza, sdraiato, peso, bmi, cc,
        sdsAltezza: altezza ? sdsMisura('altezza', sesso, mesi, altezza, undefined, { sdraiato }) : null,
        sdsPeso: peso ? sdsMisura('peso', sesso, mesi, peso) : null,
        sdsBmi: bmi ? sdsMisura('bmi', sesso, mesi, bmi) : null,
        sdsCc: cc ? sdsMisura('circonferenza_cranica', sesso, mesi, cc) : null,
        classePeso: peso && altezza ? classificaPeso(sesso, mesi, peso, altezza, sdraiato) : null,
        velocitaSds: num(r.velocita_sds),
        vitaAltezza: num(r.vita_cm) && altezza ? rapportoVitaAltezza(num(r.vita_cm)!, altezza) : null,
        sedutoAltezza: num(r.altezza_seduto_cm) && altezza ? num(r.altezza_seduto_cm)! / altezza : null,
        bracciaMenoStatura: num(r.apertura_braccia_cm) && altezza ? num(r.apertura_braccia_cm)! - altezza : null,
        velocita: null as Velocita | null,
        deltaSdsAnno: null as number | null,
      };
    })
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

  const conAltezza = base.filter((m) => m.altezza != null).map((m) => ({ ...m, altezza_cm: m.altezza! }));
  for (const m of base) {
    if (m.altezza == null) continue;
    const attuale = conAltezza.find((x) => x.riga.id === m.riga.id)!;
    const prec = misuraPerVelocita(conAltezza.filter((x) => x.data < m.data), attuale);
    if (!prec) continue;
    m.velocita = velocitaCrescita(prec, attuale);
    if (m.sdsAltezza && prec.sdsAltezza && m.sdsAltezza.riferimento === prec.sdsAltezza.riferimento) {
      m.deltaSdsAnno = variazioneSdsAnno(prec.sdsAltezza.z, prec.data, m.sdsAltezza.z, m.data);
    }
  }
  return base;
}

/** Ultima misura con statura (le misure sono ordinate dalla più recente). */
export const ultimaStatura = (m: readonly MisuraAnalizzata[]) => m.find((x) => x.altezza != null) ?? null;

export function targetDaCartella(cartella: Record<string, unknown> | null, sesso: Sesso): TargetGenetico | null {
  const padre = num(cartella?.altezza_padre_cm);
  const madre = num(cartella?.altezza_madre_cm);
  return padre && madre ? targetGenetico(padre, madre, sesso) : null;
}

/** Numero con virgola e decimali fissi. */
export const n = (x: number | null | undefined, decimali = 1) =>
  x == null || !Number.isFinite(x) ? '—' : x.toFixed(decimali).replace('.', ',');
