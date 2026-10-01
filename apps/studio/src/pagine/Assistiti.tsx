import { etaLeggibile, type Appuntamento, type ConsensoIncompleto, type Paziente, type TipoRelazione } from '@pls/shared';
import { useState } from 'react';
import { Badge, Caricamento, Errore, Pannello, Vuoto } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { ETICHETTA_TIPO, fmtData, oggiIso } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

type PazienteElenco = Paziente & {
  relazioni_tutela: { tipo: TipoRelazione; tutori: { nome: string; cognome: string } | null }[];
};

/** Elenco degli assistiti con ricerca, genitori, stato dei consensi e prossimo appuntamento. */
export default function Assistiti() {
  const [cerca, setCerca] = useState('');
  const [filtro, setFiltro] = useState<'tutti' | 'consensi'>('tutti');

  const pazienti = useDati(
    () =>
      q<PazienteElenco[]>(
        supabase.schema('anagrafica').from('pazienti')
          .select('id, studio_id, pediatra_id, nome, cognome, data_nascita, sesso, data_scelta_pediatra, stato, relazioni_tutela(tipo, tutori(nome, cognome))')
          .order('cognome').order('nome'),
      ),
    [],
  );
  const consensi = useDati(() => q<ConsensoIncompleto[]>(supabase.schema('api').rpc('consensi_incompleti')), []);
  const prossimi = useDati(
    () =>
      q<Pick<Appuntamento, 'paziente_id' | 'inizio' | 'tipo'>[]>(
        supabase.schema('anagrafica').from('appuntamenti').select('paziente_id, inizio, tipo')
          .in('stato', ['richiesto', 'confermato']).gte('inizio', new Date().toISOString()).order('inizio'),
      ),
    [],
  );

  const incompleti = new Set((consensi.dati ?? []).map((c) => c.paziente_id));
  const prossimoPer = new Map<string, Pick<Appuntamento, 'inizio' | 'tipo'>>();
  for (const a of prossimi.dati ?? []) if (!prossimoPer.has(a.paziente_id)) prossimoPer.set(a.paziente_id, a);

  const testo = cerca.trim().toLowerCase();
  const elenco = (pazienti.dati ?? []).filter(
    (p) =>
      (!testo || `${p.cognome} ${p.nome}`.toLowerCase().includes(testo) || `${p.nome} ${p.cognome}`.toLowerCase().includes(testo)) &&
      (filtro === 'tutti' || incompleti.has(p.id)),
  );
  const oggi = oggiIso();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Assistiti</h1>
        <p className="text-sm text-slate-500">{pazienti.dati?.length ?? '…'} bambini in carico</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca per nome o cognome"
          aria-label="Cerca assistito"
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as 'tutti' | 'consensi')}
          aria-label="Filtro"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="tutti">Tutti</option>
          <option value="consensi">Con consensi incompleti</option>
        </select>
      </div>

      <Pannello titolo={`${elenco.length} risultati`}>
        {pazienti.errore ? <Errore messaggio={pazienti.errore} /> : pazienti.caricamento ? <Caricamento righe={8} /> :
          elenco.length === 0 ? <Vuoto testo="Nessun assistito corrisponde alla ricerca." /> : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Bambino</th>
                  <th className="px-4 py-2 font-medium">Età</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Genitori</th>
                  <th className="px-4 py-2 font-medium">Consensi</th>
                  <th className="px-4 py-2 font-medium">Prossimo appuntamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {elenco.map((p) => {
                  const prossimo = prossimoPer.get(p.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <a href={link('assistiti', p.id)} className="font-medium text-slate-900 hover:underline">
                          {p.cognome} {p.nome}
                        </a>
                        <span className="ml-2 text-xs text-slate-500">{p.sesso}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{etaLeggibile(p.data_nascita, oggi)}</td>
                      <td className="hidden px-4 py-2 text-slate-600 md:table-cell">
                        {p.relazioni_tutela.map((r) => r.tutori ? `${r.tutori.nome} ${r.tutori.cognome}` : '').filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-2">
                        {consensi.dati ? (
                          incompleti.has(p.id) ? <Badge tono="attenzione">Incompleti</Badge> : <Badge tono="ok">Completi</Badge>
                        ) : '…'}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {prossimo ? `${fmtData(prossimo.inizio)} · ${ETICHETTA_TIPO[prossimo.tipo]}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Pannello>
    </div>
  );
}
