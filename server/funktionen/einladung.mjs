import { getStore } from "../lib/ablage.mjs";
import { bremse, entlasten, kennung, kennungPerson, kennungBetrieb, herkunftErlaubt, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { arbeitssitzungLesen } from "../lib/arbeitssitzung.mjs";
import { bestandLesenStreng } from "../lib/bestand.mjs";
import { wirksameRolle } from "../lib/rechte.mjs";
import { rollenSitzungOhneFaktor } from "../lib/betreiber-zweifaktor.mjs";
import { sitzungBeenden, merkmalAus } from "../lib/sitzungen.mjs";
import { einladungAusstellen, einladungEinloesen, einladungenListe, einladungWiderrufen, frischeBestaetigung,
  einladungRechtePruefen } from "../lib/einladungen.mjs";

/* ==========================================================================
   EINLADUNGEN (WP-18)

     POST /api/einladung             Leitung: Einladung für eine Person des eigenen Betriebs
                                     { personId, rolle?, bestaetigung } → { id, einladung, bis, person, rolle }
                                     bestaetigung (B1, höchstens fünf Minuten alt):
                                       { zweifaktor } | { zugangscode } | { passwort } — siehe
                                       lib/einladungen.mjs, frischeBestaetigung; fehlt sie: 403
     POST /api/einladung/liste       Leitung: Einladungen des eigenen Betriebs, nur Metadaten (nie das Token)
                                     → { einladungen: [{ id, person, rolle, ausgestellt, bis, status, am? }],
                                         neuEingeloest }
     POST /api/einladung/widerrufen  Leitung: { id } → { ok, widerrufen: true }; danach Einlösen 410
     POST /api/einladung/annehmen    ohne Sitzung: Einladung einlösen
                                     { einladung } → { zugangscode, rolle, name }

   Die Fachlogik steht in lib/einladungen.mjs. Hier: Herkunft, Rumpf,
   Sitzung (einziger Prüfpunkt lib/arbeitssitzung.mjs), zweiter Faktor unter
   Pflicht mit der WIRKSAMEN Rolle (M1), Bremse, Protokoll.
   Genaue Pfade schlagen das Präfix /api/* von daten.mjs (server.mjs, routeFuer).

   Bremsen beim Ausstellen (Abnahme V4, Befund A-2): Bis hierher zählte jeder
   Aufruf — auch jede gelungene Einladung und jede Absage an Beschäftigte, SV
   oder Betriebsrat — VOR der Rollenprüfung gegen `zugaenge` JE RAUM. Eine
   Leitung kam beim Einrichten nur bis zur zehnten Person, und eine angemeldete
   Beschäftigte konnte die Einladungen ihres Betriebs sperren. Jetzt:
     1. Vor der Rollenprüfung nur eine Lastbremse JE PERSON (Art `schreiben`,
        kennungPerson): Eine Sitzung ohne Rollenvergabe bekommt immer dieselbe
        403 (N-1) und kann nichts raten; wer hämmert, bremst nur sich selbst.
     2. Erst nach der Rollenprüfung, und nur MIT Nachweis (Zugangscode,
        Passwort, Code aus der App), zählt der Rateschutz `einladung-nachweis`
        (schutz.mjs): je Person mit den Zahlen von `zugaenge` (10 je 10
        Minuten, Sperre 30 Minuten steigend), je Raum höchstens 25 und
        installationsweit 40 je 10 Minuten. Gezählt VOR der Prüfung; stimmt
        der Nachweis, werden nur der Zähler dieser Person und die Vermerke
        dieses Aufrufs zurückgenommen. Falsche Nachweise bleiben gezählt.
        Ohne Nachweis wird nichts verglichen — die Rückfrage zählt nirgends.
     3. Erst nach bestandener Bestätigung das Kontingent fürs Ausstellen:
        30 je Person und 40 je Betrieb in 10 Minuten, NIE installationsweit.
   Befund „globale Grenze“ (Review zu #277): Bis hierher füllten gelungene
   Einladungen die installationsweite Grenze von `zugaenge`, die auch
   /api/zugaenge und das Sperren von Zugängen bremst — eine Leitung sperrte so
   alle anderen Betriebe und den Betreiber aus. Gelungene Einladungen zählen
   jetzt nur im eigenen Kontingent; die installationsweite Grenze sehen nur
   noch Fehlversuche. Restrisiko S-1: docs/acc45/ABNAHME-V4-A2-GLOBALE-GRENZE.md.
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });

const antwort = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const RUMPF_MAX = 4096;

async function rumpfLesen(req) {
  if (Number(req.headers.get("content-length") || 0) > RUMPF_MAX)
    return { antwort: antwort({ fehler: "Anfrage zu groß." }, 413) };
  let text;
  try { text = await req.text(); } catch { text = ""; }
  if (text.length > RUMPF_MAX) return { antwort: antwort({ fehler: "Anfrage zu groß." }, 413) };
  try {
    const daten = JSON.parse(text || "{}");
    if (!daten || typeof daten !== "object" || Array.isArray(daten))
      return { antwort: antwort({ fehler: "Der Rumpf muss ein JSON-Objekt sein." }, 400) };
    return { daten };
  } catch {
    return { antwort: antwort({ fehler: "Der Rumpf ist kein gültiges JSON." }, 400) };
  }
}

/* Ein Lesefehler am Bestand ist kein „gibt es nicht": 503, nichts wird angelegt. */
const nichtLesbar = () => antwort({ fehler: "Der Betrieb lässt sich gerade nicht lesen. Bitte später erneut versuchen." }, 503);

const SITZUNGSWEGE = new Set(["/api/einladung", "/api/einladung/liste", "/api/einladung/widerrufen"]);

/**
 * Sitzung, Bremse, Bestand und M1 für die Wege der Leitung.
 * @returns {Promise<{antwort: Response}|{s: any, k: string, bestand: any, wer: object}>}
 */
async function leitungSitzung(req, ablage, art, bremsArt, jePerson = false) {
  const s = (await arbeitssitzungLesen(req, { store: ablage })).sitzung;
  if (!s) return { antwort: antwort({ fehler: "Nicht angemeldet." }, 401) };
  const k = kennung(req, s);
  /* A-2: Beim Ausstellen bremst diese Stufe je Person (kennungPerson), nicht je Raum. */
  const b = await bremse(bremsArt, jePerson ? kennungPerson(s) : k);
  if (!b.frei) { await protokoll("einladung", k, "gebremst", b.grund); return { antwort: zuVielAntwort(b.wartet) }; }
  let gelesen;
  try { gelesen = s.rolle === "betreiber" ? null : await bestandLesenStreng(ablage, s.bestand); }
  catch { await protokoll("einladung", k, "fehler", "Bestand nicht lesbar"); return { antwort: nichtLesbar() }; }
  const bestand = gelesen && gelesen.bestand;
  /* M1 (Review WP-18): arbeitssitzungLesen prüft den zweiten Faktor nur gegen die Rolle beim Anlegen. Die Rechte
     hier kommen aus der WIRKSAMEN Rolle — eine als Mitarbeiter ohne Faktor angelegte Sitzung, deren Person danach
     Leitung wurde, trägt unter Pflicht keine Leitungsrechte. Dieselbe Regel wie in daten.mjs und zustellung.mjs:
     Sitzung beenden, 401 „neu-anmelden". */
  if (s.rolle !== "betreiber" && rollenSitzungOhneFaktor(s, wirksameRolle(s, bestand))) {
    await sitzungBeenden(merkmalAus(req));
    await protokoll("zweifaktor", k, "abgewiesen", `Pflicht: Sitzung ohne zweiten Faktor beendet (${art})`);
    return { antwort: antwort({ fehler: "Für diese Rolle ist ein zweiter Faktor Pflicht. Bitte neu anmelden.",
      zweifaktor: "neu-anmelden" }, 401) };
  }
  return { s, k, bestand, wer: { rolle: s.rolle, person: s.person, mandantId: s.mandantId } };
}

export default async (req) => {
  const pfad = new URL(req.url).pathname;
  if (req.method !== "POST") return antwort({ fehler: "Nur POST." }, 405);
  if (!herkunftErlaubt(req))
    return antwort({ fehler: "Diese Anfrage kommt nicht von der Anwendung." }, 403);
  const r = await rumpfLesen(req);
  if (r.antwort) return r.antwort;
  const rumpf = r.daten;
  const ablage = store();

  try {
    if (SITZUNGSWEGE.has(pfad)) {
      /* A-2: Ausstellen zählt hier nur als Last je Person; `zugaenge` zählt erst nach der Rollenprüfung (unten). */
      const bremsArt = pfad === "/api/einladung/liste" ? "lesen" : "schreiben";
      const l = await leitungSitzung(req, ablage, pfad.slice(5), bremsArt, pfad === "/api/einladung");
      if ("antwort" in l) return l.antwort;
      const { s, k, bestand, wer } = l;

      /* ------------------------- Einladung ausstellen ------------------------ */
      if (pfad === "/api/einladung") {
        /* N-1 (Sicherheitsreview): zuerst die Rechte. Eine Sitzung ohne Rollenvergabe bekommt immer dieselbe Antwort —
           ob Passwort oder Zugangscode stimmen, erfährt sie hier nicht (kein Prüforakel, keine Wartezeit als Signal). */
        const v = einladungRechtePruefen(s, bestand);
        if (!v.ok) {
          await protokoll("einladung", k, "abgewiesen", v.grund, wer);
          return antwort({ fehler: v.fehler }, v.status);
        }
        /* A-2: Rateschutz je Person, erst für eine Sitzung, die ausstellen dürfte (siehe Kopf). */
        const kp = kennungPerson(s);
        const best = rumpf.bestaetigung && typeof rumpf.bestaetigung === "object" ? rumpf.bestaetigung : {};
        /* Streng: Jede nicht leere Zeichenkette gilt als Nachweis und zählt als Versuch — auch nur Leerzeichen. */
        const mitNachweis = ["zweifaktor", "zugangscode", "passwort"]
          .some((x) => typeof best[x] === "string" && best[x] !== "");
        /* Nur ein Nachweis ist ein Rateversuch: gezählt je Person, je Raum (Ziel) und installationsweit (Gesamt). Ohne
           Nachweis wird kein Geheimnis verglichen (frischeBestaetigung) — dann zählt hier nichts. */
        let bn = null;
        if (mitNachweis) {
          bn = await bremse("einladung-nachweis", kp, k);
          if (!bn.frei) { await protokoll("einladung", k, "gebremst", bn.grund, wer); return zuVielAntwort(bn.wartet); }
        }
        /* B1: frische Bestätigung — erst, wenn die Sitzung überhaupt ausstellen dürfte. */
        const f = await frischeBestaetigung(ablage, { sitzung: s, bestaetigung: rumpf.bestaetigung, k });
        /* Stimmt der Nachweis, war es kein Rateversuch: den Zähler DIESER Person und genau die Vermerke DIESES Aufrufs
           bei Raum und Gesamt zurücknehmen — nie die anderer Personen oder Aufrufe. Falsche Nachweise bleiben gezählt. */
        if (mitNachweis && f.ok) await entlasten("einladung-nachweis", kp, bn);
        if (!f.ok) {
          await protokoll("einladung", k, "abgewiesen", f.grund, wer);
          return antwort({ fehler: f.fehler, ...("bestaetigung" in f ? { bestaetigung: f.bestaetigung } : {}) },
            f.status);
        }
        /* Kontingent für das Ausstellen selbst: je Person, dann je Betrieb — nie installationsweit, damit kein Betrieb
           einen anderen aussperrt (A-2 globale Grenze). */
        for (const [art, kennungArt] of [["einladung-ausstellen", kp], ["einladung-betrieb", kennungBetrieb(s)]]) {
          const ba = await bremse(art, kennungArt);
          if (!ba.frei) { await protokoll("einladung", k, "gebremst", `${art}: ${ba.grund}`, wer); return zuVielAntwort(ba.wartet); }
        }
        const e = await einladungAusstellen(ablage, { sitzung: s, bestand,
          personId: rumpf.personId, rolle: rumpf.rolle });
        if (!e.ok) {
          await protokoll("einladung", k, "abgewiesen", e.grund, wer);
          return antwort({ fehler: e.fehler }, e.status);
        }
        /* Im Protokoll nur die Kennung der Einladung, keine Angaben zur eingeladenen Person. */
        await protokoll("einladung", k, "erfolg", `ausgestellt (${e.rolle}) · ${e.id}`, wer);
        return antwort({ ok: true, id: e.id, einladung: e.einladung, bis: e.bis, ausgestellt: e.ausgestellt,
          person: e.person, rolle: e.rolle });
      }

      /* ------------------------------ Liste ---------------------------------- */
      if (pfad === "/api/einladung/liste") {
        const e = await einladungenListe(ablage, { sitzung: s, bestand });
        if (!e.ok) return antwort({ fehler: e.fehler }, e.status);
        return antwort({ ok: true, einladungen: e.einladungen, neuEingeloest: e.neuEingeloest });
      }

      /* ---------------------------- Widerrufen ------------------------------- */
      const e = await einladungWiderrufen(ablage, { sitzung: s, bestand, id: rumpf.id });
      if (!e.ok) {
        await protokoll("einladung", k, "abgewiesen", `widerrufen: ${e.grund}`, wer);
        return antwort({ fehler: e.fehler }, e.status);
      }
      await protokoll("einladung", k, "erfolg", `widerrufen · ${String(rumpf.id)}`, wer);
      return antwort({ ok: true, widerrufen: true });
    }

    /* -------------------------- Einladung einlösen -------------------------- */
    if (pfad === "/api/einladung/annehmen") {
      /* Ohne Sitzung erreichbar, also eine Ratefläche: dieselbe harte Bremse wie die Anmeldung. */
      const k = kennung(req, null);
      const b = await bremse("anmelden", k);
      if (!b.frei) { await protokoll("einladung", k, "gebremst", b.grund); return zuVielAntwort(b.wartet); }
      let e;
      try {
        e = await einladungEinloesen(ablage, { einladung: rumpf.einladung,
          bestandLesen: (raum) => bestandLesenStreng(ablage, raum) });
      } catch {
        /* Nur vor dem Verbrauch: Die Einladung gilt noch. */
        await protokoll("einladung", k, "fehler", "Einlösen nicht möglich (nichts verbraucht)");
        return nichtLesbar();
      }
      if (!e.ok) {
        await protokoll("einladung", k, "abgewiesen", `annehmen: ${e.grund}`);
        return antwort({ fehler: e.fehler }, e.status);
      }
      /* B5: Die Leitung sieht die Einlösung in ihrer Liste (Status, Zeitpunkt, Hinweis „neu eingelöst").
         Ins Protokoll gehen nur Rolle und Kennung der Einladung — keine Person, kein Name, kein Code. */
      await protokoll("einladung", k, "erfolg", `angenommen (${e.rolle}) · ${e.id}`, { rolle: e.rolle });
      return antwort({ ok: true, zugangscode: e.zugangscode, rolle: e.rolle, name: e.name });
    }

    return antwort({ fehler: "Unbekannter Weg." }, 404);
  } catch {
    return antwort({ fehler: "Interner Fehler." }, 500);
  }
};

export const config = { path: ["/api/einladung", "/api/einladung/liste", "/api/einladung/widerrufen",
  "/api/einladung/annehmen"] };
