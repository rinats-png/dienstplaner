/* ==========================================================================
   SCHERBEN — Zerlegung und gleichzeitiges Planen

   Der Kern von M1: Zwei Planer laden denselben Stand, einer trägt im August
   ein, der andere im September. Bis hierher verlor einer von beiden seine
   Arbeit, weil der Konfliktschutz auf den ganzen Betrieb ging.

   Läuft ohne Server: npm run pruefung:scherben
   ========================================================================== */

import { zerlegen, zusammensetzen, abdruck, unterschiede,
  zusammenfuehrenNachMonat } from "../netlify/lib/scherben.mjs";

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const basis = () => ({
  version: 6, stand: 1,
  mandanten: [{
    id: "m1", name: "Probebetrieb",
    personen: [{ id: "p1", nachname: "Kern" }, { id: "p2", nachname: "Vogt" }],
    dienstarten: [{ id: "F", kurz: "F" }],
    abweichungen: {
      "p1|2026-08-03": "F",
      "p1|2026-09-07": "S",
      "p2|2026-08-04": "N",
    },
    erfassung: { "p1|2026-08-03": { start: "06:00", ende: "14:00" } },
    einstempeln: {},
  }],
});

/* --- Zerlegen und wieder zusammensetzen --- */
const b = basis();
const z = zerlegen(b);
pruef("Zwei Monate ergeben zwei Scherben", z.scherben.size === 2,
  `${z.scherben.size}: ${[...z.scherben.keys()].join(", ")}`);
pruef("Der Kern trägt keine Tagesdaten mehr",
  Object.keys(z.kern.mandanten[0].abweichungen).length === 0);
pruef("Stammdaten bleiben im Kern",
  z.kern.mandanten[0].personen.length === 2 && z.kern.mandanten[0].dienstarten.length === 1);

/* Inhaltlich vergleichen, nicht zeichenweise.

   Beim Zusammensetzen werden die Tagesschlüssel nach Monat gruppiert statt
   in der ursprünglichen Eingabereihenfolge geliefert. Für Objekte, die als
   Zuordnung benutzt werden, ist das bedeutungslos — ein Vergleich über
   JSON.stringify würde hier eine Abweichung melden, die keine ist. */
const geordnet = (x) => {
  if (Array.isArray(x)) return x.map(geordnet);
  if (x && typeof x === "object")
    return Object.fromEntries(Object.keys(x).sort().map((k) => [k, geordnet(x[k])]));
  return x;
};
const wieder = zusammensetzen(z.kern, [...z.scherben.values()]);
pruef("Zusammengesetzt ist es inhaltlich dasselbe",
  JSON.stringify(geordnet(wieder)) === JSON.stringify(geordnet(b)),
  "sonst verliert die Oberfläche beim Laden Daten");
pruef("Auch die Reihenfolge je Monat ist beisammen",
  Object.keys(wieder.mandanten[0].abweichungen).length === 3);

/* --- Abdruck erkennt Änderungen --- */
const z2 = zerlegen(basis());
pruef("Gleicher Inhalt, gleicher Abdruck",
  abdruck(z.scherben.get("m1::2026-08")) === abdruck(z2.scherben.get("m1::2026-08")));
const geaendert = basis();
geaendert.mandanten[0].abweichungen["p1|2026-08-03"] = "N";
pruef("Geänderter Inhalt, anderer Abdruck",
  abdruck(zerlegen(geaendert).scherben.get("m1::2026-08"))
    !== abdruck(z.scherben.get("m1::2026-08")));
pruef("Nur der geänderte Monat fällt auf",
  JSON.stringify(unterschiede(z.scherben, zerlegen(geaendert).scherben)) === '["m1::2026-08"]');

/* --- Der eigentliche Fall: zwei Planer, zwei Monate --- */
const ausgang = basis();
const planerA = basis();
planerA.mandanten[0].abweichungen["p1|2026-08-10"] = "F";   // August
const planerB = basis();
planerB.mandanten[0].abweichungen["p2|2026-09-15"] = "S";   // September

const erg = zusammenfuehrenNachMonat(ausgang, planerA, planerB);
pruef("Verschiedene Monate lassen sich zusammenführen", erg.ok,
  erg.ok ? "" : `Streit: ${(erg.streit || []).join(", ")}`);
if (erg.ok) {
  const a = erg.bestand.mandanten[0].abweichungen;
  pruef("Die Arbeit von Planer A ist erhalten", a["p1|2026-08-10"] === "F");
  pruef("Die Arbeit von Planer B ist erhalten", a["p2|2026-09-15"] === "S");
  pruef("Der Ausgangsbestand ist unverändert dabei",
    a["p1|2026-08-03"] === "F" && a["p2|2026-08-04"] === "N");
}

/* --- Derselbe Monat bleibt ein Konflikt --- */
const c1 = basis(); c1.mandanten[0].abweichungen["p1|2026-08-20"] = "F";
const c2 = basis(); c2.mandanten[0].abweichungen["p2|2026-08-21"] = "N";
const konflikt = zusammenfuehrenNachMonat(ausgang, c1, c2);
pruef("Derselbe Monat bleibt ein Konflikt", !konflikt.ok,
  "dort automatisch zu mischen hieße raten");
pruef("Der Konflikt nennt den Monat",
  !konflikt.ok && (konflikt.streit || []).includes("m1::2026-08"),
  (konflikt.streit || []).join(", "));

/* --- Stammdaten von beiden Seiten geändert: kein Automatismus --- */
const s1 = basis(); s1.mandanten[0].personen.push({ id: "p3", nachname: "Neu" });
const s2 = basis(); s2.mandanten[0].dienstarten.push({ id: "S", kurz: "S" });
const kern = zusammenfuehrenNachMonat(ausgang, s1, s2);
pruef("Beidseitige Stammdatenänderung bleibt ein Konflikt",
  !kern.ok && (kern.streit || []).includes("kern"));

/* --- Einseitige Stammdatenänderung geht durch --- */
const e1 = basis(); e1.mandanten[0].personen.push({ id: "p3", nachname: "Neu" });
const e2 = basis(); e2.mandanten[0].abweichungen["p1|2026-09-20"] = "N";
const einseitig = zusammenfuehrenNachMonat(ausgang, e1, e2);
pruef("Stammdaten hier, Plan dort — geht zusammen", einseitig.ok);
if (einseitig.ok) {
  pruef("Beide Änderungen sind erhalten",
    einseitig.bestand.mandanten[0].personen.length === 3
      && einseitig.bestand.mandanten[0].abweichungen["p1|2026-09-20"] === "N");
}

/* --- Schlüssel ohne erkennbares Datum gehen nicht verloren --- */
const seltsam = basis();
seltsam.mandanten[0].abweichungen["kaputt"] = "X";
const zs = zerlegen(seltsam);
pruef("Ein Schlüssel ohne Datum bleibt im Kern",
  zs.kern.mandanten[0].abweichungen.kaputt === "X",
  "lieber eine unerwartete Form mitschleppen als sie verlieren");
pruef("Und überlebt das Zusammensetzen",
  zusammensetzen(zs.kern, [...zs.scherben.values()])
    .mandanten[0].abweichungen.kaputt === "X");

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
