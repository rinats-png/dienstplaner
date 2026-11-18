/* ==========================================================================
   WP-48.5 Teil: Konfliktführung je Zelle/Feld — reine Logik (src/app/teilkonflikt.js)

   Betreiberentscheidung 2026-11-18 (Entwurf 6.4, Option A): Ein Konflikt
   des Teilwegs wird je Zelle oder Kernfeld entschieden — „fremdes
   übernehmen" oder „meins setzen". Ein blindes „meinen Stand übernehmen"
   gibt es dort nicht.

   A  Einheit (ohne Server): Start nur mit Fähigkeit `teile` (Schalter aus →
      null → Voll-PUT wie heute), Delta, Antworten, Wahl, Auflösen,
      Idempotenz, Mehrfachkonflikte, unklarer Ausgang (ABA-Schutz),
      Epoche, Grenzen.
   B  Gleichlauf mit dem Server (server/lib/teilweg.mjs): Zellfelder,
      Nur-Server-Felder, stabiles JSON.
   C  Ende zu Ende über den echten Handler (Dateiablage, echte Sitzungen,
      Schalter nur in diesem Prozess): Rollen × Konflikttypen, „fremd" ohne
      Datenverlust, „meins" ohne Rechteausweitung (nur eigene Segmente,
      Server entscheidet wie beim Voll-PUT), Mehrfachkonflikte nacheinander,
      Schalter aus → kein `teile`, Logik bleibt aus.

   Keine Uhr: Die Logik liest keine Zeit; Tagesangaben im Teil C kommen aus
   der Kalenderrechnung des Servers relativ zu heute (wie wp48-teilweg).
   Aufruf: npx vitest run pruefungen/wp48-5-konflikt.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as T from "../src/app/teilkonflikt.js";

const kopie = (x) => JSON.parse(JSON.stringify(x));
const V = (c) => c.repeat(32);
let kennungNr = 0;
const neueKennung = () => `pruef-${String(++kennungNr).padStart(6, "0")}`;

/* -------------------------------------------------------------------------- */
/* A  Einheit                                                                 */

function getAntwort(m, { epoche = "e0e0e0e0", versionen } = {}) {
  return { bestand: { mandanten: [m] }, etag: 7,
    teile: { format: 1, epoche, versionen: versionen || { "kern:dienstarten": V("a"), "kern:personen": V("b"), "kern:wuensche": V("c") } } };
}
const betrieb = () => ({ id: "m1", name: "Haus", stand: 3,
  personen: [{ id: "p1", vorname: "Pia", nachname: "Plan" }, { id: "a1", vorname: "Ana", nachname: "Alt" }],
  dienstarten: [{ id: "F", name: "Früh" }, { id: "N", name: "Nacht" }], wuensche: [],
  abweichungen: { "a1|2026-08-14": "F", "a1|2026-08-15": "N" }, erfassung: {},
  einstempeln: { "a1|2026-08-01": { start: "06:00" } }, monatsabschluss: {}, istEingefroren: {} });

describe("A1 Start: nur mit Fähigkeit teile", () => {
  it("ohne teile (Schalter aus) → null: die Oberfläche bleibt beim Voll-PUT", () => {
    expect(T.teilwegStart({ bestand: { mandanten: [betrieb()] }, etag: 1 }, "m1")).toBeNull();
  });
  it("anderes Format, fehlende Epoche, fremder Betrieb → null", () => {
    const g = getAntwort(betrieb());
    expect(T.teilwegStart({ ...g, teile: { ...g.teile, format: 2 } }, "m1")).toBeNull();
    expect(T.teilwegStart({ ...g, teile: { ...g.teile, epoche: "" } }, "m1")).toBeNull();
    expect(T.teilwegStart({ ...g, teile: { ...g.teile, versionen: null } }, "m1")).toBeNull();
    expect(T.teilwegStart(g, "m9")).toBeNull();
  });
  it("mit teile → Basis = Sicht, Phase bereit", () => {
    const z = T.teilwegStart(getAntwort(betrieb()), "m1");
    expect(z.phase).toBe("bereit");
    expect(z.basis.id).toBe("m1");
    expect(z.konflikte).toEqual([]);
  });
});

describe("A2 Delta", () => {
  const z0 = () => T.teilwegStart(getAntwort(betrieb()), "m1");
  it("unverändert → leer; Spiegel der Serverfelder und session/stand zählen nicht", () => {
    const z = z0();
    expect(T.deltaBilden(z, z.basis)).toEqual({ leer: true });
    const l = { ...z.basis, stand: 99, session: { x: 1 }, einstempeln: { neu: 1 }, monatsabschluss: { "2026-07": {} }, istEingefroren: { a: 1 } };
    expect(T.deltaBilden(z, l)).toEqual({ leer: true });
  });
  it("Zellen: setzen, ändern, löschen mit Erwartungswert", () => {
    const z = z0();
    const l = { ...z.basis, abweichungen: { "a1|2026-08-14": "N", "a1|2026-08-20": "F" }, erfassung: { "p1|2026-08-02": { start: "06:00", ende: "14:00" } } };
    const { delta } = T.deltaBilden(z, l);
    expect(delta.kern).toEqual({});
    expect(delta.zellen).toEqual([
      { feld: "abweichungen", k: "a1|2026-08-14", alt: "F", neu: "N" },
      { feld: "abweichungen", k: "a1|2026-08-15", alt: "N", neu: null },
      { feld: "abweichungen", k: "a1|2026-08-20", alt: null, neu: "F" },
      { feld: "erfassung", k: "p1|2026-08-02", alt: null, neu: { start: "06:00", ende: "14:00" } },
    ]);
  });
  it("Kernfeld mit Basisversion; neu gebaute, aber gleiche Objekte sind keine Änderung", () => {
    const z = z0();
    expect(T.deltaBilden(z, { ...z.basis, dienstarten: kopie(z.basis.dienstarten) })).toEqual({ leer: true });
    const wert = [...z.basis.dienstarten, { id: "S", name: "Spät" }];
    expect(T.deltaBilden(z, { ...z.basis, dienstarten: wert }).delta.kern).toEqual({ dienstarten: { basis: V("a"), wert } });
  });
  it("nicht darstellbar → Rückfall voll: Feld ohne Version, Kernfeld gelöscht, ungültiger Schlüssel, zu groß", () => {
    const z = z0();
    expect(T.deltaBilden(z, { ...z.basis, zyklus: ["F"] })).toEqual({ voll: "feld:zyklus" });
    expect(T.deltaBilden(z, { ...z.basis, dienstarten: undefined })).toEqual({ voll: "loeschen:dienstarten" });
    expect(T.deltaBilden(z, { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-02-30": "F" } })).toEqual({ voll: "schluessel:abweichungen" });
    expect(T.deltaBilden(z, { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|26-02-01": "F" } })).toEqual({ voll: "schluessel:abweichungen" });
    const viele = {};
    for (let i = 0; i <= T.GRENZEN.zellen; i++) viele[`p${i}|2026-08-01`] = "F";
    expect(T.deltaBilden(z, { ...z.basis, abweichungen: { ...z.basis.abweichungen, ...viele } })).toEqual({ voll: "zu-gross" });
  });
  it("Rumpf: Format, Epoche, Kennung; keine Nur-Server-Felder", () => {
    const z = z0();
    const { delta } = T.deltaBilden(z, { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } });
    const { rumpf, zustand } = T.rumpfBauen(z, delta, { durch: "Pia Plan", neueKennung });
    expect(Object.keys(rumpf).sort()).toEqual(["anfrage", "durch", "epoche", "format", "zellen"]);
    expect(rumpf.format).toBe(1);
    expect(rumpf.epoche).toBe("e0e0e0e0");
    expect(zustand.phase).toBe("unterwegs");
    expect(JSON.stringify(rumpf)).not.toMatch(/einstempeln|istEingefroren|monatsabschluss/);
  });
});

/** Hilfe: senden + Antwort verarbeiten. */
function senden(z, lokal, antwort) {
  const d = T.deltaBilden(z, lokal);
  if (!("delta" in d)) return { z, d, rumpf: null };
  const r = T.rumpfBauen(z, d.delta, { durch: "x", neueKennung });
  const a = typeof antwort === "function" ? antwort(r.rumpf) : antwort;
  const e = T.antwortVerarbeiten(r.zustand, a);
  return { z: e.zustand, ergebnis: e.ergebnis, rumpf: r.rumpf, d };
}

describe("A3 Antworten", () => {
  const z0 = () => T.teilwegStart(getAntwort(betrieb()), "m1");
  it("200: Basis übernimmt das GESENDETE (nicht spätere lokale Änderungen), Versionen aktualisiert", () => {
    const z = z0();
    const l1 = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } };
    const d = T.deltaBilden(z, l1).delta;
    const r = T.rumpfBauen(z, d, { neueKennung });
    const l2 = { ...l1, abweichungen: { ...l1.abweichungen, "a1|2026-08-15": "F" } };   // während des Sendens
    const e = T.antwortVerarbeiten(r.zustand, { status: 200, daten: { ok: true, etag: 8, epoche: "e0e0e0e0", versionen: { "m1::2026-08": V("d") } } });
    expect(e.ergebnis).toBe("gespeichert");
    expect(e.zustand.basis.abweichungen["a1|2026-08-14"]).toBe("N");
    expect(e.zustand.versionen["m1::2026-08"]).toBe(V("d"));
    expect(T.deltaBilden(e.zustand, l2).delta.zellen).toEqual([{ feld: "abweichungen", k: "a1|2026-08-15", alt: "N", neu: "F" }]);
  });
  it("200 zweimal angewandt (Wiederholung) ändert nichts mehr", () => {
    const z = z0();
    const l = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } };
    const a = { status: 200, daten: { ok: true, epoche: "e0e0e0e0", versionen: {} } };
    const e1 = senden(z, l, a);
    expect(T.deltaBilden(e1.z, l)).toEqual({ leer: true });
    const r = T.rumpfBauen(e1.z, T.deltaBilden(z, l).delta, { neueKennung });
    const e2 = T.antwortVerarbeiten(r.zustand, { ...a, daten: { ...a.daten, wiederholt: true } });
    expect(e2.zustand.basis).toEqual(e1.z.basis);
  });
  it("Absagen (403, 409 Fachbefunde, 413, 422, 429, 503) schreiben nichts: Basis bleibt, Änderung bleibt ausstehend", () => {
    for (const [status, daten] of [[403, { fehler: "x" }], [409, { fachbefunde: [] }], [409, { code: "MONAT_ABGESCHLOSSEN" }],
      [413, {}], [422, { code: "TEILE_UNGUELTIG" }], [429, {}], [503, {}]]) {
      const z = z0();
      const l = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } };
      const e = senden(z, l, { status, daten });
      expect(e.z.basis).toBe(z.basis);
      expect(e.z.phase).toBe("bereit");
      expect(T.deltaBilden(e.z, l).delta.zellen).toHaveLength(1);
    }
  });
  it("409 NEU_LADEN → Phase neuLaden mit der Liste des Ausstehenden, kein Abgleich je Zelle", () => {
    const z = z0();
    const l = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } };
    const e = senden(z, l, { status: 409, daten: { code: "NEU_LADEN", epoche: "f1f1f1f1" } });
    expect(e.ergebnis).toBe("neuLaden");
    expect(e.z.ausstehendBeiNeuLaden.zellen).toHaveLength(1);
    expect(e.z.konflikte).toEqual([]);
  });
  it("409 TEILE_KONFLIKT ohne eigenes Segment → neuLaden statt Endlosschleife", () => {
    const z = z0();
    const l = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } };
    const e = senden(z, l, { status: 409, daten: { code: "TEILE_KONFLIKT", konflikt: { kern: [], zellen: [{ feld: "abweichungen", k: "b1|2026-08-01", aktuell: "F" }] } } });
    expect(e.ergebnis).toBe("neuLaden");
  });
});

describe("A4 Konflikt je Zelle/Feld: Wahl, Auflösen, Idempotenz, Mehrfachkonflikte", () => {
  const z0 = () => T.teilwegStart(getAntwort(betrieb()), "m1");
  const konflikt409 = (zellen, kern = []) => ({ status: 409, daten: { code: "TEILE_KONFLIKT", konflikt: { zellen, kern },
    epoche: "e0e0e0e0", versionen: { "kern:dienstarten": V("e"), "kern:personen": V("b"), "kern:wuensche": V("c") } } });

  function lage() {
    const z = z0();
    const da = [...z.basis.dienstarten, { id: "S", name: "Spät" }];
    const l = { ...z.basis, dienstarten: da,
      abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N", "a1|2026-08-15": "F", "a1|2026-08-16": "F" } };
    const fremdDa = [...z.basis.dienstarten, { id: "X", name: "Extra" }];
    const e = senden(z, l, konflikt409([{ feld: "abweichungen", k: "a1|2026-08-14", aktuell: "-" },
      { feld: "abweichungen", k: "a1|2026-08-15", aktuell: null }], [{ feld: "dienstarten", aktuell: fremdDa, version: V("e") }]));
    return { z: e.z, l, fremdDa, da, ergebnis: e.ergebnis };
  }

  it("Fragen je Segment, Basis trägt die aktuellen Werte, nicht streitige Zelle bleibt ausstehend", () => {
    const { z, ergebnis, fremdDa } = lage();
    expect(ergebnis).toBe("konflikt");
    expect(z.konflikte.map((f) => f.id)).toEqual(["k:dienstarten", "z:abweichungen:a1|2026-08-14", "z:abweichungen:a1|2026-08-15"]);
    expect(z.basis.abweichungen["a1|2026-08-14"]).toBe("-");
    expect("a1|2026-08-15" in z.basis.abweichungen).toBe(false);
    expect(z.basis.dienstarten).toEqual(fremdDa);
    expect(z.versionen["kern:dienstarten"]).toBe(V("e"));
    expect(T.offeneFragen(z)).toBe(3);
    expect(T.aufloesen(z, {})).toBeNull();   // nichts ohne vollständige Wahl
  });

  it("Wahl ist idempotent; unbekannte Frage/Wahl ändert nichts", () => {
    const { z } = lage();
    const z1 = T.waehlen(z, "z:abweichungen:a1|2026-08-14", "fremd");
    expect(T.waehlen(z1, "z:abweichungen:a1|2026-08-14", "fremd")).toBe(z1);
    expect(T.waehlen(z1, "z:nichts", "fremd")).toBe(z1);
    expect(T.waehlen(z1, "z:abweichungen:a1|2026-08-15", "alles")).toBe(z1);
    expect(T.offeneFragen(z1)).toBe(2);
  });

  it("alles „fremd“: lokal = aktueller Stand, nur die nicht streitige eigene Zelle geht hinaus", () => {
    const { z, l, fremdDa } = lage();
    let w = z;
    for (const f of z.konflikte) w = T.waehlen(w, f.id, "fremd");
    const r = T.aufloesen(w, l);
    expect(r.zustand.phase).toBe("bereit");
    expect(r.lokal.abweichungen["a1|2026-08-14"]).toBe("-");
    expect("a1|2026-08-15" in r.lokal.abweichungen).toBe(false);
    expect(r.lokal.dienstarten).toEqual(fremdDa);
    expect(T.deltaBilden(r.zustand, r.lokal).delta).toEqual({ kern: {}, zellen: [{ feld: "abweichungen", k: "a1|2026-08-16", alt: null, neu: "F" }] });
    /* Zweimal auflösen geht nicht (Konflikt ist geschlossen). */
    expect(T.aufloesen(r.zustand, r.lokal)).toBeNull();
  });

  it("alles „meins“: neues Delta mit alt = aktuell, nur eigene Segmente, Kernfeld mit neuer Version", () => {
    const { z, l, da } = lage();
    let w = z;
    for (const f of z.konflikte) w = T.waehlen(w, f.id, "meins");
    const r = T.aufloesen(w, l);
    expect(r.lokal).toBe(l);
    const d = T.deltaBilden(r.zustand, r.lokal).delta;
    expect(d.kern).toEqual({ dienstarten: { basis: V("e"), wert: da } });
    expect(d.zellen).toEqual([
      { feld: "abweichungen", k: "a1|2026-08-14", alt: "-", neu: "N" },
      { feld: "abweichungen", k: "a1|2026-08-15", alt: null, neu: "F" },
      { feld: "abweichungen", k: "a1|2026-08-16", alt: null, neu: "F" },
    ]);
  });

  it("gemischt und Mehrfachkonflikt: zweiter 409 auf „meins“ ersetzt die Fragen, alte Wahl verfällt", () => {
    const { z, l } = lage();
    let w = T.waehlen(z, "k:dienstarten", "fremd");
    w = T.waehlen(w, "z:abweichungen:a1|2026-08-14", "meins");
    w = T.waehlen(w, "z:abweichungen:a1|2026-08-15", "fremd");
    const r = T.aufloesen(w, l);
    /* Inzwischen ändert jemand a1|14 erneut → zweiter Konflikt nur für diese Zelle. */
    const e = senden(r.zustand, r.lokal, konflikt409([{ feld: "abweichungen", k: "a1|2026-08-14", aktuell: "S" }]));
    expect(e.ergebnis).toBe("konflikt");
    expect(e.z.konflikte.map((f) => [f.id, f.meins, f.fremd])).toEqual([["z:abweichungen:a1|2026-08-14", "N", "S"]]);
    expect(e.z.wahl).toEqual({});
    const r2 = T.aufloesen(T.waehlen(e.z, "z:abweichungen:a1|2026-08-14", "meins"), r.lokal);
    const d = T.deltaBilden(r2.zustand, r2.lokal).delta;
    expect(d.zellen).toEqual([{ feld: "abweichungen", k: "a1|2026-08-14", alt: "S", neu: "N" },
      { feld: "abweichungen", k: "a1|2026-08-16", alt: null, neu: "F" }]);
    const ok = senden(r2.zustand, r2.lokal, { status: 200, daten: { ok: true, versionen: {} } });
    expect(ok.ergebnis).toBe("gespeichert");
    expect(T.deltaBilden(ok.z, r2.lokal)).toEqual({ leer: true });
  });

  it("derselbe 409 zweimal verarbeitet ergibt dieselben Fragen", () => {
    const { z } = lage();
    const nochmal = T.antwortVerarbeiten({ ...z, phase: "unterwegs", unterwegs: { delta: { kern: {}, zellen: [
      { feld: "abweichungen", k: "a1|2026-08-14", alt: "F", neu: "N" }] }, anfrage: "x" } },
    konflikt409([{ feld: "abweichungen", k: "a1|2026-08-14", aktuell: "-" }]));
    expect(nochmal.zustand.konflikte.filter((f) => f.id === "z:abweichungen:a1|2026-08-14")).toHaveLength(1);
  });

  it("Texte: Person, Datum, Dienstart; Kernfeld mit Hinweis auf Ersetzen", () => {
    const { z, l } = lage();
    const t = T.frageText(z.konflikte.find((f) => f.id === "z:abweichungen:a1|2026-08-14"), l);
    expect(t).toEqual({ titel: "Einteilung von Ana Alt am 14.08.2026", meins: "Nacht (N)", fremd: "frei", hinweis: "" });
    const t2 = T.frageText(z.konflikte.find((f) => f.id === "z:abweichungen:a1|2026-08-15"), l);
    expect(t2.fremd).toBe("leer");
    const tk = T.frageText(z.konflikte.find((f) => f.art === "kern"), l);
    expect(tk.titel).toBe("Stammdaten: Dienstarten");
    expect(tk.hinweis).toMatch(/ganze Feld/);
    expect(T.frageText({ art: "zelle", feld: "erfassung", k: "p1|2026-08-02", meins: { start: "06:00", ende: "14:00", bestaetigt: true }, fremd: null }, l))
      .toEqual({ titel: "Ist-Zeit von Pia Plan am 02.08.2026", meins: "06:00–14:00, bestätigt", fremd: "leer", hinweis: "" });
  });
});

describe("A5 Unklarer Ausgang, Wiederholung, Neu aufsetzen", () => {
  const z0 = () => T.teilwegStart(getAntwort(betrieb()), "m1");
  it("Netz weg: Kennung bleibt für die Wiederholung desselben Deltas; anderes Delta → neue Kennung", () => {
    const z = z0();
    const l = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } };
    const e = senden(z, l, { status: null, netz: true });
    expect(e.z.unklar).toEqual(["z:abweichungen:a1|2026-08-14"]);
    const r = T.rumpfBauen(e.z, T.deltaBilden(e.z, l).delta, { neueKennung });
    expect(r.rumpf.anfrage).toBe(e.rumpf.anfrage);
    const l2 = { ...l, abweichungen: { ...l.abweichungen, "a1|2026-08-15": "F" } };
    expect(T.rumpfBauen(e.z, T.deltaBilden(e.z, l2).delta, { neueKennung }).rumpf.anfrage).not.toBe(e.rumpf.anfrage);
  });
  it("ABA-Schutz: unklarer Ausgang, frischer Wert = Erwartungswert → Frage statt blinder Wiederholung", () => {
    const z = z0();
    const l = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } };
    const e = senden(z, l, { status: null, netz: true });
    /* Neue Sitzung: frisches GET zeigt wieder „F" (z. B. jemand hat zurückgesetzt). */
    const n = T.neuAufsetzen(e.z, getAntwort(betrieb()), l);
    expect(n.ergebnis).toBe("konflikt");
    expect(n.zustand.konflikte.map((f) => [f.id, f.meins, f.fremd])).toEqual([["z:abweichungen:a1|2026-08-14", "N", "F"]]);
  });
  it("nie gesendete Änderung bleibt ausstehend, wenn der frische Wert noch der Erwartungswert ist", () => {
    const z = z0();
    const l = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } };
    const n = T.neuAufsetzen(z, getAntwort(betrieb()), l);
    expect(n.ergebnis).toBe("aufgesetzt");
    expect(T.deltaBilden(n.zustand, l).delta.zellen).toEqual([{ feld: "abweichungen", k: "a1|2026-08-14", alt: "F", neu: "N" }]);
  });
  it("frischer Wert = eigener Wert → erledigt; fremd geändert → Frage", () => {
    const z = z0();
    const l = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N", "a1|2026-08-15": "F" } };
    const frisch = betrieb();
    frisch.abweichungen["a1|2026-08-14"] = "N";
    frisch.abweichungen["a1|2026-08-15"] = "-";
    const n = T.neuAufsetzen(z, getAntwort(frisch), l);
    expect(n.zustand.konflikte.map((f) => f.id)).toEqual(["z:abweichungen:a1|2026-08-15"]);
  });
  it("Kernfeld: gleiche Version → ausstehend; neue Version → Frage", () => {
    const z = z0();
    const l = { ...z.basis, dienstarten: [...z.basis.dienstarten, { id: "S", name: "Spät" }] };
    expect(T.neuAufsetzen(z, getAntwort(betrieb()), l).ergebnis).toBe("aufgesetzt");
    const f = betrieb(); f.dienstarten = [...f.dienstarten, { id: "X", name: "Extra" }];
    const n = T.neuAufsetzen(z, getAntwort(f, { versionen: { "kern:dienstarten": V("9"), "kern:personen": V("b"), "kern:wuensche": V("c") } }), l);
    expect(n.zustand.konflikte.map((x) => x.id)).toEqual(["k:dienstarten"]);
  });
  it("andere Epoche (Wiederherstellen) → neuLaden mit Liste, keine Übertragung je Zelle", () => {
    const z = z0();
    const l = { ...z.basis, abweichungen: { ...z.basis.abweichungen, "a1|2026-08-14": "N" } };
    const n = T.neuAufsetzen(z, getAntwort(betrieb(), { epoche: "f1f1f1f1" }), l);
    expect(n.ergebnis).toBe("neuLaden");
    expect(n.zustand.ausstehendBeiNeuLaden.zellen).toHaveLength(1);
    expect(T.neuAufsetzen(z, getAntwort(betrieb(), { epoche: "f1f1f1f1" }), z.basis).ergebnis).toBe("aufgesetzt");
  });
  it("Fähigkeit weg (Schalter aus nach Rückweg) → aus", () => {
    const z = z0();
    expect(T.neuAufsetzen(z, { bestand: { mandanten: [betrieb()] } }, z.basis).ergebnis).toBe("aus");
  });
});

describe("A6 Eigenschaft: „meins“ schickt nie mehr als das eigene Delta, „fremd“ nie das Streitige (fester Startwert)", () => {
  let s = 4242;
  const zufall = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  it("200 zufällige Lagen", () => {
    const werte = ["F", "N", "S", "-", null];
    for (let lauf = 0; lauf < 200; lauf++) {
      const z = T.teilwegStart(getAntwort(betrieb()), "m1");
      const tage = Array.from({ length: 6 }, (_, i) => `a1|2026-09-0${i + 1}`);
      const abw = { ...z.basis.abweichungen };
      for (const k of tage) { const w = werte[Math.floor(zufall() * werte.length)]; if (w === null) delete abw[k]; else abw[k] = w; }
      const l = { ...z.basis, abweichungen: abw };
      const d = T.deltaBilden(z, l);
      if (!("delta" in d)) continue;
      const eigen = new Set(T.segmente(d.delta));
      const streit = d.delta.zellen.filter(() => zufall() < 0.5).map((x) => ({ feld: x.feld, k: x.k, aktuell: "X" }));
      if (!streit.length) continue;
      const e = senden(z, l, { status: 409, daten: { code: "TEILE_KONFLIKT", konflikt: { zellen: streit, kern: [] }, versionen: {} } });
      let w = e.z;
      const wahl = {};
      for (const f of w.konflikte) { wahl[f.k] = zufall() < 0.5 ? "fremd" : "meins"; w = T.waehlen(w, f.id, wahl[f.k]); }
      const r = T.aufloesen(w, l);
      const nd = T.deltaBilden(r.zustand, r.lokal);
      const neu = "delta" in nd ? nd.delta.zellen : [];
      for (const x of neu) {
        expect(eigen.has(`z:${x.feld}:${x.k}`)).toBe(true);
        expect(wahl[x.k]).not.toBe("fremd");
        if (wahl[x.k] === "meins") expect(x.alt).toBe("X");
      }
      for (const [k, wv] of Object.entries(wahl)) if (wv === "fremd") expect(r.lokal.abweichungen[k]).toBe("X");
      /* Nicht streitige eigene Zellen gehen weiter hinaus. */
      const nichtStreit = d.delta.zellen.filter((x) => !streit.some((y) => y.k === x.k)).map((x) => x.k);
      for (const k of nichtStreit) expect(neu.some((x) => x.k === k)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* B  Gleichlauf mit dem Server                                               */

describe("B Gleichlauf mit server/lib/teilweg.mjs", () => {
  it("Zellfelder gleich, Spiegel sind Nur-Server- oder Monatsfelder, stabiles JSON gleich", async () => {
    const S = await import("../server/lib/teilweg.mjs");
    const { MONATSFELDER } = await import("../server/lib/scherben.mjs");
    expect([...T.ZELLFELDER]).toEqual([...S.ZELLFELDER]);
    for (const f of T.NUR_SERVER_SPIEGEL) expect(S.NUR_SERVER.includes(f) || (MONATSFELDER.includes(f) && !S.ZELLFELDER.includes(f))).toBe(true);
    for (const f of T.NUR_SERVER_SPIEGEL) expect(S.KERNFELDER.includes(f)).toBe(false);
    for (const x of [null, 1, "a", [1, { b: 2, a: undefined }], { z: [], a: { y: 1, x: null } }]) expect(T.stabil(x)).toBe(S.stabil(x));
    expect(T.GRENZEN.zellen).toBe(S.TEILE_GRENZEN.zellen);
    expect(T.GRENZEN.kernfelder).toBe(S.TEILE_GRENZEN.kernfelder);
  });
});

/* -------------------------------------------------------------------------- */
/* C  Ende zu Ende über den echten Handler                                    */

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, G, sitzungAnlegen, tag;
let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.48.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, daten: d };
}
const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  PL: { rolle: "planer", person: "p1" },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "m0" },
};
const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], telefon: "0", email: `${id}@example.org` });
function bestandC() {
  const plan = {};
  for (const pid of ["m0", "a1", "s1"]) for (const n of [20, 23, 26, 29]) plan[`${pid}|${tag(n)}`] = "F";
  return { version: 9, stand: 1, mandanten: [{ id: "m1", name: "Haus", branche: "pflege", bundesland: "BE", status: "aktiv",
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
    zyklus: ["-"], anker: "2026-01-05", zyklusLaenge: 1, gruppen: [], versatzTageVon: {},
    einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: plan, erfassung: {}, einstempeln: {}, wuensche: [], anfragen: [], nachrichten: [], abwesenheiten: [],
    freigaben: {}, bestaetigungen: [], protokoll: [] }] };
}
let raumNr = 0;
async function raumMit(rollen) {
  const raum = `wp48-5-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(bestandC())), { durch: "Pruefung" });
  const token = {};
  for (const k of rollen) {
    const r = ROLLEN[k.replace(/\d$/, "")];
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}
const gespeichertM = async (raum) => (await B.bestandLesenStreng(laden(), raum)).bestand.mandanten[0];

/** Eine Sitzung der Oberfläche, nur mit der Logik dieser Datei (so wie 48.5 sie verdrahten wird). */
async function oberflaeche(token) {
  const g = await anfrage("/api/bestand", { token });
  const z = T.teilwegStart(g.daten, "m1");
  return { token, z, lokal: z ? T.mandantAus(g.daten.bestand, "m1") : null, g };
}
async function speichern(o) {
  const d = T.deltaBilden(o.z, o.lokal);
  if (!("delta" in d)) return { d };
  const r = T.rumpfBauen(o.z, d.delta, { durch: "Pruefung", neueKennung });
  const a = await anfrage("/api/bestand/teile", { methode: "POST", token: o.token, rumpf: r.rumpf });
  const e = T.antwortVerarbeiten(r.zustand, a);
  o.z = e.zustand;
  return { ergebnis: e.ergebnis, status: a.status, daten: a.daten, rumpf: r.rumpf };
}
const zelle = (o, feld, k, w) => { o.lokal = { ...o.lokal, [feld]: { ...(o.lokal[feld] || {}) } }; if (w === null) delete o.lokal[feld][k]; else o.lokal[feld][k] = w; };

describe("C Ende zu Ende (echter Handler)", () => {
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-5-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    const schutz = await import("../server/lib/schutz.mjs");
    for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
    const { getStore } = await import("../server/lib/ablage.mjs");
    laden = () => getStore({ name: "centric", consistency: "strong" });
    daten = (await import("../server/funktionen/daten.mjs")).default;
    B = await import("../server/lib/bestand.mjs");
    G = await import("../server/lib/gestalt.mjs");
    ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
    const Z = await import("../server/lib/zeiterfassung.mjs");
    const HEUTE = Z.heuteBerlin();
    tag = (n) => Z.tagePlus(HEUTE, n);
  });
  afterAll(async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    if (wurzel) await rm(wurzel, { recursive: true, force: true });
  });

  it("Schalter aus (Vorgabe): GET ohne teile → Logik aus, Voll-PUT bleibt der Weg", async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    const { token } = await raumMit(["PL"]);
    const o = await oberflaeche(token.PL);
    expect(o.g.status).toBe(200);
    expect(o.g.daten.teile).toBeUndefined();
    expect(o.z).toBeNull();
    expect((await anfrage("/api/bestand/teile", { methode: "POST", token: token.PL, rumpf: { format: 1 } })).status).toBe(404);
  });

  /* Rollen × Konflikttypen. Je Fall: zwei Oberflächen derselben Rolle (zwei Geräte bzw. zwei Personen),
     A speichert zuerst, B läuft in den Konflikt und entscheidet. */
  const FAELLE = {
    LT: ["plan-zelle", "plan-loeschen", "kern-dienstarten", "mehrfach"],
    PL: ["plan-zelle", "plan-loeschen", "kern-dienstarten", "mehrfach"],
    SV: ["plan-zelle", "plan-loeschen", "mehrfach"],
    MA: ["kern-wuensche"],
  };
  function aendern(fall, o, wer) {
    const k = (n) => `a1|${tag(n)}`;
    if (fall === "plan-zelle") zelle(o, "abweichungen", k(20), wer === "A" ? "N" : "-");
    if (fall === "plan-loeschen") zelle(o, "abweichungen", k(23), wer === "A" ? null : "N");
    if (fall === "kern-dienstarten") o.lokal = { ...o.lokal, dienstarten: [...o.lokal.dienstarten,
      { id: wer, name: `Dienst ${wer}`, start: "08:00", ende: "16:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }] };
    if (fall === "kern-wuensche") o.lokal = { ...o.lokal, wuensche: [...(o.lokal.wuensche || []),
      { id: `w${wer}`, personId: "m0", datum: tag(25 + (wer === "A" ? 0 : 1)), art: "frei" }] };
    if (fall === "mehrfach") {
      zelle(o, "abweichungen", k(20), wer === "A" ? "N" : "-");
      zelle(o, "abweichungen", k(26), wer === "A" ? "N" : "-");
      if (wer === "B") zelle(o, "abweichungen", `m0|${tag(23)}`, "N");   // nicht streitig
    }
  }
  const streitig = (fall) => ({ "plan-zelle": 1, "plan-loeschen": 1, "kern-dienstarten": 1, "kern-wuensche": 1, mehrfach: 2 })[fall];

  for (const [rolle, faelle] of Object.entries(FAELLE)) {
    for (const fall of faelle) {
      for (const wahl of ["fremd", "meins"]) {
        it(`${rolle} × ${fall} × ${wahl}`, async () => {
          process.env.CENTRIC_TEILSPEICHERUNG = "true";
          const { raum, token } = await raumMit([rolle, `${rolle}2`]);
          const a = await oberflaeche(token[rolle]);
          const b = await oberflaeche(token[`${rolle}2`]);
          expect(a.z && b.z).toBeTruthy();
          aendern(fall, a, "A");
          aendern(fall, b, "B");
          const eigen = new Set(T.segmente(T.deltaBilden(b.z, b.lokal).delta));
          const sa = await speichern(a);
          expect(sa.status).toBe(200);
          const nachA = await gespeichertM(raum);
          const sb = await speichern(b);
          expect(sb.status).toBe(409);
          expect(sb.ergebnis).toBe("konflikt");
          expect(b.z.konflikte).toHaveLength(streitig(fall));
          /* Der Server hat beim Konflikt nichts geschrieben. */
          expect(await gespeichertM(raum)).toEqual(nachA);
          let w = b.z;
          for (const f of w.konflikte) w = T.waehlen(w, f.id, wahl);
          const r = T.aufloesen(w, b.lokal);
          b.z = r.zustand; b.lokal = r.lokal;
          const nach = await speichern(b);
          const g = await gespeichertM(raum);
          if (wahl === "fremd") {
            /* Kein Datenverlust: A's Werte stehen unverändert; nur Nicht-Streitiges ging hinaus. */
            if (fall === "mehrfach") {
              expect(nach.status).toBe(200);
              expect(nach.rumpf.zellen.map((x) => x.k)).toEqual([`m0|${tag(23)}`]);
              expect(g.abweichungen[`m0|${tag(23)}`]).toBe("N");
            } else expect(nach.d).toEqual({ leer: true });
            for (const f of w.konflikte) {
              if (f.art === "zelle") expect(g[f.feld][f.k] ?? null).toEqual(nachA[f.feld][f.k] ?? null);
              else expect(g[f.feld]).toEqual(nachA[f.feld]);
            }
          } else {
            expect(nach.status).toBe(200);
            /* Nur eigene Segmente, alt = Wert von A. */
            for (const s of T.segmente({ kern: nach.rumpf.kern || {}, zellen: nach.rumpf.zellen || [] })) expect(eigen.has(s)).toBe(true);
            for (const f of w.konflikte) {
              if (f.art === "zelle") expect(g[f.feld][f.k] ?? null).toEqual(f.meins);
              else expect(g[f.feld]).toEqual(f.meins);
            }
          }
          /* Danach ist B im Gleichstand: nichts mehr ausstehend. */
          expect(T.deltaBilden(b.z, b.lokal)).toEqual({ leer: true });
        });
      }
    }
  }

  it("„meins“ weitet keine Rechte aus: SV setzt eine Zelle außerhalb des Bereichs → dieselbe Absage wie ohne Konflikt", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    const { raum, token } = await raumMit(["PL", "SV"]);
    const pl = await oberflaeche(token.PL);
    const sv = await oberflaeche(token.SV);
    /* p1 (Planung, Bereich ALLE) liegt nicht im Bereich der SV. */
    zelle(pl, "abweichungen", `p1|${tag(30)}`, "N");
    expect((await speichern(pl)).status).toBe(200);
    zelle(sv, "abweichungen", `p1|${tag(30)}`, "F");
    const s1 = await speichern(sv);
    const vorher = await gespeichertM(raum);
    if (s1.status === 409 && s1.ergebnis === "konflikt") {
      const r = T.aufloesen(T.waehlen(sv.z, sv.z.konflikte[0].id, "meins"), sv.lokal);
      sv.z = r.zustand; sv.lokal = r.lokal;
      const s2 = await speichern(sv);
      expect(s2.status).toBe(403);
    } else expect(s1.status).toBe(403);
    expect(await gespeichertM(raum)).toEqual(vorher);
    expect(vorher.abweichungen[`p1|${tag(30)}`]).toBe("N");
  });

  it("Mehrfachkonflikte nacheinander: dritter Schreiber dazwischen, zweite Fragerunde, am Ende alle Entscheidungen gespeichert", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    const { raum, token } = await raumMit(["PL", "PL2", "LT"]);
    const a = await oberflaeche(token.PL);
    const b = await oberflaeche(token.PL2);
    const c = await oberflaeche(token.LT);
    const k = (n) => `a1|${tag(n)}`;
    zelle(a, "abweichungen", k(20), "N"); zelle(a, "abweichungen", k(23), "N");
    expect((await speichern(a)).status).toBe(200);
    zelle(b, "abweichungen", k(20), "-"); zelle(b, "abweichungen", k(23), "-");
    expect((await speichern(b)).ergebnis).toBe("konflikt");
    let w = T.waehlen(b.z, `z:abweichungen:${k(20)}`, "meins");
    w = T.waehlen(w, `z:abweichungen:${k(23)}`, "fremd");
    const r = T.aufloesen(w, b.lokal); b.z = r.zustand; b.lokal = r.lokal;
    /* Bevor B wieder sendet, ändert C dieselbe Zelle. */
    zelle(c, "abweichungen", k(20), null);
    const sc = await speichern(c);
    expect(sc.status).toBe(409);   // C stand noch auf dem Ausgangswert „F" → Konflikt gegen A
    const rc = T.aufloesen(T.waehlen(c.z, c.z.konflikte[0].id, "meins"), c.lokal); c.z = rc.zustand; c.lokal = rc.lokal;
    expect((await speichern(c)).status).toBe(200);
    const sb = await speichern(b);
    expect(sb.ergebnis).toBe("konflikt");
    expect(b.z.konflikte.map((f) => [f.k, f.meins, f.fremd])).toEqual([[k(20), "-", null]]);
    const r2 = T.aufloesen(T.waehlen(b.z, b.z.konflikte[0].id, "meins"), b.lokal); b.z = r2.zustand; b.lokal = r2.lokal;
    expect((await speichern(b)).status).toBe(200);
    const g = await gespeichertM(raum);
    expect(g.abweichungen[k(20)]).toBe("-");
    expect(c.lokal.abweichungen[k(20)]).toBeUndefined();
    expect(g.abweichungen[k(23)]).toBe("N");
  });

  it("Wiederholung nach unklarem Ausgang in derselben Sitzung: gleiche Kennung → gespeicherte Antwort, kein zweites Schreiben", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    const { raum, token } = await raumMit(["PL"]);
    const o = await oberflaeche(token.PL);
    zelle(o, "abweichungen", `a1|${tag(20)}`, "N");
    const d = T.deltaBilden(o.z, o.lokal).delta;
    const r = T.rumpfBauen(o.z, d, { durch: "Pruefung", neueKennung });
    const echt = await anfrage("/api/bestand/teile", { methode: "POST", token: o.token, rumpf: r.rumpf });
    expect(echt.status).toBe(200);
    const stand1 = (await B.bestandLesenStreng(laden(), raum)).stand;
    /* Antwort ging verloren. */
    o.z = T.antwortVerarbeiten(r.zustand, { status: null, netz: true }).zustand;
    const nochmal = await speichern(o);
    expect(nochmal.rumpf.anfrage).toBe(r.rumpf.anfrage);
    expect(nochmal.status).toBe(200);
    expect(nochmal.daten.wiederholt).toBe(true);
    expect((await B.bestandLesenStreng(laden(), raum)).stand).toBe(stand1);
    expect(T.deltaBilden(o.z, o.lokal)).toEqual({ leer: true });
  });

  it("Neue Sitzung nach unklarem Ausgang (ABA): kein blindes Wiederholen, sondern Frage", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    const { token } = await raumMit(["PL", "PL2", "LT"]);
    const o = await oberflaeche(token.PL);
    const k = `a1|${tag(20)}`;
    zelle(o, "abweichungen", k, "N");
    const r = T.rumpfBauen(o.z, T.deltaBilden(o.z, o.lokal).delta, { neueKennung });
    expect((await anfrage("/api/bestand/teile", { methode: "POST", token: o.token, rumpf: r.rumpf })).status).toBe(200);
    o.z = T.antwortVerarbeiten(r.zustand, { status: null, netz: true }).zustand;
    /* Jemand setzt zurück auf „F". */
    const lt = await oberflaeche(token.LT);
    zelle(lt, "abweichungen", k, "F");
    expect((await speichern(lt)).status).toBe(200);
    /* Neue Sitzung derselben Person (PL2), frisches GET. */
    const g = await anfrage("/api/bestand", { token: token.PL2 });
    const n = T.neuAufsetzen(o.z, g.daten, o.lokal);
    expect(n.ergebnis).toBe("konflikt");
    expect(n.zustand.konflikte.map((f) => [f.k, f.meins, f.fremd])).toEqual([[k, "N", "F"]]);
  });
});
