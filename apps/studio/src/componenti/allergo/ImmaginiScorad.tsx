import { GRADI_INTENSITA, VOCI_INTENSITA_SCORAD, type ClaimsApp } from '@pls/shared';
import { useState } from 'react';
import { q, useDati } from '../../lib/dati';
import { supabase } from '../../lib/supabase';
import { Errore } from '../ui';
import { stileInput } from './Registro';
import { DESCRIZIONI_GRADI, type ImmagineScorad } from './Scorad';

/** Ridimensiona l'immagine nel browser (lato lungo 900 px, JPEG): pesa poche decine di KB. */
function riduci(file: File): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const img = new Image();
    img.onload = () => {
      const scala = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scala);
      c.height = Math.round(img.height * scala);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      risolvi(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => rifiuta(new Error('File non leggibile come immagine'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Immagini di riferimento per i gradi di intensità dello SCORAD (come nell'atlante di eSCORAD).
 * Si caricano foto proprie o con licenza d'uso: la fonte è obbligatoria.
 */
export default function ImmaginiScorad({ claims }: { claims: ClaimsApp }) {
  const elenco = useDati(() => q<(ImmagineScorad & { id: string })[]>(supabase.schema('anagrafica').from('allergo_scorad_immagini').select('id, voce, grado, immagine, didascalia, fonte')), []);
  const [fonte, setFonte] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState<string | null>(null);
  const mappa = new Map((elenco.dati ?? []).map((x) => [`${x.voce}-${x.grado}`, x]));

  async function carica(voce: number, grado: number, file: File | undefined) {
    if (!file) return;
    setErrore(null);
    if (!fonte.trim()) return setErrore('Indica prima la fonte delle immagini (autore e licenza).');
    setInvio(`${voce}-${grado}`);
    try {
      const immagine = await riduci(file);
      const { error } = await supabase.schema('anagrafica').from('allergo_scorad_immagini')
        .upsert({ studio_id: claims.app_studio_id, voce, grado, immagine, fonte: fonte.trim(), caricato_il: new Date().toISOString() },
                { onConflict: 'studio_id,voce,grado' });
      if (error) throw new Error(error.message);
      elenco.ricarica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInvio(null);
    }
  }

  async function elimina(id: string) {
    const { error } = await supabase.schema('anagrafica').from('allergo_scorad_immagini').delete().eq('id', id);
    if (error) setErrore(error.message); else elenco.ricarica();
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        Compaiono sotto ogni grado nel calcolatore SCORAD, come nell'atlante di eSCORAD. Usa foto tue o con licenza d'uso
        (le immagini di dermatools e degli atlanti sono protette): niente volti o elementi che rendano riconoscibile il paziente.
      </p>
      <label className="block max-w-xl"><span className="block text-slate-500">Fonte / licenza delle immagini che carichi *</span>
        <input value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="Es. Archivio ambulatorio, foto con consenso; oppure atlante X, licenza CC BY" className={stileInput} /></label>
      {errore && <Errore messaggio={errore} />}
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-1 py-1 text-left">Segno</th>{[1, 2, 3].map((g) => <th key={g} className="px-1 py-1 text-left">{g} · {GRADI_INTENSITA[g]?.toLowerCase()}</th>)}</tr>
          </thead>
          <tbody>
            {VOCI_INTENSITA_SCORAD.map((voce, i) => (
              <tr key={voce} className="border-t border-slate-100 align-top">
                <td className="px-1 py-2 font-medium text-slate-800">{voce}</td>
                {[1, 2, 3].map((g) => {
                  const foto = mappa.get(`${i}-${g}`);
                  return (
                    <td key={g} className="px-1 py-2">
                      <p className="mb-1 text-xs text-slate-500">{DESCRIZIONI_GRADI[i]?.[g - 1]}</p>
                      {foto ? (
                        <div>
                          <img src={foto.immagine} alt={`${voce}, grado ${g}`} className="h-20 w-32 rounded object-cover" />
                          <button type="button" onClick={() => void elimina(foto.id)} className="text-xs text-rose-700 underline">Rimuovi</button>
                        </div>
                      ) : (
                        <label className="inline-block cursor-pointer rounded-lg border border-dashed border-slate-300 px-2 py-3 text-xs text-slate-500 hover:border-teal-600">
                          {invio === `${i}-${g}` ? 'Caricamento…' : '+ Carica foto'}
                          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void carica(i, g, e.target.files?.[0])} />
                        </label>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
