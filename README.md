# Gestionale PLS

Gestionale cloud per **Pediatri di Libera Scelta** e per i **genitori** dei loro assistiti.
Progetto portfolio: tutti i dati sono inventati, ma l'architettura è pensata per i dati sanitari
di minori (GDPR art. 9) fin dal primo commit.

> ⚠️ Non usare con dati di pazienti reali senza DPIA, contratti con i fornitori (DPA),
> piano Supabase a pagamento e verifica legale.

## Cosa c'è in questa versione (Fase 0 · Fondamenta)

| Area | Contenuto |
| --- | --- |
| Database | 4 schemi separati: `anagrafica`, `clinica`, `pseudonimi`, `audit` |
| Pseudonimizzazione | La parte clinica usa solo `pseudo_id`; la mappa la leggono solo funzioni controllate |
| Permessi | Row Level Security su ogni tabella; dati clinici solo al pediatra titolare con MFA |
| Consensi | Uno per genitore e per finalità, storico non modificabile, stato completo/parziale/assente |
| Audit | Registro in sola aggiunta con catena di hash SHA-256 e funzione di verifica |
| Accesso | Login con codice via email (OTP) + secondo fattore TOTP per lo staff |
| App | `apps/studio` (pediatra e segreteria) e `apps/genitori` (portale), React + Vite + Tailwind |
| Test | 35 test pgTAP su RLS, audit e Auth Hook; test Vitest sulla logica condivisa |

## Struttura

```
apps/studio/            app dello studio
apps/genitori/          portale genitori
packages/shared/        tipi, regole di consenso, calcolo età, validazione (Zod)
supabase/migrations/    schema SQL versionato (si applica in ordine)
supabase/tests/         test pgTAP (supabase test db)
supabase/seed.sql       dati di esempio, solo sviluppo
.github/workflows/      CI: typecheck, test, build e test del database
```

## Prerequisiti (Windows)

1. **Node.js 22 LTS** da nodejs.org.
2. **pnpm**: in un terminale `corepack enable` (una volta sola).
3. **Docker Desktop**, solo se vuoi Supabase in locale (consigliato per sviluppare).
4. **Supabase CLI**: è già tra le dipendenze del progetto (`pnpm supabase ...`).

## Avvio in locale

```bash
pnpm install                 # installa tutto e crea pnpm-lock.yaml (va committato)
pnpm supabase start          # avvia Supabase in Docker, applica migrazioni e seed
pnpm db:test                 # lancia i test pgTAP
```

`supabase start` stampa URL e `anon key`: copia `.env.example` in `apps/studio/.env.local`
e in `apps/genitori/.env.local` e incolla i valori. Poi:

```bash
pnpm dev:studio              # http://localhost:5173
pnpm dev:genitori            # http://localhost:5174
```

Le email con il codice arrivano su Mailpit (l'indirizzo è nell'output di `supabase start`).

### Utenti di esempio

| Email | Ruolo | Cosa può fare |
| --- | --- | --- |
| pediatra@example.com | pediatra | tutto sui propri assistiti (dopo il TOTP) |
| segreteria@example.com | segreteria | anagrafica e agenda, nessun dato clinico |
| sostituto@example.com | sostituto | nulla di clinico: la sostituzione è scaduta |
| pediatra.altrostudio@example.com | pediatra di un altro studio | non vede i pazienti dello studio demo |
| mamma.bianchi@example.com | genitore | vede Luca e Sofia |
| papa.bianchi@example.com | genitore | vede solo Luca: per Sofia manca il suo consenso al portale |

## Setup del progetto Supabase online

1. Crea il progetto in regione **Central EU (Frankfurt)**.
2. **Vault**: Dashboard → Project Settings → Vault → nuovo segreto `pls_cf_key` con un valore casuale lungo.
3. Collega e applica le migrazioni:
   ```bash
   pnpm supabase login
   pnpm supabase link --project-ref <id-progetto>
   pnpm supabase db push
   ```
4. **API**: Settings → API → *Exposed schemas*: aggiungi `anagrafica`, `clinica`, `api`
   (non `pseudonimi` né `audit`).
5. **Auth Hook**: Authentication → Hooks → *Customize Access Token* → funzione `public.custom_access_token_hook`.
6. **MFA**: Authentication → Multi-Factor → abilita TOTP.
7. **Email**: Authentication → Email Templates → *Magic Link*: usa il testo di
   `supabase/templates/codice_accesso.html` (contiene `{{ .Token }}`, il codice a 6 cifre).
8. **URL**: Authentication → URL Configuration → aggiungi gli indirizzi Vercel delle due app.
9. Dati demo (facoltativo): esegui `supabase/seed.sql` dallo SQL Editor (usa la chiave del punto 2).

## Deploy su Vercel

Due progetti Vercel dallo stesso repository:

| Progetto | Root Directory | Variabili |
| --- | --- | --- |
| pls-studio | `apps/studio` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| pls-genitori | `apps/genitori` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

## Documentazione

L'analisi architetturale completa (privacy, RBAC, Google Calendar, WhatsApp, requisiti
FSE / Sistema TS / EHDS e roadmap) è in `docs/architettura.md`.

## Licenza

MIT
