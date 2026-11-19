/* ==========================================================================
   LASTPROBE STEMPELN (WP-02, R7) — 200 Stempel je Minute, kein Verlust

   Kein Teil der CI-Kette: Die Probe läuft rund eine Minute und misst Zeiten,
   die auf einem geteilten Prüfrechner wenig aussagen. Lokal aufrufen mit

     npm run pruefung:last-stempeln               (Vorgabe: 60 s, 200/min, Bündel zu 10)
     node pruefungen/last-stempeln.mjs 30 120 5   (Dauer in s, Stempel je min, Bündelgröße)

   Gestempelt wird gegen die Serverfunktion selbst (daten.mjs) auf einer
   Wegwerfablage, gleichmäßig verteilt auf zwei Betriebe: Die Schreibbremse
   lässt je Betrieb 120 Schreibvorgänge in der Minute zu (schutz.mjs), mehr
   als das kann ein einzelner Betrieb ohnehin nicht stempeln. Jede Person
   stempelt einmal ein.

   Die Stempel kommen in Bündeln, nicht im Gleichschritt: Bei einem
   Schichtwechsel stehen zehn Menschen gleichzeitig an der Uhr, dann ist
   ein paar Sekunden Ruhe. 200 je Minute in Bündeln zu zehn heißt alle drei
   Sekunden zehn gleichzeitige Stempel. Gleichmäßig verteilt (Bündelgröße 1)
   überlappen sich die Schreibvorgänge kaum — dann fände die Probe auch
   ohne Sperre keinen Verlust und bewiese nichts. Am Ende wird gezählt, was gespeichert ist, und mit
   den Antworten verglichen: Jede Erfolgsmeldung muss als Stempel stehen,
   und genau so, wie sie gemeldet wurde.

   Ausgabe: Anzahl, Erfolge, Absagen, Verluste, Laufzeiten (Median, p95,
   Maximum). Rückgabewert 1 bei mindestens einem Verlust oder einer
   Fehlantwort.
   ========================================================================== */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const DAUER_S = Number(process.argv[2]) || 60;
const JE_MINUTE = Number(process.argv[3]) || 200;
const BUENDEL = Math.max(1, Number(process.argv[4]) || 10);
const RAEUME = ["last-a", "last-b"];
const WIRT = "127.0.0.1:3000";
const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

const wurzel = await mkdtemp(path.join(tmpdir(), "centric-last-"));
process.env.CENTRIC_DATEN = wurzel;
process.env.CENTRIC_ABLAGE = "dateien";
process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
const { getStore } = await import("../server/lib/ablage.mjs");
const laden = () => getStore({ name: "centric", consistency: "strong" });
const daten = (await import("../server/funktionen/daten.mjs")).default;
const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
const B = await import("../server/lib/bestand.mjs");

const gesamt = Math.round((DAUER_S / 60) * JE_MINUTE);
const jeRaum = Math.ceil(gesamt / RAEUME.length);
const person = (id) => ({ id, vorname: "V", nachname: id, rolle: "mitarbeiter", bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

const auftraege = [];
for (const raum of RAEUME) {
  const ids = Array.from({ length: jeRaum }, (_, i) => `p${i + 1}`);
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [{ id: "m1", name: raum,
    einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: ids.map(person), abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {} }] },
  { durch: "Lastprobe" });
  for (const id of ids) {
    const { token } = await sitzungAnlegen({ bestand: raum, name: id, rolle: "mitarbeiter", person: id,
      betrieb: 0, mandantId: "m1", einheit: null }, 2 * 60 * 60 * 1000);
    auftraege.push({ raum, id, token });
  }
}
/* Abwechselnd aus beiden Räumen, damit die Last gleichmäßig liegt. */
auftraege.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)) || a.raum.localeCompare(b.raum));
auftraege.length = gesamt;

let nr = 0;
async function stempeln({ token }) {
  nr += 1;
  const a = await daten(new Request(`http://${WIRT}/api/stempeln`, { method: "POST",
    headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
      authorization: `Bearer ${token}`, "x-forwarded-for": `10.9.${Math.floor(nr / 250) % 250}.${nr % 250}` },
    body: JSON.stringify({ datum: HEUTE, art: "start" }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

console.log(`Lastprobe: ${gesamt} Stempel in ${DAUER_S} s (${JE_MINUTE}/min, Bündel zu ${BUENDEL}), ${RAEUME.length} Betriebe`);
const abstand = (60_000 / JE_MINUTE) * BUENDEL;
const beginn = Date.now();
const laeufe = auftraege.map((auftrag, i) => new Promise((fertig) => {
  setTimeout(async () => {
    const t0 = performance.now();
    const antwort = await stempeln(auftrag).catch((e) => ({ status: 0, fehler: String(e) }));
    fertig({ auftrag, antwort, ms: performance.now() - t0 });
  }, Math.floor(i / BUENDEL) * abstand);
}));
const ergebnisse = await Promise.all(laeufe);
const dauer = (Date.now() - beginn) / 1000;

const gespeichert = new Map();
for (const raum of RAEUME) gespeichert.set(raum, (await B.bestandLesen(laden(), raum)).bestand.mandanten[0].einstempeln || {});

let erfolge = 0, absagen = 0, verluste = 0, falsch = 0;
for (const { auftrag, antwort } of ergebnisse) {
  const steht = gespeichert.get(auftrag.raum)[`${auftrag.id}|${HEUTE}`];
  if (antwort.status === 200) {
    erfolge++;
    if (!steht || JSON.stringify(steht) !== JSON.stringify(antwort.eintrag)) verluste++;
  } else {
    absagen++;
    if (steht) falsch++;          // gespeichert, aber als gescheitert gemeldet
  }
}
const zeiten = ergebnisse.map((e) => e.ms).sort((a, b) => a - b);
const q = (p) => zeiten[Math.min(zeiten.length - 1, Math.floor(p * zeiten.length))];
const status = {};
for (const { antwort } of ergebnisse) status[antwort.status] = (status[antwort.status] || 0) + 1;

console.log(`Dauer ${dauer.toFixed(1)} s · Status ${JSON.stringify(status)}`);
console.log(`Erfolge ${erfolge} · Absagen ${absagen} · Verluste ${verluste} · gespeichert trotz Absage ${falsch}`);
console.log(`Laufzeit je Stempel: Median ${q(0.5).toFixed(1)} ms · p95 ${q(0.95).toFixed(1)} ms · max ${zeiten[zeiten.length - 1].toFixed(1)} ms`);

await rm(wurzel, { recursive: true, force: true });
process.exit(verluste || falsch || erfolge !== gesamt ? 1 : 0);
