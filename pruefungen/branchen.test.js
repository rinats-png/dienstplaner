/* ==========================================================================
   BRANCHENPROFILE

   Eine Branche steht seit September 2026 nur noch einmal im Quelltext.
   Diese Prüfung hält fest, was daran nicht verrutschen darf: Jede Branche,
   die die Oberfläche anbietet, muss einen belegten Katalog haben, jeder
   Eintrag eine Rechtsgrundlage, und alte Kennungen müssen weiter finden,
   was zu ihnen gehört.
   ========================================================================== */
import { describe, test, expect } from "vitest";
import { BRANCHEN, brancheVon, einheitLabel, qualifikationenFuer, dienstartenFuer,
  quoteFuer, paketFuer, branchenListe } from "../netlify/lib/branchen.mjs";
import { PAKETE } from "../src/stufen.js";
import { EBENEN, BEZUEGE, verbindlichkeit, regelMaengel } from "../src/regelwerk.js";

describe("Branchenprofile", () => {
  test("jede Branche hat Kennung, Namen und Einheitsbezeichnung", () => {
    for (const b of BRANCHEN) {
      expect(b.id, JSON.stringify(b).slice(0, 80)).toBeTruthy();
      expect(b.name).toBeTruthy();
      expect(b.einheit).toBeTruthy();
    }
  });

  test("die Kennungen sind eindeutig", () => {
    const ids = BRANCHEN.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("jede Branche bringt mindestens zwei Qualifikationen mit", () => {
    for (const b of BRANCHEN) {
      expect(b.qualifikationen.length, b.id).toBeGreaterThanOrEqual(2);
    }
  });

  test("jeder Katalogeintrag nennt seine Grundlage", () => {
    for (const b of BRANCHEN) {
      for (const q of b.qualifikationen) {
        expect(q.grundlage, `${b.id}/${q.name}`).toBeTruthy();
        expect(String(q.grundlage).length).toBeGreaterThan(10);
      }
    }
  });

  test("Ebene und Bezug sind gültige Werte", () => {
    for (const b of BRANCHEN) {
      for (const q of b.qualifikationen) {
        expect(Object.keys(EBENEN), `${b.id}/${q.name}`).toContain(q.ebene);
        expect(Object.keys(BEZUEGE), `${b.id}/${q.name}`).toContain(q.bezug);
      }
    }
  });

  test("kein Eintrag ist in sich widersprüchlich", () => {
    /* Eine Ausnahme ist erlaubt und beabsichtigt: „landOhneLand". Ein
       Katalogvorschlag kennt das Bundesland des Betriebs nicht, und
       Landesrecht wie die Pflegeassistenz gilt in jedem Land — nur eben
       jeweils anders. Die Anwendung weist im Betrieb darauf hin.

       Hinweise der Schwere „info" zählen ebenfalls nicht: Dass die
       Hygieneunterweisung aus dem Gesetz folgt, ihr Zwölfmonatsrhythmus
       aber eine betriebliche Festlegung ist, soll die Anwendung sagen —
       es ist kein Fehler im Katalog, sondern seine Aussage. */
    for (const b of BRANCHEN) {
      for (const q of b.qualifikationen) {
        const echte = regelMaengel(q)
          .filter((m) => m.schwere === "warn" && m.art !== "landOhneLand");
        expect(echte, `${b.id}/${q.name}`).toEqual([]);
      }
    }
  });

  test("Nur-Status-Nachweise sind im Namen als solche erkennbar", () => {
    /* Wer die Liste liest, soll sofort sehen, dass hier nur „liegt vor"
       erfasst wird und kein Befund. Das steht im Namen, nicht im
       Kleingedruckten. */
    for (const b of BRANCHEN) {
      for (const q of b.qualifikationen.filter((x) => x.nurStatus)) {
        expect(q.name, `${b.id}/${q.name}`).toMatch(/Status/);
      }
    }
  });

  test("die Kennungen der Katalogeinträge sind je Branche eindeutig", () => {
    for (const b of BRANCHEN) {
      const ids = b.qualifikationen.map((q) => q.id);
      expect(new Set(ids).size, b.id).toBe(ids.length);
    }
  });

  test("alte Kennungen finden ihr Profil", () => {
    expect(brancheVon("industrie").id).toBe("produktion");
    expect(brancheVon("sonstige").id).toBe("sonstiges");
    expect(brancheVon("gibtesnicht").id).toBe("sonstiges");
    expect(brancheVon(undefined).id).toBe("sonstiges");
  });

  test("jedes zugeordnete Paket gibt es auch in der Preisliste", () => {
    for (const b of BRANCHEN) {
      if (!b.paket) continue;
      expect(PAKETE.map((p) => p.id), b.id).toContain(b.paket);
    }
  });

  test("Dienstarten kommen vollständig zurück", () => {
    for (const b of BRANCHEN) {
      const da = dienstartenFuer(b.id);
      expect(da.length, b.id).toBeGreaterThanOrEqual(2);
      for (const d of da) {
        expect(d.id && d.name && d.start && d.ende, `${b.id}/${d.id}`).toBeTruthy();
      }
    }
  });

  test("die Helfer geben Kopien zurück, keine gemeinsamen Objekte", () => {
    const a = qualifikationenFuer("pflege");
    a[0].name = "verändert";
    expect(qualifikationenFuer("pflege")[0].name).not.toBe("verändert");
  });

  test("die Liste für Auswahlfelder passt zu den Profilen", () => {
    const liste = branchenListe();
    expect(liste.length).toBe(BRANCHEN.length);
    for (const [id, name, label] of liste) {
      expect(name).toBe(brancheVon(id).name);
      expect(label).toBe(einheitLabel(id));
    }
  });

  test("Fachkraftquoten liegen zwischen null und eins", () => {
    for (const b of BRANCHEN) {
      const q = quoteFuer(b.id);
      if (!q) continue;
      for (const wert of [q.tag, q.nacht]) {
        expect(wert, b.id).toBeGreaterThan(0);
        expect(wert, b.id).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("Verbindlichkeit der Katalogeinträge", () => {
  test("Landesrecht gilt nur dort, wo es gilt", () => {
    const rettung = brancheVon("rettung");
    const land = rettung.qualifikationen.find((q) => q.ebene === "land");
    expect(land).toBeTruthy();
    const v = verbindlichkeit(land, { land: "HE" });
    expect(v.ebene).toBe("land");
  });

  test("Bundesrecht wird als gesetzlich geführt", () => {
    const pflege = brancheVon("pflege");
    const pfk = pflege.qualifikationen.find((q) => q.kurz === "PFK");
    expect(verbindlichkeit(pfk, {}).gesetzlich).toBe(true);
  });

  test("Betriebliches gibt sich nicht als Gesetz aus", () => {
    const eh = brancheVon("pflege").qualifikationen.find((q) => q.kurz === "EH");
    expect(verbindlichkeit(eh, {}).gesetzlich).toBe(false);
  });
});

describe("Branchenbreite", () => {
  test("die vom Handbuch benannten Gewerbe sind abgedeckt", () => {
    const ids = BRANCHEN.map((b) => b.id);
    for (const n of ["pflege", "klinik", "sicherheit", "rettung", "feuerwehr",
      "produktion", "logistik", "gastronomie", "handel", "reinigung", "leitstelle"]) {
      expect(ids).toContain(n);
    }
  });

  test("die Sachkunde nach § 34a ist nicht als allgemeine Pflicht vorbelegt", () => {
    const sk = brancheVon("sicherheit").qualifikationen.find((q) => q.kurz === "SK");
    expect(sk.nachweisPflicht).toBe(false);
    const unt = brancheVon("sicherheit").qualifikationen.find((q) => q.kurz === "UNT");
    expect(unt.nachweisPflicht).toBe(true);
  });
});
