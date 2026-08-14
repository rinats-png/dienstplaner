/* ==========================================================================
   ZUGANGSCODES — Schlüsselwechsel

   Die heikelste Eigenschaft der Umstellung auf geschlüsselte Hashes: Kein
   bestehender Code darf aufhören zu funktionieren. Ein Kunde, der sich nach
   einem Deployment nicht mehr anmelden kann, ist ein größerer Schaden als
   die Lücke, die geschlossen wird.

   Läuft ohne Server: npm run pruefung:codes
   ========================================================================== */

import { findeKonto, umschluesseln, altHash, neuHash, gleich, pfeffrig }
  from "../netlify/lib/codes.mjs";

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const CODE = "ABCD-EFGH-JKLM";
const FALSCH = "XXXX-YYYY-ZZZZ";

/* --- Ausgangslage: Bestand aus der Zeit vor dem Pfeffer --- */
delete process.env.CENTRIC_PFEFFER;
const konten = {};
konten[altHash(CODE)] = { name: "Altkunde", bestand: "alt1", rolle: "leitung" };

pruef("Ohne Pfeffer wird der alte Bestand gefunden",
  !!findeKonto(konten, CODE).eintrag);
pruef("Ohne Pfeffer wird nichts umgeschlüsselt",
  findeKonto(konten, CODE).umschluesseln === false);
pruef("pfeffrig() meldet korrekt: nein", pfeffrig() === false);

/* --- Der Pfeffer wird eingeführt --- */
process.env.CENTRIC_PFEFFER = "PruefPfeffer" + "0".repeat(20);

pruef("pfeffrig() meldet korrekt: ja", pfeffrig() === true);
const fund = findeKonto(konten, CODE);
pruef("Ein alter Code funktioniert weiterhin", !!fund.eintrag,
  "sonst wären alle Bestandskunden ausgesperrt");
pruef("Er wird zum Umschlüsseln vorgemerkt", fund.umschluesseln === true);

/* --- Umschlüsseln --- */
pruef("Umschlüsseln gelingt", umschluesseln(konten, CODE, fund.schluessel) === true);
pruef("Der alte Schlüssel ist weg", !konten[altHash(CODE)]);
pruef("Der neue Schlüssel steht", !!konten[neuHash(CODE)]);
const danach = findeKonto(konten, CODE);
pruef("Danach wird direkt über den neuen Weg gefunden",
  !!danach.eintrag && danach.umschluesseln === false);
pruef("Die Kontodaten sind unverändert",
  danach.eintrag.name === "Altkunde" && danach.eintrag.bestand === "alt1");

/* --- Der eigentliche Zweck --- */
const gestohlen = JSON.parse(JSON.stringify(konten));
delete process.env.CENTRIC_PFEFFER;
pruef("Ohne Pfeffer ist der Bestand nicht durchsuchbar",
  !findeKonto(gestohlen, CODE).eintrag,
  "ein abgeflossener Blob nützt ohne den Schlüssel nichts");

/* --- Grundlegendes --- */
process.env.CENTRIC_PFEFFER = "PruefPfeffer" + "0".repeat(20);
pruef("Ein falscher Code findet nichts", !findeKonto(konten, FALSCH).eintrag);
pruef("Ein leerer Code findet nichts", !findeKonto(konten, "").eintrag);
pruef("Zwei Pfeffer liefern verschiedene Schlüssel", (() => {
  const a = neuHash(CODE);
  process.env.CENTRIC_PFEFFER = "AndererPfeffer" + "0".repeat(18);
  const b = neuHash(CODE);
  process.env.CENTRIC_PFEFFER = "PruefPfeffer" + "0".repeat(20);
  return a !== b;
})());

/* --- Gleichlanger Vergleich --- */
pruef("gleich() erkennt Übereinstimmung", gleich("geheim", "geheim") === true);
pruef("gleich() erkennt Abweichung", gleich("geheim", "geheiM") === false);
pruef("gleich() erkennt ungleiche Länge ohne Absturz", gleich("kurz", "vielLaenger") === false);
pruef("gleich() verträgt undefined", gleich(undefined, "x") === false);

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
