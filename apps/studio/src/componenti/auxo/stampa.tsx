import {
  differenzaEtaOssea, etaEstesa, fmtPercentileFine, fmtSds, type AuxoPaziente, type RigaAllergo, type Sesso,
  type Studio, type TargetGenetico,
} from '@pls/shared';
import type { ReactNode } from 'react';
import { fmtDataOra, fmtGiornoIso } from '../../lib/formato';
import type { ImpostazioniReferto } from '../allergo/referto';
import { giorno } from '../allergo/Registro';
import { righeMedico, TestoReferto } from '../allergo/stampa';
import { dataDi, n, type MisuraAnalizzata } from './analisi';
import { ESAMI_AUXO, METODI_ETA_OSSEA, STIMOLI_GH, TIPI_VISITA_AUXO } from './definizioni';
import GraficoAuxologico from './GraficoAuxologico';

const Titolo = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-1 mt-4 border-b border-black pb-0.5 text-[10.5pt] font-bold uppercase tracking-wide" style={{ breakAfter: 'avoid' }}>{children}</h2>
);
const Voce = ({ titolo, testo }: { titolo: string; testo: unknown }) => (testo ? <p className="mb-1"><b>{titolo}:</b> {String(testo)}</p> : null);

export interface DatiRefertoAuxo {
  misure: MisuraAnalizzata[];
  puberta: RigaAllergo[];
  etaOssea: RigaAllergo[];
  esami: RigaAllergo[];
  testGh: RigaAllergo[];
  target: TargetGenetico | null;
}

function testoPuberta(r: RigaAllergo, sesso: Sesso): string {
  const parti = sesso === 'F'
    ? [r.tanner_b != null && `B${r.tanner_b}`, r.tanner_ph != null && `PH${r.tanner_ph}`, r.menarca === true ? `menarca${r.data_menarca ? ` il ${giorno(r.data_menarca)}` : ''}` : r.menarca === false ? 'menarca non ancora avvenuto' : null]
    : [r.tanner_g != null && `G${r.tanner_g}`, r.tanner_ph != null && `PH${r.tanner_ph}`,
       (r.testicolo_dx_ml != null || r.testicolo_sx_ml != null) && `testicoli ${r.testicolo_dx_ml ?? '—'}/${r.testicolo_sx_ml ?? '—'} ml (dx/sx)`];
  return parti.filter(Boolean).join(', ');
}

/**
 * Referto della visita auxologica. Tutti i valori calcolati (DS, percentili, velocità,
 * classificazione del peso) usano i dati FINO alla data della visita, con la curva indicata.
 * Nessuna diagnosi automatica: conclusioni e diagnosi sono quelle scritte dal medico.
 */
export function RefertoAuxologico({ impostazioni, studio, paziente, codiceFiscale, visita, anamnesi, prima, dati, conGrafico }: {
  impostazioni: ImpostazioniReferto | null; studio: Studio | null; paziente: AuxoPaziente; codiceFiscale: string | null;
  visita: RigaAllergo; anamnesi: Record<string, unknown>; prima: RigaAllergo | null; dati: DatiRefertoAuxo; conGrafico: boolean;
}) {
  const giornoV = new Date(String(visita.data)).toLocaleDateString('sv-SE');
  const fino = <T extends RigaAllergo>(r: T[]) => r.filter((x) => dataDi(x) <= giornoV);
  const misure = dati.misure.filter((m) => m.data <= giornoV);
  const delGiorno = misure.find((m) => m.riga.visita_id === visita.id) ?? misure.find((m) => m.data === giornoV) ?? null;
  const pubertaGiorno = fino(dati.puberta).find((x) => x.visita_id === visita.id) ?? fino(dati.puberta).find((x) => dataDi(x) === giornoV) ?? null;
  const etaOssea = fino(dati.etaOssea);
  const ultimaEo = etaOssea[0] ?? null;
  const esami = fino(dati.esami).filter((x) => dataDi(x) >= giornoDa(giornoV, -180));
  const testGh = fino(dati.testGh);
  const controllo = visita.tipo !== 'prima_visita' && prima && prima.id !== visita.id;
  const medico = righeMedico(impostazioni);
  const chiusura = (impostazioni?.chiusura ?? '').replace(/\{\{email\}\}/g, impostazioni?.email_contatti ?? '___')
    .replace(/\{\{firma\}\}/g, impostazioni?.firma || 'del medico');
  const diagnosi = String(visita.diagnosi_testo ?? '').split('\n').map((d) => d.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
  const ora = new Date(String(visita.data)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const cella = 'border border-black px-2 py-0.5 align-top';
  const testa = `${cella} w-32 bg-gray-100 text-left font-semibold`;
  const tc = 'whitespace-nowrap border border-black px-1.5 py-0.5 text-right tabular-nums';
  const ds = (z: number | null | undefined) => fmtSds(z).replace(' DS', '');
  const th = 'border border-black bg-gray-100 px-1.5 py-0.5 text-left font-semibold';
  const t = dati.target;
  const padre = anamnesi.altezza_padre_cm as number | null | undefined;
  const madre = anamnesi.altezza_madre_cm as number | null | undefined;
  const curve = [...new Set(misure.slice(0, 8).flatMap((m) => [m.sdsAltezza?.curva, m.sdsPeso?.curva, m.sdsBmi?.curva]).filter(Boolean))].join(' e ');

  return (
    <article className="text-[10.5pt] leading-snug text-black">
      <header className="flex items-start justify-between gap-6 border-b-[3px] border-double border-black pb-2">
        <div>
          <p className="text-[14pt] font-bold">{impostazioni?.intestazione ?? 'Ambulatorio di Auxologia ed Endocrinologia pediatrica'}</p>
          {impostazioni?.sottotitolo && <p>{impostazioni.sottotitolo}</p>}
          {studio?.nome && <p>{studio.nome}</p>}
          <p className="text-[9pt]">{[studio?.indirizzo, impostazioni?.telefono && `Tel. ${impostazioni.telefono}`, impostazioni?.email_contatti].filter(Boolean).join(' · ')}</p>
        </div>
        {medico.length > 0 && <div className="text-right text-[9.5pt]">{medico.map((r, i) => <p key={r} className={i === 0 ? 'font-semibold' : ''}>{r}</p>)}</div>}
      </header>

      <div className="mb-2 mt-3 flex items-end justify-between">
        <h1 className="text-[13pt] font-bold uppercase tracking-wide">Referto di visita auxologica</h1>
        <p className="text-right">{[impostazioni?.luogo, giorno(visita.data)].filter(Boolean).join(', ')} · ore {ora}</p>
      </div>

      <table className="mb-2 w-full border-collapse text-[10pt]">
        <tbody>
          <tr><th className={testa}>Paziente</th><td className={`${cella} font-semibold`}>{paziente.cognome} {paziente.nome}</td>
            <th className={testa}>Tipo di visita</th><td className={cella}>{TIPI_VISITA_AUXO[String(visita.tipo)] ?? 'Visita'}</td></tr>
          <tr><th className={testa}>{paziente.sesso === 'F' ? 'Nata' : 'Nato'}</th>
            <td className={cella}>{paziente.luogo_nascita ? `a ${paziente.luogo_nascita} ` : ''}il {fmtGiornoIso(paziente.data_nascita)} ({etaEstesa(paziente.data_nascita, giornoV)}{delGiorno ? `; età decimale ${n(delGiorno.anni, 2)}` : ''})</td>
            <th className={testa}>Codice fiscale</th><td className={`${cella} font-mono`}>{codiceFiscale ?? '—'}</td></tr>
          <tr><th className={testa}>Residenza</th><td className={cella}>{paziente.residenza ?? '—'}</td>
            <th className={testa}>Pediatra curante</th><td className={cella}>{paziente.pediatra_curante ?? '—'}</td></tr>
        </tbody>
      </table>
      {visita.motivo ? <p><b>Motivo della visita:</b> {String(visita.motivo)}</p> : null}

      <Titolo>Anamnesi</Titolo>
      <p className="mb-1">
        <b>Genitori:</b> padre {padre ? `${n(Number(padre))} cm` : 'n.d.'}, madre {madre ? `${n(Number(madre))} cm` : 'n.d.'}
        {(padre || madre) && anamnesi.altezze_genitori_misurate != null ? ` (${anamnesi.altezze_genitori_misurate ? 'misurate' : 'riferite'})` : ''}
        {t ? `; target genetico ${n(t.cm)} cm (intervallo ${n(t.min)}–${n(t.max)} cm; ${fmtSds(t.sds)})` : ''}.
        {anamnesi.eta_menarca_madre ? ` Menarca materno a ${n(Number(anamnesi.eta_menarca_madre))} anni.` : ''}
      </p>
      {(anamnesi.eta_gestazionale_sett || anamnesi.peso_nascita_g || anamnesi.lunghezza_nascita_cm) ? (
        <p className="mb-1"><b>Nascita:</b> {[
          anamnesi.eta_gestazionale_sett && `${anamnesi.eta_gestazionale_sett} settimane`,
          anamnesi.peso_nascita_g && `peso ${anamnesi.peso_nascita_g} g${anamnesi.sds_peso_nascita != null ? ` (${fmtSds(Number(anamnesi.sds_peso_nascita))})` : ''}`,
          anamnesi.lunghezza_nascita_cm && `lunghezza ${n(Number(anamnesi.lunghezza_nascita_cm))} cm${anamnesi.sds_lunghezza_nascita != null ? ` (${fmtSds(Number(anamnesi.sds_lunghezza_nascita))})` : ''}`,
          anamnesi.cc_nascita_cm && `circonferenza cranica ${n(Number(anamnesi.cc_nascita_cm))} cm`,
        ].filter(Boolean).join(', ')}{anamnesi.carte_neonatali ? ` (carte ${String(anamnesi.carte_neonatali)})` : ''}.</p>
      ) : null}
      <Voce titolo="Familiare" testo={anamnesi.anamnesi_familiare} />
      <Voce titolo="Fisiologica" testo={anamnesi.anamnesi_fisiologica} />
      <Voce titolo="Patologica remota" testo={anamnesi.anamnesi_remota} />
      <Voce titolo="Altre notizie" testo={anamnesi.anamnesi_personale} />
      <Voce titolo="Farmaci" testo={anamnesi.farmaci} />

      {controllo ? (
        <>
          <Titolo>Prima osservazione ({giorno(prima!.data)})</Titolo>
          <TestoReferto testo={String(prima!.anamnesi ?? '')} />
          {visita.anamnesi ? <><Titolo>Anamnesi intercorrente</Titolo><TestoReferto testo={String(visita.anamnesi)} /></> : null}
          {visita.decorso ? <><Titolo>Decorso dall'ultimo controllo</Titolo><TestoReferto testo={String(visita.decorso)} /></> : null}
        </>
      ) : visita.anamnesi ? (
        <><Titolo>Anamnesi patologica prossima</Titolo><TestoReferto testo={String(visita.anamnesi)} /></>
      ) : null}

      <Titolo>Esame obiettivo e parametri auxologici</Titolo>
      {delGiorno ? (
        <table className="mb-2 w-full border-collapse text-[9.5pt]">
          <thead><tr><th className={th}>Parametro</th><th className={th}>Valore</th><th className={th}>DS</th><th className={th}>Percentile</th><th className={th}>Note</th></tr></thead>
          <tbody>
            {delGiorno.altezza != null && <tr><td className={cella}>Statura{delGiorno.riga.posizione === 'sdraiato' ? ' (da sdraiato)' : ''}</td><td className={tc}>{n(delGiorno.altezza)} cm</td>
              <td className={tc}>{ds(delGiorno.sdsAltezza?.z)}</td><td className={tc}>{fmtPercentileFine(delGiorno.sdsAltezza?.percentile)}</td>
              <td className={cella}>{t?.sds != null && delGiorno.sdsAltezza?.riferimento === 'cacciari' ? `Statura − target: ${fmtSds(delGiorno.sdsAltezza.z - t.sds)}` : ''}</td></tr>}
            {delGiorno.peso != null && <tr><td className={cella}>Peso</td><td className={tc}>{n(delGiorno.peso, 2)} kg</td>
              <td className={tc}>{ds(delGiorno.sdsPeso?.z)}</td><td className={tc}>{fmtPercentileFine(delGiorno.sdsPeso?.percentile)}</td><td className={cella} /></tr>}
            {delGiorno.bmi != null && <tr><td className={cella}>BMI</td><td className={tc}>{n(delGiorno.bmi, 1)} kg/m²</td>
              <td className={tc}>{ds(delGiorno.sdsBmi?.z)}</td><td className={tc}>{fmtPercentileFine(delGiorno.sdsBmi?.percentile)}</td>
              <td className={cella}>{delGiorno.classePeso ? `${delGiorno.classePeso.etichetta} (${delGiorno.classePeso.fonte}: ${fmtPercentileFine(delGiorno.classePeso.percentile)} pc)` : ''}</td></tr>}
            {delGiorno.cc != null && <tr><td className={cella}>Circonferenza cranica</td><td className={tc}>{n(delGiorno.cc)} cm</td>
              <td className={tc}>{ds(delGiorno.sdsCc?.z)}</td><td className={tc}>{fmtPercentileFine(delGiorno.sdsCc?.percentile)}</td><td className={cella} /></tr>}
            {delGiorno.velocita && <tr><td className={cella}>Velocità di crescita</td><td className={tc}>{n(delGiorno.velocita.cmAnno)} cm/anno</td>
              <td className={tc}>{delGiorno.velocita.affidabile && delGiorno.velocitaSds != null ? ds(delGiorno.velocitaSds) : '—'}</td><td className={tc}>—</td>
              <td className={cella}>dal {giorno(delGiorno.velocita.da)} ({n(delGiorno.velocita.anni * 12, 0)} mesi){delGiorno.velocita.affidabile && delGiorno.velocitaSds != null ? `; DS dalle tabelle${delGiorno.riga.velocita_riferimento ? ` di ${String(delGiorno.riga.velocita_riferimento)}` : ''}` : ''}{delGiorno.velocita.avviso ? `; ${delGiorno.velocita.avviso}` : ''}</td></tr>}
            {delGiorno.riga.vita_cm != null && <tr><td className={cella}>Circonferenza vita</td><td className={tc}>{n(Number(delGiorno.riga.vita_cm))} cm</td><td className={tc}>—</td><td className={tc}>—</td>
              <td className={cella}>{delGiorno.vitaAltezza != null ? `vita/statura ${n(delGiorno.vitaAltezza, 2)}` : ''}</td></tr>}
            {delGiorno.riga.altezza_seduto_cm != null && <tr><td className={cella}>Altezza da seduto</td><td className={tc}>{n(Number(delGiorno.riga.altezza_seduto_cm))} cm</td><td className={tc}>—</td><td className={tc}>—</td>
              <td className={cella}>{delGiorno.sedutoAltezza != null ? `seduto/statura ${n(delGiorno.sedutoAltezza, 3)}` : ''}</td></tr>}
            {delGiorno.riga.apertura_braccia_cm != null && <tr><td className={cella}>Apertura delle braccia</td><td className={tc}>{n(Number(delGiorno.riga.apertura_braccia_cm))} cm</td><td className={tc}>—</td><td className={tc}>—</td>
              <td className={cella}>{delGiorno.bracciaMenoStatura != null ? `apertura − statura ${delGiorno.bracciaMenoStatura >= 0 ? '+' : '−'}${n(Math.abs(delGiorno.bracciaMenoStatura))} cm` : ''}</td></tr>}
            {delGiorno.riga.pas_mmhg != null && <tr><td className={cella}>Pressione arteriosa</td><td className={tc}>{String(delGiorno.riga.pas_mmhg)}/{String(delGiorno.riga.pad_mmhg)} mmHg</td><td className={tc}>—</td><td className={tc}>—</td><td className={cella} /></tr>}
          </tbody>
        </table>
      ) : <p className="mb-1 italic">Nessuna misura registrata in questa visita.</p>}
      {pubertaGiorno && <p className="mb-1"><b>Stadio puberale (Tanner):</b> {testoPuberta(pubertaGiorno, paziente.sesso)}.</p>}
      <TestoReferto testo={String(visita.esame_obiettivo ?? '')} />

      {misure.filter((m) => m.altezza != null || m.peso != null).length > 1 && (
        <>
          <Titolo>Andamento auxologico</Titolo>
          <table className="mb-2 w-full border-collapse text-[9pt]">
            <thead><tr><th className={th}>Data</th><th className={th}>Età</th><th className={th}>Statura (cm)</th><th className={th}>DS</th>
              <th className={th}>Peso (kg)</th><th className={th}>BMI</th><th className={th}>Velocità (cm/anno)</th></tr></thead>
            <tbody>
              {misure.filter((m) => m.altezza != null || m.peso != null).slice(0, 8).map((m) => (
                <tr key={m.riga.id}>
                  <td className={cella}>{giorno(m.data)}</td><td className={tc}>{n(m.anni, 2)}</td><td className={tc}>{n(m.altezza)}</td>
                  <td className={tc}>{ds(m.sdsAltezza?.z)}</td><td className={tc}>{n(m.peso, 2)}</td><td className={tc}>{n(m.bmi, 1)}</td>
                  <td className={tc}>{m.velocita ? n(m.velocita.cmAnno) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {ultimaEo && (
        <p className="mb-1"><b>Età ossea</b> ({giorno(ultimaEo.data)}, {METODI_ETA_OSSEA[String(ultimaEo.metodo)] ?? String(ultimaEo.metodo)}):
          {' '}{n(Number(ultimaEo.eta_ossea_anni), 1)} anni a un'età cronologica di {n(Number(ultimaEo.eta_anni), 1)} anni
          ({(() => { const d = differenzaEtaOssea(Number(ultimaEo.eta_ossea_anni), Number(ultimaEo.eta_anni)); return `${d >= 0 ? '+' : '−'}${n(Math.abs(d), 1)} anni`; })()})
          {ultimaEo.previsione_statura_cm != null ? `; statura adulta prevista ${n(Number(ultimaEo.previsione_statura_cm))} cm` : ''}.</p>
      )}
      {(esami.length > 0 || testGh.length > 0 || visita.esami_eseguiti) && (
        <>
          <Titolo>Accertamenti</Titolo>
          {esami.length > 0 && (
            <ul className="ml-5 list-disc">
              {esami.map((x) => (
                <li key={x.id}>{giorno(x.data)} · {x.esame === 'altro' ? String(x.descrizione ?? 'Esame') : ESAMI_AUXO[String(x.esame)]}: {x.valore != null ? `${n(Number(x.valore), Number(x.valore) % 1 === 0 ? 0 : 2)} ${String(x.unita ?? '')}`.trim() : ''}{x.valore_testo ? String(x.valore_testo) : ''}
                  {x.rif_min != null || x.rif_max != null ? ` (rif. ${x.rif_min ?? '—'}–${x.rif_max ?? '—'})` : ''}{x.sds != null ? ` · ${fmtSds(Number(x.sds))}` : ''}</li>
              ))}
            </ul>
          )}
          {testGh.length > 0 && (
            <ul className="ml-5 list-disc">
              {testGh.map((x) => <li key={x.id}>{giorno(x.data)} · test con {STIMOLI_GH[String(x.stimolo)]}{x.priming ? ' (con priming)' : ''}: picco di GH {n(Number(x.picco_ug_l), 1)} µg/L (soglia Nota AIFA 39: {n(Number(x.soglia_ug_l), 0)} µg/L)</li>)}
            </ul>
          )}
          <TestoReferto testo={String(visita.esami_eseguiti ?? '')} />
        </>
      )}

      {conGrafico && misure.some((m) => m.altezza != null) && (
        <div style={{ breakInside: 'avoid' }}>
          <Titolo>Curva di crescita staturale</Titolo>
          <GraficoAuxologico sesso={paziente.sesso} misure={misure} target={t} fisso
            etaOssea={etaOssea.flatMap((e) => {
              const vicina = misure.filter((m) => m.altezza != null).sort((a, b) => Math.abs(Date.parse(a.data) - Date.parse(dataDi(e))) - Math.abs(Date.parse(b.data) - Date.parse(dataDi(e))))[0];
              return vicina && Math.abs(Date.parse(vicina.data) - Date.parse(dataDi(e))) <= 90 * 86_400_000
                ? [{ etaOssea: Number(e.eta_ossea_anni), etaCronologica: vicina.anni, altezza: vicina.altezza! }] : [];
            })} />
        </div>
      )}

      {visita.conclusioni ? <><Titolo>Conclusioni</Titolo><TestoReferto testo={String(visita.conclusioni)} /></> : null}
      {diagnosi.length > 0 && <><Titolo>Diagnosi</Titolo><ol className="ml-5 list-decimal">{diagnosi.map((d, i) => <li key={i}>{d}</li>)}</ol></>}
      {visita.piano ? <><Titolo>Indicazioni</Titolo><TestoReferto testo={String(visita.piano)} /></> : null}
      {visita.prossimo_controllo ? <p className="mt-2"><b>Prossimo controllo:</b> {giorno(visita.prossimo_controllo)}</p> : null}

      {chiusura.trim() && <p className="mt-4">{chiusura}</p>}
      <footer className="mt-6 flex items-end justify-between gap-6" style={{ breakInside: 'avoid' }}>
        <p className="text-[9.5pt]">{[impostazioni?.luogo, giorno(visita.data)].filter(Boolean).join(', ')}</p>
        <div className="w-72 text-center">
          <p className="text-[9pt]">Il medico</p>
          {medico.map((r, i) => <p key={r} className={i === 0 ? 'font-semibold' : 'text-[9pt]'}>{r}</p>)}
          <div className="mt-8 border-b border-black" />
          <p className="text-[8pt] text-gray-600">firma</p>
        </div>
      </footer>
      <p className="mt-5 border-t border-gray-300 pt-1 text-[7.5pt] text-gray-600">
        DS e percentili calcolati con il metodo LMS sulle curve {curve || 'di riferimento'} (Cacciari et al., J Endocrinol Invest 2006, dai 2 anni;
        OMS sotto i 2 anni e per la circonferenza cranica). Classificazione del peso: curve OMS secondo la Consensus SIEDP-SIP 2018.
        Target genetico: formula di Tanner (± 8,5 cm). Documento sanitario contenente dati relativi alla salute (Reg. UE 2016/679):
        da conservare e trasmettere con riservatezza. Generato il {fmtDataOra(new Date())}.
      </p>
    </article>
  );
}

function giornoDa(iso: string, giorni: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + giorni);
  return d.toLocaleDateString('sv-SE');
}
