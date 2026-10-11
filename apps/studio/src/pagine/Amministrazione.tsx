import type { ClaimsApp, MembroStudio } from '@pls/shared';
import AccountGenitori from '../componenti/AccountGenitori';
import GestioneAllergologia from '../componenti/allergo/GestioneAllergologia';
import GestioneStaff from '../componenti/GestioneStaff';
import ImportaCatalogo from '../componenti/ImportaCatalogo';
import Integrazioni from '../componenti/Integrazioni';
import PermessiSegreteria from '../componenti/PermessiSegreteria';
import { Badge, Errore, Kpi, Pannello } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { etichettaRuolo } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';

const SEZIONI = [
  { id: 'panoramica', titolo: 'Panoramica' },
  { id: 'staff', titolo: 'Staff e figure' },
  { id: 'permessi', titolo: 'Accesso alle cartelle' },
  { id: 'moduli', titolo: 'Moduli specialistici' },
  { id: 'genitori', titolo: 'Account genitori e consensi' },
  { id: 'integrazioni', titolo: 'Integrazioni' },
  { id: 'catalogo', titolo: 'Catalogo prestazioni' },
] as const;
type IdSezione = (typeof SEZIONI)[number]['id'];

/**
 * Specializzazioni: ogni modulo ha la propria anagrafica separata o le proprie tabelle cliniche,
 * un ruolo dedicato (o l'abilitazione di un medico dello studio) e una funzione di controllo
 * nel database. Allergologia è il primo; gli altri sono il percorso previsto.
 */
const MODULI = [
  { codice: 'allergologia', nome: 'Allergologia pediatrica', stato: 'attivo' as const, ruolo: 'Pediatra allergologo' },
  { codice: 'dermatologia', nome: 'Dermatologia pediatrica', stato: 'previsto' as const, ruolo: 'Dermatologo' },
  { codice: 'cardiologia', nome: 'Cardiologia pediatrica', stato: 'previsto' as const, ruolo: 'Cardiologo pediatra' },
  { codice: 'neuropsichiatria', nome: 'Neuropsichiatria infantile', stato: 'previsto' as const, ruolo: 'Neuropsichiatra infantile' },
  { codice: 'nutrizione', nome: 'Nutrizione e gastroenterologia', stato: 'previsto' as const, ruolo: 'Gastroenterologo / nutrizionista' },
];

const FIGURE = [
  { nome: 'Amministratore', testo: 'Può fare tutto: visite, referti, inserimenti, gestione di staff, moduli, genitori e integrazioni. Si assegna a pediatri, sostituti o allergologi, mai alla segreteria.' },
  { nome: 'Pediatra di libera scelta', testo: 'I propri assistiti e tutta la cartella. Allergologia solo se abilitato (ad esempio per mostrare il gestionale completo).' },
  { nome: 'Pediatra sostituto', testo: 'Le cartelle del titolare solo nei periodi di sostituzione attivati dal titolare.' },
  { nome: 'Pediatra allergologo', testo: 'Solo il modulo Allergologia, con anagrafica pazienti separata.' },
  { nome: 'Segreteria', testo: 'Agenda, anagrafiche, accompagnatori e consensi. Le cartelle cliniche solo in lettura e solo se un pediatra (o l’amministratore) lo consente.' },
  { nome: 'Genitore', testo: 'Portale: visite, documenti, appuntamenti e misure dei propri figli; firma dei consensi.' },
];

export default function Amministrazione({ claims, sezione }: { claims: ClaimsApp; sezione?: string }) {
  const attiva: IdSezione = SEZIONI.some((s) => s.id === sezione) ? (sezione as IdSezione) : 'panoramica';
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Amministrazione</h1>
        <p className="text-sm text-slate-500">Controllo completo dello studio: figure e permessi, moduli, genitori, integrazioni. Ogni modifica resta nel registro accessi.</p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Sezioni di amministrazione">
        {SEZIONI.map((s) => (
          <a key={s.id} href={link('amministrazione', s.id)} aria-current={attiva === s.id ? 'page' : undefined}
             className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${attiva === s.id ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            {s.titolo}
          </a>
        ))}
        <a href={link('registro')} className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Registro accessi ↗</a>
      </nav>

      {attiva === 'panoramica' && <Panoramica />}
      {attiva === 'staff' && (
        <>
          <GestioneStaff claims={claims} parte="staff" />
          <Pannello titolo="Le figure del gestionale" sottotitolo="Cosa vede e cosa può fare ciascuno">
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              {FIGURE.map((f) => <div key={f.nome}><dt className="font-medium text-slate-900">{f.nome}</dt><dd className="text-slate-600">{f.testo}</dd></div>)}
            </dl>
          </Pannello>
        </>
      )}
      {attiva === 'permessi' && (
        <Pannello titolo="Accesso della segreteria alle cartelle cliniche" sottotitolo="Per ogni pediatra: quali segreterie possono consultare (in sola lettura) le cartelle dei suoi assistiti">
          <PermessiSegreteria claims={claims} />
        </Pannello>
      )}
      {attiva === 'moduli' && (
        <>
          <GestioneAllergologia claims={claims} />
          <Pannello titolo="Altre specializzazioni" sottotitolo="Il gestionale è predisposto per più professionisti: ogni modulo ha accessi, dati e registro propri">
            <ul className="divide-y divide-slate-100 text-sm">
              {MODULI.map((m) => (
                <li key={m.codice} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><span className="font-medium text-slate-900">{m.nome}</span> <span className="text-slate-500">· figura: {m.ruolo}</span></span>
                  {m.stato === 'attivo' ? <Badge tono="ok">Disponibile</Badge> : <Badge>In programma</Badge>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Per aggiungere una specializzazione si replica lo schema di Allergologia: ruolo dedicato, abilitazione dei medici dello studio,
              tabelle cliniche pseudonimizzate, funzione di accesso nel database e voce di menu.
            </p>
          </Pannello>
        </>
      )}
      {attiva === 'genitori' && (
        <Pannello titolo="Account genitori e consensi" sottotitolo="Accesso al portale, consensi dati in studio o firmati sul portale, consensi mancanti">
          <AccountGenitori />
        </Pannello>
      )}
      {attiva === 'integrazioni' && <Integrazioni />}
      {attiva === 'catalogo' && (
        <Pannello titolo="Catalogo prestazioni (Regione Calabria)" sottotitolo="Codici per le prescrizioni, importati dal file ufficiale">
          <ImportaCatalogo />
        </Pannello>
      )}
    </div>
  );
}

function Panoramica() {
  const dati = useDati(async () => {
    const ana = supabase.schema('anagrafica');
    const [membri, genitori, integrazioni, studio, catalogo] = await Promise.all([
      q<MembroStudio[]>(ana.from('membri_studio').select('*')),
      q<{ account_collegato: boolean; figli: { responsabilita: boolean }[]; consensi: unknown[] }[]>(supabase.schema('api').rpc('admin_account_genitori')),
      q<{ tipo: string; stato: string }[]>(ana.from('integrazioni').select('tipo, stato')),
      q<{ allergologia_attiva: boolean }>(ana.from('studi').select('allergologia_attiva').single()),
      ana.from('catalogo_prestazioni').select('id', { count: 'exact', head: true }).eq('attivo', true),
    ]);
    if (catalogo.error) throw new Error(catalogo.error.message);
    return { membri, genitori, integrazioni, studio, prestazioni: catalogo.count ?? 0 };
  }, []);
  if (dati.errore) return <Errore messaggio={dati.errore} />;
  const d = dati.dati;
  const attivi = d?.membri.filter((m) => m.attivo) ?? [];
  const perRuolo = attivi.reduce<Record<string, number>>((a, m) => ({ ...a, [m.ruolo]: (a[m.ruolo] ?? 0) + 1 }), {});
  const statoInt = (t: string) => d?.integrazioni.find((i) => i.tipo === t)?.stato ?? 'da_configurare';
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi etichetta="Staff attivo" valore={d ? attivi.length : '…'} tono="info" href={link('amministrazione', 'staff')}
             nota={d ? Object.entries(perRuolo).map(([r, n]) => `${n} ${etichettaRuolo(r as MembroStudio['ruolo']).toLowerCase()}`).join(' · ') : ''} />
        <Kpi etichetta="Amministratori" valore={d ? attivi.filter((m) => m.amministratore).length : '…'} tono="neutro"
             nota="Accesso completo" href={link('amministrazione', 'staff')} />
        <Kpi etichetta="Genitori con portale attivo" valore={d ? d.genitori.filter((g) => g.account_collegato).length : '…'} tono="ok"
             nota={d ? `su ${d.genitori.length} registrati` : ''} href={link('amministrazione', 'genitori')} />
        <Kpi etichetta="Prestazioni in catalogo" valore={d ? d.prestazioni : '…'} tono={d?.prestazioni ? 'ok' : 'attenzione'}
             nota={d?.prestazioni ? 'Catalogo regionale importato' : 'Da importare'} href={link('amministrazione', 'catalogo')} />
      </section>
      <Pannello titolo="Stato dei servizi">
        <ul className="divide-y divide-slate-100 text-sm">
          <li className="flex items-center justify-between py-2"><span>Modulo Allergologia</span>{d?.studio.allergologia_attiva ? <Badge tono="ok">Attivo</Badge> : <Badge>Non attivo</Badge>}</li>
          <li className="flex items-center justify-between py-2"><span>WhatsApp (promemoria)</span><Badge tono={statoInt('whatsapp') === 'attiva' ? 'ok' : 'neutro'}>{statoInt('whatsapp').replace('_', ' ')}</Badge></li>
          <li className="flex items-center justify-between py-2"><span>Google Calendar</span><Badge tono={statoInt('google_calendar') === 'attiva' ? 'ok' : 'neutro'}>{statoInt('google_calendar').replace('_', ' ')}</Badge></li>
          <li className="flex items-center justify-between py-2"><span>Registro accessi (catena di hash)</span><a href={link('registro')} className="text-teal-700 underline">Verifica integrità</a></li>
        </ul>
      </Pannello>
    </div>
  );
}
