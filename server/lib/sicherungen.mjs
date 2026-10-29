/* ==========================================================================
   SICHERUNGEN — betriebsbezogen anlegen, ausgeben und wiederherstellen

   Bis Oktober 2026 arbeiteten Sicherung, Vollausgabe und Wiederherstellung
   auf dem ganzen Raum. In einem Raum mit mehreren Betrieben hieß das: Die
   Leitung eines Betriebs lud die Rohdaten aller Betriebe herunter, und eine
   Wiederherstellung setzte alle Betriebe auf einen alten Stand zurück —
   samt Reihenfolge, Rollen, Vertragsfeldern und Protokollen. Sie ging an
   jeder Prüfung des Schreibwegs vorbei (rechte.mjs) und konnte damit mehr
   als ein gewöhnliches Speichern. Anlegen und Auflisten durfte jede Rolle,
   ohne Bremse; zwanzig Sicherungen einer Pflegekraft verdrängten jeden
   Wiederherstellungspunkt des Tages.

   Hier steht die reine Logik — ohne Speicher, damit sie sich prüfen lässt.
   Die Endpunkte stehen in server/funktionen/daten.mjs.
   ========================================================================== */

import { gespeicherterBetrieb, rollenwechselErlaubt, VERTRAGSFELDER, BETREIBERSTAMM } from "./rechte.mjs";
import { PERSONENFELDER, VOLL_PERSON, VOLL_BETRIEB } from "./sicht.mjs";

/* Wer Sicherungen seines Betriebs anlegen und sehen darf. Die Leitung
   verwaltet den Betrieb; `kunde` ist der eigene Probierraum mit allen
   Rechten, und die Datenschutzansicht bietet dort vor dem Löschlauf
   „Vorher sichern" an. Planung, Schichtverantwortung, Beschäftigte und
   Betriebsrat nicht. */
export const SICHERUNG_ROLLEN = ["leitung", "kunde"];

/* Wer zurückspielen darf: nur die Leitung. Es gibt dafür keine Oberfläche;
   die Wiederherstellung ist der schwerste Eingriff in einen Betrieb. */
export const WIEDERHERSTELLEN_ROLLEN = ["leitung"];

/* Zustellwege und Geheimnisse einer Person kommen nie aus einer Sicherung
   zurück: Ein rotiertes Kalender-Geheimnis oder eine erneuerte
   Push-Anmeldung darf nicht auf einen alten, womöglich bekannten Wert
   springen. */
const PERSON_GEHEIMNISSE = ["kalenderGeheim", "kalenderVerweis", "kalenderStand",
  "pushSchluessel", "zustellung"];

/** Zeitmarke einer Sicherung: Datum, Uhrzeit, vier Zufallsziffern.
    Die Ziffern halten zwei Sicherungen derselben Sekunde auseinander. */
export function markeNeu(jetzt = new Date(), zufall = Math.random) {
  const zeit = jetzt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${zeit}-${String(Math.floor(zufall() * 10000)).padStart(4, "0")}`;
}
export const MARKE = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}(-\d{4})?$/;

/** Der Betrieb dieser Sitzung im gespeicherten Bestand — oder null. */
export function eigenerBetrieb(bestand, sitzung) {
  const ort = gespeicherterBetrieb(bestand, sitzung);
  if (!ort || !ort.betrieb || typeof ort.betrieb.id !== "string") return null;
  return ort;
}

/** Was in eine manuelle Sicherung kommt: nur der eigene Betrieb. */
export function betriebsSicherung(bestand, ort, { stand = null, durch = null, jetzt = new Date() } = {}) {
  /* session am Betrieb ist kein Bestandsfeld (Commit D1c) — auch nicht in einer neuen Sicherung. */
  const { session, ...mandant } = ort.betrieb; // eslint-disable-line no-unused-vars
  return {
    centric: "sicherung", fassung: 2, umfang: "betrieb",
    mandantId: ort.betrieb.id, erzeugt: jetzt.toISOString(), stand, durch,
    mandant,
  };
}

/** Den Betrieb mit dieser Kennung aus einer Sicherung holen — aus einer
    betriebsbezogenen (fassung 2) oder einer raumweiten (automatische und
    ältere Sicherungen: ein ganzer Bestand). */
export function betriebAusSicherung(sicherung, mandantId) {
  if (!sicherung || typeof sicherung !== "object") return null;
  if (sicherung.umfang === "betrieb")
    return sicherung.mandantId === mandantId && sicherung.mandant
      && sicherung.mandant.id === mandantId ? sicherung.mandant : null;
  if (Array.isArray(sicherung.mandanten)) {
    const treffer = sicherung.mandanten.filter((m) => m && m.id === mandantId);
    return treffer.length === 1 ? treffer[0] : null;
  }
  return null;
}

/** Zu welchem Kontingent gehört eine Sicherung? Automatische, je Betrieb
    manuelle und ältere raumweite werden getrennt ausgedünnt — eine Flut
    manueller Sicherungen verdrängt so keinen automatischen Schutzpunkt
    und keine Sicherung eines anderen Betriebs. */
export function kontingent(meta) {
  if (meta && meta.automatisch === "ja") return "automatisch";
  if (meta && meta.mandantId) return `betrieb:${meta.mandantId}`;
  return "raum";
}

/** Welche Sicherungen fallen weg? Je Kontingent die zwanzig neuesten,
    von älteren Tagen je die jüngste. Eingabe: [{ key, marke, meta }]. */
export function auszuduennen(eintraege, behaltenNeueste = 20) {
  const nachKontingent = new Map();
  for (const e of eintraege) {
    const k = kontingent(e.meta);
    if (!nachKontingent.has(k)) nachKontingent.set(k, []);
    nachKontingent.get(k).push(e);
  }
  const weg = [];
  for (const liste of nachKontingent.values()) {
    const sortiert = [...liste].sort((a, b) => b.marke.localeCompare(a.marke));
    const tage = new Set();
    sortiert.forEach((e, i) => {
      if (i < behaltenNeueste) return;
      const tag = String(e.marke).slice(0, 10);
      if (tage.has(tag)) weg.push(e.key);
      else tage.add(tag);
    });
  }
  return weg;
}

/** Ein Eintrag der Liste, wie ihn die Leitung sieht. Raumweite Sicherungen
    erscheinen, weil sich der eigene Betrieb aus ihnen zurückholen lässt —
    wer sie angelegt hat, nur bei automatischen (dann steht dort kein Name). */
export function listenEintrag(marke, meta, eigeneId) {
  const m = meta || {};
  if (m.mandantId && m.mandantId !== eigeneId) return null;
  const automatisch = m.automatisch === "ja";
  return { marke, zeit: m.zeit || null, automatisch,
    umfang: m.mandantId ? "betrieb" : "raum",
    durch: m.mandantId || automatisch ? (m.durch || null) : null };
}

/** Tag einer Zeitmarke oder ISO-Zeit (JJJJ-MM-TT). */
const tagVon = (x) => String(x || "").slice(0, 10);

/**
 * Den eigenen Betrieb aus einer Sicherung zurückspielen.
 *
 * Gibt den neuen Bestand zurück oder { verweigert, status }. Ersetzt wird
 * genau der Betrieb der Sitzung, an seiner Stelle. Alle anderen Betriebe und
 * die oberste Ebene bleiben, wie sie sind. Aus dem jetzigen Stand bleiben:
 * Vertragsfelder, Protokoll und Planänderungen des Betriebs, anonymisierte
 * Personen, Zustellwege und Geheimnisse. Rollen werden geprüft wie beim
 * Speichern — eine Sicherung holt keine höhere Rolle zurück, als die Leitung
 * vergeben dürfte.
 *
 * Ebenso aus dem jetzigen Stand: alles, was die Leitung beim gewöhnlichen
 * Speichern nicht schreiben darf — die Rechnungsstammdaten des Betreibers
 * (BETREIBERSTAMM), Felder außerhalb ihrer Sicht im Betrieb (VOLL_BETRIEB)
 * und an bestehenden Personen (VOLL_PERSON, für die eigene Person
 * PERSONENFELDER), also etwa Bank-, Steuer- und Lohnangaben. Dieselbe Grenze
 * wie vollRueckfuellen in rechte.mjs. Bis hierher kamen diese Felder aus der
 * Sicherung zurück: Die Leitung konnte eine USt-ID des Betreibers oder eine
 * geänderte IBAN auf einen älteren Stand zurückdrehen. Personen, die es
 * heute nicht mehr gibt, kommen vollständig aus der Sicherung zurück — das
 * ist Wiederherstellen, kein Zurückdrehen.
 *
 * @param {any} jetzt
 * @param {any} sicherung
 * @param {any} sitzung
 * @param {{ marke?: string, sicherungsZeit?: (string|null), heute?: Date }} [o]
 */
export function betriebWiederherstellen(jetzt, sicherung, sitzung, { marke, sicherungsZeit, heute = new Date() } = {}) {
  const ort = eigenerBetrieb(jetzt, sitzung);
  if (!ort) return { verweigert: "Zu dieser Sitzung gehört kein gespeicherter Betrieb.", status: 409 };
  const alt = ort.betrieb;
  const aus = betriebAusSicherung(sicherung, alt.id);
  if (!aus) return { verweigert: "Diese Sicherung enthält den eigenen Betrieb nicht.", status: 404 };

  /* Was ein Löschlauf entfernt oder anonymisiert hat, kommt nicht zurück.
     Der Löschlauf selbst lebt in der Oberfläche (src/aufbewahrung.js) und
     steht dem Server nicht zur Verfügung; deshalb keine Sicherung, die vor
     oder am Tag des letzten Löschlaufs entstand. */
  const geraeumt = alt.aufbewahrung && alt.aufbewahrung.zuletztGeraeumt;
  if (geraeumt && tagVon(sicherungsZeit || marke) <= tagVon(geraeumt))
    return { verweigert: `Diese Sicherung stammt von vor dem letzten Löschlauf (${tagVon(geraeumt)}). `
      + "Was dort gelöscht wurde, darf nicht zurückkommen.", status: 409 };

  const jetztPersonen = new Map((alt.personen || []).filter(Boolean).map((p) => [String(p.id), p]));
  const personen = (Array.isArray(aus.personen) ? aus.personen : []).map((p) => {
    if (!p || typeof p !== "object") return p;
    const heute2 = jetztPersonen.get(String(p.id));
    if (heute2 && heute2.anonym) return heute2;                 // anonymisiert bleibt anonymisiert
    const rein = { ...p };
    for (const f of PERSON_GEHEIMNISSE) {
      if (heute2 && f in heute2) rein[f] = heute2[f];
      else delete rein[f];
    }
    if (heute2) {
      const sichtbar = String(p.id) === String(sitzung.person) ? PERSONENFELDER : VOLL_PERSON;
      for (const f of new Set([...Object.keys(rein), ...Object.keys(heute2)])) {
        if (sichtbar.includes(f)) continue;
        if (f in heute2) rein[f] = heute2[f];
        else delete rein[f];
      }
    }
    return rein;
  });

  const eintrag = { id: `w-${marke || "?"}`, zeit: heute.toLocaleString("de-DE"),
    text: `Betrieb aus der Sicherung ${marke || "?"} wiederhergestellt` };
  const zurueck = { ...aus, id: alt.id, personen,
    protokoll: [eintrag, ...(Array.isArray(alt.protokoll) ? alt.protokoll : [])],
    aenderungen: alt.aenderungen };
  if (!("aenderungen" in alt)) delete zurueck.aenderungen;
  const behalten = ["id", "personen", "protokoll", "aenderungen"];
  for (const feld of new Set([...Object.keys(zurueck), ...Object.keys(alt)])) {
    if (behalten.includes(feld) || VOLL_BETRIEB.includes(feld)) continue;
    if (feld in alt) zurueck[feld] = alt[feld];
    else delete zurueck[feld];
  }
  for (const feld of [...VERTRAGSFELDER, ...BETREIBERSTAMM]) {
    if (feld in alt) zurueck[feld] = alt[feld];
    else delete zurueck[feld];
  }

  const neu = { ...jetzt, mandanten: jetzt.mandanten.map((m, i) => (i === ort.index ? zurueck : m)) };
  const rw = rollenwechselErlaubt(jetzt, neu, sitzung);
  if (!rw.ok) return { verweigert: rw.grund, status: 403 };
  return { bestand: neu };
}

/* --------------------------------------------------------------------------
   DATENEXPORT (Vollausgabe) — zwei Umfänge, beide als Positivliste

   Bis Oktober 2026 ging der eigene Betrieb hier roh hinaus: mit den
   Kalender- und Push-Geheimnissen aller Personen, der internen Notiz des
   Betreibers, Konditionen und Rechnungsangaben, unbekannten Feldern. Für
   die Leitung war das ein Umweg an der Lesesicht vorbei (Commit 1e.3), und
   mit einem fremden Kalendergeheimnis ließ sich dessen Feed lesen und
   überschreiben.

   Jetzt zwei ausdrückliche Kataloge. Was nicht darin steht, geht nicht
   hinaus. In keinem: technische Geheimnisse (EXPORT_GEHEIMNISSE) und
   Betreiberinterna (die Betriebsfelder außerhalb von VOLL_BETRIEB).

   - leitung: die Lesesicht der Leitung (VOLL_PERSON, VOLL_BETRIEB) ohne
     Zustellfelder — keine Daten, die ihr die normale Sicht nicht gibt; für
     alle Personen gleich, auch die eigene.
   - sicherung (Sicherungsschlüssel, externe Datenmitnahme): dazu die
     Personaldaten des Kunden (Bank, Steuer, Sozialversicherung, Lohn,
     Notfallkontakt, frühere Anmeldeadresse).

   Sammlungen, Plan und Regelwerk gehen in beiden vollständig hinaus — die
   Leitung liest sie auch in der normalen Sicht vollständig.

   Das ist ein Datenexport, kein Wiederherstellungsformat: Zurückgespielt
   wird aus den Sicherungen auf dem Server (oben) bzw. mit
   werkzeug/ablage-sicherung.mjs.
   -------------------------------------------------------------------------- */
export const EXPORT_GEHEIMNISSE = ["kalenderGeheim", "kalenderVerweis", "kalenderStand", "pushSchluessel", "zustellung"];
export const EXPORT_BETRIEB = VOLL_BETRIEB;
export const EXPORT_PERSON = {
  leitung: VOLL_PERSON.filter((x) => !EXPORT_GEHEIMNISSE.includes(x)),
  sicherung: PERSONENFELDER.filter((x) => !EXPORT_GEHEIMNISSE.includes(x)),
};
const nimmNur = (o, felder) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => felder.includes(k)));

/** Der Betrieb im Umfang des Exports. modus: "leitung" oder "sicherung". */
export function exportBetrieb(m, { modus }) {
  const personFelder = EXPORT_PERSON[modus];
  if (!personFelder) throw new Error(`Unbekannter Exportumfang: ${modus}`);
  const aus = nimmNur(m, EXPORT_BETRIEB);
  if (Array.isArray(m.personen)) aus.personen = m.personen.map((p) => (p && typeof p === "object" ? nimmNur(p, personFelder) : p));
  return aus;
}

/**
 * Was die Vollausgabe hergibt: den eigenen Betrieb, nicht den Raum.
 * Ein Sicherungsschlüssel trägt seit Oktober 2026 die Kennung seines
 * Betriebs. Ältere Schlüssel ohne Kennung gelten nur in einem Raum mit
 * genau einem Betrieb — sonst wäre unklar, welchen sie meinen.
 */
export function vollausgabeBetrieb(bestand, sitzung) {
  const liste = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten : [];
  if (sitzung.nurSicherung) {
    if (sitzung.mandantId) {
      const m = liste.find((x) => x && x.id === sitzung.mandantId);
      return m ? { betrieb: exportBetrieb(m, { modus: "sicherung" }), modus: "sicherung" }
        : { verweigert: "Der Betrieb dieses Schlüssels besteht nicht mehr.", status: 404 };
    }
    if (liste.length === 1) return { betrieb: exportBetrieb(liste[0], { modus: "sicherung" }), modus: "sicherung" };
    return { verweigert: "Dieser ältere Sicherungsschlüssel ist keinem Betrieb zugeordnet. "
      + "Bitte einen neuen anlegen.", status: 403 };
  }
  const ort = eigenerBetrieb(bestand, sitzung);
  return ort ? { betrieb: exportBetrieb(ort.betrieb, { modus: "leitung" }), modus: "leitung" }
    : { verweigert: "Kein Betrieb vorhanden.", status: 404 };
}
