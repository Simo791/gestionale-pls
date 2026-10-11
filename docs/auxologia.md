# Modulo Auxologia pediatrica

Ambulatorio di auxologia ed endocrinologia pediatrica: crescita, pubertà, età ossea, test e
terapia con ormone della crescita (GH). Stessa architettura del modulo Allergologia.

## Accesso
- Si attiva da **Amministrazione › Moduli specialistici** (o dalla pagina Auxologia, se sei amministratore).
- Lo usano gli **amministratori** e i medici **accettati**: pediatri, sostituti o il nuovo ruolo
  **«Pediatra auxologo»**, che vede solo questo modulo. La segreteria non è abilitabile; un allergologo
  non si abilita all'Auxologia (e viceversa).
- Anagrafica pazienti **separata** dagli assistiti (codice fiscale cifrato, lettura registrata);
  dati clinici solo con pseudonimo; nessuna cancellazione; ogni modifica nel registro accessi.

## Dati e controlli del database
| Dato | Controlli |
|---|---|
| Misure (statura, peso, CC, vita, seduto, braccia, PA) | intervalli plausibili; età calcolata dal database (giorni/365,25) e non modificabile; mai prima della nascita o nel futuro; posizione sdraiato/in piedi (predefinita come l'OMS: sdraiato fino a 730 giorni); BMI calcolato |
| Stadi di Tanner | B e menarca solo nelle femmine, G e volumi testicolari solo nei maschi; volumi dell'orchidometro di Prader |
| Età ossea | metodo (Greulich-Pyle, TW3…), previsione di statura solo con il metodo indicato |
| Test di stimolo del GH | soglia della Nota AIFA 39 calcolata dallo stimolo: 8 µg/L, 20 µg/L con GHRH + arginina |
| Genitori | target genetico calcolato (Tanner: (padre + madre ± 13)/2, ± 8,5 cm) |
| Visite | autore = chi registra (non modificabile); data tra nascita e oggi |

## Calcoli (packages/shared/src/auxologia.ts, con test)
- **DS e percentili** con metodo LMS: curve italiane SIEDP (Cacciari 2006) dai 2 anni, OMS sotto i 2 anni
  e per la circonferenza cranica; correzione OMS di 0,7 cm tra sdraiato e in piedi.
- **Peso**: classificazione della Consensus SIEDP-SIP 2018 (Valerio et al.) sulle curve OMS: peso per lunghezza
  sotto i 2 anni, BMI dopo; > 85°, > 97°, > 99° percentile con le etichette delle fasce 0–5 e 5–18 anni.
- **Velocità di crescita** su almeno 6 mesi (preferibile un anno) e variazione del DS staturale per anno.
- **Pubertà**: limiti di età per pubertà precoce e ritardata (Klein et al., AAFP 2017).
- **Nota AIFA 39**: promemoria dei criteri auxologici a–e, del laboratorio e SGA, dei limiti di sospensione
  e della dose massima. La velocità in DS si legge sulle tabelle di riferimento e si inserisce a mano
  (il gestionale non contiene tabelle di velocità validate).

Nessuna diagnosi automatica: i calcoli sono un supporto, conclusioni e diagnosi le scrive il medico.

## Referto
Referto della visita con parametri auxologici del giorno (valore, DS, percentile), andamento, età ossea,
accertamenti, curva di crescita con target genetico ed età ossea; versione senza grafico. Si stampa o si
invia ai genitori (email/WhatsApp, link protetto dalla data di nascita) come per le altre visite.

## Fonti
- Cacciari E. et al., J Endocrinol Invest 2006;29:581-93 (parametri dal pacchetto R `childsds`).
- WHO Child Growth Standards 2006 e WHO Growth Reference 2007 (pacchetti OMS `anthro`/`anthroplus`;
  generatore `supabase/strumenti/genera_oms_bmi.py`).
- Valerio G. et al., Ital J Pediatr 2018;44:88.
- Klein D.A. et al., Am Fam Physician 2017;96(9):590-9.
- Nota AIFA 39 (testo vigente sul sito AIFA).
