/* ==========================================================================
   K4-P3: Schreiber des synthetischen Altbestands. NUR vom Erzeuger gestartet, nie von Hand.

   Läuft in einem eigenen Prozess und schreibt über die Ablageschicht des ALTEN Stands (274bfa0, per
   `git archive` in einen Wegwerfordner geholt) in die frisch angelegte Ausgabe. Dadurch hat jede Datei
   genau die Gestalt, die der Produktionsstand damals schrieb — nicht die des heutigen Codes.

   Aufruf (vom Erzeuger): node synthetischer-altbestand-schreiber.mjs <Altstand-Wurzel> <Ausgabe>   (Plan auf stdin)
   Ausgabe: letzte Zeile „ERGEBNIS {json}“.

   Bestimmtheit: Die Uhr steht fest (plan.uhr), Math.random und crypto.randomBytes kommen aus einem Zufallszahlen-
   erzeuger mit fester Saat (plan.saat). Gleiche Eingabe, gleiche Bytes. Es wird nichts gelesen außer dem Plan.
   Alle Werte sind synthetisch; Adressen enden auf @example.invalid.
   ========================================================================== */
import { createRequire, syncBuiltinESMExports } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [altWurzel, ausgabe] = process.argv.slice(2);
if (!altWurzel || !ausgabe || !path.isAbsolute(altWurzel) || !path.isAbsolute(ausgabe)) {
  console.error("Aufruf: Altstand-Wurzel und Ausgabe als absolute Pfade");
  process.exit(2);
}
const plan = JSON.parse(readFileSync(0, "utf8"));

/* ------------------------------ feste Uhr, feste Saat ---------------------------------------------------------- */
function mulberry32(a) {
  return function zufall() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(plan.saat);
const FEST = Date.parse(plan.uhr);
if (!Number.isFinite(FEST)) throw new Error("plan.uhr ungültig");
const EchteDate = Date;
globalThis.Date = class FesteUhr extends EchteDate {
  constructor(...a) { if (a.length === 0) super(FEST); else super(...a); }
  static now() { return FEST; }
};
Math.random = rnd;
const crypto = createRequire(import.meta.url)("node:crypto");
crypto.randomBytes = (/** @type {number} */ n, cb) => {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = Math.floor(rnd() * 256);
  if (typeof cb === "function") { cb(null, b); return undefined; }
  return b;
};
crypto.randomUUID = () => {
  const h = crypto.randomBytes(16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
syncBuiltinESMExports();

/* Ablage-Umgebung des Kindprozesses. */
process.env.CENTRIC_DATEN = ausgabe;
process.env.CENTRIC_ABLAGE = "dateien";
process.env.CENTRIC_PFEFFER = plan.pfeffer;

const laden = (/** @type {string} */ n) => import(pathToFileURL(path.join(altWurzel, "server", "lib", `${n}.mjs`)).href);
const { getStore } = await laden("ablage");
const bestand = await laden("bestand");
const accounts = await laden("accounts");
const konten = await laden("konten");
const codes = await laden("codes");
const { baueLeerenBetrieb } = await laden("leerbetrieb");
const store = getStore({ name: "centric", consistency: "strong" });

/* ------------------------------ Räume -------------------------------------------------------------------------- */
const zaehl = { raeume: 0, betriebe: 0, personen: 0, einteilungen: 0, abwesenheiten: 0, stempel: 0, konten: 0, codes: 0,
  rechnungen: 0, altformRaeume: 0 };

for (const r of plan.raeume) {
  const mandanten = r.betriebe.map((b) => {
    const basis = baueLeerenBetrieb({ name: b.name, branche: b.branche, email: b.kontakt, land: b.land, raum: r.raum,
      laeuftAb: plan.laeuftAb });
    const m = JSON.parse(JSON.stringify(basis.mandanten[0]));
    m.id = b.id;                                  // Zeichenkette oder (Grenzfall) Zahl — so, wie sie im Plan steht
    for (const e of b.zusatzEinheiten) m.einheiten.push({ id: e.id, name: `${m.einheitLabel} ${e.nr}`, farbe: "#017070", versatz: 0,
      pool: false, standortId: "st1" });
    const ids = m.dienstarten.map((d) => d.id);
    m.personen = b.personen;
    m.abwesenheiten = b.abwesenheiten;
    m.abweichungen = Object.fromEntries(b.einteilungen.map(([k, i]) => [k, ids[i % ids.length]]));
    m.erfassung = b.erfassung;
    m.einstempeln = b.einstempeln;
    zaehl.betriebe++; zaehl.personen += b.personen.length; zaehl.einteilungen += b.einteilungen.length;
    zaehl.abwesenheiten += b.abwesenheiten.length; zaehl.stempel += Object.keys(b.einstempeln).length;
    return m;
  });
  const wurzel = { version: 9, stand: 0, tarife: [], rechnungen: r.rechnungen, protokoll: [], mandanten };
  zaehl.rechnungen += r.rechnungen.length;
  if (r.form === "alt") {
    /* Altform: der ganze Betrieb als ein Blob unter `bestand:<raum>`, unzerlegt, mit Metadaten wie früher. */
    await store.setJSON(`bestand:${r.raum}`, wurzel, { metadata: { zeit: plan.uhr, durch: "Altform-Saat" } });
    zaehl.altformRaeume++;
  } else {
    const e = await bestand.bestandSchreiben(store, r.raum, wurzel, { durch: "Altbestand-Saat" });
    if (!e || !e.ok) throw new Error(`Bestand ${r.raum} nicht geschrieben: ${JSON.stringify(e)}`);
  }
  zaehl.raeume++;
}

/* ------------------------------ Konten und Zugangscodes -------------------------------------------------------- */
const { passwortAblegen } = await laden("passwoerter");
const pw = await passwortAblegen(plan.passwort);
for (const k of plan.konten) {
  const a = await accounts.accountAnlegen(store, { email: k.email });
  if (!a.ok) throw new Error(`Konto ${k.nr}: ${a.grund}`);
  if (k.zustand !== "eingeladen") {
    await accounts.emailBestaetigen(store, a.account.id);
    if (!(await accounts.passwortSetzen(store, a.account.id, pw)).ok) throw new Error(`Passwort ${k.nr}`);
  }
  if (k.mitglied) {
    const m = await accounts.mitgliedschaftAnlegen(store, { accountId: a.account.id, raum: k.mitglied.raum, betrieb: 0,
      mandantId: k.mitglied.mandantId, person: k.mitglied.person, rolle: k.mitglied.rolle, status: "aktiv" });
    if (!m.ok) throw new Error(`Mitgliedschaft ${k.nr}: ${m.grund}`);
  }
  if (k.zustand === "gesperrt") {
    const s = await accounts.accountSperren(store, a.account.id);
    if (!s.ok) throw new Error(`Sperre ${k.nr}`);
  }
  zaehl.konten++;
}
for (const c of plan.codes) {
  const schluessel = c.altform ? codes.altHash(c.code) : codes.ablageSchluessel(c.code);
  await konten.kontoSchreiben(store, schluessel, { name: c.name, bestand: c.raum, rolle: c.rolle, person: c.person, betrieb: 0,
    mandantId: c.mandantId, demo: false, gruppe: null, hinweis: null, angelegt: plan.uhr });
  zaehl.codes++;
}

console.log(`ERGEBNIS ${JSON.stringify(zaehl)}`);
