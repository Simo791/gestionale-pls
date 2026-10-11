import { useState, type ReactNode } from 'react';

export type Tono = 'neutro' | 'info' | 'ok' | 'attenzione' | 'errore';

const BADGE: Record<Tono, string> = {
  neutro: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  attenzione: 'bg-amber-50 text-amber-900 ring-amber-200',
  errore: 'bg-rose-50 text-rose-800 ring-rose-200',
};

export function Badge({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[tono]}`}>
      {children}
    </span>
  );
}

export function Pannello({
  titolo,
  sottotitolo,
  azione,
  children,
  className = '',
}: {
  titolo: string;
  sottotitolo?: string;
  azione?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-semibold text-slate-900">{titolo}</h2>
          {sottotitolo && <p className="text-xs text-slate-500">{sottotitolo}</p>}
        </div>
        {azione}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const KPI: Record<Tono, string> = {
  neutro: 'border-slate-200',
  info: 'border-sky-200',
  ok: 'border-emerald-200',
  attenzione: 'border-amber-300',
  errore: 'border-rose-300',
};

export function Kpi({
  etichetta,
  valore,
  nota,
  tono = 'neutro',
  href,
}: {
  etichetta: string;
  valore: string | number;
  nota?: string;
  tono?: Tono;
  href?: string;
}) {
  const contenuto = (
    <>
      <p className="text-sm text-slate-500">{etichetta}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{valore}</p>
      {nota && <p className="mt-1 text-xs text-slate-500">{nota}</p>}
    </>
  );
  const classi = `block rounded-xl border-l-4 border bg-white p-4 ${KPI[tono]}`;
  return href ? (
    <a href={href} className={`${classi} transition hover:shadow-sm`}>
      {contenuto}
    </a>
  ) : (
    <div className={classi}>{contenuto}</div>
  );
}

export const Caricamento = ({ righe = 3 }: { righe?: number }) => (
  <div className="space-y-2" aria-busy="true" aria-label="Caricamento">
    {Array.from({ length: righe }, (_, i) => (
      <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
    ))}
  </div>
);

export const Errore = ({ messaggio }: { messaggio: string }) => (
  <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
    {messaggio}
  </p>
);

export const Vuoto = ({ testo }: { testo: string }) => <p className="py-2 text-sm text-slate-500">{testo}</p>;

export function Bottone({
  children,
  onClick,
  variante = 'secondario',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: 'primario' | 'secondario' | 'pericolo';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const stile = {
    primario: 'bg-teal-700 text-white hover:bg-teal-800',
    secondario: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    pericolo: 'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50',
  }[variante];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${stile}`}
    >
      {children}
    </button>
  );
}

/**
 * Scelta di un file ben visibile: pulsante + area in cui trascinare il file.
 * Sostituisce l'input nativo del browser («Scegli file – Nessun file selezionato»),
 * che sembra testo e non invita al clic.
 */
export function SceltaFile({ etichetta, accetta, nomeFile, aiuto, onFile, disabilitato }: {
  etichetta: string; accetta: string; nomeFile?: string; aiuto?: string; onFile: (f: File) => void; disabilitato?: boolean;
}) {
  const [sopra, setSopra] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
      onDragLeave={() => setSopra(false)}
      onDrop={(e) => { e.preventDefault(); setSopra(false); const f = e.dataTransfer.files?.[0]; if (f && !disabilitato) onFile(f); }}
      className={`flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-sm transition ${
        sopra ? 'border-teal-600 bg-teal-50' : 'border-slate-300 bg-white hover:border-teal-600 hover:bg-slate-50'} ${disabilitato ? 'pointer-events-none opacity-50' : ''}`}
    >
      <span className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-1.5 font-medium text-white">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
        </svg>
        {etichetta}
      </span>
      <span className="min-w-0 flex-1 text-slate-600">
        {nomeFile ? <span className="font-medium text-slate-800">{nomeFile}</span> : (aiuto ?? 'oppure trascina qui il file')}
      </span>
      <input type="file" accept={accetta} className="sr-only" disabled={disabilitato}
             onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
  );
}

/**
 * Sezione richiudibile («a tendina»): intestazione cliccabile con conteggio,
 * contenuto visibile solo quando serve.
 */
export function Tendina({ titolo, sottotitolo, conteggio, tono = 'neutro', aperta = false, azione, children }: {
  titolo: string; sottotitolo?: string; conteggio?: number | string; tono?: Tono; aperta?: boolean; azione?: ReactNode; children: ReactNode;
}) {
  return (
    <details open={aperta} className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="font-medium text-slate-900">{titolo}</span>
          {sottotitolo && <span className="ml-2 hidden text-sm text-slate-500 sm:inline">{sottotitolo}</span>}
        </span>
        {conteggio !== undefined && <Badge tono={tono}>{conteggio}</Badge>}
        {azione && <span onClick={(e) => e.stopPropagation()}>{azione}</span>}
      </summary>
      <div className="border-t border-slate-100 px-4 py-3">{children}</div>
    </details>
  );
}
