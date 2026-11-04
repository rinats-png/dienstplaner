/* ==========================================================================
   INTELLIGENCE — FELDKATALOG DES FAKTENPAKETS (WP-I11)

   Jedes Feld, das je in einem Faktenpaket stehen kann, steht hier — mit Art
   des Werts, Einheit, Subjekt und Herkunft. Was nicht hier steht, kann kein
   Fakt werden: Das Schema des Faktenpakets lässt für `feld` nur diese Namen
   zu (schemas.mjs), und die Positivliste je Funktion (positivliste.mjs)
   wählt daraus aus.

   Herkunft:
   - "sicht":     der Bildner (faktenpaket.mjs) liest das Feld selbst aus der
                  Sicht der auslösenden Rolle (sicht.mjs / bestandFuerRolle).
   - "berechnet": kommt aus einer Faktenquelle (Rechenkern, WP-I12) und wird
                  beim Einlesen geprüft (Art, Subjekt in der Sicht, Leck).

   Subjekt:
   - "person"   → Alias P_…   (nie Kennung, nie Name)
   - "einheit"  → Alias E_…
   - "objekt"   → Alias O_…   (Standort, Objekt, Posten)
   - "sache"    → keine Person: Dienstart, Regel, Kennzahl, Qualifikation —
                  steht als Kennung in `ref`.

   Bewusst NICHT im Katalog (und damit nie im Paket): Namen, Kürzel,
   Personalnummer, Kontaktdaten, Anschrift, Geburtsdatum, Ein-/Austritt,
   Abwesenheitsart und -grund, Mutterschutz, Schwerbehinderung,
   Einschränkungen und Planungsregeln der Person (verraten die Ursache),
   Einwilligungen, Notizen und jeder Freitext, Stempel- und Ist-Zeiten,
   Standortdaten, Zugangs-, Kalender- und Push-Daten, Lohn und Vertrag.

   Änderungen nur per Code-Review: pruefungen/intelligence-positivliste.test.js
   hält den Katalog als Abdruck fest.
   ========================================================================== */

/** @typedef {{ art: string, einheit?: string, subjekt: "person"|"einheit"|"objekt"|"sache", personOptional?: boolean, herkunft: "sicht"|"berechnet", zweck: string }} FeldDef */

/** @type {Readonly<Record<string, Readonly<FeldDef>>>} */
export const FELDER = deepFreeze({
  /* --- Dienstarten (keine Personen) --- */
  "dienstart.beginn": { art: "zeit", subjekt: "sache", herkunft: "sicht", zweck: "Beginn einer Dienstart (ref = Dienstart)" },
  "dienstart.ende": { art: "zeit", subjekt: "sache", herkunft: "sicht", zweck: "Ende einer Dienstart (ref = Dienstart)" },
  "dienstart.dauer": { art: "zahl", einheit: "min", subjekt: "sache", herkunft: "sicht", zweck: "Dauer der Dienstart in Minuten, über Mitternacht gerechnet" },
  "zyklus.tag": { art: "kennung", subjekt: "sache", herkunft: "sicht", zweck: "Dienst an Tag n der Schichtfolge (ref = n)" },
  "qualifikation.vorhanden": { art: "wahr", subjekt: "sache", herkunft: "sicht", zweck: "Qualifikation im Katalog des Betriebs (ohne reine Statusnachweise)" },

  /* --- Einheiten --- */
  "einheit.vorhanden": { art: "wahr", subjekt: "einheit", herkunft: "sicht", zweck: "Einheit existiert (Alias)" },
  "einheit.pool": { art: "wahr", subjekt: "einheit", herkunft: "sicht", zweck: "Einheit ist Springer-Pool" },

  /* --- Personen (immer als Alias) --- */
  "person.vorhanden": { art: "wahr", subjekt: "person", herkunft: "sicht", zweck: "Person im Umfang des Pakets (Alias)" },
  "person.einheit": { art: "wahr", subjekt: "person", herkunft: "sicht", zweck: "Person gehört zur Einheit (bezugAlias), Stand Bereich/Zugehörigkeit" },
  "person.wochenstunden": { art: "zahl", einheit: "h", subjekt: "person", herkunft: "sicht", zweck: "vertragliche Wochenstunden (Regelbedarf Stundenkonto)" },
  "person.teilzeit": { art: "wahr", subjekt: "person", herkunft: "sicht", zweck: "Teilzeit ja/nein" },
  "person.springer": { art: "wahr", subjekt: "person", herkunft: "sicht", zweck: "Springer ja/nein" },
  "person.schichtdienst": { art: "wahr", subjekt: "person", herkunft: "sicht", zweck: "im Schichtdienst ja/nein" },
  "person.qualifikation": { art: "kennung", subjekt: "person", herkunft: "sicht", zweck: "Qualifikation der Person (ohne reine Statusnachweise wie Impfschutz)" },

  /* --- Plan --- */
  "schicht.dienst": { art: "kennung", subjekt: "person", herkunft: "sicht", zweck: "eingeteilter Dienst an einem Tag (Abweichung im Plan)" },
  "schicht.frei": { art: "wahr", subjekt: "person", herkunft: "sicht", zweck: "ausdrücklich frei eingeteilt" },
  "abwesenheit.zeitraum": { art: "zustand", subjekt: "person", herkunft: "sicht", zweck: "abwesend von–bis; immer nur „abwesend“, nie Art oder Grund" },

  /* --- Berechnet (Rechenkern, WP-I12) --- */
  "befund.regel": { art: "kennung", subjekt: "sache", personOptional: true, herkunft: "berechnet", zweck: "Regelbefund (Kennung; Schutzbefunde neutral „schutz“)" },
  "befund.stufe": { art: "zustand", subjekt: "sache", personOptional: true, herkunft: "berechnet", zweck: "Stufe des Befunds: hinweis, achtung, recht" },
  "kandidat.zulaessig": { art: "wahr", subjekt: "person", herkunft: "berechnet", zweck: "Ersatzkandidat ohne Befund" },
  "kandidat.spielraum": { art: "zahl", einheit: "min", subjekt: "person", herkunft: "berechnet", zweck: "Near-Miss: fehlender Spielraum in Minuten" },
  "kandidat.hinderung": { art: "kennung", subjekt: "person", herkunft: "berechnet", zweck: "Near-Miss: hindernde Regel (Kennung)" },
  "konto.saldo": { art: "zahl", einheit: "h", subjekt: "person", herkunft: "berechnet", zweck: "Stundenkonto (Plan, nicht Ist)" },
  "ruhezeit.ist": { art: "zahl", einheit: "min", subjekt: "person", herkunft: "berechnet", zweck: "geplante Ruhezeit vor dem Dienst" },
  "aenderung.art": { art: "zustand", subjekt: "person", herkunft: "berechnet", zweck: "Planänderung: neu, geaendert, entfernt" },
  "besetzung.ist": { art: "zahl", einheit: "personen", subjekt: "einheit", herkunft: "berechnet", zweck: "eingeteilte Personen je Dienst und Tag" },
  "besetzung.soll": { art: "zahl", einheit: "personen", subjekt: "einheit", herkunft: "berechnet", zweck: "Mindest-/Sollbesetzung je Dienst und Tag" },
  "kennzahl.wert": { art: "zahl", subjekt: "sache", herkunft: "berechnet", zweck: "Kennzahl ohne Personenbezug (ref = Kennzahl)" },
  "regel.art": { art: "kennung", subjekt: "sache", herkunft: "berechnet", zweck: "Regelart des Baukastens (ref = Regel)" },
});

export const FELDNAMEN = Object.freeze(Object.keys(FELDER));

/** @template T @param {T} o @returns {T} */
export function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.getOwnPropertyNames(o)) deepFreeze(o[k]);
  }
  return o;
}
