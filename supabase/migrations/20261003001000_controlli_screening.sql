-- =============================================================================
-- 1000 · Screening e controlli programmati
-- -----------------------------------------------------------------------------
-- Catalogo dei controlli raccomandati per età (con fonte e link) ed esiti
-- registrati dal pediatra. Le finestre sono quelle in cui il PEDIATRA deve
-- eseguire il controllo o verificarne l'esito (per gli screening fatti al punto
-- nascita, la verifica avviene al primo bilancio).
-- Contenuto di consultazione: non sostituisce il giudizio clinico, non genera
-- diagnosi automatiche. Da aggiornare quando cambiano le raccomandazioni.
-- =============================================================================

create table anagrafica.catalogo_controlli (
  codice              text primary key,
  nome                text not null,
  descrizione         text not null,
  azione_pediatra     text not null,
  finestra_da_giorni  integer not null check (finestra_da_giorni >= 0),
  finestra_a_giorni   integer not null,
  destinatari         text not null default 'tutti' check (destinatari in ('tutti', 'fattori_rischio')),
  fonte               text not null,
  fonte_url           text not null,
  ordine              smallint not null default 0,
  check (finestra_a_giorni >= finestra_da_giorni)
);
alter table anagrafica.catalogo_controlli enable row level security;
grant select on anagrafica.catalogo_controlli to authenticated;
create policy staff_legge_catalogo on anagrafica.catalogo_controlli
  for select to authenticated using (sicurezza.is_staff());

insert into anagrafica.catalogo_controlli
  (codice, nome, descrizione, azione_pediatra, finestra_da_giorni, finestra_a_giorni, destinatari, fonte, fonte_url, ordine) values
('sne',
 'Screening neonatale esteso (metabolico)',
 'Prelievo di sangue tra 48 e 72 ore di vita al punto nascita per oltre 40 malattie metaboliche ereditarie; esteso dalla Legge di Bilancio 2019 a malattie neuromuscolari genetiche, immunodeficienze congenite severe e malattie da accumulo lisosomiale (attuazione variabile per Regione).',
 'Verificare che lo screening sia stato eseguito e che l''esito sia negativo; in caso di richiamo, accertarsi della presa in carico presso il centro di riferimento.',
 0, 45, 'tutti',
 'Legge 167/2016 e DM 13 ottobre 2016 · Ministero della Salute, Centro nazionale malattie rare',
 'https://www.malattierare.gov.it/screening', 10),

('udito_neonatale',
 'Screening uditivo neonatale',
 'Otoemissioni (TEOAE) almeno 24 ore dopo la nascita, prima della dimissione (48–72 ore). Obiettivo 1-3-6: screening entro 1 mese, diagnosi entro 3 mesi, intervento entro 6 mesi. Incluso nei LEA (DPCM 12 gennaio 2017).',
 'Verificare l''esito dello screening e la presenza di fattori di rischio per ipoacusia a esordio tardivo; sorvegliare comprensione e produzione del linguaggio.',
 0, 45, 'tutti',
 'Società Italiana di Neonatologia — Documento sullo screening audiologico neonatale (2023)',
 'https://blog.sin-neonatologia.it/wp-content/uploads/2023/09/documento-screening-audiologico-neonatale.pdf', 20),

('udito_rischio',
 'Sorveglianza audiologica (bambini con fattori di rischio)',
 'Per i bambini con fattori di rischio di ipoacusia tardiva: valutazione ogni 6–12 mesi nei primi tre anni; in caso di infezione congenita da CMV la sorveglianza prosegue almeno fino all''età scolare.',
 'Programmare le valutazioni audiologiche periodiche presso il servizio di riferimento.',
 180, 1095, 'fattori_rischio',
 'Società Italiana di Neonatologia — Documento sullo screening audiologico neonatale (2023)',
 'https://blog.sin-neonatologia.it/wp-content/uploads/2023/09/documento-screening-audiologico-neonatale.pdf', 25),

('eco_anche',
 'Ecografia delle anche',
 'Screening clinico a tutti i neonati; ecografia alla nascita se segni clinici positivi (Ortolani, Barlow) o fattori di rischio; screening ecografico a tutti i neonati tra la 4ª e la 6ª settimana di vita.',
 'Prescrivere/verificare l''ecografia delle anche entro la 6ª settimana e registrarne l''esito.',
 28, 42, 'tutti',
 'SITOP (Società Italiana di Ortopedia e Traumatologia Pediatrica), raccomandazioni 2019 — Giornale Italiano di Ortopedia e Traumatologia',
 'https://old.giot.it/article/la-displasia-congenita-dellanca-dca-terminologia-diagnosi-precoce-screening-raccomandazioni/', 30),

('riflesso_rosso_1',
 'Riflesso rosso (1° controllo)',
 'Test del riflesso rosso in ambiente poco illuminato. Invio immediato all''oculista se il riflesso è anomalo o assente.',
 'Eseguire il test del riflesso rosso e registrarne l''esito.',
 1, 45, 'tutti',
 'P. Nucci — Screening oculistico: linee guida per il pediatra di famiglia; screening oftalmologico neonatale nei LEA (DPCM 12 gennaio 2017)',
 'https://www.massimilianoserafino.it/wp-content/uploads/2020/04/Linee-guida-per-il-pediatra.pdf', 40),

('riflesso_rosso_2',
 'Riflesso rosso (2° controllo)',
 'Ripetizione del test del riflesso rosso tra 3 e 6 mesi.',
 'Eseguire il test del riflesso rosso e registrarne l''esito.',
 91, 183, 'tutti',
 'P. Nucci — Screening oculistico: linee guida per il pediatra di famiglia',
 'https://www.massimilianoserafino.it/wp-content/uploads/2020/04/Linee-guida-per-il-pediatra.pdf', 41),

('riflesso_corneale_1',
 'Riflessi corneali (strabismo) — 1° controllo',
 'Test di Hirschberg: l''asimmetria dei riflessi corneali segnala con buona affidabilità uno strabismo e richiede invio all''oculista.',
 'Eseguire il test dei riflessi corneali e registrarne l''esito.',
 91, 183, 'tutti',
 'P. Nucci — Screening oculistico: linee guida per il pediatra di famiglia',
 'https://www.massimilianoserafino.it/wp-content/uploads/2020/04/Linee-guida-per-il-pediatra.pdf', 42),

('riflesso_corneale_2',
 'Riflessi corneali (strabismo) — 2° controllo',
 'Ripetizione del test di Hirschberg tra 12 e 24 mesi.',
 'Eseguire il test dei riflessi corneali e registrarne l''esito.',
 365, 730, 'tutti',
 'P. Nucci — Screening oculistico: linee guida per il pediatra di famiglia',
 'https://www.massimilianoserafino.it/wp-content/uploads/2020/04/Linee-guida-per-il-pediatra.pdf', 43),

('acuita_visiva_1',
 'Acuità visiva (3–4 anni)',
 'Misura dell''acuità visiva se il bambino collabora. Invio all''oculista se inferiore a 6/10 a 3–4 anni o con differenza tra i due occhi superiore a 1/10.',
 'Misurare l''acuità visiva per ciascun occhio e registrarne l''esito.',
 1096, 1461, 'tutti',
 'P. Nucci — Screening oculistico: linee guida per il pediatra di famiglia',
 'https://www.massimilianoserafino.it/wp-content/uploads/2020/04/Linee-guida-per-il-pediatra.pdf', 44),

('acuita_visiva_2',
 'Acuità visiva (4–6 anni)',
 'Periodo principale per lo screening dell''ambliopia. Invio all''oculista se l''acuità è inferiore a 9/10 dai 6 anni o con differenza tra i due occhi superiore a 1/10.',
 'Misurare l''acuità visiva per ciascun occhio e registrarne l''esito.',
 1461, 2191, 'tutti',
 'P. Nucci — Screening oculistico: linee guida per il pediatra di famiglia',
 'https://www.massimilianoserafino.it/wp-content/uploads/2020/04/Linee-guida-per-il-pediatra.pdf', 45),

('vitamina_d',
 'Profilassi con vitamina D (primo anno)',
 'In assenza di fattori di rischio: 400 UI/die dai primi giorni di vita per tutto il primo anno. Dopo il primo anno, profilassi nei bambini e adolescenti con fattori di rischio di carenza.',
 'Consigliare la profilassi al primo bilancio e verificarne l''aderenza nei bilanci successivi.',
 0, 45, 'tutti',
 'Consensus italiana "Vitamina D in età pediatrica" (2015) — SIPPS, SIP, FIMP, SIMP',
 'https://www.sipps.it/pdf/2016napoli/04_Sessione/01_Vierucci.pdf', 50);

-- -----------------------------------------------------------------------------
-- Esiti registrati (dato clinico: schema clinica, solo pseudo_id)
-- -----------------------------------------------------------------------------
create table clinica.controlli_eseguiti (
  id               uuid primary key default gen_random_uuid(),
  pseudo_id        uuid not null references clinica.cartelle(pseudo_id),
  codice_controllo text not null references anagrafica.catalogo_controlli(codice),
  data             date not null default current_date,
  esito            text not null check (esito in ('nella_norma', 'da_approfondire', 'inviato_specialista', 'non_eseguibile')),
  note             text,
  registrato_da    uuid not null default auth.uid(),
  creato_il        timestamptz not null default now()
);
create index on clinica.controlli_eseguiti (pseudo_id, codice_controllo);

-- Bambini con fattori di rischio (es. per la sorveglianza audiologica): dato clinico.
alter table clinica.cartelle add column fattori_rischio text[] not null default '{}';

alter table clinica.controlli_eseguiti enable row level security;
grant select, insert, update on clinica.controlli_eseguiti to authenticated;
create policy pediatra_gestisce_controlli on clinica.controlli_eseguiti
  for all to authenticated
  using (sicurezza.puo_accedere_clinica(pseudo_id))
  with check (sicurezza.puo_accedere_clinica(pseudo_id));

create trigger audit after insert or update or delete on clinica.controlli_eseguiti
  for each row execute function audit.traccia_modifica();

-- -----------------------------------------------------------------------------
-- Controlli da fare nei prossimi p_giorni o scaduti da meno di 60 giorni, senza esito.
-- Solo pediatra/sostituto con MFA: che un controllo sia fatto o no è un dato sanitario.
-- -----------------------------------------------------------------------------
create or replace function api.controlli_in_scadenza(p_giorni integer default 30)
returns table (paziente_id uuid, nome text, cognome text, codice text, controllo text,
               dal date, al date, scaduto boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not (sicurezza.ruolo() in ('pediatra', 'sostituto') and sicurezza.mfa_ok()) then
    raise exception 'Solo il pediatra può vedere i controlli clinici';
  end if;
  return query
  select p.id, p.nome, p.cognome, c.codice, c.nome,
         p.data_nascita + c.finestra_da_giorni, p.data_nascita + c.finestra_a_giorni,
         p.data_nascita + c.finestra_a_giorni < current_date
  from anagrafica.pazienti p
  join pseudonimi.mappa m on m.paziente_id = p.id
  join clinica.cartelle ca on ca.pseudo_id = m.pseudo_id
  cross join anagrafica.catalogo_controlli c
  where p.studio_id = sicurezza.studio_id()
    and p.stato = 'attivo'
    and sicurezza.puo_accedere_paziente(p.id)
    and (c.destinatari = 'tutti' or cardinality(ca.fattori_rischio) > 0)
    and p.data_nascita + c.finestra_da_giorni <= current_date + p_giorni
    and p.data_nascita + c.finestra_a_giorni >= current_date - 60
    and not exists (select 1 from clinica.controlli_eseguiti e
                    where e.pseudo_id = m.pseudo_id and e.codice_controllo = c.codice)
  order by p.data_nascita + c.finestra_a_giorni, p.cognome;
end;
$$;

grant execute on function api.controlli_in_scadenza(integer) to authenticated;
