import {
  arrotonda2, avvisoVitaAltezza, criterioSga, criteriNota39, criteriSospensioneGh, differenzaEtaOssea, DOSE_MASSIMA_GH_UG_KG_DIE, etaDecimale, etaEstesa,
  fmtPercentileFine, fmtSds, pubarcaPrecoce, sogliaGh, valutaPuberta, type AuxoPaziente, type ClaimsApp, type Criterio,
  type RigaAllergo, type StimoloGh, type Studio,
} from '@pls/shared';
import { useRef, useState, type FormEvent, type ReactElement } from 'react';
import type { ImpostazioniReferto } from '../componenti/allergo/referto';
import Registro, { CampoModulo, comeRiga, comeValori, giorno, oggi, s, type Campo, type Valori } from '../componenti/allergo/Registro';
import { analizzaMisure, dataDi, n, targetDaCartella, ultimaStatura, type MisuraAnalizzata } from '../componenti/auxo/analisi';
import {
  AREE_AUXO, CAMPI_CARTELLA_AUXO, CAMPI_DIAGNOSI_AUXO, CAMPI_ESAME, CAMPI_ETA_OSSEA, CAMPI_MISURA, CAMPI_TERAPIA_AUXO, CAMPI_TEST_GH,
  CLASSI_TERAPIA_AUXO, COLONNE_PAZIENTE_AUXO, ESAMI_AUXO, INDICAZIONI_NOTA39, METODI_ETA_OSSEA, STATI_DIAGNOSI, STIMOLI_GH,
  TIPI_VISITA_AUXO, campiPuberta,
} from '../componenti/auxo/definizioni';
import GraficoAuxologico, { type PuntoEtaOssea } from '../componenti/auxo/GraficoAuxologico';
import { RefertoAuxologico } from '../componenti/auxo/stampa';
import VisitaAuxologica from '../componenti/auxo/VisitaAuxologica';
import Finestra from '../componenti/Finestra';
import InviaDocumenti from '../componenti/InviaDocumenti';
import { useStampa } from '../componenti/Stampa';
import { Badge, Bottone, Caricamento, Errore, Pannello, Vuoto, type Tono } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

type Scheda = 'riepilogo' | 'crescita' | 'puberta' | 'esami' | 'terapie' | 'visite' | 'anamnesi';
const SCHEDE: [Scheda, string][] = [
  ['riepilogo', 'Riepilogo'], ['crescita', 'Crescita'], ['puberta', 'Pubertà ed età ossea'], ['esami', 'Esami e test del GH'],
  ['terapie', 'Terapie'], ['visite', 'Visite e diagnosi'], ['anamnesi', 'Anamnesi e genitori'],
];

const cli = () => supabase.schema('clinica');
const tutte = (tabella: string, pseudo: string, ordine: string) =>
  q<RigaAllergo[]>(cli().from(tabella).select('*').eq('pseudo_id', pseudo).order(ordine, { ascending: false }));

async function caricaTutto(pseudo: string) {
  const [visite, misure, puberta, etaOssea, esami, testGh, diagnosi, terapie, cartella] = await Promise.all([
    tutte('auxo_visite', pseudo, 'data'), tutte('auxo_misure', pseudo, 'data'), tutte('auxo_puberta', pseudo, 'data'),
    tutte('auxo_eta_ossea', pseudo, 'data'), tutte('auxo_esami', pseudo, 'data'), tutte('auxo_test_gh', pseudo, 'data'),
    tutte('auxo_diagnosi', pseudo, 'creato_il'), tutte('auxo_terapie', pseudo, 'dal'),
    q<Record<string, unknown>>(cli().from('auxo_cartelle').select('*').eq('pseudo_id', pseudo).single()),
  ]);
  return { visite, misure, puberta, etaOssea, esami, testGh, diagnosi, terapie, cartella };
}
type Tutto = Awaited<ReturnType<typeof caricaTutto>>;

const inCorso = (t: RigaAllergo) => !t.al || String(t.al) >= oggiIso();
const terapiaGhInCorso = (t: Tutto | null) => (t?.terapie ?? []).some((x) => (x.classe === 'somatropina' || x.classe === 'gh_lunga_durata') && inCorso(x));

/** Età ossea abbinata alla statura misurata più vicina (entro 3 mesi) per il grafico. */
function puntiEtaOssea(eo: RigaAllergo[], misure: MisuraAnalizzata[]): PuntoEtaOssea[] {
  return eo.flatMap((e) => {
    const d = Date.parse(dataDi(e));
    const vicina = misure.filter((m) => m.altezza != null).sort((a, b) => Math.abs(Date.parse(a.data) - d) - Math.abs(Date.parse(b.data) - d))[0];
    return vicina && Math.abs(Date.parse(vicina.data) - d) <= 90 * 86_400_000
      ? [{ etaOssea: Number(e.eta_ossea_anni), etaCronologica: vicina.anni, altezza: vicina.altezza! }] : [];
  });
}

/** Cartella auxologica: anagrafica separata dagli assistiti, dati clinici per pseudonimo. */
export default function SchedaAuxologica({ id, claims }: { id: string; claims: ClaimsApp }) {
  const [scheda, setScheda] = useState<Scheda>('riepilogo');
  const [versione, setVersione] = useState(0);
  const [cf, setCf] = useState<string | null>(null);
  const cfLetto = useRef<string | null>(null);
  const [erroreStampa, setErroreStampa] = useState<string | null>(null);
  const [datiAperti, setDatiAperti] = useState(false);
  const { stampa, portale } = useStampa();

  const paziente = useDati(() => q<AuxoPaziente>(supabase.schema('anagrafica').from('auxo_pazienti').select(COLONNE_PAZIENTE_AUXO).eq('id', id).single()), [id]);
  const pseudo = useDati(() => q<string>(supabase.schema('api').rpc('auxo_apri_cartella', { p_paziente_id: id })), [id]);
  const tutto = useDati(async () => (pseudo.dati ? caricaTutto(pseudo.dati) : null), [pseudo.dati, versione]);
  const studio = useDati(() => q<Studio>(supabase.schema('anagrafica').from('studi').select('*').single()), []);
  const impostazioni = useDati(() => q<ImpostazioniReferto | null>(supabase.schema('anagrafica').from('auxo_impostazioni').select('*').eq('utente_id', claims.sub).maybeSingle()), [claims.sub]);
  const cambia = () => setVersione((v) => v + 1);
  const [editor, setEditor] = useState<RigaAllergo | 'nuova' | null>(null);
  const [invio, setInvio] = useState<RigaAllergo | null>(null);

  if (paziente.errore || pseudo.errore) return <Errore messaggio={paziente.errore ?? pseudo.errore ?? ''} />;
  if (paziente.caricamento || pseudo.caricamento || !paziente.dati || !pseudo.dati) return <Caricamento righe={8} />;
  const p = paziente.dati;
  const ps = pseudo.dati;
  const t = tutto.dati;
  let misure: MisuraAnalizzata[] = [];
  try { misure = t ? analizzaMisure(p.data_nascita, p.sesso, t.misure) : []; } catch { misure = []; }
  const target = targetDaCartella(t?.cartella ?? null, p.sesso);

  /** Legge il codice fiscale (lettura registrata); lo mostra a schermo solo se richiesto. */
  async function leggiCf(mostra = false) {
    if (!cfLetto.current) {
      const { data, error } = await supabase.schema('api').rpc('auxo_codice_fiscale', { p_paziente_id: id });
      if (error) return null;
      cfLetto.current = data as string;
    }
    if (mostra) setCf(cfLetto.current);
    return cfLetto.current;
  }

  /** Referto della visita (con o senza grafico): lo stesso per la stampa e per l'invio. */
  async function elementoReferto(v: RigaAllergo, conGrafico = true): Promise<ReactElement> {
    const codice = await leggiCf();
    const visite = t?.visite ?? [];
    const prima = [...visite].reverse().find((x) => x.tipo === 'prima_visita') ?? visite[visite.length - 1] ?? null;
    const anamnesi = (v.anamnesi_snapshot as Record<string, unknown> | null) ?? t?.cartella ?? {};
    return (
      <RefertoAuxologico impostazioni={impostazioni.dati ?? null} studio={studio.dati} paziente={p} codiceFiscale={codice}
        visita={v} anamnesi={anamnesi} prima={prima} conGrafico={conGrafico}
        dati={{ misure, puberta: t?.puberta ?? [], etaOssea: t?.etaOssea ?? [], esami: t?.esami ?? [], testGh: t?.testGh ?? [],
                target: targetDaCartella(anamnesi, p.sesso) }} />
    );
  }

  return (
    <div className="space-y-6">
      {portale}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href={link('auxologia')} className="text-sm text-teal-700 hover:underline">← Auxologia</a>
          <h1 className="text-2xl font-semibold text-slate-900">{p.cognome} {p.nome}</h1>
          <p className="text-slate-700">
            Nato/a il <span className="font-semibold tabular-nums">{fmtGiornoIso(p.data_nascita)}</span> · <span className="font-semibold">{etaEstesa(p.data_nascita, oggiIso())}</span> · {p.sesso === 'M' ? 'maschio' : 'femmina'}
            {target && <> · target genetico <span className="font-semibold">{n(target.cm)} cm</span></>}
          </p>
          <p className="text-sm text-slate-500">
            {[p.genitore_nome && `Genitore: ${p.genitore_nome}`, p.genitore_telefono && `tel. ${p.genitore_telefono}`, p.pediatra_curante && `Pediatra curante: ${p.pediatra_curante}`, p.inviato_da && `Inviato da: ${p.inviato_da}`].filter(Boolean).join(' · ')}
          </p>
          <p className="text-sm text-slate-500">
            Codice fiscale: {cf ? <span className="font-mono text-slate-800">{cf}</span> : <button onClick={() => void leggiCf(true)} className="text-teal-700 underline">mostra</button>}
            {p.stato === 'archiviato' && <> · <Badge>Archiviato</Badge></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Bottone variante="primario" onClick={() => {
            if (editor && !window.confirm('C\'è una visita aperta: le modifiche non salvate andranno perse. Aprire una nuova visita?')) return;
            setScheda('visite'); setEditor('nuova');
          }}>
            {t?.visite.length ? '+ Visita di controllo' : '+ Prima visita'}
          </Bottone>
          <Bottone onClick={() => setDatiAperti(true)}>Dati anagrafici</Bottone>
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

      {tutto.errore && <Errore messaggio={tutto.errore} />}
      {erroreStampa && <Errore messaggio={`Referto non generato: ${erroreStampa}`} />}
      {!t && !tutto.errore && <Caricamento />}

      {t && scheda === 'riepilogo' && <Riepilogo t={t} p={p} misure={misure} vai={setScheda} />}

      {t && scheda === 'crescita' && (
        <div className="space-y-6">
          <Pannello titolo="Curve di crescita" sottotitolo="Statura, peso, BMI e circonferenza cranica in DS; target genetico ed età ossea sulla statura">
            {misure.length === 0 ? <Vuoto testo="Nessuna misura: aggiungila qui sotto o dalla visita." />
              : <GraficoAuxologico sesso={p.sesso} misure={misure} target={target} etaOssea={puntiEtaOssea(t.etaOssea, misure)} />}
          </Pannello>
          <Registro titolo="Misure" sottotitolo="Le DS si calcolano dalla data di nascita; l'età la registra il database" tabella="auxo_misure" pseudo={ps}
            campi={CAMPI_MISURA} onCambio={cambia} aggiorna={versione} iniziali={() => ({ data: oggi() })}
            suggerimento={(v) => <AnteprimaMisura v={v} p={p} misure={t.misure} />}
            riassunto={(r) => <RigaMisura m={misure.find((x) => x.riga.id === r.id)} r={r} />} />
          <p className="text-xs text-slate-500">
            DS e percentili con il metodo LMS: curve italiane SIEDP (Cacciari et al., 2006) dai 2 anni, curve OMS sotto i 2 anni e per la circonferenza cranica
            (sotto i 2 anni la lunghezza da sdraiato; se misurata in piedi si aggiungono 0,7 cm, come indica l'OMS). Velocità di crescita su un intervallo
            di almeno 6 mesi, preferibilmente circa un anno. La velocità in DS va letta sulle tabelle di riferimento e inserita a mano.
          </p>
        </div>
      )}

      {t && scheda === 'puberta' && (
        <div className="space-y-6">
          <Registro titolo="Stadio puberale (Tanner)" tabella="auxo_puberta" pseudo={ps} campi={campiPuberta(p.sesso)} onCambio={cambia} aggiorna={versione}
            iniziali={() => ({ data: oggi() })}
            riassunto={(r) => {
              const v = valutaPuberta({ sesso: p.sesso, eta: etaDecimale(p.data_nascita, dataDi(r)), b: r.tanner_b as number | null, g: r.tanner_g as number | null,
                ph: r.tanner_ph as number | null, menarca: r.menarca as boolean | null,
                testicoli_ml: r.testicolo_dx_ml != null || r.testicolo_sx_ml != null ? Math.max(Number(r.testicolo_dx_ml ?? 0), Number(r.testicolo_sx_ml ?? 0)) : null });
              return (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="tabular-nums text-slate-500">{giorno(r.data)} · {n(Number(r.eta_anni), 1)} anni</span>
                  <span className="font-medium">{p.sesso === 'F'
                    ? [r.tanner_b != null && `B${r.tanner_b}`, r.tanner_ph != null && `PH${r.tanner_ph}`, r.menarca === true && 'menarca', r.menarca === false && 'no menarca'].filter(Boolean).join(' · ')
                    : [r.tanner_g != null && `G${r.tanner_g}`, r.tanner_ph != null && `PH${r.tanner_ph}`, (r.testicolo_dx_ml != null || r.testicolo_sx_ml != null) && `testicoli ${r.testicolo_dx_ml ?? '—'}/${r.testicolo_sx_ml ?? '—'} ml`].filter(Boolean).join(' · ')}</span>
                  {v.esito !== 'dati_insufficienti' && <Badge tono={v.esito === 'nei_limiti' ? 'ok' : 'attenzione'}>{v.testo}</Badge>}
                </p>
              );
            }} />
          <Registro titolo="Età ossea" tabella="auxo_eta_ossea" pseudo={ps} campi={CAMPI_ETA_OSSEA} onCambio={cambia} aggiorna={versione}
            iniziali={() => ({ data: oggi(), metodo: 'greulich_pyle' })}
            suggerimento={(v) => {
              const eo = Number(String(v.eta_ossea_anni).replace(',', '.'));
              if (!v.data || !eo) return null;
              const ec = (Date.parse(String(v.data)) - Date.parse(p.data_nascita)) / (365.25 * 86_400_000);
              const d = differenzaEtaOssea(eo, ec);
              return <p className="text-sm text-slate-600">Età cronologica alla radiografia: {n(ec, 2)} anni · età ossea {d >= 0 ? 'avanzata' : 'ritardata'} di {n(Math.abs(d), 1)} anni.</p>;
            }}
            riassunto={(r) => {
              const d = differenzaEtaOssea(Number(r.eta_ossea_anni), Number(r.eta_anni));
              return (
                <div>
                  <p className="flex flex-wrap items-center gap-x-3">
                    <span className="tabular-nums text-slate-500">{giorno(r.data)}</span>
                    <span className="font-medium">Età ossea {n(Number(r.eta_ossea_anni), 1)} anni</span>
                    <span>età cronologica {n(Number(r.eta_anni), 1)} anni ({d >= 0 ? '+' : '−'}{n(Math.abs(d), 1)})</span>
                    <span className="text-xs text-slate-500">{METODI_ETA_OSSEA[s(r, 'metodo')]}</span>
                  </p>
                  {r.previsione_statura_cm != null && <p className="text-xs text-slate-500">Statura adulta prevista {n(Number(r.previsione_statura_cm))} cm{target ? ` (target ${n(target.cm)} cm)` : ''}</p>}
                </div>
              );
            }} />
          <p className="text-xs text-slate-500">
            Pubertà precoce: inizio prima degli 8 anni nelle femmine (B2) e dei 9 anni nei maschi (testicoli ≥ 4 ml). Ritardo puberale: nessun bottone
            mammario a 13 anni nelle femmine, testicoli &lt; 4 ml a 14 anni nei maschi; senza menarca a 15 anni valutare l'amenorrea primaria
            (Klein et al., Am Fam Physician 2017).
          </p>
        </div>
      )}

      {t && scheda === 'esami' && (
        <div className="space-y-6">
          <Registro titolo="Esami di laboratorio e genetici" tabella="auxo_esami" pseudo={ps} campi={CAMPI_ESAME} onCambio={cambia} aggiorna={versione}
            iniziali={() => ({ data: oggi(), esame: 'igf1' })}
            riassunto={(r) => {
              const fuori = r.valore != null && ((r.rif_min != null && Number(r.valore) < Number(r.rif_min)) || (r.rif_max != null && Number(r.valore) > Number(r.rif_max)));
              return (
                <p className="flex flex-wrap items-center gap-x-3">
                  <span className="tabular-nums text-slate-500">{giorno(r.data)}</span>
                  <span className="font-medium">{r.esame === 'altro' ? s(r, 'descrizione') : ESAMI_AUXO[s(r, 'esame')]}</span>
                  <span>{r.valore != null ? `${String(r.valore).replace('.', ',')} ${s(r, 'unita')}` : ''}{r.valore_testo ? s(r, 'valore_testo') : ''}</span>
                  {(r.rif_min != null || r.rif_max != null) && <span className="text-xs text-slate-500">rif. {s(r, 'rif_min') || '—'}–{s(r, 'rif_max') || '—'}</span>}
                  {r.sds != null && <span className="text-xs">{fmtSds(Number(r.sds))}</span>}
                  {fuori && <Badge tono="attenzione">fuori dall'intervallo del laboratorio</Badge>}
                </p>
              );
            }} />
          <Registro titolo="Test di stimolo del GH" tabella="auxo_test_gh" pseudo={ps} campi={CAMPI_TEST_GH} onCambio={cambia} aggiorna={versione}
            iniziali={() => ({ data: oggi(), stimolo: 'arginina', priming: false })}
            trasforma={(r) => { const x = { ...r }; delete x.soglia_ug_l; delete x.sotto_soglia; return x; }}
            suggerimento={(v) => v.stimolo ? <p className="text-sm text-slate-600">Soglia della Nota AIFA 39 per questo stimolo: picco &lt; {sogliaGh(String(v.stimolo) as StimoloGh)} µg/L.</p> : null}
            riassunto={(r) => (
              <p className="flex flex-wrap items-center gap-x-3">
                <span className="tabular-nums text-slate-500">{giorno(r.data)}</span>
                <span className="font-medium">{STIMOLI_GH[s(r, 'stimolo')]}{r.priming ? ' (priming)' : ''}</span>
                <span>picco {String(r.picco_ug_l).replace('.', ',')} µg/L</span>
                <Badge tono={r.sotto_soglia ? 'attenzione' : 'ok'}>{r.sotto_soglia ? `sotto la soglia di ${r.soglia_ug_l}` : `non sotto la soglia di ${r.soglia_ug_l}`}</Badge>
              </p>
            )} />
          <p className="text-xs text-slate-500">
            Nota AIFA 39 (età evolutiva): deficit di GH con picco &lt; 8 µg/L in due test con stimoli diversi eseguiti in giorni diversi; con GHRH + arginina
            la soglia è 20 µg/L. Fare riferimento sempre al testo vigente pubblicato da AIFA.
          </p>
        </div>
      )}

      {t && scheda === 'terapie' && (
        <Registro titolo="Terapie" tabella="auxo_terapie" pseudo={ps} campi={CAMPI_TERAPIA_AUXO} ordine="dal" onCambio={cambia} aggiorna={versione}
          iniziali={() => ({ dal: oggi(), classe: 'somatropina', peso_riferimento_kg: misure.find((m) => m.peso != null)?.peso?.toString() ?? '' })}
          suggerimento={(v) => {
            const d = Number(String(v.dose_ug_kg_die).replace(',', '.'));
            if (v.classe !== 'somatropina' || !d) return null;
            const peso = Number(String(v.peso_riferimento_kg).replace(',', '.'));
            return (
              <p className={`text-sm ${d > DOSE_MASSIMA_GH_UG_KG_DIE ? 'text-rose-700' : 'text-slate-600'}`}>
                {peso > 0 ? `Corrisponde a ${n((d * peso) / 1000, 2)} mg/die (${n((d * peso * 7) / 1000, 2)} mg/settimana) per ${n(peso, 1)} kg. ` : ''}
                {d > DOSE_MASSIMA_GH_UG_KG_DIE ? `Supera la dose massima di ${DOSE_MASSIMA_GH_UG_KG_DIE} µg/kg/die indicata dalla Nota AIFA 39.` : ''}
              </p>
            );
          }}
          riassunto={(r) => (
            <div>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{s(r, 'farmaco')}</span>
                <span className="text-xs text-slate-500">{CLASSI_TERAPIA_AUXO[s(r, 'classe')]}</span>
                {inCorso(r) ? <Badge tono="info">In corso</Badge> : <Badge>Conclusa</Badge>}
                {r.dose_ug_kg_die != null && <Badge tono={Number(r.dose_ug_kg_die) > DOSE_MASSIMA_GH_UG_KG_DIE ? 'errore' : 'neutro'}>{String(r.dose_ug_kg_die).replace('.', ',')} µg/kg/die</Badge>}
              </p>
              <p className="text-xs text-slate-500">
                {[r.posologia && s(r, 'posologia'), r.indicazione_nota39 && `Nota 39: ${INDICAZIONI_NOTA39[s(r, 'indicazione_nota39')]}`,
                  `dal ${giorno(r.dal)}${r.al ? ` al ${giorno(r.al)}` : ''}`,
                  r.piano_terapeutico_scadenza && `piano terapeutico fino al ${giorno(r.piano_terapeutico_scadenza)}`].filter(Boolean).join(' · ')}
              </p>
            </div>
          )} />
      )}

      {t && scheda === 'visite' && editor && (
        <VisitaAuxologica pseudo={ps} paziente={p} visita={editor === 'nuova' ? null : editor} visite={t.visite} misure={t.misure}
          cartella={t.cartella} terapieGh={terapiaGhInCorso(t)}
          onChiudi={() => { setEditor(null); cambia(); }} onSalvata={() => { setEditor(null); cambia(); }} />
      )}
      {t && scheda === 'visite' && !editor && (
        <div className="space-y-6">
          <ElencoVisite visite={t.visite} onApri={setEditor} onStampa={(v, g) => { setErroreStampa(null); elementoReferto(v, g).then(stampa).catch((e: unknown) => setErroreStampa(e instanceof Error ? e.message : String(e))); }} onInvia={setInvio} />
          <Registro titolo="Diagnosi" tabella="auxo_diagnosi" pseudo={ps} campi={CAMPI_DIAGNOSI_AUXO} ordine="creato_il" onCambio={cambia} aggiorna={versione}
            iniziali={() => ({ stato: 'attiva', data_diagnosi: oggi() })} trasforma={(r) => ({ ...r, aggiornato_il: new Date().toISOString() })}
            riassunto={(r) => (
              <div>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{s(r, 'descrizione')}</span>
                  <Badge tono={r.stato === 'attiva' ? 'info' : r.stato === 'sospetta' ? 'attenzione' : 'ok'}>{STATI_DIAGNOSI[s(r, 'stato')]}</Badge>
                </p>
                <p className="text-xs text-slate-500">{AREE_AUXO[s(r, 'area')]}{r.data_diagnosi ? ` · dal ${giorno(r.data_diagnosi)}` : ''}</p>
              </div>
            )} />
        </div>
      )}

      {t && scheda === 'anamnesi' && <Anamnesi pseudo={ps} cartella={t.cartella} sesso={p.sesso} onSalvata={cambia} />}

      {invio && (
        <Finestra titolo={`Invia ai genitori · visita del ${giorno(invio.data)}`} onChiudi={() => setInvio(null)} larga>
          <InviaDocumenti
            auxoPazienteId={p.id} studioId={p.studio_id} nomeStudio={studio.dati?.nome}
            descrizione={`Referto della visita auxologica del ${giorno(invio.data)}`}
            documenti={[
              { id: 'grafico', titolo: `Referto auxologico ${giorno(invio.data).replace(/\//g, '-')}`, crea: () => elementoReferto(invio, true) },
              { id: 'senza', titolo: `Referto auxologico (senza grafico) ${giorno(invio.data).replace(/\//g, '-')}`, crea: () => elementoReferto(invio, false), preselezionato: false },
            ]}
            destinatari={p.genitore_nome || p.genitore_email || p.genitore_telefono ? [{
              chiave: 'genitore', nome: p.genitore_nome || 'Genitore', ruolo: 'Genitore (anagrafica auxologica)',
              email: p.genitore_email ?? null, telefono: p.genitore_telefono ?? null,
            }] : []}
            onChiudi={() => setInvio(null)} />
        </Finestra>
      )}
      {datiAperti && (
        <Finestra titolo="Dati anagrafici e contatti" onChiudi={() => setDatiAperti(false)} larga>
          <ModificaDati p={p} onFatto={() => { setDatiAperti(false); paziente.ricarica(); }} />
        </Finestra>
      )}
    </div>
  );
}

function RigaMisura({ m, r }: { m: MisuraAnalizzata | undefined; r: RigaAllergo }) {
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="tabular-nums text-slate-500">{giorno(r.data)} · {n(Number(r.eta_anni), 2)} anni</span>
        {r.altezza_cm != null && <span><b>{String(r.altezza_cm).replace('.', ',')} cm</b>{r.posizione === 'sdraiato' ? ' (sdraiato)' : ''}{m?.sdsAltezza ? ` · ${fmtSds(m.sdsAltezza.z)} · ${fmtPercentileFine(m.sdsAltezza.percentile)} pc` : ''}</span>}
        {r.peso_kg != null && <span>{String(r.peso_kg).replace('.', ',')} kg{m?.sdsPeso ? ` (${fmtSds(m.sdsPeso.z)})` : ''}</span>}
        {r.bmi != null && <span>BMI {String(r.bmi).replace('.', ',')}{m?.sdsBmi ? ` (${fmtSds(m.sdsBmi.z)})` : ''}</span>}
        {m?.classePeso && m.classePeso.classe !== 'normale' && <Badge tono="attenzione">{m.classePeso.etichetta}</Badge>}
        {r.cc_cm != null && <span>CC {String(r.cc_cm).replace('.', ',')} cm{m?.sdsCc ? ` (${fmtSds(m.sdsCc.z)})` : ''}</span>}
        {m?.velocita && <span className={m.velocita.affidabile ? '' : 'text-amber-700'}>vel. {n(m.velocita.cmAnno)} cm/anno{r.velocita_sds != null ? ` (${fmtSds(Number(r.velocita_sds))})` : ''}</span>}
        {r.pas_mmhg != null && <span>PA {String(r.pas_mmhg)}/{String(r.pad_mmhg)}</span>}
        {m?.sdsAltezza && <span className="text-xs text-slate-400">{m.sdsAltezza.curva}</span>}
      </p>
      {r.note ? <p className="text-xs text-slate-500">{s(r, 'note')}</p> : null}
    </div>
  );
}

/** Anteprima dei calcoli mentre si inserisce una misura. */
function AnteprimaMisura({ v, p, misure }: { v: Valori; p: AuxoPaziente; misure: RigaAllergo[] }) {
  const data = String(v.data ?? '');
  if (!data || data < p.data_nascita) return null;
  const numero = (k: string) => { const x = Number(String(v[k] ?? '').replace(',', '.')); return x > 0 ? x : null; };
  const alt = numero('altezza_cm');
  const peso = numero('peso_kg');
  if (!alt && !peso && !numero('cc_cm')) return null;
  const riga: RigaAllergo = { id: 'anteprima', pseudo_id: '', data, altezza_cm: alt, peso_kg: peso, cc_cm: numero('cc_cm'),
    posizione: v.posizione || null, bmi: alt && peso ? Math.round((peso / (alt / 100) ** 2) * 100) / 100 : null };
  let m: MisuraAnalizzata | undefined;
  try { m = analizzaMisure(p.data_nascita, p.sesso, [...misure.filter((x) => String(x.data) <= data), riga]).find((x) => x.riga.id === 'anteprima'); } catch { m = undefined; }
  if (!m) return null;
  return (
    <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
      {[m.sdsAltezza && `Statura ${fmtSds(m.sdsAltezza.z)} (${fmtPercentileFine(m.sdsAltezza.percentile)} pc, ${m.sdsAltezza.curva})`,
        m.sdsPeso && `peso ${fmtSds(m.sdsPeso.z)}`, m.bmi != null && `BMI ${n(m.bmi, 1)}`,
        m.classePeso && m.classePeso.etichetta.toLowerCase(), m.sdsCc && `CC ${fmtSds(m.sdsCc.z)}`,
        m.velocita && `velocità ${n(m.velocita.cmAnno)} cm/anno dal ${giorno(m.velocita.da)}`].filter(Boolean).join(' · ')}
    </p>
  );
}

const STATO_CRITERIO: Record<Criterio['stato'], { testo: string; tono: Tono }> = {
  soddisfatto: { testo: 'Soddisfatto', tono: 'attenzione' },
  non_soddisfatto: { testo: 'Non soddisfatto', tono: 'neutro' },
  dati_insufficienti: { testo: 'Dati insufficienti', tono: 'info' },
};

function Riepilogo({ t, p, misure, vai }: { t: Tutto; p: AuxoPaziente; misure: MisuraAnalizzata[]; vai: (s: Scheda) => void }) {
  const ultima = ultimaStatura(misure);
  const ultimaPeso = misure.find((m) => m.peso != null) ?? null;
  const target = targetDaCartella(t.cartella, p.sesso);
  const differenzaTarget = ultima?.sdsAltezza?.riferimento === 'cacciari' && target?.sds != null ? ultima.sdsAltezza.z - target.sds : null;
  const pub = t.puberta[0];
  const etaPub = pub ? etaDecimale(p.data_nascita, dataDi(pub)) : 0;
  const valPub = pub ? valutaPuberta({ sesso: p.sesso, eta: etaPub, b: pub.tanner_b as number | null, g: pub.tanner_g as number | null,
    ph: pub.tanner_ph as number | null, menarca: pub.menarca as boolean | null,
    testicoli_ml: pub.testicolo_dx_ml != null || pub.testicolo_sx_ml != null ? Math.max(Number(pub.testicolo_dx_ml ?? 0), Number(pub.testicolo_sx_ml ?? 0)) : null }) : null;
  const pubarca = pub ? pubarcaPrecoce({ sesso: p.sesso, eta: etaPub, b: pub.tanner_b as number | null, g: pub.tanner_g as number | null,
    ph: pub.tanner_ph as number | null,
    testicoli_ml: pub.testicolo_dx_ml != null || pub.testicolo_sx_ml != null ? Math.max(Number(pub.testicolo_dx_ml ?? 0), Number(pub.testicolo_sx_ml ?? 0)) : null }) : false;
  const eo = t.etaOssea[0];
  const ghInCorso = t.terapie.filter((x) => (x.classe === 'somatropina' || x.classe === 'gh_lunga_durata') && inCorso(x));
  const oggi = oggiIso();

  // Nota 39: velocità in DS inserita dal medico, valida solo su un intervallo di almeno 6 mesi; per
  // «2 anni consecutivi» servono due intervalli annuali (≥ 0,9 anni) consecutivi, entrambi con la DS.
  const etaOggi = etaDecimale(p.data_nascita, oggiIso());
  const velOk = ultima?.velocita?.affidabile ? ultima : null;
  const inizio = velOk ? misure.find((m) => m.data === velOk.velocita!.da && m.altezza != null) : undefined;
  const annoPrecedente = velOk && velOk.velocita!.anni >= 0.9 && inizio?.velocita?.affidabile && inizio.velocita.anni >= 0.9
    ? inizio.velocitaSds : null;
  const dati39 = {
    sesso: p.sesso, eta: etaOggi, sdsStatura: ultima?.sdsAltezza?.z ?? null,
    sdsTarget: ultima?.sdsAltezza?.riferimento === 'cacciari' ? target?.sds ?? null : null,
    sdsVelocita: velOk?.velocitaSds ?? null, sdsVelocitaAnnoPrecedente: annoPrecedente,
    variazioneSdsAnno: ultima?.velocita && ultima.velocita.anni >= 0.9 ? ultima.deltaSdsAnno : null,
    lesioniIpotalamoIpofisarie: (t.cartella.lesioni_ipotalamo_ipofisarie as boolean | null) ?? null,
    testGh: t.testGh.map((x) => ({ data: dataDi(x), stimolo: x.stimolo as StimoloGh, picco_ug_l: Number(x.picco_ug_l) })),
  };
  const n39 = criteriNota39(dati39);
  const sga = criterioSga({ sdsPesoNascita: t.cartella.sds_peso_nascita != null ? Number(t.cartella.sds_peso_nascita) : null,
    sdsLunghezzaNascita: t.cartella.sds_lunghezza_nascita != null ? Number(t.cartella.sds_lunghezza_nascita) : null,
    eta: etaOggi, sdsStatura: ultima?.sdsAltezza?.z ?? null, sdsVelocita: velOk?.velocitaSds ?? null });
  const sospensione = ghInCorso.length ? criteriSospensioneGh(p.sesso, ultima?.velocita?.affidabile ? ultima.velocita.cmAnno : null, eo ? Number(eo.eta_ossea_anni) : null) : [];

  const allerte: { testo: string; tono: 'attenzione' | 'errore' }[] = [];
  const zS = ultima?.sdsAltezza ? arrotonda2(ultima.sdsAltezza.z) : null;
  if (zS != null && zS <= -2) allerte.push({ testo: `Statura ${fmtSds(zS)} (≤ −2 DS) al ${giorno(ultima!.data)}.`, tono: 'attenzione' });
  if (zS != null && zS >= 2) allerte.push({ testo: `Statura ${fmtSds(zS)} (≥ +2 DS) al ${giorno(ultima!.data)}.`, tono: 'attenzione' });
  if (differenzaTarget != null && arrotonda2(differenzaTarget) <= -1.5) allerte.push({ testo: `Statura ${fmtSds(differenzaTarget)} rispetto al target genetico.`, tono: 'attenzione' });
  if (dati39.variazioneSdsAnno != null && arrotonda2(dati39.variazioneSdsAnno) <= -0.5) allerte.push({ testo: `Perdita di ${n(Math.abs(dati39.variazioneSdsAnno), 2)} DS/anno di statura.`, tono: 'attenzione' });
  if (ultimaPeso?.classePeso && ultimaPeso.classePeso.classe !== 'normale') allerte.push({ testo: `${ultimaPeso.classePeso.etichetta} (${ultimaPeso.classePeso.fonte}, ${fmtPercentileFine(ultimaPeso.classePeso.percentile)} pc).`, tono: 'attenzione' });
  if (ultimaPeso && avvisoVitaAltezza(ultimaPeso.vitaAltezza, ultimaPeso.mesi, ultimaPeso.classePeso?.classe)) {
    allerte.push({ testo: `Rapporto vita/statura ${n(ultimaPeso.vitaAltezza, 2)} (> 0,5) con eccesso ponderale: la consensus SIEDP-SIP 2018 suggerisce lo screening della steatosi epatica.`, tono: 'attenzione' });
  }
  const cc = misure.find((m) => m.sdsCc);
  if (cc?.sdsCc && Math.abs(arrotonda2(cc.sdsCc.z)) >= 2) allerte.push({ testo: `Circonferenza cranica ${fmtSds(cc.sdsCc.z)} al ${giorno(cc.data)}.`, tono: 'attenzione' });
  if (valPub && (valPub.esito === 'precoce' || valPub.esito === 'ritardo' || valPub.esito === 'amenorrea_primaria')) allerte.push({ testo: valPub.testo, tono: 'attenzione' });
  if (pubarca) allerte.push({ testo: `Pubarca prima ${p.sesso === 'F' ? 'degli 8' : 'dei 9'} anni senza segni documentati di attivazione gonadica.`, tono: 'attenzione' });
  for (const x of ghInCorso) {
    if (x.dose_ug_kg_die != null && Number(x.dose_ug_kg_die) > DOSE_MASSIMA_GH_UG_KG_DIE) allerte.push({ testo: `${s(x, 'farmaco')}: dose oltre ${DOSE_MASSIMA_GH_UG_KG_DIE} µg/kg/die.`, tono: 'errore' });
    if (x.piano_terapeutico_scadenza && String(x.piano_terapeutico_scadenza) < oggi) allerte.push({ testo: `Piano terapeutico di ${s(x, 'farmaco')} scaduto il ${giorno(x.piano_terapeutico_scadenza)}.`, tono: 'errore' });
  }
  for (const x of sospensione) allerte.push({ testo: `Terapia con GH: ${x}`, tono: 'attenzione' });

  const riga = (etichetta: string, valore: string, nota?: string) => (
    <div><dt className="text-slate-500">{etichetta}</dt><dd className="font-medium text-slate-900">{valore}{nota && <span className="block text-xs font-normal text-slate-500">{nota}</span>}</dd></div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Pannello titolo="Situazione auxologica" sottotitolo={ultima ? `Ultima statura il ${giorno(ultima.data)} (${n(ultima.anni, 2)} anni)` : undefined}
                className="lg:col-span-2" azione={<button onClick={() => vai('crescita')} className="text-sm text-teal-700 underline">Curve e misure</button>}>
        {!ultima && !ultimaPeso ? <Vuoto testo="Nessuna misura registrata." /> : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {ultima && riga('Statura', `${n(ultima.altezza)} cm · ${fmtSds(ultima.sdsAltezza?.z)}`, ultima.sdsAltezza ? `${fmtPercentileFine(ultima.sdsAltezza.percentile)} pc · ${ultima.sdsAltezza.curva}` : undefined)}
            {ultimaPeso && riga('Peso', `${n(ultimaPeso.peso, 2)} kg · ${fmtSds(ultimaPeso.sdsPeso?.z)}`, ultimaPeso.sdsPeso ? `${fmtPercentileFine(ultimaPeso.sdsPeso.percentile)} pc` : undefined)}
            {ultimaPeso?.bmi != null && riga('BMI', `${n(ultimaPeso.bmi, 1)} kg/m² · ${fmtSds(ultimaPeso.sdsBmi?.z)}`,
              ultimaPeso.classePeso ? `${ultimaPeso.classePeso.etichetta} (${ultimaPeso.classePeso.fonte})` : undefined)}
            {ultima?.velocita && riga('Velocità di crescita', `${n(ultima.velocita.cmAnno)} cm/anno`,
              `dal ${giorno(ultima.velocita.da)} (${n(ultima.velocita.anni * 12, 0)} mesi)${ultima.velocita.affidabile && ultima.velocitaSds != null ? ` · ${fmtSds(ultima.velocitaSds)} (DS inserita dal medico)` : ''}${ultima.velocita.avviso ? ` · ${ultima.velocita.avviso}` : ''}`)}
            {target ? riga('Target genetico', `${n(target.cm)} cm (${n(target.min)}–${n(target.max)})`, `${fmtSds(target.sds)}${differenzaTarget != null ? ` · statura − target ${fmtSds(differenzaTarget)}` : ''}`)
              : riga('Target genetico', '—', 'Inserisci le stature dei genitori in «Anamnesi e genitori»')}
            {ultima?.deltaSdsAnno != null && riga('Variazione DS statura', `${fmtSds(ultima.deltaSdsAnno)}/anno`)}
            {eo && riga('Età ossea', `${n(Number(eo.eta_ossea_anni), 1)} anni`, `a ${n(Number(eo.eta_anni), 1)} anni (${giorno(eo.data)}, ${METODI_ETA_OSSEA[s(eo, 'metodo')]})`)}
            {pub && riga('Pubertà', p.sesso === 'F'
              ? [pub.tanner_b != null && `B${pub.tanner_b}`, pub.tanner_ph != null && `PH${pub.tanner_ph}`, pub.menarca === true && 'menarca'].filter(Boolean).join(' ')
              : [pub.tanner_g != null && `G${pub.tanner_g}`, pub.tanner_ph != null && `PH${pub.tanner_ph}`, (pub.testicolo_dx_ml != null || pub.testicolo_sx_ml != null) && `${pub.testicolo_dx_ml ?? '—'}/${pub.testicolo_sx_ml ?? '—'} ml`].filter(Boolean).join(' '),
              `${giorno(pub.data)} · ${valPub?.testo ?? ''}`)}
          </dl>
        )}
      </Pannello>

      <Pannello titolo="Allerte" sottotitolo="Soglie documentate; la valutazione resta del medico">
        {allerte.length === 0 ? <Vuoto testo="Nessuna allerta sui dati registrati." /> : (
          <ul className="space-y-1 text-sm">{allerte.map((a, i) => <li key={`${i}-${a.testo}`} className={a.tono === 'errore' ? 'text-rose-700' : 'text-amber-800'}>{a.testo}</li>)}</ul>
        )}
      </Pannello>

      <Pannello titolo="Diagnosi e terapie" azione={<button onClick={() => vai('visite')} className="text-sm text-teal-700 underline">Gestisci</button>}>
        <ul className="space-y-1 text-sm">
          {t.diagnosi.filter((d) => d.stato === 'attiva' || d.stato === 'sospetta').map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2"><Badge tono="info">{AREE_AUXO[s(d, 'area')]}</Badge>{s(d, 'descrizione')}{d.stato === 'sospetta' && <Badge tono="attenzione">sospetta</Badge>}</li>
          ))}
          {t.terapie.filter(inCorso).map((x) => <li key={x.id}><span className="font-medium">{s(x, 'farmaco')}</span>{x.posologia ? ` · ${s(x, 'posologia')}` : ''}</li>)}
          {!t.diagnosi.some((d) => d.stato === 'attiva' || d.stato === 'sospetta') && !t.terapie.some(inCorso) && <li className="text-slate-500">Nessuna diagnosi attiva né terapia in corso.</li>}
        </ul>
      </Pannello>

      <Pannello titolo="Nota AIFA 39 · promemoria dei criteri" className="lg:col-span-2"
                sottotitolo="Ormone della crescita in età evolutiva, sui dati in cartella. Non sostituisce la valutazione del centro prescrittore né il testo vigente della Nota.">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-slate-800">
            {n39.almenoUnAuxologico ? 'Almeno un criterio auxologico risulta soddisfatto' : 'Nessun criterio auxologico risulta soddisfatto'} ·
            laboratorio: {STATO_CRITERIO[n39.laboratorio.stato].testo.toLowerCase()}
          </summary>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {[...n39.auxologici, n39.laboratorio, sga].map((c) => (
              <li key={c.codice} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <span className="min-w-0 flex-1"><span className="font-medium text-slate-900">{c.codice === 'lab' ? 'Laboratorio' : c.codice === 'sga' ? 'SGA' : `Criterio ${c.codice})`}</span> {c.titolo}
                  <span className="block text-xs text-slate-500">{c.dettaglio}</span></span>
                <Badge tono={STATO_CRITERIO[c.stato].tono}>{STATO_CRITERIO[c.stato].testo}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            La velocità in DS è quella inserita nelle misure (letta sulle tabelle di riferimento, su almeno 6 mesi); per «2 anni consecutivi» si usa anche quella
            della misura di inizio intervallo. Limiti di età per l'avvio, criteri per Turner, insufficienza renale cronica, Prader-Willi, SHOX, Noonan e
            craniofaringioma, sospensione (saldatura delle epifisi, velocità &lt; 2 cm/anno o età ossea &gt; 14 anni F / &gt; 16 anni M) e dose massima ({DOSE_MASSIMA_GH_UG_KG_DIE} µg/kg/die):
            vedere il testo della Nota sul sito AIFA.
          </p>
        </details>
      </Pannello>

      <Pannello titolo="Ultima visita" className="lg:col-span-2">
        {!t.visite[0] ? <Vuoto testo="Nessuna visita registrata." /> : (
          <div className="text-sm">
            <p className="font-medium text-slate-900">{giorno(t.visite[0].data)} · {s(t.visite[0], 'motivo')}</p>
            {t.visite[0].conclusioni ? <p className="text-slate-700">{s(t.visite[0], 'conclusioni')}</p> : null}
            {t.visite[0].prossimo_controllo ? (
              <p className={String(t.visite[0].prossimo_controllo) < oggi ? 'text-rose-700' : 'text-teal-800'}>
                Prossimo controllo: {giorno(t.visite[0].prossimo_controllo)}{String(t.visite[0].prossimo_controllo) < oggi ? ' (superato)' : ''}
              </p>
            ) : null}
          </div>
        )}
      </Pannello>
    </div>
  );
}

function ElencoVisite({ visite, onApri, onStampa, onInvia }: {
  visite: RigaAllergo[]; onApri: (v: RigaAllergo | 'nuova') => void; onStampa: (v: RigaAllergo, grafico: boolean) => void; onInvia: (v: RigaAllergo) => void;
}) {
  return (
    <Pannello titolo="Visite" sottotitolo="Referto con parametri auxologici, andamento e curva di crescita"
              azione={<Bottone variante="primario" onClick={() => onApri('nuova')}>{visite.length ? '+ Visita di controllo' : '+ Prima visita'}</Bottone>}>
      {visite.length === 0 ? <Vuoto testo="Nessuna visita: inizia con la prima visita auxologica." /> : (
        <ul className="divide-y divide-slate-100">
          {visite.map((v) => (
            <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums text-slate-900">{giorno(v.data)}</span>
                  <Badge tono={v.tipo === 'prima_visita' ? 'info' : 'neutro'}>{TIPI_VISITA_AUXO[s(v, 'tipo')]}</Badge>
                  <span className="text-slate-700">{s(v, 'motivo')}</span>
                </p>
                {v.conclusioni ? <p className="line-clamp-2 text-slate-700">{s(v, 'conclusioni')}</p> : null}
                {v.prossimo_controllo ? <p className="text-xs text-teal-800">Prossimo controllo: {giorno(v.prossimo_controllo)}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Bottone onClick={() => onApri(v)}>Apri</Bottone>
                <Bottone variante="primario" onClick={() => onStampa(v, true)}>Referto</Bottone>
                <Bottone onClick={() => onStampa(v, false)}>Senza grafico</Bottone>
                <Bottone onClick={() => onInvia(v)}>Invia</Bottone>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Pannello>
  );
}

function Anamnesi({ pseudo, cartella, sesso, onSalvata }: { pseudo: string; cartella: Record<string, unknown>; sesso: 'M' | 'F'; onSalvata: () => void }) {
  const [v, setV] = useState<Valori>(() => comeValori(CAMPI_CARTELLA_AUXO, cartella));
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  const padre = Number(String(v.altezza_padre_cm).replace(',', '.'));
  const madre = Number(String(v.altezza_madre_cm).replace(',', '.'));
  const anteprima = padre && madre ? targetDaCartella({ altezza_padre_cm: padre, altezza_madre_cm: madre }, sesso) : null;
  async function salva(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.schema('clinica').from('auxo_cartelle')
      .update({ ...comeRiga(CAMPI_CARTELLA_AUXO, v), aggiornata_il: new Date().toISOString() }).eq('pseudo_id', pseudo);
    setEsito(error ? { ok: false, testo: error.message } : { ok: true, testo: 'Anamnesi salvata.' });
    if (!error) onSalvata();
  }
  return (
    <Pannello titolo="Anamnesi, genitori e nascita" sottotitolo="Le stature dei genitori biologici danno il target genetico; i DS alla nascita servono per i criteri SGA">
      <form onSubmit={(e) => void salva(e)} className="space-y-4">
        {esito && <p className={`rounded-lg p-2 text-sm ${esito.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{esito.testo}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {CAMPI_CARTELLA_AUXO.map((c: Campo) => <CampoModulo key={c.nome} c={c} v={v} onChange={(x) => { setV(x); setEsito(null); }} />)}
        </div>
        {anteprima && (
          <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
            Target genetico ({sesso === 'M' ? '(padre + madre + 13) / 2' : '(padre + madre − 13) / 2'}): <b>{n(anteprima.cm)} cm</b>,
            intervallo {n(anteprima.min)}–{n(anteprima.max)} cm, {fmtSds(anteprima.sds)} sulla statura a 20 anni (Cacciari).
          </p>
        )}
        <Bottone type="submit" variante="primario">Salva anamnesi</Bottone>
      </form>
    </Pannello>
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

function ModificaDati({ p, onFatto }: { p: AuxoPaziente; onFatto: () => void }) {
  const [v, setV] = useState<Valori>(() => comeValori(CAMPI_DATI, p as unknown as Record<string, unknown>));
  const [errore, setErrore] = useState<string | null>(null);
  async function salva(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.schema('anagrafica').from('auxo_pazienti').update(comeRiga(CAMPI_DATI, v)).eq('id', p.id);
    if (error) setErrore(error.message); else onFatto();
  }
  return (
    <form onSubmit={(e) => void salva(e)} className="grid gap-3 md:grid-cols-2">
      {errore && <div className="md:col-span-2"><Errore messaggio={errore} /></div>}
      {CAMPI_DATI.map((c) => <CampoModulo key={c.nome} c={c} v={v} onChange={setV} />)}
      <p className="text-xs text-slate-500 md:col-span-2">Codice fiscale, data di nascita e sesso non si modificano (da essi dipendono età e DS): in caso di errore registra di nuovo il paziente e archivia questa scheda.</p>
      <div className="md:col-span-2"><Bottone type="submit" variante="primario">Salva</Bottone></div>
    </form>
  );
}
