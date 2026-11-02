/* ==========================================================================
   Testdaten für den CI-Nachweis (betrieb-sicherung.yml) — NUR CI.

   Läuft im gebauten Bild (docker run --entrypoint node … /ci/testdaten.mjs)
   gegen eine Wegwerf-Ablage unter /data und schreibt über die echte
   Anwendungsschicht (server/lib im Bild), damit jede Datei das gültige
   Umschlagformat hat:

     A  centric       3 Betriebe (Kern, Scherben, Standvermerke), 4 Konten,
                      dazu token:/tokencode: (müssen fehlen)
     B  centric-sitzungen  sk: (gesichert) und t: (flüchtig)
        centric-spur       Protokolleinträge
     C  centric-accountsitzungen, centric-takt  (müssen fehlen)

   Mit Argument `--nachtrag <n>` kommt ein weiterer Protokolleintrag dazu
   (damit aufeinanderfolgende Sicherungen sich unterscheiden).
   ========================================================================== */
import { createHash, randomBytes } from "node:crypto";

const { getStore } = await import("/app/server/lib/ablage.mjs");
const B = await import("/app/server/lib/bestand.mjs");
const A = await import("/app/server/lib/accounts.mjs");
const P = await import("/app/server/lib/passwoerter.mjs");

const centric = getStore({ name: "centric", consistency: "strong" });
const sitzungen = getStore({ name: "centric-sitzungen", consistency: "strong" });
const spur = getStore({ name: "centric-spur", consistency: "strong" });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

const nachtrag = process.argv.indexOf("--nachtrag");
if (nachtrag > 0) {
  const n = process.argv[nachtrag + 1] || "x";
  await spur.setJSON(`nachtrag:${n}`, { zeit: new Date().toISOString(), was: `nachtrag ${n}` });
  console.log(JSON.stringify({ nachtrag: n }));
  process.exit(0);
}

const person = (id, vorname, nachname, rolle) => ({
  id, vorname, nachname, rolle, status: "aktiv",
  zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }], bereich: "ALLE",
});

const betriebe = [
  ["ci-nord", "Haus Nord", [person("p1", "Anna", "Adler", "pflege"), person("p2", "Bernd", "Berg", "leitung")]],
  ["ci-sued", "Haus Süd", [person("p3", "Clara", "Claus", "pflege")]],
  ["ci-west", "Haus West", [person("p4", "Dora", "Dorn", "pflege"), person("p5", "Emil", "Eck", "pflege"),
    person("p6", "Frida", "Fink", "leitung")]],
];
for (const [raum, name, personen] of betriebe) {
  const bestand = {
    version: 5,
    mandanten: [{ id: "m1", name, personen, einheiten: [{ id: "e1", name: "Wohnbereich 1" }] }],
  };
  const e = await B.bestandSchreiben(centric, raum, bestand, { durch: "CI-Testdaten" });
  if (!e.ok) throw new Error(`Bestand ${raum} nicht geschrieben: ${JSON.stringify(e)}`);
  // zweiter Stand, damit es Standvermerke gibt
  const e2 = await B.bestandSchreiben(centric, raum,
    { ...bestand, mandanten: [{ ...bestand.mandanten[0], name: `${name} (2)` }] },
    { erwarteterStand: e.stand, durch: "CI-Testdaten" });
  if (!e2.ok) throw new Error(`Zweiter Stand ${raum}: ${JSON.stringify(e2)}`);
}

const pw = await P.passwortAblegen(randomBytes(12).toString("hex"));
for (let i = 1; i <= 4; i++) {
  const e = await A.accountAnlegen(centric, { email: `ci-konto-${i}@example.org` });
  if (!e.ok) throw new Error(`Konto ${i}: ${e.grund}`);
  await A.emailBestaetigen(centric, e.account.id);
  const g = await A.passwortSetzen(centric, e.account.id, pw);
  if (!g.ok) throw new Error(`Passwort ${i}`);
}

// flüchtig im Store centric (darf nicht in die Sicherung)
await centric.setJSON(`token:${hash("ci-token")}`, { zweck: "ci" });
await centric.setJSON(`tokencode:${hash("ci-code")}`, { zweck: "ci" });

// Klasse B
for (let i = 1; i <= 2; i++) await sitzungen.setJSON(`sk:${hash(`sk${i}`)}`, { raum: "ci-nord", seit: Date.now() });
for (let i = 1; i <= 3; i++) await sitzungen.setJSON(`t:${hash(`t${i}`)}`, { raum: "ci-nord", seit: Date.now() });
for (let i = 1; i <= 5; i++) await spur.setJSON(`ci:${i}`, { zeit: new Date().toISOString(), was: `eintrag ${i}` });

// Klasse C
const takt = getStore({ name: "centric-takt", consistency: "strong" });
const kontoSitz = getStore({ name: "centric-accountsitzungen", consistency: "strong" });
for (let i = 1; i <= 2; i++) {
  await takt.setJSON(`ci:${i}`, { n: i });
  await kontoSitz.setJSON(`s:${hash(`as${i}`)}`, { seit: Date.now() });
}

console.log(JSON.stringify({ betriebe: betriebe.length, konten: 4 }));
