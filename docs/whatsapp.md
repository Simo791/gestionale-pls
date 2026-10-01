# Messaggi WhatsApp ai genitori

## Cosa parte e quando

| Messaggio | Quando | A chi |
| --- | --- | --- |
| Conferma appuntamento | Subito, quando pediatra o segreteria inseriscono un appuntamento confermato, confermano una richiesta del genitore o spostano un appuntamento | Genitori con responsabilità, telefono e consenso "WhatsApp" |
| Promemoria controllo | Alle 10:00 del giorno stabilito in `anagrafica.regole_promemoria` (di default: bilancio di salute, 30 e 5 giorni prima) | Come sopra |

Entrambi contengono il link **"Aggiungi a Google Calendar"**, che apre il calendario del genitore
con l'evento già compilato (titolo, orario, indirizzo, telefono per disdire).

Se l'appuntamento viene annullato, segnato come svolto o spostato, i messaggi non ancora partiti
vengono annullati; in caso di spostamento si riprogrammano conferma e promemoria.

**Cosa non c'è mai nei messaggi:** nome del bambino, motivo della visita, dati clinici, codice fiscale
(WhatsApp Business Messaging Policy e minimizzazione GDPR).

## Componenti

1. `supabase/migrations/…0900_messaggi_whatsapp.sql`: regole, coda `anagrafica.messaggi_outbox`, trigger sugli appuntamenti.
2. `supabase/functions/invia-messaggi`: Edge Function che legge la coda e invia con WhatsApp Cloud API.
   **Senza credenziali Meta lavora in simulazione**: non invia nulla e segna i messaggi come "simulato".
3. Un job pianificato che chiama la funzione ogni 5 minuti.

## Template da far approvare su Meta

Categoria **Utility**, lingua **Italiano**. Le variabili sono le stesse per entrambi, nello stesso ordine.

**`pls_conferma_appuntamento`**

```
Gentile {{1}}, le confermiamo l'appuntamento presso {{2}} per {{3}} alle ore {{4}}.
Indirizzo: {{5}}
Per aggiungerlo al suo calendario Google: {{6}}
Per disdire o spostare l'appuntamento chiami lo studio al {{7}}.
```

**`pls_promemoria_controllo`**

```
Gentile {{1}}, le ricordiamo il controllo pediatrico presso {{2}} previsto per {{3}} alle ore {{4}}.
Indirizzo: {{5}}
Per aggiungerlo al suo calendario Google: {{6}}
Per disdire o spostare l'appuntamento chiami lo studio al {{7}}.
```

Esempi da inserire in approvazione: {{1}} Giulia · {{2}} Studio Pediatrico Demo · {{3}} lunedì 16 novembre ·
{{4}} 09:00 · {{5}} Via degli Esempi 1, Città Demo · {{6}} https://calendar.google.com/calendar/render?action=TEMPLATE ·
{{7}} 0000 000000

## Messa in funzione

1. Applica la migrazione: `pnpm supabase db push`.
2. Crea il segreto per il job (un valore casuale lungo) e caricalo:
   `pnpm supabase secrets set INVIO_SEGRETO=<valore>`
3. Pubblica la funzione: `pnpm supabase functions deploy invia-messaggi --no-verify-jwt`
4. Pianifica la chiamata ogni 5 minuti, dallo SQL Editor (sostituisci `<ref>` e `<valore>`):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('<valore>', 'invio_segreto');
select cron.schedule('invia-messaggi', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/invia-messaggi',
    headers := jsonb_build_object('Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'invio_segreto'))
  );
$$);
```

5. Quando avrai l'app Meta con il numero WhatsApp:
   `pnpm supabase secrets set WHATSAPP_TOKEN=<token> WHATSAPP_PHONE_NUMBER_ID=<id>`
   Da quel momento i messaggi partono davvero.
