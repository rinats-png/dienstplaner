/* ==========================================================================
   TEILROLLEN UND PLANWIRKUNG (IMP-6, Vorbedingung 1 vor AN) — Vorgabe AUS

   Beschäftigte, Schichtverantwortung und Betriebsrat sehen höchstens die eigene
   Zuordnung (Q4); der Betriebsrat liest keine Modelle. Ihre Oberflächen rechnen
   deshalb nie selbst nach den Modellen. Bei eingeschalteter Planwirkung
   (CENTRIC_SCHICHTMODELL_WIRKUNG, nur genau "true") gilt für sie:

   1. Sicht (schichtfolgeFuerSicht): GET /api/bestand liefert den vom Server
      gerechneten Dienst der Personen ihrer Sicht im Sichtfenster (SICHTFENSTER,
      wie die Schichtverantwortung) — nur Dienstkennungen je Tag, nie Modelle,
      Modellnamen, Zuordnungen, Versatz oder Gültigkeit. Nur Personen mit eigener
      Zuordnung stehen darin (alle anderen rechnet die Oberfläche selbst richtig).
   2. Schreibweg (abweichungenTeilrollen): Änderungen an Abweichungen werden mit
      dem Modelldienst verglichen, nicht mit der Annahme des Clients:
      - Abweichung gleich dem Modelldienst → entfällt (sie ist der Plan).
      - Gelöschte Abweichung ohne Kennzeichen „server“ (der Client rechnete mit
        der Betriebsfolge) an einem Tag, an dem Modell und Betriebsfolge
        verschieden sind → ausdrücklich der Dienst der Betriebsfolge — das, was
        der Client als Plan zeigte. Nie still der Modelldienst.
      - Mit Kennzeichen (der Client rechnete mit dem Dienst des Servers) bleibt
        die Löschung: Plan = Modelldienst.
      Das Kennzeichen erweitert keine Schreibrechte: Es entscheidet nur, wie eine
      eigene Löschung im eigenen Bereich gelesen wird; beide Ergebnisse könnte der
      Client auch ausdrücklich setzen. Die Rechteprüfung (rechte.mjs) läuft danach
      unverändert.
      Kein Abfrageorakel (Review #436 B1): Entschieden werden NUR Schlüssel, die die
      Schichtverantwortung sieht UND schreiben darf — Person in ihrer Sicht, Tag im
      Sichtfenster (wie die GET-Angabe), Einheit am Tag = eigener Bereich (dieselbe
      Regel wie rechte.mjs). Alles andere geht unverändert an die Rechteprüfung:
      gleicher Status und gleicher Stand wie bei AUS. Sonst verriete 200/403 den
      Modelldienst fremder Zuordnungen (Q4). Andere Teilrollen schreiben keine
      Abweichungen; für sie und den Betreiber bleibt der Rumpf unverändert.

   AUS (Vorgabe): beide Wege geben ihre Eingabe unverändert zurück bzw. null —
   keine Angabe in der Antwort, kein Unterschied beim Schreiben. Volle Rollen
   (Planung, Leitung, Kundenrolle) rechnen selbst und bleiben unberührt.
   docs/acc45/IMP-6-MEHRFACHMODELLE.md, „Teilrollen: vom Server gerechneter Dienst“.
   ========================================================================== */
import { schichtmodellWirkungAktiv, schichtmodellLageAm, planDienst, einheitAm, einheitDienst, folgtNurBetriebsmodell } from "./fachpruefung.mjs";
import { schreibumfang, darf, SCHREIBEN_VOLL, eigeneEinheit, einheitAm as einheitAmRechte } from "./rechte.mjs";
import { SICHTFENSTER } from "./sicht.mjs";
import { addDays } from "./regelwerk.mjs";

const liste = (w) => (Array.isArray(w) ? w : []).filter((x) => x && typeof x === "object");
const TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Sieht und pflegt diese Rolle ALLE Zuordnungen (Vollschreibrecht, org.edit oder pattern.edit, staff.edit — wie
 *  rechte.mjs)? Nur sie rechnet selbst nach den Modellen; alle anderen Rollen sind Teilrollen. */
export function vollsichtSchichtmodelle(rolle) {
  return schreibumfang(rolle) === SCHREIBEN_VOLL && (darf(rolle, "org.edit") || darf(rolle, "pattern.edit")) && darf(rolle, "staff.edit");
}

/** Folgt die Person an diesem Tag dem Betriebsmodell (oder keiner Folge: Springer, nicht im Schichtdienst)? */
const betriebsLage = (l) => l.art === "ohne" || (l.art === "dienst" && l.quelle === "betrieb");

/**
 * Der gerechnete Dienst für eine Teilrolle (GET /api/bestand), oder null (AUS, keine Daten).
 * @param {any} roh gespeicherter eigener Betrieb (mit Zuordnungen und Modellen)
 * @param {any} sicht derselbe Betrieb in der Sicht der Rolle (bestimmt, welche Personen vorkommen dürfen)
 * @param {string} heute JJJJ-MM-TT (Europe/Berlin)
 * @returns {null | { von: string, bis: string, personen: Record<string, any[]> }}
 */
export function schichtfolgeFuerSicht(roh, sicht, heute, fenster = SICHTFENSTER) {
  if (!schichtmodellWirkungAktiv() || !roh || !sicht || typeof heute !== "string" || !TAG.test(heute)) return null;
  const von = addDays(heute, -fenster.vorTage), bis = addDays(heute, fenster.nachTage);
  const sichtbar = new Set(liste(sicht.personen).filter((p) => p.id !== undefined && p.id !== null).map((p) => String(p.id)));
  /** @type {Record<string, any[]>} */
  const personen = {};
  for (const p of liste(roh.personen)) {
    if (!sichtbar.has(String(p.id)) || folgtNurBetriebsmodell(p) || p.springer || p.imSchichtdienst === false) continue;
    const reihe = [];
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      const l = schichtmodellLageAm(roh, p, d);
      if (betriebsLage(l)) { reihe.push(null); continue; }
      const r = l.art === "dienst" && l.dienstId ? String(l.dienstId) : "-";
      const plan = planDienst(roh, p, d);
      const pl = plan ? String(plan) : "-";
      reihe.push(r === pl ? r : [r, pl]);
    }
    personen[String(p.id)] = reihe;
  }
  return { von, bis, personen };
}

/**
 * Schreibweg der Teilrollen: die übermittelten Abweichungen des eigenen Betriebs gegen den Modelldienst entscheiden.
 * Gibt den Rumpf unverändert zurück (AUS, volle Rolle, nichts zu entscheiden) oder eine Kopie mit angepassten
 * Abweichungen. Verglichen wird mit dem, was die Rolle gelesen hat (Sicht des gespeicherten Stands) — ein für sie
 * unsichtbarer Eintrag gilt nie als gelöscht.
 * @param {any} bestand übermittelter Rumpf ({ mandanten })
 * @param {{ roh: any, sicht: any, rolle: string, person: any, heute: string, basisServer: boolean }} o roh = gespeicherter
 *   eigener Betrieb, sicht = derselbe Betrieb in der Sicht der Rolle, person = Person der Sitzung, heute = JJJJ-MM-TT
 */
export function abweichungenTeilrollen(bestand, { roh, sicht, rolle, person, heute, basisServer }, fenster = SICHTFENSTER) {
  if (!schichtmodellWirkungAktiv() || vollsichtSchichtmodelle(rolle)) return bestand;
  /* Nur die Schichtverantwortung schreibt Abweichungen (rechte.mjs einheitZusammen); alle anderen: unverändert. */
  if (rolle !== "subplaner" || person === null || person === undefined || typeof heute !== "string" || !TAG.test(heute)) return bestand;
  if (!bestand || !Array.isArray(bestand.mandanten) || !roh || typeof roh.id !== "string") return bestand;
  const i = bestand.mandanten.findIndex((x) => x && typeof x === "object" && x.id === roh.id);
  if (i < 0) return bestand;
  const neuM = bestand.mandanten[i];
  const neuAb = neuM.abweichungen;
  if (!neuAb || typeof neuAb !== "object" || Array.isArray(neuAb)) return bestand;          // Form prüft rechte.mjs
  const altAb = sicht && sicht.abweichungen && typeof sicht.abweichungen === "object" ? sicht.abweichungen : {};
  const personen = new Map(liste(roh.personen).map((p) => [String(p.id), p]));
  const ich = personen.get(String(person));
  const eigene = ich ? eigeneEinheit(roh, ich) : null;
  if (!eigene) return bestand;
  const sichtbar = new Set(liste(sicht && sicht.personen).filter((p) => p.id !== undefined && p.id !== null).map((p) => String(p.id)));
  const von = addDays(heute, -fenster.vorTage), bis = addDays(heute, fenster.nachTage);
  let aus = null;
  for (const k of new Set([...Object.keys(altAb), ...Object.keys(neuAb)])) {
    if (altAb[k] === neuAb[k]) continue;
    const [pid, tag] = String(k).split("|");
    const p = personen.get(pid);
    if (!p || !TAG.test(tag || "")) continue;                                  // ungültig: entscheidet rechte.mjs
    /* B1: nur, was die Rolle sieht und schreiben darf, im Fenster — sonst unverändert an die Rechteprüfung */
    if (!sichtbar.has(pid) || tag < von || tag > bis || einheitAmRechte(p, tag) !== eigene) continue;
    const l = schichtmodellLageAm(roh, p, tag);
    if (betriebsLage(l)) continue;                                             // Betriebsmodell: wie bisher
    const modell = l.art === "dienst" && l.dienstId ? String(l.dienstId) : "-";
    if (neuAb[k] === undefined) {
      if (basisServer) continue;                                               // Plan des Clients = Modelldienst
      const eid = einheitAm(p, tag);
      const folge = (eid ? einheitDienst(roh, eid, tag) : null) || "-";        // Plan, den der Client sah
      if (folge === modell) continue;
      if (!aus) aus = { ...neuAb };
      aus[k] = folge;
    } else if (neuAb[k] === modell) {
      if (!aus) aus = { ...neuAb };
      delete aus[k];                                                           // gleich dem Modelldienst: keine Abweichung
    }
  }
  if (!aus) return bestand;
  const mandanten = [...bestand.mandanten];
  mandanten[i] = { ...neuM, abweichungen: aus };
  return { ...bestand, mandanten };
}
