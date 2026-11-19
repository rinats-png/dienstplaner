/* ==========================================================================
   EINSTELLUNGEN MÜSSEN WIRKEN (V4 Phase 2)

   Befund beim Funktionstest der Einstellungen: „Dichte“ speicherte
   p.dichte, aber nichts las den Wert — die Umschaltung blieb wirkungslos;
   die Dichte kam nur aus lokalem Zustand des Kopfmenüs.

   Jetzt ist die Einstellung der Person die Quelle: Sie speist den Zustand
   (Effekt auf sitz.person.dichte), und das Kopfmenü schreibt sie zurück.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { appQuelle } from "./app-quelle.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = appQuelle();

describe("Dichte", () => {
  it("die Einstellung schreibt p.dichte (Einstellungen)", () => {
    expect(app).toContain('akt.setzeMeineEinstellung("dichte", v)');
  });
  it("die gespeicherte Dichte der Person speist den Zustand", () => {
    expect(app).toContain("const dichtePerson = sitz && sitz.person ? sitz.person.dichte : undefined;");
    expect(app).toMatch(/useEffect\(\(\) => \{ if \(dichtePerson === "kompakt" \|\| dichtePerson === "komfortabel"\) setDicht\(dichtePerson === "kompakt"\); \}, \[dichtePerson\]\);/);
  });
  it("das Kopfmenü schreibt die Wahl in die Einstellung zurück (eine Quelle)", () => {
    expect(app).toContain('akt.setzeMeineEinstellung("dichte", an ? "kompakt" : "komfortabel")');
  });
  it("die Klasse dicht hängt am Zustand", () => {
    expect(app).toContain('`sw-root${dicht ? " dicht" : ""}');
  });
});

describe("Fehlerzustände sind für Screenreader erreichbar", () => {
  it("der Ladefehler-Bildschirm meldet Titel und Text als Hinweis (role=alert)", () => {
    expect(app).toMatch(/<div role="alert">\s*<div style=\{\{ fontSize: 19, fontWeight: 650, marginBottom: 10 \}\}>\{f\.titel\}<\/div>/);
  });
  it("das Lade-Gerüst meldet den Zustand (role=status)", () => {
    expect(app).toContain('role="status" aria-live="polite">CENTRIC wird geladen');
  });
});

describe("Dialog Person hinzufügen weist nicht stumm ab", () => {
  it("leere Namen erzeugen eine Meldung (role=alert) statt keiner Reaktion", () => {
    expect(app).toContain('setNeuFehler("Bitte Vor- und Nachnamen angeben.")');
    expect(app).toMatch(/id="neu-person-fehler" role="alert"/);
  });
  it("die Felder tragen aria-invalid und verweisen auf die Meldung", () => {
    expect(app).toContain('aria-invalid={neuFehler && !f.vorname ? "true" : undefined}');
    expect(app).toContain('aria-invalid={neuFehler && !f.nachname ? "true" : undefined}');
    expect(app).toContain('aria-describedby={neuFehler ? "neu-person-fehler" : undefined}');
  });
  it("Leerzeichen allein zählen nicht als Name", () => {
    expect(app).toContain("!f.vorname.trim() || !f.nachname.trim()");
  });
});

describe("Dialog Person hinzufügen: Fokus bei Fehler", () => {
  it("der Fokus springt auf das erste ungültige Feld", () => {
    expect(app).toContain('document.getElementById(!f.vorname.trim() ? "neu-person-vorname" : "neu-person-nachname")');
    expect(app).toContain('id="neu-person-vorname"');
    expect(app).toContain('id="neu-person-nachname"');
  });
});

describe("Erscheinungsbild: Hell/Dunkel/System für alle Oberflächen (Entscheidung)", () => {
  it("Betreiber wählen ihr Erscheinungsbild im Kopfmenü; die Wahl gilt für das Gerät", () => {
    expect(app).toContain('const [betreiberThema, setBetreiberThema] = useState(() => v4ThemaGemerkt() || "auto");');
    expect(app).toContain("const eigene = p ? p.thema : betreiberThema;");
    expect(app).toContain("thema={istBetreiber ? betreiberThema : sitz.person.thema}");
    expect(app).toContain('onThema={istBetreiber ? setBetreiberThema : (v) => akt.setzeMeineEinstellung("thema", v)}');
  });
  it("Personen: die Wahl wird an der Person gespeichert und auf dem Gerät gemerkt", () => {
    expect(app).toContain('akt.setzeMeineEinstellung("thema", v)');
    expect(app).toContain("v4ThemaMerken(eigene);");
  });
});

describe("Beschäftigtenoberfläche (Mehr)", () => {
  it("bietet das Erscheinungsbild Hell, Dunkel, Wie das Gerät an und speichert es an der Person", () => {
    expect(app).toContain('<Seg value={p.thema || "auto"} onChange={(v) => akt.setzeMeineEinstellung("thema", v)}');
    expect(app).toContain('{ id: "auto", label: "Wie das Gerät" }');
  });
  it("Kennzahlen zeigen einen Strich statt „null“, wenn kein Wert vorliegt", () => {
    expect(app).toContain('ausl.pct == null ? "–" : `${ausl.pct} %`');
    expect(app).toContain('return r == null ? "–" : `${r} Tage`;');
  });
});
