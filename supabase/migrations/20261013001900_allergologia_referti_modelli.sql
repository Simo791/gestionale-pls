-- =============================================================================
-- 1900 · Allergologia: referto della visita come le lettere dell'ambulatorio,
--        richiamo della visita precedente, modelli per tipo di bambino allergico,
--        impostazioni del referto.
-- =============================================================================

-- Anagrafica: luogo di nascita e residenza compaiono nell'intestazione del referto.
alter table anagrafica.allergo_pazienti
  add column luogo_nascita text,
  add column residenza     text;
grant select (luogo_nascita, residenza), update (luogo_nascita, residenza) on anagrafica.allergo_pazienti to authenticated;

-- Nuova firma con luogo di nascita e residenza (la vecchia si elimina: due versioni
-- sovrapposte renderebbero ambigua la chiamata RPC).
drop function api.allergo_registra_paziente(text, text, text, date, char, text, text, text, text, text);

create or replace function api.allergo_registra_paziente(
  p_nome text, p_cognome text, p_codice_fiscale text, p_data_nascita date, p_sesso char(1),
  p_genitore_nome text default null, p_genitore_telefono text default null, p_genitore_email text default null,
  p_pediatra_curante text default null, p_inviato_da text default null,
  p_luogo_nascita text default null, p_residenza text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cf text := upper(trim(p_codice_fiscale));
  v_id uuid;
begin
  if not sicurezza.allergologia_ok() then
    raise exception 'Accesso al modulo Allergologia non consentito';
  end if;
  if v_cf !~ '^[A-Z0-9]{16}$' then
    raise exception 'Codice fiscale non valido';
  end if;
  if exists (select 1 from anagrafica.allergo_pazienti
             where studio_id = sicurezza.studio_id() and codice_fiscale_impronta = anagrafica.impronta_cf(v_cf)) then
    raise exception 'Paziente già presente in Allergologia' using errcode = '23505';
  end if;
  insert into anagrafica.allergo_pazienti (studio_id, nome, cognome, codice_fiscale_cifrato, codice_fiscale_impronta,
    data_nascita, sesso, genitore_nome, genitore_telefono, genitore_email, pediatra_curante, inviato_da, luogo_nascita, residenza)
  values (sicurezza.studio_id(), trim(p_nome), trim(p_cognome), anagrafica.cifra_cf(v_cf), anagrafica.impronta_cf(v_cf),
    p_data_nascita, p_sesso, nullif(trim(p_genitore_nome), ''), nullif(trim(p_genitore_telefono), ''),
    nullif(lower(trim(p_genitore_email)), ''), nullif(trim(p_pediatra_curante), ''), nullif(trim(p_inviato_da), ''),
    nullif(trim(p_luogo_nascita), ''), nullif(trim(p_residenza), ''))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function api.allergo_registra_paziente(text, text, text, date, char, text, text, text, text, text, text, text) to authenticated;

-- Cartella: le voci fisse dell'anamnesi, come nelle lettere.
alter table clinica.allergo_cartelle
  add column anamnesi_familiare  text,
  add column anamnesi_fisiologica text,   -- gravidanza, parto, PN, allattamento, divezzamento
  add column anamnesi_remota     text,
  add column abitazione          text,
  add column fumo_dettaglio      text,    -- es. "SI (padre e madre)"
  add column farmaci             text,    -- reazioni a farmaci
  add column sport               text;

-- Visita: struttura del referto e collegamento alla visita precedente.
alter table clinica.allergo_visite
  add column decorso              text,     -- controllo: "Dall'ultimo controllo…"
  add column test_eseguiti        text,     -- SPT, IgE, spirometria del giorno (testo del referto)
  add column diagnosi_testo       text,
  add column visita_precedente_id uuid references clinica.allergo_visite(id),
  add column modelli              text[] not null default '{}',
  add column anamnesi_snapshot    jsonb,    -- anamnesi della cartella al momento della visita
  add column aggiornata_il        timestamptz not null default now();

-- La visita precedente deve essere dello stesso paziente.
create or replace function clinica.allergo_visita_precedente_coerente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visita_precedente_id is not null and not exists (
       select 1 from clinica.allergo_visite v where v.id = new.visita_precedente_id and v.pseudo_id = new.pseudo_id and v.id <> new.id) then
    raise exception 'La visita precedente non appartiene a questo paziente';
  end if;
  return new;
end;
$$;
create trigger visita_precedente before insert or update on clinica.allergo_visite
  for each row execute function clinica.allergo_visita_precedente_coerente();

-- -----------------------------------------------------------------------------
-- Impostazioni del referto (per medico)
-- -----------------------------------------------------------------------------
create table anagrafica.allergo_impostazioni (
  utente_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  studio_id      uuid not null references anagrafica.studi(id),
  intestazione   text not null default 'Ambulatorio di Allergologia',
  sottotitolo    text,          -- es. U.O. di Pediatria, ospedale
  luogo          text,          -- es. Catanzaro (compare prima della data)
  firma          text,          -- es. Dott.ssa Maria Rossi
  qualifica      text default 'Allergologo pediatra',
  email_contatti text,
  chiusura       text default 'Per eventuali necessità e/o informazioni si consiglia di contattare la sottoscritta all''indirizzo email: {{email}}, specificando nell''oggetto «all''attenzione di {{firma}}».',
  aggiornato_il  timestamptz not null default now()
);
alter table anagrafica.allergo_impostazioni enable row level security;
grant select, insert, update on anagrafica.allergo_impostazioni to authenticated;
create policy proprie_impostazioni on anagrafica.allergo_impostazioni for all to authenticated
  using (utente_id = auth.uid() and sicurezza.allergologia_ok())
  with check (utente_id = auth.uid() and studio_id = sicurezza.studio_id() and sicurezza.allergologia_ok());

-- -----------------------------------------------------------------------------
-- Modelli di testo per tipo di bambino allergico.
-- studio_id null = modello predefinito (sola lettura); i modelli dello studio si
-- creano da zero o duplicando un predefinito.
-- -----------------------------------------------------------------------------
create table anagrafica.allergo_modelli (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid references anagrafica.studi(id),
  codice        text not null,
  nome          text not null,
  profilo       text not null check (profilo in ('asma', 'rinite', 'dermatite', 'alimenti', 'anafilassi', 'pollini_alimenti',
                                                 'immunoterapia', 'orticaria', 'generale')),
  sezione       text not null check (sezione in ('piano', 'conclusioni', 'esame_obiettivo', 'anamnesi', 'decorso')),
  testo         text not null,
  ordine        smallint not null default 100,
  attivo        boolean not null default true,
  creato_da     uuid default auth.uid(),
  aggiornato_il timestamptz not null default now(),
  unique nulls not distinct (studio_id, codice)
);
alter table anagrafica.allergo_modelli enable row level security;
grant select, insert, update on anagrafica.allergo_modelli to authenticated;
create policy legge_modelli on anagrafica.allergo_modelli for select to authenticated
  using (sicurezza.allergologia_ok() and (studio_id is null or studio_id = sicurezza.studio_id()));
create policy scrive_modelli on anagrafica.allergo_modelli for insert to authenticated
  with check (sicurezza.allergologia_ok() and studio_id = sicurezza.studio_id());
create policy modifica_modelli on anagrafica.allergo_modelli for update to authenticated
  using (sicurezza.allergologia_ok() and studio_id = sicurezza.studio_id())
  with check (studio_id = sicurezza.studio_id());
create trigger audit after insert or update or delete on anagrafica.allergo_modelli
  for each row execute function audit.traccia_modifica();

-- Modelli predefiniti ricavati dai referti dell'ambulatorio. Segnaposto: {{nome}},
-- {{peso}}, {{prossimo_controllo}}. Sono testi di partenza: posologie e farmaci vanno
-- sempre verificati e adattati a età e peso del bambino.
insert into anagrafica.allergo_modelli (studio_id, codice, nome, profilo, sezione, ordine, testo) values
(null, 'diario', 'Diario dei sintomi', 'generale', 'piano', 10,
'- Diario dei sintomi (appuntare il tipo di sintomi, la terapia utilizzata ecc.)'),
(null, 'fumo', 'Stop al fumo passivo', 'generale', 'piano', 11,
'- STOP AL FUMO PASSIVO, anche di terza mano (fumo su capelli, respiro e indumenti di chi fuma).'),
(null, 'profilassi_acari', 'Profilassi ambientale: acaro della polvere', 'generale', 'piano', 12,
'- Profilassi ambientale per acaro della polvere: coprimaterasso e copricuscino antiacaro, lavaggio della biancheria a 60 °C, ridurre tappeti, tende pesanti e peluche in camera, arieggiare e mantenere l''ambiente asciutto.'),
(null, 'profilassi_pollini', 'Profilassi ambientale: pollini', 'generale', 'piano', 13,
'- Profilassi ambientale per pollini: nei periodi di pollinazione tenere chiuse le finestre nelle ore centrali e ventose, lavare viso e capelli al rientro, non stendere la biancheria all''aperto.'),
(null, 'controllo', 'Visita di controllo', 'generale', 'piano', 90,
'- Visita di controllo {{prossimo_controllo}} salvo complicazioni o fatti nuovi.'),
(null, 'eo_normale', 'Esame obiettivo nella norma', 'generale', 'esame_obiettivo', 10,
'Buone condizioni generali. Cute rosea e ben idratata. Faringe deterso. Attività cardiaca valida e ritmica, toni netti e validi, pause apparentemente libere. Al torace buona penetrazione d''aria su tutto l''ambito polmonare, non rumori patologici aggiunti. Peso: {{peso}} kg'),
(null, 'decorso_benessere', 'Controllo: benessere dall''ultima visita', 'generale', 'decorso', 10,
'Dall''ultimo controllo benessere clinico. Buona aderenza alla terapia prescritta.'),

(null, 'rinite', 'Rinocongiuntivite allergica: terapia a gradini', 'rinite', 'piano', 20,
'- In caso di rinite con rinorrea acquosa, prurito nasale, starnuti a salve, prurito oculare, lacrimazione:
  Pr/ Bilastina 10 mg cpr orodispersibili (Robilas): 1 cpr orodispersibile al giorno, a stomaco vuoto, per almeno 7-10 giorni o comunque fino a quando necessita.
- Se nonostante l''antistaminico presenta ostruzione nasale aggiungere:
  Pr/ Mometasone furoato spray nasale (Momil): 1 erogazione per narice una volta al giorno (la sera) per 10-15 giorni, poi sospende per 3-4 giorni e riprende se necessario. Sospendere in caso di epistassi.
  Nei restanti giorni lavaggi nasali con soluzione fisiologica.
- Se nonostante l''antistaminico presenta congiuntivite:
  Pr/ Ketoftil collirio: 1 goccia per occhio per 3 volte/die per 4-5 giorni, a cicli ripetibili dopo 10 giorni di sospensione.'),
(null, 'orl', 'Visita ORL', 'rinite', 'piano', 25,
'- Visita ORL + fibrolaringoscopia (roncopatia / respirazione orale).'),

(null, 'asma_piano_azione', 'Asma (< 12 anni): piano d''azione con salbutamolo', 'asma', 'piano', 30,
'In caso di: tosse secca persistente, fischio, sibilo, difficoltà respiratoria, affanno dopo sforzo o a riposo somministrare:
Pr/ Salbutamolo spray 100 mcg (Ventolin):
- 4 puff con distanziatore, ripetibili fino a 3 volte in un''ora (ogni 20 minuti)
✅ Se il bambino MIGLIORA proseguire:
- Salbutamolo 3 puff 3–4 volte al giorno per 5–7 giorni
+
- Fluticasone propionato spray 50 mcg (Fluspiral): 1 puff al mattino e 1 puff alla sera (prima di lavare i denti) per almeno 15 giorni
➡ Durante la terapia il bambino DEVE essere rivalutato dal pediatra curante, per decidere come e quando ridurre i farmaci.
❌ Se il bambino NON MIGLIORA:
- Somministrare Betametasone 1 mg cpr (Bentelan): ___ compresse per bocca (dose da calcolare sul peso: {{peso}} kg)
- A seguire rapida valutazione medica.'),
(null, 'asma_fondo_ics', 'Asma (< 12 anni): terapia di fondo con ICS', 'asma', 'piano', 31,
'Dopo eventuale episodio di broncospasmo avviare terapia di fondo con:
- Fluticasone propionato spray 50 mcg (Fluspiral): 1 puff al mattino e 1 puff alla sera (prima di lavare i denti) con distanziatore, per almeno 3 mesi o comunque fino a nuova indicazione.
- Si mostra al bambino e ai genitori il corretto utilizzo del distanziatore.'),
(null, 'asma_mart', 'Asma (≥ 12 anni): budesonide/formoterolo (MART)', 'asma', 'piano', 32,
'Avvia terapia di fondo con:
Pr/ Budesonide/formoterolo 160 mcg/4,5 mcg/inalazione (Gibiter Easyhaler)
S/ 1 inalazione al mattino e 1 inalazione la sera, poi sciacquare la bocca.
Si mostra al ragazzo e ai genitori il corretto utilizzo del device.
Se broncospasmo con difficoltà respiratoria può assumere 1 ulteriore inalazione al bisogno in risposta ai sintomi. Se i sintomi persistono dopo alcuni minuti, deve essere assunta un''ulteriore inalazione. Non devono essere assunte più di 6 inalazioni in ogni singola occasione (massimo 12 inalazioni al giorno).
Se non risponde somministrare Betametasone 1 mg cpr (Bentelan): ___ compresse insieme (dose sul peso: {{peso}} kg) e recarsi a visita medica rapidamente.'),
(null, 'asma_vaccino', 'Asma: vaccinazione antinfluenzale ed esenzione', 'asma', 'piano', 35,
'- Si consiglia vaccinazione antinfluenzale.
- Si rilascia esenzione per asma.'),
(null, 'asma_controllo_spiro', 'Asma: controllo con spirometria', 'asma', 'piano', 89,
'- Controllo clinico + spirometria {{prossimo_controllo}} salvo complicazioni o fatti nuovi.'),
(null, 'asma_conclusioni', 'Asma: conclusioni tipo', 'asma', 'conclusioni', 30,
'Quadro compatibile con asma bronchiale (da sforzo / ad innesco infettivo / allergico). Spirometria: ___. Test di broncoreversibilità: ___.'),

(null, 'dermatite', 'Dermatite atopica: educazione e cura della pelle', 'dermatite', 'piano', 40,
'La dermatite atopica (DA) è una malattia ad eziopatogenesi multifattoriale che si contraddistingue per lesioni eczematose intensamente pruriginose ad evoluzione cronico-ricorrente, secchezza ed iperreattività cutanea. In ogni fase il sintomo principale è il prurito che, soprattutto nel bambino piccolo, si accompagna a irrequietezza e insonnia. Il decorso alterna fasi di miglioramento (di solito in estate) a fasi di peggioramento (autunno e inverno), in cui possono avere un ruolo fattori infettivi, ambientali, iatrogeni e talvolta dietetici.
In generale:
- Preferire la doccia al bagno, con acqua tiepida (32-34 °C) per massimo 5 minuti; asciugare bene tamponando. Tenere le unghie corte e pulite.
- Vestiti in cotone, non colorati, lavati con sapone di Marsiglia senza ammorbidente. Evitare lana e fibre irritanti, indumenti stretti o troppo caldi.
- In estate applicare sempre crema solare protettiva 50+ prima dell''esposizione; non esporre al sole le lesioni in fase acuta.
- Detergente oleoso viso-corpo (es. Ceramol olio detergente) per la detersione quotidiana.
- Crema emolliente (es. Ceramol crema base) per l''idratazione cutanea, almeno 2 volte al giorno, tutti i giorni anche in assenza di lesioni.
- Se comparsa di lesioni accese applicare nelle aree colpite, in sostituzione della crema idratante, anche sul viso: Ceramol beta complex crema oppure Physiogel A.I. crema, 2 volte al giorno per almeno 1 settimana.
In caso di mancato miglioramento delle lesioni accese, applicare nelle aree colpite in sostituzione della precedente (evitando il viso e l''area dei genitali):
Pr/ Idrocortisone butirrato crema (Locoidon): 1 velo sottile sull''area interessata, mattina e sera per 4 giorni, poi la sera per 3 giorni.
- Sulla zona perioculare e peripalpebrale può applicare: Topialyse palpébral (SVR).
- Sulle croste e zone erose o fissurate: Rubrosin soluzione con cotton fioc 1-2 volte al giorno per 3-4 giorni, attendere che si asciughi e successivamente applicare un sottile velo di Fucicort crema.
Per ridurre il prurito:
- Dimetindene gocce (Fenistil): ___ gocce per 3 volte al giorno per 5-7 giorni (dose secondo età e peso).'),
(null, 'dermatite_controllo', 'Dermatite atopica: controllo tra 2 mesi', 'dermatite', 'piano', 88,
'- Visita di controllo in data da programmare tra 2 mesi salvo fatti nuovi.'),
(null, 'dermatite_eo', 'Dermatite atopica: esame obiettivo', 'dermatite', 'esame_obiettivo', 40,
'Buone condizioni generali. Cute xerotica diffusa. Lesioni eczematose ___ (sedi: ___), con / senza essudazione e lesioni da grattamento. Obiettività cardio-toracica nella norma. Peso: {{peso}} kg. SCORAD: ___'),

(null, 'alimenti_anafilassi', 'Allergia alimentare con rischio di anafilassi', 'anafilassi', 'piano', 50,
'Per quanto riguarda l''allergia alimentare:
- Evitamento rigoroso di ___ in qualsiasi forma e preparazione, comprese tracce, derivati ed estratti.
- Leggere sempre l''etichetta: gli allergeni sono evidenziati nell''elenco degli ingredienti (Reg. UE 1169/2011).
- Attenzione alla contaminazione crociata: utensili, superfici e oli di cottura condivisi.
- Può continuare ad assumere gli altri alimenti tollerati in precedenza.
- Familiari, scuola, ristorazione e ambienti sportivi devono essere informati dettagliatamente del rischio e delle modalità di prevenzione e terapia da eseguire.
- Si rilascia piano terapeutico per adrenalina autoiniettabile e piano d''azione, illustrati ai genitori e al bambino.
- Il paziente deve portare sempre con sé: autoiniettore di adrenalina (x2), antistaminico, piano d''azione stampato.
Al prossimo controllo si valuterà la necessità di ulteriori test di conferma (IgE specifiche, prick by prick, eventuale TPO in ambiente protetto per alimenti dubbi).'),
(null, 'crostacei_molluschi', 'Allergia a crostacei e molluschi (anche vapori di cottura)', 'anafilassi', 'piano', 51,
'- Evitamento rigoroso di crostacei e molluschi, inclusi i vapori di cottura, in qualsiasi forma e preparazione:
  - Tutti i crostacei: gamberi, scampi, aragoste, granchi, astici, canocchie ecc.
  - Molluschi cefalopodi: calamaro, totano.
  - Altri molluschi potenzialmente cross-reattivi: mitili, ostriche, capesante, vongole, cannolicchi ecc.
- Evitamento assoluto di alimenti contenenti estratti o derivati (brodi, fumetti di pesce, salse o insaporitori a base di crostacei), di fritture miste con possibile contaminazione e di ambienti in cui questi alimenti vengono cucinati.
- La tropomiosina dei crostacei è simile a quella degli acari della polvere: possibile reattività crociata.'),
(null, 'anafilassi_conclusioni', 'Anafilassi: conclusioni tipo', 'anafilassi', 'conclusioni', 50,
'Il paziente presenta una storia compatibile con anafilassi IgE-mediata da ___, con manifestazioni ___ dopo esposizione ___. La positività agli SPT per ___ conferma la sensibilizzazione.'),

(null, 'alimenti_dieta', 'Allergia alimentare senza anafilassi: dieta', 'alimenti', 'piano', 55,
'- Dieta priva di ___ e derivati, con lettura attenta delle etichette.
- In caso di assunzione accidentale con orticaria, prurito o gonfiore delle labbra: antistaminico ___ (dose secondo età e peso) e osservazione. Se compaiono difficoltà respiratoria, vomito ripetuto o malessere: chiamare il 112.
- Non escludere altri alimenti senza indicazione medica: le diete inutilmente restrittive possono compromettere la crescita.
- Rivalutazione allergologica per l''eventuale reintroduzione (TPO in ambiente protetto).'),

(null, 'ltp_pr10_profilina', 'Sensibilizzazione a LTP, PR-10, profilline (sindrome orale allergica)', 'pollini_alimenti', 'piano', 60,
'Si ribadiscono le indicazioni relative alla gestione della sensibilizzazione ai panallergeni:
- PR-10 (omologhe di Bet v 1, es. pesca, mela, ciliegia, nocciola, sedano, soia): proteine sensibili al calore e alla digestione. I sintomi sono di solito limitati al cavo orale (prurito, bruciore); in genere la frutta cotta o industriale è tollerata. Attenzione a soia e sedano, raramente causa di reazioni più importanti.
- LTP (proteine di trasporto dei lipidi, es. pesca, mela, albicocca, ciliegia, frutta a guscio, arachide, legumi, pomodoro, cereali): proteine stabili al calore e alla digestione, concentrate nella buccia. Possono dare reazioni sistemiche. Sbucciare la frutta; evitare l''assunzione insieme a cofattori (antinfiammatori come ibuprofene, esercizio fisico subito dopo il pasto, febbre).
- Profilline (es. melone, anguria, banana, pomodoro, agrumi, kiwi): proteine sensibili al calore; danno soprattutto sintomi orali.
- Alimenti tollerati: continuare ad assumerli. Alimenti che hanno dato sintomi: ___'),

(null, 'ait', 'Immunoterapia allergene-specifica: controllo', 'immunoterapia', 'piano', 70,
'- Prosegue immunoterapia allergene-specifica con ___ (___ ciclo), assunta regolarmente.
- Effetti collaterali locali (prurito o lieve gonfiore al cavo orale) attesi nelle prime settimane; sospendere e contattare l''ambulatorio in caso di reazioni sistemiche, asma non controllato, febbre o lesioni del cavo orale.
- Durata complessiva consigliata: almeno 3 anni.
- Inviare una mail alla sottoscritta a ___ per il rinnovo del piano terapeutico; verrà poi inviata l''impegnativa per la visita di controllo.'),

(null, 'orticaria', 'Orticaria', 'orticaria', 'piano', 80,
'- Antistaminico di seconda generazione a dose standard: ___ (dose secondo età e peso), fino a risoluzione dei sintomi.
- Annotare nel diario possibili fattori scatenanti (infezioni, farmaci, alimenti, calore, pressione, sforzo).
- Evitare antinfiammatori non steroidei (es. ibuprofene) se peggiorano i sintomi.
- In caso di gonfiore della lingua o della gola, difficoltà respiratoria o malessere: chiamare il 112.'),
(null, 'rinite_eo', 'Rinite: esame obiettivo', 'rinite', 'esame_obiettivo', 20,
'Buone condizioni generali. Occhi cerchiati. Faringe ___, scolo di muco in retrofaringe. Rinoscopia anteriore: ipertrofia ___ dei turbinati. Al torace buona penetrazione d''aria bilateralmente. Attività cardiaca valida e ritmica. Peso: {{peso}} kg');
