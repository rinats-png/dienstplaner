/* ==========================================================================
   RECHTE — serverseitig

   Bis hierher gab es eine sorgfältige Rechteprüfung in der Oberfläche und
   keine auf dem Server. Das ist der gefährlichste Zustand, den ein
   Mehrbenutzersystem haben kann: Es sieht aus, als sei es geschützt.

   Was im Browser läuft, gehört dem Browser. Wer die Anwendung umgeht und
   unmittelbar gegen /api/bestand arbeitet, hat mit einer Zeile den ganzen
   Betrieb — lesend wie schreibend. Diese Datei ist die zweite, echte Prüfung.

   Sie spiegelt MATRIX_STD aus src/App.jsx. Weichen beide voneinander ab,
   gilt diese Datei: Die Oberfläche darf weniger zeigen als der Server
   erlaubt, niemals mehr.
   ========================================================================== */

/* Die Rechtetabelle. Wortgleich zu MATRIX_STD in src/App.jsx — Änderungen
   dort müssen hier nachgezogen werden. */
const ALLE_RECHTE = [
  "plan.view.own", "plan.view.unit", "plan.view.all", "plan.edit.unit",
  "plan.edit.all", "pattern.edit", "shift.edit",
  "req.create", "req.approve.unit", "req.approve.all",
  "staff.view", "staff.edit", "account.view.own", "account.view.all",
  "org.edit", "roles.assign", "billing.view", "audit.view", "export.data",
];

export const MATRIX = {
  leitung: [...ALLE_RECHTE],
  planer: ALLE_RECHTE.filter((r) => !["org.edit", "roles.assign", "billing.view"].includes(r)),
  subplaner: ["plan.view.own", "plan.view.unit", "plan.edit.unit", "req.create",
    "req.approve.unit", "staff.view", "account.view.own", "account.view.all"],
  mitarbeiter: ["plan.view.own", "plan.view.unit", "req.create", "account.view.own"],
  betriebsrat: ["plan.view.own", "plan.view.unit", "plan.view.all", "staff.view",
    "audit.view", "export.data"],
  /* Ein eigener Datenraum zum freien Ausprobieren — dort gibt es keine
     zweite Person, vor der etwas zu schützen wäre. */
  kunde: [...ALLE_RECHTE],
};

export function darf(rolle, recht) {
  const rechte = MATRIX[rolle] || [];
  if (!rechte.includes(recht)) return false;
  /* Derselbe Riegel wie in der Oberfläche: Der Betriebsrat prüft, er ändert
     nicht. Auch dann nicht, wenn ihm jemand versehentlich ein Änderungsrecht
     in die Tabelle schreibt. */
  if (rolle === "betriebsrat" && /\.(edit|approve|assign)/.test(recht)) return false;
  return true;
}

/* --------------------------------------------------------------------------
   SCHREIBUMFANG

   Drei Stufen statt eines Ja/Nein. Der Unterschied zwischen „darf gar nicht
   schreiben" und „darf den eigenen Urlaubsantrag stellen" ist der Grund,
   warum es diese Datei überhaupt braucht.
   -------------------------------------------------------------------------- */

export const SCHREIBEN_VOLL = "voll";
export const SCHREIBEN_EIGENES = "eigenes";
export const SCHREIBEN_NEIN = "nein";

export function schreibumfang(rolle) {
  if (rolle === "leitung" || rolle === "planer" || rolle === "kunde") return SCHREIBEN_VOLL;
  if (rolle === "subplaner") return SCHREIBEN_VOLL;
  if (rolle === "mitarbeiter") return SCHREIBEN_EIGENES;
  return SCHREIBEN_NEIN;
}

/* Was eine beschäftigte Person am Betrieb ändern darf: ihre eigenen
   Anliegen. Alles andere — Personal, Dienstarten, Schichtfolge, Freigaben —
   bleibt unberührt, auch wenn es mitgeschickt wird. */
const EIGENE_FELDER = ["anfragen", "erfassung", "nachrichten", "wuensche",
  "einspruenge", "urlaubsrunde"];

/* Felder des Gesamtbestands, die jede Rolle setzen darf: der Zählerstand
   und die Sitzungsmarke der Oberfläche. */
const BESTAND_FELDER = ["stand", "session", "version"];

/* --------------------------------------------------------------------------
   LESEN — was verlässt den Server?

   Ohne Filter bekommt eine Pflegekraft beim Öffnen der Telefonansicht die
   vollständigen Stammdaten aller Kolleginnen: Anschrift, Geburtsdatum,
   Notfallkontakt, Krankheitszeiten mit Grund. Nichts davon braucht sie, um
   den eigenen Dienstplan zu sehen.
   -------------------------------------------------------------------------- */

/* Persönliche Angaben, die für fremde Personen nichts in der Antwort zu
   suchen haben. Name und Funktion bleiben — ohne sie ist kein Plan lesbar. */
const PERSON_PRIVAT = ["email", "telefon", "mobil", "anschrift", "geburtstag",
  "geburtsdatum", "iban", "steuerId", "sozialversicherung", "notfall",
  "notfallkontakt", "notizen", "personalnummer", "einschraenkungen",
  "lohn", "gehalt", "zuschlaege"];

function personSaeubern(p) {
  const rein = { ...p };
  for (const feld of PERSON_PRIVAT) delete rein[feld];
  return rein;
}

/* Eine Abwesenheit bleibt sichtbar — sonst stimmt die Besetzung nicht.
   Der Grund verschwindet: Dass jemand fehlt, ist Betriebswissen. Warum
   jemand fehlt, ist eine Gesundheitsangabe nach Artikel 9 DSGVO. */
function abwesenheitSaeubern(a) {
  const rein = { ...a };
  delete rein.grund;
  delete rein.bemerkung;
  delete rein.diagnose;
  delete rein.nachweis;
  if (rein.art && rein.art !== "urlaub" && rein.art !== "frei") rein.art = "abwesend";
  return rein;
}

/**
 * Baut die Antwort für eine Rolle.
 *
 * Wichtig für den Schreibpfad: Was hier entfernt wird, darf nie über einen
 * späteren PUT zurückgeschrieben werden — sonst löscht die Oberfläche der
 * beschäftigten Person beim ersten Speichern die Stammdaten aller anderen.
 * Deshalb schreibt `zusammenfuehren` unten immer auf den gespeicherten
 * Stand, nicht auf den übermittelten.
 */
export function bestandFuerRolle(bestand, sitzung) {
  if (!bestand || typeof bestand !== "object") return bestand;
  const rolle = sitzung.rolle || "kunde";
  if (rolle === "betreiber") return bestand;

  const kopie = { ...bestand };

  /* Betreiberdaten haben in keiner Kundenantwort etwas verloren: Umsätze,
     Rechnungen, Tarife und das Protokoll aller Mandanten. */
  delete kopie.betreiber;
  delete kopie.rechnungen;
  delete kopie.tarife;
  delete kopie.protokoll;

  const eigener = eigenerMandant(bestand, sitzung);
  if (!Array.isArray(bestand.mandanten) || !eigener) return kopie;

  /* Nur der eigene Betrieb. Die Oberfläche sucht über session.mandantId,
     nicht über den Index — das Kürzen der Liste bricht sie also nicht. */
  let m = { ...eigener };

  if (rolle === "mitarbeiter" || rolle === "betriebsrat") {
    const ich = sitzung.person;
    if (Array.isArray(m.personen)) {
      m.personen = m.personen.map((p) =>
        (ich !== null && ich !== undefined && p.id === ich) ? p : personSaeubern(p));
    }
    if (Array.isArray(m.abwesenheiten)) {
      m.abwesenheiten = m.abwesenheiten.map((a) =>
        (ich !== null && ich !== undefined && a.personId === ich) ? a : abwesenheitSaeubern(a));
    }
    /* Das Betriebsprotokoll führt nach, wer wann was geändert hat. Für die
       Prüfrolle ist das der Kern der Aufgabe, für alle anderen nicht. */
    if (rolle === "mitarbeiter") {
      delete m.protokoll;
      delete m.aenderungen;
    }
  }

  kopie.mandanten = [m];
  return kopie;
}

/** Den Betrieb finden, auf den die Sitzung zeigt. */
export function eigenerMandant(bestand, sitzung) {
  if (!bestand || !Array.isArray(bestand.mandanten) || !bestand.mandanten.length) return null;
  const i = Number(sitzung.betrieb);
  if (Number.isInteger(i) && i >= 0 && i < bestand.mandanten.length) return bestand.mandanten[i];
  return bestand.mandanten[0];
}

/* --------------------------------------------------------------------------
   SCHREIBEN — was darf zurück?

   Der Kniff: Statt den übermittelten Bestand zu prüfen und bei einem
   Verstoß abzulehnen, wird er gar nicht erst übernommen. Der gespeicherte
   Stand ist die Grundlage, und aus der Übermittlung wandern nur die
   erlaubten Felder hinein.

   Das ist strenger als eine Prüfung und zugleich freundlicher: Eine
   Oberfläche, die versehentlich zu viel mitschickt, verursacht keinen
   Fehler — der Überschuss wird schlicht verworfen.
   -------------------------------------------------------------------------- */

export function zusammenfuehren(gespeichert, uebermittelt, sitzung) {
  const rolle = sitzung.rolle || "kunde";
  const umfang = schreibumfang(rolle);
  if (umfang === SCHREIBEN_NEIN) return null;
  if (umfang === SCHREIBEN_VOLL) return uebermittelt;

  /* Ab hier: eingeschränktes Schreiben. Ohne gespeicherten Stand gibt es
     nichts, worauf sich zusammenführen ließe. */
  if (!gespeichert || typeof gespeichert !== "object") return null;
  if (!uebermittelt || typeof uebermittelt !== "object") return null;

  const neu = { ...gespeichert };
  for (const feld of BESTAND_FELDER) {
    if (Object.prototype.hasOwnProperty.call(uebermittelt, feld)) neu[feld] = uebermittelt[feld];
  }

  const alt = eigenerMandant(gespeichert, sitzung);
  if (!alt) return neu;

  /* Der übermittelte Betrieb wird über seine Kennung gesucht, nicht über
     den Index — die Oberfläche hat die Liste unter Umständen gekürzt
     bekommen (siehe bestandFuerRolle). */
  const geschickt = Array.isArray(uebermittelt.mandanten)
    ? uebermittelt.mandanten.find((x) => x && x.id === alt.id)
    : null;
  if (!geschickt) return neu;

  const zusammen = { ...alt };
  for (const feld of EIGENE_FELDER) {
    if (Object.prototype.hasOwnProperty.call(geschickt, feld)) zusammen[feld] = geschickt[feld];
  }

  /* Die eigene Person darf sich selbst pflegen — Telefonnummer, Wünsche,
     Mitteilungseinstellungen. Fremde Personen bleiben unberührt. */
  const ich = sitzung.person;
  if (Array.isArray(alt.personen) && ich !== null && ich !== undefined
      && Array.isArray(geschickt.personen)) {
    const meineNeu = geschickt.personen.find((p) => p && p.id === ich);
    if (meineNeu) {
      zusammen.personen = alt.personen.map((p) => {
        if (p.id !== ich) return p;
        /* Rolle, Bereich und Status bleiben, wie sie sind — sonst
           befördert sich jede beschäftigte Person selbst zur Leitung. */
        return { ...meineNeu, rolle: p.rolle, rolleSeit: p.rolleSeit,
          rolleVerlauf: p.rolleVerlauf, bereich: p.bereich, status: p.status,
          zugehoerigkeit: p.zugehoerigkeit, eintritt: p.eintritt, austritt: p.austritt,
          wochenstunden: p.wochenstunden, urlaubsanspruch: p.urlaubsanspruch };
      });
    }
  }

  neu.mandanten = gespeichert.mandanten.map((x) => (x && x.id === alt.id ? zusammen : x));
  return neu;
}

/** Klartext für die Absage — der Aufrufer soll wissen, woran es lag. */
export function absageText(rolle) {
  if (rolle === "betriebsrat")
    return "Der Betriebsratszugang ist ein reiner Prüfzugang. Änderungen sind darüber nicht möglich.";
  if (rolle === "mitarbeiter")
    return "Über diesen Zugang lassen sich nur eigene Anträge und Zeiten ändern.";
  return "Für diese Änderung fehlt die Berechtigung.";
}
