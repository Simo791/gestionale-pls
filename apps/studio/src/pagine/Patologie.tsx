import type { ClaimsApp, Patologia, VoceStorico } from '@pls/shared';
import { useState } from 'react';
import ModificaPatologia, { ETICHETTE_CATALOGO } from '../componenti/ModificaPatologia';
import SchedaPatologia, { AREE, AVVERTENZA, FONTI_GENERALI } from '../componenti/SchedaPatologia';
import Storico from '../componenti/Storico';
import { DocumentoStampa, useStampa } from '../componenti/Stampa';
import { Badge, Bottone, Caricamento, Errore, Pannello, Vuoto } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { useIntestazione } from '../lib/intestazione';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

/** Toglie accenti e maiuscole per una ricerca tollerante. */
const normalizza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Catalogo di consultazione: malattie rare (All. 7 DPCM 12/1/2017) e patologie
 * croniche (All. 8) di interesse pediatrico, con codici di esenzione, ORPHAcode,
 * segni d'allarme, percorso diagnostico, follow-up e fonti.
 */
export default function Patologie({ claims, codice }: { claims: ClaimsApp; codice?: string }) {
  const [testo, setTesto] = useState('');
  const [tipo, setTipo] = useState<'tutte' | 'rara' | 'cronica'>('tutte');
  const [area, setArea] = useState('');
  const { stampa, portale } = useStampa();
  const intestazione = useIntestazione(claims.app_ruolo === 'pediatra' ? claims.sub : null);
  const [modifica, setModifica] = useState(false);
  const storico = useDati(
    async () => (codice
      ? q<(VoceStorico & { autore_nome: string | null; motivo: string | null })[]>(supabase.schema('anagrafica')
          .from('catalogo_patologie_storico').select('*').eq('codice', codice).order('avvenuto_il', { ascending: false }))
      : []),
    [codice],
  );

  const catalogo = useDati(
    () => q<Patologia[]>(supabase.schema('anagrafica').from('catalogo_patologie').select('*').order('nome')),
    [],
  );

  if (catalogo.errore) return <Errore messaggio={catalogo.errore} />;
  if (catalogo.caricamento || !catalogo.dati) return <Caricamento righe={8} />;

  const scelta = codice ? catalogo.dati.find((p) => p.codice === codice) : undefined;
  if (codice) {
    if (!scelta) return <Errore messaggio="Patologia non trovata nel catalogo." />;
    return (
      <div className="space-y-6">
        {portale}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <a href={link('patologie')} className="text-sm text-teal-700 hover:underline">‹ Catalogo patologie</a>
            <h1 className="text-2xl font-semibold text-slate-900">{scelta.nome}</h1>
          </div>
          <Bottone onClick={() => stampa(
            <DocumentoStampa titolo={`Scheda: ${scelta.nome}`} studio={intestazione.studio} medico={intestazione.medico}>
              <SchedaPatologia p={scelta} stampa />
            </DocumentoStampa>,
          )}>Esporta PDF</Bottone>
        </div>
        <Pannello titolo="Scheda della patologia"
                  azione={claims.app_admin && !modifica && <Bottone onClick={() => setModifica(true)}>Modifica scheda</Bottone>}>
          {modifica
            ? <ModificaPatologia p={scelta} onFatto={(salvata) => { setModifica(false); if (salvata) { catalogo.ricarica(); storico.ricarica(); } }} />
            : <SchedaPatologia p={scelta} />}
        </Pannello>
        <Pannello titolo="Storico modifiche" sottotitolo="Chi ha cambiato cosa, quando e perché (valori prima → dopo)">
          <Storico voci={storico.dati ?? []} etichette={ETICHETTE_CATALOGO} />
          <p className="mt-2 text-xs text-slate-500">Contenuto iniziale da fonti ufficiali (vedi Fonti). Le modifiche sono riservate all'amministratore dello studio.</p>
        </Pannello>
      </div>
    );
  }

  const cerca = normalizza(testo.trim());
  const filtrate = catalogo.dati.filter((p) =>
    (tipo === 'tutte' || p.tipo === tipo) &&
    (!area || p.area === area) &&
    (!cerca || [p.nome, ...p.sinonimi, p.esenzione ?? '', p.orpha ? `orpha ${p.orpha}` : '', ...p.icd9cm].some((x) => normalizza(x).includes(cerca))),
  );
  const areePresenti = [...new Set(catalogo.dati.map((p) => p.area))].sort((a, b) => (AREE[a] ?? a).localeCompare(AREE[b] ?? b));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Malattie rare e patologie</h1>
        <p className="text-sm text-slate-500">
          {catalogo.dati.length} schede di interesse pediatrico con codice di esenzione, ORPHAcode, segni d'allarme, diagnosi, follow-up e fonti.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cerca per nome, sinonimo, codice esenzione, ORPHA o ICD-9-CM"
               aria-label="Cerca nel catalogo" className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo"
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="tutte">Tutte</option>
          <option value="rara">Malattie rare</option>
          <option value="cronica">Patologie croniche</option>
        </select>
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area" className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="">Tutte le aree</option>
          {areePresenti.map((a) => <option key={a} value={a}>{AREE[a] ?? a}</option>)}
        </select>
      </div>

      <Pannello titolo={`${filtrate.length} risultati`}>
        {filtrate.length === 0 ? <Vuoto testo="Nessuna patologia corrisponde alla ricerca." /> : (
          <ul className="divide-y divide-slate-100">
            {filtrate.map((p) => (
              <li key={p.codice}>
                <a href={link('patologie', p.codice)} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-900">{p.nome}</span>
                    <span className="block truncate text-sm text-slate-500">{p.descrizione}</span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <Badge tono={p.tipo === 'rara' ? 'info' : 'neutro'}>{p.tipo === 'rara' ? 'Rara' : 'Cronica'}</Badge>
                    {p.esenzione ? <Badge tono="ok">{p.esenzione}</Badge> : <Badge tono="attenzione">Non esente</Badge>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Pannello>

      <Pannello titolo="Fonti e riferimenti">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {FONTI_GENERALI.map((f) => <li key={f.url}>{f.titolo} — <a className="text-teal-700 underline" href={f.url} target="_blank" rel="noreferrer">{f.url}</a></li>)}
        </ul>
        <p className="mt-3 text-xs text-slate-500">{AVVERTENZA}</p>
      </Pannello>
    </div>
  );
}
