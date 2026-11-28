/* ==========================================================================
   PLANER-OBERFLÄCHE, Stufe 1 — Aktionen (WP-I7 Teil 6): Schalter und Betriebsmodus des Planers, Anheften und Lösen.
   Ansichten: src/ansichten/planer-steuerung.jsx, src/ansichten/anheftungen.jsx; reine Teile: src/lib/planer-oberflaeche.js.

   Nach dem Muster von src/lib/ki-steuerung-aktionen.js (Review #596): Es wird sofort geschrieben (PUT /api/bestand), danach der
   Stand des Servers zurückgelesen (liesZumVergleich: rückt den ETag nie vor). Erfolg heißt NUR: Der Serverstand zeigt die Änderung.
   Lesen schlägt fehl, der Server lehnt ab (Recht fehlt, ungültig), Konflikt (409) oder keine Rückmeldung: sichtbarer Fehler, die lokale
   Anzeige geht auf den Serverstand bzw. den Stand davor zurück. Jede Aktion liefert ein Versprechen { ok, text } für die Anzeige
   an Ort und Stelle (die Meldung geht zusätzlich an `melde`). Wann und von wem, setzt der Server; mitgeschickte Stempel zählen nie.
   ========================================================================== */
import * as SP from "../speicher.js";
import { kiAbsichtAnwenden, kiSteuerungBestaetigt } from "./ki-steuerung-aktionen.js";
import { sitzRolle, sitzRolleText, einteilungZumAnheften, mitAnheftung, ohneAnheftung, anheftungBestaetigt, planerWegFehler } from "./planer-oberflaeche.js";
import { ANGEHEFTET_FELD } from "../../server/lib/engine/anheften.mjs";

/** Obergrenze für das Warten auf eine Rückmeldung des Speicherwegs (ms). */
export const PLANER_WARTEZEIT = 45000;

const NICHT_BESTAETIGT = "Ob der Server die Änderung übernommen hat, ließ sich nicht bestätigen. Bitte neu laden und prüfen.";
const NICHT_UEBERNOMMEN = "Der Server hat die Änderung nicht übernommen. Es gilt der gespeicherte Stand; bitte neu laden und prüfen.";
const KONFLIKT = "Der Betrieb wurde zwischenzeitlich geändert. Bitte neu laden.";
const KEINE_RUECKMELDUNG = "Der Server hat nicht geantwortet. Die Änderung ist nicht bestätigt; bitte neu laden und prüfen.";

/** Text zu einer Absage des Speicherwegs: nie „gespeichert“, möglichst mit dem Grund des Servers. */
export function planerFehlerText(lage) {
  if (lage && lage.art === "bestaetigung") return "Der Server verlangt eine Bestätigung zu dieser Einteilung (Regelhinweis). Bitte die Einteilung im Tagesdetail prüfen; es wurde nichts geändert.";
  const t = lage && typeof lage.text === "string" ? lage.text.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  return t ? `Die Änderung konnte nicht gespeichert werden: ${t}` : "Die Änderung konnte nicht gespeichert werden.";
}

/**
 * Schreibt den Bestand und bestätigt am zurückgelesenen Serverstand des Betriebs.
 * @param {{ neu: any, id: string, durch: string, bestaetigt: (m: any) => boolean, textOk: string, melde: (t: string) => void,
 *   bei: { bestaetigt: (m: any) => void, abgelehnt: (m: any | null) => void, zurueck: () => void } }} a
 * @returns {Promise<{ ok: boolean, text: string }>}
 */
function schreibenBestaetigt(a) {
  const { neu, id, durch, bestaetigt, textOk, melde, bei } = a;
  return new Promise((aufloesen) => {
    let fertig = false, uhr = null;
    const ende = (ok, text, nach) => {
      if (fertig) return;
      fertig = true;
      if (uhr) clearTimeout(uhr);
      try { if (nach) nach(); } finally { melde(text); aufloesen({ ok, text }); }
    };
    const pruefen = async () => {
      let m = null, gelesen = false;
      try {
        const bestand = await SP.liesZumVergleich();
        m = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten.find((x) => x && x.id === id) || null : null;
        gelesen = true;
      } catch { gelesen = false; }
      if (!gelesen) return ende(false, NICHT_BESTAETIGT, bei.zurueck);
      if (m && bestaetigt(m)) return ende(true, textOk, () => bei.bestaetigt(m));
      return ende(false, NICHT_UEBERNOMMEN, () => bei.abgelehnt(m));
    };
    uhr = setTimeout(() => ende(false, KEINE_RUECKMELDUNG, bei.zurueck), PLANER_WARTEZEIT);
    let r;
    try {
      r = SP.schreib(neu, { durch, sofort: true,
        onFehler: (lage) => ende(false, planerFehlerText(lage), bei.zurueck),
        onKonflikt: () => ende(false, KONFLIKT, bei.zurueck),
        onGespeichert: () => { pruefen(); } });
    } catch { ende(false, planerFehlerText(null), bei.zurueck); return; }
    Promise.resolve(r).then((x) => { if (x && x.gesperrt) ende(false, planerFehlerText(null), bei.zurueck); }, () => ende(false, planerFehlerText(null), bei.zurueck));
  });
}

const mitSteuerung = (m, fn) => ({ ...m, einstellungen: { ...(m.einstellungen || {}), kiSteuerung: fn((m.einstellungen || {}).kiSteuerung || {}) } });
const ersetzeMandant = (d, id, fn) => ({ ...d, mandanten: d.mandanten.map((m) => (m.id === id ? fn(m) : m)) });

/**
 * @param {{ melde: (t: string) => void, ref: { current: any }, upd: (fn: (d: any) => any) => void, sitz?: any }} k
 */
export function planerAktionen(k) {
  const { melde, ref, upd } = k;
  const jetzt = () => ref && ref.current;
  const abgewiesen = (text) => { melde(text); return Promise.resolve({ ok: false, text }); };
  return {
    /**
     * Schalter und Betriebsmodus des Planers (nur Leitung; der Server prüft Rolle und Inhalt).
     * @param {{ planerSchalter?: { an: boolean }, planerModus?: { modus: string } }} absicht
     */
    setzePlanerSteuerung: (absicht) => {
      const s = jetzt();
      if (!s || !s.session || !Array.isArray(s.mandanten) || !absicht || typeof absicht !== "object") return abgewiesen("Die Änderung konnte nicht gesendet werden.");
      const id = s.session.mandantId;
      const rolle = sitzRolle(k.sitz) || "leitung";
      /* Vorläufige Anzeige: lesbar (mit Stempel „ausstehend“), bis der Serverstand zurückgelesen ist. Der Server ignoriert den Stempel. */
      const lokal = { ...absicht };
      for (const f of ["planerSchalter", "planerModus"]) if (lokal[f]) lokal[f] = { ...lokal[f], am: "ausstehend", vonRolle: rolle };
      const vorher = (((s.mandanten.find((m) => m.id === id) || {}).einstellungen || {}).kiSteuerung) || {};
      const neu = (d) => ersetzeMandant(d, id, (m) => mitSteuerung(m, (st) => kiAbsichtAnwenden(st, lokal)));
      const stelleHer = (d) => ersetzeMandant(d, id, (m) => mitSteuerung(m, (st) => {
        const aus = { ...st };
        for (const f of ["planerSchalter", "planerModus"]) if (absicht[f]) { if (vorher[f] === undefined) delete aus[f]; else aus[f] = vorher[f]; }
        return aus;
      }));
      const mitServer = (stand) => (d) => ersetzeMandant(d, id, (m) => mitSteuerung(m, () => stand));
      upd(neu);
      return schreibenBestaetigt({
        neu: neu(s), id, durch: sitzRolleText(k.sitz), melde,
        bestaetigt: (m) => kiSteuerungBestaetigt(absicht, m.einstellungen ? m.einstellungen.kiSteuerung : null),
        textOk: "Planer-Einstellung geändert. Sie wirkt erst, wenn der Planer freigegeben ist und alle Voraussetzungen erfüllt sind.",
        bei: {
          bestaetigt: (m) => upd(mitServer(m.einstellungen.kiSteuerung)),
          abgelehnt: (m) => upd(m && m.einstellungen && m.einstellungen.kiSteuerung ? mitServer(m.einstellungen.kiSteuerung) : stelleHer),
          zurueck: () => upd(stelleHer),
        },
      });
    },

    /** Eine Einteilung anheften: der Planer ändert sie nicht (Leitung, Planung; der Server prüft Rolle und Einteilung). */
    anheftenEinteilung: (personId, tag) => {
      const s = jetzt();
      if (!s || !s.session || !Array.isArray(s.mandanten)) return abgewiesen("Die Änderung konnte nicht gesendet werden.");
      const id = s.session.mandantId;
      const m0 = s.mandanten.find((m) => m.id === id);
      if (!m0) return abgewiesen("Der Betrieb ist nicht geladen.");
      const e = einteilungZumAnheften(m0, String(personId), String(tag));
      if (!e.ok) return abgewiesen(e.grund);
      const neuM = mitAnheftung(m0, e.schluessel, e.wert);
      if (!neuM) return abgewiesen("Die Anheftungen sind nicht lesbar. Es wird nichts verändert.");
      return anhefteSchreiben(k, s, id, m0, e.schluessel, neuM, "anheften", e.wert,
        "Einteilung angeheftet: Der Planer ändert sie nicht.");
    },

    /* Planvorschlag erzeugen, prüfen, übernehmen, zurücknehmen (WP-I7 Stufe 3): eigene Server-Wege, nie PUT /api/bestand. Jede Aktion liefert
       { ok, text, daten, code?, unklar?, verbraucht? }; die Texte stammen aus der Kennungstabelle (planerWegFehler), nie vom Server. */
    planerVorschlagErzeugen: (ym) => planerWeg(k, "planer-vorschlag", { ym }, { gut: (d) => Array.isArray(d.eintraege) }),
    planerAuswahlPruefen: (vorschlag, auswahl) => planerWeg(k, "planer-uebernahme", { vorschlag, auswahl }, { gut: (d) => d.geprueft === true && d.geschrieben === false }),
    planerUebernehmen: (vorschlag, auswahl) => planerWeg(k, "planer-uebernahme", { vorschlag, auswahl, bestaetigt: true }, { schreibend: true, gut: (d) => d.geschrieben === true }),
    planerRueckgaengigListe: (ym) => planerWeg(k, "planer-rueckgaengig-liste", { ym }, { lesen: true, gut: (d) => Array.isArray(d.eintraege) }),
    planerRueckgaengigPruefen: (uebernahme) => planerWeg(k, "planer-rueckgaengig", { uebernahme }, { gut: (d) => d.geprueft === true && d.geschrieben === false }),
    planerRueckgaengigAusfuehren: (uebernahme) => planerWeg(k, "planer-rueckgaengig", { uebernahme, bestaetigt: true }, { schreibend: true, gut: (d) => d.geschrieben === true }),

    /** Die Anheftung einer Einteilung lösen; die Einteilung selbst bleibt. */
    loeseAnheftung: (schluessel) => {
      const s = jetzt();
      if (!s || !s.session || !Array.isArray(s.mandanten)) return abgewiesen("Die Änderung konnte nicht gesendet werden.");
      const id = s.session.mandantId;
      const m0 = s.mandanten.find((m) => m.id === id);
      if (!m0) return abgewiesen("Der Betrieb ist nicht geladen.");
      const neuM = ohneAnheftung(m0, String(schluessel));
      if (!neuM) return abgewiesen("Die Anheftungen sind nicht lesbar. Es wird nichts verändert.");
      return anhefteSchreiben(k, s, id, m0, String(schluessel), neuM, "loesen", undefined,
        "Anheftung gelöst. Die Einteilung selbst bleibt unverändert.");
    },
  };
}

/** Gemeinsamer Schreibweg von Anheften und Lösen: vorläufig lokal, dann bestätigt oder zurück. */
function anhefteSchreiben(k, s, id, m0, schluessel, neuM, art, wert, textOk) {
  const { melde, upd } = k;
  const hatAbw = (m) => !!m.abweichungen && Object.prototype.hasOwnProperty.call(m.abweichungen, schluessel);
  const vorherAbw = hatAbw(m0) ? m0.abweichungen[schluessel] : undefined, vorherHat = hatAbw(m0);
  const vorherKarte = Object.prototype.hasOwnProperty.call(m0, ANGEHEFTET_FELD) ? m0[ANGEHEFTET_FELD] : undefined;
  const lokalSetzen = (d) => ersetzeMandant(d, id, (m) => ({ ...m, abweichungen: neuM.abweichungen, [ANGEHEFTET_FELD]: neuM[ANGEHEFTET_FELD] }));
  const zurueckSetzen = (d) => ersetzeMandant(d, id, (m) => {
    const abw = { ...(m.abweichungen || {}) };
    if (vorherHat) abw[schluessel] = vorherAbw; else delete abw[schluessel];
    const aus = { ...m, abweichungen: abw };
    if (vorherKarte === undefined) delete aus[ANGEHEFTET_FELD]; else aus[ANGEHEFTET_FELD] = vorherKarte;
    return aus;
  });
  /* Vom Serverstand nur diese Einteilung und die Karte der Anheftungen (nie der übrige lokale Stand). */
  const mitServer = (sm) => (d) => ersetzeMandant(d, id, (m) => {
    const abw = { ...(m.abweichungen || {}) };
    if (sm.abweichungen && Object.prototype.hasOwnProperty.call(sm.abweichungen, schluessel)) abw[schluessel] = sm.abweichungen[schluessel]; else delete abw[schluessel];
    const aus = { ...m, abweichungen: abw };
    if (sm[ANGEHEFTET_FELD] === undefined) delete aus[ANGEHEFTET_FELD]; else aus[ANGEHEFTET_FELD] = sm[ANGEHEFTET_FELD];
    return aus;
  });
  upd(lokalSetzen);
  const neu = { ...s, mandanten: s.mandanten.map((m) => (m.id === id ? neuM : m)) };
  return schreibenBestaetigt({
    neu, id, durch: sitzRolleText(k.sitz), melde, textOk,
    bestaetigt: (sm) => anheftungBestaetigt(art, schluessel, wert, sm),
    bei: {
      bestaetigt: (sm) => upd(mitServer(sm)),
      abgelehnt: (sm) => upd(sm ? mitServer(sm) : zurueckSetzen),
      zurueck: () => upd(zurueckSetzen),
    },
  });
}

/* ------------------------------------------------------------------ Planvorschlag: Server-Wege (WP-I7 Stufe 3) */

const PLANER_LAEUFT = "Es läuft gerade schon eine Anfrage an den Planer. Bitte kurz warten.";
const UNEINDEUTIG = "Die Antwort des Servers war nicht eindeutig.";
/** Eine Anfrage an den Planer zugleich (Vorschlag, Prüfen, Übernehmen, Rücknahme): ein Mehrfachklick sendet nie zweimal. Die Liste ist ausgenommen. */
const planerLauf = { aktiv: false };

/** Nach einer Übernahme oder Rücknahme (und wo unklar ist, ob): den gespeicherten Stand samt ETag nachladen (App.jsx serverstandNachladen). */
async function neuLaden(k) {
  if (!k || typeof k.serverstandNachladen !== "function") return;
  try { await k.serverstandNachladen((d) => d); } catch { /* der Hinweis auf „neu laden“ steht in der Meldung */ }
}

/**
 * Ein Weg der Planvorschlag-Übernahme. Erfolg heißt NUR: eine ausdrückliche, zur Aktion passende Erfolgsantwort (`gut`); alles andere ist
 * ein sichtbarer Fehler mit dem Text der Kennung. Bei der Bestätigung (`schreibend`) ist ohne Antwort oder mit einer Antwort ohne bekannte
 * Kennung unklar, ob gespeichert wurde: dann `unklar`, der Stand wird neu gelesen und nichts wird wiederholt.
 * @param {any} k @param {string} weg @param {Record<string, any>} rumpf
 * @param {{ lesen?: boolean, schreibend?: boolean, gut: (d: any) => boolean }} o
 * @returns {Promise<{ ok: boolean, text: string, daten: any, status: number, code?: string | null, unklar?: boolean, verbraucht?: boolean }>}
 */
async function planerWeg(k, weg, rumpf, o) {
  const melde = k && typeof k.melde === "function" ? k.melde : () => {};
  const schreibend = o.schreibend === true;
  if (o.lesen !== true) {
    if (planerLauf.aktiv) return { ok: false, text: PLANER_LAEUFT, daten: null, status: 0, code: "laeuft" };
    planerLauf.aktiv = true;
  }
  try {
    let r;
    try {
      r = await SP.planerWegSenden(weg, rumpf);
    } catch (e) {
      const abgemeldet = !!e && e.message === "nicht-angemeldet";
      const f = planerWegFehler(abgemeldet ? 401 : 0, null, { schreibend: schreibend && !abgemeldet });
      if (f.neuLaden) await neuLaden(k);
      if (schreibend) melde(f.text);
      return { ok: false, text: f.text, daten: null, status: 0, code: f.code, unklar: f.unklar, verbraucht: f.verbraucht };
    }
    const d = r.daten && typeof r.daten === "object" && !Array.isArray(r.daten) ? r.daten : {};
    if (r.status >= 200 && r.status < 300 && d.ok === true && o.gut(d)) {
      if (schreibend) await neuLaden(k);
      return { ok: true, text: "", daten: d, status: r.status };
    }
    /* Eine 2xx-Antwort ohne ausdrückliche Erfolgsmeldung ist kein Erfolg (bei der Bestätigung: unklar). */
    const f = r.status >= 200 && r.status < 300
      ? (schreibend ? planerWegFehler(0, null, { schreibend: true }) : { code: null, text: UNEINDEUTIG, unklar: false, neuLaden: false, verbraucht: false })
      : planerWegFehler(r.status, d, { schreibend });
    if (f.neuLaden) await neuLaden(k);
    if (schreibend) melde(f.text);
    return { ok: false, text: f.text, daten: d, status: r.status, code: f.code, unklar: f.unklar, verbraucht: f.verbraucht };
  } finally {
    if (o.lesen !== true) planerLauf.aktiv = false;
  }
}
