# Invio dei documenti delle visite (migrazione 2800)

Il portale genitori è stato dismesso. Al suo posto, dalla visita (pediatrica o allergologica)
il medico invia ai genitori i documenti creati: referto, prescrizioni, certificati della visita;
in Allergologia il referto a colori e quello classico.

## Percorso

1. **Invia ai genitori** (dalla visita appena salvata, dal dettaglio di una visita o dall'elenco delle visite).
2. Si scelgono i documenti, il canale (email o WhatsApp) e il destinatario: un genitore registrato
   (email e telefono dall'anagrafica) oppure un nuovo indirizzo/numero.
3. Il medico conferma che il genitore ha chiesto o accettato l'invio su quel recapito (resta nel registro).
4. L'app crea i PDF (stesso aspetto della stampa), li carica nello Storage privato (bucket `documenti`,
   cartella `<studio>/<invio>/`) e registra l'invio in `anagrafica.invii_documenti`.
5. Il messaggio contiene solo un link personale `…/#/ritiro/<token>` e la scadenza: niente nomi né dati sanitari.
   - Con le credenziali configurate (Amministrazione › Integrazioni) lo invia la funzione `invia-documenti`.
   - Altrimenti l'app apre l'email o WhatsApp dello studio con il testo pronto; poi «Ho inviato il messaggio».
6. Il genitore apre il link, inserisce la **data di nascita del bambino** e scarica i PDF
   (funzione pubblica `ritiro-documenti`, link di scaricamento validi 5 minuti).

## Sicurezza

- Token casuale di 192 bit; nel database solo la sua impronta SHA-256.
- Link valido 30 giorni, revocabile (Amministrazione › Invii di documenti); 5 tentativi con data errata, poi bloccato.
- Ogni apertura e ogni tentativo errato finiscono nel registro di audit.
- Inviano solo il medico che può aprire la cartella (o l'amministratore); per l'Allergologia chi è abilitato al modulo.
- Lo staff può caricare file solo nella cartella del proprio studio e dell'invio appena preparato; nessuno legge
  i file dal browser: i link temporanei li crea la funzione di ritiro.
- Riferimento: Garante privacy, Linee guida in tema di referti on-line (2009) — consegna con modalità sicure,
  disponibilità limitata nel tempo, possibilità per l'interessato di ritirare comunque in studio.

## Configurazione

- Bucket `documenti`: creato dalla migrazione (privato, solo PDF, max 10 MB).
- Secrets delle Edge Functions: `APP_URL`; per l'email `RESEND_API_KEY`, `EMAIL_MITTENTE`;
  per WhatsApp `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_DOCUMENTI`.
- `pnpm supabase functions deploy invia-documenti` e `pnpm supabase functions deploy ritiro-documenti`.
- Da fare in seguito: pulizia automatica dei PDF scaduti (job pianificato).
