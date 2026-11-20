// P2-21 — Laufzeit der Fachprüfung beim Wiederherstellen im ungünstigsten Fall messen (Nachweis
// docs/acc45/p2-21-nachweis.md). Rein lokal, keine Ablage, fester Tag. Gemessen wird wiederherstellungsPruefung
// (asynchron in Häppchen, wie der Server) mit dem Zeitbudget des Servers und ohne Budget (Gesamtdauer).
//
// Fall: großer Betrieb (PERSONEN), alte Sicherung mit ANDERER Schichtfolge (mittelbar: alle Personen, 120 Tage),
// in der Sicherung an jedem der TAGE vergangenen Tage und an jedem der 120 künftigen Tage eine ABWEICHENDE
// Einteilung je Person (ausdrücklich geprüft), Mindestbesetzung an jeder Dienstart (Tagesrechnung je Tag).
//
// Fall „folge" (dritter Parameter): nur die Schichtfolge weicht ab, keine Abweichungen (mittelbar allein).
//
// Aufruf: node werkzeug/p2-21-messung.mjs [personen=2000] [vergangeneTage=180] [folge]
import { wiederherstellungsPruefung, WIEDERHERSTELLEN_BUDGET_MS, letzteLaufzeit } from "../server/lib/schutzdurchsetzung.mjs";
import { tagePlus } from "../server/lib/zeiterfassung.mjs";

const PERSONEN = Number(process.argv[2] || 2000);
const TAGE = Number(process.argv[3] || 180);
const NUR_FOLGE = process.argv[4] === "folge";
const HEUTE = "2026-11-18";

const da = [
  { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30, mindest: { mo_do: 3, fr: 3, sa: 2, so: 2 } },
  { id: "S", name: "Spät", start: "14:00", ende: "22:00", pause: 30, mindest: { mo_do: 3, fr: 3, sa: 2, so: 2 } },
  { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30, mindest: { mo_do: 2, fr: 2, sa: 2, so: 2 } },
];
const einheiten = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, versatzTage: i % 7 }));
const personen = Array.from({ length: PERSONEN }, (_, i) => ({ id: `p${i}`, vorname: "V", nachname: `N${i}`, rolle: "mitarbeiter",
  status: "aktiv", geburtstag: "1980-01-01", bereich: `e${i % 20}`, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: `e${i % 20}` }],
  qualifikationen: [] }));
const betrieb = (zyklus, abweichungen) => ({ id: "m", einstellungen: { ruhezeit: 11, maxFolge: 6 }, einheiten, dienstarten: da,
  zyklus: { tage: zyklus }, anker: "2026-01-05", qualifikationen: [], personen, abweichungen, abwesenheiten: [], bestaetigungen: [] });

const jetztAbw = {}, sicherungAbw = {};
const folge = ["F", "S", "N"];
for (let i = 0; i < (NUR_FOLGE ? 0 : PERSONEN); i++)
  for (let d = -TAGE; d <= 120; d++) {
    const t = tagePlus(HEUTE, d);
    jetztAbw[`p${i}|${t}`] = folge[(i + d + 300) % 3];
    sicherungAbw[`p${i}|${t}`] = folge[(i + d + 301) % 3];               // überall abweichend, erzeugt S→F (Ruhezeit)
  }
const jetzt = betrieb(["F", "F", "S", "S", "N", "N", "-"], jetztAbw);
const alt = betrieb(["S", "S", "F", "F", "-", "N", "N"], sicherungAbw);

console.log(`Personen ${PERSONEN}, vergangene Tage ${TAGE}, Abweichungen je Stand ${Object.keys(jetztAbw).length}`);
for (const [name, budgetMs] of [["Budget der Wiederherstellung", undefined], ["ohne Budget", 30 * 60 * 1000]]) {
  const t0 = performance.now();
  const r = await wiederherstellungsPruefung(jetzt, alt, HEUTE, budgetMs ? { budgetMs } : {});
  const ms = Math.round(performance.now() - t0);
  const b = "bericht" in r ? r.bericht : null;
  console.log(`${name} (${budgetMs || WIEDERHERSTELLEN_BUDGET_MS} ms): ${ms} ms, ${b ? `Bericht: ${b.einteilungen} Einteilungen, sperrend ${b.sperrend}, vor heute ${b.vergangen}` : "ZEITBUDGET überschritten"}`
    + `, längster Block ${letzteLaufzeit && letzteLaufzeit.blockMs} ms, geprüft ${letzteLaufzeit && letzteLaufzeit.geprueft}`);
}
