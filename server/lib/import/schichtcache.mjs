/* ==========================================================================
   IMP-6 — Zwischenspeicher für das Ergebnis der Schichtmodell-Analyse (nur Arbeitsspeicher, nichts wird gespeichert)

   Die Vorschau rechnet exakt dasselbe wie die Analyse (gleiche Funktion, gleiche Eingaben). Ohne Zwischenspeicher blockiert
   jeder der beiden Schritte bei 10.000 Zeilen die Ereignisschleife etwa 1,3 bis 2,7 Sekunden. Hier wird das Ergebnis je Vorgang
   gehalten, solange die Eingaben gleich sind.

   Regeln:
   - Schlüssel: Raum, Vorgang-Id und ein Inhaltshash (Modelltabelle, Zuordnungstabelle, Spaltenzuordnung, Dienstarten und Personen
     des Betriebs). Ändert sich irgendetwas davon, passt der Hash nicht mehr und es wird neu gerechnet.
   - Je Vorgang höchstens ein Eintrag; je Raum höchstens 20, gesamt höchstens 200 (der älteste fliegt zuerst raus).
   - Lebensdauer wie die Inaktivitätsfrist des Vorgangs (30 Minuten); der Eintrag wird zusammen mit dem Vorgang verworfen
     (Übernahme, Verwerfen, Ablauf: vorgaenge.mjs ruft `schichtErgebnisVerwerfen`).
   - Inhalt: nur das fertige Vorschau-Ergebnis, das der Vorgang ohnehin als Antwort an dieselbe Person liefert (keine
     Rohzeilen, keine Namen, keine Personalnummern; Hashwerte des Rohinhalts sind nicht umkehrbar). Das Ergebnis hängt nur von den
     Daten ab, nicht von Rolle oder Sitzung (die Rolle wird vorher im Handler geprüft, jeder Aufruf geht zusätzlich durch die Bremse).
   - Ein Treffer umgeht weder die Zeilenobergrenze noch die Bremse: beide greifen im Handler und in der Vorprüfung VOR dem Hash.
   - Das Ergebnis wird bei Ablage und bei Treffer kopiert; ein Aufrufer kann den Zwischenspeicher nicht verändern.
   ========================================================================== */

export const CACHE_GRENZEN = Object.freeze({ jeRaum: 20, gesamt: 200, lebensdauerMs: 30 * 60 * 1000 });

/** @type {Map<string, { raum: string, id: string, hash: string, ergebnis: any, bis: number }>} */
const EINTRAEGE = new Map();
const schluessel = (raum, id) => `${raum}\u0000${id}`;
const kopie = (x) => structuredClone(x);

/** Zähler nur für die Prüfung. */
export const _zaehler = { berechnungen: 0, treffer: 0 };

function ablaufen(jetzt) { for (const [k, e] of EINTRAEGE) if (e.bis <= jetzt) EINTRAEGE.delete(k); }

/** Ergebnis holen, wenn Raum, Vorgang und Inhaltshash übereinstimmen und der Eintrag noch gilt; sonst null. */
export function schichtErgebnisHolen(raum, id, hash, jetzt = Date.now()) {
  const e = EINTRAEGE.get(schluessel(raum, id));
  if (!e) return null;
  if (e.bis <= jetzt) { EINTRAEGE.delete(schluessel(raum, id)); return null; }
  if (e.raum !== raum || e.id !== id || e.hash !== hash) return null;
  _zaehler.treffer += 1;
  return kopie(e.ergebnis);
}

/** Ergebnis ablegen (ersetzt den früheren Eintrag desselben Vorgangs) und die Grenzen einhalten. */
export function schichtErgebnisMerken(raum, id, hash, ergebnis, jetzt = Date.now()) {
  ablaufen(jetzt);
  const k = schluessel(raum, id);
  EINTRAEGE.delete(k);   // ersetzen und ans Ende (= jüngster)
  EINTRAEGE.set(k, { raum, id, hash, ergebnis: kopie(ergebnis), bis: jetzt + CACHE_GRENZEN.lebensdauerMs });
  let imRaum = 0;
  for (const e of EINTRAEGE.values()) if (e.raum === raum) imRaum += 1;
  for (const [ek, e] of EINTRAEGE) {
    if (imRaum <= CACHE_GRENZEN.jeRaum) break;
    if (e.raum === raum) { EINTRAEGE.delete(ek); imRaum -= 1; }
  }
  while (EINTRAEGE.size > CACHE_GRENZEN.gesamt) EINTRAEGE.delete(EINTRAEGE.keys().next().value);
}

/** Den Eintrag eines Vorgangs verwerfen (Übernahme, Verwerfen, Ablauf). Die Id allein reicht: Vorgang-Ids sind zufällig und einmalig. */
export function schichtErgebnisVerwerfen(id) {
  for (const [k, e] of EINTRAEGE) if (e.id === id) EINTRAEGE.delete(k);
}

export const _cacheAnzahl = () => EINTRAEGE.size;
export const _cacheAnzahlRaum = (raum) => { let n = 0; for (const e of EINTRAEGE.values()) if (e.raum === raum) n += 1; return n; };
export const _cacheZuruecksetzen = () => { EINTRAEGE.clear(); _zaehler.berechnungen = 0; _zaehler.treffer = 0; };
