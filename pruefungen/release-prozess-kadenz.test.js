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
  if (!/keine automatische Frist\.\*\* Ein Kandidat verfällt nicht nach sieben Tagen/.test(s2)) b.push("Alter: Kandidat verfällt nicht automatisch (keine 7-Tage-Frist) fehlt");
  if (/Kandidat-Lebensdauer höchstens|lebt höchstens 7 Tage|Kandidat älter als 7 Tage|Kandidat jünger als 7 Tage/.test(text)) b.push("alte 7-Tage-Lebensdauer des Kandidaten steht wieder da");
  // vier getrennte Altersbegriffe, an die Konfiguration des Werkzeugs gebunden (Doku darf nicht von den Fristen im Code abweichen)
  const cfg = readFileSync(join(WURZEL, "werkzeug/release-pruefung.mjs"), "utf8");
  if (!/Bildabfrage[^\n]*höchstens 7 Tage/.test(s2) || !/bildInfoMaxTage: 7/.test(s2) || !/bildInfoMaxTage: 7,/.test(cfg)) b.push("Alter: Bildabfrage 7 Tage nicht mit Code abgeglichen");
  if (!/Staging-Nachweis[^\n]*höchstens 7 Tage/.test(s2) || !/stagingMaxTage: 7/.test(s2) || !/stagingMaxTage: 7,/.test(cfg)) b.push("Alter: Staging-Nachweis 7 Tage nicht mit Code abgeglichen");
  if (!/weitere zeitgebundene Sicherheits- und Freigabenachweise/.test(s2)) b.push("Alter: weitere zeitgebundene Nachweise fehlen");
  if (!/Abgelaufene Nachweise werden erneuert/.test(s2)) b.push("Alter: abgelaufene Nachweise werden erneuert fehlt");
  if (!/Ein neuer Kandidat ist nur bei konkreten Gründen nötig/.test(s2) || !/Alter allein ist kein Grund/.test(s2)) b.push("Alter: neuer Kandidat nur bei konkreten Gründen fehlt");
  if (!/unverändertes, weiterhin geeignetes Bild darf mit\s+aktualisierten Nachweisen erneut bewertet werden/.test(s2)) b.push("Alter: unverändertes Bild mit aktualisierten Nachweisen erneut bewerten fehlt");
  // #600 (Versuchsmodell): beschrieben, aber nicht als gemergt behauptet; die Aussage stimmt vor und nach dem Merge
  if (!/demselben Kandidaten und Digest/.test(s2) || !/neue Versuchskennung/.test(s2) || !/eingeführt mit\s+PR #600/.test(s2) || !/Merge-Stand: siehe Git-Historie/.test(s2)) b.push("Versuchsmodell (derselbe Digest, neue Versuchskennung, eingeführt mit #600, Merge-Stand Git-Historie) fehlt");
  if (/#600[^\n]{0,80}gemergt/.test(s2)) b.push("#600 als gemergt oder nicht gemergt behauptet (Merge-Stand steht in der Git-Historie)");
  if (!/Ein Kandidat wird \*\*nie still geändert\*\*/.test(s2) || !/neuem Digest, neuer Listenzeile, neuer Freigabedatei/.test(s2)) b.push("Wechselregel (nie still, neuer Schnitt/Digest/Zeile/Freigabedatei) fehlt");
  if (!/Die Release-ID bleibt \x60v4-r1\x60/.test(s2) || !/F3/.test(s2) || !/RUNBOOK-ERSTWECHSEL-V4R1\.md/.test(s2)) b.push("Wechselregel: Release-ID bleibt v4-r1 vor T0 (F3, Runbook) fehlt");
  if (!/Wiederholungspfad[\s\S]{0,200}eingeführt mit PR #600, Merge-Stand: siehe Git-Historie/.test(s2) || !/verbrauchte Ausnahme wird nie wiederverwendet/.test(s2)) b.push("Wechselregel: Wiederholungspfad (#600, Merge-Stand, Ausnahme nie wiederverwendet) fehlt");
  // Verboten: pauschale neue Release-ID (widerspricht Runbook, F3 und releaseIds ["v4-r1"])
  if (/nur mit \*{0,2}neuer Release-ID\*{0,2}/.test(text) || /braucht neue Release-ID/.test(text) || /\(neue Release-ID, §2/.test(text)) b.push("pauschale Aussage 'neue Release-ID' (widerspricht Runbook/F3)");
  // Verbotene Gegenaussagen (Negativprüfung)
  const verboten = [[/Es gilt weiter/, "Es gilt weiter"], [/darf still/, "darf still"], [/still nachgebessert/, "still nachgebessert"],
    [/auch ohne (ausdrückliche )?Merge-Freigabe/, "auch ohne Merge-Freigabe"], [/Merge-Freigabe[^|\n]*auch ohne/, "Merge-Freigabe ... auch ohne"]];
  for (const [re, n] of verboten) if (re.test(text)) b.push("verbotener Wortlaut: " + n);
  if (!/Vorschlag „höchstens ein Release je Woche“; das widersprach/.test(s2) || /höchstens ein Release je Woche[^\n]*(gilt|bleibt)/.test(s2)) b.push("alte Kadenz als geltend dargestellt");
  if (text.split("höchstens ein Release je Woche").length - 1 > 3) b.push("alte Kadenz zu oft genannt");
  if (!/Keine künstlichen Releases/.test(s2)) b.push("Regel 'keine künstlichen Releases' fehlt");
  if (!/Eine Hotfix-Regel gibt es nicht/.test(s2)) b.push("Hotfix-Lage nicht ehrlich benannt");
  const claude = s3.split("\n").find((z) => z.startsWith("| Claude (")) ?? "";
  const betreiber = s3.split("\n").find((z) => z.startsWith("| Betreiber |")) ?? "";
  if (!/Merge-Freigabe des Betreibers\*\*, §7\)/.test(claude)) b.push("Rolle Claude: Merge-Freigabe ohne Einschränkung");
  if (!/\x60--ausfuehren\x60 mit Push und Entwurfs-PR nur auf ausdrücklichen Auftrag/.test(claude) || !/PR #601 gemergt/.test(claude) || !/Trockenlauf Standard, nur lesend/.test(claude)
    || !/\x60--anlegen\x60 nur lokaler Zweig/.test(claude) || !/reguläre CI-Workflows auslösen/.test(claude) || !/kein Veröffentlichen eines Bilds/.test(claude)) b.push("Rolle Claude: RST-2-Modi (Trockenlauf, --anlegen, --ausfuehren, #601 gemergt, CI-Hinweis, kein Bild) fehlen");
  if (/#601[^\n]{0,40}(in Review|nicht gemergt)/.test(text)) b.push("#601 noch als in Review/nicht gemergt dargestellt");
  const s7 = abschnitt(text, "## 7. Dauerhafte und pro-Release-Freigaben (Übersicht, Stand 2026-11-24)");
  if (!/Betreiberhinweise \(Review #601/.test(s7) || !/Mehrere \x60remote\.origin\.url\x60/.test(s7) || !/genau eine URL/.test(s7) || !/gh repo set-default/.test(s7)
    || !/Job \x60bild\x60 in \x60deploy\.yml\x60 ist technisch nicht auf \x60main\x60 beschränkt/.test(s7) || !/Branch-Schutz für \x60main\x60 ist eine offene Betreiberhandlung/.test(s7)) b.push("§7: Betreiberhinweise aus Review #601 fehlen");
  if (!/Bildbau \*\*vorbereiten\*\*/.test(claude) || /Bild bauen/.test(claude)) b.push("Rolle Claude: Bildbau nur vorbereiten");
  if (!/nur nach ausdrücklicher Merge-Freigabe des Betreibers/.test(claude)) b.push("Rolle Claude: Merge nach main nur nach Merge-Freigabe");
  if (!/\*\*löst aus\*\*/.test(betreiber)) b.push("Rolle Betreiber: löst aus");
  if (!/Nur der Betreiber löst ein Deployment aus\. Claude startet nie einen Deploy-Workflow\./.test(s3)) b.push("Satz 'Claude startet nie einen Deploy-Workflow' fehlt");
  if (!/Pflichtnachweis Migration/.test(text) || !text.includes("`migrationsprobe`")) b.push("Pflichtnachweis Migration (#598) fehlt");
  const s4 = abschnitt(text, "## 4. Ablauf");
  if (!/die Release-ID richtet sich nach §2 Wechselregel, für den Erstwechsel bleibt sie \x60v4-r1\x60/.test(s4)) b.push("§4: Release-ID-Aussage nicht konsistent mit §2");
  if (!s9) b.push("§9 Routine fehlt");
  else {
    if (!/^Nur Beschreibung\./m.test(s9)) b.push("Routine: 'Nur Beschreibung.' fehlt");
    if (!/Sie aktiviert nichts/.test(s9)) b.push("Routine: 'Sie aktiviert nichts' fehlt");
    if (/(ist|wird) aktiviert|läuft täglich automatisch|läuft automatisch/.test(s9)) b.push("Routine als aktiv dargestellt");
    if (!/entscheidet der Betreiber/.test(s9)) b.push("Routine: Aktivierung beim Betreiber fehlt");
    if (/braucht neue Release-ID|neue Release-ID und Mitteilung/.test(s9) || !/für den Erstwechsel vor T0 bleibt sie \x60v4-r1\x60/.test(s9)) b.push("Routine-Tabelle: Release-ID-Aussage nicht konsistent mit §2");
    if (!/Neuer Kandidat ja\/nein/.test(s9)) b.push("Routine: Entscheidung 'neuer Kandidat ja/nein' fehlt");
    if (!/erzwingt nie einen neuen Schnitt oder Imagebau/.test(s9)) b.push("Routine: erzwingt nie Schnitt/Imagebau fehlt");
    if (!/Weitere Eignung/.test(s9) || !/Abstand zu/.test(s9) || !/abgelaufene Nachweise/.test(s9)) b.push("Routine: Prüfung der weiteren Eignung älterer Kandidaten fehlt");
    if (/Kandidat älter als 7 Tage|erzwingt (einen )?neuen Schnitt/.test(s9)) b.push("Routine: erzwingt neuen Schnitt bei Alter");
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

  it("Gate-Tabelle und Titel unverändert vorhanden (G1 bis G10, Titel mit Datumsformat)", () => {
    const zeilen = ORIGINAL.split("\n");
    for (let n = 1; n <= 10; n++) expect(zeilen.filter((z) => z.startsWith(`| G${n} |`)), `G${n}`).toHaveLength(1);
    expect(zeilen[0]).toMatch(/^# Release-Prozess \(REL-1, Stand \d{4}-\d{2}-\d{2}\)$/);
  });

  const mutationen = [
    ["alter Satz kein Teil-Release", (t) => t.replace("**Teil-Umfang (berichtigt 2026-11-27).**", "Es gibt keinen Teil-Release.\n\n**Anderes.**"), "Es gibt keinen Teil-Release"],
    ["Kadenz wieder offener Vorschlag", (t) => t.replace("**Kadenz (berichtigt 2026-11-27;", "**Kadenz (Vorschlag, Entscheidung beim Betreiber) ("), "Kadenz steht wieder"],
    ["Staging-Kadenz gestrichen", (t) => t.replace("| Staging | alle 12 bis 24 h |", "| Staging | wöchentlich |"), "Staging-Kadenz"],
    ["Produktions-Kadenz gestrichen", (t) => t.replace("| Produktion | 3 bis 7 Tage |", "| Produktion | je Woche |"), "Produktions-Kadenz"],
    ["Mindestabstand gestrichen", (t) => t.replace("Mindestabstand 72 h", "Abstand"), "Mindestabstand"],
    ["Staging nicht als heute-unwirksam", (t) => t.replace("**Heute nicht wirksam:**", "**Wirksam:**"), "heute nicht wirksam"],
    ["7-Tage-Lebensdauer des Kandidaten wieder eingeführt", (t) => t.replace("**keine automatische Frist.** Ein Kandidat verfällt nicht nach sieben Tagen", "Ein Kandidat (Schnitt S) lebt höchstens 7 Tage"), "7-Tage"],
    ["Bildabfrage-Frist geändert", (t) => t.replace("| Bildabfrage (\x60--bild-info\x60, §4) | höchstens 7 Tage |", "| Bildabfrage (\x60--bild-info\x60, §4) | höchstens 14 Tage |"), "Bildabfrage"],
    ["Staging-Frist gestrichen", (t) => t.replace("| Staging-Nachweis (E6, §8) | höchstens 7 Tage |", "| Staging-Nachweis (E6, §8) | ohne Frist |"), "Staging-Nachweis"],
    ["Erneuerung abgelaufener Nachweise gestrichen", (t) => t.replace("**Abgelaufene Nachweise werden erneuert**", "Abgelaufene Nachweise gelten weiter"), "abgelaufene Nachweise werden erneuert"],
    ["Alter allein als Grund für neuen Kandidaten", (t) => t.replace("Alter allein ist kein Grund.", "Auch das Alter allein ist ein Grund."), "konkreten Gründen"],
    ["Versuchsmodell gestrichen", (t) => t.replace("demselben Kandidaten und Digest", "einem neuen Kandidaten"), "Versuchsmodell"],
    ["Routine erzwingt neuen Schnitt", (t) => t.replace("**die Routine erzwingt nie einen neuen Schnitt oder Imagebau**", "die Routine erzwingt neuen Schnitt bei Alter"), "erzwingt"],
    ["Routine prüft Eignung nicht", (t) => t.replace("**Weitere Eignung** des (älteren) Kandidaten prüfen", "Kandidat ansehen"), "weiteren Eignung"],
    ["Wechselregel gestrichen", (t) => t.replace("**nie still geändert**", "ggf. geändert"), "Wechselregel"],
    ["Hotfix-Lage verschwiegen", (t) => t.replace("Eine Hotfix-Regel gibt es nicht", "Ein Hotfix ist möglich"), "Hotfix"],
    ["Rolle Claude baut Bild", (t) => t.replace("Bildbau **vorbereiten**", "Bild bauen"), "Bildbau nur vorbereiten"],
    ["Merge ohne Freigabe", (t) => t.replace("**nur nach ausdrücklicher Merge-Freigabe des Betreibers**", "selbständig"), "Merge nach main"],
    ["Betreiber löst nicht aus", (t) => t.replace("**löst aus**", "nimmt zur Kenntnis"), "Rolle Betreiber"],
    ["Pflichtnachweis Migration gestrichen", (t) => t.replace("**Pflichtnachweis Migration", "**Hinweis"), "Pflichtnachweis Migration"],
    ["Routine gestrichen", (t) => t.replace("## 9. Tägliche Release-Manager-Routine (Beschreibung, neu 2026-11-27)", "## 9. Sonstiges"), "§9 Routine fehlt"],
    ["Routine löst Deployment aus", (t) => t.replace("Sie löst nie Bildbau oder Deployment aus (§3).", "Sie darf ausliefern."), "löst nie Bildbau"],
    ["Routine aktiviert (Nur Beschreibung ersetzt)", (t) => t.replace("Nur Beschreibung. Sie aktiviert nichts, ändert keinen Workflow, genehmigt keinen Schnitt und kein Deployment und legt keine Statusdatei an.", "Die Routine ist aktiviert und läuft täglich automatisch."), "Routine"],
    ["Wechsel pauschal nur mit neuer Release-ID (§2)", (t) => t.replace("Ein\n  Wechsel ist nur mit **neuem Schnitt S, neuem Digest, neuer Listenzeile, neuer Freigabedatei**", "Ein\n  Wechsel ist nur mit **neuer Release-ID** zulässig: neuem Digest, neuer Listenzeile, neuer Freigabedatei"), "neue Release-ID"],
    ["Wechsel pauschal neue ID (§4)", (t) => t.replace("(neuer Schnitt und Digest; die Release-ID richtet sich nach §2 Wechselregel, für den Erstwechsel bleibt sie `v4-r1`)", "(neue Release-ID, §2 Wechselregel)"), "§4"],
    ["Wechsel pauschal neue ID (§9)", (t) => t.replace("ein neuer Schnitt braucht neuen Digest, neue Listenzeile, neue Freigabedatei und Mitteilung; die Release-ID folgt §2, für den Erstwechsel vor T0 bleibt sie `v4-r1`)", "ein neuer Schnitt braucht neue Release-ID und Mitteilung, §2)"), "Routine-Tabelle"],
    ["Release-ID bleibt v4-r1 gestrichen", (t) => t.replace("Die Release-ID bleibt `v4-r1`", "Die Release-ID wechselt"), "Release-ID bleibt v4-r1"],
    ["#600 als gemergt", (t) => t.replaceAll("eingeführt mit PR #600, Merge-Stand: siehe Git-Historie", "mit PR #600 gemergt"), "#600"],
    ["#600 als noch nicht gemergt", (t) => t.replace("PR #600 (Merge-Stand: siehe Git-Historie)", "PR #600 (noch nicht gemergt)"), "#600"],
    ["Wiederverwendung der Ausnahme nicht ausgeschlossen", (t) => t.replace("Die verbrauchte Ausnahme wird nie wiederverwendet.", "Die Ausnahme darf erneut genutzt werden."), "Ausnahme nie wiederverwendet"],
    ["CI-Hinweis RST-2 gestrichen", (t) => t.replace("; Push und PR können reguläre CI-Workflows auslösen", ""), "CI-Hinweis"],
    ["RST-2 veröffentlicht Bild", (t) => t.replace("; kein Veröffentlichen eines Bilds", "; Bild wird veröffentlicht"), "kein Bild"],
    ["Betreiberhinweis remote.origin.url gestrichen", (t) => t.replace("genau eine URL einstellen", "beliebig viele URLs"), "Review #601"],
    ["Betreiberhinweis Branch-Schutz gestrichen", (t) => t.replace("Der Branch-Schutz für \x60main\x60 ist eine offene Betreiberhandlung", "Der Branch-Schutz ist eingerichtet"), "Review #601"],
    ["M1 alte Kadenz gilt weiter", (t) => t.replace("**Kadenz (berichtigt 2026-11-27;", "Es gilt weiter: höchstens ein Release je Woche.\n\n**Kadenz (berichtigt 2026-11-27;"), "Es gilt weiter"],
    ["M6 Merge auch ohne Freigabe bei Sicherheitskorrektur", (t) => t.replace("**nur nach ausdrücklicher Merge-Freigabe des Betreibers**, §7)", "**nur nach ausdrücklicher Merge-Freigabe des Betreibers, bei Sicherheitskorrekturen auch ohne**, §7)"), "Merge-Freigabe"],
    ["M7 Kandidat darf still nachgebessert werden", (t) => t.replace("**nie still geändert** (kein Nachbessern", "**nie still geändert** (außer: er darf still nachgebessert werden; kein Nachbessern"), "still"],
    ["RST-2 #601 wieder in Review", (t) => t.replace("Ausführungsmodus mit PR #601 gemergt, c9a1f8d1", "Ausführungsmodus PR #601 noch in Review"), "#601"],
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
