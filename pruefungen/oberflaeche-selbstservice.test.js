/* ==========================================================================
   OBERFLÄCHE — Selbstservice der Beschäftigten und Folgen der Server-Sicht

   Eine Browserprüfung gibt es in diesem Repository nicht (kein jsdom, kein
   Playwright). Geprüft wird deshalb der Quelltext an den Stellen, die
   Commit 2b korrigiert hat — so, dass ein Rückfall auffällt:

   - selbstEintragen, selbstAustragen und notrufSenden lasen die eigene
     Person aus (m.session || {}).personId. `m` ist dort der Betrieb, eine
     Sitzung hat er nicht — alle drei taten nichts.
   - Krankmeldung und Notruf versprachen eine Benachrichtigung, die es
     (noch) nicht gibt.
   - Ansichten, die mit den gekürzten Daten der Beschäftigten falsch oder
     leer wären, sind an das passende Recht gebunden.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(path.join(HIER, "..", "src", "App.jsx"), "utf8").replace(/\r\n/g, "\n");

/** Der Quelltext einer Aktion `name: (…) => mUpd(…)` bis zur nächsten Aktion. */
function aktion(name) {
  const i = APP.indexOf(`      ${name}: (`);
  if (i < 0) throw new Error(`Aktion nicht gefunden: ${name}`);
  const rest = APP.slice(i + 1);
  const ende = rest.search(/\n {6}[a-zA-Z]+: (\(|async)/);
  return APP.slice(i, i + 1 + ende);
}
/** Der Quelltext einer Komponente `function Name(` bis zur nächsten Funktion. */
function funktion(name) {
  const i = APP.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`Funktion nicht gefunden: ${name}`);
  const ende = APP.indexOf("\nfunction ", i + 10);
  return APP.slice(i, ende < 0 ? undefined : ende);
}
const recht = (view) => {
  const t = new RegExp(`\\["${view}", "[^"]+", ("[^"]*"|null)\\]`).exec(APP);
  if (!t) throw new Error(`Ansicht nicht gefunden: ${view}`);
  return JSON.parse(t[1]);
};

describe("die eigene Person kommt aus der Sitzung, nicht aus dem Betrieb", () => {
  for (const name of ["selbstEintragen", "selbstAustragen", "notrufSenden"]) {
    it(`${name} verwendet sitz.person`, () => {
      const q = aktion(name);
      expect(q).toContain("const pid = sitz.person ? sitz.person.id : null;");
      expect(q).not.toMatch(/\(m\.session \|\| \{\}\)\.personId;/);
    });
  }
  it("nirgends mehr eine Sitzung am Betrieb ohne Rückfall", () => {
    const treffer = [...APP.matchAll(/\((?:m|mm|mandant)\.session \|\| \{\}\)\.personId([^\n]*)/g)];
    for (const t of treffer) expect(t[1], t[0]).toMatch(/\|\| sitz\.person\.id/);
  });
});

describe("keine Erfolgsmeldung verspricht eine Zustellung", () => {
  const sperrwoerter = /benachrichtigt|unterrichtet|zugestellt|informiert|sofort/;
  it("4. Krankmeldung", () => {
    const q = funktion("Krankmeldung");
    expect(q).not.toMatch(/benachrichtigt|zugestellt|informiert/);
    expect(aktion("krankmelden")).not.toMatch(/melde\([^)]*(benachrichtigt|unterrichtet|informiert)/);
  });
  it("5. Notruf: Blatt und Rückmeldung", () => {
    const i = APP.indexOf('titel="Hilfe anfordern">');
    const blatt = APP.slice(i, APP.indexOf("</MBlatt>", i));
    const text = blatt.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");     // Kommentare zählen nicht
    expect(text).not.toMatch(sperrwoerter);
    expect(text).toContain("sichtbar");
    const melde = /melde\(([^;]*)\);/.exec(aktion("notrufSenden"))[1];
    expect(melde).not.toMatch(sperrwoerter);
    expect(melde).toContain("Hilferuf erfasst");
  });
});

describe("Krankmeldung: Beschäftigte melden, die Planung plant Ersatz", () => {
  const q = funktion("Krankmeldung");
  it("6. wer nur die eigene Meldung abgeben darf, kommt nicht in die Ersatzliste", () => {
    expect(q).toContain('const eigene = sitz.person && !darf(sitz, "staff.edit") && !darfEinheit(sitz, sitz.person.bereich);');
    expect(q).toContain("setSchritt(offen.length && !eigene ? 3 : 4)");
  });
  it("7. Planung und Leitung behalten Schritt 3 mit der Ersatzliste", () => {
    expect(q).toMatch(/schritt === 3 && luecken\[idx\][\s\S]*<Ersatzliste/);
  });
});

describe("Ansichten mit gekürzten Daten", () => {
  it("8. OffeneSchichten: Meldungen, Zähler und Eignung nur für wer vergibt", () => {
    const q = funktion("OffeneSchichten");
    expect(q).toContain('const darfVergeben = darf(sitz, "plan.edit.unit") || darf(sitz, "plan.edit.all");');
    expect(q).toContain("{!darfVergeben ? null : lage.anzahl === 0 ? (");
    expect(q).toMatch(/!darfVergeben \? \(l\.dringend \? "offen · dringend" : "offen"\)/);
    expect(q).toContain("{darfVergeben && <span>{zahl(lage.moeglich)} kämen infrage</span>}");
  });
  it("9. Lenkzeiten: ohne Pflegerecht nur die eigene Person", () => {
    const q = funktion("Lenkzeiten");
    expect(q).toMatch(/&& \(darfPflegen \|\| \(sitz\.person && p\.id === sitz\.person\.id\)\)/);
  });
  it("10. Personalakte: Konten nur bei account.view.all oder für die eigene Person", () => {
    const q = funktion("Personalakte");
    expect(q).toContain('const zeigt = darf(sitz, "account.view.all") || sitz.person.id === p.id;');
    const von = q.indexOf("{zeigt && (<>");
    const bis = q.indexOf("Abwesenheiten {jahr}");
    expect(von).toBeGreaterThan(0);
    expect(bis).toBeGreaterThan(von);
    /* Jede Anzeige von Urlaubsanspruch und Stundenkonto liegt im zeigt-Block. */
    for (const stelle of ["url.rest", "url.anspruch", "url.genommen", "sgn(kto)", "kontoVerlauf(m, p"]) {
      const orte = [];
      for (let o = q.indexOf(stelle); o >= 0; o = q.indexOf(stelle, o + 1)) orte.push(o);
      expect(orte.length, stelle).toBeGreaterThan(0);
      for (const o of orte) expect(o > von && o < bis, stelle).toBe(true);
    }
  });
  it("Lagebild: Konten und offene Anträge nur mit dem passenden Recht", () => {
    const q = funktion("Lagebild");
    expect(q).toContain('{darf(sitz, "account.view.all") && <Kpi label="Konten über Grenze"');
    expect(q).toContain('{darf(sitz, "req.approve.unit") && <Kpi label="Offene Anträge"');
  });
  it("Schutzbefunde nur für Rollen mit vollständigem Betrieb", () => {
    expect(APP).toContain('const BEFUNDE_AUS_PERSONENDATEN = ["schutz", "vorsorge", "einschraenkung"];');
    expect(funktion("befundeFuer")).toContain('if (darf(sitz, "plan.edit.unit")) return befunde;');
    expect(funktion("tagesaufgaben")).toContain("befundeFuer(sitz, pruefen(m, d0, addDays(d0, 13)))");
    expect(funktion("Lagebild")).toContain("befundeFuer(sitz, pruefen(m, d0, addDays(d0, 13)))");
    expect(funktion("Pruefung")).toContain("befundeFuer(sitz, pruefen(m, von, bis))");
    expect(APP).toContain('const bef = befundeFuer(sitz, pruefen(m, heute(), addDays(heute(), 13)))');
  });
  it("Tagesnotizen nur mit Planungsrecht", () => {
    expect(APP).toMatch(/\{darf\(sitz, "plan\.edit\.unit"\) && \(\n\s+<div[^\n]*\n\s+<Btn size="sm" kind="quiet" onClick=\{\(\) => akt\.oeffneNotizen\(`tag\|/);
  });
});

describe("11. Navigation: nur die drei Ansichten mit vollständigem Datenbedarf sind enger", () => {
  it("Übergabe, Dienstbuch, Belastbarkeit verlangen plan.edit.unit", () => {
    expect(recht("uebergabe")).toBe("PAKET:uebergabe|plan.edit.unit");
    expect(recht("buch")).toBe("plan.edit.unit");
    expect(recht("belastbarkeit")).toBe("plan.edit.unit");
  });
  it("erlaubt() prüft Paket und Zusatzrecht", () => {
    expect(APP).toContain('const [paket, zusatz] = recht.slice(6).split("|");');
    expect(APP).toContain("return kann(sitz.mandant, paket) && (!zusatz || darf(sitz, zusatz));");
  });
  it("die übrigen Ansichten behalten ihr Recht", () => {
    const erwartet = { start: null, lage: "plan.view.unit", plan: "plan.view.all", einsatz: "plan.view.unit",
      notrufe: "plan.view.unit", offene: null, antraege: "req.approve.unit", boerse: "req.create",
      personal: "staff.view", pruef: "plan.view.all", lenkzeiten: "plan.view.unit",
      belastung: "plan.view.unit", nachweis: "plan.view.unit", selbstplan: "plan.edit.unit" };
    for (const [view, r] of Object.entries(erwartet)) expect(recht(view), view).toBe(r);
  });
});
