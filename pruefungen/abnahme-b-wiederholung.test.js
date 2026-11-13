/* ==========================================================================
   ABNAHME V4, STRANG B — Wiederholung kritischer Vorgänge über die echten Handler

   Lokale Integrationsabnahme (2026-11-13), synthetische Daten, Wegwerfordner. Die Einzelfälle sind in den
   Fachprüfungen belegt (offline-stempeln, wp07b-stempel-500, rb2-krankmeldung, monatsabschluss, etag-pflicht).
   Hier laufen die Abläufe als Kette über server/funktionen/daten.mjs, mit den Wiederholungen, die im Betrieb
   wirklich vorkommen: Doppeltipp, Netzwiederholung, zweiter Reiter, veraltete Kopie mit altem ETag.

   K1 Stempel: Beginn, Ende und ihre Wiederholungen in beliebiger Folge — genau ein Stempel, eine Ist-Zeit;
      auch eine verspätete Wiederholung des Beginns NACH dem Ende ändert nichts.
   K2 Stempel und veraltete Kopie: PUT mit dem ETag von vor dem Stempel → 409, der Stempel bleibt; die
      Wiederholung desselben PUT ebenso; mit frischem ETag, aber ohne den Stempel → der Stempel bleibt.
   K3 Krankmeldung zweistufig: doppelte Meldung, doppelte vorläufige und doppelte endgültige Bestätigung
      gleichzeitig — ein Fall, je Stufe ein Verlaufseintrag, eine Abwesenheit; der Plan bleibt bis zur
      endgültigen Bestätigung unverändert; eine veraltete Kopie der Planung nimmt die Abwesenheit nicht weg.
   K4 Monatsabschluss: drei gleichzeitige Abschlüsse (Planung, Leitung, Leitung doppelt) → genau einer;
      Wiederholung danach 409 ohne neuen Verlaufseintrag; zwei gleichzeitige Wiederöffnungen → genau eine.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { aufbauen } from "./wp16-folge-harness.mjs";

let h;
const TAG = "2026-11-10";
const stempelVon = (m, pid) => Object.entries(m.einstempeln || {}).filter(([k]) => k.startsWith(`${pid}|`));
const ID = (n) => `abb00000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ROLLE = { a1: "mitarbeiter", a2: "mitarbeiter", s1: "subplaner", p1: "planer", l1: "leitung" };
const personen = () => Object.keys(ROLLE).map((id) => h.person(id, ROLLE[id]));
const tok = (raum, id) => h.token(raum, id, ROLLE[id]);
const lesen = async (raum, id) => h.anfrage("bestand", { methode: "GET", token: await tok(raum, id) });
const kopie = (x) => JSON.parse(JSON.stringify(x));

beforeAll(async () => { h = await aufbauen("abnahme-b", `${TAG}T05:00:00Z`); }, 60000);
afterAll(async () => { if (h) await h.abbauen(); });

describe("K1 Stempel: Wiederholungen in beliebiger Folge ergeben genau einen Stempel", { timeout: 120000 }, () => {
  it("Beginn ×3 (Doppeltipp, Netzwiederholung, zweiter Reiter), Ende ×2, danach noch einmal der alte Beginn", async () => {
    h.zeitAuf(`${TAG}T05:00:00Z`);
    await h.raum("k1", personen(), { abweichungen: { [`a1|${TAG}`]: "F" } });
    const beginn = { art: "start", clientEventId: ID(1), erfasstAm: `${TAG}T05:00:00.000Z` };
    const erst = await h.anfrage("stempeln", { token: await tok("k1", "a1"), rumpf: beginn });
    expect(erst.status, erst.roh).toBe(200);
    const parallel = await Promise.all([1, 2].map(async () => h.anfrage("stempeln", { token: await tok("k1", "a1"), rumpf: beginn })));
    expect(parallel.map((x) => [x.status, x.wiederholt])).toEqual([[200, true], [200, true]]);
    /* Ein zweiter, getrennter Druck (neue Kennung) während der Dienst läuft: abgewiesen, nie ein zweiter Beginn. */
    const doppelt = await h.anfrage("stempeln", { token: await tok("k1", "a1"), rumpf: { ...beginn, clientEventId: ID(2) } });
    expect(doppelt.status, doppelt.roh).toBe(409);

    h.zeitAuf(`${TAG}T13:00:00Z`);
    const ende = { art: "ende", clientEventId: ID(3), erfasstAm: `${TAG}T13:00:00.000Z`, pause: 30 };
    const e1 = await h.anfrage("stempeln", { token: await tok("k1", "a1"), rumpf: ende });
    expect(e1.status, e1.roh).toBe(200);
    h.zeitAuf(`${TAG}T13:05:00Z`);
    const e2 = await h.anfrage("stempeln", { token: await tok("k1", "a1"), rumpf: { ...ende, gesendetAm: `${TAG}T13:05:00.000Z` } });
    expect([e2.status, e2.wiederholt]).toEqual([200, true]);
    /* Verspätete Wiederholung des Beginns aus einem alten Puffer, nachdem das Ende schon gebucht ist. */
    const spaet = await h.anfrage("stempeln", { token: await tok("k1", "a1"), rumpf: { ...beginn, gesendetAm: `${TAG}T13:05:00.000Z` } });
    expect([spaet.status, spaet.wiederholt], spaet.roh).toEqual([200, true]);

    const m = await h.mandant("k1");
    expect(stempelVon(m, "a1")).toHaveLength(1);
    expect(m.einstempeln[`a1|${TAG}`]).toMatchObject({ start: "06:00", ende: "14:00", ereignisStart: ID(1) });
    expect(Object.keys(m.erfassung).filter((k) => k.startsWith("a1|"))).toEqual([`a1|${TAG}`]);
    expect(m.erfassung[`a1|${TAG}`]).toMatchObject({ start: "06:00", ende: "14:00" });
  });
});

describe("K2 Stempel und veraltete Kopie (ETag)", { timeout: 120000 }, () => {
  it("PUT mit dem ETag von vor dem Stempel → 409 (auch wiederholt); frischer ETag ohne den Stempel → der Stempel bleibt", async () => {
    h.zeitAuf(`${TAG}T05:00:00Z`);
    await h.raum("k2", personen(), { abweichungen: { [`a1|${TAG}`]: "F" } });
    const alt = await lesen("k2", "l1");
    expect(alt.status, alt.roh).toBe(200);
    const st = await h.anfrage("stempeln", { token: await tok("k2", "a1"), rumpf: { art: "start", clientEventId: ID(10), erfasstAm: `${TAG}T05:00:00.000Z` } });
    expect(st.status, st.roh).toBe(200);

    const veraltet = kopie(alt.bestand);
    veraltet.mandanten[0].abweichungen[`a2|${TAG}`] = "F";                      // irgendeine Planänderung auf der alten Kopie
    for (let i = 0; i < 2; i++) {
      const w = await h.anfrage("bestand", { methode: "PUT", token: await tok("k2", "l1"), rumpf: { bestand: veraltet, etag: alt.etag } });
      expect(w.status, `Versuch ${i + 1}: ${w.roh.slice(0, 200)}`).toBe(409);
    }
    let m = await h.mandant("k2");
    expect(m.einstempeln[`a1|${TAG}`]).toMatchObject({ start: "06:00", ereignisStart: ID(10) });
    expect(m.abweichungen[`a2|${TAG}`]).toBeUndefined();

    const frisch = await lesen("k2", "l1");
    const ohne = kopie(frisch.bestand);
    delete ohne.mandanten[0].einstempeln[`a1|${TAG}`];
    const w = await h.anfrage("bestand", { methode: "PUT", token: await tok("k2", "l1"), rumpf: { bestand: ohne, etag: frisch.etag } });
    expect([200, 403, 409, 422]).toContain(w.status);
    m = await h.mandant("k2");
    expect(m.einstempeln[`a1|${TAG}`], `PUT ${w.status}: Stempel darf nicht verschwinden`).toMatchObject({ start: "06:00", ereignisStart: ID(10) });
  });
});

describe("K3 Krankmeldung zweistufig: doppelte Schritte", { timeout: 120000 }, () => {
  const km = async (id, rumpf) => h.anfrage("krankmeldung", { token: await tok("k3", id), rumpf });
  it("Meldung ×2, vorläufig ×2, endgültig ×2 gleichzeitig: ein Fall, je Stufe ein Eintrag, eine Abwesenheit; Plan bis zur endgültigen Bestätigung unverändert", async () => {
    h.zeitAuf(`${TAG}T05:00:00Z`);
    const T1 = "2026-11-12";
    await h.raum("k3", personen(), { abweichungen: { [`a1|${T1}`]: "F" }, krankmeldungen: [] });
    const meldung = { aktion: "melden", von: T1, bis: T1 };
    const zwei = await Promise.all([km("a1", meldung), km("a1", meldung)]);
    expect(zwei.map((x) => x.status), zwei.map((x) => x.roh).join(" | ")).toEqual([200, 200]);
    let m = await h.mandant("k3");
    expect(m.krankmeldungen, "Doppeltipp beim Melden: ein Fall").toHaveLength(1);
    const id = m.krankmeldungen[0].id;
    expect(new Set(zwei.map((x) => x.fall.id))).toEqual(new Set([id]));

    const vorl = await Promise.all([km("s1", { aktion: "vorlaeufig", id }), km("s1", { aktion: "vorlaeufig", id })]);
    expect(vorl.map((x) => x.status).sort(), vorl.map((x) => x.roh).join(" | ")).toEqual([200, 409]);
    m = await h.mandant("k3");
    expect(m.krankmeldungen[0].verlauf.filter((v) => v.schritt === "vorlaeufig")).toHaveLength(1);
    expect(m.abwesenheiten).toEqual([]);
    expect(m.abweichungen[`a1|${T1}`]).toBe("F");                                // veröffentlichter Plan unverändert

    const planVorher = await lesen("k3", "p1");                                   // Kopie der Planung vor der endgültigen Bestätigung
    const end = await Promise.all([km("p1", { aktion: "endgueltig", id }), km("p1", { aktion: "endgueltig", id })]);
    expect(end.map((x) => x.status).sort(), end.map((x) => x.roh).join(" | ")).toEqual([200, 409]);
    m = await h.mandant("k3");
    expect(m.krankmeldungen[0].verlauf.filter((v) => v.schritt === "endgueltig")).toHaveLength(1);
    expect(m.abwesenheiten.filter((a) => a.personId === "a1" && a.art === "krank")).toHaveLength(1);

    /* Wiederholung des PUT aus der alten Kopie (vor der endgültigen Bestätigung): 409, Fall und Abwesenheit bleiben. */
    const alt = kopie(planVorher.bestand);
    alt.mandanten[0].abweichungen[`a2|${T1}`] = "F";
    const w = await h.anfrage("bestand", { methode: "PUT", token: await tok("k3", "p1"), rumpf: { bestand: alt, etag: planVorher.etag } });
    expect(w.status, w.roh.slice(0, 200)).toBe(409);
    m = await h.mandant("k3");
    expect(m.krankmeldungen[0].status).toBe("endgueltig_bestaetigt");
    expect(m.abwesenheiten.filter((a) => a.personId === "a1" && a.art === "krank")).toHaveLength(1);
  });
});

describe("K4 Monatsabschluss: gleichzeitige und wiederholte Schritte", { timeout: 120000 }, () => {
  const ma = async (id, rumpf) => h.anfrage("monatsabschluss", { token: await tok("k4", id), rumpf });
  it("drei gleichzeitige Abschlüsse → genau einer; Wiederholung 409 ohne neuen Eintrag; zwei Wiederöffnungen → genau eine", async () => {
    h.zeitAuf(`${TAG}T09:00:00Z`);
    await h.raum("k4", personen(), { abweichungen: { "a1|2026-10-14": "F" },
      einstempeln: { "a1|2026-10-14": { start: "06:00", startAm: "2026-10-14T04:00:00.000Z", ende: "14:00", endeAm: "2026-10-14T12:00:00.000Z" } },
      erfassung: { "a1|2026-10-14": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } } });
    const ab = { aktion: "abschliessen", monat: "2026-10", grund: "Lohnlauf Oktober" };
    const drei = await Promise.all([ma("p1", ab), ma("l1", ab), ma("l1", ab)]);
    expect(drei.map((x) => x.status).sort(), drei.map((x) => x.roh).join(" | ")).toEqual([200, 409, 409]);
    let e = (await h.mandant("k4")).monatsabschluss["2026-10"];
    expect(e.abgeschlossen).toBe(true);
    expect(e.verlauf.filter((v) => v.art === "abschluss")).toHaveLength(1);

    const nochmal = await ma("l1", ab);
    expect(nochmal.status).toBe(409);
    expect((await h.mandant("k4")).monatsabschluss["2026-10"].verlauf).toHaveLength(1);

    const auf = { aktion: "wiederoeffnen", monat: "2026-10", grund: "Nachtrag eines vergessenen Dienstes" };
    const zwei = await Promise.all([ma("l1", auf), ma("l1", auf)]);
    expect(zwei.map((x) => x.status).sort(), zwei.map((x) => x.roh).join(" | ")).toEqual([200, 409]);
    e = (await h.mandant("k4")).monatsabschluss["2026-10"];
    expect(e.abgeschlossen).toBe(false);
    expect(e.verlauf.map((v) => v.art)).toEqual(["abschluss", "wiederoeffnung"]);
  });
});
