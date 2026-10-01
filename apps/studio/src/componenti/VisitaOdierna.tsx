import {
  etaDaGiorni,
  etaInGiorni,
  fmtPercentile,
  percentileMisura,
  type AllergiaPaziente,
  type CartellaClinica,
  type ControlloCatalogo,
  type ControlloEseguito,
  type DoseCalendario,
  type Indicatore,
  type Misurazione,
  type Paziente,
  type Patologia,
  type PatologiaPaziente,
  type TipoVisita,
  type Vaccinazione,
  type Visita,
} from '@pls/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { q, useDati } from '../lib/dati';
import { ETICHETTA_TIPO_VISITA, fmtData, fmtGiornoIso, oggiIso } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';
import { righeLibretto } from './LibrettoVaccinale';
import { Badge, Bottone, Errore, Vuoto, type Tono } from './ui';

const stileInput = 'w-full rounded-lg border border-slate-300 px-2 py-1.5';
const ORIZZONTE = 60; // giorni: cosa proporre "a breve"

const piuGiorni = (iso: string, n: number) => {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, g! + n)).toISOString().slice(0, 10);
};
const piuMesi = (iso: string, n: number) => {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1 + n, g!)).toISOString().slice(0, 10);
};
/** Numero dal campo di testo, accetta la virgola decimale. */
const numero = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

interface Suggerimento {
  id: string;
  gruppo: 'Vaccinazioni' | 'Screening e controlli' | 'Bilanci di salute' | 'Patologie in carico' | 'Dalla visita precedente';
  testo: string;
  tono: Tono;
  /** Frase da aggiungere alle indicazioni per i genitori. */
  perGenitori: string;
}

const CODICE_ICD9 = /^(V\d{2}(\.\d{1,2})?|E\d{3}(\.\d)?|\d{3}(\.\d{1,2})?)$/;

const Riga = ({ t, v }: { t: string; v: ReactNode }) =>
  v ? <p><span className="text-slate-500">{t}: </span><span className="text-slate-800">{v}</span></p> : null;

export function parametriVitali(v: Visita) {
  return [
    v.temperatura_c !== null && `T ${v.temperatura_c} °C`,
    v.frequenza_cardiaca !== null && `FC ${v.frequenza_cardiaca}/min`,
    v.frequenza_respiratoria !== null && `FR ${v.frequenza_respiratoria}/min`,
    v.saturazione_o2 !== null && `SpO₂ ${v.saturazione_o2}%`,
    v.pa_sistolica !== null && v.pa_diastolica !== null && `PA ${v.pa_sistolica}/${v.pa_diastolica} mmHg`,
  ].filter(Boolean).join(' · ');
}

/**
 * Visita odierna: riepilogo dell'ultima visita e delle ultime misure, cose da proporre a breve
 * ai genitori (calcolate dai calendari e dai dati registrati, senza logica diagnostica) e modulo
 * della visita con misure antropometriche, parametri vitali e indicazioni.
 */
export default function VisitaOdierna({
  pseudo, paziente, cartella, misure, vaccini, visite, onSalvata, onChiudi,
}: {
  pseudo: string;
  paziente: Paziente;
  cartella: CartellaClinica | null;
  misure: Misurazione[];
  vaccini: Vaccinazione[];
  visite: Visita[];
  onSalvata: (v: Visita, m: Misurazione | null) => void;
  onChiudi: () => void;
}) {
  const oggi = oggiIso();
  const etaGiorni = etaInGiorni(paziente.data_nascita, oggi);
  const ultima = visite[0];
  const ultimaMisura = misure[0]; // ordinate per età decrescente

  const [f, setF] = useState({
    tipo: 'ambulatoriale' as TipoVisita, motivo: '', anamnesi: '', peso: '', altezza: '', cc: '',
    temperatura: '', fc: '', fr: '', spo2: '', pas: '', pad: '', esame: '', diagnosi: '', terapia: '',
    indicazioni: '', prossimo: '',
  });
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  const cli = () => supabase.schema('clinica');
  const ana = () => supabase.schema('anagrafica');
  const contesto = useDati(async () => {
    const [cal, catalogo, esiti, bilanci, patologie, catPatologie, allergie, allergeni] = await Promise.all([
      q<DoseCalendario[]>(ana().from('calendario_vaccinale').select('*').order('ordine')),
      q<ControlloCatalogo[]>(ana().from('catalogo_controlli').select('*').order('ordine')),
      q<ControlloEseguito[]>(cli().from('controlli_eseguiti').select('*').eq('pseudo_id', pseudo)),
      q<{ eta_mesi: number; descrizione: string }[]>(ana().from('calendario_bilanci').select('*').order('eta_mesi')),
      q<PatologiaPaziente[]>(cli().from('patologie_paziente').select('*').eq('pseudo_id', pseudo).eq('stato', 'confermata')),
      q<Patologia[]>(ana().from('catalogo_patologie').select('codice, nome, follow_up')),
      q<AllergiaPaziente[]>(cli().from('allergie').select('*').eq('pseudo_id', pseudo).neq('stato', 'risolta')),
      q<{ codice: string; nome: string }[]>(ana().from('catalogo_allergeni').select('codice, nome')),
    ]);
    return { cal, catalogo, esiti, bilanci, patologie, catPatologie, allergie, allergeni };
  }, [pseudo]);

  // ------------------------------------------------------------ cose da proporre a breve
  const suggerimenti: Suggerimento[] = [];
  if (contesto.dati) {
    const { cal, catalogo, esiti, bilanci, patologie, catPatologie } = contesto.dati;
    const limite = piuGiorni(oggi, ORIZZONTE);
    for (const r of righeLibretto(cal, vaccini, paziente.data_nascita)) {
      if (r.eseguita || r.dal > limite) continue;
      const etichetta = `${r.dose.vaccino}, dose ${r.dose.dose}`;
      const stato = r.stato.testo === 'In ritardo' ? 'in ritardo' : r.stato.testo === 'Da fare ora' ? 'da fare ora' : `dal ${fmtGiornoIso(r.dal)}`;
      suggerimenti.push({
        id: `v-${r.dose.codice}`, gruppo: 'Vaccinazioni', tono: r.stato.tono,
        testo: `${etichetta} (${stato}${r.dose.obbligatoria ? ', obbligatoria' : ''})`,
        perGenitori: `Vaccinazione: ${etichetta}${r.dose.obbligatoria ? ' (obbligatoria)' : ''}, ${stato}: prenotare presso il centro vaccinale.`,
      });
    }
    const conRischio = (cartella?.fattori_rischio.length ?? 0) > 0;
    for (const c of catalogo) {
      if (c.destinatari !== 'tutti' && !conRischio) continue;
      if (esiti.some((e) => e.codice_controllo === c.codice)) continue;
      const dal = piuGiorni(paziente.data_nascita, c.finestra_da_giorni);
      const al = piuGiorni(paziente.data_nascita, c.finestra_a_giorni);
      if (dal > limite || al < piuGiorni(oggi, -365)) continue;
      const scaduto = al < oggi;
      suggerimenti.push({
        id: `c-${c.codice}`, gruppo: 'Screening e controlli', tono: scaduto ? 'attenzione' : 'info',
        testo: `${c.nome}: ${scaduto ? `finestra chiusa il ${fmtGiornoIso(al)}, esito non registrato` : `entro il ${fmtGiornoIso(al)}`}. ${c.azione_pediatra}`,
        perGenitori: `${c.nome}: da eseguire entro il ${fmtGiornoIso(al)}.`,
      });
    }
    const prossimo = bilanci.map((b) => ({ ...b, data: piuMesi(paziente.data_nascita, b.eta_mesi) }))
      .find((b) => b.data >= piuGiorni(oggi, -30));
    if (prossimo && prossimo.data <= piuGiorni(oggi, 120)) {
      suggerimenti.push({
        id: `b-${prossimo.eta_mesi}`, gruppo: 'Bilanci di salute', tono: prossimo.data < oggi ? 'attenzione' : 'neutro',
        testo: `${prossimo.descrizione}: previsto intorno al ${fmtGiornoIso(prossimo.data)}`,
        perGenitori: `Prenotare il ${prossimo.descrizione.toLowerCase()} intorno al ${fmtGiornoIso(prossimo.data)}.`,
      });
    }
    for (const p of patologie) {
      const s = catPatologie.find((c) => c.codice === p.patologia);
      if (!s) continue;
      suggerimenti.push({
        id: `p-${p.patologia}`, gruppo: 'Patologie in carico', tono: 'info',
        testo: `${s.nome} — follow-up previsto: ${s.follow_up.join('; ')}`,
        perGenitori: `${s.nome}: proseguire i controlli concordati${p.centro_riferimento ? ` con ${p.centro_riferimento}` : ''}.`,
      });
    }
  }
  if (ultima?.prossimo_controllo && ultima.prossimo_controllo <= piuGiorni(oggi, ORIZZONTE)) {
    suggerimenti.push({
      id: 'u-controllo', gruppo: 'Dalla visita precedente', tono: 'neutro',
      testo: `Nella visita del ${fmtData(ultima.data)} era previsto un controllo il ${fmtGiornoIso(ultima.prossimo_controllo)}`,
      perGenitori: '',
    });
  }
  const allergieGravi = (contesto.dati?.allergie ?? []).filter((a) => a.gravita === 'grave' || a.gravita === 'anafilassi');

  // ------------------------------------------------------------ misure con percentili OMS
  const misuraLive = (ind: Indicatore, v: string) => {
    const x = numero(v);
    if (x === null || Number.isNaN(x)) return null;
    const p = percentileMisura(ind, paziente.sesso, etaGiorni, x);
    return { p, anomalo: p !== null && (p < 0.1 || p > 99.9) };
  };
  const live = { peso: misuraLive('peso', f.peso), altezza: misuraLive('altezza', f.altezza), cc: misuraLive('circonferenza_cranica', f.cc) };
  const pesoN = numero(f.peso);
  const altezzaN = numero(f.altezza);
  const bmi = pesoN && altezzaN ? Math.round((pesoN / (altezzaN / 100) ** 2) * 10) / 10 : null;

  function aggiungiIndicazioni() {
    const testi = suggerimenti.filter((s) => scelti.has(s.id) && s.perGenitori).map((s) => `• ${s.perGenitori}`);
    if (testi.length) setF({ ...f, indicazioni: [f.indicazioni.trim(), ...testi].filter(Boolean).join('\n') });
    setScelti(new Set());
  }

  async function salva(e: FormEvent) {
    e.preventDefault();
    setErrore(null);
    const n = {
      peso: numero(f.peso), altezza: numero(f.altezza), cc: numero(f.cc), temperatura: numero(f.temperatura),
      fc: numero(f.fc), fr: numero(f.fr), spo2: numero(f.spo2), pas: numero(f.pas), pad: numero(f.pad),
    };
    const fuori = (x: number | null, min: number, max: number) => x !== null && (Number.isNaN(x) || x < min || x > max);
    if (fuori(n.peso, 0.3, 199)) return setErrore('Peso non valido (kg).');
    if (fuori(n.altezza, 21, 229)) return setErrore('Lunghezza/altezza non valida (cm).');
    if (fuori(n.cc, 21, 69)) return setErrore('Circonferenza cranica non valida (cm).');
    if (fuori(n.temperatura, 30, 45)) return setErrore('Temperatura non valida (°C).');
    if (fuori(n.fc, 20, 260) || fuori(n.fr, 5, 120)) return setErrore('Frequenza cardiaca o respiratoria non valida.');
    if (fuori(n.spo2, 50, 100)) return setErrore('Saturazione non valida (50–100%).');
    if ((n.pas === null) !== (n.pad === null) || (n.pas !== null && n.pad !== null && n.pas <= n.pad)) {
      return setErrore('Pressione arteriosa: inserisci sistolica e diastolica (la sistolica è più alta).');
    }
    const diagnosi = f.diagnosi.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    const errati = diagnosi.filter((d) => !CODICE_ICD9.test(d));
    if (errati.length) return setErrore(`Codici ICD-9-CM non riconosciuti: ${errati.join(', ')} (es. 465.9, 382.9, V20.2).`);

    setSalvataggio(true);
    try {
      const visita = await q<Visita>(cli().from('visite').insert({
        pseudo_id: pseudo, tipo: f.tipo, motivo: f.motivo.trim(), anamnesi: f.anamnesi.trim() || null,
        esame_obiettivo: f.esame.trim() || null, diagnosi_icd9cm: diagnosi, terapia: f.terapia.trim() || null,
        temperatura_c: n.temperatura, frequenza_cardiaca: n.fc, frequenza_respiratoria: n.fr, saturazione_o2: n.spo2,
        pa_sistolica: n.pas, pa_diastolica: n.pad, indicazioni_genitori: f.indicazioni.trim() || null,
        prossimo_controllo: f.prossimo || null,
      }).select('*').single());
      let misura: Misurazione | null = null;
      if (n.peso !== null || n.altezza !== null || n.cc !== null) {
        misura = await q<Misurazione>(cli().from('misurazioni').insert({
          pseudo_id: pseudo, visita_id: visita.id, eta_giorni: etaGiorni,
          peso_kg: n.peso, altezza_cm: n.altezza, circonferenza_cranica_cm: n.cc,
        }).select('*').single());
      }
      onSalvata(visita, misura);
    } catch (err) {
      setErrore(`Salvataggio non riuscito: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSalvataggio(false);
    }
  }

  const gruppi = [...new Set(suggerimenti.map((s) => s.gruppo))];
  const campo = (k: keyof typeof f, etichetta: string, extra?: { tipo?: string; aiuto?: ReactNode; area?: boolean; largo?: boolean; richiesto?: boolean }) => (
    <label className={`text-sm ${extra?.largo ? 'md:col-span-2' : ''}`}>
      <span className="block text-slate-500">{etichetta}</span>
      {extra?.area
        ? <textarea rows={3} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={stileInput} />
        : <input type={extra?.tipo ?? 'text'} inputMode={extra?.tipo ? undefined : 'decimal'} required={extra?.richiesto}
                 value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={stileInput} />}
      {extra?.aiuto && <span className="text-xs text-slate-500">{extra.aiuto}</span>}
    </label>
  );
  const percentile = (x: ReturnType<typeof misuraLive>) => x && (
    <span className={x.anomalo ? 'text-amber-700' : ''}>
      Percentile OMS: {fmtPercentile(x.p)}{x.anomalo && ' · valore molto lontano dalle curve: verifica l\'inserimento'}
    </span>
  );

  return (
    <div className="space-y-5">
      {allergieGravi.length > 0 && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Attenzione, allergie gravi registrate: {allergieGravi.map((a) => `${contesto.dati?.allergeni.find((x) => x.codice === a.allergene)?.nome ?? a.allergene}${a.dettaglio ? ` (${a.dettaglio})` : ''}`).join(', ')}.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg bg-slate-50 p-3 text-sm">
          <h3 className="mb-1 font-semibold text-slate-900">Ultima visita</h3>
          {!ultima ? <Vuoto testo="Nessuna visita precedente." /> : (
            <div className="space-y-0.5">
              <p className="font-medium text-slate-900">{fmtData(ultima.data)} · {ETICHETTA_TIPO_VISITA[ultima.tipo] ?? ultima.tipo} · {ultima.motivo}</p>
              <Riga t="Anamnesi" v={ultima.anamnesi} />
              <Riga t="Parametri" v={parametriVitali(ultima)} />
              <Riga t="Esame obiettivo" v={ultima.esame_obiettivo} />
              <Riga t="Diagnosi (ICD-9-CM)" v={ultima.diagnosi_icd9cm.join(', ')} />
              <Riga t="Terapia" v={ultima.terapia} />
              <Riga t="Indicazioni ai genitori" v={ultima.indicazioni_genitori} />
              <Riga t="Controllo previsto" v={ultima.prossimo_controllo && fmtGiornoIso(ultima.prossimo_controllo)} />
            </div>
          )}
          <h3 className="mb-1 mt-3 font-semibold text-slate-900">Ultime misure</h3>
          {!ultimaMisura ? <p className="text-slate-600">Nessuna misura registrata.</p> : (
            <p className="text-slate-700">
              A {etaDaGiorni(ultimaMisura.eta_giorni)} (circa {etaDaGiorni(Math.max(0, etaGiorni - ultimaMisura.eta_giorni))} fa):{' '}
              {[ultimaMisura.peso_kg !== null && `peso ${ultimaMisura.peso_kg} kg (${fmtPercentile(percentileMisura('peso', paziente.sesso, ultimaMisura.eta_giorni, ultimaMisura.peso_kg))})`,
                ultimaMisura.altezza_cm !== null && `altezza ${ultimaMisura.altezza_cm} cm (${fmtPercentile(percentileMisura('altezza', paziente.sesso, ultimaMisura.eta_giorni, ultimaMisura.altezza_cm))})`,
                ultimaMisura.circonferenza_cranica_cm !== null && `CC ${ultimaMisura.circonferenza_cranica_cm} cm`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 text-sm">
          <h3 className="mb-1 font-semibold text-slate-900">Da proporre a breve ai genitori</h3>
          {contesto.errore ? <Errore messaggio={contesto.errore} /> : !contesto.dati ? <p className="text-slate-500">Calcolo…</p> :
            suggerimenti.length === 0 ? <p className="text-slate-600">Nulla in scadenza nei prossimi {ORIZZONTE} giorni.</p> : (
            <div className="space-y-2">
              {gruppi.map((g) => (
                <div key={g}>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{g}</p>
                  <ul className="space-y-1">
                    {suggerimenti.filter((s) => s.gruppo === g).map((s) => (
                      <li key={s.id} className="flex items-start gap-2">
                        {s.perGenitori && (
                          <input type="checkbox" className="mt-1" aria-label="Aggiungi alle indicazioni" checked={scelti.has(s.id)}
                                 onChange={(e) => { const n = new Set(scelti); if (e.target.checked) n.add(s.id); else n.delete(s.id); setScelti(n); }} />
                        )}
                        <span className="flex-1 text-slate-700">{s.testo}</span>
                        <Badge tono={s.tono}>{g === 'Vaccinazioni' ? 'vaccino' : g === 'Bilanci di salute' ? 'bilancio' : 'promemoria'}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <Bottone onClick={aggiungiIndicazioni} disabled={scelti.size === 0}>Aggiungi i selezionati alle indicazioni</Bottone>
              <p className="text-xs text-slate-500">Calcolato da calendario vaccinale, screening, bilanci e patologie registrate: promemoria, non indicazioni cliniche automatiche.</p>
            </div>
          )}
        </section>
      </div>

      <form onSubmit={(e) => void salva(e)} className="space-y-4">
        {errore && <Errore messaggio={errore} />}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="block text-slate-500">Tipo di visita</span>
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoVisita })} className={stileInput}>
              {(Object.keys(ETICHETTA_TIPO_VISITA) as TipoVisita[]).map((t) => <option key={t} value={t}>{ETICHETTA_TIPO_VISITA[t]}</option>)}
            </select>
          </label>
          {campo('motivo', 'Motivo della visita', { tipo: 'text', richiesto: true })}
          {campo('anamnesi', 'Anamnesi recente', { area: true, largo: true })}
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Misure di oggi · età {etaDaGiorni(etaGiorni)}</legend>
          <div className="grid gap-3 md:grid-cols-4">
            {campo('peso', 'Peso (kg)', { aiuto: percentile(live.peso) })}
            {campo('altezza', etaGiorni < 731 ? 'Lunghezza, sdraiato (cm)' : 'Altezza, in piedi (cm)', { aiuto: percentile(live.altezza) })}
            {campo('cc', 'Circonferenza cranica (cm)', { aiuto: percentile(live.cc) ?? (etaGiorni > 1826 ? 'Riferimenti OMS fino a 5 anni' : undefined) })}
            <div className="text-sm"><span className="block text-slate-500">BMI</span><span className="block py-1.5 tabular-nums">{bmi ?? '—'}</span></div>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Parametri vitali (se rilevati)</legend>
          <div className="grid gap-3 md:grid-cols-6">
            {campo('temperatura', 'Temperatura °C')}
            {campo('fc', 'FC (battiti/min)')}
            {campo('fr', 'FR (atti/min)')}
            {campo('spo2', 'SpO₂ %')}
            {campo('pas', 'PA sistolica')}
            {campo('pad', 'PA diastolica')}
          </div>
        </fieldset>

        <div className="grid gap-3 md:grid-cols-2">
          {campo('esame', 'Esame obiettivo', { area: true, largo: true })}
          {campo('diagnosi', 'Diagnosi, codici ICD-9-CM', { tipo: 'text', aiuto: 'Separati da virgola, es. 465.9, 382.9 (lasciare vuoto se non pertinente)' })}
          {campo('prossimo', 'Prossimo controllo', { tipo: 'date' })}
          {campo('terapia', 'Terapia', { area: true, largo: true })}
          {campo('indicazioni', 'Indicazioni per i genitori (compaiono nel referto)', { area: true, largo: true })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Bottone type="submit" variante="primario" disabled={salvataggio}>{salvataggio ? 'Salvataggio…' : 'Salva la visita'}</Bottone>
          <Bottone onClick={onChiudi}>Annulla</Bottone>
          {f.prossimo && <a href={link('agenda')} className="self-center text-sm text-teal-700 underline">Dopo il salvataggio fissa il controllo in agenda</a>}
        </div>
      </form>
    </div>
  );
}
