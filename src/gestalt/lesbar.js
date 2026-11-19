/* ==========================================================================
   LESBARE DIENSTFARBEN IM DUNKELMODUS

   Die Farben von Dienstarten, Einheiten und Qualifikationen sind Daten und
   bleiben es. Sie wurden für hellen Grund gewählt (Nacht, Früh …). Steht dieselbe Farbe als Schrift oder als Kantenlinie auf dem
   dunklen Kartengrund, verschwindet sie (Nacht: 1,1 : 1). Geändert wird
   deshalb nur die Darstellung: Die Farbe wird zum Weiß hin aufgehellt, bis
   sie den geforderten Kontrast zum Grund erreicht. Ton und Bedeutung bleiben
   erkennbar; gespeichert wird nichts.

   Regel (auch im Kontrasttest geprüft):
     Schrift          mindestens 4,5 : 1 zum Kartengrund
     Kante / Symbol   mindestens 3   : 1 zum Kartengrund
   Im hellen Erscheinungsbild wird nichts verändert.
   ========================================================================== */

const HEX = /^#([0-9a-f]{6})$/i;

const kanaele = (hex) => {
  const m = HEX.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const zuHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const linear = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const leuchte = (rgb) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);

/** WCAG-Kontrastverhältnis zweier Farben (#rrggbb); null bei anderen Formaten. */
export function kontrastVon(a, b) {
  const x = kanaele(a), y = kanaele(b);
  if (!x || !y) return null;
  const la = leuchte(x), lb = leuchte(y);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Hellt `farbe` zum Weiß hin auf, bis sie `mindest` : 1 zu `grund` erreicht.
 * Reicht die Farbe schon, kommt sie unverändert zurück.
 */
export function aufhellenBis(farbe, grund, mindest = 4.5) {
  const f = kanaele(farbe);
  if (!f || !kanaele(grund)) return farbe;
  if (kontrastVon(farbe, grund) >= mindest) return farbe;
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    const mix = zuHex(f.map((v) => v + (255 - v) * t));
    if (kontrastVon(mix, grund) >= mindest) return mix;
  }
  return zuHex([255, 255, 255]);
}
