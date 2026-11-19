/* ==========================================================================
   WIDERRUFBUCH-SICHERUNG — Vereinigen, Rücksprung erkennen, Alterswarnung
   (BE-3, Betreiberentscheidung 2026-11-14, Option A;
   docs/acc45/ENTSCHEIDUNG-BE1-BE3.md §3, docs/acc45/ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md)

   Die beiden Widerrufbücher im Zustandsverzeichnis — Zugangscodes (E-M6,
   widerrufbuch.mjs, `zugang-widerrufe.json`) und Konten (BE-1/BE-2,
   kontowiderrufbuch.mjs, `konto-widerrufe.json`) — liegen bewusst NICHT in
   der Sicherung der Ablage. Ein eigener Job (deploy/sicherung/
   widerrufbuch-sicherung.sh) sichert sie stündlich in ein eigenes restic-
   Repository. Dieses Modul enthält die reine Logik dafür, ohne restic:

     Vereinigen   Beide Bücher enthalten nur EINSCHRÄNKUNGEN (Widerrufe,
                  Abschlüsse, Regime, Mindestgenerationen, Pflicht-Faktoren,
                  verbrauchte Codes). Mehr Einträge heißen nie mehr Zugang.
                  Deshalb ist die Vereinigung zweier Stände DERSELBEN Umgebung
                  sicher: Was in einem der beiden steht, steht danach im
                  Ergebnis; nichts wird entfernt, Mindestgenerationen nehmen
                  das Maximum. Ein vorhandener Eintrag bleibt unverändert
                  (idempotent). Siegel und Herkunft prüft der Aufrufer
                  (werkzeug/ablage-sicherung.mjs widerrufbuch-vereinen) vorher.
     Rücksprung   `fehlendeEintraege(aktuell, vorher)`: Einträge der letzten
                  Sicherung, die im aktuellen Buch fehlen. Ein Buch wird nur
                  fortgeschrieben — fehlt etwas, wurde ein ÄLTERER, gültig
                  gesiegelter Stand zurückgelegt (Restrisiko R-1 aus E-M6,
                  z. B. Schnappschuss über Ablage UND Zustand). Der Job sichert
                  dann nicht (sonst verdrängte der alte Stand den neuen als
                  „letzten“) und meldet „ruecksprung“; /gesund warnt, bis
                  `widerrufbuch-vereinen` die Kopie zurückgeführt hat.
     Alter        /gesund (Prüfung „widerrufbuchsicherung“): Statusdatei des
                  Jobs (Pfad in CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS, wie die
                  Sicherung der Ablage) — gescheitert, Rücksprung, älter als
                  SICHERUNG_WARNUNG_STUNDEN oder ein Buch, das sich vor mehr als
                  NACHLAUF_MINUTEN nach der letzten erfolgreichen Sicherung
                  geändert hat: WARNUNG. Nie mehr: Eine ausgefallene Sicherung
                  sperrt keine Anmeldung (die Bücher selbst sind ja gültig).
                  Fail-closed bleibt allein Sache der Bücher (unlesbar, fremd,
                  falsches Siegel → 503 wie bisher).

   Grenzwerte sind feste, dokumentierte Konstanten — nicht je Betrieb und
   nicht über die Umgebung einstellbar. Keine Kennung, kein Pfad und kein
   Geheimnis verlässt dieses Modul; /gesund bekommt nur Stufe, Text und Alter.
   ========================================================================== */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { BUCH_DATEI } from "./widerrufbuch.mjs";
import { KONTOBUCH_DATEI, kontobuchVereinen } from "./kontowiderrufbuch.mjs";

/** Der Job läuft stündlich. Drei Stunden ohne Erfolg = mindestens zwei ausgefallene Läufe. */
export const SICHERUNG_WARNUNG_STUNDEN = 3;
/** Ein Buch, das sich geändert hat, muss spätestens nach so vielen Minuten gesichert sein (ein Lauf plus Spielraum). */
export const NACHLAUF_MINUTEN = 90;
/** Name der Umgebungsvariable mit dem Pfad der Statusdatei im Container. */
export const STATUS_VARIABLE = "CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS";

/** Die Bücher: Art → Dateiname. */
export const BUECHER = Object.freeze({ codes: BUCH_DATEI, konten: KONTOBUCH_DATEI });

const istMap = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const CODES_ABSCHNITTE = ["eintraege", "verwalter", "betriebe", "regime"];
const KONTO_FEST = new Set(["fassung", "id", "ids", "konten", "mitglieder", "wiederherstellungen", "siegel"]);

/** Haben zwei Bücher eine gemeinsame Herkunft (eine gemeinsame Kennung)? Sonst stammt eines aus einer anderen Umgebung. */
export const gemeinsameHerkunft = (a, b) => Array.isArray(a?.ids) && Array.isArray(b?.ids) && a.ids.some((i) => b.ids.includes(i));

function idsVereinen(ziel, quelle) {
  let neu = 0;
  for (const id of quelle.ids || []) if (!ziel.ids.includes(id)) { ziel.ids.push(id); neu++; }
  return neu;
}

function wiederherstellungenVereinen(ziel, quelle) {
  const schluessel = (w) => JSON.stringify([String(w?.zeit), String(w?.sicherungErstellt)]);
  const da = new Set((ziel.wiederherstellungen || []).map(schluessel));
  let neu = 0;
  for (const w of quelle.wiederherstellungen || []) {
    if (!istMap(w) || da.has(schluessel(w))) continue;
    ziel.wiederherstellungen.push({ zeit: String(w.zeit), sicherungErstellt: String(w.sicherungErstellt) });
    da.add(schluessel(w));
    neu++;
  }
  if (neu) ziel.wiederherstellungen.sort((x, y) => String(x.zeit).localeCompare(String(y.zeit)));
  return neu;
}

/**
 * Buch der Zugangscodes: `quelle` in `ziel` vereinigen (beide geprüft, gleiche Herkunft). Nur hinzufügen; ein
 * vorhandener Eintrag bleibt, wie er ist (bei Betrieben wird nur eine fehlende Personenkennung ergänzt).
 * @returns {number} Zahl der Änderungen (0: nichts Neues)
 */
export function codesbuchVereinen(ziel, quelle) {
  let neu = 0;
  for (const a of CODES_ABSCHNITTE) {
    if (!istMap(ziel[a])) ziel[a] = {};
    for (const [k, v] of Object.entries(istMap(quelle[a]) ? quelle[a] : {})) {
      const da = ziel[a][k];
      if (!da) { ziel[a][k] = { ...v }; neu++; }
      else if (a === "betriebe" && !da.person && v && v.person) { ziel[a][k] = { ...da, person: String(v.person) }; neu++; }
    }
  }
  return neu + idsVereinen(ziel, quelle) + wiederherstellungenVereinen(ziel, quelle);
}

/**
 * Konto-Buch: `quelle` in `ziel` (kontobuchVereinen: Konten, Mindestgenerationen als Maximum, alle weiteren
 * Abschnitte wie Pflicht-Faktoren und verbrauchte Codes) und zusätzlich die vermerkten Wiederherstellungen.
 * @returns {number} Zahl der Änderungen
 */
export function kontobuchVereinigen(ziel, quelle) {
  const vorher = ziel.ids.length;
  const neu = kontobuchVereinen(ziel, quelle);
  return neu + (ziel.ids.length - vorher) + wiederherstellungenVereinen(ziel, quelle);
}

/** @param {"codes"|"konten"} art */
export const vereinen = (art, ziel, quelle) => (art === "codes" ? codesbuchVereinen(ziel, quelle) : kontobuchVereinigen(ziel, quelle));

/** Alle Einträge eines Buchs (über alle Abschnitte). @param {"codes"|"konten"} art */
export function eintragZahl(b, art) {
  if (!istMap(b)) return 0;
  if (art === "codes") return CODES_ABSCHNITTE.reduce((n, a) => n + (istMap(b[a]) ? Object.keys(b[a]).length : 0), 0);
  let n = 0;
  for (const [k, v] of Object.entries(b)) if ((k === "konten" || k === "mitglieder" || !KONTO_FEST.has(k)) && istMap(v)) n += Object.keys(v).length;
  return n;
}

/**
 * Wie viele Einträge von `vorher` fehlen in `aktuell` (oder sind dort schwächer: Mindestgeneration kleiner)?
 * Fehlt `aktuell` ganz, fehlt alles (mindestens 1: ein verschwundenes Buch ist immer ein Befund).
 * @param {any} aktuell @param {any} vorher @param {"codes"|"konten"} art
 */
export function fehlendeEintraege(aktuell, vorher, art) {
  if (!vorher) return 0;
  if (!aktuell) return Math.max(1, eintragZahl(vorher, art));
  let fehlt = 0;
  const pruefe = (a) => {
    const da = istMap(aktuell[a]) ? aktuell[a] : {};
    for (const [k, v] of Object.entries(istMap(vorher[a]) ? vorher[a] : {})) {
      if (!Object.hasOwn(da, k)) fehlt++;
      else if (art === "konten" && a === "mitglieder" && !(Number(da[k].generation) >= Number(v.generation))) fehlt++;
    }
  };
  if (art === "codes") CODES_ABSCHNITTE.forEach(pruefe);
  else for (const k of Object.keys(vorher)) if ((k === "konten" || k === "mitglieder" || !KONTO_FEST.has(k)) && istMap(vorher[k])) pruefe(k);
  return fehlt;
}

/**
 * Exit-Codes des Jobs deploy/sicherung/widerrufbuch-sicherung.sh (Tabelle dort und in
 * docs/acc45/ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md §2.2.1). 3 gilt NUR für einen erkannten Rücksprung.
 */
export const EXIT_BEDEUTUNG = Object.freeze({ 1: "(Fehler)", 3: "(Rücksprung)", 4: "(restic gescheitert)",
  5: "(Vergleichsstand fehlt)", 75: "(anderer Lauf aktiv)", 78: "(Konfiguration)", 124: "(Zeitgrenze Container)" });

/**
 * Lage der Sicherung aus der Statusdatei des Jobs — reine Funktion (feste Uhr in den Prüfungen).
 * @param {any} st  Inhalt der Statusdatei (null: nicht lesbar)
 * @param {{jetzt: number, buchGeaendertMs?: number|null}} o  buchGeaendertMs: jüngste Änderung eines der Bücher
 * @returns {{stufe: "ok"|"warnung", text?: string, ergebnis?: string, alterStunden?: number}}
 */
export function sicherungLage(st, { jetzt, buchGeaendertMs = null }) {
  if (!istMap(st)) return { stufe: "warnung", text: "Statusdatei nicht lesbar" };
  const ergebnis = /^[a-z-]{1,20}$/.test(String(st.ergebnis)) ? String(st.ergebnis) : "unbekannt";
  const erfolg = Date.parse(st.letzte_erfolgreiche || "");
  const alterStunden = Number.isFinite(erfolg) ? Math.round(((jetzt - erfolg) / 3600000) * 10) / 10 : undefined;
  const werte = { ergebnis, ...(alterStunden === undefined ? {} : { alterStunden }) };
  if (ergebnis === "ruecksprung")
    return { stufe: "warnung", ...werte, text: "Widerrufbuch kennt Einträge der letzten Sicherung nicht (älterer Stand zurückgelegt?) — "
      + "widerrufbuch-vereinen ausführen (BEREITSTELLUNG.md §5.4)" };
  if (ergebnis === "vergleich-fehlt")
    return { stufe: "warnung", ...werte, text: "kein Vergleichsstand für diese Host-Kennung, obwohl frühere Sicherungen bekannt sind — "
      + "Rücksprungprüfung nicht möglich, nichts gesichert; RESTIC_HOST prüfen oder bewusst --erster-lauf (BETRIEB-SICHERUNG.md §7)" };
  if (ergebnis !== "ok") {
    const schritt = /^[a-z-]{1,40}$/.test(String(st.schritt)) ? String(st.schritt) : "unbekannt";
    const code = Number.isInteger(st.code) && st.code > 0 && st.code < 256 ? st.code : null;
    const art = code === null ? "" : `, Code ${code}${EXIT_BEDEUTUNG[code] ? ` ${EXIT_BEDEUTUNG[code]}` : ""}`;
    return { stufe: "warnung", ...werte, text: `letzter Lauf gescheitert (Schritt ${schritt}${art}) — Anmeldungen sind davon nicht betroffen` };
  }
  if (alterStunden === undefined) return { stufe: "warnung", ...werte, text: "keine erfolgreiche Sicherung bekannt" };
  if (alterStunden > SICHERUNG_WARNUNG_STUNDEN)
    return { stufe: "warnung", ...werte, text: `letzte erfolgreiche Sicherung älter als ${SICHERUNG_WARNUNG_STUNDEN} Stunden` };
  if (Number.isFinite(buchGeaendertMs) && /** @type {number} */ (buchGeaendertMs) > erfolg
    && jetzt - /** @type {number} */ (buchGeaendertMs) > NACHLAUF_MINUTEN * 60000)
    return { stufe: "warnung", ...werte, text: `Widerrufbuch seit mehr als ${NACHLAUF_MINUTEN} Minuten geändert und noch nicht gesichert` };
  return { stufe: "ok", ...werte };
}

/**
 * Für /gesund. Ohne CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS: „nicht eingerichtet“ (wie die Sicherung der Ablage).
 * @param {{jetzt?: number}} [o]
 */
export async function widerrufbuchSicherungPruefen({ jetzt = Date.now() } = {}) {
  const datei = (process.env[STATUS_VARIABLE] || "").trim();
  if (!datei) return { stufe: "ok", text: `nicht eingerichtet (${STATUS_VARIABLE})` };
  let st = null;
  try { st = JSON.parse(await readFile(datei, "utf8")); } catch { /* unten: nicht lesbar */ }
  let buchGeaendertMs = null;
  try {
    const { zustandsVerzeichnis } = await import("./schluesselepoche.mjs");
    const verz = zustandsVerzeichnis();
    for (const n of Object.values(BUECHER)) {
      try {
        const m = (await stat(path.join(verz, n))).mtimeMs;
        if (buchGeaendertMs === null || m > buchGeaendertMs) buchGeaendertMs = m;
      } catch { /* Buch fehlt: kein Alter */ }
    }
  } catch { /* Zustandsverzeichnis unklar: meldet die Prüfung „schluessel“ */ }
  return sicherungLage(st, { jetzt, buchGeaendertMs });
}
