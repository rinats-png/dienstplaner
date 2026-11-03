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

const post = vi.hoisted(() => ({ mails: [], pushes: [], mailAntworten: [], pushAntworten: [], gesendetNurEinmalBeiKey: false, keys: new Set() }));
vi.mock("../server/lib/post.mjs", async (original) => ({
  ...(await original()),
  sendeMail: async (an, betreff, text, opt = {}) => {
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
    post.pushes.push({ endpoint: anmeldung && anmeldung.endpoint, titel, text, ziel, topic: opt.topic });
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
const leere = () => { post.mails.length = 0; post.pushes.length = 0; post.mailAntworten.length = 0; post.pushAntworten.length = 0; post.keys.clear(); };
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
    post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 422 });
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
    post.mailAntworten.push({ ok: false, klasse: "dauerhaft", status: 422 });
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
