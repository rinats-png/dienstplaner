/* ==========================================================================
   WP-30 — MAIL UND PUSH IN PRODUKTION (Zustellung gegen Attrappen)

   Alles gegen Test-Transport: Mail und Push sind ersetzt (zählen, Antworten
   einspielen); es geht nichts hinaus, es steht kein Schlüssel, keine Domain
   und kein Host im Code. Geprüft wird die Zustellkette in lib/versand.mjs mit
   echter Ablage in einem Temporärordner:

   Warteschlange mit Wiederholung, Backoff und Abbruchgrenze · keine
   Doppelzustellung (parallel, nach Erfolg, nach Absturz zwischen Senden und
   Quittieren) · Bounce dauerhaft/vorübergehend · Push 410 · Opt-out ·
   Rollen- und Mandantentrennung · Inhalte ohne Personen- und
   Gesundheitsangaben · Entwurfsregel · Versandbremsen (fail-closed) ·
   Löschung und Aufbewahrung · Zustandsanzeige ohne Geheimnisse.

   Die Anbieterantworten selbst (HTTP-Status → Klasse) und die
   Endpunktprüfung stehen in mail-push-anbieter.test.js, die Handler (Anmelden,
   Abmelden, Löschung der Person) in mail-push-handler.test.js.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const post = vi.hoisted(() => ({ mails: [], pushes: [], mailAntworten: [], pushAntworten: [], gesendetNurEinmalBeiKey: false, keys: new Set(), beimSenden: null }));
vi.mock("../server/lib/post.mjs", async (original) => ({
  ...(await original()),
  sendeMail: async (an, betreff, text, opt = {}) => {
    if (post.beimSenden) await post.beimSenden(an);
    const a = post.mailAntworten.length ? post.mailAntworten.shift() : { ok: true };
    /* Wie der Anbieter: derselbe Idempotenzschlüssel wird nicht zweimal zugestellt. */
    const doppelt = opt.idempotenz && post.keys.has(opt.idempotenz);
    post.mails.push({ an, betreff, text, idempotenz: opt.idempotenz, doppelt: !!doppelt });
    if (a.ok && opt.idempotenz) post.keys.add(opt.idempotenz);
    return a;
  },
}));
vi.mock("../server/lib/webpush.mjs", async (original) => ({
  ...(await original()),
  sendePush: async (anmeldung, titel, text, ziel, opt = {}) => {
    post.pushes.push({ endpoint: anmeldung && anmeldung.endpoint, titel, text, ziel, topic: opt.topic, dringend: opt.dringend });
    return post.pushAntworten.length ? post.pushAntworten.shift() : { ok: true };
  },
}));

const RAUM = "mp";
const JETZT = Date.parse("2026-12-10T10:00:00.000Z");
let wurzel, store, V, R, Z, G, B;

const heuteIso = (j = JETZT) => new Date(j).toISOString();
const person = (id, rolle, extra = {}) => ({ id, vorname: `Vor${id}`, nachname: `Nach${id}`, rolle,
  email: `${id}@kunde.example`, ...extra });
const mitteilung = (id, an, extra = {}) => ({ id, personId: an, art: "planGeaendert", titel: `GEHEIMTITEL-${id}`,
  text: `GEHEIMTEXT-${id} Medizinischer Notfall bei Vorb1 Nachb1, Schicht 06:00-14:00`, ziel: "meine", zeit: "x",
  erstellt: heuteIso(), gelesen: false, dringend: true, ...extra });
const betrieb = (extra = {}) => ({ id: "m-a", name: "Betrieb A", einheiten: [{ id: "e1" }],
  personen: [person("a1", "mitarbeiter"), person("a2", "mitarbeiter"), person("p1", "planer"), person("l1", "leitung"),
    person("r1", "betriebsrat"), person("x1", "mitarbeiter", { anonym: true, email: "" })],
  nachrichten: [], notrufe: [], anfragen: [], abweichungen: {}, ...extra });
const status = (m, nid, kanal) => store.get(V.statusSchluessel(RAUM, m.id, nid, kanal), { type: "json" });
const stelleZu = (m, ids, o = {}) => V.zustellen(store, { raum: RAUM, bestand: { mandanten: [m] }, m, ids, jetzt: JETZT, ...o });
const leere = () => { post.beimSenden = null; post.mails.length = 0; post.pushes.length = 0; post.mailAntworten.length = 0; post.pushAntworten.length = 0; post.keys.clear(); };
const abo = async (m, personId, host = "push.example/") =>
  store.setJSON(V.pushSchluessel(RAUM, m.id, personId), { endpoint: `https://${host}${personId}`, keys: { p256dh: "k", auth: "a" } });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-mailpush-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_ZUSTELL_PERSON_MAIL = "1000";
  process.env.CENTRIC_GESUND_PLATZ_KRITISCH_MB = "0";
  const { getStore } = await import("../server/lib/ablage.mjs");
  store = getStore({ name: "centric", consistency: "strong" });
  V = await import("../server/lib/versand.mjs");
  R = await import("../server/lib/zustellregeln.mjs");
  Z = await import("../server/lib/zustellzaehler.mjs");
  G = await import("../server/lib/gesund.mjs");
  B = await import("../server/lib/bestand.mjs");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
beforeEach(async () => {
  leere();
  Z.zustellZaehlungLeeren();
  V.kontingentCacheLeeren();
  process.env.CENTRIC_ZUSTELL_BACKOFF = "0,0";
  delete process.env.CENTRIC_ZUSTELL_PERSON_PUSH;
  delete process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL;
  delete process.env.CENTRIC_ZUSTELL_BETRIEB_PUSH;
  process.env.CENTRIC_ZUSTELL_PERSON_MAIL = "1000";
  for (const praefix of ["zustellung:", "zustellclaim:", "zustellwarte:", "zustellquote:", "unzustellbar:", "push:"]) {
    const { blobs } = await store.list({ prefix: praefix });
    for (const b of blobs) await store.delete(b.key);
  }
});

describe("Warteschlange: Wiederholung, Backoff, Abbruchgrenze", () => {
  it("temporärer Fehler: zurückgestellt mit Wartezeit; vorher nichts, danach genau ein Versuch", async () => {
    process.env.CENTRIC_ZUSTELL_BACKOFF = "100,200";
    const m = betrieb({ nachrichten: [mitteilung("n1", "l1")] });
    post.mailAntworten.push({ ok: false, klasse: "temporaer", status: 503 });
    expect((await stelleZu(m, ["n1"])).get("n1")).toBe("offen");
    const st = await status(m, "n1", "mail");
    expect(st).toMatchObject({ status: "fehler", versuche: 1, code: "http-503", klasse: "temporaer" });
    expect(Date.parse(st.naechster)).toBe(JETZT + 100_000);
    expect(V.anzeigeStatus(st).stand).toBe("zurueckgestellt");
    await stelleZu(m, ["n1"], { jetzt: JETZT + 50_000 });
    expect(post.mails).toHaveLength(1);                                   // zu früh: kein Versuch
    await stelleZu(m, ["n1"], { jetzt: JETZT + 101_000 });
    expect(post.mails).toHaveLength(2);
    expect(await status(m, "n1", "mail")).toMatchObject({ status: "gesendet", versuche: 2 });
  });

  it("Abbruchgrenze: nach Plan+1 Versuchen endgültig fehlgeschlagen, danach nie wieder", async () => {
    process.env.CENTRIC_ZUSTELL_BACKOFF = "10,20";                        // höchstens 3 Versuche
    const m = betrieb({ nachrichten: [mitteilung("n2", "l1")] });
    for (let i = 0; i < 3; i++) post.mailAntworten.push({ ok: false, klasse: "temporaer", status: 500 });
    let t = JETZT;
    for (let i = 0; i < 8; i++) { await stelleZu(m, ["n2"], { jetzt: t }); t += 3600_000; }
    expect(post.mails).toHaveLength(3);
    const st = await status(m, "n2", "mail");
    expect(st).toMatchObject({ status: "gescheitert", grund: "versuche", versuche: 3 });
    expect(V.anzeigeStatus(st).stand).toBe("fehlgeschlagen");
    expect((await laden_warte()).length).toBe(0);                         // nicht mehr in der Warteschlange
    expect(Z.zustellZaehlung().mail.endgueltig).toBe(1);
  });

  it("nachfassen holt Fälliges ohne Anstoß aus der Oberfläche ab (Server-Takt)", async () => {
    process.env.CENTRIC_ZUSTELL_BACKOFF = "60";
    const m = betrieb({ nachrichten: [mitteilung("n3", "l1")] });
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    post.mailAntworten.push({ ok: false, klasse: "temporaer", status: 429 });
    await stelleZu(m, ["n3"]);
    expect((await laden_warte()).length).toBe(1);
    let r = await V.nachfassen(store, { jetzt: JETZT + 10_000 });
    expect(r.angestossen).toBe(0);
    expect(post.mails).toHaveLength(1);
    r = await V.nachfassen(store, { jetzt: JETZT + 61_000 });
    expect(r.angestossen).toBe(1);
    expect(post.mails).toHaveLength(2);
    expect(await status(m, "n3", "mail")).toMatchObject({ status: "gesendet", versuche: 2 });
    expect((await laden_warte()).length).toBe(0);
    await V.nachfassen(store, { jetzt: JETZT + 600_000 });
    expect(post.mails).toHaveLength(2);                                   // nichts doppelt
  });

  it("nachfassen: Mitteilung oder Person gibt es nicht mehr → entfallen, nicht gewertet als Fehler", async () => {
    process.env.CENTRIC_ZUSTELL_BACKOFF = "60";
    const m = betrieb({ nachrichten: [mitteilung("n4", "l1")] });
    post.mailAntworten.push({ ok: false, klasse: "temporaer", status: 500 });
    await stelleZu(m, ["n4"]);
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [{ ...m, nachrichten: [] }] }, { durch: "Pruefung" });
    const r = await V.nachfassen(store, { jetzt: JETZT + 120_000 });
    expect(r.entfallen).toBe(1);
    expect(await status(m, "n4", "mail")).toMatchObject({ status: "uebersprungen", grund: "entfallen" });
    expect(post.mails).toHaveLength(1);
  });

  it("Raum nicht lesbar: nachfassen wertet das nie als „entfallen“", async () => {
    process.env.CENTRIC_ZUSTELL_BACKOFF = "60";
    const m = betrieb({ id: "m-weg", nachrichten: [mitteilung("n5", "l1")] });
    await store.setJSON(V.warteSchluessel("raum-ohne-bestand", m.id, "n5", "mail"),
      { raum: "raum-ohne-bestand", mandantId: m.id, nid: "n5", kanal: "mail", naechster: heuteIso(JETZT - 1000) });
    const r = await V.nachfassen(store, { jetzt: JETZT });
    expect(r.entfallen).toBe(0);
    expect(r.fehler).toBe(1);
    expect(await store.getMetadata(V.warteSchluessel("raum-ohne-bestand", m.id, "n5", "mail"))).not.toBeNull();
  });
});

async function laden_warte() { return (await store.list({ prefix: "zustellwarte:" })).blobs; }

describe("Keine Doppelzustellung", () => {
  it("zehn gleichzeitige Anstöße: genau eine Mail, ein Push", async () => {
    const m = betrieb({ nachrichten: [mitteilung("p1", "l1", { art: "planFreigegeben" })] });
    await abo(m, "l1");
    await Promise.all(Array.from({ length: 10 }, () => stelleZu(m, ["p1"])));
    expect(post.mails).toHaveLength(1);
    expect(post.pushes).toHaveLength(1);
    await stelleZu(m, ["p1"]);
    await V.nachfassen(store, { jetzt: JETZT + 3600_000 });
    expect(post.mails).toHaveLength(1);
    expect(post.pushes).toHaveLength(1);
  });

  it("Absturz zwischen Senden und Quittieren: erst nach der Frist, mit demselben Idempotenzschlüssel — der Anbieter stellt nicht doppelt zu", async () => {
    const m = betrieb({ nachrichten: [mitteilung("c1", "l1")] });
    let abbrechen = true;
    const absturzStore = { ...store, setJSON: async (k, d, o) => {
      if (abbrechen && k.startsWith("zustellung:") && d.status === "gesendet") { abbrechen = false; throw new Error("Prozess abgebrochen"); }
      return store.setJSON(k, d, o);
    } };
    await V.zustellen(absturzStore, { raum: RAUM, bestand: { mandanten: [m] }, m, ids: ["c1"], jetzt: JETZT });
    expect(post.mails).toHaveLength(1);                                    // gesendet, aber nie quittiert
    expect(await status(m, "c1", "mail")).toMatchObject({ status: "offen", versuche: 1 });
    await stelleZu(m, ["c1"], { jetzt: JETZT + 5 * 60_000 });              // vor der Frist: nichts
    expect(post.mails).toHaveLength(1);
    await stelleZu(m, ["c1"], { jetzt: JETZT + 16 * 60_000 });             // danach: erneut, gleicher Schlüssel
    expect(post.mails).toHaveLength(2);
    expect(post.mails[1].idempotenz).toBe(post.mails[0].idempotenz);
    expect(post.mails[1].doppelt).toBe(true);                              // der Anbieter erkennt den Schlüssel
    expect(await status(m, "c1", "mail")).toMatchObject({ status: "gesendet", versuche: 2 });
  });

  it("nach einem bekannten Fehler geht ein neuer Idempotenzschlüssel hinaus (sonst käme die Fehlerantwort zurück)", async () => {
    const m = betrieb({ nachrichten: [mitteilung("c2", "l1")] });
    post.mailAntworten.push({ ok: false, klasse: "temporaer", status: 502 });
    await stelleZu(m, ["c2"]);
    await stelleZu(m, ["c2"]);
    expect(post.mails).toHaveLength(2);
    expect(post.mails[1].idempotenz).not.toBe(post.mails[0].idempotenz);
  });

  it("Absturz nach dem Claim: die Warteschlange holt den offenen Versuch nach der Frist ab", async () => {
    const m = betrieb({ nachrichten: [mitteilung("c3", "l1")] });
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    const absturzStore = { ...store, setJSON: async (k, d, o) => {
      if (k.startsWith("zustellung:") && d.status === "gesendet") throw new Error("Prozess abgebrochen");
      return store.setJSON(k, d, o);
    } };
    await V.zustellen(absturzStore, { raum: RAUM, bestand: { mandanten: [m] }, m, ids: ["c3"], jetzt: JETZT });
    expect((await laden_warte()).length).toBe(1);
    await V.nachfassen(store, { jetzt: JETZT + 16 * 60_000 });
    expect(post.mails).toHaveLength(2);
    expect(post.mails[1].doppelt).toBe(true);
  });
});

describe("Bounce und Fehler der Anbieterantwort", () => {
  it("Mail dauerhaft (422): endgültig, nie wiederholt, Adresse gesperrt bis zur Änderung", async () => {
    const m = betrieb({ nachrichten: [mitteilung("b1", "l1"), mitteilung("b2", "l1", { art: "planFreigegeben" })] });
    post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 422, ursache: "empfaenger" });
    expect((await stelleZu(m, ["b1"])).get("b1")).toBe("erledigt");
    expect(await status(m, "b1", "mail")).toMatchObject({ status: "gescheitert", grund: "dauerhaft", code: "http-422" });
    await stelleZu(m, ["b1"]);
    expect(post.mails).toHaveLength(1);
    await stelleZu(m, ["b2"]);                                             // zweite Mitteilung an dieselbe Adresse
    expect(post.mails).toHaveLength(1);
    expect(await status(m, "b2", "mail")).toMatchObject({ status: "uebersprungen", grund: "unzustellbar" });
    const m2 = betrieb({ nachrichten: [mitteilung("b3", "l1")], personen: betrieb().personen.map((p) => (p.id === "l1" ? { ...p, email: "neu@kunde.example" } : p)) });
    await stelleZu(m2, ["b3"]);
    expect(post.mails).toHaveLength(2);                                    // neue Adresse: wieder möglich
  });

  it("Mail 400 dauerhaft: nicht wiederholt, die Adresse wird nicht gesperrt (kann an der Nachricht liegen)", async () => {
    const m = betrieb({ nachrichten: [mitteilung("b4", "l1"), mitteilung("b5", "l1", { art: "planFreigegeben" })] });
    post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 400 });
    await stelleZu(m, ["b4"]);
    await stelleZu(m, ["b4"]);
    expect(post.mails).toHaveLength(1);
    await stelleZu(m, ["b5"]);
    expect(post.mails).toHaveLength(2);
  });

  it("Konfiguration (401/403): wird wiederholt, zählt für den Alarm", async () => {
    const m = betrieb({ nachrichten: [mitteilung("b6", "l1")] });
    post.mailAntworten.push({ ok: false, klasse: "konfiguration", status: 403 });
    await stelleZu(m, ["b6"]);
    expect(await status(m, "b6", "mail")).toMatchObject({ status: "fehler", klasse: "konfiguration", code: "http-403" });
    expect(Z.zustellZaehlung().mail.konfiguration).toBe(1);
  });

  it("Fehler ohne Klasse und ohne Status (alte Attrappe, Ausnahme): vorübergehend, nie dauerhaft", async () => {
    const m = betrieb({ nachrichten: [mitteilung("b7", "l1")] });
    post.mailAntworten.push({ ok: false, fehler: "irgendwas" });
    await stelleZu(m, ["b7"]);
    expect(await status(m, "b7", "mail")).toMatchObject({ status: "fehler", klasse: "temporaer" });
  });

  it("das Statusprotokoll enthält weder Adresse noch Anbietertext", async () => {
    const m = betrieb({ nachrichten: [mitteilung("b8", "l1")] });
    post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 422, fehler: "invalid to: l1@kunde.example" });
    await stelleZu(m, ["b8"]);
    const roh = JSON.stringify(await status(m, "b8", "mail"));
    expect(roh).not.toContain("kunde.example");
    expect(roh).not.toContain("invalid");
  });

  it("Push 410 und 404: Anmeldung entfernt, endgültig; nie wieder gesendet", async () => {
    const m = betrieb({ nachrichten: [mitteilung("g1", "l1", { art: "offeneSchicht" })] });
    await abo(m, "l1");
    post.pushAntworten.push({ ok: false, erloschen: true, klasse: "erloschen", status: 410 });
    await stelleZu(m, ["g1"]);
    expect(await store.get(V.pushSchluessel(RAUM, m.id, "l1"), { type: "json" })).toBeNull();
    expect(await status(m, "g1", "push")).toMatchObject({ status: "uebersprungen", grund: "erloschen" });
    await stelleZu(m, ["g1"]);
    expect(post.pushes).toHaveLength(1);
  });

  it("Push dauerhaft (400/413): endgültig, Anmeldung bleibt; temporär (429): zurückgestellt", async () => {
    const m = betrieb({ nachrichten: [mitteilung("g2", "l1", { art: "offeneSchicht" }), mitteilung("g3", "p1", { art: "offeneSchicht" })] });
    await abo(m, "l1"); await abo(m, "p1");
    post.pushAntworten.push({ ok: false, klasse: "dauerhaft", status: 413 }, { ok: false, klasse: "temporaer", status: 429 });
    await stelleZu(m, ["g2", "g3"]);
    expect(await status(m, "g2", "push")).toMatchObject({ status: "gescheitert", grund: "dauerhaft", code: "http-413" });
    expect(await store.getMetadata(V.pushSchluessel(RAUM, m.id, "l1"))).not.toBeNull();
    expect(await status(m, "g3", "push")).toMatchObject({ status: "fehler", code: "http-429" });
  });
});

describe("Einstellungen je Person: Opt-out wirkt, nichts ohne Weg", () => {
  it("Art abgeschaltet, Kanal insgesamt abgeschaltet, anonymisierte Person: nichts geht hinaus", async () => {
    const personen = betrieb().personen.map((p) => {
      if (p.id === "a1") return { ...p, zustellung: { planGeaendert: { mail: false } } };
      if (p.id === "a2") return { ...p, zustellung: { kanal: { mail: false, push: false } } };
      return p;
    });
    const m = betrieb({ personen, nachrichten: [mitteilung("o1", "a1"), mitteilung("o2", "a2"), mitteilung("o3", "x1")] });
    await abo(m, "a2"); await abo(m, "x1");
    await stelleZu(m, ["o1", "o2", "o3"]);
    expect(post.mails).toEqual([]);
    expect(post.pushes).toEqual([]);
    expect(await status(m, "o1", "mail")).toMatchObject({ status: "uebersprungen", grund: "aus" });
    expect(await status(m, "o2", "mail")).toMatchObject({ status: "uebersprungen", grund: "aus" });
    expect(await status(m, "o2", "push")).toMatchObject({ status: "uebersprungen", grund: "aus" });
    expect(await status(m, "o3", "push")).toMatchObject({ status: "uebersprungen", grund: "keinWeg" });
  });

  it("nur ein ausdrückliches false schaltet den Sammelschalter aus (alles andere: Vorgabe der Art)", async () => {
    for (const kanal of [{}, { mail: null }, { mail: 0 }, { mail: "false" }, undefined])
      expect(R.kanalAus({ zustellung: { kanal } }, "mail")).toBe(false);
    expect(R.kanalAus({ zustellung: { kanal: { mail: false } } }, "mail")).toBe(true);
    expect(R.kanalAus({}, "mail")).toBe(false);
  });

  it("Standardwerte sind datensparsam: Nachweise (Qualifikation) nie per Mail, nie per Push", async () => {
    const { ZUSTELLARTEN } = await import("../server/lib/mitteilungen.mjs");
    expect(ZUSTELLARTEN.nachweisLaeuftAb).toMatchObject({ mail: false, push: false });
    expect(ZUSTELLARTEN.zeitFehlt.mail).toBe(false);
    expect(ZUSTELLARTEN.aushang.mail).toBe(false);
  });
});

describe("Rollen- und Mandantentrennung", () => {
  it("die Push-Anmeldung eines anderen Betriebs derselben Kennung wird nie benutzt", async () => {
    const mA = betrieb({ nachrichten: [mitteilung("t1", "a1", { art: "offeneSchicht" })] });
    const mB = { ...betrieb({ id: "m-b" }), personen: [person("a1", "mitarbeiter")] };
    await abo(mB, "a1", "andere.example/");                                  // Anmeldung der Person in Betrieb B
    await V.zustellen(store, { raum: RAUM, bestand: { mandanten: [mA, mB] }, m: mA, ids: ["t1"], jetzt: JETZT });
    expect(post.pushes).toEqual([]);
    expect(await status(mA, "t1", "push")).toMatchObject({ status: "uebersprungen", grund: "keinWeg" });
  });

  it("Mitteilung eines fremden Betriebs: gleiche Antwort wie unbekannt, nichts geht hinaus", async () => {
    const mA = betrieb({ nachrichten: [] });
    const mB = { ...betrieb({ id: "m-b" }), nachrichten: [mitteilung("t2", "a1")] };
    const r = await V.zustellen(store, { raum: RAUM, bestand: { mandanten: [mA, mB] }, m: mA, ids: ["t2", "gibt-es-nicht"], jetzt: JETZT });
    expect([...r.entries()]).toEqual([["t2", "erledigt"], ["gibt-es-nicht", "erledigt"]]);
    expect(post.mails).toEqual([]);
  });

  it("erlaubt(n, p) = false: nichts geht hinaus, kein Status", async () => {
    const m = betrieb({ nachrichten: [mitteilung("t3", "l1")] });
    await stelleZu(m, ["t3"], { erlaubt: () => false });
    expect(post.mails).toEqual([]);
    expect(await status(m, "t3", "mail")).toBeNull();
  });
});

describe("Inhalte: ein Hinweis mit Verweis in die Anwendung, sonst nichts", () => {
  const verboten = ["GEHEIMTITEL", "GEHEIMTEXT", "Medizin", "Nachb1", "Vorb1", "06:00", "Nacha1", "NOTIZ-GESUNDHEIT"];

  it("Mail und Push enthalten weder den gespeicherten Titel noch Text, weder Namen noch Zeiten noch Gesundheitsbezug", async () => {
    const m = betrieb({ nachrichten: [
      mitteilung("i1", "l1"), mitteilung("i2", "l1", { art: "zeitFehlt", text: "Ist-Zeit 05:58-14:03 offen" }),
      mitteilung("n-notruf-nr1-p1", "p1", { art: "einspringen", ziel: "notruf", titel: "NOTRUF: Medizinischer Notfall",
        text: "Vora1 Nacha1 · Dienst · Ort · NOTIZ-GESUNDHEIT" })] });
    await abo(m, "l1"); await abo(m, "p1");
    await stelleZu(m, ["i1", "i2", "n-notruf-nr1-p1"]);
    expect(post.mails.length).toBeGreaterThanOrEqual(2);
    expect(post.pushes.length).toBeGreaterThanOrEqual(3);
    for (const x of [...post.mails.map((e) => `${e.betreff}\n${e.text}`), ...post.pushes.map((e) => `${e.titel}\n${e.text}\n${e.ziel}`)])
      for (const v of verboten) expect(x, v).not.toContain(v);
    expect(post.pushes.find((e) => e.titel === "Dringende Mitteilung")).toBeTruthy();
    expect(post.mails.every((e) => e.text.includes("Öffnen: https://"))).toBe(true);
  });

  it("hinweis() liest nur die Art: gleiche Art, anderer Titel/Text → gleicher Hinweis", () => {
    expect(R.hinweis({ art: "planGeaendert", titel: "A", text: "B" })).toEqual(R.hinweis({ art: "planGeaendert", titel: "X", text: "Y" }));
    expect(R.hinweis({ art: "unbekannt-art" })).toEqual({ titel: "Neue Mitteilung", text: "Bitte in CENTRIC öffnen." });
    expect(R.hinweis({ art: "nachweisLaeuftAb" }).titel).toBe("Neue Mitteilung");   // kein Hinweis auf Qualifikationen
    expect(R.pushZiel({ ziel: "https://boese.example/" })).toBeNull();
    expect(R.pushZiel({ ziel: "tausch" })).toBe("tausch");
  });

  it("H8+: aus der Benachrichtigung lässt sich keine Ist-Zeit und kein Stempel ablesen, auch nicht für Schichtverantwortung", async () => {
    const m = betrieb({ personen: [...betrieb().personen, person("s1", "subplaner")],
      nachrichten: [mitteilung("h1", "s1", { art: "zeitFehlt", titel: "Zeiten offen: Nachb1 05:58", text: "Stempel 05:58 Nachb1" })] });
    await abo(m, "s1");
    await stelleZu(m, ["h1"]);
    expect(post.pushes).toHaveLength(1);
    expect(`${post.pushes[0].titel} ${post.pushes[0].text}`).not.toMatch(/\d{2}:\d{2}|Nachb1|Stempel/);
  });
});

describe("Entwurfsregel (WP-23): keine Mitteilung zu nicht freigegebenen Planmonaten an Beschäftigte", () => {
  /* Ferne Zukunft, damit die Prüfung nie „heute“ einholt. */
  const mFrei = (nachrichten) => betrieb({ nachrichten, einstellungen: { planFreigabePflicht: true }, freigaben: { "2099-12": { zeit: "x" } } });
  it("Entwurfsmonat: Beschäftigte nicht, Planung ja; freigegebener Monat: ja; ohne Tag: ja", async () => {
    const m = mFrei([mitteilung("e1", "a1", { tag: "2099-02-10" }), mitteilung("e2", "p1", { tag: "2099-02-10" }),
      mitteilung("e3", "a1", { tag: "2099-12-20" }), mitteilung("e4", "a2")]);
    await stelleZu(m, ["e1", "e2", "e3", "e4"]);
    expect(post.mails.map((e) => e.an).sort()).toEqual(["a1@kunde.example", "a2@kunde.example", "p1@kunde.example"]);
    expect(await status(m, "e1", "mail")).toMatchObject({ status: "uebersprungen", grund: "entwurf" });
    expect(await status(m, "e3", "mail")).toMatchObject({ status: "gesendet" });
  });
  it("ungültiger Tag gilt als Entwurf (fail-closed)", async () => {
    const m = mFrei([mitteilung("e5", "a1", { tag: "morgen" })]);
    await stelleZu(m, ["e5"]);
    expect(post.mails).toEqual([]);
    expect(await status(m, "e5", "mail")).toMatchObject({ grund: "entwurf" });
  });
  it("ein Betrieb ohne Planfreigabe behält das alte Verhalten (kein Entwurfsfilter)", async () => {
    const m = betrieb({ nachrichten: [mitteilung("e6", "a1", { tag: "2099-02-10" })] });
    await stelleZu(m, ["e6"]);
    expect(post.mails).toHaveLength(1);
  });
  it("heute und früher ist in Kraft; morgen im nicht freigegebenen Monat ist Entwurf; freigegebener Monat nicht; Planung sieht Entwürfe ohnehin", () => {
    const m = mFrei([]);
    const ma = { rolle: "mitarbeiter" };
    expect(R.betrifftEntwurf(m, { tag: "2099-11-10" }, ma, "2099-11-10")).toBe(false);
    expect(R.betrifftEntwurf(m, { tag: "2099-11-09" }, ma, "2099-11-10")).toBe(false);
    expect(R.betrifftEntwurf(m, { tag: "2099-11-11" }, ma, "2099-11-10")).toBe(true);
    expect(R.betrifftEntwurf(m, { tag: "2099-12-05" }, ma, "2099-11-10")).toBe(false);
    expect(R.betrifftEntwurf(m, { tag: "2099-11-11" }, { rolle: "leitung" }, "2099-11-10")).toBe(false);
  });
});

describe("Versandbremsen: Kontingente je Person und Betrieb und Tag, fail-closed", () => {
  it("Personengrenze: die dritte Mail am Tag wird nicht gesendet; dringende Arten sind ausgenommen", async () => {
    process.env.CENTRIC_ZUSTELL_PERSON_MAIL = "2";
    const m = betrieb({ nachrichten: ["k1", "k2", "k3"].map((id) => mitteilung(id, "l1", { art: "planFreigegeben", dringend: false }))
      .concat([mitteilung("k4", "l1", { art: "einspringen" })]) });
    await stelleZu(m, ["k1", "k2", "k3", "k4"]);
    expect(post.mails).toHaveLength(3);                                      // k1, k2, k4 (dringend)
    expect(await status(m, "k3", "mail")).toMatchObject({ status: "uebersprungen", grund: "kontingent" });
    expect(await status(m, "k4", "mail")).toMatchObject({ status: "gesendet" });
  });

  it("Betriebsgrenze gilt auch für dringende Arten; am nächsten Tag stehen wieder Plätze zur Verfügung", async () => {
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "2";
    const m = betrieb({ nachrichten: ["k5", "k6", "k7"].map((id, i) => mitteilung(id, i < 2 ? "l1" : "p1", { art: "einspringen" })) });
    await stelleZu(m, ["k5", "k6", "k7"]);
    expect(post.mails).toHaveLength(2);
    expect(await status(m, "k7", "mail")).toMatchObject({ grund: "kontingent" });
    const m2 = betrieb({ nachrichten: [mitteilung("k8", "l1", { erstellt: heuteIso(JETZT + 86400_000) })] });
    await stelleZu(m2, ["k8"], { jetzt: JETZT + 86400_000 });
    expect(post.mails).toHaveLength(3);
  });

  it("Grenze 0 sperrt den Kanal; Push hat eigene Grenzen", async () => {
    process.env.CENTRIC_ZUSTELL_BETRIEB_PUSH = "0";
    const m = betrieb({ nachrichten: [mitteilung("k9", "l1", { art: "offeneSchicht" })] });
    await abo(m, "l1");
    await stelleZu(m, ["k9"]);
    expect(post.pushes).toEqual([]);
    expect(await status(m, "k9", "push")).toMatchObject({ grund: "kontingent" });
  });

  it("gleichzeitige Anstöße überschreiten die Grenze nicht", async () => {
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "3";
    const m = betrieb({ nachrichten: Array.from({ length: 12 }, (_, i) => mitteilung(`kp${i}`, i % 2 ? "l1" : "p1", { art: "planFreigegeben" })) });
    await Promise.all(m.nachrichten.map((n) => stelleZu(m, [n.id])));
    expect(post.mails).toHaveLength(3);
  });

  it("fail-closed: antwortet die Ablage beim Kontingent nicht, geht nichts hinaus — zurückgestellt, nicht „frei“", async () => {
    const m = betrieb({ nachrichten: [mitteilung("k10", "l1")] });
    const kaputt = { ...store, setJSONWennNeu: async (k, d) => {
      if (k.startsWith("zustellquote:")) throw new Error("Ablage weg");
      return store.setJSONWennNeu(k, d);
    } };
    await V.zustellen(kaputt, { raum: RAUM, bestand: { mandanten: [m] }, m, ids: ["k10"], jetzt: JETZT });
    expect(post.mails).toEqual([]);
    expect(await status(m, "k10", "mail")).toMatchObject({ status: "fehler", code: "kontingent-unlesbar" });
  });
});

describe("Löschung, Aufbewahrung, Waisen", () => {
  it("personBereinigen: Anmeldung, Adresssperre, Kontingentplätze und Zustellstatus der Person sind weg", async () => {
    const m = betrieb({ nachrichten: [mitteilung("d1", "l1", { art: "planFreigegeben" }), mitteilung("d2", "p1", { art: "planFreigegeben" })] });
    await abo(m, "l1"); await abo(m, "p1");
    post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 422, ursache: "empfaenger" });
    await stelleZu(m, ["d1", "d2"]);
    await V.personBereinigen(store, RAUM, m.id, "l1", ["d1"]);
    expect(await store.getMetadata(V.pushSchluessel(RAUM, m.id, "l1"))).toBeNull();
    expect(await store.getMetadata(V.sperrSchluessel(RAUM, m.id, "l1"))).toBeNull();
    expect(await status(m, "d1", "mail")).toBeNull();
    expect((await store.list({ prefix: "zustellclaim:" })).blobs.some((b) => b.key.includes(V.statusSchluessel(RAUM, m.id, "d1", "mail").split(":")[3]))).toBe(false);
    expect((await store.list({ prefix: "zustellquote:" })).blobs.some((b) => /:p-/.test(b.key) && b.key.includes(`${m.id}:`))).toBe(true);   // p1 bleibt
    expect(await store.getMetadata(V.pushSchluessel(RAUM, m.id, "p1"))).not.toBeNull();
    expect(await status(m, "d2", "mail")).not.toBeNull();
  });

  it("Aufräumen: Zustellprotokoll nach der Frist weg (konfigurierbar), jüngeres bleibt; Vorschau löscht nichts", async () => {
    const m = betrieb({ nachrichten: [mitteilung("f1", "l1"), mitteilung("f2", "p1")] });
    await stelleZu(m, ["f1"], { jetzt: JETZT - 40 * 86400_000 });
    await stelleZu(m, ["f2"], { jetzt: JETZT - 5 * 86400_000 });
    let r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 30, trocken: true });
    expect(r.protokoll).toBe(2);
    expect(await status(m, "f1", "mail")).not.toBeNull();                      // Vorschau: nichts gelöscht
    r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 30 });
    expect(r.protokoll).toBe(2);
    expect(await status(m, "f1", "mail")).toBeNull();
    expect(await status(m, "f2", "mail")).not.toBeNull();
    r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 2 });
    expect(await status(m, "f2", "mail")).toBeNull();
    expect((await store.list({ prefix: "zustellclaim:" })).blobs).toHaveLength(0);
  });

  it("Aufräumen: Kontingentplätze früherer Tage weg", async () => {
    await store.setJSON(`zustellquote:${RAUM}:m-a:2026-12-01:mail:b:1`, { k: 1 });
    await store.setJSON(`zustellquote:${RAUM}:m-a:2026-12-10:mail:b:1`, { k: 1 });
    const r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 30 });
    expect(r.kontingent).toBe(1);
    expect(await store.getMetadata(`zustellquote:${RAUM}:m-a:2026-12-10:mail:b:1`)).not.toBeNull();
  });

  it("Aufräumen: Anmeldungen verschwundener oder anonymisierter Personen sind Waisen und werden entfernt, andere nicht", async () => {
    const m = betrieb();
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    await abo(m, "l1"); await abo(m, "gone"); await abo(m, "x1");
    await store.setJSON(V.pushSchluessel(RAUM, "m-weg", "l1"), { endpoint: "https://push.example/x" });
    await store.setJSON(`push:${RAUM}:a1`, { endpoint: "https://push.example/alt" });            // alter Schlüssel: nie benutzt, bleibt
    const r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 30 });
    expect(r.waisen).toBe(3);
    expect(await store.getMetadata(V.pushSchluessel(RAUM, m.id, "l1"))).not.toBeNull();
    for (const k of [V.pushSchluessel(RAUM, m.id, "gone"), V.pushSchluessel(RAUM, m.id, "x1"), V.pushSchluessel(RAUM, "m-weg", "l1")])
      expect(await store.getMetadata(k)).toBeNull();
  });

  it("Aufräumen: ein Raum, der nicht lesbar ist, führt nie zu einer Löschung", async () => {
    await store.setJSON(V.pushSchluessel("raum-unbekannt", "m-a", "l1"), { endpoint: "https://push.example/y" });
    const r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 30 });
    expect(r.waisen).toBe(0);
    expect(await store.getMetadata(V.pushSchluessel("raum-unbekannt", "m-a", "l1"))).not.toBeNull();
  });
});

describe("Zustandsanzeige und Auskunft", () => {
  it("/gesund: „konfiguriert“ ja/nein und Zähler; kein Wert, kein Empfänger, kein Text", async () => {
    process.env.RESEND_API_KEY = "schluessel-nur-zum-pruefen-MARKE1";
    process.env.CENTRIC_ABSENDER = "CENTRIC <post@kunde.example>";
    process.env.VAPID_PUBLIC = "oeffentlich-nur-zum-pruefen-MARKE2"; process.env.VAPID_PRIVATE = "privat-nur-zum-pruefen-MARKE3";
    try {
      G.zustandVergessen();
      const e = await G.zustand({ frisch: true });
      const roh = JSON.stringify(e);
      expect(e.pruefungen.zustellung.konfiguriert).toEqual({ mail: true, push: true });
      for (const geheim of ["MARKE1", "MARKE2", "MARKE3", "post@kunde", "kunde.example"]) expect(roh).not.toContain(geheim);
      expect(JSON.stringify(G.oeffentlich(e))).not.toContain("zustellung");
    } finally {
      for (const k of ["RESEND_API_KEY", "CENTRIC_ABSENDER", "VAPID_PUBLIC", "VAPID_PRIVATE"]) delete process.env[k];
      G.zustandVergessen();
    }
  });

  it("Alarmschwelle: dauerhaft fehlgeschlagene Zustellung (≥ Schwelle, mehr Fehler als Zustellungen) → Warnung; einzelne falsche Adressen nicht", async () => {
    G.zustandVergessen();
    let e = await G.zustand({ frisch: true });
    expect(e.pruefungen.zustellung.stufe).toBe("ok");
    for (let i = 0; i < 2; i++) Z.zustellEreignis("mail", "endgueltig");
    G.zustandVergessen();
    expect((await G.zustand({ frisch: true })).pruefungen.zustellung.stufe).toBe("ok");        // unter der Schwelle
    Z.zustellEreignis("mail", "endgueltig");
    G.zustandVergessen();
    expect((await G.zustand({ frisch: true })).pruefungen.zustellung.stufe).toBe("warnung");
    for (let i = 0; i < 5; i++) Z.zustellEreignis("mail", "zugestellt");
    G.zustandVergessen();
    expect((await G.zustand({ frisch: true })).pruefungen.zustellung.stufe).toBe("ok");        // es geht überwiegend durch
    Z.zustellZaehlungLeeren();
    Z.zustellEreignis("push", "konfiguration");
    G.zustandVergessen();
    expect((await G.zustand({ frisch: true })).pruefungen.zustellung.stufe).toBe("warnung");   // Schlüssel/Absender abgelehnt
    Z.zustellZaehlungLeeren(); G.zustandVergessen();
  });

  it("Zustellstatus der eigenen Person: Kennung, Kanal, Stand — ohne Inhalt und Adresse, nur eigene Mitteilungen", async () => {
    const m = betrieb({ nachrichten: [mitteilung("s1", "l1"), mitteilung("s2", "p1")] });
    post.mailAntworten.push({ ok: false, klasse: "temporaer", status: 500 });
    await stelleZu(m, ["s1", "s2"]);
    const liste = await V.zustellStatusEigene(store, RAUM, m, "l1");
    expect(liste.every((x) => x.nachricht === "s1")).toBe(true);
    expect(liste.find((x) => x.kanal === "mail")).toMatchObject({ stand: "zurueckgestellt", versuche: 1 });
    const roh = JSON.stringify(liste);
    for (const v of ["GEHEIM", "kunde.example", "Nacha", "http-"]) expect(roh).not.toContain(v);
  });
});

describe("Warteschlange und Takt sind verdrahtet (kein toter Code)", () => {
  it("server.mjs startet nachfassen() und das Zustellaufräumen, raumloeschung räumt die neuen Schlüssel", async () => {
    const { readFile } = await import("node:fs/promises");
    const server = await readFile(path.join(process.cwd(), "server.mjs"), "utf8");
    expect(server).toMatch(/nachfassen\(getStore/);
    expect(server).toMatch(/zustellungAufraeumen\(getStore/);
    const raum = await readFile(path.join(process.cwd(), "server/lib/raumloeschung.mjs"), "utf8");
    for (const p of ["zustellwarte:", "unzustellbar:", "zustellquote:", "zustellung:", "zustellclaim:", "push:"]) expect(raum).toContain("`" + p + "${raum}:`");
  });
});

/* ==========================================================================
   NACHTRAG OPUS-REVIEW WP-30 (B1–B4 und Hinweise)

   Jede Prüfung unten war vor der Behebung rot (Nachweis: docs/acc45/
   wp30-nachweis.md, Abschnitt „Nachtrag Opus-Review“).
   ========================================================================== */

const notrufMitteilung = (nrId, von, an, extra = {}) => mitteilung(`n-notruf-${nrId}-${an}`, an, { art: "einspringen", ziel: "notruf",
  titel: "NOTRUF: Hilfe angefordert", quelle: { art: "notruf", id: nrId, von }, ...extra });

describe("Nachtrag B1: ein Notruf geht nach Flut oder großem Versand nicht verloren", () => {
  beforeEach(() => {
    for (const k of ["CENTRIC_ZUSTELL_RESERVE_MAIL", "CENTRIC_ZUSTELL_RESERVE_PUSH", "CENTRIC_ZUSTELL_DRINGEND_PAAR_MAIL",
      "CENTRIC_ZUSTELL_DRINGEND_PAAR_PUSH", "CENTRIC_ZUSTELL_DRINGEND_QUELLE_MAIL", "CENTRIC_ZUSTELL_DRINGEND_QUELLE_PUSH", "CENTRIC_NOTRUF_JE_STUNDE"])
      delete process.env[k];
  });

  it("Monatsplan an 300 Personen: die Reserve für dringende Arten bleibt frei, der Notruf danach geht hinaus; der Rest ist zurückgestellt, nicht verworfen", async () => {
    const viele = Array.from({ length: 300 }, (_, i) => person(`v${i}`, "mitarbeiter"));
    const m = betrieb({ personen: [...betrieb().personen, ...viele],
      nachrichten: [...viele.map((p) => mitteilung(`mp-${p.id}`, p.id, { art: "planFreigegeben", dringend: false })),
        notrufMitteilung("nr-echt", "a2", "l1")] });
    await stelleZu(m, viele.map((p) => `mp-${p.id}`));
    const normal = post.mails.length;
    expect(normal).toBeGreaterThan(0);
    expect(normal).toBeLessThan(200);                                         // normale Arten verbrauchen die Reserve nicht
    await stelleZu(m, ["n-notruf-nr-echt-l1"]);
    expect(post.mails).toHaveLength(normal + 1);
    expect(await status(m, "n-notruf-nr-echt-l1", "mail")).toMatchObject({ status: "gesendet" });
    const zurueck = await status(m, "mp-v299", "mail");
    expect(zurueck).toMatchObject({ status: "fehler", grund: "kontingent" });  // zurückgestellt, nicht endgültig
    expect(V.anzeigeStatus(zurueck).stand).toBe("zurueckgestellt");
    expect(Date.parse(zurueck.naechster)).toBe(Date.parse("2026-12-10T23:00:00.000Z"));   // Mitternacht in Berlin
    expect(await store.getMetadata(V.warteSchluessel(RAUM, m.id, "mp-v299", "mail"))).not.toBeNull();
    const morgen = Date.parse("2026-12-11T07:00:00.000Z");
    await stelleZu(m, ["mp-v299"], { jetzt: morgen });                         // am nächsten Tag geht sie hinaus
    expect(await status(m, "mp-v299", "mail")).toMatchObject({ status: "gesendet" });
  }, 300_000);

  it("Notruf-Flut einer Person: je Empfänger und Quelle begrenzt; der Notruf einer anderen Person geht trotzdem hinaus", async () => {
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "40";
    process.env.CENTRIC_ZUSTELL_PERSON_MAIL = "3";
    const flut = Array.from({ length: 40 }, (_, i) => notrufMitteilung(`nr-f${i}`, "a1", i % 2 ? "l1" : "p1"));
    const m = betrieb({ nachrichten: [...flut, notrufMitteilung("nr-echt2", "a2", "l1")] });
    await stelleZu(m, flut.map((n) => n.id));
    expect(post.mails.filter((x) => x.an === "l1@kunde.example").length).toBeLessThanOrEqual(5);   // Flut-Schutz je Empfänger
    expect(post.mails.filter((x) => x.an === "p1@kunde.example").length).toBeLessThanOrEqual(5);
    await stelleZu(m, ["n-notruf-nr-echt2-l1"]);
    expect(await status(m, "n-notruf-nr-echt2-l1", "mail")).toMatchObject({ status: "gesendet" });
  });

  it("dringende Mitteilungen einer Quelle sind je Tag und Kanal begrenzt (über alle Empfänger)", async () => {
    process.env.CENTRIC_ZUSTELL_DRINGEND_QUELLE_MAIL = "6";
    const flut = Array.from({ length: 30 }, (_, i) => notrufMitteilung(`nr-q${i}`, "a1", ["l1", "p1", "a2"][i % 3]));
    const m = betrieb({ nachrichten: flut });
    await stelleZu(m, flut.map((n) => n.id));
    expect(post.mails.length).toBeLessThanOrEqual(6);
    expect(post.mails.length).toBeGreaterThan(0);
  });

  it("Kontingenttag nach Berliner Zeit (nicht UTC), Sommer und Winter; nächster Tag beginnt um Mitternacht in Berlin", () => {
    expect(R.kontingentTag(Date.parse("2026-12-10T23:30:00.000Z"))).toBe("2026-12-11");
    expect(R.kontingentTag(Date.parse("2026-07-10T22:30:00.000Z"))).toBe("2026-07-11");
    expect(R.kontingentTag(Date.parse("2026-07-10T21:59:00.000Z"))).toBe("2026-07-10");
    expect(R.naechsterKontingentTag(JETZT)).toBe(Date.parse("2026-12-10T23:00:00.000Z"));
    expect(R.naechsterKontingentTag(Date.parse("2026-07-10T10:00:00.000Z"))).toBe(Date.parse("2026-07-10T22:00:00.000Z"));
  });

  it("neue Notrufmitteilungen je Person und Stunde begrenzt (Server); der Notruf selbst bleibt gespeichert; eine andere Person ist nicht betroffen", async () => {
    const { mitteilungenErzeugen } = await import("../server/lib/mitteilungen.mjs");
    const jetzt = new Date().toISOString();
    const notrufe = [1, 2, 3].map((i) => ({ id: `nr-alt${i}`, personId: "a1", art: "hilfe", notiz: "", empfaenger: ["l1"] }));
    const alt = betrieb({ notrufe, nachrichten: [1, 2, 3].map((i) => notrufMitteilung(`nr-alt${i}`, "a1", "l1", { erstellt: jetzt })) });
    const neu = { ...alt, notrufe: [{ id: "nr-neu", personId: "a1", art: "hilfe", notiz: "", empfaenger: ["l1"] }, ...notrufe] };
    const aus = mitteilungenErzeugen(alt, neu, "a1");
    expect(aus.notrufe.some((n) => n.id === "nr-neu")).toBe(true);
    expect(aus.nachrichten.some((n) => n.id === "n-notruf-nr-neu-l1")).toBe(false);
    const neuB = { ...alt, notrufe: [{ id: "nr-b", personId: "a2", art: "hilfe", notiz: "", empfaenger: ["l1"] }, ...notrufe] };
    expect(mitteilungenErzeugen(alt, neuB, "a2").nachrichten.some((n) => n.id === "n-notruf-nr-b-l1")).toBe(true);
    const frueher = { ...alt, nachrichten: alt.nachrichten.map((n) => ({ ...n, erstellt: new Date(Date.now() - 2 * 3600_000).toISOString() })) };
    expect(mitteilungenErzeugen(frueher, { ...neu, nachrichten: frueher.nachrichten }, "a1").nachrichten
      .some((n) => n.id === "n-notruf-nr-neu-l1")).toBe(true);
    const leer = betrieb({ notrufe: [], nachrichten: [] });
    const fuenf = Array.from({ length: 5 }, (_, i) => ({ id: `nr-x${i}`, personId: "a1", art: "hilfe", notiz: "", empfaenger: ["l1"] }));
    const viele = mitteilungenErzeugen(leer, { ...leer, notrufe: fuenf }, "a1");
    expect(viele.notrufe).toHaveLength(5);
    expect(viele.nachrichten.filter((n) => String(n.id).startsWith("n-notruf-"))).toHaveLength(3);
  });
});

describe("Nachtrag B2: Konfigurationsfehler sperren keine Empfänger; Sperre nur bei ungültigem Empfänger; Betreff ohne Steuerzeichen", () => {
  beforeEach(() => { delete process.env.CENTRIC_PFEFFER; });

  it("422 ohne Empfängerursache (z. B. Absender oder Parameter): keine Adresssperre, die nächste Mitteilung geht hinaus", async () => {
    const m = betrieb({ nachrichten: [mitteilung("sa1", "l1"), mitteilung("sa2", "l1", { art: "planFreigegeben" })] });
    post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 422 });
    await stelleZu(m, ["sa1"]);
    expect(await store.getMetadata(V.sperrSchluessel(RAUM, m.id, "l1"))).toBeNull();
    await stelleZu(m, ["sa2"]);
    expect(post.mails).toHaveLength(2);
    expect(await status(m, "sa2", "mail")).toMatchObject({ status: "gesendet" });
  });

  it("Absenderfehler (Konfiguration): zurückgestellt, Betreiberalarm, keine Sperre", async () => {
    const m = betrieb({ nachrichten: [mitteilung("sa3", "l1")] });
    post.mailAntworten.push({ ok: false, klasse: "konfiguration", status: 422, ursache: "absender" });
    await stelleZu(m, ["sa3"]);
    expect(await status(m, "sa3", "mail")).toMatchObject({ status: "fehler", klasse: "konfiguration" });
    expect(Z.zustellZaehlung().mail.konfiguration).toBe(1);
    expect(await store.getMetadata(V.sperrSchluessel(RAUM, m.id, "l1"))).toBeNull();
  });

  it("eine Sperre ohne Ursache „empfaenger“ (alt, aus der falschen Einordnung) gilt nicht und wird beim Aufräumen entfernt", async () => {
    const { createHash } = await import("node:crypto");
    const m = betrieb({ nachrichten: [mitteilung("sa4", "l1")] });
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    const roh = createHash("sha256").update("l1@kunde.example").digest("hex").slice(0, 24);
    await store.setJSON(V.sperrSchluessel(RAUM, m.id, "l1"), { adresse: roh, zeit: "x" });
    await stelleZu(m, ["sa4"]);
    expect(post.mails).toHaveLength(1);
    const r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 30 });
    expect(r.sperren).toBe(1);
    expect(await store.getMetadata(V.sperrSchluessel(RAUM, m.id, "l1"))).toBeNull();
  });

  it("ungültiger Empfänger: Sperre mit Ursache und HMAC des Server-Schlüssels (kein reiner Hash); gilt bis zur Adressänderung", async () => {
    const { createHash, createHmac } = await import("node:crypto");
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-wp30-nachtrag";
    const m = betrieb({ nachrichten: [mitteilung("sa5", "l1"), mitteilung("sa6", "l1", { art: "planFreigegeben" })] });
    post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 422, ursache: "empfaenger" });
    await stelleZu(m, ["sa5"]);
    const sp = await store.get(V.sperrSchluessel(RAUM, m.id, "l1"), { type: "json" });
    expect(sp).toMatchObject({ ursache: "empfaenger" });
    expect(sp.adresse).toBe(createHmac("sha256", "pfeffer-nur-zum-pruefen-wp30-nachtrag").update("unzustellbar:l1@kunde.example").digest("hex").slice(0, 32));
    expect(sp.adresse).not.toContain(createHash("sha256").update("l1@kunde.example").digest("hex").slice(0, 24));
    expect(JSON.stringify(sp)).not.toContain("kunde.example");
    await stelleZu(m, ["sa6"]);
    expect(post.mails).toHaveLength(1);
    expect(await status(m, "sa6", "mail")).toMatchObject({ grund: "unzustellbar" });
  });

  it("Betreiberschalter: alle Adresssperren aufheben (nach einem Konfigurationsfix); in der Vorschau nur gezählt", async () => {
    const m = betrieb();
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 422, ursache: "empfaenger" });
    await stelleZu(betrieb({ nachrichten: [mitteilung("sa7", "l1")] }), ["sa7"]);
    expect(await store.getMetadata(V.sperrSchluessel(RAUM, m.id, "l1"))).not.toBeNull();
    let r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 30, sperrenAufheben: true, trocken: true });
    expect(r.sperren).toBe(1);
    expect(await store.getMetadata(V.sperrSchluessel(RAUM, m.id, "l1"))).not.toBeNull();
    r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 30 });
    expect(await store.getMetadata(V.sperrSchluessel(RAUM, m.id, "l1"))).not.toBeNull();     // gültige Sperre bleibt ohne Schalter
    r = await V.zustellungAufraeumen(store, { jetzt: JETZT, tage: 30, sperrenAufheben: true });
    expect(r.sperren).toBe(1);
    expect(await store.getMetadata(V.sperrSchluessel(RAUM, m.id, "l1"))).toBeNull();
  });

  it("Betriebsname mit Zeilenumbruch und Steuerzeichen: Betreff und Fußzeile bereinigt (keine Header-Injection)", async () => {
    const m = betrieb({ name: "Betrieb\r\nBcc: boese@angreifer.example\u0000\u0007" + String.fromCharCode(0x2028) + "X", nachrichten: [mitteilung("sa8", "l1")] });
    await stelleZu(m, ["sa8"]);
    expect(post.mails).toHaveLength(1);
    const { betreff, text } = post.mails[0];
    expect(betreff).not.toMatch(/[\u0000-\u001f\u007f-\u009f]|\u{2028}|\u{2029}/u);
    expect(text).not.toMatch(/[\r\u0000\u0007]|\u{2028}|\u{2029}/u);
    expect(text.split("\n").some((z) => /^Bcc:/i.test(z))).toBe(false);
    expect(betreff).toContain("Betrieb");
  });
});

describe("Nachtrag B3: Absturz zwischen Claim und Status; faire Warteschlange", () => {
  it("Absturz nach dem Claim, vor dem Status „offen“ (erster Versuch): nachfassen stellt nach der Frist genau einmal zu", async () => {
    const m = betrieb({ nachrichten: [mitteilung("cc1", "l1")] });
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    let abbrechen = true;
    const absturz = { ...store, setJSON: async (k, d, o) => {
      if (abbrechen && k.startsWith("zustellung:") && d.status === "offen") { abbrechen = false; throw new Error("Prozess abgebrochen"); }
      return store.setJSON(k, d, o);
    } };
    await V.zustellen(absturz, { raum: RAUM, bestand: { mandanten: [m] }, m, ids: ["cc1"], jetzt: JETZT });
    expect(post.mails).toHaveLength(0);
    await V.nachfassen(store, { jetzt: JETZT + 5 * 60_000 });
    expect(post.mails).toHaveLength(0);                                    // vor der Frist: nichts
    await V.nachfassen(store, { jetzt: JETZT + 16 * 60_000 });
    expect(post.mails).toHaveLength(1);
    expect(await status(m, "cc1", "mail")).toMatchObject({ status: "gesendet" });
    await V.nachfassen(store, { jetzt: JETZT + 5 * 3600_000 });
    expect(post.mails).toHaveLength(1);
    expect((await laden_warte()).length).toBe(0);
  });

  it("Absturz nach dem Claim eines Wiederholungsversuchs (Status „fehler“): kein ewig fälliger Wartesatz, der Versuch wird nach der Frist übernommen", async () => {
    process.env.CENTRIC_ZUSTELL_BACKOFF = "60,60";
    const m = betrieb({ nachrichten: [mitteilung("cc2", "l1")] });
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    post.mailAntworten.push({ ok: false, klasse: "temporaer", status: 503 });
    await stelleZu(m, ["cc2"]);
    let abbrechen = true;
    const absturz = { ...store, setJSON: async (k, d, o) => {
      if (abbrechen && k.startsWith("zustellung:") && d.status === "offen") { abbrechen = false; throw new Error("Prozess abgebrochen"); }
      return store.setJSON(k, d, o);
    } };
    await V.nachfassen(absturz, { jetzt: JETZT + 61_000 });
    expect(post.mails).toHaveLength(1);
    await V.nachfassen(store, { jetzt: JETZT + 61_000 + 16 * 60_000 });
    expect(post.mails).toHaveLength(2);
    expect(await status(m, "cc2", "mail")).toMatchObject({ status: "gesendet" });
    expect((await laden_warte()).length).toBe(0);
  });

  it("nachfassen ist fair: älteste Fälligkeit zuerst; ein hängender Satz belegt nicht jeden Takt den Platz", async () => {
    const m = betrieb({ nachrichten: [mitteilung("fa1", "l1")] });
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    await store.setJSON(V.warteSchluessel("a-unlesbar", "m-a", "x", "mail"),
      { raum: "a-unlesbar", mandantId: "m-a", nid: "x", kanal: "mail", naechster: heuteIso(JETZT - 60_000) });
    await store.setJSON(V.warteSchluessel(RAUM, m.id, "fa1", "mail"),
      { raum: RAUM, mandantId: m.id, nid: "fa1", kanal: "mail", naechster: heuteIso(JETZT - 1000) });
    await V.nachfassen(store, { jetzt: JETZT, max: 1 });
    await V.nachfassen(store, { jetzt: JETZT + 1000, max: 1 });
    expect(post.mails).toHaveLength(1);
    expect(await status(m, "fa1", "mail")).toMatchObject({ status: "gesendet" });
    expect(await store.getMetadata(V.warteSchluessel("a-unlesbar", "m-a", "x", "mail"))).not.toBeNull();   // bleibt, nie „entfallen“
  });

  it("ein Wartesatz zu einer endgültigen Mitteilung wird geräumt, ihr Status nie überschrieben", async () => {
    const m = betrieb({ nachrichten: [mitteilung("fa2", "l1")] });
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    await stelleZu(m, ["fa2"]);
    await store.setJSON(V.warteSchluessel(RAUM, m.id, "fa2", "mail"),
      { raum: RAUM, mandantId: m.id, nid: "fa2", kanal: "mail", naechster: heuteIso(JETZT - 1000) });
    await V.nachfassen(store, { jetzt: JETZT });
    expect((await laden_warte()).length).toBe(0);
    expect(await status(m, "fa2", "mail")).toMatchObject({ status: "gesendet" });
    expect(post.mails).toHaveLength(1);
  });
});

describe("Nachtrag B4: ein Kontingentplatz je Mitteilung und Kanal, nicht je Versuch", () => {
  it("Ausfall des Anbieters frisst kein Kontingent: drei Versuche derselben Mitteilung belegen einen Platz", async () => {
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "2";
    const m = betrieb({ nachrichten: [mitteilung("q1", "l1", { art: "planFreigegeben" }), mitteilung("q2", "p1", { art: "planFreigegeben" })] });
    post.mailAntworten.push({ ok: false, klasse: "temporaer", status: 503 }, { ok: false, klasse: "temporaer", status: 503 });
    await stelleZu(m, ["q1"]);
    await stelleZu(m, ["q1"]);
    await stelleZu(m, ["q1"]);
    expect(await status(m, "q1", "mail")).toMatchObject({ status: "gesendet", versuche: 3 });
    await stelleZu(m, ["q2"]);
    expect(await status(m, "q2", "mail")).toMatchObject({ status: "gesendet" });
    expect(post.mails).toHaveLength(4);
  });
});

describe("Nachtrag Hinweis: nachfassen und parallele Raumlöschung", () => {
  it("nach einer Raumlöschung schreibt nachfassen keinen Status „entfallen“ neu an", async () => {
    process.env.CENTRIC_ZUSTELL_BACKOFF = "60";
    const m = betrieb({ nachrichten: [mitteilung("rl-b", "l1")] });
    await B.bestandSchreiben(store, "rl", { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    await store.setJSON(V.warteSchluessel("rl", m.id, "rl-b", "mail"), { raum: "rl", mandantId: m.id, nid: "rl-b", kanal: "mail", naechster: heuteIso(JETZT - 2000) });
    await store.setJSON(V.warteSchluessel("rl", m.id, "rl-a", "mail"), { raum: "rl", mandantId: m.id, nid: "rl-a", kanal: "mail", naechster: heuteIso(JETZT - 1000) });
    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    post.beimSenden = async () => { post.beimSenden = null; await raumLoeschen(store, store, "rl"); };
    await V.nachfassen(store, { jetzt: JETZT });
    expect(post.mails).toHaveLength(1);
    expect(await store.getMetadata(V.statusSchluessel("rl", m.id, "rl-a", "mail"))).toBeNull();
  });
});

/* ==========================================================================
   NACHTRAG 2 — DELTA-REVIEW WP-30 (F1–F8)

   Welche Prüfung auf dem Stand 3931427 rot war, steht im Nachweis
   (docs/acc45/wp30-nachweis.md, Abschnitt 11).
   ========================================================================== */

const hKurz = async (s) => (await import("node:crypto")).createHash("sha256").update(String(s)).digest("hex").slice(0, 24);
const FLUT_GRENZEN = ["CENTRIC_ZUSTELL_RESERVE_MAIL", "CENTRIC_ZUSTELL_RESERVE_PUSH", "CENTRIC_ZUSTELL_DRINGEND_PAAR_MAIL",
  "CENTRIC_ZUSTELL_DRINGEND_PAAR_PUSH", "CENTRIC_ZUSTELL_DRINGEND_QUELLE_MAIL", "CENTRIC_ZUSTELL_DRINGEND_QUELLE_PUSH"];

describe("Nachtrag 2 F1: die Reserve gehört echten Notrufen, nicht allen dringenden Arten", () => {
  beforeEach(() => { for (const k of FLUT_GRENZEN) delete process.env[k]; });

  it("200 × „Dienstplan geändert“ (dringend, ohne Quelle) leeren die Reserve nicht: der Notruf danach geht hinaus", async () => {
    const viele = Array.from({ length: 200 }, (_, i) => person(`g${i}`, "mitarbeiter"));
    const m = betrieb({ personen: [...betrieb().personen, ...viele],
      nachrichten: [...viele.map((p) => mitteilung(`pg-${p.id}`, p.id)), notrufMitteilung("nr-f1", "a2", "l1")] });
    await stelleZu(m, viele.map((p) => `pg-${p.id}`));
    const vorher = post.mails.length;
    expect(vorher).toBeGreaterThan(0);
    expect(vorher).toBeLessThan(200);                                          // nur der nicht reservierte Teil
    expect(await status(m, "pg-g199", "mail")).toMatchObject({ status: "fehler", grund: "kontingent" });
    await stelleZu(m, ["n-notruf-nr-f1-l1"]);
    expect(await status(m, "n-notruf-nr-f1-l1", "mail")).toMatchObject({ status: "gesendet" });
    expect(post.mails).toHaveLength(vorher + 1);
  }, 300_000);

  it("eine dringende Art ohne Quelle nimmt die Reserve auch bei kleiner Grenze nicht; ein Notruf schon", async () => {
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "8";                              // Reserve 2
    const m = betrieb({ nachrichten: [...Array.from({ length: 8 }, (_, i) => mitteilung(`pk${i}`, i % 2 ? "l1" : "p1", { art: "einspringen" })),
      notrufMitteilung("nr-k1", "a1", "l1"), notrufMitteilung("nr-k2", "a2", "p1")] });
    await stelleZu(m, m.nachrichten.slice(0, 8).map((n) => n.id));
    expect(post.mails).toHaveLength(6);
    await stelleZu(m, ["n-notruf-nr-k1-l1", "n-notruf-nr-k2-p1"]);
    expect(post.mails).toHaveLength(8);
  });
});

describe("Nachtrag 2 F5/F6: Flut-Schutz zählt Notrufe; Notrufe über der Grenze zurückgestellt; Zurückgestelltes belegt keine Plätze", () => {
  beforeEach(() => { for (const k of FLUT_GRENZEN) delete process.env[k]; });

  it("F5: die Grenze je Quelle zählt Notrufe, nicht Mails — ein Notruf an drei Empfänger zählt einmal", async () => {
    process.env.CENTRIC_ZUSTELL_DRINGEND_QUELLE_MAIL = "1";
    const m = betrieb({ personen: [...betrieb().personen, person("s1", "subplaner")],
      nachrichten: ["l1", "p1", "s1"].map((an) => notrufMitteilung("nr-d1", "a1", an)).concat([notrufMitteilung("nr-d2", "a1", "l1")]) });
    await stelleZu(m, ["n-notruf-nr-d1-l1", "n-notruf-nr-d1-p1", "n-notruf-nr-d1-s1"]);
    expect(post.mails.map((x) => x.an).sort()).toEqual(["l1@kunde.example", "p1@kunde.example", "s1@kunde.example"]);
    await stelleZu(m, ["n-notruf-nr-d2-l1"]);                                   // zweiter Notruf derselben Quelle
    expect(post.mails).toHaveLength(3);
    const st = await status(m, "n-notruf-nr-d2-l1", "mail");
    expect(st).toMatchObject({ status: "fehler", grund: "kontingent" });          // zurückgestellt, nicht verworfen
    expect(Date.parse(st.naechster)).toBe(Date.parse("2026-12-10T23:00:00.000Z"));
    expect(await store.getMetadata(V.warteSchluessel(RAUM, m.id, "n-notruf-nr-d2-l1", "mail"))).not.toBeNull();
  });

  it("F5: Notruf über der Grenze je Empfänger und Quelle: zurückgestellt bis zum nächsten Tag, nicht verworfen", async () => {
    process.env.CENTRIC_ZUSTELL_DRINGEND_PAAR_MAIL = "1";
    const m = betrieb({ nachrichten: [notrufMitteilung("nr-p1", "a1", "l1"), notrufMitteilung("nr-p2", "a1", "l1")] });
    await stelleZu(m, ["n-notruf-nr-p1-l1", "n-notruf-nr-p2-l1"]);
    expect(post.mails).toHaveLength(1);
    expect(await status(m, "n-notruf-nr-p2-l1", "mail")).toMatchObject({ status: "fehler", grund: "kontingent" });
    const morgen = Date.parse("2026-12-11T07:00:00.000Z");
    await stelleZu(m, ["n-notruf-nr-p2-l1"], { jetzt: morgen });
    expect(await status(m, "n-notruf-nr-p2-l1", "mail")).toMatchObject({ status: "gesendet" });
  });

  it("F6: ein wegen der Betriebsgrenze zurückgestellter Versuch belegt keinen Platz der Person", async () => {
    process.env.CENTRIC_ZUSTELL_PERSON_MAIL = "1";
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "1";
    const normal = { art: "planFreigegeben", dringend: false };
    const m = betrieb({ nachrichten: [mitteilung("f6a", "l1", normal), mitteilung("f6b", "p1", normal), mitteilung("f6c", "p1", normal)] });
    await stelleZu(m, ["f6a", "f6b"]);
    expect(await status(m, "f6b", "mail")).toMatchObject({ status: "fehler", grund: "kontingent" });
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "5";
    await stelleZu(m, ["f6c"]);
    expect(await status(m, "f6c", "mail")).toMatchObject({ status: "gesendet" });
  });

  it("F6: ein zurückgestellter Notruf belegt keinen Platz der Quelle", async () => {
    process.env.CENTRIC_ZUSTELL_DRINGEND_QUELLE_MAIL = "1";
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "0";
    const m = betrieb({ nachrichten: [notrufMitteilung("nr-e1", "a1", "l1"), notrufMitteilung("nr-e2", "a1", "p1")] });
    await stelleZu(m, ["n-notruf-nr-e1-l1"]);
    expect(await status(m, "n-notruf-nr-e1-l1", "mail")).toMatchObject({ status: "fehler", grund: "kontingent" });
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "10";
    await stelleZu(m, ["n-notruf-nr-e2-p1"]);
    expect(await status(m, "n-notruf-nr-e2-p1", "mail")).toMatchObject({ status: "gesendet" });
  });
});

describe("Nachtrag 2 F3: frische Zeit je Satz; Übernahme eines abgestürzten Claims mit demselben Idempotenzschlüssel", () => {
  it("Übernahme: der Versuch, dessen Ausgang unbekannt ist, geht mit SEINEM Idempotenzschlüssel hinaus", async () => {
    const m = betrieb({ nachrichten: [mitteilung("f3a", "l1")] });
    const hh = await hKurz("f3a");
    await store.setJSON(`zustellclaim:${RAUM}:${m.id}:${hh}:mail:1`, { zeit: heuteIso(JETZT - 20 * 60_000) });
    await stelleZu(m, ["f3a"]);
    expect(post.mails).toHaveLength(1);
    expect(post.mails[0].idempotenz).toBe(`${hh}-mail-1`);
    expect(await status(m, "f3a", "mail")).toMatchObject({ status: "gesendet", versuche: 2 });
  });

  it("nachfassen: ein langer Durchgang schreibt Claim und Status mit der Zeit des Satzes, nicht der des Anfangs", async () => {
    const m = betrieb({ nachrichten: [mitteilung("f3b", "l1"), mitteilung("f3c", "p1")] });
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    for (const [nid, d] of [["f3b", 2000], ["f3c", 1000]])
      await store.setJSON(V.warteSchluessel(RAUM, m.id, nid, "mail"), { raum: RAUM, mandantId: m.id, nid, kanal: "mail", naechster: heuteIso(JETZT - d) });
    const echt = Date.now;
    let versatz = 0;
    const uhr = vi.spyOn(Date, "now").mockImplementation(() => echt.call(Date) + versatz);
    post.beimSenden = async () => { post.beimSenden = null; versatz = 20 * 60_000; };   // der erste Versand dauert 20 Minuten
    try { await V.nachfassen(store, { jetzt: JETZT }); } finally { uhr.mockRestore(); }
    expect(post.mails).toHaveLength(2);
    const st = await status(m, "f3c", "mail");
    expect(Date.parse(st.zeit)).toBeGreaterThanOrEqual(JETZT + 20 * 60_000);
    const claim = await store.get(`zustellclaim:${RAUM}:${m.id}:${await hKurz("f3c")}:mail:1`, { type: "json" });
    expect(Date.parse(claim.zeit)).toBeGreaterThanOrEqual(JETZT + 20 * 60_000);
  });

  it("zustellen mit mehreren Mitteilungen: Claim und Status der späteren tragen die Zeit ihres Schreibens", async () => {
    const m = betrieb({ nachrichten: [mitteilung("f3d", "l1"), mitteilung("f3e", "p1")] });
    const echt = Date.now;
    let versatz = 0;
    const uhr = vi.spyOn(Date, "now").mockImplementation(() => echt.call(Date) + versatz);
    post.beimSenden = async () => { post.beimSenden = null; versatz = 20 * 60_000; };
    try { await stelleZu(m, ["f3d", "f3e"]); } finally { uhr.mockRestore(); }
    expect(post.mails).toHaveLength(2);
    expect(Date.parse((await status(m, "f3e", "mail")).zeit)).toBeGreaterThanOrEqual(JETZT + 20 * 60_000);
    const claim = await store.get(`zustellclaim:${RAUM}:${m.id}:${await hKurz("f3e")}:mail:1`, { type: "json" });
    expect(Date.parse(claim.zeit)).toBeGreaterThanOrEqual(JETZT + 20 * 60_000);
  });
});

describe("Nachtrag 2 F4: Notrufe und dringende Arten als Push mit hoher Dringlichkeit", () => {
  it("Notruf und „Dienstplan geändert“: dringend; „Plan freigegeben“: nicht", async () => {
    const m = betrieb({ nachrichten: [notrufMitteilung("nr-u", "a1", "l1"), mitteilung("u2", "l1"), mitteilung("u3", "l1", { art: "planFreigegeben", dringend: false })] });
    await abo(m, "l1");
    await stelleZu(m, ["n-notruf-nr-u-l1", "u2", "u3"]);
    expect(post.pushes.map((x) => x.dringend)).toEqual([true, true, false]);
  });
});

describe("Nachtrag 2 F7: Adresssperre in der Auslieferung nur mit Server-Schlüssel", () => {
  it("NODE_ENV=production ohne CENTRIC_PFEFFER: keine Sperre geschrieben, kein Rückfall auf den reinen Hash", async () => {
    const vorher = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.CENTRIC_PFEFFER;
    try {
      const m = betrieb({ nachrichten: [mitteilung("f7a", "l1"), mitteilung("f7b", "l1", { art: "planFreigegeben" })] });
      post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 422, ursache: "empfaenger" });
      await stelleZu(m, ["f7a"]);
      expect(await status(m, "f7a", "mail")).toMatchObject({ status: "gescheitert", grund: "dauerhaft" });
      expect(await store.getMetadata(V.sperrSchluessel(RAUM, m.id, "l1"))).toBeNull();
      /* Eine Sperre mit dem reinen Hash (aus einem Lauf ohne Schlüssel) gilt in der Auslieferung nicht. */
      await store.setJSON(V.sperrSchluessel(RAUM, m.id, "l1"), { adresse: await hKurz("l1@kunde.example"), ursache: "empfaenger", zeit: "x" });
      await stelleZu(m, ["f7b"]);
      expect(await status(m, "f7b", "mail")).toMatchObject({ status: "gesendet" });
    } finally {
      if (vorher === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = vorher;
    }
  });
});

describe("Nachtrag 2 F8: Betreff und Fußzeile ohne C1-Steuerzeichen", () => {
  it("einzeilig entfernt C1-Steuerzeichen und DEL (nicht nur C0)", () => {
    expect(R.einzeilig("A\u0085B\u009bC\u007fD\u0080E")).toBe("A B C D E");
  });

  it("Betriebsname mit C1-Steuerzeichen: Betreff und Text ohne C1", async () => {
    const m = betrieb({ name: "Betrieb\u009b31mX\u0085Y", nachrichten: [mitteilung("f8a", "l1")] });
    await stelleZu(m, ["f8a"]);
    expect(post.mails[0].betreff).not.toMatch(/[\u007f-\u009f]/);
    expect(post.mails[0].text).not.toMatch(/[\u007f-\u009f]/);
  });
});

describe("Nachtrag 2 F2: der Takt kann nicht dauerhaft hängen", () => {
  it("server.mjs gibt den Merker des laufenden Durchgangs in finally frei und begrenzt die Laufzeit", async () => {
    const { readFile } = await import("node:fs/promises");
    const server = await readFile(path.join(process.cwd(), "server.mjs"), "utf8");
    expect(server).toMatch(/finally \{ nachfassenLaeuft = false; \}/);
    expect(server).toMatch(/nachfassen\(getStore\([^)]*\), \{ bis: /);
  });

  it("nachfassen hält eine Frist ein: nach `bis` wird kein weiterer Satz begonnen, die Sätze bleiben fällig", async () => {
    const m = betrieb({ nachrichten: [mitteilung("f2a", "l1"), mitteilung("f2b", "p1")] });
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m] }, { durch: "Pruefung" });
    for (const nid of ["f2a", "f2b"])
      await store.setJSON(V.warteSchluessel(RAUM, m.id, nid, "mail"), { raum: RAUM, mandantId: m.id, nid, kanal: "mail", naechster: heuteIso(JETZT - 1000) });
    await V.nachfassen(store, { jetzt: JETZT, bis: Date.now() - 1 });
    expect(post.mails).toHaveLength(0);
    expect((await laden_warte()).length).toBe(2);
    await V.nachfassen(store, { jetzt: JETZT, bis: Date.now() + 60_000 });
    expect(post.mails).toHaveLength(2);
  });
});
