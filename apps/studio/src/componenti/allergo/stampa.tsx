import { AREE_ALLERGO, type AllergoPaziente, type AreaAllergo, type MembroStudio, type RigaAllergo, type Studio } from '@pls/shared';
import type { ReactNode } from 'react';
import { AVVERTENZA_DIETA, DIETE } from '../../lib/diete';
import { fmtDataOra, fmtGiornoIso, oggiIso } from '../../lib/formato';
import { TabellaStampa } from '../Stampa';
import { CLASSI_TERAPIA, ESITI_TPO, TIPI_TEST } from './definizioni';
import type { ImpostazioniReferto } from './referto';
import { giorno, s } from './Registro';

export interface Firmatario { nome: string; ruolo: string }

export const firmatarioDa = (m: MembroStudio | null | undefined): Firmatario | null =>
  m ? { nome: `${m.nome ?? ''} ${m.cognome ?? ''}`.trim() || m.email || 'Il medico', ruolo: m.ruolo === 'allergologo' ? 'Allergologo pediatra' : 'Pediatra' } : null;

/** Documento A4 dell'ambulatorio di allergologia: intestazione, paziente, contenuto, firma. */
export function DocumentoAllergo({ titolo, studio, firmatario, paziente, codiceFiscale, children }: {
  titolo: string; studio: Studio | null; firmatario: Firmatario | null; paziente: AllergoPaziente; codiceFiscale: string | null; children: ReactNode;
}) {
  const cella = 'border border-black px-2 py-1';
  return (
    <article className="text-[11pt] leading-snug text-black">
      <header className="mb-4 flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <p className="text-[15pt] font-bold">{studio?.nome ?? 'Studio'}</p>
          <p>Ambulatorio di Allergologia pediatrica</p>
          <p>{studio?.indirizzo}</p>
          <p>{[studio?.telefono && `Tel. ${studio.telefono}`, studio?.email].filter(Boolean).join(' · ')}</p>
        </div>
        {firmatario && <div className="text-right text-[10pt]"><p className="font-semibold">{firmatario.nome}</p><p>{firmatario.ruolo}</p></div>}
      </header>
      <h1 className="mb-3 text-[14pt] font-bold uppercase tracking-wide">{titolo}</h1>
      <table className="mb-4 w-full border border-black text-[10pt]">
        <tbody>
          <tr>
            <th className={`${cella} w-36 bg-gray-100 text-left`}>Paziente</th>
            <td className={`${cella} font-semibold`}>{paziente.cognome} {paziente.nome}</td>
            <th className={`${cella} w-32 bg-gray-100 text-left`}>Nato/a il</th>
            <td className={cella}>{fmtGiornoIso(paziente.data_nascita)}</td>
          </tr>
          <tr>
            <th className={`${cella} bg-gray-100 text-left`}>Codice fiscale</th>
            <td className={`${cella} font-mono`}>{codiceFiscale ?? '—'}</td>
            <th className={`${cella} bg-gray-100 text-left`}>Genitore</th>
            <td className={cella}>{[paziente.genitore_nome, paziente.genitore_telefono && `tel. ${paziente.genitore_telefono}`].filter(Boolean).join(', ') || '—'}</td>
          </tr>
        </tbody>
      </table>
      <section>{children}</section>
      <footer className="mt-10 flex items-end justify-between" style={{ breakInside: 'avoid' }}>
        <p>Data: {fmtGiornoIso(oggiIso())}</p>
        <div className="w-72 text-center">
          <div className="mb-1 h-12 border-b border-black" />
          <p className="font-semibold">{firmatario?.nome ?? 'Il medico'}</p>
          <p className="text-[9pt]">{firmatario?.ruolo}</p>
        </div>
      </footer>
      <p className="mt-6 text-[8pt] text-gray-600">
        Documento generato dal Gestionale PLS · modulo Allergologia il {fmtDataOra(new Date())}. Contiene dati sanitari: conservare e trasmettere con riservatezza.
      </p>
    </article>
  );
}

const h2 = 'mb-1 mt-4 text-[12pt] font-bold';

/** Testo libero del referto: righe «- …» come elenco puntato, rientri come sotto-voci. */
export function TestoReferto({ testo }: { testo: string | null | undefined }) {
  if (!testo?.trim()) return null;
  const blocchi: ReactNode[] = [];
  let elenco: ReactNode[] = [];
  const chiudi = () => { if (elenco.length) { blocchi.push(<ul key={`u${blocchi.length}`} className="ml-5 list-disc">{elenco}</ul>); elenco = []; } };
  testo.split('\n').forEach((riga, i) => {
    const t = riga.trimEnd();
    if (/^\s*-\s+/.test(t)) {
      const rientro = /^\s{2,}-/.test(t);
      elenco.push(<li key={i} className={rientro ? 'ml-5 list-[circle]' : ''}>{t.replace(/^\s*-\s+/, '')}</li>);
    } else if (!t.trim()) {
      chiudi();
    } else if (/^\s{2,}/.test(t) && elenco.length) {
      elenco.push(<li key={i} className="list-none">{t.trim()}</li>);
    } else {
      chiudi();
      blocchi.push(<p key={i}>{t}</p>);
    }
  });
  chiudi();
  return <div className="space-y-0.5">{blocchi}</div>;
}

const voce = (titolo: string, testo: unknown) => (testo ? <p className="mb-1"><b>{titolo}:</b> {String(testo)}</p> : null);

/** Referto della visita nel formato delle lettere dell'ambulatorio. */
export function RefertoVisita({ impostazioni, studio, paziente, codiceFiscale, visita, anamnesi, prima }: {
  impostazioni: ImpostazioniReferto | null; studio: Studio | null; paziente: AllergoPaziente; codiceFiscale: string | null;
  visita: RigaAllergo; anamnesi: Record<string, unknown>; prima: RigaAllergo | null;
}) {
  const controllo = visita.tipo !== 'prima_visita' && prima && prima.id !== visita.id;
  const firma = impostazioni?.firma ?? '';
  const chiusura = (impostazioni?.chiusura ?? '').replace(/\{\{email\}\}/g, impostazioni?.email_contatti ?? '___').replace(/\{\{firma\}\}/g, firma || 'del medico');
  const nato = paziente.sesso === 'F' ? 'Nata' : 'Nato';
  return (
    <article className="text-[11pt] leading-snug text-black">
      <header className="mb-4 border-b-2 border-black pb-2 text-center">
        <p className="text-[14pt] font-bold">{impostazioni?.intestazione ?? 'Ambulatorio di Allergologia'}</p>
        {impostazioni?.sottotitolo && <p>{impostazioni.sottotitolo}</p>}
        {!impostazioni?.sottotitolo && studio?.nome && <p className="text-[10pt]">{studio.nome}</p>}
      </header>
      <p className="mb-3 text-right">{[impostazioni?.luogo, giorno(visita.data)].filter(Boolean).join(', ')}</p>

      <div className="mb-3">
        <p><b>Cognome e Nome:</b> {paziente.cognome} {paziente.nome}{codiceFiscale ? ` · C.F. ${codiceFiscale}` : ''}</p>
        <p>{nato}{paziente.luogo_nascita ? ` a ${paziente.luogo_nascita}` : ''} il {fmtGiornoIso(paziente.data_nascita)}{paziente.residenza ? ` e residente a ${paziente.residenza}` : ''}</p>
        <p>{[paziente.genitore_telefono && `Tel.: ${paziente.genitore_telefono}`, paziente.genitore_email && `e-mail: ${paziente.genitore_email}`].filter(Boolean).join('   ')}</p>
        {paziente.pediatra_curante && <p>PdF: {paziente.pediatra_curante}</p>}
      </div>

      {voce('Anamnesi familiare', anamnesi.anamnesi_familiare)}
      {voce('Anamnesi fisiologica', anamnesi.anamnesi_fisiologica)}
      {voce('Anamnesi patologica remota', anamnesi.anamnesi_remota)}

      {controllo ? (
        <>
          <p className="mt-2 font-bold">Prima osservazione clinica {giorno(prima!.data)}:</p>
          <TestoReferto testo={String(prima!.anamnesi ?? '')} />
          {visita.anamnesi ? <TestoReferto testo={String(visita.anamnesi)} /> : null}
        </>
      ) : (
        <>
          <p className="mt-2 font-bold">Anamnesi patologica prossima:</p>
          <TestoReferto testo={String(visita.anamnesi ?? '')} />
        </>
      )}

      <div className="mt-2">
        {voce('Abitazione', anamnesi.abitazione)}
        {voce('Animali domestici', anamnesi.animali)}
        {voce('Fumo passivo', anamnesi.fumo_dettaglio)}
        {voce('Farmaci', anamnesi.farmaci)}
        {voce('Alimentazione', anamnesi.alimentazione)}
        {voce('Sport', anamnesi.sport)}
      </div>

      {controllo && (
        <>
          <p className="mt-3 font-bold">Controllo clinico del {giorno(visita.data)}</p>
          <TestoReferto testo={String(visita.decorso ?? '')} />
        </>
      )}

      {(visita.esame_obiettivo || visita.peso_kg) ? (
        <div className="mt-3">
          <p className="font-bold">ESAME OBIETTIVO{visita.peso_kg && !String(visita.esame_obiettivo ?? '').includes('Peso') ? ` · Peso: ${String(visita.peso_kg).replace('.', ',')} kg` : ''}</p>
          <TestoReferto testo={String(visita.esame_obiettivo ?? '')} />
        </div>
      ) : null}

      {visita.test_eseguiti ? <div className="mt-3"><TestoReferto testo={String(visita.test_eseguiti)} /></div> : null}
      {visita.conclusioni ? <div className="mt-3"><p className="font-bold">Conclusioni</p><TestoReferto testo={String(visita.conclusioni)} /></div> : null}
      {visita.diagnosi_testo ? (
        <div className="mt-3"><p className="font-bold">Diagnosi</p>
          <ul className="ml-5 list-disc">{String(visita.diagnosi_testo).split('\n').map((d) => d.replace(/^\s*-\s*/, '').trim()).filter(Boolean).map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      ) : null}
      {visita.piano ? <div className="mt-3"><p className="font-bold">Piano di cura</p><TestoReferto testo={String(visita.piano)} /></div> : null}
      {visita.prossimo_controllo && ![giorno(visita.prossimo_controllo), giorno(visita.prossimo_controllo).replace(/\//g, '.')].some((d) => String(visita.piano ?? '').includes(d))
        ? <p className="mt-2">Visita di controllo: {giorno(visita.prossimo_controllo)}.</p> : null}

      {chiusura.trim() && <p className="mt-4">{chiusura}</p>}
      <footer className="mt-8 flex justify-end" style={{ breakInside: 'avoid' }}>
        <div className="w-72 text-center">
          <p className="font-semibold">{firma || 'Il medico'}</p>
          {impostazioni?.qualifica && <p className="text-[9pt]">{impostazioni.qualifica}</p>}
          <div className="mt-8 border-b border-black" />
        </div>
      </footer>
      <p className="mt-6 text-[8pt] text-gray-600">Documento generato il {fmtDataOra(new Date())}. Contiene dati sanitari: conservare e trasmettere con riservatezza.</p>
    </article>
  );
}

export interface ContattoEmergenza { nome: string; telefono1: string; telefono2: string }

// Righe del piano d'azione: [segni e sintomi, adrenalina, antistaminico].
const RIGHE_PIANO: [string, boolean, boolean][] = [
  ['Alimento appena assunto ma ancora nessun sintomo', false, true],
  ['Cavo orale: prurito, pizzicore e/o gonfiore delle labbra, della bocca', false, true],
  ['Pelle: orticaria, rash pruriginoso', false, true],
  ['Pelle: gonfiore del volto, del collo o delle estremità (mani e piedi)', true, true],
  ['Intestino: nausea, dolori addominali, vomito o diarrea', false, true],
  ['Gola †: gola secca, senso di ostruzione, tosse abbaiante, gonfiore della lingua', true, true],
  ['Polmone †: respiro breve e frequente, tosse ripetuta, fischio', true, false],
  ['Coscienza †: offuscamento della vista, svenimento', true, false],
  ['Cuore †: polso frequente, bassa pressione arteriosa, pallore, cianosi', true, false],
  ['Se la reazione sta progredendo (più sedi coinvolte)', true, true],
];

/** Piano d'azione per la reazione allergica da alimento (formato dell'ambulatorio). */
export function PianoAnafilassi({ paziente, allergeni, asma, adrenalina, antistaminico, contatti }: {
  paziente: AllergoPaziente; allergeni: string; asma: boolean; adrenalina: string; antistaminico: string; contatti: ContattoEmergenza[];
}) {
  const cella = 'border border-black px-2 py-1';
  return (
    <div className="text-[10.5pt]">
      <p className="mb-1"><b>{paziente.nome} {paziente.cognome}</b> nato/a il {fmtGiornoIso(paziente.data_nascita)}</p>
      <p className="mb-1 text-[12pt]">Allergico/a a <b>{allergeni.toUpperCase() || '___'}</b></p>
      <p className="mb-2">Asma bronchiale: {asma ? '☒ sì ☐ no — elevato rischio per reazioni severe' : '☐ sì ☒ no'}</p>
      <p className="font-bold">Da fare subito: guardare ed eventualmente trattare</p>
      <table className="mb-2 w-full border-collapse">
        <thead><tr><th className={`${cella} bg-gray-100 text-left`}>Segni e sintomi</th><th className={`${cella} bg-gray-100`}>{adrenalina || 'Adrenalina'}</th><th className={`${cella} bg-gray-100`}>Antistaminico</th></tr></thead>
        <tbody>
          {RIGHE_PIANO.map(([t, a, b]) => (
            <tr key={t} style={{ breakInside: 'avoid' }}>
              <td className={cella}>{t}</td>
              <td className={`${cella} text-center ${a ? 'font-bold' : ''}`}>{a ? 'SÌ' : 'no'}</td>
              <td className={`${cella} text-center`}>{b ? 'sì' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[9pt]">† Segni di anafilassi. NB: la severità dei segni e dei sintomi può cambiare rapidamente.</p>
      <p className="mt-2"><b>Dosaggio.</b> Adrenalina: {adrenalina || '___'} per via intramuscolare nella coscia. Antistaminico: {antistaminico || '___'}.</p>

      <p className={h2}>Subito dopo il trattamento: chi chiamare</p>
      <ul className="ml-5 list-disc">
        <li>Chiamare il <b>112</b>: dire che si tratta di una reazione anafilattica (reazione allergica grave) in un bambino, già in corso di trattamento, e che potrebbe essere necessaria altra adrenalina.</li>
        <li>Rimanere accanto al bambino: sdraiato con le gambe sollevate, seduto se respira con fatica; non farlo alzare né camminare.</li>
        <li>Se i sintomi persistono dopo 5–10 minuti, somministrare una seconda dose (secondo autoiniettore).</li>
        <li>Portare in Pronto Soccorso anche l'autoiniettore usato.</li>
      </ul>

      <p className={h2}>Contatti familiari di emergenza</p>
      <table className="mb-2 w-full border-collapse">
        <thead><tr><th className={`${cella} bg-gray-100 text-left`}>Nome / relazione con il bambino</th><th className={`${cella} bg-gray-100`}>Telefono 1</th><th className={`${cella} bg-gray-100`}>Telefono 2</th></tr></thead>
        <tbody>
          {[...contatti, ...Array.from({ length: Math.max(0, 3 - contatti.length) }, () => ({ nome: '', telefono1: '', telefono2: '' }))].map((c, i) => (
            <tr key={i}><td className={`${cella} h-7`}>{c.nome}</td><td className={cella}>{c.telefono1}</td><td className={cella}>{c.telefono2}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="my-2 rounded border-2 border-black p-2 text-center font-bold">NON ASPETTATE DI TROVARE IL GENITORE O UN PARENTE! TRATTATE SUBITO E POI PORTATE IL BAMBINO AL PRONTO SOCCORSO</p>

      <p className={h2}>Come praticare l'adrenalina</p>
      <ol className="ml-5 list-decimal">
        <li>Rimuovere il tappo di sicurezza.</li>
        <li>Appoggiare con forza l'estremità opposta sulla parte laterale esterna della coscia (sempre sulla coscia, anche attraverso i vestiti).</li>
        <li>Spingere con forza finché scatta il meccanismo di iniezione; tenere premuto per il tempo indicato nel foglietto del dispositivo (es. 10 secondi).</li>
        <li>Rimuovere l'autoiniettore e massaggiare la zona di iniezione per 10 secondi.</li>
      </ol>
      <p className="mt-2">Dopo il trattamento chiamare il 112 e dire che può essere necessaria altra adrenalina. Portare in Pronto Soccorso anche l'autoiniettore usato: il bambino deve restare in osservazione.</p>
    </div>
  );
}

/** Scheda di dieta di esclusione per categorie (riusa le indicazioni del gestionale). */
export function DietaEsclusione({ categorie, note }: { categorie: string[]; note: string }) {
  return (
    <div className="text-[10.5pt]">
      {categorie.map((k) => {
        const d = DIETE[k];
        if (!d) return null;
        return (
          <div key={k} className="mb-3" style={{ breakInside: 'avoid' }}>
            <p className={h2}>{d.nome}</p>
            <p className="font-semibold">Da evitare</p>
            <ul className="ml-5 list-disc">{d.evitare.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="mt-1"><b>In etichetta cercare:</b> {d.etichetta.join(', ')}</p>
            {d.note.length > 0 && <ul className="ml-5 list-disc text-[9.5pt]">{d.note.map((x) => <li key={x}>{x}</li>)}</ul>}
          </div>
        );
      })}
      {note.trim() && <p className="mt-2"><b>Indicazioni specifiche:</b> {note}</p>}
      <p className="mt-3 text-[9pt]">{AVVERTENZA_DIETA}</p>
    </div>
  );
}

/** Lettera di riepilogo per il pediatra curante. */
export function RiepilogoAllergo({ dati }: { dati: {
  diagnosi: RigaAllergo[]; test: RigaAllergo[]; tpo: RigaAllergo[]; terapie: RigaAllergo[]; autoiniettori: RigaAllergo[];
  punteggi: RigaAllergo[]; ultimaVisita: RigaAllergo | null;
} }) {
  const { diagnosi, test, tpo, terapie, autoiniettori, punteggi, ultimaVisita } = dati;
  const ultimiPunteggi = Object.values(Object.fromEntries([...punteggi].reverse().map((p) => [String(p.scala), p])));
  return (
    <div className="text-[10.5pt]">
      <p className={h2}>Diagnosi</p>
      {diagnosi.length ? <TabellaStampa intestazioni={['Area', 'Diagnosi', 'Dal', 'Stato']}
        righe={diagnosi.map((d) => [AREE_ALLERGO[d.area as AreaAllergo] ?? s(d, 'area'), `${s(d, 'descrizione')}${d.gravita ? ` (${s(d, 'gravita')})` : ''}`, giorno(d.data_diagnosi), s(d, 'stato').replace('_', ' ')])} /> : <p>—</p>}
      <p className={h2}>Test allergologici</p>
      {test.length ? <TabellaStampa intestazioni={['Data', 'Test', 'Allergene', 'Valore', 'Esito']}
        righe={test.map((t) => [giorno(t.data), TIPI_TEST[s(t, 'tipo')] ?? s(t, 'tipo'), s(t, 'allergene'), t.valore != null ? `${s(t, 'valore')} ${s(t, 'unita')}` : '—', s(t, 'esito') || '—'])} /> : <p>—</p>}
      {tpo.length > 0 && <>
        <p className={h2}>Test di provocazione orale</p>
        <TabellaStampa intestazioni={['Data', 'Alimento', 'Esito', 'Indicazioni']}
          righe={tpo.map((t) => [giorno(t.data), `${s(t, 'alimento')}${t.forma ? ` (${s(t, 'forma')})` : ''}`, ESITI_TPO[s(t, 'esito')] ?? s(t, 'esito'), s(t, 'indicazioni') || '—'])} />
      </>}
      {ultimiPunteggi.length > 0 && <>
        <p className={h2}>Ultimi punteggi</p>
        <TabellaStampa intestazioni={['Scala', 'Data', 'Punteggio', 'Livello']}
          righe={ultimiPunteggi.map((p) => [s(p, 'scala').toUpperCase().replace('_', '-'), giorno(p.data), s(p, 'punteggio'), String((p.dettagli as { livello?: string })?.livello ?? '').replace(/_/g, ' ')])} />
      </>}
      <p className={h2}>Terapia in corso</p>
      {terapie.length ? <TabellaStampa intestazioni={['Farmaco', 'Classe', 'Posologia', 'Dal']}
        righe={terapie.map((t) => [s(t, 'farmaco'), CLASSI_TERAPIA[s(t, 'classe')] ?? s(t, 'classe'), s(t, 'posologia') || '—', giorno(t.dal)])} /> : <p>—</p>}
      {autoiniettori.length > 0 && <p>Autoiniettore di adrenalina: {autoiniettori.map((a) => `${s(a, 'dispositivo')} ${String(a.dose_mg).replace('.', ',')} mg × ${s(a, 'numero')}${a.scadenza ? `, scadenza ${giorno(a.scadenza)}` : ''}`).join('; ')}.</p>}
      {ultimaVisita && <>
        <p className={h2}>Ultima visita ({giorno(ultimaVisita.data)})</p>
        {ultimaVisita.conclusioni ? <p><b>Conclusioni:</b> {s(ultimaVisita, 'conclusioni')}</p> : null}
        {ultimaVisita.piano ? <p><b>Piano:</b> {s(ultimaVisita, 'piano')}</p> : null}
        {ultimaVisita.prossimo_controllo ? <p><b>Prossimo controllo:</b> {giorno(ultimaVisita.prossimo_controllo)}</p> : null}
      </>}
    </div>
  );
}
