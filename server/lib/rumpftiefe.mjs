/* ==========================================================================
   TIEFENDECKEL FÜR DEN RUMPF EINER ANFRAGE (WP-19.5, Review #502 H1)

   JSON.parse nimmt jede Verschachtelungstiefe an (V8 parst iterativ). Danach
   laufen rekursive Funktionen über den Rumpf: `gleich`/`stabil`
   (branchenmodule.mjs), JSON.stringify beim Schreiben, die Schreibwege der
   Module. Ab etwa 3000 Ebenen wirft V8 dort RangeError (Stack). Das traf nur
   die eine Anfrage (kein Datenschaden), endete aber als Serverfehler statt als
   Fehler des Aufrufers.

   Darum misst der Eingang die Tiefe einmal, iterativ (eigener Stapel, keine
   Rekursion), und weist zu tiefe Rümpfe mit 400 ab, bevor irgendeine
   rekursive Funktion läuft.

   Grenze 64 (Messung 2026-11-23): 2964 gültige Rümpfe aus 47 Handler-Suiten
   (Module, Bestand, Teilweg, Sicherung, Wiederherstellen, Stempeln) haben
   höchstens 10 Ebenen; die tiefste JSON-Datei im Repo (Bestands-Fixture)
   hat 13. Nur ein Angriffstest (wp48-teilweg, 200000 Ebenen) lag darüber. Ein Bestand ist flach gebaut: { bestand: { mandanten: [
   { einstellungen: { branchenmodule: { <modul>: { parameter: { … } } } } } ] } }.
   64 lässt rund das Fünffache Spielraum und bleibt weit unter der
   Stackgrenze (etwa 3000).
   ========================================================================== */

/** Höchste Verschachtelungstiefe eines Rumpfs (Objekte und Listen zählen je eine Ebene). */
export const RUMPF_TIEFE_MAX = 64;

/* Nachtrag (Review #505 A1): Alle Rumpfleser nutzen dieselbe Prüfung und denselben Antwortrumpf (Status 400):
   daten.mjs, import.mjs, kalender.mjs, einladung.mjs, anmeldung.mjs, registrierung.mjs, zustellung.mjs,
   hilfe.mjs, einrichten.mjs, starten.mjs. Jeder Leser prüft direkt nach JSON.parse bzw. req.json() und vor
   jeder Verwendung des Rumpfs. Messung und Begründung der Grenze je Leser: docs/acc45/TIEFENDECKEL-RUMPFLESER.md. */

/** Einheitlicher Antwortrumpf (Status 400) für einen zu tief verschachtelten Rumpf. */
export const zuTiefRumpf = () => ({ fehler: "Der Rumpf ist zu tief verschachtelt.",
  text: `Höchstens ${RUMPF_TIEFE_MAX} Ebenen sind vorgesehen.` });

/**
 * Ist `wert` tiefer verschachtelt als `grenze`? Iterativ, ohne Rekursion; bricht beim ersten Treffer ab.
 * Tiefe: ein Wert ohne Objekt/Liste hat 0, `{}` und `[]` haben 1, jede weitere Schachtel zählt eins dazu.
 * @param {unknown} wert @param {number} [grenze]
 * @returns {boolean}
 */
export function zuTief(wert, grenze = RUMPF_TIEFE_MAX) {
  if (!wert || typeof wert !== "object") return false;
  /* Review #505 H1: zwei parallele Stapel statt Paar-Listen und for-in statt Object.values — keine
     Zwischenlisten je Knoten. Für Werte aus JSON.parse dasselbe Ergebnis: nur eigene, aufzählbare
     Zeichenketten-Schlüssel (JSON.parse legt nie geerbte aufzählbare Schlüssel an). */
  /** @type {any[]} */
  const werte = [wert];
  /** @type {number[]} */
  const tiefen = [1];
  while (werte.length) {
    const x = werte.pop();
    const t = /** @type {number} */ (tiefen.pop());
    if (t > grenze) return true;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length; i++) { const k = x[i]; if (k && typeof k === "object") { werte.push(k); tiefen.push(t + 1); } }
    } else {
      for (const s in x) { const k = x[s]; if (k && typeof k === "object") { werte.push(k); tiefen.push(t + 1); } }
    }
  }
  return false;
}

/**
 * Tiefe eines Werts (für Messung und Prüfungen). Iterativ.
 * @param {unknown} wert @returns {number}
 */
export function rumpfTiefe(wert) {
  if (!wert || typeof wert !== "object") return 0;
  let max = 0;
  /** @type {Array<[any, number]>} */
  const stapel = [[wert, 1]];
  while (stapel.length) {
    const [x, t] = /** @type {[any, number]} */ (stapel.pop());
    if (t > max) max = t;
    const kinder = Array.isArray(x) ? x : Object.values(x);
    for (const k of kinder) if (k && typeof k === "object") stapel.push([k, t + 1]);
  }
  return max;
}
