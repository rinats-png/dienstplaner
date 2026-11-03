#!/usr/bin/env node
/* ==========================================================================
   WP-48 — MESSUNG TEILSPEICHERUNG (Entwurf, nur lesend/synthetisch)

   Misst, wie groß die Teile eines Bestands sind und was das heutige
   Vollspeichern gegenüber einem Teilspeichern (nur geänderte Monatsscherben
   plus Kern) kostet. Ändert keinen Produktcode und keine echten Daten:
   Der Bestand ist synthetisch, geschrieben wird nur in ein frisches
   Verzeichnis unter dem Temp-Ordner, das am Ende gelöscht wird.

     node werkzeug/wp48-messung.mjs                       Matrix 60/150/400 × 12/24/36
     node werkzeug/wp48-messung.mjs --personen 150 --monate 12
     node werkzeug/wp48-messung.mjs --ohne-ablage         nur Größen und Rechenzeiten
     node werkzeug/wp48-messung.mjs --json                Ergebnis zusätzlich als JSON

   Datenmenge: ein Betrieb in der Gestalt des Demobestands (src/App.jsx,
   baueMandant: Pflegebetrieb, Personen mit Qualifikationen, Nachweisen,
   Verfügbarkeitsraster, Einschränkungen …), hochskaliert auf n Personen in
   8 Einheiten. Schichtfolge F F S S N N - - - je Einheit versetzt. Je
   Diensttag eine bestätigte Ist-Zeit (erfassung, ~60 B) und ein Stempel
   (einstempeln, ~300 B wie /api/stempeln ihn ablegt); Abweichungen vom
   Rhythmus an ~8 % der Personentage. Die Monate enden mit dem laufenden
   Monat 2026-11 (dort nur Plan bis heute).

   Gemessen je Zelle:
   - Größen: Bestand gesamt, Kern, je Feld, Scherben (Anzahl, Mittel, Max),
     PUT-Rumpf heute (ganzer Bestand) gegen RUMPF_MAX, Teil-PUT für typische
     Änderungen (eine Einteilung im laufenden Monat; eine Stammdatenänderung).
   - Rechenzeiten (Median aus 3): JSON.stringify/parse des Ganzen,
     zerlegen, Fingerabdrücke aller Scherben, Fingerabdruck einer Scherbe.
   - Ablage (Dateien, wie in Produktion): erstes Schreiben, strenges Lesen,
     bestandSchreiben mit einer geänderten Einteilung (heutiger Weg, ohne
     Rechteprüfung) und ein Prototyp-Teilschreiben (Journal + Kern-Metadaten
     + eine Scherbe + Vermerk + Zeiger) als Untergrenze.
   ========================================================================== */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createHash, randomBytes } from "node:crypto";

export const RUMPF_MAX = 6 * 1024 * 1024;   // wie server/funktionen/daten.mjs
const HEUTE = "2026-11-03";
const LAUFEND = HEUTE.slice(0, 7);

/* ---------------------------------------------------------------- Kalender */
const monatPlus = (monat, n) => {
  const [j, m] = monat.split("-").map(Number);
  const z = j * 12 + (m - 1) + n;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
};
/** Die `anzahl` Monate bis einschließlich `bis`, älteste zuerst. */
export const monateBis = (bis, anzahl) => Array.from({ length: anzahl }, (_, i) => monatPlus(bis, i - anzahl + 1));
const tageDes = (monat) => {
  const [j, mo] = monat.split("-").map(Number);
  const n = new Date(Date.UTC(j, mo, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${monat}-${String(i + 1).padStart(2, "0")}`);
};
const tagIndex = (d) => Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);

/* ------------------------------------------------- Synthetischer Betrieb */
const ZYKLUS = ["F", "F", "S", "S", "N", "N", "-", "-", "-"];
const DIENSTE = {
  F: { start: "06:00", ende: "14:00" }, S: { start: "13:30", ende: "21:30" }, N: { start: "21:15", ende: "06:15" },
};

/** Eine Person in der Gestalt des Demobestands (ohne echte Personendaten). */
function person(i, einheitId) {
  return {
    id: `p${i + 1}`, vorname: `Vorname${i + 1}`, nachname: `Nachname${i + 1}`, funktion: i % 9 === 0 ? "Schichtleitung" : "Fachkraft",
    email: `person${i + 1}@beispiel.invalid`, zugehoerigkeit: [{ ab: "2024-01-01", einheitId }],
    eintritt: "2024-01-01", austritt: null, wochenstunden: 39, urlaubsanspruch: 30, urlaubsuebertrag: i % 5 === 0 ? 3 : 0,
    stundenuebertrag: -12.5, qualifikationen: ["q1", ...(i % 3 === 0 ? ["q3"] : [])],
    qualNachweise: [{ qualId: "q1", ablauf: "2027-05-01", datei: null }, ...(i % 3 === 0 ? [{ qualId: "q3", ablauf: null, datei: null }] : [])],
    einschraenkungen: { keineNacht: false, keinAlleindienst: false, maxDiensteWoche: null, wiedereingliederung: null },
    teilzeit: null, springer: false, rolle: i === 0 ? "leitung" : i % 9 === 1 ? "subplaner" : "mitarbeiter",
    bereich: i === 0 ? "ALLE" : einheitId,
    verfuegbarkeit: i % 6 === 0 ? { aktiv: true, raster: Array.from({ length: 21 }, (_, k) => !(k % 3 === 2 && k < 9)) }
      : { aktiv: false, raster: Array(21).fill(true) },
    nachweise: [], kontrastmodus: false, einfuehrung: { erledigt: true, schritt: 0 }, notiz: "", einarbeitung: null,
    benachrichtigung: { push: false, briefing: true, briefingZeit: "06:30" }, rolleSeit: "2024-01-01", status: "aktiv",
    imSchichtdienst: i !== 0, qualifikationenGeprueft: true,
  };
}

/**
 * Synthetischer Bestand: ein Raum, ein Betrieb, n Personen, Monatsdaten für `monate`.
 * @param {number} n
 * @param {string[]} monate
 */
export function bestandErzeugen(n, monate) {
  const einheiten = Array.from({ length: 8 }, (_, i) => ({ id: `e${i + 1}`, name: `Wohnbereich ${i + 1}`, kurz: `W${i + 1}` }));
  const mindest = { mo_do: 3, fr: 3, sa: 2, so: 2 };
  const dienstarten = Object.entries(DIENSTE).map(([id, z]) => ({ id, name: `Dienst ${id}`, kurz: id, ...z, pause: 30,
    farbe: "#3D7A5A", form: "regel", mindest, mindestQual: { q1: 1 } }));
  const personen = Array.from({ length: n }, (_, i) => person(i, einheiten[i % 8].id));
  const m = {
    id: "m-lindenhof", name: "Messbetrieb (Gestalt Demobestand)", branche: "pflege", einheitLabel: "Wohnbereich",
    bundesland: "NW", tarif: "pro", status: "aktiv", seit: "2024-04-15", stichtag: null, rabattGrund: 0,
    kontakt: "leitung@beispiel.invalid", anschrift: "Musterweg 1\n00000 Musterstadt",
    anker: "2024-01-01", zyklus: { wochen: 9, tage: ZYKLUS, vorlage: "v-mess" },
    einstellungen: { ruhezeit: 11, maxFolge: 6, maxNachtFolge: 4, maxUrlaubJeEinheit: 3, sollWochenstunden: 39,
      ausgleichGrenze: 40, ausgleichFristMonate: 6, aufbewahrungMonate: 24, planFreigabePflicht: true },
    standorte: [{ id: "s1", name: "Haus", land: "NW", lat: 51.5, lon: 7.4, radius: 150 }],
    einheiten, qualifikationen: [{ id: "q1", name: "Pflegefachkraft", kurz: "PFK", fachkraft: true },
      { id: "q2", name: "Praxisanleitung", kurz: "PA" }, { id: "q3", name: "Erste Hilfe", kurz: "EH", gueltigMonate: 24 }],
    dienstarten, personen, abwesenheiten: [], dienstbuch: [], anfragen: [], nachrichten: [], aushang: [], notizen: {},
    uebergaben: [], ansichten: [], wuensche: [], einarbeitung: [], planstaende: {}, freigaben: {},
    abweichungen: {}, erfassung: {}, einstempeln: {},
  };
  /* Abwesenheiten (Kern, wächst nur mäßig): je Person zwei Urlaubsblöcke im Jahr. */
  for (const p of personen) for (const monat of monate.filter((_, k) => k % 6 === 2))
    m.abwesenheiten.push({ id: `a-${p.id}-${monat}`, personId: p.id, art: "urlaub", von: `${monat}-10`, bis: `${monat}-16`, notiz: "" });
  let z = 0x9e3779b9;
  const zufall = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 2 ** 32; };
  for (const monat of monate) for (const d of tageDes(monat)) {
    const vergangen = d < HEUTE;
    for (let i = 0; i < personen.length; i++) {
      const p = personen[i];
      const k = `${p.id}|${d}`;
      let dienst = ZYKLUS[((tagIndex(d) + (i % 8)) % ZYKLUS.length + ZYKLUS.length) % ZYKLUS.length];
      if (zufall() < 0.08) { dienst = ["F", "S", "N", "-"][Math.floor(zufall() * 4)]; m.abweichungen[k] = dienst === "-" ? "frei" : dienst; }
      if (dienst === "-" || !vergangen) continue;
      const da = DIENSTE[dienst];
      m.erfassung[k] = { start: da.start, ende: da.ende, bestaetigt: true, grund: "" };
      m.einstempeln[k] = { start: da.start, startAm: `${d}T05:00:00.000Z`, ortStart: "innerhalb", innerhalbStart: true,
        geprueftStart: true, abstandStart: 42, ende: da.ende, endeAm: `${d}T13:00:00.000Z`, ortEnde: "innerhalb",
        innerhalbEnde: true, geprueftEnde: true, abstandEnde: 37, markierungen: [] };
    }
  }
  return { mandanten: [m], betreiber: { name: "Mess-Betreiber" }, session: null, version: 6 };
}

/* -------------------------------------------------------------- Messhilfen */
const mb = (bytes) => Math.round((bytes / 1048576) * 100) / 100;
const kb = (bytes) => Math.round(bytes / 1024);
const groesse = (x) => Buffer.byteLength(JSON.stringify(x));
function zeit(fn, wiederholungen = 3) {
  const t = [];
  let erg;
  for (let i = 0; i < wiederholungen; i++) { const a = performance.now(); erg = fn(); t.push(performance.now() - a); }
  t.sort((a, b) => a - b);
  return { ms: Math.round(t[Math.floor(t.length / 2)]), erg };
}
async function zeitAsync(fn) { const a = performance.now(); const erg = await fn(); return { ms: Math.round(performance.now() - a), erg }; }

/** Eine Zelle der Matrix messen. */
export async function zelleMessen(n, anzahlMonate, o = {}) {
  const { zerlegen, abdruck, zusammensetzen } = await import("../server/lib/scherben.mjs");
  const monate = monateBis(LAUFEND, anzahlMonate);
  const b = bestandErzeugen(n, monate);
  const m = b.mandanten[0];
  const aus = { personen: n, monate: anzahlMonate };

  /* Größen */
  const ganz = JSON.stringify(b);
  aus.bestandMB = mb(Buffer.byteLength(ganz));
  aus.abweichungenMB = mb(groesse(m.abweichungen));
  aus.erfassungMB = mb(groesse(m.erfassung));
  aus.einstempelnMB = mb(groesse(m.einstempeln));
  const z = zerlegen(b);
  aus.kernKB = kb(groesse(z.kern));
  const scherbenGroessen = [...z.scherben.values()].map(groesse);
  aus.scherben = scherbenGroessen.length;
  aus.scherbeMittelKB = kb(scherbenGroessen.reduce((a, x) => a + x, 0) / Math.max(1, scherbenGroessen.length));
  aus.scherbeMaxKB = kb(Math.max(0, ...scherbenGroessen));
  /* Standvermerk heute: je Scherbe der volle Abdruck-Text (scherben.mjs abdruck, „bewusst kein Hash") plus
     JSON des Kerns — so groß wie der Bestand ohne Stempel-Ersparnis. Entwurf: SHA-256, 32 Hex-Zeichen je Segment. */
  const vermerkHeute = { kern: JSON.stringify(z.kern) };
  for (const [id, s] of z.scherben) vermerkHeute[id] = abdruck(s);
  aus.vermerkHeuteMB = mb(groesse({ abdruecke: vermerkHeute }));
  const h = (t) => createHash("sha256").update(t).digest("hex").slice(0, 32);
  aus.vermerkHashKB = Math.round(groesse({ abdruecke: Object.fromEntries(Object.entries(vermerkHeute).map(([k, v]) => [k, h(v)])) }) / 102.4) / 10;
  /* PUT heute: der ganze Bestand (ohne session) im Rumpf { bestand, etag, durch }. */
  const putHeute = Buffer.byteLength(JSON.stringify({ bestand: { ...b, session: null }, etag: "7", durch: "Mess" }));
  aus.putHeuteMB = mb(putHeute);
  aus.putHeute413 = putHeute > RUMPF_MAX;
  /* PUT heute ohne Stempel (Stempel ändert das Speichern nie, WP-06) — Obergrenze dessen, was Weglassen allein bringt. */
  aus.putOhneStempelMB = mb(putHeute - Buffer.byteLength(JSON.stringify(m.einstempeln)));
  /* Teil-PUT A: eine Einteilung im laufenden Monat → Scherbe des Monats (ohne einstempeln, ohne Freeze) + Abdrücke. */
  const sLaufend = z.scherben.get(`${m.id}::${LAUFEND}`) || { felder: { abweichungen: {}, erfassung: {} } };
  const teilA = { format: "teile-1", basisStand: "7", durch: "Mess", segmente: {
    [`${m.id}::${LAUFEND}`]: { basis: createHash("sha256").update(abdruck(sLaufend)).digest("hex").slice(0, 32),
      felder: { abweichungen: { ...sLaufend.felder.abweichungen, [`p2|${LAUFEND}-20`]: "S" }, erfassung: sLaufend.felder.erfassung } } } };
  aus.teilPutEinteilungKB = kb(Buffer.byteLength(JSON.stringify(teilA)));
  /* Teil-PUT A': dieselbe Einteilung im Vormonat (voller Monat Erfassung) — der typische Fall nach Monatsende. */
  const vormonat = monatPlus(LAUFEND, -1);
  const sVor = z.scherben.get(`${m.id}::${vormonat}`) || sLaufend;
  aus.teilPutVormonatKB = kb(Buffer.byteLength(JSON.stringify({ format: "teile-1", basisStand: "7", durch: "Mess", segmente: {
    [`${m.id}::${vormonat}`]: { basis: "x".repeat(32), felder: { abweichungen: { ...sVor.felder.abweichungen, [`p2|${vormonat}-20`]: "S" },
      erfassung: sVor.felder.erfassung } } } })));
  /* Teil-PUT B: Stammdaten (eine Person) → Kern ohne Monatsfelder. */
  const teilB = { format: "teile-1", basisStand: "7", durch: "Mess", kern: { basis: "x".repeat(32), mandant: z.kern.mandanten[0] } };
  aus.teilPutKernKB = kb(Buffer.byteLength(JSON.stringify(teilB)));
  /* Teil-PUT C (feiner, Variante d / Schlüssel-Delta): nur die eine geänderte Zelle. */
  aus.teilPutZelleB = Buffer.byteLength(JSON.stringify({ format: "teile-1", basisStand: "7",
    aenderungen: [{ seg: `${m.id}::${LAUFEND}`, basis: "x".repeat(32), feld: "abweichungen", k: `p2|${LAUFEND}-20`, v: "S" }] }));

  /* Rechenzeiten (Median aus 3) */
  aus.stringifyMs = zeit(() => JSON.stringify(b)).ms;
  aus.parseMs = zeit(() => JSON.parse(ganz)).ms;
  aus.zerlegenMs = zeit(() => zerlegen(b)).ms;
  aus.abdrueckeAlleMs = zeit(() => { for (const s of z.scherben.values()) abdruck(s); }).ms;
  aus.abdruckEinerMs = zeit(() => abdruck(sVor)).ms;
  aus.zusammensetzenMs = zeit(() => zusammensetzen(z.kern, [...z.scherben.values()])).ms;

  if (!o.ohneAblage) {
    const wurzel = await mkdtemp(path.join(tmpdir(), "wp48-messung-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    const logAlt = console.log; const warnAlt = console.warn;
    console.log = () => {}; console.warn = () => {};
    try {
      const { getStore } = await import("../server/lib/ablage.mjs");
      const { bestandSchreiben, bestandLesenStreng } = await import("../server/lib/bestand.mjs");
      const { scherbenSchluessel, kernSchluessel } = await import("../server/lib/scherben.mjs");
      const store = getStore("wp48-messung");
      const raum = `mess-${n}-${anzahlMonate}`;
      aus.ablageErstesSchreibenMs = (await zeitAsync(() => bestandSchreiben(store, raum, b, { durch: "Mess" }))).ms;
      const gelesen = await zeitAsync(() => bestandLesenStreng(store, raum));
      aus.ablageLesenMs = gelesen.ms;
      /* Heutiger Weg (Speicheranteil): ganzer Bestand hinein, eine Einteilung im laufenden Monat geändert. */
      const neu = JSON.parse(JSON.stringify(gelesen.erg.bestand));
      neu.mandanten[0].abweichungen[`p2|${LAUFEND}-20`] = "S";
      const vollW = await zeitAsync(() => bestandSchreiben(store, raum, neu, { erwarteterStand: gelesen.erg.stand, durch: "Mess" }));
      aus.ablageVollSchreibenMs = vollW.ms;
      aus.ablageVollGeschriebeneStuecke = vollW.erg.geschrieben;
      /* Was liegt auf der Platte? (Kern, Scherben, bis zu zehn Standvermerke) */
      const { readdir, stat } = await import("node:fs/promises");
      let platte = 0, vermerke = 0;
      const gehen = async (d) => { for (const e of await readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await gehen(p);
        else { const g = (await stat(p)).size; platte += g; if (/stand/.test(decodeURIComponent(e.name))) vermerke += g; }
      } };
      await gehen(wurzel);
      aus.platteMB = mb(platte);
      aus.platteVermerkeMB = mb(vermerke);
      /* Heutiger Weg mit veraltetem Stand (Drei-Wege-Abgleich, anderer Monat). */
      const neu2 = JSON.parse(JSON.stringify(neu));
      neu2.mandanten[0].abweichungen[`p3|${monatPlus(LAUFEND, -1)}-11`] = "F";
      const dreiW = await zeitAsync(() => bestandSchreiben(store, raum, neu2, { erwarteterStand: gelesen.erg.stand, durch: "Mess" }));
      aus.ablageDreiWegeMs = dreiW.ms;
      aus.ablageDreiWegeOk = dreiW.erg.ok;
      /* Prototyp Teilschreiben (Untergrenze): Journal → Kern (Metadaten) → eine Scherbe → Vermerk → Zeiger → Journal weg.
         Ohne Rechteprüfung, ohne Abgleich; unter eigenem Raum, damit der echte Stand unberührt bleibt. */
      const pRaum = `${raum}-prototyp`;
      await bestandSchreiben(store, pRaum, b, { durch: "Mess" });
      const zz = zerlegen(b);
      const sid = `${m.id}::${LAUFEND}`;
      const s = zz.scherben.get(sid);
      const teil = await zeitAsync(async () => {
        const sNeu = { ...s, felder: { ...s.felder, abweichungen: { ...s.felder.abweichungen, [`p2|${LAUFEND}-20`]: "S" } } };
        const schritte = [
          { art: "setzen", schluessel: kernSchluessel(pRaum), wert: zz.kern, metadata: { stand: 2 } },
          { art: "setzen", schluessel: scherbenSchluessel(pRaum, m.id, LAUFEND), wert: sNeu },
          { art: "setzen", schluessel: `stand:${pRaum}:2`, wert: { abdruecke: { [sid]: abdruck(sNeu) } } },
          { art: "setzen", schluessel: `stand:${pRaum}:aktuell`, wert: { nr: 2 } },
        ];
        await store.setJSON(`journal:${pRaum}`, { id: randomBytes(8).toString("hex"), schritte,
          pruefsumme: createHash("sha256").update(JSON.stringify(schritte)).digest("hex") });
        for (const x of schritte) await store.setJSON(x.schluessel, x.wert, x.metadata ? { metadata: x.metadata } : undefined);
        await store.delete(`journal:${pRaum}`);
      });
      aus.prototypTeilSchreibenMs = teil.ms;
      /* Prototyp Teilschreiben ohne Kern (Kern-Stand in eigener kleiner Datei statt im großen Kern). */
      const teil2 = await zeitAsync(async () => {
        const sNeu = { ...s, felder: { ...s.felder, abweichungen: { ...s.felder.abweichungen, [`p4|${LAUFEND}-21`]: "F" } } };
        await store.setJSON(`journal:${pRaum}`, { id: "x", schritte: [] });
        await store.setJSON(scherbenSchluessel(pRaum, m.id, LAUFEND), sNeu);
        await store.setJSON(`stand:${pRaum}:aktuell`, { nr: 3 });
        await store.delete(`journal:${pRaum}`);
      });
      aus.prototypTeilOhneKernMs = teil2.ms;
    } finally {
      console.log = logAlt; console.warn = warnAlt;
      await rm(wurzel, { recursive: true, force: true }).catch(() => {});
    }
  }
  return aus;
}

const SPALTEN = [
  ["personen", "Pers."], ["monate", "Mon."], ["bestandMB", "Bestand MB"], ["kernKB", "Kern KB"],
  ["abweichungenMB", "Plan MB"], ["erfassungMB", "Erfassung MB"], ["einstempelnMB", "Stempel MB"],
  ["scherben", "Scherben"], ["scherbeMittelKB", "Scherbe Ø KB"], ["scherbeMaxKB", "Scherbe max KB"],
  ["vermerkHeuteMB", "Vermerk heute MB"], ["vermerkHashKB", "Vermerk Hash KB"], ["platteMB", "Platte MB"], ["platteVermerkeMB", "davon Vermerke MB"],
  ["putHeuteMB", "PUT heute MB"], ["putHeute413", "413?"], ["putOhneStempelMB", "PUT o. Stempel MB"],
  ["teilPutEinteilungKB", "Teil-PUT lfd. Monat KB"], ["teilPutVormonatKB", "Teil-PUT Vormonat KB"], ["teilPutKernKB", "Teil-PUT Kern KB"], ["teilPutZelleB", "Zellen-Delta B"],
  ["stringifyMs", "stringify ms"], ["parseMs", "parse ms"], ["zerlegenMs", "zerlegen ms"], ["abdrueckeAlleMs", "Abdrücke alle ms"],
  ["abdruckEinerMs", "Abdruck 1 Monat ms"], ["ablageErstesSchreibenMs", "Ablage erst ms"], ["ablageLesenMs", "Lesen streng ms"],
  ["ablageVollSchreibenMs", "Schreiben heute ms"], ["ablageDreiWegeMs", "Drei-Wege ms"], ["prototypTeilSchreibenMs", "Teil (Kern+1) ms"],
  ["prototypTeilOhneKernMs", "Teil (1 Scherbe) ms"],
];
export function tabelle(zeilen) {
  const sp = SPALTEN.filter(([k]) => zeilen.some((z) => k in z));
  const kopf = `| ${sp.map(([, t]) => t).join(" | ")} |`;
  const linie = `|${sp.map(() => "---").join("|")}|`;
  const rumpf = zeilen.map((z) => `| ${sp.map(([k]) => (k in z ? (z[k] === true ? "ja" : z[k] === false ? "nein" : z[k]) : "–")).join(" | ")} |`);
  return [kopf, linie, ...rumpf].join("\n");
}

async function main() {
  const arg = process.argv.slice(2);
  const wert = (n) => { const i = arg.indexOf(n); return i >= 0 ? Number(arg[i + 1]) : null; };
  const personen = wert("--personen") ? [wert("--personen")] : [60, 150, 400];
  const monate = wert("--monate") ? [wert("--monate")] : [12, 24, 36];
  const zeilen = [];
  for (const p of personen) for (const mo of monate) {
    const z = await zelleMessen(p, mo, { ohneAblage: arg.includes("--ohne-ablage") });
    zeilen.push(z);
    process.stderr.write(`gemessen ${p} × ${mo}\n`);
  }
  console.log(tabelle(zeilen));
  if (arg.includes("--json")) console.log(JSON.stringify(zeilen, null, 1));
}

if (process.argv[1] && path.basename(process.argv[1]) === "wp48-messung.mjs") {
  main().catch((e) => { console.error(e); process.exit(1); });
}
