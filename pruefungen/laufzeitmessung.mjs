/* ==========================================================================
   LAUFZEITMESSUNG FÜR „KEIN RECHENBLOCK ÜBER 50 MS“ (Nachtrag WP-22b)

   Ein einzelner längster Block misst auch die Maschine: Auf einem belasteten
   Rechner (parallele Prüfdateien, andere Prozesse) hält das Betriebssystem
   den Prozess mitunter 30–60 ms an — auch eine reine Rechenschleife ohne
   Speicherbedarf. Darum:
   - Aufwärmen (JIT) vor der Messung, dann mehrere Läufe, gewertet der Median
     des längsten Blocks je Lauf (Grenze bleibt 50 ms);
   - dazu die Verteilung der Häppchen (Quantil), die das Nachgeben selbst
     belegt und gegen einzelne Ausreißer unempfindlich ist;
   - und eine Eichung der Umgebung: dieselbe Häppchengröße als reine
     Rechenschleife. Lokal wird ein Überschreiten nur dann zur Warnung, wenn
     schon die Eichung über der Grenze lag; in CI bleibt es hart.
   ========================================================================== */

/** @param {number[]} xs */
export const median = (xs) => quantil(xs, 0.5);

/** @param {number[]} xs @param {number} q 0..1 */
export function quantil(xs, q) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

/**
 * Längster Block einer reinen Rechenschleife in Häppchen von `haeppchenMs`:
 * was die Umgebung allein an Anhalten beiträgt.
 * @param {number} haeppchenMs
 * @param {number} [schritte]
 */
export function umgebungLaengsterBlock(haeppchenMs, schritte = 150) {
  let laengster = 0;
  let x = 0;
  for (let s = 0; s < schritte; s++) {
    const a = performance.now();
    while (performance.now() - a < haeppchenMs) x += Math.sqrt(x + 1);
    laengster = Math.max(laengster, performance.now() - a);
  }
  return x >= 0 ? laengster : 0;
}

/**
 * Urteil über den Median der längsten Blöcke: in CI hart, lokal nur dann
 * eine Warnung, wenn die Umgebung selbst über der Grenze liegt.
 * @param {number} wert gemessener Median
 * @param {number} grenze
 * @param {number} haeppchenMs
 * @returns {{ ok: boolean, warnung?: string }}
 */
export function urteil(wert, grenze, haeppchenMs) {
  if (wert < grenze) return { ok: true };
  if (process.env.CI) return { ok: false };
  const umgebung = umgebungLaengsterBlock(haeppchenMs);
  if (umgebung >= grenze - haeppchenMs)
    return { ok: true, warnung: `WARNUNG: längster Block ${wert.toFixed(1)} ms, aber schon die reine Rechenschleife hielt ${umgebung.toFixed(1)} ms an (belastete Maschine) — in CI wäre das rot` };
  return { ok: false };
}
