/* ==========================================================================
   SCHERBEN

   Der ganze Betrieb lag in einem Blob. Der Client lud alles, rechnete lokal
   und schrieb alles zurück — jede einzelne Schichtzuweisung übertrug den
   gesamten Betrieb, alle 1,2 Sekunden getaktet. Und weil der Konfliktschutz
   über einen ETag auf das Ganze lief, kollidierten zwei Planer auch dann,
   wenn sie an verschiedenen Monaten arbeiteten. Einer machte seine Arbeit
   neu — bei einer Anwendung, deren Kern die gemeinsame Monatsplanung ist,
   traf das den Normalfall.

   Was hier passiert: Der Bestand wird beim Schreiben in Stücke zerlegt und
   beim Lesen wieder zusammengesetzt. Für die Oberfläche ändert sich nichts;
   sie bekommt und schickt weiterhin einen vollständigen Bestand.

   Zerlegt wird nach Monat, und nur das, was mit der Zeit wächst:

     abweichungen   personId|JJJJ-MM-TT → Dienstart      (der eigentliche Plan)
     erfassung      personId|JJJJ-MM-TT → Zeiten
     einstempeln    personId|JJJJ-MM-TT → Stempelungen

   Bei hundert Beschäftigten sind das je Jahr rund hunderttausend Einträge —
   über neunzig Prozent des Wachstums. Alles andere (Personal, Einheiten,
   Dienstarten, Regelwerk) ist durch die Betriebsgröße begrenzt, nicht durch
   die Zeit, und bleibt im Kern.

   Der Gewinn ist zweifach: Geschrieben wird nur, was sich geändert hat, und
   zwei Planer in verschiedenen Monaten stören einander nicht mehr.
   ========================================================================== */

import { createHash } from "node:crypto";

/** Felder, die je Monat abgelegt werden. Alle tragen Schlüssel der
    Form "personId|JJJJ-MM-TT". */
export const MONATSFELDER = ["abweichungen", "erfassung", "einstempeln", "istEingefroren"];
/** Erst mit dem Monatsabschluss entstanden (WP-16, Review H1: das eingefrorene Ist je Person und Tag).
    Ein Betrieb ohne dieses Feld bekommt es beim Zusammensetzen nur, wenn eine Scherbe Einträge trägt. */
const SPAETE_FELDER = new Set(["istEingefroren"]);

/** Aus "p3|2026-08-14" den Monat "2026-08" holen (null ohne erkennbares Datum). */
export function monatVon(schluessel) {
  const teil = String(schluessel).split("|")[1] || "";
  return /^\d{4}-\d{2}/.test(teil) ? teil.slice(0, 7) : null;
}

export const scherbenSchluessel = (raum, mandantId, monat) =>
  `scherbe:${raum}:${mandantId}:${monat}`;
export const kernSchluessel = (raum) => `kern:${raum}`;

/**
 * Zerlegt einen vollständigen Bestand.
 *
 * scherben ist eine Map von Monat auf
 * { mandantId, monat, felder: { abweichungen, erfassung, einstempeln } }
 *
 * @returns {{kern: object, scherben: Map<string, object>}}
 */
export function zerlegen(bestand) {
  const scherben = new Map();
  if (!bestand || !Array.isArray(bestand.mandanten))
    return { kern: bestand, scherben };

  const kern = {
    ...bestand,
    mandanten: bestand.mandanten.map((m) => {
      if (!m || typeof m !== "object") return m;
      const rest = { ...m };
      for (const feld of MONATSFELDER) {
        const inhalt = m[feld];
        if (!inhalt || typeof inhalt !== "object") continue;
        /* Im Kern bleibt ein leeres Objekt stehen, damit die Oberfläche
           beim Zusammensetzen nichts vermisst — und damit sichtbar bleibt,
           dass das Feld existiert. */
        rest[feld] = {};
        for (const [k, v] of Object.entries(inhalt)) {
          const monat = monatVon(k);
          if (!monat) {
            /* Ein Schlüssel ohne erkennbares Datum bleibt im Kern. Lieber
               eine unerwartete Form mitschleppen als sie verlieren. */
            rest[feld][k] = v;
            continue;
          }
          const id = `${m.id}::${monat}`;
          if (!scherben.has(id)) {
            scherben.set(id, { mandantId: m.id, monat,
              felder: Object.fromEntries(MONATSFELDER.map((f) => [f, {}])) });
          }
          scherben.get(id).felder[feld][k] = v;
        }
      }
      return rest;
    }),
  };
  return { kern, scherben };
}

/**
 * Setzt Kern und Scherben wieder zu einem vollständigen Bestand zusammen.
 * Die Oberfläche bekommt genau das, was sie vorher auch bekam.
 */
export function zusammensetzen(kern, scherbenListe) {
  if (!kern || !Array.isArray(kern.mandanten)) return kern;

  /* Nach Betrieb bündeln, damit je Mandant nur einmal gearbeitet wird. */
  const jeMandant = new Map();
  for (const s of scherbenListe || []) {
    if (!s || !s.mandantId) continue;
    if (!jeMandant.has(s.mandantId)) jeMandant.set(s.mandantId, []);
    jeMandant.get(s.mandantId).push(s);
  }

  return {
    ...kern,
    mandanten: kern.mandanten.map((m) => {
      if (!m || typeof m !== "object") return m;
      const meine = jeMandant.get(m.id);
      if (!meine || !meine.length) return m;
      const zusammen = { ...m };
      for (const feld of MONATSFELDER) {
        if (SPAETE_FELDER.has(feld) && !(feld in m)
          && !meine.some((s) => s.felder && s.felder[feld] && Object.keys(s.felder[feld]).length)) continue;
        const ziel = { ...(m[feld] || {}) };
        for (const s of meine) Object.assign(ziel, (s.felder || {})[feld] || {});
        zusammen[feld] = ziel;
      }
      return zusammen;
    }),
  };
}

/**
 * Fingerabdruck einer Scherbe. Wird zum Erkennen von Änderungen benutzt —
 * eine Scherbe, deren Abdruck gleich bleibt, wird nicht geschrieben.
 *
 * Seit WP-48.2 ein SHA-256-Präfix (32 Hex-Zeichen) über den stabil
 * sortierten Text (abdruckText). Vorher war der Abdruck der Text selbst
 * („bewusst kein Hash") — damit war jeder Standvermerk so groß wie der
 * Bestand, bis zu zehn davon lagen auf der Platte, und das Journal jedes
 * Schreibvorgangs trug ihn noch einmal (docs/acc45/WP48-TEILSPEICHERUNG.md
 * 1.2: 14 MB je Vermerk bei 150 Personen × 12 Monaten). Alte Vermerke mit
 * Text übersetzt abdruckNormal in denselben Hash.
 */
export function abdruck(scherbe) {
  if (!scherbe) return "";
  return praefix(abdruckText(scherbe));
}

/** Der Abdruck des Kerns: SHA-256-Präfix seines JSON-Texts (vorher der Text selbst). */
export function kernAbdruck(kern) {
  return praefix(JSON.stringify(kern) ?? "undefined");
}

const praefix = (text) => createHash("sha256").update(text).digest("hex").slice(0, 32);
const ABDRUCK_FORM = /^[0-9a-f]{32}$/;

/**
 * Ein Abdruck aus einem gespeicherten Standvermerk in der heutigen Form —
 * oder null, wenn er sich nicht sicher deuten lässt.
 *
 * - 32 Hex-Zeichen: schon ein Hash.
 * - Ein Text, wie ihn der Server vor WP-48.2 schrieb: Scherbe
 *   („abweichungen:…", siehe abdruckText) oder Kern (JSON eines Objekts,
 *   „{…"). Er wird gehasht — derselbe Inhalt ergibt denselben Hash wie
 *   abdruck/kernAbdruck heute, der Vergleich bleibt also gültig.
 * - Alles andere: null. Der Aufrufer behandelt den ganzen Vermerk dann wie
 *   einen fehlenden (fail-closed: Konflikt statt Abgleich, bzw. Neuberechnung
 *   aus dem, was auf der Platte liegt).
 * @returns {string|null}
 */
export function abdruckNormal(wert) {
  if (typeof wert !== "string") return null;
  if (ABDRUCK_FORM.test(wert)) return wert;
  if (wert.startsWith(`${MONATSFELDER[0]}:`) || wert.startsWith("{")) return praefix(wert);
  return null;
}

/** Der stabil sortierte Text einer Scherbe — die Grundlage des Abdrucks (und der Abdruck vor WP-48.2). */
export function abdruckText(scherbe) {
  if (!scherbe) return "";
  const teile = [];
  for (const feld of MONATSFELDER) {
    const inhalt = (scherbe.felder || {})[feld] || {};
    const schluessel = Object.keys(inhalt).sort();
    teile.push(`${feld}:${schluessel.length}:`
      + schluessel.map((k) => `${k}=${JSON.stringify(inhalt[k])}`).join(","));
  }
  return teile.join("|");
}

/**
 * Welche Scherben unterscheiden sich?
 *
 * Gibt die Kennungen zurück, deren Inhalt in a und b nicht übereinstimmt —
 * einschließlich derer, die nur auf einer Seite vorkommen.
 */
export function unterschiede(a, b) {
  const alle = new Set([...(a?.keys() || []), ...(b?.keys() || [])]);
  const aus = [];
  for (const id of alle) {
    if (abdruck(a?.get(id)) !== abdruck(b?.get(id))) aus.push(id);
  }
  return aus;
}

/**
 * Führt zwei Bestände zusammen, die von demselben Ausgangspunkt abzweigen.
 *
 * Der Fall, um den es geht: Zwei Planer laden denselben Stand. Einer trägt
 * im August ein, der andere im September. Bis hierher verlor einer von
 * beiden seine Arbeit, weil der ETag auf den ganzen Betrieb ging.
 *
 * Zusammengeführt wird nur, wenn sich die geänderten Scherben nicht
 * überschneiden. Berühren beide denselben Monat, bleibt es beim Konflikt —
 * dort automatisch zu mischen hieße raten, und beim Dienstplan ist Raten
 * die schlechteste aller Möglichkeiten.
 *
 * @returns {{ok: boolean, bestand?: object, streit?: Array<string>}}
 */
export function zusammenfuehrenNachMonat(basis, meins, fremdes) {
  const zBasis = zerlegen(basis);
  const zMeins = zerlegen(meins);
  const zFremd = zerlegen(fremdes);

  const meineAenderungen = new Set(unterschiede(zBasis.scherben, zMeins.scherben));
  const fremdeAenderungen = new Set(unterschiede(zBasis.scherben, zFremd.scherben));

  const streit = [...meineAenderungen].filter((id) => fremdeAenderungen.has(id));
  if (streit.length) return { ok: false, streit };

  /* Der Kern selbst darf nicht auseinandergehen — dort stehen Personal,
     Dienstarten und Regelwerk. Wer daran arbeitet, arbeitet an etwas, das
     alle betrifft; das automatisch zu mischen wäre nicht vertretbar. */
  const kernBasis = JSON.stringify(zBasis.kern);
  const kernMeins = JSON.stringify(zMeins.kern);
  const kernFremd = JSON.stringify(zFremd.kern);
  if (kernMeins !== kernBasis && kernFremd !== kernBasis)
    return { ok: false, streit: ["kern"] };

  /* Der Kern kommt von der Seite, die ihn geändert hat. */
  const kern = kernMeins !== kernBasis ? zMeins.kern : zFremd.kern;

  /* Die Scherben von beiden Seiten: jede Änderung von der Seite, die sie
     vorgenommen hat, alles Unberührte aus dem fremden Stand. */
  const zusammen = new Map(zFremd.scherben);
  for (const id of meineAenderungen) {
    const s = zMeins.scherben.get(id);
    if (s) zusammen.set(id, s);
    else zusammen.delete(id);
  }

  return { ok: true, bestand: zusammensetzen(kern, [...zusammen.values()]) };
}
