# Figure, permessi e amministrazione (migrazioni 2700 e 2800)

## Figure del gestionale

| Figura | Cosa vede e cosa fa |
|---|---|
| **Amministratore** (flag su pediatra, sostituto o allergologo) | Tutto: cartelle di tutti i bambini dello studio, Allergologia, sezione Amministrazione. Mai assegnabile alla segreteria (vincolo nel database). |
| **Pediatra di libera scelta** | I propri assistiti. Allergologia solo se abilitato dall'amministratore (es. per mostrare il gestionale completo). Decide se la segreteria può consultare le sue cartelle. |
| **Pediatra sostituto** | Le cartelle del titolare solo nei periodi di sostituzione. |
| **Pediatra allergologo** | Solo il modulo Allergologia (anagrafica separata). |
| **Segreteria** | Agenda, anagrafiche, accompagnatori, consensi. Cartelle cliniche **in sola lettura** solo per i pediatri che l'hanno consentito (`anagrafica.permessi_cartelle`). |
| **Genitore** | Nessun accesso (il portale è stato dismesso nella migrazione 2800). Riceve i documenti delle visite via email o WhatsApp: vedi `invio-documenti.md`. |

Il claim `app_admin` del token serve solo all'interfaccia: per i dati clinici il database ricontrolla la tabella a ogni richiesta (`sicurezza.admin_attivo()`), quindi una revoca vale subito.

## Specializzazioni future

Allergologia è il modello: ruolo dedicato o abilitazione del medico, tabelle cliniche pseudonimizzate proprie, funzione di accesso (`sicurezza.<modulo>_ok()`), voce di menu e pannello in Amministrazione › Moduli specialistici.

## Accompagnatori

`anagrafica.accompagnatori`: nome, cognome, grado di parentela (obbligatori), telefono, delega scritta, note. Nella visita si scelgono i presenti; un nuovo «altro accompagnatore» entra nell'anagrafica del bambino. In `clinica.visite.accompagnatori` restano solo riferimenti opachi (`t:<id>` genitore, `a:<id>` accompagnatore): i nomi non entrano nello schema clinico.

## Integrazioni

`anagrafica.integrazioni` conserva solo impostazioni non segrete (whitelist nel database). Token e chiavi vanno **solo** nei Secrets delle Edge Functions. Per Google Calendar è pronta la mappa `anagrafica.calendario_eventi_esterni` (solo service role): eventi con titolo generico, senza nome del bambino né motivo.

## Amministrazione

Panoramica · Staff e figure · Accesso alle cartelle · Moduli specialistici · Invii di documenti (destinatari, aperture del link, revoca) · Integrazioni · Catalogo prestazioni · Registro accessi.
