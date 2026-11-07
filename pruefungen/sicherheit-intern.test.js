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
import { appQuelle } from "./app-quelle.js";
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

  /* Review S1: web-push verbindet über den alten url.parse, die Prüfung las
     mit new URL. Diese Proben sahen für new URL wie ein Push-Dienst aus,
     url.parse (und damit die Verbindung) führte aber nach 127.0.0.1,
     169.254.169.254 oder ohne Host (localhost). */
  const PARSER_TRICKS = [
    "https://127.0.0.1;.push.apple.com/x",
    "https://169.254.169.254'.push.apple.com/latest/meta-data",
    "https:fcm.googleapis.com/x",
    "https:/fcm.googleapis.com/x",
    "https://fcm.googleapis.com\\@127.0.0.1/x",
    "https://127.0.0.1\\.push.apple.com/x",
    "https://a.push.apple.com%2f@127.0.0.1/x",
    "https://127.0.0.1%09.push.apple.com/x",
    "https://127.0.0.1\t.push.apple.com/x",
    " https://fcm.googleapis.com/x",
    "HTTPS://fcm.googleapis.com/x",
    "https://fcm.googleapis.com./x",
    "https://fcm.googleapis.com:0443/x",
    "https://-a.push.apple.com/x",
    "https://a_b.push.apple.com/x",
    /* nur der Parser-Gleichlauf fängt diese (Mutantenprobe/Fuzzing): new URL
       dekodiert %2e zu „.“ und überspringt zusätzliche Schrägstriche,
       url.parse nicht → 127.0.0.1 bzw. kein Host (localhost). */
    "https://127.0.0.1%2ea.push.apple.com/x",
    "https://127.0.0.1%2Ea.push.apple.com/x",
    "https:///fcm.googleapis.com/x",
    "https:////a.push.apple.com/x",
    "https:///@fcm.googleapis.com/x",
  ];
  it("S1: Parser-Tricks — was beide Parser unterschiedlich lesen, ist nie erlaubt", async () => {
    const { pushEndpunktErlaubt } = await import("../server/lib/pushziel.mjs");
    for (const e of PARSER_TRICKS) expect(pushEndpunktErlaubt(e), e).toBe(false);
  });
  it("S1: Länge höchstens 1000; IP-Adressen nie, auch wenn CENTRIC_PUSH_HOSTS eine Ziffern-Endung erlaubt", async () => {
    const { pushEndpunktErlaubt } = await import("../server/lib/pushziel.mjs");
    const basis = "https://fcm.googleapis.com/fcm/send/";
    expect(pushEndpunktErlaubt(basis + "a".repeat(1000 - basis.length))).toBe(true);
    expect(pushEndpunktErlaubt(basis + "a".repeat(1001 - basis.length))).toBe(false);
    const alt = process.env.CENTRIC_PUSH_HOSTS;
    try {
      process.env.CENTRIC_PUSH_HOSTS = "*.0.10, 10.0.0.10";
      expect(pushEndpunktErlaubt("https://10.0.0.10/x")).toBe(false);
      expect(pushEndpunktErlaubt("https://1.0.10/x")).toBe(false);
    } finally {
      if (alt === undefined) delete process.env.CENTRIC_PUSH_HOSTS; else process.env.CENTRIC_PUSH_HOSTS = alt;
    }
  });
  it("S1: die Proben zeigen den Unterschied wirklich (sonst prüfte der Test nichts)", async () => {
    const url = await import("node:url");
    const zwei = (e) => { let n = null; try { n = new URL(e).hostname; } catch { /* ungültig */ } return { neu: n, alt: url.parse(e).hostname }; };
    expect(zwei("https://127.0.0.1%2ea.push.apple.com/x")).toEqual({ neu: "127.0.0.1.a.push.apple.com", alt: "127.0.0.1" });
    expect(zwei("https:///fcm.googleapis.com/x").neu).toBe("fcm.googleapis.com");
    expect(zwei("https:///fcm.googleapis.com/x").alt).toBeFalsy();
    expect(zwei("https://127.0.0.1;.push.apple.com/x")).toEqual({ neu: "127.0.0.1;.push.apple.com", alt: "127.0.0.1" });
    expect(zwei("https://169.254.169.254'.push.apple.com/x")).toEqual({ neu: "169.254.169.254'.push.apple.com", alt: "169.254.169.254" });
    expect(zwei("https:fcm.googleapis.com/x")).toEqual({ neu: "fcm.googleapis.com", alt: null });
  });
  it("S1: für jede erlaubte Adresse sehen beide Parser denselben Host und Port ≤ 443", async () => {
    const url = await import("node:url");
    const { pushEndpunktErlaubt } = await import("../server/lib/pushziel.mjs");
    for (const e of [...ERLAUBT, "https://fcm.googleapis.com:443/fcm/send/abc"]) {
      expect(pushEndpunktErlaubt(e), e).toBe(true);
      const alt = url.parse(e), neu = new URL(e);
      expect(alt.hostname, e).toBe(neu.hostname);
      expect(["", "443", null]).toContain(alt.port);
      expect(neu.port).toBe("");
    }
  });
  it("S2: *.example nur außerhalb der Auslieferung, *.invalid nie", async () => {
    const { pushEndpunktErlaubt } = await import("../server/lib/pushziel.mjs");
    const alt = process.env.NODE_ENV;
    try {
      expect(pushEndpunktErlaubt("https://push.invalid/x")).toBe(false);
      expect(pushEndpunktErlaubt("https://push.example/x")).toBe(true);
      process.env.NODE_ENV = "production";
      expect(pushEndpunktErlaubt("https://push.example/x")).toBe(false);
      expect(pushEndpunktErlaubt("https://push.invalid/x")).toBe(false);
      expect(pushEndpunktErlaubt("https://fcm.googleapis.com/x")).toBe(true);
    } finally {
      if (alt === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = alt;
    }
  });
  it("webpush.mjs hat keine eigene Positivliste mehr, nur die aus pushziel.mjs", async () => {
    const q = await quelle("server/lib/webpush.mjs");
    expect(q).toMatch(/from "\.\/pushziel\.mjs"/);
    expect(q).not.toMatch(/googleapis|apple\.com|mozilla\.com|windows\.com/);
    const W = await import("../server/lib/webpush.mjs");
    const P = await import("../server/lib/pushziel.mjs");
    expect(W.pushEndpunktErlaubt).toBe(P.pushEndpunktErlaubt);
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
      /* undefined = Angabe fehlt (JSON lässt den Schlüssel weg); „kunde“ wird seit 2026-11-07 nicht mehr vergeben. */
      for (const rolle of ["betreiber", "gott", "__proto__", "kunde", undefined]) {
        const r = await anfrage(daten, "/api/zugaenge", { bestand: "sich", eintraege: [{ rolle }] }, tB);
        expect(r.status, rolle).toBe(400);
        expect(r.zugaenge).toBeUndefined();
      }
      const ok = await anfrage(daten, "/api/zugaenge", { bestand: "sich", eintraege: [{ rolle: "leitung" }] }, tB);
      expect(ok.status).toBe(200);
      expect(ok.zugaenge.map((z) => z.rolle)).toEqual(["leitung"]);
    });

    /* kunde-Ablösung (2026-11-07): Eine öffentliche Demo-Sitzung (/api/demo, demo:true) trägt die Rolle leitung,
       darf aber weder Zugänge zurückziehen noch Vollausgabe, Sicherungsschlüssel oder Wiederherstellen. */
    it("Demo-Sitzung mit Rolle leitung: Sperren, Vollausgabe, Sicherungsschlüssel, Wiederherstellen → 403; ohne demo nicht", async () => {
      const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
      const mk = async (demo) => (await sitzungAnlegen({ bestand: "sich", name: "d", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m-a", ...(demo ? { demo: true } : {}) }, 600000)).token;
      const tDemo = await mk(true), tEcht = await mk(false);
      const rufe = (tok, mitSperren = true) => [...(mitSperren ? [["/api/zugang-sperren", "POST", { bestand: "sich", alleDesBetriebs: true }]] : []), ["/api/sicherungsschluessel", "POST", { tage: 7 }],
        ["/api/sicherungsschluessel", "GET"], ["/api/vollausgabe", "GET"], ["/api/wiederherstellen", "POST", {}]]
        .map(async ([p, m, r]) => {
          const kopf = { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json", "x-forwarded-for": "10.9.8.8", authorization: `Bearer ${tok}` };
          const x = await daten(new Request(`http://${WIRT}${p}`, { method: m, headers: kopf, ...(r ? { body: JSON.stringify(r) } : {}) }), {});
          return [p + " " + m, x.status];
        });
      for (const [n, s] of await Promise.all(rufe(tDemo))) expect(s, n).toBe(403);
      // Gegenprobe: dieselben Wege lehnen die echte Leitung nicht mit 403 ab (mind. einer führt durch) — die Sperre hängt am Merkmal demo
      /* ohne Sperren: Das echte Sperren aller Zugänge würde die gemeinsame Testsitzung beenden. */
      const echt = await Promise.all(rufe(tEcht, false));
      expect(echt.filter(([, s]) => s !== 403).length).toBeGreaterThan(0);
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
  beforeAll(async () => { app = appQuelle(); });
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
  it("S3: csvText setzt Text mit Komma oder Tabulator in Anführungszeichen (auch mit Formelschutz)", async () => {
    const { csvText } = await import("../src/csvfeld.js");
    expect(csvText("Müller, Anna")).toBe("\"Müller, Anna\"");
    expect(csvText("a\tb")).toBe("\"a\tb\"");
    expect(csvText("x,=HYPERLINK(\"y\")")).toBe("\"x,=HYPERLINK(\"\"y\"\")\"");
    expect(csvText("=1,2")).toBe("\"'=1,2\"");
    expect(csvText("\t=1")).toBe("\"'\t=1\"");
    expect(csvText("ohne")).toBe("ohne");
    /* jedes Ergebnis ist entweder ohne Trennzeichen oder vollständig umschlossen */
    for (const ein of ["a,b", "a;b", "a\tb", "a\nb", "a\"b,c", "=a,b;c"]) {
      const aus = csvText(ein);
      expect(/^".*"$/s.test(aus) || !/[,;\t\r\n"]/.test(aus), JSON.stringify(ein)).toBe(true);
    }
  });
});

/* ---------------------------------------------------------------- SI-03 */
describe("SI-03 Aushangplan-Druck maskiert Daten aus dem Bestand", () => {
  it("Betrieb, Einheit, Dienstart und Farbe gehen maskiert/geprüft ins HTML", async () => {
    const app = appQuelle();
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
  /* Zusammengeführt mit WP-30: Die eine Prüffunktion ist eigenerPfad() in
     public/sw.js (strenger als ein Ursprungsvergleich: nur ein eigener Pfad
     aus [A-Za-z0-9/_-], kein „//“ am Anfang, keine Abfrage, kein Rückstrich). */
  it("notificationclick prüft das Ziel mit eigenerPfad, nicht nur den Schrägstrich", async () => {
    const sw = await quelle("public/sw.js");
    const i = sw.indexOf("addEventListener(\"notificationclick\"");
    expect(i).toBeGreaterThan(-1);
    const b = sw.slice(i, i + 900);
    expect(b).not.toMatch(/ziel\.startsWith\("\/"\) \? ziel : "\/"/);
    expect(b).toMatch(/eigenerPfad\(/);
    expect(b).not.toMatch(/\.url\.includes\(/);
    expect(b).toMatch(/\.url\.startsWith\(self\.location\.origin \+ "\/"\)/);
    /* auch beim Anzeigen schon gefiltert */
    const p = sw.slice(sw.indexOf("addEventListener(\"push\""), i);
    expect(p).toMatch(/ziel: eigenerPfad\(d\.ziel\)/);
  });
  it("die Prüfung selbst: //fremd, /\\fremd und Fremd-URLs fallen auf /", async () => {
    const sw = await quelle("public/sw.js");
    const m = sw.match(/const eigenerPfad = [^\n]*\n/);
    expect(m).toBeTruthy();
    // eslint-disable-next-line no-new-func -- nur die kleine, aus sw.js gelesene Prüffunktion im Test
    const eigenerPfad = new Function("self", `${m[0]}; return eigenerPfad;`)({ location: { origin: "https://app.example" } });
    expect(eigenerPfad("/meine")).toBe("/meine");
    expect(eigenerPfad("//boese.example/x")).toBe("/");
    expect(eigenerPfad("https://boese.example/")).toBe("/");
    expect(eigenerPfad("/\\boese.example")).toBe("/");
    expect(eigenerPfad("/%2F%2Fboese.example")).toBe("/");
    expect(eigenerPfad("/x?u=https://boese.example")).toBe("/");
    expect(eigenerPfad("javascript:alert(1)")).toBe("/");
    expect(eigenerPfad(null)).toBe("/");
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
    const app = appQuelle();
    expect(app).toMatch(/window\.open\(url, "_blank", "noopener,noreferrer"\)/);
    expect(app).not.toMatch(/window\.open\(url, "_blank"\);/);
  });
});

/* ------------------------------------------------- Geheimnis-Werkzeug */
describe("Geheimnis-Werkzeug: ein Platzhalter entschuldigt nur den eigenen Treffer", () => {
  /* Der Wert wird zusammengesetzt, damit diese Datei selbst nicht als Fund gilt. */
  const wert = ["Q7mZp2Lk", "9vR4tW8y", "X3nBc6Hd"].join("");
  it("„example“ an anderer Stelle der Zeile verbirgt den echten Wert nicht mehr", async () => {
    const { zeilePruefen } = await import("../werkzeug/sicherheit/geheimnisse.mjs");
    expect(zeilePruefen(`RESEND_API_KEY=${wert}`).map((f) => f.regel)).toContain("Zuweisung Geheimnis-Variable");
    expect(zeilePruefen(`url = "https://push.example/x"; RESEND_API_KEY=${wert}`).map((f) => f.regel)).toContain("Zuweisung Geheimnis-Variable");
    expect(zeilePruefen(`process.env.RESEND_API_KEY = "${wert}"`).map((f) => f.regel)).toContain("Zuweisung Geheimnis-Variable");
  });
  it("Platzhalter im Treffer selbst bleiben Fehlalarme; ein zweiter, echter Treffer derselben Regel nicht", async () => {
    const { zeilePruefen } = await import("../werkzeug/sicherheit/geheimnisse.mjs");
    expect(zeilePruefen("RESEND_API_KEY=re_nur_zum_pruefen_kein_echter")).toEqual([]);
    expect(zeilePruefen("CENTRIC_PFEFFER=pfeffer-nur-zum-pruefen-0123456789")).toEqual([]);
    expect(zeilePruefen(`CENTRIC_PFEFFER=pfeffer-nur-zum-pruefen-0123456789 RESEND_API_KEY=${wert}`)).toHaveLength(1);
  });
});

