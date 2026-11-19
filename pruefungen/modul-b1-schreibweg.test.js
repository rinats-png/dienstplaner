/* ==========================================================================
   WP-19 B1 — Schreibwege der fünf älteren Module im Status „geplant“ geschlossen

   Posten, Bereichsplan, geteilter Dienst, Anlagen und Maschinenqualifikation
   speicherten bis zu diesem Paket Daten, obwohl ihr Status in der Registry
   „geplant“ ist (Befund B1, docs/acc45/WP-19-MODULABNAHME.md). Jetzt fragt die
   Registerwache (server/lib/modul-altwege.mjs) im einen Modulschreibweg —
   dieselbe Regel und Antwort wie bei den neueren Modulen (modul-wege.mjs).

   Alles über die echten Handler (PUT /api/bestand, POST /api/bestand/teile mit
   CENTRIC_TEILSPEICHERUNG), mit manipulierten Rümpfen, Dateiablage und echten
   Sitzungen, für alle Rollen (Leitung, Planung, Kundenrolle,
   Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber, Demo-Leitung,
   Demo-Planung) × fünf Module × beide Wege:

     A  Registry echt („geplant“): nichts gespeichert, Leitung & Co. 403 mit
        dem Text der neueren Module; Kern bleibt frei; Altbestand unverändert
        und lesbar.
     B  Prüfmodus „vorlaeufig“ (nur hier: Registry-Kopie über vi.doMock,
        frisch geladene Servermodule): Schreiben wie dokumentiert je Rolle
        (Planung/Leitung/Kundenrolle/Demo; Schichtverantwortung nur
        Bereichsplan der eigenen Einheit; Beschäftigte, Betriebsrat,
        Betreiber nie).
     C  Unbekannter, fehlender oder unsinniger Status: geschlossen.

   Die Registry in server/lib/branchenmodule.mjs bleibt „geplant“ (geprüft).
   Aufruf: npm run pruefung:modul-b1
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { altmodulWache, altmoduldatenVerwerfen } from "../server/lib/modul-altwege.mjs";

const WIRT = "127.0.0.1:3000";
const MODULE = ["posten", "bereichsplan", "geteilterdienst", "anlagen", "maschinenqual"];
const kopie = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
let wurzel;
let nr = 0;

/* --------------------------------------------------------------- Rollen */
const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  PL: { rolle: "planer", person: "p1" },
  KD: { rolle: "kunde", person: null },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "a1" },
  BR: { rolle: "betriebsrat", person: "b1" },
  BT: { rolle: "betreiber", person: null },
  DL: { rolle: "leitung", person: "l1", demo: true },
  DP: { rolle: "planer", person: "p1", demo: true },
};
const ALLE = Object.keys(ROLLEN);
/** Wer im Prüfmodus schreibt (Abnahmematrix, docs/acc45/WP-19-MODULABNAHME.md): Planung, Leitung, Kundenrolle, Demo; die
    Schichtverantwortung nur den Bereichsplan der eigenen Einheit. */
const SCHREIBT = (k, modul) => ["LT", "PL", "KD", "DL", "DP"].includes(k) || (k === "SV" && modul === "bereichsplan");

/* --------------------------------------------------------------- Bestand mit Altdaten der fünf Module */
let tag;
const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv", geburtstag: "1980-01-01",
  qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit === "ALLE" ? "e1" : einheit }] });
const ALT = () => ({
  objekte: [{ id: "o1", name: "Objekt Alt", standortId: null, posten: [{ id: "po1", name: "Pforte", soll: { F: 1 }, qualifikationen: [] },
    { id: "po2", name: "Rundgang", soll: { F: 1 }, qualifikationen: [] }] }],
  postenPlan: { [`a1|${tag(2)}`]: "po1" },
  bereichsPlan: { [`a1|${tag(2)}`]: "b1" },
  /* Formgültig (pruefeBereiche: nur id, name, soll) — damit die Fälle unten die Registerwache treffen, nicht die Formprüfung. */
  bereicheE1: [{ id: "b1", name: "Bereich Alt", soll: { F: 1 } }, { id: "b2", name: "Bereich Zwei", soll: { F: 1 } }],
  geteilt: { id: "GA", name: "Geteilt Alt", start: "06:00", ende: "10:00", zweiterAbschnitt: { start: "15:00", ende: "19:00" } },
  anlage: { id: "bm1", art: "anlage", name: "Presse Alt", personId: null, mindestBesetzung: { F: 1 },
    laufzeit: { wochentage: [true, true, true, true, true, false, false], ausnahmen: [] } },
  kompetenz: { id: "k-alt", name: "Bedienung Presse Alt", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 12, befaehigtePerson: false,
    stufe: "", freigabeStelle: "", grundlage: "", pflichtFuer: [], zugedacht: [] },
});
function bestand() {
  const alt = ALT();
  return { version: 9, stand: 1, mandanten: [{
    id: "m1", name: "Testbetrieb", branche: "sonstiges", status: "aktiv", pakete: ["sicherheit", "pflege", "klinik", "industrie"],
    einheiten: [{ id: "e1", name: "E1", versatzTage: 0, bereiche: alt.bereicheE1 }, { id: "e2", name: "E2", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", zweiterAbschnitt: null }, alt.geteilt],
    zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", qualifikationen: [],
    /* Schalter im Betrieb an: Es entscheidet allein der Status der Registry. */
    einstellungen: { ruhezeit: 11, maxFolge: 6, branchenmodule: Object.fromEntries(MODULE.map((id) => [id, { an: true }])) },
    personen: [person("l1", "leitung", "ALLE"), person("p1", "planer", "ALLE"), person("s1", "subplaner", "e1"),
      person("a1", "mitarbeiter", "e1"), person("a2", "mitarbeiter", "e1"), person("b1", "betriebsrat", "ALLE")],
    objekte: alt.objekte, postenPlan: alt.postenPlan, bereichsPlan: alt.bereichsPlan,
    betriebsmittel: [alt.anlage, { id: "bm2", art: "schluessel", name: "Tor", personId: null }],
    kompetenzen: [alt.kompetenz],
    abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [], erfassung: {}, einstempeln: {},
  }] };
}
/** Die Teile der fünf Module im gespeicherten Betrieb (zum Vergleich vorher/nachher). */
const modulteile = (m) => ({
  objekte: m.objekte, postenPlan: m.postenPlan, bereichsPlan: m.bereichsPlan,
  bereiche: (m.einheiten || []).map((e) => [e.id, e.bereiche || null]),
  zweiter: (m.dienstarten || []).map((d) => [d.id, d.zweiterAbschnitt || null]),
  anlagen: (m.betriebsmittel || []).filter((x) => x && x.art === "anlage"),
  kompetenzen: (m.kompetenzen || []).filter((k) => k && (k.befaehigtePerson !== undefined || k.betriebsmittelId === "bm1")),
});

/* --------------------------------------------------------------- Manipulationen je Modul (Feld → neuer Wert aus dem Wert der Sicht) */
const AENDERUNG = {
  posten: {
    objekte: (w) => [...(w || []), { id: "o2", name: "Objekt Neu", standortId: null, posten: [{ id: "po9", name: "Tor Neu", soll: { F: 1 }, qualifikationen: [] }] }],
    postenPlan: (w) => ({ ...(w || {}), [`a2|${tag(4)}`]: "po2" }),
  },
  bereichsplan: { bereichsPlan: (w) => ({ ...(w || {}), [`a2|${tag(4)}`]: "b2" }) },
  geteilterdienst: { dienstarten: (w) => [...(w || []), { id: "GN", name: "Geteilt Neu", start: "07:00", ende: "11:00", zweiterAbschnitt: { start: "16:00", ende: "20:00" }, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }] },
  anlagen: { betriebsmittel: (w) => [...(w || []), { id: "bm9", art: "anlage", name: "Presse Neu", personId: null, mindestBesetzung: { F: 2 },
    laufzeit: { wochentage: [true, true, true, true, true, false, false], ausnahmen: [] } }] },
  maschinenqual: { kompetenzen: (w) => [...(w || []), { id: "k-neu", name: "Befähigt Presse", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 12,
    befaehigtePerson: true, stufe: "", freigabeStelle: "", grundlage: "", pflichtFuer: [], zugedacht: [] }] },
};
/** Ist die Änderung gespeichert? Je Modul am kennzeichnenden Eintrag. */
const GESPEICHERT = {
  posten: (m) => (m.objekte || []).some((o) => o.id === "o2") || !!(m.postenPlan || {})[`a2|${tag(4)}`],
  bereichsplan: (m) => (m.bereichsPlan || {})[`a2|${tag(4)}`] === "b2",
  geteilterdienst: (m) => (m.dienstarten || []).some((d) => d.id === "GN" && d.zweiterAbschnitt),
  anlagen: (m) => (m.betriebsmittel || []).some((x) => x.id === "bm9"),
  maschinenqual: (m) => (m.kompetenzen || []).some((k) => k.id === "k-neu"),
};

/* --------------------------------------------------------------- Server laden (echt oder mit Registry-Kopie) */
/** Lädt die Servermodule frisch; `status`: null = Registry echt, sonst Funktion Modul → Status für die fünf Module (nur Test). */
async function server(status) {
  vi.resetModules();
  vi.doUnmock("../server/lib/branchenmodule.mjs");
  if (status) {
    vi.doMock("../server/lib/branchenmodule.mjs", async (echt) => {
      const e = /** @type {any} */ (await echt());
      return { ...e, BRANCHENMODULE: Object.freeze(e.BRANCHENMODULE.map((x) => {
        if (!MODULE.includes(x.id)) return x;
        const s = status(x.id);
        if (s === "FEHLT") { const { status: _w, ...ohne } = x; void _w; return ohne; }
        return { ...x, status: s };
      })) };
    });
  }
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  const laden = () => getStore({ name: "centric", consistency: "strong" });
  const daten = (await import("../server/funktionen/daten.mjs")).default;
  const B = await import("../server/lib/bestand.mjs");
  const G = await import("../server/lib/gestalt.mjs");
  const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
  const Z = await import("../server/lib/zeiterfassung.mjs");
  const BM = await import("../server/lib/branchenmodule.mjs");
  return { laden, daten, B, G, sitzungAnlegen, Z, BM };
}

let S;
let raumNr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.77.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await S.daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
async function raum(k, aendern) {
  const name = `wp19b1-${++raumNr}`;
  const b = bestand();
  if (aendern) aendern(b.mandanten[0]);
  await S.B.bestandSchreiben(S.laden(), name, S.G.personenAngleichen(b), { durch: "Pruefung" });
  const r = ROLLEN[k];
  const token = (await S.sitzungAnlegen({ bestand: name, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
    mandantId: "m1", einheit: r.einheit || null, ...(r.demo ? { demo: true } : {}) }, 2 * 3600 * 1000)).token;
  return { name, token };
}
const gespeichertM = async (name) => (await S.B.bestandLesenStreng(S.laden(), name)).bestand.mandanten[0];

/** Ein Schreibversuch: Rolle k, Modul, Weg „voll“ (PUT) oder „teil“ (POST /api/bestand/teile). Liefert Antwort, vorher, nachher. */
async function versuch(k, modul, weg) {
  const { name, token } = await raum(k);
  const vorher = await gespeichertM(name);
  const g = await anfrage("/api/bestand", { token });
  let r;
  if (weg === "voll") {
    const b = kopie(g.bestand || { mandanten: [{ id: "m1" }] });
    const m = b.mandanten.find((x) => x && x.id === "m1") || b.mandanten[0];
    for (const [feld, fn] of Object.entries(AENDERUNG[modul])) m[feld] = fn(kopie(m[feld]));
    r = await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
  } else {
    const m = g.bestand && g.bestand.mandanten ? g.bestand.mandanten.find((x) => x && x.id === "m1") : null;
    const versionen = (g.teile && g.teile.versionen) || {};
    const kern = Object.fromEntries(Object.entries(AENDERUNG[modul]).map(([feld, fn]) =>
      [feld, { basis: versionen[`kern:${feld}`] ?? null, wert: fn(kopie(m ? m[feld] : undefined)) }]));
    r = await anfrage("/api/bestand/teile", { methode: "POST", token, rumpf: { format: 1, epoche: g.teile ? g.teile.epoche : "x", durch: "Pruefung", kern } });
  }
  return { r, vorher, nachher: await gespeichertM(name), g };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp19-b1-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  S = await server(null);
  const heute = S.Z.heuteBerlin();
  tag = (n) => S.Z.tagePlus(heute, n);
}, 120000);
afterAll(async () => {
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  vi.doUnmock("../server/lib/branchenmodule.mjs");
  vi.resetModules();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

const B1_TEXT = /Branchenmodul (posten|bereichsplan|geteilterdienst|anlagen|maschinenqual) wirkt in diesem Betrieb nicht/;

/* ======================================================================== */
describe("A — Registry echt („geplant“): nichts gespeichert, für jede Rolle, beide Wege", { timeout: 300000 }, () => {
  it("die Registry steht für alle fünf Module auf „geplant“ (dieses Paket ändert keinen Status)", () => {
    for (const id of MODULE) expect(BRANCHENMODULE.find((x) => x.id === id).status, id).toBe("geplant");
  });
  for (const weg of ["voll", "teil"]) {
    it(`${weg === "voll" ? "PUT /api/bestand" : "POST /api/bestand/teile"}: alle Rollen × fünf Module — Moduldaten unverändert, Leitung & Co. 403 wie die neueren Module`, async () => {
      for (const modul of MODULE) for (const k of ALLE) {
        const { r, vorher, nachher } = await versuch(k, modul, weg);
        const wo = `${weg} ${modul} ${k} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 120)}`;
        expect(GESPEICHERT[modul](nachher), wo).toBe(false);
        expect(modulteile(nachher), wo).toEqual(modulteile(vorher));
        /* Beschäftigte, Betriebsrat, Betreiber: abgewiesen oder wirkungslos (200 ohne Wirkung, wie bisher). Wer den Modulweg erreicht, bekommt die Antwort der Registerwache (dieselbe wie Wachbuch & Co.). */
        if (SCHREIBT(k, modul)) { expect(r.status, wo).toBe(403); expect(String(r.text), wo).toMatch(B1_TEXT); }
      }
    });
  }
  it("Altbestand bleibt lesbar und unverändert; Kernänderungen neben den Altdaten gehen weiter (200), Leeres schickt nichts", async () => {
    for (const weg of ["voll", "teil"]) for (const k of ["LT", "PL", "KD", "DL", "DP"]) {
      const { name, token } = await raum(k);
      const vorher = await gespeichertM(name);
      const g = await anfrage("/api/bestand", { token });
      const m = g.bestand.mandanten[0];
      /* Lesen: die Altdaten der fünf Module stehen in der Sicht. */
      expect(m.objekte[0].name, k).toBe("Objekt Alt");
      expect(m.postenPlan[`a1|${tag(2)}`], k).toBe("po1");
      expect(m.bereichsPlan[`a1|${tag(2)}`], k).toBe("b1");
      expect(m.einheiten[0].bereiche.map((x) => x.id), k).toEqual(["b1", "b2"]);
      expect(m.dienstarten.find((d) => d.id === "GA").zweiterAbschnitt, k).toEqual({ start: "15:00", ende: "19:00" });
      expect(m.betriebsmittel.find((x) => x.id === "bm1").name, k).toBe("Presse Alt");
      expect(m.kompetenzen.find((x) => x.id === "k-alt"), k).toBeTruthy();
      /* Kern: eine Einteilung und eine neue Dienstart ohne zweiten Abschnitt (null). */
      let r;
      if (weg === "voll") {
        const b = kopie(g.bestand);
        b.mandanten[0].abweichungen = { ...(b.mandanten[0].abweichungen || {}), [`a1|${tag(6)}`]: "F" };
        b.mandanten[0].dienstarten = [...b.mandanten[0].dienstarten, { id: "S", name: "Spät", start: "14:00", ende: "22:00", zweiterAbschnitt: null, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }];
        r = await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
      } else {
        r = await anfrage("/api/bestand/teile", { methode: "POST", token, rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung",
          zellen: [{ feld: "abweichungen", k: `a1|${tag(6)}`, alt: null, neu: "F" }],
          kern: { dienstarten: { basis: g.teile.versionen["kern:dienstarten"], wert: [...m.dienstarten, { id: "S", name: "Spät", start: "14:00", ende: "22:00", zweiterAbschnitt: null, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }] } } } });
      }
      expect(r.status, `${weg} ${k} ${JSON.stringify(r).slice(0, 200)}`).toBe(200);
      const nachher = await gespeichertM(name);
      expect(nachher.abweichungen[`a1|${tag(6)}`], `${weg} ${k}`).toBe("F");
      expect(nachher.dienstarten.some((d) => d.id === "S"), `${weg} ${k}`).toBe(true);
      expect(modulteile(nachher), `${weg} ${k}: Altdaten unberührt`).toEqual({ ...modulteile(vorher), zweiter: [...modulteile(vorher).zweiter, ["S", null]] });
    }
  });
  it("auch Entfernen und Ändern von Altdaten ist geschlossen (Leitung, voller PUT): nichts gelöscht, nichts umgestellt", async () => {
    const faelle = {
      "Postenplan leeren": (m) => { m.postenPlan = {}; },
      "Objekt umbenennen": (m) => { m.objekte[0].name = "X"; },
      "Bereich an der Einheit entfernen": (m) => { m.einheiten[0].bereiche = [m.einheiten[0].bereiche[0]]; },
      "zweiten Abschnitt entfernen": (m) => { m.dienstarten = m.dienstarten.map((d) => (d.id === "GA" ? { ...d, zweiterAbschnitt: null } : d)); },
      "Anlage zum Schlüssel machen": (m) => { m.betriebsmittel = m.betriebsmittel.map((x) => (x.id === "bm1" ? { ...x, art: "schluessel" } : x)); },
      "Maschinenkompetenz löschen": (m) => { m.kompetenzen = m.kompetenzen.filter((x) => x.id !== "k-alt"); },
    };
    for (const [was, fn] of Object.entries(faelle)) {
      const { name, token } = await raum("LT");
      const vorher = await gespeichertM(name);
      const g = await anfrage("/api/bestand", { token });
      const b = kopie(g.bestand); fn(b.mandanten[0]);
      const r = await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
      expect(r.status, was).toBe(403);
      expect(String(r.text), was).toMatch(B1_TEXT);
      expect(modulteile(await gespeichertM(name)), was).toEqual(modulteile(vorher));
    }
  });
});

/* ======================================================================== */
describe("Nachreview F1/F2 — doppelte Kennungen und Ausnahmeweg mit Zusatzinhalt", { timeout: 300000 }, () => {
  const KX = { id: "kx", name: "Befähigt Presse Alt", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 12, befaehigtePerson: true,
    stufe: "", freigabeStelle: "", grundlage: "", pflichtFuer: [], zugedacht: [] };
  const KX_PLAIN = { id: "kx", name: "Tor", art: "geraet", betriebsmittelId: "bm2", wiederholungMonate: null, stufe: "", freigabeStelle: "", grundlage: "",
    pflichtFuer: [], zugedacht: [] };
  it("F1: Maschinenkompetenz hinter einer doppelten Kennung (Probe des Reviews) — jede Rolle, voller PUT und Teilweg: nichts gespeichert", async () => {
    for (const weg of ["voll", "teil"]) for (const k of ALLE) {
      const { name, token } = await raum(k);
      const g = await anfrage("/api/bestand", { token });
      const m = g.bestand && g.bestand.mandanten ? g.bestand.mandanten[0] : null;
      const wert = [...((m && m.kompetenzen) || []), KX, KX_PLAIN];
      const r = weg === "voll"
        ? await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: { ...kopie(g.bestand || { mandanten: [{ id: "m1" }] }),
          mandanten: [{ ...kopie(m || { id: "m1" }), kompetenzen: wert }] }, etag: g.etag, durch: "Pruefung" } })
        : await anfrage("/api/bestand/teile", { methode: "POST", token, rumpf: { format: 1, epoche: g.teile ? g.teile.epoche : "x", durch: "Pruefung",
          kern: { kompetenzen: { basis: ((g.teile && g.teile.versionen) || {})["kern:kompetenzen"] ?? null, wert } } } });
      const nachher = await gespeichertM(name);
      const wo = `${weg} ${k} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 120)}`;
      expect((nachher.kompetenzen || []).some((x) => x.id === "kx"), wo).toBe(false);
      if (["LT", "PL", "KD", "DL", "DP"].includes(k)) { expect(r.status, wo).toBe(403); expect(String(r.text), wo).toMatch(B1_TEXT); }
    }
  });
  it("F1: neu doppelte Kennungen in jeder Liste der fünf Module sind bei „geplant“ geschlossen (Leitung, voller PUT)", async () => {
    const faelle = {
      dienstarten: (m) => { m.dienstarten = [...m.dienstarten, { ...m.dienstarten[0], name: "Kopie" }]; },
      betriebsmittel: (m) => { m.betriebsmittel = [...m.betriebsmittel, { ...m.betriebsmittel[0], art: "schluessel" }]; },
      kompetenzen: (m) => { const { befaehigtePerson: _b, ...k } = m.kompetenzen[0]; void _b; m.kompetenzen = [...m.kompetenzen, { ...k, betriebsmittelId: "bm2" }]; },
      einheiten: (m) => { m.einheiten = [...m.einheiten, { ...m.einheiten[0] }]; },
      objekte: (m) => { m.objekte = [...m.objekte, { ...m.objekte[0], name: "Zweitobjekt" }]; },
    };
    for (const [was, fn] of Object.entries(faelle)) {
      const { name, token } = await raum("LT");
      const vorher = await gespeichertM(name);
      const g = await anfrage("/api/bestand", { token });
      const b = kopie(g.bestand); fn(b.mandanten[0]);
      const r = await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
      expect(r.status, `${was} ${String(r.text).slice(0, 120)}`).toBe(403);
      expect(modulteile(await gespeichertM(name)), was).toEqual(modulteile(vorher));
    }
  });
  /* Modul war an und ist jetzt aus (nur lesbar, G3) — der Ausnahmeweg ist offen. */
  const aus = (...ids) => (m) => { for (const id of ids) m.einstellungen.branchenmodule[id] = { an: false, eingeschaltetAm: "2026-10-01T08:00:00.000Z" }; };
  const loeschAntrag = (modul, feld, schl) => ({ modul, art: "loeschung", grund: "art17", eintraege: { [feld]: [schl] } });
  it("F2: Art.-17-Löschung allein geht (200); mit Zusatzinhalt außerhalb der Datenfelder wird der ganze Antrag abgewiesen (403), nichts gespeichert", async () => {
    const T = `a1|${tag(2)}`;
    const faelle = [
      ["bereichsplan allein", "bereichsplan", "bereichsPlan", (m) => { delete m.bereichsPlan[T]; }, true],
      ["bereichsplan + neuer Bereich an Einheit e2 (Probe)", "bereichsplan", "bereichsPlan",
        (m) => { delete m.bereichsPlan[T]; m.einheiten[1] = { ...m.einheiten[1], bereiche: [{ id: "b9", name: "Neu" }] }; }, false],
      ["bereichsplan + Bereich an e1 dazu", "bereichsplan", "bereichsPlan",
        (m) => { delete m.bereichsPlan[T]; m.einheiten[0] = { ...m.einheiten[0], bereiche: [...m.einheiten[0].bereiche, { id: "b9", name: "Neu" }] }; }, false],
      ["posten allein", "posten", "postenPlan", (m) => { delete m.postenPlan[T]; }, true],
      ["posten + neue Anlage", "posten", "postenPlan", (m) => { delete m.postenPlan[T]; m.betriebsmittel = [...m.betriebsmittel, { ...m.betriebsmittel[0], id: "bm9" }]; }, false],
      ["posten + zweiter Abschnitt", "posten", "postenPlan", (m) => { delete m.postenPlan[T];
        m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, zweiterAbschnitt: { start: "15:00", ende: "18:00" } } : d)); }, false],
      ["posten + Maschinenkompetenz", "posten", "postenPlan", (m) => { delete m.postenPlan[T]; m.kompetenzen = [...m.kompetenzen, { ...m.kompetenzen[0], id: "k9" }]; }, false],
      ["posten + neuer Bereich", "posten", "postenPlan", (m) => { delete m.postenPlan[T]; m.einheiten[1] = { ...m.einheiten[1], bereiche: [{ id: "b9", name: "Neu" }] }; }, false],
      ["geteilterdienst (keine Datenfelder) + zweiter Abschnitt", "geteilterdienst", "dienstarten",
        (m) => { m.dienstarten = [...m.dienstarten, { id: "GN", name: "N", start: "07:00", ende: "11:00", zweiterAbschnitt: { start: "16:00", ende: "20:00" } }]; }, false],
      ["anlagen (keine Datenfelder) + Anlage", "anlagen", "betriebsmittel", (m) => { m.betriebsmittel = [...m.betriebsmittel, { ...m.betriebsmittel[0], id: "bm9" }]; }, false],
      ["maschinenqual (keine Datenfelder) + Kompetenz", "maschinenqual", "kompetenzen", (m) => { m.kompetenzen = [...m.kompetenzen, { ...m.kompetenzen[0], id: "k9" }]; }, false],
    ];
    for (const [was, modul, feld, fn, ok] of faelle) {
      const { name, token } = await raum("LT", aus(...MODULE));
      const vorher = await gespeichertM(name);
      const g = await anfrage("/api/bestand", { token });
      const b = kopie(g.bestand); fn(b.mandanten[0]);
      b.mandanten[0].moduldatenAusnahme = loeschAntrag(modul, feld, T);
      const r = await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
      const nachher = await gespeichertM(name);
      const wo = `${was} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 140)}`;
      if (ok) {
        expect(r.status, wo).toBe(200);
        expect(nachher[feld][T], wo).toBeUndefined();
        expect({ ...modulteile(nachher), [feld]: null }, wo).toEqual({ ...modulteile(vorher), [feld]: null });
      } else {
        expect(r.status, wo).toBe(403);
        expect(modulteile(nachher), wo).toEqual(modulteile(vorher));
      }
    }
  });
});

/* ======================================================================== */
describe("Delta-Review — Altbestand mit doppelten Kennungen sperrt den Betrieb nicht", { timeout: 300000 }, () => {
  const ALTFAELLE = {
    "zwei Einheiten e1 mit verschiedenen Bereichen": (m) => { m.einheiten = [m.einheiten[0], { ...m.einheiten[0], bereiche: [{ id: "b5", name: "Andere" }] }, m.einheiten[1]]; },
    "Dienstart GA mit und ohne zweiten Abschnitt": (m) => { m.dienstarten = [...m.dienstarten, { ...m.dienstarten[1], zweiterAbschnitt: null }]; },
  };
  const put = async (token, g, fn) => {
    const b = kopie(g.bestand); if (fn) fn(b.mandanten[0]);
    return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
  };
  it("unveränderter Rundweg: Leitung, Planung, Kundenrolle, Schichtverantwortung, Demo — 200, Moduldaten unverändert", async () => {
    for (const [was, alt] of Object.entries(ALTFAELLE)) for (const k of ["LT", "PL", "KD", "SV", "DL", "DP"]) {
      const { name, token } = await raum(k, alt);
      const vorher = await gespeichertM(name);
      const r = await put(token, await anfrage("/api/bestand", { token }));
      expect(r.status, `${was} ${k} ${String(r.text || "").slice(0, 140)}`).toBe(200);
      expect(modulteile(await gespeichertM(name)), `${was} ${k}`).toEqual(modulteile(vorher));
    }
  });
  it("Kernänderung neben doppeltem Altbestand geht (200); ein neuer Moduleintrag oder eine neu doppelte Kennung nicht (403)", async () => {
    const faelle = [
      ["Einheiten: Einteilung", "zwei Einheiten e1 mit verschiedenen Bereichen", (m) => { m.abweichungen = { ...(m.abweichungen || {}), [`a1|${tag(6)}`]: "F" }; }, 200],
      ["Dienstarten: Name der Dienstart GA (beide)", "Dienstart GA mit und ohne zweiten Abschnitt",
        (m) => { m.dienstarten = m.dienstarten.map((d) => (d.id === "GA" ? { ...d, name: "Umbenannt" } : d)); }, 200],
      ["Einheiten: neuer Bereich an der ersten e1", "zwei Einheiten e1 mit verschiedenen Bereichen",
        (m) => { m.einheiten[0] = { ...m.einheiten[0], bereiche: [...m.einheiten[0].bereiche, { id: "b9", name: "Neu" }] }; }, 403],
      ["Dienstarten: zweiter Abschnitt geändert", "Dienstart GA mit und ohne zweiten Abschnitt",
        (m) => { m.dienstarten = m.dienstarten.map((d) => (d.id === "GA" && d.zweiterAbschnitt ? { ...d, zweiterAbschnitt: { start: "16:00", ende: "19:00" } } : d)); }, 403],
      ["Dienstarten: dritte Kopie GA (neu doppelt)", "Dienstart GA mit und ohne zweiten Abschnitt",
        (m) => { m.dienstarten = [...m.dienstarten, m.dienstarten.find((d) => d.id === "GA")]; }, 403],
      ["Einheiten: dritte Kopie e1 (neu doppelt)", "zwei Einheiten e1 mit verschiedenen Bereichen", (m) => { const { bereiche: _b, ...ohne } = m.einheiten[0]; void _b; m.einheiten = [...m.einheiten, ohne]; }, 403],
    ];
    for (const [was, alt, fn, soll] of faelle) for (const k of ["LT", "PL"]) {
      const { name, token } = await raum(k, ALTFAELLE[alt]);
      const vorher = await gespeichertM(name);
      const r = await put(token, await anfrage("/api/bestand", { token }), fn);
      expect(r.status, `${was} ${k} ${String(r.text || "").slice(0, 140)}`).toBe(soll);
      if (soll === 403) {
        expect(String(r.text), `${was} ${k}`).toMatch(B1_TEXT);
        expect(modulteile(await gespeichertM(name)), `${was} ${k}`).toEqual(modulteile(vorher));
      }
    }
  });
});

/* ======================================================================== */
describe("B — Prüfmodus „vorlaeufig“ (Registry-Kopie nur im Test): Schreiben wie dokumentiert je Rolle", { timeout: 300000 }, () => {
  beforeAll(async () => { S = await server(() => "vorlaeufig"); }, 120000);
  afterAll(async () => { S = await server(null); }, 120000);
  it("die frisch geladene Registry-Kopie steht auf „vorlaeufig“, die Datei bleibt „geplant“", () => {
    for (const id of MODULE) expect(S.BM.BRANCHENMODULE.find((x) => x.id === id).status, id).toBe("vorlaeufig");
    for (const id of MODULE) expect(BRANCHENMODULE.find((x) => x.id === id).status, id).toBe("geplant");
  });
  for (const weg of ["voll", "teil"]) {
    it(`${weg === "voll" ? "PUT /api/bestand" : "POST /api/bestand/teile"}: Planung, Leitung, Kundenrolle, Demo speichern; SV nur Bereichsplan; Beschäftigte, Betriebsrat, Betreiber nie`, async () => {
      for (const modul of MODULE) for (const k of ALLE) {
        const { r, vorher, nachher } = await versuch(k, modul, weg);
        const wo = `${weg} ${modul} ${k} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 160)}`;
        if (SCHREIBT(k, modul)) {
          expect(r.status, wo).toBe(200);
          expect(GESPEICHERT[modul](nachher), wo).toBe(true);
        } else {
          expect(GESPEICHERT[modul](nachher), wo).toBe(false);
          expect(modulteile(nachher), wo).toEqual(modulteile(vorher));
        }
        expect(String(r.text || ""), wo).not.toMatch(B1_TEXT);
      }
    });
  }
});

/* ======================================================================== */
describe("C — Status unbekannt, fehlend oder unsinnig: geschlossen (fail-closed)", { timeout: 300000 }, () => {
  const KAPUTT = { posten: "unbekannt", bereichsplan: "FEHLT", geteilterdienst: null, anlagen: "VORLAEUFIG", maschinenqual: 42 };
  beforeAll(async () => { S = await server((id) => KAPUTT[id]); }, 120000);
  afterAll(async () => { S = await server(null); }, 120000);
  it("voller PUT und Teilweg: Leitung und Planung speichern nichts, 403 mit dem Text der Registerwache", async () => {
    for (const weg of ["voll", "teil"]) for (const modul of MODULE) for (const k of ["LT", "PL"]) {
      const { r, vorher, nachher } = await versuch(k, modul, weg);
      const wo = `${weg} ${modul} ${k} (Status ${String(KAPUTT[modul])}) → ${r.status}`;
      expect(r.status, wo).toBe(403);
      expect(String(r.text), wo).toMatch(B1_TEXT);
      expect(modulteile(nachher), wo).toEqual(modulteile(vorher));
    }
  });
});

/* ======================================================================== */
describe("Wache und Neuanlage direkt (rein)", () => {
  const m = () => ({ ...bestand().mandanten[0] });
  it("Modul fehlt in der Registry → geschlossen; leer (fehlend, null, [], {}) ist keine Änderung", () => {
    const alt = m();
    const ohneFuenf = BRANCHENMODULE.filter((x) => !MODULE.includes(x.id));
    expect(altmodulWache(alt, { ...alt, postenPlan: { ...alt.postenPlan, [`a2|${tag(4)}`]: "po2" } }, { liste: ohneFuenf }).grund).toMatch(B1_TEXT);
    const leer = { ...alt, objekte: undefined, postenPlan: undefined, bereichsPlan: undefined };
    expect(altmodulWache(leer, { ...leer, objekte: [], postenPlan: {}, bereichsPlan: null })).toBeNull();
    expect(altmodulWache(alt, kopie(alt))).toBeNull();
  });
  it("ein neu angelegter Betrieb bringt keine Daten der fünf Module mit; Kern bleibt", () => {
    const aus = altmoduldatenVerwerfen(m());
    expect(aus.objekte).toBeUndefined();
    expect(aus.postenPlan).toBeUndefined();
    expect(aus.bereichsPlan).toBeUndefined();
    expect(aus.einheiten.every((e) => !("bereiche" in e))).toBe(true);
    expect(aus.dienstarten.map((d) => [d.id, d.zweiterAbschnitt])).toEqual([["F", null], ["GA", null]]);
    expect(aus.betriebsmittel.map((x) => x.id)).toEqual(["bm2"]);
    expect(aus.kompetenzen).toEqual([]);
    const kern = { id: "m9", dienstarten: [{ id: "F", zweiterAbschnitt: null }], betriebsmittel: [{ id: "x", art: "fahrzeug" }] };
    expect(altmoduldatenVerwerfen(kern)).toBe(kern);
  });
});
