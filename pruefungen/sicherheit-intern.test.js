/* ==========================================================================
   INTERNE SICHERHEITSPRÜFUNG 2026-11 — Regressionstests der behobenen Befunde
   (docs/acc45/SICHERHEIT-INTERN-2026-11.md)

   SI-01  SSRF über den Push-Endpunkt: Der Server sprach jeden https-Host an,
          den ein Client als Push-Anmeldung hinterlegte (auch 127.0.0.1,
          10.x, [::1], beliebige Ports).
   SI-02  CSV-Exporte für Lohnstelle/DATEV ohne Schutz gegen Formel-Injection
          (=, +, -, @ am Anfang eines Namens) und teils ohne Maskierung des
          Trennzeichens.
   SI-03  Aushangplan-Druck schrieb Betriebs-, Einheiten- und Dienstartnamen
          unmaskiert als HTML in ein gleich-originiges Fenster.
   SI-04  Push-Klick öffnete „//fremder-host“ (beginnt mit „/“) als fremde
          Adresse.
   SI-05  window.open auf Fremdseiten (WhatsApp/SMS/Mail) ohne noopener.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const quelle = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

/* ---------------------------------------------------------------- SI-01 */
describe("SI-01 Push-Endpunkt nur bei bekannten Push-Diensten", () => {
  const ERLAUBT = [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://push.example/test",
  ];
  const VERBOTEN = [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://127.0.0.1/x", "https://127.0.0.1:3000/api/bestand", "https://10.0.0.5/x",
    "https://[::1]/x", "https://169.254.169.254/latest/meta-data",
    "https://localhost/x", "https://intern.firma.de/x",
    "https://fcm.googleapis.com:8443/x", "https://nutzer:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com.boese.de/x", "https://evilpush.apple.com.de/x",
    "https://push.apple.com/x",       // nur Unterdomänen
    "nicht-url", 42, null,
  ];
  it("Prüffunktion: erlaubt nur bekannte Dienste", async () => {
    const { pushEndpunktErlaubt } = await import("../server/lib/pushziel.mjs");
    for (const e of ERLAUBT) expect(pushEndpunktErlaubt(e), e).toBe(true);
    for (const e of VERBOTEN) expect(pushEndpunktErlaubt(e), String(e)).toBe(false);
  });

  it("sendePush spricht einen internen Endpunkt nie an (auch alte Anmeldungen)", async () => {
    const alt = { pub: process.env.VAPID_PUBLIC, priv: process.env.VAPID_PRIVATE };
    process.env.VAPID_PUBLIC = "nur-zum-pruefen"; process.env.VAPID_PRIVATE = "nur-zum-pruefen";
    try {
      const { sendePush } = await import("../server/lib/webpush.mjs");
      const r = await sendePush({ endpoint: "https://127.0.0.1:3000/intern", keys: {} }, "t", "x", null);
      expect(r).toMatchObject({ ok: false, erloschen: true, fehler: "push-ziel-nicht-erlaubt" });
    } finally {
      if (alt.pub === undefined) delete process.env.VAPID_PUBLIC; else process.env.VAPID_PUBLIC = alt.pub;
      if (alt.priv === undefined) delete process.env.VAPID_PRIVATE; else process.env.VAPID_PRIVATE = alt.priv;
    }
  });

  describe("über den echten Handler /zustellung/anmelden", () => {
    const WIRT = "127.0.0.1:3000";
    let wurzel, laden, daten, zustellung, token;
    const anfrage = async (handler, pfad, rumpf, t) => {
      const kopf = { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json", "x-forwarded-for": "10.9.9.9" };
      if (t) kopf.authorization = `Bearer ${t}`;
      const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: "POST", headers: kopf, body: JSON.stringify(rumpf) }), {});
      const text = await a.text(); let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
      return { status: a.status, ...d };
    };
    beforeAll(async () => {
      wurzel = await mkdtemp(path.join(tmpdir(), "centric-sicherheit-intern-"));
      process.env.CENTRIC_DATEN = wurzel;
      process.env.CENTRIC_ABLAGE = "dateien";
      process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
      const { getStore } = await import("../server/lib/ablage.mjs");
      laden = () => getStore({ name: "centric", consistency: "strong" });
      daten = (await import("../server/funktionen/daten.mjs")).default;
      zustellung = (await import("../server/funktionen/zustellung.mjs")).default;
      const { kontoSchreiben } = await import("../server/lib/konten.mjs");
      const { ablageSchluessel } = await import("../server/lib/codes.mjs");
      const B = await import("../server/lib/bestand.mjs");
      await B.bestandSchreiben(laden(), "sich", { version: 9, mandanten: [{ id: "m-a", name: "A", einheiten: [{ id: "e1" }],
        personen: [{ id: "l1", vorname: "V", nachname: "N", rolle: "leitung", bereich: "ALLE",
          zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }], nachrichten: [], notrufe: [], anfragen: [] }] }, { durch: "Pruefung" });
      await kontoSchreiben(laden(), ablageSchluessel("SICH-LLLL-0001"), { name: "leitung l1", bestand: "sich", rolle: "leitung",
        person: "l1", betrieb: 0, mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
      token = (await anfrage(daten, "/api/anmelden", { zugangscode: "SICH-LLLL-0001" })).token;
      expect(token).toBeTruthy();
    }, 120000);
    afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

    it("interne Ziele werden mit 400 abgewiesen und nicht gespeichert", async () => {
      for (const endpoint of ["https://127.0.0.1:3000/api/bestand", "https://10.0.0.1/", "https://[::1]/", "https://intern.lan/x"]) {
        const r = await anfrage(zustellung, "/zustellung/anmelden", { anmeldung: { endpoint, keys: {} } }, token);
        expect(r.status, endpoint).toBe(400);
      }
      expect(await laden().get("push:sich:m-a:l1", { type: "json" })).toBeNull();
    });
    /* SI-06: Eine Betreibersitzung konnte über /api/zugaenge neue
       Betreiber-Codes (ohne Ablauf) und Codes mit erfundenen Rollen prägen. */
    it("SI-06 /api/zugaenge: keine Betreiber-Codes, keine unbekannten Rollen", async () => {
      const { kontoSchreiben } = await import("../server/lib/konten.mjs");
      const { ablageSchluessel } = await import("../server/lib/codes.mjs");
      await kontoSchreiben(laden(), ablageSchluessel("SICH-BTRB-0002"), { name: "Betreiber", bestand: "sich", rolle: "betreiber",
        person: null, betrieb: 0, angelegt: "2026-01-01T00:00:00.000Z" });
      const tB = (await anfrage(daten, "/api/anmelden", { zugangscode: "SICH-BTRB-0002" })).token;
      expect(tB).toBeTruthy();
      for (const rolle of ["betreiber", "gott", "__proto__"]) {
        const r = await anfrage(daten, "/api/zugaenge", { bestand: "sich", eintraege: [{ rolle }] }, tB);
        expect(r.status, rolle).toBe(400);
        expect(r.zugaenge).toBeUndefined();
      }
      const ok = await anfrage(daten, "/api/zugaenge", { bestand: "sich", eintraege: [{ rolle: "leitung" }] }, tB);
      expect(ok.status).toBe(200);
      expect(ok.zugaenge.map((z) => z.rolle)).toEqual(["leitung"]);
    });

    it("ein bekannter Push-Dienst wird angenommen", async () => {
      const r = await anfrage(zustellung, "/zustellung/anmelden",
        { anmeldung: { endpoint: "https://fcm.googleapis.com/fcm/send/xyz", keys: {} } }, token);
      expect(r.status).toBe(200);
    });
  });
});

/* ---------------------------------------------------------------- SI-02 */
describe("SI-02 CSV-Exporte gegen Formel-Injection", () => {
  let app;
  beforeAll(async () => { app = await quelle("src/App.jsx"); });
  const block = (anfang, laenge = 1600) => { const i = app.indexOf(anfang); expect(i, anfang).toBeGreaterThan(-1); return app.slice(i, i + laenge); };

  it("Zuschlags-Export: Namen, Personalnummer und Regelnamen über csvText", () => {
    const b = block("exportZuschlaege:");
    expect(b).toMatch(/csvText\(p\.nachname\)/);
    expect(b).toMatch(/csvText\(p\.vorname\)/);
    expect(b).toMatch(/kopf\.map\(csvText\)/);
  });
  it("Monats-CSV: Namen und Einheit über csvText", () => {
    const b = block("exportCSV: () =>");
    expect(b).toMatch(/csvText\(p\.nachname\)/);
    expect(b).toMatch(/csvText\(p\.vorname\)/);
    expect(b).toMatch(/csvText\(e \? e\.name : ""\)/);
  });
  it("DATEV-CSV: Textfelder über csvText", () => {
    const b = block("function datevCSV(", 1200);
    expect(b).toMatch(/csvText\(x\.nachname\)/);
    expect(b).toMatch(/csvText\(x\.bezeichnung\)/);
  });
  it("Tabellen-CSV (Datenmitnahme): Text über csvText, Zahlen über csvFeld", () => {
    const b = block("function tabelleCSV(", 700);
    expect(b).toMatch(/typeof v === "number" \? csvFeld\(v\) : csvText\(v\)/);
  });
  it("csvText selbst neutralisiert Formeln und maskiert Trennzeichen", async () => {
    const { csvText } = await import("../src/csvfeld.js");
    expect(csvText("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvText("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvText("a;b")).toBe("\"a;b\"");
  });
});

/* ---------------------------------------------------------------- SI-03 */
describe("SI-03 Aushangplan-Druck maskiert Daten aus dem Bestand", () => {
  it("Betrieb, Einheit, Dienstart und Farbe gehen maskiert/geprüft ins HTML", async () => {
    const app = await quelle("src/App.jsx");
    const i = app.indexOf("<title>Dienstplan ${MON[mo - 1]} ${y}</title>");
    expect(i).toBeGreaterThan(-1);
    const b = app.slice(i - 200, i + 3600);
    expect(b).toMatch(/\$\{h\(m\.name\)\}/);
    expect(b).toMatch(/\$\{e \? h\(e\.name\) : ""\}/);
    expect(b).toMatch(/\$\{h\(da\.kurz\)\}/);
    expect(b).toMatch(/farbeSicher\(da\.farbe\)/);
    expect(b).not.toMatch(/\$\{da\.kurz\}|\$\{m\.name\}|color:\$\{da\.farbe\}/);
  });
});

/* ---------------------------------------------------------------- SI-04 */
describe("SI-04 Push-Klick öffnet nur eigene Adressen", () => {
  it("notificationclick prüft den Ursprung, nicht nur den Schrägstrich", async () => {
    const sw = await quelle("public/sw.js");
    const i = sw.indexOf("addEventListener(\"notificationclick\"");
    const b = sw.slice(i, i + 900);
    expect(b).not.toMatch(/ziel\.startsWith\("\/"\) \? ziel : "\/"/);
    expect(b).toMatch(/eigenesZiel\(/);
    expect(sw).toMatch(/new URL\(ziel, self\.location\.origin\)/);
    expect(sw).toMatch(/\.origin === self\.location\.origin/);
  });
  it("die Prüfung selbst: //fremd und Fremd-URLs fallen auf /", async () => {
    const sw = await quelle("public/sw.js");
    const m = sw.match(/function eigenesZiel\([\s\S]*?\n}\n/);
    expect(m).toBeTruthy();
    // eslint-disable-next-line no-new-func -- nur die kleine, aus sw.js gelesene Prüffunktion im Test
    const eigenesZiel = new Function("self", `${m[0]}; return eigenesZiel;`)({ location: { origin: "https://app.example" } });
    expect(eigenesZiel("/meine")).toBe("/meine");
    expect(eigenesZiel("//boese.example/x")).toBe("/");
    expect(eigenesZiel("https://boese.example/")).toBe("/");
    expect(eigenesZiel("/\\boese.example")).toBe("/");
    expect(eigenesZiel(null)).toBe("/");
  });
});

/* ---------------------------------------------------------------- SI-07 */
describe("SI-07 Offline-Bestand ohne Sitzung wird beim Start geräumt", () => {
  /* Am Stationsrechner wurde der Reiter geschlossen, ohne abzumelden: Der
     Token (sessionStorage) ist weg, der ganze Betrieb lag aber weiter im
     Cache Storage des Dienstarbeiters — bis zur nächsten Anmeldung. */
  const lade = async ({ token = null, gemerkt = false } = {}) => {
    const store = new Map();
    if (token) store.set("centric:token", token);
    if (gemerkt) store.set("centric:gemerkt", "ja");
    const mk = () => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k) });
    globalThis.sessionStorage = mk(); globalThis.localStorage = mk();
    const namen = new Set(["centric-daten-v4", "centric-schale-v4"]);
    globalThis.caches = { keys: async () => [...namen], delete: async (n) => namen.delete(n) };
    await import("../src/speicher.js?" + Math.random());
    await new Promise((r) => setTimeout(r, 50));
    return namen;
  };
  afterAll(() => { delete globalThis.caches; delete globalThis.sessionStorage; delete globalThis.localStorage; });

  it("ohne Token: gespeicherter Bestand weg, Gerüst bleibt", async () => {
    const namen = await lade();
    expect(namen.has("centric-daten-v4")).toBe(false);
    expect(namen.has("centric-schale-v4")).toBe(true);
  });
  it("mit gemerktem Zugang bleibt der Offline-Bestand", async () => {
    const namen = await lade({ token: "t", gemerkt: true });
    expect(namen.has("centric-daten-v4")).toBe(true);
  });
});

/* ---------------------------------------------------------------- SI-05 */
describe("SI-05 Fremdseiten ohne Zugriff auf das öffnende Fenster", () => {
  it("Dienstanfrage über WhatsApp/SMS/Mail öffnet mit noopener", async () => {
    const app = await quelle("src/App.jsx");
    expect(app).toMatch(/window\.open\(url, "_blank", "noopener,noreferrer"\)/);
    expect(app).not.toMatch(/window\.open\(url, "_blank"\);/);
  });
});

