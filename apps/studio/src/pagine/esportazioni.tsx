import {
  etaDaGiorni,
  etaInGiorni,
  fmtPercentile,
  percentileMisura,
  type Allergene,
  type AllergiaPaziente,
  type Appuntamento,
  type Consenso,
  type ControlloCatalogo,
  type ControlloEseguito,
  type Misurazione,
  type Paziente,
  type Prescrizione,
  type Patologia,
  type PatologiaPaziente,
  type Pediatra,
  type Studio,
  type TestAllergologico,
  type Visita,
} from '@pls/shared';
import { CATEGORIE, FONTI_ALLERGIE, GRAVITA, STATI } from '../componenti/Allergie';
import GraficoCrescita from '../componenti/GraficoCrescita';
import { STATI_PATOLOGIA } from '../componenti/PatologieBambino';
import { AVVERTENZA } from '../componenti/SchedaPatologia';
import { REGOLE_RICETTA } from '../componenti/Prescrizioni';
import { parametriVitali } from '../componenti/VisitaOdierna';
import { FONTE_CALENDARIO, type RigaLibretto } from '../componenti/LibrettoVaccinale';
import { DocumentoStampa, TabellaStampa, type DatiBambino } from '../componenti/Stampa';
import {
  ETICHETTA_FINALITA,
  ETICHETTA_RELAZIONE,
  ETICHETTA_TIPO,
  ETICHETTA_TIPO_VISITA,
  PRIORITA,
  STATO_APPUNTAMENTO,
  STATO_CONSENSO,
  fmtData,
  fmtDataOra,
  fmtGiornoIso,
  oggiIso,
} from '../lib/formato';

/** Intestazione comune a tutti i documenti del bambino. */
export interface BaseDocumento {
  studio: Studio | null;
  medico: Pediatra | null;
  bambino: DatiBambino;
}

const Nota = ({ children }: { children: string }) => <p className="mt-2 text-[8.5pt] text-gray-700">{children}</p>;

export function docAnagrafica(
  base: BaseDocumento,
  genitori: { nome: string; cognome: string; tipo: keyof typeof ETICHETTA_RELAZIONE; email: string; telefono: string | null; responsabilita: boolean; id: string }[],
  consensi: Map<string, Consenso>,
  appuntamenti: Appuntamento[],
) {
  const finalita = Object.keys(ETICHETTA_FINALITA) as (keyof typeof ETICHETTA_FINALITA)[];
  return (
    <DocumentoStampa titolo="Scheda anagrafica e consensi" {...base}>
      <h2 className="mb-1 font-bold">Genitori e tutori</h2>
      <TabellaStampa
        intestazioni={['Nome', 'Relazione', 'Email', 'Telefono', 'Responsabilità genitoriale']}
        righe={genitori.map((g) => [`${g.nome} ${g.cognome}`, ETICHETTA_RELAZIONE[g.tipo], g.email, g.telefono, g.responsabilita ? 'Sì' : 'No'])}
      />
      <h2 className="mb-1 font-bold">Consensi</h2>
      <TabellaStampa
        intestazioni={['Genitore', ...finalita.map((f) => ETICHETTA_FINALITA[f])]}
        righe={genitori.map((g) => [
          `${g.nome} ${g.cognome}`,
          ...finalita.map((f) => {
            const c = consensi.get(`${g.id}|${f}`);
            return c ? `${STATO_CONSENSO[c.stato].testo} (${fmtData(c.registrato_il)})` : '—';
          }),
        ])}
      />
      <h2 className="mb-1 font-bold">Appuntamenti</h2>
      <TabellaStampa
        intestazioni={['Data e ora', 'Tipo', 'Stato']}
        righe={appuntamenti.map((a) => [fmtDataOra(a.inizio), ETICHETTA_TIPO[a.tipo], STATO_APPUNTAMENTO[a.stato].testo])}
      />
    </DocumentoStampa>
  );
}

export function docVaccini(base: BaseDocumento, righe: RigaLibretto[]) {
  return (
    <DocumentoStampa titolo="Libretto vaccinale" {...base}>
      <TabellaStampa
        intestazioni={['Vaccino', 'Dose', 'Età prevista', 'Data', 'Lotto', 'Stato']}
        righe={righe.map((r) => [
          `${r.dose.vaccino}${r.dose.obbligatoria ? ' (obbligatoria)' : ''}`,
          r.dose.dose,
          r.dose.quando,
          r.eseguita ? fmtGiornoIso(r.eseguita.data) : null,
          r.eseguita?.lotto ?? null,
          r.stato.testo,
        ])}
      />
      <Nota>{FONTE_CALENDARIO}</Nota>
    </DocumentoStampa>
  );
}

export function docCrescita(base: BaseDocumento, paziente: Paziente, misure: Misurazione[]) {
  const etaOggi = etaInGiorni(paziente.data_nascita, oggiIso());
  const ordinate = [...misure].sort((a, b) => a.eta_giorni - b.eta_giorni);
  return (
    <DocumentoStampa titolo="Curve di crescita" {...base}>
      <div style={{ breakInside: 'avoid' }}>
        <GraficoCrescita sesso={paziente.sesso} etaOggiGiorni={etaOggi} misure={misure} nome={paziente.nome} indicatoreFisso="peso" />
      </div>
      <div style={{ breakInside: 'avoid' }} className="mt-4">
        <GraficoCrescita sesso={paziente.sesso} etaOggiGiorni={etaOggi} misure={misure} nome={paziente.nome} indicatoreFisso="altezza" />
      </div>
      {etaOggi <= 72 * 30.4375 && (
        <div style={{ breakInside: 'avoid' }} className="mt-4">
          <GraficoCrescita sesso={paziente.sesso} etaOggiGiorni={etaOggi} misure={misure} nome={paziente.nome} indicatoreFisso="circonferenza_cranica" />
        </div>
      )}
      <h2 className="mb-1 mt-4 font-bold">Misurazioni</h2>
      <TabellaStampa
        intestazioni={['Età', 'Peso kg (percentile)', 'Altezza cm (percentile)', 'Circ. cranica cm (percentile)', 'BMI']}
        righe={ordinate.map((m) => [
          etaDaGiorni(m.eta_giorni),
          m.peso_kg !== null ? `${m.peso_kg} (${fmtPercentile(percentileMisura('peso', paziente.sesso, m.eta_giorni, m.peso_kg))})` : null,
          m.altezza_cm !== null ? `${m.altezza_cm} (${fmtPercentile(percentileMisura('altezza', paziente.sesso, m.eta_giorni, m.altezza_cm))})` : null,
          m.circonferenza_cranica_cm !== null
            ? `${m.circonferenza_cranica_cm} (${fmtPercentile(percentileMisura('circonferenza_cranica', paziente.sesso, m.eta_giorni, m.circonferenza_cranica_cm))})`
            : null,
          m.bmi,
        ])}
      />
      <Nota>Riferimenti: WHO Child Growth Standards (2006) fino a 5 anni, WHO Growth Reference 2007 oltre. Percentili informativi, non un giudizio clinico.</Nota>
    </DocumentoStampa>
  );
}

const ESITI: Record<ControlloEseguito['esito'], string> = {
  nella_norma: 'Nella norma',
  da_approfondire: 'Da approfondire',
  inviato_specialista: 'Inviato allo specialista',
  non_eseguibile: 'Non eseguibile',
};

const piuGiorni = (iso: string, n: number) => {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, g! + n)).toISOString().slice(0, 10);
};

export function docScreening(base: BaseDocumento, catalogo: ControlloCatalogo[], esiti: ControlloEseguito[], dataNascita: string) {
  const oggi = oggiIso();
  return (
    <DocumentoStampa titolo="Screening e controlli" {...base}>
      <TabellaStampa
        intestazioni={['Controllo', 'Finestra raccomandata', 'Data', 'Esito', 'Note']}
        righe={catalogo.map((c) => {
          const e = esiti.find((x) => x.codice_controllo === c.codice);
          const dal = piuGiorni(dataNascita, c.finestra_da_giorni);
          const al = piuGiorni(dataNascita, c.finestra_a_giorni);
          const esito = e ? ESITI[e.esito] : oggi < dal ? 'Futuro' : oggi <= al ? 'Da eseguire' : 'Non registrato';
          return [c.nome, `${fmtGiornoIso(dal)} – ${fmtGiornoIso(al)}`, e ? fmtGiornoIso(e.data) : null, esito, e?.note ?? null];
        })}
      />
      <h2 className="mb-1 font-bold">Fonti</h2>
      <ul className="list-disc pl-5 text-[8.5pt]">
        {[...new Map(catalogo.map((c) => [c.fonte_url, c.fonte])).entries()].map(([url, fonte]) => (
          <li key={url}>{fonte} — {url}</li>
        ))}
      </ul>
    </DocumentoStampa>
  );
}

export function docAllergie(base: BaseDocumento, allergie: AllergiaPaziente[], allergeni: Allergene[], test: TestAllergologico[]) {
  const nome = (c: string) => allergeni.find((a) => a.codice === c);
  const nomeTest = (c: string) => test.find((t) => t.codice === c)?.nome ?? c;
  return (
    <DocumentoStampa titolo="Allergie" {...base}>
      {allergie.length === 0 ? <p>Nessuna allergia registrata.</p> : (
        <TabellaStampa
          intestazioni={['Allergene', 'Categoria', 'Reazione', 'Gravità', 'Stato', 'Test eseguiti', 'Dal']}
          righe={allergie.map((a) => [
            `${nome(a.allergene)?.nome ?? a.allergene}${a.dettaglio ? ` — ${a.dettaglio}` : ''}`,
            nome(a.allergene) ? CATEGORIE[nome(a.allergene)!.categoria] : null,
            a.reazione,
            GRAVITA[a.gravita].testo,
            STATI[a.stato],
            a.test.map(nomeTest).join(', ') || null,
            a.data_diagnosi ? fmtGiornoIso(a.data_diagnosi) : null,
          ])}
        />
      )}
      <Nota>{FONTI_ALLERGIE}</Nota>
    </DocumentoStampa>
  );
}

export function docVisite(base: BaseDocumento, visite: Visita[]) {
  return (
    <DocumentoStampa titolo="Diario delle visite" {...base}>
      {visite.map((v) => (
        <div key={v.id} className="mb-3 border-b border-gray-400 pb-2" style={{ breakInside: 'avoid' }}>
          <p className="font-bold">{fmtDataOra(v.data)} — {v.motivo}</p>
          {v.esame_obiettivo && <p>Esame obiettivo: {v.esame_obiettivo}</p>}
          {v.diagnosi_icd9cm.length > 0 && <p>Diagnosi (ICD-9-CM): {v.diagnosi_icd9cm.join(', ')}</p>}
          {v.terapia && <p>Terapia: {v.terapia}</p>}
        </div>
      ))}
      {visite.length === 0 && <p>Nessuna visita registrata.</p>}
    </DocumentoStampa>
  );
}

export function docPatologie(base: BaseDocumento, righe: PatologiaPaziente[], catalogo: Patologia[]) {
  const scheda = (c: string) => catalogo.find((p) => p.codice === c);
  return (
    <DocumentoStampa titolo="Patologie ed esenzioni" {...base}>
      {righe.length === 0 ? <p>Nessuna patologia registrata.</p> : (
        <TabellaStampa
          intestazioni={['Patologia', 'Tipo', 'Codice esenzione', 'Esenzione attiva', 'Stato', 'Dal', 'Centro di riferimento']}
          righe={righe.map((r) => {
            const p = scheda(r.patologia);
            return [
              `${p?.nome ?? r.patologia}${p?.orpha ? ` (ORPHA:${p.orpha})` : ''}`,
              p ? (p.tipo === 'rara' ? 'Malattia rara' : 'Patologia cronica') : null,
              p?.esenzione ?? 'Non esente',
              p?.esenzione ? (r.esenzione_attiva ? 'Sì' : 'No') : null,
              STATI_PATOLOGIA[r.stato].testo,
              r.data_diagnosi ? fmtGiornoIso(r.data_diagnosi) : null,
              r.centro_riferimento,
            ];
          })}
        />
      )}
      <Nota>{`Codici di esenzione: DPCM 12/1/2017, Allegato 7 (malattie rare) e Allegato 8 (malattie croniche). ${AVVERTENZA}`}</Nota>
    </DocumentoStampa>
  );
}

/** Referto della visita, con le indicazioni per i genitori. */
export function docVisita(base: BaseDocumento, v: Visita, m: Misurazione | null, sesso: Paziente['sesso']) {
  const perc = (ind: 'peso' | 'altezza' | 'circonferenza_cranica', x: number | null) =>
    m && x !== null ? `${x} (percentile OMS ${fmtPercentile(percentileMisura(ind, sesso, m.eta_giorni, x))})` : null;
  const righe: [string, string | null][] = [
    ['Data', fmtDataOra(v.data)],
    ['Tipo', ETICHETTA_TIPO_VISITA[v.tipo] ?? v.tipo],
    ['Motivo', v.motivo],
    ['Anamnesi', v.anamnesi],
    ['Peso (kg)', m ? perc('peso', m.peso_kg) : null],
    ['Lunghezza/altezza (cm)', m ? perc('altezza', m.altezza_cm) : null],
    ['Circonferenza cranica (cm)', m ? perc('circonferenza_cranica', m.circonferenza_cranica_cm) : null],
    ['Parametri vitali', parametriVitali(v) || null],
    ['Esame obiettivo', v.esame_obiettivo],
    ['Diagnosi (ICD-9-CM)', v.diagnosi_icd9cm.join(', ') || null],
    ['Terapia', v.terapia],
    ['Prossimo controllo', v.prossimo_controllo ? fmtGiornoIso(v.prossimo_controllo) : null],
  ];
  return (
    <DocumentoStampa titolo="Referto di visita pediatrica" {...base}>
      <table className="mb-4 w-full border-collapse text-[10pt]">
        <tbody>
          {righe.filter(([, x]) => x).map(([t, x]) => (
            <tr key={t} style={{ breakInside: 'avoid' }}>
              <th className="w-48 border border-black bg-gray-100 px-2 py-1 text-left align-top">{t}</th>
              <td className="whitespace-pre-line border border-black px-2 py-1">{x}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.indicazioni_genitori && (
        <div style={{ breakInside: 'avoid' }}>
          <h2 className="mb-1 font-bold">Indicazioni per i genitori</h2>
          <p className="whitespace-pre-line">{v.indicazioni_genitori}</p>
        </div>
      )}
    </DocumentoStampa>
  );
}

/** Promemoria di prescrizione: da ricopiare nel software di ricetta elettronica. */
export function docPrescrizione(base: BaseDocumento, p: Prescrizione) {
  return (
    <DocumentoStampa titolo="Promemoria di prescrizione" {...base}>
      <p className="mb-3 border-2 border-black p-2 text-center font-bold">
        PROMEMORIA INTERNO — NON VALIDO COME RICETTA. La prescrizione va emessa con la ricetta elettronica del Servizio sanitario.
      </p>
      <TabellaStampa
        intestazioni={['Codice regionale', 'Codice nomenclatore', 'Prestazione', 'Branca', 'Q.tà']}
        righe={p.prestazioni.map((x) => [x.codice_regionale, x.codice_nazionale, x.descrizione, x.branca, x.quantita])}
      />
      <TabellaStampa
        intestazioni={['Accesso', 'Priorità', 'Quesito diagnostico', 'Esenzione', 'Data']}
        righe={[[p.accesso === 'primo' ? 'Primo accesso' : 'Accesso successivo', p.priorita ? PRIORITA[p.priorita] : null,
                 p.quesito, p.esenzione, fmtData(p.data)]]}
      />
      {p.note && <p>Note: {p.note}</p>}
      <Nota>{REGOLE_RICETTA.join(' ')}</Nota>
    </DocumentoStampa>
  );
}
