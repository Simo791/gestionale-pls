import { useEffect, type ReactNode } from 'react';

/** Finestra modale semplice: chiusura con Esc, clic sullo sfondo o pulsante. */
export default function Finestra({ titolo, onChiudi, children, larga = false }: {
  titolo: string; onChiudi: () => void; children: ReactNode; larga?: boolean | 'xl';
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onChiudi]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 md:p-10" onClick={onChiudi}>
      <div role="dialog" aria-modal="true" aria-label={titolo} onClick={(e) => e.stopPropagation()}
           className={`w-full ${larga === 'xl' ? 'max-w-5xl' : larga ? 'max-w-3xl' : 'max-w-xl'} rounded-xl bg-white p-5 shadow-xl`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{titolo}</h2>
          <button onClick={onChiudi} aria-label="Chiudi" className="rounded-lg px-2 text-xl leading-none text-slate-500 hover:bg-slate-100">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
