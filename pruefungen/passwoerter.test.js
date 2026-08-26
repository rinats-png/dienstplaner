/* ==========================================================================
   PASSWÖRTER — Regel und Ablage

   Die Regel ist Länge plus Sperrliste, keine Zeichenklassen. Geprüft wird
   deshalb beides: dass eine lange Wortfolge ohne Ziffer durchkommt und
   dass „Sommer2026!!" trotz erfüllter Klassen scheitert. Die Ablage muss
   ein falsches Passwort, ein fremdes Format und einen leeren Eintrag
   gleichermaßen ablehnen — und ein richtiges nach dem Umweg über die
   Zeichenkette wiedererkennen.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { pruefeRegel, passwortAblegen, passwortPruefen }
  from "../netlify/lib/passwoerter.mjs";

describe("Die Regel", () => {
  it("lässt eine lange Wortfolge ohne Ziffer und Sonderzeichen durch", () => {
    expect(pruefeRegel("pflegeplan dienstag ruhezeit").ok).toBe(true);
  });
  it("weist unter zwölf Zeichen ab", () => {
    expect(pruefeRegel("Kurz123!").ok).toBe(false);
  });
  it("weist Ratelisten-Passwörter ab, auch mit erfüllten Klassen", () => {
    expect(pruefeRegel("Sommer2026!!").ok).toBe(false);
    expect(pruefeRegel("Willkommen2025").ok).toBe(false);
  });
  it("weist den Produktnamen ab", () => {
    expect(pruefeRegel("centric ist super 24").ok).toBe(false);
  });
  it("weist Betriebsname und Adressteil ab", () => {
    const verboten = ["Pflegeheim Sonnenhof", "m.mustermann"];
    expect(pruefeRegel("PflegeheimSonnenhof19", verboten).ok).toBe(false);
    expect(pruefeRegel("m-mustermann-privat24", verboten).ok).toBe(false);
    expect(pruefeRegel("drei worte reichen hier", verboten).ok).toBe(true);
  });
  it("lässt sehr kurze Verbotswörter nicht zum Generalverbot werden", () => {
    /* „ab" steckt in fast jedem Satz — unter vier Zeichen zählt es nicht. */
    expect(pruefeRegel("abendrot über dem hafen", ["ab"]).ok).toBe(true);
  });
});

describe("Die Ablage", () => {
  it("erkennt das richtige Passwort wieder und nur dieses", async () => {
    const ablage = await passwortAblegen("pflegeplan dienstag ruhezeit");
    expect(ablage.startsWith("s1$")).toBe(true);
    expect(await passwortPruefen("pflegeplan dienstag ruhezeit", ablage)).toBe(true);
    expect(await passwortPruefen("pflegeplan dienstag ruhezeiT", ablage)).toBe(false);
  });
  it("erzeugt für dasselbe Passwort verschiedene Ablagen (Salz)", async () => {
    const a = await passwortAblegen("ein und dasselbe passwort");
    const b = await passwortAblegen("ein und dasselbe passwort");
    expect(a).not.toBe(b);
    expect(await passwortPruefen("ein und dasselbe passwort", a)).toBe(true);
    expect(await passwortPruefen("ein und dasselbe passwort", b)).toBe(true);
  });
  it("lehnt leere und fremde Ablagen ab, statt zu werfen", async () => {
    expect(await passwortPruefen("egal was hier steht", "")).toBe(false);
    expect(await passwortPruefen("egal was hier steht", null)).toBe(false);
    expect(await passwortPruefen("egal was hier steht", "p1:abcdef")).toBe(false);
    expect(await passwortPruefen("egal was hier steht", "s1$kaputt")).toBe(false);
  });
});
