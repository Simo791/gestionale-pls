import { useEffect, useRef, useState, type PointerEvent } from 'react';

const MAX_TRATTI = 400;

/**
 * Riquadro per firmare con il dito, la penna o il mouse.
 * Restituisce l'immagine PNG del tratto e il numero di tratti; nessun dato biometrico
 * (pressione, velocità) viene conservato: è una firma elettronica semplice.
 * Si disegna in coordinate del bitmap, così la firma resta allineata anche se il
 * riquadro cambia dimensione (rotazione del telefono); conta un solo dito alla volta.
 */
export default function Firma({ onCambio }: { onCambio: (firma: { immagine: string; tratti: number } | null) => void }) {
  const tela = useRef<HTMLCanvasElement | null>(null);
  const puntatore = useRef<number | null>(null);
  const tratti = useRef(0);
  const [vuota, setVuota] = useState(true);

  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
  }, []);

  const punto = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const stile = (c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const r = c.getBoundingClientRect();
    ctx.lineWidth = 2.2 * (c.width / Math.max(r.width, 1));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    return ctx;
  };

  function inizia(e: PointerEvent<HTMLCanvasElement>) {
    if (puntatore.current !== null || tratti.current >= MAX_TRATTI) return;
    const ctx = stile(e.currentTarget);
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    puntatore.current = e.pointerId;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  }
  function muovi(e: PointerEvent<HTMLCanvasElement>) {
    if (puntatore.current !== e.pointerId) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function termina(e: PointerEvent<HTMLCanvasElement>) {
    if (puntatore.current !== e.pointerId) return;
    puntatore.current = null;
    tratti.current += 1;
    setVuota(false);
    onCambio({ immagine: e.currentTarget.toDataURL('image/png'), tratti: tratti.current });
  }
  function cancella() {
    const c = tela.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    tratti.current = 0;
    puntatore.current = null;
    setVuota(true);
    onCambio(null);
  }

  return (
    <div>
      <div className="relative rounded-lg border-2 border-dashed border-slate-300 bg-white">
        <canvas ref={tela} className="block h-40 w-full touch-none" role="img" aria-label="Riquadro per la firma"
                aria-describedby="nota-firma"
                onPointerDown={inizia} onPointerMove={muovi} onPointerUp={termina} onPointerCancel={termina} />
        {vuota && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Firma qui</span>}
        <span className="pointer-events-none absolute bottom-6 left-6 right-6 border-b border-slate-200" />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={cancella} className="text-sm text-slate-600 underline">Cancella e rifirma</button>
        <span id="nota-firma" className="text-xs text-slate-500">Se non puoi firmare sullo schermo, puoi firmare su carta in studio.</span>
      </div>
    </div>
  );
}
