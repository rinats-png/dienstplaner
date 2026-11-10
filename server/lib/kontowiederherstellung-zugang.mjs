/* ==========================================================================
   KONTOWIEDERHERSTELLUNG ÜBER DEN ZUGANGSCODE (WR-3)

   Die Verlust-Schnittstelle für Zugangscodes der Rollen mit zweitem Faktor
   (Leitung, Planung, Kunde; SI-P4). Alles läuft über /api/anmelden mit dem
   Zugangscode als erstem Faktor — es gibt keinen neuen Endpunkt und keine
   Sitzung aus diesem Weg:

     { zugangscode, zweifaktorAktion: "verlust-melden" }
         Träger: Fall eröffnen (Gerät und Codes verloren). Alle Sitzungen des
         Zugangs enden. → { ok, fall, gueltigBis }
     { zugangscode, zweifaktorAktion: "verlust-zurueckziehen" }
         Träger: den laufenden Fall zurückziehen.
     { zugangscode, zweifaktorAktion: "verlust-freigeben", zweifaktor, fall, verfahren[, aktenzeichen] }
     { zugangscode, zweifaktorAktion: "verlust-ablehnen",  zweifaktor, fall, grund }
         Freigebende Leitung desselben Betriebs: eigener Zugangscode UND ein
         frischer Code aus der eigenen App (kein Wiederherstellungscode, kein
         Nachweis; derselbe Zeitschritt gilt nie zweimal). Die zweite
         Freigabe gibt das Abschlusstoken genau einmal zurück (15 min).
     { zugangscode, zweifaktorAktion: "verlust-einloesen", freigabe }
         Träger: Token einlösen → eine NEUE AUSSTEHENDE Einrichtung (Geheimnis
         genau einmal). Danach wie immer „bestaetigen" mit dem ersten Code,
         dann die gewöhnliche Anmeldung mit Code aus der App. Das Token
         ergibt nie eine Sitzung.

   Nicht hier: Betreibercodes (403 „gesperrt", WR-BETREIBER/WR-4), Konten mit
   E-Mail und Passwort (WR-9), ein Betreiberprozess für Betriebe mit weniger
   als zwei geeigneten Leitungen (D8, gesperrt) — es gibt keine Stelle, an
   der der Betreiber freigeben könnte.

   Antworten ohne Auskunft: Jede abgewiesene Freigabe — unbekannter,
   fremder, abgelaufener Fall, falsche Rolle, Selbstfreigabe, fehlende
   Unabhängigkeit — antwortet gleich (403 „nein", nach fester Wartezeit).
   Jedes nicht eingelöste Token ebenso (401 „falsch"). Gebremst wird jede
   Aktion (GRENZEN.verlust bzw. GRENZEN.zweifaktor für den Code aus der App,
   je Zugang und je Herkunft, fail-closed). Protokolliert werden Fall,
   Ereignis und pseudonyme Kennungen — nie Token, Geheimnis, Namen.
   ========================================================================== */

import { kontoLesenStreng } from "./konten.mjs";
import { bestandLesenStreng } from "./bestand.mjs";
import { codeBindung } from "./erstbefuellung.mjs";
import { wirksameRolle, eigenerMandant, einheitAm } from "./rechte.mjs";
import { bremse, entlasten, protokoll, zuVielAntwort, GRENZEN } from "./schutz.mjs";
import { zweifaktorStand, zweifaktorPruefen, zweifaktorNachVerlustNeu } from "./zweifaktor.mjs";
import { fallEroeffnen, fallFreigeben, fallAblehnen, fallZurueckziehen, fallEinloesen, laufenderFall,
  fallKennungLesen, VERFAHREN, ABLEHNUNGSGRUENDE, AKTENZEICHEN_MUSTER, FREIGABE_ROLLE } from "./kontowiederherstellung.mjs";

/**
 * Ist der Verlustweg freigeschaltet? Nur mit CENTRIC_KONTOWIEDERHERSTELLUNG=1 (jeder andere Wert: aus). Die
 * produktive Aktivierung ist eine eigene Betreiberfreigabe (KONTO-WIEDERHERSTELLUNG.md, Kopf und J; Benachrichtigung
 * I.11 ist noch nicht gebaut) — deshalb gebaut, aber gesperrt ausgeliefert. Wird bei jedem Aufruf gelesen.
 * @param {Record<string, string|undefined>} [env]
 */
export const verlustwegAn = (env = process.env) => String(env.CENTRIC_KONTOWIEDERHERSTELLUNG || "").trim() === "1";

/** Die Aktionen dieses Wegs (zweifaktorAktion). */
export const VERLUST_AKTIONEN = Object.freeze(["verlust-melden", "verlust-zurueckziehen", "verlust-freigeben",
  "verlust-ablehnen", "verlust-einloesen"]);

const json = (d, status = 200) => new Response(JSON.stringify(d), { status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const nichtPruefbar = () => json({ fehler: "Der zweite Faktor lässt sich gerade nicht prüfen. "
  + "Bitte später erneut versuchen." }, 503);
const warten = () => new Promise((r) => setTimeout(r, 400));
const NEIN = { fehler: "Diese Freigabe ist nicht möglich.", verlust: "nein" };
const FALSCH = { fehler: "Die Freigabe stimmt nicht oder gilt nicht mehr.", verlust: "falsch" };
const leer = (v) => v === null || v === undefined || v === "";

/** Heute als JJJJ-MM-TT (für die datumsbezogene Einheit). */
const heute = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Die Einheiten eines Zugangs: am Code (`einheit`/`gruppe`) und der Person heute. Betriebsweit („ALLE", leer) fällt
 * weg. Ein unlesbarer Bestand ist kein „keine Einheit" — der Aufrufer bekommt ihn nur gelesen.
 * @param {any} eintrag @param {any} bestand @param {number} ms
 */
function einheitenVon(eintrag, bestand, ms) {
  const aus = new Set();
  const c = eintrag ? (eintrag.einheit ?? eintrag.gruppe ?? null) : null;
  if (!leer(c) && c !== "ALLE") aus.add(String(c));
  if (eintrag && !leer(eintrag.person)) {
    const m = eigenerMandant(bestand, { betrieb: eintrag.betrieb ?? 0 });
    const p = m && Array.isArray(m.personen) ? m.personen.find((x) => x && String(x.id) === String(eintrag.person)) : null;
    const e = p ? einheitAm(p, heute(ms)) : null;
    if (!leer(e) && e !== "ALLE") aus.add(String(e));
  }
  return [...aus];
}

/**
 * Den Handelnden (Träger oder Freigebender) aus dem Anmeldeweg beschreiben.
 * @param {any} kontext  aus funktionen/daten.mjs: { eintrag, bestand, mandantId, rolleWirksam, codeSchluessel, kontoSchluessel }
 * @param {number} ms
 */
function handelnder(kontext, ms) {
  const e = kontext.eintrag || {};
  return { kennung: kontext.codeSchluessel, schluessel: kontext.kontoSchluessel || kontext.codeSchluessel,
    person: leer(e.person) ? null : String(e.person), raum: e.bestand, mandantId: kontext.mandantId || null,
    betrieb: Number(e.betrieb ?? 0), rolle: kontext.rolleWirksam, einheiten: einheitenVon(e, kontext.bestand, ms) };
}

/**
 * Gilt eine frühere Freigabe noch (J.2f)? Frisch aus der Ablage: Zugang vorhanden, nicht gesperrt, nicht abgelaufen,
 * derselbe Raum und dieselbe Person, Betriebsbindung zum selben Mandanten, wirksame Rolle Leitung, Faktor aktiv, kein
 * eigener laufender Verlustfall. Ein Lesefehler wirft (→ 503, nichts geschrieben).
 * @param {any} store @param {(s: string) => string} faktorIdFuer @param {number} ms
 */
const nochGueltigFuer = (store, faktorIdFuer, ms) => async (fr) => {
  const e = await kontoLesenStreng(store, fr.schluessel);
  if (!e || e.gesperrt || e.rolle === "betreiber" || e.bestand !== fr.raum) return false;
  if (e.laeuftAb && new Date(e.laeuftAb).getTime() < ms) return false;
  if (leer(e.person) || String(e.person) !== String(fr.person)) return false;
  if (Number(e.betrieb ?? 0) !== Number(fr.betrieb ?? 0)) return false;
  const g = await bestandLesenStreng(store, fr.raum);
  const b = codeBindung(g && g.bestand, e);
  if (!b.ok || leer(b.mandantId) || b.mandantId !== fr.mandantId) return false;
  const rolle = wirksameRolle({ rolle: e.rolle, person: e.person ?? null, betrieb: e.betrieb ?? 0,
    mandantId: b.mandantId }, g && g.bestand);
  if (rolle !== FREIGABE_ROLLE) return false;
  const fid = faktorIdFuer(fr.kennung);
  if (!(await zweifaktorStand(store, fid)).aktiv) return false;
  if (await laufenderFall(store, fid, ms)) return false;
  return true;
};

/**
 * Bremse für die Kennungen einer Aktion. null = weiter.
 * @param {string} art @param {string[]} kennungen @param {string} k
 */
async function bremsen(art, kennungen, k) {
  for (const kk of kennungen) {
    const b = await bremse(art, kk);
    if (!b.frei) { await protokoll("zweifaktor", k, "gebremst", b.grund); return zuVielAntwort(b.wartet); }
    if (b.fehler && GRENZEN[art] && GRENZEN[art].failClosed) return nichtPruefbar();
  }
  return null;
}
const entlastenAlle = async (art, kennungen) => { for (const kk of kennungen) await entlasten(art, kk); };

/**
 * Eine Verlust-Aktion für einen bereits als gültig erkannten Zugangscode ausführen. Immer mit Antwort; nie eine Sitzung.
 * @param {{store: any, k: string, rumpf: any, aktion: string, id: string, vermerk: boolean, stand: any,
 *   kontext: any, name: string, sitzungenBeenden: () => Promise<{beendet: number, fehler: number}>,
 *   codeRichtig: () => Promise<void>, faktorIdFuer: (s: string) => string, ms?: number}} a
 * @returns {Promise<Response>}
 */
export async function verlustAktion({ store, k, rumpf, aktion, id, vermerk, stand, kontext, name, sitzungenBeenden,
  codeRichtig, faktorIdFuer, ms = Date.now() }) {
  /* Betreibercodes und Verwalterschlüssel: nicht über diesen Weg (J.1, F.1; Betreiberprozess D8 gesperrt). */
  if (!vermerk || !kontext) {
    await protokoll("zweifaktor", k, "abgewiesen", "Verlust · Betreiber gesperrt");
    return json({ fehler: "Für diesen Zugang gibt es keinen Verlustweg über das Netz.", zweifaktor: "gesperrt" }, 403);
  }
  if (!verlustwegAn()) {
    await protokoll("zweifaktor", k, "abgewiesen", "Verlust · nicht freigeschaltet");
    return json({ fehler: "Der Verlustweg ist auf diesem Server nicht freigeschaltet. Bitte an die Organisationsleitung "
      + "wenden.", zweifaktor: "gesperrt" }, 403);
  }
  const id16 = id.slice(0, 16);
  const pseud = `r:${id16}`;
  try {
    if (aktion === "verlust-melden") return await melden();
    if (aktion === "verlust-zurueckziehen") return await zurueckziehen();
    if (aktion === "verlust-freigeben" || aktion === "verlust-ablehnen") return await freigeben(aktion === "verlust-ablehnen");
    if (aktion === "verlust-einloesen") return await einloesen();
  } catch {
    await protokoll("zweifaktor", k, "fehler", `Verlust · ${aktion} · Ablage`);
    return nichtPruefbar();
  }
  return json({ fehler: "Unbekannte Aktion." }, 400);

  async function melden() {
    const gebremst = await bremsen("verlust", [`vl:${id16}`, `vlh:${k}`], k); if (gebremst) return gebremst;
    /* Ein Fall setzt einen Faktor voraus (aktiv, oder eine abgelaufene Einrichtung aus einem früheren Fall). */
    if (!(stand.aktiv || (stand.ausVerlust && !stand.ausstehend)) || !stand.faktorKennung) {
      await protokoll("zweifaktor", k, "abgewiesen", "Verlust · kein Faktor");
      return json({ fehler: stand.ausstehend ? "Eine Einrichtung ist begonnen; bitte mit dem Code aus der App bestätigen."
        : "Für diesen Zugang ist kein zweiter Faktor eingerichtet.", zweifaktor: stand.ausstehend ? "ausstehend" : "nicht-aktiv" }, 409);
    }
    const t = handelnder(kontext, ms);
    if (leer(t.person) || leer(t.mandantId) || leer(t.raum)) {
      /* Ohne Personenbezug lässt sich „keine Selbstfreigabe" nicht prüfen (J.2a/b) — kein Fall (fail-closed). */
      await protokoll("zweifaktor", k, "abgewiesen", "Verlust · ohne Person oder Betrieb");
      return json({ fehler: "Für diesen Zugang ist der Weg über zwei Freigaben nicht möglich. Bitte an die "
        + "Organisationsleitung wenden.", verlust: "nicht-moeglich" }, 409);
    }
    const vorher = await sitzungenBeenden();
    if (vorher.fehler) return json({ fehler: "Bisherige Sitzungen dieses Zugangs ließen sich nicht alle beenden — "
      + "es wurde kein Fall eröffnet. Bitte erneut versuchen.", zweifaktor: "sitzungen" }, 503);
    const r = /** @type {any} */ (await fallEroeffnen(store, { traeger: { id, kennung: t.kennung, schluessel: t.schluessel, person: t.person,
      raum: t.raum, mandantId: t.mandantId, betrieb: t.betrieb, rolle: t.rolle }, faktorKennung: stand.faktorKennung, ms }));
    if (!r.ok) {
      if (r.grund === "epoche") return nichtPruefbar();
      await protokoll("zweifaktor", k, "abgewiesen", `Verlust · Eröffnung · ${r.grund}`);
      if (r.grund === "offen") return json({ fehler: "Für diesen Zugang läuft bereits ein Fall.", verlust: "offen" }, 409);
      if (r.grund === "gesperrt") return json({ fehler: "Nach einer Ablehnung ist ein neuer Fall erst später möglich.",
        verlust: "gesperrt" }, 409);
      return json({ fehler: "Für diesen Zugang ist der Weg über zwei Freigaben nicht möglich.", verlust: "nicht-moeglich" }, 409);
    }
    const danach = await sitzungenBeenden();
    await codeRichtig();
    await protokoll("zweifaktor", k, "warnung", `Verlust · Fall eröffnet ${r.fall} · ${pseud} · `
      + `${vorher.beendet + danach.beendet} Sitzungen beendet`);
    return json({ ok: true, fall: r.fall, gueltigBis: new Date(r.bisMs).toISOString(),
      hinweis: "Zwei Leitungen dieses Betriebs müssen den Fall freigeben, jede mit einem frischen Code aus ihrer App. "
        + "Das Ergebnis ist ein Abschlusstoken, das 15 Minuten gilt und persönlich übergeben wird. Der Fall endet nach 24 Stunden." });
  }

  async function zurueckziehen() {
    const gebremst = await bremsen("verlust", [`vl:${id16}`, `vlh:${k}`], k); if (gebremst) return gebremst;
    const r = await fallZurueckziehen(store, { traegerId: id, ms });
    await codeRichtig();
    if (r.fall) await protokoll("zweifaktor", k, "warnung", `Verlust · Fall zurückgezogen ${r.fall} · ${pseud}`);
    return json({ ok: true });
  }

  async function freigeben(ablehnen) {
    const fall = fallKennungLesen(rumpf && rumpf.fall);
    const verfahren = String((rumpf && rumpf.verfahren) || "");
    const grund = String((rumpf && rumpf.grund) || "");
    const aktenzeichen = rumpf && !leer(rumpf.aktenzeichen) ? String(rumpf.aktenzeichen) : null;
    /* Form zuerst — sie sagt nichts über einen Fall. */
    if (!fall) return json({ fehler: "Bitte die Fallkennung angeben (F-…).", verlust: "ungueltig" }, 400);
    if (!ablehnen && !VERFAHREN.includes(verfahren))
      return json({ fehler: `Bitte das Verfahren der Identitätsprüfung angeben: ${VERFAHREN.join(", ")}.`, verlust: "ungueltig" }, 400);
    if (!ablehnen && aktenzeichen !== null && !AKTENZEICHEN_MUSTER.test(aktenzeichen))
      return json({ fehler: "Das Aktenzeichen ist ungültig.", verlust: "ungueltig" }, 400);
    if (ablehnen && !ABLEHNUNGSGRUENDE.includes(grund))
      return json({ fehler: `Bitte einen Grund angeben: ${ABLEHNUNGSGRUENDE.join(", ")}.`, verlust: "ungueltig" }, 400);
    const code = rumpf && rumpf.zweifaktor ? String(rumpf.zweifaktor).replace(/\s/g, "") : "";
    const kennungenF = [`vf:${id16}`, k];
    /* Frischer Code aus der eigenen App — sechs Ziffern, nie ein Wiederherstellungscode oder Nachweis. */
    if (!/^\d{6}$/.test(code)) {
      await warten();
      await protokoll("zweifaktor", k, "abgewiesen", "Verlust · Freigabe ohne Code aus der App");
      return json({ fehler: "Dafür ist ein frischer Code aus der App nötig.", zweifaktor: "falsch" }, 401);
    }
    const gebremst = await bremsen("zweifaktor", kennungenF, k); if (gebremst) return gebremst;
    /* Selbst nicht vollständig authentifizierbar (kein aktiver Faktor) oder selbst im Verlustfall: nein. */
    if (!stand.aktiv || (await laufenderFall(store, id, ms))) {
      await warten();
      await protokoll("zweifaktor", k, "abgewiesen", `Verlust · ${ablehnen ? "Ablehnung" : "Freigabe"} · Freigebender ohne Faktor`);
      return json(NEIN, 403);
    }
    const p = await zweifaktorPruefen(store, id, { code, nachweisErlaubt: false, ms });
    if (!p.ok || p.art !== "totp") {
      if (p.grund === "pfeffer") return nichtPruefbar();
      await warten();
      await protokoll("zweifaktor", k, "abgewiesen", `Verlust · Freigabe · ${p.grund}`);
      return json({ fehler: p.grund === "wiederholt" ? "Dieser Code wurde schon verwendet. Bitte den nächsten abwarten."
        : "Der zweite Faktor stimmt nicht.", zweifaktor: "falsch" }, 401);
    }
    await entlastenAlle("zweifaktor", kennungenF);
    await codeRichtig();
    const kennungenV = [`vf:${id16}`, `vfh:${k}`];
    const gebremstV = await bremsen("verlust", kennungenV, k); if (gebremstV) return gebremstV;
    const w = handelnder(kontext, ms);
    const nochGueltig = nochGueltigFuer(store, faktorIdFuer, ms);
    /* Der Handelnde selbst — streng aus der Ablage (Rolle, Mandant, Faktor), nicht nur aus dem Anmeldeweg. */
    if (leer(w.person) || leer(w.mandantId) || !(await nochGueltig(w))) {
      await warten();
      await protokoll("zweifaktor", k, "abgewiesen", `Verlust · ${ablehnen ? "Ablehnung" : "Freigabe"} · ${pseud} · nicht berechtigt`);
      return json(NEIN, 403);
    }
    const r = /** @type {any} */ (ablehnen
      ? await fallAblehnen(store, { fall, freigebender: w, grund, ms })
      : await fallFreigeben(store, { fall, freigebender: w, verfahren, aktenzeichen, ms, nochGueltig }));
    if (!r.ok) {
      if (r.grund === "epoche") return nichtPruefbar();
      await warten();
      await protokoll("zweifaktor", k, "abgewiesen", `Verlust · ${ablehnen ? "Ablehnung" : "Freigabe"} · ${pseud} · ${r.grund}`);
      return json(NEIN, 403);
    }
    await entlastenAlle("verlust", kennungenV);
    if (ablehnen) {
      await protokoll("zweifaktor", k, "warnung", `Verlust · Fall abgelehnt ${fall} · ${pseud} · ${grund}`);
      return json({ ok: true, stand: "abgelehnt" });
    }
    await protokoll("zweifaktor", k, "erfolg", `Verlust · Fall ${r.stand} ${fall} · ${pseud} · ${verfahren}`
      + `${aktenzeichen ? ` · Az. ${aktenzeichen}` : ""}`);
    if (r.stand === "teilfreigegeben") return json({ ok: true, stand: "teilfreigegeben" });
    return json({ ok: true, stand: "freigegeben", freigabe: r.token, gueltigBis: new Date(r.bisMs).toISOString(),
      hinweis: "Das Abschlusstoken erscheint genau einmal und gilt 15 Minuten. Nach der Identitätsprüfung persönlich "
        + "oder telefonisch übergeben, nie per E-Mail allein." });
  }

  async function einloesen() {
    const kennungenE = [`ve:${id16}`, `veh:${k}`];
    const gebremst = await bremsen("verlust", kennungenE, k); if (gebremst) return gebremst;
    const r = /** @type {any} */ (await fallEinloesen(store, { traegerId: id, token: rumpf && rumpf.freigabe, faktorKennung: stand.faktorKennung,
      ms, wirkung: async (fall) => {
        const s = await sitzungenBeenden();
        if (s.fehler) return { ok: false, fehler: "sitzungen" };
        return zweifaktorNachVerlustNeu(store, id, name || "Zugang", { erwartet: stand.faktorKennung, fall });
      } }));
    if (!r.ok) {
      if (r.grund === "epoche") return nichtPruefbar();
      if (r.grund === "wirkung") {
        await protokoll("zweifaktor", k, "fehler", `Verlust · Einlösen · Wirkung gescheitert · ${pseud}`);
        return json({ fehler: "Die Freigabe ist verbraucht, der zweite Faktor blieb unverändert. Bitte einen neuen Fall "
          + "eröffnen.", verlust: "gescheitert" }, 503);
      }
      await warten();
      await protokoll("zweifaktor", k, "abgewiesen", `Verlust · Einlösen · ${pseud} · ${r.grund}`);
      return json(FALSCH, 401);
    }
    await entlastenAlle("verlust", kennungenE);
    await codeRichtig();
    await protokoll("zweifaktor", k, "warnung", `Verlust · Fall eingelöst ${r.fall} · ${pseud} · neue Einrichtung begonnen`);
    return json({ ok: true, geheimnis: r.ergebnis.geheimnis, otpauth: r.ergebnis.otpauth,
      hinweis: "Geheimnis und Adresse erscheinen genau einmal. In der App erfassen und innerhalb von 15 Minuten mit dem "
        + "ersten Code bestätigen (zweifaktorAktion: bestaetigen). Danach gilt die gewöhnliche Anmeldung mit Code aus der App." });
  }
}
