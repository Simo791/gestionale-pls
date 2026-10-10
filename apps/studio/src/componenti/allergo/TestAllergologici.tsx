import { esitoIgE, esitoPrick, type RigaAllergo } from '@pls/shared';
import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import Finestra from '../Finestra';
import { Badge, Bottone, Errore } from '../ui';
import { CAMPI_TEST, PANNELLO_PRICK, TIPI_TEST } from './definizioni';
import Registro, { giorno, oggi, s, stileInput } from './Registro';

const TONO_ESITO = { positivo: 'errore', negativo: 'ok', dubbio: 'attenzione' } as const;

/** Esito calcolato se il medico non l'ha indicato: prick ≥ 3 mm, IgE ≥ 0,35 kUA/L. */
function completaEsito(r: Record<string, unknown>): Record<string, unknown> {
  if (r.esito || r.valore == null) return r;
  const v = Number(r.valore);
  if ((r.tipo === 'prick' || r.tipo === 'prick_by_prick') && r.unita !== 'kUA/L') return { ...r, unita: r.unita ?? 'mm', esito: esitoPrick(v) };
  if (r.tipo === 'ige_specifiche' || r.tipo === 'ige_componenti') return { ...r, unita: r.unita ?? 'kUA/L', esito: esitoIgE(v) };
  return r;
}

/** Inserimento rapido di una seduta di prick test con controlli. */
export function PannelloPrick({ pseudo, onFatto, dataIniziale }: { pseudo: string; onFatto: () => void; dataIniziale?: string }) {
  const [data, setData] = useState(dataIniziale ?? oggi());
  const [tipo, setTipo] = useState<'prick' | 'prick_by_prick'>('prick');
  const [positivo, setPositivo] = useState('');
  const [negativo, setNegativo] = useState('0');
  const [valori, setValori] = useState<Record<string, string>>({});
  const [altri, setAltri] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const neg = Number(negativo.replace(',', '.')) || 0;

  const voci = [...PANNELLO_PRICK, ...altri.split('\n').map((x) => x.trim()).filter(Boolean)];
  const compilati = voci.filter((a) => (valori[a] ?? '').trim() !== '');

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    const pos = Number(positivo.replace(',', '.'));
    if (!positivo.trim() || pos < 3) return setErrore('Il controllo positivo (istamina) deve dare un pomfo di almeno 3 mm: altrimenti la seduta non è interpretabile (es. antistaminici in corso).');
    const righe = [
      { allergene: 'Istamina (controllo +)', valore: pos, esito: 'positivo' },
      { allergene: 'Soluzione salina (controllo −)', valore: neg, esito: neg >= 3 ? 'dubbio' : 'negativo' },
      ...compilati.map((a) => {
        const v = Number(valori[a]!.replace(',', '.'));
        return { allergene: a, valore: v, esito: esitoPrick(v, neg) };
      }),
    ].map((r) => ({ ...r, pseudo_id: pseudo, data, tipo, unita: 'mm', note: neg >= 3 ? 'Controllo negativo ≥ 3 mm (dermografismo?): interpretare con cautela' : null }));
    const { error } = await supabase.schema('clinica').from('allergo_test').insert(righe);
    if (error) setErrore(error.message); else onFatto();
  }

  return (
    <form onSubmit={(e) => void salva(e)} className="space-y-3 text-sm">
      {errore && <Errore messaggio={errore} />}
      <div className="grid gap-3 md:grid-cols-4">
        <label><span className="block text-slate-500">Data</span><input type="date" required value={data} onChange={(e) => setData(e.target.value)} className={stileInput} /></label>
        <label><span className="block text-slate-500">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'prick' | 'prick_by_prick')} className={stileInput}>
            <option value="prick">Prick test (estratti)</option><option value="prick_by_prick">Prick by prick (alimento fresco)</option>
          </select></label>
        <label><span className="block text-slate-500">Istamina, pomfo (mm) *</span><input inputMode="decimal" value={positivo} onChange={(e) => setPositivo(e.target.value)} className={stileInput} /></label>
        <label><span className="block text-slate-500">Controllo negativo (mm)</span><input inputMode="decimal" value={negativo} onChange={(e) => setNegativo(e.target.value)} className={stileInput} /></label>
      </div>
      <p className="text-xs text-slate-500">Diametro medio del pomfo in mm. Positivo se supera di almeno 3 mm il controllo negativo (EAACI, Heinzerling 2013). Compila solo gli allergeni testati.</p>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {voci.map((a) => {
          const v = valori[a] ?? '';
          const esito = v.trim() ? esitoPrick(Number(v.replace(',', '.')), neg) : null;
          return (
            <label key={a} className="flex items-center gap-2">
              <span className="flex-1 truncate text-slate-700" title={a}>{a}</span>
              <input inputMode="decimal" value={v} onChange={(e) => setValori({ ...valori, [a]: e.target.value })} aria-label={`${a}, mm`}
                     className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-right" />
              <span className="w-16">{esito && <Badge tono={TONO_ESITO[esito]}>{esito === 'positivo' ? '+' : '−'}</Badge>}</span>
            </label>
          );
        })}
      </div>
      <label className="block"><span className="block text-slate-500">Altri allergeni (uno per riga)</span>
        <textarea rows={2} value={altri} onChange={(e) => setAltri(e.target.value)} className={stileInput} /></label>
      <Bottone type="submit" variante="primario">Registra seduta ({compilati.length} allergeni + controlli)</Bottone>
    </form>
  );
}

export default function TestAllergologici({ pseudo, onCambio }: { pseudo: string; onCambio?: () => void }) {
  const [pannello, setPannello] = useState(false);
  const [versione, setVersione] = useState(0);
  return (
    <>
      <Registro
        titolo="Test allergologici" sottotitolo="Prick, prick by prick, IgE specifiche e molecolari, patch. Sensibilizzazione non significa allergia: leggere con la storia clinica."
        tabella="allergo_test" pseudo={pseudo} campi={CAMPI_TEST} aggiorna={versione} onCambio={onCambio}
        iniziali={() => ({ data: oggi(), tipo: 'ige_specifiche', unita: 'kUA/L' })} trasforma={completaEsito}
        azioniExtra={<Bottone onClick={() => setPannello(true)}>Seduta di prick test</Bottone>}
        riassunto={(r: RigaAllergo) => (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-24 tabular-nums text-slate-500">{giorno(r.data)}</span>
            <span className="font-medium text-slate-900">{s(r, 'allergene')}</span>
            <span className="text-slate-500">{TIPI_TEST[s(r, 'tipo')]}</span>
            {r.valore != null && <span className="tabular-nums">{s(r, 'valore')} {s(r, 'unita')}</span>}
            {r.esito ? <Badge tono={TONO_ESITO[r.esito as keyof typeof TONO_ESITO]}>{s(r, 'esito')}</Badge> : null}
            {r.note ? <span className="w-full text-xs text-slate-500">{s(r, 'note')}</span> : null}
          </div>
        )}
      />
      {pannello && (
        <Finestra titolo="Seduta di prick test" onChiudi={() => setPannello(false)} larga>
          <PannelloPrick pseudo={pseudo} onFatto={() => { setPannello(false); setVersione((v) => v + 1); onCambio?.(); }} />
        </Finestra>
      )}
    </>
  );
}
