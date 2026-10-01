import type {
  Appuntamento,
  BilancioInScadenza,
  ClaimsApp,
  ConsensoIncompleto,
  EsitoVerificaAudit,
  EventoAttivita,
  Paziente,
} from '@pls/shared';
import { Badge, Caricamento, Errore, Kpi, Pannello, Vuoto } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import {
  ETICHETTA_FINALITA,
  ETICHETTA_TIPO,
  STATO_APPUNTAMENTO,
  etichettaAzione,
  etichettaRuolo,
  etichettaTabella,
  fmtDataOra,
  fmtGiornoIso,
  fmtGiornoLungo,
  fmtOra,
} from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

type AppConPaziente = Appuntamento & { pazienti: Pick<Paziente, 'nome' | 'cognome'> | null };

const ana = () => supabase.schema('anagrafica');
const api = () => supabase.schema('api');

function confiniOggi() {
  const inizio = new Date();
  inizio.setHours(0, 0, 0, 0);
  const fine = new Date(inizio);
  fine.setDate(fine.getDate() + 1);
  return { inizio: inizio.toISOString(), fine: fine.toISOString() };
}

export default function Cruscotto({ claims }: { claims: ClaimsApp }) {
  const isPediatra = claims.app_ruolo === 'pediatra';

  const oggi = useDati(async () => {
    const { inizio, fine } = confiniOggi();
    return q<AppConPaziente[]>(
      ana().from('appuntamenti').select('*, pazienti(nome, cognome)')
        .gte('inizio', inizio).lt('inizio', fine).neq('stato', 'annullato').order('inizio'),
    );
  }, []);

  const richieste = useDati(async () => {
    const { count, error } = await ana().from('appuntamenti')
      .select('id', { count: 'exact', head: true })
      .eq('stato', 'richiesto').gte('inizio', new Date().toISOString());
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, []);

  const bilanci = useDati(() => q<BilancioInScadenza[]>(api().rpc('bilanci_in_scadenza', { p_giorni: 60 })), []);
  const consensi = useDati(() => q<ConsensoIncompleto[]>(api().rpc('consensi_incompleti')), []);
  const audit = useDati(
    async () => (isPediatra ? (await q<EsitoVerificaAudit[]>(api().rpc('verifica_audit')))[0] ?? null : null),
    [isPediatra],
  );
  const attivita = useDati(
    async () => (isPediatra ? q<EventoAttivita[]>(api().rpc('attivita_recente', { p_limite: 8 })) : []),
    [isPediatra],
  );

  const pazientiConsensiIncompleti = new Set((consensi.dati ?? []).map((c) => c.paziente_id)).size;
  const daConfermareOggi = (oggi.dati ?? []).filter((a) => a.stato === 'richiesto').length;
  const bilanciInRitardo = (bilanci.dati ?? []).filter((b) => b.in_ritardo).length;
  const integro = audit.dati ? audit.dati.primo_evento_non_valido === null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Cruscotto</h1>
          <p className="text-sm capitalize text-slate-500">{fmtGiornoLungo(new Date())}</p>
        </div>
        {isPediatra && integro !== null && (
          <a href={link('registro')}>
            <Badge tono={integro ? 'ok' : 'errore'}>
              {integro ? `Registro di audit integro · ${audit.dati?.eventi_verificati} eventi` : 'Registro di audit ALTERATO'}
            </Badge>
          </a>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi etichetta="Appuntamenti oggi" valore={oggi.dati?.length ?? '…'}
             nota={daConfermareOggi ? `${daConfermareOggi} da confermare` : 'Tutti confermati'}
             tono="info" href={link('agenda')} />
        <Kpi etichetta="Richieste da confermare" valore={richieste.dati ?? '…'}
             nota="Prenotazioni future in attesa" tono={richieste.dati ? 'attenzione' : 'ok'} href={link('agenda')} />
        <Kpi etichetta="Bilanci di salute da programmare" valore={bilanci.dati?.length ?? '…'}
             nota={bilanciInRitardo ? `${bilanciInRitardo} in ritardo` : 'Prossimi 60 giorni'}
             tono={bilanciInRitardo ? 'attenzione' : 'neutro'} />
        <Kpi etichetta="Consensi incompleti" valore={consensi.dati ? pazientiConsensiIncompleti : '…'}
             nota="Bambini con un genitore che non ha firmato" tono={pazientiConsensiIncompleti ? 'attenzione' : 'ok'}
             href={link('consensi')} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Pannello titolo="Agenda di oggi" sottotitolo="Appuntamenti non annullati"
                  azione={<a href={link('agenda')} className="text-sm text-teal-700 underline">Apri agenda</a>}>
          {oggi.errore ? <Errore messaggio={oggi.errore} /> : oggi.caricamento ? <Caricamento /> :
            oggi.dati?.length === 0 ? <Vuoto testo="Nessun appuntamento oggi." /> : (
            <ul className="divide-y divide-slate-100">
              {oggi.dati?.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-12 font-medium tabular-nums text-slate-900">{fmtOra(a.inizio)}</span>
                  <a href={link('assistiti', a.paziente_id)} className="flex-1 truncate text-slate-800 hover:underline">
                    {a.pazienti ? `${a.pazienti.cognome} ${a.pazienti.nome}` : '—'}
                    <span className="ml-2 text-slate-500">{ETICHETTA_TIPO[a.tipo]}</span>
                  </a>
                  <Badge tono={STATO_APPUNTAMENTO[a.stato].tono}>{STATO_APPUNTAMENTO[a.stato].testo}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Pannello>

        <Pannello titolo="Bilanci di salute da programmare" sottotitolo="Scadenze nei prossimi 60 giorni senza appuntamento">
          {bilanci.errore ? <Errore messaggio={bilanci.errore} /> : bilanci.caricamento ? <Caricamento /> :
            bilanci.dati?.length === 0 ? <Vuoto testo="Nessun bilancio da programmare." /> : (
            <ul className="divide-y divide-slate-100">
              {bilanci.dati?.map((b) => (
                <li key={`${b.paziente_id}-${b.eta_mesi}`} className="flex items-center gap-3 py-2 text-sm">
                  <a href={link('assistiti', b.paziente_id)} className="flex-1 truncate text-slate-800 hover:underline">
                    {b.cognome} {b.nome}
                    <span className="ml-2 text-slate-500">{b.descrizione}</span>
                  </a>
                  <span className="tabular-nums text-slate-600">{fmtGiornoIso(b.data_prevista)}</span>
                  {b.in_ritardo && <Badge tono="attenzione">In ritardo</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Pannello>

        <Pannello titolo="Consensi da completare" sottotitolo="Dati sanitari e portale genitori"
                  azione={<a href={link('consensi')} className="text-sm text-teal-700 underline">Vedi tutti</a>}>
          {consensi.errore ? <Errore messaggio={consensi.errore} /> : consensi.caricamento ? <Caricamento /> :
            consensi.dati?.length === 0 ? <Vuoto testo="Tutti i consensi sono completi." /> : (
            <ul className="divide-y divide-slate-100">
              {consensi.dati?.slice(0, 6).map((c) => (
                <li key={`${c.paziente_id}-${c.finalita}`} className="py-2 text-sm">
                  <a href={link('assistiti', c.paziente_id)} className="text-slate-800 hover:underline">
                    {c.cognome} {c.nome}
                  </a>
                  <span className="ml-2 text-slate-500">{ETICHETTA_FINALITA[c.finalita]}</span>
                  <p className="text-xs text-slate-500">Manca: {c.mancanti.join(', ') || 'nessun genitore con responsabilità registrato'}</p>
                </li>
              ))}
            </ul>
          )}
        </Pannello>

        {isPediatra ? (
          <Pannello titolo="Attività recente" sottotitolo="Dal registro di audit"
                    azione={<a href={link('registro')} className="text-sm text-teal-700 underline">Registro completo</a>}>
            {attivita.errore ? <Errore messaggio={attivita.errore} /> : attivita.caricamento ? <Caricamento /> :
              attivita.dati?.length === 0 ? <Vuoto testo="Nessuna attività." /> : (
              <ul className="divide-y divide-slate-100">
                {attivita.dati?.map((e, i) => (
                  <li key={i} className="py-2 text-sm">
                    <span className="text-slate-800">{etichettaAzione(e.azione)}</span>
                    <span className="text-slate-500"> · {etichettaTabella(e.tabella)}</span>
                    {e.paziente && <span className="text-slate-500"> · {e.paziente}</span>}
                    <p className="text-xs text-slate-500">{fmtDataOra(e.avvenuto_il)} · {etichettaRuolo(e.ruolo)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Pannello>
        ) : (
          <Pannello titolo="Privacy" sottotitolo="Cosa vede la segreteria">
            <p className="text-sm text-slate-600">
              Anagrafiche, agenda e consensi. Le cartelle cliniche sono visibili solo al pediatra titolare,
              e ogni accesso ai dati sensibili, incluso il codice fiscale, viene registrato.
            </p>
          </Pannello>
        )}
      </div>
    </div>
  );
}
