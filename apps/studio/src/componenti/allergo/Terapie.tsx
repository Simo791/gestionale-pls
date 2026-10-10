import { useState } from 'react';
import { Badge } from '../ui';
import { CAMPI_AIT, CAMPI_TERAPIA, CLASSI_TERAPIA, FASI_AIT, VIE_AIT } from './definizioni';
import Registro, { giorno, oggi, s, useRighe, type Campo } from './Registro';

export default function Terapie({ pseudo, onCambio }: { pseudo: string; onCambio?: () => void }) {
  const [versione, setVersione] = useState(0);
  const ait = useRighe('allergo_immunoterapie', pseudo, 'inizio', versione);
  const oggiIso = oggi();

  const campiDose: Campo[] = [
    { nome: 'immunoterapia_id', etichetta: 'Immunoterapia', tipo: 'select', obbligatorio: true,
      opzioni: (ait.dati ?? []).map((a) => [a.id, `${s(a, 'allergene')} · ${s(a, 'via')}`] as const) },
    { nome: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
    { nome: 'dose', etichetta: 'Dose', tipo: 'testo', obbligatorio: true, segnaposto: 'Es. 0,2 ml 100 SQ-U/ml, 1 g di proteine' },
    { nome: 'lotto', etichetta: 'Lotto', tipo: 'testo' },
    { nome: 'reazione', etichetta: 'Reazione', tipo: 'select', obbligatorio: true,
      opzioni: [['nessuna', 'Nessuna'], ['locale', 'Locale'], ['sistemica', 'Sistemica (registrare anche tra le reazioni)']] },
    { nome: 'note', etichetta: 'Note', tipo: 'area' },
  ];
  const nomeAit = new Map((ait.dati ?? []).map((a) => [a.id, `${s(a, 'allergene')} (${s(a, 'via')})`]));

  return (
    <div className="space-y-6">
      <Registro
        titolo="Terapie" sottotitolo="In corso e passate" tabella="allergo_terapie" pseudo={pseudo} campi={CAMPI_TERAPIA} ordine="dal"
        onCambio={onCambio} iniziali={() => ({ dal: oggi() })}
        riassunto={(r) => {
          const inCorso = !r.al || String(r.al) >= oggiIso;
          return (
            <div>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{s(r, 'farmaco')}</span>
                <Badge tono={inCorso ? 'ok' : 'neutro'}>{inCorso ? 'In corso' : 'Sospesa'}</Badge>
              </p>
              <p className="text-xs text-slate-500">{CLASSI_TERAPIA[s(r, 'classe')]} · {s(r, 'posologia') || 'posologia non indicata'} · dal {giorno(r.dal)}{r.al ? ` al ${giorno(r.al)}` : ''}</p>
            </div>
          );
        }}
      />
      <Registro
        titolo="Immunoterapia allergene-specifica" sottotitolo="SCIT, SLIT e immunoterapia orale per alimenti" tabella="allergo_immunoterapie" pseudo={pseudo}
        campi={CAMPI_AIT} ordine="inizio" onCambio={() => { setVersione((v) => v + 1); onCambio?.(); }} iniziali={() => ({ inizio: oggi(), fase: 'induzione' })}
        riassunto={(r) => (
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{s(r, 'allergene')}</span>
              <span className="text-slate-500">{VIE_AIT[s(r, 'via')]}{r.prodotto ? ` · ${s(r, 'prodotto')}` : ''}</span>
              <Badge tono={r.fase === 'sospesa' ? 'attenzione' : r.fase === 'conclusa' ? 'neutro' : 'ok'}>{FASI_AIT[s(r, 'fase')]}</Badge>
            </p>
            <p className="text-xs text-slate-500">Dal {giorno(r.inizio)}{r.fine_prevista ? ` · fine prevista ${giorno(r.fine_prevista)}` : ''}</p>
          </div>
        )}
      />
      {(ait.dati ?? []).length > 0 && (
        <Registro
          titolo="Somministrazioni dell'immunoterapia" tabella="allergo_ait_dosi" pseudo={pseudo} campi={campiDose} aggiorna={versione}
          onCambio={onCambio} etichettaNuovo="Registra dose"
          iniziali={() => ({ data: oggi(), reazione: 'nessuna', immunoterapia_id: ait.dati?.[0]?.id ?? '' })}
          riassunto={(r) => (
            <p className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-slate-500">{giorno(r.data)}</span>
              <span className="font-medium text-slate-900">{nomeAit.get(String(r.immunoterapia_id)) ?? '—'}</span>
              <span>{s(r, 'dose')}</span>
              {r.lotto ? <span className="text-xs text-slate-500">lotto {s(r, 'lotto')}</span> : null}
              <Badge tono={r.reazione === 'nessuna' ? 'ok' : r.reazione === 'locale' ? 'attenzione' : 'errore'}>
                {r.reazione === 'nessuna' ? 'Nessuna reazione' : `Reazione ${s(r, 'reazione')}`}
              </Badge>
            </p>
          )}
        />
      )}
    </div>
  );
}
