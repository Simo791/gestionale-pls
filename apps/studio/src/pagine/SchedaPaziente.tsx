import {
  etaDaGiorni,
  etaLeggibile,
  type Appuntamento,
  type CartellaClinica,
  type ClaimsApp,
  type Consenso,
  type FinalitaConsenso,
  type Misurazione,
  type Paziente,
  type TipoRelazione,
  type Vaccinazione,
  type Visita,
} from '@pls/shared';
import { useState } from 'react';
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
      setClinica({ cartella, misure, vaccini, visite });
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

  if (paziente.errore) return <Errore messaggio={paziente.errore} />;
  if (paziente.caricamento || !paziente.dati) return <Caricamento righe={6} />;
  const p = paziente.dati;

  // Ultima dichiarazione per (tutore, finalità): i consensi sono uno storico.
  const correnti = new Map<string, Consenso>();
  for (const c of consensi.dati ?? []) {
    const chiave = `${c.tutore_id}|${c.finalita}`;
    if (!correnti.has(chiave)) correnti.set(chiave, c);
  }

  return (
    <div className="space-y-6">
      <div>
        <a href={link('assistiti')} className="text-sm text-teal-700 underline">‹ Assistiti</a>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{p.cognome} {p.nome}</h1>
        <p className="text-sm text-slate-500">
          {p.sesso === 'M' ? 'Maschio' : 'Femmina'} · nato/a il {fmtGiornoIso(p.data_nascita)} · {etaLeggibile(p.data_nascita, oggiIso())}
        </p>
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
        <CartellaAperta dati={clinica} />
      )}
    </div>
  );
}

function CartellaAperta({ dati }: { dati: DatiClinici }) {
  const { cartella, misure, vaccini, visite } = dati;
  return (
    <div className="space-y-6">
      <Pannello titolo="Cartella clinica" sottotitolo="Apertura registrata nel registro di audit">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Allergie</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {cartella?.allergie.length ? cartella.allergie.map((a) => <Badge key={a} tono="errore">{a}</Badge>) : 'Nessuna nota'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Patologie croniche</dt>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Pannello titolo="Crescita" sottotitolo="Misurazioni ai bilanci di salute">
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
                      <td className="px-4 py-1.5">{m.peso_kg ?? '—'}</td>
                      <td className="px-4 py-1.5">{m.altezza_cm ?? '—'}</td>
                      <td className="px-4 py-1.5">{m.circonferenza_cranica_cm ?? '—'}</td>
                      <td className="px-4 py-1.5">{m.bmi ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Pannello>

        <Pannello titolo="Vaccinazioni" sottotitolo={`${vaccini.length} dosi registrate`}>
          {vaccini.length === 0 ? <Vuoto testo="Nessuna vaccinazione registrata." /> : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {vaccini.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="w-24 tabular-nums text-slate-600">{fmtGiornoIso(v.data)}</span>
                  <span className="flex-1 text-slate-800">{v.vaccino}</span>
                  <Badge>Dose {v.dose}</Badge>
                </li>
              ))}
            </ul>
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
