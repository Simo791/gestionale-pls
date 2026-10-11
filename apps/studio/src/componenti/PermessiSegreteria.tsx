import type { ClaimsApp, MembroStudio, Pediatra } from '@pls/shared';
import { useState } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtDataOra } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Badge, Caricamento, Errore, Vuoto } from './ui';

interface Permesso { segreteria_id: string; pediatra_id: string; concesso_il: string }

const nome = (m: { nome: string | null; cognome: string | null; email?: string | null }) =>
  `${m.nome ?? ''} ${m.cognome ?? ''}`.trim() || m.email || 'Senza nome';

/**
 * Accesso della segreteria alle cartelle cliniche (sola lettura).
 * Il pediatra decide per i propri assistiti; l'amministratore per qualunque pediatra.
 * L'effetto è immediato sul database; il pulsante nell'app compare al prossimo accesso.
 */
export default function PermessiSegreteria({ claims, soloMie = false }: { claims: ClaimsApp; soloMie?: boolean }) {
  const dati = useDati(async () => {
    const ana = supabase.schema('anagrafica');
    const [membri, pediatri, permessi] = await Promise.all([
      q<MembroStudio[]>(ana.from('membri_studio').select('*').eq('ruolo', 'segreteria').order('cognome')),
      q<Pediatra[]>(ana.from('pediatri').select('*').order('cognome')),
      q<Permesso[]>(ana.from('permessi_cartelle').select('segreteria_id, pediatra_id, concesso_il')),
    ]);
    return { segreterie: membri.filter((m) => m.attivo), pediatri, permessi };
  }, []);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState<string | null>(null);

  if (dati.errore) return <Errore messaggio={dati.errore} />;
  if (dati.caricamento || !dati.dati) return <Caricamento />;
  const { segreterie, permessi } = dati.dati;
  // Il pediatra vede solo la propria colonna; l'amministratore tutte.
  const pediatri = claims.app_admin && !soloMie ? dati.dati.pediatri : dati.dati.pediatri.filter((p) => p.id === claims.sub);

  async function imposta(segreteria: string, pediatra: string, concesso: boolean) {
    setErrore(null);
    setInvio(`${segreteria}|${pediatra}`);
    const { error } = await supabase.schema('api').rpc('imposta_permesso_cartelle', {
      p_segreteria: segreteria, p_pediatra: pediatra, p_concesso: concesso,
    });
    setInvio(null);
    if (error) setErrore(error.message); else dati.ricarica();
  }

  if (segreterie.length === 0) return <Vuoto testo="Nessuna segreteria attiva nello studio." />;
  return (
    <div className="space-y-2 text-sm">
      {errore && <Errore messaggio={errore} />}
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Segreteria</th>
              {pediatri.map((p) => <th key={p.id} className="px-4 py-2 font-medium">Assistiti di {p.titolo ?? ''} {p.cognome}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {segreterie.map((s) => (
              <tr key={s.utente_id}>
                <td className="px-4 py-2"><p className="font-medium text-slate-900">{nome(s)}</p><p className="text-xs text-slate-500">{s.email}</p></td>
                {pediatri.map((p) => {
                  const permesso = permessi.find((x) => x.segreteria_id === s.utente_id && x.pediatra_id === p.id);
                  return (
                    <td key={p.id} className="px-4 py-2">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={!!permesso} disabled={invio === `${s.utente_id}|${p.id}`}
                               onChange={(e) => void imposta(s.utente_id, p.id, e.target.checked)} />
                        {permesso ? <Badge tono="attenzione">Può consultare</Badge> : <span className="text-slate-500">Nessun accesso</span>}
                      </label>
                      {permesso && <p className="mt-0.5 text-[11px] text-slate-500">dal {fmtDataOra(permesso.concesso_il)}</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Sola lettura: la segreteria non può scrivere né modificare dati clinici. Ogni apertura di cartella è nel registro accessi.
        Concedi l'accesso solo se serve al lavoro dello studio (principio di minimizzazione, art. 5 GDPR) e con un incarico scritto
        al trattamento (art. 29 GDPR).
      </p>
    </div>
  );
}
