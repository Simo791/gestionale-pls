import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

/**
 * Trasforma un documento dell'app (lo stesso che si stampa) in un file PDF A4,
 * per inviarlo al genitore. Il documento viene disegnato fuori schermo, fotografato
 * ad alta risoluzione e impaginato su più pagine, andando a capo tra un paragrafo
 * (o una riga di tabella) e l'altro, mai a metà riga.
 * Le librerie si caricano solo quando servono (non appesantiscono l'avvio).
 */
const LARGHEZZA_MM = 190; // A4 meno 10 mm per lato
const ALTEZZA_UTILE_MM = 297 - 24; // 12 mm sopra e sotto
const LARGHEZZA_PX = Math.round((LARGHEZZA_MM / 25.4) * 96); // ≈ 718 px a 96 dpi

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Punti in cui si può andare a pagina nuova: il fondo di ogni blocco «indivisibile». */
function puntiDiTaglio(contenitore: HTMLElement): number[] {
  const alto = contenitore.getBoundingClientRect().top;
  const punti = new Set<number>();
  contenitore.querySelectorAll('p, li, tr, h1, h2, h3, h4, dt, dd, header, footer, img, svg, section > div, article > div').forEach((el) => {
    // Dentro celle di tabella si taglia solo a fine riga (tr), mai a metà colonna.
    if (el.tagName !== 'TR' && el.closest('td, th')) return;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.height > 0) punti.add(Math.round(r.bottom - alto));
  });
  return [...punti].sort((a, b) => a - b);
}

export async function documentoInPdf(documento: ReactElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);

  const contenitore = document.createElement('div');
  contenitore.className = 'pdf-documento';
  Object.assign(contenitore.style, {
    position: 'absolute', left: '-10000px', top: '0', width: `${LARGHEZZA_PX}px`, background: '#ffffff', color: '#000000',
  });
  document.body.appendChild(contenitore);
  const radice = createRoot(contenitore);
  try {
    flushSync(() => radice.render(documento));
    await attendi(60);
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const altezzaPx = contenitore.scrollHeight;
    const paginaPx = (ALTEZZA_UTILE_MM / LARGHEZZA_MM) * LARGHEZZA_PX;
    const tagli = puntiDiTaglio(contenitore);

    // Inizio di ogni pagina: l'ultimo punto di taglio che ci sta, altrimenti un taglio netto.
    const inizi = [0];
    while (inizi[inizi.length - 1]! + paginaPx < altezzaPx) {
      const da = inizi[inizi.length - 1]!;
      const candidati = tagli.filter((t) => t > da + paginaPx * 0.4 && t <= da + paginaPx);
      inizi.push(candidati.length ? candidati[candidati.length - 1]! : da + paginaPx);
    }

    // Documenti lunghi: scala più bassa per restare nei limiti dei browser sui canvas (es. Safari su iPhone).
    const scala = altezzaPx > 6000 ? 1.25 : altezzaPx > 3500 ? 1.5 : 2;
    const tela = await html2canvas(contenitore, { scale: scala, backgroundColor: '#ffffff', useCORS: true, logging: false, scrollX: 0, scrollY: 0 });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const mmPerPx = LARGHEZZA_MM / LARGHEZZA_PX;

    inizi.forEach((inizio, i) => {
      const fine = inizi[i + 1] ?? altezzaPx;
      const h = Math.max(1, Math.round((fine - inizio) * scala));
      const pezzo = document.createElement('canvas');
      pezzo.width = tela.width;
      pezzo.height = h;
      const ctx = pezzo.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pezzo.width, h);
      ctx.drawImage(tela, 0, Math.round(inizio * scala), tela.width, h, 0, 0, tela.width, h);
      if (i > 0) pdf.addPage();
      pdf.addImage(pezzo.toDataURL('image/jpeg', 0.88), 'JPEG', 10, 12, LARGHEZZA_MM, (fine - inizio) * mmPerPx);
      if (inizi.length > 1) {
        pdf.setFontSize(8);
        pdf.text(`Pagina ${i + 1} di ${inizi.length}`, 200, 290, { align: 'right' });
      }
    });
    return pdf.output('blob');
  } finally {
    radice.unmount();
    contenitore.remove();
  }
}

/** Nome di file sicuro, es. «Referto visita 11-10-2026.pdf». */
export const nomeFile = (titolo: string) =>
  `${titolo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'documento'}.pdf`;
