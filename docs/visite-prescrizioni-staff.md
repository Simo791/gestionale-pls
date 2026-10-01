# Visite, prescrizioni, staff e sostituzioni

## Visita odierna
Dalla scheda del bambino (cartella aperta) → **Inizia visita**. Mostra:
- ultima visita (anamnesi, parametri, esame obiettivo, diagnosi, terapia, indicazioni, controllo previsto) e ultime misure con percentili OMS;
- **da proporre a breve ai genitori**: vaccinazioni (calendario nazionale), screening in finestra, prossimo bilancio di salute,
  follow-up delle patologie confermate, controllo previsto nella visita precedente. Sono promemoria calcolati dai calendari,
  non indicazioni cliniche automatiche;
- modulo: misure (peso, lunghezza/altezza, circonferenza cranica con percentile in tempo reale), parametri vitali, esame
  obiettivo, diagnosi ICD-9-CM, terapia, indicazioni ai genitori, prossimo controllo.

Il referto PDF ha intestazione dello studio, dati del bambino e firma.

**Urgenze**: Cruscotto → **+ Urgenza / senza appuntamento**: cerca un bambino già in carico o registra un nuovo bambino
(con il genitore presente) e apre direttamente la visita.

## Prescrizioni (Regione Calabria)
Il gestionale prepara un **promemoria** da ricopiare nella ricetta elettronica (Sistema TS): non è una ricetta valida.

I codici non sono scritti nel codice sorgente: si importano dal **file ufficiale del catalogo regionale**
(DCA 442/2024 e 29/2025, recepimento del DM 25/11/2024) da Account › Catalogo prestazioni:
1. File Excel → *Salva con nome* → *CSV UTF-8*.
2. Carica il file, controlla le colonne proposte (codice regionale, descrizione, codice nomenclatore, branca, nota).
3. Indica la versione/atto e importa. A ogni aggiornamento le voci non più presenti vengono disattivate.

Regole applicate: priorità U/B/D/P (PNGLA 2019-2021) obbligatoria per il primo accesso, quesito diagnostico obbligatorio,
massimo 8 prestazioni per ricetta (avviso se di branche diverse), validità 180 giorni (DCA 442/2024).

## Staff e sostituzioni
- Il pediatra titolare è **amministratore** dello studio (claim `app_admin` nel token).
- Account › Staff dello studio: aggiunge segreteria e sostituti tramite la Edge Function `gestione-staff`
  (serve la service role per creare l'utente in Auth). Deploy: `pnpm supabase functions deploy gestione-staff`.
- Account › Sostituzioni: il titolare attiva un sostituto **dal/al** con le consegne. Nel periodo:
  - il sostituto vede le cartelle degli assistiti del titolare (sempre con secondo fattore);
  - le notifiche (es. richieste di appuntamento dal portale) vanno al sostituto invece che al titolare;
  - al login il sostituto trova nel cruscotto il riquadro del turno, le consegne e le notifiche non lette.
- La revoca chiude subito l'accesso clinico; a fine periodo si chiude da sola.

## Storico delle modifiche
- Patologie del bambino: non si cancellano (si segnano come escluse); ogni modifica salva valori prima/dopo, autore e data
  in `clinica.patologie_storico`, visibile dal pulsante «Storico modifiche».
- Catalogo patologie: modificabile dall'amministratore con motivo obbligatorio; storico in
  `anagrafica.catalogo_patologie_storico`. In un SaaS multi-studio questo diritto andrebbe a un amministratore di piattaforma.
