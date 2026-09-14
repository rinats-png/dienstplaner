import { getStore } from "../lib/ablage.mjs";
import { createHash, randomBytes } from "node:crypto";
import { bremse, entlasten, kennung, herkunftErlaubt, zuVielAntwort,
  protokoll } from "../lib/schutz.mjs";
import { ablageSchluessel } from "../lib/codes.mjs";
import { kontoSchreiben } from "../lib/konten.mjs";
import { verwalterPruefen, verwalterAnlegen, verwalterListe, verwalterSperren, verwalterAktiv }
  from "../lib/verwalter.mjs";

/* ==========================================================================
   EINRICHTUNG
   Legt Zugänge an. Geschützt durch ein Verwaltungskennwort, das als
   Umgebungsvariable hinterlegt wird — nie im Quelltext.

   Aufruf einmalig nach dem ersten Deployment:
     curl -X POST https://<site>/einrichten \
       -H "content-type: application/json" \
       -d '{"verwaltung":"<CENTRIC_ADMIN>","name":"Nordwacht","bestand":"nordwacht"}'
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const antwort = (d, status = 200) => new Response(JSON.stringify(d, null, 2),
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/einrichten\/?/, "");
  if (!["", "verwalter", "umgebung"].includes(pfad))
    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  if (pfad === "" && req.method !== "POST") return antwort({ fehler: "Nur POST." }, 405);

  /* Zustandsändernde Anfragen nur von der eigenen Seite (siehe schutz.mjs). */
  if (!herkunftErlaubt(req))
    return antwort({ fehler: "Diese Anfrage kommt nicht von der Anwendung." }, 403);

  /* Fünf Versuche in zehn Minuten, danach eine Stunde Sperre. Wer das
     Verwaltungskennwort raten will, braucht mit dieser Bremse länger als
     ein Menschenleben. */
  const k = kennung(req, null);
  const b = await bremse("einrichten", k);
  if (!b.frei) { await protokoll("einrichten", k, "gebremst", b.grund);
    return zuVielAntwort(b.wartet); }

  const s0 = store();

  let body;
  try { body = req.method === "GET" ? {} : await req.json(); } catch { body = {}; }
  const { name, bestand, rolle, person, betrieb, hinweis, demo, gruppe } = body || {};

  /* Der Schlüssel darf im Rumpf stehen (wie bisher) oder im Kopf. GET kennt
     keinen Rumpf — ohne den Kopf ließe sich die Liste gar nicht abrufen. */
  const kopfSchluessel = (req.headers.get("authorization") || "").startsWith("Bearer ")
    ? req.headers.get("authorization").slice(7) : null;
  const verwaltung = body.verwaltung || kopfSchluessel;

  /* Wer ist das? Entweder ein benanntes Verwalterkonto oder der
     Ursprungsschlüssel aus der Umgebung. Beides wird zeitkonstant
     verglichen — vorher brach !== beim ersten abweichenden Zeichen ab. */
  const wer = await verwalterPruefen(s0, verwaltung);
  if (!wer) {
    await new Promise((r) => setTimeout(r, 400));
    await protokoll("einrichten", k, "abgewiesen", pfad || "zugang");
    /* Ohne jeden Schlüssel steht die Anwendung noch vor der Einrichtung —
       das ist ein anderer Fall als ein falscher Schlüssel und verdient
       einen anderen Satz. */
    if (!process.env.CENTRIC_ADMIN && (await verwalterAktiv(s0)) === 0)
      return antwort({ fehler: "Es gibt noch keinen Verwalterzugang. "
        + "CENTRIC_ADMIN in den Umgebungsvariablen setzen und damit das erste "
        + "benannte Konto anlegen." }, 500);
    return antwort({ fehler: "Verwaltungsschlüssel stimmt nicht." }, 401);
  }
  await entlasten("einrichten", k);

  /* Beschäftigte und Schichtverantwortung schreiben nur, was zu ihrer
     Person gehört — ein Code dieser Rollen ohne Person kann deshalb nichts
     und sieht in der Oberfläche eine Rollenauswahl statt eines Menschen.
     Solche Codes entstehen gar nicht erst.

     Diese Prüfung steht bewusst hinter dem Verwaltungsschlüssel und hinter
     dem Entlasten: Wer sich ausgewiesen hat und dann einen fachlichen
     Fehler macht, soll dafür nicht in die Bremse gegen das Erraten des
     Schlüssels laufen. */
  if (req.method === "POST" && !pfad && (rolle === "mitarbeiter" || rolle === "subplaner")
      && (person === null || person === undefined || person === ""))
    return antwort({ fehler: `Ein Zugang der Rolle „${rolle}" braucht eine Person. `
      + "Bitte die Kennung der Person aus dem Betrieb angeben." }, 400);

  /* ---------------------------- Verwalterkonten ----------------------
     Ein Geheimnis für alle lässt sich weder entziehen noch zuordnen.
     Benannte Konten lösen beides: eigener Schlüssel je Person, einzeln
     widerrufbar, mit Namen im Protokoll.                              */
  if (pfad === "verwalter") {
    if (req.method === "GET")
      return antwort({ verwalter: await verwalterListe(s0), ich: wer.name });

    if (req.method === "POST") {
      if (!body.neuerName || String(body.neuerName).trim().length < 2)
        return antwort({ fehler: "Bitte einen Namen angeben." }, 400);
      const erg = await verwalterAnlegen(s0, {
        name: body.neuerName, email: body.email, tage: body.tage, durch: wer.name });
      await protokoll("verwalter", k, "angelegt", `${body.neuerName} durch ${wer.name}`);
      return antwort({ ok: true, ...erg, name: String(body.neuerName).trim(),
        hinweis: "Dieser Schlüssel erscheint genau einmal. Gespeichert ist nur seine "
          + "Prüfsumme." });
    }

    if (req.method === "DELETE") {
      if (!body.kennung) return antwort({ fehler: "Keine Kennung angegeben." }, 400);
      if (body.kennung === wer.kennung)
        return antwort({ fehler: "Der eigene Zugang lässt sich nicht sperren. "
          + "Sonst steht am Ende niemand mehr bereit." }, 400);
      const n = await verwalterSperren(s0, body.kennung);
      await protokoll("verwalter", k, "gesperrt", `${body.kennung} durch ${wer.name}`);
      return antwort({ ok: true, gesperrt: n });
    }
    return antwort({ fehler: "Nur GET, POST oder DELETE." }, 405);
  }

  /* ---------------------------- Umgebungsbericht ---------------------
     Ob eine Umgebungsvariable gesetzt ist, war von außen nicht
     feststellbar. Bei Netlify kommt hinzu, dass als *secret* angelegte
     Variablen auch über die Verwaltungsschnittstelle nicht mehr
     erscheinen — wer sie setzt, kann es anschließend nirgends nachsehen.
     Das hat schon einmal dazu geführt, dass eine Anwendung ohne Pfeffer
     lief, ohne dass es jemandem auffiel.

     Deshalb hier: ja oder nein, nie der Wert. Der Bericht steht hinter
     derselben Prüfung wie das Anlegen von Zugängen; wer ihn lesen darf,
     dürfte die Werte ohnehin setzen.                                   */
  if (pfad === "umgebung") {
    if (req.method !== "GET") return antwort({ fehler: "Nur GET." }, 405);

    const gesetzt = (n) => !!(process.env[n] || "").trim();
    const absender = (process.env.CENTRIC_ABSENDER || "").trim();
    /* Resends Sandbox-Adresse stellt ausschließlich an den Kontoinhaber
       zu. Sie ist gesetzt und funktioniert — nur eben nicht für Kunden. */
    const sandbox = /@resend\.dev$/i.test(absender);

    const warnungen = [];
    if (!gesetzt("CENTRIC_PFEFFER"))
      warnungen.push("CENTRIC_PFEFFER fehlt. Zugangscodes liegen als ungesalzenes "
        + "SHA-256 im Speicher. Jetzt setzen — nach dem ersten Code geht es nicht "
        + "mehr folgenlos.");
    if (gesetzt("CENTRIC_ADMIN"))
      warnungen.push("CENTRIC_ADMIN ist noch gesetzt. Nach dem Anlegen des ersten "
        + "benannten Verwalterkontos gehört der Ursprungsschlüssel gelöscht.");
    if (!gesetzt("RESEND_API_KEY"))
      warnungen.push("RESEND_API_KEY fehlt. Es geht keine E-Mail hinaus.");
    else if (sandbox || !absender)
      warnungen.push("CENTRIC_ABSENDER steht auf der Sandbox-Adresse von Resend. "
        + "Nachrichten erreichen nur den Kontoinhaber, alle übrigen verschwinden "
        + "ohne Fehlermeldung.");
    if (gesetzt("VAPID_PUBLIC") !== gesetzt("VAPID_PRIVATE"))
      warnungen.push("Vom VAPID-Paar ist nur eine Hälfte gesetzt. So lässt sich "
        + "keine Push-Mitteilung versenden.");

    return antwort({
      gepr: new Date().toISOString(),
      region: process.env.AWS_REGION || null,
      umgebung: {
        pfeffer: gesetzt("CENTRIC_PFEFFER"),
        ursprungsschluessel: gesetzt("CENTRIC_ADMIN"),
        mailversand: gesetzt("RESEND_API_KEY"),
        absender: absender || null,
        absenderIstSandbox: sandbox,
        pushOeffentlich: gesetzt("VAPID_PUBLIC"),
        pushPrivat: gesetzt("VAPID_PRIVATE"),
        bremseAtomar: gesetzt("REDIS_REST_URL") && gesetzt("REDIS_REST_TOKEN"),
      },
      verwalterkonten: await verwalterAktiv(s0),
      warnungen,
      /* Ein leeres `warnungen` ist die einzige Aussage, die zählt. */
      inOrdnung: warnungen.length === 0,
    });
  }

  if (!name || !bestand) return antwort({ fehler: "name und bestand sind nötig." }, 400);

  // Zugangscode in gut vorlesbarer Form: vier Blöcke, keine verwechselbaren Zeichen
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY34679";
  const block = () => Array.from(randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join("");
  const code = `${block()}-${block()}-${block()}`;

  const s = s0;
  const konto = { name, bestand,
    rolle: rolle || "kunde",       // betreiber | leitung | planer | subplaner | mitarbeiter | betriebsrat
    person: person ?? null,        // Index der Person innerhalb des Betriebs
    betrieb: betrieb ?? 0,         // Index des Betriebs im Bestand
    hinweis: hinweis || null,
    /* Als Demozugang gekennzeichnete Konten erscheinen auf der Anmeldeseite
       und lassen sich ohne Code öffnen. Alle übrigen bleiben geschützt. */
    demo: !!demo, gruppe: gruppe || null,
    /* Kennung aus dem Code selbst statt aus der Anzahl — die Anzahl war
       unter Nebenläufigkeit nicht eindeutig. */
    id: demo ? `d${ablageSchluessel(code).slice(-8)}` : null,
    angelegt: new Date().toISOString() };
  await kontoSchreiben(s, ablageSchluessel(code), konto);

  /* Wer es war, steht jetzt im Protokoll — nicht mehr nur ein Hashwert
     der Netzadresse. */
  await protokoll("einrichten", k, "erfolg",
    `${rolle || "kunde"} · ${bestand} · durch ${wer.name}`);
  return antwort({ ok: true, zugangscode: code, name, bestand,
    hinweis: "Diesen Code sicher weitergeben. Er wird nur als Prüfsumme gespeichert "
      + "und lässt sich nicht wiederherstellen." });
};

export const config = { path: ["/einrichten", "/einrichten/*"] };
