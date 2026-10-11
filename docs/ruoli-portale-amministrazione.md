# Figure, permessi, portale genitori e amministrazione (migrazione 2700)

## Figure del gestionale

| Figura | Cosa vede e cosa fa |
|---|---|
| **Amministratore** (flag su pediatra, sostituto o allergologo) | Tutto: cartelle di tutti i bambini dello studio, Allergologia, sezione Amministrazione. Mai assegnabile alla segreteria (vincolo nel database). |
| **Pediatra di libera scelta** | I propri assistiti. Allergologia solo se abilitato dall'amministratore (es. per mostrare il gestionale completo). Decide se la segreteria può consultare le sue cartelle. |
| **Pediatra sostituto** | Le cartelle del titolare solo nei periodi di sostituzione. |
| **Pediatra allergologo** | Solo il modulo Allergologia (anagrafica separata). |
| **Segreteria** | Agenda, anagrafiche, accompagnatori, consensi. Cartelle cliniche **in sola lettura** solo per i pediatri che l'hanno consentito (`anagrafica.permessi_cartelle`). |
| **Genitore** | Portale: figli, visite (motivo, terapia, indicazioni), documenti, appuntamenti, crescita, vaccini, consensi con firma. |

Il claim `app_admin` del token serve solo all'interfaccia: per i dati clinici il database ricontrolla la tabella a ogni richiesta (`sicurezza.admin_attivo()`), quindi una revoca vale subito.

## Specializzazioni future

Allergologia è il modello: ruolo dedicato o abilitazione del medico, tabelle cliniche pseudonimizzate proprie, funzione di accesso (`sicurezza.<modulo>_ok()`), voce di menu e pannello in Amministrazione › Moduli specialistici.

## Accompagnatori

`anagrafica.accompagnatori`: nome, cognome, grado di parentela (obbligatori), telefono, delega scritta, note. Nella visita si scelgono i presenti; un nuovo «altro accompagnatore» entra nell'anagrafica del bambino. In `clinica.visite.accompagnatori` restano solo riferimenti opachi (`t:<id>` genitore, `a:<id>` accompagnatore): i nomi non entrano nello schema clinico.

## Integrazioni

`anagrafica.integrazioni` conserva solo impostazioni non segrete (whitelist nel database). Token e chiavi vanno **solo** nei Secrets delle Edge Functions. Per Google Calendar è pronta la mappa `anagrafica.calendario_eventi_esterni` (solo service role): eventi con titolo generico, senza nome del bambino né motivo.

## Consensi e firma dal portale

1. Il genitore vede i consensi anche prima di aver dato quello al portale (`api.portale_consensi`).
2. Apre l'informativa (testo in `anagrafica.informative`, versionato): l'apertura è registrata.
3. Sceglie e firma sullo schermo: `api.firma_consenso` salva il consenso (canale portale) e in `anagrafica.firme_consenso` l'immagine della firma con impronta SHA-256 di consenso, informativa, firma e ora.

È una **firma elettronica semplice**. La firma grafometrica avanzata (FEA) richiede un fornitore certificato che cifri i dati biometrici (DPCM 22/02/2013): si può integrare in seguito con tablet di firma. I testi delle informative vanno fatti validare al DPO.

## Amministrazione

Panoramica · Staff e figure · Accesso alle cartelle · Moduli specialistici · Account genitori e consensi (accesso al portale, ultimo accesso, consensi dati/firmati/mancanti, scollegamento) · Integrazioni · Catalogo prestazioni · Registro accessi.
