import { avvisiAutoiniettore, criteriAnafilassi, doseAutoiniettore, type RigaAllergo } from '@pls/shared';
import { Badge } from '../ui';
import { CAMPI_AUTOINIETTORE, CAMPI_REAZIONE, CAMPI_TPO, CAUSE_REAZIONE, ESITI_TPO } from './definizioni';
import Registro, { giorno, oggi, s, type Valori } from './Registro';

const APPARATI: [string, string][] = [['cute_mucose', 'cute'], ['respiratorio', 'respiratorio'], ['cardiovascolare', 'cardiovascolare'], ['gastrointestinale', 'gastrointestinale']];

export function SuggerimentoCriteri({ v }: { v: Valori }) {
  const r = criteriAnafilassi(
    { cute_mucose: v.cute_mucose === true, respiratorio: v.respiratorio === true, cardiovascolare: v.cardiovascolare === true, gastrointestinale: v.gastrointestinale === true },
    v.causa_categoria !== '' && v.causa_categoria !== 'idiopatica',
  );
  return r.compatibile
    ? <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-900">Quadro compatibile con i criteri clinici di anafilassi (WAO 2020, EAACI 2021): {r.criterio}. La conferma spetta al medico.</p>
    : <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">Con i sintomi e la causa indicati i criteri di anafilassi (WAO 2020, EAACI 2021) non risultano soddisfatti: la valutazione resta del medico.</p>;
}

export default function Anafilassi({ pseudo, pesoKg, onCambio }: { pseudo: string; pesoKg: number | null; onCambio?: () => void }) {
  const dose = pesoKg != null ? doseAutoiniettore(pesoKg) : null;
  return (
    <div className="space-y-6">
      <Registro
        titolo="Reazioni e anafilassi" sottotitolo="Episodi con causa, apparati coinvolti e trattamento" tabella="allergo_reazioni" pseudo={pseudo}
        campi={CAMPI_REAZIONE} onCambio={onCambio} iniziali={() => ({ data: oggi() })} etichettaNuovo="Nuovo episodio"
        suggerimento={(v) => <SuggerimentoCriteri v={v} />}
        riassunto={(r) => (
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-slate-500">{giorno(r.data)}</span>
              <span className="font-medium text-slate-900">{CAUSE_REAZIONE[s(r, 'causa_categoria')]}{r.causa ? `: ${s(r, 'causa')}` : ''}</span>
              {r.anafilassi ? <Badge tono="errore">Anafilassi</Badge> : null}
              {r.adrenalina ? <Badge tono="attenzione">Adrenalina{r.dosi_adrenalina ? ` × ${s(r, 'dosi_adrenalina')}` : ''}</Badge> : null}
              {r.pronto_soccorso ? <Badge>Pronto soccorso</Badge> : null}
            </p>
            <p className="text-xs text-slate-500">Apparati: {APPARATI.filter(([k]) => r[k]).map(([, t]) => t).join(', ') || '—'}{r.cofattori ? ` · cofattori: ${s(r, 'cofattori')}` : ''}</p>
            {r.descrizione ? <p className="text-slate-600">{s(r, 'descrizione')}</p> : null}
          </div>
        )}
      />

      <Registro
        titolo="Autoiniettori di adrenalina" tabella="allergo_autoiniettori" pseudo={pseudo} campi={CAMPI_AUTOINIETTORE} ordine="data_prescrizione"
        sottotitolo={dose ? `Peso attuale ${pesoKg} kg → ${dose.nota}` : 'Registra il peso in una visita per il suggerimento della dose (EAACI 2021).'}
        onCambio={onCambio} etichettaNuovo="Nuova prescrizione"
        iniziali={() => ({ data_prescrizione: oggi(), numero: '2', attivo: true, dose_mg: dose?.dose ? String(dose.dose) : '', peso_kg: pesoKg != null ? String(pesoKg) : '' })}
        riassunto={(r: RigaAllergo) => {
          const avvisi = avvisiAutoiniettore({ dose_mg: Number(r.dose_mg), numero: Number(r.numero), scadenza: (r.scadenza as string | null) ?? null, attivo: r.attivo === true }, pesoKg, oggi());
          return (
            <div>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{s(r, 'dispositivo')} {String(r.dose_mg).replace('.', ',')} mg × {s(r, 'numero')}</span>
                <span className="text-slate-500">prescritto il {giorno(r.data_prescrizione)}{r.scadenza ? ` · scade il ${giorno(r.scadenza)}` : ''}</span>
                {!r.attivo && <Badge>Non più in uso</Badge>}
              </p>
              {avvisi.map((a) => <p key={a.testo} className={`text-sm ${a.tono === 'errore' ? 'text-rose-700' : 'text-amber-700'}`}>{a.testo}</p>)}
              {r.note ? <p className="text-xs text-slate-500">{s(r, 'note')}</p> : null}
            </div>
          );
        }}
      />

      <Registro
        titolo="Test di provocazione orale (TPO)" sottotitolo="Gold standard per la diagnosi di allergia alimentare e per la verifica della tolleranza"
        tabella="allergo_tpo" pseudo={pseudo} campi={CAMPI_TPO} onCambio={onCambio} iniziali={() => ({ data: oggi() })} etichettaNuovo="Nuovo TPO"
        riassunto={(r) => (
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-slate-500">{giorno(r.data)}</span>
              <span className="font-medium text-slate-900">{s(r, 'alimento')}{r.forma ? ` (${s(r, 'forma')})` : ''}</span>
              <Badge tono={r.esito === 'negativo' ? 'ok' : r.esito === 'positivo' ? 'errore' : 'attenzione'}>{ESITI_TPO[s(r, 'esito')]}</Badge>
              {r.adrenalina ? <Badge tono="attenzione">Adrenalina</Badge> : null}
            </p>
            {r.dose_scatenante ? <p className="text-xs text-slate-500">Dose scatenante: {s(r, 'dose_scatenante')}</p> : null}
            {r.indicazioni ? <p className="text-slate-600">{s(r, 'indicazioni')}</p> : null}
          </div>
        )}
      />
    </div>
  );
}
