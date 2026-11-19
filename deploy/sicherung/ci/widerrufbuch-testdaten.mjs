/* ==========================================================================
   Testdaten für den CI-Nachweis der Widerrufbuch-Sicherung (BE-3, B-1) — NUR CI.

   Läuft im gebauten Bild (docker run --entrypoint node … /ci/widerrufbuch-testdaten.mjs)
   über die echte Anwendungsschicht (server/lib im Bild), mit CENTRIC_PFEFFER aus der
   Umgebung, Ablage unter /data, Zustandsverzeichnis unter /zustand (CENTRIC_ZUSTAND) und
   einem Merkordner /ci-merk (nur dieses Skript liest ihn).

     anlegen        Betrieb mit Personen, 3 Konten (mit Mitgliedschaft), 3 Zugangscodes; dann wie beim
                    Serverstart widerrufbuchStart + kontobuchStart → beide Bücher entstehen, gesiegelt
     widerruf <n>   Zugangscode n widerrufen (Ablage, dann Buch) und Konto n sperren (Konto-Buch)

   Alle Werte sind synthetisch und zufällig; es gibt kein Netz und kein Geheimnis außer dem
   Wegwerf-Pfeffer der CI.
   ========================================================================== */
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const APP = process.env.CENTRIC_APP || "/app";
const MERK = process.env.CI_MERK || "/ci-merk";
const laden = (/** @type {string} */ n) => import(pathToFileURL(`${APP}/server/lib/${n}.mjs`).href);

const ablage = await laden("ablage");
const bestand = await laden("bestand");
const accounts = await laden("accounts");
const passwoerter = await laden("passwoerter");
const konten = await laden("konten");
const codes = await laden("codes");
const wb = await laden("widerrufbuch");
const kb = await laden("kontowiderrufbuch");

const store = ablage.getStore({ name: "centric", consistency: "strong" });
const RAUM = "ci-wb-haus";
const N = 3;
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
const merkDatei = `${MERK}/wb-testdaten.json`;

const befehl = process.argv[2];

if (befehl === "anlegen") {
  const person = (/** @type {string} */ id) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle: "mitarbeiter", bereich: "e1",
    status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const personen = Array.from({ length: 2 * N }, (_, i) => person(`p${i + 1}`));
  const e = await bestand.bestandSchreiben(store, RAUM, { version: 5, mandanten: [{ id: "mc", name: "Haus CI",
    einheiten: [{ id: "e1", name: "WB 1" }], personen }] }, { durch: "CI-Testdaten" });
  if (!e.ok) throw new Error(`Bestand nicht geschrieben: ${JSON.stringify(e)}`);
  const pw = await passwoerter.passwortAblegen(randomBytes(12).toString("hex"));
  const merk = { konten: [], codes: [] };
  for (let i = 1; i <= N; i++) {
    const a = await accounts.accountAnlegen(store, { email: `ci-wb-${i}-${randomBytes(3).toString("hex")}@example.org` });
    if (!a.ok) throw new Error(`Konto ${i}: ${a.grund}`);
    await accounts.emailBestaetigen(store, a.account.id);
    if (!(await accounts.passwortSetzen(store, a.account.id, pw)).ok) throw new Error(`Passwort ${i}`);
    const m = await accounts.mitgliedschaftAnlegen(store, { accountId: a.account.id, raum: RAUM, betrieb: 0, mandantId: "mc",
      person: `p${i}`, rolle: "mitarbeiter", status: "aktiv" });
    if (!m.ok) throw new Error(`Mitgliedschaft ${i}: ${JSON.stringify(m)}`);
    merk.konten.push(a.account.id);
    const code = [0, 1, 2].map(() => Array.from(randomBytes(4)).map((b) => ALPHABET[b % ALPHABET.length]).join("")).join("-");
    const konto = { name: "Haus CI", bestand: RAUM, rolle: "mitarbeiter", person: `p${N + i}`, betrieb: 0, mandantId: "mc",
      demo: false, gruppe: null, hinweis: null, angelegt: new Date().toISOString() };
    const schluessel = codes.ablageSchluessel(code);
    await konten.kontoSchreiben(store, schluessel, konto);
    merk.codes.push({ schluessel, konto });
  }
  await writeFile(merkDatei, JSON.stringify(merk));
  /* Wie der Serverstart: beide Bücher entstehen (leer), Anker in der Ablage. */
  const r1 = await wb.widerrufbuchStart(store);
  const r2 = await kb.kontobuchStart(store);
  console.log(JSON.stringify({ angelegt: true, konten: N, codes: N, codeEintraege: r1.eintraege, kontoEintraege: r2.konten }));
} else if (befehl === "widerruf") {
  const n = Number(process.argv[3]);
  if (!Number.isInteger(n) || n < 1 || n > N) throw new Error("widerruf <1..3>");
  const merk = JSON.parse(await readFile(merkDatei, "utf8"));
  const c = merk.codes[n - 1];
  await konten.kontoSchreiben(store, c.schluessel, { ...c.konto, gesperrt: true, gesperrtAm: new Date().toISOString(),
    gesperrtDurch: "ci-wb" });
  await wb.widerrufen(store, [c.schluessel], "zurueckgezogen");
  const sp = await accounts.accountSperren(store, merk.konten[n - 1]);
  if (!sp.ok || !(sp.kontobuch && sp.kontobuch.geschrieben)) throw new Error(`Konto ${n} nicht ins Buch gesperrt: ${JSON.stringify(sp)}`);
  console.log(JSON.stringify({ widerruf: n }));
} else {
  throw new Error("Aufruf: widerrufbuch-testdaten.mjs anlegen | widerruf <n>");
}
