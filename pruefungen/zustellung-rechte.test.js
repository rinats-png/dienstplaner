/* ==========================================================================
   VERSAND UND ZUSTELLUNG — serverseitig (Commit 4)

   Bis Oktober 2026:
   Z1  „/zustellung/senden“ nahm von jeder Sitzung (auch Betriebsrat,
       Betreiber) freie Aufträge mit Betreff, Text und Push-Titel an.
   Z2  Push an jede personId des Raums — der Schlüssel push:<raum>:<person>
       trug keinen Betrieb; A erreichte das Gerät einer Person in B.
   Z3  Die Antwort verriet je Auftrag, ob es Adresse oder Anmeldung gab.
   Z4  Ein Notruf der Beschäftigten löste weder E-Mail noch Push aus.
   Z5  Jeder Client der Planung stellte selbst zu — doppelt; jede Antwort
       galt als erledigt, eine Wiederholung gab es nicht.
   Z6  Den Zustellstatus setzte der Client.
   Z7  Die vollständige Push-Anmeldung stand an der Person und ging an
       Planung und Leitung hinaus.
   Z8  Beschäftigte konnten eigene Mitteilungen umschreiben, löschen und
       neu anlegen; „Tauschangebote“ mit freiem Text an beliebige Personen.

   Über die echten Handler. E-Mail und Push sind ersetzt (zählen, Fehler
   einspielen); der Status je Kanal wird direkt in der Ablage gelesen.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const post = vi.hoisted(() => ({ mails: [], pushes: [], mailFehler: 0, mailWirft: false, pushAntwort: null, verzoegerung: 0 }));
vi.mock("../server/lib/post.mjs", async (original) => ({
  ...(await original()),
  sendeMail: async (an, betreff, text) => {
    if (post.verzoegerung) await new Promise((r) => setTimeout(r, post.verzoegerung));
    if (post.mailWirft) throw new Error("Anbieter weg");
    post.mails.push({ an, betreff, text });
    if (post.mailFehler > 0) { post.mailFehler -= 1; return { ok: false, fehler: "502" }; }
    return { ok: true };
  },
}));
vi.mock("../server/lib/webpush.mjs", () => ({
  sendePush: async (anmeldung, titel, text, ziel) => {
    post.pushes.push({ endpoint: anmeldung && anmeldung.endpoint, titel, text, ziel });
    return post.pushAntwort || { ok: true };
  },
}));

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, zustellung, kontoSchreiben, ablageSchluessel, B, V, M;
let nr = 0;
const anfrage = async (handler, pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.6.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, text, ...d };
};
const senden = (t, rumpf) => anfrage(zustellung, "/zustellung/senden", { token: t, rumpf });
const lies = (t) => anfrage(daten, "/api/bestand", { methode: "GET", token: t });
/** Lesen, im eigenen Betrieb ändern, zurückschreiben — wie die Oberfläche. */
async function schreibe(t, aendern) {
  const r = await lies(t);
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendern(b.mandanten[0], b);
  return anfrage(daten, "/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
}
const gespeichert = async () => (await B.bestandLesen(laden(), "zus")).bestand;
const betrieb = async (id) => (await gespeichert()).mandanten.find((m) => m.id === id);
const status = (m, nid, kanal) => laden().get(V.statusSchluessel("zus", m, nid, kanal), { type: "json" });
const mitteilung = (id, an, extra = {}) => ({ id, personId: an, art: "planGeaendert", titel: `T ${id}`, text: `Text ${id}`,
  ziel: "meine", zeit: "x", erstellt: new Date().toISOString(), gelesen: false, dringend: true, ...extra });
const ANM = (e) => ({ anmeldung: { endpoint: `https://push.example/${e}`, keys: { p256dh: "k", auth: "a" } } });

async function sitzung(code, rolle, person, betriebNr, mandantId) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `${rolle} ${person}`, bestand: "zus", rolle, person,
    betrieb: betriebNr, ...(mandantId ? { mandantId } : {}), angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, JSON.stringify(a)).toBeTruthy();
  return a.token;
}
const person = (id, rolle, einheit = "e1", extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], email: `${id}@x.de`, ...extra });

const T = {};
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-zustellung-rechte-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of ["zustellen", "schreiben"]) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  zustellung = (await import("../server/funktionen/zustellung.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/versand.mjs");
  M = await import("../server/lib/mitteilungen.mjs");
  await B.bestandSchreiben(laden(), "zus", { version: 9, mandanten: [
    { id: "m-a", name: "A", einheiten: [{ id: "e1" }, { id: "e2" }], personen: [
      person("a1", "mitarbeiter"), person("a2", "mitarbeiter", "e1", { zustellung: { planGeaendert: { mail: false } } }),
      person("s1", "subplaner"), person("p1", "planer", "ALLE", { pushSchluessel: { endpoint: "https://push.example/alt-p1" } }),
      person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE"), person("x1", "mitarbeiter", "e2"),
      person("ohne", "mitarbeiter", "e1", { email: null }), person("dup", "mitarbeiter")],
    abweichungen: {}, nachrichten: [mitteilung("n-a1-alt", "a1", { gelesen: false })], notrufe: [],
    anfragen: [{ id: "t-a2", personId: "a2", typ: "tausch", art: "tausch", status: "offen", von: "2026-12-01", bis: "2026-12-01", interessenten: [] },
      { id: "t-zu", personId: "a2", typ: "tausch", art: "tausch", status: "genehmigt", von: "2026-12-02", bis: "2026-12-02", interessenten: [] }] },
    { id: "m-b", name: "B", einheiten: [{ id: "e1" }], personen: [person("b1", "mitarbeiter"), person("dup", "mitarbeiter"),
      person("bl", "leitung", "ALLE")], nachrichten: [mitteilung("n-b1", "b1")], notrufe: [], anfragen: [] },
  ] }, { durch: "Pruefung" });
  T.a1 = await sitzung("ZUS1-AAAA-0001", "mitarbeiter", "a1", 0, "m-a");
  T.a2 = await sitzung("ZUS2-AAAA-0002", "mitarbeiter", "a2", 0, "m-a");
  T.s1 = await sitzung("ZUS3-SSSS-0003", "subplaner", "s1", 0, "m-a");
  T.p1 = await sitzung("ZUS4-PPPP-0004", "planer", "p1", 0, "m-a");
  T.l1 = await sitzung("ZUS5-LLLL-0005", "leitung", "l1", 0, "m-a");
  T.r1 = await sitzung("ZUS6-RRRR-0006", "betriebsrat", "r1", 0, "m-a");
  T.b1 = await sitzung("ZUS7-BBBB-0007", "mitarbeiter", "b1", 1, "m-b");
  T.bl = await sitzung("ZUS8-BLBL-0008", "leitung", "bl", 1, "m-b");
  T.dupB = await sitzung("ZUS9-DUPB-0009", "mitarbeiter", "dup", 1, "m-b");
  T.betr = await sitzung("ZUSA-BTRB-0010", "betreiber", null, 0, null);
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
beforeEach(() => {
  post.mails.length = 0; post.pushes.length = 0; post.mailFehler = 0; post.mailWirft = false; post.pushAntwort = null; post.verzoegerung = 0;
});

/** Die Planung legt eine Mitteilung an (wie baueMitteilung) und speichert. */
async function planungLegtAn(n, t = T.p1) {
  const w = await schreibe(t, (m) => { m.nachrichten.unshift(n); });
  expect(w.status, w.text).toBe(200);
}

describe("Z1 — kein freier Versand", () => {
  it("das alte Auftragsformat mit Betreff, Text und Titel: 400, nichts geht hinaus", async () => {
    for (const t of [T.p1, T.a1]) {
      const r = await senden(t, { auftraege: [{ id: "x", personId: "a2", betreff: "Gewinn", text: "frei", titel: "frei" }] });
      expect(r.status).toBe(400);
    }
    expect(post.mails).toEqual([]); expect(post.pushes).toEqual([]);
  });
  it("Kennungen mit Zusatzfeldern statt Zeichenketten: 400", async () => {
    expect((await senden(T.p1, { nachrichten: [{ id: "n-a1-alt", personId: "a2", text: "frei" }] })).status).toBe(400);
  });
  it("Betriebsrat und Betreiber: 403, nichts geht hinaus", async () => {
    expect((await senden(T.r1, { nachrichten: ["n-a1-alt"] })).status).toBe(403);
    expect((await senden(T.betr, { nachrichten: ["n-a1-alt"] })).status).toBe(403);
    expect(post.mails).toEqual([]);
  });
  it("Beschäftigte stoßen keine Mitteilung der Planung an", async () => {
    await planungLegtAn(mitteilung("n-z1", "a2", { art: "einspringen" }));
    const r = await senden(T.a1, { nachrichten: ["n-z1"] });
    expect(r.status).toBe(200);
    expect(r.ergebnis).toEqual([{ id: "n-z1", stand: "erledigt" }]);
    expect(post.mails).toEqual([]);
    expect(await status("m-a", "n-z1", "mail")).toBeNull();
  });
  it("Inhalt kommt aus dem gespeicherten Stand: Titel und Text der Mitteilung, Adresse der Person", async () => {
    await planungLegtAn(mitteilung("n-inhalt", "l1", { titel: "Dienst geändert", text: "Früh statt Spät" }));
    const r = await senden(T.p1, { nachrichten: ["n-inhalt"] });
    expect(r.ergebnis).toEqual([{ id: "n-inhalt", stand: "erledigt" }]);
    expect(post.mails).toHaveLength(1);
    expect(post.mails[0].an).toBe("l1@x.de");
    expect(post.mails[0].betreff).toBe("Dienst geändert — A");
    expect(post.mails[0].text).toContain("Früh statt Spät");
  });
});

describe("Z2 — Mandantentrennung, Push-Register mit Betrieb", () => {
  it("anmelden schreibt push:<raum>:<mandantId>:<person>", async () => {
    expect((await anfrage(zustellung, "/zustellung/anmelden", { token: T.dupB, rumpf: ANM("dup-b") })).status).toBe(200);
    expect(await laden().get("push:zus:m-b:dup", { type: "json" })).toMatchObject({ endpoint: "https://push.example/dup-b" });
    expect(await laden().get("push:zus:dup", { type: "json" })).toBeNull();
  });
  it("A erreicht das Gerät der gleichnamigen Person in B nicht — auch nicht über den alten Schlüssel", async () => {
    await laden().setJSON("push:zus:dup", { endpoint: "https://push.example/alt-dup" });     // mehrdeutig: nie benutzt
    await planungLegtAn(mitteilung("n-dup", "dup", { art: "offeneSchicht" }));
    await senden(T.p1, { nachrichten: ["n-dup"] });
    expect(post.pushes).toEqual([]);
    expect(await status("m-a", "n-dup", "push")).toMatchObject({ status: "uebersprungen", grund: "keinWeg" });
    expect(await laden().get("push:zus:dup", { type: "json" })).not.toBeNull();             // nicht übernommen, nicht gelöscht
  });
  it("eine Kennung aus B oder eine Person, die es in A nicht gibt: nichts geht hinaus", async () => {
    const r = await senden(T.p1, { nachrichten: ["n-b1"] });
    expect(r.ergebnis).toEqual([{ id: "n-b1", stand: "erledigt" }]);
    expect(post.mails).toEqual([]); expect(post.pushes).toEqual([]);
    expect(await status("m-b", "n-b1", "mail")).toBeNull();
  });
  it("alter Schlüssel einer im Raum eindeutigen Person wird übernommen und entfernt", async () => {
    await laden().setJSON("push:zus:a2", { endpoint: "https://push.example/alt-a2" });
    await planungLegtAn(mitteilung("n-mig", "a2", { art: "offeneSchicht" }));
    await senden(T.p1, { nachrichten: ["n-mig"] });
    expect(post.pushes.map((p) => p.endpoint)).toEqual(["https://push.example/alt-a2"]);
    expect(await laden().get("push:zus:m-a:a2", { type: "json" })).toMatchObject({ endpoint: "https://push.example/alt-a2" });
    expect(await laden().get("push:zus:a2", { type: "json" })).toBeNull();
  });
  it("abmelden entfernt nur die eigene Anmeldung", async () => {
    await anfrage(zustellung, "/zustellung/anmelden", { token: T.b1, rumpf: ANM("b1") });
    await anfrage(zustellung, "/zustellung/abmelden", { token: T.b1 });
    expect(await laden().get("push:zus:m-b:b1", { type: "json" })).toBeNull();
    expect(await laden().get("push:zus:m-b:dup", { type: "json" })).not.toBeNull();
  });
  it("anmelden nimmt nur eine Push-Anmeldung (https-Endpunkt), keine beliebigen Daten", async () => {
    expect((await anfrage(zustellung, "/zustellung/anmelden", { token: T.a1, rumpf: { anmeldung: { endpoint: "http://intern/" } } })).status).toBe(400);
    expect((await anfrage(zustellung, "/zustellung/anmelden", { token: T.betr, rumpf: ANM("betr") })).status).toBe(400);
  });
});

describe("Z3 — kein Existenz-Orakel", () => {
  it("unbekannt, fremder Betrieb, ohne Weg, schon zugestellt: dieselbe Antwort", async () => {
    await planungLegtAn(mitteilung("n-ohne", "ohne", { art: "urlaubVerfaellt" }));
    await planungLegtAn(mitteilung("n-zu", "l1"));
    await senden(T.p1, { nachrichten: ["n-zu"] });
    const r = await senden(T.p1, { nachrichten: ["gibt-es-nicht", "n-b1", "n-ohne", "n-zu"] });
    expect(r.status).toBe(200);
    expect(r.ergebnis).toEqual(["gibt-es-nicht", "n-b1", "n-ohne", "n-zu"].map((id) => ({ id, stand: "erledigt" })));
    expect(Object.keys(r).sort()).toEqual(["ergebnis", "status", "text"]);
  });
});

describe("Z4 — Notruf: Server erzeugt und stellt zu", () => {
  it("Beschäftigte setzen einen Notruf ab: Mitteilungen an die Empfänger, sofort per E-Mail", async () => {
    const w = await schreibe(T.a1, (m) => {
      m.notrufe = [{ id: "nr-a1", personId: "a1", art: "medizin", notiz: "Sturz", empfaenger: ["s1", "l1"], bestaetigt: null }, ...(m.notrufe || [])];
    });
    expect(w.status, w.text).toBe(200);
    const m = await betrieb("m-a");
    const neu = m.nachrichten.filter((n) => n.quelle && n.quelle.id === "nr-a1");
    expect(neu.map((n) => n.id).sort()).toEqual(["n-notruf-nr-a1-l1", "n-notruf-nr-a1-s1"]);
    expect(neu[0]).toMatchObject({ art: "einspringen", titel: "NOTRUF: Medizinischer Notfall", ziel: "notruf", dringend: true });
    expect(neu.every((n) => n.text.startsWith("Va1 Na1") && n.text.includes("Sturz"))).toBe(true);
    expect(post.mails.map((x) => x.an).sort()).toEqual(["l1@x.de", "s1@x.de"]);
    expect(await status("m-a", "n-notruf-nr-a1-l1", "mail")).toMatchObject({ status: "gesendet", versuche: 1 });
  });
  it("eine vom Client gebaute Notrufmitteilung (ziel notruf) ist kein Versandweg", async () => {
    await schreibe(T.p1, (m) => { m.nachrichten.unshift(mitteilung("n-fake", "a2", { ziel: "notruf", titel: "NOTRUF: Lohn" })); });
    expect((await betrieb("m-a")).nachrichten.some((n) => n.id === "n-fake")).toBe(false);
    expect((await senden(T.p1, { nachrichten: ["n-fake"] })).ergebnis).toEqual([{ id: "n-fake", stand: "erledigt" }]);
    expect(post.mails).toEqual([]);
  });
  it("ein Versandfehler lässt den Notruf stehen", async () => {
    post.mailWirft = true;
    const w = await schreibe(T.a2, (m) => {
      m.notrufe = [{ id: "nr-a2", personId: "a2", art: "hilfe", notiz: "", empfaenger: ["l1"], bestaetigt: null }, ...(m.notrufe || [])];
    });
    expect(w.status, w.text).toBe(200);
    const m = await betrieb("m-a");
    expect(m.notrufe.some((n) => n.id === "nr-a2")).toBe(true);
    expect(await status("m-a", "n-notruf-nr-a2-l1", "mail")).toMatchObject({ status: "fehler", versuche: 1 });
  });
});

/* Commit 4a: Empfänger sind ausschließlich die gültigen, serverseitig
   geprüften Empfänger des konkreten Notrufs. Kein Ersatz, keine Erweiterung
   auf Planung oder Leitung (f050054 hatte diesen Rückfall selbst eingeführt). */
describe("Notrufempfänger — nur die gültigen des Notrufs (Commit 4a)", () => {
  const notrufVon = async (t, ich, id, empfaenger, extra = () => {}) => {
    const w = await schreibe(t, (m) => {
      m.notrufe = [{ id, personId: ich, art: "hilfe", notiz: "", empfaenger, bestaetigt: null }, ...(m.notrufe || [])];
      extra(m);
    });
    expect(w.status, w.text).toBe(200);
    const m = await betrieb("m-a");
    return { m, an: m.nachrichten.filter((n) => n.quelle && n.quelle.id === id).map((n) => n.personId).sort() };
  };
  it("gültige Empfänger: genau diese bekommen Servermitteilungen", async () => {
    const { an } = await notrufVon(T.a2, "a2", "nr-g", ["s1", "p1"]);
    expect(an).toEqual(["p1", "s1"]);
    expect(post.mails.map((x) => x.an).sort()).toEqual(["p1@x.de", "s1@x.de"]);
  });
  it("teilweise ungültig (Beschäftigte, fremder Betrieb, unbekannt, sie selbst): nur die gültigen", async () => {
    const { an } = await notrufVon(T.a2, "a2", "nr-t", ["l1", "a1", "b1", "gibt-es-nicht", "a2"]);
    expect(an).toEqual(["l1"]);
    expect(post.mails.map((x) => x.an)).toEqual(["l1@x.de"]);
  });
  it("kein gültiger Empfänger: Notruf gespeichert, keine Mitteilung, keine Mail, kein Push", async () => {
    await anfrage(zustellung, "/zustellung/anmelden", { token: T.p1, rumpf: ANM("p1-notruf") });
    const { m, an } = await notrufVon(T.a2, "a2", "nr-leer", ["a1", "b1"]);
    expect(m.notrufe.some((n) => n.id === "nr-leer")).toBe(true);
    expect(an).toEqual([]);
    expect(m.nachrichten.some((n) => String(n.id).startsWith("n-notruf-nr-leer-"))).toBe(false);
    expect(post.mails).toEqual([]);
    expect(post.pushes).toEqual([]);
  });
  it("ohne jede Empfängerangabe ebenso", async () => {
    const { an } = await notrufVon(T.a2, "a2", "nr-ohne", []);
    expect(an).toEqual([]);
    expect(post.mails).toEqual([]); expect(post.pushes).toEqual([]);
  });
  it("Empfänger nachschieben (gespeicherten Notruf ändern): wirkungslos", async () => {
    await schreibe(T.a2, (m) => { m.notrufe.find((n) => n.id === "nr-leer").empfaenger = ["l1", "p1"]; });
    const m = await betrieb("m-a");
    expect(m.notrufe.find((n) => n.id === "nr-leer").empfaenger).toEqual([]);
    expect(m.nachrichten.some((n) => n.quelle && n.quelle.id === "nr-leer")).toBe(false);
    expect(post.mails).toEqual([]);
  });
  it("eingeschleuste Client-Notrufmitteilungen (auch mit Serverkennung und quelle): wirkungslos", async () => {
    const { m, an } = await notrufVon(T.a2, "a2", "nr-x", ["l1"], (mm) => {
      mm.nachrichten.unshift(
        mitteilung("n-notruf-nr-x-p1", "p1", { art: "einspringen", ziel: "notruf", titel: "NOTRUF: Hilfe angefordert",
          quelle: { art: "notruf", id: "nr-x", von: "a2" } }),
        mitteilung("n-fake-x", "s1", { art: "einspringen", ziel: "notruf", titel: "NOTRUF: frei" }));
    });
    expect(an).toEqual(["l1"]);
    expect(m.nachrichten.some((n) => n.id === "n-fake-x" || n.id === "n-notruf-nr-x-p1")).toBe(false);
    expect(post.mails.map((x) => x.an)).toEqual(["l1@x.de"]);
  });
  it("Planung als Absenderin: kein Rückfall auf die übrige Planung/Leitung", async () => {
    const { an } = await notrufVon(T.p1, "p1", "nr-p", ["a1"]);
    expect(an).toEqual([]);
    expect(post.mails).toEqual([]); expect(post.pushes).toEqual([]);
  });
});

describe("Z5 — kein paralleler Mehrfachversand: atomarer Claim, Wiederholung", () => {
  it("zehn gleichzeitige Anstöße derselben Mitteilung: genau eine E-Mail", async () => {
    await planungLegtAn(mitteilung("n-par", "l1"));
    post.verzoegerung = 20;
    const r = await Promise.all(Array.from({ length: 10 }, (_, i) => senden(i % 2 ? T.p1 : T.l1, { nachrichten: ["n-par"] })));
    expect(r.every((x) => x.status === 200)).toBe(true);
    expect(post.mails.filter((x) => x.an === "l1@x.de")).toHaveLength(1);
    expect(await status("m-a", "n-par", "mail")).toMatchObject({ status: "gesendet", versuche: 1 });
    await senden(T.p1, { nachrichten: ["n-par"] });
    expect(post.mails).toHaveLength(1);
  });
  it("die Ablage: von fünfzig gleichzeitigen Anlagen gewinnt genau eine", async () => {
    const r = await Promise.all(Array.from({ length: 50 }, (_, i) => laden().setJSONWennNeu("probe:claim", { i })));
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await laden().setJSONWennNeu("probe:claim", { i: 99 })).toBe(false);
  });
  it("Fehler: „offen“, beim nächsten Anstoß wiederholt; nach drei Versuchen Schluss", async () => {
    await planungLegtAn(mitteilung("n-retry", "l1"));
    post.mailFehler = 1;
    expect((await senden(T.p1, { nachrichten: ["n-retry"] })).ergebnis).toEqual([{ id: "n-retry", stand: "offen" }]);
    expect(await status("m-a", "n-retry", "mail")).toMatchObject({ status: "fehler", versuche: 1 });
    expect((await senden(T.p1, { nachrichten: ["n-retry"] })).ergebnis).toEqual([{ id: "n-retry", stand: "erledigt" }]);
    expect(await status("m-a", "n-retry", "mail")).toMatchObject({ status: "gesendet", versuche: 2 });

    await planungLegtAn(mitteilung("n-tot", "l1"));
    post.mailFehler = 99;
    for (let i = 0; i < 5; i++) await senden(T.p1, { nachrichten: ["n-tot"] });
    expect(post.mails.filter((x) => x.betreff.startsWith("T n-tot"))).toHaveLength(3);
    expect(await status("m-a", "n-tot", "mail")).toMatchObject({ status: "fehler", versuche: 3 });
  });
  it("Push 404/410: Anmeldung gelöscht, Kanal endgültig", async () => {
    await anfrage(zustellung, "/zustellung/anmelden", { token: T.l1, rumpf: ANM("l1") });
    post.pushAntwort = { ok: false, erloschen: true, fehler: "410" };
    await planungLegtAn(mitteilung("n-410", "l1", { art: "offeneSchicht" }));
    await senden(T.p1, { nachrichten: ["n-410"] });
    expect(post.pushes).toHaveLength(1);
    expect(await laden().get("push:zus:m-a:l1", { type: "json" })).toBeNull();
    expect(await status("m-a", "n-410", "push")).toMatchObject({ status: "uebersprungen", grund: "erloschen" });
    await senden(T.p1, { nachrichten: ["n-410"] });
    expect(post.pushes).toHaveLength(1);
  });
  it("abgeschaltete Art oder kein Kanal für die Art: übersprungen", async () => {
    await planungLegtAn(mitteilung("n-aus", "a2"));                          // a2: planGeaendert per Mail abgeschaltet
    await senden(T.p1, { nachrichten: ["n-aus"] });
    expect(post.mails).toEqual([]);
    expect(await status("m-a", "n-aus", "mail")).toMatchObject({ status: "uebersprungen", grund: "aus" });
    await planungLegtAn(mitteilung("n-os", "l1", { art: "offeneSchicht" }));  // offeneSchicht: keine Mail
    await senden(T.p1, { nachrichten: ["n-os"] });
    expect(await status("m-a", "n-os", "mail")).toMatchObject({ status: "uebersprungen", grund: "aus" });
  });
});

describe("Z6 — Zustellwege und -status setzt kein Client", () => {
  it("neue Mitteilung mit „zugestellt“ und fremden Wegen: gespeichert ohne, zugestellt wird trotzdem", async () => {
    await planungLegtAn(mitteilung("n-z6", "l1", { wege: { mail: "angreifer@x.de", push: { endpoint: "https://boese" } },
      zugestellt: { mail: "gesendet", push: "gesendet" } }));
    const n = (await betrieb("m-a")).nachrichten.find((x) => x.id === "n-z6");
    expect(n.wege).toBeUndefined(); expect(n.zugestellt).toBeUndefined();
    await senden(T.p1, { nachrichten: ["n-z6"] });
    expect(post.mails.map((x) => x.an)).toEqual(["l1@x.de"]);
  });
  it("bestehende Mitteilung: „zugestellt“ vom Client bleibt wirkungslos", async () => {
    const w = await schreibe(T.p1, (m) => { m.nachrichten.find((x) => x.id === "n-z6").zugestellt = { mail: "fehler" }; });
    expect(w.status).toBe(200);
    expect((await betrieb("m-a")).nachrichten.find((x) => x.id === "n-z6").zugestellt).toBeUndefined();
  });
  it("Titel über 120 oder Text über 500 Zeichen: abgewiesen", async () => {
    expect((await schreibe(T.p1, (m) => { m.nachrichten.unshift(mitteilung("n-lang", "l1", { titel: "x".repeat(121) })); })).status).toBe(403);
    expect((await schreibe(T.p1, (m) => { m.nachrichten.unshift(mitteilung("n-lang", "l1", { text: "x".repeat(501) })); })).status).toBe(403);
  });
});

describe("Z7 — keine technischen Push-Daten in fremden Sichten", () => {
  it("Planung und Leitung: E-Mail ja, pushSchluessel und zustellung fremder Personen nein", async () => {
    for (const t of [T.p1, T.l1]) {
      const m = (await lies(t)).bestand.mandanten[0];
      const a2 = m.personen.find((p) => p.id === "a2");
      expect(a2.email).toBe("a2@x.de");
      expect(a2.zustellung).toBeUndefined();
      const p1 = m.personen.find((p) => p.id === "p1");
      if (t === T.l1) expect(p1.pushSchluessel).toBeUndefined();
    }
  });
  it("Speichern ohne die Felder verliert sie nicht (Rückfüllung)", async () => {
    await schreibe(T.l1, (m) => { m.abweichungen["a1|2026-12-03"] = "F"; });
    const m = await betrieb("m-a");
    expect(m.personen.find((p) => p.id === "a2").zustellung).toEqual({ planGeaendert: { mail: false } });
    expect(m.personen.find((p) => p.id === "p1").pushSchluessel).toEqual({ endpoint: "https://push.example/alt-p1" });
  });
  it("eine neu geschriebene Push-Anmeldung an der eigenen Person wird zum Merker", async () => {
    await schreibe(T.a1, (m) => { m.personen.find((p) => p.id === "a1").pushSchluessel = { endpoint: "https://push.example/neu", keys: { auth: "geheim" } }; });
    expect((await betrieb("m-a")).personen.find((p) => p.id === "a1").pushSchluessel).toBe(true);
  });
});

describe("Z8 — Empfänger ändern nur „gelesen“", () => {
  it("Beschäftigte: umschreiben, löschen, neu anlegen wirkungslos; gelesen kommt an", async () => {
    await schreibe(T.a1, (m) => {
      const n = m.nachrichten.find((x) => x.id === "n-a1-alt");
      n.titel = "umgeschrieben"; n.gelesen = true;
      m.nachrichten.unshift(mitteilung("n-selbst", "a1"), mitteilung("n-an-a2", "a2"));
    });
    const m = await betrieb("m-a");
    const n = m.nachrichten.find((x) => x.id === "n-a1-alt");
    expect(n.titel).toBe("T n-a1-alt"); expect(n.gelesen).toBe(true);
    expect(m.nachrichten.some((x) => x.id === "n-selbst" || x.id === "n-an-a2")).toBe(false);
    await schreibe(T.a1, (mm) => { mm.nachrichten = mm.nachrichten.filter((x) => x.id !== "n-a1-alt"); });
    expect((await betrieb("m-a")).nachrichten.some((x) => x.id === "n-a1-alt")).toBe(true);
  });
  it("Schichtverantwortung als Empfängerin: nur gelesen — eigene Mitteilung umschreiben abgewiesen", async () => {
    await planungLegtAn(mitteilung("n-an-s1", "s1"));
    expect((await schreibe(T.s1, (m) => { m.nachrichten.find((x) => x.id === "n-an-s1").titel = "anders"; })).status).toBe(403);
    const ok = await schreibe(T.s1, (m) => { m.nachrichten.find((x) => x.id === "n-an-s1").gelesen = true; });
    expect(ok.status, ok.text).toBe(200);
    expect((await betrieb("m-a")).nachrichten.find((x) => x.id === "n-an-s1")).toMatchObject({ titel: "T n-an-s1", gelesen: true });
  });
  it("Mitteilungen des Servers: an jeder Stelle nur gelesen, Inhalt bleibt", async () => {
    const w = await schreibe(T.s1, (m) => { const n = m.nachrichten.find((x) => x.id === "n-notruf-nr-a1-s1"); n.titel = "anders"; n.gelesen = true; });
    expect(w.status, w.text).toBe(200);
    expect((await betrieb("m-a")).nachrichten.find((x) => x.id === "n-notruf-nr-a1-s1"))
      .toMatchObject({ titel: "NOTRUF: Medizinischer Notfall", gelesen: true });
    await schreibe(T.p1, (m) => { m.nachrichten.find((x) => x.id === "n-notruf-nr-a1-l1").personId = "x1"; });
    expect((await betrieb("m-a")).nachrichten.find((x) => x.id === "n-notruf-nr-a1-l1").personId).toBe("l1");
  });
});

describe("Tausch — keine Mitteilungen an beliebige Personen", () => {
  it("ein selbst gebautes „Tauschangebot“ mit freiem Text an irgendwen: verworfen", async () => {
    await schreibe(T.a1, (m) => { m.nachrichten.unshift(mitteilung("n-spam", "l1", { art: "tauschAngebot", titel: "Kauf jetzt", text: "frei" })); });
    expect((await betrieb("m-a")).nachrichten.some((x) => x.id === "n-spam")).toBe(false);
  });
  it("Meldung auf ein offenes Tauschgesuch: eine Mitteilung an dessen Person, nur einmal", async () => {
    await anfrage(zustellung, "/zustellung/anmelden", { token: T.a2, rumpf: ANM("a2-neu") });
    const melden = () => schreibe(T.a1, (m) => { m.anfragen.find((a) => a.id === "t-a2").interessenten.push("a1"); });
    expect((await melden()).status).toBe(200);
    const n = (await betrieb("m-a")).nachrichten.filter((x) => x.art === "tauschAngebot");
    expect(n.map((x) => [x.id, x.personId])).toEqual([["n-tausch-t-a2-a1", "a2"]]);
    expect(n[0].text).toBe("Va1 Na1 bietet an, den Dienst am 01.12. zu übernehmen.");
    expect(post.pushes.map((p) => p.endpoint)).toEqual(["https://push.example/a2-neu"]);
    await schreibe(T.a1, (m) => { const a = m.anfragen.find((x) => x.id === "t-a2"); a.interessenten = a.interessenten.filter((x) => x !== "a1"); });
    await melden();
    expect((await betrieb("m-a")).nachrichten.filter((x) => x.art === "tauschAngebot")).toHaveLength(1);
    expect(post.pushes).toHaveLength(1);
  });
  it("auf ein entschiedenes (nicht ausgeliefertes) Gesuch per API gemeldet: keine Mitteilung", async () => {
    await schreibe(T.a1, (m) => { m.anfragen.push({ id: "t-zu", personId: "a2", typ: "tausch", art: "tausch", status: "genehmigt",
      von: "2026-12-02", bis: "2026-12-02", interessenten: ["a1"] }); });
    expect((await betrieb("m-a")).nachrichten.some((x) => x.id === "n-tausch-t-zu-a1")).toBe(false);
    expect(post.pushes).toEqual([]);
  });
});

describe("Schichtverantwortung stößt nur im eigenen Bereich an", () => {
  it("an eine Person des Bereichs: ja; an eine Person eines anderen Bereichs: nein", async () => {
    await planungLegtAn(mitteilung("n-x1", "x1"));
    await planungLegtAn(mitteilung("n-a1b", "a1"));
    await senden(T.s1, { nachrichten: ["n-x1", "n-a1b"] });
    expect(post.mails.map((x) => x.an)).toEqual(["a1@x.de"]);
  });
});

describe("Zustellarten: Server und Oberfläche gleich (Drift)", () => {
  it("ZUSTELLARTEN in src/App.jsx und server/lib/mitteilungen.mjs", async () => {
    const app = await readFile(path.join(process.cwd(), "src/App.jsx"), "utf8");
    const block = app.slice(app.indexOf("const ZUSTELLARTEN = {"), app.indexOf("\n};", app.indexOf("const ZUSTELLARTEN = {")));
    const client = {};
    for (const z of block.matchAll(/^\s{2}(\w+): \{ titel: "[^"]*", mail: (true|false), push: (true|false), dringend: (true|false)/gm))
      client[z[1]] = { mail: z[2] === "true", push: z[3] === "true", dringend: z[4] === "true" };
    expect(Object.keys(client).length).toBeGreaterThan(5);
    expect(client).toEqual(M.ZUSTELLARTEN);
  });
  it("NOTRUF_ARTEN in src/App.jsx und server/lib/mitteilungen.mjs", async () => {
    const app = await readFile(path.join(process.cwd(), "src/App.jsx"), "utf8");
    const block = app.slice(app.indexOf("const NOTRUF_ARTEN = {"), app.indexOf("\n};", app.indexOf("const NOTRUF_ARTEN = {")));
    const client = {};
    for (const z of block.matchAll(/^\s{2}(\w+): \{ label: "([^"]*)"/gm)) client[z[1]] = z[2];
    expect(client).toEqual(M.NOTRUF_ARTEN);
  });
});
