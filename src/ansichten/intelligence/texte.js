/* ==========================================================================
   INTELLIGENCE-OBERFLÄCHE — TEXTE (WP-I17)

   Alle Texte der Intelligence-Oberfläche an einer Stelle. Entwurfstexte:
   die Fassung ist nicht mit Produkt und Mitbestimmung abgestimmt
   (docs/acc45/wpI-offene-fragen.md). Sie nennen nie Token, Preise, Modellnamen
   oder Anbieter (Spez. 7.4: „Der Kunde sieht nie Token, Dollar oder Modellnamen“).
   ========================================================================== */

export const KI_KENNZEICHNUNG = "KI-Entwurf";

export const KI_TEXTE = Object.freeze({
  kennzeichnung: KI_KENNZEICHNUNG,
  nichtVeroeffentlicht: "Nicht veröffentlicht",
  hinweis: "Von Intelligence erstellt und automatisch geprüft. Das ist ein Vorschlag, kein Beschluss: Bitte selbst prüfen, bevor etwas übernommen wird.",
  laedt: "Intelligence arbeitet …",
  leer: "Dazu liegt gerade kein Vorschlag vor.",
  rueckfall: "Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar. Die Planung funktioniert unverändert.",
  fehler: "Das hat gerade nicht geklappt. Die Planung funktioniert unverändert.",
  unbekannteAntwort: "Die Antwort konnte nicht angezeigt werden. Die Planung funktioniert unverändert.",
  person: "(Person)",
  einheit: "(Bereich)",
  objekt: "(Objekt)",
  dienst: "(Dienst)",
});

/** Fehlercodes des Gateways → Text. Unbekannte Codes zeigen den allgemeinen Fehlertext (nie den Code selbst). */
export const KI_FEHLERTEXTE = Object.freeze({
  KI_AUS: "Intelligence ist ausgeschaltet.",
  KI_PAUSIERT: "Intelligence ist für diesen Betrieb nicht freigeschaltet.",
  KI_FUNKTION: "Diese Funktion ist nicht freigeschaltet.",
  KI_ROLLE: "Diese Funktion steht für deine Rolle nicht zur Verfügung.",
  KI_LIMIT: "Kurze Pause – du hast in der letzten Zeit sehr viele Vorschläge abgerufen. Gleich geht es weiter.",
  KI_KONTINGENT: "Neue Intelligence-Aktionen sind für diesen Betrieb gerade pausiert.",
  KI_GROESSE: "Die Anfrage ist zu groß. Bitte den Zeitraum verkleinern.",
  KI_EINGABE: "Die Anfrage konnte nicht verarbeitet werden. Bitte die Eingabe prüfen.",
  KI_LECK: "Die Anfrage enthält Angaben, die nicht an Intelligence übermittelt werden dürfen.",
});

export const kiFehlerText = (code) => (typeof code === "string" && Object.prototype.hasOwnProperty.call(KI_FEHLERTEXTE, code)
  ? KI_FEHLERTEXTE[code] : KI_TEXTE.fehler);
