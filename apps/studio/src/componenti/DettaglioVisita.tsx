import { fmtPercentile, percentileMisura, type Misurazione, type Sesso, type Visita } from '@pls/shared';
import type { ReactNode } from 'react';
import { ETICHETTA_TIPO_VISITA, fmtDataOra, fmtGiornoIso } from '../lib/formato';
import { etichettePresenti } from './Accompagnatori';
import { Bottone } from './ui';
import { parametriVitali } from './VisitaOdierna';

const Riga = ({ t, v }: { t: string; v: ReactNode }) =>
  v ? <div className="grid gap-1 py-1.5 sm:grid-cols-[11rem_1fr]"><dt className="text-slate-500">{t}</dt><dd className="whitespace-pre-line text-slate-800">{v}</dd></div> : null;

/** Tutti i dati di una visita registrata, con le misure prese in quell'occasione. */
export default function DettaglioVisita({ v, misura, sesso, descrizioni, nomiPresenti, onReferto, onInvia }: {
  v: Visita; misura: Misurazione | null; sesso: Sesso; descrizioni: Map<string, string>; nomiPresenti: Map<string, string>; onReferto: () => void;
  /** Invio dei documenti della visita al genitore (solo per chi può farlo). */
  onInvia?: () => void;
}) {
  const perc = (ind: 'peso' | 'altezza' | 'circonferenza_cranica', x: number | null) =>
    misura && x !== null ? `${x} (percentile ${fmtPercentile(percentileMisura(ind, sesso, misura.eta_giorni, x))})` : null;
  return (
    <div className="space-y-3 text-sm">
      <dl className="divide-y divide-slate-100">
        <Riga t="Data" v={fmtDataOra(v.data)} />
        <Riga t="Tipo" v={ETICHETTA_TIPO_VISITA[v.tipo] ?? v.tipo} />
        <Riga t="Presenti" v={etichettePresenti(v.accompagnatori, nomiPresenti)} />
        <Riga t="Motivo" v={v.motivo} />
        <Riga t="Anamnesi" v={v.anamnesi} />
        <Riga t="Peso (kg)" v={misura && perc('peso', misura.peso_kg)} />
        <Riga t="Lunghezza/altezza (cm)" v={misura && perc('altezza', misura.altezza_cm)} />
        <Riga t="Circonferenza cranica (cm)" v={misura && perc('circonferenza_cranica', misura.circonferenza_cranica_cm)} />
        <Riga t="Parametri vitali" v={parametriVitali(v)} />
        <Riga t="Esame obiettivo" v={v.esame_obiettivo} />
        <Riga t="Diagnosi" v={v.diagnosi_icd9cm.map((c) => `${c}${descrizioni.get(c) ? ` · ${descrizioni.get(c)}` : ''}`).join('\n')} />
        <Riga t="Terapia" v={v.terapia} />
        <Riga t="Indicazioni ai genitori" v={v.indicazioni_genitori} />
        <Riga t="Prossimo controllo" v={v.prossimo_controllo && fmtGiornoIso(v.prossimo_controllo)} />
      </dl>
      <Bottone variante="primario" onClick={onReferto}>Referto PDF</Bottone>
      {onInvia && <Bottone onClick={onInvia}>Invia ai genitori (email / WhatsApp)</Bottone>}
    </div>
  );
}
