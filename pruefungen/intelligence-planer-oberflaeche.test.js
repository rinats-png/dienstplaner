/* ==========================================================================
   WP-I7 Teil 6, Stufe 1 der Planer-Oberfläche (Betreiberentscheidung 27.11.: Bedienbarkeit vor weiteren Server-Teilen)

   Geprüft wird das, was die Leitung bedient — die echten Ansichten und Aktionen gegen den echten Handler (PUT/GET /api/bestand); nur der
   Browser-Speicher (src/speicher.js) ist ersetzt: schreib/lies gehen als echte Anfragen an den Handler (Muster
   intelligence-steuerung-leitungpause-aufheben.test.js).
   1. Rechte der Oberfläche (planerRechte): Leitung schaltet, Planung liest, alle anderen und Demo nichts; Anheften Leitung und Planung.
   2. Wirksamer Zustand ehrlich: global nicht freigegeben ⇒ „AUS“ und „global nicht freigegeben“, nie ein Schalter als wirksam; Gründe
      (Pause, Hauptschalter, Frage, Schalter, Planungsreife) einzeln; Erklärung stimmt mit kiPlanerEntscheidung überein.
   3. Planer-Schalter und Betriebsmodus Ende zu Ende: Erfolg erst nach Serverbestätigung; ohne Recht, Konflikt, Lesefehler, Absage:
      sichtbarer Fehler (role=alert), nie „geändert“.
   4. Anheften und Lösen Ende zu Ende: Server setzt Stempel und Wirkung; manuelle Änderung hebt nur diese Anheftung auf, die Ansicht nennt
      es; Schichtverantwortung/Beschäftigte/Betriebsrat/Demo: wirkungslos und sichtbar abgewiesen; unlesbare Karte: Warnung, nichts geschrieben.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const SPM = vi.hoisted(() => ({ schreib: null, liesZumVergleich: null, zugangsdaten: () => ({}) }));
vi.mock("../src/speicher.js", () => ({ schreib: (...a) => SPM.schreib(...a), liesZumVergleich: (...a) => SPM.liesZumVergleich(...a),
  zugangsdaten: (...a) => SPM.zugangsdaten(...a) }));

import { PlanerSteuerung, PlanerSteuerungAnsicht } from "../src/ansichten/planer-steuerung.jsx";
import { Anheftungen, AnheftungenAnsicht, ANHEFTEN_TEXTE } from "../src/ansichten/anheftungen.jsx";
import { PLANER_TEXTE, MODUS_TEXT, planerRechte, planerZustand, einteilungZumAnheften, mitAnheftung, ohneAnheftung, anheftungBestaetigt, tageImMonat } from "../src/lib/planer-oberflaeche.js";
import { planerAktionen, planerFehlerText } from "../src/lib/planer-aktionen.js";
import { kiSteuerungAktionen } from "../src/lib/ki-steuerung-aktionen.js";
import { planerModusWirksam, PLANER_AN } from "../server/lib/engine/planer.mjs";
import { kiPlanerEntscheidung, KI_RECHTE, kiSteuerungLesen, kiSteuerungAnwenden } from "../server/lib/ki-steuerung.mjs";
import { ANHEFTEN_ROLLEN } from "../server/lib/anheften.mjs";

const WIRT = "127.0.0.1:3000";
const RAUM = "wpi7planerui";
const YM = "2026-12";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, nr = 0;
const T = {};

const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv", eintritt: "2020-01-01",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const ROLLEN = [["l1", "leitung"], ["p1", "planer"], ["s1", "subplaner"], ["a1", "mitarbeiter"], ["r1", "betriebsrat"]];
const ST = (an) => ({ an, am: "2026-11-10T10:00:00.000Z", vonRolle: "leitung", vonPerson: "l1" });

const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.19.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const ki = (m) => (m.einstellungen || {}).kiSteuerung || {};

/** Die Oberfläche einer Rolle: gelesene Sicht als lokaler Stand (ref), echte Aktionen, Meldungen werden gesammelt. */
async function oberflaeche(id) {
  const r = await anfrage("/api/bestand", { methode: "GET", token: T[id] });
  expect(r.status, `${id} lesen`).toBe(200);
  const ref = { current: { ...JSON.parse(JSON.stringify(r.bestand)), session: { mandantId: "m-a" } } };
  const rolle = ROLLEN.find((x) => x[0] === id)[1];
  const o = { ref, etag: r.etag, meldungen: [], rolle, id, token: T[id] };
  const k = { ref, melde: (t) => o.meldungen.push(t), upd: (fn) => { ref.current = fn(ref.current); }, get sitz() { return o.sitz(); } };
  o.akt = { ...kiSteuerungAktionen(k), ...planerAktionen(k) };
  o.lokal = () => ref.current.mandanten[0];
  o.sitz = (extra = {}) => ({ rolle: "kunde", zugangRolle: rolle, mandant: o.lokal(), person: { id, rolle, vorname: "V", nachname: "N" }, ...extra });
  return o;
}
/** Der Browser-Speicher: PUT mit dem ETag der Sicht (wie speicher.js), Lesen als echte GET-Anfrage. */
let aktuell = null, leseFehler = false, schreibModus = null;
SPM.schreib = (bestand, opt) => (async () => {
  if (schreibModus === "stumm") return undefined;   // der Speicherweg meldet nichts zurück
  const { session: _s, ...rest } = bestand;
  const e = await anfrage("/api/bestand", { methode: "PUT", token: aktuell.token, rumpf: { bestand: rest, etag: aktuell.etag, durch: opt.durch } });
  if (e.status === 200) opt.onGespeichert(bestand); else if (e.status === 409) opt.onKonflikt(e); else opt.onFehler({ status: e.status, text: e.fehler });
})();
SPM.liesZumVergleich = async () => {
  if (leseFehler) throw new Error("Lesen fehlgeschlagen.");
  const r = await anfrage("/api/bestand", { methode: "GET", token: aktuell.token });
  if (r.status !== 200) throw new Error("Lesen fehlgeschlagen.");
  return r.bestand;
};
const mit = async (o, fn) => { aktuell = o; return fn(); };

/** Knöpfe/Schalter einer Ansicht finden (Baum der Elemente): Text oder aria-label, liefert { props }. */
const finde = (n, test, aus = []) => {
  if (!n || typeof n !== "object") return aus;
  if (Array.isArray(n)) { n.forEach((x) => finde(x, test, aus)); return aus; }
  if (n.props) { if (test(n)) aus.push(n); finde(n.props.children, test, aus); }
  return aus;
};
const textVon = (c) => (Array.isArray(c) ? c.map(textVon).join("") : typeof c === "string" || typeof c === "number" ? String(c) : "");
const knopf = (baum, text) => { const k = finde(baum, (n) => typeof n.props.onClick === "function" && textVon(n.props.children).trim() === text); return k[0] || null; };
const html = (el) => renderToStaticMarkup(el);

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi7pui-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", einstellungen: {},
    einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", end: "14:00", ende: "14:00" }],
    personen: [...ROLLEN.map(([id, rolle]) => person(id, rolle)), person("x1", "mitarbeiter")],
    abweichungen: { "x1|2026-12-07": "F" }, einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  let c = 0;
  for (const [id, rolle] of ROLLEN) {
    c += 1;
    const code = `WPU${c}-AAAA-${String(c).padStart(4, "0")}`;
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person: id, betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    T[id] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
    expect(T[id], id).toBeTruthy();
  }
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

/* ------------------------------------------------------------------ 1. Rechte */
describe("Rechte der Oberfläche (Tabellen des Servers, nicht rohe Rollenstrings)", () => {
  const sitzR = (rolle, extra = {}) => ({ rolle: "kunde", mandant: { id: "m", einstellungen: {} }, person: { rolle }, ...extra });
  it("Leitung schaltet und heftet an, Planung liest und heftet an, alle anderen nichts", () => {
    expect(planerRechte(sitzR("leitung"))).toEqual({ sehen: true, steuern: true, anheften: true });
    expect(planerRechte(sitzR("planer"))).toEqual({ sehen: true, steuern: false, anheften: true });
    for (const r of ["subplaner", "mitarbeiter", "betriebsrat", "betreiber", "kunde", "gast", undefined])
      expect(planerRechte(sitzR(r)), String(r)).toEqual({ sehen: false, steuern: false, anheften: false });
    expect(planerRechte(null)).toEqual({ sehen: false, steuern: false, anheften: false });
  });
  it("die Rechte folgen den Tabellen des Servers", () => {
    expect(Object.keys(KI_RECHTE).filter((r) => KI_RECHTE[r].includes("planerModus"))).toEqual(["leitung"]);
    expect([...ANHEFTEN_ROLLEN]).toEqual(["leitung", "planer"]);
  });
  it("Demo: nichts ändern (Leitung liest nur, Anheften aus)", () => {
    expect(planerRechte(sitzR("leitung"), { demo: true })).toEqual({ sehen: true, steuern: false, anheften: false });
    expect(planerRechte(sitzR("leitung", { demo: true }))).toEqual({ sehen: true, steuern: false, anheften: false });
  });
  it("die Rolle des Zugangs geht der Rolle der Person vor (Altrolle „kunde“ schaltet nichts, wie am Server)", () => {
    expect(planerRechte(sitzR("leitung", { zugangRolle: "kunde" }))).toEqual({ sehen: false, steuern: false, anheften: false });
    expect(planerRechte(sitzR("mitarbeiter", { zugangRolle: "leitung" })).steuern).toBe(true);
  });
  it("die Komponenten zeigen Beschäftigten, Schichtverantwortung, Betriebsrat und dem Betreiber nichts", () => {
    for (const rolle of ["mitarbeiter", "subplaner", "betriebsrat", "betreiber"]) {
      const s = sitzR(rolle);
      expect(html(h(PlanerSteuerung, { sitz: s, akt: {} })), rolle).toBe("");
      expect(html(h(Anheftungen, { m: { personen: [], abweichungen: {} }, ym: YM, sitz: s, akt: {} })), rolle).toBe("");
    }
  });
});

/* ------------------------------------------------------- 2. Wirksamer Zustand */
const VOLL = () => ({ kiSteuerung: { betrieb: ST(true), betriebsratFrage: { antwort: "nein", ...ST(true) }, planerSchalter: ST(true), planerModus: { modus: "knopfdruck", ...ST(true) } } });
const REIFE_OK = { bereit: true, luecken: [] };
describe("Wirksamer Zustand: ehrlich, mit Gründen", () => {
  it("Vorgabe: Der Planer ist global nicht freigegeben", () => { expect(PLANER_AN).toBe(false); });
  it("alles im Betrieb gesetzt, aber global nicht freigegeben: Anzeige AUS und „global nicht freigegeben“ — nie ein wirksamer Schalter", () => {
    const z = planerZustand(VOLL(), { reife: REIFE_OK });
    expect(z.freigegeben).toBe(false);
    expect(z.wirksam).toBe("aus");
    expect(z.wirksam).toBe(planerModusWirksam(VOLL(), PLANER_AN));
    const s = html(h(PlanerSteuerungAnsicht, { z, steuern: true }));
    expect(s).toContain("Wirksam jetzt: AUS");
    expect(s).toContain("global nicht freigegeben");
    expect(s).not.toMatch(/Wirksam jetzt: (Auf Knopfdruck|Automatisch)/);
    expect(s).toContain("vorgemerkt: an");
    expect(s).toContain(`Planer global nicht freigegeben (AUS) — ${PLANER_TEXTE.fehlt}`);
  });
  it("mit der Freigabe (nur Prüfung): Knopfdruck, Automatisch nur wenn ausdrücklich gewählt, sonst Vorgabe Knopfdruck", () => {
    expect(planerZustand(VOLL(), { freigegeben: true, reife: REIFE_OK }).wirksam).toBe("knopfdruck");
    const auto = VOLL(); auto.kiSteuerung.planerModus = { modus: "automatisch", ...ST(true) };
    expect(planerZustand(auto, { freigegeben: true, reife: REIFE_OK }).wirksam).toBe("automatisch");
    const ohne = VOLL(); delete ohne.kiSteuerung.planerModus;
    const z = planerZustand(ohne, { freigegeben: true, reife: REIFE_OK });
    expect(z.wirksam).toBe("knopfdruck");
    expect(z.modusGespeichert).toBeNull();
    expect(html(h(PlanerSteuerungAnsicht, { z }))).toContain(PLANER_TEXTE.modusNichtGewaehlt);
    const aus = VOLL(); aus.kiSteuerung.planerModus = { modus: "aus", ...ST(true) };
    expect(planerZustand(aus, { freigegeben: true, reife: REIFE_OK }).wirksam).toBe("aus");
  });
  const FAELLE = [
    ["Pause (Betriebsrat)", (e) => { e.kiSteuerung.pause = { aktiv: true, nr: 1, ...ST(true) }; }, "Intelligence ist pausiert"],
    ["Pause (Leitung)", (e) => { e.kiSteuerung.leitungPause = { aktiv: true, nr: 1, ...ST(true) }; }, "Intelligence ist pausiert"],
    ["Hauptschalter aus", (e) => { e.kiSteuerung.betrieb = ST(false); }, "Intelligence für diesen Betrieb: aus"],
    ["Frage unbeantwortet", (e) => { delete e.kiSteuerung.betriebsratFrage; }, "noch nicht beantwortet"],
    ["Frage „ja“ ohne aufgehobene Pause", (e) => { e.kiSteuerung.betriebsratFrage = { antwort: "ja", ...ST(true) }; }, "die Leitung muss die Pause erst aufheben"],
    ["Planer-Schalter aus", (e) => { e.kiSteuerung.planerSchalter = ST(false); }, "Schalter des Planers: aus"],
    ["Planer-Schalter fehlt", (e) => { delete e.kiSteuerung.planerSchalter; }, "Schalter des Planers: aus"],
    ["Planer-Schalter unlesbar", (e) => { e.kiSteuerung.planerSchalter = "an"; }, "Schalter des Planers: nicht lesbar"],
    ["Modus unlesbar", (e) => { e.kiSteuerung.planerModus = { modus: "immer", ...ST(true) }; }, null],
    ["Steuerung unlesbar", (e) => { e.kiSteuerung = "kaputt"; }, "Steuerung nicht lesbar"],
  ];
  for (const [name, aendere, text] of FAELLE) {
    it(`${name}: wirksam AUS auch bei Freigabe, Grund steht da, Erklärung stimmt mit dem Server überein`, () => {
      const e = VOLL(); aendere(e);
      const z = planerZustand(e, { freigegeben: true, reife: REIFE_OK });
      expect(z.wirksam, name).toBe("aus");
      expect(z.alleErfuellt).toBe(false);
      if (text) expect(z.fehlendeGruende.join(" | ")).toContain(text);
      expect(kiPlanerEntscheidung(e) !== "OK" || name === "Modus unlesbar").toBe(true);
      const s = html(h(PlanerSteuerungAnsicht, { z, steuern: false }));
      expect(s).toContain("Wirksam jetzt: AUS");
      expect(s).toContain(PLANER_TEXTE.wirksamAusGrund);
    });
  }
  it("unlesbarer Schalter, Modus oder Steuerung: Warnung mit role=alert", () => {
    const e1 = VOLL(); e1.kiSteuerung.planerSchalter = "an";
    expect(html(h(PlanerSteuerungAnsicht, { z: planerZustand(e1) }))).toMatch(/role="alert"[^>]*>Der gespeicherte Schalter des Planers ist nicht lesbar/);
    const e2 = VOLL(); e2.kiSteuerung.planerModus = { modus: "immer", ...ST(true) };
    expect(html(h(PlanerSteuerungAnsicht, { z: planerZustand(e2) }))).toMatch(/role="alert"[^>]*>Der gespeicherte Betriebsmodus ist nicht lesbar/);
    const e3 = VOLL(); e3.kiSteuerung = "kaputt";
    expect(html(h(PlanerSteuerungAnsicht, { z: planerZustand(e3) }))).toMatch(/role="alert"[^>]*>Die Intelligence-Steuerung dieses Betriebs ist nicht lesbar/);
  });
  it("Planungsreife: nicht bereit, nicht prüfbar oder fehlend gilt als nicht erfüllt, mit den fehlenden Punkten", () => {
    const nein = planerZustand(VOLL(), { freigegeben: true, reife: { bereit: false, luecken: [{ punkt: "personal", text: "Bei 3 Personen fehlt die Einheit." }, { punkt: "x", text: "nur Hinweis", hinweis: true }] }, monatText: "Dezember 2026" });
    expect(nein.alleErfuellt).toBe(false);
    expect(nein.fehlendeGruende.join(" ")).toContain("Planungsreife für Dezember 2026: nicht erfüllt – Bei 3 Personen fehlt die Einheit.");
    expect(nein.fehlendeGruende.join(" ")).not.toContain("nur Hinweis");
    expect(planerZustand(VOLL(), { freigegeben: true, reife: null }).alleErfuellt).toBe(false);
    expect(planerZustand(VOLL(), { freigegeben: true, reife: null }).fehlendeGruende.join(" ")).toContain("nicht prüfbar");
    expect(planerZustand(VOLL(), { freigegeben: true, reife: REIFE_OK }).alleErfuellt).toBe(true);
  });
  it("C-1: wirksam, aber Planungsreife fehlt: Pill und Zeile sagen „eingeschränkt: Planungsreife fehlt“; global AUS und volle Reife nicht", () => {
    const nein = { bereit: false, luecken: [{ punkt: "personal", text: "Bei 3 Personen fehlt die Einheit." }] };
    const z = planerZustand(VOLL(), { freigegeben: true, reife: nein });
    expect(z.wirksam).toBe("knopfdruck");
    expect(z.reifeFehlt).toBe(true);
    const s = html(h(PlanerSteuerungAnsicht, { z }));
    expect(s).toMatch(/pille[^>]*>eingeschränkt: Planungsreife fehlt</);
    expect(s).toContain("Wirksam jetzt: Auf Knopfdruck (eingeschränkt: Planungsreife fehlt)");
    expect(s).toContain("Planer für diesen Betrieb: an");
    expect(planerZustand(VOLL(), { freigegeben: true, reife: REIFE_OK }).reifeFehlt).toBe(false);
    expect(html(h(PlanerSteuerungAnsicht, { z: planerZustand(VOLL(), { reife: nein }) }))).not.toContain("eingeschränkt");
  });
  it("C-4: „vorgemerkt“ nur, solange der Planer nicht wirksam ist", () => {
    const aus = html(h(PlanerSteuerungAnsicht, { z: planerZustand(VOLL(), { reife: REIFE_OK }) }));
    expect(aus).toContain("vorgemerkt: an");
    expect(aus).toContain("Betriebsmodus: Auf Knopfdruck (vorgemerkt)");
    const an = html(h(PlanerSteuerungAnsicht, { z: planerZustand(VOLL(), { freigegeben: true, reife: REIFE_OK }) }));
    expect(an).not.toContain("vorgemerkt");
  });
  it("Zustände stehen als Text (nicht nur Farbe): jede Voraussetzung nennt „erfüllt“ oder „fehlt“", () => {
    const s = html(h(PlanerSteuerungAnsicht, { z: planerZustand(VOLL(), { reife: REIFE_OK }) }));
    const punkte = [...s.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]).filter((t) => t.includes("—"));
    expect(punkte.length).toBeGreaterThanOrEqual(6);
    for (const p of punkte) expect(p).toMatch(/ — (erfüllt|fehlt)$/);
  });
  it("Rechte in der Ansicht: Leitung hat Schalter und Modusknöpfe, Planung nur lesen; Demo nennt es", () => {
    const z = planerZustand(VOLL(), { reife: REIFE_OK });
    const leit = html(h(PlanerSteuerungAnsicht, { z, steuern: true }));
    expect(leit).toContain('role="switch"');
    for (const id of ["aus", "knopfdruck", "automatisch"]) expect(leit).toContain(MODUS_TEXT[id].name);
    expect(leit).toContain('aria-pressed="true"');
    const plan = html(h(PlanerSteuerungAnsicht, { z, steuern: false }));
    expect(plan).not.toMatch(/role="switch"|<button/);
    expect(plan).toContain(PLANER_TEXTE.nurLesen);
    expect(html(h(PlanerSteuerungAnsicht, { z, steuern: false, demo: true }))).toContain(PLANER_TEXTE.demoLesen);
  });
  it("die Komponente: Leitung mit Aktionen bekommt Bedienelemente, Planung nicht; Demo-Zugang liest nur", () => {
    const sitz = (rolle) => ({ rolle: "kunde", mandant: { id: "m", einstellungen: VOLL(), personen: [], dienstarten: [], abweichungen: {} }, person: { id: "z", rolle, vorname: "V", nachname: "N" } });
    const akt = { setzePlanerSteuerung: async () => ({ ok: true, text: "x" }) };
    expect(html(h(PlanerSteuerung, { sitz: sitz("leitung"), akt }))).toContain('role="switch"');
    expect(html(h(PlanerSteuerung, { sitz: sitz("planer"), akt }))).not.toContain('role="switch"');
    expect(html(h(PlanerSteuerung, { sitz: sitz("leitung"), akt: {} }))).not.toContain('role="switch"');
    SPM.zugangsdaten = () => ({ demo: true });
    try { expect(html(h(PlanerSteuerung, { sitz: sitz("leitung"), akt }))).not.toContain('role="switch"'); } finally { SPM.zugangsdaten = () => ({}); }
  });
  it("Zielgröße (WCAG 2.2, SC 2.5.8): nur Bausteine mit Mindesthöhe, keine rohen kleinen Bedienelemente (axe target-size, Review CI #606)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const d of ["src/ansichten/planer-steuerung.jsx", "src/ansichten/anheftungen.jsx"]) {
      const q = readFileSync(new URL(`../${d}`, import.meta.url), "utf8");
      expect(q, d).not.toMatch(/<summary|<details|<button|<a [^>]*href|<input|<select|<textarea/);
    }
    const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    const hoehe = (re) => Number((app.match(re) || [])[1]);
    expect(hoehe(/\.btn-sm\{min-height:(\d+)px/)).toBeGreaterThanOrEqual(24);
    expect(hoehe(/\.inp,\.sel,textarea\.inp\{[^}]*?min-height:(\d+)px/)).toBeGreaterThanOrEqual(24);
    const stil = readFileSync(new URL("../src/v4/app-stil.js", import.meta.url), "utf8");
    expect(stil).toMatch(/\.btn\{min-height:var\(--v4-ziel\)/);
    /* Der Öffnen-Knopf ist ein Btn (Klasse btn) und im Monatsplan der einzige Bedienpunkt der leeren Leiste. */
    const leer = html(h(AnheftungenAnsicht, { m: { personen: [], abweichungen: {} }, ym: YM, darfBedienen: true }));
    expect([...leer.matchAll(/<button[^>]*class="btn /g)]).toHaveLength(1);
    expect([...leer.matchAll(/<button/g)]).toHaveLength(1);
  });
  it("Quelltext der Ansicht: keine Garantiesprache, keine Rohrollen, keine Inline-Stile", async () => {
    const { readFileSync } = await import("node:fs");
    for (const d of ["src/ansichten/planer-steuerung.jsx", "src/lib/planer-oberflaeche.js"]) {
      const q = readFileSync(new URL(`../${d}`, import.meta.url), "utf8");
      expect(q, d).not.toMatch(/garantier|sicher gelöst|ohne Risiko|fehlerfrei/i);
    }
    const jsx = readFileSync(new URL("../src/ansichten/planer-steuerung.jsx", import.meta.url), "utf8");
    expect(jsx).not.toMatch(/style=\{/);
    expect(jsx).not.toMatch(/rolle === "|\.rolle ===/);
    const an = readFileSync(new URL("../src/ansichten/anheftungen.jsx", import.meta.url), "utf8");
    expect(an).not.toMatch(/style=\{/);
    expect(an).not.toMatch(/rolle === "|\.rolle ===/);
  });
});

/* --------------------------------------------- 3. Planer-Schalter, Ende zu Ende */
const GEAENDERT = "Planer-Einstellung geändert";
const NICHT = /nicht übernommen/;
describe("Planer-Schalter und Betriebsmodus: Oberfläche → Aktion → PUT /api/bestand", () => {
  it("Vorbereitung durch die Leitung: Frage „nein“, Hauptschalter an (echte Aktion, bestätigt)", async () => {
    for (const absicht of [{ betriebsratFrage: { antwort: "nein" } }, { betrieb: { an: true } }]) {
      const o = await oberflaeche("l1");
      await mit(o, async () => { o.akt.setzeKiSteuerung(absicht); await vi.waitFor(() => expect(o.meldungen.length).toBe(1), { timeout: 20000 }); });
      expect(o.meldungen[0]).toBe("Intelligence-Steuerung geändert.");
    }
    expect(ki(await gespeichert()).betrieb).toMatchObject({ an: true, vonRolle: "leitung" });
  });
  it("Leitung schaltet den Planer: Server setzt Stempel, Meldung erst nach Bestätigung, die Anzeige zeigt weiter AUS (global)", async () => {
    const o = await oberflaeche("l1");
    const r = await mit(o, () => o.akt.setzePlanerSteuerung({ planerSchalter: { an: true } }));
    expect(r.ok, r.text).toBe(true);
    expect(r.text).toContain(GEAENDERT);
    expect(ki(await gespeichert()).planerSchalter).toMatchObject({ an: true, vonRolle: "leitung", vonPerson: "l1" });
    expect(ki(o.lokal()).planerSchalter).toMatchObject({ an: true, vonRolle: "leitung" });   // Stand des Servers übernommen
    const s = html(h(PlanerSteuerung, { sitz: o.sitz(), akt: o.akt }));
    expect(s).toContain("Wirksam jetzt: AUS");
    expect(s).toContain("global nicht freigegeben");
    expect(s).toContain("vorgemerkt: an");
    expect(s).toContain("Schalter des Planers: an — erfüllt");
  });
  it("Betriebsmodus: Knopf der Ansicht löst genau die Absicht aus; der Server übernimmt, Meldung erst nach Bestätigung", async () => {
    const o = await oberflaeche("l1");
    const aufrufe = [];
    const baum = PlanerSteuerungAnsicht({ z: planerZustand(o.lokal().einstellungen), steuern: true, onModus: (m) => aufrufe.push(m), onSchalter: (v) => aufrufe.push(v) });
    const k = knopf(baum, "Automatisch");
    expect(k, "Knopf Automatisch").not.toBeNull();
    k.props.onClick();
    expect(aufrufe).toEqual(["automatisch"]);
    const r = await mit(o, () => o.akt.setzePlanerSteuerung({ planerModus: { modus: aufrufe[0] } }));
    expect(r.ok, r.text).toBe(true);
    expect(ki(await gespeichert()).planerModus).toMatchObject({ modus: "automatisch", vonRolle: "leitung" });
    const z = planerZustand((await gespeichert()).einstellungen, { freigegeben: true, reife: REIFE_OK });
    expect(z.modusGespeichert).toBe("automatisch");
    expect(z.wirksam).toBe("automatisch");             // mit Freigabe (nur Projektion der Prüfung)
    expect(planerZustand((await gespeichert()).einstellungen, { reife: REIFE_OK }).wirksam).toBe("aus");   // Vorgabe: global AUS
  });
  it("Schalter-Knopf der Ansicht schickt den umgekehrten Wert", () => {
    const aufrufe = [];
    const baum = PlanerSteuerungAnsicht({ z: planerZustand(VOLL()), steuern: true, onSchalter: (v) => aufrufe.push(v) });
    const sw = finde(baum, (n) => n.props && n.props.label === PLANER_TEXTE.schalter && typeof n.props.onChange === "function");
    expect(sw).toHaveLength(1);
    sw[0].props.onChange(false);
    expect(aufrufe).toEqual([false]);
  });
  it("ohne Recht (Planung, Schichtverantwortung, Beschäftigte, Betriebsrat): wirkungslos, sichtbar „nicht übernommen/gespeichert“, nie geändert", async () => {
    const vorher = ki(await gespeichert());
    for (const id of ["p1", "s1", "a1", "r1"]) {
      for (const absicht of [{ planerSchalter: { an: false } }, { planerModus: { modus: "aus" } }]) {
        const o = await oberflaeche(id);
        const r = await mit(o, () => o.akt.setzePlanerSteuerung(absicht));
        expect(r.ok, `${id} ${Object.keys(absicht)}`).toBe(false);
        expect(r.text, id).toMatch(/nicht übernommen|nicht gespeichert/);
        expect(r.text, id).not.toContain(GEAENDERT);
        expect(ki(await gespeichert()).planerSchalter, id).toEqual(vorher.planerSchalter);
        expect(ki(await gespeichert()).planerModus, id).toEqual(vorher.planerModus);
      }
    }
  });
  it("Konflikt (409): sichtbarer Fehler, der lokale Stand geht zurück, nichts „geändert“", async () => {
    const o = await oberflaeche("l1");
    const andere = await oberflaeche("l1");
    await mit(andere, () => andere.akt.setzePlanerSteuerung({ planerModus: { modus: "knopfdruck" } }));   // verändert den Stand und den ETag
    const vorher = ki(o.lokal()).planerModus;
    const r = await mit(o, () => o.akt.setzePlanerSteuerung({ planerModus: { modus: "aus" } }));
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/zwischenzeitlich geändert/);
    expect(ki(o.lokal()).planerModus).toEqual(vorher);
    expect(ki(await gespeichert()).planerModus.modus).toBe("knopfdruck");
  });
  it("Lesefehler bei der Bestätigung: „nicht bestätigen“, nie „geändert“", async () => {
    const o = await oberflaeche("l1");
    leseFehler = true;
    try {
      const r = await mit(o, () => o.akt.setzePlanerSteuerung({ planerModus: { modus: "aus" } }));
      expect(r.ok).toBe(false);
      expect(r.text).toMatch(/nicht bestätigen/);
      expect(r.text).not.toContain(GEAENDERT);
    } finally { leseFehler = false; }
  });
  it("Speicherweg ohne Rückmeldung: nach der Wartezeit sichtbarer Fehler statt endlosem Warten", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const o = await oberflaeche("l1");
      schreibModus = "stumm";
      const p = mit(o, () => o.akt.setzePlanerSteuerung({ planerModus: { modus: "automatisch" } }));
      await vi.advanceTimersByTimeAsync(46000);
      const r = await p;
      expect(r.ok).toBe(false);
      expect(r.text).toMatch(/nicht geantwortet/);
    } finally { schreibModus = null; vi.useRealTimers(); }
  });
  it("Absage des Servers wird sichtbar (role=alert), mit dem Grund; ungültiger Modus kommt nicht als „geändert“ zurück", async () => {
    const o = await oberflaeche("l1");
    const r = await mit(o, () => o.akt.setzePlanerSteuerung({ planerModus: { modus: "sofort" } }));
    expect(r.ok).toBe(false);
    expect(r.text).not.toContain(GEAENDERT);
    const s = html(h(PlanerSteuerungAnsicht, { z: planerZustand(VOLL()), steuern: true, status: r }));
    expect(s).toMatch(/role="alert"/);
    expect(planerFehlerText({ text: "Anheften: ungültig" })).toBe("Die Änderung konnte nicht gespeichert werden: Anheften: ungültig");
    expect(planerFehlerText(null)).toBe("Die Änderung konnte nicht gespeichert werden.");
    expect(planerFehlerText({ art: "bestaetigung", text: "x" })).toContain("Bestätigung");
  });
  it("Erfolg steht als Rückmeldung (role=status), nicht als Warnung", () => {
    const s = html(h(PlanerSteuerungAnsicht, { z: planerZustand(VOLL()), steuern: true, status: { ok: true, text: "Planer-Einstellung geändert." } }));
    expect(s).toMatch(/role="status">Planer-Einstellung geändert\./);
  });
  it("Demo-Sitzung am Server: Schalter und Modus bleiben ohne Wirkung (Regel des Servers)", async () => {
    const o = await oberflaeche("l1");
    const r = kiSteuerungAnwenden(kiSteuerungLesen(o.lokal().einstellungen), { planerSchalter: { an: false }, planerModus: { modus: "aus" } },
      { rolle: "leitung", demo: true, person: "l1" }, "2026-11-28T08:00:00.000Z");
    expect(r.ereignisse).toEqual([]);
  });
});

/* ------------------------------------------------------------ 4. Anheften */
const lesen = async (id) => (await oberflaeche(id));
const KEY = "x1|2026-12-07";
describe("Anheften und Lösen: Oberfläche → Aktion → PUT /api/bestand", () => {
  it("reine Teile: Einteilung zum Anheften (Eintrag, Dienst aus dem Plan, frei, Abwesenheit, nicht im Dienst, unbekannt)", () => {
    const m = { personen: [person("x1", "mitarbeiter"), { ...person("x2", "mitarbeiter"), eintritt: "2027-01-01" }, person("x3", "mitarbeiter")],
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }], einheiten: [{ id: "e1" }], abweichungen: { "x1|2026-12-07": "F", "x1|2026-12-08": "-" },
      abwesenheiten: [{ personId: "x3", von: "2026-12-10", bis: "2026-12-12", art: "urlaub" }] };
    expect(einteilungZumAnheften(m, "x1", "2026-12-07")).toEqual({ ok: true, wert: "F", schluessel: KEY });
    expect(einteilungZumAnheften(m, "x1", "2026-12-08")).toMatchObject({ ok: true, wert: "-" });
    expect(einteilungZumAnheften(m, "x1", "2026-12-09")).toMatchObject({ ok: true, wert: "-" });          // kein Dienst im Plan: frei
    expect(einteilungZumAnheften(m, "x2", "2026-12-09").ok).toBe(false);                                    // noch nicht im Dienst
    expect(einteilungZumAnheften(m, "x3", "2026-12-11")).toMatchObject({ ok: false });
    expect(einteilungZumAnheften(m, "x3", "2026-12-11").grund).toContain("abwesend");
    expect(einteilungZumAnheften(m, "zz", "2026-12-09")).toMatchObject({ ok: false });
    expect(einteilungZumAnheften(m, "", "")).toMatchObject({ ok: false });
    expect(einteilungZumAnheften(null, "x1", "2026-12-07")).toMatchObject({ ok: false });
    expect(tageImMonat("2026-12")).toHaveLength(31);
    expect(tageImMonat("2026-02")).toHaveLength(28);
    expect(tageImMonat("2026-13")).toEqual([]);
  });
  it("mitAnheftung/ohneAnheftung: nur der gewählte Eintrag ändert sich; unlesbare Karte: nichts schreiben", () => {
    const m = { abweichungen: { "a|2026-12-01": "F" }, angeheftet: { "a|2026-12-01": { am: "t", vonRolle: "leitung" }, "b|2026-12-02": { am: "t", vonRolle: "leitung", aufgehobenAm: "u", aufgehobenVonRolle: "planer" } } };
    const n = mitAnheftung(m, "c|2026-12-03", "N");
    expect(n.angeheftet["c|2026-12-03"]).toEqual({ aktiv: true });
    expect(n.abweichungen["c|2026-12-03"]).toBe("N");
    expect(n.angeheftet["a|2026-12-01"]).toEqual(m.angeheftet["a|2026-12-01"]);
    expect(n.angeheftet["b|2026-12-02"]).toEqual(m.angeheftet["b|2026-12-02"]);
    expect(Object.keys(ohneAnheftung(m, "a|2026-12-01").angeheftet)).toEqual(["b|2026-12-02"]);
    expect(ohneAnheftung(m, "a|2026-12-01").abweichungen).toEqual(m.abweichungen);
    expect(mitAnheftung({ angeheftet: "x", abweichungen: {} }, "c|2026-12-03", "N")).toBeNull();
    expect(ohneAnheftung({ angeheftet: [] }, "c|2026-12-03")).toBeNull();
    expect(mitAnheftung(m, "kaputt", "N")).toBeNull();
    expect(mitAnheftung(m, "c|2026-12-03", "")).toBeNull();
  });
  it("anheftungBestaetigt: nur wenn der Serverstand es zeigt (fail closed)", () => {
    const sm = { abweichungen: { [KEY]: "F" }, angeheftet: { [KEY]: { am: "t", vonRolle: "leitung" } } };
    expect(anheftungBestaetigt("anheften", KEY, "F", sm)).toBe(true);
    expect(anheftungBestaetigt("anheften", KEY, "N", sm)).toBe(false);
    expect(anheftungBestaetigt("anheften", KEY, "F", { ...sm, angeheftet: {} })).toBe(false);
    expect(anheftungBestaetigt("anheften", KEY, "F", { ...sm, angeheftet: { [KEY]: { am: "t", vonRolle: "x", aufgehobenAm: "u", aufgehobenVonRolle: "y" } } })).toBe(false);
    expect(anheftungBestaetigt("anheften", KEY, "F", { ...sm, angeheftet: "kaputt" })).toBe(false);
    expect(anheftungBestaetigt("anheften", KEY, "F", null)).toBe(false);
    expect(anheftungBestaetigt("loesen", KEY, undefined, { angeheftet: {} })).toBe(true);
    expect(anheftungBestaetigt("loesen", KEY, undefined, sm)).toBe(false);
    expect(anheftungBestaetigt("loesen", KEY, undefined, {})).toBe(false);                 // Sicht ohne Karte (keine Rolle dafür): keine Bestätigung
    expect(anheftungBestaetigt("loesen", KEY, undefined, { angeheftet: "kaputt" })).toBe(false);
  });
  it("Planung heftet an (Knopf der Ansicht → Aktion): Server setzt Stempel, Meldung erst nach Bestätigung, Einteilung steht in den Abweichungen", async () => {
    const o = await lesen("p1");
    const aufrufe = [];
    const baum = AnheftungenAnsicht({ m: o.lokal(), ym: YM, darfBedienen: true, offen: true, personId: "x1", tag: "2026-12-07", onAnheften: (p, t) => aufrufe.push([p, t]) });
    const k = knopf(baum, ANHEFTEN_TEXTE.anheften);
    expect(k, "Knopf Einteilung anheften").not.toBeNull();
    expect(k.props.disabled).toBe(false);
    k.props.onClick();
    expect(aufrufe).toEqual([["x1", "2026-12-07"]]);
    const r = await mit(o, () => o.akt.anheftenEinteilung(...aufrufe[0]));
    expect(r.ok, r.text).toBe(true);
    expect(r.text).toBe("Einteilung angeheftet: Der Planer ändert sie nicht.");
    const g = await gespeichert();
    expect(g.angeheftet[KEY]).toMatchObject({ vonRolle: "planer" });
    expect(typeof g.angeheftet[KEY].am).toBe("string");
    expect(g.abweichungen[KEY]).toBe("F");
    expect(o.lokal().angeheftet[KEY]).toEqual(g.angeheftet[KEY]);      // Stempel des Servers übernommen
    const s = html(h(AnheftungenAnsicht, { m: o.lokal(), ym: YM, darfBedienen: true, status: r }));
    expect(s).toContain("angeheftet");
    expect(s).toContain(ANHEFTEN_TEXTE.loesen);
    expect(s).toMatch(/role="status">Einteilung angeheftet/);
  });
  it("Anheften einer Einteilung aus der Schichtfolge/frei: wird als eigene Einteilung eingetragen und angeheftet", async () => {
    const o = await lesen("l1");
    const r = await mit(o, () => o.akt.anheftenEinteilung("a1", "2026-12-02"));
    expect(r.ok, r.text).toBe(true);
    const g = await gespeichert();
    expect(g.abweichungen["a1|2026-12-02"]).toBe("-");
    expect(g.angeheftet["a1|2026-12-02"]).toMatchObject({ vonRolle: "leitung" });
  });
  it("nicht anheftbar (Person unbekannt, nichts gewählt): sichtbarer Grund, nichts gesendet", async () => {
    const o = await lesen("l1");
    const vorher = (await gespeichert()).angeheftet;
    const r1 = await mit(o, () => o.akt.anheftenEinteilung("zz", "2026-12-03"));
    expect(r1).toMatchObject({ ok: false, text: "Die Person gehört nicht zum Betrieb." });
    const r2 = await mit(o, () => o.akt.anheftenEinteilung("", ""));
    expect(r2.ok).toBe(false);
    expect((await gespeichert()).angeheftet).toEqual(vorher);
    expect(html(h(AnheftungenAnsicht, { m: o.lokal(), ym: YM, darfBedienen: true, status: r1 }))).toMatch(/role="alert"/);
  });
  it("Lösen (Knopf der Ansicht): Eintrag entfällt am Server, die Einteilung bleibt, Meldung erst nach Bestätigung", async () => {
    const o = await lesen("l1");
    const aufrufe = [];
    const baum = AnheftungenAnsicht({ m: o.lokal(), ym: YM, darfBedienen: true, onLoesen: (s) => aufrufe.push(s) });
    const alle = finde(baum, (n) => typeof n.props.onClick === "function" && String(n.props["aria-label"] || "").startsWith("Lösen:"));
    expect(alle.length).toBe(2);
    const knopfA1 = alle.find((n) => n.props["aria-label"].includes("Va1 Na1"));
    expect(knopfA1, "Lösen-Knopf der Zeile von a1").toBeTruthy();
    knopfA1.props.onClick();
    expect(aufrufe).toEqual(["a1|2026-12-02"]);
    const r = await mit(o, () => o.akt.loeseAnheftung(aufrufe[0]));
    expect(r.ok, r.text).toBe(true);
    expect(r.text).toContain("Anheftung gelöst");
    const g = await gespeichert();
    expect(g.angeheftet).not.toHaveProperty(aufrufe[0]);
    expect(g.abweichungen[aufrufe[0]]).toBeDefined();
  });
  it("manuelle Änderung hebt NUR diese Anheftung auf: die Ansicht sagt „nicht mehr angeheftet — manuell geändert“, die andere bleibt angeheftet", async () => {
    const l = await lesen("l1");
    const r0 = await mit(l, () => l.akt.anheftenEinteilung("x1", "2026-12-07"));
    expect(r0.ok, r0.text).toBe(true);
    const l2 = await lesen("l1");
    expect((await mit(l2, () => l2.akt.anheftenEinteilung("a1", "2026-12-03"))).ok).toBe(true);
    // manuell ändern (wie der Plan: Abweichung des Tages ändern) über den echten Voll-PUT der Planung
    const p = await oberflaeche("p1");
    p.ref.current.mandanten[0].abweichungen["x1|2026-12-07"] = "-";
    const e = await anfrage("/api/bestand", { methode: "PUT", token: T.p1, rumpf: { bestand: (({ session: _s, ...x }) => x)(p.ref.current), etag: p.etag, durch: "Planung" } });
    expect(e.status, e.roh).toBe(200);
    const o = await lesen("l1");
    const m = o.lokal();
    expect(m.angeheftet[KEY]).toHaveProperty("aufgehobenAm");
    const s = html(h(AnheftungenAnsicht, { m, ym: YM, darfBedienen: true }));
    expect(s).toContain("nicht mehr angeheftet — manuell geändert am");
    expect(s).toContain("(Planung)");
    expect(m.angeheftet["a1|2026-12-03"]).not.toHaveProperty("aufgehobenAm");     // die übrige Anheftung ist nicht betroffen
    expect(s).toContain("Va1 Na1: angeheftet");
    // erneut anheften (Knopf der Ansicht): neuer Stempel, Vermerk weg
    const aufrufe = [];
    const baum = AnheftungenAnsicht({ m, ym: YM, darfBedienen: true, onAnheften: (a, b) => aufrufe.push([a, b]) });
    const erneut = finde(baum, (n) => typeof n.props.onClick === "function" && textVon(n.props.children).trim() === `${ANHEFTEN_TEXTE.erneut}: frei`);
    expect(erneut, "Knopf nennt den Wert, der angeheftet wird").toHaveLength(1);
    expect(erneut[0].props["aria-label"]).toMatch(/^Erneut anheften: frei — Vx1 Nx1/);
    erneut[0].props.onClick();
    expect(aufrufe).toEqual([["x1", "2026-12-07"]]);
    const r = await mit(o, () => o.akt.anheftenEinteilung(...aufrufe[0]));
    expect(r.ok, r.text).toBe(true);
    const g = await gespeichert();
    expect(g.angeheftet[KEY]).not.toHaveProperty("aufgehobenAm");
    expect(g.abweichungen[KEY]).toBe("-");
  });
  it("ohne Recht (Schichtverantwortung, Beschäftigte, Betriebsrat): wirkungslos und sichtbar abgewiesen, nichts angeheftet", async () => {
    const l = await lesen("l1");
    expect((await mit(l, () => l.akt.anheftenEinteilung("a1", "2026-12-04"))).ok).toBe(true);
    const vorher = (await gespeichert()).angeheftet;
    for (const id of ["s1", "a1", "r1"]) {
      const o = await lesen(id);
      const r = await mit(o, () => o.akt.anheftenEinteilung("x1", "2026-12-20"));
      expect(r.ok, id).toBe(false);
      expect(r.text, id).toMatch(/nicht übernommen|nicht gespeichert/);
      expect((await gespeichert()).angeheftet, id).toEqual(vorher);
      expect(Object.keys((await gespeichert()).abweichungen), id).not.toContain("x1|2026-12-20");
      const rl = await mit(o, () => o.akt.loeseAnheftung("a1|2026-12-04"));
      expect(rl.ok, id).toBe(false);
      expect((await gespeichert()).angeheftet["a1|2026-12-04"], id).toBeDefined();
    }
  });
  it("Konflikt (409) beim Anheften: sichtbarer Fehler, lokaler Stand zurückgenommen", async () => {
    const o = await lesen("l1");
    const andere = await lesen("l1");
    await mit(andere, () => andere.akt.anheftenEinteilung("a1", "2026-12-15"));
    const vorherAbw = { ...o.lokal().abweichungen };
    const r = await mit(o, () => o.akt.anheftenEinteilung("a1", "2026-12-16"));
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/zwischenzeitlich geändert/);
    expect(o.lokal().abweichungen).toEqual(vorherAbw);
    expect(o.lokal().angeheftet).not.toHaveProperty("a1|2026-12-16");
    expect((await gespeichert()).angeheftet).not.toHaveProperty("a1|2026-12-16");
  });
  it("Lesefehler bei der Bestätigung: „nicht bestätigen“, nie „angeheftet“", async () => {
    const o = await lesen("l1");
    leseFehler = true;
    try {
      const r = await mit(o, () => o.akt.anheftenEinteilung("a1", "2026-12-17"));
      expect(r.ok).toBe(false);
      expect(r.text).toMatch(/nicht bestätigen/);
      expect(r.text).not.toMatch(/Einteilung angeheftet/);
    } finally { leseFehler = false; }
  });
  it("unlesbare Karte: Warnung (role=alert), Anheften und Lösen nicht angeboten, nichts geschrieben", async () => {
    const o = await lesen("l1");
    const m = { ...o.lokal(), angeheftet: "kaputt" };
    const s = html(h(AnheftungenAnsicht, { m, ym: YM, darfBedienen: true }));
    expect(s).toMatch(/role="alert"[^>]*>Die Anheftungen des Betriebs sind nicht lesbar/);
    expect(s).not.toMatch(/<button/);
    // die Aktion schreibt bei unlesbarer Karte nichts
    o.ref.current.mandanten[0].angeheftet = "kaputt";
    const vorher = (await gespeichert()).angeheftet;
    const r = await mit(o, () => o.akt.anheftenEinteilung("a1", "2026-12-18"));
    expect(r).toMatchObject({ ok: false });
    expect(r.text).toContain("nicht lesbar");
    const rl = await mit(o, () => o.akt.loeseAnheftung("a1|2026-12-04"));
    expect(rl.ok).toBe(false);
    expect((await gespeichert()).angeheftet).toEqual(vorher);
  });
  it("Rechte in der Ansicht: ohne Recht weder Lösen noch Anheften; Planung/Leitung mit Recht; ohne Eintrag und ohne Recht nichts", async () => {
    const o = await lesen("l1");
    const m = o.lokal();
    const ohne = html(h(AnheftungenAnsicht, { m, ym: YM, darfBedienen: false }));
    expect(ohne).toContain("angeheftet");
    expect(ohne).not.toMatch(/<button/);
    expect(html(h(AnheftungenAnsicht, { m: { personen: [], abweichungen: {} }, ym: YM, darfBedienen: false }))).toBe("");
    const mit_ = html(h(AnheftungenAnsicht, { m, ym: YM, darfBedienen: true }));
    expect(mit_).toContain(ANHEFTEN_TEXTE.anheftenOeffnen);
    expect(mit_).toContain('aria-expanded="false"');
    expect(mit_).not.toContain(ANHEFTEN_TEXTE.hinweis);                       // Formular erst nach dem Öffnen
    const offen = html(h(AnheftungenAnsicht, { m, ym: YM, darfBedienen: true, offen: true }));
    expect(offen).toContain('aria-expanded="true"');
    expect(offen).toContain(ANHEFTEN_TEXTE.hinweis);
    expect(html(h(AnheftungenAnsicht, { m: { personen: [], abweichungen: {} }, ym: YM, darfBedienen: true }))).toContain(ANHEFTEN_TEXTE.leer);
  });
  it("die Komponente im Monatsplan: Leitung und Planung mit Aktionen bekommen das Formular, Demo und fehlende Aktionen nicht", async () => {
    const o = await lesen("l1");
    const sitz = o.sitz();
    const akt = o.akt;
    expect(html(h(Anheftungen, { m: o.lokal(), ym: YM, sitz, akt }))).toContain(ANHEFTEN_TEXTE.anheftenOeffnen);
    expect(html(h(Anheftungen, { m: o.lokal(), ym: YM, sitz, akt: undefined }))).not.toContain(ANHEFTEN_TEXTE.anheftenOeffnen);
    SPM.zugangsdaten = () => ({ demo: true });
    try { expect(html(h(Anheftungen, { m: o.lokal(), ym: YM, sitz, akt }))).not.toContain(ANHEFTEN_TEXTE.anheftenOeffnen); } finally { SPM.zugangsdaten = () => ({}); }
    const p = await lesen("p1");
    expect(html(h(Anheftungen, { m: p.lokal(), ym: YM, sitz: p.sitz(), akt: p.akt }))).toContain(ANHEFTEN_TEXTE.anheftenOeffnen);
  });
});
