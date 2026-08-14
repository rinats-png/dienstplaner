/* ==========================================================================
   RECHTETABELLEN VERGLEICHEN

   Die Tabelle steht doppelt: MATRIX_STD in src/App.jsx steuert, was die
   Oberfläche anbietet, MATRIX in netlify/lib/rechte.mjs entscheidet, was der
   Server zulässt. Die Doppelung ist Absicht — was im Browser läuft, gehört
   dem Browser.

   Sie driftet aber auseinander, sobald jemand nur eine Seite ändert, und der
   Fehler fällt niemandem auf, weil beide für sich funktionieren. Erst im
   Betrieb zeigt sich, dass die Oberfläche etwas anbietet, was der Server
   ablehnt — oder schlimmer: dass der Server etwas erlaubt, was die
   Oberfläche längst versteckt.

   Diese Prüfung liest beide Seiten und vergleicht sie. Sie braucht keinen
   Server und keinen Browser.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MATRIX } from "../netlify/lib/rechte.mjs";

const hier = dirname(fileURLToPath(import.meta.url));
const quelle = readFileSync(join(hier, "..", "src", "App.jsx"), "utf8");

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/* MATRIX_STD aus der Oberfläche herauslesen. Bewusst über einen Ausschnitt
   des Quelltextes statt über einen Import: App.jsx zieht React und die halbe
   Anwendung mit, und diese Prüfung soll in Sekunden laufen. */
function leseMatrixStd() {
  const anfang = quelle.indexOf("const MATRIX_STD = {");
  if (anfang < 0) throw new Error("MATRIX_STD nicht gefunden — wurde sie umbenannt?");
  const ende = quelle.indexOf("\n};", anfang);
  const block = quelle.slice(anfang, ende + 3);

  const alleRechte = [...quelle.matchAll(/\["([a-z.]+)","?[^"]*"\]|\["([a-z.]+)",\s*"/g)]
    .map((m) => m[1] || m[2]).filter(Boolean);

  const rollen = {};
  for (const treffer of block.matchAll(/^\s{2}(\w+):\s*(.+?),?$/gm)) {
    const [, rolle, ausdruck] = treffer;
    if (ausdruck.includes("ALLE_RECHTE") && ausdruck.includes("filter")) {
      const ausgenommen = [...ausdruck.matchAll(/"([a-z.]+)"/g)].map((m) => m[1]);
      rollen[rolle] = { art: "alleAusser", ausgenommen };
    } else if (ausdruck.includes("ALLE_RECHTE")) {
      rollen[rolle] = { art: "alle" };
    } else {
      rollen[rolle] = { art: "liste",
        rechte: [...ausdruck.matchAll(/"([a-z.]+)"/g)].map((m) => m[1]) };
    }
  }
  return { rollen, alleRechte: [...new Set(alleRechte)] };
}

const oberflaeche = leseMatrixStd();

/* --- Dieselben Rollen? --- */
const rollenServer = Object.keys(MATRIX).filter((r) => r !== "kunde").sort();
const rollenClient = Object.keys(oberflaeche.rollen).sort();
pruef("Beide Seiten kennen dieselben Rollen",
  JSON.stringify(rollenServer) === JSON.stringify(rollenClient),
  `Server: ${rollenServer.join(", ")} | Oberfläche: ${rollenClient.join(", ")}`);

/* --- Dieselben Rechte je Rolle? --- */
for (const rolle of rollenClient) {
  const client = oberflaeche.rollen[rolle];
  const server = (MATRIX[rolle] || []).slice().sort();

  if (client.art === "alle") {
    pruef(`${rolle}: beide Seiten geben alle Rechte`,
      server.length >= 15, `${server.length} Rechte auf dem Server`);
  } else if (client.art === "alleAusser") {
    const fehlend = client.ausgenommen.filter((r) => server.includes(r));
    pruef(`${rolle}: die ausgenommenen Rechte fehlen auch auf dem Server`,
      fehlend.length === 0,
      fehlend.length ? `Server erlaubt zu viel: ${fehlend.join(", ")}` : "");
  } else {
    const nurClient = client.rechte.filter((r) => !server.includes(r)).sort();
    const nurServer = server.filter((r) => !client.rechte.includes(r)).sort();
    pruef(`${rolle}: die Rechtelisten stimmen überein`,
      nurClient.length === 0 && nurServer.length === 0,
      [nurClient.length ? `nur Oberfläche: ${nurClient.join(", ")}` : "",
       nurServer.length ? `nur Server: ${nurServer.join(", ")}` : ""].filter(Boolean).join(" | "));
  }
}

/* --- Der Riegel für den Betriebsrat --- */
pruef("Der Betriebsrat hat serverseitig kein Änderungsrecht",
  !(MATRIX.betriebsrat || []).some((r) => /\.(edit|approve|assign)/.test(r)),
  (MATRIX.betriebsrat || []).filter((r) => /\.(edit|approve|assign)/.test(r)).join(", "));

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("\nWeicht eine Seite ab, gilt der Server: Die Oberfläche darf");
  console.log("weniger zeigen als er erlaubt, niemals mehr.\n");
  process.exit(1);
}
