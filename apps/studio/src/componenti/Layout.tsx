import type { ClaimsApp } from '@pls/shared';
import { useState, type ReactNode } from 'react';
import { etichettaRuolo } from '../lib/formato';
import { link, type Rotta, type Sezione } from '../lib/rotta';
import { esci } from '../lib/sessione';

interface Voce {
  sezione: Sezione;
  etichetta: string;
  icona: string; // percorso SVG (24x24, stroke)
  soloPediatra?: boolean;
}

const VOCI: Voce[] = [
  { sezione: 'cruscotto', etichetta: 'Cruscotto', icona: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { sezione: 'agenda', etichetta: 'Agenda', icona: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z' },
  { sezione: 'assistiti', etichetta: 'Assistiti', icona: 'M16 19v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 10a3 3 0 100-6 3 3 0 000 6M20 19v-1a4 4 0 00-3-3.9M15 4.1a3 3 0 010 5.8' },
  { sezione: 'consensi', etichetta: 'Consensi', icona: 'M9 12l2 2 4-4M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z' },
  { sezione: 'registro', etichetta: 'Registro accessi', icona: 'M9 5h10M9 12h10M9 19h10M5 5h.01M5 12h.01M5 19h.01', soloPediatra: true },
  { sezione: 'patologie', etichetta: 'Patologie', icona: 'M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h12M9 7h6M12 4v6' },
  { sezione: 'account', etichetta: 'Account', icona: 'M12 12a4 4 0 100-8 4 4 0 000 8M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1' },
];

const Icona = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** Struttura dell'app: menu laterale su schermi grandi, barra con menu a scomparsa su smartphone. */
export default function Layout({
  claims,
  rotta,
  nomeStudio,
  children,
}: {
  claims: ClaimsApp;
  rotta: Rotta;
  nomeStudio: string;
  children: ReactNode;
}) {
  const [menuAperto, setMenuAperto] = useState(false);
  const voci = VOCI.filter((v) => !v.soloPediatra || claims.app_ruolo === 'pediatra');

  const menu = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Menu principale">
      {voci.map((v) => {
        const attiva = rotta.sezione === v.sezione;
        return (
          <a
            key={v.sezione}
            href={link(v.sezione)}
            onClick={() => setMenuAperto(false)}
            aria-current={attiva ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              attiva ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Icona d={v.icona} />
            {v.etichetta}
          </a>
        );
      })}
    </nav>
  );

  const utente = (
    <div className="border-t border-slate-100 p-4 text-sm">
      <p className="truncate font-medium text-slate-800" title={claims.email}>{claims.email}</p>
      <p className="mb-3 text-xs text-slate-500">
        {etichettaRuolo(claims.app_ruolo)} · accesso con verifica in due passaggi
      </p>
      <button onClick={() => void esci()} className="text-sm text-slate-600 underline hover:text-slate-900">
        Esci
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Barra superiore (smartphone) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <span className="font-semibold text-teal-800">{nomeStudio}</span>
        <button
          onClick={() => setMenuAperto((a) => !a)}
          aria-expanded={menuAperto}
          aria-label="Apri il menu"
          className="rounded-lg border border-slate-300 p-1.5"
        >
          <Icona d={menuAperto ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
        </button>
      </header>

      {menuAperto && (
        <div className="fixed inset-0 z-10 bg-slate-900/30 md:hidden" onClick={() => setMenuAperto(false)}>
          <aside className="absolute left-0 top-14 flex h-[calc(100dvh-3.5rem)] w-64 flex-col bg-white" onClick={(e) => e.stopPropagation()}>
            {menu}
            {utente}
          </aside>
        </div>
      )}

      {/* Menu laterale (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-teal-700">Gestionale PLS</p>
          <p className="font-semibold text-slate-900">{nomeStudio}</p>
        </div>
        {menu}
        {utente}
      </aside>

      <main className="px-4 py-6 md:ml-60 md:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
