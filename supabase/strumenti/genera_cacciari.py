"""Genera packages/shared/src/crescita-cacciari.ts dai parametri del pacchetto R 'childsds'.

Uso:
  curl -L -o italian.ref.rda https://raw.githubusercontent.com/mvogel78/childsds/master/data/italian.ref.rda
  python3 supabase/strumenti/leggi_rda.py italian.ref.rda ital.json
  python3 supabase/strumenti/genera_cacciari.py ital.json packages/shared/src/crescita-cacciari.ts
"""
import json, sys

j = json.load(open(sys.argv[1]))['italian.ref']['__a']
nomi = j['refs']['__a']['names']
refs = j['refs']['__v']
scelte = {'altezza': 'heightall', 'peso': 'weightall', 'bmi': 'bmiall'}
r = [
    "// Parametri LMS delle curve di crescita italiane (Cacciari et al., SIEDP 2006), 2–20 anni.",
    "// GENERATO AUTOMATICAMENTE da supabase/strumenti/genera_cacciari.py: non modificare a mano.",
    "// Fonte: Cacciari E, Milani S, Balsamo A, et al. Italian cross-sectional growth charts for height,",
    "// weight and BMI (2 to 20 yr). J Endocrinol Invest 2006;29(7):581-93. Parametri (distribuzione BCCG,",
    "// equivalente al metodo LMS: nu=L, mu=M, sigma=S) come pubblicati nel pacchetto R 'childsds' (italian.ref),",
    "// campione nazionale ('all'). Ogni riga: [età in mesi, L, M, S].",
    "",
    "import type { RigaLms } from './crescita-oms';",
    "",
    "export const LMS_CACCIARI: Record<'peso' | 'altezza' | 'bmi', Record<'M' | 'F', readonly RigaLms[]>> = {",
]
for ind, nome in scelte.items():
    params = refs[nomi.index(nome)]['__a']['params']
    r.append(f"  {ind}: {{")
    for sesso, tab in zip(params['__a']['names'], params['__v']):
        c = dict(zip(tab['__a']['names'], tab['__v']))
        righe = ','.join(f"[{round(a * 12)},{l},{m},{s}]" for a, l, m, s in zip(c['age'], c['nu'], c['mu'], c['sigma']))
        r.append(f"    {'M' if sesso == 'male' else 'F'}: [{righe}],")
    r.append("  },")
r.append("};")
open(sys.argv[2], 'w').write('\n'.join(r) + '\n')
