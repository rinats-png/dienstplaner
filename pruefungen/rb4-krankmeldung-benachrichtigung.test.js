/* ==========================================================================
   RB-4 — BENACHRICHTIGUNG BEI EINGANG EINER KRANKMELDUNG

   Betreiberentscheidung 2026-11-11: „Bei Eingang einer Krankmeldung sollen
   zuständige Planer und Betriebsleiter benachrichtigt werden. Die zuständige
   Schichtverantwortung kann eine sachlich erforderliche Benachrichtigung
   erhalten. Push und E-Mail enthalten keine Gesundheitsdetails.“

   Über die echten Handler (POST /api/krankmeldung, PUT /api/bestand) mit
   synthetischen Daten. E-Mail und Push sind ersetzt (zählen, Texte lesen);
   für „Anbieter aus“ laufen die echten Adapter ohne Schlüssel.
   A  Empfänger je Rolle und Zuständigkeit (Planung, Leitung ja; Beschäftigte,
      Betriebsrat, Betreiber, Kundenrolle, anderer Betrieb nein; meldende und
      gemeldete Person nie; Schichtverantwortung nur mit Dienst im Bereich ab heute).
   B  Inhalt: keine Anmerkung, kein Grund, kein „krank“, kein Name, kein Tag —
      weder in der gespeicherten Mitteilung noch in E-Mail oder Push.
   C  Fälschung: eine solche Mitteilung legt kein Client an (PUT verwirft sie).
   D  Keine Doppelung: Wiederholung, gleichzeitige Meldung, erneutes PUT.
   E  Zustellwege: Wünsche je Person und Art, Sammelschalter; Anbieter aus → nichts geht hinaus.
   F  Protokoll: Zahl der Empfänger, ohne Person, Tag, Anmerkung.
   G  Drift: Server- und Oberflächenliste, neutraler Titel je Art.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const post = vi.hoisted(() => ({ mails: [], pushes: [], echt: false }));
vi.mock("../server/lib/post.mjs", async (original) => {
  const o = await original();
  return { ...o, sendeMail: async (an, betreff, text, opt) => {
    if (post.echt) return o.sendeMail(an, betreff, text, opt);
    post.mails.push({ an, betreff, text });
    return { ok: true };
  } };
});
vi.mock("../server/lib/webpush.mjs", async (original) => {
  const o = await original();
  return { ...o, sendePush: async (anmeldung, titel, text, ziel, opt) => {
    if (post.echt) return o.sendePush(anmeldung, titel, text, ziel, opt);
    post.pushes.push({ endpoint: anmeldung && anmeldung.endpoint, titel, text, ziel });
    return { ok: true };
  } };
});

import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";
import { krankEmpfaenger, krankmeldungMitteilungen, KRANK_ART } from "../server/lib/krankmeldung.mjs";
import { ZUSTELLARTEN, nurVomServer } from "../server/lib/mitteilungen.mjs";
import { HINWEIS_TITEL, hinweis } from "../server/lib/zustellregeln.mjs";
import { ZUSTELLARTEN as ZUSTELLARTEN_OBERFLAECHE } from "../src/lib/zustellung.js";

const HEUTE = heuteBerlin();
const T = (n) => tagePlus(HEUTE, n);
const WIRT = "127.0.0.1:3000", R = "rb4-raum";

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `Vorname${id}`, nachname: `Nachname${id}`, rolle, bereich: einheit,
  status: "aktiv", email: `${id}@beispiel.invalid`, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const betrieb = () => ({ id: "m1", name: "Haus Linde", einheiten: [{ id: "e1", name: "WB1" }, { id: "e2", name: "WB2" }, { id: "pool", pool: true }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("a1", "mitarbeiter", "e1"), person("a2", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
    person("s1", "subplaner", "e1"), person("s4", "subplaner", "e1"), person("s2", "subplaner", "e2"),
    person("sx", "subplaner", "e1", { status: "gesperrt" }),
    person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE", { zustellung: { kanal: { push: false } } }),
    person("p9", "planer", "ALLE", { austritt: T(-30) }),
    person("r1", "betriebsrat", "ALLE"), person("k1", "kunde", "ALLE"),
    /* Review #205: gelten heute nicht im Betrieb — nie Empfänger. */
    ...NICHT_AKTIV.map(([id, rolle, einheit, extra]) => person(id, rolle, einheit, extra))],
  abweichungen: { [`a1|${T(2)}`]: "F", [`a1|${T(3)}`]: "F", [`b1|${T(2)}`]: "F", [`a2|${T(-3)}`]: "F" },
  abwesenheiten: [], krankmeldungen: [], anfragen: [], nachrichten: [], erfassung: {}, einstempeln: {}, einstellungen: {} });
const zweiter = () => ({ id: "m2", name: "Haus Eiche", einheiten: [{ id: "e1", name: "WB1" }],
  personen: [person("q1", "planer", "ALLE"), person("q2", "leitung", "ALLE"), person("q3", "subplaner", "e1")],
  abweichungen: {}, abwesenheiten: [], krankmeldungen: [], anfragen: [], nachrichten: [], erfassung: {}, einstempeln: {}, einstellungen: {} });
const kopie = (x) => JSON.parse(JSON.stringify(x));
const NICHT_AKTIV = [["pi", "planer", "ALLE", { status: "inaktiv" }], ["ld", "leitung", "ALLE", { status: "deaktiviert" }],
  ["pa", "planer", "ALLE", { anonym: true }], ["le", "leitung", "ALLE", { eintritt: T(10) }], ["pn", "planer", "ALLE", { eintritt: null }],
  ["si", "subplaner", "e1", { status: "inaktiv" }], ["sd", "subplaner", "e1", { status: "deaktiviert" }],
  ["sa", "subplaner", "e1", { anonym: true }], ["se", "subplaner", "e1", { eintritt: T(10) }]];

/* Anmerkungen und Gründe, die nie in einer Benachrichtigung auftauchen dürfen. */
const GEHEIM = ["Diagnose J11.1 Grippe", "Migräne seit gestern", "Bandscheibenvorfall L4/L5", "psychische Belastung", "AU bis Freitag"];

let wurzel, laden, daten, sitzungAnlegen, B, V, nr = 0;
const anfrage = async (pfad, { methode = "GET", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.74.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const tok = async (pid, rolle, mandantId = "m1", betriebNr = 0) => (await sitzungAnlegen({ bestand: R, name: pid, rolle, person: pid,
  betrieb: betriebNr, mandantId, einheit: null }, 60 * 60 * 1000)).token;
const km = async (pid, rolle, rumpf) => anfrage("/api/krankmeldung", { methode: "POST", token: await tok(pid, rolle), rumpf });
const gespeichert = async (id = "m1") => (await B.bestandLesen(laden(), R)).bestand.mandanten.find((x) => x.id === id);
const zuruecksetzen = async () => {
  post.mails.length = 0; post.pushes.length = 0; post.echt = false;
  await B.bestandSchreiben(laden(), R, { version: 9, stand: 1, mandanten: [betrieb(), zweiter()] }, { durch: "Pruefung" });
};
const krankNachrichten = (m) => (m.nachrichten || []).filter((n) => n && n.art === KRANK_ART);
const empfaengerVon = (m, fallId) => krankNachrichten(m).filter((n) => n.quelle && n.quelle.id === fallId).map((n) => n.personId).sort();
/** PUT wie die Oberfläche: lesen, ändern, zurückschreiben. */
async function schreibe(pid, rolle, aendern) {
  const t = await tok(pid, rolle);
  const g = await anfrage("/api/bestand", { token: t });
  const b = kopie(g.bestand);
  aendern(b.mandanten.find((x) => x.id === "m1"));
  return anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
}
const spurZeilen = async () => {
  const { getStore } = await import("../server/lib/ablage.mjs");
  const spur = getStore({ name: "centric-spur" });
  const aus = [];
  for (const b of (await spur.list({})).blobs) aus.push(await spur.get(b.key, { type: "json" }));
  return aus.filter((z) => z && typeof z.zusatz === "string" && z.zusatz.includes("Benachrichtigung"));
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-rb4-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  /* Kein Anbieter: so bleibt es auch im Test „Anbieter aus“. */
  for (const k of ["RESEND_API_KEY", "VAPID_PUBLIC", "VAPID_PRIVATE", "CENTRIC_MAIL_WEG", "CENTRIC_SMTP_HOST"]) delete process.env[k];
  process.env.CENTRIC_ZUSTELL_BACKOFF = "0,0";
  process.env.CENTRIC_ZUSTELL_PERSON_MAIL = "1000";
  process.env.CENTRIC_ZUSTELL_PERSON_PUSH = "1000";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of ["schreiben", "lesen"]) if (schutz.GRENZEN[art]) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/versand.mjs");
  /* Push-Anmeldungen für alle möglichen Empfänger (auch die, die nichts bekommen dürfen). */
  for (const pid of ["a1", "a2", "b1", "s1", "s4", "s2", "sx", "p1", "l1", "p9", "r1", "k1", ...NICHT_AKTIV.map((x) => x[0])])
    await laden().setJSON(V.pushSchluessel(R, "m1", pid), { endpoint: `https://push.beispiel.invalid/${pid}`, keys: { p256dh: "k", auth: "a" } });
}, 60000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
beforeEach(zuruecksetzen);

/* ============================ A  Empfänger ============================ */
describe("A  Empfänger je Rolle und Zuständigkeit (POST /api/krankmeldung)", () => {
  it("Beschäftigte meldet, Dienst im Bereich: Planung, Leitung und die Schichtverantwortung des Bereichs — sonst niemand", async () => {
    const r = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(3), notiz: GEHEIM[0] });
    expect(r.status, JSON.stringify(r)).toBe(200);
    const m = await gespeichert();
    expect(empfaengerVon(m, r.fall.id)).toEqual(["l1", "p1", "s1", "s4"]);
    /* nie: gemeldete Person, andere Beschäftigte, SV anderer Bereich, gesperrte SV, ausgetretene Planung, Betriebsrat, Kundenrolle */
    for (const nie of ["a1", "a2", "b1", "s2", "sx", "p9", "r1", "k1"]) expect(empfaengerVon(m, r.fall.id), nie).not.toContain(nie);
    /* anderer Betrieb: nichts */
    expect(krankNachrichten(await gespeichert("m2"))).toEqual([]);
  });
  it("Review #205: inaktive, deaktivierte, anonymisierte und noch nicht eingetretene Planung, Leitung, SV: nie Empfänger", async () => {
    const r = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(3) });
    expect(r.status).toBe(200);
    const an = empfaengerVon(await gespeichert(), r.fall.id);
    for (const [id] of NICHT_AKTIV) expect(an, id).not.toContain(id);
    expect(an).toEqual(["l1", "p1", "s1", "s4"]);
    for (const [id] of NICHT_AKTIV) {
      expect(post.mails.map((x) => x.an), id).not.toContain(`${id}@beispiel.invalid`);
      expect(post.pushes.map((x) => x.endpoint), id).not.toContain(`https://push.beispiel.invalid/${id}`);
    }
  });
  it("ohne Dienst im Zeitraum: nur Planung und Leitung (die Schichtverantwortung braucht es sachlich nicht)", async () => {
    const r = await km("a2", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(4) });
    expect(empfaengerVon(await gespeichert(), r.fall.id)).toEqual(["l1", "p1"]);
  });
  it("rein rückwirkender Zeitraum (Dienst lag in der Vergangenheit): keine Schichtverantwortung", async () => {
    const r = await km("a2", "mitarbeiter", { aktion: "melden", von: T(-3), bis: T(-2) });
    expect(r.status).toBe(200);
    expect(empfaengerVon(await gespeichert(), r.fall.id)).toEqual(["l1", "p1"]);
  });
  it("Dienst in Bereich e2: die Schichtverantwortung von e2, nicht die von e1", async () => {
    const r = await km("b1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) });
    expect(empfaengerVon(await gespeichert(), r.fall.id)).toEqual(["l1", "p1", "s2"]);
  });
  it("die meldende Person bekommt keine Mitteilung: Schichtverantwortung meldet für a1, Planung meldet für a1", async () => {
    const r1 = await km("s1", "subplaner", { aktion: "melden", personId: "a1", von: T(2), bis: T(2) });
    expect(r1.status, JSON.stringify(r1)).toBe(200);
    expect(empfaengerVon(await gespeichert(), r1.fall.id)).toEqual(["l1", "p1", "s4"]);
    const r2 = await km("p1", "planer", { aktion: "melden", personId: "a1", von: T(3), bis: T(3) });
    expect(r2.status, JSON.stringify(r2)).toBe(200);
    expect(empfaengerVon(await gespeichert(), r2.fall.id)).toEqual(["l1", "s1", "s4"]);
  });
  it("Planung meldet sich selbst krank: die Leitung, nicht sie selbst", async () => {
    const r = await km("p1", "planer", { aktion: "melden", von: T(2), bis: T(2) });
    expect(empfaengerVon(await gespeichert(), r.fall.id)).toEqual(["l1"]);
  });
  it("Betriebsrat und Betreiber melden nicht — es entsteht keine Mitteilung", async () => {
    expect((await km("r1", "betriebsrat", { aktion: "melden", von: T(2), bis: T(2) })).status).toBe(403);
    const t = (await sitzungAnlegen({ bestand: R, name: "bt", rolle: "betreiber", person: null, betrieb: 0 }, 60 * 60 * 1000)).token;
    expect([400, 401, 403]).toContain((await anfrage("/api/krankmeldung", { methode: "POST", token: t, rumpf: { aktion: "melden", von: T(2), bis: T(2) } })).status);
    expect(krankNachrichten(await gespeichert())).toEqual([]);
    expect(post.mails).toEqual([]);
    expect(post.pushes).toEqual([]);
  });
  it("die anderen Schritte (vorläufig, endgültig, ablehnen, zurückziehen) lösen keine weitere Mitteilung aus", async () => {
    const id = (await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) })).fall.id;
    const vorher = krankNachrichten(await gespeichert()).length;
    expect((await km("s1", "subplaner", { aktion: "vorlaeufig", id })).status).toBe(200);
    expect((await km("p1", "planer", { aktion: "endgueltig", id })).status).toBe(200);
    expect(krankNachrichten(await gespeichert()).length).toBe(vorher);
  });
  it("PUT (ältere Oberfläche): Beschäftigte trägt eigene Krankheit ein → Fall und dieselben Empfänger", async () => {
    const r = await schreibe("a1", "mitarbeiter", (m) => {
      m.abwesenheiten = [...(m.abwesenheiten || []), { id: "abw-put-1", personId: "a1", art: "krank", von: T(2), bis: T(3), notiz: GEHEIM[1] }];
    });
    expect(r.status, JSON.stringify(r)).toBe(200);
    const m = await gespeichert();
    expect(m.krankmeldungen.map((f) => f.id)).toEqual(["km-abw-put-1"]);
    expect(empfaengerVon(m, "km-abw-put-1")).toEqual(["l1", "p1", "s1", "s4"]);
  });
  it("PUT (ältere Oberfläche): Schichtverantwortung trägt für a1 ein → Planung, Leitung, die andere SV, nicht sie selbst", async () => {
    const r = await schreibe("s1", "subplaner", (m) => {
      m.abwesenheiten = [...(m.abwesenheiten || []), { id: "abw-put-2", personId: "a1", art: "krank", von: T(2), bis: T(2), notiz: GEHEIM[2] }];
    });
    expect(r.status, JSON.stringify(r)).toBe(200);
    expect(empfaengerVon(await gespeichert(), "km-abw-put-2")).toEqual(["l1", "p1", "s4"]);
  });
  it("Kern: krankEmpfaenger ohne Person oder mit ungültigem Fall liefert niemanden", () => {
    expect(krankEmpfaenger(betrieb(), { id: "km-x", personId: "gibtsnicht", von: T(1), bis: T(1) })).toEqual({ planung: [], sv: [] });
    expect(krankmeldungMitteilungen(betrieb(), betrieb(), null)).toEqual(betrieb());
  });
});

/* ======================= B  keine Gesundheitsangaben ======================= */
describe("B  Inhalt ohne Gesundheitsangaben (Mitteilung, E-Mail, Push)", () => {
  const verboten = (personName) => [...GEHEIM, /krank/i, /diagnose/i, /arbeitsunf/i, /\bAU\b/, personName,
    T(2), T(3), `${T(2).slice(8, 10)}.${T(2).slice(5, 7)}`, `${T(3).slice(8, 10)}.${T(3).slice(5, 7)}`];
  const pruefe = (text, wo, personName) => {
    for (const v of verboten(personName)) {
      if (v instanceof RegExp) expect(text, `${wo}: ${v}`).not.toMatch(v);
      else expect(text.includes(v), `${wo}: ${v}`).toBe(false);
    }
  };
  for (const [i, notiz] of GEHEIM.entries()) {
    it(`Anmerkung ${i + 1}: weder in Titel/Text der Mitteilung noch in E-Mail oder Push`, async () => {
      const r = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(3), notiz, grund: notiz, diagnose: notiz });
      expect(r.status).toBe(200);
      const m = await gespeichert();
      const ns = krankNachrichten(m);
      expect(ns.length).toBe(4);
      for (const n of ns) {
        expect(n.titel).toBe("Neue Meldung zur Abwesenheit");
        expect(n.text).toBe("Bitte in CENTRIC prüfen.");
        pruefe(`${n.titel} ${n.text} ${n.ziel}`, `Mitteilung an ${n.personId}`, "Vornamea1");
        /* Der gespeicherte Datensatz trägt keine Anmerkung, keinen Tag, keine gemeldete Person. */
        const roh = JSON.stringify(n);
        for (const g of GEHEIM) expect(roh.includes(g), g).toBe(false);
        expect(roh).not.toMatch(/"a1"|Vornamea1|Nachnamea1/);
        expect(n.tag).toBeUndefined();
        expect(Object.keys(n.quelle).sort()).toEqual(["art", "id"]);
      }
      expect(post.mails.length).toBeGreaterThan(0);
      expect(post.pushes.length).toBeGreaterThan(0);
      for (const x of post.mails) { pruefe(x.betreff, "Betreff", "Vornamea1"); pruefe(x.text, "Mailtext", "Vornamea1"); pruefe(x.betreff, "Betreff", "Nachnamea1"); }
      for (const x of post.pushes) { pruefe(`${x.titel} ${x.text} ${x.ziel}`, "Push", "Vornamea1"); pruefe(`${x.titel} ${x.text}`, "Push", "Nachnamea1"); }
      expect(post.mails[0].betreff).toBe("Neue Meldung zur Abwesenheit — Haus Linde");
      expect(post.pushes[0]).toMatchObject({ titel: "Neue Meldung zur Abwesenheit", text: "Bitte in CENTRIC öffnen.", ziel: "lage" });
    });
  }
  it("PUT-Weg: auch dort keine Anmerkung in Mitteilung, E-Mail, Push", async () => {
    await schreibe("a1", "mitarbeiter", (m) => {
      m.abwesenheiten = [...(m.abwesenheiten || []), { id: "abw-b", personId: "a1", art: "krank", von: T(2), bis: T(2), notiz: GEHEIM[3] }];
    });
    const alles = JSON.stringify([krankNachrichten(await gespeichert()), post.mails, post.pushes]);
    expect(krankNachrichten(await gespeichert()).length).toBe(4);
    for (const g of GEHEIM) expect(alles.includes(g), g).toBe(false);
    expect(JSON.stringify([post.mails, post.pushes])).not.toMatch(/krank|Vornamea1|Nachnamea1/i);
  });
});

/* ============================ C  Fälschung ============================ */
describe("C  Keine Fälschung durch einen Client", () => {
  const falsch = (an, extra = {}) => ({ id: `n-gefaelscht-${an}`, personId: an, art: "krankmeldungEingegangen", titel: "Neue Meldung zur Abwesenheit",
    text: "Bitte in CENTRIC prüfen.", ziel: "lage", zeit: "x", erstellt: new Date().toISOString(), gelesen: false, dringend: false, ...extra });
  for (const [pid, rolle] of [["s1", "subplaner"], ["p1", "planer"], ["l1", "leitung"], ["a1", "mitarbeiter"]]) {
    it(`${rolle}: eine selbst angelegte Mitteilung dieser Art (auch mit quelle oder n-krank-Kennung) wird verworfen`, async () => {
      const r = await schreibe(pid, rolle, (m) => {
        m.nachrichten = [falsch("s4"), falsch("a2", { id: "n-krank-km-erfunden-a2" }),
          falsch("b1", { art: "planGeaendert", id: "n-krank-x-b1", quelle: { art: "krankmeldung", id: "km-erfunden" } }), ...(m.nachrichten || [])];
      });
      expect(r.status, JSON.stringify(r).slice(0, 300)).toBe(200);
      const m = await gespeichert();
      expect(m.nachrichten.filter((n) => /gefaelscht|erfunden|n-krank-x/.test(String(n.id)))).toEqual([]);
      expect(krankNachrichten(m)).toEqual([]);
      expect(post.mails).toEqual([]);
      expect(post.pushes).toEqual([]);
    });
  }
  it("nurVomServer erkennt Art, Kennung und Quelle", () => {
    expect(nurVomServer({ id: "n-1", art: "krankmeldungEingegangen" })).toBe(true);
    expect(nurVomServer({ id: "n-krank-a-b", art: "planGeaendert" })).toBe(true);
    expect(nurVomServer({ id: "n-1", art: "planGeaendert", quelle: { art: "krankmeldung", id: "x" } })).toBe(true);
    expect(nurVomServer({ id: "n-1", art: "planGeaendert" })).toBe(false);
  });
  it("eine bestehende Mitteilung des Servers ändert der Empfänger nur als gelesen", async () => {
    const r = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) });
    await schreibe("p1", "planer", (m) => {
      m.nachrichten = m.nachrichten.map((n) => (n.art === KRANK_ART ? { ...n, gelesen: true, titel: "geändert", text: GEHEIM[0], personId: "a2" } : n));
    });
    const ns = krankNachrichten(await gespeichert());
    expect(empfaengerVon(await gespeichert(), r.fall.id)).toEqual(["l1", "p1", "s1", "s4"]);
    for (const n of ns) expect([n.titel, n.text]).toEqual(["Neue Meldung zur Abwesenheit", "Bitte in CENTRIC prüfen."]);
  });
});

/* =========================== D  keine Doppelung =========================== */
describe("D  Keine doppelte Benachrichtigung", () => {
  it("Wiederholung mit clientEventId: derselbe Fall, keine zweite Mitteilung, keine zweite Zustellung", async () => {
    const a = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2), clientEventId: "ev-1" });
    const mails = post.mails.length, pushes = post.pushes.length;
    const b = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2), clientEventId: "ev-1" });
    expect(b.wiederholt).toBe(true);
    expect(b.fall.id).toBe(a.fall.id);
    expect(krankNachrichten(await gespeichert())).toHaveLength(4);
    expect([post.mails.length, post.pushes.length]).toEqual([mails, pushes]);
  });
  it("Wiederholung ohne Kennung (offener Fall, gleicher Zeitraum): keine zweite Mitteilung", async () => {
    await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(3) });
    await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(3) });
    expect(krankNachrichten(await gespeichert())).toHaveLength(4);
  });
  it("gleichzeitig zweimal dieselbe Meldung: genau ein Fall, je Empfänger genau eine Mitteilung und eine Zustellung", async () => {
    const t = await tok("a1", "mitarbeiter");
    const erg = await Promise.all([0, 1, 2].map(() => anfrage("/api/krankmeldung", { methode: "POST", token: t,
      rumpf: { aktion: "melden", von: T(2), bis: T(2), clientEventId: "ev-gleich" } })));
    for (const e of erg) expect([200, 409]).toContain(e.status);
    const m = await gespeichert();
    expect(m.krankmeldungen).toHaveLength(1);
    const ids = krankNachrichten(m).map((n) => n.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    const an = post.mails.map((x) => x.an).sort();
    expect(an).toEqual([...new Set(an)]);
  });
  it("PUT erneut mit derselben Abwesenheit: kein zweiter Fall, keine zweite Mitteilung", async () => {
    const eintrag = { id: "abw-d", personId: "a1", art: "krank", von: T(2), bis: T(2) };
    await schreibe("a1", "mitarbeiter", (m) => { m.abwesenheiten = [...(m.abwesenheiten || []), eintrag]; });
    await schreibe("a1", "mitarbeiter", (m) => { m.abwesenheiten = [...(m.abwesenheiten || []).filter((x) => x.id !== "abw-d"), eintrag]; });
    const m = await gespeichert();
    expect(m.krankmeldungen).toHaveLength(1);
    expect(krankNachrichten(m)).toHaveLength(4);
  });
  it("Kern: zweiter Aufruf mit schon erzeugten Mitteilungen erzeugt nichts", () => {
    const alt = betrieb();
    const fall = { id: "km-k", personId: "a1", von: T(2), bis: T(2), status: "eingegangen", verlauf: [{ schritt: "eingegangen", von: "a1", rolle: "mitarbeiter" }] };
    const eins = krankmeldungMitteilungen(alt, { ...alt, krankmeldungen: [fall] }, "a1");
    const zwei = krankmeldungMitteilungen(alt, eins, "a1");
    expect(zwei.nachrichten).toHaveLength(eins.nachrichten.length);
    /* fremd gemeldet (Verlauf nennt eine andere Person): nichts */
    expect(krankmeldungMitteilungen(alt, { ...alt, krankmeldungen: [fall] }, "a2").nachrichten).toEqual([]);
  });
});

/* =========================== E  Zustellwege =========================== */
describe("E  Zustellwege, Wünsche, Anbieter aus", () => {
  it("Leitung hat Push insgesamt abgeschaltet: Mail ja, Push nein; Planung ohne Wunsch für Mail: kein Mail", async () => {
    await B.bestandSchreiben(laden(), R, { version: 9, stand: 1, mandanten: [{ ...betrieb(), personen: betrieb().personen.map((p) =>
      (p.id === "p1" ? { ...p, zustellung: { krankmeldungEingegangen: { mail: false } } } : p)) }, zweiter()] }, { durch: "Pruefung" });
    const r = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) });
    expect(post.mails.map((x) => x.an).sort()).toEqual(["l1@beispiel.invalid", "s1@beispiel.invalid", "s4@beispiel.invalid"]);
    expect(post.pushes.map((x) => x.endpoint).sort()).toEqual(["https://push.beispiel.invalid/p1", "https://push.beispiel.invalid/s1",
      "https://push.beispiel.invalid/s4"]);
    const st = await laden().get(V.statusSchluessel(R, "m1", `n-krank-${r.fall.id}-p1`, "mail"), { type: "json" });
    expect(st).toMatchObject({ status: "uebersprungen", grund: "aus" });
  });
  it("Anbieter aus (kein Mail-Schlüssel, kein VAPID): kein Netzaufruf, Status nur „trocken“", async () => {
    post.echt = true;
    const fetchVorher = globalThis.fetch;
    const netz = vi.fn(async () => { throw new Error("kein Netz im Test"); });
    globalThis.fetch = netz;
    try {
      const r = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) });
      expect(r.status).toBe(200);
      expect(netz).not.toHaveBeenCalled();
      for (const [pid, kanal] of [["p1", "mail"], ["p1", "push"], ["s1", "mail"]]) {
        const st = await laden().get(V.statusSchluessel(R, "m1", `n-krank-${r.fall.id}-${pid}`, kanal), { type: "json" });
        expect(st, `${pid} ${kanal}`).toMatchObject({ status: "gesendet", trocken: true });
      }
    } finally { globalThis.fetch = fetchVorher; post.echt = false; }
  });
  it("Art ist nicht dringend (keine hohe Push-Dringlichkeit, Personenkontingent gilt), Mail und Push standardmäßig an", () => {
    expect(ZUSTELLARTEN.krankmeldungEingegangen).toEqual({ mail: true, push: true, dringend: false });
  });
});

/* ============================ F  Protokoll ============================ */
describe("F  Protokoll", () => {
  it("POST und PUT: Zahl der Empfänger, ohne Person, Tag, Anmerkung, Namen", async () => {
    const vorher = (await spurZeilen()).length;
    const r = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(3), notiz: GEHEIM[4] });
    await schreibe("a2", "mitarbeiter", (m) => {
      m.abwesenheiten = [...(m.abwesenheiten || []), { id: "abw-f", personId: "a2", art: "krank", von: T(5), bis: T(5), notiz: GEHEIM[0] }];
    });
    const z = (await spurZeilen()).slice(vorher);
    expect(z.map((x) => x.zusatz).sort()).toEqual([
      `Krankmeldung ${r.fall.id}: Benachrichtigung an 4 Empfänger (Planung, Leitung, Schichtverantwortung nach Zuständigkeit)`,
      "Krankmeldung km-abw-f: Benachrichtigung an 2 Empfänger (Planung, Leitung, Schichtverantwortung nach Zuständigkeit)"].sort());
    for (const x of z) {
      for (const v of [...GEHEIM, T(2), T(3), T(5), "Vornamea", "Nachnamea", "p1", "l1", "s1", "s4"])
        expect(String(x.zusatz).includes(v), v).toBe(false);
    }
  });
});

/* ============================== G  Drift ============================== */
describe("G  Liste der Arten und neutraler Titel", () => {
  it("Oberfläche und Server kennen dieselbe Art mit denselben Vorgaben", () => {
    const { titel, text, ...vorgabe } = ZUSTELLARTEN_OBERFLAECHE.krankmeldungEingegangen;
    expect(vorgabe).toEqual(ZUSTELLARTEN.krankmeldungEingegangen);
    expect(`${titel} ${text}`).not.toMatch(/krank/i);
  });
  it("der Hinweis nach außen ist neutral", () => {
    expect(HINWEIS_TITEL.krankmeldungEingegangen).toBe("Neue Meldung zur Abwesenheit");
    expect(hinweis({ art: "krankmeldungEingegangen", titel: GEHEIM[0], text: GEHEIM[1] }))
      .toEqual({ titel: "Neue Meldung zur Abwesenheit", text: "Bitte in CENTRIC öffnen." });
  });
});
