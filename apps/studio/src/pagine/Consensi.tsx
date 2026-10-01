import type { ConsensoIncompleto } from '@pls/shared';
import { Badge, Caricamento, Errore, Pannello, Vuoto } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { ETICHETTA_FINALITA } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

/** Bambini per cui manca il consenso di almeno un genitore, raggruppati per bambino. */
export default function Consensi() {
  const consensi = useDati(() => q<ConsensoIncompleto[]>(supabase.schema('api').rpc('consensi_incompleti')), []);

  const perPaziente = new Map<string, ConsensoIncompleto[]>();
  for (const c of consensi.dati ?? []) {
    perPaziente.set(c.paziente_id, [...(perPaziente.get(c.paziente_id) ?? []), c]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Consensi</h1>
        <p className="text-sm text-slate-500">
          {consensi.dati ? `${perPaziente.size} bambini con consensi da completare` : '…'}
        </p>
      </div>

      <Pannello titolo="Come funziona la regola" sottotitolo="Dati sanitari e portale genitori">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li><strong>Completo</strong>: hanno firmato tutti i genitori con responsabilità genitoriale.</li>
          <li><strong>Parziale</strong>: ha firmato almeno uno. Il trattamento ordinario è possibile, ma lo studio chiede la seconda firma.</li>
          <li><strong>Assente</strong>: nessuna firma. Il portale genitori resta chiuso per quel bambino.</li>
          <li>Ogni dichiarazione è conservata con data e canale; una revoca crea una nuova riga, non cancella la precedente.</li>
        </ul>
      </Pannello>

      <Pannello titolo="Da completare">
        {consensi.errore ? <Errore messaggio={consensi.errore} /> : consensi.caricamento ? <Caricamento righe={6} /> :
          perPaziente.size === 0 ? <Vuoto testo="Tutti i consensi sono completi." /> : (
          <ul className="divide-y divide-slate-100">
            {[...perPaziente.entries()].map(([id, righe]) => (
              <li key={id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <a href={link('assistiti', id)} className="font-medium text-slate-900 hover:underline">
                    {righe[0]?.cognome} {righe[0]?.nome}
                  </a>
                  {righe.map((r) => (
                    <p key={r.finalita} className="text-sm text-slate-600">
                      {ETICHETTA_FINALITA[r.finalita]}: manca {r.mancanti.join(', ') || 'un genitore con responsabilità'}
                    </p>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {righe.map((r) => (
                    <Badge key={r.finalita} tono={r.stato === 'assente' ? 'errore' : 'attenzione'}>
                      {ETICHETTA_FINALITA[r.finalita]} · {r.stato}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Pannello>
    </div>
  );
}
