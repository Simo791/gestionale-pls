import type { Pediatra, Studio, TipoRelazione } from '@pls/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ETICHETTA_RELAZIONE, fmtDataOra, fmtGiornoIso, oggiIso } from '../lib/formato';

/**
 * Esportazione in PDF tramite la stampa del browser ("Salva come PDF"):
 * nessuna libreria esterna, il documento è testo vero (ricercabile e accessibile)
 * e il layout A4 è controllato via CSS. Lo schermo resta invariato: durante la
 * stampa l'app è nascosta e si vede solo il documento.
 */
export function useStampa() {
  const [documento, setDocumento] = useState<ReactNode | null>(null);

  useEffect(() => {
    if (!documento) return;
    const chiudi = () => setDocumento(null);
    window.addEventListener('afterprint', chiudi, { once: true });
    const t = window.setTimeout(() => window.print(), 80); // lascia il tempo di disegnare il documento
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', chiudi);
    };
  }, [documento]);

  const portale = documento ? createPortal(<div className="documento-stampa">{documento}</div>, document.body) : null;
  return { stampa: setDocumento, portale };
}

export interface DatiBambino {
  nome: string;
  cognome: string;
  sesso: 'M' | 'F';
  dataNascita: string;
  codiceFiscale: string | null;
  genitori: { nome: string; cognome: string; tipo: TipoRelazione; telefono: string | null }[];
}

const nomeMedico = (m: Pediatra) => `${m.titolo} ${m.nome} ${m.cognome}`;

/** Documento A4: intestazione dello studio, dati del bambino, contenuto, firma del medico. */
export function DocumentoStampa({
  titolo,
  studio,
  medico,
  bambino,
  children,
}: {
  titolo: string;
  studio: Studio | null;
  medico: Pediatra | null;
  bambino?: DatiBambino;
  children: ReactNode;
}) {
  return (
    <article className="text-[11pt] leading-snug text-black">
      {/* Intestazione dello studio */}
      <header className="mb-4 flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <p className="text-[15pt] font-bold">{studio?.nome ?? 'Studio pediatrico'}</p>
          <p>{studio?.indirizzo}</p>
          <p>
            {[studio?.telefono && `Tel. ${studio.telefono}`, studio?.email, studio?.pec && `PEC ${studio.pec}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {medico && (
          <div className="text-right text-[10pt]">
            <p className="font-semibold">{nomeMedico(medico)}</p>
            <p>{medico.specializzazione}</p>
            <p>Pediatra di Libera Scelta · cod. reg. {medico.codice_regionale}</p>
            {medico.ordine_numero && <p>Ordine dei Medici di {medico.ordine_provincia} n. {medico.ordine_numero}</p>}
            {medico.partita_iva && <p>P. IVA {medico.partita_iva}</p>}
          </div>
        )}
      </header>

      <h1 className="mb-3 text-[14pt] font-bold uppercase tracking-wide">{titolo}</h1>

      {/* Dati del bambino e dei genitori */}
      {bambino && (
        <table className="mb-4 w-full border border-black text-[10pt]">
          <tbody>
            <tr>
              <th className="w-40 border border-black bg-gray-100 px-2 py-1 text-left">Bambino/a</th>
              <td className="border border-black px-2 py-1 font-semibold">{bambino.cognome} {bambino.nome}</td>
              <th className="w-32 border border-black bg-gray-100 px-2 py-1 text-left">Sesso</th>
              <td className="border border-black px-2 py-1">{bambino.sesso === 'M' ? 'Maschile' : 'Femminile'}</td>
            </tr>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left">Data di nascita</th>
              <td className="border border-black px-2 py-1">{fmtGiornoIso(bambino.dataNascita)}</td>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left">Codice fiscale</th>
              <td className="border border-black px-2 py-1 font-mono">{bambino.codiceFiscale ?? '—'}</td>
            </tr>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left">Genitori / tutori</th>
              <td className="border border-black px-2 py-1" colSpan={3}>
                {bambino.genitori.map((g) => `${g.nome} ${g.cognome} (${ETICHETTA_RELAZIONE[g.tipo].toLowerCase()}${g.telefono ? `, tel. ${g.telefono}` : ''})`).join(' · ') || '—'}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <section>{children}</section>

      {/* Firma */}
      <footer className="mt-10 flex items-end justify-between" style={{ breakInside: 'avoid' }}>
        <p>Data: {fmtGiornoIso(oggiIso())}</p>
        <div className="w-72 text-center">
          <div className="mb-1 h-12 border-b border-black" />
          <p className="font-semibold">{medico ? nomeMedico(medico) : 'Il medico'}</p>
          {medico?.ordine_numero && <p className="text-[9pt]">Iscr. Ordine dei Medici di {medico.ordine_provincia} n. {medico.ordine_numero}</p>}
        </div>
      </footer>
      <p className="mt-6 text-[8pt] text-gray-600">
        Documento generato dal Gestionale PLS il {fmtDataOra(new Date())}. Contiene dati personali e sanitari: conservare e trasmettere con riservatezza.
      </p>
    </article>
  );
}

/** Tabella con bordi per i documenti stampati. */
export function TabellaStampa({ intestazioni, righe }: { intestazioni: string[]; righe: (string | number | null)[][] }) {
  return (
    <table className="mb-4 w-full border-collapse text-[10pt]">
      <thead>
        <tr>{intestazioni.map((h) => <th key={h} className="border border-black bg-gray-100 px-2 py-1 text-left">{h}</th>)}</tr>
      </thead>
      <tbody>
        {righe.map((r, i) => (
          <tr key={i} style={{ breakInside: 'avoid' }}>
            {r.map((c, j) => <td key={j} className="border border-black px-2 py-1 align-top">{c ?? '—'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
