/* ==========================================================================
   STEMPELPUFFER — Stempeln ohne Netz (WP-07)

   Jedes Stempeln wird zuerst als Ereignis auf dem Gerät abgelegt und erst
   danach gesendet. Ein Ereignis trägt:

     id          zufällige Kennung (UUID v4, crypto) — bleibt bei jeder
                 Wiederholung dieselbe; der Server macht daraus genau einen
                 Stempel (server/lib/zeiterfassung.mjs, ereignisFinden)
     erfasstAm   Uhrzeit des Geräts beim Drücken; der Server plausibilisiert
                 sie gegen seinen Eingang (stempelEreignis)
     inhaber     wem die Warteschlange gehört (Raum, Betrieb, Person der
                 Sitzung, vom Server als Prüfsumme geliefert)
     reihe       Reihenfolge der Erfassung — gesendet wird streng in dieser
                 Reihenfolge, je Inhaber; ein Ende geht nie vor seinem Beginn

   Zustände: „wartet" (nicht quittiert — vorläufig), „bestaetigt" (der
   Server hat den Stempel gespeichert), „abgelehnt" (der Server hat
   endgültig abgesagt; bleibt sichtbar mit Grund, bis die Person ihn zur
   Kenntnis nimmt oder erneut senden lässt). Ein Ereignis verschwindet nie
   still: Gelöscht wird nur, was bestätigt und älter als einen Tag ist, oder
   was die Person ausdrücklich verwirft.

   Abgelegt wird in IndexedDB; geht das nicht (alter Browser, gesperrter
   Speicher), in localStorage; geht auch das nicht, im Arbeitsspeicher — dann
   meldet `dauerhaft()` false und die Oberfläche sagt, dass ein Neustart den
   Stempel verlieren würde.

   Rein bis auf die Speicheradapter: Senden, Uhr und Speicher werden
   übergeben, damit sich Reihenfolge, Wiederholung und Idempotenz ohne
   Browser prüfen lassen (pruefungen/stempelpuffer.test.js).
   ========================================================================== */

export const BESTAETIGT_HALTEN_MS = 24 * 60 * 60 * 1000;
export const WARTEN_MIN_MS = 2000;
export const WARTEN_MAX_MS = 5 * 60 * 1000;
/** Streuung auf Retry-After (wie STEMPEL_429_STREUUNG in speicher.js). */
export const RETRY_STREUUNG = 0.2;

/** Eine kryptografisch zufällige UUID v4. Nie Math.random. */
export function neueKennung(c = globalThis.crypto) {
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (!c || typeof c.getRandomValues !== "function") throw new Error("Kein sicherer Zufall verfügbar.");
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Wartezeit nach dem n-ten Fehlversuch: 2 s, 4 s, 8 s … höchstens 5 min. */
export const wartezeit = (versuche) =>
  Math.min(WARTEN_MAX_MS, WARTEN_MIN_MS * 2 ** Math.max(0, Math.min(20, versuche - 1)));

/* ------------------------------ Speicher -------------------------------- */

/** Im Arbeitsspeicher — für Prüfungen und als letzter Rückfall. */
export function speicherFluechtig() {
  const daten = new Map();
  return { art: "fluechtig", dauerhaft: false,
    alle: async () => [...daten.values()].map((e) => ({ ...e })),
    setzen: async (e) => { daten.set(e.id, { ...e }); },
    entfernen: async (id) => { daten.delete(id); } };
}

/** localStorage (oder ein gleichartiger Speicher) — je Ereignis ein Feld, damit
    zwei Reiter, die gleichzeitig ablegen, sich nichts überschreiben. */
export function speicherLokal(ls, praefix = "centric:stempelpuffer:") {
  const schluessel = () => { const k = []; for (let i = 0; i < ls.length; i++) { const x = ls.key(i); if (x && x.startsWith(praefix)) k.push(x); } return k; };
  return { art: "lokal", dauerhaft: true,
    alle: async () => schluessel().map((k) => { try { return JSON.parse(ls.getItem(k)); } catch { return null; } })
      .filter((e) => e && typeof e === "object" && e.id),
    setzen: async (e) => { ls.setItem(praefix + e.id, JSON.stringify(e)); },
    entfernen: async (id) => { ls.removeItem(praefix + id); } };
}

/** IndexedDB — der Normalfall. Wirft, wenn die Datenbank nicht zu öffnen ist. */
export async function speicherIndexedDB(idb, name = "centric-stempel") {
  const db = await new Promise((ok, nein) => {
    const r = idb.open(name, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("ereignisse")) r.result.createObjectStore("ereignisse", { keyPath: "id" }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => nein(r.error || new Error("IndexedDB nicht verfügbar"));
    r.onblocked = () => nein(new Error("IndexedDB blockiert"));
  });
  const tx = (modus, f) => new Promise((ok, nein) => {
    const t = db.transaction("ereignisse", modus);
    const s = t.objectStore("ereignisse");
    let erg;
    const r = f(s);
    if (r) r.onsuccess = () => { erg = r.result; };
    t.oncomplete = () => ok(erg);
    t.onerror = () => nein(t.error);
    t.onabort = () => nein(t.error || new Error("abgebrochen"));
  });
  return { art: "indexeddb", dauerhaft: true,
    alle: async () => (await tx("readonly", (s) => s.getAll())) || [],
    setzen: async (e) => { await tx("readwrite", (s) => s.put({ ...e })); },
    entfernen: async (id) => { await tx("readwrite", (s) => s.delete(id)); } };
}

/** Den besten verfügbaren Speicher wählen: IndexedDB, sonst localStorage, sonst flüchtig. */
export async function speicherWaehlen(umgebung = globalThis) {
  try { if (umgebung.indexedDB) return await speicherIndexedDB(umgebung.indexedDB); } catch { /* weiter */ }
  try {
    const ls = umgebung.localStorage;
    if (ls) { ls.setItem("centric:stempelpuffer-probe", "1"); ls.removeItem("centric:stempelpuffer-probe"); return speicherLokal(ls); }
  } catch { /* weiter */ }
  return speicherFluechtig();
}

/* ------------------------------ Ereignisse ------------------------------ */

/**
 * Ein neues Stempelereignis. `koord` nur, wenn die Geo-Prüfung an ist
 * (stempelvorgang.js, positionHolen) — sonst null; mehr wird nicht abgelegt.
 */
export async function erfassen(speicher, { art, datum = null, koord = null, inhaber, jetzt = new Date(), kennung = neueKennung,
  offline = false }) {
  if (art !== "start" && art !== "ende") throw new Error("Nur start oder ende.");
  if (!inhaber) throw new Error("Ohne Inhaber wird kein Stempel abgelegt.");
  const alle = await speicher.alle();
  const reihe = alle.reduce((n, e) => Math.max(n, Number(e.reihe) || 0), 0) + 1;
  const ev = { id: kennung(), art, datum, inhaber, reihe, erfasstAm: jetzt.toISOString(), offline: !!offline,
    koord: koord && typeof koord.lat === "number" && typeof koord.lon === "number"
      ? { lat: koord.lat, lon: koord.lon, accuracy: typeof koord.accuracy === "number" ? koord.accuracy : null } : null,
    zustand: "wartet", versuche: 0, naechsterVersuchAm: 0, fehler: null, quittung: null };
  await speicher.setzen(ev);
  return ev;
}

/** Die Ereignisse eines Inhabers, in Erfassungsreihenfolge. Fremde nie. */
export async function ereignisseVon(speicher, inhaber) {
  if (!inhaber) return [];
  return (await speicher.alle()).filter((e) => e && e.inhaber === inhaber)
    .sort((a, b) => (a.reihe - b.reihe) || String(a.erfasstAm).localeCompare(String(b.erfasstAm)));
}

/**
 * Was eine Antwort des Servers für das Ereignis bedeutet.
 * @returns {"ok"|"voruebergehend"|"endgueltig"|"halt"}
 *   halt: abgemeldet oder fremde Sitzung — liegen lassen, nichts weiter senden
 */
export function antwortArt(status, daten) {
  const code = daten && daten.code;
  if (status === 200 && daten && daten.ok) return "ok";
  if (status === 401 || code === "STEMPEL_FREMDE_SITZUNG") return "halt";
  if (status === 409 && code === "STEMPEL_KONFLIKT") return "voruebergehend";
  if (status === 400 || status === 404 || status === 409 || status === 403 || status === 422) return "endgueltig";
  return "voruebergehend";                      // 0 (Netz), 408, 429, 5xx, 200 ohne ok
}

/**
 * Die wartenden Ereignisse eines Inhabers senden — streng der Reihe nach.
 * Ein vorübergehender Fehler hält die Reihe an (nichts überholt ein
 * früheres Ereignis); eine endgültige Absage nicht (ein abgelehnter Beginn
 * darf sein Ende nicht festhalten — das wird dann ohne Beginn gespeichert
 * und zur Prüfung markiert).
 *
 * @param {object} speicher
 * @param {string} inhaber
 * @param {(ev) => Promise<{status:number, daten:any, warteMs?:number|null}>} senden
 * @param {{ jetzt?: () => number, beiQuittung?: (ev, daten) => void }} [opt]
 */
export async function abarbeiten(speicher, inhaber, senden, { jetzt = () => Date.now(), beiQuittung, zufall = Math.random } = {}) {
  const ergebnisse = {};
  if (!inhaber) return { ergebnisse, angehalten: "ohne-inhaber" };
  let angehalten = null;
  for (const ev of await ereignisseVon(speicher, inhaber)) {
    if (ev.zustand === "bestaetigt") {
      if (jetzt() - (Date.parse(ev.bestaetigtAm) || 0) > BESTAETIGT_HALTEN_MS) await speicher.entfernen(ev.id);
      continue;
    }
    if (ev.zustand !== "wartet") continue;
    if (angehalten) { ergebnisse[ev.id] = { art: "wartet" }; continue; }
    if ((ev.naechsterVersuchAm || 0) > jetzt()) { angehalten = "wartezeit"; ergebnisse[ev.id] = { art: "wartet" }; continue; }
    const versuch = { ...ev, versuche: (ev.versuche || 0) + 1 };
    let r;
    try { r = await senden(versuch); } catch (e) { r = { status: 0, daten: null, fehler: String((e && e.message) || e) }; }
    const art = antwortArt(r.status, r.daten);
    if (art === "ok") {
      const d = r.daten;
      /* Quittiert: Der Standort (nur im Geo-Modus abgelegt) wird nicht mehr
         gebraucht und bleibt nicht auf dem Gerät (Review A2, H8+). */
      const neu = { ...versuch, koord: null, zustand: "bestaetigt", bestaetigtAm: new Date(jetzt()).toISOString(), fehler: null,
        quittung: { datum: d.datum || null, zeit: d.zeit || null, offline: !!d.offline, wiederholt: !!d.wiederholt,
          markierungen: Array.isArray(d.markierungen) ? d.markierungen : [] } };
      await speicher.setzen(neu);
      ergebnisse[ev.id] = { art: "ok", daten: d };
      if (beiQuittung) { try { beiQuittung(neu, d); } catch { /* Anzeige darf das Senden nicht stören */ } }
    } else if (art === "endgueltig") {
      const grund = (r.daten && (r.daten.text || r.daten.fehler)) || `Abgelehnt (Status ${r.status}).`;
      await speicher.setzen({ ...versuch, koord: null, zustand: "abgelehnt", fehler: { grund: String(grund), code: (r.daten && r.daten.code) || null, status: r.status } });
      ergebnisse[ev.id] = { art: "abgelehnt", grund: String(grund) };
    } else if (art === "halt") {
      /* Der Versuch zählt nicht: Es lag an der Sitzung, nicht am Ereignis. */
      angehalten = r.status === 401 ? "abgemeldet" : "fremde-sitzung";
      ergebnisse[ev.id] = { art: "wartet" };
    } else {
      /* Retry-After (Bremse WP-47) mit 0–20 % Streuung wie SP.stempeln (wartezeitMitStreuung): nie kürzer als
         verlangt, und nicht alle Geräte, die dieselbe Sperre traf, kommen im selben Augenblick wieder. */
      const z = Math.min(1, Math.max(0, Number(zufall()) || 0));
      const warte = typeof r.warteMs === "number" && r.warteMs > 0
        ? Math.round(Math.min(r.warteMs, 60 * 60 * 1000) * (1 + RETRY_STREUUNG * z)) : wartezeit(versuch.versuche);
      /* Offline wird ein Ereignis nur durch einen echten Netzausfall (keine
         Antwort). Eine Antwort wie 429/503 (Bremse, WP-47) heißt: Der Server
         ist erreichbar — die Wiederholung bleibt ein gewöhnliches Stempeln
         mit der Serverzeit beim Eintreffen (Review A4). */
      await speicher.setzen({ ...versuch, offline: !!versuch.offline || !r.status, naechsterVersuchAm: jetzt() + warte,
        fehler: { grund: r.status ? `Server vorübergehend nicht bereit (Status ${r.status}).` : "Kein Netz.", status: r.status || 0 } });
      angehalten = "voruebergehend";
      ergebnisse[ev.id] = { art: "wartet" };
    }
  }
  return { ergebnisse, angehalten };
}

/**
 * Beim Abmelden (Review A2): Bestätigtes der Person entfernen — es liegt
 * beim Server. Wartendes bleibt (sonst ginge ein Stempel verloren),
 * Abgelehntes ebenfalls (verschwindet nie still); beide tragen nach Quittung
 * oder Absage keinen Standort mehr. Gibt die Zahl der wartenden zurück.
 */
export async function abmeldenAufraeumen(speicher, inhaber) {
  let wartend = 0;
  for (const e of await ereignisseVon(speicher, inhaber)) {
    if (e.zustand === "bestaetigt") await speicher.entfernen(e.id);
    else if (e.zustand === "wartet") wartend++;
    else if (e.koord) await speicher.setzen({ ...e, koord: null });
  }
  return wartend;
}

/** Ein abgelehntes Ereignis noch einmal senden lassen (ausdrücklich). */
export async function erneutSenden(speicher, id, inhaber) {
  const ev = (await speicher.alle()).find((e) => e.id === id && e.inhaber === inhaber);
  if (!ev || ev.zustand !== "abgelehnt") return false;
  await speicher.setzen({ ...ev, zustand: "wartet", naechsterVersuchAm: 0 });
  return true;
}

/** Ein abgelehntes oder bestätigtes Ereignis zur Kenntnis nehmen (ausdrücklich). Wartende nie. */
export async function verwerfen(speicher, id, inhaber) {
  const ev = (await speicher.alle()).find((e) => e.id === id && e.inhaber === inhaber);
  if (!ev || ev.zustand === "wartet") return false;
  await speicher.entfernen(id);
  return true;
}

/** Der Rumpf für /api/stempeln. `gesendetAm` ist die Uhr des Geräts beim Absenden. */
export function rumpfFuer(ev, gesendet = new Date()) {
  return { art: ev.art, datum: ev.datum || null, clientEventId: ev.id, erfasstAm: ev.erfasstAm,
    gesendetAm: gesendet.toISOString(), offline: !!ev.offline, inhaber: ev.inhaber,
    lat: ev.koord ? ev.koord.lat : null, lon: ev.koord ? ev.koord.lon : null,
    accuracy: ev.koord && typeof ev.koord.accuracy === "number" ? ev.koord.accuracy : null };
}

/** Wartezeit aus Retry-After (Sekunden oder HTTP-Datum) — oder null. */
export function retryAfterMs(wert, jetzt = Date.now()) {
  if (wert === null || wert === undefined || wert === "") return null;
  const n = Number(wert);
  if (Number.isFinite(n) && n >= 0) return n * 1000;
  const t = Date.parse(String(wert));
  return Number.isFinite(t) ? Math.max(0, t - jetzt) : null;
}

/* Der zuletzt bekannte Stand der eigenen Ereignisse — für die Anzeige
   (stempelvorgang.js, stempelVorgang: vorläufige Stempel). Gesetzt von der
   Speicherschicht, wann immer sich der Puffer ändert. */
let schnappschuss = [];
export const vorlaeufigeSetzen = (liste) => { schnappschuss = Array.isArray(liste) ? liste : []; };
export const vorlaeufige = () => schnappschuss;
