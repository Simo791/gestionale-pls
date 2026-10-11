import {
  etaDaGiorni,
  etaInGiorni,
  etaEstesa,
  fmtPercentile,
  percentileMisura,
  type Allergene,
  type AllergiaPaziente,
  type Appuntamento,
  type CartellaClinica,
  type Certificato,
  type Diagnosi,
  type ControlloCatalogo,
  type ControlloEseguito,
  type DoseCalendario,
  type TestAllergologico,
  type ClaimsApp,
  type Consenso,
  type FinalitaConsenso,
  type Misurazione,
  type Paziente,
  type Prescrizione,
  type Patologia,
  type PatologiaPaziente,
  type TipoRelazione,
  type Vaccinazione,
  type Visita,
} from '@pls/shared';
import { useEffect, useState } from 'react';
import Allergie from '../componenti/Allergie';
import PatologieBambino from '../componenti/PatologieBambino';
import Prescrizioni from '../componenti/Prescrizioni';
import VisitaOdierna, { parametriVitali } from '../componenti/VisitaOdierna';
import ControlliScreening from '../componenti/ControlliScreening';
import LibrettoVaccinale, { righeLibretto, type RigaLibretto } from '../componenti/LibrettoVaccinale';
import { useStampa, type DatiBambino } from '../componenti/Stampa';
import { useIntestazione } from '../lib/intestazione';
import { docAllergie, docAnagrafica, docAvvisoVaccino, docDietaEsclusione, docDietaSpeciale, docPatologie, docPrescrizione, docVisita, docCrescita, docScreening, docVaccini, docVisite, type BaseDocumento } from './esportazioni';
import GraficoCrescita, { riferimentoEffettivo, type SceltaCurva } from '../componenti/GraficoCrescita';
import CertificatoDieta, { type AllergeneCertificato, type ContenutoDieta } from '../componenti/CertificatoDieta';
import DettaglioVisita from '../componenti/DettaglioVisita';
import Finestra from '../componenti/Finestra';
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
  certificati: Certificato[];
}

type Dettaglio =
  | { tipo: 'visita'; visita: Visita }
  | { tipo: 'nessuna_visita'; data: string }
  | { tipo: 'certificati'; data: string; elenco: Certificato[] };

const FINALITA: FinalitaConsenso[] = ['dati_sanitari', 'portale', 'comunicazioni', 'condivisione_altro_genitore', 'whatsapp'];
const VERSIONE_INFORMATIVA = '2026-10';

const ana = () => supabase.schema('anagrafica');

/** Scheda del bambino: anagrafica, genitori e consensi, appuntamenti e (solo pediatra) cartella clinica. */
export default function SchedaPaziente({ id, claims, azione }: { id: string; claims: ClaimsApp; azione?: string }) {
  const puoVedereClinica = claims.app_ruolo === 'pediatra' || claims.app_ruolo === 'sostituto';
  const [cf, setCf] = useState<string | null>(null);
  const [clinica, setClinica] = useState<DatiClinici | null>(null);
  const [erroreAzione, setErroreAzione] = useState<string | null>(null);
  const [apertura, setApertura] = useState(false);
  const [visitaAperta, setVisitaAperta] = useState(azione === 'visita');
  const [curva, setCurva] = useState<SceltaCurva>('auto');
  const [dettaglio, setDettaglio] = useState<Dettaglio | null>(null);
  const [certificato, setCertificato] = useState<{ tipo: 'dieta_speciale' | 'dieta_esclusione'; allergie: AllergeneCertificato[]; scelte: string[] } | null>(null);
  const diagnosi = useDati(() => q<Diagnosi[]>(supabase.schema('anagrafica').from('catalogo_diagnosi').select('*')), []);
  const [ultimaSalvata, setUltimaSalvata] = useState<{ visita: Visita; misura: Misurazione | null } | null>(null);
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
      await caricaClinica(pseudo);
    } catch (e) {
      setErroreAzione(e instanceof Error ? e.message : String(e));
    } finally {
      setApertura(false);
    }
  }

  /** Legge i dati clinici dello pseudonimo già ottenuto (senza registrare una nuova apertura). */
  async function caricaClinica(pseudo: string) {
    {
      const cli = supabase.schema('clinica');
      const [cartella, misure, vaccini, visite, certificati] = await Promise.all([
        q<CartellaClinica | null>(cli.from('cartelle').select('*').eq('pseudo_id', pseudo).maybeSingle()),
        q<Misurazione[]>(cli.from('misurazioni').select('*').eq('pseudo_id', pseudo).order('eta_giorni', { ascending: false })),
        q<Vaccinazione[]>(cli.from('vaccinazioni').select('*').eq('pseudo_id', pseudo).order('data', { ascending: false })),
        q<Visita[]>(cli.from('visite').select('*').eq('pseudo_id', pseudo).order('data', { ascending: false })),
        q<Certificato[]>(cli.from('certificati').select('*').eq('pseudo_id', pseudo).order('data', { ascending: false })),
      ]);
      setClinica({ pseudo, cartella, misure, vaccini, visite, certificati });
    }
  }

  // Arrivo da "Urgenza / senza appuntamento": apre subito cartella e visita odierna.
  useEffect(() => {
    if (azione === 'visita' && puoVedereClinica) void apriCartella();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const esenzioni = useDati(async () => {
    if (!clinica) return [];
    const righe = await q<{ patologia: string }[]>(supabase.schema('clinica').from('patologie_paziente')
      .select('patologia').eq('pseudo_id', clinica.pseudo).eq('stato', 'confermata'));
    if (righe.length === 0) return [];
    const cat = await q<{ codice: string; nome: string; esenzione: string | null }[]>(
      ana().from('catalogo_patologie').select('codice, nome, esenzione').in('codice', righe.map((r) => r.patologia)));
    return cat.filter((c) => c.esenzione).map((c) => ({ codice: c.esenzione!, nome: c.nome }));
  }, [clinica?.pseudo]);

  async function stampaClinico(costruisci: (b: BaseDocumento) => ReturnType<typeof docVisita>) {
    setErroreAzione(null);
    const base = await baseDocumento();
    if (base) stampa(costruisci(base));
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
      if (tipo === 'crescita') return stampa(docCrescita(base, p, clinica.misure, curva));
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

  /** Clic su un appuntamento: apre la visita registrata quel giorno o i certificati rilasciati. */
  function apriAppuntamento(a: Appuntamento) {
    setErroreAzione(null);
    if (!clinica) return setErroreAzione('Apri la cartella clinica (in alto) per vedere visite e certificati.');
    const giorno = fmtData(a.inizio);
    const stessoGiorno = (iso: string) => fmtData(iso) === fmtData(a.inizio);
    if (a.tipo === 'certificato') {
      return setDettaglio({ tipo: 'certificati', data: giorno, elenco: clinica.certificati.filter((c) => fmtGiornoIso(c.data) === fmtData(a.inizio)) });
    }
    const v = clinica.visite.find((x) => x.appuntamento_id === a.id) ?? clinica.visite.find((x) => stessoGiorno(x.data));
    setDettaglio(v ? { tipo: 'visita', visita: v } : { tipo: 'nessuna_visita', data: fmtData(a.inizio) });
  }

  function stampaCertificato(c: Certificato) {
    const contenuto = c.contenuto as unknown as ContenutoDieta;
    if (c.tipo === 'dieta_speciale') void stampaClinico((b) => docDietaSpeciale({ ...b, dataDocumento: c.data }, contenuto, c.valido_fino));
    else if (c.tipo === 'dieta_esclusione') void stampaClinico((b) => docDietaEsclusione({ ...b, dataDocumento: c.data }, contenuto));
  }

  const descrizioniDiagnosi = new Map((diagnosi.dati ?? []).map((d) => [d.codice, d.descrizione]));

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
        <p className="mt-1 text-lg text-slate-800">
          Nato/a il <span className="font-semibold tabular-nums">{fmtGiornoIso(p.data_nascita)}</span>
          <span className="mx-2 text-slate-300">·</span>
          <span className="font-semibold">{etaEstesa(p.data_nascita, oggiIso())}</span>
        </p>
        <p className="text-sm text-slate-500">{p.sesso === 'M' ? 'Maschio' : 'Femmina'}</p>
      </div>

      {puoVedereClinica && !clinica && (
        <Pannello titolo="Cartella clinica" sottotitolo="Curve di crescita, visite e dati clinici · l'apertura viene registrata nel registro di audit">
          <Bottone variante="primario" onClick={() => void apriCartella()} disabled={apertura}>
            {apertura ? 'Apertura…' : 'Apri cartella clinica'}
          </Bottone>
        </Pannello>
      )}

      {clinica && (
        <Pannello titolo="Curve di crescita" sottotitolo="Passa sopra un punto per i dettagli">
          <GraficoCrescita sesso={p.sesso} etaOggiGiorni={etaInGiorni(p.data_nascita, oggiIso())} misure={clinica.misure}
                           nome={p.nome} curva={curva} onCurva={setCurva} />
          <details className="group mt-3 rounded-lg border border-slate-200">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700">
              <span className="transition group-open:rotate-90" aria-hidden="true">▶</span>
              Misurazioni ({clinica.misure.length})
            </summary>
            <TabellaMisure misure={clinica.misure} sesso={p.sesso} curva={curva} />
          </details>
        </Pannello>
      )}

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

      <Pannello titolo="Appuntamenti" sottotitolo="Gli ultimi 10 · clicca su una visita o un certificato passato per aprirlo">
        {appuntamenti.errore ? <Errore messaggio={appuntamenti.errore} /> : appuntamenti.caricamento ? <Caricamento /> :
          appuntamenti.dati?.length === 0 ? <Vuoto testo="Nessun appuntamento." /> : (
          <ul className="divide-y divide-slate-100">
            {appuntamenti.dati?.map((a) => {
              const cliccabile = puoVedereClinica && (a.stato === 'svolto' || a.tipo === 'certificato' || new Date(a.inizio) < new Date());
              const contenuto = (
                <>
                  <span className="w-36 tabular-nums text-slate-700">{fmtDataOra(a.inizio)}</span>
                  <span className={`flex-1 ${cliccabile ? 'text-teal-800 underline decoration-teal-300 underline-offset-2' : 'text-slate-800'}`}>{ETICHETTA_TIPO[a.tipo]}</span>
                  <Badge tono={STATO_APPUNTAMENTO[a.stato].tono}>{STATO_APPUNTAMENTO[a.stato].testo}</Badge>
                </>
              );
              return (
                <li key={a.id}>
                  {cliccabile
                    ? <button onClick={() => apriAppuntamento(a)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-slate-50">{contenuto}</button>
                    : <div className="flex items-center gap-3 py-2 text-sm">{contenuto}</div>}
                </li>
              );
            })}
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
      ) : !clinica ? null : (
        <>
          <Pannello titolo="Visita odierna" sottotitolo={`${fmtGiornoIso(oggiIso())} · ultima visita, promemoria per i genitori, misure e parametri`}
                    azione={!visitaAperta && <Bottone variante="primario" onClick={() => { setVisitaAperta(true); setUltimaSalvata(null); }}>Inizia visita</Bottone>}>
            {visitaAperta ? (
              <VisitaOdierna
                pseudo={clinica.pseudo} paziente={p} cartella={clinica.cartella} misure={clinica.misure}
                vaccini={clinica.vaccini} visite={clinica.visite}
                genitori={p.relazioni_tutela.filter((r) => r.tutori).map((r) => ({ nome: `${r.tutori!.nome} ${r.tutori!.cognome}`, tipo: r.tipo }))}
                onChiudi={() => setVisitaAperta(false)}
                onSalvata={(visita, misura) => { setUltimaSalvata({ visita, misura }); setVisitaAperta(false); void caricaClinica(clinica.pseudo); }}
              />
            ) : ultimaSalvata ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-emerald-800">Visita salvata{ultimaSalvata.misura ? ' con le misure' : ''}.</span>
                <Bottone onClick={() => void stampaClinico((b) => docVisita(b, ultimaSalvata.visita, ultimaSalvata.misura, p.sesso))}>Referto PDF</Bottone>
                <a href="#prescrizioni" className="text-teal-700 underline">Prescrivi esami o visite</a>
                {ultimaSalvata.visita.prossimo_controllo && <a href={link('agenda')} className="text-teal-700 underline">Fissa il controllo del {fmtGiornoIso(ultimaSalvata.visita.prossimo_controllo)} in agenda</a>}
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                {clinica.visite[0] ? `Ultima visita il ${fmtData(clinica.visite[0].data)}: ${clinica.visite[0].motivo}.` : 'Nessuna visita registrata.'}
              </p>
            )}
          </Pannello>

          <div id="prescrizioni">
            <Pannello titolo="Prescrizioni" sottotitolo="Visite ed esami dal catalogo regionale · promemoria per la ricetta elettronica">
              <Prescrizioni
                key={ultimaSalvata?.visita.id ?? 'nessuna'}
                claims={claims} pseudoId={clinica.pseudo} visitaId={ultimaSalvata?.visita.id}
                esenzioni={esenzioni.dati ?? []}
                onStampa={(pr: Prescrizione) => void stampaClinico((b) => docPrescrizione(b, pr))}
              />
            </Pannello>
          </div>

          <CartellaAperta dati={clinica} paziente={p} onVacciniCambiati={() => void ricaricaVaccini()}
                          onApriVisita={(v) => setDettaglio({ tipo: 'visita', visita: v })}
                          onCertificato={(c) => stampaCertificato(c)}
                          onStampaAvviso={(r) => void stampaClinico((b) => docAvvisoVaccino(b, r))}
                          onDocumentoAllergia={(tipo, allergie, scelte) => setCertificato({ tipo, allergie, scelte })}
                          onReferto={(v) => void stampaClinico((b) => docVisita(b, v, clinica.misure.find((m) => m.visita_id === v.id) ?? null, p.sesso))} />
        </>
      )}

      {dettaglio && clinica && (
        <Finestra larga titolo={dettaglio.tipo === 'visita' ? `Visita del ${fmtData(dettaglio.visita.data)}` : dettaglio.tipo === 'certificati' ? `Certificati del ${dettaglio.data}` : `Appuntamento del ${dettaglio.data}`}
                  onChiudi={() => setDettaglio(null)}>
          {dettaglio.tipo === 'visita' && (
            <DettaglioVisita v={dettaglio.visita} sesso={p.sesso} descrizioni={descrizioniDiagnosi}
                             misura={clinica.misure.find((m) => m.visita_id === dettaglio.visita.id) ?? null}
                             onReferto={() => void stampaClinico((b) => docVisita(b, dettaglio.visita, clinica.misure.find((m) => m.visita_id === dettaglio.visita.id) ?? null, p.sesso))} />
          )}
          {dettaglio.tipo === 'nessuna_visita' && <p className="text-sm text-slate-600">Nessuna visita registrata in cartella per questa data.</p>}
          {dettaglio.tipo === 'certificati' && (dettaglio.elenco.length === 0
            ? <p className="text-sm text-slate-600">Nessun certificato registrato in cartella per questa data.</p>
            : <ElencoCertificati elenco={dettaglio.elenco} onStampa={stampaCertificato} />)}
        </Finestra>
      )}

      {certificato && clinica && (
        <Finestra titolo={certificato.tipo === 'dieta_speciale' ? 'Certificato dieta speciale (scuola / mensa)' : 'Dieta di esclusione'}
                  onChiudi={() => setCertificato(null)}>
          <CertificatoDieta pseudoId={clinica.pseudo} tipo={certificato.tipo} allergie={certificato.allergie} preselezionate={certificato.scelte}
                            onSalvato={(c) => { setCertificato(null); setClinica({ ...clinica, certificati: [c, ...clinica.certificati] }); stampaCertificato(c); }} />
        </Finestra>
      )}
    </div>
  );
}

function CartellaAperta({ dati, paziente, onVacciniCambiati, onReferto, onApriVisita, onCertificato, onDocumentoAllergia, onStampaAvviso }: {
  onStampaAvviso: (r: RigaLibretto) => void;
  dati: DatiClinici; paziente: Paziente; onVacciniCambiati: () => void; onReferto: (v: Visita) => void;
  onApriVisita: (v: Visita) => void; onCertificato: (c: Certificato) => void;
  onDocumentoAllergia: (tipo: 'dieta_speciale' | 'dieta_esclusione', allergie: AllergeneCertificato[], scelte: string[]) => void;
}) {
  const { pseudo, cartella, vaccini, visite, certificati } = dati;
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

      <Pannello titolo="Allergie" sottotitolo="Allergeni, reazione, gravità e test · certificato mensa e dieta di esclusione">
        <Allergie pseudoId={pseudo} legacy={cartella?.allergie ?? []} onDocumento={onDocumentoAllergia} />
      </Pannello>

      <Pannello titolo="Libretto vaccinale" sottotitolo="Calendario nazionale, dosi eseguite e scadenze">
        <LibrettoVaccinale pseudoId={pseudo} dataNascita={paziente.data_nascita} vaccini={vaccini} onCambiato={onVacciniCambiati} onStampaAvviso={onStampaAvviso} />
      </Pannello>

      <Pannello titolo="Screening e controlli" sottotitolo="Finestre raccomandate per età, esiti registrati e fonti">
        <ControlliScreening pseudoId={pseudo} dataNascita={paziente.data_nascita} fattoriRischio={cartella?.fattori_rischio ?? []} />
      </Pannello>

      <Pannello titolo={`Visite (${visite.length})`} sottotitolo="Tutte le visite registrate da quando il bambino è in carico · clicca per aprirle">
        {visite.length === 0 ? <Vuoto testo="Nessuna visita registrata." /> : (
          <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
            {visite.map((v) => (
              <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <button onClick={() => onApriVisita(v)} className="min-w-0 flex-1 text-left hover:bg-slate-50">
                  <p className="font-medium text-teal-800 underline decoration-teal-300 underline-offset-2">{fmtData(v.data)} · {v.motivo}</p>
                  {parametriVitali(v) && <p className="text-xs text-slate-500">{parametriVitali(v)}</p>}
                  {v.diagnosi_icd9cm.length > 0 && <p className="text-slate-600">Diagnosi: {v.diagnosi_icd9cm.join(', ')}</p>}
                  {v.terapia && <p className="line-clamp-2 text-slate-600">Terapia: {v.terapia}</p>}
                </button>
                <Bottone onClick={() => onReferto(v)}>Referto PDF</Bottone>
              </li>
            ))}
          </ul>
        )}
      </Pannello>

      <Pannello titolo={`Certificati (${certificati.length})`} sottotitolo="Diete speciali per la scuola e diete di esclusione rilasciate">
        {certificati.length === 0 ? <Vuoto testo="Nessun certificato." /> : <ElencoCertificati elenco={certificati} onStampa={onCertificato} />}
      </Pannello>
    </div>
  );
}

const TIPO_CERTIFICATO: Record<Certificato['tipo'], string> = {
  dieta_speciale: 'Dieta speciale (scuola / mensa)',
  dieta_esclusione: 'Dieta di esclusione',
  generico: 'Certificato',
};

function ElencoCertificati({ elenco, onStampa }: { elenco: Certificato[]; onStampa: (c: Certificato) => void }) {
  return (
    <ul className="divide-y divide-slate-100">
      {elenco.map((c) => {
        const allergeni = ((c.contenuto as unknown as ContenutoDieta).allergeni ?? []).map((a) => a.nome).join(', ');
        return (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              <p className="font-medium text-slate-900">{fmtGiornoIso(c.data)} · {TIPO_CERTIFICATO[c.tipo]}</p>
              <p className="text-slate-600">{allergeni}{c.valido_fino && ` · valido fino al ${fmtGiornoIso(c.valido_fino)}`}</p>
            </div>
            <Bottone onClick={() => onStampa(c)}>Ristampa PDF</Bottone>
          </li>
        );
      })}
    </ul>
  );
}

/** Tabella delle misurazioni con i percentili del riferimento scelto per le curve. */
function TabellaMisure({ misure, sesso, curva }: { misure: Misurazione[]; sesso: Paziente['sesso']; curva: SceltaCurva }) {
  if (misure.length === 0) return <div className="px-3 pb-3"><Vuoto testo="Nessuna misurazione." /></div>;
  const perc = (ind: 'peso' | 'altezza' | 'circonferenza_cranica', giorni: number, x: number | null) =>
    x === null ? null : <span className="ml-1 text-xs text-slate-500">{fmtPercentile(percentileMisura(ind, sesso, giorni, x, riferimentoEffettivo(curva, ind, giorni)))}</span>;
  return (
    <div className="overflow-x-auto px-1 pb-2">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Età</th>
            <th className="px-3 py-2 font-medium">Peso kg</th>
            <th className="px-3 py-2 font-medium">Altezza cm</th>
            <th className="px-3 py-2 font-medium">CC cm</th>
            <th className="px-3 py-2 font-medium">BMI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {misure.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-1.5 text-slate-800">{etaDaGiorni(m.eta_giorni)}</td>
              <td className="px-3 py-1.5">{m.peso_kg ?? '—'}{perc('peso', m.eta_giorni, m.peso_kg)}</td>
              <td className="px-3 py-1.5">{m.altezza_cm ?? '—'}{perc('altezza', m.eta_giorni, m.altezza_cm)}</td>
              <td className="px-3 py-1.5">{m.circonferenza_cranica_cm ?? '—'}{perc('circonferenza_cranica', m.eta_giorni, m.circonferenza_cranica_cm)}</td>
              <td className="px-3 py-1.5">{m.bmi ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 pt-1 text-xs text-slate-500">Percentili secondo le curve scelte sopra (informativi, non un giudizio clinico).</p>
    </div>
  );
}
