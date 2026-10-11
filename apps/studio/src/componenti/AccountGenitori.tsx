import type { FinalitaConsenso } from '@pls/shared';
import { useState } from 'react';
import { q, useDati } from '../lib/dati';
import { ETICHETTA_FINALITA, ETICHETTA_RELAZIONE, fmtDataOra, STATO_CONSENSO } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';
import Finestra from './Finestra';
import { Badge, Bottone, Caricamento, Errore, Vuoto } from './ui';

interface ConsensoGenitore {
  paziente_id: string; finalita: FinalitaConsenso; stato: keyof typeof STATO_CONSENSO; canale: 'portale' | 'cartaceo_studio';
  versione: string; registrato_il: string; firmato: boolean; letta: boolean;
}
interface Genitore {
  tutore_id: string; nome: string; cognome: string; email: string; telefono: string | null;
  account_collegato: boolean; email_confermata: boolean; ultimo_accesso: string | null; bloccato: boolean;
  figli: { paziente_id: string; nome: string; cognome: string; tipo: keyof typeof ETICHETTA_RELAZIONE; responsabilita: boolean }[];
  consensi: ConsensoGenitore[];
}

const FINALITA: FinalitaConsenso[] = ['dati_sanitari', 'portale', 'comunicazioni', 'condivisione_altro_genitore', 'whatsapp'];
/** Necessari per curare il bambino e usare il portale; gli altri sono facoltativi. */
const NECESSARI: FinalitaConsenso[] = ['dati_sanitari', 'portale'];
type Filtro = 'tutti' | 'senza_account' | 'da_firmare';

/** Consensi necessari che il genitore deve ancora esprimere (o rinnovare) per ciascun figlio con responsabilità. */
function daFirmare(g: Genitore) {
  return g.figli.filter((f) => f.responsabilita).flatMap((f) =>
    NECESSARI.filter((fin) => !g.consensi.some((c) => c.paziente_id === f.paziente_id && c.finalita === fin && c.stato !== 'da_rinnovare'))
      .map((fin) => ({ figlio: f, finalita: fin })));
}

/**
 * Amministrazione degli account dei genitori: chi ha attivato il portale, quando è
 * entrato l'ultima volta, quali consensi ha dato (in studio o firmando sul portale)
 * e quali mancano. L'account si può scollegare (il genitore perde subito l'accesso).
 */
export default function AccountGenitori() {
  const elenco = useDati(() => q<Genitore[]>(supabase.schema('api').rpc('admin_account_genitori')), []);
  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [cerca, setCerca] = useState('');
  const [aperto, setAperto] = useState<Genitore | null>(null);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

  async function scollega(g: Genitore, blocca: boolean) {
    setEsito(null);
    if (blocca && !window.confirm(`Sospendere l'accesso al portale di ${g.nome} ${g.cognome}? Non vedrà più i dati dei figli finché non lo riattivi.`)) return;
    const { error } = await supabase.schema('api').rpc('admin_scollega_genitore', { p_tutore_id: g.tutore_id, p_blocca: blocca });
    if (error) return setEsito({ ok: false, testo: error.message });
    setEsito({ ok: true, testo: blocca
      ? `Accesso al portale di ${g.nome} ${g.cognome} sospeso: non può ricollegarsi finché non lo riattivi.`
      : `Accesso di ${g.nome} ${g.cognome} riattivato: al prossimo accesso con l'email registrata vedrà di nuovo i figli.` });
    setAperto(null);
    elenco.ricarica();
  }

  if (elenco.errore) return <Errore messaggio={elenco.errore} />;
  if (elenco.caricamento || !elenco.dati) return <Caricamento />;
  const testo = cerca.trim().toLowerCase();
  const visibili = elenco.dati.filter((g) =>
    (filtro === 'tutti' || (filtro === 'senza_account' ? !g.account_collegato : daFirmare(g).length > 0))
    && (!testo || `${g.nome} ${g.cognome} ${g.email} ${g.figli.map((f) => `${f.nome} ${f.cognome}`).join(' ')}`.toLowerCase().includes(testo)));
  const conAccount = elenco.dati.filter((g) => g.account_collegato).length;
  const conMancanti = elenco.dati.filter((g) => daFirmare(g).length > 0).length;

  return (
    <div className="space-y-3 text-sm">
      {esito && <p role="status" className={`rounded-lg p-3 ${esito.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{esito.testo}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {([['tutti', `Tutti (${elenco.dati.length})`], ['senza_account', `Senza account (${elenco.dati.length - conAccount})`], ['da_firmare', `Consensi necessari mancanti (${conMancanti})`]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)}
                  className={`rounded-full border px-3 py-1 ${filtro === k ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{t}</button>
        ))}
        <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca genitore o bambino"
               className="ml-auto w-full rounded-lg border border-slate-300 px-2 py-1.5 sm:w-64" aria-label="Cerca genitore o bambino" />
      </div>

      {visibili.length === 0 ? <Vuoto testo="Nessun genitore per questo filtro." /> : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2 font-medium">Genitore</th><th className="px-4 py-2 font-medium">Figli</th>
                <th className="px-4 py-2 font-medium">Portale</th><th className="px-4 py-2 font-medium">Consensi</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibili.map((g) => {
                const mancanti = daFirmare(g);
                const firmati = g.consensi.filter((c) => c.firmato).length;
                return (
                  <tr key={g.tutore_id} className="align-top">
                    <td className="px-4 py-2"><p className="font-medium text-slate-900">{g.cognome} {g.nome}</p><p className="text-xs text-slate-500">{g.email}{g.telefono ? ` · ${g.telefono}` : ''}</p></td>
                    <td className="px-4 py-2">{g.figli.map((f) => (
                      <a key={f.paziente_id} href={link('assistiti', f.paziente_id)} className="block text-teal-800 hover:underline">
                        {f.nome} {f.cognome} <span className="text-xs text-slate-500">({ETICHETTA_RELAZIONE[f.tipo]}{f.responsabilita ? '' : ', senza responsabilità'})</span>
                      </a>))}</td>
                    <td className="px-4 py-2">
                      {g.bloccato ? <Badge tono="errore">Sospeso</Badge> : g.account_collegato
                        ? <><Badge tono="ok">Attivo</Badge><p className="text-xs text-slate-500">{g.ultimo_accesso ? `ultimo accesso ${fmtDataOra(g.ultimo_accesso)}` : 'mai entrato'}</p></>
                        : <Badge>Non attivato</Badge>}
                    </td>
                    <td className="px-4 py-2">
                      {mancanti.length ? <Badge tono="attenzione">{mancanti.length} necessari da firmare</Badge> : <Badge tono="ok">Necessari completi</Badge>}
                      {firmati > 0 && <p className="text-xs text-slate-500">{firmati} firmati sul portale</p>}
                    </td>
                    <td className="px-4 py-2 text-right"><Bottone onClick={() => setAperto(g)}>Dettagli</Bottone></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Il genitore attiva il portale entrando con l'email registrata dallo studio (codice via email, email confermata). Per i consensi
        il portale mostra l'informativa, registra quando viene aperta e raccoglie la firma su schermo con impronta di quanto firmato.
      </p>

      {aperto && (
        <Finestra titolo={`${aperto.cognome} ${aperto.nome}`} onChiudi={() => setAperto(null)} larga>
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">{aperto.email}{aperto.telefono ? ` · ${aperto.telefono}` : ''} · account {aperto.account_collegato
              ? `collegato${aperto.email_confermata ? ', email confermata' : ', email NON confermata'}` : 'non attivato'}</p>
            {aperto.figli.map((f) => (
              <div key={f.paziente_id} className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 font-medium text-slate-900">{f.nome} {f.cognome} · {ETICHETTA_RELAZIONE[f.tipo]}</p>
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500"><tr><th className="py-1 font-medium">Finalità</th><th className="py-1 font-medium">Stato</th><th className="py-1 font-medium">Come</th><th className="py-1 font-medium">Informativa</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {FINALITA.map((fin) => {
                      const c = aperto.consensi.find((x) => x.paziente_id === f.paziente_id && x.finalita === fin);
                      return (
                        <tr key={fin}>
                          <td className="py-1">{ETICHETTA_FINALITA[fin]}</td>
                          <td className="py-1">{c ? <Badge tono={STATO_CONSENSO[c.stato].tono}>{STATO_CONSENSO[c.stato].testo}</Badge> : !f.responsabilita ? '—' : NECESSARI.includes(fin) ? <Badge tono="attenzione">Da firmare</Badge> : <Badge>Facoltativo</Badge>}</td>
                          <td className="py-1">{c ? `${c.canale === 'portale' ? (c.firmato ? 'Firmato sul portale' : 'Portale') : 'Cartaceo in studio'} · ${fmtDataOra(c.registrato_il)} · v. ${c.versione}` : '—'}</td>
                          <td className="py-1">{c?.letta ? 'Aperta sul portale' : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3">
              {aperto.bloccato ? (
                <>
                  <span className="flex-1 text-xs text-slate-600">Accesso al portale sospeso. Prima di riattivarlo verifica che l'email registrata sia corretta.</span>
                  <Bottone onClick={() => void scollega(aperto, false)}>Riattiva accesso</Bottone>
                </>
              ) : (
                <>
                  <span className="flex-1 text-xs text-slate-600">Sospendi l'accesso se l'email non è più del genitore o in caso di uso improprio. I dati e i consensi restano.</span>
                  <Bottone variante="pericolo" onClick={() => void scollega(aperto, true)}>Sospendi accesso al portale</Bottone>
                </>
              )}
            </div>
          </div>
        </Finestra>
      )}
    </div>
  );
}
