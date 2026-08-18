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

import { RANG, pruefeRollenwechsel } from "./rollenvergabe.mjs";

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
export const SCHREIBEN_EINHEIT = "einheit";
export const SCHREIBEN_EIGENES = "eigenes";
export const SCHREIBEN_BETREIBER = "betreiber";
export const SCHREIBEN_NEIN = "nein";

export function schreibumfang(rolle) {
  if (rolle === "leitung" || rolle === "planer" || rolle === "kunde") return SCHREIBEN_VOLL;
  /* Die Rolle heißt „nur der eigene Wohnbereich" — bis hierher galt das nur
     in der Oberfläche, der Server ließ betriebsweit schreiben. */
  if (rolle === "subplaner") return SCHREIBEN_EINHEIT;
  if (rolle === "mitarbeiter") return SCHREIBEN_EIGENES;
  /* Der Betreiber fiel bis hierher auf SCHREIBEN_NEIN durch. Die
     Betreiberkonsole zeigte damit Felder, die sich bedienen ließen und die
     der Server jedes Mal abwies: Tarif ändern, Status setzen, Rechnung
     stellen, Mandant anlegen — jedes Mal „Diese Änderung ist mit deiner
     Rolle nicht zulässig". Die ganze Konsole war eine Anzeige.

     Er bekommt einen eigenen Umfang statt SCHREIBEN_VOLL, weil das
     Gegenteil ebenso falsch wäre: Wer Software verkauft, hat in den
     Dienstplänen und Personalakten seiner Kunden nichts zu suchen. Das ist
     keine Vorsicht, sondern die Zusage aus § 3 des AV-Vertrags. */
  if (rolle === "betreiber") return SCHREIBEN_BETREIBER;
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

/* Was dem Betreiber gehört: sein eigener Firmenstamm, die Tarifliste, der
   Rechnungsausgang, sein Protokoll. Nichts davon steht in einem Betrieb. */
const BETREIBER_FELDER = ["betreiber", "tarife", "rechnungen", "protokoll",
  "pakete", "adressaenderungen", "selbststarts"];

/* Und was er an einem Betrieb ändern darf: alles Kaufmännische, nichts
   Betriebliches.

   Die Grenze verläuft nicht willkürlich. Links davon steht, was im Vertrag
   zwischen ihm und dem Kunden geregelt ist — Preis, Laufzeit, Status,
   Rechnungsanschrift. Rechts davon steht, was dem Kunden gehört: Personal,
   Dienstarten, Schichtfolge, Pläne, Abwesenheiten, Nachrichten. Auf die
   rechte Seite kommt der Betreiber über diesen Weg nicht, auch wenn seine
   Oberfläche sie mitschickt. */
const KAUFMAENNISCHE_FELDER = ["name", "branche", "status", "tarif", "seit",
  "bis", "stichtag", "testTage", "rabattGrund", "preisgestaltung", "pakete",
  "kontakt", "kontaktName", "anschrift", "ustId", "notiz", "einheitLabel",
  /* Die Rollenbezeichnungen darf auch der Betreiber setzen — beim
     Einrichten eines Hauses ist er derjenige, der weiß, ob dort
     Stationsleitung oder Wohnbereichsleitung gesagt wird. */
  "rollennamen"];

/* Und die Gegenrichtung: Was ein Betrieb an sich selbst *nicht* ändern darf.

   Die Organisationsleitung hat billing.view und bekommt deshalb Tarif,
   Status und Preisgestaltung ausgeliefert — sie soll die eigenen Kosten
   einsehen können. Unter SCHREIBEN_VOLL durfte sie bis hierher alles
   zurückschreiben, was sie bekommen hat. Ein Kunde konnte sich damit auf
   „Testphase" setzen, sich einen Sonderpreis von null geben oder die
   kostenlose Zeit um ein Jahr verlängern — ein Aufruf genügte.

   Das ist keine Änderung an seinem Betrieb, sondern am Vertrag. Verträge
   ändert der Betreiber.

   Name, Anschrift und Ansprechpartner stehen bewusst nicht hier: Die darf
   ein Betrieb pflegen, sie kosten nichts. */
const VERTRAGSFELDER = ["status", "tarif", "seit", "bis", "stichtag",
  "testTage", "rabattGrund", "preisgestaltung", "pakete"];

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

  /* Kaufmännisches nur für Rollen, die es sehen dürfen.

     Die Organisationsleitung hat billing.view — sie soll die Kosten ihres
     Betriebs einsehen können, und dafür braucht die Rechnungsansicht auch
     die Angaben des Anbieters. Planung, Schichtverantwortung, Beschäftigte
     und Betriebsrat haben mit Rechnungen nichts zu tun. */
  if (!darf(rolle, "billing.view")) {
    delete kopie.betreiber;
    delete kopie.rechnungen;
    delete kopie.tarife;
  }
  /* Das Protokoll über alle Mandanten hinweg gehört niemandem außer dem
     Betreiber — das betriebseigene Protokoll steht im Mandanten. */
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

/* Felder, die bestandFuerRolle je nach Rolle entfernt. Was beim Lesen nicht
   mitkommt, darf beim Schreiben nicht verschwinden — sonst löscht jeder
   Speichervorgang genau das, was die Rolle nie zu Gesicht bekam.

   Das war ein echter Fehler: Seit der Einführung der Leseschicht entfernte
   jeder Schreibvorgang der Leitung das betriebsweite Protokoll, weil es in
   ihrer Antwort nicht enthalten war. Aufgefallen ist es erst, als die
   Zerlegung nach Monaten daraus Scheinkonflikte machte — zwei Planer
   „änderten" beide den Kern, obwohl keiner ihn angefasst hatte. */
const GEFILTERTE_FELDER = ["betreiber", "rechnungen", "tarife", "protokoll"];

function verlorenesZurueck(gespeichert, uebermittelt) {
  if (!gespeichert || typeof gespeichert !== "object") return uebermittelt;
  if (!uebermittelt || typeof uebermittelt !== "object") return uebermittelt;
  const aus = { ...uebermittelt };
  for (const feld of GEFILTERTE_FELDER) {
    if (!(feld in uebermittelt) && feld in gespeichert) aus[feld] = gespeichert[feld];
  }
  /* Dasselbe je Betrieb: mitarbeiter und betriebsrat bekommen protokoll und
     aenderungen nicht — die dürfen ihnen nicht abhandenkommen. */
  if (Array.isArray(aus.mandanten) && Array.isArray(gespeichert.mandanten)) {
    aus.mandanten = aus.mandanten.map((m) => {
      if (!m || !m.id) return m;
      const alt = gespeichert.mandanten.find((x) => x && x.id === m.id);
      if (!alt) return m;
      const zusammen = { ...m };
      for (const feld of ["protokoll", "aenderungen"]) {
        if (!(feld in m) && feld in alt) zusammen[feld] = alt[feld];
      }
      /* Vertragsfelder gehen immer auf den gespeicherten Stand zurück —
         nicht nur, wenn sie fehlen. Ein Betrieb bekommt sie zu sehen, aber
         ändern darf sie nur der Betreiber, und der nimmt diesen Weg nicht. */
      for (const feld of VERTRAGSFELDER) {
        if (feld in alt) zusammen[feld] = alt[feld];
        else delete zusammen[feld];
      }
      return zusammen;
    });
    /* Betriebe, die der Rolle nicht ausgeliefert wurden, bleiben bestehen. */
    for (const alt of gespeichert.mandanten) {
      if (alt && alt.id && !aus.mandanten.some((m) => m && m.id === alt.id))
        aus.mandanten.push(alt);
    }
  }
  return aus;
}

/* Wer Rollen vergibt, tut das über den gewöhnlichen Schreibweg: Die
   Oberfläche schickt den Betrieb mit geänderter `rolle` an einer Person.
   Der Server muss die Änderung deshalb selbst finden.

   Eine generische Kundenrolle zählt als Leitung — sie hat denselben
   Schreibumfang und soll darum auch dieselbe Vergabehöhe haben, nicht
   mehr. */
function rollenwechselErlaubt(gespeichert, uebermittelt, sitzung) {
  const rolle = sitzung.rolle === "kunde" ? "leitung" : sitzung.rolle;
  if (!RANG[rolle]) return { ok: true, grund: null };
  const alt = eigenerMandant(gespeichert, sitzung);
  const neu = eigenerMandant(uebermittelt, sitzung);
  /* Ohne beide Seiten gibt es keinen Wechsel zu erkennen — ein neu
     angelegter Betrieb bringt sein Personal mit und wird anderswo
     geprüft. */
  if (!alt || !neu) return { ok: true, grund: null };

  /* Der leere Betrieb ist der Sonderfall, an dem die Regel sonst zerbricht.

     Ein selbst gestarteter Betrieb hat beim ersten Anmelden niemanden. Die
     Anwendung legt dann die Person an, die den Zugangscode in der Hand
     hält — mit der Rolle aus dem Code, also in aller Regel „leitung". Nach
     der Regel „niemand vergibt die eigene Rolle" wäre genau das verboten,
     und der Betrieb käme nie über den ersten Bildschirm hinaus. Beim
     Sichttest lief er prompt in „Keine Schreibberechtigung".

     Wo niemand ist, ist auch niemand zu schützen: Die erste Person darf
     die Rolle ihres Codes tragen. Ab der zweiten greift der Rang. */
  if (!Array.isArray(alt.personen) || alt.personen.length === 0)
    return { ok: true, grund: null };

  return pruefeRollenwechsel(alt.personen, neu.personen, rolle);
}

export function zusammenfuehren(gespeichert, uebermittelt, sitzung) {
  const rolle = sitzung.rolle || "kunde";
  const umfang = schreibumfang(rolle);
  if (umfang === SCHREIBEN_NEIN) return null;

  if (umfang === SCHREIBEN_VOLL) {
    const rw = rollenwechselErlaubt(gespeichert, uebermittelt, sitzung);
    if (!rw.ok) return { verweigert: rw.grund };
    return verlorenesZurueck(gespeichert, uebermittelt);
  }

  if (umfang === SCHREIBEN_EINHEIT) {
    const alt = eigenerMandant(gespeichert, sitzung);
    const neu = eigenerMandant(uebermittelt, sitzung);
    if (!alt || !neu) return uebermittelt;
    const urteil = einheitDarf(alt, neu, sitzung);
    if (!urteil.ok) return { verweigert: urteil.grund };
    const rw = rollenwechselErlaubt(gespeichert, uebermittelt, sitzung);
    if (!rw.ok) return { verweigert: rw.grund };
    return verlorenesZurueck(gespeichert, uebermittelt);
  }

  /* --------------------------- Der Betreiber ---------------------------
     Seine eigenen Felder ganz, an jedem Betrieb nur das Kaufmännische.

     Anlegen und Löschen eines Betriebs gehören ausdrücklich dazu: Ein neu
     angelegter Mandant wird vollständig übernommen — er stammt aus der
     Betreiberkonsole und hat noch keinen Inhalt, den man schützen müsste.
     Ein Betrieb, den die Oberfläche nicht mehr mitschickt, verschwindet.  */
  if (umfang === SCHREIBEN_BETREIBER) {
    if (!gespeichert || typeof gespeichert !== "object") return uebermittelt;
    if (!uebermittelt || typeof uebermittelt !== "object") return null;

    const aus = { ...gespeichert };
    for (const feld of [...BESTAND_FELDER, ...BETREIBER_FELDER]) {
      if (Object.prototype.hasOwnProperty.call(uebermittelt, feld)) aus[feld] = uebermittelt[feld];
    }

    const alteNachId = new Map((gespeichert.mandanten || [])
      .filter(Boolean).map((m) => [m.id, m]));
    aus.mandanten = (Array.isArray(uebermittelt.mandanten) ? uebermittelt.mandanten : [])
      .filter(Boolean)
      .map((geschickt) => {
        const alt = alteNachId.get(geschickt.id);
        if (!alt) return geschickt;               // neu angelegt
        const zusammen = { ...alt };
        for (const feld of KAUFMAENNISCHE_FELDER) {
          if (Object.prototype.hasOwnProperty.call(geschickt, feld))
            zusammen[feld] = geschickt[feld];
        }
        return zusammen;                          // alles Übrige bleibt, wie es war
      });
    return aus;
  }

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

/* --------------------------------------------------------------------------
   SCHREIBEN NUR IN DER EIGENEN EINHEIT

   Die Schichtverantwortung darf Einsätze ihres Wohnbereichs ändern, sonst
   nichts. Geprüft wird nicht die Absicht, sondern das Ergebnis: Welche
   Personen sind von der Änderung betroffen, und gehören die alle zur
   eigenen Einheit?

   Das ist genauer als eine Prüfung des Vorhabens und kommt ohne Vertrauen
   in die Oberfläche aus.
   -------------------------------------------------------------------------- */

/** Welcher Einheit gehört die Person an diesem Tag an? */
function einheitAm(person, datum) {
  const liste = (person.zugehoerigkeit || [])
    .filter((z) => !z.ab || z.ab <= datum)
    .sort((a, b) => String(a.ab || "").localeCompare(String(b.ab || "")));
  return liste.length ? liste[liste.length - 1].einheitId : (person.bereich || null);
}

/* Felder, deren Schlüssel die Form "personId|JJJJ-MM-TT" tragen. */
const TAGESFELDER = ["abweichungen", "erfassung", "einstempeln"];

/**
 * Welche Personen sind von der Änderung betroffen?
 * Vergleicht die tagesbezogenen Felder Schlüssel für Schlüssel.
 */
function betroffenePersonen(alt, neu) {
  const aus = new Set();
  for (const feld of TAGESFELDER) {
    const a = (alt || {})[feld] || {};
    const b = (neu || {})[feld] || {};
    const alle = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of alle) {
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      const pid = String(k).split("|")[0];
      if (pid) aus.add(pid);
    }
  }
  return aus;
}

/** Was außerhalb der Tagesfelder geändert wurde. */
function andereFelderGeaendert(alt, neu) {
  const aus = [];
  const alle = new Set([...Object.keys(alt || {}), ...Object.keys(neu || {})]);
  for (const feld of alle) {
    if (TAGESFELDER.includes(feld)) continue;
    if (JSON.stringify((alt || {})[feld]) !== JSON.stringify((neu || {})[feld])) aus.push(feld);
  }
  return aus;
}

/* Was die Schichtverantwortung außerhalb der Tagesfelder anfassen darf:
   Anliegen und Übergaben ihres Bereichs. Personal, Dienstarten,
   Schichtfolge und Regelwerk gehören der Leitung. */
const EINHEIT_FELDER = ["anfragen", "nachrichten", "dienstbuch", "einspruenge",
  "unterschreitungen", "aenderungen", "protokoll"];

/**
 * Prüft, ob eine einheitsgebundene Rolle diese Änderung vornehmen darf.
 * @returns {{ok: boolean, grund?: string}}
 */
export function einheitDarf(altM, neuM, sitzung) {
  if (!altM) return { ok: true };   // frischer Betrieb, nichts zu schützen

  /* Die Einheit steht an der Person, nicht am Zugangscode.

     Erst wurde sie aus dem Konto gelesen — das war falsch gedacht: Der Code
     wird einmal ausgegeben, die Zuordnung ändert sich mit jeder Versetzung.
     Maßgeblich ist, wo die Person heute steht. */
  const ich = (altM.personen || []).find((p) => String(p.id) === String(sitzung.person));
  const eigene = sitzung.einheit
    || (ich && ich.bereich && ich.bereich !== "ALLE" ? ich.bereich : null)
    || (ich ? einheitAm(ich, new Date().toISOString().slice(0, 10)) : null);

  if (ich && ich.bereich === "ALLE") return { ok: true };
  if (!eigene)
    return { ok: false,
      grund: "Diesem Zugang ist kein Bereich zugeordnet. Bitte die Leitung ansprechen." };

  const fremdeFelder = andereFelderGeaendert(altM, neuM)
    .filter((f) => !EINHEIT_FELDER.includes(f));
  if (fremdeFelder.length)
    return { ok: false,
      grund: `Änderungen an ${fremdeFelder.slice(0, 3).join(", ")} sind der Leitung vorbehalten.` };

  const personen = new Map((altM.personen || []).map((p) => [String(p.id), p]));
  for (const pid of betroffenePersonen(altM, neuM)) {
    const person = personen.get(pid);
    if (!person) return { ok: false, grund: "Eine geänderte Person gehört nicht zum Betrieb." };
    /* Die Einheit wird zum betroffenen Tag geprüft, nicht zu heute — eine
       Versetzung darf rückwirkende Einträge nicht plötzlich erlauben. */
    const tage = [...TAGESFELDER].flatMap((feld) => {
      const a = (altM || {})[feld] || {}, b = (neuM || {})[feld] || {};
      return [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((k) => String(k).split("|")[0] === pid
          && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
        .map((k) => String(k).split("|")[1]);
    }).filter(Boolean);
    for (const tag of tage) {
      if (einheitAm(person, tag) !== eigene)
        return { ok: false,
          grund: `${person.nachname || "Diese Person"} gehört am ${tag} nicht zu deinem Bereich.` };
    }
  }
  return { ok: true };
}

/** Klartext für die Absage — der Aufrufer soll wissen, woran es lag. */
export function absageText(rolle) {
  if (rolle === "subplaner")
    return "Über diesen Zugang lässt sich nur der eigene Bereich ändern.";
  if (rolle === "betriebsrat")
    return "Der Betriebsratszugang ist ein reiner Prüfzugang. Änderungen sind darüber nicht möglich.";
  if (rolle === "mitarbeiter")
    return "Über diesen Zugang lassen sich nur eigene Anträge und Zeiten ändern.";
  return "Für diese Änderung fehlt die Berechtigung.";
}
