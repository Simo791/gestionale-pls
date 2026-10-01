import type { EsitoVerificaAudit, EventoAttivita } from '@pls/shared';
import { Badge, Bottone, Caricamento, Errore, Pannello, Vuoto } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { etichettaAzione, etichettaRuolo, etichettaTabella, fmtDataOra } from '../lib/formato';
import { supabase } from '../lib/supabase';

/** Registro accessi (solo pediatra): integrità della catena di hash e ultime attività. */
export default function Registro() {
  const verifica = useDati(async () => (await q<EsitoVerificaAudit[]>(supabase.schema('api').rpc('verifica_audit')))[0] ?? null, []);
  const eventi = useDati(() => q<EventoAttivita[]>(supabase.schema('api').rpc('attivita_recente', { p_limite: 100 })), []);
  const integro = verifica.dati ? verifica.dati.primo_evento_non_valido === null : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Registro accessi</h1>
        <p className="text-sm text-slate-500">Ogni lettura e modifica di dati sensibili, in sola aggiunta</p>
      </div>

      <Pannello
        titolo="Integrità del registro"
        azione={<Bottone onClick={verifica.ricarica} disabled={verifica.caricamento}>Verifica ora</Bottone>}
      >
        {verifica.errore ? <Errore messaggio={verifica.errore} /> : verifica.caricamento ? <Caricamento righe={1} /> : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tono={integro ? 'ok' : 'errore'}>{integro ? 'Catena integra' : 'Catena alterata'}</Badge>
            <span className="text-slate-600">
              {integro
                ? `${verifica.dati?.eventi_verificati} eventi verificati: ogni hash corrisponde al precedente.`
                : `Il primo evento non valido è il n. ${verifica.dati?.primo_evento_non_valido}: da lì in poi il registro è stato manomesso.`}
            </span>
          </div>
        )}
      </Pannello>

      <Pannello titolo="Ultime 100 attività">
        {eventi.errore ? <Errore messaggio={eventi.errore} /> : eventi.caricamento ? <Caricamento righe={8} /> :
          eventi.dati?.length === 0 ? <Vuoto testo="Nessuna attività." /> : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Quando</th>
                  <th className="px-4 py-2 font-medium">Chi</th>
                  <th className="px-4 py-2 font-medium">Azione</th>
                  <th className="px-4 py-2 font-medium">Dato</th>
                  <th className="px-4 py-2 font-medium">Bambino</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eventi.dati?.map((e, i) => (
                  <tr key={i}>
                    <td className="px-4 py-1.5 tabular-nums text-slate-600">{fmtDataOra(e.avvenuto_il)}</td>
                    <td className="px-4 py-1.5">{etichettaRuolo(e.ruolo)}</td>
                    <td className="px-4 py-1.5">{etichettaAzione(e.azione)}</td>
                    <td className="px-4 py-1.5 text-slate-600">{etichettaTabella(e.tabella)}</td>
                    <td className="px-4 py-1.5 text-slate-600">{e.paziente ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Pannello>
    </div>
  );
}
