"""Genera packages/shared/src/crescita-oms-bmi.ts (IMC/BMI per età e peso per lunghezza, OMS).

Uso:
  curl -L -o anthro.rda https://raw.githubusercontent.com/WorldHealthOrganization/anthro/master/R/sysdata.rda
  curl -L -o anthroplus.rda https://raw.githubusercontent.com/WorldHealthOrganization/anthroplus/main/R/sysdata.rda
  python3 supabase/strumenti/leggi_rda.py anthro.rda anthro.json
  python3 supabase/strumenti/leggi_rda.py anthroplus.rda anthroplus.json
  python3 supabase/strumenti/genera_oms_bmi.py anthro.json anthroplus.json packages/shared/src/crescita-oms-bmi.ts
"""
import json, sys

GIORNI_PER_MESE = 30.4375

def colonne(x):
    return dict(zip(x['__a']['names'], x['__v']))

anthro = json.load(open(sys.argv[1]))
plus = json.load(open(sys.argv[2]))
bmi = colonne(anthro['growthstandards_bmianthro'])       # età in giorni, 0–1856
bfa = colonne(plus['bfa_growth_standards'])                # età in mesi, 60–229
wfl = colonne(anthro['growthstandards_wflanthro'])         # lunghezza 45–110 cm

def num(v):
    return repr(round(v, 6)).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)

r = [
    "// Parametri LMS dell'Organizzazione Mondiale della Sanità per l'indice di massa corporea (IMC/BMI)",
    "// e per il peso rispetto alla lunghezza. GENERATO AUTOMATICAMENTE da supabase/strumenti/genera_oms_bmi.py:",
    "// non modificare a mano. Fonte: tabelle ufficiali dei pacchetti OMS 'anthro' (WHO Child Growth",
    "// Standards 2006: BMI 0–60 mesi, peso per lunghezza 45–110 cm) e 'anthroplus' (WHO Growth Reference",
    "// 2007: BMI 61–228 mesi), github.com/WorldHealthOrganization.",
    "// BMI: una riga per mese [età in mesi, L, M, S] (0–60 mesi dal giorno arrotondato età×30,4375;",
    "// fino a 23,99 mesi su lunghezza da sdraiato, dai 24 mesi su statura in piedi, come le tabelle OMS).",
    "// Peso per lunghezza: [lunghezza in cm, L, M, S] a passo di 0,1 cm (misura da sdraiato, sotto i 2 anni).",
    "",
    "import type { RigaLms } from './crescita-oms';",
    "",
]
out_bmi = {}
for sesso, codice in (('M', 1), ('F', 2)):
    righe = []
    perGiorno = {bmi['age'][i]: i for i in range(len(bmi['age'])) if bmi['sex'][i] == codice}
    for m in range(0, 61):
        # Dai 24 mesi l'OMS usa la statura in piedi (giorno 731 in poi): niente valori «da sdraiato» a 24 mesi.
        giorno = round(m * GIORNI_PER_MESE)
        i = perGiorno[max(giorno, 731) if m >= 24 else giorno]
        if m == 24:
            # Ultimo valore «da sdraiato» (giorno 730) a 23,99 mesi: tra 23 e 24 mesi non si mescolano le due curve.
            j = perGiorno[730]
            righe.append((23.99, bmi['l'][j], bmi['m'][j], bmi['s'][j]))
        righe.append((m, bmi['l'][i], bmi['m'][i], bmi['s'][i]))
    perMese = {bfa['age'][i]: i for i in range(len(bfa['age'])) if bfa['sex'][i] == codice}
    for m in range(61, 229):
        i = perMese[m]
        righe.append((m, bfa['l'][i], bfa['m'][i], bfa['s'][i]))
    out_bmi[sesso] = righe
r.append("export const LMS_OMS_BMI: Record<'M' | 'F', readonly RigaLms[]> = {")
for s in ('M', 'F'):
    r.append(f"  {s}: [" + ','.join('[' + ','.join(num(x) for x in riga) + ']' for riga in out_bmi[s]) + "],")
r.append("};")
r.append("")
r.append("export const LMS_OMS_PESO_LUNGHEZZA: Record<'M' | 'F', readonly RigaLms[]> = {")
for s, codice in (('M', 1), ('F', 2)):
    righe = [(wfl['length'][i], wfl['l'][i], wfl['m'][i], wfl['s'][i]) for i in range(len(wfl['length'])) if wfl['sex'][i] == codice]
    righe.sort()
    r.append(f"  {s}: [" + ','.join('[' + ','.join(num(x) for x in riga) + ']' for riga in righe) + "],")
r.append("};")
open(sys.argv[3], 'w').write('\n'.join(r) + '\n')
