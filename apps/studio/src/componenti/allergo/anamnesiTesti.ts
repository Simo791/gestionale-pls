/**
 * Anamnesi guidata: scelte dai menu → testo del referto (nello stile delle lettere
 * dell'ambulatorio). Le scelte si salvano in allergo_cartelle.anamnesi_scelte, il testo
 * nelle colonne abitazione, fumo_dettaglio, alimentazione, farmaci, sport, sonno.
 */
export const LUOGHI_ABITAZIONE = ['in città', 'in paese', 'in campagna', 'in periferia', 'circondata da verde', 'vicino al mare',
  'in montagna', 'vicino a strade trafficate', 'vicino a zone industriali'] as const;
export const UMIDITA = ['Asciutta', 'Apparentemente asciutta', 'Umida', 'Umida, con muffe visibili'] as const;
export const FUMATORI = ['Madre', 'Padre', 'Entrambi i genitori', 'Nonni', 'Altri conviventi'] as const;
export const REAZIONI_ALIMENTI = ['prurito al cavo orale', 'orticaria', 'angioedema', 'vomito / dolori addominali', 'peggioramento della dermatite',
  'rinite / congiuntivite', 'broncospasmo', 'anafilassi', 'altro'] as const;
export const REAZIONI_FARMACI = ['esantema', 'orticaria', 'angioedema', 'broncospasmo', 'anafilassi', 'reazione ritardata', 'altro'] as const;
export const SINTOMI_SFORZO = ['tosse', 'affanno', 'sibilo', 'dolore / costrizione toracica', 'ridotta tolleranza allo sforzo'] as const;
export const VOCI_SONNO = ['Sonno tranquillo', 'Roncopatia', 'Respirazione orale vicariante', 'Apnee notturne', 'Risvegli notturni per tosse'] as const;

export interface Reazione { sostanza: string; tipo: string; quando: string }

export interface Scelte {
  abitazione?: { luoghi: string[]; umidita: string; note: string };
  fumo?: { esposto: 'si' | 'no' | ''; chi: string[]; ecig: boolean; note: string };
  alimenti?: { reazioni: 'si' | 'no' | ''; voci: Reazione[]; note: string };
  farmaci?: { reazioni: 'si' | 'no' | ''; voci: Reazione[]; note: string };
  sport?: { pratica: 'si' | 'no' | ''; quale: string; sintomi: 'si' | 'no' | ''; quali: string[]; note: string };
  sonno?: { voci: string[]; note: string };
}

export interface TestiAnamnesi {
  abitazione: string; fumo_dettaglio: string; alimentazione: string; farmaci: string; sport: string; sonno: string;
}

const maiuscola = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);
const frase = (parti: (string | false | null | undefined)[]) =>
  parti.filter((x): x is string => !!x && !!x.trim()).map((x) => maiuscola(x.trim().replace(/\.$/, ''))).join('. ') ;
const conPunto = (t: string) => (t && !/[.!?]$/.test(t) ? `${t}.` : t);

function elencoReazioni(voci: Reazione[]): string {
  return voci.filter((v) => v.sostanza.trim()).map((v) => {
    const dett = [v.tipo, v.quando.trim()].filter(Boolean).join(', ');
    return `${v.sostanza.trim()}${dett ? ` (${dett})` : ''}`;
  }).join('; ');
}

export function testiDaScelte(s: Scelte): TestiAnamnesi {
  const a = s.abitazione;
  const abitazione = a ? conPunto(frase([a.luoghi.join(', '), a.umidita, a.note])) : '';

  const f = s.fumo;
  let fumo = '';
  if (f) {
    if (f.esposto === 'no') fumo = frase(['NO', f.note]);
    else if (f.esposto === 'si') {
      const chi = f.chi.includes('Entrambi i genitori')
        ? ['padre e madre', ...f.chi.filter((x) => x !== 'Entrambi i genitori' && x !== 'Madre' && x !== 'Padre').map((x) => x.toLowerCase())]
        : f.chi.map((x) => x.toLowerCase());
      fumo = `SÌ${chi.length ? ` (${chi.join(', ')})` : ''}${f.ecig ? ', anche sigarette elettroniche' : ''}`;
      if (f.note.trim()) fumo = `${fumo}. ${maiuscola(f.note.trim())}`;
    } else fumo = f.note.trim();
  }

  const reaz = (r: Scelte['alimenti'], mai: string) => {
    if (!r) return '';
    if (r.reazioni === 'no') return conPunto(frase([mai, r.note]));
    if (r.reazioni === 'si') {
      const el = elencoReazioni(r.voci);
      return conPunto(frase([el ? `Reazione avversa a: ${el}` : 'Reazione avversa (da specificare)', r.note]));
    }
    return r.note.trim();
  };
  const alimentazione = reaz(s.alimenti, 'Mai reazioni avverse ad alimenti');
  const farmaci = reaz(s.farmaci, 'Ben tollerati i farmaci finora assunti');

  const sp = s.sport;
  let sport = '';
  if (sp) {
    const sintomi = sp.sintomi === 'si'
      ? `sintomi da sforzo: ${sp.quali.length ? sp.quali.join(', ') : 'da specificare'}`
      : sp.sintomi === 'no' ? 'senza sintomi da sforzo' : '';
    if (sp.pratica === 'si') sport = `Pratica ${sp.quale.trim() || 'attività sportiva'}${sintomi ? (sp.sintomi === 'si' ? `; ${sintomi}` : ` ${sintomi}`) : ''}`;
    else if (sp.pratica === 'no') sport = `Non pratica sport${sp.sintomi === 'si' ? `; ${sintomi}` : ''}`;
    sport = conPunto(frase([sport, sp.note]));
  }

  const so = s.sonno;
  const sonno = so ? conPunto(frase([so.voci.map((v, i) => (i ? v.toLowerCase() : v)).join(', '), so.note])) : '';

  return { abitazione, fumo_dettaglio: fumo, alimentazione, farmaci, sport, sonno };
}

/** Scelte iniziali: quelle salvate, oppure il testo già presente come nota (dati precedenti). */
export function scelteIniziali(salvate: Scelte | null | undefined, testi: Partial<Record<keyof TestiAnamnesi, string | null>>): Scelte {
  const s = salvate ?? {};
  return {
    abitazione: s.abitazione ?? { luoghi: [], umidita: '', note: testi.abitazione ?? '' },
    fumo: s.fumo ?? { esposto: '', chi: [], ecig: false, note: testi.fumo_dettaglio ?? '' },
    alimenti: s.alimenti ?? { reazioni: '', voci: [], note: testi.alimentazione ?? '' },
    farmaci: s.farmaci ?? { reazioni: '', voci: [], note: testi.farmaci ?? '' },
    sport: s.sport ?? { pratica: '', quale: '', sintomi: '', quali: [], note: testi.sport ?? '' },
    sonno: s.sonno ?? { voci: [], note: testi.sonno ?? '' },
  };
}
