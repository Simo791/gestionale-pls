# Modulo Allergologia pediatrica

Sezione del gestionale per un ambulatorio di allergologia pediatrica. Usa la stessa
grafica e la stessa architettura di sicurezza del resto dell'app, ma i suoi pazienti sono
**un'anagrafica separata**: non sono collegati agli assistiti del pediatra.

## Chi la vede

| Chi | Accesso |
|---|---|
| Amministratore dello studio (es. tecnicolumera@gmail.com) | Attiva/disattiva il modulo, accetta gli allergologi, usa il modulo |
| Allergologo pediatra (nuovo ruolo `allergologo`) | Solo il modulo Allergologia + Account. Niente assistiti, agenda o cartelle del pediatra |
| Pediatra o sostituto accettato dall'amministratore | Il proprio lavoro + il modulo Allergologia |
| Segreteria | Mai (non è abilitabile) |

L'accesso è verificato **sul momento** nel database (`sicurezza.allergologia_ok()`): modulo
attivo nello studio, membro attivo, amministratore oppure accettato, secondo fattore (aal2).
La disattivazione del modulo o la revoca di un allergologo hanno effetto immediato. Il claim
`app_allergologia` nel token serve solo a mostrare la voce di menu (dopo un'attivazione
bisogna uscire e rientrare).

### Come si attiva

1. `pnpm supabase db push` (migrazione `20261012001800_allergologia.sql`).
2. Ridistribuire la Edge Function: `pnpm supabase functions deploy gestione-staff`.
3. Accedere come amministratore → **Account → Allergologia pediatrica → Attiva il modulo**. Uscire e rientrare.
4. Per un'allergologa esterna: **Account → Staff dello studio → Aggiungi**, ruolo «Allergologo pediatra»
   (aggiungerla equivale ad accettarla). Al primo accesso configura il secondo fattore.
   Per un pediatra o sostituto già presente: pulsante **Accetta** nel riquadro Allergologia.

## Dati

- `anagrafica.allergo_pazienti`: nome, cognome, data di nascita, sesso, contatti del genitore,
  pediatra curante, inviante. Codice fiscale **cifrato** (pgcrypto) + impronta HMAC per i doppioni;
  si legge solo con `api.allergo_codice_fiscale()`.
- `pseudonimi.allergo_mappa`: paziente ↔ pseudo_id, nessun permesso per i ruoli applicativi.
- `clinica.allergo_*` (solo pseudo_id): cartelle (anamnesi), visite, diagnosi, test (prick, prick by
  prick, IgE specifiche/molecolari/totali, patch), TPO, spirometrie + FeNO (reversibilità calcolata),
  punteggi, reazioni/anafilassi, autoiniettori, terapie, immunoterapie e somministrazioni.
- Niente DELETE: i dati si correggono e ogni modifica entra nel registro con catena di hash.
- RPC: `allergo_registra_paziente`, `allergo_apri_cartella` (registra l'apertura), `allergo_codice_fiscale`,
  `allergo_promemoria` (controlli entro 30 giorni, autoiniettori in scadenza entro 60),
  `imposta_allergologia`, `abilita_allergologia`.

## Sezioni della cartella

Riepilogo (diagnosi attive, allerte, ultimi punteggi, terapia, ultima visita) · Visite e diagnosi ·
Asma e rinite (c-ACT/ACT, spirometria, FeNO) · Dermatite e orticaria (SCORAD, POEM, UAS7) ·
Alimenti e anafilassi (reazioni con criteri EAACI, autoiniettori con controllo di dose/scadenza, TPO) ·
Test allergologici (seduta rapida di prick con controlli) · Terapie e immunoterapia (SCIT/SLIT/OIT con
registro dosi) · Anamnesi.

Documenti stampabili: relazione per il pediatra curante, piano d'azione per l'anafilassi (famiglia e
scuola), dieta di esclusione (riusa le schede per allergene del gestionale).

## Regole cliniche e fonti

I calcoli sono di supporto alla registrazione, non diagnosi automatiche: l'interpretazione resta del medico.

| Strumento | Regola | Fonte |
|---|---|---|
| SCORAD | A/5 + 7B/2 + C (0–103); < 25 lieve, 25–50 moderata, > 50 grave; oSCORAD < 15 / 15–40 / > 40 | European Task Force on AD, Dermatology 1993; Oranje 2007; Kunz 1997 |
| POEM | 7 voci 0–4 (0–28): 0–2, 3–7, 8–16, 17–24, 25–28 | Charman 2004; Charman BJD 2013 |
| c-ACT (4–11 anni) | 7 voci, 0–27; ≤ 19 non ben controllato | Liu JACI 2007 |
| ACT (≥ 12 anni) | 5 voci 1–5, 5–25; ≥ 20 controllato, 16–19 non ben, ≤ 15 scarsamente | Nathan JACI 2004 |
| UAS7 | 7 giorni × (pomfi 0–3 + prurito 0–3), 0–42; 0 / 1–6 / 7–15 / 16–27 / 28–42 | Linee guida EAACI/GA²LEN/EuroGuiDerm/APAAACI 2022 |
| Prick test | positivo se pomfo ≥ 3 mm oltre il controllo negativo; istamina < 3 mm = seduta non interpretabile | EAACI, Heinzerling 2013 |
| IgE specifiche | ≥ 0,35 kUA/L sensibilizzazione; 0,10–0,34 bassa | convenzione di laboratorio |
| Reversibilità | FEV₁ ≥ +12% dopo broncodilatatore | GINA |
| FeNO | < 12 anni: < 20 / 20–35 / > 35 ppb; ≥ 12: < 25 / 25–50 / > 50 | ATS, Dweik 2011 |
| Anafilassi | 3 criteri clinici (cute + respiro/circolo; ≥ 2 apparati; ipotensione dopo allergene noto) | EAACI 2021 (Muraro, Allergy 2022) |
| Autoiniettore | 0,15 mg 7,5–25 kg; 0,30 mg oltre 25–30 kg; < 7,5 kg valutare 0,01 mg/kg; prescriverne 2 | EAACI 2021; EMA |

Le domande di c-ACT e ACT sono protette da licenza: l'app registra il punteggio di ciascuna voce
indicando solo l'argomento. Prima di un uso clinico reale verificare la licenza dei questionari.

## Software simili consultati

Le funzioni sono state scelte confrontando gestionali per allergologi (es. AllergyEHR di Meditab,
moduli Allergy/Immunology di ModMed, gestionali italiani per allergologi): registro dei test cutanei
con pomfo e controlli, piani di immunoterapia con registro delle dosi e delle reazioni locali/sistemiche,
promemoria per i pazienti fuori programma, modelli di prima visita con anamnesi ambientale e familiare.

## Visita allergologica e referto (migrazione 1900)

Ricalcano le lettere dell'ambulatorio: intestazione «Ambulatorio di Allergologia», luogo e data, dati del
paziente (luogo di nascita, residenza, telefono, e-mail, PdF), anamnesi familiare, fisiologica e patologica
remota, anamnesi patologica prossima (o «Prima osservazione clinica» + «Controllo clinico del…»), abitazione,
animali, fumo passivo, farmaci, alimentazione, esame obiettivo con peso, test eseguiti, conclusioni, diagnosi,
piano di cura, controllo, frase di contatto e firma.

- **Controllo**: accanto al modulo c'è sempre la visita precedente (anamnesi, test, conclusioni, diagnosi, piano),
  con «Riprendi»; diagnosi e piano partono da quelli precedenti; la visita salva il collegamento
  (`visita_precedente_id`) e una copia dell'anamnesi del momento (`anamnesi_snapshot`).
- **Test del giorno**: prick, spirometria, SCORAD, POEM, c-ACT/ACT, UAS7 si registrano dalla visita e il testo
  «Eseguiti SPT per… / Spirometria basale… / Test di broncoreversibilità…» si genera da solo.
- **Modelli per tipo di bambino** (`anagrafica.allergo_modelli`, predefiniti + personalizzati dello studio):
  asma < 12 anni, asma ≥ 12 anni (MART), rinocongiuntivite, dermatite atopica, allergia alimentare con anafilassi,
  crostacei e molluschi, allergia alimentare senza anafilassi, LTP/PR-10/profilline, immunoterapia, orticaria.
  Ricavati dai referti forniti: farmaci e posologie vanno sempre verificati su età e peso (dosi di betametasone e
  antistaminici lasciate da compilare). Segnaposto: `{{nome}}`, `{{peso}}`, `{{prossimo_controllo}}`.
- **Impostazioni del referto** (per medico): intestazione, sottotitolo, luogo, firma, qualifica, email, chiusura.
- **SCORAD sul modello eSCORAD (dermatools)**: età < 2 / ≥ 2 anni, mappa corporea fronte/retro cliccabile con la %
  di ogni regione (pesi della figura originale; sotto i 2 anni la figura somma 96%), intensità 0–3, VAS prurito e
  sonno, risultato A/B/C, SCORAD e SCORAD oggettivo con fasce.
- **Piano d'azione per la reazione allergica** nel formato dell'ambulatorio: tabella sintomi → adrenalina/antistaminico,
  dosaggio, chi chiamare (112), contatti di emergenza, istruzioni per l'autoiniettore.

## Referti: classico e a colori

- **Classico** (comunicazioni tra medici): intestazione della struttura, medico con iscrizione all'Ordine, titolo
  «Referto di visita allergologica», luogo, data e ora, tabella dei dati del paziente, sezioni numerate per titolo,
  accertamenti in tabelle di valori, diagnosi numerate, piano, firma, nota privacy.
- **A colori** (consegnato ai genitori): stesse informazioni e stessa firma, impaginazione colorata con icone.
  I grafici compaiono solo dove aiutano la famiglia: andamento di FEV₁ e dei punteggi nelle visite (se ci sono
  almeno due valori) e mappa delle zone della pelle dello SCORAD.

Valore legale (scelte di progetto):
- i test allergologici, la spirometria e i punteggi sono riportati **come valori misurati**, in tabella: nessun
  grafico interpretativo, nessuna fascia «normale/alterato», nessun giudizio calcolato dal programma; l'interpretazione
  è quella scritta dal medico (conclusioni e diagnosi);
- il referto riporta struttura, medico (nome, qualifica, n. di iscrizione all'Ordine), paziente identificato
  (nome, data di nascita, codice fiscale), data e ora della visita e spazio per la firma;
- il PDF prodotto dal browser non è firmato digitalmente: ha valore se stampato e firmato a mano, oppure se firmato
  con firma digitale qualificata (CAD, D.Lgs. 82/2005) prima dell'invio per email;
- i calcolatori dell'app (SCORAD, c-ACT, criteri di anafilassi, dose dell'autoiniettore) sono di supporto al medico
  e non compaiono nel referto come giudizi.

## IgE totali, specifiche e molecolari (migrazione 2600)

Dalla visita (riquadro dei test del giorno) o dalla scheda **Test allergologici**:

- **IgE totali e specifiche**: IgE totali in kU/L e pannello degli estratti più richiesti in età pediatrica
  (codici ImmunoCAP: d1, d2, g6, w21, t9, t23, e1, e5, f1, f2, f13, f17…), divisi tra alimenti, inalanti e altri.
  Si compilano solo gli allergeni dosati; altri estratti si aggiungono a mano.
- **IgE molecolari**: si sceglie la piattaforma e si cliccano **solo i componenti positivi**, poi si scrive il valore.
  - ImmunoCAP ISAC E112i: 112 componenti, ISU-E, < 0,3 non rilevabile (semiquantitativo).
  - ALEX² Allergy Xplorer: 178 componenti molecolari (5 solo per ricerca), kUA/L, < 0,3 negativo/incerto.
    Gli estratti di ALEX² si registrano come IgE specifiche.
  - ImmunoCAP singoli componenti: kUA/L, cut-off 0,35.
  - La casella «tutti gli altri componenti del pannello sono non rilevabili» aggiunge nel referto la frase
    corrispondente (con il cut-off della piattaforma).
- Ogni riga salva `metodica` e `data_prelievo` (data del laboratorio); la data di registrazione è quella della
  visita, così il referto di quel giorno riporta gli esami.
- **Referto**: IgE totali; IgE specifiche in due tabelle (alimenti / inalanti); componenti molecolari in una tabella
  divisa in Alimenti, Inalanti e Altri (lattice, veleni, CCD) con fonte, famiglia proteica e valore. Solo valori:
  nessun giudizio di rischio automatico. La famiglia proteica è un dato descrittivo della molecola.
- Catalogo in `packages/shared/src/molecolare.ts`, verificato contro gli elenchi ufficiali
  (ISAC E112i: 112; ALEX²: 177 + 5 RUO). Cor a 1.0401 (nocciola, alimento) e Cor a 1.0101/0103 (polline) sono distinti.
