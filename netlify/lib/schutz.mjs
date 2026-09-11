import { getStore } from "./ablage.mjs";
import { createHash, randomBytes } from "node:crypto";

/* ==========================================================================
   SCHUTZ UND PROTOKOLL

   Ohne Bremse lässt sich der Anmeldeendpunkt millionenfach aufrufen. Ein
   Zugangscode hat drei Blöcke aus je vier Zeichen eines 26er-Alphabets —
   das sind rund 5·10^16 Möglichkeiten. Klingt viel, ist es auch. Aber ohne
   Begrenzung kann jemand mit tausend Versuchen je Sekunde systematisch
   suchen, und schon ein einziger Treffer öffnet einen ganzen Betrieb.

   Die Grenzen sind bewusst unterschiedlich: Anmelden ist streng, Lesen und
   Schreiben großzügig. Ein Planer, der einen Monatsplan durchklickt, darf
   nicht ausgebremst werden.
   ========================================================================== */

const takt = () => getStore({ name: "centric-takt", consistency: "strong" });
const spur = () => getStore({ name: "centric-spur" });

const kurz = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

/* --------------------------------------------------------------------------
   MEHRDIMENSIONAL ZÄHLEN

   Eine einzige Kennung reicht nicht. Wer über hundert Mobilfunkadressen
   angreift, umgeht eine reine Adressbremse mühelos — jede Adresse bleibt
   unter der Grenze, die Summe ist trotzdem ein Angriff.

   Deshalb wird jeder Versuch gegen drei Zähler gehalten:

     Herkunft — die Adresse oder Sitzung, wie bisher
     Ziel     — auf welchen Betrieb gezielt wird
     Gesamt   — wie viele Fehlversuche der Dienst insgesamt sieht

   Reißt einer davon, wird gebremst. Die Zähler haben verschiedene Grenzen:
   ein einzelner Betrieb verträgt mehr Fehlversuche als eine einzelne
   Adresse, und der Dienst insgesamt mehr als ein Betrieb.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   ZÄHLEN OHNE ZÄHLER

   Ein Blob je Versuch, benannt mit Zufall. Gezählt wird durch Auflisten des
   Präfixes. Das kostet einen Listenaufruf statt eines Lesevorgangs und ist
   dafür unter Nebenläufigkeit korrekt — was bei einer Bremse der ganze Zweck
   ist.

   Aufgeräumt wird beiläufig: Einträge tragen ihr Zählfenster im Namen, und
   alte Fenster werden beim Entlasten und gelegentlich beim Zählen entfernt.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   PROZESSLOKALE SPERRE

   Der Blob-Weg kann einen gleichzeitigen Schwarm nicht begrenzen — gemessen
   kamen mit Zählen-dann-Schreiben 55 von 60 parallelen Versuchen durch, mit
   Schreiben-dann-Zählen 49. Das ist keine Frage des Schlüssellayouts,
   sondern der fehlenden atomaren Operation.

   Was ohne Fremddienst hilft: Innerhalb eines Prozesses ist JavaScript
   einfädig. Ein Zähler im Speicher wird also nicht zerrissen, und ein
   Anfragebündel landet in der Praxis auf wenigen Instanzen. Das ersetzt
   keinen echten Zähler, senkt den Schlupf aber deutlich und kostet nichts.

   Bewusst kein Ersatz für atomarZaehlen(): Wer mehrere Instanzen hat,
   braucht den Fremddienst. Diese Sperre ist die Untergrenze, nicht das Ziel.
   -------------------------------------------------------------------------- */
const lokal = new Map();

function lokalZaehlen(schluessel, fensterSekunden) {
  const jetzt = Date.now();
  const eintrag = lokal.get(schluessel);
  if (!eintrag || eintrag.bis < jetzt) {
    lokal.set(schluessel, { n: 1, bis: jetzt + fensterSekunden * 1000 });
    /* Beiläufig aufräumen, damit die Karte nicht wächst. */
    if (lokal.size > 500) {
      for (const [k, v] of lokal) if (v.bis < jetzt) lokal.delete(k);
    }
    return 1;
  }
  eintrag.n++;
  return eintrag.n;
}

/* --------------------------------------------------------------------------
   ATOMARER ZÄHLER, WENN VORHANDEN

   Netlify Blobs kennt kein bedingtes Schreiben — SetOptions trägt nur
   metadata. Damit lässt sich darauf kein Zähler bauen, der einem parallelen
   Schwarm standhält; gemessen kamen 55 von 60 gleichzeitigen Versuchen
   durch, obwohl die Grenze bei 8 liegt.

   Wer die Lücke schließen will, hinterlegt einen Redis-Dienst mit
   HTTP-Schnittstelle (Upstash und Vergleichbare, kostenfreie Stufe genügt):

     REDIS_REST_URL    https://<kennung>.upstash.io
     REDIS_REST_TOKEN  <Token>

   Dann läuft das Zählen über INCR und ist verlässlich. Fehlen die Angaben,
   greift der Blob-Weg — schwächer, aber betriebsfähig. Ein Ausfall des
   Dienstes bremst die Anwendung nicht: Wir fallen still zurück.
   -------------------------------------------------------------------------- */
async function atomarZaehlen(schluessel, fensterSekunden) {
  const url = process.env.REDIS_REST_URL;
  const token = process.env.REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const basis = String(url).replace(/\/+$/, "");
    const k = encodeURIComponent(`centric:takt:${schluessel}`);
    /* Ein Aufruf für beides: hochzählen und Ablauf setzen. */
    const a = await fetch(`${basis}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify([["INCR", k], ["EXPIRE", k, String(fensterSekunden * 2)]]),
      signal: AbortSignal.timeout(1500),
    });
    if (!a.ok) return null;
    const d = await a.json();
    const n = Array.isArray(d) && d[0] && Number(d[0].result);
    return Number.isFinite(n) ? n : null;
  } catch {
    /* Zeitüberschreitung oder Ausfall: lieber der schwächere Weg als keiner. */
    return null;
  }
}

/** Wie viele Versuche liegen unter diesem Präfix? */
async function versucheZaehlen(s, praefix) {
  try {
    const { blobs } = await s.list({ prefix: `v:${praefix}:` });
    return blobs.length;
  } catch { return 0; }
}

/** Einen Versuch vermerken. Der Zufall im Namen verhindert Kollisionen. */
async function versuchVermerken(s, praefix) {
  const marke = `${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
  try { await s.setJSON(`v:${praefix}:${marke}`, 1); } catch { /* siehe unten */ }
}

/* Alte Fenster wegräumen. Die Schlüssel tragen ihr Fenster im Namen, also
   lässt sich das ohne Zeitstempel entscheiden. Beiläufig statt per Zeitplan:
   ein eigener Ablauf wäre Aufwand ohne Gewinn. */
async function alteFensterRaeumen(s, art, fensterJetzt) {
  try {
    const { blobs } = await s.list({ prefix: `v:${art}:` });
    for (const b of blobs) {
      /* v:<art>:<kennung>:<fenster>:<marke> — das Fenster ist das
         vorletzte Glied. */
      const teile = b.key.split(":");
      const f = Number(teile[teile.length - 2]);
      if (Number.isFinite(f) && f < fensterJetzt - 1) await s.delete(b.key).catch(() => {});
    }
  } catch { /* egal */ }
}

/** Alle Versuche unter einem Präfix entfernen. */
async function versucheLoeschen(s, praefix) {
  try {
    const { blobs } = await s.list({ prefix: `v:${praefix}:` });
    for (const b of blobs) await s.delete(b.key).catch(() => {});
  } catch { /* egal */ }
}

/** Grenzen je Endpunkt: wie viele Versuche in wie vielen Sekunden. */
export const GRENZEN = {
  /* steigend: die Sperre verdoppelt sich mit jeder Wiederholung */
  anmelden:   { versuche: 8,   fenster: 300,  sperre: 300,  steigend: true, max: 7200 },
  demo:       { versuche: 20,  fenster: 300,  sperre: 300 },
  einrichten: { versuche: 5,   fenster: 600,  sperre: 1800, steigend: true, max: 86400 },
  zugaenge:   { versuche: 10,  fenster: 600,  sperre: 1800, steigend: true, max: 86400 },
  lesen:      { versuche: 300, fenster: 60,   sperre: 60 },
  schreiben:  { versuche: 120, fenster: 60,   sperre: 60 },
  zustellen:  { versuche: 60,  fenster: 60,   sperre: 120 },
  /* Selbstbedienung: drei Betriebe je Stunde. Ohne diese Bremse legt jemand
     über Nacht zehntausend Räume an, und die Kosten laufen mit. */
  starten:    { versuche: 3,   fenster: 3600, sperre: 3600, steigend: true, max: 86400 },
};

/** Grenzen für die weiteren Zähldimensionen — großzügiger als je Herkunft. */
export const WEITERE = {
  anmelden: { ziel: { versuche: 40, fenster: 300 }, gesamt: { versuche: 400, fenster: 300 } },
  einrichten: { gesamt: { versuche: 20, fenster: 600 } },
  zugaenge: { gesamt: { versuche: 40, fenster: 600 } },
  /* Auch insgesamt gedeckelt — ein verteilter Ansturm soll nicht durchkommen. */
  starten: { gesamt: { versuche: 60, fenster: 3600 } },
};

/**
 * Die Kennung, gegen die gezählt wird. Bevorzugt die Sitzung — sonst könnten
 * sich mehrere Personen hinter einem Firmenanschluss gegenseitig ausbremsen.
 * Ohne Sitzung bleibt nur die Adresse.
 */
export function kennung(req, sitzung) {
  if (sitzung && sitzung.bestand) return `s:${kurz(sitzung.bestand)}`;
  return `a:${kurz(herkunft(req))}`;
}

/** Die Adresse, von der die Anfrage kommt — roh, nur für Hashwerte. */
export function herkunft(req) {
  const adresse = req.headers.get("x-nf-client-connection-ip")
    || req.headers.get("x-forwarded-for") || "unbekannt";
  return String(adresse).split(",")[0].trim();
}

/* --------------------------------------------------------------------------
   HERKUNFT EINER SCHREIBENDEN ANFRAGE

   Die Anwendung führt ihr Sitzungsmerkmal im Kopf `authorization`, nicht in
   einem Cookie. Ein fremdes Blatt kann damit keine Anfrage in fremdem Namen
   auslösen — der Browser schickt den Kopf nicht mit, und ohne ihn ist die
   Anfrage nicht angemeldet. Klassischer CSRF ist hier also bereits durch die
   Bauweise ausgeschlossen.

   Trotzdem eine zweite Linie: Kommt eine zustandsändernde Anfrage mit einem
   `Origin`, der nicht zu dieser Seite gehört, wird sie abgewiesen. Das kostet
   nichts und fängt den Fall ab, in dem eines Tages doch ein Cookie oder ein
   Merkmal im Speicher des Browsers dazukommt.

   Fehlt der Kopf ganz, wird durchgelassen: So rufen Skripte, Sicherungsläufe
   und Prüfungen an, und die sollen weiter arbeiten können.
   -------------------------------------------------------------------------- */
export function herkunftErlaubt(req) {
  const methode = (req.method || "GET").toUpperCase();
  if (methode === "GET" || methode === "HEAD" || methode === "OPTIONS") return true;
  const roh = req.headers.get("origin");
  if (!roh || roh === "null") return true;          // kein Browserblatt
  let fremd;
  try { fremd = new URL(roh).host; } catch { return false; }
  const eigen = new Set();
  try { eigen.add(new URL(req.url).host); } catch { /* ohne */ }
  for (const kopf of ["host", "x-forwarded-host"]) {
    const w = req.headers.get(kopf);
    if (w) eigen.add(String(w).split(",")[0].trim());
  }
  return eigen.has(fremd);
}

/**
 * Prüft und zählt in einem Zug. Gibt zurück, ob weitergemacht werden darf.
 *
 * Bewusst einfach gehalten: ein Zähler je Kennung und Fenster. Kein
 * gleitendes Fenster, kein Tokenbucket — für einen Dienst dieser Größe wäre
 * das Aufwand ohne Gewinn, und jede Zusatzabfrage kostet Antwortzeit.
 */
export async function bremse(art, kennung, ziel) {
  const g = GRENZEN[art];
  if (!g) return { frei: true };
  const s = takt();
  const jetzt = Math.floor(Date.now() / 1000);
  const fenster = Math.floor(jetzt / g.fenster);
  const schluessel = `${art}:${kennung}:${fenster}`;

  try {
    /* Steht eine Sperre? Die überdauert das Zählfenster. */
    const gesperrt = await s.get(`sperre:${art}:${kennung}`, { type: "json" });
    if (gesperrt && gesperrt.bis > jetzt)
      return { frei: false, wartet: gesperrt.bis - jetzt, grund: "gesperrt" };

    /* Weitere Dimensionen: Ziel und Gesamtaufkommen. Sie sperren nicht
       dauerhaft, sondern bremsen nur für dieses Fenster — sonst könnte
       jemand einen fremden Betrieb absichtlich lahmlegen, indem er dessen
       Zugang mit Fehlversuchen bombardiert. */
    const w = WEITERE[art];
    if (w) {
      if (w.ziel && ziel) {
        const zk = `${art}:ziel:${ziel}:${Math.floor(jetzt / w.ziel.fenster)}`;
        if (await versucheZaehlen(s, zk) >= w.ziel.versuche)
          return { frei: false, wartet: w.ziel.fenster - (jetzt % w.ziel.fenster),
            grund: "ungewöhnlich viele Versuche für diesen Betrieb", dimension: "ziel" };
        await versuchVermerken(s, zk);
      }
      if (w.gesamt) {
        const gk = `${art}:gesamt:${Math.floor(jetzt / w.gesamt.fenster)}`;
        if (await versucheZaehlen(s, gk) >= w.gesamt.versuche)
          return { frei: false, wartet: w.gesamt.fenster - (jetzt % w.gesamt.fenster),
            grund: "ungewöhnlich hohes Aufkommen", dimension: "gesamt" };
        await versuchVermerken(s, gk);
      }
    }

    /* Ein Schlüssel je Versuch statt eines Zählers.

       Vorher wurde gelesen, geprüft und zurückgeschrieben — drei Schritte
       ohne Atomarität. Hundert gleichzeitige Anfragen lasen alle n = 0,
       kamen alle durch und schrieben alle n = 1. Die Bremse griff gegen
       sequenzielles Vertippen und war gegen einen parallelen Angriff
       wirkungslos, auch beim Verwaltungskennwort.

       Netlify Blobs kennt kein atomares Hochzählen. Ein eigener Schlüssel
       je Versuch braucht keins: Jeder Schreibvorgang ist unabhängig, und
       gezählt wird durch Auflisten. Zwei parallele Anfragen erzeugen zwei
       Einträge — nicht einen. */
    /* Erst vermerken, dann zählen — nicht umgekehrt.

       Zählt man zuerst, sehen alle gleichzeitig eintreffenden Anfragen
       denselben Stand und kommen alle durch; gemessen kamen so 55 von 60
       parallelen Versuchen bis zur Prüfung. Vermerkt jede Anfrage zuerst
       ihren eigenen Versuch, sieht sie beim Zählen mindestens sich selbst
       und alles, was bereits gelandet ist. Der Schlupf schrumpft damit auf
       die Schreiblaufzeit statt auf die gesamte Anfragedauer.

       Restlücke: Ein wirklich gleichzeitiger Schwarm kann sich noch
       gegenseitig übersehen. Wer das dicht haben will, hinterlegt einen
       atomaren Zähler — siehe atomarZaehlen() unten. */
    await versuchVermerken(s, schluessel);
    /* Drei Quellen, absteigend nach Verlässlichkeit. Genommen wird der
       höchste Wert: Wer auf irgendeinem Weg über der Grenze liegt, ist
       über der Grenze. */
    const lokalN = lokalZaehlen(schluessel, g.fenster);
    const atomarN = await atomarZaehlen(schluessel, g.fenster);
    const blobN = atomarN === null ? await versucheZaehlen(s, schluessel) : 0;
    const stand = { n: Math.max(lokalN, atomarN ?? 0, blobN) };
    if (stand.n > g.versuche) {
      /* Steigende Sperre: Wer wiederholt anrennt, wartet jedes Mal doppelt
         so lange. Für einen ehrlichen Nutzer, der sich einmal vertippt,
         ändert sich nichts — für einen Angreifer wird jeder weitere Anlauf
         teurer als der vorige. */
      const bisher = (await s.get(`stufe:${art}:${kennung}`, { type: "json" })) || { n: 0 };
      const stufe = g.steigend ? bisher.n : 0;
      const dauer = g.steigend
        ? Math.min(g.max || 86400, g.sperre * Math.pow(2, stufe))
        : g.sperre;
      await s.setJSON(`sperre:${art}:${kennung}`, { bis: jetzt + dauer, seit: jetzt, stufe });
      if (g.steigend) await s.setJSON(`stufe:${art}:${kennung}`,
        { n: Math.min(stufe + 1, 12), zuletzt: jetzt });
      return { frei: false, wartet: dauer, grund: "zu viele Versuche", stufe };
    }
    /* Gelegentlich aufräumen, damit die Vermerke nicht mitwachsen. */
    if (Math.random() < 0.02) alteFensterRaeumen(s, art, fenster).catch(() => {});
    return { frei: true, uebrig: Math.max(0, g.versuche - stand.n) };
  } catch (e) {
    /* Fällt der Zähler aus, wird durchgelassen. Eine kaputte Bremse darf
       den Betrieb nicht anhalten — Verfügbarkeit vor Schutz, solange die
       Anmeldung selbst noch korrekt prüft. Der Grund wird mitgegeben,
       damit ein Ausfall nicht unbemerkt bleibt. */
    return { frei: true, fehler: String(e && e.message || e).slice(0, 120) };
  }
}

/** Nach einer erfolgreichen Anmeldung den Zähler zurücksetzen. */
export async function entlasten(art, kennung) {
  const g = GRENZEN[art];
  if (!g) return;
  const jetzt = Math.floor(Date.now() / 1000);
  const fenster = Math.floor(jetzt / g.fenster);
  /* Auch den prozesslokalen Zähler zurücksetzen. In einem dauerhaften Prozess
     (eigener Server statt kurzlebiger Funktionsinstanz) zählte er sonst
     erfolgreiche Anmeldungen weiter mit und sperrte nach acht Anmeldungen
     hinter derselben Adresse — Büro, Station, Wache — auch die richtigen. */
  lokal.delete(`${art}:${kennung}:${fenster}`);
  try {
    await versucheLoeschen(takt(), `${art}:${kennung}:${fenster}`);
    await takt().delete(`sperre:${art}:${kennung}`);
    /* Auch die Steigerungsstufe zurücksetzen — wer sich erfolgreich
       anmeldet, hat sich offenbar nur vertippt. */
    await takt().delete(`stufe:${art}:${kennung}`);
  } catch { /* egal */ }
}

/** Antwort bei Überschreitung — mit Wartezeit, damit ein ehrlicher Aufrufer weiß, wann wieder. */
export const zuVielAntwort = (wartet) => new Response(JSON.stringify({
  fehler: "zu viele Anfragen",
  text: `Bitte in ${wartet > 60 ? `${Math.ceil(wartet / 60)} Minuten` : `${wartet} Sekunden`} erneut versuchen.`,
  wartet,
}), { status: 429, headers: {
  "content-type": "application/json; charset=utf-8",
  "retry-after": String(wartet),
  "cache-control": "no-store",
} });

/* --------------------------------------------------------------------------
   PROTOKOLL
   Wenn ein Betrieb sagt „der Plan war weg", braucht es eine Spur. Ohne
   personenbezogene Daten: kein Name, keine Adresse im Klartext, kein
   Planinhalt. Nur wer (als Kürzel), was, wann, mit welchem Ausgang.
   -------------------------------------------------------------------------- */

const SPUR_TAGE = 30;

/**
 * Ein Eintrag ins Protokoll.
 *
 * `wer` ist neu und beantwortet die Frage, die ein Protokoll beantworten
 * muss: Wer hat das getan? Bis hierher stand dort nur die Kennung — und
 * die ist bei einer angemeldeten Sitzung der Betrieb, nicht die Person.
 * Bei einem Streit über eine Änderung ließ sich damit sagen, aus welchem
 * Betrieb sie kam, aber nicht von wem.
 *
 * Was hineingehört: Rolle, Personenkennung, Weg und Verfahren, und die
 * Herkunft als Kürzel. Was nicht: Namen, Adressen, Zugangscodes,
 * Sitzungsmerkmale, Planinhalte. Die Personenkennung ist betriebsintern
 * („p7") und für sich genommen keine Angabe über einen Menschen.
 *
 * @param {string} art
 * @param {string} kennung
 * @param {string} ausgang
 * @param {string} [zusatz]
 * @param {{rolle?: string, person?: (string|number|null), weg?: string,
 *          verfahren?: string, herkunft?: string}} [wer]
 */
export async function protokoll(art, kennung, ausgang, zusatz, wer) {
  try {
    const jetzt = new Date();
    const tag = jetzt.toISOString().slice(0, 10);
    const zeile = { zeit: jetzt.toISOString(), art, kennung, ausgang,
      ...(zusatz ? { zusatz } : {}),
      ...(wer && wer.rolle ? { rolle: wer.rolle } : {}),
      ...(wer && wer.person !== undefined && wer.person !== null
        ? { person: String(wer.person).slice(0, 40) } : {}),
      ...(wer && wer.weg ? { weg: String(wer.weg).slice(0, 60) } : {}),
      ...(wer && wer.verfahren ? { verfahren: wer.verfahren } : {}),
      ...(wer && wer.herkunft ? { herkunft: kurz(wer.herkunft) } : {}) };
    /* Eine Datei je Tag und Art — das hält die Einträge klein und macht
       das Aufräumen zu einem Löschvorgang statt einer Suche. */
    /* Ein Blob je Eintrag statt eines Arrays je Tag.

       Vorher wurde das Tagesarray gelesen, ergänzt und zurückgeschrieben —
       zwei gleichzeitige Anfragen, ein verlorener Eintrag. Ein Protokoll,
       das ausgerechnet bei einem Ansturm Einträge verliert, ist dann am
       unzuverlässigsten, wenn man es braucht.

       Der Zufall im Namen verhindert Kollisionen; sortiert wird beim Lesen
       über die Zeit im Eintrag. */
    const marke = `${jetzt.getTime().toString(36)}${randomBytes(5).toString("hex")}`;
    await spur().setJSON(`${tag}/${art}/${marke}`, zeile);
  } catch { /* Protokollieren darf nie eine Anfrage scheitern lassen */ }
}

/** Was ist in den letzten Tagen passiert? Für die Betreiberkonsole. */
export async function spurLesen(tage) {
  const out = [];
  const heute = new Date();
  for (let i = 0; i < (tage || 7); i++) {
    const d = new Date(heute.getTime() - i * 86400000).toISOString().slice(0, 10);
    for (const art of ["anmelden", "demo", "einrichten", "schreiben", "zustellen",
      "zugaenge", "starten", "fehler"]) {
      try {
        /* Altbestand: ein Array je Tag und Art. */
        const z = await spur().get(`${d}/${art}`, { type: "json" });
        if (Array.isArray(z)) out.push(...z);
      } catch { /* nicht vorhanden */ }
      try {
        const { blobs } = await spur().list({ prefix: `${d}/${art}/` });
        /* Deckel je Tag und Art, damit ein Ansturm die Konsole nicht sprengt. */
        for (const b of blobs.slice(0, 2000)) {
          const z = await spur().get(b.key, { type: "json" });
          if (z) out.push(z);
        }
      } catch { /* nicht vorhanden */ }
    }
  }
  return out.sort((a, b) => b.zeit.localeCompare(a.zeit));
}

/** Alte Einträge entfernen. Wird beim Lesen gelegentlich mitgemacht. */
export async function spurAufraeumen() {
  try {
    const grenze = new Date(Date.now() - SPUR_TAGE * 86400000).toISOString().slice(0, 10);
    const { blobs } = await spur().list();
    for (const b of blobs) {
      const tag = b.key.split("/")[0];
      if (tag < grenze) await spur().delete(b.key);
    }
  } catch { /* egal */ }
}
