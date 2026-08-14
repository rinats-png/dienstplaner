import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

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
  const adresse = req.headers.get("x-nf-client-connection-ip")
    || req.headers.get("x-forwarded-for") || "unbekannt";
  return `a:${kurz(String(adresse).split(",")[0].trim())}`;
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
        const zs = (await s.get(zk, { type: "json" })) || { n: 0 };
        if (zs.n >= w.ziel.versuche)
          return { frei: false, wartet: w.ziel.fenster - (jetzt % w.ziel.fenster),
            grund: "ungewöhnlich viele Versuche für diesen Betrieb", dimension: "ziel" };
        await s.setJSON(zk, { n: zs.n + 1 });
      }
      if (w.gesamt) {
        const gk = `${art}:gesamt:${Math.floor(jetzt / w.gesamt.fenster)}`;
        const gs = (await s.get(gk, { type: "json" })) || { n: 0 };
        if (gs.n >= w.gesamt.versuche)
          return { frei: false, wartet: w.gesamt.fenster - (jetzt % w.gesamt.fenster),
            grund: "ungewöhnlich hohes Aufkommen", dimension: "gesamt" };
        await s.setJSON(gk, { n: gs.n + 1 });
      }
    }

    const stand = (await s.get(schluessel, { type: "json" })) || { n: 0 };
    if (stand.n >= g.versuche) {
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
    await s.setJSON(schluessel, { n: stand.n + 1 });
    return { frei: true, uebrig: g.versuche - stand.n - 1 };
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
  try {
    await takt().delete(`${art}:${kennung}:${fenster}`);
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

export async function protokoll(art, kennung, ausgang, zusatz) {
  try {
    const jetzt = new Date();
    const tag = jetzt.toISOString().slice(0, 10);
    const zeile = { zeit: jetzt.toISOString(), art, kennung, ausgang,
      ...(zusatz ? { zusatz } : {}) };
    /* Eine Datei je Tag und Art — das hält die Einträge klein und macht
       das Aufräumen zu einem Löschvorgang statt einer Suche. */
    const schluessel = `${tag}/${art}`;
    const bisher = (await spur().get(schluessel, { type: "json" })) || [];
    bisher.push(zeile);
    /* Deckel: bei einem Ansturm sollen die Kosten nicht mitwachsen. */
    await spur().setJSON(schluessel, bisher.slice(-2000));
  } catch { /* Protokollieren darf nie eine Anfrage scheitern lassen */ }
}

/** Was ist in den letzten Tagen passiert? Für die Betreiberkonsole. */
export async function spurLesen(tage) {
  const out = [];
  const heute = new Date();
  for (let i = 0; i < (tage || 7); i++) {
    const d = new Date(heute.getTime() - i * 86400000).toISOString().slice(0, 10);
    for (const art of ["anmelden", "demo", "einrichten", "schreiben", "zustellen", "fehler"]) {
      try {
        const z = await spur().get(`${d}/${art}`, { type: "json" });
        if (z) out.push(...z);
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
