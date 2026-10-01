-- =============================================================================
-- Dati DEMO estesi per lo "Studio Pediatrico Demo" — persone e dati INVENTATI.
-- Da eseguire DOPO seed.sql (in locale o dallo SQL Editor di Supabase).
-- Non è usato dai test automatici. Si può rieseguire: se trova già i dati, si ferma.
--
-- Contiene: ~30 bambini in ~22 famiglie, genitori con consensi completi o parziali,
-- agenda di 6 settimane (4 passate, 2 future), visite, misurazioni di crescita
-- e vaccinazioni secondo un calendario INDICATIVO (non è un riferimento clinico).
-- =============================================================================

do $$
declare
  c_studio    constant uuid := 'c0000000-0000-4000-8000-000000000001';
  c_pediatra  constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_segret    constant uuid := 'a0000000-0000-4000-8000-000000000002';

  cognomi  text[] := array['Ferraro','Russo','Esposito','Romano','Greco','Bruno','Gallo','Conti',
                           'De Luca','Mancuso','Costa','Fontana','Rizzo','Lombardi','Marino',
                           'Caruso','Leone','Longo','Gentile','Serra','Vitale','Ruggiero'];
  maschi   text[] := array['Leonardo','Francesco','Tommaso','Edoardo','Alessandro','Lorenzo','Mattia',
                           'Gabriele','Riccardo','Andrea','Diego','Nicola','Samuele','Pietro','Antonio'];
  femmine  text[] := array['Aurora','Giulia','Ginevra','Vittoria','Beatrice','Alice','Ludovica',
                           'Emma','Matilde','Sara','Chiara','Martina','Anna','Greta','Noemi'];
  mamme    text[] := array['Francesca','Valentina','Federica','Elena','Silvia','Alessandra','Laura',
                           'Simona','Roberta','Ilaria','Daniela','Paola','Serena','Claudia'];
  papa     text[] := array['Marco','Luca','Giuseppe','Davide','Stefano','Antonio','Paolo','Fabio',
                           'Salvatore','Domenico','Vincenzo','Michele','Giovanni','Roberto'];
  motivi   text[] := array['Febbre da 2 giorni','Tosse persistente','Controllo di routine',
                           'Otalgia','Eruzione cutanea','Mal di gola','Dolore addominale',
                           'Congiuntivite','Rinite','Certificato sportivo'];

  -- Mediane indicative di crescita per età in mesi (valori didattici, non clinici)
  mesi     int[]     := array[1, 3, 6, 9, 12, 18, 24, 36, 60, 96, 120, 144];
  pesi     numeric[] := array[4.4, 6.1, 7.6, 8.6, 9.4, 10.9, 12.2, 14.3, 18.3, 25.6, 32.0, 39.0];
  altezze  numeric[] := array[54.4, 60.5, 66.5, 70.8, 74.5, 81.0, 86.5, 95.5, 109.0, 127.0, 138.0, 149.0];
  crani    numeric[] := array[37.3, 40.5, 43.3, 44.9, 45.9, 47.2, 48.2, 49.4, 50.7, null, null, null];

  f int; k int; n_figli int; i int; g date; slot int;
  v_cognome text; v_mamma uuid; v_papa uuid; v_paz uuid; v_pseudo uuid;
  v_sesso char(1); v_nome text; v_nascita date; v_fattore numeric; v_eta_mesi int;
  v_cf text; v_inizio timestamptz; v_tipo text; v_stato text; v_app uuid;
  v_pazienti uuid[] := '{}';
begin
  if (select count(*) from anagrafica.pazienti where studio_id = c_studio) > 5 then
    raise notice 'Dati demo già presenti: nessuna modifica.';
    return;
  end if;

  perform setseed(0.42);  -- stessi dati a ogni esecuzione

  for f in 1 .. array_length(cognomi, 1) loop
    v_cognome := cognomi[f];

    -- Genitori. Il CF è finto ma di 16 caratteri; l'email è su example.com.
    v_cf := upper(substr(md5('mamma' || f), 1, 16));
    insert into anagrafica.tutori (studio_id, nome, cognome, codice_fiscale_cifrato,
      codice_fiscale_impronta, email, telefono)
    values (c_studio, mamme[1 + (f % array_length(mamme, 1))], cognomi[1 + ((f + 7) % array_length(cognomi, 1))],
      anagrafica.cifra_cf(v_cf), anagrafica.impronta_cf(v_cf),
      'mamma.' || lower(replace(v_cognome, ' ', '')) || '@example.com',
      '+39 000 ' || lpad((1000000 + f)::text, 7, '0'))
    returning id into v_mamma;

    v_papa := null;
    if f % 9 <> 0 then   -- alcune famiglie con un solo genitore registrato
      v_cf := upper(substr(md5('papa' || f), 1, 16));
      insert into anagrafica.tutori (studio_id, nome, cognome, codice_fiscale_cifrato,
        codice_fiscale_impronta, email, telefono)
      values (c_studio, papa[1 + (f % array_length(papa, 1))], v_cognome,
        anagrafica.cifra_cf(v_cf), anagrafica.impronta_cf(v_cf),
        'papa.' || lower(replace(v_cognome, ' ', '')) || '@example.com',
        '+39 000 ' || lpad((2000000 + f)::text, 7, '0'))
      returning id into v_papa;
    end if;

    n_figli := case when f % 3 = 0 then 2 else 1 end;
    if f % 11 = 0 then n_figli := 3; end if;

    for k in 1 .. n_figli loop
      v_sesso := case when random() < 0.5 then 'M' else 'F' end;
      v_nome  := case when v_sesso = 'M'
                   then maschi[1 + floor(random() * array_length(maschi, 1))::int]
                   else femmine[1 + floor(random() * array_length(femmine, 1))::int] end;
      -- Età da 2 settimane a 13 anni, con più bambini piccoli
      v_nascita := current_date - (14 + floor(power(random(), 1.6) * 4700))::int;
      v_cf := upper(substr(md5('figlio' || f || '-' || k), 1, 16));

      insert into anagrafica.pazienti (studio_id, pediatra_id, nome, cognome,
        codice_fiscale_cifrato, codice_fiscale_impronta, data_nascita, sesso, data_scelta_pediatra)
      values (c_studio, c_pediatra, v_nome, v_cognome,
        anagrafica.cifra_cf(v_cf), anagrafica.impronta_cf(v_cf), v_nascita, v_sesso,
        greatest(v_nascita, current_date - 3650))
      returning id into v_paz;
      v_pazienti := v_pazienti || v_paz;
      select pseudo_id into v_pseudo from pseudonimi.mappa where paziente_id = v_paz;

      -- Relazioni di tutela (una famiglia con limitazioni per il padre)
      insert into anagrafica.relazioni_tutela (paziente_id, tutore_id, tipo, valida_dal)
      values (v_paz, v_mamma, 'madre', v_nascita);
      if v_papa is not null then
        insert into anagrafica.relazioni_tutela (paziente_id, tutore_id, tipo, valida_dal, limitazioni)
        values (v_paz, v_papa, 'padre', v_nascita,
                case when f = 5 then 'Provvedimento del tribunale: non accede ai documenti clinici (esempio)' end);
      end if;

      -- Consensi: la madre li dà quasi sempre; il padre in ~70% dei casi.
      insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa, stato, canale, registrato_da)
      select v_paz, v_mamma, fin, '2026-10', 'concesso', 'cartaceo_studio', c_segret
      from unnest(array['dati_sanitari', 'portale', 'comunicazioni']) fin
      where f % 13 <> 0;
      if v_papa is not null and random() < 0.7 then
        insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa, stato, canale, registrato_da)
        select v_paz, v_papa, fin, '2026-10', 'concesso', 'cartaceo_studio', c_segret
        from unnest(array['dati_sanitari', 'portale']) fin;
      end if;

      -- Cartella: qualche allergia o patologia cronica
      update clinica.cartelle set
        allergie = case when random() < 0.15 then array['Amoxicillina']
                        when random() < 0.10 then array['Proteine del latte vaccino']
                        else '{}' end,
        patologie_croniche = case when random() < 0.08 then array['Asma lieve intermittente']
                                  when random() < 0.08 then array['Dermatite atopica']
                                  else '{}' end,
        note_anamnesi = 'Nato/a a termine. Dati di esempio.'
      where pseudo_id = v_pseudo;

      -- Misurazioni alle età dei bilanci già superate
      v_fattore := 0.9 + random() * 0.2;
      v_eta_mesi := ((current_date - v_nascita) / 30.44)::int;
      for i in 1 .. array_length(mesi, 1) loop
        exit when mesi[i] > v_eta_mesi;
        insert into clinica.misurazioni (pseudo_id, eta_giorni, peso_kg, altezza_cm, circonferenza_cranica_cm)
        values (v_pseudo, round(mesi[i] * 30.44)::int,
          round(pesi[i] * v_fattore * case when v_sesso = 'F' then 0.96 else 1 end, 1),
          round(altezze[i] * (0.97 + (v_fattore - 0.9) * 0.3) * case when v_sesso = 'F' then 0.985 else 1 end, 1),
          case when crani[i] is not null then round(crani[i] * (0.98 + (v_fattore - 0.9) * 0.2), 1) end);
      end loop;

      -- Vaccinazioni secondo un calendario indicativo, solo quelle già "scadute"
      insert into clinica.vaccinazioni (pseudo_id, vaccino, dose, data, lotto)
      select v_pseudo, cal.vaccino, cal.dose, v_nascita + cal.giorni,
             'L' || upper(substr(md5(v_paz::text || cal.vaccino || cal.dose), 1, 6))
      from (values
        (61, 'Esavalente', 1), (61, 'Pneumococco coniugato', 1), (61, 'Rotavirus', 1),
        (76, 'Meningococco B', 1),
        (121, 'Esavalente', 2), (121, 'Pneumococco coniugato', 2), (121, 'Rotavirus', 2),
        (136, 'Meningococco B', 2),
        (330, 'Esavalente', 3), (330, 'Pneumococco coniugato', 3),
        (395, 'Morbillo-Parotite-Rosolia-Varicella', 1), (395, 'Meningococco ACWY', 1),
        (420, 'Meningococco B', 3),
        (2190, 'Difterite-Tetano-Pertosse-Polio', 4), (2190, 'Morbillo-Parotite-Rosolia-Varicella', 2)
      ) as cal(giorni, vaccino, dose)
      where v_nascita + cal.giorni <= current_date
        and random() > 0.04;   -- qualche dose mancante, per realismo
    end loop;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Agenda: giorni feriali da 4 settimane fa a 2 settimane avanti,
  -- slot da 20 minuti 9:00–12:40 e 15:00–17:40, occupati al ~55%.
  -- ---------------------------------------------------------------------------
  g := current_date - 28;
  while g <= current_date + 14 loop
    if extract(isodow from g) <= 5 then
      for slot in 0 .. 23 loop
        continue when random() > 0.55;
        v_inizio := ((g + case when slot < 12 then time '09:00' + slot * interval '20 minutes'
                               else time '15:00' + (slot - 12) * interval '20 minutes' end)
                     at time zone 'Europe/Rome');
        v_paz := v_pazienti[1 + floor(random() * array_length(v_pazienti, 1))::int];
        v_tipo := case when random() < 0.62 then 'visita'
                       when random() < 0.55 then 'bilancio_salute'
                       when random() < 0.5  then 'vaccino'
                       when random() < 0.5  then 'certificato'
                       else 'urgenza' end;
        v_stato := case
          when v_inizio < now() then case when random() < 0.92 then 'svolto' else 'non_presentato' end
          when g <= current_date + 2 then case when random() < 0.85 then 'confermato' else 'richiesto' end
          else case when random() < 0.6 then 'confermato' else 'richiesto' end
        end;
        insert into anagrafica.appuntamenti (studio_id, pediatra_id, paziente_id, prenotato_da,
          inizio, fine, tipo, stato, note_segreteria)
        values (c_studio, c_pediatra, v_paz, c_segret, v_inizio, v_inizio + interval '20 minutes',
          v_tipo, v_stato, case when random() < 0.1 then 'Richiamare per conferma' end)
        returning id into v_app;

        -- Per le visite svolte, il pediatra ha compilato la visita in cartella
        if v_stato = 'svolto' and v_tipo in ('visita', 'bilancio_salute', 'urgenza') then
          select pseudo_id into v_pseudo from pseudonimi.mappa where paziente_id = v_paz;
          insert into clinica.visite (pseudo_id, pediatra_id, appuntamento_id, data, motivo, esame_obiettivo, terapia)
          values (v_pseudo, c_pediatra, v_app, v_inizio,
            case when v_tipo = 'bilancio_salute' then 'Bilancio di salute'
                 else motivi[1 + floor(random() * array_length(motivi, 1))::int] end,
            'Condizioni generali buone. Obiettività toracica e addominale nella norma (dato di esempio).',
            case when random() < 0.35 then 'Paracetamolo al bisogno secondo peso' end);
        end if;
      end loop;
    end if;
    g := g + 1;
  end loop;

  raise notice 'Dati demo creati: % bambini.', array_length(v_pazienti, 1);
end;
$$;

-- =============================================================================
-- Esiti dei controlli e screening già superati (richiede la migrazione 1000).
-- Rieseguibile: se trova già degli esiti, non fa nulla.
-- =============================================================================
do $$
begin
  if exists (select 1 from clinica.controlli_eseguiti) then
    raise notice 'Esiti dei controlli già presenti: nessuna modifica.';
    return;
  end if;
  perform setseed(0.17);

  -- Qualche bambino con fattori di rischio audiologico (dato di esempio)
  update clinica.cartelle set fattori_rischio = array['Ricovero in terapia intensiva neonatale > 5 giorni']
  where pseudo_id in (select pseudo_id from clinica.cartelle order by pseudo_id limit 3);

  insert into clinica.controlli_eseguiti (pseudo_id, codice_controllo, data, esito, note, registrato_da)
  select m.pseudo_id, c.codice,
         least(p.data_nascita + c.finestra_da_giorni + (random() * (c.finestra_a_giorni - c.finestra_da_giorni))::int, current_date),
         case when random() < 0.93 then 'nella_norma' else 'da_approfondire' end,
         null, 'a0000000-0000-4000-8000-000000000001'
  from anagrafica.pazienti p
  join pseudonimi.mappa m on m.paziente_id = p.id
  join clinica.cartelle ca on ca.pseudo_id = m.pseudo_id
  cross join anagrafica.catalogo_controlli c
  where p.studio_id = 'c0000000-0000-4000-8000-000000000001'
    and (c.destinatari = 'tutti' or cardinality(ca.fattori_rischio) > 0)
    and p.data_nascita + c.finestra_a_giorni < current_date - 20   -- finestra chiusa da un po'
    and random() < 0.9;                                           -- qualche controllo mancante, per realismo

  raise notice 'Esiti dei controlli creati.';
end;
$$;

-- =============================================================================
-- Allergie strutturate di esempio (richiede la migrazione 1100). Rieseguibile.
-- =============================================================================
do $$
begin
  if exists (select 1 from clinica.allergie) then
    raise notice 'Allergie già presenti: nessuna modifica.';
    return;
  end if;
  insert into clinica.allergie (pseudo_id, allergene, reazione, gravita, stato, test, data_diagnosi)
  select c.pseudo_id, 'betalattamici', 'Orticaria diffusa dopo amoxicillina', 'moderata', 'sospetta', '{}', current_date - 200
  from clinica.cartelle c where 'Amoxicillina' = any(c.allergie);
  insert into clinica.allergie (pseudo_id, allergene, reazione, gravita, stato, test, data_diagnosi)
  select c.pseudo_id, 'latte', 'Vomito e orticaria dopo assunzione di latte vaccino', 'moderata', 'confermata',
         array['prick', 'ige_specifiche', 'tpo'], current_date - 300
  from clinica.cartelle c where 'Proteine del latte vaccino' = any(c.allergie);
  raise notice 'Allergie di esempio create.';
end;
$$;
