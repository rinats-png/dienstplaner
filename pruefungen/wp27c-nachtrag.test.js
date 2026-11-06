/* ==========================================================================
   WP-27c — Betriebsrat-Auswertung, Nachtrag

   Vier Punkte aus dem Nachtrag (work-packages.json, WP-27c):
   1. Aufräumen von −2 — OFFEN: Die Auslegung ist nicht eindeutig; Frage in
      docs/acc45/wp-kleinpakete-fragen.md. Hier nicht geändert.
   2. Ungeplanter Dienst sperrt die Gesamtzeile — geprüft: Ein ungeplant
      bestätigter Dienst zählt als Beitrag; trägt die Einheit nur 1–2 Personen
      bei, fällt das Ist der Gesamtzeile weg (Zweitsperre). Kein Personenbezug.
   3. Rufbereitschaft im Ist — bereits in br-auswertung.test.js (WP-27b B5c).
   4. Test Weiterleitung — bereits in istdaten.test.js (src/istdaten.js ist
      nur die Weiterleitung auf server/lib/istdaten.mjs).

   Aufruf: npx vitest run pruefungen/wp27c-nachtrag.test.js
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { betriebsratAuswertung } from "../server/lib/br-auswertung.mjs";

const TAG = "2026-05-12";     // Dienstag: Plan vorhanden
const SA = "2026-05-16";     // Samstag: kein Plan, nur ungeplante Dienste
const SPAET = "2026-06-20";  // Mai ist eingefroren (Frist vorbei)
const FRUEH_DIENST = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 };

const person = (id, einheit) => ({
  id, vorname: "V", nachname: `NAME-${id}`, rolle: "mitarbeiter", bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }],
});

/** Einheit A: drei Personen mit bestätigtem Plan-Ist. Einheit B: `bUngeplant` Personen mit ungeplanten Diensten am Samstag. */
function betrieb(bUngeplant) {
  const personen = [], erfassung = {};
  for (let i = 0; i < 3; i++) {
    personen.push(person(`a${i}`, "A"));
    erfassung[`a${i}|${TAG}`] = { start: "06:00", ende: "15:00", bestaetigt: true };
  }
  for (let i = 0; i < bUngeplant; i++) {
    personen.push(person(`b${i}`, "B"));
    erfassung[`b${i}|${SA}`] = { start: "08:00", ende: "12:00", bestaetigt: true, ungeplant: true };
  }
  return {
    id: "m1", name: "Haus", einheiten: [{ id: "A", versatzTage: 0 }, { id: "B", versatzTage: 0 }],
    dienstarten: [FRUEH_DIENST], zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05",
    einstellungen: {}, personen, abweichungen: {}, erfassung, abwesenheiten: [], nachrichten: [],
    anfragen: [], bestaetigungen: [],
  };
}

const zeile = (w, eid) => w.zeilen.find((r) => r.monat === "2026-05" && r.einheitId === eid);

describe("WP-27c Punkt 2: ungeplanter Dienst und die Gesamtzeile", () => {
  it("zwei Beitragende allein aus ungeplanten Diensten sperren das Ist der Gesamtzeile", () => {
    const w = betriebsratAuswertung(betrieb(2), SPAET);
    expect(zeile(w, "A").istStunden).toBe(25.5);
    expect(zeile(w, "B").gesperrt).toBe(true);                             // Mindestgruppe 3: keine Zahl
    const gesamt = zeile(w, null);
    expect(gesamt.gesperrt).toBe(true);                                    // die Gesamtzeile des Monats ist gesperrt
    expect(gesamt.istStunden).toBeUndefined();                             // ohne Zahl, auch ohne Ist
    expect(gesamt.istErfasst).toBeUndefined();
  });

  it("drei Beitragende aus ungeplanten Diensten: die Gesamtzeile zeigt die Summe", () => {
    const w = betriebsratAuswertung(betrieb(3), SPAET);
    expect(zeile(w, "B").istErfasst).toBe(3);
    expect(zeile(w, null).istStunden).toBeGreaterThan(zeile(w, "A").istStunden);
    expect(zeile(w, null).istStunden).not.toBeNull();
  });

  it("kein Personenbezug unter der Mindestgruppe: Namen der Zwei-Personen-Einheit erscheinen nie", () => {
    const w = betriebsratAuswertung(betrieb(2), SPAET);
    const text = JSON.stringify(w);
    expect(text).not.toContain("NAME-b0");
    expect(text).not.toContain("NAME-b1");
  });
});
