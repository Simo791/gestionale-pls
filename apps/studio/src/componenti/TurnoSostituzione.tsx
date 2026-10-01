import type { ClaimsApp, MembroStudio, Pediatra, Sostituzione } from '@pls/shared';
import { q, useDati } from '../lib/dati';
import { fmtGiornoIso, oggiIso } from '../lib/formato';
import { supabase } from '../lib/supabase';

/**
 * Chi è di turno: al sostituto mostra titolare, periodo e consegne; al titolare
 * ricorda che durante la sostituzione notifiche e accesso clinico passano al sostituto.
 */
export default function TurnoSostituzione({ claims }: { claims: ClaimsApp }) {
  const oggi = oggiIso();
  const turno = useDati(async () => {
    const ana = supabase.schema('anagrafica');
    const [sost, pediatri, membri] = await Promise.all([
      q<Sostituzione[]>(ana.from('sostituzioni').select('*').is('revocata_il', null).lte('dal', oggi).gte('al', oggi)),
      q<Pediatra[]>(ana.from('pediatri').select('*')),
      q<MembroStudio[]>(ana.from('membri_studio').select('*')),
    ]);
    return { sost, pediatri, membri };
  }, [oggi]);
  if (!turno.dati) return null;
  const { sost, pediatri, membri } = turno.dati;
  const mia = sost.filter((s) => s.sostituto_id === claims.sub || s.titolare_id === claims.sub);
  if (mia.length === 0) return null;
  return (
    <>
      {mia.map((s) => {
        const titolare = pediatri.find((p) => p.id === s.titolare_id);
        const sostituto = membri.find((m) => m.utente_id === s.sostituto_id);
        const nomeTitolare = titolare ? `${titolare.titolo} ${titolare.nome} ${titolare.cognome}` : 'il titolare';
        const nomeSostituto = sostituto ? `${sostituto.nome ?? ''} ${sostituto.cognome ?? ''}`.trim() || sostituto.email : 'il sostituto';
        return s.sostituto_id === claims.sub ? (
          <section key={s.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Sei in sostituzione di {nomeTitolare} fino al {fmtGiornoIso(s.al)}</p>
            <p>Vedi le cartelle dei suoi assistiti e ricevi le sue notifiche. L'accesso si chiude automaticamente a fine periodo.</p>
            {s.consegne && <p className="mt-2 whitespace-pre-line"><span className="font-medium">Consegne:</span> {s.consegne}</p>}
          </section>
        ) : (
          <section key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Sostituzione in corso: {nomeSostituto}, fino al {fmtGiornoIso(s.al)}</p>
            <p>Le notifiche dei tuoi assistiti arrivano al sostituto. Puoi revocarla da Account.</p>
          </section>
        );
      })}
    </>
  );
}
