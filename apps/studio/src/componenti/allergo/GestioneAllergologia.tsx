import type { ClaimsApp, MembroStudio, Studio } from '@pls/shared';
import { useState } from 'react';
import { q, useDati } from '../../lib/dati';
import { etichettaRuolo } from '../../lib/formato';
import { supabase } from '../../lib/supabase';
import { Badge, Bottone, Errore, Pannello, Vuoto } from '../ui';

type StudioAllergo = Studio & { allergologia_attiva: boolean; allergologia_attivata_il: string | null };

/**
 * Amministratore: attiva il modulo Allergologia per lo studio e accetta chi può usarlo.
 * L'allergologo esterno si aggiunge da «Staff dello studio» con ruolo «Allergologo pediatra»
 * (aggiungerlo equivale ad accettarlo); un pediatra o un sostituto si abilita qui.
 */
export default function GestioneAllergologia({ claims }: { claims: ClaimsApp }) {
  const studio = useDati(() => q<StudioAllergo>(supabase.schema('anagrafica').from('studi').select('*').single()), []);
  const membri = useDati(() => q<MembroStudio[]>(supabase.schema('anagrafica').from('membri_studio').select('*').order('cognome')), []);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

  if (!claims.app_admin) return null;
  const attivo = studio.dati?.allergologia_attiva === true;
  const abilitabili = (membri.dati ?? []).filter((m) => !m.amministratore && m.ruolo !== 'segreteria');

  async function modulo(attiva: boolean) {
    setEsito(null);
    const { error } = await supabase.schema('api').rpc('imposta_allergologia', { p_attiva: attiva });
    if (error) return setEsito({ ok: false, testo: error.message });
    setEsito({ ok: true, testo: attiva
      ? 'Modulo attivato: apri «Allergologia» dal menu.'
      : 'Modulo disattivato: da subito nessuno accede ai pazienti allergologici. I dati restano conservati.' });
    studio.ricarica();
    await supabase.auth.refreshSession(); // aggiorna il token (app_allergologia)
  }

  async function abilita(m: MembroStudio, si: boolean) {
    setEsito(null);
    const { error } = await supabase.schema('api').rpc('abilita_allergologia', { p_utente: m.utente_id, p_abilita: si });
    if (error) return setEsito({ ok: false, testo: error.message });
    setEsito({ ok: true, testo: si ? `${m.nome ?? ''} ${m.cognome ?? ''} è abilitato: ha ricevuto una notifica.` : 'Abilitazione revocata: l\'accesso è chiuso da subito.' });
    membri.ricarica();
  }

  return (
    <Pannello titolo="Allergologia pediatrica" sottotitolo="Modulo con anagrafica pazienti separata, visibile solo agli amministratori e agli allergologi accettati"
              azione={attivo ? <Badge tono="ok">Attivo</Badge> : <Badge>Non attivo</Badge>}>
      {esito && <p role="status" className={`mb-3 rounded-lg p-3 text-sm ${esito.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{esito.testo}</p>}
      {studio.errore && <Errore messaggio={studio.errore} />}
      <div className="flex flex-wrap items-center gap-3">
        {attivo
          ? <Bottone variante="pericolo" onClick={() => void modulo(false)}>Disattiva il modulo</Bottone>
          : <Bottone variante="primario" onClick={() => void modulo(true)}>Attiva il modulo Allergologia</Bottone>}
        <p className="text-xs text-slate-500">Attivazione, disattivazione e abilitazioni restano nel registro accessi.</p>
      </div>

      <p className="mb-1 mt-4 text-sm font-medium text-slate-800">Chi può usare il modulo</p>
      <ul className="divide-y divide-slate-100">
        {(membri.dati ?? []).filter((m) => m.amministratore).map((m) => (
          <li key={m.utente_id} className="flex items-center justify-between py-2 text-sm">
            <span>{m.nome} {m.cognome} <span className="text-slate-500">· {m.email}</span></span>
            <Badge tono="ok">Amministratore: sempre</Badge>
          </li>
        ))}
        {abilitabili.map((m) => (
          <li key={m.utente_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>{m.nome} {m.cognome} <span className="text-slate-500">· {m.email} · {etichettaRuolo(m.ruolo)}</span></span>
            <span className="flex items-center gap-2">
              {m.allergologia ? <Badge tono="ok">Accettato</Badge> : <Badge>Non abilitato</Badge>}
              {!m.attivo && <Badge tono="attenzione">Account disattivato</Badge>}
              <Bottone variante={m.allergologia ? 'pericolo' : 'secondario'} onClick={() => void abilita(m, !m.allergologia)}>
                {m.allergologia ? 'Revoca' : 'Accetta'}
              </Bottone>
            </span>
          </li>
        ))}
      </ul>
      {abilitabili.length === 0 && <Vuoto testo="Nessun altro membro abilitabile." />}
      <p className="mt-2 text-xs text-slate-500">
        Per un'allergologa esterna allo studio: in «Staff dello studio» aggiungila con ruolo «Allergologo pediatra». Vedrà solo questo modulo
        (niente assistiti, agenda o cartelle del pediatra) e dovrà configurare il secondo fattore al primo accesso. La segreteria non è abilitabile.
      </p>
    </Pannello>
  );
}
