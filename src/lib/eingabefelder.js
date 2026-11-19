/* ==========================================================================
   EINGABEFELDER FÜR GEHEIMNISSE IN DER BETREIBERKONSOLE (SI-P4, wie WR-6)

   Ziel: Passwortverwalter, Autokorrektur und Rechtschreibprüfung sollen mit
   Zugangscodes, Codes aus der App und Wiederherstellungscodes nichts tun.
   Wie in src/verlustweg.jsx tragen die Felder deshalb weder name noch id und
   die Hinweise für gängige Passwortverwalter. Werte gehen nie in die Adresse
   oder in ein Protokoll.

   VERWALTER_HINWEISE  data-lpignore, data-1p-ignore, data-bwignore, data-form-type
   CODEFELD            Code aus der App ODER Wiederherstellungscode (16 Zeichen
                       A-Z/2-9): autoComplete one-time-code, inputMode text —
                       ein Zifferntastenfeld ließe den Wiederherstellungscode
                       gar nicht zu.
   AUSWEISFELD         langlebiges Geheimnis (Betreibercode, Verwalterschlüssel):
                       verdeckt; new-password, weil Passwortverwalter
                       autocomplete="off" auf Passwortfeldern ignorieren und
                       sonst ein gespeichertes fremdes Passwort einsetzten.
   ========================================================================== */

export const VERWALTER_HINWEISE = Object.freeze({
  "data-lpignore": "true", "data-1p-ignore": "true", "data-bwignore": "true", "data-form-type": "other",
});

const KEINE_HILFEN = { autoCorrect: "off", autoCapitalize: "off", spellCheck: false };

export const CODEFELD = Object.freeze({
  autoComplete: "one-time-code", inputMode: "text", ...KEINE_HILFEN, ...VERWALTER_HINWEISE,
});

export const AUSWEISFELD = Object.freeze({
  type: "password", autoComplete: "new-password", ...KEINE_HILFEN, ...VERWALTER_HINWEISE,
});
