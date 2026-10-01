import { leggiCsv, proponiColonne, type CampoCatalogo } from '@pls/shared';
import { useState } from 'react';
import { useDati } from '../lib/dati';
import { fmtDataOra } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Bottone, Errore } from './ui';

const CAMPI: { campo: CampoCatalogo; etichetta: string; obbligatorio?: boolean }[] = [
  { campo: 'codice_regionale', etichetta: 'Codice regionale (catalogo)', obbligatorio: true },
  { campo: 'descrizione', etichetta: 'Descrizione', obbligatorio: true },
  { campo: 'codice_nazionale', etichetta: 'Codice nomenclatore nazionale' },
  { campo: 'branca', etichetta: 'Branca' },
  { campo: 'nota_erogabilita', etichetta: 'Nota di erogabilità' },
];
const BLOCCO = 1000;

/**
 * Importa il catalogo regionale delle prestazioni da un file CSV (in Excel: File › Salva con nome ›
 * CSV UTF-8). Le colonne vengono riconosciute dalle intestazioni e si possono correggere a mano.
 */
export default function ImportaCatalogo() {
  const [righe, setRighe] = useState<string[][] | null>(null);
  const [nomeFile, setNomeFile] = useState('');
  const [mappa, setMappa] = useState<Record<CampoCatalogo, number> | null>(null);
  const [versione, setVersione] = useState('Catalogo regionale Calabria (DCA 442/2024 e 29/2025)');
  const [stato, setStato] = useState<{ ok: boolean; testo: string } | null>(null);
  const [invio, setInvio] = useState(false);

  const attuale = useDati(async () => {
    const { data, count, error } = await supabase.schema('anagrafica').from('catalogo_prestazioni')
      .select('versione, importato_il', { count: 'exact' }).eq('attivo', true).order('importato_il', { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return { totale: count ?? 0, ultima: data?.[0] as { versione: string; importato_il: string } | undefined };
  }, []);

  async function leggi(file: File) {
    setStato(null);
    const testo = await file.text();
    const r = leggiCsv(testo);
    if (r.length < 2) return setStato({ ok: false, testo: 'Il file non contiene righe: serve un CSV con la riga di intestazione.' });
    setNomeFile(file.name);
    setRighe(r);
    setMappa(proponiColonne(r[0]!));
  }

  async function importa() {
    if (!righe || !mappa) return;
    if (mappa.codice_regionale < 0 || mappa.descrizione < 0) return setStato({ ok: false, testo: 'Indica le colonne del codice regionale e della descrizione.' });
    const dati = righe.slice(1).map((r) => Object.fromEntries(
      CAMPI.map(({ campo }) => [campo, mappa[campo] >= 0 ? (r[mappa[campo]] ?? '').trim() : '']),
    ));
    setInvio(true);
    setStato(null);
    let importate = 0;
    let disattivate = 0;
    try {
      for (let i = 0; i < dati.length; i += BLOCCO) {
        const { data, error } = await supabase.schema('api').rpc('importa_catalogo_prestazioni', {
          p_righe: dati.slice(i, i + BLOCCO), p_versione: versione, p_regione: 'CAL',
        });
        if (error) throw new Error(error.message);
        importate += (data as { importate: number }).importate;
        disattivate += (data as { disattivate: number }).disattivate;
      }
      setStato({ ok: true, testo: `Importate ${importate} prestazioni${disattivate ? `, ${disattivate} non più presenti disattivate` : ''}.` });
      setRighe(null);
      attuale.ricarica();
    } catch (e) {
      setStato({ ok: false, testo: `Importazione interrotta: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setInvio(false);
    }
  }

  const intestazioni = righe?.[0] ?? [];
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        {attuale.dati?.totale
          ? <>In uso: <strong>{attuale.dati.totale}</strong> prestazioni · {attuale.dati.ultima?.versione} · importato il {attuale.dati.ultima && fmtDataOra(attuale.dati.ultima.importato_il)}</>
          : 'Nessun catalogo importato.'}
      </p>
      <ol className="list-decimal space-y-0.5 pl-5 text-slate-600">
        <li>Procurati il file del catalogo regionale vigente (Regione, ASP o fornitore del software di ricetta).</li>
        <li>Se è in Excel: File › Salva con nome › <em>CSV UTF-8</em>.</li>
        <li>Caricalo qui, controlla le colonne e importa. Ripeti a ogni aggiornamento regionale: le voci sparite vengono disattivate.</li>
      </ol>
      <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void leggi(f); }} />
      {stato && <p className={`rounded-lg p-2 ${stato.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{stato.testo}</p>}
      {attuale.errore && <Errore messaggio={attuale.errore} />}

      {righe && mappa && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="font-medium text-slate-800">{nomeFile}: {righe.length - 1} righe</p>
          <div className="grid gap-2 md:grid-cols-2">
            {CAMPI.map(({ campo, etichetta, obbligatorio }) => (
              <label key={campo}>
                <span className="block text-slate-500">{etichetta}{obbligatorio && ' *'}</span>
                <select value={mappa[campo]} onChange={(e) => setMappa({ ...mappa, [campo]: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                  <option value={-1}>— nessuna —</option>
                  {intestazioni.map((h, i) => <option key={i} value={i}>{h || `Colonna ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
            <label className="md:col-span-2">
              <span className="block text-slate-500">Versione / atto di riferimento *</span>
              <input value={versione} onChange={(e) => setVersione(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr>{CAMPI.map((c) => <th key={c.campo} className="px-2 py-1 font-medium text-slate-500">{c.etichetta}</th>)}</tr></thead>
              <tbody>
                {righe.slice(1, 6).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {CAMPI.map((c) => <td key={c.campo} className="px-2 py-1">{mappa[c.campo] >= 0 ? r[mappa[c.campo]] : '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Bottone variante="primario" onClick={() => void importa()} disabled={invio || !versione.trim()}>
            {invio ? 'Importazione…' : `Importa ${righe.length - 1} prestazioni`}
          </Bottone>
        </div>
      )}
    </div>
  );
}
