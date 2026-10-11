import {
  AREE_ALLERGO, avvisiAutoiniettore, etaEstesa, livelloFeno, reversibilitaSignificativa,
  type AllergoPaziente, type AreaAllergo, type ClaimsApp, type MembroStudio, type RigaAllergo, type Studio,
} from '@pls/shared';
import { useState, type FormEvent, type ReactElement } from 'react';
import Anafilassi from '../componenti/allergo/Anafilassi';
import { COLONNE_PAZIENTE, CAMPI_CARTELLA, CAMPI_DIAGNOSI, CAMPI_SPIRO, STATI_DIAGNOSI, TIPI_VISITA } from '../componenti/allergo/definizioni';
import Punteggi from '../componenti/allergo/Punteggi';
import Registro, { CampoModulo, comeRiga, comeValori, giorno, oggi, s, stileInput, type Campo, type Valori } from '../componenti/allergo/Registro';
import { DietaEsclusione, DocumentoAllergo, firmatarioDa, PianoAnafilassi, RefertoVisita, RiepilogoAllergo, type ContattoEmergenza } from '../componenti/allergo/stampa';
import type { ImpostazioniReferto } from '../componenti/allergo/referto';
import VisitaAllergologica from '../componenti/allergo/VisitaAllergologica';
import { RefertoGrafico } from '../componenti/allergo/RefertoGrafico';
import AnamnesiGuidata from '../componenti/allergo/ModuloAnamnesi';
import { scelteIniziali, type Scelte, type TestiAnamnesi } from '../componenti/allergo/anamnesiTesti';
import Terapie from '../componenti/allergo/Terapie';
import TestAllergologici from '../componenti/allergo/TestAllergologici';
import Finestra from '../componenti/Finestra';
import { useStampa } from '../componenti/Stampa';
import { Badge, Bottone, Caricamento, Errore, Pannello, Vuoto } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { DIETE } from '../lib/diete';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

type Scheda = 'riepilogo' | 'visite' | 'asma' | 'cute' | 'alimenti' | 'test' | 'terapie' | 'anamnesi';
const SCHEDE: [Scheda, string][] = [
  ['riepilogo', 'Riepilogo'], ['visite', 'Visite e diagnosi'], ['asma', 'Asma e rinite'], ['cute', 'Dermatite e orticaria'],
  ['alimenti', 'Alimenti e anafilassi'], ['test', 'Test allergologici'], ['terapie', 'Terapie e immunoterapia'], ['anamnesi', 'Anamnesi'],
];

const cli = () => supabase.schema('clinica');
const tutte = (tabella: string, pseudo: string, ordine: string) =>
  q<RigaAllergo[]>(cli().from(tabella).select('*').eq('pseudo_id', pseudo).order(ordine, { ascending: false }));

async function caricaTutto(pseudo: string) {
  const [visite, diagnosi, test, tpo, terapie, autoiniettori, punteggi, spirometrie, reazioni] = await Promise.all([
    tutte('allergo_visite', pseudo, 'data'), tutte('allergo_diagnosi', pseudo, 'creato_il'), tutte('allergo_test', pseudo, 'data'),
    tutte('allergo_tpo', pseudo, 'data'), tutte('allergo_terapie', pseudo, 'dal'), tutte('allergo_autoiniettori', pseudo, 'data_prescrizione'),
    tutte('allergo_punteggi', pseudo, 'data'), tutte('allergo_spirometrie', pseudo, 'data'), tutte('allergo_reazioni', pseudo, 'data'),
  ]);
  return { visite, diagnosi, test, tpo, terapie, autoiniettori, punteggi, spirometrie, reazioni };
}
type Tutto = Awaited<ReturnType<typeof caricaTutto>>;

const pesoAttuale = (t: Tutto | null) => {
  const v = t?.visite.find((x) => x.peso_kg != null);
  return v ? Number(v.peso_kg) : null;
};

/** Cartella allergologica: anagrafica separata dagli assistiti, dati clinici per pseudonimo. */
export default function SchedaAllergologica({ id, claims }: { id: string; claims: ClaimsApp }) {
  const [scheda, setScheda] = useState<Scheda>('riepilogo');
  const [versione, setVersione] = useState(0);
  const [cf, setCf] = useState<string | null>(null);
  const [stampaAperta, setStampaAperta] = useState<'piano' | 'dieta' | 'dati' | null>(null);
  const { stampa, portale } = useStampa();

  const paziente = useDati(() => q<AllergoPaziente>(supabase.schema('anagrafica').from('allergo_pazienti').select(COLONNE_PAZIENTE).eq('id', id).single()), [id]);
  const pseudo = useDati(() => q<string>(supabase.schema('api').rpc('allergo_apri_cartella', { p_paziente_id: id })), [id]);
  const tutto = useDati(async () => (pseudo.dati ? caricaTutto(pseudo.dati) : null), [pseudo.dati, versione]);
  const studio = useDati(() => q<Studio>(supabase.schema('anagrafica').from('studi').select('*').single()), []);
  const io = useDati(() => q<MembroStudio | null>(supabase.schema('anagrafica').from('membri_studio').select('*').eq('utente_id', claims.sub).maybeSingle()), [claims.sub]);
  const cambia = () => setVersione((v) => v + 1);
  const [editor, setEditor] = useState<RigaAllergo | 'nuova' | null>(null);
  const impostazioni = useDati(() => q<ImpostazioniReferto | null>(supabase.schema('anagrafica').from('allergo_impostazioni').select('*').eq('utente_id', claims.sub).maybeSingle()), [claims.sub]);

  if (paziente.errore || pseudo.errore) return <Errore messaggio={paziente.errore ?? pseudo.errore ?? ''} />;
  if (paziente.caricamento || pseudo.caricamento || !paziente.dati || !pseudo.dati) return <Caricamento righe={8} />;
  const p = paziente.dati;
  const ps = pseudo.dati;
  const t = tutto.dati;
  const peso = pesoAttuale(t);

  async function leggiCf() {
    const { data, error } = await supabase.schema('api').rpc('allergo_codice_fiscale', { p_paziente_id: id });
    if (!error) setCf(data as string);
    return error ? null : (data as string);
  }

  async function documento(titolo: string, contenuto: ReactElement) {
    const codice = cf ?? (await leggiCf());
    stampa(<DocumentoAllergo titolo={titolo} studio={studio.dati} firmatario={firmatarioDa(io.dati)} paziente={p} codiceFiscale={codice}>{contenuto}</DocumentoAllergo>);
  }

  async function stampaReferto(v: RigaAllergo, grafico = true) {
    const codice = cf ?? (await leggiCf());
    const visite = t?.visite ?? [];
    const prima = [...visite].reverse().find((x) => x.tipo === 'prima_visita') ?? visite[visite.length - 1] ?? null;
    let anamnesi = (v.anamnesi_snapshot as Record<string, unknown> | null) ?? null;
    if (!anamnesi) anamnesi = await q<Record<string, unknown>>(supabase.schema('clinica').from('allergo_cartelle').select('*').eq('pseudo_id', ps).single());
    stampa(grafico
      ? <RefertoGrafico impostazioni={impostazioni.dati ?? null} studio={studio.dati} paziente={p} codiceFiscale={codice}
                        visita={v} anamnesi={anamnesi} prima={prima}
                        dati={{ test: t?.test ?? [], spirometrie: t?.spirometrie ?? [], punteggi: t?.punteggi ?? [] }} />
      : <RefertoVisita impostazioni={impostazioni.dati ?? null} studio={studio.dati} paziente={p} codiceFiscale={codice}
                       visita={v} anamnesi={anamnesi} prima={prima}
                       dati={{ test: t?.test ?? [], spirometrie: t?.spirometrie ?? [], punteggi: t?.punteggi ?? [] }} />);
  }

  const terapieInCorso = (t?.terapie ?? []).filter((x) => !x.al || String(x.al) >= oggiIso());

  return (
    <div className="space-y-6">
      {portale}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href={link('allergologia')} className="text-sm text-teal-700 hover:underline">← Allergologia</a>
          <h1 className="text-2xl font-semibold text-slate-900">{p.cognome} {p.nome}</h1>
          <p className="text-slate-700">
            Nato/a il <span className="font-semibold tabular-nums">{fmtGiornoIso(p.data_nascita)}</span> · <span className="font-semibold">{etaEstesa(p.data_nascita, oggiIso())}</span> · {p.sesso === 'M' ? 'maschio' : 'femmina'}
            {peso != null && <> · ultimo peso <span className="font-semibold">{peso} kg</span></>}
            {p.residenza && <> · {p.residenza}</>}
          </p>
          <p className="text-sm text-slate-500">
            {[p.genitore_nome && `Genitore: ${p.genitore_nome}`, p.genitore_telefono && `tel. ${p.genitore_telefono}`, p.pediatra_curante && `Pediatra curante: ${p.pediatra_curante}`, p.inviato_da && `Inviato da: ${p.inviato_da}`].filter(Boolean).join(' · ')}
          </p>
          <p className="text-sm text-slate-500">
            Codice fiscale: {cf ? <span className="font-mono text-slate-800">{cf}</span> : <button onClick={() => void leggiCf()} className="text-teal-700 underline">mostra</button>}
            {p.stato === 'archiviato' && <> · <Badge>Archiviato</Badge></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Bottone variante="primario" onClick={() => { setScheda('visite'); setEditor('nuova'); }}>
            {t?.visite.length ? '+ Controllo clinico' : '+ Prima visita'}
          </Bottone>
          <Bottone onClick={() => t && void documento('Relazione allergologica', <RiepilogoAllergo dati={{
            diagnosi: t.diagnosi.filter((d) => d.stato !== 'risolta'), test: t.test, tpo: t.tpo, terapie: terapieInCorso,
            autoiniettori: t.autoiniettori.filter((a) => a.attivo), punteggi: t.punteggi, ultimaVisita: t.visite[0] ?? null }} />)}>
            Relazione per il pediatra
          </Bottone>
          <Bottone onClick={() => setStampaAperta('piano')}>Piano d'azione anafilassi</Bottone>
          <Bottone onClick={() => setStampaAperta('dieta')}>Dieta di esclusione</Bottone>
          <Bottone onClick={() => setStampaAperta('dati')}>Dati anagrafici</Bottone>
        </div>
      </div>

      <nav className="-mx-1 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Sezioni della cartella">
        {SCHEDE.map(([k, etichetta]) => (
          <button key={k} onClick={() => setScheda(k)} aria-current={scheda === k ? 'page' : undefined}
                  className={`rounded-t-lg px-3 py-2 text-sm font-medium ${scheda === k ? 'border-b-2 border-teal-700 text-teal-800' : 'text-slate-600 hover:text-slate-900'}`}>
            {etichetta}
          </button>
        ))}
      </nav>

      {scheda === 'riepilogo' && (tutto.errore ? <Errore messaggio={tutto.errore} /> : !t ? <Caricamento /> : <Riepilogo t={t} peso={peso} eta={p.data_nascita} vai={setScheda} />)}

      {scheda === 'visite' && editor && t && (
        <VisitaAllergologica pseudo={ps} paziente={p} visita={editor === 'nuova' ? null : editor} visite={t.visite}
          onChiudi={() => { setEditor(null); cambia(); }} onSalvata={() => { setEditor(null); cambia(); }} />
      )}
      {scheda === 'visite' && !editor && (
        <div className="space-y-6">
          <ElencoVisite visite={t?.visite ?? []} onApri={setEditor} onStampa={(v, grafico) => void stampaReferto(v, grafico)} />
          <Registro titolo="Diagnosi" tabella="allergo_diagnosi" pseudo={ps} campi={CAMPI_DIAGNOSI} ordine="creato_il" onCambio={cambia}
            iniziali={() => ({ stato: 'attiva', data_diagnosi: oggi() })} trasforma={(r) => ({ ...r, aggiornato_il: new Date().toISOString() })}
            riassunto={(r) => (
              <div>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{s(r, 'descrizione')}</span>
                  <Badge tono={r.stato === 'attiva' ? 'info' : r.stato === 'sospetta' ? 'attenzione' : 'ok'}>{STATI_DIAGNOSI[s(r, 'stato')]}</Badge>
                </p>
                <p className="text-xs text-slate-500">{AREE_ALLERGO[r.area as AreaAllergo]}{r.gravita ? ` · ${s(r, 'gravita')}` : ''}{r.data_diagnosi ? ` · dal ${giorno(r.data_diagnosi)}` : ''}</p>
              </div>
            )} />
        </div>
      )}

      {scheda === 'asma' && (
        <div className="space-y-6">
          <Punteggi titolo="Controllo dell'asma" scale={['c_act', 'act']} pseudo={ps} onCambio={cambia} />
          <Registro titolo="Spirometria e FeNO" tabella="allergo_spirometrie" pseudo={ps} campi={CAMPI_SPIRO} onCambio={cambia}
            iniziali={() => ({ data: oggi() })} trasforma={(r) => { const x = { ...r }; delete x.reversibilita_pct; return x; }}
            riassunto={(r) => {
              const rev = r.reversibilita_pct == null ? null : Number(r.reversibilita_pct);
              const anni = (Date.parse(String(r.data)) - Date.parse(p.data_nascita)) / (365.25 * 86_400_000);
              return (
                <div>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="tabular-nums text-slate-500">{giorno(r.data)}</span>
                    {r.fev1_l != null && <span>FEV₁ {s(r, 'fev1_l')} L{r.fev1_pct != null ? ` (${s(r, 'fev1_pct')}%)` : ''}</span>}
                    {r.fev1_fvc != null && <span>FEV₁/FVC {s(r, 'fev1_fvc')}%</span>}
                    {r.fef2575_pct != null && <span>FEF₂₅₋₇₅ {s(r, 'fef2575_pct')}%</span>}
                    {rev != null && <Badge tono={reversibilitaSignificativa(rev) ? 'attenzione' : 'ok'}>Reversibilità {rev > 0 ? '+' : ''}{rev}%{reversibilitaSignificativa(rev) ? ' (significativa)' : ''}</Badge>}
                    {r.feno_ppb != null && <Badge tono={livelloFeno(Number(r.feno_ppb), anni) === 'elevato' ? 'attenzione' : 'neutro'}>FeNO {s(r, 'feno_ppb')} ppb · {livelloFeno(Number(r.feno_ppb), anni)}</Badge>}
                  </p>
                  {r.note ? <p className="text-xs text-slate-500">{s(r, 'note')}</p> : null}
                </div>
              );
            }} />
          <p className="text-xs text-slate-500">
            Reversibilità significativa: aumento del FEV₁ ≥ 12% dopo broncodilatatore (GINA). FeNO sotto i 12 anni: &lt; 20 ppb basso, 20–35 intermedio, &gt; 35 elevato (ATS 2011).
            Controllo dell'asma da registrare a ogni visita insieme ad aderenza, tecnica inalatoria e fattori di rischio.
          </p>
        </div>
      )}

      {scheda === 'cute' && (
        <div className="space-y-6">
          <Punteggi titolo="Dermatite atopica" scale={['scorad', 'poem']} pseudo={ps} onCambio={cambia}
            sotto2anni={(Date.now() - Date.parse(p.data_nascita)) < 2 * 365.25 * 86_400_000} />
          <Punteggi titolo="Orticaria" scale={['uas7']} pseudo={ps} onCambio={cambia} />
        </div>
      )}

      {scheda === 'alimenti' && <Anafilassi pseudo={ps} pesoKg={peso} onCambio={cambia} />}
      {scheda === 'test' && <TestAllergologici pseudo={ps} onCambio={cambia} />}
      {scheda === 'terapie' && <Terapie pseudo={ps} onCambio={cambia} />}
      {scheda === 'anamnesi' && <Anamnesi pseudo={ps} />}

      {stampaAperta === 'piano' && t && (
        <Finestra titolo="Piano d'azione per l'anafilassi" onChiudi={() => setStampaAperta(null)} larga>
          <ModuloPiano t={t} paziente={p} onStampa={(d) => {
            setStampaAperta(null);
            void documento('Piano d\'azione per la reazione allergica', <PianoAnafilassi paziente={p} {...d} />);
          }} />
        </Finestra>
      )}
      {stampaAperta === 'dati' && (
        <Finestra titolo="Dati anagrafici e contatti" onChiudi={() => setStampaAperta(null)} larga>
          <ModificaDati p={p} onFatto={() => { setStampaAperta(null); paziente.ricarica(); }} />
        </Finestra>
      )}
      {stampaAperta === 'dieta' && (
        <Finestra titolo="Dieta di esclusione" onChiudi={() => setStampaAperta(null)} larga>
          <ModuloDieta onStampa={(categorie, note) => {
            setStampaAperta(null);
            void documento('Dieta di esclusione', <DietaEsclusione categorie={categorie} note={note} />);
          }} />
        </Finestra>
      )}
    </div>
  );
}

function ElencoVisite({ visite, onApri, onStampa }: { visite: RigaAllergo[]; onApri: (v: RigaAllergo | 'nuova') => void; onStampa: (v: RigaAllergo, grafico: boolean) => void }) {
  return (
    <Pannello titolo="Visite" sottotitolo="Referti nel formato dell'ambulatorio; nel controllo si richiama sempre la visita precedente"
              azione={<Bottone variante="primario" onClick={() => onApri('nuova')}>{visite.length ? '+ Controllo clinico' : '+ Prima visita'}</Bottone>}>
      {visite.length === 0 ? <Vuoto testo="Nessuna visita: inizia con la prima visita allergologica." /> : (
        <ul className="divide-y divide-slate-100">
          {visite.map((v) => (
            <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums text-slate-900">{giorno(v.data)}</span>
                  <Badge tono={v.tipo === 'prima_visita' ? 'info' : 'neutro'}>{TIPI_VISITA[s(v, 'tipo')]}</Badge>
                  <span className="text-slate-700">{s(v, 'motivo')}</span>
                  {v.peso_kg ? <span className="text-xs text-slate-500">{s(v, 'peso_kg')} kg</span> : null}
                </p>
                {v.diagnosi_testo ? <p className="text-slate-700">{String(v.diagnosi_testo).split('\n').filter(Boolean).join(' · ')}</p>
                  : v.conclusioni ? <p className="line-clamp-2 text-slate-700">{s(v, 'conclusioni')}</p> : null}
                {v.prossimo_controllo ? <p className="text-xs text-teal-800">Prossimo controllo: {giorno(v.prossimo_controllo)}</p> : null}
              </div>
              <div className="flex gap-2">
                <Bottone onClick={() => onApri(v)}>Apri</Bottone>
                <Bottone variante="primario" onClick={() => onStampa(v, true)}>Referto a colori</Bottone>
                <Bottone onClick={() => onStampa(v, false)}>Referto classico</Bottone>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Pannello>
  );
}

function Riepilogo({ t, peso, eta, vai }: { t: Tutto; peso: number | null; eta: string; vai: (s: Scheda) => void }) {
  const attive = t.diagnosi.filter((d) => d.stato === 'attiva' || d.stato === 'sospetta');
  const ultimo = (scala: string) => t.punteggi.find((x) => x.scala === scala);
  const anni = (Date.now() - Date.parse(eta)) / (365.25 * 86_400_000);
  const controllo = ultimo(anni >= 12 ? 'act' : 'c_act') ?? ultimo('c_act') ?? ultimo('act');
  const avvisi = t.autoiniettori.flatMap((a) =>
    avvisiAutoiniettore({ dose_mg: Number(a.dose_mg), numero: Number(a.numero), scadenza: (a.scadenza as string | null) ?? null, attivo: a.attivo === true }, peso, oggiIso()));
  const ultimaVisita = t.visite[0];
  const anafilassi = t.reazioni.filter((r) => r.anafilassi).length;
  const inCorso = t.terapie.filter((x) => !x.al || String(x.al) >= oggiIso());
  const livello = (r: RigaAllergo | undefined) => String((r?.dettagli as { livello?: string } | null)?.livello ?? '').replace(/_/g, ' ');

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Pannello titolo="Diagnosi attive" azione={<button onClick={() => vai('visite')} className="text-sm text-teal-700 underline">Gestisci</button>}>
        {attive.length === 0 ? <Vuoto testo="Nessuna diagnosi registrata." /> : (
          <ul className="space-y-1 text-sm">
            {attive.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Badge tono={d.area === 'anafilassi' ? 'errore' : 'info'}>{AREE_ALLERGO[d.area as AreaAllergo]}</Badge>
                <span className="text-slate-800">{s(d, 'descrizione')}{d.gravita ? ` · ${s(d, 'gravita')}` : ''}</span>
                {d.stato === 'sospetta' && <Badge tono="attenzione">sospetta</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Pannello>

      <Pannello titolo="Allerte">
        {avvisi.length === 0 && anafilassi === 0 && !(controllo && Number(controllo.punteggio) <= 19) ? <Vuoto testo="Nessuna allerta." /> : (
          <ul className="space-y-1 text-sm">
            {anafilassi > 0 && <li className="text-rose-700">{anafilassi} {anafilassi === 1 ? 'episodio' : 'episodi'} di anafilassi registrati.</li>}
            {avvisi.map((a) => <li key={a.testo} className={a.tono === 'errore' ? 'text-rose-700' : 'text-amber-700'}>{a.testo}</li>)}
            {controllo && ((controllo.scala === 'c_act' && Number(controllo.punteggio) <= 19) || (controllo.scala === 'act' && Number(controllo.punteggio) <= 19)) && (
              <li className="text-amber-700">Asma non ben controllato all'ultimo questionario ({giorno(controllo.data)}).</li>
            )}
          </ul>
        )}
      </Pannello>

      <Pannello titolo="Ultimi punteggi">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[['Controllo asma', controllo], ['SCORAD', ultimo('scorad')], ['POEM', ultimo('poem')], ['UAS7', ultimo('uas7')]].map(([n, r]) => {
            const riga = r as RigaAllergo | undefined;
            return (
              <div key={n as string}>
                <dt className="text-slate-500">{n as string}{riga && riga.scala !== undefined && (n === 'Controllo asma') ? ` (${String(riga.scala).toUpperCase().replace('_', '-')})` : ''}</dt>
                <dd className="font-medium text-slate-900">{riga ? `${s(riga, 'punteggio')} · ${livello(riga)} · ${giorno(riga.data)}` : '—'}</dd>
              </div>
            );
          })}
        </dl>
      </Pannello>

      <Pannello titolo="Terapia in corso" azione={<button onClick={() => vai('terapie')} className="text-sm text-teal-700 underline">Gestisci</button>}>
        {inCorso.length === 0 ? <Vuoto testo="Nessuna terapia in corso." /> : (
          <ul className="space-y-1 text-sm">{inCorso.map((x) => <li key={x.id}><span className="font-medium">{s(x, 'farmaco')}</span>{x.posologia ? ` · ${s(x, 'posologia')}` : ''}</li>)}</ul>
        )}
      </Pannello>

      <Pannello titolo="Ultima visita" className="lg:col-span-2">
        {!ultimaVisita ? <Vuoto testo="Nessuna visita registrata." /> : (
          <div className="text-sm">
            <p className="font-medium text-slate-900">{giorno(ultimaVisita.data)} · {s(ultimaVisita, 'motivo')}</p>
            {ultimaVisita.conclusioni ? <p className="text-slate-700">{s(ultimaVisita, 'conclusioni')}</p> : null}
            {ultimaVisita.piano ? <p className="text-slate-600">Piano: {s(ultimaVisita, 'piano')}</p> : null}
            {ultimaVisita.prossimo_controllo ? (
              <p className={String(ultimaVisita.prossimo_controllo) < oggiIso() ? 'text-rose-700' : 'text-teal-800'}>
                Prossimo controllo: {giorno(ultimaVisita.prossimo_controllo)}{String(ultimaVisita.prossimo_controllo) < oggiIso() ? ' (superato)' : ''}
              </p>
            ) : null}
          </div>
        )}
      </Pannello>
    </div>
  );
}

function ModuloPiano({ t, paziente, onStampa }: { t: Tutto; paziente: AllergoPaziente; onStampa: (d: { allergeni: string; antistaminico: string; asma: boolean; adrenalina: string; contatti: ContattoEmergenza[] }) => void }) {
  const auto = t.autoiniettori.find((a) => a.attivo);
  const [allergeni, setAllergeni] = useState(() =>
    t.diagnosi.filter((d) => ['allergia_alimentare', 'anafilassi', 'imenotteri', 'farmaci'].includes(String(d.area)) && d.stato !== 'risolta')
      .map((d) => s(d, 'descrizione')).join('; '));
  const [adrenalina, setAdrenalina] = useState(() => (auto ? `${s(auto, 'dispositivo')} ${Math.round(Number(auto.dose_mg) * 1000)} mcg` : ''));
  const [antistaminico, setAntistaminico] = useState(() => {
    const a = t.terapie.find((x) => x.classe === 'antistaminico' && (!x.al || String(x.al) >= oggiIso()));
    return a ? `${s(a, 'farmaco')}${a.posologia ? `: ${s(a, 'posologia')}` : ''}` : '';
  });
  const [asma, setAsma] = useState(() => t.diagnosi.some((d) => (d.area === 'asma' || d.area === 'wheezing_prescolare') && d.stato !== 'risolta'));
  const [contatti, setContatti] = useState<ContattoEmergenza[]>(() => [
    { nome: paziente.genitore_nome ? `${paziente.genitore_nome} (genitore)` : '', telefono1: paziente.genitore_telefono ?? '', telefono2: '' },
    { nome: '', telefono1: '', telefono2: '' }, { nome: '', telefono1: '', telefono2: '' },
  ]);
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); onStampa({ allergeni, antistaminico, asma, adrenalina, contatti: contatti.filter((c) => c.nome || c.telefono1) }); }} className="space-y-3 text-sm">
      {!auto && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">Nessun autoiniettore attivo registrato: indicalo qui sotto oppure aggiungilo in «Alimenti e anafilassi».</p>}
      <label className="block"><span className="block text-slate-500">Allergico/a a</span>
        <input value={allergeni} onChange={(e) => setAllergeni(e.target.value)} className={stileInput} placeholder="Es. crostacei e molluschi" /></label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block"><span className="block text-slate-500">Adrenalina autoiniettabile (nome e dose)</span>
          <input value={adrenalina} onChange={(e) => setAdrenalina(e.target.value)} className={stileInput} placeholder="Es. Jext 300 mcg" /></label>
        <label className="block"><span className="block text-slate-500">Antistaminico e dose</span>
          <input value={antistaminico} onChange={(e) => setAntistaminico(e.target.value)} className={stileInput} placeholder="Es. Bilastina 20 mg cpr: 1 cpr per bocca subito" /></label>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={asma} onChange={(e) => setAsma(e.target.checked)} /> Asma bronchiale (rischio di reazioni severe)</label>
      <fieldset className="space-y-1">
        <legend className="text-slate-500">Contatti familiari di emergenza</legend>
        {contatti.map((c, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-3">
            {(['nome', 'telefono1', 'telefono2'] as const).map((k) => (
              <input key={k} value={c[k]} placeholder={k === 'nome' ? 'Nome / relazione' : k === 'telefono1' ? 'Telefono 1' : 'Telefono 2'} aria-label={`Contatto ${i + 1}: ${k}`}
                     onChange={(e) => setContatti(contatti.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} className={stileInput} />
            ))}
          </div>
        ))}
      </fieldset>
      <p className="text-xs text-slate-500">Tabella sintomi/terapia, chiamata al 112, seconda dose dopo 5–10 minuti e istruzioni d'uso dell'autoiniettore (EAACI 2021). Da consegnare a famiglia e scuola.</p>
      <Bottone type="submit" variante="primario">Stampa / salva PDF</Bottone>
    </form>
  );
}

function ModuloDieta({ onStampa }: { onStampa: (categorie: string[], note: string) => void }) {
  const [scelte, setScelte] = useState<string[]>([]);
  const [note, setNote] = useState('');
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (scelte.length) onStampa(scelte, note); }} className="space-y-3 text-sm">
      <fieldset className="grid gap-1 sm:grid-cols-2">
        <legend className="mb-1 text-slate-500">Alimenti da escludere</legend>
        {Object.entries(DIETE).map(([k, d]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" checked={scelte.includes(k)} onChange={(e) => setScelte(e.target.checked ? [...scelte, k] : scelte.filter((x) => x !== k))} /> {d.nome}
          </label>
        ))}
      </fieldset>
      <label className="block"><span className="block text-slate-500">Indicazioni specifiche (es. tollera l'uovo cotto al forno)</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={stileInput} /></label>
      <Bottone type="submit" variante="primario" disabled={scelte.length === 0}>Stampa / salva PDF</Bottone>
    </form>
  );
}

const CAMPI_DATI: Campo[] = [
  { nome: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
  { nome: 'cognome', etichetta: 'Cognome', tipo: 'testo', obbligatorio: true },
  { nome: 'luogo_nascita', etichetta: 'Luogo di nascita', tipo: 'testo' },
  { nome: 'residenza', etichetta: 'Residenza (comune, indirizzo)', tipo: 'testo' },
  { nome: 'genitore_nome', etichetta: 'Genitore / tutore', tipo: 'testo' },
  { nome: 'genitore_telefono', etichetta: 'Telefono del genitore', tipo: 'testo' },
  { nome: 'genitore_email', etichetta: 'Email del genitore', tipo: 'testo' },
  { nome: 'pediatra_curante', etichetta: 'Pediatra curante', tipo: 'testo' },
  { nome: 'inviato_da', etichetta: 'Inviato da', tipo: 'testo' },
  { nome: 'stato', etichetta: 'Stato', tipo: 'select', obbligatorio: true, opzioni: [['attivo', 'In carico'], ['archiviato', 'Archiviato (non più seguito)']] },
  { nome: 'note_organizzative', etichetta: 'Note organizzative (niente dati clinici)', tipo: 'area' },
];

function ModificaDati({ p, onFatto }: { p: AllergoPaziente; onFatto: () => void }) {
  const [v, setV] = useState<Valori>(() => comeValori(CAMPI_DATI, p as unknown as Record<string, unknown>));
  const [errore, setErrore] = useState<string | null>(null);
  async function salva(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.schema('anagrafica').from('allergo_pazienti').update(comeRiga(CAMPI_DATI, v)).eq('id', p.id);
    if (error) setErrore(error.message); else onFatto();
  }
  return (
    <form onSubmit={(e) => void salva(e)} className="grid gap-3 md:grid-cols-2">
      {errore && <div className="md:col-span-2"><Errore messaggio={errore} /></div>}
      {CAMPI_DATI.map((c) => <CampoModulo key={c.nome} c={c} v={v} onChange={setV} />)}
      <p className="text-xs text-slate-500 md:col-span-2">Codice fiscale, data di nascita e sesso non si modificano: in caso di errore registra di nuovo il paziente e archivia questa scheda.</p>
      <div className="md:col-span-2"><Bottone type="submit" variante="primario">Salva</Bottone></div>
    </form>
  );
}

function Anamnesi({ pseudo }: { pseudo: string }) {
  const cartella = useDati(() => q<Record<string, unknown>>(supabase.schema('clinica').from('allergo_cartelle').select('*').eq('pseudo_id', pseudo).single()), [pseudo]);
  const [v, setV] = useState<Valori | null>(null);
  const [guidata, setGuidata] = useState<{ scelte: Scelte; testi: TestiAnamnesi } | null>(null);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

  if (cartella.errore) return <Errore messaggio={cartella.errore} />;
  if (!cartella.dati) return <Caricamento />;
  const valori: Valori = v ?? comeValori(CAMPI_CARTELLA, cartella.dati);
  const scelte = guidata?.scelte ?? scelteIniziali(cartella.dati.anamnesi_scelte as Scelte | undefined, cartella.dati as Record<string, string | null>);

  async function salva(e: FormEvent) {
    e.preventDefault();
    const testi = guidata ? Object.fromEntries(Object.entries(guidata.testi).map(([k, x]) => [k, x.trim() || null])) : {};
    const { error } = await supabase.schema('clinica').from('allergo_cartelle')
      .update({ ...comeRiga(CAMPI_CARTELLA, valori), ...testi, ...(guidata ? { anamnesi_scelte: guidata.scelte } : {}), aggiornata_il: new Date().toISOString() })
      .eq('pseudo_id', pseudo);
    setEsito(error ? { ok: false, testo: error.message } : { ok: true, testo: 'Anamnesi salvata.' });
    if (!error) cartella.ricarica();
  }

  return (
    <Pannello titolo="Anamnesi allergologica" sottotitolo="Le stesse voci del referto: compaiono in ogni visita e si aggiornano anche dalla visita">
      <form onSubmit={(e) => void salva(e)} className="space-y-4">
        {esito && <p className={`rounded-lg p-2 text-sm ${esito.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{esito.testo}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {CAMPI_CARTELLA.map((campo) => <CampoModulo key={campo.nome} c={campo} v={valori} onChange={(x) => { setV(x); setEsito(null); }} />)}
        </div>
        <AnamnesiGuidata scelte={scelte} onChange={(s2, testi) => { setGuidata({ scelte: s2, testi }); setEsito(null); }} />
        <Bottone type="submit" variante="primario">Salva anamnesi</Bottone>
      </form>
    </Pannello>
  );
}
