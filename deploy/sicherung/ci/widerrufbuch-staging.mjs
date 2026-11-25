/* ==========================================================================
   Staging-Gate GATE-EW3, Widerrufbuch S1–S3 — NUR CI, nie auf dem VPS, nie gegen Staging oder Produktion.

   Läuft in einem Container (docker run/exec … node /ci/widerrufbuch-staging.mjs <befehl>), die Anwendungsschicht
   kommt aus dem Bild unter CENTRIC_APP (Vorgabe /app), die Ablage unter /data, das Zustandsverzeichnis unter
   /zustand (CENTRIC_ZUSTAND), ein Merkordner unter /ci-merk (nur dieses Skript liest ihn).

     altbestand    im ALTEN Bild (274bfa0, kennt keine Widerrufbücher): Betrieb mit Personen, 2 Konten mit Passwort und
                   Mitgliedschaft, 3 Zugangscodes (Leitung, 2 Mitarbeitende). Keine Bücher, kein Anker — der Stand der
                   Ablage, den das Digest-Bild beim ersten Start vorfindet (Migrationsprobe).
     pruefen s1    im Digest-Bild neben dem laufenden Server: /gesund ok, beide Bücher prüfbar (Siegel), alle Codes und
                   Konten melden sich an (Gegenprobe, dass nichts zu viel gesperrt ist)
     pruefen s2    Widerruf eines Zugangscodes über die echte API (/api/zugang-sperren, Leitungssitzung): 200, danach
                   Anmeldung mit dem Code abgewiesen, der andere Code geht, der Code steht im Buch
     konto-sperren im Digest-Bild bei angehaltenem Server: Konto 1 sperren (accounts.accountSperren — es gibt keinen
                   HTTP-Weg dafür), Eintrag im Konto-Widerrufbuch Pflicht
     pruefen s3    nach dem Neustart (und nach einem Rücksprung der Ablage): /gesund ok, Bücher prüfbar, Code und Konto
                   bleiben gesperrt, die Gegenproben (anderer Code, anderes Konto) melden sich an

   Ausgabe: nur Namen der Proben und Statuscodes. Codes, Passwort, Adressen und Sitzungsmerkmale werden nie
   ausgegeben (die Logs sind öffentlich). Alle Werte sind synthetisch und zufällig.
   Exit 0: bestanden · 1: mindestens eine Prüfung fehlgeschlagen · 2: falscher Aufruf.
   ========================================================================== */
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const APP = process.env.CENTRIC_APP || "/app";
const MERK = process.env.CI_MERK || "/ci-merk";
const merkDatei = `${MERK}/wb-staging.json`;
/* Ziel fest auf die eigene Maschine (im Container: der Server daneben). Nur für die örtliche Erprobung ohne Docker
   darf CI_WB_BASIS einen anderen Port auf 127.0.0.1 nennen. */
const BASIS = process.env.CI_WB_BASIS || "http://127.0.0.1:3000";
if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(BASIS)) {
  console.error("widerrufbuch-staging: Ziel nur http://127.0.0.1:<port>");
  process.exit(2);
}
const laden = (/** @type {string} */ n) => import(pathToFileURL(`${APP}/server/lib/${n}.mjs`).href);

const RAUM = "ci-stg-haus";
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
const befehl = process.argv[2];

let fehler = 0;
function pruef(/** @type {string} */ name, /** @type {boolean} */ ok, /** @type {string} */ detail = "") {
  if (!ok) fehler++;
  console.log(`  ${ok ? "BESTANDEN     " : "FEHLGESCHLAGEN"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}

/** @param {string} pfad @param {{methode?: string, token?: string|null, rumpf?: any, herkunft?: boolean}} [o] */
async function http(pfad, { methode = "GET", token = null, rumpf, herkunft = false } = {}) {
  const a = await fetch(new URL(pfad, BASIS), { method: methode, redirect: "manual",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(herkunft ? { origin: BASIS } : {}),
      ...(rumpf !== undefined ? { "content-type": "application/json" } : {}) },
    body: rumpf === undefined ? undefined : JSON.stringify(rumpf) });
  const text = await a.text();
  let d = {};
  try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, d: d && typeof d === "object" ? d : {} };
}
const codeAnmelden = (/** @type {string} */ code) => http("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } });
const kontoAnmelden = (/** @type {{email: string}} */ k, /** @type {string} */ pw) =>
  http("/api/account/anmelden", { methode: "POST", herkunft: true, rumpf: { email: k.email, passwort: pw } });

async function store() {
  const ablage = await laden("ablage");
  return ablage.getStore({ name: "centric", consistency: "strong" });
}

if (befehl === "altbestand") {
  /* Nur Funktionen, die auch 274bfa0 kennt (ablage, bestand, accounts, passwoerter, konten, codes). */
  const s = await store();
  const bestand = await laden("bestand");
  const accounts = await laden("accounts");
  const passwoerter = await laden("passwoerter");
  const konten = await laden("konten");
  const codes = await laden("codes");
  const person = (/** @type {string} */ id, /** @type {string} */ rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle,
    bereich: rolle === "leitung" ? "ALLE" : "e1", status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const personen = [person("p1", "leitung"), ...["p2", "p3", "p4", "p5"].map((id) => person(id, "mitarbeiter"))];
  const e = await bestand.bestandSchreiben(s, RAUM, { version: 5, mandanten: [{ id: "mc", name: "Haus CI Staging",
    einheiten: [{ id: "e1", name: "WB 1" }], personen }] }, { durch: "CI-Staging" });
  if (!e.ok) throw new Error(`Bestand nicht geschrieben: ${e.grund || "unbekannt"}`);
  const passwort = randomBytes(18).toString("base64url");
  const pw = await passwoerter.passwortAblegen(passwort);
  /** @type {{passwort: string, konten: {id: string, email: string}[], codes: Record<string, {code: string, schluessel: string}>}} */
  const merk = { passwort, konten: [], codes: {} };
  for (const [i, personId] of [[1, "p2"], [2, "p3"]]) {
    const email = `ci-stg-${i}-${randomBytes(3).toString("hex")}@example.org`;
    const a = await accounts.accountAnlegen(s, { email });
    if (!a.ok) throw new Error(`Konto ${i}: ${a.grund}`);
    await accounts.emailBestaetigen(s, a.account.id);
    if (!(await accounts.passwortSetzen(s, a.account.id, pw)).ok) throw new Error(`Passwort ${i}`);
    const m = await accounts.mitgliedschaftAnlegen(s, { accountId: a.account.id, raum: RAUM, betrieb: 0, mandantId: "mc",
      person: personId, rolle: "mitarbeiter", status: "aktiv" });
    if (!m.ok) throw new Error(`Mitgliedschaft ${i}: ${m.grund || "unbekannt"}`);
    merk.konten.push({ id: a.account.id, email });
  }
  for (const [name, rolle, personId] of [["leitung", "leitung", "p1"], ["m1", "mitarbeiter", "p4"], ["m2", "mitarbeiter", "p5"]]) {
    const code = [0, 1, 2].map(() => Array.from(randomBytes(4)).map((b) => ALPHABET[b % ALPHABET.length]).join("")).join("-");
    const schluessel = codes.ablageSchluessel(code);
    await konten.kontoSchreiben(s, schluessel, { name: `CI Staging ${name}`, bestand: RAUM, rolle, person: personId, betrieb: 0,
      mandantId: "mc", demo: false, gruppe: null, hinweis: null, angelegt: new Date().toISOString() });
    merk.codes[name] = { code, schluessel };
  }
  await writeFile(merkDatei, JSON.stringify(merk), { mode: 0o600 });
  console.log(JSON.stringify({ altbestand: true, konten: merk.konten.length, codes: Object.keys(merk.codes).length }));
} else if (befehl === "konto-sperren") {
  const merk = JSON.parse(await readFile(merkDatei, "utf8"));
  const accounts = await laden("accounts");
  const sp = await accounts.accountSperren(await store(), merk.konten[0].id);
  pruef("Konto 1 gesperrt (Ablage) und ins Konto-Widerrufbuch geschrieben", !!(sp.ok && sp.kontobuch && sp.kontobuch.geschrieben),
    `ok ${sp.ok}, Buch ${sp.kontobuch ? sp.kontobuch.geschrieben : "-"}`);
} else if (befehl === "pruefen" && ["s1", "s2", "s3"].includes(process.argv[3])) {
  const phase = process.argv[3];
  const merk = JSON.parse(await readFile(merkDatei, "utf8"));
  const wb = await laden("widerrufbuch");
  const kb = await laden("kontowiderrufbuch");
  const s = await store();
  const g = await http("/gesund");
  pruef(`${phase}: /gesund 200, status ok`, g.status === 200 && g.d.status === "ok", `Status ${g.status} ${g.d.status}`);
  const buchOk = await wb.buchGeprueft(s).then(() => true, () => false);
  const kbOk = await kb.kontobuchGeprueft(s).then(() => true, () => false);
  pruef(`${phase}: beide Bücher vorhanden und prüfbar (Siegel)`, buchOk && kbOk, `Zugangscodes ${buchOk}, Konten ${kbOk}`);
  const st = async (/** @type {string} */ n) => (await codeAnmelden(merk.codes[n].code)).status;
  const kt = async (/** @type {number} */ i) => (await kontoAnmelden(merk.konten[i], merk.passwort)).status;
  if (phase === "s1") {
    for (const n of ["leitung", "m1", "m2"]) {
      const c = await st(n);
      pruef(`s1: Zugangscode ${n} meldet sich an`, c === 200, `Status ${c}`);
    }
    for (const i of [0, 1]) {
      const c = await kt(i);
      pruef(`s1: Konto ${i + 1} meldet sich an`, c === 200, `Status ${c}`);
    }
    pruef("s1: Code m1 und Konto 1 stehen noch in keinem Buch",
      !(await wb.istWiderrufen(s, [merk.codes.m1.schluessel])) && (await kb.kontoZugangImBuch(s, merk.konten[0].id)) === null);
  } else if (phase === "s2") {
    const l = await codeAnmelden(merk.codes.leitung.code);
    pruef("s2: Leitung meldet sich an", l.status === 200 && typeof l.d.token === "string", `Status ${l.status}`);
    const w = await http("/api/zugang-sperren", { methode: "POST", token: l.d.token || null, rumpf: { code: merk.codes.m1.code } });
    pruef("s2: POST /api/zugang-sperren (Code m1) 200", w.status === 200, `Status ${w.status}`);
    const m1 = await st("m1");
    pruef("s2: Code m1 danach abgewiesen (403)", m1 === 403, `Status ${m1}`);
    const m2 = await st("m2");
    pruef("s2: Code m2 meldet sich weiter an", m2 === 200, `Status ${m2}`);
    pruef("s2: Code m1 steht im Widerrufbuch", await wb.istWiderrufen(s, [merk.codes.m1.schluessel]).catch(() => false));
  } else {
    const m1 = await st("m1");
    pruef("s3: Code m1 bleibt abgewiesen (403)", m1 === 403, `Status ${m1}`);
    const m2 = await st("m2");
    pruef("s3: Code m2 meldet sich an", m2 === 200, `Status ${m2}`);
    const k1 = await kt(0);
    pruef("s3: Konto 1 bleibt gesperrt (keine Anmeldung)", k1 === 401 || k1 === 403, `Status ${k1}`);
    const k2 = await kt(1);
    pruef("s3: Konto 2 meldet sich an", k2 === 200, `Status ${k2}`);
    pruef("s3: Code m1 im Widerrufbuch, Konto 1 im Konto-Widerrufbuch",
      (await wb.istWiderrufen(s, [merk.codes.m1.schluessel]).catch(() => false))
      && (await kb.kontoZugangImBuch(s, merk.konten[0].id).catch(() => null)) === "konto-widerrufen");
  }
} else {
  console.error("Aufruf: widerrufbuch-staging.mjs altbestand | konto-sperren | pruefen s1|s2|s3");
  process.exit(2);
}
if (fehler) {
  console.error(`widerrufbuch-staging ${befehl}: ${fehler} Prüfung(en) fehlgeschlagen`);
  process.exit(1);
}
