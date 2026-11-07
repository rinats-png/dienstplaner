import { getStore } from "../lib/ablage.mjs";
import { createHash, randomBytes } from "node:crypto";
import { bremse, lastbremse, entlasten, vermerkeZuruecknehmen, kennung, kennungPerson, kennungRaum, kennungCode, stempelDeckel, herkunft, herkunftErlaubt, zuVielAntwort,
  protokoll, notbremse, notentlasten, lesenGrenze } from "../lib/schutz.mjs";
import { ereignis } from "../lib/gesund-zaehler.mjs";
import { bestandFuerRolle, zusammenfuehren, schreibumfang, absageText, rolleVergebbar, sitzungsRolleBekannt,
  wirksameRolle, SCHREIBEN_NEIN, SCHREIBEN_VOLL, eigenerMandant, darf, fachpruefungOffen, sammelAnzahlSetzen, einwilligungsAenderungen, freigabeRuecknahmen, abschlussRecht } from "../lib/rechte.mjs";
import { schutzKonfliktMitteilungen, schutzEntferntAnzahl } from "../lib/bestaetigungen.mjs";
import { fachpruefungUebermittlungAsync, strukturAenderung, strukturBremse, letzteLaufzeit } from "../lib/schutzdurchsetzung.mjs";
import { pruefeGestalt, schrumpfung, SICHERUNGSSCHWELLE, mandantenKennungenGeprueft, uebergabenAngleichen,
  personenAngleichen, personenFehler } from "../lib/gestalt.mjs";
import { ablageSchluessel, altHash } from "../lib/codes.mjs";
import { betreiberZweifaktor } from "../lib/betreiber-zweifaktor.mjs";
import { herkunftsloseFeedsWiderrufen } from "../lib/feedwiderruf.mjs";
import { kontoLesen, kontoSchreiben, alleKonten, kontoVereinzeln, raumUebersicht }
  from "../lib/konten.mjs";
import { demoAn } from "../lib/schalter.mjs";
import { bestandLesen, bestandLesenStreng, bestandSchreiben, raumBelegt, unterRaumsperre, unveraenderteScherben,
  SPERRE_ZEITGRENZE, SPERRE_GESTOPPT, BESTAND_UNLESBAR } from "../lib/bestand.mjs";
import { geoUrteil, bestandStandorteFehler, bestandDienstartOrtFehler } from "../lib/geo.mjs";
import { raumLoeschen } from "../lib/raumloeschung.mjs";
import { stempelZiel, geplanterDienst, heuteBerlin, uhrzeitBerlin, startZuordenbar,
  offenSeitMinuten, langerDienstGrenze, stempelEreignis, ereignisFinden, OFFLINE_PRUEF_MARKIERUNGEN,
  offlineVerspaetet, offlineVertrauen, UHR_TOLERANZ_MS, pauseAngabe }
  from "../lib/zeiterfassung.mjs";
import { arbeitssitzungLesen } from "../lib/arbeitssitzung.mjs";
import { paketfelderGeprueft } from "../lib/paketstand.mjs";
import { vertragsstandVon, paketAenderungen } from "../lib/paketstand.mjs";
import { auswertungHolen } from "../lib/br-auswertung.mjs";
import { stempelWiderspruch, stempelSichern, korrekturAnhaengen } from "../lib/stempelintegritaet.mjs";
import { antragStellen, antragEntscheiden } from "../lib/korrekturworkflow.mjs";
import { selbstauskunftStellen, selbstauskunftEntscheiden } from "../lib/selbstauskunft.mjs";
import { schreibKontext } from "../lib/schreibkontext.mjs";
import { abschlussSperre, abschlussWiderspruch, abschliessen, wiederoeffnen, lohnexportBestaetigen, korrekturBeginnen, korrekturFreigeben, korrekturVerwerfen, abgewiesenVermerken, letzteWiederoeffnung,
  monatAbgeschlossen, MONAT_ABGESCHLOSSEN, korrekturOffen, hatOffeneKorrektur } from "../lib/monatsabschluss.mjs";
import { regelHinweise, uhrDauerAbweichend, spurGrund, spurHinweise, pauseZuLang } from "../lib/zeitregeln.mjs";
import { neueServermitteilungen } from "../lib/mitteilungen.mjs";
import { zustellen, pushSchluessel, geraetAbmelden, personBereinigen, zustellStatusEigene } from "../lib/versand.mjs";
import { auskunftBauen, protokollZurPerson, kontoFuerAuskunft, AUSKUNFT_FUER_ANDERE } from "../lib/auskunft.mjs";
import { modulProtokollZeilen, bestandOhneModuleinstellungen } from "../lib/branchenmodule.mjs";
import { VORLAGEN, vorlageBestand, demoGestaltPruefen, demoOhneVertrag, codeBindung, betriebFuerNeuenCode }
  from "../lib/erstbefuellung.mjs";
import { SICHERUNG_ROLLEN, WIEDERHERSTELLEN_ROLLEN, MARKE, markeNeu, eigenerBetrieb,
  betriebsSicherung, auszuduennen, listenEintrag, betriebWiederherstellen,
  vollausgabeBetrieb } from "../lib/sicherungen.mjs";
/* Sitzungen liegen in lib/sitzungen.mjs — dieselbe Logik wie vorher hier,
   nur an einer Stelle: Künftig legen auch Einladung und Passwort-Reset
   Sitzungen an, und eine zweite Kopie wäre der Anfang von zwei Wahrheiten. */
import { sitzungsSpeicher as sitzungen,
  sitzungAnlegen, sitzungBeenden, sitzungenBeendenWenn, merkmalAus, dauerFuer }
  from "../lib/sitzungen.mjs";

/* ==========================================================================
   DATENSPEICHER

   Der Betrieb liegt als Kern plus Monatsscherben (siehe lib/bestand.mjs).
   Für die Oberfläche ändert sich dadurch nichts — sie bekommt und schickt
   weiterhin einen vollständigen Bestand.

   Konfliktschutz je Monat statt auf das Ganze: Zwei Planer, die an
   verschiedenen Monaten arbeiten, stören einander nicht mehr. Vorher verlor
   einer von beiden seine Arbeit, obwohl sie sich nie in die Quere kamen —
   bei einer Anwendung, deren Kern die gemeinsame Monatsplanung ist, traf
   das den Normalfall statt der Ausnahme.
   ========================================================================== */

const laden = () => getStore({ name: "centric", consistency: "strong" });

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const antwort = (daten, status = 200, kopf = {}) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff", ...kopf },
  });

/* --------------------------------------------------------------------------
   DER RUMPF EINER ANFRAGE

   Bisher las jeder Endpunkt seinen Rumpf selbst mit req.json(). Zwei Dinge
   fehlten dabei: eine Obergrenze — ein absichtlich riesiger Rumpf lief
   bis in den Parser — und eine saubere Antwort auf kaputtes JSON, das als
   „Serverfehler" (500) endete, obwohl es ein Fehler des Aufrufers ist.

   Sechs Megabyte sind mehr als jeder Betrieb, den die Anwendung je
   gespeichert hat, und weniger als das, was die Plattform ohnehin
   abschneidet. Wer darüber liegt, bekommt 413 und den Rat, zu zerlegen.
   -------------------------------------------------------------------------- */
const RUMPF_MAX = 6 * 1024 * 1024;

/* Wie oft /api/stempeln nach einem echten Konflikt noch einmal versucht,
   jedes Mal aus dem frisch gelesenen Stand. Unter der Raumsperre kann ein
   Konflikt nur von einem Schreiber kommen, der an ihr vorbeischreibt —
   drei Wiederholungen sind dafür reichlich; danach eine klare Absage. */
const STEMPEL_WIEDERHOLUNGEN = 3;

/* Wem gehört eine Offline-Warteschlange (WP-07)? Raum, Betrieb und Person
   der Sitzung, als Prüfsumme. Die Oberfläche legt jedes Ereignis mit
   diesem Kennzeichen ab und sendet es nur mit einer Sitzung, die dasselbe
   Kennzeichen hat; der Server prüft es noch einmal. So geht nach einem
   Abmelden oder Benutzerwechsel am selben Gerät kein Stempel der einen
   Person unter der Sitzung einer anderen hinaus. Der Betrieb zählt mit
   seiner Kennung (mandantId), nicht mit seiner Position (Review L5). */
/** Die Felder des Rumpfs von POST /api/monatsabschluss, die die Funktionen in lib/monatsabschluss.mjs lesen dürfen. */
const MONATSABSCHLUSS_RUMPF = Object.freeze(["monat", "grund", "anlass", "trotzPrueffaellen", "abdruck", "zeilen", "stand", "revision",
  "trotzVormonat", "vormonatKategorie", "vormonatGrund", "differenz"]);
const stempelInhaber = (s) => (s.person === null || s.person === undefined) ? null : createHash("sha256")
  .update(`centric-stempel|${s.bestand}|${s.mandantId ?? s.betrieb}|${s.person}`).digest("hex").slice(0, 32);

/* Personen je Raum, zuletzt gesehen (WP-47): Der Raumdeckel fürs Stempeln hängt
   an der Betriebsgröße (schutz.mjs, stempelDeckel), und die Bremse läuft VOR
   dem Lesen des Bestands. Gemerkt wird beim Lesen, Schreiben und Stempeln —
   nur die Zahl, nie Namen. Nach einem Neustart gilt bis zum ersten Zugriff
   die vorsichtige Vorgabe. */
const raumGroesse = new Map();
function groesseMerken(raum, bestand) {
  try {
    const n = (Array.isArray(bestand && bestand.mandanten) ? bestand.mandanten : [])
      .reduce((a, m) => a + (m && Array.isArray(m.personen) ? m.personen.length : 0), 0);
    if (n > 0) {
      if (raumGroesse.size > 5000) raumGroesse.clear();
      raumGroesse.set(String(raum), n);
    }
  } catch { /* nur eine Schätzung */ }
}

/* Antwortgröße je Raum in Bytes, zwischengespeichert je Stand (WP-47b): Die
   Lesebremse richtet ihre Grenze nach der Größe der letzten Antwort. Ein neuer
   Stand ersetzt den Eintrag (Standwechsel widerruft ihn). Gespeichert wird nur
   die Zahl, nie der Bestand. Nach einem Neustart gilt die strenge Vorgabe. */
const raumBytes = new Map();
function bytesMerken(raum, mit) {
  try {
    const alt = raumBytes.get(String(raum));
    /* Stand allein reicht nicht: der Stand „alt“ wechselt nie (Altformat) — deshalb auch die Zeit. */
    if (alt && alt.stand === mit.stand && alt.zeit === mit.zeit) return alt.bytes;
    const bytes = Buffer.byteLength(JSON.stringify(mit.bestand), "utf8");
    if (raumBytes.size > 5000) raumBytes.clear();
    raumBytes.set(String(raum), { stand: mit.stand, zeit: mit.zeit, bytes });
    return bytes;
  } catch { return null; }
}

async function rumpfLesen(req) {
  const laenge = Number(req.headers.get("content-length") || 0);
  if (laenge > RUMPF_MAX)
    return { ok: false, antwort: antwort({ fehler: "Anfrage zu groß.",
      text: "Der Bestand ist größer als sechs Megabyte. Bitte alte Monate auslagern." }, 413) };
  let text;
  try { text = await req.text(); } catch { text = ""; }
  if (text.length > RUMPF_MAX)
    return { ok: false, antwort: antwort({ fehler: "Anfrage zu groß." }, 413) };
  if (!text.trim()) return { ok: true, daten: {} };
  try {
    const daten = JSON.parse(text);
    if (!daten || typeof daten !== "object")
      return { ok: false, antwort: antwort({ fehler: "Der Rumpf muss ein JSON-Objekt sein." }, 400) };
    return { ok: true, daten };
  } catch {
    return { ok: false, antwort: antwort({ fehler: "Der Rumpf ist kein gültiges JSON." }, 400) };
  }
}

/* Eine frische Anmeldung für Schritte, die sich nicht zurücknehmen lassen.

   Ein entwendetes Sitzungsmerkmal — vom liegen gelassenen Rechner, aus
   einem Browserprofil — soll damit nicht auch noch Zugänge sperren oder
   einen ganzen Datenraum löschen können. Wer den Code hat, meldet sich
   neu an; wer ihn nicht hat, kommt hier nicht weiter. */
const FRISCH = 20 * 60 * 1000;
const frisch = (s) => !!(s && s.seit && Date.now() - s.seit < FRISCH);
const neuAnmelden = () => antwort({ fehler: "Bitte neu anmelden.",
  text: "Für diesen Schritt muss die Anmeldung jünger als zwanzig Minuten sein.",
  neuAnmelden: true }, 403);

/* Die Ortsprüfung beim Stempeln steht in lib/geo.mjs (Geo V1). */

/* --------------------------------------------------------------------------
   SICHERUNGEN AUSDÜNNEN

   Es gab keine Obergrenze und kein Aufräumen: Jede angeforderte Sicherung
   legte eine vollständige Kopie an, für immer. Bei einem Betrieb von
   mehreren Megabyte wächst das schnell in Bereiche, die Geld kosten.

   Behalten werden die zwanzig jüngsten und je Tag die jüngste der älteren.
   Das hält den jüngsten Verlauf dicht und die Vergangenheit schlank.
   -------------------------------------------------------------------------- */
async function sicherungenAusduennen(store, raum) {
  try {
    /* Je Kontingent getrennt (lib/sicherungen.mjs): automatische, je Betrieb
       manuelle und ältere raumweite. Vorher teilten sich alle einen Topf —
       zwanzig manuelle Sicherungen verdrängten jeden automatischen
       Schutzpunkt des Tages. */
    const { blobs } = await store.list({ prefix: `sicherung:${raum}:` });
    const eintraege = [];
    for (const b of blobs) {
      const meta = await store.getMetadata(b.key).catch(() => null);
      eintraege.push({ key: b.key, marke: b.key.split(":").pop(), meta: meta?.metadata || {} });
    }
    for (const key of auszuduennen(eintraege)) await store.delete(key).catch(() => {});
  } catch { /* Aufräumen darf nie eine Anfrage scheitern lassen */ }
}

/**
 * Die Absage der Pfade vor dem Hauptpfad, wenn die Anfrage ein Merkmal
 * mitbrachte, das nicht gilt: widerrufen (Entzug, Sperre, Epoche, Abmelden),
 * abgelaufen oder unbekannt. Einheitlich „Nicht angemeldet" (401) — nicht „kein
 * Betreiber", das wäre eine andere Auskunft —, damit die Antwort nicht davon
 * abhängt, ob eine widerrufene Sitzung schon weggeräumt wurde. Eine fachlich
 * widerrufene Sitzung kommt mit dem inneren Grund ins Protokoll, nie nach
 * außen; ein unbekanntes Merkmal nicht (sonst wäre jede erfundene Anfrage ein
 * Eintrag).
 *
 * Ohne jedes Merkmal bleibt es bei den Antworten, die diese Pfade schon
 * immer gaben.
 *
 * Gebraucht von den Pfaden vor dem Hauptpfad: Sie lasen die Sitzung bisher roh
 * und kamen an der fachlichen Prüfung vorbei. Jetzt lesen sie über denselben
 * Prüfpunkt wie alle anderen (lib/arbeitssitzung.mjs, arbeitssitzungLesen).
 *
 * @returns {Promise<Response|null>}  die Absage, oder null, wenn der Pfad weitermacht
 */
async function ungueltigesMerkmal(req, lese) {
  if (lese.abgewiesen) {
    await protokoll("zugaenge", kennung(req, null), "abgewiesen",
      `sitzung: ${String(lese.grund).slice(0, 24)}`);
  }
  if (lese.abgewiesen || (!lese.sitzung && lese.mitMerkmal))
    return antwort({ fehler: "Nicht angemeldet." }, 401);
  return null;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/api\/?/, "");
  const store = laden();

  /* Zweite Linie gegen fremd ausgelöste Schreibvorgänge (siehe schutz.mjs). */
  if (!herkunftErlaubt(req)) {
    await protokoll("fehler", kennung(req, null), "abgewiesen", "fremde Herkunft",
      { weg: pfad, verfahren: req.method, herkunft: herkunft(req) });
    return antwort({ fehler: "Diese Anfrage kommt nicht von der Anwendung." }, 403);
  }

  /* Der Rumpf wird genau einmal gelesen, begrenzt und geprüft. */
  let rumpf = {};
  if (req.method !== "GET" && req.method !== "HEAD") {
    const gelesen = await rumpfLesen(req);
    if (!gelesen.ok) return gelesen.antwort;
    rumpf = gelesen.daten;
  }

  try {
    /* ------------------ Zugänge für einen Mandanten ------------------ */
    /* Nur der Betreiber darf das. Die Codes entstehen hier, damit sie als
       Prüfsumme abgelegt werden können — im Browser wäre das sinnlos. */
    if (pfad === "zugaenge" && req.method === "POST") {
      const lB = await arbeitssitzungLesen(req, { store });
      const aB = await ungueltigesMerkmal(req, lB);
      if (aB) return aB;
      const sB = lB.sitzung;
      if (!sB || sB.rolle !== "betreiber") {
        await protokoll("zugaenge", kennung(req, null), "abgewiesen", "keine Betreibersitzung");
        return antwort({ fehler: "Nur für den Betreiber." }, 403);
      }
      const kZ = kennung(req, sB);
      const bZ = await bremse("zugaenge", kZ);
      if (!bZ.frei) { await protokoll("zugaenge", kZ, "gebremst", bZ.grund);
        return zuVielAntwort(bZ.wartet); }
      const { bestand: ziel, eintraege } = rumpf;
      if (!ziel || !Array.isArray(eintraege) || !eintraege.length)
        return antwort({ fehler: "Unvollständig." }, 400);
      if (eintraege.length > 20) return antwort({ fehler: "Zu viele auf einmal." }, 400);
      /* Nur bekannte Rollen, nie „betreiber“ (SI-06, interne Prüfung 2026-11):
         Sonst prägte eine einzige Betreibersitzung dauerhafte Betreiber-Codes. */
      const rolleUngueltig = eintraege.find((e) => !e || typeof e !== "object"
        || e.rolle === "betreiber" || !rolleVergebbar(e.rolle));
      if (rolleUngueltig !== undefined) {
        await protokoll("zugaenge", kZ, "abgewiesen", "Rolle nicht vergebbar");
        return antwort({ fehler: "Diese Rolle kann hier nicht vergeben werden." }, 400);
      }
      /* Beschäftigte und Schichtverantwortung ohne Person könnten nichts
         schreiben — siehe einrichten.mjs. */
      const ohnePerson = eintraege.find((e) => e && (e.rolle === "mitarbeiter" || e.rolle === "subplaner")
        && (e.personId === null || e.personId === undefined || e.personId === ""));
      if (ohnePerson)
        return antwort({ fehler: `Ein Zugang der Rolle „${ohnePerson.rolle}" braucht eine Person.` }, 400);

      /* Codes gibt es nur für einen eingerichteten Raum, gebunden an die
         Kennung seines Betriebs (erstbefuellung.mjs). */
      const zielGelesen = await bestandLesen(store, ziel);
      const bindungZ = betriebFuerNeuenCode(zielGelesen && zielGelesen.bestand, 0);
      if (bindungZ.grund) return antwort({ fehler: bindungZ.grund }, 409);
      const alphabet = "ACDEFGHJKLMNPQRTUVWXY34679";
      const block = () => Array.from(randomBytes(4))
        .map((b) => alphabet[b % alphabet.length]).join("");
      const erzeugt = [];
      for (const e of eintraege) {
        const code = `${block()}-${block()}-${block()}`;
        /* Ein Schlüssel je Konto: Zwei gleichzeitige Anlagen stören
           einander nicht mehr, und kein ausgelieferter Code geht verloren. */
        await kontoSchreiben(store, ablageSchluessel(code), {
          name: e.name || ziel, bestand: ziel,
          rolle: e.rolle, person: e.personId || null,
          betrieb: bindungZ.betrieb, mandantId: bindungZ.mandantId,
          demo: false, gruppe: null, hinweis: null,
          angelegt: new Date().toISOString() });
        erzeugt.push({ rolle: e.rolle, personId: e.personId || null, code });
      }
      await protokoll("einrichten", kennung(req, sB), "erfolg",
        `${erzeugt.length} Zugänge für ${ziel} (${erzeugt.map((z) => z.rolle).join(", ")})`);
      return antwort({ ok: true, zugaenge: erzeugt });
    }

    /* ------------------------ Einen Datenraum löschen ------------------
       Das Löschkonzept: „Gelöscht" heißt gelöscht. Bis hierher nahm die
       Betreiberkonsole einen Betrieb nur aus ihrer Liste; der Datenraum
       mit Personal, Plänen, Sicherungen und Zugangscodes blieb im Speicher
       liegen — unerreichbar, aber vorhanden. Für personenbezogene Daten
       ist das kein Zustand, den man einem Auftragsverarbeitungsvertrag
       vorlegen möchte.

       Drei Sicherungen: nur der Betreiber, nur mit frischer Anmeldung,
       nur mit wiederholtem Raumnamen. Der eigene Raum lässt sich nicht
       löschen — sonst sägt sich der Betreiber den Ast ab.              */
    if (pfad === "raum-loeschen" && req.method === "POST") {
      const lB = await arbeitssitzungLesen(req, { store });
      const aB = await ungueltigesMerkmal(req, lB);
      if (aB) return aB;
      const sB = lB.sitzung;
      if (!sB || sB.rolle !== "betreiber") {
        await protokoll("loeschen", kennung(req, null), "abgewiesen", "Raumlöschung ohne Recht");
        return antwort({ fehler: "Nur für den Betreiber." }, 403);
      }
      if (!frisch(sB)) return neuAnmelden();
      const kR = kennung(req, sB);
      const bR = await bremse("zugaenge", kR);
      if (!bR.frei) { await protokoll("loeschen", kR, "gebremst", bR.grund);
        return zuVielAntwort(bR.wartet); }

      const { bestand: raum, bestaetigung } = rumpf;
      if (!raum || typeof raum !== "string" || !/^[a-z0-9][a-z0-9_-]{2,79}$/i.test(raum))
        return antwort({ fehler: "Kein gültiger Raumname." }, 400);
      if (bestaetigung !== raum)
        return antwort({ fehler: "Zur Bestätigung den Raumnamen wiederholen." }, 400);
      if (raum === sB.bestand)
        return antwort({ fehler: "Der eigene Datenraum lässt sich nicht löschen." }, 400);

      /* Die eigentliche Arbeit steht in lib/raumloeschung.mjs — dieselbe
         Funktion, die der Löschlauf für abgelaufene Testbetriebe nutzt.
         Was sich nicht löschen ließ, kommt mit Schlüssel und Grund zurück;
         der Kern bleibt dann stehen, damit ein zweiter Versuch ihn findet. */
      /* Unter der Sperre des Raums: Ein Schreiber, der gerade mitten in
         seiner Folge steckt, legte sonst nach dem Löschen wieder Scherben
         und Standvermerke ab — Waisen ohne Kern. Der Löschlauf für
         abgelaufene Testbetriebe (aufraeumen.mjs) geht noch ohne sie. */
      const ergebnis = await unterRaumsperre(raum, () => raumLoeschen(store, sitzungen(), raum));
      if (!ergebnis.vollstaendig) {
        await protokoll("loeschen", kR, "fehler",
          `${raum}: ${ergebnis.fehler.length} Fehler, ${ergebnis.geloescht} Einträge`);
        return antwort({ fehler: "Der Datenraum wurde nicht vollständig gelöscht.",
          text: "Bitte noch einmal versuchen. Was liegen blieb, steht in der Antwort.",
          raum, geloescht: ergebnis.geloescht, offen: ergebnis.fehler }, 500);
      }
      await protokoll("loeschen", kR, "erfolg", `${raum}: ${ergebnis.geloescht} Einträge`);
      return antwort({ ok: true, raum, geloescht: ergebnis.geloescht });
    }

    /* ------------------ Die Zugänge eines Raums einsehen --------------
       Dieselbe Übersicht wie /einrichten/uebersicht, nur über die andere
       Tür: Betreibersitzung statt Verwalterschlüssel. Die Konsole konnte
       Demozugänge zurückziehen und Testbetriebe löschen, aber nicht sehen,
       welche Konten es in einem Raum gibt — den überzähligen Betreibercode
       fand sie deshalb nicht. Ohne Codes, ohne Prüfsummen; der eigene
       Zugang ist markiert, damit die Konsole ihn nicht zum Sperren anbietet. */
    if (pfad === "zugaenge-uebersicht" && req.method === "GET") {
      const lB = await arbeitssitzungLesen(req, { store });
      const aB = await ungueltigesMerkmal(req, lB);
      if (aB) return aB;
      const sB = lB.sitzung;
      if (!sB) return antwort({ fehler: "Nicht angemeldet." }, 401);
      if (sB.rolle !== "betreiber") {
        await protokoll("zugaenge", kennung(req, sB), "abgewiesen", "Übersicht ohne Recht");
        return antwort({ fehler: "Nur für den Betreiber." }, 403);
      }
      const kU = kennung(req, sB);
      const bU = await bremse("zugaenge", kU);
      if (!bU.frei) { await protokoll("zugaenge", kU, "gebremst", bU.grund);
        return zuVielAntwort(bU.wartet); }
      const raum = url.searchParams.get("bestand") || sB.bestand;
      if (!raum || typeof raum !== "string" || !/^[a-z0-9][a-z0-9_-]{2,79}$/i.test(raum))
        return antwort({ fehler: "Kein gültiger Raumname." }, 400);
      return antwort(await raumUebersicht(store, raum, { eigen: sB.konto || null }));
    }

    /* ------------------------ Einen Zugang sperren -------------------- */
    /* Bis hierher gab es drei Stellen, die Zugänge anlegen, und keine, die
       einen zurückzieht. Wer den Betrieb verließ, behielt seinen Code —
       und mit ihm den Plan. Für personenbezogene Daten ist das kein
       Schönheitsfehler, sondern ein fehlendes Löschkonzept.

       Gesperrt wird über den Code selbst oder über seine Prüfsumme. Der
       Eintrag bleibt als Grabstein stehen: So kann derselbe Code nicht
       durch Zufall ein zweites Mal vergeben werden. */
    if (pfad === "zugang-sperren" && req.method === "POST") {
      const lB = await arbeitssitzungLesen(req, { store });
      const aB = await ungueltigesMerkmal(req, lB);
      if (aB) return aB;
      const sB = lB.sitzung;
      /* Eine Sitzung aus /api/demo (öffentlich, ohne Code) sperrt nichts: Sonst könnte jeder Besucher die übrigen Demozugänge zurückziehen. */
      const darfSperren = sB && !sB.demo && (sB.rolle === "betreiber" || sB.rolle === "leitung");
      if (!darfSperren) {
        await protokoll("zugaenge", kennung(req, null), "abgewiesen", "Sperrung ohne Recht");
        return antwort({ fehler: "Nur die Organisationsleitung darf Zugänge zurückziehen." }, 403);
      }
      if (!frisch(sB)) return neuAnmelden();
      const kS = kennung(req, sB);
      const bS = await bremse("zugaenge", kS);
      if (!bS.frei) { await protokoll("zugaenge", kS, "gebremst", bS.grund);
        return zuVielAntwort(bS.wartet); }

      const { code, pruefsumme, id, kennung: kurz, alleDesBetriebs } = rumpf;
      const kurzGueltig = !!kurz && /^[0-9a-f]{8}$/i.test(String(kurz));
      /* Ob etwas angegeben wurde, entscheidet die Eingabe — nicht, ob es
         gefunden wurde. Sonst verriete die Antwort, ob eine Kennung existiert. */
      if (!code && !pruefsumme && !id && !kurzGueltig && !alleDesBetriebs)
        return antwort({ fehler: "Kein Zugang angegeben." }, 400);
      const konten = await alleKonten(store);
      const ziele = [];

      /* Die Leitung handelt für ihren Betrieb, nicht für den Raum. Bis
         Oktober 2026 genügte derselbe Raum: In einem Raum mit mehreren
         Betrieben sperrte die Leitung von A mit „alle des Betriebs" auch die
         Zugänge von B und beendete deren Sitzungen, einzeln ebenso. Ein Code
         gehört zum Betrieb über seine Kennung (mandantId, seit 1g), ältere
         Codes ohne Kennung über ihre Position. Betreibercodes gehören keinem
         Betrieb. Der Betreiber sperrt weiter raumweit. */
      let eigenerOrt = null;
      if (sB.rolle !== "betreiber") {
        /* Kein .catch: Ein unlesbarer Bestand ist ein Fehler (→ 503), kein leerer Betrieb. */
        const gelesenS = await bestandLesen(store, sB.bestand);
        eigenerOrt = gelesenS && gelesenS.bestand ? eigenerBetrieb(gelesenS.bestand, sB) : null;
      }
      const imEigenenBetrieb = (k) => {
        if (!k || k.bestand !== sB.bestand) return false;
        if (sB.rolle === "betreiber") return true;
        if (!eigenerOrt || k.rolle === "betreiber") return false;
        if (k.mandantId) return k.mandantId === eigenerOrt.betrieb.id;
        return Number(k.betrieb ?? 0) === eigenerOrt.index;
      };

      /* Beide Schlüssel — ein Konto kann noch unter dem alten liegen. */
      if (code) { ziele.push(ablageSchluessel(code)); ziele.push(altHash(code)); }
      if (pruefsumme) ziele.push(String(pruefsumme));
      /* Die öffentliche Demo-Kennung aus /api/demos. Bis hierher ließ sich
         ein Demozugang nur über seinen Code zurückziehen — den kennt nach
         dem Anlegen niemand mehr, er steht nur einmal auf dem Bildschirm.
         Die Konsole sieht dieselbe Liste wie die Startseite und zieht
         damit genau den einen Eintrag zurück, der zu viel ist. */
      if (id) {
        for (const [h, k] of Object.entries(konten))
          if (k && k.demo && k.id === String(id)) ziele.push(h);
      }
      /* Die gekürzte Kennung aus /einrichten/uebersicht — die letzten acht
         Zeichen der Prüfsumme, wie bei den Verwalterkonten. Nur genau acht
         Hexzeichen; ein leerer oder kürzerer Wert träfe sonst alles. */
      if (kurzGueltig) {
        const ende = String(kurz).toLowerCase();
        /* Nicht den eigenen. Die Konsole bietet ihn nicht an, aber die
           Kennung steht in derselben Liste wie alle anderen — ein Tippfehler
           darf nicht die Sitzung beenden, aus der man gerade sperrt. */
        if (sB.konto && String(sB.konto).endsWith(ende))
          return antwort({ fehler: "Der eigene Zugang lässt sich nicht sperren. "
            + "Sonst steht am Ende niemand mehr bereit." }, 400);
        for (const h of Object.keys(konten)) if (h.endsWith(ende)) ziele.push(h);
      }
      /* Notausgang: alle Zugänge eines Betriebs auf einmal. Gedacht für den
         Fall, dass Codes in falsche Hände geraten sind. Der eigene Zugang
         bleibt bestehen, sonst sperrt man sich selbst aus. */
      if (alleDesBetriebs) {
        const eigenerHash = sB.konto || null;
        for (const [h, k] of Object.entries(konten)) {
          if (k && k.bestand === sB.bestand && k.rolle !== "betreiber" && h !== eigenerHash) ziele.push(h);
        }
      }

      /* Nur, was zum eigenen Betrieb gehört (der Betreiber: alles). Fremdes
         fällt still heraus — die Antwort gleicht der für eine unbekannte
         Kennung. */
      const erlaubt = [...new Set(ziele)].filter((h) => {
        const k = konten[h];
        if (!k) return false;
        if (sB.rolle === "betreiber") return true;
        return imEigenenBetrieb(k);
      });
      let gesperrt = 0;
      for (const h of erlaubt) {
        const k = konten[h];
        if (k.gesperrt) continue;
        konten[h] = { ...k, gesperrt: true,
          gesperrtAm: new Date().toISOString(), gesperrtDurch: sB.name || sB.rolle };
        gesperrt++;
      }
      /* Einzeln zurückschreiben — der Sammelblob wird nicht mehr gepflegt. */
      if (gesperrt) {
        for (const h of erlaubt) {
          if (konten[h] && konten[h].gesperrt) await kontoSchreiben(store, h, konten[h]);
        }
      }
      /* WP-24 (Review-Auflage A4a): Ein Kalender-Feed aus der Zeit vor WP-24 trägt keine Herkunft
         und hinge sonst nur an der Person. Die Sperre widerruft zusätzlich den herkunftslosen Feed der
         Person, an die der Code gebunden ist (Index feedperson:, lib/feedwiderruf.mjs). Ein Code ohne
         Betriebskennung (mandantId, vor dem ersten Anmelden nach D1) hat keinen eindeutigen Index —
         sein Altfeed hängt weiter an der Person (Grenze, docs/acc45/wp24-nachweis.md). */
      try {
        await herkunftsloseFeedsWiderrufen(store, erlaubt.map((h) => konten[h])
          .filter((k) => k && k.gesperrt && typeof k.bestand === "string" && typeof k.mandantId === "string"
            && k.person !== null && k.person !== undefined)
          .map((k) => ({ raum: k.bestand, mandantId: k.mandantId, personId: String(k.person) })));
      } catch { /* die Sperre gilt; der Altfeed bleibt bis zur Prüfung der Person */ }

      /* Laufende Sitzungen enden mit. Ein gesperrter Code, dessen Sitzung
         noch zwölf Stunden weiterläuft, ist nicht gesperrt. */
      let beendet = 0;
      const gesperrteHashes = new Set(erlaubt);
      try {
        beendet = (await sitzungenBeendenWenn((sit) => {
          /* Die Leitung sieht nur die Sitzungen des eigenen Hauses. Der
             Betreiber sperrt auch Zugänge fremder Räume — dann müssen
             deren Sitzungen ebenso enden, sonst ist die Sperre keine. */
          if (sB.rolle !== "betreiber" && sit.bestand !== sB.bestand) return false;
          /* Sitzungen aus der Zeit vor dieser Änderung tragen keine
             Kontokennung. Sie laufen binnen zwölf Stunden von selbst ab. */
          return !!sit.konto && gesperrteHashes.has(sit.konto);
        })).beendet;
      } catch { /* Sitzungen laufen ohnehin nach spätestens zwölf Stunden ab */ }

      await protokoll("zugaenge", kS, "erfolg", `${gesperrt} gesperrt · ${beendet} Sitzungen beendet`);
      return antwort({ ok: true, gesperrt, sitzungenBeendet: beendet });
    }

    /* --------------- Bestand für einen anderen Raum schreiben --------- */
    /* Der Betreiber legt den leeren Betrieb an, bevor sich jemand anmeldet. */
    if (pfad === "bestand-anlegen" && req.method === "POST") {
      const lB = await arbeitssitzungLesen(req, { store });
      const aB = await ungueltigesMerkmal(req, lB);
      if (aB) return aB;
      const sB = lB.sitzung;
      if (!sB || sB.rolle !== "betreiber") {
        await protokoll("zugaenge", kennung(req, null), "abgewiesen", "Raumanlage ohne Recht");
        return antwort({ fehler: "Nur für den Betreiber." }, 403);
      }
      /* Der einzige Weg, einen leeren Raum einzurichten (erstbefuellung.mjs).
         Ohne Angabe der eigene Raum der Betreibersitzung. „leer" und „test"
         baut der Server selbst; „demo" und ein eigener Inhalt werden
         übermittelt und geprüft — Betreiber heißt nicht ungeprüft. */
      const { bestand: zielAngabe, inhalt, vorlage, name: nameV, branche: brancheV } = rumpf;
      const ziel = zielAngabe || sB.bestand;
      if (!ziel || !/^[a-z0-9][a-z0-9_-]{2,79}$/i.test(String(ziel)))
        return antwort({ fehler: "Kein gültiger Raumname." }, 400);
      if (vorlage !== undefined && !VORLAGEN.includes(vorlage))
        return antwort({ fehler: "Unbekannte Vorlage." }, 400);
      if (await raumBelegt(store, ziel))
        return antwort({ fehler: "Dieser Raum ist bereits belegt." }, 409);
      const roh = (vorlage === "leer" || vorlage === "test")
        ? vorlageBestand(vorlage, { raum: ziel, name: nameV, branche: brancheV })
        : inhalt;
      if (!roh || typeof roh !== "object")
        return antwort({ fehler: "Unvollständig." }, 400);
      /* Personen: ein falscher Typ wird abgewiesen, eine fehlende Liste ergänzt (gestalt.mjs). */
      const personA = personenFehler(roh);
      if (personA) return antwort({ fehler: "Der Bestand ist ungültig.", text: personA.grund, feld: personA.feld }, 422);
      /* Moduleinstellungen (Schalter, Bestätigungen, Regelwerte, Modulprotokoll) bringt kein
         Inhalt mit — jeder Betrieb beginnt ohne (G1/G2/G6, WP-19.0 Nachtrag). */
      const angeglichen = bestandOhneModuleinstellungen(personenAngleichen(roh));
      /* Monatsabschluss und eingefrorenes Ist entstehen nur auf dem Server (POST /api/monatsabschluss) — aus
         einem übermittelten Inhalt werden sie verworfen (WP-16, Nachtrag N4), nie ungeprüft übernommen. */
      let neuerBestand = angeglichen && Array.isArray(angeglichen.mandanten)
        ? { ...angeglichen, mandanten: angeglichen.mandanten.map((x) => {
          if (!x || typeof x !== "object") return x;
          const { monatsabschluss: _ma, istEingefroren: _ie, ...rest } = x;
          void _ma; void _ie;
          return rest;
        }) }
        : angeglichen;
      /* Review N-D: die Demo bringt Beispielpakete, aber keinen Abrechnungsgrund und keinen Pilot mit. */
      if (vorlage === "demo") neuerBestand = demoOhneVertrag(neuerBestand);
      /* G9 (Review N3): eigener Inhalt durchläuft dieselbe Paketregel wie der Betreiber-PUT —
         Pakete unter Zustand 5 nur mit Pilot, Pilot/Zustimmungen/Grundlagen mit Servertag.
         Die Demo bringt ihre Beispielpakete mit (demoGestaltPruefen). */
      if (vorlage === undefined && Array.isArray(neuerBestand.mandanten))
        neuerBestand.mandanten = neuerBestand.mandanten.map((m) => paketfelderGeprueft(m, null));
      const formA = pruefeGestalt(neuerBestand);
      if (!formA.ok) return antwort({ fehler: "Der Bestand ist ungültig.", text: formA.grund }, 422);
      /* Standort- und Einsatzortangaben (Wertebereiche, Quelle, Art): dieselbe Prüfung wie am Schreibweg. */
      const ortA = bestandStandorteFehler(null, neuerBestand) || bestandDienstartOrtFehler(null, neuerBestand);
      if (ortA) return antwort({ fehler: "Der Bestand ist ungültig.", text: ortA }, 422);
      if (vorlage === "demo") {
        const demoGrund = demoGestaltPruefen(neuerBestand);
        if (demoGrund) return antwort({ fehler: "Das ist nicht die Demo.", text: demoGrund }, 422);
      }
      /* „Noch nicht belegt" und das Anlegen gehören unter eine Sperre: Zwei
         gleichzeitige Anlagen desselben Raums sahen sonst beide einen freien
         Raum, und die zweite überschrieb die erste. Die Prüfung oben bleibt
         als schnelle Absage; hier wird sie unter der Sperre wiederholt. */
      const angelegt = await unterRaumsperre(ziel, async () => {
        if (await raumBelegt(store, ziel)) return false;
        await bestandSchreiben(store, ziel, neuerBestand, { durch: "Betreiber" });
        return true;
      });
      if (!angelegt) return antwort({ fehler: "Dieser Raum ist bereits belegt." }, 409);
      await protokoll("zugaenge", kennung(req, sB), "erfolg",
        `Raum ${ziel} eingerichtet (${vorlage || "eigener Inhalt"}, ${neuerBestand.mandanten.length} Betrieb(e))`);
      return antwort({ ok: true, bestand: ziel, vorlage: vorlage || null,
        mandanten: neuerBestand.mandanten.map((m) => m.id) });
    }

    /* ------------------------- Demozugänge auflisten ----------------- */
    if (pfad === "demos" && req.method === "GET") {
      /* Schalter CENTRIC_DEMO (docs/DEMO-SCHALTER.md): aus = leere Liste,
         ohne Konten zu lesen, und nichts darf zwischengespeichert werden. */
      if (!demoAn()) return antwort({ demos: [] }, 200);
      /* Auch das Auflisten wird gebremst — sonst ist es ein ungedeckelter
         Aufruf, der bei jedem Treffer den kompletten Kontenbestand liest. */
      const bDemo = await bremse("demo", kennung(req, null));
      if (!bDemo.frei) return zuVielAntwort(bDemo.wartet);
      const konten = await alleKonten(store);
      /* `gesperrt` gehört hierher wie überall sonst. Es fehlte, und damit war
         das Zurückziehen eines Demozugangs wirkungslos: Er blieb in der
         öffentlichen Liste stehen und ließ sich weiter öffnen. Beim Anmelden
         und bei den Verwalterkonten wurde die Sperre geprüft, auf den beiden
         Demopfaden nicht — eine Sperre, die nur an drei von vier Türen
         gilt, ist keine. */
      const liste = Object.values(konten)
        .filter((k) => k.demo && k.id && k.rolle !== "betreiber" && !k.gesperrt)
        /* `betrieb` ist der Index des Mandanten im Raum. Die Konsole erkennt
           daran, ob zwei Einträge denselben Betrieb zeigen. */
        .map((k) => ({ id: k.id, name: k.name, rolle: k.rolle, gruppe: k.gruppe,
          bestand: k.bestand, betrieb: k.betrieb ?? 0, hinweis: k.hinweis }));
      return antwort({ demos: liste }, 200, { "cache-control": "public, max-age=60" });
    }

    /* ------------------- Ohne Code in einen Demozugang --------------- */
    if (pfad === "demo" && req.method === "POST") {
      /* Schalter: vor Bremse, Konten und Sitzung — keine Datei, kein Zähler. */
      if (!demoAn())
        return antwort({ ok: false, fehler: "Der Demozugang ist derzeit nicht freigeschaltet." }, 403);
      const kd = kennung(req, null);
      const bd = await bremse("demo", kd);
      if (!bd.frei) return zuVielAntwort(bd.wartet);
      const { id } = rumpf;
      const konten = await alleKonten(store);
      const [eintragSchluessel, eintrag] = Object.entries(konten)
        .find(([, k]) => k && k.demo && k.id === id) || [null, null];
      if (!eintrag) return antwort({ fehler: "Unbekannter Demozugang." }, 404);
      /* Ein zurückgezogener Zugang bleibt zurückgezogen — auch wenn seine
         Kennung noch jemand kennt. Die Liste verschweigt ihn zwar, aber sie
         ist nicht die Sicherung; diese Prüfung ist es. */
      if (eintrag.gesperrt) {
        await protokoll("demo", kd, "abgewiesen", "gesperrter Demozugang");
        return antwort({ fehler: "Dieser Zugang steht nicht mehr bereit." }, 403);
      }
      /* Ein Demozugang darf nur in einen Demoraum führen. Die Liste ist
         öffentlich und der Zugang braucht keinen Code — zeigte einer davon
         versehentlich auf einen echten Betrieb, wäre dieser öffentlich.
         Der Raumname trägt die Absicht, nicht nur ein Merkmal im Konto. */
      if (!String(eintrag.bestand || "").startsWith("demo-")) {
        await protokoll("demo", kd, "abgewiesen", `kein Demoraum: ${eintrag.bestand}`);
        return antwort({ fehler: "Dieser Zugang steht nicht als Demo bereit." }, 403);
      }
      /* Ein Demozugang darf niemals Betreiberrechte tragen. Die Liste der
         Demozugänge ist öffentlich — wäre die Betreiberrolle darunter,
         könnte jeder Datenräume anlegen und Zugangscodes erzeugen. */
      if (eintrag.rolle === "betreiber")
        return antwort({ fehler: "Dieser Zugang steht nicht als Demo bereit." }, 403);
      /* Ebenso keine Rolle, die es nicht gibt (Commit D1e). */
      if (!sitzungsRolleBekannt(eintrag.rolle))
        return antwort({ fehler: "Dieser Zugang steht nicht als Demo bereit." }, 403);
      const gelesenD = await bestandLesen(store, eintrag.bestand);
      const bindungD = codeBindung(gelesenD && gelesenD.bestand, eintrag);
      if (!bindungD.ok) {
        await protokoll("demo", kd, "abgewiesen", bindungD.grund);
        return antwort({ fehler: "Dieser Zugang passt nicht mehr zu seinem Betrieb." }, 403);
      }
      const { token, gueltigBis } = await sitzungAnlegen({
        bestand: eintrag.bestand, name: eintrag.name, rolle: eintrag.rolle,
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        mandantId: bindungD.mandantId,
        /* Die Prüfsumme des Zugangs mitführen — wie beim Anmelden mit Code.
           Sie fehlte hier, und damit lief die Sitzung eines zurückgezogenen
           Demozugangs bis zu zwölf Stunden weiter. */
        konto: eintragSchluessel,
        demo: true,
      }, 1000 * 60 * 60 * 12);
      return antwort({ token, name: eintrag.name, rolle: eintrag.rolle,
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        demo: true, gueltigBis });
    }

    /* ---------------------------- Anmelden --------------------------- */
    if (pfad === "anmelden" && req.method === "POST") {
      const k = kennung(req, null);
      const { zugangscode } = rumpf;
      /* Das Ziel ist der Betrieb, auf den der Code zeigt. Es wird aus dem
         Code abgeleitet, ohne ihn preiszugeben — so lässt sich ein
         verteilter Angriff auf einen bestimmten Betrieb erkennen, auch
         wenn er von hundert Adressen kommt. */
      /* Gezielt lesen statt den ganzen Bestand: zwei Zugriffe auf einen
         Schlüssel, nicht ein Blob mit allen Konten des Dienstes. */
      const neuS = ablageSchluessel(zugangscode);
      const altS = altHash(zugangscode || "");
      let eintragV = zugangscode ? await kontoLesen(store, neuS) : null;
      let fundSchluessel = eintragV ? neuS : null;
      let mussUmschluesseln = false;
      if (!eintragV && zugangscode && altS !== neuS) {
        eintragV = await kontoLesen(store, altS);
        if (eintragV) { fundSchluessel = altS; mussUmschluesseln = true; }
      }
      const fund = { eintrag: eintragV, schluessel: fundSchluessel,
        umschluesseln: mussUmschluesseln };
      const zielRaum = eintragV ? eintragV.bestand : null;
      const b = await bremse("anmelden", k, zielRaum);
      /* Ein Ausfall der Zählerablage bleibt nicht stumm (WP-46). */
      if (b.fehler) await protokoll("anmelden", k, "bremse-ausfall", b.fehler);
      if (!b.frei) { await protokoll("anmelden", k, "gebremst",
        `${b.grund}${b.dimension ? ` (${b.dimension})` : ""}`);
        return zuVielAntwort(b.wartet); }
      /* Die zweite Grenze im Prozessspeicher, wie bei anmelden-konto: Sie
         kann nicht ausfallen und deckelt auch das Gesamtaufkommen, wenn die
         Hauptbremse degradiert nur noch je Herkunft zählt. */
      const nb = notbremse("anmelden", k);
      if (!nb.frei) {
        await protokoll("anmelden", k, "notbremse", nb.dimension || null);
        return zuVielAntwort(nb.wartet);
      }
      if (!zugangscode || String(zugangscode).length < 6)
        return antwort({ fehler: "Zugangscode fehlt oder ist zu kurz." }, 400);

      const eintrag = eintragV;
      if (!eintrag) {
        // Gleichlange Antwortzeit, damit sich gültige und ungültige Codes
        // nicht anhand der Dauer unterscheiden lassen.
        await new Promise((r) => setTimeout(r, 240));
        await protokoll("anmelden", k, "abgewiesen");
        return antwort({ fehler: "Unbekannter Zugangscode.",
          ...(b.uebrig !== undefined && b.uebrig <= 3
            ? { hinweis: `Noch ${b.uebrig} Versuche, dann ist der Zugang kurz gesperrt.` } : {}) }, 401);
      }

      /* Gesperrt? Ein zurückgezogener Zugang bleibt als Eintrag stehen,
         damit derselbe Code nicht später erneut vergeben wird. */
      if (eintrag.gesperrt) {
        await protokoll("anmelden", k, "abgewiesen", "gesperrt");
        return antwort({ fehler: "Dieser Zugang wurde zurückgezogen.",
          text: "Bitte wende dich an die Organisationsleitung." }, 403);
      }

      /* Abgelaufen? Selbst angelegte Testbetriebe tragen ein Enddatum. Bis
         hierher wurde es geschrieben und nie gelesen — der Testzeitraum war
         damit unbegrenzt. */
      if (eintrag.laeuftAb && new Date(eintrag.laeuftAb).getTime() < Date.now()) {
        await protokoll("anmelden", k, "abgewiesen", "abgelaufen");
        return antwort({ fehler: "Der Testzeitraum ist abgelaufen.",
          text: "Melde dich bei uns, wenn du weitermachen möchtest — die Daten sind noch da." }, 403);
      }

      /* Eine Rolle, die es nicht gibt (Commit D1e): keine Sitzung. Vor dem
         Nachtragen der Betriebsbindung und vor dem Umschlüsseln — die
         Absage verändert nichts. Die Antwort nennt die Rolle nicht. */
      if (!sitzungsRolleBekannt(eintrag.rolle)) {
        await protokoll("anmelden", k, "abgewiesen", "unbekannte Rolle");
        return antwort({ fehler: "Dieser Zugang ist nicht nutzbar.",
          text: "Bitte wende dich an die Organisationsleitung." }, 403);
      }

      /* Eine Betreitersitzung läuft kürzer ab. Wer Datenräume anlegen kann,
         soll nicht zwölf Stunden lang auf einem fremden Rechner offen sein —
         die Dauer zur Rolle steht in lib/sitzungen.mjs (dauerFuer). */
      /* Der Code trägt die Kennung seines Betriebs. Zeigt seine Position
         nicht mehr darauf, gilt er nicht. Ein alter Code ohne Kennung in
         einem Raum mit genau einem Betrieb bekommt sie hier einmalig;
         in Räumen mit mehreren Betrieben wird nicht geraten. */
      /* Lastgrenzen für GÜLTIGE Codes (WP-47). Der Code war richtig; es geht
         nicht ums Raten, sondern darum, die Sitzungsablage und das Lesen des
         Bestands vor einer Welle zu schützen. Betreiberzugänge zählen nicht mit.
           1. je Code (Review-Auflage M1): Eine Skriptschleife mit dem eigenen
              Code verbraucht nur ihr eigenes Kontingent — sie erreicht die
              Grenze des Betriebs nicht und sperrt keine Kolleginnen.
           2. je Betrieb: die großzügige Grenze gegen eine echte Welle.
         Beide VOR dem Lesen des Bestands (Review-Auflage M3): Eine Abweisung
         kostet kein teures Lesen mehr. Die Kennung des Betriebs kommt deshalb
         aus dem Konto (bestand|mandantId), nicht aus der Bindungsprüfung.
         Bei einer Abweisung werden nur die Vermerke dieses Versuchs bei Ziel
         und Gesamt zurückgenommen (ein gültiger Code ist kein Rateversuch und
         soll den Betrieb nicht füllen); die Herkunft bleibt gezählt — entlastet
         wird sie nur bei einer gelungenen Anmeldung. Protokolliert wird die
         Abweisung, die eine Sperre setzt (`neu`); /gesund zählt jede. */
      if (eintrag.rolle !== "betreiber") {
        const lastAbweisung = async (bl, text) => {
          await vermerkeZuruecknehmen(b);
          notentlasten("anmelden", k, { nurGesamt: true });
          ereignis("429-last");
          if (bl.neu) await protokoll("anmelden", k, "gebremst", text);
          return zuVielAntwort(bl.wartet);
        };
        const bCode = lastbremse("anmelden-code", kennungCode(fund.schluessel));
        if (!bCode.frei) return lastAbweisung(bCode, "Lastgrenze je Code");
        const bLast = lastbremse("anmelden-erfolg", kennungRaum(`${eintrag.bestand}|${eintrag.mandantId ?? ""}`));
        if (!bLast.frei) return lastAbweisung(bLast, "Lastgrenze gelungener Anmeldungen");
      }
      const gelesenC = eintrag.rolle === "betreiber" ? null : await bestandLesen(store, eintrag.bestand);
      const bindungC = codeBindung(gelesenC && gelesenC.bestand, eintrag);
      if (!bindungC.ok) {
        await protokoll("anmelden", k, "abgewiesen", bindungC.grund);
        return antwort({ fehler: "Dieser Zugang passt nicht mehr zu seinem Betrieb.",
          text: "Bitte wende dich an die Organisationsleitung." }, 403);
      }
      /* Zweiter Faktor für Betreibercodes (WP-32b, lib/betreiber-zweifaktor.mjs):
         Einrichten, Abschalten und — wenn eingerichtet — Pflicht beim Anmelden.
         Andere Rollen kennen keine Aktion. */
      let zfAktiv = null;
      if (eintrag.rolle === "betreiber") {
        const zf = await betreiberZweifaktor({ store, k, rumpf, codeSchluessel: neuS,
          kontoSchluessel: fund.schluessel, altSchluessel: altS, name: eintrag.name });
        if (zf.antwort) return zf.antwort;
        zfAktiv = !!zf.aktiv;
      } else if (rumpf.zweifaktorAktion) {
        return antwort({ fehler: "Einen zweiten Faktor gibt es nur für Betreiberzugänge." }, 400);
      }
      if (bindungC.migrieren) {
        try {
          await kontoSchreiben(store, fund.schluessel, { ...eintrag, mandantId: bindungC.mandantId,
            gebunden: new Date().toISOString() });
        } catch { /* darf keine Anmeldung scheitern lassen; beim nächsten Mal erneut */ }
      }
      const { token, gueltigBis } = await sitzungAnlegen({
        bestand: eintrag.bestand, name: eintrag.name, rolle: eintrag.rolle,
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        mandantId: bindungC.mandantId,
        /* Die Prüfsumme des eigenen Zugangs mitführen: Nur so lässt sich
           beim Sperren aller Zugänge der eigene aussparen. */
        konto: fund.schluessel,
        /* Für die einheitsgenaue Schreibprüfung der Schichtverantwortung. */
        einheit: eintrag.einheit ?? eintrag.gruppe ?? null,
        /* Ein Demozugang bleibt auch mit Code ein Demozugang: keine Verwaltungswege (Betreiberentscheidung D.2). */
        ...(eintrag.demo === true ? { demo: true } : {}),
      }, dauerFuer(eintrag.rolle));
      /* Über den alten Schlüssel gefunden und ein Pfeffer ist da: still
         umschlüsseln. So wandert der Bestand ohne Sammelvorgang hinüber —
         jeder Code beim ersten Anmelden nach der Umstellung. */
      try {
        if (fund.umschluesseln) {
          /* Unter dem neuen Schlüssel ablegen, den alten stehen lassen —
             löschen könnte einen parallel laufenden Zugriff treffen. Er
             wird beim nächsten Sperren mit erfasst. */
          await kontoSchreiben(store, ablageSchluessel(zugangscode),
            { ...eintrag, umgeschluesselt: new Date().toISOString() });
          /* Die Sitzung trägt noch den alten Schlüssel (konto: fund.schluessel), und ein Kalender-Feed
             aus ihr trägt ihn als Herkunft. Damit eine Sperre des neuen Eintrags auch ihn trifft, vermerkt
             der alte, wer ihn ersetzt (WP-24, Review-Befund 3); feedherkunft.mjs folgt dem Vermerk. */
          await kontoSchreiben(store, fund.schluessel, { ...eintrag, ersetztDurch: ablageSchluessel(zugangscode) });
        } else {
          /* Aus dem Sammelblob auf einen Einzelschlüssel heben. */
          await kontoVereinzeln(store, fund.schluessel);
        }
      } catch { /* darf keine Anmeldung scheitern lassen */ }

      await entlasten("anmelden", k, b);
      notentlasten("anmelden", k);
      await protokoll("anmelden", k, "erfolg", eintrag.rolle);
      return antwort({ token, name: eintrag.name, rolle: eintrag.rolle,
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        hinweis: eintrag.hinweis || null, gueltigBis,
        ...(eintrag.demo === true ? { demo: true } : {}),
        ...(zfAktiv === null ? {} : { zweifaktor: zfAktiv }) });
    }

    /* ------------------------- Ab hier angemeldet -------------------- */
    /* Der Bestand wird je Anfrage höchstens einmal gelesen. Die Rolle der
       Sitzung ergibt sich aus der Person im Betrieb (siehe wirksameRolle),
       und dafür braucht es ihn schon, bevor ein Endpunkt ihn selbst holt. */
    let s0 = null;
    let bestandGelesen;
    /* Streng gelesen (H1, WP-45): Was hier gelesen wird, geht als Bestand mit
       Stand (etag) an die Oberfläche — und kommt mit demselben Stand zurück.
       Bis November 2026 las dieser Weg mild: Eine einzelne unlesbare Scherbe
       fehlte in der Antwort, der etag war trotzdem gültig. War die Scherbe
       beim Speichern wieder lesbar, galt der Stand als unverändert, und der
       Client-Stand ohne diesen Monat ersetzte den gespeicherten — der Monat
       war gelöscht. Jetzt: lieber 503 als ein Bestand mit Lücke. Für den
       ganzen Raum, solange die Scherbe unlesbar ist; so fällt der Schaden
       auch auf, statt still Monate zu verschlucken.

       Mild gelesen wird nur noch, wo nie ein Bestand zurückgeschrieben wird
       und nur Kern-Felder gebraucht werden: Codebindung beim Anmelden und
       bei Demo und Zugängen (unten/oben in dieser Datei), die Zustellung
       nach dem Speichern, Kalender, Zustellung, Betriebsauswahl,
       Arbeitssitzung, Provisionierung und Einrichten — dort führt ein
       Lesefehler über `voruebergehend` zu 503, eine Lücke in den Monaten
       spielt keine Rolle. */
    const bestandJetzt = async () => {
      if (bestandGelesen === undefined) bestandGelesen = await bestandLesenStreng(store, s0.bestand);
      return bestandGelesen;
    };

    /* Technisch gültig ist nicht fachlich gültig: Eine Sitzung, die aus
       einem Konto entstand, trägt einen Herkunftsanker — und der wird
       gegen Account, Mitgliedschaft und Generation geprüft. Beides passiert
       im einen Prüfpunkt (arbeitssitzung.mjs, arbeitssitzungLesen), derselbe
       wie in allen anderen Pfaden. Eine Sitzung aus einem Zugangscode hat
       keinen Anker und kostet dabei keinen einzigen zusätzlichen Lesevorgang.
       Nur dieser Pfad nimmt Sicherungsschlüssel an; seine Positivliste
       unten begrenzt sie auf das Lesen. Nach außen sieht ein Widerruf aus
       wie jede andere abgelaufene Sitzung — mehr muss niemand erfahren. */
    const lese = await arbeitssitzungLesen(req, { store, sicherungsschluessel: true,
      bestandLader: (sx) => { s0 = sx; return bestandJetzt(); } });
    if (!lese.sitzung) {
      if (lese.abgewiesen) {
        await protokoll("schreiben", kennung(req, null), "abgewiesen",
          `sitzung: ${String(lese.grund).slice(0, 24)}`);
      }
      return antwort({ fehler: "Nicht angemeldet." }, 401);
    }
    s0 = lese.sitzung;
    const s = (s0.nurSicherung || s0.rolle === "betreiber"
      || s0.person === null || s0.person === undefined) ? s0
      : { ...s0, rolle: wirksameRolle(s0, (await bestandJetzt())?.bestand) };

    /* Wer, auf welchem Weg, von wo — die Angaben, die ein Protokoll
       beantworten können muss. Ohne Namen, ohne Merkmale, ohne Inhalte. */
    /* Wer schreibt? Für den gemeinsamen Schreibpunkt (bestand.mjs): Mitwirkende an einer offenen Korrekturrevision (WP-16c). */
    schreibKontext.enterWith({ person: s.person ?? null });
    const wer = { rolle: s.rolle, person: s.person, weg: pfad,
      verfahren: req.method, herkunft: herkunft(req), mandantId: s.mandantId || null };

    /* Ein Sicherungsschlüssel darf genau einen Pfad, und zwar lesend.

       Der erste Entwurf verließ sich darauf, dass jeder Endpunkt selbst auf
       nurSicherung prüft. Die Prüfung hat das sofort widerlegt: Der Schlüssel
       trägt die Rolle „leitung", und PUT /bestand fragt nur nach der Rolle —
       ein Schlüssel, der ausdrücklich nur lesen sollte, konnte den ganzen
       Betrieb überschreiben.

       Deshalb hier eine Positivliste statt Einzelprüfungen: Was nicht
       ausdrücklich erlaubt ist, ist verboten. Wer eine Einzelprüfung
       vergisst, verliert damit nichts. */
    if (s.nurSicherung && !(pfad === "vollausgabe" && req.method === "GET")) {
      await protokoll("sicherungsschluessel", kennung(req, s), "abgewiesen",
        `${req.method} ${pfad}`, wer);
      return antwort({ fehler: "Dieser Schlüssel darf ausschließlich die Vollausgabe lesen.",
        text: "Für alles andere braucht es einen Zugangscode." }, 403);
    }


    /* Eine Sitzung mit einer Rolle, die es nicht gibt (Commit D1d), darf
       nichts außer sich abmelden. Entstehen konnte sie über /einrichten,
       das bis dahin jede Rollenbezeichnung annahm; ältere Konten mit einer
       solchen Rolle gibt es womöglich noch. Wie beim Sicherungsschlüssel:
       erlaubt ist, was ausdrücklich erlaubt ist. */
    /* Geprüft wird die gespeicherte Rolle der Sitzung und die wirksame
       (Commit D1e): Eine unbekannte Kontorolle wird nicht dadurch gültig,
       dass die gebundene Person im Betrieb eine bekannte Rolle hat. */
    if ((!sitzungsRolleBekannt(s0.rolle) || !sitzungsRolleBekannt(s.rolle)) && !(pfad === "abmelden" && req.method === "POST")) {
      await protokoll("schreiben", kennung(req, s), "abgewiesen", "unbekannte Rolle", wer);
      return antwort({ fehler: "Keine Berechtigung.", text: absageText(s.rolle) }, 403);
    }

    /* ------------------------------ Lesen ---------------------------- */
    /* Was hinausgeht, hängt an der Rolle. Eine Pflegekraft bekommt den Plan,
       aber nicht die Anschriften und Krankheitsgründe ihrer Kolleginnen —
       siehe lib/rechte.mjs. */
    if (pfad === "bestand" && req.method === "GET") {
      /* Lesen je Person (WP-47b, Review 1): ein Gerät sperrt nur sich selbst. */
      const bp = await bremse("bestandlesen", kennungPerson(s));
      if (!bp.frei) return zuVielAntwort(bp.wartet);
      /* Zusätzlich die Bytegrenze je Raum: unbekannte Größe zählt streng. Kurze Sperre. */
      const bg = await bremse("lesen-raum", kennungRaum(s.bestand), undefined,
        { versuche: lesenGrenze(raumBytes.get(String(s.bestand))?.bytes) });
      if (!bg.frei) return zuVielAntwort(bg.wartet);
      const mit = await bestandJetzt();
      if (mit) groesseMerken(s.bestand, mit.bestand);
      if (mit) bytesMerken(s.bestand, mit);
      if (!mit) return antwort({ bestand: null, etag: null,
        rolle: s.rolle, person: s.person, betrieb: s.betrieb, name: s.name,
        einheit: s.einheit ?? null, demo: s.demo === true, schreiben: schreibumfang(s.rolle), inhaber: stempelInhaber(s) });
      /* Ein gespeicherter Altbestand ohne gültige qualifikationen-Liste wird
         nur in der Antwort angeglichen — kein Schreibvorgang beim Lesen. */
      return antwort({ bestand: bestandFuerRolle(personenAngleichen(mit.bestand), s), etag: mit.stand,
        rolle: s.rolle, person: s.person, betrieb: s.betrieb, name: s.name,
        einheit: s.einheit ?? null, demo: s.demo === true, schreiben: schreibumfang(s.rolle), inhaber: stempelInhaber(s),
        geaendert: mit.zeit, durch: mit.durch });
    }

    /* ----------------- Auswertung für den Betriebsrat (WP-27) ---------- */
    /* Nur Aggregate, nur für den Betriebsrat mit audit.view. Gerechnet wird im
       Hintergrund in Häppchen (br-auswertung.mjs); bis sie fertig ist, kommt 202
       „wird berechnet" mit der Bitte, es gleich noch einmal zu versuchen — der
       Prozess blockiert nie. export.data steuert nur die Schaltfläche der
       Oberfläche: Der CSV-Export enthält genau diese Zahlen, nichts darüber hinaus. */
    if (pfad === "br-auswertung" && req.method === "GET") {
      const bl = await bremse("auswertung", kennung(req, s));
      if (!bl.frei) return zuVielAntwort(bl.wartet);
      if (s.rolle !== "betriebsrat" || !darf(s.rolle, "audit.view")) {
        await protokoll("lesen", kennung(req, s), "abgewiesen", `Auswertung Betriebsrat, Rolle ${s.rolle}`, wer);
        return antwort({ fehler: "Keine Berechtigung.", text: "Die Auswertung gibt es nur für den Betriebsrat." }, 403);
      }
      const mit = await bestandJetzt();
      const eigener = mit ? eigenerMandant(mit.bestand, s) : null;
      if (!mit || !eigener) return antwort({ fehler: "Keine Daten." }, 404);
      const r = auswertungHolen({ raum: s.bestand, heute: heuteBerlin(), mandant: eigener, ablage: store });
      /* Ein Betrieb ohne Kennung lässt sich keinem Ergebnis zuordnen: klarer Fehler statt endlos 202 (WP-27b, B6). */
      if (!r.fertig && r.ungueltig) return antwort({ fehler: "Betrieb ohne Kennung.", text: "Die Auswertung braucht die Kennung des Betriebs. Bitte die Einrichtung prüfen lassen." }, 409);
      if (!r.fertig) return antwort({ status: "berechnet", retryNachMs: r.ausgelastet ? 5000 : 1500 }, 202);
      return antwort({ status: "fertig", auswertung: r.wert, berechnetUm: r.berechnetUm });
    }

    /* ----------------------------- Schreiben ------------------------- */
    if (pfad === "bestand" && req.method === "PUT") {
      const ks = kennung(req, s);

      /* Erst die Rolle, dann alles andere. Wer gar nicht schreiben darf,
         soll auch keine Bremse und keinen Konfliktvergleich auslösen. */
      if (schreibumfang(s.rolle) === SCHREIBEN_NEIN) {
        await protokoll("schreiben", ks, "abgewiesen", `Rolle ${s.rolle}`, wer);
        return antwort({ fehler: "Keine Schreibberechtigung.",
          text: absageText(s.rolle) }, 403);
      }

      const bs = await bremse("schreiben", ks);
      if (!bs.frei) return zuVielAntwort(bs.wartet);
      const { bestand, etag, durch } = rumpf;
      if (!bestand || typeof bestand !== "object")
        return antwort({ fehler: "Kein Bestand übergeben." }, 400);

      /* Doppelte oder ungültige Kennungen der Betriebe sind ein Strukturfehler,
         kein Rechtefall — und werden vor jeder Zusammenführung abgewiesen, für
         jede Rolle. Ein zweites Exemplar des eigenen Betriebs war der Weg an
         der Einheitsprüfung vorbei (siehe gestalt.mjs). */
      const kennungen = mandantenKennungenGeprueft(bestand.mandanten);
      if (kennungen) {
        await protokoll("schreiben", ks, "abgewiesen", `Gestalt: ${kennungen.grund}`, wer);
        return antwort({ fehler: "Der Stand sieht unvollständig aus.",
          text: `${kennungen.grund} Es wurde nichts geändert.`, feld: kennungen.feld }, 422);
      }
      /* Eine falsch getypte Personenangabe des Absenders wird abgewiesen, nicht still zu [] gemacht. */
      const personS = personenFehler(bestand);
      if (personS) {
        await protokoll("schreiben", ks, "abgewiesen", `Gestalt: ${personS.grund}`, wer);
        return antwort({ fehler: "Der Stand sieht unvollständig aus.",
          text: `${personS.grund} Es wurde nichts geändert.`, feld: personS.feld }, 422);
      }

      /* Ab hier unter der Sperre des Raums (lib/raumsperre.mjs): Lesen,
         Zusammenführen, Prüfen und Schreiben als eine Folge. Gelesen wird
         deshalb hier noch einmal frisch, nicht der zwischengespeicherte
         Stand vom Anfang der Anfrage — der kann inzwischen von einem
         anderen Schreiber überholt sein, und dann rechnete das
         Zusammenführen mit einem Bestand, der nicht mehr gilt. Die
         Zustellung danach braucht die Sperre nicht. */
      const gesperrt = await unterRaumsperre(s.bestand, async () => {
        const jetzt = await bestandLesenStreng(store, s.bestand);

        /* B-9-1: Ein Schreibvorgang ohne ETag überschrieb auf einem vorhandenen Bestand still
           jede fremde Änderung. Jetzt: Ohne ETag wird nur geschrieben, wenn es noch keinen
           Bestand gibt (Erstanlage). Sonst 409 mit dem aktuellen Stand zum Neuladen. Gilt nur für
           diesen Endpunkt; interne Lese-Ändern-Schreiben-Abläufe halten ihre Sperre selbst. */
        const etagGueltig = (typeof etag === "string" || typeof etag === "number") && /^[0-9]+$/.test(String(etag));
        if (!etagGueltig && jetzt && jetzt.bestand) {
          await protokoll("schreiben", ks, "konflikt", "ohne ETag auf vorhandenem Bestand", wer);
          return antwort({ fehler: "konflikt",
            text: "Der Stand ist ohne Versionsangabe nicht überschreibbar. Bitte neu laden.",
            bestand: bestandFuerRolle(personenAngleichen(jetzt.bestand), s), etag: jetzt.stand,
            durch: jetzt.durch, zeit: jetzt.zeit }, 409);
        }

        /* Stempel-Integrität (WP-06, lib/stempelintegritaet.mjs): Ein
           gestempelter Wert ändert sich über diesen Weg nie — für keine
           Rolle. Geprüft wird die Übermittlung selbst, vor jeder
           Zusammenführung: Ein Widerspruch zum gespeicherten Stempel ist eine
           Absage (403, STEMPEL_UNVERAENDERLICH), keine stille Korrektur.
           Ausnahme: der Löschlauf der Leitung für Tage jenseits der
           Aufbewahrungsfrist. */
        const altNachId = new Map(((jetzt && jetzt.bestand && jetzt.bestand.mandanten) || [])
          .filter(Boolean).map((x) => [x.id, x]));
        const gesendetNachId = new Map((Array.isArray(bestand.mandanten) ? bestand.mandanten : [])
          .filter((x) => x && typeof x === "object").map((x) => [x.id, x]));
        const voll = schreibumfang(s.rolle) === SCHREIBEN_VOLL;
        const stempelO = { loeschlauf: voll, vollSicht: voll, heute: heuteBerlin(),
          unveraendert: await unveraenderteScherben(store, s.bestand, etag ?? null, jetzt) };
        for (const [id, gesendet] of gesendetNachId) {
          const w = stempelWiderspruch(altNachId.get(id) || null, gesendet, stempelO);
          if (w) {
            /* WP-16b: Der Schlüssel (Person|Tag) steht nicht im Text der Spur; der Tag steht im eigenen Feld (nur
               Auskunft nach Art. 15), die Betreiber-Lage zeigt ihn nicht (spurFuerBetreiber). */
            const tagS = typeof w.schluessel === "string" ? (w.schluessel.split("|")[1] || "") : "";
            await protokoll("schreiben", ks, "abgewiesen", `Stempel-Integrität: ${w.grund}`, { ...wer, tag: tagS });
            return antwort({ fehler: "Keine Schreibberechtigung.", code: "STEMPEL_UNVERAENDERLICH",
              text: w.grund }, 403);
          }
          /* Monatsabschluss (WP-16, lib/monatsabschluss.mjs): Ist-Zeiten und Stempel eines
             abgeschlossenen Monats ändern sich über das Speichern für keine Rolle — weder
             ändern noch anlegen noch löschen (Ausnahme: Löschlauf nach Fristablauf). Erst
             nach dem Wiederöffnen durch die Leitung. */
          const wa = abschlussWiderspruch(altNachId.get(id) || null, gesendet, stempelO);
          if (wa) {
            await protokoll("schreiben", ks, "abgewiesen", `Monat abgeschlossen ${wa.monat}`, wer);
            return antwort({ fehler: "Keine Schreibberechtigung.", code: MONAT_ABGESCHLOSSEN, monat: wa.monat,
              text: wa.grund }, 403);
          }
        }

        /* Grundlage ist der gespeicherte Stand, nicht der übermittelte. Eine
           eingeschränkte Rolle kann damit nichts überschreiben, was sie beim
           Lesen gar nicht bekommen hat. */
        /* Gegen dieselbe Form zusammenführen, die GET ausgeliefert hat
           (personenAngleichen, WP-12): Sonst gilt eine Person, die im Altstand
           kein `qualifikationen` trägt, beim unveränderten Zurückschreiben als
           geändert — und die Schichtverantwortung bekam 403. */
        /* Vierter Review N-1: Die Lesezeit des gespeicherten Stands wird VOR dem Zusammenführen
           festgehalten. Ein Löschvermerk (am = jetzt) entsteht erst darin; die Sicherung „vor Verlust"
           zeigt den Stand vor dieser Änderung und trägt deshalb diese frühere Zeit — nie eine spätere. */
        const lesezeit = new Date().toISOString();
        let zuSchreiben = zusammenfuehren(jetzt ? personenAngleichen(jetzt.bestand) : null, bestand, s, { fachpruefung: "aussen" });
        if (!zuSchreiben) {
          await protokoll("schreiben", ks, "abgewiesen", `Rolle ${s.rolle}`, wer);
          return antwort({ fehler: "Keine Schreibberechtigung.",
            text: absageText(s.rolle) }, 403);
        }
        if (zuSchreiben.verweigert && zuSchreiben.status === 409 && Array.isArray(zuSchreiben.fachbefunde)) {
          /* WP-22: Warnende Befunde ohne Bestätigung — 409 mit der Befundliste
             (Texte neutral aus dem Befundkatalog). Der Stand bleibt; die
             Oberfläche fragt nach und schickt die Bestätigung mit. */
          await protokoll("schreiben", ks, "bestaetigung-noetig", `${zuSchreiben.fachbefunde.length} Einteilungen`, wer);
          return antwort({ fehler: zuSchreiben.verweigert, fachbefunde: zuSchreiben.fachbefunde,
            etag: jetzt ? jetzt.stand : null }, 409);
        }
        if (zuSchreiben.verweigert) {
          await protokoll("schreiben", ks, "abgewiesen", zuSchreiben.verweigert, wer);
          return antwort({ fehler: "Keine Schreibberechtigung.",
            text: zuSchreiben.verweigert }, 403);
        }

        /* Die offene Fachprüfung (WP-22) hängt am Ergebnis von zusammenfuehren (WeakMap) —
           vor jedem Umbau von zuSchreiben holen, sonst ginge sie verloren (die Sperren wären wirkungslos). */
        /* ACHTUNG Reihenfolge: Die offene Fachprüfung (Mutterschutz, Jugendschutz …) hängt als
           WeakMap-Eintrag (OFFENE_PRUEFUNG in rechte.mjs) am OBJEKT, das zusammenfuehren
           zurückgab. stempelSichern (unten) baut ein neues Objekt; wer hier erst danach fragt,
           bekommt null — und jede Sperre ist wirkungslos. Test: stempel-fachpruefung.test.js. */
        const offen = fachpruefungOffen(zuSchreiben);
        let stempelVerworfen = 0;

        /* Gespeichert werden die gespeicherten Stempel (Stempel-Integrität,
           siehe oben) — in den Monaten, die die Übermittlung unverändert
           kennt; in den übrigen entscheidet der Drei-Wege-Abgleich. */
        {
          let geloescht = 0;
          zuSchreiben = { ...zuSchreiben, mandanten: (zuSchreiben.mandanten || []).map((x) => {
            if (!x || typeof x !== "object") return x;
            const r = stempelSichern(altNachId.get(x.id) || null, gesendetNachId.get(x.id), x, stempelO);
            geloescht += r.geloescht;
            stempelVerworfen += r.verworfen;
            return r.mandant;
          }) };
          /* B-N3: Das Löschen abgelaufener Stempel per Speichern (Löschlauf der Leitung, geloescht)
             ist bewusst nicht an den Modus des Datenschutzlaufs gekoppelt: Der Modus steuert den
             täglichen Lauf des Servers; die Leitung löscht in der Oberfläche von Hand, wenn die Frist
             abgelaufen ist (Art. 5 Abs. 1 lit. e DSGVO, mindestens 24 Monate). Es steht im
             Betriebsprotokoll des Servers. */
          if (geloescht) await protokoll("schreiben", ks, "loeschlauf",
            `${geloescht} Stempel nach Ablauf der Aufbewahrungsfrist gelöscht`, wer);
          if (stempelVerworfen) await protokoll("schreiben", ks, "stempel-verworfen",
            `${stempelVerworfen} Einträge jenseits der Aufbewahrungsfrist aus einer älteren Kopie nicht übernommen`, wer);
        }

        /* Fachprüfung (WP-22) in Häppchen, damit eine große Nachrechnung keinen
           anderen Betrieb aufhält (Review B2): höchstens HAEPPCHEN_MS am Stück,
           insgesamt höchstens ZEITBUDGET_MS — sonst 503 „bitte erneut". Eine
           Strukturänderung (Schichtfolge, Dienstzeiten, Personen …) ist je
           Raum gebremst. */
        if (offen) {
          if (strukturAenderung(offen.alt, offen.neu)) {
            const sb = strukturBremse(`${s.bestand}|${offen.mandantId}`);
            if (!sb.frei) return zuVielAntwort(sb.wartet);
          }
          const fach = await fachpruefungUebermittlungAsync(offen.alt, offen.neu, undefined, { imBereich: offen.imBereich });
          if (letzteLaufzeit && (letzteLaufzeit.mittelbar || letzteLaufzeit.ms >= 300))
            console.log(`[schutzdurchsetzung] ${letzteLaufzeit.ms} ms (längster Block ${letzteLaufzeit.blockMs} ms), ${letzteLaufzeit.personen} Personen, ${letzteLaufzeit.geprueft} Einteilungen geprüft`);
          if (fach && fach.zeitbudget) {
            await protokoll("schreiben", ks, "zeitbudget", "Fachprüfung abgebrochen", wer);
            return antwort({ fehler: "Die Prüfung dauert gerade zu lange.",
              text: "Bitte die Strukturänderung in kleineren Schritten speichern — etwa die Schichtfolge nur für einen Teil der Einheiten — oder gleich noch einmal versuchen." }, 503);
          }
          if (fach && fach.sperre) {
            await protokoll("schreiben", ks, "abgewiesen", fach.sperre, wer);
            return antwort({ fehler: "Keine Schreibberechtigung.", text: fach.sperre }, 403);
          }
          if (fach && fach.warnungen) {
            await protokoll("schreiben", ks, "bestaetigung-noetig", `${fach.warnungen.length} Einteilungen`, wer);
            return antwort({ fehler: "Diese Änderung braucht eine Bestätigung.", fachbefunde: fach.warnungen,
              sammelVorschlag: fach.sammelVorschlag || [], etag: jetzt ? jetzt.stand : null }, 409);
          }
          if (Array.isArray(zuSchreiben.mandanten))
            zuSchreiben = { ...zuSchreiben, mandanten: zuSchreiben.mandanten.map((m) => (m && m.id === offen.mandantId ? sammelAnzahlSetzen(m, fach && fach.sammel, offen.alt) : m)) };
          if (fach && fach.konflikte && Array.isArray(zuSchreiben.mandanten))
            zuSchreiben = { ...zuSchreiben, mandanten: zuSchreiben.mandanten.map((m) => (m && m.id === offen.mandantId ? schutzKonfliktMitteilungen(offen.alt, m, fach.konflikte, s.person) : m)) };
        }

        zuSchreiben = personenAngleichen(uebergabenAngleichen(zuSchreiben));
        groesseMerken(s.bestand, zuSchreiben);

        /* Einwilligungen nach dem Mutterschutzgesetz (Review N1): dass sie sich
           geändert haben, steht im Betriebsprotokoll — ohne Inhalt, ohne Person. */
        const einw = einwilligungsAenderungen(jetzt ? jetzt.bestand : null, zuSchreiben);
        if (einw) await protokoll("schreiben", ks, "einwilligung-geaendert", `${einw} Person(en)`, wer);
        /* Branchenmodule (WP-19.0): geschaltet, Mitbestimmung bestätigt, Regelwert gesetzt — nur Modul und
           Art, ohne Person, Grundlage oder Person|Tag (WP-14b, M1). Wer, steht im Modulprotokoll des Betriebs. */
        for (const z of modulProtokollZeilen(jetzt ? jetzt.bestand : null, zuSchreiben)) await protokoll("schreiben", ks, "branchenmodul", z, wer);
        /* Rücknahme einer Planfreigabe (WP-23b): ohne Monat, nur die Zahl. */
        const frei = freigabeRuecknahmen(jetzt ? jetzt.bestand : null, zuSchreiben);
        {
          const altMd = jetzt && jetzt.bestand && Array.isArray(jetzt.bestand.mandanten) ? jetzt.bestand.mandanten : [];
          let weg = 0;
          for (const m of (Array.isArray(zuSchreiben.mandanten) ? zuSchreiben.mandanten : [])) weg += schutzEntferntAnzahl(altMd.find((a) => a && m && a.id === m.id), m);
          if (weg) await protokoll("schreiben", ks, "schutzangaben-entfernt", `${weg} Person(en)`, wer);
        }

        /* Form prüfen, bevor geschrieben wird. Die Rechteprüfung schützt vor
           fremdem Zugriff, nicht vor der eigenen fehlerhaften Anwendung — und
           ein halb übertragenes Objekt ersetzte bisher den ganzen Betrieb. */
        /* Standortangaben (Geo V1): neue oder geänderte Koordinaten und Umkreise
           nur in gültigen Bereichen — auch bei einem direkten Aufruf. */
        const standortGrund = bestandStandorteFehler(jetzt ? jetzt.bestand : null, zuSchreiben)
          || bestandDienstartOrtFehler(jetzt ? jetzt.bestand : null, zuSchreiben);
        if (standortGrund) {
          await protokoll("schreiben", ks, "abgewiesen", `Standort: ${standortGrund}`, wer);
          return antwort({ fehler: "Ungültige Standortangabe.", text: `${standortGrund} Es wurde nichts geändert.` }, 422);
        }

        const form = pruefeGestalt(zuSchreiben, { vorher: jetzt ? jetzt.bestand : null });
        if (!form.ok) {
          await protokoll("schreiben", ks, "abgewiesen", `Gestalt: ${form.grund}`, wer);
          return antwort({ fehler: "Der Stand sieht unvollständig aus.",
            text: `${form.grund} Es wurde nichts geändert — bitte lade die Seite neu `
              + "und versuch es erneut.", feld: form.feld || null }, 422);
        }

        /* Auffälliger Verlust wird nicht abgelehnt — es gibt gute Gründe, viel
           zu löschen —, aber vorher gesichert. Eine Sicherung, die niemand
           angefordert hat, ist genau dann wertvoll, wenn es niemand kommen sah. */
        if (jetzt) {
          const schrumpf = schrumpfung(jetzt.bestand, zuSchreiben);
          if (schrumpf.anteil >= SICHERUNGSSCHWELLE) {
            const marke = markeNeu();
            await store.setJSON(`sicherung:${s.bestand}:${marke}`, jetzt.bestand,
              { metadata: { zeit: lesezeit,
                durch: `automatisch vor Verlust von ${Math.round(schrumpf.anteil * 100)} %`,
                automatisch: "ja", zeitquelle: "lesezeit" } }).catch(() => {});
            await sicherungenAusduennen(store, s.bestand);
            await protokoll("schreiben", ks, "gesichert",
              `${schrumpf.vorher} → ${schrumpf.nachher} Datensätze`, wer);
          }
        }

        /* Geschrieben wird je Monat. Zwei Planer, die an verschiedenen Monaten
           arbeiten, kollidieren dadurch nicht mehr — und wenn sie es doch tun,
           sagt die Absage, welcher Monat betroffen ist. */
        const erg = await bestandSchreiben(store, s.bestand, zuSchreiben, {
          erwarteterStand: etag ?? null,
          durch: durch || s.name || "unbekannt",
        });

        if (!erg.ok) {
          await protokoll("schreiben", ks, "konflikt",
            (erg.monate || []).join(", ") || "unbestimmt", wer);
          const monate = erg.monate || [];
          return antwort({ fehler: "konflikt",
            text: erg.kernBetroffen
              ? "Jemand anderes hat inzwischen die Stammdaten geändert."
              : monate.length
                ? `Jemand anderes hat inzwischen ${monate.length > 1 ? "dieselben Monate" : "denselben Monat"} bearbeitet: ${monate.join(", ")}.`
                : "Jemand anderes hat inzwischen gespeichert.",
            monate, kernBetroffen: !!erg.kernBetroffen,
            bestand: bestandFuerRolle(personenAngleichen(erg.bestand), s), etag: erg.stand,
            durch: erg.durch, zeit: erg.zeit }, 409);
        }

        /* Erst nach dem erfolgreichen Schreiben (Nachtrag N2): eine abgewiesene oder verlorene Übermittlung
           nimmt nichts zurück und steht deshalb nicht als Rücknahme im Protokoll. */
        if (frei) await protokoll("schreiben", ks, "freigabe-zurueckgenommen", `${frei} Monat(e)`, wer);
        await protokoll("schreiben", ks, "erfolg",
          `${erg.geschrieben} Stücke · ${s.rolle}`
          + (erg.zusammengefuehrt ? ` · zusammengeführt: ${erg.zusammengefuehrt.join(", ")}` : ""), wer);
        return { erg, jetzt, zuSchreiben, stempelVerworfen };
      });
      if (gesperrt instanceof Response) return gesperrt;
      const { erg, jetzt, zuSchreiben, stempelVerworfen } = gesperrt;

      /* Notruf- und Tauschmitteilungen, die der Server eben erzeugt hat,
         stellt er selbst zu (Commit 4) — nach dem Speichern, aus dem
         gespeicherten Stand. Ein Versandfehler ändert nichts am gespeicherten
         Vorgang und nichts an dieser Antwort; der Status je Kanal liegt in
         der Ablage (lib/versand.mjs). */
      try {
        const altM = jetzt ? eigenerMandant(jetzt.bestand, s) : null;
        const ids = neueServermitteilungen(altM, eigenerMandant(zuSchreiben, s));
        if (ids.length) {
          const danach = await bestandLesen(store, s.bestand);
          const mD = danach && danach.bestand ? eigenerMandant(danach.bestand, s) : null;
          if (mD) await zustellen(store, { raum: s.bestand, bestand: danach.bestand, m: mD, ids });
        }
      } catch (e) {
        await protokoll("fehler", ks, "zustellung", String(e && e.message || e).slice(0, 200)).catch(() => {});
      }
      /* WP-30: Wer aus dem Betrieb entfernt wurde, verliert Push-Anmeldung,
         Adresssperre, Kontingentplätze und den Zustellstatus seiner
         Mitteilungen (DSGVO Art. 17). Die tägliche Aufräumarbeit fängt
         Reste ab (zustellungAufraeumen, Waisen). */
      try {
        for (const mAlt of (jetzt && Array.isArray(jetzt.bestand && jetzt.bestand.mandanten) ? jetzt.bestand.mandanten : [])) {
          const mNeu = (Array.isArray(zuSchreiben && zuSchreiben.mandanten) ? zuSchreiben.mandanten : []).find((x) => x && x.id === mAlt.id);
          if (!mNeu || !Array.isArray(mNeu.personen) || !Array.isArray(mAlt.personen)) continue;
          const da = new Set(mNeu.personen.map((p) => String(p && p.id)));
          for (const p of mAlt.personen) {
            if (!p || da.has(String(p.id))) continue;
            const ids = (Array.isArray(mAlt.nachrichten) ? mAlt.nachrichten : []).filter((n) => n && String(n.personId) === String(p.id)).map((n) => String(n.id));
            await personBereinigen(store, s.bestand, mAlt.id, p.id, ids);
          }
        }
      } catch (e) {
        await protokoll("fehler", ks, "zustellung-bereinigen", String(e && e.message || e).slice(0, 200)).catch(() => {});
      }
      /* Review N-E: Änderungen an Paketen, Zustimmungen, Grundlagen und Pilot stehen im Serverprotokoll
         (ohne Freitexte). Ein Protokollfehler ändert nichts am gespeicherten Vorgang. */
      if (s.rolle === "betreiber") {
        try {
          for (const z of paketAenderungen(jetzt ? jetzt.bestand : null, zuSchreiben))
            await protokoll("schreiben", ks, "paket", z, wer);
        } catch { /* egal */ }
      }
      return antwort({ ok: true, etag: erg.stand,
        /* Review N-A: der Betreiber bekommt den gespeicherten Vertragsstand der Pakete zurück. */
        vertragsstand: s.rolle === "betreiber" ? vertragsstandVon(zuSchreiben) : undefined,
        zusammengefuehrt: erg.zusammengefuehrt || null,
        ...(stempelVerworfen ? { hinweis: `${stempelVerworfen} Einträge jenseits der Aufbewahrungsfrist waren schon gelöscht und wurden aus der älteren Kopie nicht übernommen. Bitte neu laden.` } : {}) });
    }

    /* ------------------------------ Stempeln ------------------------- */
    /* Bis hierher meldete der Browser die Koordinaten, rechnete den Abstand
       und entschied selbst `innerhalb: true` — dieses Urteil wurde als
       Tatsache gespeichert. Wer die Anwendung umging oder dem Browser andere
       Koordinaten unterschob, stempelte sich von überall am Einsatzort ein.
       Für eine Zeiterfassung, die im Streitfall etwas belegen soll, war das
       wertlos.

       Jetzt kommen nur die Rohkoordinaten herein. Der Standort, der Radius
       und die Entscheidung liegen hier; die Zeit ebenfalls, denn eine
       gestellte Uhr im Gerät ist genauso leicht zu ändern. */
    if (pfad === "stempeln" && req.method === "POST") {
      /* Eigene Bremsarten (WP-47, Nachweis WP-28): je Person, und je Raum als Deckel
         nach Betriebsgröße. Die Planung (schreiben, 120/min) bleibt davon
         unberührt, ein Schichtwechsel blockiert sie nicht. Eine Abweisung ist eine
         LASTabweisung: gezählt für /gesund, mit Retry-After; gestempelt ist dann
         NICHTS — die Oberfläche wiederholt (speicher.js). */
      const kSt = kennung(req, s);
      const bSt = lastbremse("stempeln", kennungPerson(s));
      /* Protokolliert wird nur die Abweisung, die die Sperre SETZT (`neu`,
         Review-Auflage M2) — eine Datei je Abweisung wäre unter Last genau die
         Plattenarbeit, die die Lastbremse vermeiden soll. /gesund zählt jede. */
      if (!bSt.frei) {
        ereignis("429-last");
        if (bSt.neu) await protokoll("schreiben", kSt, "gebremst", "stempeln (Person)", wer);
        return zuVielAntwort(bSt.wartet);
      }
      const bRaum = lastbremse("stempeln-raum", kSt, stempelDeckel(raumGroesse.get(String(s.bestand))));
      if (!bRaum.frei) {
        ereignis("429-last");
        if (bRaum.neu) await protokoll("schreiben", kSt, "gebremst", "stempeln (Raum)", wer);
        return zuVielAntwort(bRaum.wartet);
      }

      /* `datum` des Geräts nur noch zur Plausibilität — den Tag bestimmt der
         Server (zeiterfassung.mjs, stempelZiel; Geo-Spezifikation B7). */
      const { datum: geraeteDatum, art, lat, lon, accuracy, positionGrund } = rumpf;
      if (art !== "start" && art !== "ende")
        return antwort({ fehler: "Nur start oder ende." }, 400);
      if (s.person === null || s.person === undefined)
        return antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);

      /* Die eigene Zeit, nicht die des Geräts — einmal gelesen, für Datum,
         Uhrzeit und die 20-Stunden-Grenze. Gelesen beim Eintreffen der
         Anfrage, nicht erst, wenn die Sperre frei ist: Gestempelt hat der
         Mensch, als er gedrückt hat, nicht als der Server dazu kam. Eine
         Wiederholung nach einem Konflikt behält dieselbe Zeit. */
      const eingang = new Date();
      /* Offline-Ereignis (WP-07, zeiterfassung.mjs stempelEreignis): Kennung,
         Erfassungszeit des Geräts, plausibilisiert gegen den Eingang. Ein
         Ereignis, das gleich ankommt, behält die Serverzeit. */
      const stEreignis = stempelEreignis(rumpf, eingang);
      if ("fehler" in stEreignis)
        return antwort({ fehler: stEreignis.fehler, code: "STEMPEL_EREIGNIS_UNGUELTIG" }, 400);
      const inhaber = stempelInhaber(s);
      /* Ein Ereignis aus der Warteschlange einer anderen Person (Gerät
         geteilt, abgemeldet, neu angemeldet): nie unter dieser Sitzung
         stempeln. Die Oberfläche lässt es liegen, bis die richtige Person
         angemeldet ist. */
      if (rumpf.inhaber !== undefined && rumpf.inhaber !== null && rumpf.inhaber !== inhaber) {
        await protokoll("schreiben", kSt, "abgewiesen", `stempeln ${art}: Warteschlange einer anderen Sitzung`, wer);
        return antwort({ fehler: "Dieser Stempel wurde unter einer anderen Anmeldung erfasst.",
          text: "Der Stempel bleibt auf dem Gerät, bis sich die Person anmeldet, die ihn erfasst hat.",
          code: "STEMPEL_FREMDE_SITZUNG" }, 409);
      }
      const jetzt0 = stEreignis.zeitpunkt;

      /* Gebaut wird der Stempel unter der Sperre des Raums, aus dem frisch
         gelesenen Stand (WP-02). Vorher entstand er aus dem Stand vom Anfang
         der Anfrage und wurde mit diesem Stand als Erwartung geschrieben.
         Stempelten zwei Menschen in derselben Minute, schrieben beide in
         dieselbe Monatsscherbe — ohne Sperre ging einer still verloren, mit
         Sperre allein bekäme der zweite einen Konflikt, obwohl sich die
         beiden Stempel gar nicht berühren. Aus dem frischen Stand gebaut,
         reiht sich jeder Stempel einfach hinter den vorigen.

         Ein echter Konflikt kann dann nur noch von einem Schreiber kommen,
         der an der Sperre vorbeischreibt. Dafür bis zu drei Wiederholungen,
         jede wieder aus dem frischen Stand. Bleibt es erfolglos: 409 mit
         klarer Meldung, nie „ok: true" (bis Oktober 2026 kam auch nach
         einem gescheiterten Schreiben ein Erfolg zurück, und die Oberfläche
         zeigte eine Stempelzeit, die es auf dem Server nicht gab). */
      let zielDatum = null;
      const ergebnis = await unterRaumsperre(s.bestand, async () => {
        for (let versuch = 0; versuch <= STEMPEL_WIEDERHOLUNGEN; versuch++) {
          const mit = await bestandLesenStreng(store, s.bestand);
          if (!mit) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
          const bestand = mit.bestand;
          groesseMerken(s.bestand, bestand);
          const i = Number(s.betrieb);
          const m = (Array.isArray(bestand.mandanten) && bestand.mandanten[i])
            ? bestand.mandanten[i] : (bestand.mandanten || [])[0];
          if (!m) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);

          const person = (m.personen || []).find((x) => String(x.id) === String(s.person));
          if (!person) return antwort({ fehler: "Person nicht gefunden." }, 404);

          /* Idempotenz (WP-07): Steht die Kennung schon an einem Stempel dieser
             Person, war das Ereignis schon da — eine Wiederholung nach
             verlorener Antwort, ein zweiter Reiter, ein zweites Gerät. Kein
             zweiter Stempel, sondern die Antwort des ersten. Geprüft unter der
             Sperre am frischen Stand: Von zwei gleichzeitigen Wiederholungen
             schreibt genau eine. */
          const schon = ereignisFinden(m, person.id, stEreignis.id, heuteBerlin(eingang), heuteBerlin(jetzt0));
          /* Dieselbe Kennung für eine andere Art ist kein Wiederholen, sondern ein
             Widerspruch (Review L2) — nichts speichern, klar absagen. */
          if (schon && schon.art !== art) {
            await protokoll("schreiben", kSt, "abgewiesen", `stempeln ${art}: Kennung schon für ${schon.art} vergeben`, wer);
            return antwort({ fehler: "Diese Stempelkennung gehört zu einem anderen Stempelereignis.",
              code: "STEMPEL_EREIGNIS_WIDERSPRUCH" }, 422);
          }
          if (schon) return { wiederholt: schon, stand: mit.stand,
            erfassung: (m.erfassung || {})[schon.schluessel] || null };

          /* Review L3: Ein offline erfasstes Ende, das nur um eine ehrliche
             kleine Uhrabweichung (höchstens UHR_TOLERANZ_MS) vor dem offenen
             Beginn von heute oder gestern liegt, wird auf den Beginn
             geklemmt — sonst ergäbe sich eine negative Dauer und
             START_VERALTET, obwohl nichts veraltet ist. */
          let jetzt = jetzt0;
          if (art === "ende" && stEreignis.offline) {
            for (const tag of [heuteBerlin(jetzt0), heuteBerlin(new Date(jetzt0.getTime() - 86400000))]) {
              const e0 = (m.einstempeln || {})[`${person.id}|${tag}`];
              const ab = e0 && e0.start && !e0.ende ? Date.parse(e0.startAm) : NaN;
              if (Number.isFinite(ab) && ab > jetzt0.getTime() && ab - jetzt0.getTime() <= UHR_TOLERANZ_MS) { jetzt = new Date(ab); break; }
            }
          }
          const heute = heuteBerlin(jetzt);
          const zeit = uhrzeitBerlin(jetzt);

          /* Der Tag des Stempels kommt vom Server: Beginn heute, Ende beim
             offenen Vorgang (Nachtdienst über Mitternacht, 20-Stunden-Grenze,
             vergessenes Einstempeln vor einem Nachtdienst). Das Gerätedatum wird
             ignoriert; weicht es ab, trägt der Eintrag GERAETEDATUM_ABWEICHEND —
             nie eine Absage (zeiterfassung.mjs, stempelZiel). Bestimmt am
             frischen Stand, unter der Sperre. */
          const ziel = stempelZiel(m, person, art, jetzt, geraeteDatum);
          if (ziel.status) {
            await protokoll("schreiben", kSt, "abgewiesen",
              `stempeln ${art}: ${ziel.code}`, { ...wer, tag: geraeteDatum });
            return antwort({ fehler: ziel.grund, code: ziel.code, datum: ziel.datum || null }, ziel.status);
          }
          const datum = ziel.datum;
          zielDatum = datum;

          /* Spur (WP-14b, M1) ohne Person, Tag und Uhrzeit — nur Art und Monat; Person, Tag und Zeit stehen am
             Abschluss (abgewiesen), sichtbar nur für Planung und Leitung. */
          /* Monatsabschluss (WP-16): Ein Stempel, der in einen abgeschlossenen Monat fällt —
             meist ein offline erfasster, der erst nach dem Abschluss ankommt (WP-07) —, ändert
             den Monat nicht. Er geht aber auch nicht still verloren: Die Leitung sieht ihn am
             Abschluss (`abgewiesen`, je Ereigniskennung einmal; die Ist-Daten und ihre
             Prüfsumme bleiben unverändert), das Gerät zeigt die Absage mit Grund und kann ihn
             nach dem Wiederöffnen erneut senden. 409 ist für den Puffer eine endgültige Absage
             (kein Wiederholen in Schleife). Geprüft unter der Raumsperre am frischen Stand:
             Abschluss und Stempel kommen nacheinander, nie durcheinander. */
          const sperreM = abschlussSperre(m, String(datum));
          if (sperreM) {
            const vermerkt = abgewiesenVermerken(m, sperreM.monat, { personId: person.id, datum: String(datum), art, zeit: uhrzeitBerlin(jetzt),
              zeitAm: jetzt.toISOString(), offline: !!stEreignis.offline, ereignis: stEreignis.id || null, am: eingang.toISOString() });
            if (vermerkt !== m) {
              const ergV = await bestandSchreiben(store, s.bestand,
                { ...bestand, mandanten: bestand.mandanten.map((x) => (x === m ? vermerkt : x)) },
                { erwarteterStand: mit.stand, durch: s.name || "Stempeluhr" });
              if (!ergV.ok) continue;                                   // aus dem frischen Stand noch einmal
            }
            await protokoll("schreiben", kSt, "abgewiesen",
              `stempeln ${art}: Monat abgeschlossen ${sperreM.monat}${stEreignis.offline ? " · offline" : ""}`, wer);
            return antwort({ fehler: sperreM.grund, code: MONAT_ABGESCHLOSSEN, datum: String(datum), monat: sperreM.monat,
              /* Nach bestätigtem Lohnexport gibt es kein Wiederöffnen mehr (WP-16, Nachtrag dritter Review N-a). */
              text: `${sperreM.grund} Dieser Stempel wurde nicht gespeichert — die Leitung sieht ihn am Monatsabschluss; `
                + (sperreM.lohnexportiert ? "ein Nachtrag ist nur noch über den Korrekturprozess der Leitung möglich, nicht durch erneutes Senden."
                  : "nach dem Wiederöffnen lässt er sich erneut senden."), ...(sperreM.lohnexportiert ? { lohnexportiert: true } : {}) }, 409);
          }

          /* Geo V1 (lib/geo.mjs): drei Zustände, Genauigkeit, gerundete Entfernung.
             Ist die Prüfung im Betrieb aus, wird nichts geprüft (pruefung_aus) —
             mitgeschickte Koordinaten bleiben dann unbeachtet. Das Urteil lehnt
             nie ab: Die Stempelzeit wird in jedem Fall gespeichert. */
          const urteil = geoUrteil({ m, person, datum: String(datum), messung: { lat, lon, accuracy, grund: positionGrund } });

          const k = `${person.id}|${datum}`;
          const alt = (m.einstempeln || {})[k] || {};
          /* Ein zweites Ein- oder Ausstempeln am selben Tag überschrieb bisher
             das erste — ein erneutes Einstempeln löschte dabei sogar das schon
             gestempelte Ende. Gestempeltes bleibt; korrigieren kann die Leitung. */
          /* Auch ein Start nach einem schon gestempelten Ende (START_FEHLT) ersetzte
             sonst den Eintrag samt Ende — Gestempeltes bleibt. Geprüft am
             frischen Stand: Zwei gleichzeitige Einstempelversuche derselben
             Person ergeben genau einen Stempel und eine Absage. */
          if ((art === "start" && (alt.start || alt.ende)) || (art === "ende" && alt.ende)) {
            await protokoll("schreiben", kSt, "abgewiesen", `stempeln ${art}: schon gestempelt`, { ...wer, tag: datum });
            return antwort({ fehler: art === "start" && alt.start ? "Für diesen Tag ist schon eingestempelt."
              : art === "start" ? "Für diesen Tag ist schon ausgestempelt — den Beginn trägt die Leitung nach."
              : "Für diesen Tag ist schon ausgestempelt.",
            code: art === "start" && alt.start ? "STEMPEL_SCHON_EINGESTEMPELT" : "STEMPEL_SCHON_AUSGESTEMPELT" }, 409);
          }
          /* Kennzeichen statt Ablehnung (E5, E10): Einstempeln ohne geplanten
             Dienst ist erlaubt (UNGEPLANTER_DIENST); ein Ende ohne Start wird
             gespeichert (START_FEHLT) — ohne erfundene Startzeit und ohne
             Ist-Dauer: Dann entsteht keine bestätigte Erfassung, die Zeit wird
             über „Zeiten bestätigen" bzw. die Leitung vervollständigt. */
          const markierungen = [...(Array.isArray(alt.markierungen) ? alt.markierungen : [])];
          const markieren = (x) => { if (!markierungen.includes(x)) markierungen.push(x); };
          if (art === "start" && !geplanterDienst(m, person, String(datum))) markieren("UNGEPLANTER_DIENST");
          for (const x of ziel.markierungen) markieren(x);
          for (const x of stEreignis.markierungen) markieren(x);
          for (const x of urteil.markierungen || []) markieren(x);          // Geo-Modus „pflicht" (WP-20)
          const startFehlt = art === "ende" && !alt.start;
          if (startFehlt) markieren("START_FEHLT");
          /* Vergessenes Ausstempeln (Geo-Spezifikation B6): Liegt der offene
             Beginn mehr als 20 Stunden zurück, gehört dieses Ende nicht
             automatisch zu ihm. Beginn und Ende bleiben gespeichert, aber es
             entsteht keine bestätigte Erfassung — sonst würde aus 06:00 Uhr und
             06:01 Uhr am Folgetag eine 24-Stunden-Schicht. Vervollständigt wird
             wie bei START_FEHLT über „Zeiten bestätigen" bzw. die Leitung. */
          const startVeraltet = art === "ende" && !!alt.start
            && !startZuordenbar(String(datum), alt.start, jetzt, alt.startAm);
          if (startVeraltet) markieren("START_VERALTET");
          /* startAm/endeAm: der eindeutige Zeitpunkt (UTC) neben der Berliner
             Uhrzeit — in der Rückstellnacht ist „02:30" sonst zweideutig. */
          const neu = art === "start"
            ? { start: zeit, startAm: jetzt.toISOString(), ortStart: urteil.text, innerhalbStart: urteil.innerhalb,
                geprueftStart: urteil.geprueft, geoStart: urteil.geo }
            : { ...alt, ende: zeit, endeAm: jetzt.toISOString(), ortEnde: urteil.text, innerhalbEnde: urteil.innerhalb,
                geprueftEnde: urteil.geprueft, geoEnde: urteil.geo };
          /* Das Ende eines Vorgangs vom Vortag trägt sein Kalenderdatum (B6);
             fehlt das Feld, ist es der Tag des Vorgangs. */
          if (art === "ende" && heute !== String(datum)) neu.endeDatum = heute;
          /* WP-07: Kennung und Offline-Angaben gehören zum Original — mit ihm in
             einem Schreibvorgang gespeichert, danach unveränderlich (WP-06). */
          const phase = art === "start" ? "Start" : "Ende";
          if (stEreignis.id) neu[`ereignis${phase}`] = stEreignis.id;
          if (stEreignis.info) neu[`offline${phase}`] = stEreignis.info;

          /* Ein langer Dienst (über geplanter Dauer + 2 h, ohne Plan 12 h;
             zeiterfassung.mjs, langerDienstGrenze) ergibt keine automatisch
             bestätigte Ist-Zeit, sondern eine zur Prüfung durch die Leitung. */
          const mitErfassung = art === "ende" && !startFehlt && !startVeraltet;
          const dauerMin = mitErfassung ? offenSeitMinuten(String(datum), alt.start, jetzt, alt.startAm) : null;
          const langerDienst = dauerMin !== null && dauerMin > langerDienstGrenze(m, person, String(datum));
          if (langerDienst) markieren("LANGER_DIENST");
          /* Nachprüfung B1: Beginn und Ende in derselben Minute (oder ein auf den
             Beginn geklemmtes Ende) ergeben Dauer 0. Als Uhrzeiten gespeichert
             hieße das 06:00–06:00, und die Stundenrechnung (regelwerk dauerAm)
             liest Ende ≤ Beginn als „über Mitternacht" — 24 Stunden. Gemessen
             wird am eindeutigen Zeitpunkt (startAm), ein echter 24-h-Dienst hat
             1440 Minuten, nie 0. Eine solche Ist-Zeit ist nie automatisch
             bestätigt (DAUER_NULL), die Leitung trägt sie über die Korrektur ein. */
          const dauerNull = dauerMin !== null && dauerMin <= 0;
          if (dauerNull) markieren("DAUER_NULL");
          /* WP-14b (M2): In der Herbstnacht ist „02:30" zweimal. Weicht die Uhrzeit-Dauer (mit Zeitumstellung,
             bruttoAm) von der gemessenen um mehr als eine halbe Stunde ab, ist die Ist-Zeit nicht automatisch
             bestätigt — sonst würden aus 50 Minuten 23:50 Stunden. Die Leitung trägt eindeutige Zeiten ein. */
          const uhrAbweichend = !dauerNull && dauerMin !== null && uhrDauerAbweichend(String(datum), alt.start, zeit, dauerMin);
          if (uhrAbweichend) markieren("ZEITUMSTELLUNG");
          /* Pause (WP-16): beim Ausstempeln die genommene Pause in Minuten. Sie gehört zum
             Original (über das Speichern unveränderlich, WP-06) und steht an der Ist-Zeit. Eine
             ungültige Angabe (keine ganze Zahl 0–180, nicht kürzer als die Anwesenheit) kostet
             nie den Stempel: gespeichert ohne Pause, gekennzeichnet. Die Mindestpause (§ 4
             ArbZG, für Jugendliche § 11 JArbSchG; zeitregeln.mjs) ist ein Hinweis, keine Sperre —
             eine angegebene, zu kurze Pause trägt PAUSE_ZU_KURZ. Ohne Angabe gilt wie bisher die
             Pause der Dienstart. */
          let pauseMin;
          if (art === "ende" && rumpf.pause !== undefined && rumpf.pause !== null && rumpf.pause !== "") {
            const p = pauseAngabe(rumpf.pause);
            if (p === null || (p !== undefined && dauerMin !== null && dauerMin > 0 && p >= dauerMin)) markieren("PAUSE_UNGUELTIG");
            else pauseMin = p;
          }
          if (pauseMin !== undefined) neu.pause = pauseMin;
          const planDa = (m.dienstarten || []).find((d) => d && String(d.id) === String(geplanterDienst(m, person, String(datum))));
          /* WP-14c (F2): Die wirksame Pause (angegeben, sonst die der Dienstart) erreicht die Anwesenheit — 06:00–06:40
             mit 60 min Pause zählte 0 h und galt als bestätigt. Jetzt ein Prüffall (nie automatisch bestätigt); die
             Leitung trägt die Zeiten samt Pause über die Korrektur ein. */
          const wirksamePauseSt = pauseMin !== undefined ? pauseMin : (planDa && Number(planDa.pause)) || 0;
          const pauseZuLangSt = mitErfassung && !dauerNull && !uhrAbweichend && !!alt.start && wirksamePauseSt > 0
            && pauseZuLang(alt.start, zeit, wirksamePauseSt, String(datum));
          if (pauseZuLangSt) markieren("PAUSE_ZU_LANG");
          /* Keine Hinweise aus Uhrzeiten, die die Dauer nicht wiedergeben (Dauer 0, Herbstnacht — WP-14b M2). */
          const hinweise = mitErfassung && !dauerNull && !uhrAbweichend && !pauseZuLangSt && alt.start
            ? regelHinweise(m, person.id, String(datum), { start: alt.start, ende: zeit,
              pause: pauseMin !== undefined ? pauseMin : (planDa && Number(planDa.pause)) || 0 }) : [];
          if (pauseMin !== undefined && hinweise.some((x) => x.code === "PAUSE")) markieren("PAUSE_ZU_KURZ");
          /* Ungeplanter Dienst (WP-13): Ohne geplanten Dienst an diesem Tag gibt
             es keine Planzeit, auf die die Ist-Zeit zurückfallen könnte. Aus
             Beginn und Ende entsteht deshalb eine Erfassung zur Prüfung
             (`ungeplant`, bestaetigt: false): Sie zählt in Konto und Lohnausgabe
             erst, wenn die Leitung sie über die Stempelkorrektur bestätigt hat
             — dann mit der gestempelten Dauer. Der Stempel selbst bleibt das
             unveränderte Original (WP-06). */
          const ungeplant = mitErfassung && !geplanterDienst(m, person, String(datum));
          if (ungeplant) markieren("UNGEPLANTER_DIENST");
          /* Offline mit abweichender Geräteuhr oder über 48 Stunden alt (Beginn
             oder Ende): Die Ist-Zeit ist nicht automatisch bestätigt. */
          const offlinePruefen = OFFLINE_PRUEF_MARKIERUNGEN.some((x) => markierungen.includes(x))
            /* Auflage A1: Beginn oder Ende 15 min oder mehr nach der Erfassung
               eingegangen — ohne Betriebsschalter zur Prüfung. */
            || (!offlineVertrauen(m) && (offlineVerspaetet(alt.offlineStart) || offlineVerspaetet(stEreignis.info)));
          if (markierungen.length) neu.markierungen = markierungen;

          let neuerMandant = { ...m, einstempeln: { ...(m.einstempeln || {}), [k]: neu } };
          /* B6.3: Ein Ende zu einem über 20 Stunden alten Beginn von gestern
             wird nicht angehängt (stempelZiel: eigenes START_FEHLT auf heute).
             Der alte Vorgang bekommt KONFLIKT und bleibt für die Korrektur
             durch die Leitung offen. */
          /* Liegt der alte Vorgang in einem abgeschlossenen Monat (WP-16), bleibt er unberührt —
             auch kein Kennzeichen; die Leitung klärt ihn nach dem Wiederöffnen. */
          if (ziel.konfliktAm && !monatAbgeschlossen(m, ziel.konfliktAm)) {
            const kAlt = `${person.id}|${ziel.konfliktAm}`;
            const vorgang = neuerMandant.einstempeln[kAlt];
            if (vorgang) {
              const mk = Array.isArray(vorgang.markierungen) ? vorgang.markierungen : [];
              neuerMandant = { ...neuerMandant, einstempeln: { ...neuerMandant.einstempeln,
                [kAlt]: { ...vorgang, markierungen: mk.includes("KONFLIKT") ? mk : [...mk, "KONFLIKT"],
                  konfliktGrund: "vorgang_veraltet" } } };
            }
          }
          /* Gibt es zu diesem Stempel schon eine Korrektur (WP-06), gilt deren
             Ist-Zeit — das nachgereichte Ende ändert sie nicht still. */
          const korrigiert = Array.isArray(alt.korrekturen) && alt.korrekturen.length > 0;
          if (mitErfassung && !korrigiert) {
            const mitPause = (e) => (pauseMin !== undefined ? { ...e, pause: pauseMin } : e);
            neuerMandant = { ...neuerMandant, erfassung: { ...(neuerMandant.erfassung || {}),
              /* Dauer 0 vor ungeplant: Bestätigt würde 06:00–06:00 als 24 Stunden zählen. */
              /* WP-14b (M3): ohne Plan auch mit der Marke ungeplant — nach der Korrektur zählt der Tag. */
              [k]: mitPause(dauerNull
                ? { start: neu.start, ende: zeit, bestaetigt: false, ...(ungeplant ? { ungeplant: true } : {}),
                  grund: "DAUER_NULL: Beginn und Ende in derselben Minute — Zeiten bitte über die Korrektur eintragen" }
                : uhrAbweichend
                ? { start: neu.start, ende: zeit, bestaetigt: false, ...(ungeplant ? { ungeplant: true } : {}),
                  grund: `ZEITUMSTELLUNG: ${Math.round(dauerMin / 6) / 10} Stunden gemessen, die Uhrzeiten ergeben eine andere Dauer — Zeiten bitte über die Korrektur eintragen` }
                : pauseZuLangSt
                ? { start: neu.start, ende: zeit, bestaetigt: false, ...(ungeplant ? { ungeplant: true } : {}),
                  grund: `PAUSE_ZU_LANG: Pause ${wirksamePauseSt} min bei ${Math.round(dauerMin)} min Anwesenheit — Zeiten und Pause bitte über die Korrektur eintragen` }
                : ungeplant
                ? { start: neu.start, ende: zeit, bestaetigt: false, ungeplant: true,
                  grund: `UNGEPLANT: ${Math.round(dauerMin / 6) / 10} Stunden ohne geplanten Dienst${langerDienst ? " (länger als 12 Stunden)" : ""} — Leitung bestätigt` }
                : langerDienst
                ? { start: neu.start, ende: zeit, bestaetigt: false,
                  grund: `LANGER_DIENST: ${Math.round(dauerMin / 6) / 10} Stunden — bitte prüfen` }
                : offlinePruefen
                  ? { start: neu.start, ende: zeit, bestaetigt: false,
                    grund: "OFFLINE_PRUEFEN: offline gestempelt (spät eingegangen, Uhr des Geräts abweichend oder älter als 48 Stunden) — bitte prüfen" }
                  : { start: neu.start, ende: zeit, bestaetigt: true, grund: "" }) } };
          }
          const neuerBestand = { ...bestand,
            mandanten: bestand.mandanten.map((x) => x === m ? neuerMandant : x) };

          /* Unter der gehaltenen Sperre kommt bestandSchreiben ohne Warten
             durch (Wiedereintritt, lib/raumsperre.mjs). */
          const ergSt = await bestandSchreiben(store, s.bestand, neuerBestand, {
            erwarteterStand: mit.stand, durch: s.name || "Stempeluhr" });
          if (ergSt.ok) {
            return { ergSt, urteil, neu, zeit, erfassung: mitErfassung && !korrigiert ? neuerMandant.erfassung[k] : null, hinweise };
          }
          /* Jeder gescheiterte Versuch steht im Protokoll — „wiederholt",
             solange noch einer folgt; erst der letzte ist ein Konflikt. */
          if (versuch < STEMPEL_WIEDERHOLUNGEN)
            await protokoll("schreiben", kSt, "wiederholt",
              `stempeln ${art} · Versuch ${versuch + 1} von ${STEMPEL_WIEDERHOLUNGEN + 1}`, { ...wer, tag: datum });
        }
        await protokoll("schreiben", kSt, "konflikt", `stempeln ${art}`, { ...wer, tag: zielDatum });
        return antwort({ fehler: "Gerade wurde gleichzeitig gespeichert — die Stempelzeit ist nicht erfasst. "
          + "Bitte noch einmal stempeln.", code: "STEMPEL_KONFLIKT" }, 409);
      });
      if (ergebnis instanceof Response) return ergebnis;

      if (ergebnis.wiederholt) {
        /* Dieselbe Antwort wie beim ersten Mal, aus dem gespeicherten Stempel
           gebaut — mit `wiederholt`, damit die Oberfläche weiß, dass nichts
           Neues entstanden ist. Die Art kommt aus dem Stempel, nicht aus der
           Wiederholung. */
        const { wiederholt: w, stand, erfassung: erfW } = ergebnis;
        const e = w.eintrag, ph = w.art === "start" ? "Start" : "Ende";
        await protokoll("schreiben", kSt, "wiederholt", `stempeln ${w.art}: Ereignis schon gespeichert`, wer);
        return antwort({ ok: true, wiederholt: true, art: w.art, zeit: e[w.art] || null, ort: e[`ort${ph}`] ?? null,
          innerhalb: e[`innerhalb${ph}`] ?? null, geprueft: e[`geprueft${ph}`] ?? null, geo: e[`geo${ph}`] ?? null,
          markierungen: e.markierungen || [], etag: stand || null, datum: w.datum, eintrag: e,
          erfassung: w.art === "ende" ? erfW : null, inhaber, offline: !!e[`offline${ph}`] });
      }

      const { ergSt, urteil, neu, zeit, erfassung, hinweise } = ergebnis;
      await protokoll("schreiben", kSt, "erfolg", `stempeln ${art}${stEreignis.offline ? " · offline" : ""}`, wer);
      /* Zurück geht der gespeicherte Stempel — genau der Eintrag, den der
         erfolgreiche Versuch geschrieben hat —, damit die Oberfläche ihn
         übernimmt, statt eine eigene, gekürzte Kopie zu bauen. */
      return antwort({ ok: true, zeit, ort: urteil.text, innerhalb: urteil.innerhalb,
        geprueft: urteil.geprueft, geo: urteil.geo, markierungen: neu.markierungen || [], etag: ergSt.stand || null, datum: zielDatum, eintrag: neu,
        erfassung, art, inhaber, offline: stEreignis.offline, hinweise: hinweise || [] });
    }

    /* ------------------------ Stempelkorrektur (WP-06) ---------------------
       Der einzige Weg, die Ist-Zeit eines gestempelten Tages zu ändern: als
       Ereignis { vorher, nachher, wer, wann, grund } am Stempel. Das Original
       bleibt unverändert. Leitung und Planung (staff.edit) — nicht die
       Schichtverantwortung, die fremde Stempel nicht sieht (H8+), nicht
       Beschäftigte, Betriebsrat oder Betreiber. */
    if (pfad === "stempel-korrektur" && req.method === "POST") {
      const kK = kennung(req, s);
      if (schreibumfang(s.rolle) === SCHREIBEN_NEIN || !darf(s.rolle, "staff.edit")) {
        await protokoll("schreiben", kK, "abgewiesen", `Stempelkorrektur · Rolle ${s.rolle}`, wer);
        return antwort({ fehler: "Keine Schreibberechtigung.",
          text: "Stempelzeiten korrigieren Leitung und Planung." }, 403);
      }
      const bK = await bremse("schreiben", kK);
      if (!bK.frei) return zuVielAntwort(bK.wartet);
      return await unterRaumsperre(s.bestand, async () => {
        const mitK = await bestandLesenStreng(store, s.bestand);
        if (!mitK) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
        const mK = eigenerMandant(mitK.bestand, s);
        if (!mK) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
        /* Monatsabschluss (WP-16): im abgeschlossenen Monat keine Korrektur — erst nach dem Wiederöffnen. */
        const sperreK = abschlussSperre(mK, String((rumpf && rumpf.datum) || ""));
        if (sperreK) {
          await protokoll("schreiben", kK, "abgewiesen", `Stempelkorrektur: Monat abgeschlossen ${sperreK.monat}`, wer);
          return antwort({ fehler: sperreK.grund, code: MONAT_ABGESCHLOSSEN, monat: sperreK.monat }, 409);
        }
        /* WP-14c/Review: Die Ausnahme von der Zeitumstellungs-Sperre (zeitumstellungAusnahme) gilt nur für die Leitung (org.edit). */
        const rumpfK = { ...(rumpf || {}) };
        if (!darf(s.rolle, "org.edit")) delete rumpfK.zeitumstellungAusnahme;
        const r = korrekturAnhaengen(mK, rumpfK, { personId: s.person ?? null, name: s.name || null, rolle: s.rolle },
          new Date(), `k-${randomBytes(6).toString("hex")}`, { nachWiederoeffnung: letzteWiederoeffnung(mK, String((rumpf && rumpf.datum) || "")) });
        if ("status" in r) {
          await protokoll("schreiben", kK, "abgewiesen", `Stempelkorrektur: ${spurGrund(r.grund)}`, wer);
          return antwort({ fehler: r.grund }, r.status);
        }
        const ergK = await bestandSchreiben(store, s.bestand,
          { ...mitK.bestand, mandanten: mitK.bestand.mandanten.map((x) => (x === mK ? r.mandant : x)) },
          { erwarteterStand: mitK.stand, durch: s.name || "Stempelkorrektur" });
        if (!ergK.ok) {
          await protokoll("schreiben", kK, "konflikt", "Stempelkorrektur", wer);
          return antwort({ fehler: "Gerade wurde gleichzeitig gespeichert. Bitte noch einmal versuchen." }, 409);
        }
        /* WP-14b (M1): Die Spur liest der Betreiber (Auftragsverarbeiter). Darin stehen keine betroffene Person, kein
           Tag, keine Ist-Zeiten und keine Schutzkennungen (Art. 9) — nur die Kennung des Ereignisses und die Zahl der
           Hinweise. Was geändert wurde, steht am Stempel (Ereignis mit vorher/nachher, Hinweisen, wer, wann). */
        await protokoll("schreiben", kK, "erfolg",
          `Stempelkorrektur ${r.ereignis.id}${r.ereignis.selbstfreigabe ? " · Selbstfreigabe" : ""}${r.ereignis.zeitumstellungAusnahme ? " · Zeitumstellung bestätigt" : ""}${spurHinweise(r.hinweise)}`, wer);
        return antwort({ ok: true, eintrag: r.eintrag, erfassung: r.erfassung, ereignis: r.ereignis, hinweis: r.hinweis, hinweise: r.hinweise, etag: ergK.stand || null });
      });
    }

    /* ------------------------ Korrekturantrag (WP-14) -----------------------
       Antrag → Freigabe → Ist (lib/korrekturworkflow.mjs). Gestellt wird er von
       der Person selbst für einen eigenen Stempel der letzten Tage — also auch
       von Schichtverantwortung und Betriebsrat, die stempeln. Der Antrag liegt
       am Stempel; das Original bleibt unverändert. */
    if (pfad === "korrektur-antrag" && req.method === "POST") {
      const kA = kennung(req, s);
      const bA = await bremse("schreiben", kA);
      if (!bA.frei) return zuVielAntwort(bA.wartet);
      if (s.person === null || s.person === undefined)
        return antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);
      return await unterRaumsperre(s.bestand, async () => {
        const mitA = await bestandLesenStreng(store, s.bestand);
        if (!mitA) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
        const mA = eigenerMandant(mitA.bestand, s);
        if (!mA) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
        const pA = (mA.personen || []).find((x) => x && String(x.id) === String(s.person));
        if (!pA) return antwort({ fehler: "Person nicht gefunden." }, 404);
        /* Monatsabschluss (WP-16): im abgeschlossenen Monat kein Antrag. */
        const sperreA = abschlussSperre(mA, String((rumpf && rumpf.datum) || ""));
        if (sperreA) {
          await protokoll("schreiben", kA, "abgewiesen", `Korrekturantrag: Monat abgeschlossen ${sperreA.monat}`, wer);
          return antwort({ fehler: sperreA.grund, code: MONAT_ABGESCHLOSSEN, monat: sperreA.monat }, 409);
        }
        const r = antragStellen(mA, { personId: pA.id, name: s.name || null, rolle: s.rolle }, rumpf || {}, new Date(),
          `ka-${randomBytes(6).toString("hex")}`, heuteBerlin());
        if ("status" in r) {
          await protokoll("schreiben", kA, "abgewiesen", `Korrekturantrag: ${spurGrund(r.grund)}`, wer);
          return antwort({ fehler: r.grund }, r.status);
        }
        const ergA = await bestandSchreiben(store, s.bestand,
          { ...mitA.bestand, mandanten: mitA.bestand.mandanten.map((x) => (x === mA ? r.mandant : x)) },
          { erwarteterStand: mitA.stand, durch: s.name || "Korrekturantrag" });
        if (!ergA.ok) {
          await protokoll("schreiben", kA, "konflikt", "Korrekturantrag", wer);
          return antwort({ fehler: "Gerade wurde gleichzeitig gespeichert. Bitte noch einmal versuchen." }, 409);
        }
        /* WP-14b (M1): ohne Tag und Zeiten — sie stehen am Antrag (Stempel). */
        await protokoll("schreiben", kA, "erfolg", `Korrekturantrag ${r.antrag.id}: gestellt`, wer);
        return antwort({ ok: true, antrag: r.antrag, eintrag: r.eintrag, etag: ergA.stand || null });
      });
    }

    /* Entscheiden: Leitung und Planung (staff.edit) genehmigen oder lehnen ab; die
       antragstellende Person zieht zurück. Die Schichtverantwortung sieht fremde
       Stempel nicht (H8+) und entscheidet deshalb nicht. Genehmigt wird als
       Korrekturereignis am Stempel — mit Kennung des Antrags und Regelhinweisen. */
    if (pfad === "korrektur-entscheiden" && req.method === "POST") {
      const kE = kennung(req, s);
      const entscheidungE = rumpf && rumpf.entscheidung;
      if (entscheidungE !== "zurueckgezogen" && (schreibumfang(s.rolle) === SCHREIBEN_NEIN || !darf(s.rolle, "staff.edit"))) {
        await protokoll("schreiben", kE, "abgewiesen", `Korrekturantrag entscheiden · Rolle ${s.rolle}`, wer);
        return antwort({ fehler: "Keine Schreibberechtigung.", text: "Korrekturanträge entscheiden Leitung und Planung." }, 403);
      }
      const bE = await bremse("schreiben", kE);
      if (!bE.frei) return zuVielAntwort(bE.wartet);
      if (s.person === null || s.person === undefined)
        return antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);
      return await unterRaumsperre(s.bestand, async () => {
        const mitE = await bestandLesenStreng(store, s.bestand);
        if (!mitE) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
        const mE = eigenerMandant(mitE.bestand, s);
        if (!mE) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
        /* Monatsabschluss (WP-16): Genehmigen, Ablehnen und Zurückziehen ändern den Stempel —
           im abgeschlossenen Monat erst nach dem Wiederöffnen. */
        const sperreE = abschlussSperre(mE, String((rumpf && rumpf.datum) || ""));
        if (sperreE) {
          await protokoll("schreiben", kE, "abgewiesen", `Korrekturantrag entscheiden: Monat abgeschlossen ${sperreE.monat}`, wer);
          return antwort({ fehler: sperreE.grund, code: MONAT_ABGESCHLOSSEN, monat: sperreE.monat }, 409);
        }
        const r = antragEntscheiden(mE, rumpf || {}, { personId: s.person, name: s.name || null, rolle: s.rolle }, new Date(),
          `k-${randomBytes(6).toString("hex")}`, { nachWiederoeffnung: letzteWiederoeffnung(mE, String((rumpf && rumpf.datum) || "")) });
        if ("status" in r) {
          await protokoll("schreiben", kE, "abgewiesen", `Korrekturantrag entscheiden: ${spurGrund(r.grund)}`, wer);
          return antwort({ fehler: r.grund }, r.status);
        }
        const ergE = await bestandSchreiben(store, s.bestand,
          { ...mitE.bestand, mandanten: mitE.bestand.mandanten.map((x) => (x === mE ? r.mandant : x)) },
          { erwarteterStand: mitE.stand, durch: s.name || "Korrekturantrag" });
        if (!ergE.ok) {
          await protokoll("schreiben", kE, "konflikt", "Korrekturantrag entscheiden", wer);
          return antwort({ fehler: "Gerade wurde gleichzeitig gespeichert. Bitte noch einmal versuchen." }, 409);
        }
        /* WP-14b (M1): keine Person, kein Tag, keine Zeiten, keine Hinweiskennungen (MUTTERSCHUTZ/JUGENDSCHUTZ sind
           Art.-9-Angaben) — nur Antrag, Ausgang, Kennung des Korrekturereignisses und die Zahl der Hinweise. */
        await protokoll("schreiben", kE, "erfolg",
          `Korrekturantrag ${r.antrag.id}: ${r.antrag.status}`
          + (r.ereignis ? ` · Korrektur ${r.ereignis.id}${r.ereignis.selbstfreigabe ? " · Selbstfreigabe" : ""}` : "")
          + spurHinweise(r.hinweise), wer);
        return antwort({ ok: true, antrag: r.antrag, eintrag: r.eintrag, erfassung: r.erfassung || null, ereignis: r.ereignis || null,
          hinweise: r.hinweise || [], hinweis: r.hinweis || null, etag: ergE.stand || null });
      });
    }

    /* ------------------------ Monatsabschluss (WP-16) -----------------------
       Abschließen: Leitung, Planung, Kundenrolle (staff.edit, Vollschreibrecht).
       Wiederöffnen: nur Leitung und Kundenrolle (org.edit), mit Grund. Beides
       unter der Raumsperre am frischen Stand und in einem Schreibvorgang
       (WP-02, WP-45); Wann, Wer und Grund im Verlauf am Monat und im
       Betriebsprotokoll (lib/monatsabschluss.mjs, rechte.mjs abschlussRecht). */
    if (pfad === "monatsabschluss" && req.method === "POST") {
      const kM = kennung(req, s);
      const aktionM = rumpf && rumpf.aktion;
      if (!["abschliessen", "wiederoeffnen", "lohnexport", "korrektur-beginnen", "korrektur-freigeben", "korrektur-verwerfen"].includes(aktionM))
        return antwort({ fehler: "aktion: abschliessen, wiederoeffnen, lohnexport, korrektur-beginnen, korrektur-freigeben oder korrektur-verwerfen." }, 400);
      /* Nur ein gültiger Monat JJJJ-MM kommt in die Spur (WP-16, Nachtrag N2) — nie Freitext aus dem Rumpf. */
      const monatM = (rumpf && typeof rumpf.monat === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(rumpf.monat)) ? rumpf.monat : "ungültig";
      if (!abschlussRecht(s.rolle, aktionM)) {
        await protokoll("schreiben", kM, "abgewiesen", `Monatsabschluss ${aktionM} ${monatM} · Rolle ${s.rolle}`, wer);
        return antwort({ fehler: "Keine Schreibberechtigung.", text: aktionM === "abschliessen"
          ? "Monate schließen Leitung und Planung ab."
          : aktionM === "lohnexport" ? "Den Lohnexport bestätigt nur die Leitung."
            : aktionM.startsWith("korrektur-") ? "Eine Korrektur nach dem Lohnexport beginnt und gibt nur die Leitung frei."
              : "Einen abgeschlossenen Monat öffnet nur die Leitung wieder." }, 403);
      }
      const bM = await bremse("schreiben", kM);
      if (!bM.frei) return zuVielAntwort(bM.wartet);
      return await unterRaumsperre(s.bestand, async () => {
        const mitM = await bestandLesenStreng(store, s.bestand);
        if (!mitM) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
        const mM = eigenerMandant(mitM.bestand, s);
        if (!mM) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
        const werM = { personId: s.person ?? null, name: s.name || null, rolle: s.rolle };
        /* Positivliste (WP-16c, Review): nur diese Felder des Rumpfes erreichen die Monatsabschluss-Funktionen; interne Schalter
           (etwa die Vorschau der Freigabe) lassen sich von außen nicht setzen. */
        const rumpfM = {};
        for (const f of MONATSABSCHLUSS_RUMPF) if (rumpf && Object.prototype.hasOwnProperty.call(rumpf, f)) rumpfM[f] = rumpf[f];
        const idM = `ma-${randomBytes(6).toString("hex")}`;
        const r = aktionM === "abschliessen"
          ? abschliessen(mM, rumpfM, werM, new Date(), idM, heuteBerlin())
          : aktionM === "lohnexport" ? lohnexportBestaetigen(mM, rumpfM, werM, new Date(), idM)
            : aktionM === "korrektur-beginnen" ? korrekturBeginnen(mM, rumpfM, werM, new Date(), idM)
              : aktionM === "korrektur-freigeben" ? korrekturFreigeben(mM, rumpfM, werM, new Date(), idM, heuteBerlin())
                : aktionM === "korrektur-verwerfen" ? korrekturVerwerfen(mM, rumpfM, werM, new Date(), idM)
                : wiederoeffnen(mM, rumpfM, werM, new Date(), idM);
        if ("status" in r) {
          await protokoll("schreiben", kM, "abgewiesen", `Monatsabschluss ${aktionM} ${monatM}: ${spurGrund(r.grund)}`, wer);
          return antwort({ fehler: r.grund, ...(r.code ? { code: r.code } : {}), ...(r.offen ? { offen: r.offen } : {}),
            ...(r.vormonate ? { vormonate: r.vormonate } : {}), ...(r.differenz ? { differenz: r.differenz } : {}) }, r.status);
        }
        const ergM = await bestandSchreiben(store, s.bestand,
          { ...mitM.bestand, mandanten: mitM.bestand.mandanten.map((x) => (x === mM ? r.mandant : x)) },
          { erwarteterStand: mitM.stand, durch: s.name || "Monatsabschluss" });
        if (!ergM.ok) {
          await protokoll("schreiben", kM, "konflikt", `Monatsabschluss ${aktionM} ${monatM}`, wer);
          return antwort({ fehler: "Gerade wurde gleichzeitig gespeichert. Bitte noch einmal versuchen." }, 409);
        }
        /* WP-14b (M1): Die Spur liest der Betreiber — nur Monat, Ausgang, Kennung und Zahlen; der Grund (Freitext)
           steht im Verlauf am Monat, nicht in der Spur. */
        await protokoll("schreiben", kM, "erfolg", aktionM === "abschliessen"
          ? `Monatsabschluss ${monatM} abgeschlossen${r.ereignis.revision > 1 ? ` · Revision ${r.ereignis.revision}` : ""}${r.ereignis.offen ? ` · trotz ${r.ereignis.offen.offeneStempel} unvollständiger Stempel, ${r.ereignis.offen.zurPruefung} Ist-Zeiten zur Prüfung` : ""}`
          : aktionM === "lohnexport" ? `Monatsabschluss ${monatM} Lohnexport bestätigt ${r.ereignis.id} · Revision ${r.ereignis.revision}`
            /* Überstimmung offener/geänderter Vormonate (WP-16, Nachtrag vierter Review A-1): nur die Kategorie aus der festen Liste. */
            + (r.ereignis.trotzVormonat ? ` · trotz Vormonat (${r.ereignis.trotzVormonat.kategorie})` : "")
            : aktionM === "korrektur-beginnen" ? `Monatsabschluss ${monatM} Korrektur begonnen ${r.ereignis.id} · Revision ${r.ereignis.revision} · Grund im Verlauf`
              : aktionM === "korrektur-freigeben" ? `Monatsabschluss ${monatM} Korrektur freigegeben ${r.ereignis.id} · ${r.ereignis.n} Zeilen`
                : aktionM === "korrektur-verwerfen" ? `Monatsabschluss ${monatM} Korrektur verworfen ${r.ereignis.id} · Grund im Verlauf`
                : `Monatsabschluss ${monatM} wiedergeöffnet ${r.ereignis.id} · Grund im Verlauf`, wer);
        return antwort({ ok: true, monat: monatM, eintrag: r.eintrag, ereignis: r.ereignis, etag: ergM.stand || null,
          ...(r.differenz ? { differenz: r.differenz } : {}) });
      });
    }

    /* ------------------------- Zeiten bestätigen ----------------------
       Die Selbstauskunft „Zeiten bestätigen": für einen vergangenen Tag mit
       geplantem Dienst, an dem noch keine Zeit erfasst ist, „wie geplant"
       oder „abweichend". Bis Oktober 2026 lief das über das allgemeine
       Speichern, und eine unzulässige Angabe verschwand dort still — die
       Oberfläche zeigte den Tag trotzdem als bestätigt. Hier gibt es eine
       Antwort: 200 mit dem gespeicherten Eintrag oder 4xx mit dem Grund.
       Nur für die eigene Person; die Regeln stehen in zeiterfassung.mjs. */
    if (pfad === "zeit-bestaetigen" && req.method === "POST") {
      const kZ = kennung(req, s);
      if (schreibumfang(s.rolle) === SCHREIBEN_NEIN) {
        await protokoll("schreiben", kZ, "abgewiesen", `Zeit bestätigen · Rolle ${s.rolle}`, wer);
        return antwort({ fehler: "Keine Schreibberechtigung.", text: absageText(s.rolle) }, 403);
      }
      const bZ = await bremse("schreiben", kZ);
      if (!bZ.frei) return zuVielAntwort(bZ.wartet);
      if (s.person === null || s.person === undefined)
        return antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);
      const { datum, start = null, ende = null, grund = "", pause } = rumpf || {};

      /* Lesen, Prüfen und Schreiben unter der Sperre des Raums, aus dem
         frisch gelesenen Stand (WP-02) — wie beim Stempeln: Eine
         gleichzeitige Änderung desselben Monats durch jemand anderen ist
         dann kein Konflikt mehr, sondern kommt einfach davor. „return
         await", nicht nur „return": Sonst ginge eine überschrittene
         Zeitgrenze am catch unten vorbei und endete nicht in einer 503. */
      return await unterRaumsperre(s.bestand, async () => {
        const mitZ = await bestandLesenStreng(store, s.bestand);
        if (!mitZ) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
        const mZ = eigenerMandant(mitZ.bestand, s);
        if (!mZ) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
        const personZ = (mZ.personen || []).find((x) => String(x.id) === String(s.person));
        if (!personZ) return antwort({ fehler: "Person nicht gefunden." }, 404);

        /* Monatsabschluss (WP-16): zuerst — ein abgeschlossener Monat nimmt keine Selbstauskunft an. */
        const sperreZ = abschlussSperre(mZ, String(datum ?? ""));
        if (sperreZ) {
          await protokoll("schreiben", kZ, "abgewiesen", `Zeit bestätigen: Monat abgeschlossen ${sperreZ.monat}`, wer);
          return antwort({ fehler: sperreZ.grund, code: MONAT_ABGESCHLOSSEN, monat: sperreZ.monat }, 409);
        }
        /* Offene Korrekturrevision (WP-16c): keine Selbstauskunft, die still Ist ändert — erst nach der Korrektur. */
        if (korrekturOffen(mZ, String(datum ?? ""))) {
          await protokoll("schreiben", kZ, "abgewiesen", "Zeit bestätigen: Korrektur offen", wer);
          return antwort({ fehler: "Für diesen Monat läuft eine Korrektur nach dem Lohnexport. Zeiten bestätigt jetzt die Leitung.", code: "KORREKTUR_OFFEN" }, 409);
        }
        /* WP-15: Die Selbstauskunft ist ein ANTRAG (lib/selbstauskunft.mjs): Abweichung und Stempelabgleich
           rechnet der Server; Ist wird sie erst durch die Freigabe (POST /api/selbstauskunft-entscheiden). */
        const rZ = selbstauskunftStellen(mZ, personZ, { personId: personZ.id, name: s.name || null, rolle: s.rolle }, String(datum),
          { start, ende, grund, ...(pause === undefined || pause === null || pause === "" ? {} : { pause }) },
          new Date(), `sa-${randomBytes(6).toString("hex")}`);
        if ("status" in rZ) {
          await protokoll("schreiben", kZ, "abgewiesen", `Zeit bestätigen: ${rZ.art ? rZ.art : rZ.status === 409 ? "schon erfasst" : spurGrund(rZ.grund)}`, { ...wer, tag: datum });
          return antwort({ fehler: rZ.grund, ...(rZ.art ? { code: rZ.art } : {}) }, rZ.status);
        }
        const ergZ = await bestandSchreiben(store, s.bestand,
          { ...mitZ.bestand, mandanten: mitZ.bestand.mandanten.map((x) => (x === mZ ? rZ.mandant : x)) },
          { erwarteterStand: mitZ.stand, durch: s.name || "Selbstauskunft" });
        if (!ergZ.ok) {
          await protokoll("schreiben", kZ, "konflikt", `Zeit bestätigen`, { ...wer, tag: datum });
          return antwort({ fehler: "Gerade wurde gleichzeitig gespeichert. Bitte noch einmal versuchen." }, 409);
        }
        /* Spur ohne Zeiten und ohne Abweichungsangaben (Betreiber liest sie, WP-14b M1). */
        await protokoll("schreiben", kZ, "erfolg", `Selbstauskunft Zeiten`, { ...wer, tag: datum });
        return antwort({ ok: true, datum, antrag: rZ.antrag, eintrag: rZ.eintrag, etag: ergZ.stand || null });
      });
    }

    /* ------------- Selbstauskunft entscheiden (WP-15) -------------
       Leitung und Planung (staff.edit) geben frei oder lehnen ab; die Person zieht
       zurück. Freigabe = Ist (mit Regelhinweisen), nie die eigene, nie durch die
       Schichtverantwortung oder den Betriebsrat. */
    if (pfad === "selbstauskunft-entscheiden" && req.method === "POST") {
      const kS = kennung(req, s);
      const entscheidungS = rumpf && rumpf.entscheidung;
      if (entscheidungS !== "zurueckgezogen" && (schreibumfang(s.rolle) === SCHREIBEN_NEIN || !darf(s.rolle, "staff.edit"))) {
        await protokoll("schreiben", kS, "abgewiesen", `Selbstauskunft entscheiden · Rolle ${s.rolle}`, wer);
        return antwort({ fehler: "Keine Schreibberechtigung.", text: "Selbstauskünfte entscheiden Leitung und Planung." }, 403);
      }
      if (entscheidungS === "zurueckgezogen" && schreibumfang(s.rolle) === SCHREIBEN_NEIN) {
        await protokoll("schreiben", kS, "abgewiesen", `Selbstauskunft zurückziehen · Rolle ${s.rolle}`, wer);
        return antwort({ fehler: "Keine Schreibberechtigung.", text: absageText(s.rolle) }, 403);
      }
      const bS = await bremse("schreiben", kS);
      if (!bS.frei) return zuVielAntwort(bS.wartet);
      if (s.person === null || s.person === undefined)
        return antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);
      return await unterRaumsperre(s.bestand, async () => {
        const mitS = await bestandLesenStreng(store, s.bestand);
        if (!mitS) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
        const mS = eigenerMandant(mitS.bestand, s);
        if (!mS) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
        const sperreS = abschlussSperre(mS, String((rumpf && rumpf.datum) || ""));
        if (sperreS) {
          await protokoll("schreiben", kS, "abgewiesen", `Selbstauskunft entscheiden: Monat abgeschlossen ${sperreS.monat}`, wer);
          return antwort({ fehler: sperreS.grund, code: MONAT_ABGESCHLOSSEN, monat: sperreS.monat }, 409);
        }
        const r = selbstauskunftEntscheiden(mS, rumpf || {}, { personId: s.person, name: s.name || null, rolle: s.rolle }, new Date());
        if ("status" in r) {
          await protokoll("schreiben", kS, "abgewiesen", `Selbstauskunft entscheiden: ${spurGrund(r.grund)}`, wer);
          return antwort({ fehler: r.grund, ...(r.art ? { code: r.art } : {}) }, r.status);
        }
        const ergS = await bestandSchreiben(store, s.bestand,
          { ...mitS.bestand, mandanten: mitS.bestand.mandanten.map((x) => (x === mS ? r.mandant : x)) },
          { erwarteterStand: mitS.stand, durch: s.name || "Selbstauskunft" });
        if (!ergS.ok) {
          await protokoll("schreiben", kS, "konflikt", "Selbstauskunft entscheiden", wer);
          return antwort({ fehler: "Gerade wurde gleichzeitig gespeichert. Bitte noch einmal versuchen." }, 409);
        }
        /* Wie beim Korrekturantrag (WP-14b M1): keine Person, kein Tag, keine Zeiten, keine Hinweiskennungen. */
        await protokoll("schreiben", kS, "erfolg", `Selbstauskunft ${r.antrag.id}: ${r.antrag.status}${spurHinweise(r.hinweise)}`, wer);
        return antwort({ ok: true, antrag: r.antrag, eintrag: r.eintrag, hinweise: r.hinweise || [], etag: ergS.stand || null });
      });
    }

    /* ------------------------------ Abmelden ------------------------- */
    if (pfad === "abmelden" && req.method === "POST") {
      /* WP-30: Die Push-Anmeldung gehört zum Gerät der angemeldeten Person.
         Beim Abmelden wird sie entfernt — sonst gingen die Mitteilungen der
         einen Person auf einem geteilten Gerät weiter ein, wenn dort jemand
         anderes arbeitet. Ein Fehler hier hält das Abmelden nicht auf. */
      try {
        if (s.person !== null && s.person !== undefined) {
          const g = await bestandLesen(store, s.bestand);
          const mL = g && g.bestand ? eigenerMandant(g.bestand, s) : null;
          if (mL) await geraetAbmelden(store, s.bestand, g.bestand, mL.id, s.person);
        }
      } catch { /* das Abmelden geht vor */ }
      await sitzungBeenden(merkmalAus(req));
      return antwort({ ok: true });
    }
    /* ------------------- Auskunft nach Artikel 15 -------------------
       Serverseitig, maschinenlesbar (lib/auskunft.mjs). Ohne Angabe die
       eigene Person der Sitzung. Mit ?person=<id> nur für Leitung und
       „kunde" (dieselben Rollen wie bei Sicherungen) und nur für eine Person
       des eigenen Betriebs — mit genau dem, was diese Rolle ohnehin sieht,
       ohne Protokoll, Push-, Kalender- und Kontoangaben. Eigene Bremse
       („auskunft"): Jede Auskunft liest das Protokoll der letzten 30 Tage.
       Jede Auskunft steht im Protokoll — die durch die Leitung so, dass die
       Person sie in ihrer eigenen Auskunft wiederfindet (Empfänger). */
    if (pfad === "auskunft" && req.method === "GET") {
      const kA = kennung(req, s);
      /* Je anfragender Person, nicht je Raum (M5-Rest): Eine Person, die
         ihre Grenze ausschöpft, sperrt sonst den ganzen Betrieb. Ohne
         Personenbezug zählt die Rolle der Sitzung. */
      const wer5 = s.person !== null && s.person !== undefined ? `p:${s.person}` : `r:${s.rolle || "?"}`;
      const bA = await bremse("auskunft", `${kA}:${createHash("sha256")
        .update(`${String(s.mandantId ?? s.betrieb ?? "")}|${wer5}`).digest("hex").slice(0, 16)}`);
      if (!bA.frei) return zuVielAntwort(bA.wartet);
      if (s.rolle === "betreiber")
        return antwort({ fehler: "Der Betreiber erstellt keine Auskunft aus einem Betrieb." }, 403);
      const angefragt = new URL(req.url).searchParams.get("person");
      const selbst = angefragt === null || angefragt === "" || String(angefragt) === String(s.person);
      if (selbst && (s.person === null || s.person === undefined))
        return antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);
      if (!selbst && !AUSKUNFT_FUER_ANDERE.includes(s.rolle)) {
        await protokoll("auskunft", kA, "abgewiesen", `fremde Person · Rolle ${s.rolle}`, wer);
        return antwort({ fehler: "Auskunft über andere Personen erstellt nur die Leitung.",
          text: absageText(s.rolle) }, 403);
      }
      const mitA = await bestandJetzt();
      if (!mitA) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
      /* Die Person selbst bekommt ihren vollständigen Datensatz; die Leitung
         den Betrieb in ihrer eigenen Sicht — keine Erweiterung der Rechte. */
      const quelle = selbst ? mitA.bestand : bestandFuerRolle(mitA.bestand, s);
      const mA = eigenerMandant(quelle, s);
      if (!mA) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
      const pid = selbst ? s.person : angefragt;
      const personA = (mA.personen || []).find((x) => x && String(x.id) === String(pid));
      if (!personA) return antwort({ fehler: "Diese Person gibt es im eigenen Betrieb nicht." }, 404);
      const erstellt = new Date().toISOString();
      let zusatz = {};
      if (selbst) {
        const einBetrieb = Array.isArray(mitA.bestand.mandanten) && mitA.bestand.mandanten.length === 1;
        const protokollA = await protokollZurPerson(getStore({ name: "centric-spur" }),
          { raumKennung: kennung(null, s), mandantId: mA.id, personId: personA.id, einBetrieb });
        const push = !!(await store.getMetadata(pushSchluessel(s.bestand, mA.id, personA.id)).catch(() => null));
        const kalender = !!(await store.getMetadata(`feedperson:${s.bestand}:${mA.id}:${personA.id}`).catch(() => null));
        /* Die Sammlungen mit eigenen Einträgen aus der Sicht einer
           Beschäftigten — dieselbe Positivliste wie /api/bestand, also ohne
           Daten Dritter (sicht.mjs). */
        const eigeneSicht = eigenerMandant(bestandFuerRolle(mitA.bestand, { ...s, rolle: "mitarbeiter" }), s);
        /* Das Konto, wenn die Sitzung aus einem stammt (lib/auskunft.mjs). */
        const konto = await kontoFuerAuskunft(store, s);
        const zustellprotokoll = await zustellStatusEigene(store, s.bestand, mA, personA.id).catch(() => []);
        zusatz = { protokoll: protokollA, push, kalender, konto, eigeneSicht, zustellprotokoll };
      }
      const inhalt = auskunftBauen(mA, personA, { raum: s.bestand, erstellt, umfang: selbst ? "selbst" : "leitung",
        ...zusatz });
      await protokoll("auskunft", kA, "erfolg", `${selbst ? "selbst" : "durch Leitung"} · Person ${personA.id}`, wer);
      return antwort(inhalt, 200, { "content-disposition":
        `attachment; filename="auskunft-${String(personA.id).replace(/[^A-Za-z0-9_-]/g, "_")}-${erstellt.slice(0, 10)}.json"` });
    }
    /* ------------------------- Vollausgabe --------------------------
       Die Datenmitnahme in der Oberfläche gibt CSV-Dateien aus — gut zum
       Weiterverarbeiten, ungeeignet als Sicherung: Sie läuft im Browser, sie
       braucht einen Menschen, und sie gibt nicht alles her.

       Für eine Sicherung außer Haus braucht es einen Weg, der ohne Browser
       auskommt. Ein nächtliches Skript auf einem eigenen Server holt sich
       damit den vollständigen Bestand als eine Datei.

       Zwei Wege hinein: eine angemeldete Sitzung der Organisationsleitung —
       oder ein Sicherungsschlüssel, der nur das hier darf.               */
    if (pfad === "vollausgabe" && req.method === "GET") {
      if ((s.rolle !== "leitung" && !s.nurSicherung) || s.demo)
        return antwort({ fehler: "Nur die Organisationsleitung darf den ganzen Bestand ausgeben.",
          text: absageText(s.rolle) }, 403);
      const bv = await bremse("vollausgabe", kennung(req, s));
      if (!bv.frei) return zuVielAntwort(bv.wartet);
      const mit = await bestandJetzt();
      if (!mit) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
      /* Der eigene Betrieb, nicht der Raum. Bis Oktober 2026 bekam die
         Leitung eines Betriebs hier die Rohdaten aller Betriebe des Raums. */
      const va = vollausgabeBetrieb(mit.bestand, s);
      if (va.verweigert) return antwort({ fehler: va.verweigert }, va.status);
      await protokoll("vollausgabe", kennung(req, s), "erfolg",
        `${s.nurSicherung ? "Schlüssel" : "Sitzung"} · ${va.betrieb.id}`);
      const marke = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      return antwort({
        centric: "vollausgabe",
        fassung: 2,
        umfang: "betrieb",
        /* leitung oder sicherung — die beiden Exportkataloge (sicherungen.mjs) */
        inhalt: va.modus,
        erzeugt: new Date().toISOString(),
        raum: s.bestand,
        mandantId: va.betrieb.id,
        stand: mit.stand,
        bestand: { version: mit.bestand.version, stand: mit.bestand.stand, mandanten: [va.betrieb] },
      }, 200, { "content-disposition": `attachment; filename="centric-${s.bestand}-${marke}.json"` });
    }

    /* --------------------- Sicherungsschlüssel ----------------------
       Ein Schlüssel, der genau eines darf: den Bestand lesen. Er kann
       nichts ändern, nichts löschen und sich nicht anmelden. Damit lässt
       sich eine Sicherung einrichten, ohne einen Zugang aus der Hand zu
       geben, der den Betrieb umschreiben könnte.

       Er wird genau einmal gezeigt. Gespeichert ist nur der Hashwert —
       genau wie bei den Zugangscodes.                                  */
    if (pfad === "sicherungsschluessel" && req.method === "POST") {
      if (s.rolle !== "leitung" || s.nurSicherung || s.demo)
        return antwort({ fehler: "Nur die Organisationsleitung darf Sicherungsschlüssel anlegen." }, 403);
      if (!frisch(s)) return neuAnmelden();
      const { tage } = rumpf;
      /* Ein Schlüssel ohne Ablauf ist ein Schlüssel, der irgendwann in
         einem alten Skript vergessen wird. Höchstens ein Jahr. */
      const gueltig = Math.min(365, Math.max(1, Number(tage) || 90));
      /* Seit Oktober 2026 an den Betrieb gebunden, nicht nur an den Raum. */
      const skMit = await bestandJetzt();
      const skOrt = skMit ? eigenerBetrieb(skMit.bestand, s) : null;
      if (!skOrt) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
      const roh = randomBytes(24).toString("base64url");
      const bis = Date.now() + gueltig * 86400000;
      await sitzungen().setJSON(`sk:${hash(roh)}`, {
        bestand: s.bestand, rolle: "leitung", nurSicherung: true,
        betrieb: skOrt.index, mandantId: skOrt.betrieb.id,
        name: `Sicherungsschlüssel (${s.name || "Leitung"})`,
        angelegt: new Date().toISOString(), bis,
      });
      await protokoll("sicherungsschluessel", kennung(req, s), "erfolg", `${gueltig} Tage`, wer);
      return antwort({ ok: true, schluessel: roh, gueltigBis: new Date(bis).toISOString(),
        tage: gueltig,
        hinweis: "Dieser Schlüssel erscheint genau einmal. Er darf ausschließlich lesen." });
    }

    /* Auflisten und Widerrufen nur für den eigenen Betrieb. Bis Oktober 2026
       genügte derselbe Raum: Die Leitung von A sah die Schlüssel von B und
       konnte sie widerrufen — mit einer beliebig kurzen Kennung als Präfix.
       Ein Schlüssel gehört zum Betrieb über seine Kennung (mandantId, seit
       1f); ältere ohne Kennung nur in einem Raum mit genau einem Betrieb. */
    const schluesselImBetrieb = async () => {
      const mitS = await bestandJetzt();
      const ortS = mitS ? eigenerBetrieb(mitS.bestand, s) : null;
      const einBetrieb = !!(mitS && Array.isArray(mitS.bestand.mandanten) && mitS.bestand.mandanten.length === 1);
      return (k) => !!k && !!ortS && k.bestand === s.bestand
        && (k.mandantId ? k.mandantId === ortS.betrieb.id : einBetrieb);
    };

    if (pfad === "sicherungsschluessel" && req.method === "GET") {
      if (s.rolle !== "leitung" || s.nurSicherung || s.demo)
        return antwort({ fehler: "Nur die Organisationsleitung." }, 403);
      const gehoert = await schluesselImBetrieb();
      const { blobs } = await sitzungen().list({ prefix: "sk:" }).catch(() => ({ blobs: [] }));
      const liste = [];
      for (const b of blobs) {
        const k = await sitzungen().get(b.key, { type: "json" }).catch(() => null);
        if (!gehoert(k)) continue;
        liste.push({ kennung: b.key.slice(3, 11), angelegt: k.angelegt,
          gueltigBis: new Date(k.bis).toISOString(), abgelaufen: k.bis < Date.now() });
      }
      return antwort({ schluessel: liste.sort((a, b) => (a.angelegt < b.angelegt ? 1 : -1)) });
    }

    if (pfad === "sicherungsschluessel" && req.method === "DELETE") {
      if (s.rolle !== "leitung" || s.nurSicherung || s.demo)
        return antwort({ fehler: "Nur die Organisationsleitung." }, 403);
      const { kennung: kz } = rumpf;
      /* Genau die achtstellige Kennung aus der Liste — keine Präfixsuche. */
      if (!kz || !/^[0-9a-f]{8}$/.test(String(kz)))
        return antwort({ fehler: "Keine gültige Kennung angegeben (acht Zeichen aus der Liste)." }, 400);
      const gehoert = await schluesselImBetrieb();
      const { blobs } = await sitzungen().list({ prefix: `sk:${kz}` }).catch(() => ({ blobs: [] }));
      let weg = 0;
      for (const b of blobs) {
        if (b.key.slice(3, 11) !== kz) continue;
        const k = await sitzungen().get(b.key, { type: "json" }).catch(() => null);
        if (!gehoert(k)) continue;           // fremd: wie nicht gefunden
        await sitzungen().delete(b.key); weg++;
      }
      await protokoll("sicherungsschluessel", kennung(req, s), "widerrufen", String(weg), wer);
      return antwort({ ok: true, widerrufen: weg });
    }

    /* -------------------------- Sicherungskopien --------------------- */
    /* Bis Oktober 2026 durfte jede angemeldete Rolle beides, ohne Bremse,
       und gesichert wurde der ganze Raum. Jetzt: Leitung (und der eigene
       Probierraum), nur der eigene Betrieb, gebremst und protokolliert. */
    if (pfad === "sicherung" && req.method === "POST") {
      if (!SICHERUNG_ROLLEN.includes(s.rolle))
        return antwort({ fehler: "Sicherungen legt die Leitung an.", text: absageText(s.rolle) }, 403);
      const vorab = await bestandJetzt();
      if (!vorab) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
      const ortVorab = eigenerBetrieb(vorab.bestand, s);
      if (!ortVorab) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
      const bS = await bremse("sicherung", `${s.bestand}:${ortVorab.betrieb.id}`);
      if (!bS.frei) return zuVielAntwort(bS.wartet);
      const marke = markeNeu();
      /* Die Momentaufnahme unter der Sperre des Raums und streng gelesen:
         Ohne Sperre konnte sie mitten in einen Schreibvorgang fallen — Kern
         und erster Monat schon neu, zweiter Monat noch alt —, und ohne
         strenges Lesen fehlte einer unlesbaren Scherbe still in der
         Sicherung. Eine Sicherung, die keinen Stand abbildet, den es je gab,
         ist im Ernstfall wertlos. */
      const ort = await unterRaumsperre(s.bestand, async () => {
        const mit = await bestandLesenStreng(store, s.bestand);
        const o = mit ? eigenerBetrieb(mit.bestand, s) : null;
        if (!o) return null;
        await store.setJSON(`sicherung:${s.bestand}:${marke}`,
          betriebsSicherung(mit.bestand, o, { stand: mit.stand, durch: s.name || null }),
          { metadata: { zeit: new Date().toISOString(), durch: s.name || null,
            mandantId: o.betrieb.id, rolle: s.rolle } });
        return o;
      });
      if (!ort) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);
      await protokoll("sicherung", kennung(req, s), "erfolg", `${ort.betrieb.id} · ${marke}`, wer);
      await sicherungenAusduennen(store, s.bestand);
      return antwort({ ok: true, marke });
    }
    if (pfad === "sicherungen" && req.method === "GET") {
      if (!SICHERUNG_ROLLEN.includes(s.rolle))
        return antwort({ fehler: "Sicherungen sieht die Leitung.", text: absageText(s.rolle) }, 403);
      const mit = await bestandJetzt();
      const ort = mit ? eigenerBetrieb(mit.bestand, s) : null;
      if (!ort) return antwort({ sicherungen: [] });
      const { blobs } = await store.list({ prefix: `sicherung:${s.bestand}:` });
      const liste = [];
      for (const b of blobs) {
        const meta = await store.getMetadata(b.key).catch(() => null);
        const e = listenEintrag(b.key.split(":").pop(), meta?.metadata, ort.betrieb.id);
        if (e) liste.push(e);
      }
      return antwort({ sicherungen: liste.sort((a, b) => b.marke.localeCompare(a.marke)) });
    }

    /* --------------------------- Wiederherstellen -------------------- */
    /* Eine Sicherung, die sich nicht einspielen lässt, ist Speicherverbrauch
       mit gutem Gewissen. Bis hierher listete „sicherungen" nur Zeitmarken;
       einen Weg zurück gab es nicht.

       Vor dem Einspielen wird der jetzige Stand gesichert — sonst tauscht
       man einen Verlust gegen den nächsten. */
    if (pfad === "wiederherstellen" && req.method === "POST") {
      /* Bis Oktober 2026 spielte das den ganzen Raum zurück — alle Betriebe,
         Reihenfolge, Rollen, Vertragsfelder, Protokolle — an jeder Prüfung
         des Schreibwegs vorbei, und ohne Rücksicht auf inzwischen
         Gespeichertes. Jetzt: nur die Leitung, nur der eigene Betrieb an
         seiner Stelle, mit Rollen- und Vertragsschutz (lib/sicherungen.mjs)
         und nur auf den Stand, den sie zuletzt gesehen hat. */
      if (!WIEDERHERSTELLEN_ROLLEN.includes(s.rolle) || s.demo)
        return antwort({ fehler: "Wiederherstellen darf nur die Leitung.",
          text: absageText(s.rolle) }, 403);
      if (!frisch(s)) return neuAnmelden();
      const kW = kennung(req, s);
      const bW = await bremse("schreiben", kW);
      if (!bW.frei) return zuVielAntwort(bW.wartet);
      const bW2 = await bremse("wiederherstellen", kW);
      if (!bW2.frei) return zuVielAntwort(bW2.wartet);

      const { marke, etag: etagW } = rumpf;
      if (!marke || !MARKE.test(String(marke)))
        return antwort({ fehler: "Keine gültige Marke." }, 400);

      /* Unter der Sperre des Raums: Die Prüfung „Stand unverändert", die
         Sicherung des jetzigen Stands und der Tausch bilden eine Folge.
         Ohne Sperre konnte zwischen Prüfung und Tausch jemand speichern —
         seine Arbeit fehlte dann in der Sicherung „vor Wiederherstellung". */
      return await unterRaumsperre(s.bestand, async () => {
        /* Fünfter Review B-1: Lesezeit des Stands, der unten als „vor Wiederherstellung" gesichert wird. */
        const lesezeitW = new Date().toISOString();
        const jetztGelesen = await bestandLesenStreng(store, s.bestand);
        if (!jetztGelesen) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
        if (etagW === undefined || etagW === null || String(etagW) !== String(jetztGelesen.stand))
          return antwort({ fehler: "konflikt",
            text: "Der Bestand hat sich geändert. Bitte neu laden und die Wiederherstellung erneut bestätigen.",
            etag: jetztGelesen.stand }, 409);

        /* Offene Korrekturrevision (WP-16c): kein Zurückspielen, das Ist und Abschlüsse still verändert. */
        if ((jetztGelesen.bestand.mandanten || []).some(hatOffeneKorrektur)) {
          await protokoll("schreiben", kW, "abgewiesen", "Wiederherstellen: Korrektur offen", wer);
          return antwort({ fehler: "Es läuft eine Korrektur nach dem Lohnexport. Wiederherstellen ist erst nach ihrem Abschluss möglich.", code: "KORREKTUR_OFFEN" }, 409);
        }
        const alt2 = await store.get(`sicherung:${s.bestand}:${marke}`, { type: "json" });
        if (!alt2) return antwort({ fehler: "Diese Sicherung gibt es nicht." }, 404);
        const metaW = await store.getMetadata(`sicherung:${s.bestand}:${marke}`).catch(() => null);

        const w = betriebWiederherstellen(jetztGelesen.bestand, alt2, s,
          { marke, sicherungsZeit: metaW?.metadata?.zeit || alt2.erzeugt || null,
            automatisch: metaW?.metadata?.automatisch === "ja",
            zeitquelle: metaW?.metadata?.zeitquelle === "lesezeit" ? "lesezeit" : null });
        if (w.verweigert) {
          await protokoll("schreiben", kW, "abgewiesen", `wiederherstellen ${marke}: ${w.verweigert}`, wer);
          return antwort({ fehler: "Wiederherstellung nicht möglich.", text: w.verweigert }, w.status);
        }
        w.bestand = personenAngleichen(uebergabenAngleichen(w.bestand));
        const form = pruefeGestalt(w.bestand, { vorher: jetztGelesen.bestand });
        if (!form.ok)
          return antwort({ fehler: "Diese Sicherung ist unbrauchbar.", text: form.grund }, 422);
        /* Geänderte Standort- und Einsatzortangaben müssen gültig sein (Wertebereiche, Quelle, Art). */
        const ortW = bestandStandorteFehler(jetztGelesen.bestand, w.bestand);
        if (ortW) return antwort({ fehler: "Diese Sicherung ist unbrauchbar.", text: ortW }, 422);

        /* Erst den jetzigen Stand wegschreiben, dann tauschen. */
        const m2 = markeNeu();
        await store.setJSON(`sicherung:${s.bestand}:${m2}`, jetztGelesen.bestand,
          { metadata: { zeit: lesezeitW,
            durch: `automatisch vor Wiederherstellung von ${marke}`, automatisch: "ja", zeitquelle: "lesezeit" } })
          .catch(() => {});
        await sicherungenAusduennen(store, s.bestand);

        const ergW = await bestandSchreiben(store, s.bestand, w.bestand, {
          erwarteterStand: jetztGelesen.stand, neueEpoche: true,   // WP-48.2: offene Teilstände laden neu
          durch: `${s.name || "unbekannt"} · wiederhergestellt aus ${marke}` });
        if (!ergW.ok) {
          await protokoll("schreiben", kW, "konflikt", `wiederherstellen ${marke}`, wer);
          return antwort({ fehler: "konflikt",
            text: "Während der Wiederherstellung hat jemand gespeichert. Bitte neu laden.",
            etag: ergW.stand }, 409);
        }
        await protokoll("schreiben", kW, "erfolg",
          `wiederhergestellt aus ${marke}${w.stempelBehalten ? ` · ${w.stempelBehalten} Stempel behalten` : ""}`
          + `${w.fristen ? ` · Fristen (${w.fristen.modus}): ${w.fristen.text}` : ""}`.slice(0, 400), wer);
        return antwort({ ok: true, etag: ergW.stand, marke, fristen: w.fristen || null });
      });
    }

    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  } catch (e) {
    /* Die Raumsperre wurde nicht rechtzeitig frei (lib/raumsperre.mjs):
       Es wurde nichts geschrieben, und das soll die Antwort auch sagen —
       ein Stempel ist dann nicht erfasst, kein „ok", kein stiller Verlust. */
    if (e && /** @type {any} */ (e).code === SPERRE_ZEITGRENZE) {
      await protokoll("fehler", kennung(req, null), pfad, "Raumsperre: Zeitgrenze").catch(() => {});
      return antwort({ fehler: "Gerade wird sehr viel gespeichert.",
        text: "Es wurde nichts gespeichert. Bitte in einigen Sekunden noch einmal versuchen.",
        code: "SPEICHERN_BELEGT" }, 503, { "retry-after": "5" });
    }
    /* Der Prozess hat seine Ablagesperre verloren und nimmt keine neuen
       Schreibvorgänge mehr an (server.mjs, lib/prozesssperre.mjs). */
    if (e && /** @type {any} */ (e).code === SPERRE_GESTOPPT) {
      await protokoll("fehler", kennung(req, null), pfad, "Raumsperre: Schreibstopp").catch(() => {});
      return antwort({ fehler: "Der Server startet gerade neu.",
        text: "Es wurde nichts gespeichert. Bitte in einigen Sekunden noch einmal versuchen.",
        code: "SPEICHERN_GESTOPPT" }, 503, { "retry-after": "10" });
    }
    /* Ein Teil des gespeicherten Bestands ist nicht lesbar (lib/bestand.mjs,
       bestandLesenStreng). Geschrieben wurde nichts — wer jetzt schriebe,
       schriebe einen Bestand ohne diesen Teil, und der Teil ginge verloren. */
    if (e && /** @type {any} */ (e).code === BESTAND_UNLESBAR) {
      await protokoll("fehler", kennung(req, null), pfad, String(e.message || e).slice(0, 200)).catch(() => {});
      console.error(`${pfad}: ${String(e.message || e).slice(0, 300)}`);
      return antwort({ fehler: "Der gespeicherte Stand ist gerade nicht vollständig lesbar.",
        text: "Es wurde nichts gespeichert. Bitte die Betriebsleitung bzw. den Betreiber verständigen.",
        code: "BESTAND_UNLESBAR" }, 503);
    }
    /* Nach außen nur, dass es schiefging. Die Einzelheiten bleiben im
       Protokoll — eine Fehlermeldung mit Innenleben ist eine Landkarte
       für den nächsten Angriff. */
    await protokoll("fehler", kennung(req, null), pfad, String(e && e.message || e).slice(0, 200));
    return antwort({ fehler: "Serverfehler",
      text: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/api/*"] };
