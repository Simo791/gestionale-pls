import type { ClaimsApp, MembroStudio } from '@pls/shared';
import { useState } from 'react';
import { q, useDati } from '../lib/dati';
import { etichettaRuolo } from '../lib/formato';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Errore, Pannello, Vuoto } from './ui';

/** Configurazione di un modulo specialistico (stesso schema per Allergologia, Auxologia, …). */
export interface ConfigModulo {
  nome: string;                         // «Allergologia»
  titolo: string;                       // «Allergologia pediatrica»
  colonnaStudio: 'allergologia_attiva' | 'auxologia_attiva';
  colonnaMembro: 'allergologia' | 'auxologia';
  rpcImposta: 'imposta_allergologia' | 'imposta_auxologia';
  rpcAbilita: 'abilita_allergologia' | 'abilita_auxologia';
  figura: string;                       // «Allergologo pediatra»
}

export const MODULO_ALLERGOLOGIA: ConfigModulo = {
  nome: 'Allergologia', titolo: 'Allergologia pediatrica', colonnaStudio: 'allergologia_attiva', colonnaMembro: 'allergologia',
  rpcImposta: 'imposta_allergologia', rpcAbilita: 'abilita_allergologia', figura: 'Allergologo pediatra',
};
export const MODULO_AUXOLOGIA: ConfigModulo = {
  nome: 'Auxologia', titolo: 'Auxologia pediatrica', colonnaStudio: 'auxologia_attiva', colonnaMembro: 'auxologia',
  rpcImposta: 'imposta_auxologia', rpcAbilita: 'abilita_auxologia', figura: 'Auxologo pediatra',
};

/**
 * Amministratore: attiva un modulo specialistico per lo studio e accetta chi può usarlo.
 * Lo specialista esterno si aggiunge da «Staff dello studio» col ruolo dedicato (aggiungerlo
 * equivale ad accettarlo); un pediatra o un sostituto si abilita qui.
 */
export default function GestioneModulo({ claims, modulo: m }: { claims: ClaimsApp; modulo: ConfigModulo }) {
  const studio = useDati(() => q<Record<string, unknown>>(supabase.schema('anagrafica').from('studi').select('*').single()), []);
  const membri = useDati(() => q<MembroStudio[]>(supabase.schema('anagrafica').from('membri_studio').select('*').order('cognome')), []);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

  if (!claims.app_admin) return null;
  const attivo = studio.dati?.[m.colonnaStudio] === true;
  // Pediatri, sostituti e lo specialista del modulo (non lo specialista di un altro modulo né la segreteria).
  const specialista = m.colonnaMembro === 'auxologia' ? 'auxologo' : 'allergologo';
  const abilitabili = (membri.dati ?? []).filter((x) => !x.amministratore && (x.ruolo === 'pediatra' || x.ruolo === 'sostituto' || x.ruolo === specialista));

  async function imposta(attiva: boolean) {
    if (!attiva && !window.confirm(`Disattivare il modulo ${m.nome}? Da subito nessuno accederà ai suoi pazienti (i dati restano conservati).`)) return;
    setEsito(null);
    const { error } = await supabase.schema('api').rpc(m.rpcImposta, { p_attiva: attiva });
    if (error) {
      return setEsito({ ok: false, testo: error.message.includes(m.rpcImposta)
        ? 'Il database non ha ancora il modulo: esegui «pnpm supabase db push» e riprova.' : error.message });
    }
    setEsito({ ok: true, testo: attiva
      ? `Modulo attivato: apri «${m.nome}» dal menu.`
      : `Modulo disattivato: da subito nessuno accede ai pazienti di ${m.nome}. I dati restano conservati.` });
    studio.ricarica();
    await supabase.auth.refreshSession(); // aggiorna il token (voce di menu)
  }

  async function abilita(x: MembroStudio, si: boolean) {
    setEsito(null);
    const { error } = await supabase.schema('api').rpc(m.rpcAbilita, { p_utente: x.utente_id, p_abilita: si });
    if (error) return setEsito({ ok: false, testo: error.message });
    setEsito({ ok: true, testo: si ? `${x.nome ?? ''} ${x.cognome ?? ''} è abilitato: ha ricevuto una notifica.` : 'Abilitazione revocata: l\'accesso è chiuso da subito.' });
    membri.ricarica();
  }

  return (
    <Pannello titolo={m.titolo} sottotitolo="Modulo con anagrafica pazienti separata, visibile solo agli amministratori e ai medici accettati"
              azione={attivo ? <Badge tono="ok">Attivo</Badge> : <Badge>Non attivo</Badge>}>
      {esito && <p role="status" className={`mb-3 rounded-lg p-3 text-sm ${esito.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{esito.testo}</p>}
      {studio.errore && <Errore messaggio={studio.errore} />}
      <div className="flex flex-wrap items-center gap-3">
        {attivo
          ? <Bottone variante="pericolo" onClick={() => void imposta(false)}>Disattiva il modulo</Bottone>
          : <Bottone variante="primario" onClick={() => void imposta(true)}>Attiva il modulo {m.nome}</Bottone>}
        <p className="text-xs text-slate-500">Attivazione, disattivazione e abilitazioni restano nel registro accessi.</p>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">Chi può usare il modulo</summary>
        <ul className="mt-1 divide-y divide-slate-100">
          {(membri.dati ?? []).filter((x) => x.amministratore).map((x) => (
            <li key={x.utente_id} className="flex items-center justify-between py-2 text-sm">
              <span>{x.nome} {x.cognome} <span className="text-slate-500">· {x.email}</span></span>
              <Badge tono="ok">Amministratore: sempre</Badge>
            </li>
          ))}
          {abilitabili.map((x) => {
            const si = x[m.colonnaMembro] === true;
            return (
              <li key={x.utente_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{x.nome} {x.cognome} <span className="text-slate-500">· {x.email} · {etichettaRuolo(x.ruolo)}</span></span>
                <span className="flex items-center gap-2">
                  {si ? <Badge tono="ok">Accettato</Badge> : <Badge>Non abilitato</Badge>}
                  {!x.attivo && <Badge tono="attenzione">Account disattivato</Badge>}
                  <Bottone variante={si ? 'pericolo' : 'secondario'} onClick={() => void abilita(x, !si)}>{si ? 'Revoca' : 'Accetta'}</Bottone>
                </span>
              </li>
            );
          })}
        </ul>
        {abilitabili.length === 0 && <Vuoto testo="Nessun altro membro abilitabile." />}
        <p className="mt-2 text-xs text-slate-500">
          Per uno specialista esterno allo studio: in «Staff e figure» aggiungilo con ruolo «{m.figura}». Vedrà solo questo modulo
          (niente assistiti, agenda o cartelle del pediatra) e dovrà configurare il secondo fattore al primo accesso. La segreteria non è abilitabile.
        </p>
      </details>
    </Pannello>
  );
}
