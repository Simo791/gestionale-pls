import type {
  Appuntamento,
  BilancioInScadenza,
  ClaimsApp,
  ConsensoIncompleto,
  ControlloInScadenza,
  EsitoVerificaAudit,
  EventoAttivita,
  Paziente,
} from '@pls/shared';
import { useState } from 'react';
import AccessoRapido from '../componenti/AccessoRapido';
import { NotificheNonLette } from '../componenti/Notifiche';
import TurnoSostituzione from '../componenti/TurnoSostituzione';
import { Badge, Bottone, Caricamento, Errore, Kpi, Tendina, Vuoto } from '../componenti/ui';
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
  const isPediatra = claims.app_ruolo === 'pediatra' || claims.app_admin;
  const [accessoRapido, setAccessoRapido] = useState(false);

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

  const daRichiamare = useDati(async () => {
    const oggi = new Date();
    const iso = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`;
    const { count, error } = await ana().from('richiami').select('id', { count: 'exact', head: true })
      .eq('stato', 'aperto').lte('ricontattare_dal', iso);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, []);

  const bilanci = useDati(() => q<BilancioInScadenza[]>(api().rpc('bilanci_in_scadenza', { p_giorni: 60 })), []);
  const consensi = useDati(() => q<ConsensoIncompleto[]>(api().rpc('consensi_incompleti')), []);
  const audit = useDati(
    async () => (isPediatra ? (await q<EsitoVerificaAudit[]>(api().rpc('verifica_audit')))[0] ?? null : null),
    [isPediatra],
  );
  const controlli = useDati(
    async () => (isPediatra ? q<ControlloInScadenza[]>(api().rpc('controlli_in_scadenza', { p_giorni: 30 })) : []),
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
          <h1 className="text-2xl font-semibold text-slate-900">Home</h1>
          <p className="text-sm capitalize text-slate-500">{fmtGiornoLungo(new Date())}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isPediatra && integro !== null && (
            <a href={link('registro')}>
              <Badge tono={integro ? 'ok' : 'errore'}>
                {integro ? `Registro di audit integro · ${audit.dati?.eventi_verificati} eventi` : 'Registro di audit ALTERATO'}
              </Badge>
            </a>
          )}
          <Bottone variante="primario" onClick={() => setAccessoRapido(true)}>+ Urgenza / senza appuntamento</Bottone>
        </div>
      </div>

      <TurnoSostituzione claims={claims} />
      <NotificheNonLette />

      {accessoRapido && <AccessoRapido claims={claims} onChiudi={() => setAccessoRapido(false)} />}

      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi etichetta="Appuntamenti oggi" valore={oggi.dati?.length ?? '…'}
             nota={daConfermareOggi ? `${daConfermareOggi} da confermare` : oggi.dati?.length ? 'Tutti confermati' : 'Nessun appuntamento'}
             tono="info" href={link('agenda')} />
        <Kpi etichetta="Richieste da confermare" valore={richieste.dati ?? '…'}
             nota="Prenotazioni future in attesa" tono={richieste.dati ? 'attenzione' : 'ok'} href={link('agenda')} />
        <Kpi etichetta="Da ricontattare" valore={daRichiamare.dati ?? '…'}
             nota="Genitori da richiamare oggi" tono={daRichiamare.dati ? 'attenzione' : 'ok'} href={link('agenda')} />
      </section>

      <div className="space-y-3">
        <Tendina titolo="Agenda di oggi" sottotitolo="Appuntamenti non annullati" aperta
                 conteggio={oggi.dati?.length ?? '…'} tono={daConfermareOggi ? 'attenzione' : 'info'}
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
        </Tendina>

        <Tendina titolo="Bilanci di salute da programmare" sottotitolo="Prossimi 60 giorni, senza appuntamento"
                 conteggio={bilanci.dati?.length ?? '…'} tono={bilanciInRitardo ? 'attenzione' : 'neutro'}>
          {bilanci.errore ? <Errore messaggio={bilanci.errore} /> : bilanci.caricamento ? <Caricamento /> :
            bilanci.dati?.length === 0 ? <Vuoto testo="Nessun bilancio da programmare." /> : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
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
        </Tendina>

        <Tendina titolo="Consensi da completare" sottotitolo="Dati sanitari e portale genitori"
                 conteggio={consensi.dati ? pazientiConsensiIncompleti : '…'} tono={pazientiConsensiIncompleti ? 'attenzione' : 'ok'}
                 azione={<a href={link('consensi')} className="text-sm text-teal-700 underline">Vedi tutti</a>}>
          {consensi.errore ? <Errore messaggio={consensi.errore} /> : consensi.caricamento ? <Caricamento /> :
            consensi.dati?.length === 0 ? <Vuoto testo="Tutti i consensi sono completi." /> : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {consensi.dati?.map((c) => (
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
        </Tendina>

        {isPediatra && (
          <Tendina titolo="Screening e controlli in scadenza" sottotitolo="Prossimi 30 giorni e scaduti senza esito"
                   conteggio={controlli.dati?.length ?? '…'} tono={(controlli.dati ?? []).some((c) => c.scaduto) ? 'errore' : 'neutro'}>
            {controlli.errore ? <Errore messaggio={controlli.errore} /> : controlli.caricamento ? <Caricamento /> :
              controlli.dati?.length === 0 ? <Vuoto testo="Nessun controllo in scadenza." /> : (
              <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {controlli.dati?.map((c) => (
                  <li key={`${c.paziente_id}-${c.codice}`} className="flex items-center gap-3 py-2 text-sm">
                    <a href={link('assistiti', c.paziente_id)} className="flex-1 truncate text-slate-800 hover:underline">
                      {c.cognome} {c.nome}
                      <span className="ml-2 text-slate-500">{c.controllo}</span>
                    </a>
                    <span className="tabular-nums text-slate-600">entro {fmtGiornoIso(c.al)}</span>
                    {c.scaduto && <Badge tono="errore">Scaduto</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Tendina>
        )}

        {isPediatra && (
          <Tendina titolo="Attività recente" sottotitolo="Ultimi eventi del registro di audit" conteggio={attivita.dati?.length ?? '…'}
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
          </Tendina>
        )}
      </div>
    </div>
  );
}
