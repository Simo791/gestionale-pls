# Architettura · sintesi

Documento di riferimento completo: "Gestionale PLS – Analisi architetturale" (Claude Docs).
Qui le decisioni che il codice implementa già.

## Decisioni

| # | Decisione | Dove nel codice |
| --- | --- | --- |
| 1 | Dati identificativi e clinici in schemi separati, collegati solo da `pseudo_id` | `migrations/…0200`, `…0300` |
| 2 | La mappa paziente ↔ pseudonimo (`pseudonimi.mappa`) non è leggibile da nessun ruolo applicativo | `…0300`, `…0500` |
| 3 | Si passa da paziente a cartella solo con `api.apri_cartella()`, che registra l'apertura | `…0600` |
| 4 | Dati clinici solo a pediatra titolare o sostituto nel periodo, con sessione MFA (`aal2`) | `sicurezza.puo_accedere_paziente` |
| 5 | Il genitore vede un figlio solo con relazione valida e proprio consenso al portale | `sicurezza.tutore_di` |
| 6 | Consensi come storico non modificabile; stato completo / parziale / assente | `anagrafica.consensi`, `sicurezza.stato_consenso` |
| 7 | Codice fiscale cifrato con pgcrypto, chiave in Supabase Vault, ricerca via HMAC | `…0200` |
| 8 | Audit in sola aggiunta con catena SHA-256; salva i campi cambiati, non i valori | `…0400` |
| 9 | Ruolo e studio nel JWT tramite Custom Access Token Hook | `…0700` |
| 10 | Schema `pseudonimi` (non `vault`): `vault` è già usato da Supabase per i segreti | `…0100` |

## Fasi

0. Fondamenta: schemi, RLS, audit, login OTP + MFA, CI ← **questa versione**
1. Accessi, anagrafica e consensi (RPC di registrazione, consenso dal portale, gestione staff)
2. Agenda e prenotazioni, promemoria email
3. Cartella clinica: visite, curve di crescita, vaccini, documenti, certificati
4. Integrazioni: Google Calendar e WhatsApp (senza dati sanitari verso terzi)
5. Portale genitori completo, prestazioni private / Sistema TS, export FHIR, pubblicazione

## Limiti noti della Fase 0

- L'età nelle misurazioni insieme alla data di inserimento permette di risalire alla data di nascita:
  la pseudonimizzazione riduce il rischio, non anonimizza.
- L'ancoraggio esterno dell'hash di chiusura (edge function notturna) arriva in Fase 1.
- I tipi TypeScript sono scritti a mano; in Fase 1 si affiancano quelli generati da `supabase gen types`.
