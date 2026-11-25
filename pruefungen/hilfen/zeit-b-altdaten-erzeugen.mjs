// WP-ZEIT, ZEIT-B Stufe 1, Schritt 1 (Golden-Anker Teil A): Herkunft der Fixture pruefungen/fixtures/zeit-b-altdaten.json.
//
// NUR ZUR NACHVOLLZIEHBARKEIT. Einmalig ausgeführt auf origin/integration/release-v4 @ ec9d5605 (2026-11-23):
//     node pruefungen/hilfen/zeit-b-altdaten-erzeugen.mjs > pruefungen/fixtures/zeit-b-altdaten.json
// Die JSON-Datei IST der Altbestand („so lagen die Daten auf der Platte“). pruefungen/zeit-b-altdaten.test.js liest nur
// die JSON-Datei, nie dieses Skript. Ein späterer Lauf dieses Skripts darf die JSON-Datei NICHT ersetzen: Teil A ist für
// immer invariant (docs/acc45/ZEIT-B-STUFE1-PLAN.md § 3.2). Ein anderes Ergebnis dieses Skripts auf einem späteren
// Stand zeigt nur, dass sich Erzeugung (Abschluss, Freeze) geändert hat — Altdaten bleiben, wie sie gespeichert sind.
//
// Inhalt: ein Betrieb in Bayern, drei Personen, Modell-1-Stempel aus einem Zufallsgenerator mit festem Startwert
// (Muster pruefungen/zeit-schnellweg.test.js:30) in allen Varianten des Altbestands (mit/ohne startAm, mit/ohne
// endeDatum, Gerätetag-Schlüssel vor WP-17, Offline-Felder, Kennzeichen, Korrekturen, Anträge), dazu die
// Zuschlagsfälle Sa 21:30 → So 07:15, Feiertag 24.→25.12., Monatsgrenze 31.10.→1.11. und beide Umstellungsnächte 2026.
// Geschlossen (mit Freeze): 2026-03, 2026-10 (Lohnexport bestätigt), 2026-12. Offen: 2026-11, 2027-01.
// Feste Kennungen, feste Uhr (Argumente), kein Netz.
import { leererMandant, zugangsPerson } from "../../src/lib/mandant-anlage.js";
import { abschliessen, lohnexportBestaetigen, exportZeilenFuer, datevZeilenAbdruck } from "../../server/lib/monatsabschluss.mjs";
import { korrekturAnhaengen } from "../../server/lib/stempelintegritaet.mjs";
import { antragStellen } from "../../server/lib/korrekturworkflow.mjs";

let saat = 0x2e17b001;
const zufall = () => { saat = (saat * 1103515245 + 12345) >>> 0; return saat / 2 ** 32; };
const wahl = (xs) => xs[Math.floor(zufall() * xs.length)];
const pad = (n) => String(n).padStart(2, "0");
const plusTag = (d, n = 1) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** Berliner Wanduhr → UTC-ISO für 2026/2027 (Umstellungen 2026-03-29, 2026-10-25, 2027-03-28): nur für die Fixture. */
function berlinIso(d, hm) {
  const sommer = (d > "2026-03-29" || (d === "2026-03-29" && hm >= "03:00")) && (d < "2026-10-25" || (d === "2026-10-25" && hm < "02:00"));
  const off = sommer ? 2 : 1;
  const [h, mi] = hm.split(":").map(Number);
  return new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h - off, mi)).toISOString();
}

const m = leererMandant("ZeitB-Golden-Altdaten", "pflege");
const e1 = "e-zeit-b-1";
m.id = "m-zeit-b";
m.bundesland = "BY";
m.standorte = (m.standorte || []).map((s, i) => ({ ...s, id: `st-zeit-b-${i + 1}`, bundesland: "BY" }));
m.einheiten = m.einheiten.map((x, i) => (i === 0 ? { ...x, id: e1, standortId: m.standorte[0].id } : { ...x, id: `e-zeit-b-${i + 1}` }));
const ohneVorgabe = { mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} };
const DA = (id, start, ende, pause) => ({ ...m.dienstarten[0], ...ohneVorgabe, id, name: id, kurz: id, start, ende, pause, form: "regel" });
m.dienstarten = [DA("F", "06:00", "14:00", 30), DA("S", "14:00", "22:00", 30), DA("N", "22:00", "06:00", 30), DA("W", "21:30", "07:15", 45)];
m.einstellungen = { ...m.einstellungen, nachtVon: "23:00", nachtBis: "06:00" };
m.zuschlaege = [
  { id: "z-n", art: "nacht", name: "Nacht", prozent: 25, aktiv: true },
  { id: "z-so", art: "sonntag", name: "Sonntag", prozent: 50, aktiv: true },
  { id: "z-ft", art: "feiertag", name: "Feiertag", prozent: 100, aktiv: true },
  { id: "z-sa", art: "samstag", name: "Samstag", prozent: 10, aktiv: true },
];
const person = (id, nr, vor, nach) => ({ ...zugangsPerson("mitarbeiter", e1, nr), id, vorname: vor, nachname: nach,
  personalnummer: `P-ZEITB-${nr}`, rolle: "mitarbeiter", eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e1 }],
  bereich: e1, imSchichtdienst: false, wochenstunden: 20, stundenuebertrag: 0 });
m.personen = [person("b1", 1, "Bea", "Altdaten"), person("b2", 2, "Bo", "Gerätetag"), person("b3", 3, "Cem", "Nacht")];
m.abweichungen = {}; m.erfassung = {}; m.einstempeln = {}; m.abwesenheiten = []; m.anfragen = []; m.monatsabschluss = {};
m.lohnarten = undefined;

const DA_MAP = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
/** Ein Modell-1-Stempel in einer Variante des Altbestands. */
function stempel(pid, d, art, variante) {
  const da = DA_MAP[art];
  const minus = wahl([0, 1, 2, 4, 7]), plus = wahl([0, 1, 3, 6, 11]);
  const hm = (t, delta) => { let [h, mi] = t.split(":").map(Number); let x = h * 60 + mi + delta; x = (x + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
  const start = hm(da.start, -minus), ende = hm(da.ende, plus);
  const ueber = ende <= start;
  const ed = ueber ? plusTag(d) : d;
  const e = { start, ende };
  if (variante !== "vorWP17") {
    e.startAm = berlinIso(d, start); e.endeAm = berlinIso(ed, ende);
    if (ueber) e.endeDatum = ed;
    if (zufall() < 0.5) {
      const n = Math.floor(zufall() * 1e9);
      e.ereignisStart = `${pad(n % 100)}a0b1c2-0000-4000-8000-${String(n).padStart(12, "0")}`;
      e.ereignisEnde = `${pad(n % 100)}a0b1c3-0000-4000-8000-${String(n).padStart(12, "0")}`;
    }
    if (zufall() < 0.6) { e.ortStart = "innerhalb"; e.innerhalbStart = true; e.geprueftStart = true; e.ortEnde = "innerhalb"; e.innerhalbEnde = true; e.geprueftEnde = true; }
  }
  if (variante === "offline") {
    const g = Date.parse(e.startAm) - 4000;
    e.offlineStart = { offline: true, geraetAm: new Date(g).toISOString(), gesendetAm: new Date(g + 3600e3).toISOString(),
      eingangAm: new Date(g + 3600e3 + 900).toISOString(), versatzMs: -900, zeitAm: e.startAm };
  }
  if (variante === "kennzeichen") { e.markierungen = ["GERAETEDATUM_ABWEICHEND"]; }
  if (variante === "konflikt") { delete e.ende; delete e.endeAm; delete e.endeDatum; delete e.ereignisEnde; e.markierungen = ["KONFLIKT"]; e.konfliktGrund = "vorgang_veraltet"; }
  if (zufall() < 0.4 && e.ende) e.pause = da.pause;
  return e;
}

/* Feste Zuschlagsfälle (T-ZS-1) und Umstellungsnächte: Person b3. */
const FEST = [
  ["b3", "2026-03-28", "N"], // Sa → So 29.03. (Frühjahr)
  ["b3", "2026-10-03", "W"], // Sa 21:30 → So 07:15
  ["b3", "2026-10-24", "N"], // Sa → So 25.10. (Herbst)
  ["b3", "2026-10-31", "N"], // Sa → So 1.11. Allerheiligen (Monatsgrenze, BY)
  ["b3", "2026-12-24", "N"], // Do 24.12. → Fr 25.12. (Feiertag)
];
for (const [pid, d, art] of FEST) {
  m.abweichungen[`${pid}|${d}`] = art;
  const da = DA_MAP[art];
  const ed = da.ende <= da.start ? plusTag(d) : d;
  m.einstempeln[`${pid}|${d}`] = { start: da.start, ende: da.ende, startAm: berlinIso(d, da.start), endeAm: berlinIso(ed, da.ende),
    ...(ed !== d ? { endeDatum: ed } : {}) };
  m.erfassung[`${pid}|${d}`] = { start: da.start, ende: da.ende, bestaetigt: true, grund: "" };
}

/* Zufallsbestand: b1 Tag-/Spätdienste, b2 vor WP-17 (Gerätetag) und offline. */
const MONATE = [["2026-03", 31], ["2026-10", 31], ["2026-11", 30], ["2026-12", 31], ["2027-01", 31]];
for (const [mon, tage] of MONATE) {
  for (let t = 1; t <= tage; t++) {
    const d = `${mon}-${pad(t)}`;
    for (const pid of ["b1", "b2"]) {
      if (zufall() < 0.55) continue;
      const art = wahl(["F", "F", "S", "N"]);
      if (m.abweichungen[`${pid}|${plusTag(d, -1)}`] === "N" && art !== "S") continue; // kein Doppelvorgang nach Nacht
      const variante = pid === "b2" ? wahl(["vorWP17", "vorWP17", "offline", "normal"]) : wahl(["normal", "normal", "kennzeichen", "konflikt", "offline"]);
      m.abweichungen[`${pid}|${d}`] = art;
      /* Gerätetag-Schlüssel vor WP-17: ein Nachtdienst, dessen Ende das Gerät auf den Folgetag schrieb. */
      const e = stempel(pid, d, art, variante);
      m.einstempeln[`${pid}|${d}`] = e;
      if (e.ende) {
        const bestaetigt = zufall() < 0.8;
        m.erfassung[`${pid}|${d}`] = { start: e.start, ende: e.ende, bestaetigt, grund: bestaetigt ? "" : "LANGER_DIENST: zur Prüfung",
          ...(e.pause !== undefined ? { pause: e.pause } : {}) };
      }
    }
  }
}
/* Ein Gerätetag-Fall vor WP-17 ausdrücklich: Ende auf dem Folgetag als eigener Schlüssel (Nachtdienst, Gerät nach Mitternacht). */
m.einstempeln["b2|2026-11-15"] = { start: "22:03" };
m.einstempeln["b2|2026-11-16"] = { ende: "06:04" };
m.abweichungen["b2|2026-11-15"] = "N";

/* Korrekturen und Anträge mit echtem Ereignisformat (feste Kennungen, feste Uhr). */
const WER_L = { personId: "l1", name: "Leitung", rolle: "leitung" };
let n = 0;
const kor = (pid, d, start, ende, am, heute) => {
  if (!m.einstempeln[`${pid}|${d}`] || !m.einstempeln[`${pid}|${d}`].ende) return;
  const r = korrekturAnhaengen(m, { personId: pid, datum: d, start, ende, grund: "Laut Dienstbuch korrigiert (Golden-Anker)" },
    WER_L, new Date(am), `k-golden${String(++n).padStart(4, "0")}`, {});
  if ("status" in r) throw new Error(`Korrektur ${pid}|${d}: ${r.grund}`);
  Object.assign(m, r.mandant);
  void heute;
};
const ersteMit = (pid, mon) => Object.keys(m.einstempeln).filter((k) => k.startsWith(`${pid}|${mon}`) && m.einstempeln[k].ende && m.einstempeln[k].startAm).sort()[0];
for (const [pid, mon, am] of [["b1", "2026-03", "2026-03-31T10:00:00Z"], ["b1", "2026-10", "2026-10-30T10:00:00Z"], ["b2", "2026-12", "2026-12-30T10:00:00Z"], ["b1", "2027-01", "2027-01-29T10:00:00Z"]]) {
  const k = ersteMit(pid, mon);
  if (k) { const d = k.split("|")[1]; const e = m.einstempeln[k]; kor(pid, d, e.start, e.ende === "23:59" ? "23:58" : e.ende.replace(/.$/, (c) => String((Number(c) + 1) % 10)), am); }
}
/* Ein Antrag (offen, Januar 2027 — offener Monat) und ein entschiedener Antrag im Freeze-freien Bereich. */
{
  const k = Object.keys(m.einstempeln).filter((x) => x.startsWith("b1|2027-01-2") && m.einstempeln[x].ende).sort().pop();
  const d = k.split("|")[1];
  const r = antragStellen(m, { personId: "b1", name: "Bea", rolle: "mitarbeiter" }, { datum: d, start: "05:50", ende: "14:10", grund: "Übergabe dauerte länger (Golden)" },
    new Date(`${d}T20:00:00Z`), "ka-golden0001", d);
  if ("status" in r) throw new Error(`Antrag: ${r.grund}`);
  Object.assign(m, r.mandant);
}

/* Abschlüsse mit Freeze (Schema 3), feste Kennungen und Uhr; Oktober mit bestätigtem Lohnexport. */
const zu = (mon, am, heute) => {
  const r = abschliessen(m, { monat: mon, trotzPrueffaellen: true, grund: "Golden-Anker ZEIT-B" }, WER_L, new Date(am), `ma-golden-${mon}`, heute);
  if ("status" in r) throw new Error(`Abschluss ${mon}: ${r.grund}`);
  Object.assign(m, r.mandant);
};
zu("2026-03", "2026-04-02T08:00:00Z", "2026-04-02");
zu("2026-10", "2026-11-03T08:00:00Z", "2026-11-03");
{
  const e = m.monatsabschluss["2026-10"];
  const zeilen = datevZeilenAbdruck(exportZeilenFuer(m, "2026-10").zeilen);
  const r = lohnexportBestaetigen(m, { monat: "2026-10", abdruck: e.abdruck, zeilen, stand: e.stand, revision: 1,
    trotzVormonat: true, vormonatKategorie: "vor_inbetriebnahme", vormonatGrund: "Vormonate vor der Inbetriebnahme (Golden-Anker)" },
  WER_L, new Date("2026-11-04T08:00:00Z"), "ma-golden-lohn-2026-10");
  if ("status" in r) throw new Error(`Lohnexport: ${r.grund}`);
  Object.assign(m, r.mandant);
}
zu("2026-12", "2027-01-04T08:00:00Z", "2027-01-04");

process.stdout.write(JSON.stringify({ hinweis: "WP-ZEIT ZEIT-B Golden-Anker Teil A: Altbestand, erzeugt auf ec9d5605 (pruefungen/hilfen/zeit-b-altdaten-erzeugen.mjs). Nie neu erzeugen.", mandant: m }) + "\n");
