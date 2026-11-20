/* ==========================================================================
   IMP-6 — ZYKLUSLÄNGEN, GRENZFÄLLE, ZUSTAND „KEIN SCHICHTMODELL“ (Q5),
   GESPEICHERTE FEHLWERTE UND DIFFERENZ ALT/NEU DER PLANRECHNUNG

   Ergänzt pruefungen/imp6-mehrfachmodelle.test.js (Handler, Rollen, Schutz)
   um reine Prüfungen der Bibliothek server/lib/schichtzuordnung.mjs:

   Z. Zykluslage für die Längen 1, 5, 7, 9, 14, 21, 28, 42 mit Beginn über
      Jahreswechsel, Schalttag, Zeitumstellung (März/Oktober) und mitten im
      Monat, je mit Versatz 0, Mitte und n−1. Erwartung unabhängig gezählt
      (Tag für Tag weiter, nicht über die Formel der Bibliothek).
   W. Modellwechsel mitten im Monat (5 → 9 Tage), Überschneidung = mehrdeutig
      (kein Vorrang, Betreiberentscheidung 2026-11-13), Lücke.
   Q5. Betreiberentscheidung 2026-11-14 Frage 5: Der Zustand „kein
      Schichtmodell“ ist zulässig — Lücken zwischen Zuordnungen und ein
      Ende der Liste werden gespeichert; an diesen Tagen gilt „keine“, nie
      still das Betriebsmodell.
   V. Validierungen (Länge, Muster, Beginn, Versatz) und gespeicherte
      Fehlwerte: „ungültig“ statt stiller Korrektur.
   D. Differenz alt/neu: Der Altbestand rechnet mit Zuordnungen genau eines
      Modells (Betriebsmodell) je Person bit-gleich wie ohne — Plan, Prüfung,
      Kennzahlen, Soll/Ist/Konto, Zuschläge, Ist-Einfrieren, Rechenkern
      (Intelligence). Zuordnungen auf eigene Modelle wirken ebenfalls nicht,
      solange die Planwirkung nicht eingeschaltet ist (ENTSCHEIDUNGSLISTE
      P2-4 Punkt 6, offen); ein Wächter zeigt, welche Module die Zuordnung lesen.

   Feste Uhr (Fake-Timer) für die Planrechnung; die Bibliothek bekommt Tage übergeben.
   Aufruf: npx vitest run pruefungen/imp6-zyklen-grenzfaelle.test.js --maxWorkers=1
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../server/lib/schichtzuordnung.mjs";
import { FEST, VON, BIS, MONAT, betriebe, messen } from "./engine-golden.fixture.mjs";

const kopie = (x) => JSON.parse(JSON.stringify(x));
/** Eigene Datumsrechnung (nicht die der Bibliothek): Tag + n über Date.UTC mit Tagesüberlauf. */
const tagNach = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

const LAENGEN = [1, 5, 7, 9, 14, 21, 28, 42];
const DIENSTARTEN = Array.from({ length: 42 }, (_, i) => ({ id: `D${i}` }));
const modell = (n) => ({ id: `len${n}`, name: `Länge ${n}`, tage: Array.from({ length: n }, (_, i) => `D${i}`) });
const BETRIEB = { dienstarten: DIENSTARTEN, schichtmodelle: [...LAENGEN.map(modell), { id: "frei", name: "Frei", tage: ["D0", "-", "-"] }],
  zyklus: { tage: ["D0", "-"] }, anker: "2026-01-05", einheiten: [{ id: "e1", versatzTage: 0 }] };
const VERZ = L.modellVerzeichnis(BETRIEB);
const zu = (x) => ({ id: "z", modellId: "len7", gueltigAb: "2027-11-01", gueltigBis: null, versatz: 0, ...x });
const mit = (...liste) => ({ id: "a1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], schichtmodellZuordnungen: liste });

/* ------------------------------------------------------------------------ */
describe("Z. Zykluslage je Länge über Jahres-, Monats- und Umstellungsgrenzen", () => {
  const BEGINNE = {
    "Jahreswechsel": "2027-12-20",
    "Schalttag 2028": "2028-02-25",
    "Zeitumstellung März (2028-03-26)": "2028-03-20",
    "Zeitumstellung Oktober (2028-10-29)": "2028-10-25",
    "mitten im Monat": "2027-11-17",
  };
  for (const n of LAENGEN) for (const [fall, ab] of Object.entries(BEGINNE)) {
    it(`Länge ${n}, Beginn ${fall}: Versatz 0, Mitte und n−1, Tag für Tag gezählt`, () => {
      for (const versatz of [...new Set([0, Math.floor(n / 2), n - 1])]) {
        const p = mit(zu({ modellId: `len${n}`, gueltigAb: ab, versatz }));
        expect(L.pruefeZuordnungen(p.schichtmodellZuordnungen, VERZ), `n=${n} v=${versatz}`).toBeNull();
        let zyklustag = versatz;                                   // am Beginn: Zyklustag versatz + 1 (Index versatz)
        for (let i = 0; i < 2 * n + 40; i++) {
          const d = tagNach(ab, i);
          expect(L.modellDienstAm(BETRIEB, p, d), `n=${n} v=${versatz} ${d}`).toEqual({ art: "dienst", modellId: `len${n}`, dienstId: `D${zyklustag}` });
          zyklustag = (zyklustag + 1) % n;
        }
        /* Vor dem Beginn gilt kein Modell (Q5: zulässiger Zustand, kein Rückgriff aufs Betriebsmodell). */
        expect(L.modellDienstAm(BETRIEB, p, tagNach(ab, -1))).toEqual({ art: "keine" });
      }
    });
  }
  it("freier Zyklustag („-“) ergibt keinen Dienst, aber ein eindeutiges Modell", () => {
    const p = mit(zu({ modellId: "frei", gueltigAb: "2028-02-28" }));
    expect(["2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02"].map((d) => L.modellDienstAm(BETRIEB, p, d).dienstId)).toEqual(["D0", null, null, "D0"]);
    expect(L.modellDienstAm(BETRIEB, p, "2028-02-29")).toEqual({ art: "dienst", modellId: "frei", dienstId: null });
  });
});

/* ------------------------------------------------------------------------ */
describe("W. Modellwechsel, Überschneidung, Lücke", () => {
  it("Wechsel mitten im Monat (5 Tage → 9 Tage): neuer Zyklus beginnt am Wechseltag mit seinem Versatz", () => {
    const p = mit(zu({ id: "a", modellId: "len5", gueltigAb: "2027-11-01", gueltigBis: "2027-11-14", versatz: 2 }),
      zu({ id: "b", modellId: "len9", gueltigAb: "2027-11-15", gueltigBis: null, versatz: 4 }));
    expect(L.pruefeZuordnungen(p.schichtmodellZuordnungen, VERZ)).toBeNull();
    const reihe = Array.from({ length: 6 }, (_, i) => L.modellDienstAm(BETRIEB, p, tagNach("2027-11-12", i)));
    expect(reihe).toEqual([
      { art: "dienst", modellId: "len5", dienstId: "D3" },     // 11-12: (11 + 2) % 5
      { art: "dienst", modellId: "len5", dienstId: "D4" },
      { art: "dienst", modellId: "len5", dienstId: "D0" },     // 11-14: letzter Tag von a
      { art: "dienst", modellId: "len9", dienstId: "D4" },     // 11-15: Beginn von b, Versatz 4
      { art: "dienst", modellId: "len9", dienstId: "D5" },
      { art: "dienst", modellId: "len9", dienstId: "D6" },
    ]);
    expect(L.anzuwendendesModell(BETRIEB, p, "2027-11-14")).toMatchObject({ zuordnungId: "a" });
    expect(L.anzuwendendesModell(BETRIEB, p, "2027-11-15")).toMatchObject({ zuordnungId: "b", anker: "2027-11-15", versatz: 4 });
  });
  it("Überschneidung zweier Modelle derselben Person: mehrdeutig mit beiden Kennungen, abgewiesen beim Speichern, kein Vorrang", () => {
    for (const [a, b] of [["2027-11-01", "2027-11-15"], ["2027-11-15", "2027-11-01"]]) {
      const p = mit(zu({ id: "x", modellId: "len5", gueltigAb: a, gueltigBis: "2027-11-30" }), zu({ id: "y", modellId: "len9", gueltigAb: b, gueltigBis: null }));
      const r = L.anzuwendendesModell(BETRIEB, p, "2027-11-20");
      expect(r.art).toBe("mehrdeutig");
      expect([...r.zuordnungIds].sort()).toEqual(["x", "y"]);
      expect(L.modellDienstAm(BETRIEB, p, "2027-11-20").art).toBe("mehrdeutig");
      expect(L.pruefeZuordnungen(p.schichtmodellZuordnungen, VERZ)).toMatchObject({ code: "UEBERSCHNEIDUNG" });
    }
    /* Ein gemeinsamer Tag genügt (Ende a = Beginn b). */
    expect(L.pruefeZuordnungen([zu({ id: "x", gueltigBis: "2027-11-15" }), zu({ id: "y", gueltigAb: "2027-11-15" })], VERZ)).toMatchObject({ code: "UEBERSCHNEIDUNG" });
  });
});

/* ------------------------------------------------------------------------ */
describe("Q5. Zustand „kein Schichtmodell“ ist zulässig (Betreiberentscheidung 2026-11-14)", () => {
  it("Lücke zwischen zwei Zuordnungen: gültige Liste; in der Lücke „keine“, danach neuer Zyklus", () => {
    const liste = [zu({ id: "a", modellId: "len5", gueltigAb: "2027-11-01", gueltigBis: "2027-11-10" }), zu({ id: "b", modellId: "len9", gueltigAb: "2027-11-20", versatz: 1 })];
    expect(L.pruefeZuordnungen(liste, VERZ)).toBeNull();
    const p = mit(...liste);
    expect(L.modellDienstAm(BETRIEB, p, "2027-11-10")).toEqual({ art: "dienst", modellId: "len5", dienstId: "D4" });
    for (let i = 11; i <= 19; i++) {
      const d = `2027-11-${i}`;
      expect(L.anzuwendendesModell(BETRIEB, p, d), d).toEqual({ art: "keine" });
      expect(L.modellDienstAm(BETRIEB, p, d), d).toEqual({ art: "keine" });
    }
    expect(L.modellDienstAm(BETRIEB, p, "2027-11-20")).toEqual({ art: "dienst", modellId: "len9", dienstId: "D1" });
  });
  it("Lücke nach dem Betriebsmodell und Ende der Liste: gültig; davor Betriebsmodell, danach „keine“", () => {
    const liste = [{ id: "alt", modellId: "betrieb", gueltigAb: null, gueltigBis: "2027-10-31" }, zu({ id: "a", gueltigAb: "2027-11-15", gueltigBis: "2027-12-31" })];
    expect(L.pruefeZuordnungen(liste, VERZ)).toBeNull();
    const p = mit(...liste);
    expect(L.anzuwendendesModell(BETRIEB, p, "2027-10-31")).toMatchObject({ art: "modell", modellId: "betrieb" });
    expect(L.anzuwendendesModell(BETRIEB, p, "2027-11-01")).toEqual({ art: "keine" });
    expect(L.anzuwendendesModell(BETRIEB, p, "2028-01-01")).toEqual({ art: "keine" });
  });
  it("viele Lücken bis zur Obergrenze: gültig; Reihenfolge der Liste egal", () => {
    const liste = Array.from({ length: 50 }, (_, i) => zu({ id: `z${i}`, gueltigAb: tagNach("2027-11-01", 3 * i), gueltigBis: tagNach("2027-11-01", 3 * i + 1) }));
    expect(L.pruefeZuordnungen(liste, VERZ)).toBeNull();
    expect(L.pruefeZuordnungen([...liste].reverse(), VERZ)).toBeNull();
  });
});

/* ------------------------------------------------------------------------ */
describe("V. Validierungen und gespeicherte Fehlwerte", () => {
  it("Zykluslänge und Muster: 1 und 1000 gültig; 0, 1001, leere/fremde/nicht-Text-Tage abgewiesen", () => {
    expect(L.pruefeModelle([{ id: "a", name: "x", tage: ["D0"] }], DIENSTARTEN)).toBeNull();
    expect(L.pruefeModelle([{ id: "a", name: "x", tage: new Array(1000).fill("-") }], DIENSTARTEN)).toBeNull();
    for (const [tage, code] of [[[], "TAGE"], [new Array(1001).fill("-"), "TAGE"], ["D0", "TAGE"], [[""], "DIENSTART"], [[1], "DIENSTART"],
      [[null], "DIENSTART"], [["D0", "d0"], "DIENSTART"], [["frei"], "DIENSTART"]])
      expect(L.pruefeModelle([{ id: "a", name: "x", tage }], DIENSTARTEN), JSON.stringify(tage).slice(0, 30)).toMatchObject({ code });
  });
  it("Beginn: Kalenderdatum JJJJ-MM-TT; 29.02. nur im Schaltjahr", () => {
    expect(L.pruefeZuordnungen([zu({ gueltigAb: "2028-02-29" })], VERZ)).toBeNull();
    for (const ab of ["2027-02-29", "2027-1-01", "2027-13-01", "2027-11-31", "01.11.2027", "", 20271101])
      expect(L.pruefeZuordnungen([zu({ gueltigAb: ab })], VERZ), String(ab)).toMatchObject({ code: "DATUM" });
  });
  it("Versatz: ganze Zahl 0 … n−1; Bruch, Text, NaN, n und negativ abgewiesen (kein Modulo)", () => {
    for (const n of LAENGEN) {
      expect(L.pruefeZuordnungen([zu({ modellId: `len${n}`, versatz: n - 1 })], VERZ), `n=${n}`).toBeNull();
      for (const v of [n, n + 1, -1, 1.5, "1", Number.NaN, true])
        expect(L.pruefeZuordnungen([zu({ modellId: `len${n}`, versatz: v })], VERZ), `n=${n} v=${String(v)}`).toMatchObject({ code: "VERSATZ" });
    }
  });
  it("gespeicherter Versatz außerhalb 0 … n−1 oder keine ganze Zahl (etwa aus einer alten Sicherung): ungültig, nie still 0 oder Modulo", () => {
    for (const v of [7, 8, -1, 1.5, "1", true]) {
      const p = mit(zu({ versatz: v }));
      expect(L.anzuwendendesModell(BETRIEB, p, "2027-11-05"), String(v)).toEqual({ art: "ungueltig", grund: "versatz" });
      expect(L.modellDienstAm(BETRIEB, p, "2027-11-05"), String(v)).toEqual({ art: "ungueltig", grund: "versatz" });
    }
    /* Fehlt der Versatz oder ist er leer, gilt wie dokumentiert Zyklustag 1 (Datenmodell: versatz optional). */
    for (const v of [undefined, null]) {
      const z = zu({}); if (v === undefined) delete z.versatz; else z.versatz = v;
      expect(L.modellDienstAm(BETRIEB, mit(z), "2027-11-01")).toEqual({ art: "dienst", modellId: "len7", dienstId: "D0" });
    }
  });
});

/* ------------------------------------------------------------------------ */
describe("D. Differenz alt/neu: Altbestand rechnet mit genau einem Modell je Person bit-gleich", () => {
  let F, E, K, I, FALL = [];
  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    F = await import("../src/lib/fachlogik.js");
    E = await import("../server/lib/engine/zeit.mjs");
    K = await import("../server/lib/engine/rechenkern.mjs");
    I = await import("../server/lib/isteinfrieren.mjs");
    FALL = betriebe(F);
  }, 240000);
  afterAll(() => { vi.useRealTimers(); });

  /** Alles, was aus einem Betrieb gerechnet wird: Plan, Prüfung, Kennzahlen, Konten (messen), Zuschläge, Ist-Einfrieren, Rechenkern. */
  const alles = (m) => {
    const r = { messen: messen(F, m) };
    /* messen hasht die Besetzung samt der vollständigen Personendatensätze (also auch der Zuordnungsliste selbst);
       verglichen wird hier die Rechnung: wer welchen Dienst besetzt, mit Soll, Differenz, Qualifikation, Status. */
    delete r.messen.besetzung;
    delete r.messen.verteilung;                                    // ebenso: Zeilen tragen den Personendatensatz
    const v = F.verteilung(m, MONAT);
    r.verteilung = { ...v, zeilen: v.zeilen.map((z) => ({ ...z, person: z.person.id })) };
    r.besetzung = Array.from({ length: 30 }, (_, i) => `${MONAT}-${String(i + 1).padStart(2, "0")}`).map((d) =>
      Object.fromEntries(Object.entries(F.besetzung(m, d)).map(([k, e]) => [k, { ...e, personen: e.personen.map((p) => p.id) }])));
    r.zuschlag = m.personen.map((p) => [F.zuschlagStunden(m, p, MONAT), F.zuschlagWert(m, p, MONAT)]);
    r.einfrieren = (() => { try { return I.istEinfrieren(m, MONAT); } catch (e) { return { fehler: String(e && e.message) }; } })();
    r.kern = E.mitTagesdatum("2026-11-06", () => K.rechnen(m, { zeitraum: { von: VON, bis: BIS }, heute: "2026-11-06" }));
    return JSON.stringify(r);
  };
  /** Betrieb mit Modellen und je Person genau einer Zuordnung (Betriebsmodell, unbefristet) bzw. einem eigenen Modell. */
  const mitZuordnung = (m, eigenes) => {
    const n = kopie(m);
    const da = (n.dienstarten || []).map((d) => String(d.id));
    n.schichtmodelle = [{ id: "fuenf", name: "Fünf", tage: [da[0] || "-", da[1] || "-", "-", da[0] || "-", "-"], geaendertAm: "2026-10-01T00:00:00.000Z", geaendertVon: "l1", version: 1 }];
    n.personen = n.personen.map((p) => ({ ...p, schichtmodellZuordnungen: [eigenes
      ? { id: `z-${p.id}`, modellId: "fuenf", gueltigAb: "2026-10-01", gueltigBis: null, versatz: 1, geaendertAm: "2026-10-01T00:00:00.000Z", geaendertVon: "l1", version: 1 }
      : { id: `z-${p.id}`, modellId: "betrieb", gueltigAb: null, gueltigBis: null, geaendertAm: "2026-10-01T00:00:00.000Z", geaendertVon: "l1", version: 1 }] }));
    return n;
  };

  it("die Fixture rechnet etwas (Personen, Dienste, Befunde) — sonst wäre die Gleichheit leer", () => {
    expect(FALL.length).toBeGreaterThanOrEqual(3);
    const demo = FALL.filter(([name]) => name.startsWith("demo"));
    expect(demo.length).toBeGreaterThan(0);
    for (const [name, m] of demo) {
      expect(m.personen.length, name).toBeGreaterThan(3);
      expect(messen(F, kopie(m)).pruefen.anzahl, name).toBeGreaterThan(0);
    }
  }, 240000);
  /** Gleichheit der Zeichenketten; bei Abweichung die Stelle mit Umgebung in der Meldung. */
  const gleich = (neu, alt, name) => {
    if (neu === alt) return;
    let i = 0; while (neu[i] === alt[i]) i++;
    expect(neu.slice(Math.max(0, i - 160), i + 80), name).toBe(alt.slice(Math.max(0, i - 160), i + 80));
  };
  it("Zuordnung auf das Betriebsmodell (genau ein Modell je Person): alles bit-gleich", () => {
    for (const [name, m] of FALL) gleich(alles(mitZuordnung(m, false)), alles(kopie(m)), name);
  }, 240000);
  it("Zuordnung auf ein eigenes Modell: ohne eingeschaltete Planwirkung (P2-4 Punkt 6, offen) ebenfalls bit-gleich", () => {
    for (const [name, m] of FALL) gleich(alles(mitZuordnung(m, true)), alles(kopie(m)), name);
  }, 240000);
  it("Zuordnungen mit Lücke und befristetem Ende (Frage 5): ohne Planwirkung ebenfalls bit-gleich (Vorbereitung für Punkt 6)", () => {
    for (const [name, m] of FALL) {
      const n = mitZuordnung(m, true);
      n.personen = n.personen.map((p) => ({ ...p, schichtmodellZuordnungen: [
        { id: `z-${p.id}-a`, modellId: "betrieb", gueltigAb: null, gueltigBis: "2026-11-10" },
        { id: `z-${p.id}-b`, modellId: "fuenf", gueltigAb: "2026-11-20", gueltigBis: "2026-11-25", versatz: 2 }] }));
      for (const p of n.personen) {
        expect(L.pruefeZuordnungen(p.schichtmodellZuordnungen, L.modellVerzeichnis(n)), name).toBeNull();
        expect(L.anzuwendendesModell(n, p, "2026-11-15"), name).toEqual({ art: "keine" });
      }
      gleich(alles(n), alles(kopie(m)), name);
    }
  }, 240000);
  it("die Eingabe bleibt unverändert (keine stille Migration, kein neues Feld)", () => {
    for (const [name, m] of FALL) {
      const vorher = JSON.stringify(m);
      alles(m);
      expect(JSON.stringify(m), name).toBe(vorher);
      expect(vorher, name).not.toContain("schichtmodellZuordnungen");
    }
  }, 240000);
});

/* ------------------------------------------------------------------------ */
describe("D2. Wächter: nur bekannte Module lesen Zuordnungen und Modelldefinitionen (Quelltextsuche)", () => {
  /* Wer die Zuordnung in die Planrechnung bringt, schaltet die Planwirkung ein (P2-4 Punkt 6) und muss vorher Punkt 8
     (Wiederherstellen) lösen — dann diese Liste bewusst erweitern und die Differenzprüfung D umstellen. */
  /* IMP-6 Oberfläche (bewusste Erweiterung, keine Planwirkung): src/lib/schichtmodelle-pflege.js ist die einzige Stelle der
     Oberfläche, die die Felder nennt (Pflege: Entwurf prüfen, Feld setzen, Lage anzeigen). Ansicht und Aktionen gehen nur
     über sie; dass weder sie noch die Planrechnung (fachlogik.js) einander nutzen, prüft imp6-oberflaeche E3. */
  /* IMP-6 Planwirkung PR 1 (bewusste Erweiterung, Schalter CENTRIC_SCHICHTMODELL_WIRKUNG aus und unverbunden):
     server/lib/schichtmodell-kern.mjs ist der aus schichtzuordnung.mjs ausgelagerte Kern ohne Importe (sonst Importkreis
     über monatsabschluss.mjs → isteinfrieren.mjs); server/lib/fachpruefung.mjs ist die EINE Stelle der Planrechnung, die
     ihn liest (planDienst, schichtmodellLageAm, schichtmodellKlaerungen) — alle übrigen Rechnungen gehen über planDienst
     (Wächter imp6-planwirkung S). Die Differenz D bleibt unverändert bit-gleich (Wirkung aus); AN prüft imp6-planwirkung D3.
     Der Suchausdruck erkennt zusätzlich jedes Modul, das den Kern importiert. */
  const ERLAUBT = ["server/lib/schichtzuordnung.mjs", "server/lib/rechte.mjs", "server/lib/sicht.mjs", "server/funktionen/daten.mjs",
    "server/lib/import/schichtvorschau.mjs", "src/lib/schichtmodelle-pflege.js", "server/lib/schichtmodell-kern.mjs", "server/lib/fachpruefung.mjs"];
  const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dateien = (rel) => readdirSync(path.join(wurzel, rel)).flatMap((n) => {
    const r = `${rel}/${n}`;
    return statSync(path.join(wurzel, r)).isDirectory() ? dateien(r) : /\.(mjs|js|jsx)$/.test(n) ? [r] : [];
  });
  /* Grenze: erkannt wird nur der Feldname im Quelltext (Punkt, Anführungszeichen, Objektschlüssel, Konstante) — ein
     dynamisch gebildeter Feldzugriff (etwa m["schicht" + "modelle"]) bleibt unerkannt. */
  it("server/ und src/: schichtmodellZuordnungen oder schichtzuordnung.mjs nur in den erlaubten Modulen", () => {
    const treffer = [...dateien("server"), ...dateien("src")]
      .filter((r) => /schichtmodellZuordnungen|schichtzuordnung\.mjs|schichtmodell-kern\.mjs|\bZUORDNUNG_FELD\b/.test(readFileSync(path.join(wurzel, r), "utf8")));
    expect(treffer.sort()).toEqual([...ERLAUBT].sort());
  });
  it("server/ und src/: das Feld der Modelldefinitionen (schichtmodelle) nur in den erlaubten Modulen", () => {
    /* Erlaubt: die Module, die schon Zuordnungen lesen, ohne daten.mjs (es liest Modelle nur über die Bibliothek), dazu
       src/app/feldbezeichnungen.js — dort steht nur die deutsche Bezeichnung des Kernfelds, kein Lesen der Definitionen. */
    /* fachpruefung.mjs liest die Modelldefinitionen nur über den Kern (modellVerzeichnis), nennt das Feld also nicht. */
    const MODELL_ERLAUBT = [...ERLAUBT.filter((r) => r !== "server/funktionen/daten.mjs" && r !== "server/lib/fachpruefung.mjs"), "src/app/feldbezeichnungen.js"];
    const treffer = [...dateien("server"), ...dateien("src")]
      .filter((r) => /\.schichtmodelle\b|["'`]schichtmodelle["'`]|\bschichtmodelle\s*:|\bMODELLE_FELD\b/.test(readFileSync(path.join(wurzel, r), "utf8")));
    expect(treffer.sort()).toEqual([...MODELL_ERLAUBT].sort());
  });
});
