import { useState } from 'react';
import { q, useDati } from '../lib/dati';
import { fmtData, fmtDataOra } from '../lib/formato';
import { link } from '../lib/rotta';
import { supabase } from '../lib/supabase';
import { Badge, Bottone, Caricamento, Errore, Vuoto, type Tono } from './ui';

interface Invio {
  id: string; paziente_id: string | null; allergo_paziente_id: string | null; canale: 'email' | 'whatsapp';
  destinatario: string; destinatario_nome: string | null; descrizione: string; documenti: { nome: string }[];
  scade_il: string; stato: 'preparato' | 'pronto' | 'inviato' | 'consegnato_manualmente' | 'errore' | 'revocato';
  errore: string | null; ritiri: number; ultimo_ritiro_il: string | null; tentativi: number; creato_il: string;
}

const STATO: Record<Invio['stato'], { testo: string; tono: Tono }> = {
  preparato: { testo: 'Non completato', tono: 'attenzione' },
  pronto: { testo: 'Pronto, messaggio non inviato', tono: 'attenzione' },
  inviato: { testo: 'Inviato', tono: 'ok' },
  consegnato_manualmente: { testo: 'Inviato dallo studio', tono: 'ok' },
  errore: { testo: 'Errore di invio', tono: 'errore' },
  revocato: { testo: 'Link revocato', tono: 'neutro' },
};

/** Registro degli invii di documenti ai genitori: chi, quando, se sono stati aperti; revoca del link. */
export default function RegistroInvii() {
  const elenco = useDati(async () => {
    const ana = supabase.schema('anagrafica');
    const invii = await q<Invio[]>(ana.from('invii_documenti')
      .select('id, paziente_id, allergo_paziente_id, canale, destinatario, destinatario_nome, descrizione, documenti, scade_il, stato, errore, ritiri, ultimo_ritiro_il, tentativi, creato_il')
      .order('creato_il', { ascending: false }).limit(200));
    const ped = [...new Set(invii.map((i) => i.paziente_id).filter(Boolean))] as string[];
    const all = [...new Set(invii.map((i) => i.allergo_paziente_id).filter(Boolean))] as string[];
    const [p1, p2] = await Promise.all([
      ped.length ? q<{ id: string; nome: string; cognome: string }[]>(ana.from('pazienti').select('id, nome, cognome').in('id', ped)) : [],
      all.length ? q<{ id: string; nome: string; cognome: string }[]>(ana.from('allergo_pazienti').select('id, nome, cognome').in('id', all)) : [],
    ]);
    const nomi = new Map([...p1, ...p2].map((x) => [x.id, `${x.cognome} ${x.nome}`]));
    return { invii, nomi };
  }, []);
  const [errore, setErrore] = useState<string | null>(null);

  async function revoca(i: Invio) {
    if (!window.confirm('Disattivare il link? Il genitore non potrà più aprire questi documenti.')) return;
    setErrore(null);
    const { error } = await supabase.schema('api').rpc('revoca_invio', { p_id: i.id });
    if (error) setErrore(error.message); else elenco.ricarica();
  }

  if (elenco.errore) return <Errore messaggio={elenco.errore} />;
  if (elenco.caricamento || !elenco.dati) return <Caricamento />;
  const { invii, nomi } = elenco.dati;
  if (invii.length === 0) return <Vuoto testo="Nessun documento inviato." />;
  const adesso = new Date();
  return (
    <div className="space-y-2 text-sm">
      {errore && <Errore messaggio={errore} />}
      <ul className="divide-y divide-slate-100">
        {invii.map((i) => {
          const scaduto = new Date(i.scade_il) < adesso;
          const attivo = !scaduto && i.stato !== 'revocato';
          return (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {i.paziente_id
                    ? <a href={link('assistiti', i.paziente_id)} className="hover:underline">{nomi.get(i.paziente_id) ?? '—'}</a>
                    : <a href={link('allergologia', i.allergo_paziente_id!)} className="hover:underline">{nomi.get(i.allergo_paziente_id!) ?? '—'} <span className="text-xs text-slate-500">(Allergologia)</span></a>}
                  <span className="ml-2 font-normal text-slate-500">{i.descrizione}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {fmtDataOra(i.creato_il)} · {i.canale === 'email' ? 'Email' : 'WhatsApp'} a {i.destinatario_nome ? `${i.destinatario_nome}, ` : ''}{i.destinatario}
                  {' · '}{i.documenti.map((d) => d.nome).join(', ') || 'nessun file'}
                </p>
                <p className="text-xs text-slate-500">
                  {i.ritiri ? `Aperto ${i.ritiri} ${i.ritiri === 1 ? 'volta' : 'volte'}, l'ultima il ${fmtDataOra(i.ultimo_ritiro_il!)}` : 'Non ancora aperto'}
                  {i.tentativi ? ` · ${i.tentativi} tentativi con data errata` : ''}
                  {' · '}{scaduto ? 'link scaduto' : `link valido fino al ${fmtData(i.scade_il)}`}
                  {i.errore ? ` · ${i.errore}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tono={STATO[i.stato].tono}>{STATO[i.stato].testo}</Badge>
                {attivo && <Bottone variante="pericolo" onClick={() => void revoca(i)}>Revoca link</Bottone>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">I PDF restano nello spazio privato dello studio; dopo la scadenza il link non funziona più.</p>
    </div>
  );
}
