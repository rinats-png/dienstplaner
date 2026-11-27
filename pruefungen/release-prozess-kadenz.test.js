/* ==========================================================================
   RST-1: Doku-Test für docs/acc45/RELEASE-PROZESS.md (Kadenz, Teil-Umfang, Rollen, Routine)

   Die Berichtigung (2026-11-27) darf nicht zurückfallen. `befunde(text)` liefert die verletzten Regeln; auf der echten Datei
   leer. Jede Regel wird an einer Mutation des Textes rot (Rückfall in den alten Wortlaut oder Streichung der neuen Regel).
   Keine Gate-Regel wird hier bewertet; G1 bis G10 stehen in release-pruefung.test.js.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGINAL = readFileSync(join(WURZEL, "docs/acc45/RELEASE-PROZESS.md"), "utf8").replace(/\r\n/g, "\n");

function abschnitt(text, ueberschrift) {
  const zeilen = text.split("\n");
  const i = zeilen.findIndex((z) => z === ueberschrift);
  if (i < 0) return "";
  let j = zeilen.findIndex((z, k) => k > i && /^## /.test(z));
  if (j < 0) j = zeilen.length;
  return zeilen.slice(i + 1, j).join("\n");
}

function befunde(text) {
  const b = [];
  const s2 = abschnitt(text, "## 2. Gruppierung: was in ein Release-Paket darf");
  const s3 = abschnitt(text, "## 3. Rollen");
  const s9 = abschnitt(text, "## 9. Tägliche Release-Manager-Routine (Beschreibung, neu 2026-11-27)");
  if (/Es gibt keinen Teil-Release\.(\s|$)/.test(text)) b.push("alter Satz 'Es gibt keinen Teil-Release.' steht wieder da");
  if (!/Teil-Umfang \(berichtigt 2026-11-27\)/.test(s2)) b.push("Teil-Umfang-Regel fehlt in §2");
  if (/höchstens ein Release je Woche(?! \(Vorschlag)/.test(s2) && !/Vorher stand hier als\s+Vorschlag/.test(s2)) b.push("alte Kadenz ohne Berichtigungsvermerk");
  if (/^\*\*Kadenz \(Vorschlag, Entscheidung beim Betreiber\)/m.test(s2)) b.push("Kadenz steht wieder als offener Vorschlag");
  if (!/Staging \| alle 12 bis 24 h/.test(s2)) b.push("Staging-Kadenz 12 bis 24 h fehlt");
  if (!/Produktion \| 3 bis 7 Tage/.test(s2)) b.push("Produktions-Kadenz 3 bis 7 Tage fehlt");
  if (!/Mindestabstand 72 h/.test(s2)) b.push("Mindestabstand 72 h fehlt");
  if (!/Heute nicht wirksam/i.test(s2) || !/STAGING_GATE_AKTIV/.test(s2)) b.push("Staging-Kadenz nicht als 'heute nicht wirksam' gekennzeichnet");
  if (!/Ein Kandidat \(Schnitt S\) lebt höchstens 7 Tage/.test(s2)) b.push("Kandidat-Lebensdauer 7 Tage fehlt");
  if (!/nie still unter derselben Release-ID geändert/.test(s2) || !/nur mit \*\*neuer Release-ID\*\* zulässig/.test(s2)) b.push("Wechselregel (nur mit neuer ID) fehlt");
  if (!/Keine künstlichen Releases/.test(s2)) b.push("Regel 'keine künstlichen Releases' fehlt");
  if (!/Eine Hotfix-Regel gibt es nicht/.test(s2)) b.push("Hotfix-Lage nicht ehrlich benannt");
  const claude = s3.split("\n").find((z) => z.startsWith("| Claude (")) ?? "";
  const betreiber = s3.split("\n").find((z) => z.startsWith("| Betreiber |")) ?? "";
  if (!/Bildbau \*\*vorbereiten\*\*/.test(claude) || /Bild bauen/.test(claude)) b.push("Rolle Claude: Bildbau nur vorbereiten");
  if (!/nur nach ausdrücklicher Merge-Freigabe des Betreibers/.test(claude)) b.push("Rolle Claude: Merge nach main nur nach Merge-Freigabe");
  if (!/\*\*löst aus\*\*/.test(betreiber)) b.push("Rolle Betreiber: löst aus");
  if (!/Nur der Betreiber löst ein Deployment aus\. Claude startet nie einen Deploy-Workflow\./.test(s3)) b.push("Satz 'Claude startet nie einen Deploy-Workflow' fehlt");
  if (!/Pflichtnachweis Migration/.test(text) || !text.includes("`migrationsprobe`")) b.push("Pflichtnachweis Migration (#598) fehlt");
  if (!s9) b.push("§9 Routine fehlt");
  else {
    if (!/Neuer Kandidat ja\/nein/.test(s9)) b.push("Routine: Entscheidung 'neuer Kandidat ja/nein' fehlt");
    if (!/Sie löst nie Bildbau oder Deployment aus/.test(s9)) b.push("Routine: löst nie Bildbau/Deployment aus fehlt");
    if (!/ändert keinen Workflow/.test(s9) || !/gibt nichts frei/.test(s9)) b.push("Routine: keine Workflow-Änderung/Freigabe fehlt");
    if (!/Entscheidung „neuer Kandidat“/.test(s9)) b.push("Routine: Entscheidungstabelle fehlt");
  }
  if (!/Diese Richtlinie genehmigt kein Deployment\. Sie ändert keinen Workflow\./.test(text)) b.push("Kopfsatz 'ändert keinen Workflow' fehlt");
  if (!/keine Gate-Regel geändert/.test(text)) b.push("Berichtigungsvermerk 'keine Gate-Regel geändert' fehlt");
  return b;
}

describe("RELEASE-PROZESS.md: Berichtigung RST-1 (Kadenz, Teil-Umfang, Rollen, Routine)", () => {
  it("die echte Datei verletzt keine Regel", () => {
    expect(befunde(ORIGINAL)).toEqual([]);
  });

  it("Gate-Tabelle und Titel unverändert vorhanden (G1 bis G10, Titel mit Stand 2026-11-20)", () => {
    const zeilen = ORIGINAL.split("\n");
    for (let n = 1; n <= 10; n++) expect(zeilen.filter((z) => z.startsWith(`| G${n} |`)), `G${n}`).toHaveLength(1);
    expect(zeilen[0]).toBe("# Release-Prozess (REL-1, Stand 2026-11-20)");
  });

  const mutationen = [
    ["alter Satz kein Teil-Release", (t) => t.replace("**Teil-Umfang (berichtigt 2026-11-27).**", "Es gibt keinen Teil-Release.\n\n**Anderes.**"), "Es gibt keinen Teil-Release"],
    ["Kadenz wieder offener Vorschlag", (t) => t.replace("**Kadenz (berichtigt 2026-11-27;", "**Kadenz (Vorschlag, Entscheidung beim Betreiber) ("), "Kadenz steht wieder"],
    ["Staging-Kadenz gestrichen", (t) => t.replace("| Staging | alle 12 bis 24 h |", "| Staging | wöchentlich |"), "Staging-Kadenz"],
    ["Produktions-Kadenz gestrichen", (t) => t.replace("| Produktion | 3 bis 7 Tage |", "| Produktion | je Woche |"), "Produktions-Kadenz"],
    ["Mindestabstand gestrichen", (t) => t.replace("Mindestabstand 72 h", "Abstand"), "Mindestabstand"],
    ["Staging nicht als heute-unwirksam", (t) => t.replace("**Heute nicht wirksam:**", "**Wirksam:**"), "heute nicht wirksam"],
    ["Lebensdauer gestrichen", (t) => t.replace("lebt höchstens 7 Tage", "lebt beliebig lange"), "Lebensdauer"],
    ["Wechselregel gestrichen", (t) => t.replace("nie still unter derselben Release-ID geändert", "ggf. geändert"), "Wechselregel"],
    ["Hotfix-Lage verschwiegen", (t) => t.replace("Eine Hotfix-Regel gibt es nicht", "Ein Hotfix ist möglich"), "Hotfix"],
    ["Rolle Claude baut Bild", (t) => t.replace("Bildbau **vorbereiten**", "Bild bauen"), "Bildbau nur vorbereiten"],
    ["Merge ohne Freigabe", (t) => t.replace("**nur nach ausdrücklicher Merge-Freigabe des Betreibers**", "selbständig"), "Merge nach main"],
    ["Betreiber löst nicht aus", (t) => t.replace("**löst aus**", "nimmt zur Kenntnis"), "Rolle Betreiber"],
    ["Pflichtnachweis Migration gestrichen", (t) => t.replace("**Pflichtnachweis Migration", "**Hinweis"), "Pflichtnachweis Migration"],
    ["Routine gestrichen", (t) => t.replace("## 9. Tägliche Release-Manager-Routine (Beschreibung, neu 2026-11-27)", "## 9. Sonstiges"), "§9 Routine fehlt"],
    ["Routine löst Deployment aus", (t) => t.replace("Sie löst nie Bildbau oder Deployment aus (§3).", "Sie darf ausliefern."), "löst nie Bildbau"],
    ["Routine gibt frei", (t) => t.replace("gibt nichts frei.", "gibt frei."), "keine Workflow-Änderung/Freigabe"],
    ["Entscheidung neuer Kandidat gestrichen", (t) => t.replace("**Neuer Kandidat ja/nein**", "Einschätzung"), "ja/nein"],
  ];
  for (const [name, mut, erwartet] of mutationen) {
    it(`Mutation „${name}“ wird erkannt`, () => {
      const m = mut(ORIGINAL);
      expect(m, "Mutation hat nichts geändert").not.toBe(ORIGINAL);
      const b = befunde(m);
      expect(b.length).toBeGreaterThan(0);
      expect(b.join(" | ").toLowerCase()).toContain(erwartet.toLowerCase());
    });
  }
});
