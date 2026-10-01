import type { ClaimsApp, Pediatra, Studio } from '@pls/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Bottone, Caricamento, Errore, Pannello } from '../componenti/ui';
import { q, useDati } from '../lib/dati';
import { etichettaRuolo } from '../lib/formato';
import { supabase } from '../lib/supabase';

type CampoMedico = 'titolo' | 'nome' | 'cognome' | 'specializzazione' | 'codice_regionale' | 'ordine_provincia'
  | 'ordine_numero' | 'partita_iva' | 'codice_fiscale' | 'telefono' | 'pec';
type CampoStudio = 'nome' | 'indirizzo' | 'telefono' | 'email' | 'pec';

const CAMPI_MEDICO: { campo: CampoMedico; etichetta: string; aiuto?: string; schema?: RegExp; maiuscolo?: boolean }[] = [
  { campo: 'titolo', etichetta: 'Titolo', aiuto: 'Es. Dott., Dott.ssa, Prof.' },
  { campo: 'nome', etichetta: 'Nome' },
  { campo: 'cognome', etichetta: 'Cognome' },
  { campo: 'specializzazione', etichetta: 'Specializzazione' },
  { campo: 'codice_regionale', etichetta: 'Codice regionale PLS' },
  { campo: 'ordine_provincia', etichetta: 'Ordine dei Medici di (provincia)', aiuto: 'Es. Catanzaro' },
  { campo: 'ordine_numero', etichetta: 'Numero di iscrizione all’Albo' },
  { campo: 'partita_iva', etichetta: 'Partita IVA', aiuto: '11 cifre', schema: /^[0-9]{11}$/ },
  { campo: 'codice_fiscale', etichetta: 'Codice fiscale', aiuto: '16 caratteri', schema: /^[A-Z0-9]{16}$/, maiuscolo: true },
  { campo: 'telefono', etichetta: 'Telefono' },
  { campo: 'pec', etichetta: 'PEC', schema: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
];

const CAMPI_STUDIO: { campo: CampoStudio; etichetta: string; schema?: RegExp }[] = [
  { campo: 'nome', etichetta: 'Nome dello studio (intestazione dei documenti)' },
  { campo: 'indirizzo', etichetta: 'Indirizzo' },
  { campo: 'telefono', etichetta: 'Telefono' },
  { campo: 'email', etichetta: 'Email', schema: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  { campo: 'pec', etichetta: 'PEC', schema: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
];

const OBBLIGATORI = new Set<string>(['titolo', 'nome', 'cognome', 'specializzazione', 'codice_regionale', 'indirizzo']);

function Campo({ etichetta, valore, onChange, aiuto, sola, errato }: {
  etichetta: string; valore: string; onChange: (v: string) => void; aiuto?: string; sola: boolean; errato: boolean;
}) {
  return (
    <label className="text-sm">
      <span className="block text-slate-500">{etichetta}</span>
      <input
        value={valore}
        onChange={(e) => onChange(e.target.value)}
        readOnly={sola}
        aria-invalid={errato}
        className={`w-full rounded-lg border px-2 py-1.5 ${sola ? 'border-slate-200 bg-slate-50 text-slate-700' : errato ? 'border-red-400' : 'border-slate-300'}`}
      />
      {aiuto && !sola && <span className="text-xs text-slate-400">{aiuto}</span>}
    </label>
  );
}

/** Valori del modulo: stringhe, '' = vuoto (salvato come null). */
const comeForm = <T extends string>(r: Record<string, unknown> | null | undefined, campi: { campo: T }[]) =>
  Object.fromEntries(campi.map(({ campo }) => [campo, (r?.[campo] as string | null) ?? ''])) as Record<T, string>;

/**
 * Profilo del medico e dati dello studio: compaiono nell'intestazione e nella firma
 * di tutti i PDF. Solo il pediatra titolare li modifica (RLS + grant per colonna);
 * ogni modifica è registrata nel registro accessi.
 */
export default function Account({ claims }: { claims: ClaimsApp }) {
  const modificabile = claims.app_ruolo === 'pediatra';
  const studio = useDati(() => q<Studio>(supabase.schema('anagrafica').from('studi').select('*').single()), []);
  const medici = useDati(() => q<Pediatra[]>(supabase.schema('anagrafica').from('pediatri').select('*').order('cognome')), []);
  const io = medici.dati?.find((m) => m.id === claims.sub);

  const [formMedico, setFormMedico] = useState(() => comeForm<CampoMedico>(null, CAMPI_MEDICO));
  const [formStudio, setFormStudio] = useState(() => comeForm<CampoStudio>(null, CAMPI_STUDIO));
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => { if (io) setFormMedico(comeForm<CampoMedico>(io as unknown as Record<string, unknown>, CAMPI_MEDICO)); }, [io]);
  useEffect(() => { if (studio.dati) setFormStudio(comeForm<CampoStudio>(studio.dati as unknown as Record<string, unknown>, CAMPI_STUDIO)); }, [studio.dati]);

  const erratoMedico = (c: (typeof CAMPI_MEDICO)[number]) =>
    (OBBLIGATORI.has(c.campo) && !formMedico[c.campo].trim()) || (!!c.schema && !!formMedico[c.campo].trim() && !c.schema.test(formMedico[c.campo].trim()));
  const erratoStudio = (c: (typeof CAMPI_STUDIO)[number]) =>
    (OBBLIGATORI.has(c.campo) && !formStudio[c.campo].trim()) || (!!c.schema && !!formStudio[c.campo].trim() && !c.schema.test(formStudio[c.campo].trim()));

  const pulisci = <T extends string>(f: Record<T, string>) =>
    Object.fromEntries(Object.entries<string>(f).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]));

  async function salvaMedico(e: FormEvent) {
    e.preventDefault();
    setEsito(null);
    if (CAMPI_MEDICO.some(erratoMedico)) return setEsito({ ok: false, testo: 'Controlla i campi evidenziati.' });
    setSalvataggio(true);
    const { error } = await supabase.schema('anagrafica').from('pediatri').update(pulisci(formMedico)).eq('id', claims.sub);
    setSalvataggio(false);
    if (error) return setEsito({ ok: false, testo: `Salvataggio non riuscito: ${error.message}` });
    setEsito({ ok: true, testo: 'Profilo del medico aggiornato.' });
    medici.ricarica();
  }

  async function salvaStudio(e: FormEvent) {
    e.preventDefault();
    setEsito(null);
    if (!studio.dati) return;
    if (CAMPI_STUDIO.some(erratoStudio)) return setEsito({ ok: false, testo: 'Controlla i campi evidenziati.' });
    setSalvataggio(true);
    const { error } = await supabase.schema('anagrafica').from('studi').update(pulisci(formStudio)).eq('id', studio.dati.id);
    setSalvataggio(false);
    if (error) return setEsito({ ok: false, testo: `Salvataggio non riuscito: ${error.message}` });
    setEsito({ ok: true, testo: 'Dati dello studio aggiornati.' });
    studio.ricarica();
  }

  if (studio.errore || medici.errore) return <Errore messaggio={studio.errore ?? medici.errore ?? ''} />;
  if (studio.caricamento || medici.caricamento) return <Caricamento righe={8} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Account</h1>
        <p className="text-sm text-slate-500">
          {claims.email} · {etichettaRuolo(claims.app_ruolo)}.{' '}
          Questi dati compaiono nell'intestazione e nella firma dei documenti PDF.
          {!modificabile && ' Solo il pediatra titolare può modificarli.'}
        </p>
      </div>

      {esito && (
        <p role="status" className={`rounded-lg p-3 text-sm ${esito.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{esito.testo}</p>
      )}

      {modificabile && io && (
        <Pannello titolo="Profilo del medico">
          <form onSubmit={(e) => void salvaMedico(e)} className="grid gap-3 md:grid-cols-2">
            {CAMPI_MEDICO.map((c) => (
              <Campo key={c.campo} etichetta={c.etichetta} aiuto={c.aiuto} sola={false} errato={erratoMedico(c)}
                     valore={formMedico[c.campo]}
                     onChange={(v) => setFormMedico({ ...formMedico, [c.campo]: c.maiuscolo ? v.toUpperCase() : v })} />
            ))}
            <p className="text-xs text-slate-500 md:col-span-2">
              L'email di accesso ({io.email}) si cambia dalla gestione utenti di Supabase, non da qui.
            </p>
            <div className="md:col-span-2"><Bottone type="submit" variante="primario" disabled={salvataggio}>Salva profilo</Bottone></div>
          </form>
        </Pannello>
      )}

      {!modificabile && (
        <Pannello titolo="Medici dello studio">
          <ul className="divide-y divide-slate-100 text-sm">
            {(medici.dati ?? []).map((m) => (
              <li key={m.id} className="py-2">
                <p className="font-medium text-slate-900">{m.titolo} {m.nome} {m.cognome}</p>
                <p className="text-slate-600">
                  {[m.specializzazione, `cod. reg. ${m.codice_regionale}`,
                    m.ordine_numero && `Ordine di ${m.ordine_provincia} n. ${m.ordine_numero}`,
                    m.partita_iva && `P. IVA ${m.partita_iva}`, m.telefono, m.pec].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Pannello>
      )}

      <Pannello titolo="Dati dello studio">
        <form onSubmit={(e) => void salvaStudio(e)} className="grid gap-3 md:grid-cols-2">
          {CAMPI_STUDIO.map((c) => (
            <Campo key={c.campo} etichetta={c.etichetta} sola={!modificabile} errato={modificabile && erratoStudio(c)}
                   valore={formStudio[c.campo]} onChange={(v) => setFormStudio({ ...formStudio, [c.campo]: v })} />
          ))}
          <p className="text-sm text-slate-500 md:col-span-2">ASL di riferimento: {studio.dati?.asl}</p>
          {modificabile && (
            <div className="md:col-span-2"><Bottone type="submit" variante="primario" disabled={salvataggio}>Salva dati dello studio</Bottone></div>
          )}
        </form>
      </Pannello>
    </div>
  );
}
