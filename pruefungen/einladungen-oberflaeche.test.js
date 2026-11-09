/* ==========================================================================
   EINLADUNGEN — Oberfläche (WP-18)

   Gerendert wird, was React tatsächlich ausgibt (renderToStaticMarkup), mit
   erfundenen Personen. Die Bedienung im Browser (Knopf drücken, Code
   ablesen, damit anmelden) bleibt ein Schritt für einen Menschen; hier wird
   festgehalten, was die Ansichten zeigen und wo sie eingehängt sind.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";

let V;
beforeAll(async () => { V = await import("../src/ansichten/einladungen.jsx"); }, 60000);

const person = (id, rolle, extra = {}) => ({ id, vorname: `Test${id}`, nachname: "Person", rolle, status: "aktiv", ...extra });
const mandant = () => ({ id: "m-a", name: "Testbetrieb", personen: [person("al", "leitung"), person("al2", "leitung"),
  person("ap", "planer"), person("am", "mitarbeiter"), person("aw", "mitarbeiter", { status: "ausgeschieden" }),
  person("ar", "betriebsrat"), person("an", "mitarbeiter", { anonym: true })] });
const sitz = (id) => { const m = mandant(); return { rolle: "kunde", mandant: m, person: m.personen.find((p) => p.id === id) }; };

describe("Einladungen (Leitung)", () => {
  it("bietet nur aktive Personen unterhalb der eigenen Rolle an — keine Leitung, nicht sich selbst", () => {
    const ids = V.einladbarePersonen(sitz("al")).map((p) => p.id).sort();
    expect(ids).toEqual(["am", "ap", "ar"]);
  });
  it("rendert Auswahl und Knopf, ohne Einladung oder Code vorab", () => {
    const html = renderToStaticMarkup(h(V.Einladungen, { sitz: sitz("al"), api: {} }));
    expect(html).toContain("Zugang einladen");
    expect(html).toContain("Einladung ausstellen");
    expect(html).toContain("Testam Person · Beschäftigte");
    expect(html).not.toContain("Testal2");
    expect(html).not.toContain("Testaw");
    expect(html).not.toMatch(/data-einladung|data-zugangscode/);
  });
  it("Beschäftigte sehen nichts davon", () => {
    expect(renderToStaticMarkup(h(V.Einladungen, { sitz: sitz("am"), api: {} }))).toBe("");
  });
});

describe("Einladung einlösen (Anmeldeseite)", () => {
  it("zeigt zuerst nur den Verweis, aufgeklappt Feld und Knopf", () => {
    const zu = renderToStaticMarkup(h(V.EinladungEinstieg, { api: {} }));
    expect(zu).toContain("Ich habe eine Einladung");
    expect(zu).not.toContain("id=\"einladung\"");
    const auf = renderToStaticMarkup(h(V.EinladungAnnehmen, { api: {} }));
    expect(auf).toContain("id=\"einladung\"");
    expect(auf).toContain("Einladung einlösen");
  });
});

describe("Eingehängt", () => {
  it("App.jsx: im Personalbereich, nur mit Rollenvergabe und nicht im Demozugang", async () => {
    const t = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect(t).toMatch(/aktiveView === "personal" && darf\(sitz, "roles\.assign"\) && !\(SP\.zugangsdaten\(\) \|\| \{\}\)\.demo\s*&& <Einladungen sitz=\{sitz\} \/>/);
  });
  it("main.jsx: auf der Anmeldeseite", async () => {
    const t = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
    expect(t).toContain("<EinladungEinstieg F={C} />");
  });
  it("speicher.js: beide Wege gehen an die Serverpfade", async () => {
    const t = await readFile(new URL("../src/speicher.js", import.meta.url), "utf8");
    expect(t).toContain("fetch(\"/api/einladung\", { method: \"POST\", headers: kopf()");
    expect(t).toContain("fetch(\"/api/einladung/annehmen\"");
  });
});

/* ==========================================================================
   WP-18 Ausbau: Liste und Widerruf (B2), Einladungslink (B4)
   ========================================================================== */

describe("B2: Liste der Einladungen (nur Metadaten)", () => {
  const liste = [
    { id: "aaaaaaaaaaaaaaaa", person: { id: "am", name: "Testam Person" }, rolle: "mitarbeiter",
      ausgestellt: "2026-11-09T08:00:00.000Z", bis: Date.UTC(2026, 10, 16, 8), status: "offen" },
    { id: "bbbbbbbbbbbbbbbb", person: { id: "ap", name: "Testap Person" }, rolle: "planer",
      ausgestellt: "2026-11-08T08:00:00.000Z", bis: Date.UTC(2026, 10, 15, 8), status: "eingeloest",
      am: "2026-11-09T09:00:00.000Z", neu: true },
    { id: "cccccccccccccccc", person: { id: "ar", name: "Testar Person" }, rolle: "betriebsrat",
      ausgestellt: "2026-11-01T08:00:00.000Z", bis: Date.UTC(2026, 10, 8, 8), status: "abgelaufen" },
    { id: "dddddddddddddddd", person: { id: "am", name: "Testam Person" }, rolle: "mitarbeiter",
      ausgestellt: "2026-11-07T08:00:00.000Z", bis: Date.UTC(2026, 10, 14, 8), status: "widerrufen",
      am: "2026-11-07T09:00:00.000Z", ersetzt: true },
  ];
  it("zeigt Person, Rolle, Status; Widerrufen nur bei offenen; Hinweis auf neue Einlösungen", () => {
    const html = renderToStaticMarkup(h(V.EinladungsListe, { liste, neu: 1, onWiderrufen: () => {} }));
    for (const t of ["Testam Person", "Testap Person", "Beschäftigte", "offen", "eingelöst", "abgelaufen", "widerrufen",
      "durch neuere ersetzt", "seit deinem letzten Blick eingelöst"]) expect(html).toContain(t);
    expect(html.match(/Widerrufen</g) || []).toHaveLength(1);
    expect(html).not.toMatch(/data-einladung|data-zugangscode/);
  });
  it("ohne Einträge nichts", () => {
    expect(renderToStaticMarkup(h(V.EinladungsListe, { liste: [] }))).toBe("");
  });
  it("speicher.js: Liste und Widerruf gehen mit Sitzung an die Serverpfade", async () => {
    const t = await readFile(new URL("../src/speicher.js", import.meta.url), "utf8");
    expect(t).toContain("fetch(\"/api/einladung/liste\", { method: \"POST\", headers: kopf()");
    expect(t).toContain("fetch(\"/api/einladung/widerrufen\", { method: \"POST\", headers: kopf()");
    /* B1: die Bestätigung geht im Rumpf mit, die Ansicht fragt nach einem 403 danach. */
    expect(t).toMatch(/einladungAusstellen\(personId, bestaetigung\)/);
  });
});

describe("B4: Einladungslink — Token im Fragment, sofort aus der Adresse", () => {
  const TOKEN = "Pruef_token-0123456789abcdefghijklmnopqrstuv";
  it("der Link trägt das Token nur im Fragment, nach „#“", () => {
    const l = V.einladungsLink("https://app.example.org/", TOKEN);
    expect(l).toBe(`https://app.example.org/einladung#einladung=${TOKEN}`);
    const u = new URL(l);
    expect(u.pathname).toBe("/einladung");
    expect(u.search).toBe("");
    expect(u.hash).toContain(TOKEN);
  });
  it("tokenAusFragment nimmt nur die erwartete Form", () => {
    expect(V.tokenAusFragment(`#einladung=${TOKEN}`)).toBe(TOKEN);
    expect(V.tokenAusFragment("#einladung=kurz")).toBe(null);
    expect(V.tokenAusFragment("#anderes=x")).toBe(null);
    expect(V.tokenAusFragment("")).toBe(null);
  });
  it("beim Laden: Token gelesen, Adresszeile per history.replaceState ohne Fragment, Token genau einmal abholbar", () => {
    const aufrufe = [];
    const win = { location: { hash: `#einladung=${TOKEN}`, pathname: "/einladung", search: "" },
      history: { replaceState: (...a) => aufrufe.push(a) } };
    expect(V.einladungAusAdresse(win)).toBe(TOKEN);
    expect(aufrufe).toEqual([[null, "", "/einladung"]]);
    expect(V.mitgebrachteEinladung()).toBe(TOKEN);
    expect(V.mitgebrachteEinladung()).toBe(null);
    /* Ohne Einladung im Fragment bleibt die Adresse unberührt. */
    const ohne = { location: { hash: "#start", pathname: "/", search: "" }, history: { replaceState: () => aufrufe.push(1) } };
    expect(V.einladungAusAdresse(ohne)).toBe(null);
    expect(aufrufe).toHaveLength(1);
  });
  it("mitgebrachte Einladung steht im Feld", () => {
    const html = renderToStaticMarkup(h(V.EinladungAnnehmen, { api: {}, vorgabe: TOKEN }));
    expect(html).toContain(`value="${TOKEN}"`);
  });
  it("Quelltext: Fragment wird beim Laden gelesen und entfernt; Einlösen ohne Referrer", async () => {
    const q = await readFile(new URL("../src/ansichten/einladungen.jsx", import.meta.url), "utf8");
    expect(q).toMatch(/if \(typeof window !== "undefined"\) einladungAusAdresse\(window\);/);
    expect(q).toContain("win.history.replaceState(null, \"\"");
    const s = await readFile(new URL("../src/speicher.js", import.meta.url), "utf8");
    expect(s).toMatch(/fetch\("\/api\/einladung\/annehmen"[^)]*referrerPolicy: "no-referrer"/);
  });
});

describe("B4: der Server liefert /einladung mit Referrer-Policy no-referrer und nur eigenen Ressourcen", () => {
  let kind, basis, statik, datenOrdner;
  beforeAll(async () => {
    const { serverStarten } = await import("./hilfen/port.mjs");
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = (await import("node:path")).default;
    const { fileURLToPath } = await import("node:url");
    statik = await mkdtemp(path.join(tmpdir(), "centric-statik-einl-"));
    datenOrdner = await mkdtemp(path.join(tmpdir(), "centric-daten-einl-"));
    await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Probe</title>");
    const s = await serverStarten({ cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      env: { CENTRIC_STATIK: statik, CENTRIC_DATEN: datenOrdner, CENTRIC_ABLAGE: "dateien",
        CENTRIC_ADMIN: "probe-geheim", NODE_ENV: "production" } });
    ({ kind, basis } = s);
  }, 60000);
  afterAll(async () => {
    if (kind && kind.exitCode === null) kind.kill("SIGKILL");
    const { rm } = await import("node:fs/promises");
    await rm(statik, { recursive: true, force: true }).catch(() => {});
    await rm(datenOrdner, { recursive: true, force: true }).catch(() => {});
  });
  it("/einladung: index.html, no-referrer, CSP nur 'self'", async () => {
    const r = await fetch(`${basis}/einladung`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("CENTRIC Probe");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    const csp = r.headers.get("content-security-policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/https?:/);
  });
  it("die übrige Anwendung behält ihre Vorgabe", async () => {
    const r = await fetch(`${basis}/`);
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});
