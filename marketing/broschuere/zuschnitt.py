# Bildausschnitte aus den echten App-Aufnahmen (2x) für die Broschüre
import sys, os
from PIL import Image
A, R, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
# Aufruf: python3 zuschnitt.py <assets_in/screens> <weitere Aufnahmen aus pruefungen/bildersatz.mjs> bild
Z = {
 # Titel: nur der sichtbare Teil (176 × 131 mm bis an den Seitenrand). Ein Bild, das über die Seite
 # hinausragt, lässt Chromium beim Drucken weg.
 "titel_plan_dunkel": (A, "leitung-plan-dunkel.jpg", (0, 0, 2368, 1763)),
 "start":            (A, "leitung-start-hell.jpg", (0, 0, 2880, 1330)),
 "plan":             (A, "leitung-plan-hell.jpg", (0, 260, 2880, 2000)),
 "folge_raster":     (A, "leitung-folge-hell.jpg", (60, 830, 1425, 1680)),
 "folge_werte":      (A, "leitung-folge-hell.jpg", (40, 540, 2830, 810)),
 "pruef_kopf":       (A, "leitung-pruef-hell.jpg", (0, 200, 2880, 1015)),
 "pruef_liste":      (A, "leitung-pruef-hell.jpg", (2135, 1340, 2815, 2045)),
 "pruef_regel":      (A, "leitung-pruef-hell.jpg", (2135, 2080, 2815, 2390)),
 "krank":            (A, "dialog-krankmeldung.jpg", (722, 452, 2158, 1348)),
 "assistent":        (R, "dialog-planungsassistent.jpg", (700, 525, 2180, 1340)),
 "boerse":           (A, "leitung-boerse-hell.jpg", (60, 500, 2065, 1540)),
 "quals":            (A, "leitung-quals-hell.jpg", (60, 880, 2815, 1500)),
 "abrechnung":       (R, "leitung-abrechnung-hell.jpg", (0, 200, 2880, 830)),
 "chip_ppug":        (A, "leitung-untergrenzen-hell.jpg", (40, 872, 1200, 978)),
 "chip_34a":         (A, "leitung-quals-hell.jpg", (96, 1010, 840, 1090)),
 "chip_lenk":        (R, "leitung-lenkzeiten-hell.jpg", (66, 890, 726, 1135)),
 "chip_notruf":      (R, "leitung-notrufe-hell.jpg", (68, 722, 2098, 982)),
 "tel_plan":         (A, "telefon-plan-hell.jpg", None),
 "tel_anliegen":     (A, "telefon-anliegen-hell.jpg", None),
 "tel_heute":        (A, "telefon-heute-hell.jpg", None),
 "tel_heute_karte":  (A, "telefon-heute-hell.jpg", (16, 372, 764, 900)),
 "plan_dunkel_voll": (A, "leitung-plan-dunkel.jpg", (0, 0, 2880, 2880)),
}
for n, (d, f, box) in Z.items():
    im = Image.open(os.path.join(d, f)).convert("RGB")
    if box: im = im.crop(box)
    im.save(os.path.join(OUT, n + ".jpg"), quality=90, optimize=True, progressive=False)
    print(n, im.size)
