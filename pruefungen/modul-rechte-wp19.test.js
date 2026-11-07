/* ==========================================================================
   WP-19 RECHTE DER SECHS BRANCHENMODULE (Wachbuch, Objektbericht, Bereitschaftsdienst,
   Funktionsdienst, Rotation, Pflegequalifikation)

   Prüft, dass die Schreibwege eingehängt sind (MODUL_SCHREIBWEGE), wer schreiben und lesen
   darf (Rolle für Rolle), dass fremde Betriebe nichts sehen und nichts ändern, dass die
   Auskunft und der Ausnahmeweg die neuen Personenfelder abdecken, und dass die strengen
   Vorgaben gelten, wo die Entscheidungen offen sind (docs/acc45/wp19-offene-fragen-agent.md,
   Abschnitt „Rechte“). Alle Module bleiben „geplant“.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { BRANCHENMODULE, MODULDATEN_AUFBEWAHRUNG, modulVon, pruefeModulStatus } from "../server/lib/branchenmodule.mjs";
import { MODUL_SCHREIBWEGE, pruefeModulSchreibwege, moduldatenZusammen, loeschvermerkHash, modulSchreibwegeAnwenden } from "../server/lib/modulschreibwege.mjs";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { moduleinstellungenVerwerfen } from "../server/lib/branchenmodule.mjs";
import { bestandSichtBetreiber, BETRIEB } from "../server/lib/sicht.mjs";
import { objektberichtCsv } from "../server/lib/modul-objektbericht.mjs";
import { auskunftBauen } from "../server/lib/auskunft.mjs";
import { vorschau, raeumen } from "../server/lib/aufbewahrung.mjs";
import { WACHBUCH_ZUGRIFF } from "../server/lib/modul-wachbuch.mjs";
import { wachbuchZugriffFuer, berichtZugriffFuer, modulKontext } from "../src/module/zugriff.js";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";

const PAKETE = ["sicherheit", "pflege", "klinik"];
const ROLLEN = ["PL", "LT", "KD", "SV", "MA", "BR"];
const GEPRUEFT = (r) => ({ ...r, pruefstatus: "geprueft", geprueftAm: "2026-11-01T00:00:00.000Z", gueltigAb: "2026-01-01" });
const kopie = (x) => JSON.parse(JSON.stringify(x));
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tagPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const TAG = tagPlus(3);

/* ------------------------------------------------------------------------ gültige Beispieldaten je Feld */
const OBJEKTE = [{ id: "o1", name: "Objekt Nord", standortId: null, posten: [{ id: "po1", name: "Pforte", soll: { F: 1 }, qualifikationen: [] }] }];
const STUFEN = [{ id: "B", name: "Stufe B", art: "bereitschaft", faktor: 0.25, quelle: "Tarif X § 12 (Fassung 2026)" }];
const NIVEAUS = [{ id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: ["pfk"] }];
const BEREICHE = [{ id: "op", name: "OP", soll: { F: 1 }, qualifikationen: [] }];
const ROT = { id: "r1", personId: "a1", art: "einsatz", einheitId: "e1", von: TAG, bis: tagPlus(10) };
const FELDER = {
  bereitschaftStufen: STUFEN,
  bereitschaft: { [`a1|${TAG}`]: { stufe: "B", beginn: "16:00", ende: "08:00" } },
  funktionsbereiche: BEREICHE,
  funktionsPlan: { [`a1|${TAG}`]: "op" },
  rotationen: { [`r1|${TAG}`]: ROT },
  pflegeNiveaus: NIVEAUS,
};
/* Wer das Feld schreiben darf: Planung/Leitung (Voll-Schreibweg) oder nur die Organisationsleitung (org.edit). */
const SCHREIBER = {
  bereitschaft: ["PL", "LT", "KD"], funktionsPlan: ["PL", "LT", "KD"],
  bereitschaftStufen: ["LT", "KD"], funktionsbereiche: ["LT", "KD"], rotationen: ["LT", "KD"], pflegeNiveaus: ["LT", "KD"],
};

function grund() {
  const g = branchenbestand({ pakete: PAKETE });
  g.mandanten[0].qualifikationen = [{ id: "pfk", name: "Pflegefachkraft", fachkraft: true }];
  return g;
}
/* Die Bereitschaft verweist auf Stufen des Betriebs: für dieses Feld stehen sie schon gespeichert. */
const vorab = (feld) => { const g = grund(); if (feld === "bereitschaft") g.mandanten[0].bereitschaftStufen = kopie(STUFEN); if (feld === "funktionsPlan") g.mandanten[0].funktionsbereiche = kopie(BEREICHE); return g; };
const wirkt = (res, feld, wert) => !!res && !res.verweigert && gleich(res.mandanten[0][feld], wert);

describe("Einhängung und Status", () => {
  it("fünf Schreibwege eingehängt, Vertrag erfüllt; der Objektbericht hat kein Betriebsfeld", () => {
    expect(MODUL_SCHREIBWEGE.map((w) => w.modul).sort()).toEqual(["bereitschaftsdienst", "funktionsdienst", "pflegequal", "rotation", "wachbuch"]);
    expect(pruefeModulSchreibwege(MODUL_SCHREIBWEGE, BRANCHENMODULE)).toEqual([]);
    expect(modulVon("objektbericht").datenfelder).toEqual([]);
  });
  it("alle sechs Module bleiben „geplant“, ohne Abnahme", () => {
    for (const id of ["wachbuch", "objektbericht", "bereitschaftsdienst", "funktionsdienst", "rotation", "pflegequal"]) {
      expect(modulVon(id).status, id).toBe("geplant");
      expect(modulVon(id).abnahme, id).toBeUndefined();
    }
    expect(pruefeModulStatus()).toEqual([]);
  });
});

/* Wirkende Module (Status „vorlaeufig“ nur in diesem Test; in der Registry bleiben alle „geplant“) und der Schreibweg direkt
   (modulSchreibwegeAnwenden) — der echte Schreibweg lässt solange nichts durch, wie die Module „geplant“ sind. */
const LISTE = BRANCHENMODULE.map((x) => (["wachbuch", "bereitschaftsdienst", "funktionsdienst", "rotation", "pflegequal"].includes(x.id)
  ? { ...x, status: "vorlaeufig", mitbestimmung: false } : x));
const KTX = {
  PL: { sitzung: { person: "p1" }, rolle: "planer", umfang: "voll", darfOrgEdit: false },
  LT: { sitzung: { person: "l1" }, rolle: "leitung", umfang: "voll", darfOrgEdit: true },
  KD: { sitzung: { person: "k1" }, rolle: "kunde", umfang: "voll", darfOrgEdit: true },
  SV: { sitzung: { person: "s1" }, rolle: "subplaner", umfang: "einheit", darfOrgEdit: false },
};
function wirkend(g = grund()) {
  const m = g.mandanten[0];
  m.einstellungen = { ...m.einstellungen, branchenmodule: Object.fromEntries(["wachbuch", "bereitschaftsdienst", "funktionsdienst", "rotation", "pflegequal"].map((id) => [id, { an: true }])) };
  return g;
}
function direkt(g, r, aendern, extra = {}) {
  const alt = g.mandanten[0];
  const neu = kopie(alt);
  aendern(neu);
  return modulSchreibwegeAnwenden(alt, neu, { ...KTX[r], liste: LISTE, ...extra });
}
const geht = (res, feld, wert) => !!res && !res.grund && gleich(res.mandant[feld], wert);

describe("Schreibmatrix je Rolle (Module wirkend)", () => {
  for (const [feld, wert] of Object.entries(FELDER)) {
    it(`${feld}: schreiben dürfen nur ${SCHREIBER[feld].join(", ")}`, () => {
      for (const r of ["PL", "LT", "KD", "SV"]) {
        const res = direkt(wirkend(vorab(feld)), r, (m) => { m[feld] = kopie(wert); });
        expect(geht(res, feld, wert), `${r} ${feld}`).toBe(SCHREIBER[feld].includes(r));
      }
      for (const r of ["MA", "BR"]) {
        const res = schreibeAls(wirkend(vorab(feld)), r, (m) => { m[feld] = kopie(wert); });
        expect(wirkt(res, feld, wert), `${r} ${feld}`).toBe(false);
      }
    });
    it(`${feld}: ein fehlerhafter Wert wird abgewiesen (auch von der Leitung)`, () => {
      const kaputt = Array.isArray(wert) ? [{ id: "" }] : { "ohne-tag": 1 };
      for (const r of ["LT", "PL"].filter((x) => SCHREIBER[feld].includes(x))) {
        const res = direkt(wirkend(vorab(feld)), r, (m) => { m[feld] = kaputt; });
        expect(!!res.grund, `${r} ${feld}`).toBe(true);
      }
    });
  }
  it("Schichtverantwortung wird abgewiesen, Betriebsrat und Beschäftigte schreiben über den echten Weg nichts", () => {
    for (const feld of Object.keys(FELDER)) {
      expect(direkt(wirkend(vorab(feld)), "SV", (m) => { m[feld] = kopie(FELDER[feld]); }).grund, `SV ${feld}`).toBeTruthy();
      const sv = schreibeAls(wirkend(vorab(feld)), "SV", (m) => { m[feld] = kopie(FELDER[feld]); });
      expect(sv && sv.verweigert, `SV echt ${feld}`).toBeTruthy();
      const br = schreibeAls(wirkend(vorab(feld)), "BR", (m) => { m[feld] = kopie(FELDER[feld]); });
      expect(br === null || !!br.verweigert, `BR ${feld}`).toBe(true);
    }
  });
  it("Beschäftigte: die Änderung bleibt wirkungslos (gespeicherter Stand)", () => {
    const g = wirkend(grund());
    g.mandanten[0].bereitschaft = { [`a1|${tagPlus(4)}`]: { stufe: "B", beginn: "16:00", ende: "08:00" } };
    g.mandanten[0].bereitschaftStufen = STUFEN;
    const vorher = kopie(g.mandanten[0].bereitschaft);
    const res = schreibeAls(g, "MA", (m) => { m.bereitschaft = {}; });
    if (res && !res.verweigert) expect(res.mandanten[0].bereitschaft).toEqual(vorher);
  });
  it("restriktiv: Planung schreibt weder Stufen, Bereiche, Niveaus noch Rotationen (nur org.edit)", () => {
    for (const feld of ["bereitschaftStufen", "funktionsbereiche", "pflegeNiveaus", "rotationen"]) {
      const res = direkt(wirkend(), "PL", (m) => { m[feld] = kopie(FELDER[feld]); });
      expect(res.grund, feld).toMatch(/Organisationsleitung/);
    }
  });
  it("unveränderte Rückübermittlung ist kein Schreiben (auch für Planung bei Leitungsfeldern)", () => {
    const g = wirkend();
    g.mandanten[0].rotationen = kopie(FELDER.rotationen);
    g.mandanten[0].pflegeNiveaus = kopie(FELDER.pflegeNiveaus);
    const res = direkt(g, "PL", () => {});
    expect(res.grund).toBeUndefined();
    expect(res.mandant.rotationen).toEqual(FELDER.rotationen);
  });
});

describe("Aktivität (R-9): ohne wirkendes Modul keine Änderung", () => {
  it("geplante Module (Registry): kein Speichern, auch nicht von der Leitung — über den echten Schreibweg", () => {
    for (const [feld, wert] of Object.entries(FELDER)) {
      const res = schreibeAls(wirkend(vorab(feld)), "LT", (m) => { m[feld] = kopie(wert); });
      expect(res && res.verweigert, feld).toMatch(/wirkt in diesem Betrieb nicht/);
    }
  });
  it("ausgeschaltet, ohne Paket oder ohne Schalter: abgewiesen; wirkend: erlaubt", () => {
    const feld = "pflegeNiveaus";
    expect(direkt(wirkend(), "LT", (m) => { m[feld] = kopie(FELDER[feld]); }).grund).toBeUndefined();
    const aus = wirkend(); aus.mandanten[0].einstellungen.branchenmodule.pflegequal = { an: false, eingeschaltetAm: "2026-01-01T00:00:00.000Z" };
    expect(direkt(aus, "LT", (m) => { m[feld] = kopie(FELDER[feld]); }).grund).toBeTruthy();
    const ohnePaket = wirkend(); ohnePaket.mandanten[0].pakete = ["sicherheit"];
    expect(direkt(ohnePaket, "LT", (m) => { m[feld] = kopie(FELDER[feld]); }).grund).toBeTruthy();
    expect(direkt(grund(), "LT", (m) => { m[feld] = kopie(FELDER[feld]); }).grund).toMatch(/wirkt in diesem Betrieb nicht/);
  });
});

describe("Verweise der Schreibwege", () => {
  it("Bereitschaft: Person muss zum Betrieb gehören, Tag höchstens zwei Jahre entfernt", () => {
    const w = (k) => ({ [k]: { stufe: "B", beginn: "16:00", ende: "08:00" } });
    expect(direkt(wirkend(vorab("bereitschaft")), "LT", (m) => { m.bereitschaft = w(`fremd|${TAG}`); }).grund).toMatch(/Person/);
    expect(direkt(wirkend(vorab("bereitschaft")), "LT", (m) => { m.bereitschaft = w(`a1|${tagPlus(1500)}`); }).grund).toMatch(/zwei Jahre/);
    expect(direkt(wirkend(vorab("bereitschaft")), "LT", (m) => { m.bereitschaft = w(`a1|${TAG}`); }).grund).toBeUndefined();
  });
  it("Funktionsplan: Bereich und Person müssen zum Betrieb gehören", () => {
    const g = () => { const x = wirkend(); x.mandanten[0].funktionsbereiche = kopie(BEREICHE); return x; };
    expect(direkt(g(), "LT", (m) => { m.funktionsPlan = { [`a1|${TAG}`]: "unbekannt" }; }).grund).toMatch(/Bereich/);
    expect(direkt(g(), "LT", (m) => { m.funktionsPlan = { [`fremd|${TAG}`]: "op" }; }).grund).toMatch(/Person/);
    expect(direkt(g(), "LT", (m) => { m.funktionsPlan = { [`a1|${TAG}`]: "op" }; }).grund).toBeUndefined();
  });
  it("Rotation: die Person muss zum Betrieb gehören", () => {
    expect(direkt(wirkend(), "LT", (m) => { m.rotationen = { [`r1|${TAG}`]: { ...ROT, personId: "fremd" } }; }).grund).toMatch(/Person/);
  });
});

describe("Wachbuch: nur anhängen, nur eingeteilt", () => {
  const eintrag = (extra = {}) => ({ id: "w1", datum: TAG, uhrzeit: "08:15", objektId: "o1", art: "vorkommnis", text: "Tor klemmt", einheitId: "e1", ...extra });
  const mitPosten = (g, person) => { g.mandanten[0].objekte = kopie(OBJEKTE); g.mandanten[0].postenPlan = { [`${person}|${TAG}`]: "po1" }; return wirkend(g); };
  it("Planung und Leitung tragen nur ein, wenn sie am Tag auf einem Posten des Objekts stehen; Verfasser und Zeit setzt der Server", () => {
    for (const [r, person] of [["LT", "l1"], ["PL", "p1"]]) {
      const ohne = wirkend(grund()); ohne.mandanten[0].objekte = kopie(OBJEKTE);
      const a = direkt(ohne, r, (m) => { m.wachbuch = { [`w1|${TAG}`]: eintrag({ vonId: "x" }) }; });
      expect(a.grund, `${r} ohne Einteilung`).toMatch(/im Dienst/);
      const b = direkt(mitPosten(grund(), person), r, (m) => { m.wachbuch = { [`w1|${TAG}`]: eintrag({ vonId: "x", erfasst: "1999-01-01T00:00:00.000Z" }) }; });
      expect(b.grund, r).toBeUndefined();
      const e = b.mandant.wachbuch[`w1|${TAG}`];
      expect(e.vonId, "Verfasser vom Server").toBe(person);
      expect(e.erfasst, "Erfassungszeit vom Server").not.toBe("1999-01-01T00:00:00.000Z");
    }
  });
  it("Befund 2: Posten und Eintrag im selben Speichern zählen nicht — maßgeblich ist der gespeicherte Postenplan", () => {
    const g = wirkend(grund()); g.mandanten[0].objekte = kopie(OBJEKTE);
    const res = direkt(g, "LT", (m) => { m.postenPlan = { [`l1|${TAG}`]: "po1" }; m.wachbuch = { [`w1|${TAG}`]: eintrag() }; });
    expect(res.grund).toMatch(/im Dienst/);
  });
  it("Befund 2: die Einheit des Eintrags muss eine Einheit des Betriebs sein", () => {
    const res = direkt(mitPosten(grund(), "l1"), "LT", (m) => { m.wachbuch = { [`w1|${TAG}`]: eintrag({ einheitId: "gibt-es-nicht" }) }; });
    expect(res.grund).toMatch(/Einheit unbekannt/);
  });
  it("ein gespeicherter Eintrag wird nie geändert, ersetzt oder entfernt — auch nicht durch Weglassen des Felds", () => {
    const g = mitPosten(grund(), "l1");
    g.mandanten[0].wachbuch = { [`w1|${TAG}`]: eintrag({ vonId: "l1", erfasst: "2026-11-02T08:20:00.000Z" }) };
    const gespeichert = kopie(g.mandanten[0].wachbuch);
    for (const r of ["LT", "PL", "KD"]) {
      expect(direkt(g, r, (m) => { m.wachbuch[`w1|${TAG}`].text = "anders"; }).grund, `${r} ändern`).toBeTruthy();
      expect(direkt(g, r, (m) => { delete m.wachbuch[`w1|${TAG}`]; }).grund, `${r} entfernen`).toBeTruthy();
      expect(direkt(g, r, (m) => { delete m.wachbuch; }).grund, `${r} Feld weglassen`).toBeTruthy();
      expect(direkt(g, r, (m) => { m.wachbuch = {}; }).grund, `${r} leeren`).toBeTruthy();
    }
    const gleichgeblieben = direkt(g, "LT", () => {});
    expect(gleichgeblieben.grund).toBeUndefined();
    expect(gleichgeblieben.mandant.wachbuch).toEqual(gespeichert);
  });
  it("Nachtrag statt Änderung: ein Nachtrag zu einem vorhandenen Eintrag wird angenommen, das Original bleibt", () => {
    const g = mitPosten(grund(), "l1");
    g.mandanten[0].wachbuch = { [`w1|${TAG}`]: eintrag({ vonId: "l1", erfasst: "2026-11-02T08:20:00.000Z" }) };
    const res = direkt(g, "LT", (m) => { m.wachbuch[`w2|${TAG}`] = eintrag({ id: "w2", text: "Nachtrag", nachtragZu: "w1" }); });
    expect(res.grund).toBeUndefined();
    expect(res.mandant.wachbuch[`w1|${TAG}`].text).toBe("Tor klemmt");
    expect(res.mandant.wachbuch[`w2|${TAG}`].nachtragZu).toBe("w1");
  });
  it("Schichtverantwortung, Beschäftigte, Betriebsrat tragen nicht ein", () => {
    expect(direkt(mitPosten(grund(), "s1"), "SV", (m) => { m.wachbuch = { [`w1|${TAG}`]: eintrag() }; }).grund).toBeTruthy();
    for (const [r, person] of [["MA", "a1"], ["BR", "b1"]]) {
      const res = schreibeAls(mitPosten(grund(), person), r, (m) => { m.wachbuch = { [`w1|${TAG}`]: eintrag() }; });
      const gespeichert = res && !res.verweigert && res.mandanten[0].wachbuch;
      expect(res === null || !!res.verweigert || !gespeichert || Object.keys(gespeichert).length === 0, r).toBe(true);
    }
  });
  describe("Befund 1: Löschung nach Art. 17 über den Ausnahmeweg, end-to-end durch zusammenfuehren", () => {
    const KEY = `w1|${TAG}`, KEY2 = `w2|${TAG}`;
    const bestehend = (an = true) => {
      const g = grund(); const m = g.mandanten[0];
      m.objekte = kopie(OBJEKTE);
      m.wachbuch = { [KEY]: eintrag({ vonId: "a1", erfasst: "2026-11-02T08:20:00.000Z" }), [KEY2]: eintrag({ id: "w2", vonId: "a1", erfasst: "2026-11-02T09:20:00.000Z" }) };
      m.einstellungen = { ...m.einstellungen, branchenmodule: { wachbuch: an ? { an: true } : { an: false, eingeschaltetAm: "2026-01-01T00:00:00.000Z" } } };
      return g;
    };
    const ausn = (extra = {}) => ({ modul: "wachbuch", art: "loeschung", grund: "art17", eintraege: { wachbuch: [KEY] }, ...extra });
    it("die Leitung löscht genau den benannten Eintrag (Modul eingeschaltet wie ausgeschaltet), Löschvermerk steht", () => {
      for (const an of [true, false]) {
        const res = schreibeAls(bestehend(an), "LT", (m) => { delete m.wachbuch[KEY]; m.moduldatenAusnahme = ausn(); });
        expect(res && res.verweigert, `an=${an}`).toBeFalsy();
        const m = res.mandanten[0];
        expect(Object.keys(m.wachbuch), `an=${an}`).toEqual([KEY2]);
        expect(m.einstellungen.moduldatenLoeschvermerke.map((v) => v.h)).toContain(loeschvermerkHash("m1", "wachbuch", KEY));
        expect(m.moduldatenAusnahme).toBeUndefined();
      }
    });
    it("nur Löschung und nur das Benannte: Änderung, weiteres Entfernen, Berichtigung, Neues, Planung ohne org.edit werden abgewiesen", () => {
      const faelle = {
        "Änderung statt Löschung": (m) => { m.wachbuch[KEY].text = "anders"; m.moduldatenAusnahme = ausn(); },
        "zusätzlich ein unbenannter Eintrag entfernt": (m) => { delete m.wachbuch[KEY]; delete m.wachbuch[KEY2]; m.moduldatenAusnahme = ausn(); },
        "Berichtigung": (m) => { delete m.wachbuch[KEY]; m.moduldatenAusnahme = ausn({ art: "berichtigung", grund: "art16" }); },
        "Neues im selben Speichern": (m) => { delete m.wachbuch[KEY]; m.wachbuch[`w3|${TAG}`] = eintrag({ id: "w3" }); m.moduldatenAusnahme = ausn(); },
        "ohne Ausnahmeangabe": (m) => { delete m.wachbuch[KEY]; },
      };
      for (const [name, f] of Object.entries(faelle)) {
        const res = schreibeAls(bestehend(true), "LT", f);
        expect(res && res.verweigert, name).toBeTruthy();
      }
      const pl = schreibeAls(bestehend(true), "PL", (m) => { delete m.wachbuch[KEY]; m.moduldatenAusnahme = ausn(); });
      expect(pl && pl.verweigert, "Planung").toBeTruthy();
    });
  });
});

/* ------------------------------------------------------------------------ Sicht je Rolle */
function mitDaten() {
  const g = grund();
  const m = g.mandanten[0];
  m.objekte = kopie(OBJEKTE);
  m.wachbuch = {
    [`w-a1|${TAG}`]: { id: "w-a1", vonId: "a1", einheitId: "e1", text: "MA-EIGEN" },
    [`w-s1|${TAG}`]: { id: "w-s1", vonId: "s1", einheitId: "e1", text: "SV-EIGEN" },
    [`w-fremd|${TAG}`]: { id: "w-fremd", vonId: "l1", einheitId: "e2", text: "FREMDE-EINHEIT" },
    [`w-ohne|${TAG}`]: { id: "w-ohne", vonId: "l1", text: "OHNE-EINHEIT" },
  };
  m.bereitschaftStufen = kopie(STUFEN);
  m.bereitschaft = { [`a1|${TAG}`]: { stufe: "B", beginn: "16:00", ende: "08:00", art: "MA-B" }, [`p1|${TAG}`]: { stufe: "B", art: "PL-B" } };
  m.funktionsbereiche = kopie(BEREICHE);
  m.funktionsPlan = { [`a1|${TAG}`]: "op", [`x9|${TAG}`]: "op" };              // x9: keine Person des Betriebs
  m.rotationen = { [`r1|${TAG}`]: { ...ROT, id: "r1" }, [`r2|${TAG}`]: { ...ROT, id: "r2", personId: "p1" } };
  m.pflegeNiveaus = kopie(NIVEAUS);
  return g;
}
const sicht = (g, r) => bestandFuerRolle(g, SITZUNGEN[r]).mandanten[0];

describe("Sicht je Rolle (Positivkatalog)", () => {
  it("Planung, Leitung und Kundenrolle sehen alles (Kundenrolle = Datenraum mit Leitungsrechten, vorläufig)", () => {
    const g = mitDaten();
    for (const r of ["PL", "LT", "KD"]) {
      const m = sicht(g, r);
      expect(Object.keys(m.wachbuch), r).toHaveLength(4);
      for (const f of ["bereitschaftStufen", "bereitschaft", "funktionsbereiche", "funktionsPlan", "rotationen", "pflegeNiveaus"])
        expect(gleich(m[f], g.mandanten[0][f]), `${r} ${f}`).toBe(true);
    }
  });
  it("Betriebsrat sieht in keinem der Felder etwas", () => {
    const m = sicht(mitDaten(), "BR");
    for (const f of ["wachbuch", "bereitschaft", "funktionsPlan", "rotationen"]) expect(Object.keys(m[f] || {}), f).toEqual([]);
    for (const f of ["bereitschaftStufen", "funktionsbereiche", "pflegeNiveaus"]) expect(m[f] || [], f).toEqual([]);
  });
  it("Beschäftigte: Wachbuch nur selbst Verfasstes, Plan- und Rotationsdaten nur eigene, Sachfelder nichts", () => {
    const m = sicht(mitDaten(), "MA");                    // a1
    expect(Object.keys(m.wachbuch)).toEqual([`w-a1|${TAG}`]);
    expect(Object.keys(m.bereitschaft)).toEqual([`a1|${TAG}`]);
    expect(Object.keys(m.funktionsPlan)).toEqual([`a1|${TAG}`]);
    expect(Object.keys(m.rotationen)).toEqual([`r1|${TAG}`]);
    for (const f of ["bereitschaftStufen", "funktionsbereiche", "pflegeNiveaus"]) expect(m[f] || [], f).toEqual([]);
    expect(JSON.stringify(m)).not.toMatch(/SV-EIGEN|FREMDE-EINHEIT|OHNE-EINHEIT|PL-B/);
  });
  it("Schichtverantwortung: Wachbuch nur der eigenen Einheit (nie fremd, nie ohne Einheit), Plan im Bereich, Bereitschaft und Rotation nur die eigene Person", () => {
    const m = sicht(mitDaten(), "SV");                    // s1, Einheit e1
    expect(Object.keys(m.wachbuch).sort()).toEqual([`w-a1|${TAG}`, `w-s1|${TAG}`].sort());
    expect(Object.keys(m.funktionsPlan)).toEqual([`a1|${TAG}`]);
    expect(Object.keys(m.bereitschaft || {})).toEqual([]);
    expect(Object.keys(m.rotationen || {})).toEqual([]);
    for (const f of ["bereitschaftStufen", "funktionsbereiche", "pflegeNiveaus"]) expect(m[f] || [], f).toEqual([]);
  });
  it("Betreiber: keines der Felder geht an die Betreiberkonsole", () => {
    const g = mitDaten();
    const aus = JSON.stringify(bestandSichtBetreiber(g));
    expect(aus).not.toMatch(/MA-EIGEN|SV-EIGEN|FREMDE-EINHEIT|Stufe B|Fachkraft"|"OP"|PL-B/);
  });
  it("jedes Feld steht im Positivkatalog (kein Feld fällt auf den Standard)", () => {
    for (const f of ["wachbuch", "bereitschaft", "bereitschaftStufen", "funktionsPlan", "funktionsbereiche", "rotationen", "pflegeNiveaus"])
      expect(Array.isArray(BETRIEB[f]) && BETRIEB[f].length === 2, f).toBe(true);
    for (const f of ["bereitschaftStufen", "funktionsbereiche", "pflegeNiveaus"]) expect(BETRIEB[f], f).toEqual(["weg", "weg"]);
    for (const f of ["wachbuch", "bereitschaft", "funktionsPlan", "rotationen"]) expect(BETRIEB[f][1], f).toBe("weg");
  });
});

describe("Mandantentrennung", () => {
  function zweiBetriebe() {
    const g = mitDaten();
    const zweiter = kopie(branchenbestand({ pakete: PAKETE }).mandanten[0]);
    zweiter.id = "m2"; zweiter.name = "Fremder Betrieb";
    zweiter.wachbuch = { [`w9|${TAG}`]: { id: "w9", vonId: "l1", einheitId: "e1", text: "GEHEIM-M2" } };
    zweiter.rotationen = { [`r9|${TAG}`]: { ...ROT, id: "r9", einheitId: "GEHEIM-M2-EINHEIT" } };
    zweiter.bereitschaft = { [`a1|${TAG}`]: { stufe: "GEHEIM-M2-STUFE" } };
    zweiter.funktionsPlan = { [`a1|${TAG}`]: "GEHEIM-M2-BEREICH" };
    zweiter.pflegeNiveaus = [{ id: "g", name: "GEHEIM-M2-NIVEAU", gruppe: "fachkraft", qualifikationen: [] }];
    zweiter.bereitschaftStufen = [{ id: "g", name: "GEHEIM-M2-STUFENNAME" }];
    zweiter.funktionsbereiche = [{ id: "g", name: "GEHEIM-M2-FB" }];
    g.mandanten.push(zweiter);
    return g;
  }
  it("keine Rolle des ersten Betriebs sieht Daten des zweiten", () => {
    const g = zweiBetriebe();
    for (const r of ROLLEN) expect(JSON.stringify(bestandFuerRolle(g, SITZUNGEN[r])), r).not.toMatch(/GEHEIM-M2/);
    expect(JSON.stringify(bestandSichtBetreiber({ ...g, mandanten: [g.mandanten[0]] }))).not.toMatch(/GEHEIM-M2/);
  });
  it("Schreiben im ersten Betrieb lässt den zweiten unberührt; ein mitgeschickter zweiter Betrieb wird abgewiesen", () => {
    const g = zweiBetriebe();
    const vorher = kopie(g.mandanten[1]);
    const s = kopie(bestandFuerRolle(g, SITZUNGEN.LT));
    s.mandanten[0].name = "Umbenannter Betrieb";
    const ok = zusammenfuehren(g, s, SITZUNGEN.LT);
    expect(ok && !ok.verweigert).toBe(true);
    expect(ok.mandanten[1]).toEqual(vorher);
    const zwei = kopie(bestandFuerRolle(g, SITZUNGEN.LT));
    zwei.mandanten.push({ ...vorher, wachbuch: {} });
    const nein = zusammenfuehren(g, zwei, SITZUNGEN.LT);
    expect(nein === null || !!nein.verweigert).toBe(true);
  });
  it("die Sitzung des zweiten Betriebs schreibt nie in den ersten", () => {
    const g = zweiBetriebe();
    const fremd = { rolle: "leitung", person: "l1", betrieb: 1 };
    const s = kopie(bestandFuerRolle(g, fremd));
    expect(s.mandanten[0].id).toBe("m2");
    s.mandanten[0].rotationen = { [`rx|${TAG}`]: { ...ROT, id: "rx" } };
    const res = zusammenfuehren(g, s, fremd);
    if (res && !res.verweigert) expect(res.mandanten[0]).toEqual(g.mandanten[0]);
  });
});

describe("Zugriff der Oberflächen (kern.jsx-Kontext)", () => {
  const sitz = (rolle, extra = {}) => ({ rolle, mandant: { personen: [{ id: "p1", vorname: "A", nachname: "B" }] },
    person: { id: "p1", rolle: "mitarbeiter", bereich: "e1", ...extra } });
  it("Wachbuch-Stufe nach Rolle (W4); unbekannte und fehlende Rollen: keiner", () => {
    const erwartet = { leitung: "voll", planer: "voll", subplaner: "einheit", mitarbeiter: "eigene", betriebsrat: "keiner", kunde: "keiner" };
    for (const [r, st] of Object.entries(erwartet)) expect(wachbuchZugriffFuer(r), r).toBe(st);
    for (const r of [undefined, null, "", "betreiber", "admin", "__proto__", "constructor", 7]) expect(wachbuchZugriffFuer(r), String(r)).toBe("keiner");
    expect(Object.keys(WACHBUCH_ZUGRIFF).sort()).toEqual(["Auftraggeber", "BR", "LT", "MA", "PL", "SV"]);
  });
  it("Objektbericht: voll nur für Planung und Leitung", () => {
    for (const r of ["leitung", "planer"]) expect(berichtZugriffFuer(r), r).toBe("voll");
    for (const r of ["subplaner", "mitarbeiter", "betriebsrat", "kunde", undefined, "betreiber"]) expect(berichtZugriffFuer(r), String(r)).toBe("keiner");
  });
  it("modulKontext: Person, eigene Einheit, Personen, Qualifikationsprüfung; Dienstzeit ohne Quelle ungeklärt (null)", () => {
    const k = modulKontext({ sitz: sitz("subplaner") });
    expect(k).toMatchObject({ wachbuchZugriff: "einheit", berichtZugriff: "keiner", person: "p1", eigeneEinheit: "e1" });
    expect(k.personen).toHaveLength(1);
    expect(typeof k.qualGueltig).toBe("function");
    expect(k.dienstzeit(TAG, "F")).toBeNull();
    const quelle = (d, id) => [d, id];
    expect(modulKontext({ sitz: sitz("leitung"), kontext: { dienstzeit: quelle } }).dienstzeit(TAG, "F")).toEqual([TAG, "F"]);
    expect(modulKontext({ sitz: sitz("leitung"), kontext: { dienstzeit: "kein Aufruf" } }).dienstzeit(TAG, "F")).toBeNull();
  });
  it("modulKontext: ohne Sitzung, Betreiber oder Bereich ALLE nichts Zusätzliches (fail-closed)", () => {
    expect(modulKontext()).toMatchObject({ wachbuchZugriff: "keiner", berichtZugriff: "keiner", person: null, eigeneEinheit: null, personen: [] });
    expect(modulKontext({ sitz: { rolle: "betreiber", person: { id: "x", rolle: "leitung" } } })).toMatchObject({ wachbuchZugriff: "keiner", berichtZugriff: "keiner" });
    expect(modulKontext({ sitz: sitz("leitung", { bereich: "ALLE" }) }).eigeneEinheit).toBeNull();
  });
});

describe("Auskunft (Art. 15) und Ausnahmeweg (Art. 16/17)", () => {
  const person = { id: "a1", vorname: "A", nachname: "Eins" };
  const m = () => {
    const x = kopie(mitDaten().mandanten[0]);
    x.wachbuch[`w-b|${TAG}`] = { id: "w-b", vonId: "b1", einheitId: "e1", text: "DRITTE-PERSON-TEXT" };
    x.rotationen[`r3|${TAG}`] = { ...ROT, id: "r3", personId: "b1", einheitId: "FREMDE-ROTATION" };
    x.bereitschaft[`b1|${TAG}`] = { stufe: "B", art: "FREMDE-BEREITSCHAFT" };
    x.funktionsPlan[`b1|${TAG}`] = "FREMDER-BEREICH";
    return x;
  };
  const auskunft = (umfang) => auskunftBauen(m(), person, { raum: "r", erstellt: `${tagPlus(0)}T10:00:00.000Z`, umfang });
  it("nennt die eigenen Einträge aller vier Personenfelder, nie die anderer", () => {
    for (const u of ["selbst", "leitung"]) {
      const a = auskunft(u);
      expect(a.wachbucheintraege.map((x) => x.id), u).toEqual(["w-a1"]);
      expect(a.bereitschaftsdienste, u).toHaveLength(1);
      expect(a.funktionszuordnungen, u).toEqual([{ datum: TAG, funktion: "op" }]);
      expect(a.rotationen.map((x) => x.id), u).toEqual(["r1"]);
      expect(JSON.stringify(a), u).not.toMatch(/DRITTE-PERSON-TEXT|FREMDE-ROTATION|FREMDE-BEREITSCHAFT|FREMDER-BEREICH|SV-EIGEN/);
    }
  });
  it("restriktiv: der Text der Wachbucheinträge fehlt (Rechte Dritter), mit Hinweis", () => {
    const a = auskunft("selbst");
    expect(JSON.stringify(a.wachbucheintraege)).not.toMatch(/MA-EIGEN|"text"/);
    expect(a.wachbuchHinweis).toMatch(/Art\. 15 Abs\. 4/);
  });
  it("ohne eigene Einträge keine leeren Abschnitte", () => {
    const a = auskunftBauen({ ...m(), wachbuch: {}, bereitschaft: {}, funktionsPlan: {}, rotationen: {} }, person, { raum: "r", erstellt: `${tagPlus(0)}T10:00:00.000Z`, umfang: "selbst" });
    for (const f of ["wachbucheintraege", "wachbuchHinweis", "bereitschaftsdienste", "funktionszuordnungen", "rotationen"]) expect(f in a, f).toBe(false);
  });
  const ausgeschaltet = (feldWerte, modul) => {
    const x = kopie(grund().mandanten[0]);
    Object.assign(x, feldWerte);
    x.einstellungen = { branchenmodule: { [modul]: { an: false, eingeschaltetAm: "2026-01-01T00:00:00.000Z" } } };
    return x;
  };
  it("Löschung nach Art. 17 über den Ausnahmeweg erfasst jedes neue Personenfeld und schreibt einen Löschvermerk", () => {
    const faelle = [
      ["wachbuch", "wachbuch", `w-a1|${TAG}`, mitDaten().mandanten[0].wachbuch],
      ["bereitschaftsdienst", "bereitschaft", `a1|${TAG}`, FELDER.bereitschaft],
      ["funktionsdienst", "funktionsPlan", `a1|${TAG}`, FELDER.funktionsPlan],
      ["rotation", "rotationen", `r1|${TAG}`, FELDER.rotationen],
    ];
    for (const [modul, feld, schluessel, wert] of faelle) {
      const alt = ausgeschaltet({ [feld]: kopie(wert) }, modul);
      const neu = kopie(alt);
      neu[feld] = Object.fromEntries(Object.entries(neu[feld]).filter(([k]) => k !== schluessel));
      const r = moduldatenZusammen(alt, neu, BRANCHENMODULE, { darfOrgEdit: true, sitzung: { person: "l1" },
        ausnahme: { modul, art: "loeschung", grund: "art17", eintraege: { [feld]: [schluessel] } } });
      expect(r.grund, feld).toBeUndefined();
      expect(Object.keys(r.mandant[feld]), feld).not.toContain(schluessel);
      expect(r.mandant.einstellungen.moduldatenLoeschvermerke.map((v) => v.h), feld).toContain(loeschvermerkHash(alt.id, feld, schluessel));
      /* nur die Leitung (org.edit) */
      const planung = moduldatenZusammen(alt, neu, BRANCHENMODULE, { darfOrgEdit: false, sitzung: { person: "p1" },
        ausnahme: { modul, art: "loeschung", grund: "art17", eintraege: { [feld]: [schluessel] } } });
      expect(planung.grund, `${feld} ohne org.edit`).toMatch(/Organisationsleitung/);
      /* ohne Ausnahmeangabe bleibt das Feld nur lesbar */
      expect(moduldatenZusammen(alt, neu, BRANCHENMODULE, { darfOrgEdit: true }).grund, `${feld} ohne Angabe`).toMatch(/nur lesbar/);
    }
  });
  it("restriktiv: eine Berichtigung ist für Wachbuch, Bereitschaft und Rotation nicht möglich (nur Löschung)", () => {
    for (const [modul, feld, schluessel, wert] of [["wachbuch", "wachbuch", `w-a1|${TAG}`, mitDaten().mandanten[0].wachbuch],
      ["bereitschaftsdienst", "bereitschaft", `a1|${TAG}`, FELDER.bereitschaft], ["rotation", "rotationen", `r1|${TAG}`, FELDER.rotationen]]) {
      const alt = ausgeschaltet({ [feld]: kopie(wert) }, modul);
      const neu = kopie(alt);
      neu[feld][schluessel] = { ...neu[feld][schluessel], text: "berichtigt", stufe: "B" };
      const r = moduldatenZusammen(alt, neu, BRANCHENMODULE, { darfOrgEdit: true, sitzung: { person: "l1" },
        ausnahme: { modul, art: "berichtigung", grund: "art16", eintraege: { [feld]: [schluessel] } } });
      expect(r.grund, feld).toBeTruthy();
    }
  });
  it("Löschlauf: ohne geprüfte Aufbewahrungsregel wird aus den neuen Personenfeldern nichts gelöscht (zurückgehalten)", () => {
    const alt = "2019-01-02";
    const x = kopie(grund().mandanten[0]);
    x.wachbuch = { [`w-alt|${alt}`]: { id: "w-alt", vonId: "a1", text: "t" } };
    x.bereitschaft = { [`a1|${alt}`]: { stufe: "B" } };
    x.funktionsPlan = { [`a1|${alt}`]: "op" };
    x.rotationen = { [`r1|${alt}`]: { ...ROT, von: alt, bis: alt }, [`r2|${alt}`]: { ...ROT, id: "r2", art: "zugehoerigkeit", von: alt, bis: null } };
    const v = vorschau(x, tagPlus(0));
    expect(v.moduldaten, "nichts fällig").toBe(0);
    expect(v.moduldatenZurueckgehalten, "zurückgehalten (die offene Zugehörigkeit zählt nie)").toBe(4);
    expect(v.pruefhinweis).toMatch(/Freigabe erforderlich/);
    const r = raeumen(kopie(x), tagPlus(0));
    for (const f of ["wachbuch", "bereitschaft", "funktionsPlan", "rotationen"]) expect(r.mandant[f], f).toEqual(x[f]);
  });
});

describe("Befund 5/7/8/10: Rotationen im Löschlauf, CSV, neue Betriebe, Auskunft = Sicht", () => {
  it("Löschlauf (geprüfte Regel): eine beendete Rotation geht nach ihrem Ende, offene Zugehörigkeit und Ziel nie", () => {
    const alt = "2019-01-02";
    const x = kopie(grund().mandanten[0]);
    x.rotationen = {
      [`beendet|${alt}`]: { id: "beendet", personId: "a1", art: "einsatz", einheitId: "e1", von: alt, bis: "2019-02-01" },
      [`offen|${alt}`]: { id: "offen", personId: "a1", art: "zugehoerigkeit", einheitId: "e1", von: alt, bis: null },
      [`ziel|${alt}`]: { id: "ziel", personId: "a1", art: "ziel", einheitId: "e1", von: alt },
      [`lang|${alt}`]: { id: "lang", personId: "a1", art: "einsatz", einheitId: "e1", von: alt, bis: tagPlus(30) },
    };
    const regeln = { moduldaten: GEPRUEFT(MODULDATEN_AUFBEWAHRUNG) };
    expect(vorschau(x, tagPlus(0), { regeln }).moduldaten).toBe(1);
    const r = raeumen(kopie(x), tagPlus(0), { regeln });
    expect(Object.keys(r.mandant.rotationen).sort()).toEqual([`lang|${alt}`, `offen|${alt}`, `ziel|${alt}`]);
  });
  it("CSV: Formelzeichen nach Leerraum (Tab, Zeilenumbruch, Leerzeichen) werden entschärft", () => {
    const b = { objekt: "o", von: TAG, bis: TAG, tage: [], ereignisse: [{ datum: TAG, uhrzeit: "08:00", art: "\t=1+1", posten: "x" }] };
    const csv = objektberichtCsv(b);
    expect(csv.includes("\t=1+1") && !csv.includes("'\t=1+1")).toBe(false);
    expect(csv).toContain("'\t=1+1");
  });
  it("neu angelegter Betrieb über den Betreiberweg: Moduldaten werden verworfen", () => {
    const neu = { id: "m9", name: "Neu", wachbuch: { x: 1 }, rotationen: { y: 1 }, bereitschaft: { z: 1 }, funktionsPlan: { a: "b" },
      pflegeNiveaus: [{ id: "n" }], objekte: [{ id: "o" }], einstellungen: { ruhezeit: 11 } };
    const aus = moduleinstellungenVerwerfen(neu);
    for (const f of ["wachbuch", "rotationen", "bereitschaft", "funktionsPlan", "pflegeNiveaus", "bereitschaftStufen", "funktionsbereiche", "objekte"]) expect(f in aus, f).toBe(false);
    expect(aus.einstellungen).toEqual({ ruhezeit: 11 });
    expect(moduleinstellungenVerwerfen({ id: "m", name: "x" })).toEqual({ id: "m", name: "x" });
  });
  it("Auskunft nennt genau die Einträge, die die Sicht der Beschäftigten zeigt", () => {
    const g = mitDaten();
    const sichtKeys = Object.values(sicht(g, "MA").wachbuch).map((e) => e.id).sort();
    const a = auskunftBauen(kopie(g.mandanten[0]), { id: "a1" }, { raum: "r", erstellt: `${tagPlus(0)}T10:00:00.000Z`, umfang: "selbst" });
    expect(a.wachbucheintraege.map((e) => e.id).sort()).toEqual(sichtKeys);
  });
});
