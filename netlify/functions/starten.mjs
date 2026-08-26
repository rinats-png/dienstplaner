import { getStore } from "@netlify/blobs";
import { createHash, randomBytes } from "node:crypto";
import { bremse, kennung, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { baueLeerenBetrieb } from "../lib/leerbetrieb.mjs";
import { kontoSchreiben, mailSchluessel, mailNormieren, findeKontoMail }
  from "../lib/konten.mjs";
import { passwortAblegen, pruefeRegel } from "../lib/passwoerter.mjs";
import { sendeMail, anwendungsAdresse } from "../lib/post.mjs";
import { bestandSchreiben, raumBelegt } from "../lib/bestand.mjs";
import { sitzungAnlegen } from "../lib/sitzungen.mjs";

/* ==========================================================================
   SELBST STARTEN

   Ein Interessent legt sich einen Testbetrieb an, ohne dass jemand mitwirken
   muss. Das ist der einzige Weg, wie CENTRIC verkauft werden kann, während
   der Betreiber im Schichtdienst ist.

   Seit dem Umbau auf Einladungen entsteht dabei genau ein Zugang: die
   Organisationsleitung, mit Adresse und Passwort. Vorher entstanden bis zu
   sechs Rollencodes ohne Personenbezug — alle Planer teilten sich einen
   Code, und das Protokoll kannte keinen Urheber. Wer weitere Zugänge
   braucht, lädt aus der Anwendung heraus ein; wer keine Adresse hat,
   bekommt dort einen Code je Person.

   Der Vertrag zur Auftragsverarbeitung wird beim Anlegen angenommen —
   Fassung, Zeitpunkt und Herkunft stehen am Konto und am Bestand. Ohne
   Zustimmung entsteht kein Betrieb: Das Versprechen der Website lautet
   „vor dem ersten Datensatz", und der erste Datensatz entsteht hier.

   Drei Vorkehrungen, ohne die das nicht verantwortbar wäre:

   Streng gebremst — drei Betriebe je Stunde und Herkunft. Ohne das legt
   jemand über Nacht zehntausend Räume an und die Kosten laufen mit.

   Befristet — ein selbst angelegter Betrieb läuft nach 30 Tagen ab. Wer
   bleiben will, meldet sich; wer nur geschaut hat, kostet nichts dauerhaft.

   Gekennzeichnet — der Betreiber sieht in seiner Konsole, wer sich selbst
   angelegt hat und wie weit derjenige gekommen ist. Das ist die Liste, die
   man abends durchgeht.
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/* Die Fassung des Vertrags zur Auftragsverarbeitung, der beim Anlegen
   angenommen wird. Ändert sich der Vertrag, ändert sich diese Kennung —
   und am Konto steht, welche Fassung wann angenommen wurde. */
const AVV_FASSUNG = "2026-08";

const antwort = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const TESTTAGE = 30;

/** Ein lesbarer Raumname aus dem Betriebsnamen, mit Zufallsanhang. */
function raumName(name) {
  const rein = String(name || "betrieb").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "betrieb";
  const alphabet = "acdefghjkmnpqrtuvwxy34679";
  const anhang = Array.from(randomBytes(5))
    .map((b) => alphabet[b % alphabet.length]).join("");
  return `t-${rein}-${anhang}`;
}

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/(starten)\/?/, "");

  try {
    if (pfad !== "" && pfad !== "neu") return antwort({ fehler: "Unbekannter Pfad." }, 404);
    if (req.method !== "POST") return antwort({ fehler: "Nur POST." }, 405);

    const k = kennung(req, null);
    const b = await bremse("starten", k);
    if (!b.frei) {
      await protokoll("starten", k, "gebremst", b.grund);
      return zuVielAntwort(b.wartet);
    }

    const { name, branche, email, passwort, land, avv, ansprech } = await req.json();
    if (!name || String(name).trim().length < 3)
      return antwort({ fehler: "Bitte einen Betriebsnamen mit mindestens drei Zeichen." }, 400);
    if (String(name).length > 80)
      return antwort({ fehler: "Der Name ist zu lang." }, 400);
    const mail = mailNormieren(email);
    if (!mail || !mail.includes("@") || mail.length > 254)
      return antwort({ fehler: "Bitte eine E-Mail-Adresse — sie ist dein Zugang." }, 400);
    /* Der örtliche Adressteil und der Betriebsname sind das Erste, was
       jemand rät — beides darf nicht im Passwort stecken. */
    const regel = pruefeRegel(passwort, [name, mail.split("@")[0]]);
    if (!regel.ok) return antwort({ fehler: regel.grund }, 400);
    if (avv !== true)
      return antwort({ fehler: "Ohne den Vertrag zur Auftragsverarbeitung geht es nicht — er schützt die Daten deiner Beschäftigten." }, 400);

    const erlaubteBranchen = ["sicherheit", "pflege", "klinik", "industrie", "sonstige"];
    const br = erlaubteBranchen.includes(branche) ? branche : "sonstige";
    /* Das Bundesland entscheidet über die Feiertage — falsch geraten ist
       schlechter als nachgefragt, deshalb Hessen als Vorgabe und änderbar. */
    const LAENDER = ["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI",
      "NW", "RP", "SL", "SN", "ST", "SH", "TH"];
    const bl = LAENDER.includes(land) ? land : "HE";

    /* Ist die Adresse schon vergeben? Dann führt der Weg über die
       Anmeldung, nicht über eine zweite Anlage. Die Bremse oben begrenzt,
       wie schnell sich das zum Adressprüfer machen lässt. */
    const belegt = await findeKontoMail(store(), mail);
    if (belegt.eintrag)
      return antwort({ fehler: "Für diese Adresse besteht bereits ein Zugang.",
        text: `Melde dich an — oder fordere über „Passwort vergessen" einen Link an.` }, 409);

    const raum = raumName(name);
    const jetzt = new Date();
    const laeuftAb = new Date(jetzt.getTime() + TESTTAGE * 86400000);

    /* Der Raum darf noch nicht belegt sein — bei fünf Zufallszeichen
       praktisch ausgeschlossen, aber geprüft wird trotzdem. */
    if (await raumBelegt(store(), raum))
      return antwort({ fehler: "Bitte noch einmal versuchen." }, 409);

    /* Den Betrieb anlegen, bevor die Zugänge entstehen.

       Vorher fehlte dieser Schritt, und die Anwendung erzeugte beim ersten
       Öffnen ihre Beispieldaten — der Interessent landete in einem
       erfundenen Wachdienst statt im eigenen Haus. Name und Branche waren
       damit verloren. */
    const avvVermerk = { fassung: AVV_FASSUNG, zeit: jetzt.toISOString(), herkunft: k };
    const leer = baueLeerenBetrieb({
      name, branche: br, email: mail, land: bl, raum, laeuftAb: laeuftAb.toISOString(),
      avv: avvVermerk,
    });
    await bestandSchreiben(store(), raum, leer, { durch: "Selbststart" });

    /* Ein Zugang: die Organisationsleitung, mit Adresse und Passwort.
       Alles Weitere entsteht in der Anwendung — als Einladung, wo eine
       Adresse da ist, als Code je Person, wo keine ist. */
    const kontoKey = mailSchluessel(mail);
    await kontoSchreiben(store(), kontoKey, {
      name: String(name).trim(), ansprech: ansprech ? String(ansprech).trim().slice(0, 80) : null,
      email: mail, passwort: await passwortAblegen(passwort),
      bestand: raum, rolle: "leitung",
      person: null, betrieb: 0, demo: false, gruppe: null, hinweis: null,
      status: "aktiv", einladungNr: 0, avv: avvVermerk,
      selbstAngelegt: true, laeuftAb: laeuftAb.toISOString(),
      angelegt: jetzt.toISOString(),
    });

    /* Die Sitzung entsteht sofort — es gibt nichts abzuschreiben und
       keinen Umweg über ein Codefeld. Gleiche Gestalt wie bei der
       Anmeldung in daten.mjs, damit die Anwendung nichts unterscheiden
       muss. */
    const { token, gueltigBis } = await sitzungAnlegen({
      bestand: raum, name: String(name).trim(), rolle: "leitung",
      person: null, betrieb: 0, konto: kontoKey, einheit: null,
    });

    /* Die Begrüßung nach draußen — im Trockenlauf bleibt sie im Haus. */
    await sendeMail(mail, `${String(name).trim()} steht bereit`,
      [`Dein Betrieb ist angelegt. Anmeldung mit dieser Adresse unter`,
       anwendungsAdresse(), "",
       `Der Testzeitraum läuft ${TESTTAGE} Tage. Der Vertrag zur`,
       `Auftragsverarbeitung (Fassung ${AVV_FASSUNG}) ist angenommen und`,
       `steht in der Anwendung unter „Rechtliches" zum Abruf.`].join("\n"));

    /* Vermerk für die Betreiberkonsole — ohne Zugangscodes. */
    const liste = (await store().get("selbststarts", { type: "json" })) || [];
    liste.unshift({
      raum, name: String(name).trim(), branche: br, email: mail,
      zugaenge: 1, angelegt: jetzt.toISOString(),
      laeuftAb: laeuftAb.toISOString(), herkunft: k,
      /* Für die Liste, die man abends durchgeht: Wie weit ist derjenige
         gekommen? 0 = angelegt, dann zählt daten.mjs beim Schreiben hoch. */
      stufe: 0, zuletzt: jetzt.toISOString(), nachgefasst: {},
    });
    await store().setJSON("selbststarts", liste.slice(0, 500));

    await protokoll("starten", k, "erfolg", `${br} · Leitungszugang mit Adresse`);

    return antwort({ ok: true, token, raum, name: String(name).trim(),
      rolle: "leitung", person: null, betrieb: 0, hinweis: null,
      gueltigBis, branche: br,
      laeuftAb: laeuftAb.toISOString(), testtage: TESTTAGE });
  } catch (e) {
    return antwort({ fehler: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/starten", "/starten/*"] };
