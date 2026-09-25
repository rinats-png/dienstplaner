/* ==========================================================================
   ACCOUNT-ISOLATION

   accounts.test.js prüft, ob die Speicherfunktionen tun, was sie sollen.
   Diese Datei prüft das Gegenteil: was sie niemals tun dürfen.

   Drei Ebenen, die nicht ineinanderfallen dürfen:

     ACCOUNT        die Identität eines Menschen — global, betriebsblind.
     MITGLIEDSCHAFT die Berechtigung in genau EINEM Raum. Trägt die Rolle.
     PERSON         der fachliche Mitarbeiterdatensatz in diesem Raum.

   Die Fälle hier sind deshalb keine Bedienfehler, sondern Angriffe: ein
   Index, der auf einen fremden Account zeigt; ein Datensatz, dessen Inhalt
   nicht zu seinem Schlüssel passt; eine Frage nach einem Raum, in dem man
   nichts zu suchen hat. Jeder einzelne davon wäre, wenn er durchkäme, ein
   Weg von einem Betrieb in einen anderen.

   Was accounts.test.js schon beweist, steht hier nicht noch einmal. Wo
   diese Datei eine dort vorhandene Prüfung verschärft, sagt der Kommentar
   es ausdrücklich.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore, A, quelltext;

/** Ein gültig geformter Prüfwert. Die Kryptographie prüft passwoerter.mjs. */
const PW = "s1$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=";

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-isolation-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  A = await import("../server/lib/accounts.mjs");
  /* Für die strukturellen Zusicherungen: Manche Invarianten lassen sich
     nicht durch einen Aufruf beweisen, sondern nur dadurch, dass es die
     Abkürzung im Modul gar nicht gibt. */
  quelltext = await readFile(new URL("../server/lib/accounts.mjs", import.meta.url), "utf8");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

let zaehler = 0;
const laden = () => getStore({ name: `isolation${++zaehler}`, consistency: "strong" });

const mitAccount = async (s, email) => {
  const e = await A.accountAnlegen(s, { email });
  expect(e.ok, `Account ${email}: ${e.grund}`).toBe(true);
  return e.account;
};

const mitglied = async (s, accountId, raum, felder) => {
  const e = await A.mitgliedschaftAnlegen(s, {
    accountId, raum, betrieb: 0, mandantId: "m1", rolle: "mitarbeiter",
    status: "aktiv", ...felder,
  });
  expect(e.ok, `${raum}: ${e.grund}`).toBe(true);
  return e.mitgliedschaft;
};

/* Felder des fachlichen Personendatensatzes, wie er wirklich aussieht
   (Person in src/App.jsx: vorname, nachname, funktion, wochenstunden …).
   `email` fehlt in dieser Liste, weil sie die Identität ist und in den
   Account gehört; `status` und `rolle` stehen unten in eigenen Prüfungen,
   weil die Person sie ebenfalls trägt — mit anderer Bedeutung. */
const PERSONENFELDER = ["vorname", "nachname", "funktion", "zugehoerigkeit",
  "eintritt", "austritt", "wochenstunden", "urlaubsanspruch", "urlaubsuebertrag",
  "stundenuebertrag", "qualifikationen", "qualNachweise", "kompetenzen",
  "teilzeit", "springer", "einschraenkungen", "bereich", "abwesenheiten",
  "schichten", "dienste", "standort", "standortId", "einheitId"];

/* ==========================================================================
   DIE DREI EBENEN FALLEN NICHT INEINANDER
   ========================================================================== */

describe("Der Account bleibt Identität und wird nicht zum Mitarbeiterdatensatz", () => {
  it("trägt keine Personendaten — auch nicht nach jeder Änderung", async () => {
    const s = laden();
    const a = await mitAccount(s, "ident@example.org");
    await mitglied(s, a.id, "t-iso-a", { person: "p17", rolle: "leitung", einheit: "e1" });
    /* Alles, was das Modul an einem Account ändern kann, einmal anwenden. */
    await A.passwortSetzen(s, a.id, PW);
    await A.emailBestaetigen(s, a.id);
    await A.tokenNrErhoehen(s, a.id, "verifizierung");
    await A.anmeldungVermerken(s, a.id);
    const stand = await A.accountLesenPerId(s, a.id);
    for (const feld of PERSONENFELDER) {
      expect(Object.prototype.hasOwnProperty.call(stand, feld), feld).toBe(false);
    }
    /* Und nichts aus der Mitgliedschaft ist mitgewandert. */
    const text = JSON.stringify(stand);
    expect(text).not.toContain("p17");
    expect(text).not.toContain("leitung");
    expect(text).not.toContain("t-iso-a");
  });

  it("trägt weder Raum noch Betrieb noch Mandant — und kann sie nicht bekommen", async () => {
    const s = laden();
    const a = await mitAccount(s, "ohneraum@example.org");
    const verboten = ["raum", "bestand", "betrieb", "mandantId", "rolle", "person",
      "einheit", "mitgliedschaften"];
    /* Verschärfung gegenüber accounts.test.js: dort wird das Fehlen am
       frischen Datensatz geprüft. Hier wird versucht, die Felder über die
       Änderungsfunktion hineinzubekommen. */
    for (const feld of verboten) {
      const e = await A.accountAendern(s, a.id, { [feld]: "x" });
      expect(e.ok, feld).toBe(false);
      expect(e.grund).toBe(`feld:${feld}`);
    }
    const stand = await A.accountLesenPerId(s, a.id);
    for (const feld of verboten) {
      expect(Object.prototype.hasOwnProperty.call(stand, feld), feld).toBe(false);
    }
  });

  it("hat `status` als Identitätsstatus, nicht als Beschäftigungsstand", async () => {
    const s = laden();
    const a = await mitAccount(s, "statuswort@example.org");
    /* Person und Account tragen beide ein Feld `status`. Der Account kennt
       nur die drei Werte seiner Identität. */
    expect(A.ACCOUNT_STATUS).toEqual(["eingeladen", "aktiv", "gesperrt"]);
    for (const wort of ["aktiv-beschaeftigt", "ausgetreten", "elternzeit", "leitung"]) {
      expect((await A.accountAendern(s, a.id, { status: wort })).grund, wort).toBe("status");
    }
  });
});

describe("Die Mitgliedschaft bleibt Berechtigung und wird nicht zur Identität", () => {
  it("enthält keine Zugangsdaten und keine Adresse", async () => {
    const s = laden();
    const a = await mitAccount(s, "geheim@example.org");
    await A.passwortSetzen(s, a.id, PW);
    const m = await mitglied(s, a.id, "t-iso-geheim", { person: "p4", rolle: "planer" });
    const roh = await s.get(A.mitgliedSchluessel(a.id, "t-iso-geheim"), { type: "json" });
    for (const feld of ["email", "emailNorm", "passwort", "passwortHash", "passwortGeaendert",
      "epoche", "tokenNr", "emailVerifiziertAm", "letzteAnmeldung"]) {
      expect(Object.prototype.hasOwnProperty.call(m, feld), `Rückgabe: ${feld}`).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(roh, feld), `Ablage: ${feld}`).toBe(false);
    }
    const text = JSON.stringify(roh);
    expect(text).not.toContain("geheim@example.org");
    expect(text).not.toContain("s1$");
  });

  it("legt auch im Raumindex keine Adresse ab", async () => {
    const s = laden();
    const a = await mitAccount(s, "raumindex@example.org");
    await mitglied(s, a.id, "t-iso-index");
    const z = await s.get(A.raummitgliedSchluessel("t-iso-index", a.id), { type: "json" });
    expect(Object.keys(z).sort()).toEqual(["accountId", "raum"]);
    expect(JSON.stringify(z)).not.toContain("raumindex@");
    /* Ein Betrieb, der seine Mitglieder auflistet, bekommt Kennungen —
       keine Adressen. Die Zuordnung Kennung zu Adresse liegt allein im
       Account. */
    const liste = await A.mitgliedschaftenDesRaums(s, "t-iso-index");
    expect(JSON.stringify(liste)).not.toContain("raumindex@");
  });

  it("kennt keinen Weg von einer Adresse zu einer Mitgliedschaft", () => {
    /* Es darf keine Funktion geben, die eine Mitgliedschaft über eine
       E-Mail findet: Sie wäre für einen Betrieb die Brücke zur globalen
       Identität. Der Weg führt ausschließlich über die Kennung. */
    for (const n of Object.keys(A)) {
      const klein = n.toLowerCase();
      if (!klein.includes("mitglied")) continue;
      expect(klein.includes("mail"), n).toBe(false);
      expect(klein.includes("adresse"), n).toBe(false);
    }
    expect(typeof A.mitgliedschaftLesen).toBe("function");
  });
});

/* ==========================================================================
   KEINE ABLEITUNG ÜBER MITGLIEDSCHAFTEN HINWEG
   ========================================================================== */

describe("Es gibt keine höchste Rolle", () => {
  it("exportiert keine Funktion, die Rollen über Räume hinweg verrechnet", () => {
    const verdaechtig = ["hoechste", "höchste", "beste", "max", "global", "effektiv",
      "wirksam", "bevorzugt", "erste", "summe", "vereinigung", "gesamt"];
    for (const n of Object.keys(A)) {
      const klein = n.toLowerCase();
      if (!klein.includes("rolle") && !klein.includes("recht")) continue;
      for (const v of verdaechtig) expect(klein.includes(v), `${n} enthält ${v}`).toBe(false);
    }
    /* Was das Modul an Rollen anbietet, ist eine Liste erlaubter Werte —
       keine Rechenvorschrift. */
    expect(Array.isArray(A.MITGLIED_ROLLEN)).toBe(true);
  });

  it("vergleicht Ränge nicht und entscheidet keine Rechte", () => {
    /* Der Speicher darf keine Rechte ableiten. Täte er es, gäbe es zwei
       Stellen mit einer Meinung dazu — und die zweite wäre irgendwann die
       falsche. RANG wird ausschließlich als Namensliste benutzt. */
    expect(quelltext).not.toContain("./rechte.mjs");
    expect(quelltext).not.toMatch(/RANG\[[^\]]+\]\s*[<>]/);
    expect(quelltext).not.toMatch(/Math\.max/);
    expect(quelltext).toContain("Object.keys(RANG).filter");
  });

  it("hält Account-Kennung und Person-Kennung getrennt", async () => {
    const s = laden();
    const a = await mitAccount(s, "getrennt@example.org");
    await mitglied(s, a.id, "t-iso-kennung", { person: "p17" });
    /* Zwei Namensräume, zwei Bedeutungen: a_ ist ein Mensch als Identität,
       p… ein Mitarbeiterdatensatz in einem Betrieb. Wären sie dasselbe,
       wäre derselbe Mensch in zwei Betrieben derselbe Datensatz. */
    expect(a.id.startsWith("a_")).toBe(true);
    expect(a.id).not.toContain("p17");
    const m = await A.mitgliedschaftLesen(s, a.id, "t-iso-kennung");
    expect(m.person).toBe("p17");
    expect(m.accountId).toBe(a.id);
    expect(m.person).not.toBe(m.accountId);
    /* Keine Funktion leitet eine Kennung aus der anderen ab. */
    const namen = Object.keys(A).join(" ").toLowerCase();
    for (const v of ["personzuaccount", "accountzuperson", "personid", "alsperson"]) {
      expect(namen.includes(v), v).toBe(false);
    }
    /* Dieselbe Person-Kennung in einem anderen Raum stiftet keine
       Verbindung: p17 dort ist ein anderer Mensch. */
    const b = await mitAccount(s, "gleichep@example.org");
    await mitglied(s, b.id, "t-iso-kennung-zwei", { person: "p17" });
    expect(await A.mitgliedschaftLesen(s, b.id, "t-iso-kennung")).toBe(null);
  });
});

/* ==========================================================================
   ZWEI BETRIEBE, KEIN ÜBERSPRECHEN
   ========================================================================== */

describe("Ein Account in zwei Betrieben", () => {
  it("hält Rolle, Person, Betrieb und Mandant je Raum auseinander", async () => {
    const s = laden();
    const max = await mitAccount(s, "max@example.org");
    await mitglied(s, max.id, "t-raum-a",
      { betrieb: 0, mandantId: "mA", person: "p17", rolle: "leitung" });
    await mitglied(s, max.id, "t-raum-b",
      { betrieb: 3, mandantId: "mB", person: "p83", rolle: "mitarbeiter" });

    const inA = await A.mitgliedschaftLesen(s, max.id, "t-raum-a");
    const inB = await A.mitgliedschaftLesen(s, max.id, "t-raum-b");
    expect([inA.raum, inA.rolle, inA.person, inA.betrieb, inA.mandantId])
      .toEqual(["t-raum-a", "leitung", "p17", 0, "mA"]);
    expect([inB.raum, inB.rolle, inB.person, inB.betrieb, inB.mandantId])
      .toEqual(["t-raum-b", "mitarbeiter", "p83", 3, "mB"]);
  });

  it("lässt eine Änderung in Raum A den Datensatz in Raum B unberührt", async () => {
    const s = laden();
    const max = await mitAccount(s, "max2@example.org");
    await mitglied(s, max.id, "t-quer-a", { rolle: "leitung", person: "p17" });
    await mitglied(s, max.id, "t-quer-b", { rolle: "mitarbeiter", person: "p83" });
    const vorher = JSON.stringify(await A.mitgliedschaftLesen(s, max.id, "t-quer-b"));

    await A.mitgliedschaftEntziehen(s, max.id, "t-quer-a");
    const nachher = await A.mitgliedschaftLesen(s, max.id, "t-quer-b");
    expect(JSON.stringify(nachher)).toBe(vorher);
    expect([nachher.status, nachher.rolle]).toEqual(["aktiv", "mitarbeiter"]);
    /* Und der Account selbst hat sich durch den Entzug nicht verändert. */
    expect((await A.accountLesenPerId(s, max.id)).status).toBe("eingeladen");
  });

  it("hält die Rollen zweier Accounts im selben Raum auseinander", async () => {
    const s = laden();
    const a = await mitAccount(s, "chefin@example.org");
    const b = await mitAccount(s, "kraft@example.org");
    await mitglied(s, a.id, "t-team-x", { rolle: "leitung", person: "p1" });
    await mitglied(s, a.id, "t-team-y", { rolle: "betriebsrat", person: "p2" });
    await mitglied(s, b.id, "t-team-x", { rolle: "mitarbeiter", person: "p3" });

    expect((await A.mitgliedschaftLesen(s, a.id, "t-team-x")).rolle).toBe("leitung");
    expect((await A.mitgliedschaftLesen(s, a.id, "t-team-y")).rolle).toBe("betriebsrat");
    expect((await A.mitgliedschaftLesen(s, b.id, "t-team-x")).rolle).toBe("mitarbeiter");
    /* B arbeitet im selben Raum wie die Leitung — und bleibt Beschäftigte,
       auch im zweiten Raum der Leitung, in dem B nichts zu suchen hat. */
    expect(await A.mitgliedschaftLesen(s, b.id, "t-team-y")).toBe(null);
  });

  it("zeigt in der Accountliste nur die eigenen Räume", async () => {
    const s = laden();
    const a = await mitAccount(s, "eigene@example.org");
    const b = await mitAccount(s, "fremde@example.org");
    await mitglied(s, a.id, "t-liste-x");
    await mitglied(s, a.id, "t-liste-y");
    await mitglied(s, b.id, "t-liste-z");
    const meine = await A.mitgliedschaftenDesAccounts(s, a.id);
    expect(meine.map((m) => m.raum)).toEqual(["t-liste-x", "t-liste-y"]);
    const text = JSON.stringify(meine);
    expect(text).not.toContain("t-liste-z");
    expect(text).not.toContain(b.id);
  });

  it("zeigt in der Raumliste nur die Mitglieder dieses Raums", async () => {
    const s = laden();
    const a = await mitAccount(s, "rl-a@example.org");
    const b = await mitAccount(s, "rl-b@example.org");
    const c = await mitAccount(s, "rl-c@example.org");
    await mitglied(s, a.id, "t-raum-x");
    await mitglied(s, b.id, "t-raum-x");
    await mitglied(s, c.id, "t-raum-y");
    const imX = await A.mitgliedschaftenDesRaums(s, "t-raum-x");
    expect(new Set(imX.map((m) => m.accountId))).toEqual(new Set([a.id, b.id]));
    expect(imX.some((m) => m.accountId === c.id)).toBe(false);
  });
});

/* ==========================================================================
   KEIN RÜCKFALL
   ========================================================================== */

describe("Kein Rückfall auf irgendetwas Naheliegendes", () => {
  it("gibt nichts zurück, wenn im ganzen Speicher genau eine Mitgliedschaft liegt", async () => {
    const s = laden();
    const a = await mitAccount(s, "einzig@example.org");
    await mitglied(s, a.id, "t-raum-a", { rolle: "leitung", person: "p17" });
    /* Ein Account, eine Mitgliedschaft, ein Raum — die bequemste Lage für
       einen Rückfall. Verschärfung gegenüber accounts.test.js, wo neben
       der gesuchten noch andere Daten liegen. Mitgeprüft: Ein Raumname,
       der nur in der Schreibweise oder um ein Leerzeichen abweicht, ist
       ein anderer Raum. */
    for (const raum of ["t-raum-b", "t-RAUM-A", "t-raum-a ", " t-raum-a", "t-raum",
      "t-raum-aa"]) {
      expect(await A.mitgliedschaftLesen(s, a.id, raum), raum).toBe(null);
    }
    expect((await A.mitgliedschaftLesen(s, a.id, "t-raum-a")).rolle).toBe("leitung");
  });

  it("gibt einem fremden Account nichts, obwohl der Raum existiert", async () => {
    const s = laden();
    const a = await mitAccount(s, "drin@example.org");
    const b = await mitAccount(s, "draussen@example.org");
    await mitglied(s, a.id, "t-raum-x", { rolle: "leitung", person: "p17" });
    expect(await A.mitgliedschaftLesen(s, b.id, "t-raum-x")).toBe(null);
    expect(await A.mitgliedschaftenDesAccounts(s, b.id)).toEqual([]);
    const imRaum = await A.mitgliedschaftenDesRaums(s, "t-raum-x");
    expect(imRaum.every((m) => m.accountId !== b.id)).toBe(true);
  });
});

/* ==========================================================================
   MANIPULIERTE INDIZES UND DATENSÄTZE

   Ab hier wird am Modul vorbei geschrieben — so, wie es ein Fehler in einer
   späteren Schicht oder ein Zugriff auf die Ablage täte.
   ========================================================================== */

describe("Ein Index kann keine Berechtigung erzeugen", () => {
  it("führt ein Kennungszeiger auf einen fremden Account nicht zu diesem", async () => {
    const s = laden();
    const a = await mitAccount(s, "zeiger-a@example.org");
    const b = await mitAccount(s, "zeiger-b@example.org");
    /* Der Zeiger von A wird auf den Datensatz von B umgebogen. */
    await s.setJSON(A.kontoIdSchluessel(a.id),
      { schluessel: A.accountSchluessel("zeiger-b@example.org") });
    const gelesen = await A.accountLesenPerId(s, a.id);
    expect(gelesen).toBe(null);
    /* B bleibt über seinen eigenen Zeiger erreichbar. */
    expect((await A.accountLesenPerId(s, b.id)).emailNorm).toBe("zeiger-b@example.org");
  });

  it("erzeugt ein Raumzeiger auf einen fremden Account keine Mitgliedschaft", async () => {
    const s = laden();
    const a = await mitAccount(s, "rz-a@example.org");
    const c = await mitAccount(s, "rz-c@example.org");
    await mitglied(s, a.id, "t-raum-x", { rolle: "leitung" });
    await mitglied(s, c.id, "t-raum-y", { rolle: "mitarbeiter" });
    /* C wird in die Mitgliederliste von Raum X eingetragen — ohne dass es
       eine Mitgliedschaft von C in X gäbe. */
    await s.setJSON(A.raummitgliedSchluessel("t-raum-x", c.id),
      { accountId: c.id, raum: "t-raum-x" });
    const imX = await A.mitgliedschaftenDesRaums(s, "t-raum-x");
    expect(imX.map((m) => m.accountId)).toEqual([a.id]);
    expect(await A.mitgliedschaftLesen(s, c.id, "t-raum-x")).toBe(null);
    /* Die Mitgliedschaft von C in seinem eigenen Raum ist unberührt. */
    expect((await A.mitgliedschaftLesen(s, c.id, "t-raum-y")).rolle).toBe("mitarbeiter");
  });

  it("nimmt einen Raumzeiger mit erfundener Kennung nicht auf", async () => {
    const s = laden();
    const a = await mitAccount(s, "erfunden@example.org");
    await mitglied(s, a.id, "t-raum-e");
    /* Ein Zeiger, der gleich eine Rolle mitbringt: Der Index ist Wegweiser,
       nicht Quelle — die Rolle daran wird nirgends gelesen. */
    await s.setJSON(A.raummitgliedSchluessel("t-raum-e", "a_frei_erfunden"),
      { accountId: "a_frei_erfunden", raum: "t-raum-e", rolle: "leitung" });
    const liste = await A.mitgliedschaftenDesRaums(s, "t-raum-e");
    expect(liste.length).toBe(1);
    expect(JSON.stringify(liste)).not.toContain("a_frei_erfunden");
  });
});

describe("Der Inhalt eines Datensatzes ist an seinen Schlüssel gebunden", () => {
  it("verwirft eine Mitgliedschaft, die eine fremde Kennung nennt", async () => {
    const s = laden();
    const a = await mitAccount(s, "inhalt-a@example.org");
    const b = await mitAccount(s, "inhalt-b@example.org");
    const echt = await mitglied(s, a.id, "t-raum-x", { rolle: "leitung", person: "p17" });
    /* Unter dem Schlüssel von A liegt jetzt ein Datensatz, der B nennt.
       Ohne die Inhaltsprüfung bekäme A eine Berechtigung mit fremder
       Kennung — und jede spätere Schicht, die dem Feld glaubt, arbeitete
       für den falschen Menschen. */
    await s.setJSON(A.mitgliedSchluessel(a.id, "t-raum-x"), { ...echt, accountId: b.id });
    expect(await A.mitgliedschaftLesen(s, a.id, "t-raum-x")).toBe(null);
    /* B bekommt sie über seinen eigenen Schlüssel auch nicht. */
    expect(await A.mitgliedschaftLesen(s, b.id, "t-raum-x")).toBe(null);
  });

  it("verwirft eine Mitgliedschaft, die einen fremden Raum nennt", async () => {
    const s = laden();
    const a = await mitAccount(s, "inhalt-r@example.org");
    const echt = await mitglied(s, a.id, "t-raum-x", { rolle: "leitung" });
    await s.setJSON(A.mitgliedSchluessel(a.id, "t-raum-x"), { ...echt, raum: "t-raum-y" });
    expect(await A.mitgliedschaftLesen(s, a.id, "t-raum-x")).toBe(null);
    /* Der erfundene Raum entsteht dadurch auch nicht. */
    expect(await A.mitgliedschaftLesen(s, a.id, "t-raum-y")).toBe(null);
  });

  it("filtert einen untergeschobenen Datensatz aus der Accountliste", async () => {
    const s = laden();
    const a = await mitAccount(s, "liste-a@example.org");
    const b = await mitAccount(s, "liste-b@example.org");
    await mitglied(s, a.id, "t-echt-x", { rolle: "mitarbeiter" });
    /* Unter dem Präfix von A, aber mit der Kennung von B: Die Liste liest
       jeden Datensatz selbst und prüft ihn erneut — der Schlüssel allein
       genügt nicht. */
    await s.setJSON(A.mitgliedSchluessel(a.id, "t-untergeschoben"),
      { accountId: b.id, raum: "t-untergeschoben", betrieb: 0, mandantId: "m1",
        rolle: "leitung", status: "aktiv" });
    const meine = await A.mitgliedschaftenDesAccounts(s, a.id);
    expect(meine.map((m) => m.raum)).toEqual(["t-echt-x"]);
    expect(JSON.stringify(meine)).not.toContain("t-untergeschoben");
  });

  it("verwirft einen Zustandswechsel auf einem verfälschten Datensatz", async () => {
    const s = laden();
    const a = await mitAccount(s, "wechsel@example.org");
    const b = await mitAccount(s, "wechsel-b@example.org");
    const echt = await mitglied(s, a.id, "t-raum-w", { status: "eingeladen" });
    await s.setJSON(A.mitgliedSchluessel(a.id, "t-raum-w"), { ...echt, accountId: b.id });
    /* Kein Zustandswechsel auf einem Datensatz, der nicht zu seinem
       Schlüssel passt — sonst wäre die Aktivierung der Weg zurück. */
    const e = await A.mitgliedschaftAktivieren(s, a.id, "t-raum-w");
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("unbekannt");
  });
});

/* ==========================================================================
   DEMORÄUME UND BETREIBER
   ========================================================================== */

describe("Demoräume bleiben ohne persönliche Accounts", () => {
  it("weist jede Schreibweise ab und lässt nichts zurück", async () => {
    const s = laden();
    const a = await mitAccount(s, "demo@example.org");
    for (const raum of ["demo-schau", "demo-test", "DEMO-TEST", "Demo-Test",
      "dEmO-schau", "demo-x"]) {
      const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum,
        mandantId: "m1", rolle: "mitarbeiter" });
      expect(e.ok, raum).toBe(false);
      expect(e.grund, raum).toBe("demoraum");
      expect(A.raumErlaubt(raum), raum).toBe(false);
      /* Und es liegt hinterher kein halber Datensatz da. */
      const roh = await s.get(A.mitgliedSchluessel(a.id, raum), { type: "json" })
        .catch(() => null);
      expect(roh, raum).toBe(null);
    }
    /* Ein echter Raum, der das Wort zufällig enthält, bleibt erlaubt: Die
       Sperre gilt dem Präfix `demo-`, nicht dem Wort. */
    expect(A.raumErlaubt("t-demoskopie")).toBe(true);
  });
});

describe("Der Betreiberzugang bleibt ein eigener Weg", () => {
  it("nimmt betreiber als Mitgliedschaftsrolle nicht an", async () => {
    const s = laden();
    const a = await mitAccount(s, "betreiber@example.org");
    for (const rolle of ["betreiber", "Betreiber", "BETREIBER", "verwalter", "admin"]) {
      const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-raum-bt",
        mandantId: "m1", rolle });
      expect(e.ok, rolle).toBe(false);
      expect(e.grund, rolle).toBe("rolle");
    }
    /* Die erlaubte Liste stammt aus RANG und lässt den Betreiber weg. */
    expect(A.MITGLIED_ROLLEN).not.toContain("betreiber");
    expect([...A.MITGLIED_ROLLEN].sort()).toEqual(
      ["betriebsrat", "leitung", "mitarbeiter", "planer", "subplaner"]);
  });

  it("bietet überhaupt keinen Weg, eine Rolle nachträglich zu heben", async () => {
    const s = laden();
    const a = await mitAccount(s, "nachtraeglich@example.org");
    await mitglied(s, a.id, "t-raum-nt", { rolle: "leitung" });
    /* Eine Rolle ändert sich, indem eine Mitgliedschaft entzogen und eine
       neue ausgesprochen wird. Es gibt keine Funktion, die einen Rang
       beiläufig hebt — auch nicht für die Leitung selbst. */
    const namen = Object.keys(A).join(" ").toLowerCase();
    for (const v of ["rolleaendern", "rollesetzen", "mitgliedschaftaendern",
      "rollehochsetzen"]) {
      expect(namen.includes(v), v).toBe(false);
    }
    expect((await A.mitgliedschaftLesen(s, a.id, "t-raum-nt")).rolle).toBe("leitung");
  });
});

/* ==========================================================================
   ENTZUG UND SPERRE
   ========================================================================== */

describe("Ein Entzug wirkt nur dort, wo er ausgesprochen wurde", () => {
  it("lässt den Grabstein stehen und den zweiten Raum unberührt", async () => {
    const s = laden();
    const a = await mitAccount(s, "entzug@example.org");
    await mitglied(s, a.id, "t-ent-x", { rolle: "leitung", person: "p17" });
    await mitglied(s, a.id, "t-ent-y", { rolle: "mitarbeiter", person: "p83" });
    const kontoVorher = JSON.stringify(await A.accountLesenPerId(s, a.id));

    expect((await A.mitgliedschaftEntziehen(s, a.id, "t-ent-x")).ok).toBe(true);

    const x = await A.mitgliedschaftLesen(s, a.id, "t-ent-x");
    expect(x).not.toBe(null);
    expect(x.status).toBe("entzogen");
    expect(x.entzogenAm).toBeTruthy();
    expect([x.rolle, x.person]).toEqual(["leitung", "p17"]);

    const y = await A.mitgliedschaftLesen(s, a.id, "t-ent-y");
    expect([y.status, y.rolle, y.person]).toEqual(["aktiv", "mitarbeiter", "p83"]);

    /* Der Account bleibt, was er war. */
    expect(JSON.stringify(await A.accountLesenPerId(s, a.id))).toBe(kontoVorher);

    /* In der Liste der aktiven Arbeitsbereiche ist X verschwunden, im
       Bestand nicht. */
    const aktive = await A.mitgliedschaftenDesAccounts(s, a.id, { nurAktive: true });
    expect(aktive.map((m) => m.raum)).toEqual(["t-ent-y"]);
    expect((await A.mitgliedschaftenDesAccounts(s, a.id)).map((m) => m.raum))
      .toEqual(["t-ent-x", "t-ent-y"]);
    /* Auch der Raum zeigt sie nur, wenn man ausdrücklich alle sehen will. */
    expect((await A.mitgliedschaftenDesRaums(s, "t-ent-x", { nurAktive: true })).length).toBe(0);
    expect((await A.mitgliedschaftenDesRaums(s, "t-ent-x")).length).toBe(1);
  });
});

describe("Eine Sperre trifft die Identität, nicht den Betrieb", () => {
  it("lässt Mitgliedschaften, Rollen und Personen unangetastet", async () => {
    const s = laden();
    const a = await mitAccount(s, "sperre@example.org");
    await mitglied(s, a.id, "t-sp-x", { rolle: "leitung", person: "p17", einheit: "e1" });
    await mitglied(s, a.id, "t-sp-y", { rolle: "mitarbeiter", person: "p83" });
    const vorher = (await A.mitgliedschaftenDesAccounts(s, a.id)).map((m) => JSON.stringify(m));

    const e = await A.accountSperren(s, a.id);
    expect(e.ok).toBe(true);
    expect(e.account.status).toBe("gesperrt");

    const nachher = (await A.mitgliedschaftenDesAccounts(s, a.id)).map((m) => JSON.stringify(m));
    expect(nachher).toEqual(vorher);
    /* Beide Mitgliedschaften liegen noch da, mit Rolle und Person: Eine
       Sperre ist kein Austritt, und die Nachvollziehbarkeit bleibt. Was
       eine Sperre für laufende Sitzungen bedeutet, entscheidet später die
       Anmeldung — nicht der Speicher. */
    expect((await A.mitgliedschaftLesen(s, a.id, "t-sp-x")).rolle).toBe("leitung");
    expect((await A.mitgliedschaftLesen(s, a.id, "t-sp-y")).status).toBe("aktiv");
    expect((await A.mitgliedschaftenDesRaums(s, "t-sp-x")).length).toBe(1);
  });
});

/* ==========================================================================
   PASSWORT UND TOKENZÄHLER GEHÖREN DEM ACCOUNT
   ========================================================================== */

describe("Passwort und Zähler bleiben beim Account", () => {
  it("schreibt ein Passwort nur in den Account und lässt Mitgliedschaften stehen", async () => {
    const s = laden();
    const a = await mitAccount(s, "pw@example.org");
    await mitglied(s, a.id, "t-pw-x", { rolle: "leitung", person: "p17" });
    const vorher = JSON.stringify(await A.mitgliedschaftLesen(s, a.id, "t-pw-x"));

    const e = await A.passwortSetzen(s, a.id, PW);
    expect(e.ok).toBe(true);
    expect(e.account.passwort).toBe(PW);
    expect(e.account.epoche).toBe(2);
    expect(e.account.status).toBe("aktiv");

    expect(JSON.stringify(await A.mitgliedschaftLesen(s, a.id, "t-pw-x"))).toBe(vorher);
    /* In der Ablage der Mitgliedschaft steht kein Prüfwert, im Raumindex
       auch nicht. */
    const roh = await s.get(A.mitgliedSchluessel(a.id, "t-pw-x"), { type: "json" });
    expect(JSON.stringify(roh)).not.toContain("s1$");
    const z = await s.get(A.raummitgliedSchluessel("t-pw-x", a.id), { type: "json" });
    expect(JSON.stringify(z)).not.toContain("s1$");
  });

  it("erhöht einen Token-Zweck, ohne die anderen anzufassen", async () => {
    const s = laden();
    const a = await mitAccount(s, "zaehler@example.org");
    await mitglied(s, a.id, "t-tk-x");
    expect((await A.tokenNrErhoehen(s, a.id, "verifizierung")).nr).toBe(1);
    expect((await A.accountLesenPerId(s, a.id)).tokenNr)
      .toEqual({ einladung: 0, verifizierung: 1, zuruecksetzen: 0 });
    /* Zweiter Zweck: Eine neue Einladung darf einen laufenden
       Rücksetzvorgang nicht abschneiden — und umgekehrt. */
    await A.tokenNrErhoehen(s, a.id, "zuruecksetzen");
    await A.tokenNrErhoehen(s, a.id, "einladung");
    expect((await A.accountLesenPerId(s, a.id)).tokenNr)
      .toEqual({ einladung: 1, verifizierung: 1, zuruecksetzen: 1 });
    /* Die Zähler stehen im Account, nicht in der Mitgliedschaft. */
    const m = await A.mitgliedschaftLesen(s, a.id, "t-tk-x");
    expect(Object.prototype.hasOwnProperty.call(m, "tokenNr")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(m, "epoche")).toBe(false);
  });
});

/* ==========================================================================
   NAMENSRÄUME UND FREMDE MODULE
   ========================================================================== */

describe("Alte Zugangscodes und neue Accounts teilen keinen Namensraum", () => {
  it("trennt konto: von account: und kontoId:", async () => {
    const s = laden();
    const a = await mitAccount(s, "namensraum@example.org");
    await mitglied(s, a.id, "t-ns-x");
    const accountKey = A.accountSchluessel("namensraum@example.org");
    const idKey = A.kontoIdSchluessel(a.id);
    expect(accountKey.startsWith("account:")).toBe(true);
    expect(idKey.startsWith("kontoId:")).toBe(true);
    /* Der alte Zugang wird mit `konto:` gesucht (konten.mjs, aufraeumen.mjs,
       raumloeschung.mjs). Kein neuer Schlüssel beginnt damit — der
       Doppelpunkt trennt `konto:` von `kontoId:`. */
    for (const k of [accountKey, idKey, A.mitgliedSchluessel(a.id, "t-ns-x"),
      A.raummitgliedSchluessel("t-ns-x", a.id)]) {
      expect(k.startsWith("konto:"), k).toBe(false);
    }
    /* Und umgekehrt: Ein Lauf über `konto:` findet nichts Neues. */
    expect((await s.list({ prefix: "konto:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(1);
    expect((await s.list({ prefix: "kontoId:" })).blobs.length).toBe(1);
  });

  it("sucht nirgends mit einem Präfix, das beide Namensräume träfe", async () => {
    /* `prefix: "konto"` ohne Doppelpunkt würde auch `kontoId:` einsammeln
       und die Kennungszeiger für Zugangscodes halten — der Löschlauf würde
       sie mitnehmen. Das darf in keinem Modul stehen. */
    for (const d of ["konten.mjs", "aufraeumen.mjs", "raumloeschung.mjs", "accounts.mjs"]) {
      const text = await readFile(new URL(`../server/lib/${d}`, import.meta.url), "utf8");
      expect(text, d).not.toMatch(/prefix:\s*["'`]konto["'`]/);
      expect(text, d).not.toMatch(/startsWith\(\s*["'`]konto["'`]\s*\)/);
    }
  });
});

describe("Der Demoweg weiß noch nichts von Accounts", () => {
  it("erzeugt in daten.mjs keinen Account", async () => {
    const text = await readFile(new URL("../server/funktionen/daten.mjs", import.meta.url),
      "utf8");
    expect(text).not.toContain("accounts.mjs");
    expect(text).not.toContain("account:");
    expect(text).not.toContain("mitgliedschaft");
  });

  it("wird von keinem Produktionsmodul eingebunden", async () => {
    /* Phase 2.2 und 2.3 verändern kein Benutzerverhalten. Sobald das nicht
       mehr stimmt, soll diese Prüfung es sagen — und nicht ein Kunde. */
    for (const d of ["../server.mjs", "../server/funktionen/daten.mjs",
      "../server/lib/rechte.mjs", "../server/lib/sitzungen.mjs",
      "../server/lib/konten.mjs", "../server/lib/raumloeschung.mjs",
      "../server/lib/aufraeumen.mjs"]) {
      const text = await readFile(new URL(d, import.meta.url), "utf8");
      expect(text, d).not.toContain("accounts.mjs");
    }
  });
});
