import type { Patologia } from '@pls/shared';
import type { ReactNode } from 'react';
import { Badge } from './ui';

export const AREE: Record<string, string> = {
  genetica: 'Genetica e sindromi',
  endocrino: 'Endocrinologia',
  metabolico: 'Malattie metaboliche',
  neuro: 'Neurologia e neurosviluppo',
  neuromuscolare: 'Malattie neuromuscolari',
  ematologia: 'Ematologia',
  immunologia: 'Immunologia e autoinfiammazione',
  gastro: 'Gastroenterologia ed epatologia',
  respiratorio: 'Apparato respiratorio',
  cardio: 'Cardiologia',
  nefro: 'Nefrologia',
  reumatologia: 'Reumatologia',
  oncologia: 'Oncologia',
  scheletro: 'Scheletro',
  dermatologia: 'Dermatologia',
  oculistica: 'Oculistica',
  neonatologia: 'Neonatologia',
};

export const orphaUrl = (n: number) => `https://www.orpha.net/it/disease/detail/${n}`;

/** Fonti valide per tutto il catalogo. */
export const FONTI_GENERALI = [
  { titolo: 'DPCM 12 gennaio 2017 (nuovi LEA), Allegato 7 malattie rare e Allegato 8 malattie croniche, G.U. n. 65 del 18/3/2017', url: 'https://www.gazzettaufficiale.it/eli/id/2017/03/18/17A02015/sg' },
  { titolo: 'Elenco dei codici di esenzione per malattia rara con ORPHAcode, Rete Malattie Rare Lombardia, aggiornamento 12/11/2025', url: 'https://lucignolo-new.marionegri.it/images/Elenco_malattie/2025_11_12_elenco_mr_esenti_dpcm_12_01_2017.pdf' },
  { titolo: 'Orphanet, portale delle malattie rare', url: 'https://www.orpha.net' },
  { titolo: 'Portale nazionale malattie rare (Ministero della Salute - ISS): centri di riferimento ed esenzioni', url: 'https://www.malattierare.gov.it' },
];

export const AVVERTENZA =
  'Scheda di consultazione per il pediatra: riassume informazioni da fonti ufficiali e non sostituisce il giudizio clinico, ' +
  'né formula diagnosi. Esenzioni e centri di riferimento vanno verificati con la ASL e la rete regionale malattie rare. ' +
  'Telefono Verde Malattie Rare dell\'ISS: 800 89 69 49 (lun-ven 9-13, gratuito e anonimo).';

const Sezione = ({ titolo, children }: { titolo: string; children: ReactNode }) => (
  <section className="break-inside-avoid">
    <h3 className="mb-1 text-sm font-semibold text-slate-900">{titolo}</h3>
    {children}
  </section>
);

const Elenco = ({ voci }: { voci: string[] }) => (
  <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">{voci.map((v) => <li key={v}>{v}</li>)}</ul>
);

/** Contenuto della scheda: usato a schermo e nel PDF. */
export default function SchedaPatologia({ p, stampa = false }: { p: Patologia; stampa?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tono={p.tipo === 'rara' ? 'info' : 'neutro'}>{p.tipo === 'rara' ? 'Malattia rara' : 'Patologia cronica'}</Badge>
        <Badge>{AREE[p.area] ?? p.area}</Badge>
        {p.esenzione ? <Badge tono="ok">Esenzione {p.esenzione}</Badge> : <Badge tono="attenzione">Nessun codice di esenzione nazionale</Badge>}
        {p.orpha && <Badge>ORPHA:{p.orpha}</Badge>}
        {p.icd9cm.length > 0 && <Badge>ICD-9-CM {p.icd9cm.join(', ')}</Badge>}
      </div>
      {p.sinonimi.length > 0 && <p className="text-sm text-slate-500">Detta anche: {p.sinonimi.join(', ')}</p>}
      <p className="text-sm text-slate-800">{p.descrizione}</p>

      {p.emergenza && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">Situazioni di urgenza</p>
          <p>{p.emergenza}</p>
        </div>
      )}

      <div className={`grid gap-4 ${stampa ? '' : 'md:grid-cols-2'}`}>
        <Sezione titolo="Segni d'allarme e quando sospettarla"><Elenco voci={p.segni_allarme} /></Sezione>
        <Sezione titolo="Come si arriva alla diagnosi"><p className="text-sm text-slate-700">{p.diagnosi}</p></Sezione>
        <Sezione titolo="Follow-up e controlli"><Elenco voci={p.follow_up} /></Sezione>
        <Sezione titolo="A chi riferirsi"><p className="text-sm text-slate-700">{p.specialisti}</p></Sezione>
      </div>
      {p.note && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{p.note}</p>}

      <Sezione titolo="Fonti">
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">
          {p.orpha && <li>Orphanet, scheda ORPHA:{p.orpha} — <a className="underline" href={orphaUrl(p.orpha)} target="_blank" rel="noreferrer">{orphaUrl(p.orpha)}</a></li>}
          {p.fonti.map((f) => <li key={f.url}>{f.titolo} — <a className="underline" href={f.url} target="_blank" rel="noreferrer">{f.url}</a></li>)}
          {FONTI_GENERALI.slice(0, p.tipo === 'rara' ? 2 : 1).map((f) => (
            <li key={f.url}>{f.titolo} — <a className="underline" href={f.url} target="_blank" rel="noreferrer">{f.url}</a></li>
          ))}
        </ul>
      </Sezione>
      <p className="text-xs text-slate-500">{AVVERTENZA}</p>
    </div>
  );
}
