/* ==========================================================================
   EINLADUNGEN — die Leitung lädt eine Person ein (WP-18)

   Bis hierher entstanden Zugangscodes nur beim Betreiber (/api/zugaenge,
   mit frischer Anmeldung und zweitem Faktor). Die Leitung konnte niemanden
   aus ihrem eigenen Betrieb hereinholen, ohne den Betreiber zu bemühen —
   und der Betreiber sah dabei jeden Code im Klartext.

   Der Weg hier hat zwei Schritte, und das ist Absicht:

     1. Die Leitung stellt für EINE Person aus IHREM Betrieb eine Einladung
        aus. Sie bekommt nur die Einladung zu sehen, keinen Zugangscode.
     2. Die Person löst die Einladung genau einmal ein und bekommt dabei
        ihren persönlichen Zugangscode. Er erscheint genau einmal, bei ihr.

   Damit kennt niemand außer der Person ihren Code — auch die Leitung nicht.
   „Ein Code = eine Person" heißt hier dreierlei:
     - der Code ist an genau eine Person gebunden (konto.person),
     - eine Person bekommt über diesen Weg keinen zweiten aktiven Code
       (wer schon einen hat, muss erst gesperrt werden),
     - eine Einladung gilt einmal und nur, solange sie die jüngste für diese
       Person ist (eine neue Einladung entwertet die ältere).

   Die Rolle kommt aus der Personalliste, nicht aus der Anfrage. Das ist
   dieselbe Wahrheit, die nach der Anmeldung gilt (rechte.mjs, wirksameRolle):
   Eine Einladung mit einer anderen Rolle als der eingetragenen würde nach
   der Anmeldung ohnehin auf die eingetragene zurückfallen — sie wird
   deshalb gar nicht erst ausgestellt.

   Fail-closed: Jeder Zweifel (Bestand nicht lesbar, Betrieb verschoben,
   Person nicht mehr aktiv, Rolle geändert) ist ein Nein. Eine verbrauchte
   Einladung bleibt verbraucht, auch wenn danach etwas nicht passte — die
   Leitung lädt dann neu ein.

   Einmaligkeit und Frist kommen aus token.mjs (Zweck „einladung", 7 Tage,
   prozesslokale Reihe gegen gleichzeitiges Einlösen). Account-Einladungen
   teilen den Zweck; Zugangseinladungen tragen `art: "zugang"`, damit sich
   die eine nicht als die andere einlösen lässt.
   ========================================================================== */

import { createHash, randomBytes } from "node:crypto";
import { tokenAusstellen, tokenEinloesen } from "./token.mjs";
import { kontoLesen, kontoSchreiben, alleKonten } from "./konten.mjs";
import { ablageSchluessel } from "./codes.mjs";
import { darfVergeben } from "./rollenvergabe.mjs";
import { darf, eigenerMandant, wirksameRolle, sitzungsRolleBekannt } from "./rechte.mjs";
import { aktivePerson } from "./personengueltig.mjs";
import { heuteBerlin } from "./zeiterfassung.mjs";
import { betriebFuerNeuenCode } from "./erstbefuellung.mjs";
import { unterRaumsperre } from "./raumsperre.mjs";

const ART = "zugang";
const NR_PRAEFIX = "einladungsnr:";

/** Ergebnis ohne Erfolg: Status und Text für die Antwort, Grund fürs Protokoll. */
const nein = (status, fehler, grund) => ({ ok: false, status, fehler, grund });

/* Für alles, was danach nicht mehr eingelöst werden kann, dieselbe Antwort:
   unbekannt, abgelaufen, schon benutzt und entwertet sehen von außen gleich aus. */
export const EINLADUNG_UNGUELTIG = "Diese Einladung ist ungültig, abgelaufen oder wurde schon verwendet. "
  + "Bitte die Organisationsleitung um eine neue.";

const nrSchluessel = (raum, mandantId, person) => NR_PRAEFIX
  + createHash("sha256").update(JSON.stringify([String(raum), String(mandantId), String(person)])).digest("hex");

async function nrLesen(store, schluessel) {
  const d = await store.get(schluessel, { type: "json" });
  return d && Number.isInteger(d.einladung) ? d.einladung : 0;
}

/* Dasselbe Alphabet und dieselbe Form wie die Codes aus /api/zugaenge. */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
const block = () => Array.from(randomBytes(4)).map((b) => ALPHABET[b % ALPHABET.length]).join("");
const neuerCode = () => `${block()}-${block()}-${block()}`;

const personName = (p) => [p.vorname, p.nachname].filter(Boolean).join(" ").trim() || String(p.id);

/** Gehört dieser Kontoeintrag zu genau dieser Person in genau diesem Betrieb? */
function kontoDerPerson(k, raum, betrieb, mandantId, person) {
  if (!k || k.bestand !== raum || k.rolle === "betreiber" || k.demo === true) return false;
  if (k.person === null || k.person === undefined || String(k.person) !== String(person)) return false;
  if (k.mandantId) return k.mandantId === mandantId;
  return Number(k.betrieb ?? 0) === Number(betrieb);
}

/** Hat die Person schon einen nutzbaren Zugang? Ein Lesefehler wird weitergereicht (fail-closed). */
export async function aktiverZugangVorhanden(store, { raum, betrieb, mandantId, person }) {
  const konten = await alleKonten(store);
  return Object.values(konten).some((k) => kontoDerPerson(k, raum, betrieb, mandantId, person) && !k.gesperrt);
}

/**
 * Prüft, ob die Sitzung für diese Person eine Einladung ausstellen darf, und stellt sie aus.
 *
 * @param {object} store  Ablage „centric"
 * @param {{sitzung: any, bestand: any, personId: unknown, rolle?: unknown, jetzt?: () => number}} o
 * @returns {Promise<{ok: true, einladung: string, bis: number, person: {id: string, name: string}, rolle: string}
 *   | {ok: false, status: number, fehler: string, grund: string}>}
 */
export async function einladungAusstellen(store, { sitzung: s, bestand, personId, rolle, jetzt = Date.now }) {
  if (!s || s.nurSicherung) return nein(401, "Nicht angemeldet.", "keine Sitzung");
  if (s.demo === true) return nein(403, "Im Demozugang lassen sich keine Einladungen ausstellen.", "demo");
  if (s.rolle === "betreiber" || !sitzungsRolleBekannt(s.rolle))
    return nein(403, "Einladungen stellt die Organisationsleitung aus.", "rolle der sitzung");
  if (!bestand || !Array.isArray(bestand.mandanten) || !bestand.mandanten.length)
    return nein(409, "Der Betrieb ist noch nicht eingerichtet.", "kein bestand");

  /* Der eigene Betrieb muss eindeutig der sein, an den die Sitzung gebunden ist. Eine Sitzung ohne
     Betriebskennung (alter Code in einem Raum mit mehreren Betrieben) stellt nichts aus. */
  const m = eigenerMandant(bestand, s);
  if (!s.mandantId || !m || m.id !== s.mandantId)
    return nein(403, "Dieser Zugang ist keinem Betrieb eindeutig zugeordnet.", "betrieb nicht eindeutig");

  const vergeber = wirksameRolle(s, bestand);
  if (!darf(vergeber, "roles.assign"))
    return nein(403, "Einladungen stellt die Organisationsleitung aus.", `keine rollenvergabe (${vergeber})`);

  if (typeof personId !== "string" || !personId || personId.length > 80)
    return nein(400, "Keine Person angegeben.", "person fehlt");
  /* Gesucht wird nur im eigenen Betrieb: Eine Person aus einem fremden Betrieb ist hier „gibt es nicht". */
  const p = aktivePerson(m, personId, heuteBerlin(new Date(jetzt())));
  if (!p) return nein(404, "Diese Person gibt es in deinem Betrieb nicht (oder sie ist nicht aktiv).", "person unbekannt");

  if (rolle !== undefined && rolle !== null && rolle !== p.rolle)
    return nein(409, "Die Rolle passt nicht zur Personalliste. Bitte erst die Rolle der Person ändern.", "rolle weicht ab");
  const urteil = darfVergeben(vergeber, p.rolle, null);
  if (!urteil.ok) return nein(403, urteil.grund, `rolle nicht vergebbar (${p.rolle})`);

  const ziel = { raum: s.bestand, betrieb: Number(s.betrieb ?? 0), mandantId: m.id, person: String(p.id) };
  if (await aktiverZugangVorhanden(store, ziel))
    return nein(409, "Diese Person hat schon einen Zugang. Ein Code gehört genau einer Person — "
      + "für einen neuen bitte den alten zuerst sperren.", "zugang vorhanden");

  /* Neue Laufnummer: Jede ältere Einladung für diese Person ist damit wertlos. */
  const nrS = nrSchluessel(ziel.raum, ziel.mandantId, ziel.person);
  const nr = (await nrLesen(store, nrS)) + 1;
  await store.setJSON(nrS, { einladung: nr });
  const { token, bis } = await tokenAusstellen(store, { zweck: "einladung", nr, jetzt,
    inhalt: { art: ART, bestand: ziel.raum, betrieb: ziel.betrieb, mandantId: ziel.mandantId,
      person: ziel.person, rolle: p.rolle, von: s.person ?? null } });
  return { ok: true, einladung: token, bis, person: { id: ziel.person, name: personName(p) }, rolle: p.rolle };
}

/**
 * Löst eine Einladung ein und legt den persönlichen Zugangscode an.
 *
 * @param {object} store
 * @param {{einladung: unknown, bestandLesen: (raum: string) => Promise<any>, jetzt?: () => number}} o
 *   `bestandLesen` liest streng (wirft bei einem Lesefehler).
 * @returns {Promise<{ok: true, zugangscode: string, rolle: string, name: string, person: string}
 *   | {ok: false, status: number, fehler: string, grund: string}>}
 */
export async function einladungEinloesen(store, { einladung, bestandLesen, jetzt = Date.now }) {
  if (typeof einladung !== "string" || einladung.length < 20 || einladung.length > 200)
    return nein(400, "Bitte die Einladung vollständig eingeben.", "form");
  /* Erst verbrauchen, dann urteilen (token.mjs): Ein zweiter Versuch findet nichts mehr. */
  const r = await tokenEinloesen(store, einladung.trim(), { zweck: "einladung", jetzt });
  const e = r.eintrag;
  if (!e) return nein(410, EINLADUNG_UNGUELTIG, r.grund || "unbekannt");
  if (e.art !== ART) return nein(410, EINLADUNG_UNGUELTIG, "andere art");

  return unterRaumsperre(`@einladung:${e.bestand}`, async () => {
    if ((await nrLesen(store, nrSchluessel(e.bestand, e.mandantId, e.person))) !== e.nr)
      return nein(410, EINLADUNG_UNGUELTIG, "entwertet");

    const gelesen = await bestandLesen(e.bestand);
    const bindung = betriebFuerNeuenCode(gelesen && gelesen.bestand, e.betrieb);
    if (bindung.grund || bindung.mandantId !== e.mandantId)
      return nein(409, "Der Betrieb dieser Einladung hat sich geändert. Bitte neu einladen lassen.", "betrieb verschoben");
    const m = gelesen.bestand.mandanten[bindung.betrieb];
    const p = aktivePerson(m, e.person, heuteBerlin(new Date(jetzt())));
    if (!p) return nein(409, "Diese Person ist im Betrieb nicht mehr aktiv.", "person weg");
    if (p.rolle !== e.rolle)
      return nein(409, "Die Rolle hat sich seit der Einladung geändert. Bitte neu einladen lassen.", "rolle geändert");

    const ziel = { raum: e.bestand, betrieb: bindung.betrieb, mandantId: bindung.mandantId, person: e.person };
    if (await aktiverZugangVorhanden(store, ziel))
      return nein(409, "Für diese Person gibt es schon einen Zugang.", "zugang vorhanden");

    let code = null;
    for (let i = 0; i < 5 && !code; i += 1) {
      const c = neuerCode();
      if (!(await kontoLesen(store, ablageSchluessel(c)))) code = c;
    }
    if (!code) return nein(503, "Der Zugang ließ sich gerade nicht anlegen. Bitte erneut einladen lassen.", "kein freier code");

    const am = new Date(jetzt()).toISOString();
    await kontoSchreiben(store, ablageSchluessel(code), {
      name: m.name || e.bestand, bestand: e.bestand, rolle: e.rolle, person: e.person,
      betrieb: bindung.betrieb, mandantId: bindung.mandantId,
      demo: false, gruppe: null, hinweis: null, angelegt: am,
      einladung: { von: e.von ?? null, am } });
    return { ok: true, zugangscode: code, rolle: e.rolle, name: m.name || e.bestand, person: e.person };
  });
}
