/* Gemeinsamer Aufbau der Prüfungen WP-16b/14c/07b/16c gegen die Serverfunktion (Dateiablage in einem Wegwerfordner,
   Datum eingefroren, Sitzungen je Person). Kein Prüffile: wird nur importiert. */
import { vi, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const WIRT = "127.0.0.1:3000";
export const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 };
export const N = { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 };

export async function aufbauen(vorsilbe, startIso) {
  const h = { wurzel: await mkdtemp(path.join(tmpdir(), `centric-${vorsilbe}-`)), nr: 0 };
  process.env.CENTRIC_DATEN = h.wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  h.laden = () => getStore({ name: "centric", consistency: "strong" });
  h.spurStore = () => getStore({ name: "centric-spur" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  h.daten = (await import("../server/funktionen/daten.mjs")).default;
  h.B = await import("../server/lib/bestand.mjs");
  const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(startIso));
  h.zeitAuf = (iso) => vi.setSystemTime(new Date(iso));
  h.anfrage = async (pfad, { methode = "POST", rumpf, token, ip } = {}) => {
    h.nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": ip || `10.19.${Math.floor(h.nr / 250) % 250}.${h.nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await h.daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    const text = await a.text();
    let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
    return { status: a.status, roh: text, ...d };
  };
  h.token = async (raum, id, rolle = "mitarbeiter") => (await sitzungAnlegen({ bestand: raum, name: id, rolle, person: id,
    betrieb: 0, mandantId: "m1", einheit: null }, 24 * 3600 * 1000)).token;
  h.person = (id, rolle = "mitarbeiter", extra = {}) => ({ id, vorname: "V", nachname: id, rolle, bereich: "e1", status: "aktiv",
    geburtstag: "1985-01-01", wochenstunden: 39, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
  h.raum = async (name, personen, extra = {}) => h.B.bestandSchreiben(h.laden(), name, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB" }], dienstarten: [F, N], personen, abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {},
    anfragen: [], nachrichten: [], monatsabschluss: {}, ...extra }] }, { durch: "Pruefung" });
  h.mandant = async (raum) => (await h.B.bestandLesen(h.laden(), raum)).bestand.mandanten[0];
  h.spur = async (tag) => {
    const sp = h.spurStore(); const out = [];
    const { blobs } = await sp.list({ prefix: `${tag}/` });
    for (const b of blobs) out.push(await sp.get(b.key, { type: "json" }));
    return out;
  };
  h.abbauen = async () => { vi.useRealTimers(); if (h.wurzel) await rm(h.wurzel, { recursive: true, force: true }); };
  return h;
}
export { expect };
