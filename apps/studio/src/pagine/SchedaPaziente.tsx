import {
  etaDaGiorni,
  etaInGiorni,
  etaLeggibile,
  fmtPercentile,
  percentileMisura,
  type Allergene,
  type AllergiaPaziente,
  type Appuntamento,
  type CartellaClinica,
  type ControlloCatalogo,
  type ControlloEseguito,
  type DoseCalendario,
  type TestAllergologico,
  type ClaimsApp,
  type Consenso,
  type FinalitaConsenso,
  type Misurazione,
  type Paziente,
  type Patologia,
  type PatologiaPaziente,
  type TipoRelazione,
  type Vaccinazione,
  type Visita,
} from '@pls/shared';
import { useState } from 'react';
import Allergie from '../componenti/Allergie';
import PatologieBambino from '../componenti/PatologieBambino';
import ControlliScreening from '../componenti/ControlliScreening';
import LibrettoVaccinale, { righeLibretto } from '../componenti/LibrettoVaccinale';
import { useStampa, type DatiBambino } from '../componenti/Stampa';
import { useIntestazione } from '../lib/intestazione';
import { docAllergie, docAnagrafica, docPatologie, docCrescita, docScreening, docVaccini, docVisite, type BaseDocumento } from './esportazioni';
import GraficoCrescita from '../componenti/GraficoCrescita';
import { Badge, Bottone, Caricamento, Errore, Pannello, Vuoto } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import {
  ETICHETTA_FINALITA,
  ETICHETTA_RELAZIONE,
  ETICHETTA_TIPO,
  STATO_APPUNTAMENTO,
  STATO_CONSENSO,
  fmtData,
  fmtDataOra,
  fmtGiornoIso,
  oggiIso,
} from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

interface Relazione {
  tipo: TipoRelazione;
  responsabilita_genitoriale: boolean;
  limitazioni: string | null;
  valida_al: string | null;
  tutori: { id: string; nome: string; cognome: string; email: string; telefono: string | null } | null;
}
type PazienteScheda = Paziente & { relazioni_tutela: Relazione[] };

interface DatiClinici {
  pseudo: string;
  cartella: CartellaClinica | null;
  misure: Misurazione[];
  vaccini: Vaccinazione[];
  visite: Visita[];
}

const FINALITA: FinalitaConsenso[] = ['dati_sanitari', 'portale', 'comunicazioni', 'condivisione_altro_genitore', 'whatsapp'];
const VERSIONE_INFORMATIVA = '2026-10';

const ana = () => supabase.schema('anagrafica');

/** Scheda del bambino: anagrafica, genitori e consensi, appuntamenti e (solo pediatra) cartella clinica. */
export default function SchedaPaziente({ id, claims }: { id: string; claims: ClaimsApp }) {
  const puoVedereClinica = claims.app_ruolo === 'pediatra' || claims.app_ruolo === 'sostituto';
  const [cf, setCf] = useState<string | null>(null);
  const [clinica, setClinica] = useState<DatiClinici | null>(null);
  const [erroreAzione, setErroreAzione] = useState<string | null>(null);
  const [apertura, setApertura] = useState(false);
  const { stampa, portale } = useStampa();

  const paziente = useDati(
    () =>
      q<PazienteScheda>(
        ana().from('pazienti')
          .select('id, studio_id, pediatra_id, nome, cognome, data_nascita, sesso, data_scelta_pediatra, stato, relazioni_tutela(tipo, responsabilita_genitoriale, limitazioni, valida_al, tutori(id, nome, cognome, email, telefono))')
          .eq('id', id).single(),
      ),
    [id],
  );
  const consensi = useDati(
    () => q<Consenso[]>(ana().from('consensi').select('*').eq('paziente_id', id).order('registrato_il', { ascending: false })),
    [id],
  );
  const appuntamenti = useDati(
    () => q<Appuntamento[]>(ana().from('appuntamenti').select('*').eq('paziente_id', id).order('inizio', { ascending: false }).limit(10)),
    [id],
  );

  const intestazione = useIntestazione(paziente.dati?.pediatra_id);

  async function mostraCf() {
    setErroreAzione(null);
    const { data, error } = await supabase.schema('api').rpc('codice_fiscale', { p_paziente_id: id });
    if (error) setErroreAzione(error.message);
    else setCf(data as string);
  }

  async function apriCartella() {
    setErroreAzione(null);
    setApertura(true);
    try {
      const pseudo = await q<string>(supabase.schema('api').rpc('apri_cartella', { p_paziente_id: id }));
      const cli = supabase.schema('clinica');
      const [cartella, misure, vaccini, visite] = await Promise.all([
        q<CartellaClinica | null>(cli.from('cartelle').select('*').eq('pseudo_id', pseudo).maybeSingle()),
        q<Misurazione[]>(cli.from('misurazioni').select('*').eq('pseudo_id', pseudo).order('eta_giorni', { ascending: false })),
        q<Vaccinazione[]>(cli.from('vaccinazioni').select('*').eq('pseudo_id', pseudo).order('data', { ascending: false })),
        q<Visita[]>(cli.from('visite').select('*').eq('pseudo_id', pseudo).order('data', { ascending: false }).limit(10)),
      ]);
      setClinica({ pseudo, cartella, misure, vaccini, visite });
    } catch (e) {
      setErroreAzione(e instanceof Error ? e.message : String(e));
    } finally {
      setApertura(false);
    }
  }

  async function registraConsenso(tutoreId: string, finalita: FinalitaConsenso) {
    setErroreAzione(null);
    const { error } = await ana().from('consensi').insert({
      paziente_id: id,
      tutore_id: tutoreId,
      finalita,
      versione_informativa: VERSIONE_INFORMATIVA,
      stato: 'concesso',
      canale: 'cartaceo_studio',
    });
    if (error) setErroreAzione(`Registrazione non riuscita: ${error.message}`);
    else consensi.ricarica();
  }

  async function ricaricaVaccini() {
    if (!clinica) return;
    const vaccini = await q<Vaccinazione[]>(supabase.schema('clinica').from('vaccinazioni').select('*').eq('pseudo_id', clinica.pseudo).order('data', { ascending: false }));
    setClinica({ ...clinica, vaccini });
  }

  /** Dati per l'intestazione dei documenti; il codice fiscale si legge (con traccia in audit) solo se serve. */
  async function baseDocumento(): Promise<BaseDocumento | null> {
    const p = paziente.dati;
    if (!p) return null;
    let codice = cf;
    if (!codice) {
      const { data, error } = await supabase.schema('api').rpc('codice_fiscale', { p_paziente_id: id });
      if (error) {
        setErroreAzione(error.message);
        return null;
      }
      codice = data as string;
      setCf(codice);
    }
    const bambino: DatiBambino = {
      nome: p.nome,
      cognome: p.cognome,
      sesso: p.sesso,
      dataNascita: p.data_nascita,
      codiceFiscale: codice,
      genitori: p.relazioni_tutela.filter((r) => r.tutori).map((r) => ({
        nome: r.tutori!.nome, cognome: r.tutori!.cognome, tipo: r.tipo, telefono: r.tutori!.telefono,
      })),
    };
    return { studio: intestazione.studio, medico: intestazione.medico, bambino };
  }

  async function esporta(tipo: 'anagrafica' | 'vaccini' | 'crescita' | 'screening' | 'allergie' | 'patologie' | 'visite') {
    setErroreAzione(null);
    try {
      const base = await baseDocumento();
      const p = paziente.dati;
      if (!base || !p) return;
      if (tipo === 'anagrafica') {
        const genitori = p.relazioni_tutela.filter((r) => r.tutori).map((r) => ({
          id: r.tutori!.id, nome: r.tutori!.nome, cognome: r.tutori!.cognome, tipo: r.tipo,
          email: r.tutori!.email, telefono: r.tutori!.telefono, responsabilita: r.responsabilita_genitoriale,
        }));
        return stampa(docAnagrafica(base, genitori, correntiConsensi(), appuntamenti.dati ?? []));
      }
      if (!clinica) return setErroreAzione('Apri prima la cartella clinica.');
      if (tipo === 'vaccini') {
        const cal = await q<DoseCalendario[]>(ana().from('calendario_vaccinale').select('*').order('ordine'));
        return stampa(docVaccini(base, righeLibretto(cal, clinica.vaccini, p.data_nascita)));
      }
      if (tipo === 'crescita') return stampa(docCrescita(base, p, clinica.misure));
      if (tipo === 'visite') return stampa(docVisite(base, clinica.visite));
      if (tipo === 'patologie') {
        const [righe, catalogo] = await Promise.all([
          q<PatologiaPaziente[]>(supabase.schema('clinica').from('patologie_paziente').select('*').eq('pseudo_id', clinica.pseudo).order('creato_il')),
          q<Patologia[]>(ana().from('catalogo_patologie').select('*')),
        ]);
        return stampa(docPatologie(base, righe, catalogo));
      }
      if (tipo === 'screening') {
        const [catalogo, esiti] = await Promise.all([
          q<ControlloCatalogo[]>(ana().from('catalogo_controlli').select('*').order('ordine')),
          q<ControlloEseguito[]>(supabase.schema('clinica').from('controlli_eseguiti').select('*').eq('pseudo_id', clinica.pseudo)),
        ]);
        const visibili = catalogo.filter((c) => c.destinatari === 'tutti' || (clinica.cartella?.fattori_rischio.length ?? 0) > 0);
        return stampa(docScreening(base, visibili, esiti, p.data_nascita));
      }
      const [allergie, allergeni, test] = await Promise.all([
        q<AllergiaPaziente[]>(supabase.schema('clinica').from('allergie').select('*').eq('pseudo_id', clinica.pseudo).order('creato_il')),
        q<Allergene[]>(ana().from('catalogo_allergeni').select('*')),
        q<TestAllergologico[]>(ana().from('catalogo_test_allergologici').select('*')),
      ]);
      return stampa(docAllergie(base, allergie, allergeni, test));
    } catch (e) {
      setErroreAzione(e instanceof Error ? e.message : String(e));
    }
  }

  function correntiConsensi() {
    const mappa = new Map<string, Consenso>();
    for (const c of consensi.dati ?? []) {
      const chiave = `${c.tutore_id}|${c.finalita}`;
      if (!mappa.has(chiave)) mappa.set(chiave, c);
    }
    return mappa;
  }

  if (paziente.errore) return <Errore messaggio={paziente.errore} />;
  if (paziente.caricamento || !paziente.dati) return <Caricamento righe={6} />;
  const p = paziente.dati;

  // Ultima dichiarazione per (tutore, finalità): i consensi sono uno storico.
  const correnti = correntiConsensi();

  return (
    <div className="space-y-6">
      <div>
        <a href={link('assistiti')} className="text-sm text-teal-700 underline">‹ Assistiti</a>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{p.cognome} {p.nome}</h1>
        <p className="text-sm text-slate-500">
          {p.sesso === 'M' ? 'Maschio' : 'Femmina'} · nato/a il {fmtGiornoIso(p.data_nascita)} · {etaLeggibile(p.data_nascita, oggiIso())}
        </p>
      </div>

      {portale}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-sm font-medium text-slate-700">Esporta PDF:</span>
        <Bottone onClick={() => void esporta('anagrafica')}>Anagrafica e consensi</Bottone>
        {clinica ? (
          <>
            <Bottone onClick={() => void esporta('vaccini')}>Libretto vaccinale</Bottone>
            <Bottone onClick={() => void esporta('crescita')}>Curve di crescita</Bottone>
            <Bottone onClick={() => void esporta('screening')}>Screening e controlli</Bottone>
            <Bottone onClick={() => void esporta('allergie')}>Allergie</Bottone>
            <Bottone onClick={() => void esporta('patologie')}>Patologie</Bottone>
            <Bottone onClick={() => void esporta('visite')}>Visite</Bottone>
          </>
        ) : puoVedereClinica && <span className="text-xs text-slate-500">Apri la cartella clinica per esportare i documenti clinici.</span>}
        <span className="w-full text-xs text-slate-500">Si apre la stampa del browser: scegli «Salva come PDF». Il codice fiscale nel documento viene letto con traccia nel registro.</span>
      </div>

      {erroreAzione && <Errore messaggio={erroreAzione} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Pannello titolo="Anagrafica" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">Codice fiscale</dt>
              <dd className="font-mono">
                {cf ?? (
                  <button onClick={() => void mostraCf()} className="text-teal-700 underline">
                    Mostra (l'accesso viene registrato)
                  </button>
                )}
              </dd>
            </div>
            <div><dt className="text-slate-500">In carico dal</dt><dd>{fmtGiornoIso(p.data_scelta_pediatra)}</dd></div>
            <div><dt className="text-slate-500">Stato</dt><dd className="capitalize">{p.stato}</dd></div>
          </dl>
        </Pannello>

        <Pannello titolo="Genitori e tutori" className="lg:col-span-2">
          {p.relazioni_tutela.length === 0 ? <Vuoto testo="Nessun genitore registrato." /> : (
            <ul className="divide-y divide-slate-100">
              {p.relazioni_tutela.map((r) => r.tutori && (
                <li key={r.tutori.id} className="py-2 text-sm">
                  <p className="font-medium text-slate-900">
                    {r.tutori.nome} {r.tutori.cognome}
                    <span className="ml-2 font-normal text-slate-500">{ETICHETTA_RELAZIONE[r.tipo]}</span>
                    {!r.responsabilita_genitoriale && <span className="ml-2"><Badge tono="attenzione">Senza responsabilità genitoriale</Badge></span>}
                  </p>
                  <p className="text-slate-500">{r.tutori.email}{r.tutori.telefono && ` · ${r.tutori.telefono}`}</p>
                  {r.limitazioni && <p className="mt-1 text-xs text-amber-800">⚠ {r.limitazioni}</p>}
                </li>
              ))}
            </ul>
          )}
        </Pannello>
      </div>

      <Pannello titolo="Consensi" sottotitolo={`Informativa versione ${VERSIONE_INFORMATIVA} · i consensi cartacei si registrano qui`}>
        {consensi.errore ? <Errore messaggio={consensi.errore} /> : consensi.caricamento ? <Caricamento /> : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Genitore</th>
                  {FINALITA.map((f) => <th key={f} className="px-4 py-2 font-medium">{ETICHETTA_FINALITA[f]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.relazioni_tutela.map((r) => r.tutori && (
                  <tr key={r.tutori.id}>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.tutori.nome} {r.tutori.cognome}</td>
                    {FINALITA.map((f) => {
                      const c = correnti.get(`${r.tutori!.id}|${f}`);
                      return (
                        <td key={f} className="px-4 py-2">
                          {c ? (
                            <span title={`${c.canale === 'portale' ? 'Dal portale' : 'Cartaceo in studio'} · ${fmtDataOra(c.registrato_il)}`}>
                              <Badge tono={STATO_CONSENSO[c.stato].tono}>{STATO_CONSENSO[c.stato].testo}</Badge>
                            </span>
                          ) : r.responsabilita_genitoriale ? (
                            <button onClick={() => void registraConsenso(r.tutori!.id, f)} className="text-xs text-teal-700 underline">
                              Registra
                            </button>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Pannello>

      <Pannello titolo="Appuntamenti" sottotitolo="Gli ultimi 10, dal più recente">
        {appuntamenti.errore ? <Errore messaggio={appuntamenti.errore} /> : appuntamenti.caricamento ? <Caricamento /> :
          appuntamenti.dati?.length === 0 ? <Vuoto testo="Nessun appuntamento." /> : (
          <ul className="divide-y divide-slate-100">
            {appuntamenti.dati?.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-36 tabular-nums text-slate-700">{fmtDataOra(a.inizio)}</span>
                <span className="flex-1 text-slate-800">{ETICHETTA_TIPO[a.tipo]}</span>
                <Badge tono={STATO_APPUNTAMENTO[a.stato].tono}>{STATO_APPUNTAMENTO[a.stato].testo}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Pannello>

      {!puoVedereClinica ? (
        <Pannello titolo="Cartella clinica">
          <p className="text-sm text-slate-600">
            I dati clinici sono visibili solo al pediatra titolare. Il database lo impone a ogni richiesta:
            non è solo un pulsante nascosto.
          </p>
        </Pannello>
      ) : !clinica ? (
        <Pannello titolo="Cartella clinica" sottotitolo="L'apertura viene registrata nel registro di audit">
          <Bottone variante="primario" onClick={() => void apriCartella()} disabled={apertura}>
            {apertura ? 'Apertura…' : 'Apri cartella clinica'}
          </Bottone>
        </Pannello>
      ) : (
        <CartellaAperta dati={clinica} paziente={p} onVacciniCambiati={() => void ricaricaVaccini()} />
      )}
    </div>
  );
}

function CartellaAperta({ dati, paziente, onVacciniCambiati }: { dati: DatiClinici; paziente: Paziente; onVacciniCambiati: () => void }) {
  const { pseudo, cartella, misure, vaccini, visite } = dati;
  return (
    <div className="space-y-6">
      <Pannello titolo="Cartella clinica" sottotitolo="Apertura registrata nel registro di audit">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Annotazioni libere</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {cartella?.patologie_croniche.length ? cartella.patologie_croniche.map((a) => <Badge key={a} tono="attenzione">{a}</Badge>) : 'Nessuna'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Anamnesi</dt>
            <dd className="mt-1 text-slate-700">{cartella?.note_anamnesi ?? '—'}</dd>
          </div>
        </dl>
      </Pannello>

      <Pannello titolo="Patologie ed esenzioni" sottotitolo="Malattie rare e croniche collegate al catalogo, con codice di esenzione">
        <PatologieBambino pseudoId={pseudo} />
      </Pannello>

      <Pannello titolo="Allergie" sottotitolo="Allergeni, reazione, gravità e test eseguiti">
        <Allergie pseudoId={pseudo} legacy={cartella?.allergie ?? []} />
      </Pannello>

      <Pannello titolo="Libretto vaccinale" sottotitolo="Calendario nazionale, dosi eseguite e scadenze">
        <LibrettoVaccinale pseudoId={pseudo} dataNascita={paziente.data_nascita} vaccini={vaccini} onCambiato={onVacciniCambiati} />
      </Pannello>

      <Pannello titolo="Screening e controlli" sottotitolo="Finestre raccomandate per età, esiti registrati e fonti">
        <ControlliScreening pseudoId={pseudo} dataNascita={paziente.data_nascita} fattoriRischio={cartella?.fattori_rischio ?? []} />
      </Pannello>

      <Pannello titolo="Curve di crescita" sottotitolo="Misurazioni del bambino sui percentili OMS · passa sopra un punto per i dettagli">
        <GraficoCrescita
          sesso={paziente.sesso}
          etaOggiGiorni={etaInGiorni(paziente.data_nascita, oggiIso())}
          misure={misure}
          nome={paziente.nome}
        />
      </Pannello>

      <div>
        <Pannello titolo="Misurazioni" sottotitolo="Valori e percentili OMS (informativi, non un giudizio clinico)">
          {misure.length === 0 ? <Vuoto testo="Nessuna misurazione." /> : (
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Età</th>
                    <th className="px-4 py-2 font-medium">Peso kg</th>
                    <th className="px-4 py-2 font-medium">Altezza cm</th>
                    <th className="px-4 py-2 font-medium">CC cm</th>
                    <th className="px-4 py-2 font-medium">BMI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {misure.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-1.5 text-slate-800">{etaDaGiorni(m.eta_giorni)}</td>
                      <td className="px-4 py-1.5">
                        {m.peso_kg ?? '—'}
                        {m.peso_kg !== null && <span className="ml-1 text-xs text-slate-500">{fmtPercentile(percentileMisura('peso', paziente.sesso, m.eta_giorni, m.peso_kg))}</span>}
                      </td>
                      <td className="px-4 py-1.5">
                        {m.altezza_cm ?? '—'}
                        {m.altezza_cm !== null && <span className="ml-1 text-xs text-slate-500">{fmtPercentile(percentileMisura('altezza', paziente.sesso, m.eta_giorni, m.altezza_cm))}</span>}
                      </td>
                      <td className="px-4 py-1.5">
                        {m.circonferenza_cranica_cm ?? '—'}
                        {m.circonferenza_cranica_cm !== null && <span className="ml-1 text-xs text-slate-500">{fmtPercentile(percentileMisura('circonferenza_cranica', paziente.sesso, m.eta_giorni, m.circonferenza_cranica_cm))}</span>}
                      </td>
                      <td className="px-4 py-1.5">{m.bmi ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Pannello>

      </div>

      <Pannello titolo="Visite" sottotitolo="Le ultime 10">
        {visite.length === 0 ? <Vuoto testo="Nessuna visita registrata." /> : (
          <ul className="divide-y divide-slate-100">
            {visite.map((v) => (
              <li key={v.id} className="py-2 text-sm">
                <p className="font-medium text-slate-900">
                  {fmtData(v.data)} · {v.motivo}
                </p>
                {v.esame_obiettivo && <p className="text-slate-600">{v.esame_obiettivo}</p>}
                {v.terapia && <p className="text-slate-600">Terapia: {v.terapia}</p>}
              </li>
            ))}
          </ul>
        )}
      </Pannello>
    </div>
  );
}
