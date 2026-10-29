/* ==========================================================================
   KALENDER — nur die eigene Person (Commit 3)

   Bis Oktober 2026:
   F1  „einrichten" nahm die Person aus dem Rumpf.
   F2  „einrichten" mit „alt" löschte jeden Feed, dessen Geheimnis man kannte.
   F3  „daten" und „loeschen" prüften nur den Raum — ein Feed eines anderen
       Betriebs ließ sich überschreiben und abschalten; „loeschen" verriet,
       ob ein Geheimnis in einem anderen Raum existiert.
   F4  Beschäftigte konnten ihr Geheimnis nicht speichern; nach dem Neuladen
       blieb jeder alte Feed gültig, ein Widerruf war unmöglich.
   F5  Die Schichtverantwortung bekam beim Einrichten 403 beim Speichern.

   Über den echten Handler; Altfeeds werden direkt in der Ablage angelegt,
   so wie sie heute dort liegen.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const WIRT = "127.0.0.1:3000";
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
let wurzel, laden, daten, kalender, kontoSchreiben, ablageSchluessel, B, R;

let nr = 0;
const anfrage = async (handler, pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.5.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* ICS */ }
  return { status: a.status, text, ...d };
};
const einrichten = (t, rumpf = {}) => anfrage(kalender, "/kalender/einrichten", { token: t, rumpf });
const datenSenden = (t, geheim, name = "N") => anfrage(kalender, "/kalender/daten", { token: t,
  rumpf: { geheim, name, betrieb: name, termine: [{ id: "d-t1", datum: "2026-12-01", von: "06:00", endDatum: "2026-12-01", bisZeit: "14:00", ganztags: false, titel: "Früh", text: "", ort: "" }] } });
const loeschen = (t, rumpf = {}) => anfrage(kalender, "/kalender/loeschen", { token: t, rumpf });
const feed = (geheim) => anfrage(kalender, `/kalender/feed/${geheim}.ics`, { methode: "GET" });
const feedEintrag = (geheim) => laden().get(`feed:${hash(geheim)}`, { type: "json" }).catch(() => null);

async function sitzung(code, rolle, person, betrieb, mandantId) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `${rolle} ${person}`, bestand: "kal", rolle, person,
    betrieb, ...(mandantId ? { mandantId } : {}), angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, JSON.stringify(a)).toBeTruthy();
  return a.token;
}
const person = (id, rolle, einheit = "e1") => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });

const T = {};
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-kalender-rechte-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  kalender = (await import("../server/funktionen/kalender.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  R = await import("../server/lib/rechte.mjs");
  await B.bestandSchreiben(laden(), "kal", { version: 9, mandanten: [
    { id: "m-a", name: "A", einheiten: [{ id: "e1" }], personen: [person("a1", "mitarbeiter"), person("a2", "mitarbeiter"),
      person("s1", "subplaner"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE"),
      person("dup", "mitarbeiter")] },
    { id: "m-b", name: "B", einheiten: [{ id: "e1" }], personen: [person("b1", "mitarbeiter"), person("dup", "mitarbeiter")] },
  ] }, { durch: "Pruefung" });
  T.a1 = await sitzung("KAL1-AAAA-0001", "mitarbeiter", "a1", 0, "m-a");
  T.a2 = await sitzung("KAL2-AAAA-0002", "mitarbeiter", "a2", 0, "m-a");
  T.b1 = await sitzung("KAL3-BBBB-0003", "mitarbeiter", "b1", 1, "m-b");
  T.s1 = await sitzung("KAL4-SSSS-0004", "subplaner", "s1", 0, "m-a");
  T.p1 = await sitzung("KAL5-PPPP-0005", "planer", "p1", 0, "m-a");
  T.l1 = await sitzung("KAL6-LLLL-0006", "leitung", "l1", 0, "m-a");
  T.r1 = await sitzung("KAL7-RRRR-0007", "betriebsrat", "r1", 0, "m-a");
  T.dup = await sitzung("KAL8-DDDD-0008", "mitarbeiter", "dup", 0, "m-a");
  T.betr = await sitzung("KAL9-BTRB-0009", "betreiber", null, 0, null);
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("einrichten: immer die eigene Person (F1)", () => {
  it("A1 richtet ein — personId=A2 und personId=B1 im Rumpf werden ignoriert, der Feed gehört A1", async () => {
    for (const fremd of ["a2", "b1", "gibt-es-nicht"]) {
      const e = await einrichten(T.a1, { personId: fremd });
      expect(e.status).toBe(200);
      expect(await feedEintrag(e.geheim)).toMatchObject({ bestand: "kal", mandantId: "m-a", personId: "a1" });
    }
  });
  it("Planung, Leitung, Betriebsrat, Schichtverantwortung: nur der eigene Kalender", async () => {
    for (const [t, ich] of [[T.p1, "p1"], [T.l1, "l1"], [T.r1, "r1"], [T.s1, "s1"]]) {
      const e = await einrichten(t, { personId: "a1" });
      expect(e.status, ich).toBe(200);
      expect((await feedEintrag(e.geheim)).personId).toBe(ich);
    }
  });
  it("Betreiber ohne Person: abgewiesen", async () => {
    expect((await einrichten(T.betr, { personId: "a1" })).status).toBe(403);
    expect((await loeschen(T.betr)).status).toBe(403);
  });
});

describe("Rotation und Löschen", () => {
  it("aktives Geheimnis funktioniert; erneutes Einrichten ohne „alt\" macht das alte ungültig (F4)", async () => {
    const e1 = await einrichten(T.a2);
    expect((await datenSenden(T.a2, e1.geheim)).status).toBe(200);
    expect((await feed(e1.geheim)).status).toBe(200);
    const e2 = await einrichten(T.a2);
    expect((await feed(e1.geheim)).status).toBe(404);
    expect(await feedEintrag(e1.geheim)).toBeNull();
    expect((await datenSenden(T.a2, e2.geheim)).status).toBe(200);
    expect((await feed(e2.geheim)).status).toBe(200);
  });
  it("Löschen ohne Geheimnis (wie nach dem Neuladen) macht den aktiven Feed ungültig", async () => {
    const e = await einrichten(T.a2);
    await datenSenden(T.a2, e.geheim);
    expect((await loeschen(T.a2)).status).toBe(200);
    expect((await feed(e.geheim)).status).toBe(404);
  });
});

describe("fremde Geheimnisse: keine Wirkung, kein Orakel (F2, F3)", () => {
  let gA2, gB1;
  beforeAll(async () => {
    gA2 = (await einrichten(T.a2)).geheim; await datenSenden(T.a2, gA2, "A2");
    gB1 = (await einrichten(T.b1)).geheim; await datenSenden(T.b1, gB1, "B1");
  });
  it("fremdes „alt\" beim Einrichten löscht nichts", async () => {
    await einrichten(T.a1, { alt: gA2 });
    await einrichten(T.a1, { alt: gB1 });
    expect((await feed(gA2)).status).toBe(200);
    expect((await feed(gB1)).status).toBe(200);
  });
  it("fremdes Geheimnis bei daten: nichts verändert, Antwort wie unbekannt", async () => {
    const vorher = (await feed(gB1)).text;
    const fremdA = await datenSenden(T.a1, gA2, "ÜBERSCHRIEBEN");
    const fremdB = await datenSenden(T.a1, gB1, "ÜBERSCHRIEBEN");
    const unbekannt = await datenSenden(T.a1, "x".repeat(32), "ÜBERSCHRIEBEN");
    for (const a of [fremdA, fremdB]) expect({ status: a.status, fehler: a.fehler }).toEqual({ status: unbekannt.status, fehler: unbekannt.fehler });
    expect(unbekannt.status).toBe(404);
    expect((await feed(gB1)).text).toBe(vorher);
    expect((await feed(gA2)).text).not.toContain("ÜBERSCHRIEBEN");
  });
  it("fremdes Geheimnis bei loeschen: nichts verändert, Antwort wie unbekannt", async () => {
    const fremd = await loeschen(T.a1, { geheim: gB1 });
    const unbekannt = await loeschen(T.a1, { geheim: "y".repeat(32) });
    expect(fremd.text).toBe(unbekannt.text);
    expect(fremd.status).toBe(200);
    expect((await feed(gB1)).status).toBe(200);
    expect((await feed(gA2)).status).toBe(200);
  });
  it("Planung und Leitung von A schalten den Kalender von A2 nicht ab", async () => {
    await loeschen(T.p1, { geheim: gA2 });
    await loeschen(T.l1, { geheim: gA2 });
    await einrichten(T.l1, { personId: "a2", alt: gA2 });
    expect((await feed(gA2)).status).toBe(200);
  });
});

describe("Altfeeds ohne Betriebskennung", () => {
  it("eindeutig zuordenbar: beim eigenen Einrichten widerrufen", async () => {
    await laden().setJSON(`feed:${hash("altfeed-a1-geheimnis-xyz")}`, { bestand: "kal", personId: "a1", seit: "2026-01-01" });
    await laden().setJSON(`feeddaten:${hash("altfeed-a1-geheimnis-xyz")}`, { name: "A1", betrieb: "A", termine: [] });
    expect((await feed("altfeed-a1-geheimnis-xyz")).status).toBe(200);
    await einrichten(T.a1);
    expect((await feed("altfeed-a1-geheimnis-xyz")).status).toBe(404);
  });
  it("mehrdeutig (Kennung in zwei Betrieben): bleibt unangetastet", async () => {
    await laden().setJSON(`feed:${hash("altfeed-dup-geheimnis-xyz")}`, { bestand: "kal", personId: "dup", seit: "2026-01-01" });
    await laden().setJSON(`feeddaten:${hash("altfeed-dup-geheimnis-xyz")}`, { name: "Dup", betrieb: "?", termine: [] });
    await einrichten(T.dup);
    await loeschen(T.dup);
    expect((await feed("altfeed-dup-geheimnis-xyz")).status).toBe(200);
  });
  it("Altfeed eines anderen Raums: unangetastet", async () => {
    await laden().setJSON(`feed:${hash("altfeed-fremdraum-xyz")}`, { bestand: "anderer", personId: "a1", seit: "2026-01-01" });
    await laden().setJSON(`feeddaten:${hash("altfeed-fremdraum-xyz")}`, { name: "X", betrieb: "?", termine: [] });
    await loeschen(T.a1);
    expect((await feed("altfeed-fremdraum-xyz")).status).toBe(200);
  });
});

describe("der Index enthält kein Geheimnis im Klartext", () => {
  it("feedperson:… trägt nur den Hash", async () => {
    const e = await einrichten(T.a1);
    const index = await laden().get("feedperson:kal:m-a:a1", { type: "json" });
    expect(index.hash).toBe(hash(e.geheim));
    expect(JSON.stringify(index)).not.toContain(e.geheim);
  });
});

describe("Schreibweg: Kalenderzustand der eigenen Person (F4, F5)", () => {
  const bestand = () => ({ version: 9, mandanten: [{ id: "m-a", einheiten: [{ id: "e1" }],
    personen: [person("a1", "mitarbeiter"), person("s1", "subplaner"), person("l1", "leitung", "ALLE")] }] });
  const eigenesSetzen = (sitz, pid) => {
    const g = bestand();
    const gelesen = JSON.parse(JSON.stringify(R.bestandFuerRolle(g, sitz)));
    Object.assign(gelesen.mandanten[0].personen.find((p) => p.id === pid),
      { kalenderGeheim: "neu-geheim", kalenderVerweis: "https://x/neu", kalenderStand: "2026-10-19" });
    return R.zusammenfuehren(g, gelesen, sitz);
  };
  it("Beschäftigte: Geheimnis, Verweis und Stand der eigenen Person werden gespeichert", () => {
    const e = eigenesSetzen({ rolle: "mitarbeiter", person: "a1", betrieb: 0 }, "a1");
    expect(e.mandanten[0].personen.find((p) => p.id === "a1")).toMatchObject({ kalenderGeheim: "neu-geheim", kalenderStand: "2026-10-19" });
  });
  it("Schichtverantwortung: speichert ohne 403", () => {
    const e = eigenesSetzen({ rolle: "subplaner", person: "s1", betrieb: 0 }, "s1");
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten[0].personen.find((p) => p.id === "s1").kalenderGeheim).toBe("neu-geheim");
  });
  it("fremde Kalenderfelder über PUT bleiben wirkungslos (Leitung, Beschäftigte)", () => {
    for (const sitz of [{ rolle: "leitung", person: "l1", betrieb: 0 }, { rolle: "mitarbeiter", person: "a1", betrieb: 0 }]) {
      const g = bestand();
      g.mandanten[0].personen[1].kalenderGeheim = "s1-geheim";
      const gelesen = JSON.parse(JSON.stringify(R.bestandFuerRolle(g, sitz)));
      const s = gelesen.mandanten[0].personen.find((p) => p.id === "s1");
      s.kalenderGeheim = "gekapert";
      const e = R.zusammenfuehren(g, gelesen, sitz);
      expect(e.mandanten[0].personen.find((p) => p.id === "s1").kalenderGeheim, sitz.rolle).toBe("s1-geheim");
    }
  });
});
