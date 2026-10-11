import { leggiCsv, proponiColonne, trovaIntestazione, unisciDoppioni, type CampoCatalogo, type RigaCatalogo } from '@pls/shared';
import { useMemo, useState } from 'react';
import { useDati } from '../lib/dati';
import { fmtDataOra } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Bottone, Errore, SceltaFile } from './ui';

const CAMPI: { campo: CampoCatalogo; etichetta: string; obbligatorio?: boolean }[] = [
  { campo: 'codice_regionale', etichetta: 'Codice regionale (catalogo)', obbligatorio: true },
  { campo: 'descrizione', etichetta: 'Descrizione', obbligatorio: true },
  { campo: 'codice_nazionale', etichetta: 'Codice nomenclatore nazionale' },
  { campo: 'branca', etichetta: 'Branca' },
  { campo: 'nota_erogabilita', etichetta: 'Nota di erogabilità' },
];

/**
 * Importa il catalogo regionale delle prestazioni da un file CSV (in Excel: File › Salva con nome ›
 * CSV UTF-8). Le colonne vengono riconosciute dalle intestazioni e si possono correggere a mano.
 */
export default function ImportaCatalogo() {
  const [righe, setRighe] = useState<string[][] | null>(null);
  const [intestazione, setIntestazione] = useState(0);
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
    setRighe(null);
    setMappa(null);
    setNomeFile('');
    if (!/\.csv$/i.test(file.name)) {
      return setStato({ ok: false, testo: 'Serve un file .csv: in Excel usa File › Salva con nome › CSV UTF-8 (delimitato da virgole o punto e virgola).' });
    }
    // CSV UTF-8 oppure il «CSV (delimitato)» di Excel italiano, che è in Windows-1252.
    const buffer = await file.arrayBuffer();
    let testo: string;
    try { testo = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { testo = new TextDecoder('windows-1252').decode(buffer); }
    const r = leggiCsv(testo);
    if (r.length < 2) return setStato({ ok: false, testo: 'Il file non contiene righe: serve un CSV con la riga di intestazione.' });
    const h = trovaIntestazione(r);
    setNomeFile(file.name);
    setRighe(r);
    setIntestazione(h);
    setMappa(proponiColonne(r[h]!));
  }

  function cambiaIntestazione(h: number) {
    if (!righe) return;
    setIntestazione(h);
    setMappa(proponiColonne(righe[h]!));
  }

  /** Righe dopo l'intestazione, nei campi scelti, con doppioni uniti e titoli scartati. */
  const pronte = useMemo(() => {
    if (!righe || !mappa) return null;
    const grezze = righe.slice(intestazione + 1).map((r) => Object.fromEntries(
      CAMPI.map(({ campo }) => [campo, mappa[campo] >= 0 ? (r[mappa[campo]] ?? '').trim() : '']),
    ) as RigaCatalogo);
    return unisciDoppioni(grezze);
  }, [righe, mappa, intestazione]);

  async function importa() {
    if (!righe || !mappa) return;
    if (mappa.codice_regionale < 0 || mappa.descrizione < 0) return setStato({ ok: false, testo: 'Indica le colonne del codice regionale e della descrizione.' });
    const dati = pronte?.righe ?? [];
    if (dati.length === 0) return setStato({ ok: false, testo: 'Nessuna prestazione valida: controlla la riga di intestazione e le colonne.' });
    setInvio(true);
    setStato(null);
    try {
      // Una sola chiamata: se qualcosa va storto non cambia nulla (tutto o niente);
      // le prestazioni non presenti nel nuovo file vengono disattivate.
      const { data, error } = await supabase.schema('api').rpc('importa_catalogo_prestazioni', {
        p_righe: dati, p_versione: versione, p_regione: 'CAL',
      });
      if (error) throw new Error(error.message);
      const { importate, disattivate } = data as { importate: number; disattivate: number };
      setStato({ ok: true, testo: `Importate ${importate} prestazioni${disattivate ? `, ${disattivate} non più presenti disattivate` : ''}.` });
      setRighe(null);
      setNomeFile('');
      attuale.ricarica();
    } catch (e) {
      setStato({ ok: false, testo: `Importazione interrotta: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setInvio(false);
    }
  }

  const intestazioni = righe?.[intestazione] ?? [];
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
      <SceltaFile etichetta="Scegli il file CSV" accetta=".csv,text/csv" nomeFile={nomeFile || undefined}
                  aiuto="oppure trascina qui il file del catalogo (CSV UTF-8)" onFile={(f) => void leggi(f)} disabilitato={invio} />
      {stato && <p className={`rounded-lg p-2 ${stato.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{stato.testo}</p>}
      {attuale.errore && <Errore messaggio={attuale.errore} />}

      {righe && mappa && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="font-medium text-slate-800">{nomeFile}: {righe.length} righe nel file</p>
          {pronte && (
            <p className="text-slate-600">
              <strong>{pronte.righe.length}</strong> prestazioni da importare
              {pronte.doppioni > 0 && <> · {pronte.doppioni} righe con codice ripetuto unite (branche e note accorpate)</>}
              {pronte.scartate > 0 && <> · {pronte.scartate} righe senza codice o descrizione scartate (titoli, righe vuote)</>}
            </p>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="block text-slate-500">Riga di intestazione (nomi delle colonne)</span>
              <select value={intestazione} onChange={(e) => cambiaIntestazione(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                {righe.slice(0, 20).map((r, i) => (
                  <option key={i} value={i}>Riga {i + 1}: {r.filter(Boolean).slice(0, 4).join(' · ').slice(0, 90) || '(vuota)'}</option>
                ))}
              </select>
            </label>
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
              <caption className="pb-1 text-left text-slate-500">Anteprima delle prime 5 prestazioni</caption>
              <thead><tr>{CAMPI.map((c) => <th key={c.campo} className="px-2 py-1 font-medium text-slate-500">{c.etichetta}</th>)}</tr></thead>
              <tbody>
                {(pronte?.righe ?? []).slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {CAMPI.map((c) => <td key={c.campo} className="px-2 py-1">{r[c.campo] || '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Bottone variante="primario" onClick={() => void importa()} disabled={invio || !versione.trim() || !pronte?.righe.length}>
            {invio ? 'Importazione…' : `Importa ${pronte?.righe.length ?? 0} prestazioni`}
          </Bottone>
        </div>
      )}
    </div>
  );
}
