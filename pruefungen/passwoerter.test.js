/* ==========================================================================
   PASSWÖRTER — Regel und Ablage

   Drei Dinge werden hier festgehalten, und alle drei lassen sich später
   nicht mehr nachrüsten, ohne jedes bestehende Passwort zu brechen:

     Die Normalform (NFC) — sonst ist dasselbe Passwort auf dem Telefon
     ein anderes als am Rechner.

     Kein Trim — Randleerzeichen gehören zum Geheimnis.

     Das Ablageformat mit Kennung und Kennwerten — sonst lässt sich der
     Aufwand später nicht anheben.

   Der scrypt-Lauf kostet Zeit; deshalb stehen die Ablageprüfungen in
   einem eigenen Block mit erhöhter Frist.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { passwortAblegen, passwortPruefen, pruefeRegel, veraltet, normalform,
  MINDESTLAENGE, HOECHSTLAENGE } from "../server/lib/passwoerter.mjs";

/* Dieselbe Bedeutung, zwei Schreibweisen: „café" mit fertigem é (U+00E9)
   und mit angehängtem Akzent (U+0065 U+0301). Was ein Gerät liefert,
   entscheidet die Tastatur. */
const E_FERTIG = "Café am Hafen 12";
const E_ZERLEGT = "Café am Hafen 12";

describe("Die Regel", () => {
  it("lässt eine lange Wortfolge ohne Ziffer und Sonderzeichen durch", () => {
    expect(pruefeRegel("drei kleine hunde am strand").ok).toBe(true);
    expect(pruefeRegel("nurkleinbuchstabenaberlang").ok).toBe(true);
  });

  it("verlangt keine Ziffer, kein Sonderzeichen, keinen Großbuchstaben", () => {
    expect(pruefeRegel("abcdefghijklmnop").ok).toBe(true);
  });

  it("weist unter zwölf Zeichen ab, nimmt genau zwölf an", () => {
    expect(pruefeRegel("elfzeichen1").ok).toBe(false);
    expect("elfzeichen1".length).toBe(11);
    expect(pruefeRegel("zwoelfzeich1").ok).toBe(true);
    expect("zwoelfzeich1".length).toBe(MINDESTLAENGE);
  });

  it("nimmt 200 Zeichen an und weist 201 ab", () => {
    expect(pruefeRegel("x".repeat(HOECHSTLAENGE)).ok).toBe(true);
    const zuLang = pruefeRegel("x".repeat(HOECHSTLAENGE + 1));
    expect(zuLang.ok).toBe(false);
    expect(zuLang.grund).toMatch(/200/);
  });

  it("zählt Zeichen, nicht Codepoints — beide Schreibweisen gleich lang", () => {
    /* E_ZERLEGT hat ein Codepoint mehr als E_FERTIG. Läge die Zählung auf
       .length, wäre die Mindestlänge von der Tastatur abhängig. */
    expect(E_ZERLEGT.length).toBeGreaterThan(E_FERTIG.length);
    expect([...normalform(E_ZERLEGT)].length).toBe([...normalform(E_FERTIG)].length);
  });

  it("weist Ratelisten-Passwörter ab, auch mit erfüllten Zeichenklassen", () => {
    expect(pruefeRegel("Sommer2026!!").ok).toBe(false);
    expect(pruefeRegel("passwort1234").ok).toBe(false);
    expect(pruefeRegel("Willkommen2026").ok).toBe(false);
  });

  it("weist den Produktnamen ab", () => {
    expect(pruefeRegel("centric-plan-2026").ok).toBe(false);
    expect(pruefeRegel("meinCENTRICzugang").ok).toBe(false);
  });

  it("weist Betriebsname und Adressteil ab", () => {
    const verboten = ["Pflegeheim Sonnenhof", "m.mueller"];
    expect(pruefeRegel("PflegeheimSonnenhof1", verboten).ok).toBe(false);
    expect(pruefeRegel("m.mueller-und-mehr", verboten).ok).toBe(false);
    expect(pruefeRegel("ganz etwas anderes hier", verboten).ok).toBe(true);
  });

  it("lässt sehr kurze Verbotswörter nicht zum Generalverbot werden", () => {
    /* „ab" käme in fast jedem Passwort vor; erst ab vier Zeichen zählt es. */
    expect(pruefeRegel("abendliche wanderung", ["ab", "x"]).ok).toBe(true);
  });

  it("wirft bei Unsinn nicht", () => {
    for (const x of [undefined, null, 12345, {}, []]) {
      expect(() => pruefeRegel(x)).not.toThrow();
      expect(pruefeRegel(x).ok).toBe(false);
    }
  });
});

describe("Die Ablage", () => {
  it("hat Verfahrenskennung und Kennwerte im Format", async () => {
    const a = await passwortAblegen("drei kleine hunde am strand");
    const teile = a.split("$");
    expect(teile).toHaveLength(6);
    expect(teile[0]).toBe("s1");
    expect(Number(teile[1])).toBe(32768);
    expect(Number(teile[2])).toBe(8);
    expect(Number(teile[3])).toBe(1);
    expect(Buffer.from(teile[4], "base64")).toHaveLength(16);   // Salz
    expect(Buffer.from(teile[5], "base64")).toHaveLength(32);   // Prüfwert
  }, 30000);

  it("enthält das Passwort nicht im Klartext", async () => {
    const klar = "einzigartige wortfolge hier";
    const a = await passwortAblegen(klar);
    expect(a).not.toContain(klar);
    expect(a.toLowerCase()).not.toContain("wortfolge");
  }, 30000);

  it("erkennt das richtige Passwort wieder und nur dieses", async () => {
    const a = await passwortAblegen("drei kleine hunde am strand");
    expect(await passwortPruefen("drei kleine hunde am strand", a)).toBe(true);
    expect(await passwortPruefen("drei kleine hunde am strane", a)).toBe(false);
    expect(await passwortPruefen("", a)).toBe(false);
  }, 60000);

  it("erzeugt für dasselbe Passwort verschiedene Ablagen (Salz)", async () => {
    const [a, b] = await Promise.all([
      passwortAblegen("dieselbe wortfolge hier"),
      passwortAblegen("dieselbe wortfolge hier"),
    ]);
    expect(a).not.toBe(b);
    expect(await passwortPruefen("dieselbe wortfolge hier", a)).toBe(true);
    expect(await passwortPruefen("dieselbe wortfolge hier", b)).toBe(true);
  }, 60000);

  it("lehnt leere und beschädigte Ablagen ab, statt zu werfen", async () => {
    for (const kaputt of ["", null, undefined, "s1", "s1$$$$", "s2$32768$8$1$AAAA$BBBB",
      "s1$0$8$1$AAAA$BBBB", "s1$32768$8$1$$", "völliger unsinn", "$$$$$"]) {
      expect(await passwortPruefen("drei kleine hunde am strand", kaputt),
        String(kaputt)).toBe(false);
    }
  }, 60000);

  it("erkennt veraltete Kennwerte", async () => {
    const a = await passwortAblegen("drei kleine hunde am strand");
    expect(veraltet(a)).toBe(false);
    expect(veraltet("s1$16384$8$1$AAAA$BBBB")).toBe(true);
    expect(veraltet("s0$32768$8$1$AAAA$BBBB")).toBe(true);
    expect(veraltet("")).toBe(true);
  }, 30000);
});

describe("NFC — dieselbe Bedeutung, zwei Schreibweisen", () => {
  it("normalisiert beide Formen auf dieselbe Zeichenkette", () => {
    expect(normalform(E_ZERLEGT)).toBe(normalform(E_FERTIG));
    expect(E_ZERLEGT).not.toBe(E_FERTIG);           // roh verschieden
  });

  it("erkennt ein Passwort wieder, das in der anderen Form eingegeben wird", async () => {
    const abgelegt = await passwortAblegen(E_FERTIG);
    expect(await passwortPruefen(E_ZERLEGT, abgelegt)).toBe(true);
    const andersHerum = await passwortAblegen(E_ZERLEGT);
    expect(await passwortPruefen(E_FERTIG, andersHerum)).toBe(true);
  }, 60000);

  it("beurteilt beide Formen in der Regel gleich", () => {
    expect(pruefeRegel(E_FERTIG).ok).toBe(pruefeRegel(E_ZERLEGT).ok);
  });
});

describe("Randleerzeichen gehören zum Passwort", () => {
  it("trimmt nicht — mit und ohne Leerzeichen sind verschiedene Passwörter", async () => {
    const mit = " drei kleine hunde am strand ";
    const ohne = "drei kleine hunde am strand";
    expect(normalform(mit)).toBe(mit);
    const abgelegt = await passwortAblegen(mit);
    expect(await passwortPruefen(mit, abgelegt)).toBe(true);
    expect(await passwortPruefen(ohne, abgelegt)).toBe(false);
  }, 60000);

  it("zählt Randleerzeichen zur Länge", () => {
    /* Zehn Zeichen plus zwei Leerzeichen erreichen die Mindestlänge. */
    expect(pruefeRegel(" zehnzeich ").ok).toBe(false);   // 11
    expect(pruefeRegel(" zehnzeiche ").ok).toBe(true);   // 12
  });
});

describe("Last: acht Hashvorgänge nebeneinander", () => {
  it("rechnet acht Passwörter parallel, ohne dass der Prozess kippt", async () => {
    const start = Date.now();
    const ergebnisse = await Promise.all(
      Array.from({ length: 8 }, (_, i) => passwortAblegen(`wortfolge nummer ${i} hier`)));
    const dauer = Date.now() - start;
    expect(ergebnisse).toHaveLength(8);
    for (const a of ergebnisse) expect(a.startsWith("s1$")).toBe(true);
    /* Alle acht verschieden — jeder hat sein eigenes Salz. */
    expect(new Set(ergebnisse).size).toBe(8);
    /* Kein Grenzwert als Zusicherung: Die Zahl steht hier, damit ein
       Ausreißer in der Ausgabe sichtbar wird, nicht als Bedingung.
       Der Rahmen ist großzügig, damit langsame Läufer nicht rot werden. */
    console.log(`  · acht scrypt-Vorgänge parallel: ${dauer} ms`);
    expect(dauer).toBeLessThan(120000);
  }, 180000);
});
