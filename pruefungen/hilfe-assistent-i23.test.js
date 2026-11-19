/* ==========================================================================
   HILFE-ASSISTENT (WP-I23, F9) — über die echten Handler

   Geprüft wird der Weg /api/hilfe/status und /api/hilfe/frage so, wie der Server ihn
   bedient (Sitzung, Rolle, Bremse, Schalter). Das Gateway ist ein Spion, der an
   der einzigen Einhängestelle (server/lib/intelligence/hilfe/gateway.mjs) sitzt.

   Zugesagt (Plan I23, Spez. F9):
   S1  Schalter aus (Vorgabe): 404, kein Treffer, kein Gateway-Aufruf, nirgends „KI“.
   S2  suche: Hilfetexte ohne Modell; an ohne Gateway: „nicht verfügbar“ + Hilfetexte.
   S3  Rollen: jede Rolle nur Texte, deren Recht sie hat (wirksame Rolle, nicht Zugangscode).
   S4  Das Gateway wird nie gerufen, wenn der Schalter nicht „an“ ist, bei Gesundheitstexten,
       ohne Treffer oder für eine Rolle, die F9 nicht auslösen darf.
   S5  Die Frage steht nirgends: nicht in der Ablage, nicht in Protokollen, nicht in der Ausgabe.
   S6  Zum Gateway gehen nur die bereinigte Frage und Hilfetexte; Mail, Telefon, IBAN fehlen.
   S7  Größen- und Häufigkeitsgrenzen. S8 Die Suche ist deterministisch.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const gw = vi.hoisted(() => ({ gateway: null }));
vi.mock("../server/lib/intelligence/hilfe/gateway.mjs", () => ({ hilfeGateway: () => gw.gateway }));

const WIRT = "127.0.0.1:3000";
const MARKE = "ZEBRAFINK4711";
let wurzel, laden, daten, hilfe, kontoSchreiben, ablageSchluessel, B, korpus, suche, schutz, grenzeHilfe;
let nr = 0;
const T = {};

const anfrage = async (handler, pfad, { methode = "POST", rumpf, token, herkunft = true, ip } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, "x-forwarded-for": ip || `10.7.${Math.floor(nr / 250)}.${nr % 250}` };
  if (herkunft) kopf.origin = typeof herkunft === "string" ? herkunft : `http://${WIRT}`;
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: typeof rumpf === "string" ? rumpf : JSON.stringify(rumpf ?? {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, text, ...d };
};
const frage = (token, f, extra) => anfrage(hilfe, "/api/hilfe/frage", { token, rumpf: { frage: f }, ...extra });
const status = (token) => anfrage(hilfe, "/api/hilfe/status", { methode: "GET", token });
const ids = (r) => (r.passagen || []).map((p) => p.id);

async function sitzung(code, rolle, person, mandantId) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `${rolle} ${person}`, bestand: "hil", rolle, person,
    betrieb: 0, mandantId, angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, JSON.stringify(a)).toBeTruthy();
  return a.token;
}
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "ALLE",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

/** Spion, der eine fertige, gekennzeichnete Antwort liefert. */
const spion = (antwort) => {
  const aufrufe = [];
  const g = { aufrufe, ausfuehren: async (sitzung, anf) => { aufrufe.push({ sitzung, anf }); if (antwort instanceof Error) throw antwort; return antwort; } };
  return g;
};
const FERTIG = { status: "fertig", auftragId: "abcdefgh1234", kennzeichnung: { kiGestuetzt: true, entwurf: true, veroeffentlicht: false, geprueft: true },
  ergebnis: { text: "Stempeln geht im Reiter Heute über den großen Knopf." } };

/** Alle Dateien unter einem Verzeichnis, als Text. */
async function alleDateien(dir) {
  const aus = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) aus.push(...await alleDateien(p));
    else aus.push({ pfad: p, text: (await readFile(p)).toString("latin1") + (await readFile(p)).toString("utf8") });
  }
  return aus;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-hilfe-i23-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  schutz = await import("../server/lib/schutz.mjs");
  /* Die Häufigkeitsgrenze prüft S7 selbst; die übrigen Prüfungen stellen viele Fragen je Person. */
  grenzeHilfe = { ...schutz.GRENZEN.hilfe };
  schutz.GRENZEN.hilfe = { ...grenzeHilfe, versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  hilfe = (await import("../server/funktionen/hilfe.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  korpus = await import("../server/lib/intelligence/hilfe/korpus.mjs");
  suche = await import("../server/lib/intelligence/hilfe/suche.mjs");
  await B.bestandSchreiben(laden(), "hil", { version: 9, mandanten: [
    { id: "m-a", name: "A", einheiten: [{ id: "e1" }], personen: [person("ma", "mitarbeiter"), person("ma2", "mitarbeiter"),
      person("pl", "planer"), person("lt", "leitung"), person("br", "betriebsrat"), person("sv", "subplaner"), person("lt2", "leitung")],
    abweichungen: {}, nachrichten: [], notrufe: [], anfragen: [] }] }, { durch: "Pruefung" });
  T.ma = await sitzung("HIL1-MMMM-0001", "mitarbeiter", "ma", "m-a");
  T.ma2 = await sitzung("HIL2-MMMM-0002", "mitarbeiter", "ma2", "m-a");
  T.pl = await sitzung("HIL3-PPPP-0003", "planer", "pl", "m-a");
  T.lt = await sitzung("HIL4-LLLL-0004", "leitung", "lt", "m-a");
  T.br = await sitzung("HIL5-BBBB-0005", "betriebsrat", "br", "m-a");
  T.sv = await sitzung("HIL6-SSSS-0006", "subplaner", "sv", "m-a");
  T.lt2 = await sitzung("HIL9-LLLL-0009", "leitung", "lt2", "m-a");
  /* Zugangscode „leitung“ für eine Person, die im Betrieb Mitarbeiter ist: wirksam gilt die Person. */
  T.falsch = await sitzung("HIL7-FFFF-0007", "leitung", "ma", "m-a");
  T.betr = await sitzung("HIL8-BTRB-0008", "betreiber", null, null);
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
beforeEach(() => { gw.gateway = null; delete process.env.CENTRIC_HILFE_ASSISTENT; });
afterEach(() => { delete process.env.CENTRIC_HILFE_ASSISTENT; vi.restoreAllMocks(); });

describe("S1 Schalter aus (Vorgabe)", () => {
  it("/frage antwortet 404, /status meldet aus; kein Treffer, kein Gateway-Aufruf", async () => {
    const g = gw.gateway = spion(FERTIG);
    const r = await frage(T.ma, "Wie stemple ich ein?");
    expect(r.status).toBe(404);
    expect(r.passagen).toBeUndefined();
    const s = await status(T.ma);
    expect(s.status).toBe(200);
    expect(s.modus).toBe("aus");
    expect(s.modell).toBe(false);
    expect(g.aufrufe).toHaveLength(0);
  });
  it("Arbeitssitzung (gemeinsamer Prüfpunkt): fehlende, erfundene, fremdartige und beendete Sitzung → 401 an beiden Wegen, Rumpf wird nicht gelesen", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    const frisch = await sitzung("HILA-FFFF-0010", "mitarbeiter", "ma2", "m-a");
    expect((await status(frisch)).status).toBe(200);
    const abm = await anfrage(daten, "/api/abmelden", { token: frisch });
    expect(abm.status).toBeLessThan(300);
    const falsche = [null, "", "x", "erfunden-" + "a".repeat(40), frisch, "Bearer " + frisch, T.ma.slice(0, -1) + (T.ma.endsWith("a") ? "b" : "a")];
    for (const t of falsche) {
      expect((await status(t)).status, "status " + String(t).slice(0, 12)).toBe(401);
      expect((await frage(t, "Wie stemple ich ein?")).status, "frage " + String(t).slice(0, 12)).toBe(401);
      /* kaputter Rumpf ändert die Absage nicht: die Sitzung wird zuerst geprüft */
      expect((await anfrage(hilfe, "/api/hilfe/frage", { token: t, rumpf: "{kaputt" })).status).toBe(401);
    }
    expect(g.aufrufe).toHaveLength(0);
  });
  it("nur genau „suche“ und „an“ schalten ein; Groß-, Kleinschreibung, „true“, „1“ und leer bleiben aus", async () => {
    for (const w of ["true", "1", "AN", "Suche", "", " an", "ja"]) {
      process.env.CENTRIC_HILFE_ASSISTENT = w;
      expect((await status(T.ma)).modus, JSON.stringify(w)).toBe("aus");
    }
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    expect((await status(T.ma)).modus).toBe("suche");
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    expect((await status(T.ma)).modus).toBe("an");
  });
  it("ohne Sitzung 401, Betreiber 403, falsche Methode 405, fremde Herkunft 403, unbekannter Weg 404", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    expect((await frage(null, "Wie stemple ich ein?")).status).toBe(401);
    expect((await status(null)).status).toBe(401);
    expect((await frage(T.betr, "Wie stemple ich ein?")).status).toBe(403);
    expect((await status(T.betr)).status).toBe(403);
    expect((await anfrage(hilfe, "/api/hilfe/frage", { methode: "GET", token: T.ma })).status).toBe(405);
    expect((await anfrage(hilfe, "/api/hilfe/status", { methode: "POST", token: T.ma })).status).toBe(405);
    expect((await frage(T.ma, "Wie stemple ich ein?", { herkunft: "http://boese.example" })).status).toBe(403);
    expect((await frage(T.ma, "Wie stemple ich ein?", { herkunft: false })).status).toBe(200);   // ohne Origin: kein Browserblatt (herkunftErlaubt)
    expect((await anfrage(hilfe, "/api/hilfe/anderes", { methode: "GET", token: T.ma })).status).toBe(404);
  });
});

describe("S2 suche und an ohne Gateway", () => {
  it("suche: Hilfetexte, Modell „aus“, kein Gateway-Aufruf, kein Wort von KI", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    const g = gw.gateway = spion(FERTIG);
    const r = await frage(T.ma, "Wie kann ich ein- und ausstempeln?");
    expect(r.status).toBe(200);
    expect(ids(r)).toContain("h-stempeln");
    expect(r.modell).toEqual({ status: "aus" });
    expect(g.aufrufe).toHaveLength(0);
    expect(r.text).not.toMatch(/\bKI\b|künstlich|Sprachmodell/i);
  });
  it("an ohne eingehängtes Gateway (so ist der Server heute): „nicht verfügbar“, die Hilfetexte bleiben", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const r = await frage(T.ma, "Wie kann ich ein- und ausstempeln?");
    expect(r.status).toBe(200);
    expect(r.modell).toEqual({ status: "nicht_verfuegbar", text: "nicht verfügbar" });
    expect(ids(r)).toContain("h-stempeln");
    expect(r.text).not.toMatch(/\bKI\b|künstlich|Sprachmodell/i);
    expect((await status(T.ma)).modell).toBe(false);
  });
  it("an mit Gateway: gekennzeichnete Antwort neben den Hilfetexten", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    const r = await frage(T.ma, "Wie kann ich ein- und ausstempeln?");
    expect(r.modell.status).toBe("fertig");
    expect(r.modell.text).toBe(FERTIG.ergebnis.text);
    expect(r.modell.kennzeichnung).toEqual({ kiGestuetzt: true, entwurf: true, geprueft: true });
    expect(ids(r)).toContain("h-stempeln");
    expect(g.aufrufe).toHaveLength(1);
    expect((await status(T.ma)).modell).toBe(true);
  });
  it("Gateway ohne Kennzeichnung, ohne Text, im Rückfall oder mit Ausnahme → „nicht verfügbar“, Text der Ausnahme verlässt den Server nicht", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const faelle = [
      { ...FERTIG, kennzeichnung: undefined },
      { ...FERTIG, kennzeichnung: { kiGestuetzt: false, entwurf: true } },
      { ...FERTIG, ergebnis: {} },
      { status: "rueckfall", auftragId: "abcdefgh1234", kennzeichnung: FERTIG.kennzeichnung, rueckfall: { code: "KI_AUS", text: "x" } },
      new Error(`Anbieter sagt: ${MARKE} geheim`),
    ];
    for (const f of faelle) {
      gw.gateway = spion(f);
      const r = await frage(T.ma, "Wie kann ich ein- und ausstempeln?");
      expect(r.status).toBe(200);
      expect(r.modell.status).toBe("nicht_verfuegbar");
      expect(ids(r)).toContain("h-stempeln");
      expect(r.text).not.toContain(MARKE);
    }
  });
  it("ohne Treffer: „Das steht nicht in der Hilfe.“, kein Gateway-Aufruf", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    const r = await frage(T.lt, "Wie hoch ist der Mount Everest?");
    expect(r.status).toBe(200);
    expect(r.keinTreffer).toBe(true);
    expect(r.hinweis).toBe("Das steht nicht in der Hilfe.");
    expect(r.passagen).toEqual([]);
    expect(g.aufrufe).toHaveLength(0);
  });
});

describe("S3 Rollen: nur Texte, deren Recht die wirksame Rolle hat", () => {
  const rollenToken = { mitarbeiter: "ma", subplaner: "sv", planer: "pl", leitung: "lt", betriebsrat: "br" };
  it("jede Rolle bekommt auf jede Titelfrage nur Texte ihres Korpus (gefiltert vor dem Suchen)", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    for (const [rolle, t] of Object.entries(rollenToken)) {
      const erlaubt = new Set(korpus.korpusFuerRolle(rolle).map((x) => x.id));
      for (const text of korpus.HILFE_KORPUS) {
        const r = await frage(T[t], text.titel);
        expect(r.status, `${rolle} ${text.id}`).toBe(200);
        for (const id of ids(r)) expect(erlaubt.has(id), `${rolle} erhielt ${id} auf „${text.titel}“`).toBe(true);
        if (erlaubt.has(text.id)) expect(ids(r), `${rolle} findet ${text.id}`).toContain(text.id);
        else expect(JSON.stringify(r), `${rolle}: Text von ${text.id} darf nicht auftauchen`).not.toContain(text.text.slice(0, 40));
      }
    }
  });
  it("Beschäftigte finden nichts über Freigabe, Zugangsarten, Lohnausgabe, Personalimport", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    const nurPlanung = ["h-plan-freigeben", "h-zugangsarten", "h-zeiten-lohn", "h-personal-anlegen", "h-betrieb-regeln", "h-plan-pruefung",
      "h-datenmitnahme-auskunft", "h-belastbarkeit", "h-checklisten", "h-krankmeldung-endgueltig"];
    for (const f of ["Wie gebe ich den Monatsplan frei?", "Wie vergebe ich Zugangsarten und Rollen?", "Wie läuft die Lohnausgabe als CSV?",
      "Personal importieren Tabelle einlesen", "Wie stelle ich die Ruhezeit und das Bundesland ein?", "Belastbarkeit Ausfallszenario", "Krankmeldung endgültig bestätigen"]) {
      for (const t of [T.ma, T.br]) {
        const r = await frage(t, f);
        for (const id of ids(r)) expect(nurPlanung, `${f} → ${id}`).not.toContain(id);
      }
    }
    const p = await frage(T.pl, "Wie gebe ich den Monatsplan frei?");
    expect(ids(p)[0]).toBe("h-plan-freigeben");
    const l = await frage(T.lt, "Wie vergebe ich Zugangsarten und Rollen?");
    expect(ids(l)[0]).toBe("h-zugangsarten");
  });
  it("Planung-Texte erreichen auch das Gateway einer Beschäftigten nie", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    await frage(T.ma, "Wie gebe ich den Monatsplan frei und wie stempele ich ein?");
    expect(g.aufrufe).toHaveLength(1);
    const blocks = JSON.stringify(g.aufrufe[0].anf.eingabe.fremdtext);
    for (const t of korpus.HILFE_KORPUS.filter((x) => !korpus.korpusFuerRolle("mitarbeiter").some((y) => y.id === x.id)))
      expect(blocks).not.toContain(t.id);
  });
  it("die wirksame Rolle zählt: Code „leitung“ an einer Beschäftigten bekommt die Texte einer Beschäftigten", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    const r = await frage(T.falsch, "Wie gebe ich den Monatsplan frei?");
    expect(r.status).toBe(200);
    expect(ids(r)).not.toContain("h-plan-freigeben");
    const erlaubt = new Set(korpus.korpusFuerRolle("mitarbeiter").map((x) => x.id));
    for (const id of ids(r)) expect(erlaubt.has(id)).toBe(true);
  });
  it("der Korpus nennt nur Rechte der Rechtetabelle (kein neues Recht) und enthält keine Betriebsdaten", async () => {
    const { MATRIX } = await import("../server/lib/rechte.mjs");
    const bekannt = new Set(Object.values(MATRIX).flat());
    for (const t of korpus.HILFE_KORPUS) {
      expect(bekannt.has(t.recht), `${t.id}: ${t.recht}`).toBe(true);
      expect(t.text + t.titel, t.id).not.toMatch(/@|\d{5,}|IBAN\s*[A-Z]{2}\d/);
    }
    expect(new Set(korpus.HILFE_KORPUS.map((t) => t.id)).size).toBe(korpus.HILFE_KORPUS.length);
    expect(korpus.korpusFuerRolle("betreiber")).toEqual([]);
    expect(korpus.korpusFuerRolle("gibtsnicht")).toEqual([]);
    expect(korpus.korpusFuerRolle(undefined)).toEqual([]);
  });
});

describe("S4 Gateway wird nie gerufen, wenn es nicht darf", () => {
  it("Schalter aus oder suche: 0 Aufrufe, bei jeder Rolle und jeder Frage", async () => {
    const g = gw.gateway = spion(FERTIG);
    for (const modus of [undefined, "suche"]) {
      if (modus) process.env.CENTRIC_HILFE_ASSISTENT = modus; else delete process.env.CENTRIC_HILFE_ASSISTENT;
      for (const t of [T.ma, T.pl, T.lt, T.br, T.sv]) await frage(t, "Wie stemple ich ein?");
    }
    expect(g.aufrufe).toHaveLength(0);
  });
  it("Gesundheitsthema: die Person bekommt den Text, das Gateway nie einen Aufruf", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    const r = await frage(T.ma, "Wie melde ich mich krank?");
    expect(ids(r)).toContain("h-krankmeldung-eigene");
    expect(r.modell.status).toBe("nicht_verfuegbar");
    const r2 = await frage(T.pl, "Wie erfasse ich eine Krankmeldung und suche Ersatz?");
    expect(r2.modell.status).toBe("nicht_verfuegbar");
    expect(g.aufrufe).toHaveLength(0);
  });
  it("Rolle ohne F9 (Schichtverantwortung, Betriebsrat): Hilfetexte, nie ein Aufruf", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    const r = await frage(T.sv, "Wie entscheide ich Anträge?");
    expect(ids(r)).toContain("h-antraege-entscheiden");
    expect(r.modell.status).toBe("nicht_verfuegbar");
    const b = await frage(T.br, "Wo lese ich das Änderungsprotokoll?");
    expect(b.modell.status).toBe("nicht_verfuegbar");
    expect(g.aufrufe).toHaveLength(0);
  });
  it("Gesundheitswörter in der Frage selbst: Hilfetexte ja, Modell nie (auch ohne Treffer mit modell: false)", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    for (const f of ["Wie stemple ich ein? Ich habe Diabetes", "Stempeln nach dem Arztbesuch", "Wie stemple ich ein, ich nehme Medikamente",
      "Stempeln bei Schwangerschaft", "Attest und Stempeln", "Wie stemple ich ein trotz Krankheit"]) {
      const r = await frage(T.ma, f);
      expect(r.status, f).toBe(200);
      expect(ids(r), f).toContain("h-stempeln");
      expect(r.modell.status, f).toBe("nicht_verfuegbar");
    }
    expect(g.aufrufe).toHaveLength(0);
    /* ohne Gesundheitswort geht es weiter */
    await frage(T.ma, "Wie stemple ich ein?");
    expect(g.aufrufe).toHaveLength(1);
  });
  it("ungültige Frage (zu kurz, zu lang, kein Text): kein Aufruf", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    await frage(T.ma, "ab");
    await frage(T.ma, "x".repeat(400));
    await anfrage(hilfe, "/api/hilfe/frage", { token: T.ma, rumpf: { frage: 12345 } });
    expect(g.aufrufe).toHaveLength(0);
  });
});

describe("S5 die Frage steht nirgends", () => {
  it("nicht in der Ablage, nicht im Protokoll, nicht auf der Konsole, auch nicht bei Fehlern des Gateways", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const zeilen = [];
    for (const k of ["log", "info", "warn", "error", "debug"]) vi.spyOn(console, k).mockImplementation((...a) => { zeilen.push(a.map(String).join(" ")); });
    const so = vi.spyOn(process.stdout, "write").mockImplementation((s) => { zeilen.push(String(s)); return true; });
    const se = vi.spyOn(process.stderr, "write").mockImplementation((s) => { zeilen.push(String(s)); return true; });
    const f = `Wie stemple ich ein? ${MARKE} Kollege Mustermann war krank`;
    for (const g of [spion(FERTIG), spion(new Error(f)), null]) {
      gw.gateway = g;
      const r = await frage(T.ma, f);
      expect(r.text).not.toContain(MARKE);
      expect(r.text).not.toContain("Mustermann");
    }
    /* auch ein ungültiger Rumpf und die Bremse wiederholen die Frage nicht */
    const kaputt = await anfrage(hilfe, "/api/hilfe/frage", { token: T.ma, rumpf: `{"frage":"${MARKE}"` });
    expect(kaputt.text).not.toContain(MARKE);
    const lang = await frage(T.ma, MARKE + "x".repeat(400));
    expect(lang.text).not.toContain(MARKE);
    so.mockRestore(); se.mockRestore();
    expect(zeilen.join("\n")).not.toContain(MARKE);
    const dateien = await alleDateien(wurzel);
    expect(dateien.length).toBeGreaterThan(0);
    for (const d of dateien) {
      expect(d.text, d.pfad).not.toContain(MARKE);
      expect(d.text, d.pfad).not.toContain("Mustermann");
    }
  });
  it("die Antwort ist nicht zwischenspeicherbar", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    const a = await hilfe(new Request(`http://${WIRT}/api/hilfe/frage`, { method: "POST",
      headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json", authorization: `Bearer ${T.ma}`, "x-forwarded-for": "10.7.200.1" },
      body: JSON.stringify({ frage: "Wie stemple ich ein?" }) }), {});
    expect(a.headers.get("cache-control")).toBe("no-store");
  });
});

describe("S6 zum Gateway nur Frage und Hilfetexte, Personenangaben vorher entfernt", () => {
  it("E-Mail, Telefon und IBAN gehen nicht hinaus; die Anfrage trägt nur Funktion F9 und Fremdtext", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    const mail = "zebra.finkx@example.org", tel = "+49 171 1234567", tel2 = "0171/9876543", iban = "DE89 3704 0044 0532 0130 00";
    const r = await frage(T.ma, `Wie stemple ich ein? Meine Mail ${mail}, Tel ${tel} oder ${tel2}, Konto ${iban}`);
    expect(r.status).toBe(200);
    expect(g.aufrufe).toHaveLength(1);
    const { anf } = g.aufrufe[0];
    expect(Object.keys(anf).sort()).toEqual(["eingabe", "funktion"]);
    expect(anf.funktion).toBe("F9");
    expect(Object.keys(anf.eingabe)).toEqual(["fremdtext"]);
    const alles = JSON.stringify(anf);
    for (const x of [mail, "example.org", "171 1234567", "9876543", "DE89", "0532 0130"]) expect(alles, x).not.toContain(x);
    expect(anf.eingabe.fremdtext[0]).toMatch(/^Frage: Wie stemple ich ein\?.*\[entfernt\]/);
    /* Block 0 ist die Frage, alle weiteren sind Hilfetexte dieser Rolle */
    const erlaubt = korpus.korpusFuerRolle("mitarbeiter");
    for (const b of anf.eingabe.fremdtext.slice(1)) expect(erlaubt.some((t) => b.startsWith(`Hilfetext ${t.id} – `)), b.slice(0, 40)).toBe(true);
    expect(anf.eingabe.fremdtext.length).toBeLessThanOrEqual(1 + suche.TREFFER_MAX);
    /* keine Person, kein Betrieb, kein Plan in der Anfrage */
    expect(alles).not.toMatch(/"ma"|m-a|Vma|Nma/);
  });
  it("die Antwort des Servers wiederholt die entfernten Angaben ebenfalls nicht", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    const r = await frage(T.ma, "Stempeln? Rufen Sie 0171 1234567 an, mail zebra.finkx@example.org");
    expect(r.text).not.toMatch(/1234567|zebra\.finkx/);
  });
  it("frageBereinigen: Mail, Telefon, IBAN raus; Datum, Zeitraum und Uhrzeit bleiben", () => {
    const b = (t) => suche.frageBereinigen(t);
    expect(b("a b@c.de d").text).toBe("a [entfernt] d");
    expect(b("IBAN DE89370400440532013000 bitte").text).toBe("IBAN [entfernt] bitte");
    expect(b("ruf +49 30 1234567 an").text).toBe("ruf [entfernt] an");
    expect(b("ruf 030-12345678 an").text).toBe("ruf [entfernt] an");
    const frei = "Urlaub vom 01.12.2026 bis 15.12.2026 um 06:30 Uhr";
    expect(b(frei)).toEqual({ text: frei, entfernt: false });
    expect(b("a" + String.fromCharCode(0) + "b" + String.fromCharCode(0x202e) + "c  d")).toMatchObject({ text: "abc d" });   // Steuer- und Richtungszeichen
    expect(b("<script>x</script> Frage").text).not.toContain("<script");
  });
  it("Vollbreite-Ziffern und verschleierte Adressen werden entfernt (NFKC, (at)/[at]/at, (punkt)/dot)", () => {
    const b = (x) => suche.frageBereinigen(x).text;
    const voll = [0xff10, 0xff11, 0xff17, 0xff11, 0x20, 0xff12, 0xff13, 0xff14, 0xff15, 0xff16, 0xff17, 0xff18].map((c) => String.fromCharCode(c)).join("");
    expect(b("ruf " + voll + " an")).toBe("ruf [entfernt] an");
    expect(b("max (at) beispiel (punkt) de")).toBe("[entfernt]");
    expect(b("max[at]beispiel.de")).toBe("[entfernt]");
    expect(b("Mail max (AT) beispiel.de bitte")).toBe("Mail [entfernt] bitte");
    expect(b("max at beispiel dot de")).toBe("[entfernt]");
    expect(b("Wie stemple ich ein? Das ist at 6 Uhr")).toBe("Wie stemple ich ein? Das ist at 6 Uhr");
  });
  it("die Frage mit verschleierter Adresse und Vollbreite-Nummer erreicht das Gateway nicht im Klartext", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "an";
    const g = gw.gateway = spion(FERTIG);
    const voll = [0xff10, 0xff11, 0xff17, 0xff11, 0x20, 0xff12, 0xff13, 0xff14, 0xff15, 0xff16, 0xff17, 0xff18].map((c) => String.fromCharCode(c)).join("");
    await frage(T.ma, "Wie stemple ich ein? max (at) beispiel (punkt) de oder " + voll);
    expect(g.aufrufe).toHaveLength(1);
    const alles = JSON.stringify(g.aufrufe[0].anf);
    expect(alles).not.toMatch(/beispiel|2345678|\(at\)|punkt/);
    expect(alles).not.toContain(voll);
  });
  it("bleibt bei langen, gemeinen Eingaben schnell (keine quadratische Laufzeit)", () => {
    const t0 = Date.now();
    suche.frageBereinigen("1 ".repeat(150) + "a@" + "b.".repeat(100));
    suche.frageBereinigen("1".repeat(300));
    suche.frageBereinigen("DE12 ".repeat(60));
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe("S7 Größen und Häufigkeit", () => {
  it("zu kurz, zu lang, kein Text, fremde Felder, leerer und kaputter Rumpf → 400, nie 200", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    expect((await frage(T.ma, "ab")).code).toBe("FRAGE_KURZ");
    expect((await frage(T.ma, "   ")).status).toBe(400);
  });
  it("Grenze genau: 300 Zeichen gehen, 301 nicht", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    const ok = ("Wie stemple ich ein? " + "x".repeat(300)).slice(0, suche.FRAGE_MAX);
    expect((await frage(T.ma, ok)).status).toBe(200);
    const zu = await frage(T.ma, ok + "y");
    expect(zu.status).toBe(400);
    expect(zu.code).toBe("FRAGE_LANG");
    expect(suche.FRAGE_MAX).toBe(300);
  });
  it("Rumpf: kein Objekt, Liste, fremdes Feld, Zahl als Frage", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    for (const rumpf of ["", "null", "[]", "\"x\"", "{\"frage\":\"Wie stemple ich?\",\"person\":\"ma\"}", "{\"frage\":7}", "{}"]) {
      const r = await anfrage(hilfe, "/api/hilfe/frage", { token: T.ma, rumpf });
      expect(r.status, rumpf).toBe(400);
    }
  });
  it("der Server begrenzt den Rumpf des Wegs auf höchstens 4 KB", async () => {
    const { config } = await import("../server/funktionen/hilfe.mjs");
    expect(config.rumpfMax).toBeLessThanOrEqual(4096);
    expect(config.path).toEqual(["/api/hilfe/status", "/api/hilfe/frage"]);
  });
  it("Häufigkeit je Person: nach 20 Fragen in der Minute 429 mit Wartezeit, eine andere Person bleibt frei", async () => {
    process.env.CENTRIC_HILFE_ASSISTENT = "suche";
    expect(grenzeHilfe).toMatchObject({ versuche: 20, fenster: 60 });
    schutz.GRENZEN.hilfe = grenzeHilfe;
    const g = gw.gateway = spion(FERTIG);
    const stati = [];
    for (let i = 0; i < 24; i++) stati.push((await frage(T.ma2, "Wie stemple ich ein?")).status);
    expect(stati.filter((s) => s === 200).length).toBe(20);
    expect(stati.slice(20)).toEqual([429, 429, 429, 429]);
    const andere = await frage(T.lt2, "Wie stemple ich ein?");
    expect(andere.status).toBe(200);
    expect(g.aufrufe).toHaveLength(0);
    schutz.GRENZEN.hilfe = { ...grenzeHilfe, versuche: 100000 };
  });
});

describe("S8 die Suche ist deterministisch", () => {
  const FRAGEN = ["Wie stemple ich ein?", "Urlaub beantragen", "Wer darf den Plan freigeben?", "Ruhezeit Befunde Hunderte", "Tausch Dienst", "Lücke besetzen Ersatz"];
  it("gleiche Frage, gleicher Korpus: immer dieselbe Reihenfolge und dieselben Punkte", () => {
    for (const rolle of ["mitarbeiter", "planer", "leitung"]) {
      const k = korpus.korpusFuerRolle(rolle);
      for (const f of FRAGEN) {
        const a = suche.suchen(f, k);
        for (let i = 0; i < 5; i++) expect(suche.suchen(f, k)).toEqual(a);
      }
    }
  });
  it("die Reihenfolge der Texte im Korpus ändert das Ergebnis nicht; Gleichstand entscheidet die Kennung", () => {
    const k = korpus.korpusFuerRolle("leitung");
    for (const f of FRAGEN) expect(suche.suchen(f, [...k].reverse())).toEqual(suche.suchen(f, k));
    const gleich = [{ id: "b", titel: "Zeit", text: "Zeit", schlagworte: "" }, { id: "a", titel: "Zeit", text: "Zeit", schlagworte: "" }];
    expect(suche.suchen("Zeit", gleich).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("die Gewichtung einer Rolle hängt nur von den Texten dieser Rolle ab", () => {
    const ma = korpus.korpusFuerRolle("mitarbeiter");
    const alle = korpus.HILFE_KORPUS;
    /* dieselbe Rolle, aber auf den ganzen Korpus gesucht, würde Punkte verändern — gefiltert wird deshalb vorher */
    const a = suche.suchen("Wie stemple ich ein?", ma);
    const b = suche.suchen("Wie stemple ich ein?", alle);
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].punkte).not.toBe(b[0].punkte);
  });
  it("Umlaute, Großschreibung, Füllwörter und Endungen ändern den Treffer nicht", () => {
    const k = korpus.korpusFuerRolle("planer");
    const r1 = suche.suchen("Lücke besetzen", k).map((x) => x.id);
    expect(suche.suchen("luecke BESETZEN", k).map((x) => x.id)).toEqual(r1);
    expect(suche.suchen("Wie kann ich eine Lücke besetzen?", k).map((x) => x.id)).toEqual(r1);
    expect(suche.suchen("", k)).toEqual([]);
    expect(suche.suchen("der die das und", k)).toEqual([]);
    expect(suche.suchen("Wie stemple ich ein?", [])).toEqual([]);
  });
  it("jeder Text ist über seine eigene Überschrift an erster Stelle seiner Rolle zu finden", () => {
    for (const rolle of ["mitarbeiter", "subplaner", "planer", "leitung", "betriebsrat"]) {
      const k = korpus.korpusFuerRolle(rolle);
      for (const t of k) expect(suche.suchen(t.titel, k)[0].id, `${rolle}: ${t.titel}`).toBe(t.id);
    }
  });
});
