/* ==========================================================================
   WP-07b — Stempel-Sonderfall „500 nach Speicherung“ (Wp28-Befund 7)

   Der Server hat den Stempel gespeichert, die Antwort kommt als Fehler (500, Zeitgrenze, Netz) nicht an. Der Client
   behält das Ereignis mit seiner clientEventId und sendet es wieder. In allen sechs Szenarien darf genau EIN Stempel
   entstehen:
     (1) Speicherung erfolgreich + Antwort fehlgeschlagen
     (2) Wiederholung mit gleicher clientEventId
     (3) zwei Tabs (dasselbe Ereignis aus zwei Tabs; zwei getrennte Drücke)
     (4) Offline-Sync (Puffer) nach Fehler
     (5) gleichzeitige Wiederholungen
     (6) Serverneustart dazwischen
   Die Szenarien (2) und (5) in offline-stempeln.test.js sind die Grundlage; hier kommen (1), (3), (4), (6) und die
   Verschränkung dazu. Der Fehler nach der Speicherung wird so nachgestellt, wie der Client ihn erlebt: Die Anfrage
   läuft wirklich durch (gespeichert), das Ergebnis geht verloren bzw. kommt als 500 an.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHash } from "node:crypto";
import { aufbauen } from "./wp16-folge-harness.mjs";
import * as PUF from "../src/stempelpuffer.js";

let h;
const inhaberVon = (raum, person) => createHash("sha256").update(`centric-stempel|${raum}|m1|${person}`).digest("hex").slice(0, 32);
const stempelVon = (m, pid) => Object.entries(m.einstempeln || {}).filter(([k]) => k.startsWith(`${pid}|`));

beforeAll(async () => { h = await aufbauen("wp07b", "2026-11-10T05:00:00Z"); }, 60000);
afterAll(async () => { if (h) await h.abbauen(); });

describe("(1)/(2) Antwort verloren, Wiederholung mit derselben Kennung", { timeout: 120000 }, () => {
  it("gespeichert, Antwort verworfen; die Wiederholung (auch Stunden später) liefert denselben Stempel, die Zeit des ersten Mals", async () => {
    await h.raum("s1", [h.person("a1")], { abweichungen: { "a1|2026-11-10": "F" } });
    const t = await h.token("s1", "a1");
    const ev = { art: "start", clientEventId: "11111111-0000-4000-8000-000000000001", erfasstAm: "2026-11-10T05:00:00.000Z" };
    const verloren = await h.anfrage("stempeln", { token: t, rumpf: ev });
    expect(verloren.status).toBe(200);                                          // Server hat gespeichert
    h.zeitAuf("2026-11-10T07:30:00Z");
    const nochmal = await h.anfrage("stempeln", { token: await h.token("s1", "a1"), rumpf: { ...ev, gesendetAm: "2026-11-10T07:30:00.000Z" } });
    expect([nochmal.status, nochmal.wiederholt]).toEqual([200, true]);
    expect(nochmal.zeit).toBe(verloren.zeit);
    const m = await h.mandant("s1");
    expect(stempelVon(m, "a1")).toHaveLength(1);
    expect(m.einstempeln["a1|2026-11-10"].start).toBe("06:00");
    expect(m.einstempeln["a1|2026-11-10"].ereignisStart).toBe(ev.clientEventId);
  });
  it("auch das Ende: nach verlorener Antwort keine zweite Ist-Zeit und kein 409", async () => {
    h.zeitAuf("2026-11-10T13:00:00Z");
    const t = await h.token("s1", "a1");
    const ev = { art: "ende", clientEventId: "11111111-0000-4000-8000-000000000002", erfasstAm: "2026-11-10T13:00:00.000Z" };
    const erst = await h.anfrage("stempeln", { token: t, rumpf: ev });
    expect(erst.status, erst.roh).toBe(200);
    h.zeitAuf("2026-11-10T13:10:00Z");
    const nochmal = await h.anfrage("stempeln", { token: await h.token("s1", "a1"), rumpf: { ...ev, gesendetAm: "2026-11-10T13:10:00.000Z" } });
    expect([nochmal.status, nochmal.wiederholt]).toEqual([200, true]);
    expect(nochmal.erfassung).toEqual(erst.erfassung);
    const m = await h.mandant("s1");
    expect(m.einstempeln["a1|2026-11-10"].ende).toBe("14:00");
    expect(m.erfassung["a1|2026-11-10"].ende).toBe("14:00");
  });
});

describe("(3) zwei Tabs", { timeout: 120000 }, () => {
  it("dasselbe gepufferte Ereignis aus zwei Tabs gleichzeitig ⇒ ein Stempel", async () => {
    h.zeitAuf("2026-11-11T05:00:00Z");
    await h.raum("s3a", [h.person("a1")], { abweichungen: { "a1|2026-11-11": "F" } });
    const ev = { art: "start", clientEventId: "11111111-0000-4000-8000-000000000003", erfasstAm: "2026-11-11T05:00:00.000Z" };
    const [t1, t2] = [await h.token("s3a", "a1"), await h.token("s3a", "a1")];
    const erg = await Promise.all([h.anfrage("stempeln", { token: t1, rumpf: ev }), h.anfrage("stempeln", { token: t2, rumpf: ev })]);
    expect(erg.map((x) => x.status)).toEqual([200, 200]);
    expect(erg.filter((x) => !x.wiederholt)).toHaveLength(1);
    expect(stempelVon(await h.mandant("s3a"), "a1")).toHaveLength(1);
  });
  it("zwei getrennte Drücke (zwei Kennungen) gleichzeitig ⇒ ein Stempel, der zweite wird als „schon eingestempelt“ abgewiesen, nie verdoppelt", async () => {
    await h.raum("s3b", [h.person("a1")], { abweichungen: { "a1|2026-11-11": "F" } });
    const [t1, t2] = [await h.token("s3b", "a1"), await h.token("s3b", "a1")];
    const erg = await Promise.all([
      h.anfrage("stempeln", { token: t1, rumpf: { art: "start", clientEventId: "11111111-0000-4000-8000-0000000000a1" } }),
      h.anfrage("stempeln", { token: t2, rumpf: { art: "start", clientEventId: "11111111-0000-4000-8000-0000000000a2" } })]);
    expect(erg.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(erg.find((x) => x.status === 409).code).toBe("STEMPEL_SCHON_EINGESTEMPELT");
    expect(stempelVon(await h.mandant("s3b"), "a1")).toHaveLength(1);
  });
});

describe("(4) Offline-Sync nach Fehler", { timeout: 120000 }, () => {
  it("500 NACH der Speicherung: das Ereignis bleibt im Puffer; der nächste Lauf sendet dieselbe Kennung, die Quittung ist „wiederholt“, ein Stempel", async () => {
    h.zeitAuf("2026-11-12T05:00:00Z");
    await h.raum("s4", [h.person("a1")], { abweichungen: { "a1|2026-11-12": "F" } });
    const inhaber = inhaberVon("s4", "a1");
    const sp = PUF.speicherFluechtig();
    const ev = await PUF.erfassen(sp, { art: "start", inhaber, jetzt: new Date("2026-11-12T05:00:00Z") });
    const gesendet = [];
    let ersterLauf = true;
    const senden = async (e) => {
      gesendet.push(e.id);
      const r = await h.anfrage("stempeln", { token: await h.token("s4", "a1"), rumpf: PUF.rumpfFuer(e) });
      if (ersterLauf) { ersterLauf = false; return { status: 500, daten: { fehler: "Interner Fehler" } }; }   // Antwort geht als 500 verloren
      return { status: r.status, daten: r };
    };
    const lauf1 = await PUF.abarbeiten(sp, inhaber, senden, { jetzt: () => Date.parse("2026-11-12T05:00:05Z"), zufall: () => 0 });
    expect(lauf1.angehalten).toBe("voruebergehend");
    expect((await PUF.ereignisseVon(sp, inhaber))[0].zustand).toBe("wartet");           // nicht verworfen, nicht doppelt
    h.zeitAuf("2026-11-12T05:10:00Z");
    const lauf2 = await PUF.abarbeiten(sp, inhaber, senden, { jetzt: () => Date.parse("2026-11-12T05:10:00Z"), zufall: () => 0 });
    expect(lauf2.ergebnisse[ev.id].art).toBe("ok");
    expect(lauf2.ergebnisse[ev.id].daten.wiederholt).toBe(true);
    expect(gesendet).toEqual([ev.id, ev.id]);
    const nach = (await PUF.ereignisseVon(sp, inhaber))[0];
    expect([nach.zustand, nach.quittung.wiederholt]).toEqual(["bestaetigt", true]);
    const m = await h.mandant("s4");
    expect(stempelVon(m, "a1")).toHaveLength(1);
    expect(m.einstempeln["a1|2026-11-12"].start).toBe("06:00");                        // die Zeit des ersten Mals, nicht 06:10
  });
  it("Beginn und Ende hintereinander, 500 nach der Speicherung des Beginns: die Reihe hält an, danach Beginn (wiederholt) und Ende in Folge", async () => {
    h.zeitAuf("2026-11-13T05:00:00Z");
    await h.raum("s4b", [h.person("a1")], { abweichungen: { "a1|2026-11-13": "F" } });
    const inhaber = inhaberVon("s4b", "a1");
    const sp = PUF.speicherFluechtig();
    const b = await PUF.erfassen(sp, { art: "start", inhaber, jetzt: new Date("2026-11-13T05:00:00Z") });
    const e = await PUF.erfassen(sp, { art: "ende", inhaber, jetzt: new Date("2026-11-13T13:00:00Z") });
    let aus = true;
    const senden = async (ev) => {
      const r = await h.anfrage("stempeln", { token: await h.token("s4b", "a1"), rumpf: PUF.rumpfFuer(ev) });
      if (aus) { aus = false; return { status: 500, daten: null }; }
      return { status: r.status, daten: r };
    };
    h.zeitAuf("2026-11-13T13:00:30Z");
    const l1 = await PUF.abarbeiten(sp, inhaber, senden, { jetzt: () => Date.parse("2026-11-13T13:00:30Z"), zufall: () => 0 });
    expect(l1.ergebnisse[e.id].art).toBe("wartet");                                    // das Ende überholt den Beginn nicht
    const l2 = await PUF.abarbeiten(sp, inhaber, senden, { jetzt: () => Date.parse("2026-11-13T13:10:00Z"), zufall: () => 0 });
    expect([l2.ergebnisse[b.id].art, l2.ergebnisse[e.id].art]).toEqual(["ok", "ok"]);
    expect(l2.ergebnisse[b.id].daten.wiederholt).toBe(true);
    expect(l2.ergebnisse[e.id].daten.wiederholt).toBeFalsy();
    const m = await h.mandant("s4b");
    expect(stempelVon(m, "a1")).toHaveLength(1);
    expect(m.einstempeln["a1|2026-11-13"]).toMatchObject({ start: "06:00", ende: "14:00" });
  });
});

describe("(5) gleichzeitige Wiederholungen", { timeout: 120000 }, () => {
  it("sechs Sendungen derselben Kennung gleichzeitig (Ungeduld, Wiederholung, zweiter Reiter) ⇒ eine Speicherung, fünfmal „wiederholt“", async () => {
    h.zeitAuf("2026-11-14T05:00:00Z");
    await h.raum("s5", [h.person("a1")], { abweichungen: { "a1|2026-11-14": "F" } });
    const ev = { art: "start", clientEventId: "11111111-0000-4000-8000-000000000005", erfasstAm: "2026-11-14T05:00:00.000Z" };
    const ts = [];
    for (let i = 0; i < 3; i++) ts.push(await h.token("s5", "a1"));
    const erg = await Promise.all(Array.from({ length: 6 }, (_, i) => h.anfrage("stempeln", { token: ts[i % 3], rumpf: ev })));
    expect(erg.map((x) => x.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(erg.filter((x) => !x.wiederholt)).toHaveLength(1);
    expect(stempelVon(await h.mandant("s5"), "a1")).toHaveLength(1);
  });
});

describe("(6) Serverneustart dazwischen", { timeout: 120000 }, () => {
  it("neu geladenes Modul (leere Sperren, Zähler, Zwischenspeicher): dieselbe Kennung wird aus dem gespeicherten Stempel erkannt", async () => {
    h.zeitAuf("2026-11-15T05:00:00Z");
    await h.raum("s6", [h.person("a1")], { abweichungen: { "a1|2026-11-15": "F" } });
    const ev = { art: "start", clientEventId: "11111111-0000-4000-8000-000000000006", erfasstAm: "2026-11-15T05:00:00.000Z" };
    const erst = await h.anfrage("stempeln", { token: await h.token("s6", "a1"), rumpf: ev });
    expect(erst.status).toBe(200);
    vi.resetModules();                                                                 // „Prozess neu gestartet“
    const daten2 = (await import("../server/funktionen/daten.mjs")).default;
    const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
    const t2 = (await sitzungAnlegen({ bestand: "s6", name: "a1", rolle: "mitarbeiter", person: "a1", betrieb: 0, mandantId: "m1", einheit: null }, 24 * 3600 * 1000)).token;
    h.zeitAuf("2026-11-15T05:03:00Z");
    const a = await daten2(new Request("http://127.0.0.1:3000/api/stempeln", { method: "POST",
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json", authorization: `Bearer ${t2}`,
        "x-forwarded-for": "10.99.1.1" }, body: JSON.stringify({ ...ev, gesendetAm: "2026-11-15T05:03:00.000Z" }) }), {});
    const d = await a.json();
    expect([a.status, d.wiederholt, d.zeit]).toEqual([200, true, erst.zeit]);
    expect(stempelVon(await h.mandant("s6"), "a1")).toHaveLength(1);
  });
});

describe("Rechte und Spur", { timeout: 120000 }, () => {
  it("die Wiederholung nennt nichts über einen fremden Stempel: dieselbe Kennung bei einer anderen Person ist deren eigener Stempel; kein Token ⇒ 401", async () => {
    h.zeitAuf("2026-11-16T05:00:00Z");
    await h.raum("s7", [h.person("a1"), h.person("a2")], { abweichungen: { "a1|2026-11-16": "F", "a2|2026-11-16": "F" } });
    const ev = { art: "start", clientEventId: "11111111-0000-4000-8000-000000000007", erfasstAm: "2026-11-16T05:00:00.000Z" };
    const a = await h.anfrage("stempeln", { token: await h.token("s7", "a1"), rumpf: ev });
    const b = await h.anfrage("stempeln", { token: await h.token("s7", "a2"), rumpf: ev });
    expect([a.status, b.status, b.wiederholt]).toEqual([200, 200, undefined]);
    const m = await h.mandant("s7");
    expect(stempelVon(m, "a1")).toHaveLength(1);
    expect(stempelVon(m, "a2")).toHaveLength(1);
    expect((await h.anfrage("stempeln", { rumpf: ev })).status).toBe(401);
  });
});
