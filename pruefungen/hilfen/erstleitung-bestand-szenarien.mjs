/* ==========================================================================
   ABNAHME V4, A-3 — DIFFERENZGARANTIE FÜR BESTANDSBETRIEBE (PR #281)

   Derselbe Szenarienkatalog läuft gegen zwei Server-Fassungen:
     - die Basis (integration/release-v4 OHNE #281): Aufzeichnung der
       Golden-Ausgaben (pruefungen/hilfen/erstleitung-bestand-golden.mjs,
       Ergebnis: pruefungen/fixtures/erstleitung-bestand-differenz.golden.json);
     - diese Fassung (mit #281): Nachspielen und Vergleich
       (pruefungen/erstleitung-bestand-differenz.test.js).

   Ein BESTANDSBETRIEB ist hier ein Betrieb, wie er vor #281 in der Ablage
   stand: unmittelbar über die Ablage geschrieben (bestandSchreiben,
   kontoSchreiben), also ohne Regime- und ohne Erstanmeldemarke. Der Schalter
   CENTRIC_ERSTLEITUNG_STRENG ist ungesetzt oder verbogen („1“, „TRUE“,
   „ true“, „true “ — alle gelten als aus).

   Beobachtet wird je Schritt: Statuscode und Antwortrumpf; je Szenario: jede
   Datei der Ablage, die das Szenario anlegt, ändert oder entfernt (Bestand,
   Zugänge, Sitzungen, Protokoll, Marken, Sicherungen). Zufall und Zeit werden
   maskiert (Token, erzeugte Codes, Prüfsummen, Zeitstempel, das heutige
   Datum); alles andere wird wörtlich verglichen. Nur synthetische Daten,
   keine Geheimnisse: Verwaltungsgeheimnis und Pfeffer sind feste Prüfwerte
   und werden in der Ausgabe ebenfalls maskiert.

   Szenarienklassen:
     gleich  muss in beiden Fassungen gleich beobachtbar sein (bis auf die im
             Test einzeln benannten, dokumentierten Abweichungen).
     kipp    Vorgänge, die einen Bestandsbetrieb (oder einen neuen Betrieb)
             auf das strenge Regime umstellen. Hier wird die Abweichung
             ausdrücklich geprüft (docs/acc45/ABNAHME-V4-A3-BESTAND-GARANTIE.md).
   ========================================================================== */
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serverStarten } from "./port.mjs";

/** Schalterwerte: ungesetzt und verbogen. Jeder gilt in #281 als „aus“ (nur genau „true“ ist an). */
export const SCHALTER = Object.freeze([
  ["ungesetzt", undefined], ["eins", "1"], ["gross", "TRUE"], ["leer-vorn", " true"], ["leer-hinten", "true "],
]);

/* Feste Prüfwerte (keine echten Geheimnisse). */
const VERWALTUNG = "bestanddiff-verwaltung-pruefwert-0000";
const PFEFFER = "bestanddiff-pfeffer-pruefwert-0000";
const KONTAKT = "kontakt@beispiel.invalid";
const ANGELEGT = "2026-10-01T08:00:00.000Z";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const kopie = (x) => JSON.parse(JSON.stringify(x));
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/* --------------------------------------------------------------------------
   Maskierung
   -------------------------------------------------------------------------- */
function tagesangaben() {
  const jetzt = Date.now();
  const berlin = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(t));
  const utc = (t) => new Date(t).toISOString().slice(0, 10);
  const s = new Set([utc(jetzt), berlin(jetzt)]);
  return [...s].map((t) => [t, "<HEUTE>"]);
}

/** @param {string} s @param {Array<[string,string]>} register */
function maskeText(s, register, tage) {
  let t = s;
  for (const [roh, name] of register) if (roh && t.includes(roh)) t = t.split(roh).join(name);
  t = t.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, "<ZEIT>");
  t = t.replace(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}(?::\d{2})?/g, "<ZEIT>");
  for (const [tag, name] of tage) if (t.includes(tag)) t = t.split(tag).join(name);
  /* Marke einer Sicherung: Tag-Uhrzeit-Zufall. */
  t = t.replace(/<HEUTE>-\d{2}-\d{2}-\d{2}-\d+/g, "<SICHERUNGSMARKE>");
  t = t.replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, "<CODE>");
  t = t.replace(/\bp_[0-9a-f]{7}\b/g, "<PID>");
  t = t.replace(/\bd[0-9a-f]{8}\b/g, "<DEMOID>");
  t = t.replace(/[A-Za-z0-9_-]{16,}/g, (w) => (/[0-9]/.test(w) && /[A-Za-z]/.test(w) ? "<ZUFALL>" : w));
  return t;
}

/** Grosse Teilbäume (ein ganzer Betrieb) als Prüfsumme plus Personenübersicht — die Golden-Datei bleibt lesbar. */
function verdichten(x) {
  const text = JSON.stringify(x);
  if (text.length <= 3000 || process.env.BDIFF_VOLL === "1") return x;
  const personen = [];
  const sammeln = (y) => {
    if (Array.isArray(y)) { y.forEach(sammeln); return; }
    if (!istObjekt(y)) return;
    if (Array.isArray(y.personen) && typeof y.id === "string")
      personen.push({ betrieb: y.id, personen: y.personen.map((p) => (istObjekt(p)
        ? { id: p.id, rolle: p.rolle, status: p.status ?? null, austritt: p.austritt ?? null, email: p.email ?? null, nachname: p.nachname ?? null }
        : p)) });
    for (const v of Object.values(y)) sammeln(v);
  };
  sammeln(x);
  return { "#pruefsumme": sha(text), "#laenge": text.length, ...(personen.length ? { "#personen": personen } : {}) };
}

export function maskieren(x, register, tage = tagesangaben()) {
  const geh = (y) => {
    if (typeof y === "string") return maskeText(y, register, tage);
    if (typeof y === "number") return y > 1.5e12 && y < 2.5e12 ? "<MS>" : y;
    if (Array.isArray(y)) return y.map(geh);
    if (istObjekt(y)) {
      const aus = {};
      for (const k of Object.keys(y).sort()) aus[maskeText(k, register, tage)] = geh(y[k]);
      return aus;
    }
    return y;
  };
  const m = geh(x);
  /* Verdichtet werden nur Teilbäume UNTER einem Feld des Antwortrumpfs bzw. des Ablagewerts — Status, Schrittname und
     die Felder des Rumpfs selbst bleiben immer wörtlich. */
  const verd = (y) => {
    if (Array.isArray(y)) return y.map(verd);
    if (!istObjekt(y)) return y;
    const v = verdichten(y);
    if (v !== y) return v;
    const aus = {};
    for (const [k, w] of Object.entries(y)) aus[k] = verd(w);
    return aus;
  };
  const felder = (o) => {
    if (!istObjekt(o)) return o;
    const aus = {};
    for (const [k, w] of Object.entries(o)) aus[k] = verd(w);
    return aus;
  };
  if (istObjekt(m) && Array.isArray(m.schritte))
    m.schritte = m.schritte.map((st) => ({ ...st, rumpf: felder(st.rumpf) }));
  if (istObjekt(m) && Array.isArray(m.ablage))
    m.ablage = m.ablage.map((e) => (istObjekt(e) && istObjekt(e.wert)
      ? { ...e, wert: felder(e.wert) } : e));
  return m;
}

/* --------------------------------------------------------------------------
   Ablage als Abbild (alle Dateien unter CENTRIC_DATEN)
   -------------------------------------------------------------------------- */
/* Zähler der Bremsen und der Gesundheitsanzeige hängen an Uhr und Prozess, nicht am Fachverhalten. */
const FLUECHTIG = /^(centric-bremse|centric-gesund|centric-last|centric-zaehler|centric-takt)\//;

async function abbild(wurzel) {
  /** @type {Map<string,string>} */
  const aus = new Map();
  const geh = async (dir, rel) => {
    let eintraege = [];
    try { eintraege = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of eintraege) {
      const voll = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { await geh(voll, r); continue; }
      if (!e.name.endsWith(".json")) continue;
      if (FLUECHTIG.test(r)) continue;
      let text;
      try { text = await readFile(voll, "utf8"); } catch { continue; }
      let schluessel = r;
      try { schluessel = r.split("/").map((t) => decodeURIComponent(t.replace(/\.json$/, ""))).join("/"); } catch { /* roh */ }
      aus.set(schluessel, text);
    }
  };
  await geh(wurzel, "");
  return aus;
}

function abbildDifferenz(vorher, nachher) {
  const d = [];
  const lesen = (t) => { try { return JSON.parse(t); } catch { return t; } };
  for (const [k, v] of nachher) {
    if (!vorher.has(k)) d.push({ art: "neu", schluessel: k, wert: lesen(v) });
    else if (vorher.get(k) !== v) d.push({ art: "geaendert", schluessel: k, wert: lesen(v) });
  }
  for (const k of vorher.keys()) if (!nachher.has(k)) d.push({ art: "weg", schluessel: k });
  return d;
}

/* --------------------------------------------------------------------------
   Ein Lauf: Server der Fassung `wurzel` starten, alle Szenarien, Ergebnis maskiert.
   -------------------------------------------------------------------------- */
/**
 * @param {{ wurzel: string, schalter: string|undefined, meldung?: (s: string) => void }} o
 * @returns {Promise<Record<string, {klasse: string, schritte: any[], ablage: any[]}>>}
 */
export async function lauf({ wurzel, schalter, meldung = () => {} }) {
  const statik = await mkdtemp(path.join(tmpdir(), "centric-bdiff-statik-"));
  const daten = await mkdtemp(path.join(tmpdir(), "centric-bdiff-daten-"));
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Bestandsdifferenz</title>");
  const umgebungAlt = { DATEN: process.env.CENTRIC_DATEN, ABLAGE: process.env.CENTRIC_ABLAGE, PFEFFER: process.env.CENTRIC_PFEFFER,
    STRENG: process.env.CENTRIC_ERSTLEITUNG_STRENG };
  let kind = null;
  try {
    const st = await serverStarten({ cwd: wurzel, wartenMs: 120_000, env: {
      CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: VERWALTUNG,
      CENTRIC_PFEFFER: PFEFFER, CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
      CENTRIC_DEMO: undefined, CENTRIC_SELBSTSTART: undefined, CENTRIC_IMPORT_AKTIV: undefined, CENTRIC_REGISTRIERUNG: undefined,
      CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: undefined, CENTRIC_TEILSPEICHERUNG: "true",
      CENTRIC_ERSTLEITUNG_STRENG: schalter } });
    kind = st.kind;
    const BASIS = st.basis;
    process.env.CENTRIC_DATEN = daten;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = PFEFFER;
    if (schalter === undefined) delete process.env.CENTRIC_ERSTLEITUNG_STRENG; else process.env.CENTRIC_ERSTLEITUNG_STRENG = schalter;
    const imp = (rel) => import(pathToFileURL(path.join(wurzel, rel)).href);
    const L = { ...(await imp("server/lib/ablage.mjs")), ...(await imp("server/lib/bestand.mjs")),
      ...(await imp("server/lib/konten.mjs")), ...(await imp("server/lib/codes.mjs")),
      ...(await imp("server/lib/sitzungen.mjs")), ...(await imp("server/lib/erstbefuellung.mjs")) };
    const store = () => L.getStore({ name: "centric", consistency: "strong" });

    /** @type {Array<[string,string]>} */
    const register = [[VERWALTUNG, "<VERWALTUNG>"], [PFEFFER, "<PFEFFER>"]];
    const CODES = {};
    /** Fester Code mit Namen: Code und beide Prüfsummen werden in der Ausgabe benannt. */
    const code = (name) => {
      if (CODES[name]) return CODES[name];
      const c = `BD${name.toUpperCase().replace(/[^A-Z0-9]/g, "")}X${sha(name).slice(0, 6).toUpperCase()}`;
      CODES[name] = c;
      register.push([L.ablageSchluessel(c), `<KS:${name}>`], [L.altHash(c), `<KA:${name}>`], [c, `<C:${name}>`]);
      return c;
    };

    let xff = 0;
    async function anfrage(pfad, { methode = "GET", rumpf, token, kopf: extra } = {}) {
      xff += 1;
      const kopf = { "x-forwarded-for": `10.81.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`, ...(extra || {}) };
      if (methode !== "GET") kopf["content-type"] = "application/json";
      if (token) kopf.authorization = `Bearer ${token}`;
      const a = await fetch(BASIS + pfad, { method: methode, headers: kopf,
        ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) });
      let d = null; const t = await a.text();
      try { d = JSON.parse(t); } catch { d = { "#text": t.slice(0, 200) }; }
      return { status: a.status, rumpf: d };
    }

    const person = (id, rolle, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, funktion: "", email: "", rolle,
      bereich: "ALLE", status: "aktiv", qualifikationen: [], eintritt: "2026-01-01", austritt: null,
      zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }], wochenstunden: 39, urlaubsanspruch: 30,
      urlaubsuebertrag: 0, stundenuebertrag: 0, teilzeit: null, springer: false, einschraenkungen: {},
      rolleSeit: "2026-01-01", rolleVerlauf: [], imSchichtdienst: true, ...extra });
    /** Ein Bestandsraum, wie er vor #281 in der Ablage stand (ohne Marken). */
    const betrieb = (raum, id, personen, extra = {}) => {
      const b = L.vorlageBestand("leer", { raum, name: `Haus ${id}`, branche: "pflege" });
      const m = { ...b.mandanten[0], id, name: `Haus ${id}`, seit: "2026-01-01", anker: "2026-01-05", kontakt: KONTAKT,
        status: "aktiv", personen, ...extra };
      return m;
    };
    async function raumAnlegen(raum, mandanten) {
      const b = L.vorlageBestand("leer", { raum, name: `Haus ${raum}`, branche: "pflege" });
      const r = await L.bestandSchreiben(store(), raum, { ...b, mandanten }, { durch: "Bestand vor #281" });
      if (!r || r.ok !== true) throw new Error(`Bestand ${raum} nicht geschrieben: ${JSON.stringify(r)}`);
    }
    async function zugangAblegen(name, felder, { alt = false } = {}) {
      const c = code(name);
      const schl = alt ? L.altHash(c) : L.ablageSchluessel(c);
      await L.kontoSchreiben(store(), schl, { name: `Zugang ${name}`, rolle: "leitung", person: null, betrieb: 0,
        mandantId: null, demo: false, gruppe: null, hinweis: null, angelegt: ANGELEGT, ...felder });
      return c;
    }
    const anmelden = (c, extra = {}) => anfrage("/api/anmelden", { methode: "POST", rumpf: { zugangscode: c, ...extra } });

    /** @type {Record<string, {klasse: string, schritte: any[], ablage: any[]}>} */
    const ergebnis = {};
    async function szenario(name, klasse, fn) {
      meldung(`  ${name}`);
      const vorher = await abbild(daten);
      const schritte = [];
      const s = async (titel, a) => { schritte.push({ schritt: titel, status: a.status, rumpf: a.rumpf }); return a; };
      await fn(s);
      await new Promise((w) => setTimeout(w, 50));
      const nachher = await abbild(daten);
      const ablage = abbildDifferenz(vorher, nachher);
      const m = maskieren({ schritte, ablage }, register);
      m.ablage = m.ablage.map((e) => JSON.stringify(e)).sort().map((e) => JSON.parse(e));
      ergebnis[name] = { klasse, ...m };
    }

    /* ---------------- Betreiber der Konsole (eigener Raum) ---------------- */
    const konsoleCode = await zugangAblegen("betreiber-konsole", { rolle: "betreiber", bestand: "bd-konsole", name: "Betreiber" });
    const konsole = await anmelden(konsoleCode);
    if (konsole.status !== 200) throw new Error(`Betreiber nicht angemeldet: ${JSON.stringify(konsole)}`);
    const BT = konsole.rumpf.token;

    /* ================= M1: leerer Betrieb, alter Leitungscode ohne Person ================= */
    await szenario("M1 leer: Leitungscode ohne Person, erste Person wie die alte Oberfläche (PUT)", "gleich", async (s) => {
      await raumAnlegen("bd-m1", [betrieb("bd-m1", "bd-m1", [])]);
      const c = await zugangAblegen("m1-leitung", { bestand: "bd-m1", mandantId: "bd-m1" });
      const a = await s("anmelden", await anmelden(c));
      const t = a.rumpf.token;
      const g = await s("GET bestand", await anfrage("/api/bestand", { token: t }));
      if (g.status === 200 && g.rumpf.bestand) {
        const b = kopie(g.rumpf.bestand);
        /* So legte die Oberfläche vor #281 die erste Person an (src/App.jsx): Rolle aus dem Code, Kontaktadresse. */
        b.mandanten[0].personen = [person("p_alt0001", "leitung", { vorname: "", nachname: "Leitung", funktion: "Leitung",
          email: KONTAKT, imSchichtdienst: false })];
        await s("PUT erste Person", await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.rumpf.etag } }));
      }
      await s("GET danach", await anfrage("/api/bestand", { token: t }));
      await s("anmelden erneut", await anmelden(c));
    });

    await szenario("M1b leer: Altcode ohne Betriebskennung (Bindung beim Anmelden)", "gleich", async (s) => {
      await raumAnlegen("bd-m1b", [betrieb("bd-m1b", "bd-m1b", [])]);
      const c = await zugangAblegen("m1b-leitung", { bestand: "bd-m1b" });
      const a = await s("anmelden", await anmelden(c));
      await s("GET bestand", await anfrage("/api/bestand", { token: a.rumpf.token }));
    });

    await szenario("M1c leer: Planungscode ohne Person legt eine Leitung an (Ausnahme leerer Betrieb)", "gleich", async (s) => {
      await raumAnlegen("bd-m1c", [betrieb("bd-m1c", "bd-m1c", [])]);
      const c = await zugangAblegen("m1c-planer", { bestand: "bd-m1c", mandantId: "bd-m1c", rolle: "planer" });
      const a = await s("anmelden", await anmelden(c));
      const g = await s("GET bestand", await anfrage("/api/bestand", { token: a.rumpf.token }));
      if (g.status === 200 && g.rumpf.bestand) {
        const b = kopie(g.rumpf.bestand);
        b.mandanten[0].personen = [person("p_alt0002", "leitung")];
        await s("PUT Leitung", await anfrage("/api/bestand", { methode: "PUT", token: a.rumpf.token, rumpf: { bestand: b, etag: g.rumpf.etag } }));
      }
    });

    await szenario("M1d leer: erste Person über den Teilweg", "gleich", async (s) => {
      await raumAnlegen("bd-m1d", [betrieb("bd-m1d", "bd-m1d", [])]);
      const c = await zugangAblegen("m1d-leitung", { bestand: "bd-m1d", mandantId: "bd-m1d" });
      const a = await s("anmelden", await anmelden(c));
      const g = await s("GET teile", await anfrage("/api/bestand?teile=1", { token: a.rumpf.token }));
      const v = (g.rumpf && g.rumpf.teile && g.rumpf.teile.versionen) || {};
      await s("POST teile erste Person", await anfrage("/api/bestand/teile", { methode: "POST", token: a.rumpf.token,
        rumpf: { format: 1, epoche: g.rumpf && g.rumpf.teile ? g.rumpf.teile.epoche : null, durch: "Prüfung",
          kern: { personen: { basis: v["kern:personen"] ?? null, wert: [person("p_alt0003", "leitung")] } } } }));
      await s("GET danach", await anfrage("/api/bestand", { token: a.rumpf.token }));
    });

    /* ================= M2: aktive Leitung nur über einen Leitungscode ohne Person ================= */
    await szenario("M2 Personen ohne Leitungsperson: Leitung nur über Altcode ohne Person — alle Wege", "gleich", async (s) => {
      await raumAnlegen("bd-m2", [betrieb("bd-m2", "bd-m2", [person("p1", "planer"), person("m0", "mitarbeiter"), person("m1", "mitarbeiter")])]);
      const L2 = await zugangAblegen("m2-leitung", { bestand: "bd-m2", mandantId: "bd-m2" });
      const X = await zugangAblegen("m2-ma-weg", { bestand: "bd-m2", mandantId: "bd-m2", rolle: "mitarbeiter", person: "m1" });
      await zugangAblegen("m2-planer", { bestand: "bd-m2", mandantId: "bd-m2", rolle: "planer", person: "p1" });
      const a = await s("anmelden", await anmelden(L2));
      const t = a.rumpf.token;
      const g = await s("GET bestand", await anfrage("/api/bestand", { token: t }));
      let etag = g.rumpf && g.rumpf.etag;
      if (g.status === 200 && g.rumpf.bestand) {
        const b = kopie(g.rumpf.bestand);
        b.mandanten[0].personen.push(person("m9", "mitarbeiter"));
        const w = await s("PUT Person anlegen", await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag } }));
        const b2 = kopie(g.rumpf.bestand);
        b2.mandanten[0].personen.push(person("l9", "leitung"));
        await s("PUT Leitung vergeben (Rang)", await anfrage("/api/bestand", { methode: "PUT", token: t,
          rumpf: { bestand: b2, etag: w.rumpf && w.rumpf.etag } }));
        await s("PUT veraltete Kopie", await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag } }));
        const b3 = kopie(g.rumpf.bestand);
        b3.mandanten.push({ ...kopie(b3.mandanten[0]), id: "bd-m2-fremd", name: "Fremd" });
        await s("PUT manipuliert: zweiter Betrieb", await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b3, etag: w.rumpf && w.rumpf.etag } }));
      }
      const e = await s("Einladung", await anfrage("/api/einladung", { methode: "POST", token: t,
        rumpf: { personId: "m0", bestaetigung: { zugangscode: L2 } } }));
      if (e.rumpf && e.rumpf.einladung)
        await s("Einladung annehmen", await anfrage("/api/einladung/annehmen", { methode: "POST", rumpf: { einladung: e.rumpf.einladung } }));
      await s("Einladungsliste", await anfrage("/api/einladung/liste", { methode: "POST", token: t, rumpf: {} }));
      await s("Zugang sperren", await anfrage("/api/zugang-sperren", { methode: "POST", token: t, rumpf: { code: X } }));
      await s("anmelden gesperrter Zugang", await anmelden(X));
      await s("Sicherung anlegen", await anfrage("/api/sicherung", { methode: "POST", token: t, rumpf: {} }));
      const l = await s("Sicherungen", await anfrage("/api/sicherungen", { token: t }));
      const marke = l.rumpf && Array.isArray(l.rumpf.sicherungen) && l.rumpf.sicherungen[0]
        ? (l.rumpf.sicherungen[0].marke || l.rumpf.sicherungen[0].id) : null;
      const g2 = await anfrage("/api/bestand", { token: t });
      await s("Wiederherstellen", await anfrage("/api/wiederherstellen", { methode: "POST", token: t,
        rumpf: { marke: marke || "unbekannt", etag: g2.rumpf && g2.rumpf.etag } }));
      const sk = await s("Sicherungsschlüssel anlegen", await anfrage("/api/sicherungsschluessel", { methode: "POST", token: t, rumpf: {} }));
      if (sk.rumpf && sk.rumpf.schluessel)
        await s("Vollausgabe mit Sicherungsschlüssel", await anfrage("/api/vollausgabe", { token: sk.rumpf.schluessel }));
      await s("Vollausgabe", await anfrage("/api/vollausgabe", { token: t }));
      await s("Auskunft", await anfrage("/api/auskunft", { token: t }));
      await s("abmelden", await anfrage("/api/abmelden", { methode: "POST", token: t, rumpf: {} }));
      await s("GET nach abmelden", await anfrage("/api/bestand", { token: t }));
    });

    await szenario("M2b einzige Leitung ausgetreten, Leitungscode ohne Person", "gleich", async (s) => {
      await raumAnlegen("bd-m2b", [betrieb("bd-m2b", "bd-m2b", [person("l1", "leitung", { austritt: "2026-01-31" }), person("m0", "mitarbeiter")])]);
      const c = await zugangAblegen("m2b-leitung", { bestand: "bd-m2b", mandantId: "bd-m2b" });
      const a = await s("anmelden", await anmelden(c));
      const g = await s("GET bestand", await anfrage("/api/bestand", { token: a.rumpf.token }));
      if (g.status === 200 && g.rumpf.bestand) {
        const b = kopie(g.rumpf.bestand);
        b.mandanten[0].personen.push(person("m8", "mitarbeiter"));
        await s("PUT", await anfrage("/api/bestand", { methode: "PUT", token: a.rumpf.token, rumpf: { bestand: b, etag: g.rumpf.etag } }));
      }
    });

    await szenario("M2c Sitzung aus der Zeit vor dem Einspielen (Leitung ohne Person)", "gleich", async (s) => {
      await raumAnlegen("bd-m2c", [betrieb("bd-m2c", "bd-m2c", [person("p1", "planer"), person("m0", "mitarbeiter")])]);
      const c = code("m2c-leitung");
      await zugangAblegen("m2c-leitung", { bestand: "bd-m2c", mandantId: "bd-m2c" });
      const { token } = await L.sitzungAnlegen({ bestand: "bd-m2c", name: "Zugang alt", rolle: "leitung", person: null, betrieb: 0,
        mandantId: "bd-m2c", konto: L.ablageSchluessel(c), einheit: null });
      const g = await s("GET bestand", await anfrage("/api/bestand", { token }));
      if (g.status === 200 && g.rumpf.bestand) {
        const b = kopie(g.rumpf.bestand);
        b.mandanten[0].personen.push(person("m7", "mitarbeiter"));
        await s("PUT", await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.rumpf.etag } }));
      }
      await s("GET danach", await anfrage("/api/bestand", { token }));
    });

    await szenario("M2d leer, Sitzung aus der Zeit vor dem Einspielen legt die erste Person an", "gleich", async (s) => {
      await raumAnlegen("bd-m2d", [betrieb("bd-m2d", "bd-m2d", [])]);
      const c = code("m2d-leitung");
      await zugangAblegen("m2d-leitung", { bestand: "bd-m2d", mandantId: "bd-m2d" });
      const { token } = await L.sitzungAnlegen({ bestand: "bd-m2d", name: "Zugang alt", rolle: "leitung", person: null, betrieb: 0,
        mandantId: "bd-m2d", konto: L.ablageSchluessel(c), einheit: null });
      const g = await s("GET bestand", await anfrage("/api/bestand", { token }));
      if (g.status === 200 && g.rumpf.bestand) {
        const b = kopie(g.rumpf.bestand);
        b.mandanten[0].personen = [person("p_alt0004", "leitung")];
        await s("PUT erste Person", await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.rumpf.etag } }));
      }
    });

    /* ================= M3/M4: Personen, keine aktive Leitung, nur personengebundene Codes ================= */
    await szenario("M3 Personen ohne Leitung: Planungscode mit Person", "gleich", async (s) => {
      await raumAnlegen("bd-m3", [betrieb("bd-m3", "bd-m3", [person("p1", "planer"), person("m0", "mitarbeiter")])]);
      const c = await zugangAblegen("m3-planer", { bestand: "bd-m3", mandantId: "bd-m3", rolle: "planer", person: "p1" });
      const a = await s("anmelden", await anmelden(c));
      const g = await s("GET bestand", await anfrage("/api/bestand", { token: a.rumpf.token }));
      if (g.status === 200 && g.rumpf.bestand) {
        const b = kopie(g.rumpf.bestand);
        b.mandanten[0].personen.push(person("l5", "leitung"));
        await s("PUT Leitung vergeben", await anfrage("/api/bestand", { methode: "PUT", token: a.rumpf.token, rumpf: { bestand: b, etag: g.rumpf.etag } }));
        const b2 = kopie(g.rumpf.bestand);
        b2.mandanten[0].personen.push(person("m5", "mitarbeiter"));
        await s("PUT Mitarbeiter anlegen", await anfrage("/api/bestand", { methode: "PUT", token: a.rumpf.token, rumpf: { bestand: b2, etag: g.rumpf.etag } }));
      }
    });

    await szenario("M4 Leitung inaktiv, Planungscode ohne Person", "gleich", async (s) => {
      await raumAnlegen("bd-m4", [betrieb("bd-m4", "bd-m4", [person("l1", "leitung", { status: "inaktiv" }), person("p1", "planer")])]);
      const c = await zugangAblegen("m4-planer", { bestand: "bd-m4", mandantId: "bd-m4", rolle: "planer" });
      const cl = await zugangAblegen("m4-leitung", { bestand: "bd-m4", mandantId: "bd-m4" });
      const a = await s("anmelden Planung", await anmelden(c));
      await s("GET bestand Planung", await anfrage("/api/bestand", { token: a.rumpf.token }));
      const b = await s("anmelden Leitung ohne Person", await anmelden(cl));
      await s("GET bestand Leitung", await anfrage("/api/bestand", { token: b.rumpf.token }));
    });

    /* ================= M5/M6: personengebundene Codes, alle Rollen ================= */
    await szenario("M5/M6 personengebundene Codes aller Rollen, Index, unbekannte Person, kunde", "gleich", async (s) => {
      await raumAnlegen("bd-m5", [betrieb("bd-m5", "bd-m5", [person("l1", "leitung"), person("p1", "planer"),
        person("s1", "subplaner", { bereich: "e1" }), person("m0", "mitarbeiter"), person("b0", "betriebsrat")])]);
      const faelle = [
        ["m5-leitung", { rolle: "leitung", person: "l1" }], ["m5-planer", { rolle: "planer", person: "p1" }],
        ["m5-sv", { rolle: "subplaner", person: "s1", gruppe: "e1" }], ["m5-ma", { rolle: "mitarbeiter", person: "m0" }],
        ["m5-br", { rolle: "betriebsrat", person: "b0" }], ["m6-index", { rolle: "mitarbeiter", person: 3 }],
        ["m6-unbekannt", { rolle: "mitarbeiter", person: "x9" }], ["m5-kunde", { rolle: "kunde", person: null }],
        ["m5-leitung-ohne", { rolle: "leitung", person: null }],
      ];
      for (const [n, f] of faelle) {
        const c = await zugangAblegen(n, { bestand: "bd-m5", mandantId: "bd-m5", ...f });
        const a = await s(`${n}: anmelden`, await anmelden(c));
        const g = await s(`${n}: GET`, await anfrage("/api/bestand", { token: a.rumpf.token }));
        if (g.status === 200 && g.rumpf.bestand)
          await s(`${n}: PUT unverändert`, await anfrage("/api/bestand", { methode: "PUT", token: a.rumpf.token,
            rumpf: { bestand: g.rumpf.bestand, etag: g.rumpf.etag } }));
      }
    });

    /* ================= Demozugang ================= */
    await szenario("Demo: Demozugang Leitung ohne Person", "gleich", async (s) => {
      await raumAnlegen("bd-demo", [betrieb("bd-demo", "bd-demo", [person("l1", "leitung"), person("m0", "mitarbeiter")])]);
      const c = await zugangAblegen("demo-leitung", { bestand: "bd-demo", mandantId: "bd-demo", demo: true, id: "d0000demo" });
      const a = await s("anmelden", await anmelden(c));
      const g = await s("GET", await anfrage("/api/bestand", { token: a.rumpf.token }));
      if (g.status === 200 && g.rumpf.bestand)
        await s("PUT", await anfrage("/api/bestand", { methode: "PUT", token: a.rumpf.token, rumpf: { bestand: g.rumpf.bestand, etag: g.rumpf.etag } }));
    });

    /* ================= Einladung mit personengebundener Leitung ================= */
    await szenario("Einladung durch personengebundene Leitung", "gleich", async (s) => {
      await raumAnlegen("bd-einl", [betrieb("bd-einl", "bd-einl", [person("l1", "leitung"), person("m0", "mitarbeiter")])]);
      const c = await zugangAblegen("einl-leitung", { bestand: "bd-einl", mandantId: "bd-einl", person: "l1" });
      const a = await s("anmelden", await anmelden(c));
      const e = await s("Einladung", await anfrage("/api/einladung", { methode: "POST", token: a.rumpf.token,
        rumpf: { personId: "m0", bestaetigung: { zugangscode: c } } }));
      if (e.rumpf && e.rumpf.einladung) {
        const an = await s("annehmen", await anfrage("/api/einladung/annehmen", { methode: "POST", rumpf: { einladung: e.rumpf.einladung } }));
        if (an.rumpf && an.rumpf.zugangscode) {
          const m = await s("anmelden eingeladene Person", await anmelden(an.rumpf.zugangscode));
          await s("GET eingeladene Person", await anfrage("/api/bestand", { token: m.rumpf.token }));
        }
      }
    });

    /* ================= Betreiber auf Bestandsräumen ================= */
    await szenario("Betreiber: Übersicht, Sperren, Zugänge für Kundenraum, /einrichten, PUT ohne neuen Betrieb", "gleich", async (s) => {
      await raumAnlegen("bd-betr", [betrieb("bd-betr", "bd-betr", [person("l1", "leitung"), person("m0", "mitarbeiter")])]);
      await zugangAblegen("betr-leitung", { bestand: "bd-betr", mandantId: "bd-betr", person: "l1" });
      const ma = await zugangAblegen("betr-ma", { bestand: "bd-betr", mandantId: "bd-betr", rolle: "mitarbeiter", person: "m0" });
      const bc = await zugangAblegen("betr-raum", { rolle: "betreiber", bestand: "bd-betr", name: "Betreiber Raum" });
      await s("Übersicht", await anfrage("/api/zugaenge-uebersicht?bestand=bd-betr", { token: BT }));
      await s("Sperren", await anfrage("/api/zugang-sperren", { methode: "POST", token: BT, rumpf: { code: ma } }));
      await s("Zugänge Leitung ohne Person", await anfrage("/api/zugaenge", { methode: "POST", token: BT,
        rumpf: { bestand: "bd-betr", eintraege: [{ rolle: "leitung", personId: null }] } }));
      await s("/einrichten Leitung ohne Person", await anfrage("/einrichten", { methode: "POST",
        rumpf: { verwaltung: VERWALTUNG, name: "Neu", bestand: "bd-betr", rolle: "leitung", person: null, betrieb: 0 } }));
      const b = await s("anmelden Betreiber Raum", await anmelden(bc));
      const g = await s("GET Betreiber", await anfrage("/api/bestand", { token: b.rumpf.token }));
      if (g.status === 200 && g.rumpf.bestand) {
        const n = kopie(g.rumpf.bestand);
        n.mandanten[0].tarif = "basis";
        await s("PUT Betreiber Tarif", await anfrage("/api/bestand", { methode: "PUT", token: b.rumpf.token, rumpf: { bestand: n, etag: g.rumpf.etag } }));
      }
    });

    await szenario("Betreiber: leerer Bestandsbetrieb, Fenster abgelaufen (Kundenraum) — kein Erstanmeldecode", "gleich", async (s) => {
      await raumAnlegen("bd-leerku", [betrieb("bd-leerku", "bd-leerku", [])]);
      await zugangAblegen("leerku-leitung", { bestand: "bd-leerku", mandantId: "bd-leerku" });
      await store().setJSON("ersteinrichtung:bd-leerku", { raum: "bd-leerku", seit: Date.parse(ANGELEGT), bis: Date.parse(ANGELEGT) + 900000 });
      await s("Zugänge Leitung ohne Person", await anfrage("/api/zugaenge", { methode: "POST", token: BT,
        rumpf: { bestand: "bd-leerku", eintraege: [{ rolle: "leitung", personId: null }] } }));
      await s("/einrichten Leitung ohne Person", await anfrage("/einrichten", { methode: "POST",
        rumpf: { verwaltung: VERWALTUNG, name: "Neu", bestand: "bd-leerku", rolle: "leitung", person: null, betrieb: 0 } }));
      await s("anmelden alter Code", await anmelden(code("leerku-leitung")));
    });

    /* ================= Manipulierte Rümpfe ================= */
    await szenario("Manipuliert: Felder aus #281 in Anfragen (Anmelden, GET, PUT, Kopfzeilen)", "gleich", async (s) => {
      await raumAnlegen("bd-mani", [betrieb("bd-mani", "bd-mani", [person("p1", "planer"), person("m0", "mitarbeiter")])]);
      const c = await zugangAblegen("mani-leitung", { bestand: "bd-mani", mandantId: "bd-mani" });
      const a = await s("anmelden mit Zusatzfeldern", await anmelden(c, { erstleitungStreng: true, erstleitung: { mandantId: "bd-mani" },
        ersteinrichtungAltweg: false }));
      const t = a.rumpf.token;
      const g = await s("GET mit Abfrage", await anfrage("/api/bestand?erstleitungStreng=1&streng=true", { token: t,
        kopf: { "x-erstleitung-streng": "true" } }));
      if (g.status === 200 && g.rumpf.bestand) {
        const b = kopie(g.rumpf.bestand);
        Object.assign(b, { erstleitungStreng: true, "erstleitung-regime": { seit: "x" }, ersteinrichtungAltweg: false });
        Object.assign(b.mandanten[0], { erstleitung: { mandantId: "bd-mani" }, erstleitungStreng: true });
        await s("PUT mit Zusatzfeldern", await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.rumpf.etag,
          erstleitungStreng: true, ersteinrichtungAltweg: false } }));
      }
      await s("GET danach", await anfrage("/api/bestand", { token: t }));
    });

    /* ================= Altbestand: Betrieb ohne Kennung ================= */
    await szenario("Altbestand: Betrieb ohne Kennung (Leitung mit Person, Code ohne Kennung)", "gleich", async (s) => {
      const m = betrieb("bd-ohneid", "bd-ohneid", [person("l1", "leitung"), person("m0", "mitarbeiter")]);
      delete m.id;
      await raumAnlegen("bd-ohneid", [m]);
      const c = await zugangAblegen("ohneid-leitung", { bestand: "bd-ohneid", person: "l1" });
      const a = await s("anmelden", await anmelden(c));
      const g = await s("GET", await anfrage("/api/bestand", { token: a.rumpf.token }));
      if (g.status === 200 && g.rumpf.bestand)
        await s("PUT unverändert", await anfrage("/api/bestand", { methode: "PUT", token: a.rumpf.token, rumpf: { bestand: g.rumpf.bestand, etag: g.rumpf.etag } }));
      const bc = await zugangAblegen("ohneid-betreiber", { rolle: "betreiber", bestand: "bd-ohneid", name: "Betreiber Raum" });
      const b = await s("anmelden Betreiber", await anmelden(bc));
      const gb = await s("GET Betreiber", await anfrage("/api/bestand", { token: b.rumpf.token }));
      if (gb.status === 200 && gb.rumpf.bestand)
        await s("PUT Betreiber unverändert", await anfrage("/api/bestand", { methode: "PUT", token: b.rumpf.token, rumpf: { bestand: gb.rumpf.bestand, etag: gb.rumpf.etag } }));
    });

    /* ================= Altcode unter alter Prüfsumme (Umschlüsseln) ================= */
    await szenario("Altcode unter alter Prüfsumme ohne Kennung: Bindung und Umschlüsseln", "gleich", async (s) => {
      await raumAnlegen("bd-alt", [betrieb("bd-alt", "bd-alt", [person("l1", "leitung"), person("m0", "mitarbeiter")])]);
      const c = await zugangAblegen("alt-leitung", { bestand: "bd-alt", person: "l1" }, { alt: true });
      const c2 = await zugangAblegen("alt-ohne", { bestand: "bd-alt" }, { alt: true });
      const a = await s("anmelden", await anmelden(c));
      await s("GET", await anfrage("/api/bestand", { token: a.rumpf.token }));
      await s("anmelden erneut", await anmelden(c));
      const b = await s("anmelden ohne Person", await anmelden(c2));
      await s("GET ohne Person", await anfrage("/api/bestand", { token: b.rumpf.token }));
    });

    /* ================= Raum löschen, Selbststart, Registrierung ================= */
    await szenario("Raum löschen (Bestandsraum)", "gleich", async (s) => {
      await raumAnlegen("bd-loesch", [betrieb("bd-loesch", "bd-loesch", [person("l1", "leitung")])]);
      const c = await zugangAblegen("loesch-leitung", { bestand: "bd-loesch", mandantId: "bd-loesch" });
      await s("Raum löschen", await anfrage("/api/raum-loeschen", { methode: "POST", token: BT, rumpf: { bestand: "bd-loesch", bestaetigung: "bd-loesch" } }));
      await s("anmelden danach", await anmelden(c));
    });

    await szenario("Selbststart und Registrierung (ausgeschaltet)", "gleich", async (s) => {
      await s("GET /starten", await anfrage("/starten"));
      await s("POST /starten", await anfrage("/starten", { methode: "POST", rumpf: { name: "Probe" } }));
      await s("POST /api/registrierung", await anfrage("/api/registrierung", { methode: "POST", rumpf: { name: "Probe" } }));
    });

    /* ================= KIPP: Vorgänge, die das Regime setzen ================= */
    await szenario("KIPP-1 /api/zugaenge: Leitungscode ohne Person für leeren Bestandsbetrieb ohne Zugänge", "kipp", async (s) => {
      await raumAnlegen("bd-k1", [betrieb("bd-k1", "bd-k1", [])]);
      await s("Zugänge", await anfrage("/api/zugaenge", { methode: "POST", token: BT,
        rumpf: { bestand: "bd-k1", eintraege: [{ rolle: "leitung", personId: null }] } }));
    });

    await szenario("KIPP-2 /api/zugaenge im offenen Fenster: alter Leitungscode ohne Person danach", "kipp", async (s) => {
      await raumAnlegen("bd-k2", [betrieb("bd-k2", "bd-k2", [])]);
      const alt = await zugangAblegen("k2-alt", { bestand: "bd-k2", mandantId: "bd-k2" });
      await store().setJSON("ersteinrichtung:bd-k2", { raum: "bd-k2", seit: Date.now(), bis: Date.now() + 900000 });
      await s("Zugänge", await anfrage("/api/zugaenge", { methode: "POST", token: BT,
        rumpf: { bestand: "bd-k2", eintraege: [{ rolle: "planer", personId: null }, { rolle: "leitung", personId: null }] } }));
      await s("anmelden alter Leitungscode", await anmelden(alt));
    });

    await szenario("KIPP-3 /einrichten: Leitungscode ohne Person für leeren Bestandsbetrieb ohne Zugänge", "kipp", async (s) => {
      await raumAnlegen("bd-k3", [betrieb("bd-k3", "bd-k3", [])]);
      await s("/einrichten", await anfrage("/einrichten", { methode: "POST",
        rumpf: { verwaltung: VERWALTUNG, name: "Neu", bestand: "bd-k3", rolle: "leitung", person: null, betrieb: 0 } }));
    });

    await szenario("KIPP-4 Betreiber-PUT: Betrieb entfernt und mit derselben Kennung wieder eingefügt", "kipp", async (s) => {
      const a = betrieb("bd-k4", "bd-k4-a", [person("l1", "leitung")]);
      const b = betrieb("bd-k4", "bd-k4-b", [person("p1", "planer"), person("m0", "mitarbeiter")]);
      await raumAnlegen("bd-k4", [a, b]);
      const lb = await zugangAblegen("k4-leitung-b", { bestand: "bd-k4", mandantId: "bd-k4-b", betrieb: 1 });
      const bc = await zugangAblegen("k4-betreiber", { rolle: "betreiber", bestand: "bd-k4", name: "Betreiber Raum" });
      const t = (await anmelden(bc)).rumpf.token;
      await s("anmelden Leitung B vorher", await anmelden(lb));
      const g = await anfrage("/api/bestand", { token: t });
      const voll = kopie(g.rumpf.bestand);
      const ohne = kopie(voll); ohne.mandanten = ohne.mandanten.filter((m) => m.id !== "bd-k4-b");
      const w1 = await s("PUT ohne B", await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: ohne, etag: g.rumpf.etag } }));
      /* Wieder einfügen mit dem vollständigen alten Stand (wie aus einer Sicherung/Konsole): dieselbe Kennung, dieselben Personen. */
      const wieder = kopie(ohne); wieder.mandanten.push(kopie(b));
      await s("PUT B wieder", await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: wieder, etag: w1.rumpf && w1.rumpf.etag } }));
      await s("anmelden Leitung B nachher", await anmelden(lb));
    });

    await szenario("KIPP-5 Betreiber-PUT: neuer Betrieb im Bestandsraum (Bestandsbetrieb bleibt)", "kipp", async (s) => {
      await raumAnlegen("bd-k5", [betrieb("bd-k5", "bd-k5-a", [person("p1", "planer")])]);
      const la = await zugangAblegen("k5-leitung-a", { bestand: "bd-k5", mandantId: "bd-k5-a" });
      const bc = await zugangAblegen("k5-betreiber", { rolle: "betreiber", bestand: "bd-k5", name: "Betreiber Raum" });
      const t = (await anmelden(bc)).rumpf.token;
      const g = await anfrage("/api/bestand", { token: t });
      const n = kopie(g.rumpf.bestand);
      n.mandanten.push(betrieb("bd-k5", "bd-k5-neu", [person("l1", "leitung")]));
      await s("PUT neuer Betrieb", await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: n, etag: g.rumpf.etag } }));
      await s("anmelden Leitung A (Bestandsbetrieb)", await anmelden(la));
    });

    await szenario("KIPP-6 /api/bestand-anlegen: neuer Raum", "kipp", async (s) => {
      await s("anlegen", await anfrage("/api/bestand-anlegen", { methode: "POST", token: BT,
        rumpf: { bestand: "bd-k6", vorlage: "leer", name: "Haus K6" } }));
    });

    return ergebnis;
  } finally {
    if (kind && kind.exitCode === null) {
      kind.kill("SIGKILL");
      await new Promise((r) => { if (kind.exitCode !== null) r(); else kind.once("exit", r); });
    }
    for (const [k, v] of [["CENTRIC_DATEN", umgebungAlt.DATEN], ["CENTRIC_ABLAGE", umgebungAlt.ABLAGE],
      ["CENTRIC_PFEFFER", umgebungAlt.PFEFFER], ["CENTRIC_ERSTLEITUNG_STRENG", umgebungAlt.STRENG]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await rm(statik, { recursive: true, force: true }).catch(() => {});
    await rm(daten, { recursive: true, force: true }).catch(() => {});
  }
}
