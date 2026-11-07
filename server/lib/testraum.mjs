/* ==========================================================================
   TESTRAUM — Mailversand aus Test- und Demoräumen begrenzen (SI-P3)

   Befund P3 der internen Sicherheitsprüfung 2026-11: In einem selbst
   angelegten Testbetrieb lassen sich Personen-E-Mails frei setzen und
   Mitteilungen über den Betreiberabsender verschicken. Das ist ein Weg für
   Spam und Phishing unter unserem Namen — die einzige Grenze war die
   Bremse `zustellen`.

   Regel (lib/versand.mjs, kanalZustellen, Kanal mail):
   - Ein Test- oder Demoraum verschickt standardmäßig KEINE Mail. Die
     Mitteilung gilt als „übersprungen“ mit Grund „testraum“; Push bleibt
     (Push geht nur an Geräte, die Personen des Raums selbst angemeldet
     haben — kein Relay an fremde Adressen).
   - Nur mit ausdrücklicher Freigabe des Betreibers
     (CENTRIC_TESTRAUM_MAIL=ja) gehen Mails hinaus — und dann höchstens
     CENTRIC_TESTRAUM_MAIL_TAG_MAX je Raum und Tag (Standard 20, 1 bis 1000).
     Darüber: übersprungen mit Grund „testraum-grenze“.

   Was als Test- oder Demoraum gilt — nur, was der Client nicht schreiben kann:
   - Raumkennung „t-…“ (nur /starten bildet sie, provisionierung.mjs) oder
     „demo-…“ (Demoräume, accounts.mjs/daten.mjs);
   - oder der Betrieb trägt selbstAngelegt === true (VERTRAGSFELDER in
     rechte.mjs: beim Zusammenführen immer der gespeicherte Stand).
   Bewusst NICHT status „test“: Jeder neu eingerichtete Betrieb startet so
   (leerbetrieb.mjs), auch ein Pilotkunde, den der Betreiber anlegt.
   ========================================================================== */

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** Ist dieser Raum (bzw. dieser Betrieb darin) ein Test- oder Demoraum? */
export function istTestOderDemoraum(raum, m) {
  const r = String(raum ?? "");
  if (r.startsWith("t-") || /^demo-/i.test(r)) return true;
  return istObjekt(m) && m.selbstAngelegt === true;
}

/** Freigabe für Mail aus Test- und Demoräumen. Alles außer „ja“ ist aus. */
export const testraumMailFrei = () => String(process.env.CENTRIC_TESTRAUM_MAIL || "").trim().toLowerCase() === "ja";

/** Tagesobergrenze je Raum bei Freigabe; CENTRIC_TESTRAUM_MAIL_TAG_MAX (1 bis 1000), sonst 20. */
export const testraumMailTagMax = () => {
  const w = Number(process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX);
  return Number.isInteger(w) && w >= 1 && w <= 1000 ? w : 20;
};
