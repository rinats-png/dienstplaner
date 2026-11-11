/* ==========================================================================
   KONTOWIEDERHERSTELLUNG — Halter für einmalig angezeigte Werte (WR-6, Review M1)

   Das neue Geheimnis des zweiten Faktors, die neuen Wiederherstellungscodes und das Abschlusstoken erscheinen genau
   einmal. Gehen sie verloren (Einklappen, Schließen, neuer Aufbau der Maske), ist das Token verbraucht und die Einrichtung
   nicht überschreibbar: die Person müsste 15 Minuten warten und einen neuen Fall mit zwei Leitungen eröffnen.

   Deshalb liegen diese Werte nicht im Zustand eines Bausteins, sondern im Arbeitsspeicher dieses Halters (Modul, keine
   Ablage im Browser, kein localStorage, keine Adresse). Er überlebt das Einklappen und den Neuaufbau der Ansicht und gibt
   die Werte nur frei, wenn die Person es ausdrücklich bestätigt oder die Frist abläuft; mit dem Neuladen der Seite ist er leer.
   Solange einer dieser Werte sichtbar ist, sperrt `schliessenErlaubt` das Einklappen und Schließen.
   ========================================================================== */
import { ANTRAG_STUNDEN, TOKEN_MINUTEN } from "./verlustweg.js";

/** Wie lange ein Wert höchstens gehalten wird (ms). Die Fallnummer gilt so lange wie der Antrag. */
export const FRIST = Object.freeze({
  einrichtung: TOKEN_MINUTEN * 60 * 1000,
  codes: 15 * 60 * 1000,
  freigabe: TOKEN_MINUTEN * 60 * 1000,
  fall: ANTRAG_STUNDEN * 60 * 60 * 1000,
});
/** Werte, bei denen Einklappen und Schließen gesperrt sind: einmalig und nicht wieder anzeigbar. */
export const EINMALIG = Object.freeze(["einrichtung", "codes", "freigabe"]);

const LEER = Object.freeze({ einrichtung: null, codes: null, freigabe: null, fall: null, abgelaufen: null });

/** Darf die Ansicht eingeklappt oder geschlossen werden? Nein, solange ein Einmalwert sichtbar ist. */
export const schliessenErlaubt = (stand) => !EINMALIG.some((k) => stand && stand[k]);
/** Welcher Weg hält einen Einmalwert? "traeger" (Geheimnis, Codes), "leitung" (Token) oder null. */
export const haltenderWeg = (stand) => (stand && (stand.einrichtung || stand.codes) ? "traeger" : stand && stand.freigabe ? "leitung" : null);

/**
 * @param {{setzen?: typeof setTimeout, loeschen?: typeof clearTimeout}} [t]  Zeitgeber (Prüfungen)
 */
export function halterNeu(t = {}) {
  const setzeTimer = (...a) => (t.setzen || setTimeout)(...a), loescheTimer = (...a) => (t.loeschen || clearTimeout)(...a);   // zur Laufzeit gewählt
  let stand = LEER;
  const timer = {};
  const hoerer = new Set();
  const melden = () => { for (const f of [...hoerer]) f(); };
  const stoppen = (k) => { if (timer[k]) { loescheTimer(timer[k]); timer[k] = null; } };
  const lesen = () => stand;
  /** Einen Wert halten (null: freigeben). Nach der Frist verschwindet er und `abgelaufen` nennt ihn. */
  function setzen(k, wert) {
    if (!(k in FRIST)) throw new Error("unbekannter Schlüssel");
    stoppen(k);
    stand = { ...stand, [k]: wert ?? null, abgelaufen: null };
    if (wert) {
      timer[k] = setzeTimer(() => { timer[k] = null; stand = { ...stand, [k]: null, abgelaufen: k }; melden(); }, FRIST[k]);
      if (timer[k] && typeof timer[k].unref === "function") timer[k].unref();
    }
    melden();
  }
  /** Alles freigeben (ausdrückliche Bestätigung, Abmelden). */
  function leeren() { for (const k of Object.keys(FRIST)) stoppen(k); stand = LEER; melden(); }
  /** Den Hinweis „abgelaufen" quittieren. */
  function quittieren() { if (stand.abgelaufen) { stand = { ...stand, abgelaufen: null }; melden(); } }
  function abonnieren(f) { hoerer.add(f); return () => { hoerer.delete(f); }; }
  return { lesen, setzen, leeren, quittieren, abonnieren };
}

/** Der eine Halter der Anwendung. */
export const halter = halterNeu();
