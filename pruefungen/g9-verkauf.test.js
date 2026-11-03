/* ==========================================================================
   G9 — Nichts verkaufen, was nicht nutzbar ist (WP-19.0b)

   Entscheidung G9 (WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03): Nicht nutzbare
   Funktionen werden weder als verfügbare Leistung beworben noch verkauft.
   Heute stehen alle zwölf Branchenmodule auf „geplant"; das Paket Industrie
   besteht nur aus solchen Merkmalen und darf deshalb nirgends einen Preis
   über 0 € erzeugen: nicht im Rechner der Website, nicht beim Selbststart
   (automatische Buchung), nicht in der Summe der Betreiberkonsole, nicht auf
   der Rechnung, nicht in der Vertragsübersicht.

   G10: Ein Betrieb, der ein Paket schon gebucht hat, verliert nichts.
   Preisliste (src/preisgestaltung.js) bleibt unberührt.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { STUFEN, stufeVon, PAKETE, paketkosten, preisFuer, paketeAngebot, buchbareAuswahl,
  paketNutzbar, merkmalNutzbar } from "../src/stufen.js";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { PAKET_MERKMALE, paketFuerNeubuchung, merkmaleInVorbereitung } from "../server/lib/paketstand.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { BRANCHEN } from "../server/lib/branchen.mjs";

const quelle = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ABNAHME = { datum: "2026-12-01", nachweis: "docs/acc45/abnahme-test.md" };
/** Registry, in der die genannten Module abgenommen sind (vorlaeufig mit Abnahme). */
const abgenommen = (...ids) => BRANCHENMODULE.map((m) =>
  ids.includes(m.id) ? { ...m, status: "vorlaeufig", abnahme: ABNAHME } : m);
const ALLE_ABGENOMMEN = abgenommen(...BRANCHENMODULE.map((m) => m.id));
const PAKET_IDS = ["sicherheit", "pflege", "klinik", "industrie"];

describe("G9: Registry-Stand bestimmt die Nutzbarkeit", () => {
  it("alle zwölf Module sind heute geplant; Industrie hat kein nutzbares Merkmal", () => {
    expect(BRANCHENMODULE.length).toBe(12);
    expect(BRANCHENMODULE.every((m) => m.status === "geplant")).toBe(true);
    expect(paketNutzbar("industrie")).toBe(false);
    expect(merkmaleInVorbereitung("industrie")).toEqual(["anlagen", "maschinenqual", "kontimodelle"]);
  });

  it("Sicherheit, Pflege, Klinik haben bestehende Merkmale und bleiben nutzbar (G10)", () => {
    for (const id of ["sicherheit", "pflege", "klinik"]) expect(paketNutzbar(id), id).toBe(true);
    expect(merkmalNutzbar("geofence")).toBe(true);
    expect(merkmalNutzbar("fachkraftquote")).toBe(true);
    expect(merkmalNutzbar("wachbuch")).toBe(false);
  });

  it("vorläufig ohne Abnahme-Nachweis zählt nicht (Statusvertrag pruefeModulStatus)", () => {
    const ohne = BRANCHENMODULE.map((m) => (m.id === "anlagen" ? { ...m, status: "vorlaeufig" } : m));
    expect(paketNutzbar("industrie", ohne)).toBe(false);
    expect(paketNutzbar("industrie", abgenommen("anlagen"))).toBe(true);
  });

  it("die Merkmale der Pakete in stufen.js sind die der Paketstand-Liste", () => {
    for (const p of PAKETE) expect([...p.merkmale], p.id).toEqual([...PAKET_MERKMALE[p.id]]);
  });
});

describe("G9: Kein Paket ohne nutzbares Merkmal erzeugt einen Preis > 0", () => {
  const stufen = STUFEN.map((s) => s.id);

  it("Rechner: Industrie lässt sich nicht kaufen, auch nicht per erzwungener Auswahl", () => {
    const a = paketeAngebot().find((p) => p.id === "industrie");
    expect(a).toMatchObject({ nutzbar: false, buchbar: false, aufpreis: null });
    expect(a.inVorbereitung.length).toBe(3);
    expect(buchbareAuswahl(["industrie", "pflege", "kern", "unbekannt"])).toEqual(["pflege"]);
    for (const sid of stufen) {
      const mit = preisFuer(stufeVon(sid), 1, [10], ["industrie"]);
      const ohne = preisFuer(stufeVon(sid), 1, [10], []);
      expect(mit.summePakete, sid).toBe(0);
      expect(mit.gesamt, sid).toBe(ohne.gesamt);
      expect(mit.pakete.zahlend).toEqual([]);
      expect(mit.pakete.frei).toEqual([]);
    }
  });

  it("für jede Registry-Lage gilt: Preis > 0 genau dann, wenn nutzbar", () => {
    const lagen = [BRANCHENMODULE, ALLE_ABGENOMMEN, abgenommen("anlagen"), abgenommen("posten"),
      abgenommen("kontimodelle", "wachbuch")];
    for (const liste of lagen) for (const id of PAKET_IDS) {
      const k = paketkosten([id], 0, liste);
      expect(k.summe > 0, id).toBe(paketNutzbar(id, liste));
      expect(preisFuer(stufeVon("basis"), 1, [10], [id], liste).summePakete > 0, id)
        .toBe(paketNutzbar(id, liste));
    }
    /* Der Rechenweg bleibt erhalten, sobald abgenommen: 59 € für Industrie. */
    expect(paketkosten(["industrie"], 0, abgenommen("anlagen")).summe).toBe(59);
  });

  it("ein nicht nutzbares Paket verbraucht keinen freien Enterprise-Platz", () => {
    const k = paketkosten(["industrie", "pflege", "klinik"], 2);
    expect(k.frei.map((p) => p.id)).toEqual(["klinik", "pflege"]);
    expect(k.summe).toBe(0);
    const k1 = paketkosten(["industrie", "pflege"], 1);
    expect(k1.frei.map((p) => p.id)).toEqual(["pflege"]);
    expect(k1.nichtBerechnet.map((p) => p.id)).toEqual(["industrie"]);
  });

  it("Preis teilweise geplanter Pakete bleibt unverändert (Betreiberentscheidung offen)", () => {
    expect(PAKETE.filter((p) => !p.pflicht).map((p) => [p.id, p.aufpreis]))
      .toEqual([["sicherheit", 79], ["pflege", 89], ["klinik", 129], ["industrie", 59]]);
    expect(paketkosten(["sicherheit"], 0).summe).toBe(79);
    expect(paketkosten(["pflege"], 0).summe).toBe(89);
    expect(paketkosten(["klinik"], 0).summe).toBe(129);
  });

  it("teilweise geplante Pakete zeigen „In Vorbereitung“ je Merkmal", () => {
    const an = Object.fromEntries(paketeAngebot().map((p) => [p.id, p]));
    expect(an.sicherheit.inVorbereitung).toEqual(expect.arrayContaining(["Wachbuch"]));
    expect(an.sicherheit.buchbar).toBe(true);
    expect(an.klinik.inVorbereitung.length).toBe(4);
    expect(an.pflege.inVorbereitung.length).toBe(2);
    const [werbung, vorb] = PAKETE.find((p) => p.id === "industrie").beschreibung.split("In Vorbereitung:");
    expect(werbung).not.toMatch(/Anlage|Kontischicht|Maschinen/);
    expect(vorb).toMatch(/Anlagenbindung/);
  });
});

describe("G9: Selbststart bucht nichts Unfertiges zu", () => {
  const betrieb = (branche) => baueLeerenBetrieb({ name: "Test GmbH", branche, email: "a@b.de", land: "HE", raum: "r1" })
    .mandanten[0].einstellungen;

  it("industrie, produktion, logistik: kein Paket zugebucht", () => {
    for (const b of ["industrie", "produktion", "logistik"]) expect(betrieb(b).pakete, b).toEqual([]);
  });

  it("alle Branchen, deren Paket keine nutzbare Funktion hat, starten ohne Paket", () => {
    for (const b of BRANCHEN) {
      const soll = b.paket && paketNutzbar(b.paket) ? [b.paket] : [];
      expect(betrieb(b.id).pakete, b.id).toEqual(soll);
    }
  });

  it("nutzbare Pakete werden weiter zugebucht (sicherheit, pflege, klinik)", () => {
    expect(betrieb("sicherheit").pakete).toEqual(["sicherheit"]);
    expect(betrieb("pflege").pakete).toEqual(["pflege"]);
    expect(betrieb("klinik").pakete).toEqual(["klinik"]);
  });

  it("sobald ein Modul abgenommen ist, wird das Paket wieder zugebucht", () => {
    expect(paketFuerNeubuchung("industrie")).toBeNull();
    expect(paketFuerNeubuchung("industrie", abgenommen("anlagen"))).toBe("industrie");
    expect(paketFuerNeubuchung(null)).toBeNull();
  });
});

describe("G9: Bestehende Betriebe verlieren nichts (G10)", () => {
  it("ein gebuchtes Paket Industrie bleibt in der Auswahl, wird nur nicht berechnet", () => {
    const k = paketkosten(["industrie"], 0);
    expect(k.gewaehlt.map((p) => p.id)).toEqual(["industrie"]);
    expect(k.nichtBerechnet.map((p) => p.id)).toEqual(["industrie"]);
    expect(k.summe).toBe(0);
  });

  it("Merkmalsprüfung `kann` und Registry bleiben unberührt: kein Merkmal wird gesperrt", () => {
    const app = quelle("../src/App.jsx");
    expect(app).toMatch(/const kann = \(m, merkmal\) => \{\s*const aktiv = \["kern", \.\.\.\(m\.pakete \|\| \[\]\)\];\s*return PAKETE\.filter\(\(p\) => aktiv\.includes\(p\.id\)\)\.some\(\(p\) => p\.merkmale\.includes\(merkmal\)\);/);
  });

  it("Preisliste preisgestaltung.js ist nicht Teil dieser Änderung", () => {
    expect(quelle("../src/preisgestaltung.js")).not.toMatch(/paketNutzbar|paketstand/);
  });
});

describe("G9: Oberflächen (Quelltext)", () => {
  const app = quelle("../src/App.jsx");
  const main = quelle("../src/main.jsx");
  const pruef = quelle("../src/pruefung.jsx");

  it("Website-Rechner: Auswahl aus paketeAngebot, Berechnung nur über buchbare Auswahl", () => {
    expect(main).toMatch(/paketeAngebot\(\)\.map/);
    expect(main).toMatch(/preisFuer\(s, planer, standorte, buchbareAuswahl\(pakete\)\)/);
    expect(main).toMatch(/disabled=\{!p\.buchbar\}/);
    expect(main).toMatch(/in Vorbereitung – nicht buchbar/);
    expect(main).not.toMatch(/\+\{p\.aufpreis\} €<\/span>\s*<\/label>/);
  });

  it("Selbststart-Texte bewerben kein Geplantes als verfügbar", () => {
    const zeilen = main.split("\n").filter((z) => /^\s*\["(sicherheit|pflege|klinik|industrie|sonstige)", "/.test(z));
    expect(zeilen.length).toBe(5);
    const [sich, , kli, ind] = zeilen;
    expect(sich).toMatch(/Wachbuch in Vorbereitung/);
    expect(kli).toMatch(/Bereitschaft, Rufbereitschaft, geteilte Dienste in Vorbereitung/);
    expect(ind).toMatch(/in Vorbereitung/);
    for (const z of [sich, kli, ind]) expect(z).not.toMatch(/Wachbuch"\]|, Wachbuch\"/);
  });

  it("Betreiberkonsole: keine Empfehlung, kein Schalter, keine Summe für Unfertiges", () => {
    expect(app).toMatch(/const empfohlen = nutzbar && paketeFuerBranche/);
    expect(app).toMatch(/\{!p\.pflicht && \(nutzbar \|\| an\) && \(/);
    expect(app).toMatch(/\(m\.pakete \|\| \[\]\)\.includes\(p\.id\) && paketNutzbar\(p\.id\)\)/);
    expect(app).toMatch(/\(an && !paketNutzbar\(paket\)\)/);
    expect(app).toMatch(/merkmalNutzbar\(x\) \? x : `\$\{x\} \(in Vorbereitung\)`/);
  });

  it("Rechnung und Vertragsübersicht rechnen Unfertiges mit 0 und nennen „in Vorbereitung“", () => {
    expect(app).toMatch(/paketeNichtBerechnet: paketkosten_\.nichtBerechnet/);
    expect(app).toMatch(/const nullEuro = frei \|\| vorb;/);
    expect(app).toMatch(/in Vorbereitung, nicht berechnet/);
    expect(app).toMatch(/paketNutzbar\(pk\.id\) \? eur\(pk\.aufpreis\) : eur\(0\)/);
  });

  it("Prüfanzeige (pruefung.jsx) führt keine eigene, veraltete Paketliste mehr", () => {
    expect(pruef).not.toMatch(/^const PAKETE = \[/m);
    expect(pruef).toMatch(/import \{ PAKETE, paketNutzbar \} from "\.\/stufen\.js"/);
    expect(pruef).toMatch(/filter\(\(p\) => paketNutzbar\(p\.id\)\)\.reduce/);
  });
});
