#!/usr/bin/env node
/* ==========================================================================
   WP-16 NACHTRAG — MESSMATRIX MONATSABSCHLUSS (H-neu-1, M-neu-1, Betreiber B)

   Wiederholbar, nicht im CI-Pflichtlauf (zu lang); eine kleine Stichprobe
   steht in pruefungen/monatsabschluss-nachtrag.test.js.

     node werkzeug/wp16-messung.mjs                    Matrix 60/150/400 × 12/24/36
     node werkzeug/wp16-messung.mjs --personen 60 --monate 12
     node werkzeug/wp16-messung.mjs --stempel          zusätzlich je Diensttag ein Stempel (einstempeln)
     node werkzeug/wp16-messung.mjs --ohne-server      nur Bibliothek (Größen, Abschluss, Widerspruch)

   Datenmenge (synthetisch, ohne Personendaten): 8 Einheiten, Schichtfolge
   F F S S N N - - - (Anker 2020-01-06), alle Personen im Schichtdienst,
   39 Wochenstunden; je Diensttag eine bestätigte Ist-Zeit (Erfassung); mit
   --stempel dazu der Stempel. Abgeschlossen werden die Monate vor 2026-11
   (lückenlos rückwärts), Heute = 2026-11-05.

   Gemessen je Zelle: Freeze-Größe Schema 1 (je Tag volle Dienstart-Kopie,
   Stand vor dem Nachtrag) und Schema 2 (kompakt) in Byte je Personentag und
   gesamt, Bestand gesamt (GET), PUT-Rumpf der Oberfläche (ohne Server-
   Felder) und mit Freeze (alte Oberfläche) gegen RUMPF_MAX, Laufzeit
   abschlussWiderspruch vorher (alte Schleife) und nachher, Abschluss und
   Wiederöffnen (Bibliothek und HTTP), GET/PUT über die Serverfunktion,
   Sicherung → Wiederherstellen (Abschluss + Freeze identisch).
   ========================================================================== */
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { dienstKopie, planTag } from "../server/lib/isteinfrieren.mjs";
import { istZeitFuer, ungeplanterDienst } from "../server/lib/istdaten.mjs";
import { abschliessen, wiederoeffnen, abschlussWiderspruch, IST_FELDER, monatVon } from "../server/lib/monatsabschluss.mjs";
import { ohneServerFelder } from "../src/speicher.js";

export const RUMPF_MAX = 6 * 1024 * 1024;           // wie server/funktionen/daten.mjs
export const HEUTE = "2026-11-05";
const WER = { personId: "l1", name: "L", rolle: "leitung" };

const monatPlus = (monat, n) => {
  const [j, m] = monat.split("-").map(Number);
  const z = j * 12 + (m - 1) + n;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
};
/** Die `anzahl` Monate vor `bis` (ausschließlich), älteste zuerst. */
export const monateVor = (bis, anzahl) => Array.from({ length: anzahl }, (_, i) => monatPlus(bis, i - anzahl));
const tageDes = (monat) => {
  const [j, mo] = monat.split("-").map(Number);
  const n = new Date(Date.UTC(j, mo, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${monat}-${String(i + 1).padStart(2, "0")}`);
};

/**
 * Synthetischer Betrieb mit `n` Personen (ohne Personendaten), Erfassung für die angegebenen Monate.
 * @param {number} n
 * @param {string[]} monate
 * @param {{stempel?: boolean}} [o]
 */
export function betriebErzeugen(n, monate, o = {}) {
  const einheiten = Array.from({ length: 8 }, (_, i) => ({ id: `e${i + 1}`, name: `Wohnbereich ${i + 1}`, versatzTage: i }));
  const mindest = { mo_do: 1, fr: 1, sa: 1, so: 1 };
  const dienstarten = [
    { id: "F", name: "Frühdienst", kurz: "F", start: "06:00", ende: "14:00", pause: 30, farbe: "#3D7A5A", form: "regel", mindest, mindestQual: {} },
    { id: "S", name: "Spätdienst", kurz: "S", start: "13:30", ende: "21:30", pause: 30, farbe: "#B5822B", form: "regel", mindest, mindestQual: {} },
    { id: "N", name: "Nachtdienst", kurz: "N", start: "21:15", ende: "06:15", pause: 45, farbe: "#35506B", form: "regel", mindest, mindestQual: {} },
  ];
  const personen = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, vorname: "V", nachname: `N${i + 1}`, rolle: i === 0 ? "leitung" : "mitarbeiter",
    funktion: "Pflegefachkraft", status: "aktiv", wochenstunden: 39, urlaubsanspruch: 30, eintritt: "2020-01-01", geburtstag: "1985-01-01",
    imSchichtdienst: true, qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheiten[i % 8].id }] }));
  const m = { id: "m1", name: "Messbetrieb", bundesland: "NI", anker: "2020-01-06", einheiten, dienstarten,
    zyklus: { tage: ["F", "F", "S", "S", "N", "N", "-", "-", "-"] }, einstellungen: { ruhezeit: 11 },
    personen, abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], monatsabschluss: {} };
  const merk = new Map();
  for (const monat of monate) for (const d of tageDes(monat)) for (const p of personen) {
    const t = planTag(m, p, d, merk);
    if (!t || !t.dienstId) continue;
    const da = dienstarten.find((x) => x.id === t.dienstId);
    const k = `${p.id}|${d}`;
    m.erfassung[k] = { start: da.start, ende: da.ende, bestaetigt: true, grund: "" };
    if (o.stempel) m.einstempeln[k] = { start: da.start, startAm: `${d}T05:00:00.000Z`, ortStart: "Ohne Standortfreigabe erfasst",
      innerhalbStart: null, geprueftStart: false, ende: da.ende, endeAm: `${d}T13:00:00.000Z`, ortEnde: "Ohne Standortfreigabe erfasst",
      innerhalbEnde: null, geprueftEnde: false };
  }
  return m;
}

/** Das eingefrorene Ist im Schema 1 (Stand vor dem Nachtrag: je Tag eine volle Dienstart-Kopie) — Vergleich und Messung. */
export function istEinfrierenSchema1(m, monat) {
  const merk = new Map();
  const da = new Map((m.dienstarten || []).map((x) => [x.id, x]));
  const voll = { ...m, sichtIstDaten: undefined };
  const aus = {};
  for (const p of m.personen || []) {
    for (const d of tageDes(monat)) {
      const t = planTag(m, p, d, merk);
      if (!t) continue;
      const k = `${p.id}|${d}`;
      if (t.arten.length) {
        aus[k] = { a: t.arten, ...(t.plan ? { pl: 1 } : {}), w: Number.isFinite(Number(p.wochenstunden)) ? Number(p.wochenstunden) : 0 };
        continue;
      }
      const x = t.dienstId ? da.get(t.dienstId) : ungeplanterDienst(voll, p, d);
      if (!x) continue;
      const i = istZeitFuer(voll, p, d, x);
      aus[k] = { da: dienstKopie(x), std: i.std, ...(i.erfasst ? { e: 1 } : {}), ...(i.zurPruefung ? { p: 1 } : {}) };
    }
  }
  return aus;
}

/** abschlussWiderspruch vor dem Nachtrag (je Monat und Feld eine Schleife über alle Schlüssel) — nur für die Vorher-Messung. */
export function abschlussWiderspruchVorher(altM, gesendetM) {
  const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const monate = Object.keys(altM.monatsabschluss || {}).filter((x) => altM.monatsabschluss[x].abgeschlossen === true).sort();
  for (const monat of monate) for (const feld of IST_FELDER) {
    if (!Object.prototype.hasOwnProperty.call(gesendetM, feld)) continue;
    const a = objekt(altM[feld]) ? altM[feld] : {};
    const n = objekt(gesendetM[feld]) ? gesendetM[feld] : {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(n)])) {
      if (monatVon(String(k).split("|")[1] || "") !== monat || JSON.stringify(a[k]) === JSON.stringify(n[k])) continue;
      return { schluessel: k, monat };
    }
  }
  return null;
}

/** Alle Monate nacheinander abschließen (Bibliothek). */
export function alleAbschliessen(m, monate) {
  let x = m;
  for (const monat of monate) {
    const r = abschliessen(x, { monat, trotzPrueffaellen: true }, WER, new Date(`${HEUTE}T09:00:00Z`), `ma-${monat}`, HEUTE);
    if ("status" in r) throw new Error(r.grund);
    x = r.mandant;
  }
  return x;
}

const groesse = (x) => Buffer.byteLength(JSON.stringify(x));
const ms = (f) => { const t = performance.now(); const r = f(); return [r, Math.round(performance.now() - t)]; };
const mb = (b) => (b / 1024 / 1024).toFixed(2);

/** Eine Zelle der Matrix (Bibliothek). */
export function zelleBibliothek(n, anzahlMonate, o = {}) {
  const monate = monateVor(HEUTE.slice(0, 7), anzahlMonate);
  const roh = betriebErzeugen(n, monate, o);
  const [zu, tAbschluesseGesamt] = ms(() => alleAbschliessen(roh, monate));
  const personentage = Object.keys(zu.istEingefroren).filter((k) => /\|\d{4}-\d{2}-\d{2}$/.test(k)).length;
  const freeze2 = groesse(zu.istEingefroren);
  const probe = monate[monate.length - 1];
  const s1Monat = groesse(istEinfrierenSchema1(roh, probe));
  const s2Monat = groesse(Object.fromEntries(Object.entries(zu.istEingefroren).filter(([k]) => String(k).split("|")[1].startsWith(probe))));
  const tageProbe = Object.keys(zu.istEingefroren).filter((k) => /\|\d{4}-\d{2}-\d{2}$/.test(k) && k.includes(`|${probe}-`)).length;
  const bestand = { version: 9, mandanten: [zu] };
  const bestandGesamt = groesse(bestand);
  const putNeu = groesse({ bestand: ohneServerFelder(bestand), etag: "x" });
  const putAlt = groesse({ bestand, etag: "x" });
  /* PUT-Prüfung: die Oberfläche schickt den gespeicherten Stand zurück (unverändert) — vorher mit Freeze. */
  const gesendetNeu = ohneServerFelder(bestand).mandanten[0];
  const [, tWNeu] = ms(() => abschlussWiderspruch(zu, gesendetNeu, { vollSicht: true }));
  const [, tWNeuMitFreeze] = ms(() => abschlussWiderspruch(zu, zu, { vollSicht: true }));
  const [, tWAlt] = ms(() => abschlussWiderspruchVorher(zu, zu));
  /* Abschluss eines weiteren Monats (der jüngste offene vor heute ist schon zu; also: letzten wiederöffnen, neu abschließen). */
  const [w, tWieder] = ms(() => wiederoeffnen(zu, { monat: probe, grund: "Messung Wiederöffnen" }, WER, new Date(), "w-mess"));
  if ("status" in w) throw new Error(w.grund);
  const [, tAbschluss] = ms(() => abschliessen(w.mandant, { monat: probe, trotzPrueffaellen: true }, WER, new Date(), "ma-mess", HEUTE));
  return { n, monate: anzahlMonate, personentage, freeze2, freeze1Hochgerechnet: Math.round(s1Monat * (personentage / tageProbe)),
    bProTag1: Math.round(s1Monat / tageProbe), bProTag2: Math.round(s2Monat / tageProbe), bestandGesamt, putNeu, putAlt,
    tWAlt, tWNeu, tWNeuMitFreeze, tAbschluss, tWieder, tAbschluesseGesamt, mandant: zu };
}

/** HTTP über die Serverfunktion: GET, PUT (Oberfläche neu/alt), Abschluss, Wiederöffnen, Sicherung → Wiederherstellen. */
export async function zelleServer(z, umgebung) {
  const { daten, B, laden, sitzungAnlegen } = umgebung;
  const raum = `mess-${z.n}-${z.monate}`;
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [z.mandant] }, { durch: "Messung" });
  const token = (await sitzungAnlegen({ bestand: raum, name: "L", rolle: "leitung", person: "p1", betrieb: 0, mandantId: "m1", einheit: null }, 3600e3)).token;
  let nr = 0;
  const anfrage = async (pfad, methode, rumpf) => {
    nr++;
    const kopf = { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "x-forwarded-for": `10.99.${nr % 250}.${(nr >> 8) % 250}`, authorization: `Bearer ${token}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    const t = performance.now();
    const a = await daten(new Request(`http://127.0.0.1:3000/api/${pfad}`, { method: methode, headers: kopf, ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf) }) }), {});
    const text = await a.text();
    let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
    return { status: a.status, ms: Math.round(performance.now() - t), d, laenge: Buffer.byteLength(text) };
  };
  const g = await anfrage("bestand", "GET");
  const putNeu = await anfrage("bestand", "PUT", { bestand: ohneServerFelder(g.d.bestand), etag: g.d.etag });
  const g2 = await anfrage("bestand", "GET");
  const putAlt = await anfrage("bestand", "PUT", { bestand: g2.d.bestand, etag: g2.d.etag });
  const probe = monateVor(HEUTE.slice(0, 7), 1)[0];
  const wo = await anfrage("monatsabschluss", "POST", { aktion: "wiederoeffnen", monat: probe, grund: "Messung Wiederöffnen" });
  const ab = await anfrage("monatsabschluss", "POST", { aktion: "abschliessen", monat: probe, trotzPrueffaellen: true });
  const vorher = (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
  const s = await anfrage("sicherung", "POST", {});
  const g3 = await anfrage("bestand", "GET");
  const w = await anfrage("wiederherstellen", "POST", { marke: s.d.marke, etag: g3.d.etag });
  const nachher = (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
  const gleich = JSON.stringify(nachher.istEingefroren) === JSON.stringify(vorher.istEingefroren)
    && JSON.stringify(nachher.monatsabschluss) === JSON.stringify(vorher.monatsabschluss)
    && JSON.stringify(nachher.erfassung) === JSON.stringify(vorher.erfassung);
  return { get: g, putNeu, putAlt, wo, ab, sicherung: s.status, wiederherstellen: w.status, restoreGleich: gleich };
}

export async function serverUmgebung() {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp16-mess-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = process.env.CENTRIC_PFEFFER || "pfeffer-nur-zum-messen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1e6 };
  return { wurzel, laden: () => getStore({ name: "centric", consistency: "strong" }),
    daten: (await import("../server/funktionen/daten.mjs")).default, B: await import("../server/lib/bestand.mjs"),
    sitzungAnlegen: (await import("../server/lib/sitzungen.mjs")).sitzungAnlegen };
}

async function main() {
  const arg = (name, vorgabe) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1].split(",").map(Number) : vorgabe; };
  const personen = arg("--personen", [60, 150, 400]);
  const monate = arg("--monate", [12, 24, 36]);
  const stempel = process.argv.includes("--stempel");
  const mitServer = !process.argv.includes("--ohne-server");
  const umgebung = mitServer ? await serverUmgebung() : null;
  console.log(`Umgebung: Node ${process.version}, ${process.platform}; Profil: Erfassung je Diensttag${stempel ? " + Stempel" : ""}; RUMPF_MAX ${mb(RUMPF_MAX)} MB`);
  console.log("| Personen | Monate | Personentage | B/Tag S1 → S2 | Freeze S1 → S2 (MB) | Bestand GET (MB) | PUT alt → neu (MB) | ≤ RUMPF_MAX alt/neu | Widerspruch alt → neu (ms) | Abschluss / Wiederöffnen Lib (ms) | HTTP GET / PUT neu / PUT alt (ms, Status) | HTTP Abschluss / Wiederöffnen (ms) | Sicherung → Wiederherstellen |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const n of personen) for (const anzahl of monate) {
    const z = zelleBibliothek(n, anzahl, { stempel });
    let srv = "";
    if (umgebung) {
      const s = await zelleServer(z, umgebung);
      srv = ` ${s.get.ms} (${s.get.status}) / ${s.putNeu.ms} (${s.putNeu.status}) / ${s.putAlt.ms} (${s.putAlt.status}) | ${s.ab.ms} (${s.ab.status}) / ${s.wo.ms} (${s.wo.status}) | ${s.sicherung}/${s.wiederherstellen}, identisch: ${s.restoreGleich ? "ja" : "NEIN"} |`;
    }
    console.log(`| ${n} | ${anzahl} | ${z.personentage} | ${z.bProTag1} → ${z.bProTag2} | ${mb(z.freeze1Hochgerechnet)} → ${mb(z.freeze2)} | ${mb(z.bestandGesamt)} | ${mb(z.putAlt)} → ${mb(z.putNeu)} | ${z.putAlt <= RUMPF_MAX ? "ja" : "nein"}/${z.putNeu <= RUMPF_MAX ? "ja" : "nein"} | ${z.tWAlt} → ${z.tWNeu} (mit Freeze ${z.tWNeuMitFreeze}) | ${z.tAbschluss} / ${z.tWieder} |${srv || " – | – | – |"}`);
  }
  if (umgebung) { const { rm } = await import("node:fs/promises"); await rm(umgebung.wurzel, { recursive: true, force: true }); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch((e) => { console.error(e); process.exit(1); });
