/* ==========================================================================
   DIE GENERATION EINER ACCOUNT-RAUM-BEZIEHUNG

   Eine Mitgliedschaft kann entzogen und später neu ausgesprochen werden.
   Damit etwas, das aus der alten entstanden ist, nicht zur neuen passt,
   trägt die Beziehung eine Laufnummer:

     mitgliedlauf:<accountId>:<raum>   { accountId, raum, generation }

   Hochgezählt wird beim ENTZUG. Der Grabstein behält seine alte Zahl, der
   Lauf steht schon eine weiter — damit ist der Entzug selbst der
   Widerrufspunkt, ohne zweiten Vermerk.

   Diese Prüfung hält den Lebenszyklus fest, die Reihenfolge bei Teilfehlern
   und das, was NICHT passieren darf: dass eine Generation zurückgeht, dass
   zwei Beziehungen sich einen Lauf teilen, dass ein Aufrufer eine Generation
   behauptet, oder dass der Altbestand stillschweigend eine bekommt.

   Noch NICHT Gegenstand dieses Schritts: die Bindung der Arbeitssitzung.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore, A, P;

const LIMIT = 30000;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-generation-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  A = await import("../server/lib/accounts.mjs");
  P = await import("../server/lib/passwoerter.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });

let zaehler = 0;
const adresse = (was) => `${was}-${++zaehler}@example.org`;
const raumName = (was) => `t-gen-${was}-${++zaehler}`;

/** Ein Account, mehr braucht es hier nicht. */
async function konto(email) {
  const e = await A.accountAnlegen(laden(), { email });
  expect(e.ok, JSON.stringify(e)).toBe(true);
  return e.account;
}

/** Eine Mitgliedschaft, mit allem Nötigen und sonst nichts. */
const anlegen = (accountId, raum, extra = {}) =>
  A.mitgliedschaftAnlegen(laden(), { accountId, raum, betrieb: 0, mandantId: "m1",
    person: "p_1", rolle: "mitarbeiter", ...extra });

/** Die aktuelle Generation der Beziehung. */
const lauf = (accountId, raum) => A.mitgliedlaufLesen(laden(), accountId, raum);

/** Ein Ablagewrapper, dessen Schreibvorgang für bestimmte Schlüssel scheitert. */
const sperrig = (mustert) => {
  const echt = laden();
  return {
    get: (...a) => echt.get(...a),
    list: (...a) => echt.list(...a),
    delete: (...a) => echt.delete(...a),
    getWithMetadata: (...a) => echt.getWithMetadata(...a),
    setJSON: async (schluessel, wert) => {
      if (mustert.test(String(schluessel))) throw new Error("Platte voll");
      return echt.setJSON(schluessel, wert);
    },
  };
};

/* ==========================================================================
   DER LEBENSZYKLUS
   ========================================================================== */

describe("Der Lebenszyklus der Generation", () => {
  it("beginnt bei der ersten Mitgliedschaft mit 1", async () => {
    const k = await konto(adresse("erste"));
    const raum = raumName("erste");
    /* Vorher gibt es keinen Lauf — und niemand behauptet einen. */
    const vorher = await lauf(k.id, raum);
    expect(vorher.ok).toBe(false);
    if (!vorher.ok) expect(vorher.grund).toBe("fehlt");

    const e = await anlegen(k.id, raum);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.mitgliedschaft.generation).toBe(1);
    const nachher = await lauf(k.id, raum);
    expect(nachher).toEqual({ ok: true, generation: 1 });
    expect(A.generationStimmt(e.mitgliedschaft, 1)).toBe(true);
  }, LIMIT);

  it("bleibt beim Aktivieren unverändert", async () => {
    const k = await konto(adresse("aktiv"));
    const raum = raumName("aktiv");
    await anlegen(k.id, raum);
    const e = await A.mitgliedschaftAktivieren(laden(), k.id, raum);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.mitgliedschaft.status).toBe("aktiv");
    expect(e.mitgliedschaft.generation).toBe(1);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 1 });
  }, LIMIT);

  it("zählt beim Entzug weiter und lässt den Grabstein zurück", async () => {
    const k = await konto(adresse("entzug"));
    const raum = raumName("entzug");
    await anlegen(k.id, raum, { status: "aktiv" });
    const e = await A.mitgliedschaftEntziehen(laden(), k.id, raum);
    expect(e.ok).toBe(true);
    if (!e.ok) return;

    /* Der Grabstein behält seine alte Generation … */
    expect(e.mitgliedschaft.status).toBe("entzogen");
    expect(e.mitgliedschaft.generation).toBe(1);
    /* … und der Lauf steht schon eine weiter. */
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 2 });
    /* Damit passt die alte Generation sofort nicht mehr. */
    expect(A.generationStimmt(e.mitgliedschaft, 2)).toBe(false);
  }, LIMIT);

  it("gibt einer späteren neuen Mitgliedschaft die nächste Generation", async () => {
    const k = await konto(adresse("wieder"));
    const raum = raumName("wieder");
    const erste = await anlegen(k.id, raum, { status: "aktiv" });
    await A.mitgliedschaftEntziehen(laden(), k.id, raum);
    /* Der Grabstein steht im Weg — eine Wiederaufnahme ist ein eigener
       Vorgang und beginnt damit, ihn zu entfernen. */
    expect((await anlegen(k.id, raum)).ok).toBe(false);
    await laden().delete(A.mitgliedSchluessel(k.id, raum));

    const zweite = await anlegen(k.id, raum, { status: "aktiv" });
    expect(zweite.ok).toBe(true);
    if (!zweite.ok || !erste.ok) return;
    expect(zweite.mitgliedschaft.generation).toBe(2);
    /* Und die alte Generation ist nicht wieder aktuell geworden. */
    expect(A.generationStimmt(erste.mitgliedschaft, 2)).toBe(false);
    expect(A.generationStimmt(zweite.mitgliedschaft, 2)).toBe(true);

    /* Zweiter Entzug: 2 → 3. */
    await A.mitgliedschaftEntziehen(laden(), k.id, raum);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 3 });
  }, LIMIT);

  it("lässt die Generation niemals zurückgehen", async () => {
    const k = await konto(adresse("monoton"));
    const raum = raumName("monoton");
    const gesehen = [];
    for (let i = 0; i < 3; i++) {
      const e = await anlegen(k.id, raum, { status: "aktiv" });
      expect(e.ok, `Runde ${i}`).toBe(true);
      if (e.ok) gesehen.push(e.mitgliedschaft.generation);
      await A.mitgliedschaftEntziehen(laden(), k.id, raum);
      await laden().delete(A.mitgliedSchluessel(k.id, raum));
    }
    expect(gesehen).toEqual([1, 2, 3]);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 4 });
  }, LIMIT);
});

/* ==========================================================================
   JEDE BEZIEHUNG FÜR SICH
   ========================================================================== */

describe("Jede Beziehung hat ihren eigenen Lauf", () => {
  it("hält zwei Räume desselben Accounts auseinander", async () => {
    const k = await konto(adresse("zweiraeume"));
    const alpha = raumName("zwei-alpha");
    const beta = raumName("zwei-beta");
    await anlegen(k.id, alpha, { status: "aktiv" });
    await anlegen(k.id, beta, { status: "aktiv" });
    await A.mitgliedschaftEntziehen(laden(), k.id, alpha);

    expect(await lauf(k.id, alpha)).toEqual({ ok: true, generation: 2 });
    expect(await lauf(k.id, beta)).toEqual({ ok: true, generation: 1 });
    const beide = await A.mitgliedschaftenDesAccounts(laden(), k.id, { nurAktive: true });
    const nochDa = beide.find((m) => m.raum === beta);
    expect(A.generationStimmt(nochDa, 1)).toBe(true);
  }, LIMIT);

  it("hält zwei Accounts im selben Raum auseinander", async () => {
    const a = await konto(adresse("zweikonten-a"));
    const b = await konto(adresse("zweikonten-b"));
    const raum = raumName("zweikonten");
    await anlegen(a.id, raum, { status: "aktiv" });
    await anlegen(b.id, raum, { status: "aktiv" });
    await A.mitgliedschaftEntziehen(laden(), a.id, raum);

    expect(await lauf(a.id, raum)).toEqual({ ok: true, generation: 2 });
    expect(await lauf(b.id, raum)).toEqual({ ok: true, generation: 1 });
    /* Der Entzug des einen hat den anderen nicht berührt. */
    const mB = await A.mitgliedschaftLesen(laden(), b.id, raum);
    expect(mB.status).toBe("aktiv");
    expect(A.generationStimmt(mB, 1)).toBe(true);
  }, LIMIT);

  it("bindet den Laufdatensatz an seine Beziehung", async () => {
    /* Auf Windows und macOS unterscheidet die Dateiablage keine Groß- und
       Kleinschreibung; erst der Inhalt bindet. */
    const k = await konto(adresse("bindung"));
    const raum = raumName("bindung");
    await anlegen(k.id, raum);
    await laden().setJSON(A.mitgliedlaufSchluessel(k.id, raum),
      { accountId: "a_fremd", raum, generation: 7 });
    const e = await lauf(k.id, raum);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("fremd");
  }, LIMIT);
});

/* ==========================================================================
   WAS DIE GENERATION NICHT ZURÜCKSETZT
   ========================================================================== */

describe("Was den Lauf nicht zurücksetzt", () => {
  it("überlebt das Löschen des Mitgliedschaftsdatensatzes", async () => {
    const k = await konto(adresse("loeschen"));
    const raum = raumName("loeschen");
    await anlegen(k.id, raum, { status: "aktiv" });
    await A.mitgliedschaftEntziehen(laden(), k.id, raum);
    await laden().delete(A.mitgliedSchluessel(k.id, raum));
    await laden().delete(A.raummitgliedSchluessel(raum, k.id));

    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 2 });
    const neu = await anlegen(k.id, raum);
    expect(neu.ok).toBe(true);
    if (neu.ok) expect(neu.mitgliedschaft.generation).toBe(2);
  }, LIMIT);

  it("überlebt eine vollständige Raumlöschung", async () => {
    /* Raumkennungen sind wiederverwendbar: Nach der Löschung ist der Name
       frei, und ein Betrieb darf ihn erneut bekommen. Deshalb bleibt der
       Anker liegen — sonst begänne dieselbe Beziehung wieder bei 1. Die
       Sitzungen des Raums werden bei der Löschung ohnehin mitgenommen
       (raumloeschung.mjs). */
    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    const k = await konto(adresse("raumweg"));
    const raum = raumName("raumweg");
    await anlegen(k.id, raum, { status: "aktiv" });
    await A.mitgliedschaftEntziehen(laden(), k.id, raum);

    const sitzungen = getStore({ name: "centric-sitzungen", consistency: "strong" });
    const e = await raumLoeschen(laden(), sitzungen, raum, { durch: "Pruefung" });
    expect(e && typeof e === "object").toBe(true);

    /* Mitgliedschaft und Zeiger sind weg … */
    expect(await laden().get(A.mitgliedSchluessel(k.id, raum), { type: "json" })).toBe(null);
    /* … der Anker nicht. */
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 2 });
    const neu = await anlegen(k.id, raum);
    expect(neu.ok).toBe(true);
    if (neu.ok) expect(neu.mitgliedschaft.generation).toBe(2);
  }, LIMIT);

  it("wird von keiner Produktionsstelle gelöscht", async () => {
    /* Der Anker ist der einzige Zeuge dafür, wie oft eine Beziehung schon
       begonnen hat. Wer ihn löscht, setzt Generationen zurück. */
    for (const d of ["../server/lib/raumloeschung.mjs", "../server/lib/aufraeumen.mjs",
      "../server/lib/accounts.mjs", "../server/lib/provisionierung.mjs",
      "../server/funktionen/daten.mjs", "../server/funktionen/anmeldung.mjs"]) {
      const text = await readFile(new URL(d, import.meta.url), "utf8");
      expect(text.includes("mitgliedlauf"), d)
        .toBe(d.endsWith("accounts.mjs"));
      if (d.endsWith("accounts.mjs")) continue;
      expect(text, d).not.toMatch(/delete\([^)]*mitgliedlauf/);
    }
    /* Und kein Lauf über „mitglied" ohne Doppelpunkt: Der träfe beide
       Namensräume — derselbe Fehler, den es bei „konto" schon gab. */
    for (const d of ["raumloeschung.mjs", "aufraeumen.mjs", "accounts.mjs"]) {
      const text = await readFile(new URL(`../server/lib/${d}`, import.meta.url), "utf8");
      expect(text, d).not.toMatch(/prefix:\s*["'`]mitglied["'`]/);
      expect(text, d).not.toMatch(/startsWith\(\s*["'`]mitglied["'`]\s*\)/);
    }
  }, LIMIT);

  it("lässt einen Grabstein die Generation nicht überschreiben", async () => {
    const k = await konto(adresse("grabstein"));
    const raum = raumName("grabstein");
    await anlegen(k.id, raum, { status: "aktiv" });
    await A.mitgliedschaftEntziehen(laden(), k.id, raum);
    /* Ein zweiter Entzugsversuch tut nichts — und zählt nicht weiter. */
    const nochmal = await A.mitgliedschaftEntziehen(laden(), k.id, raum);
    expect(nochmal.ok).toBe(true);
    if (nochmal.ok) expect(nochmal.unveraendert).toBe(true);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 2 });
    /* Und eine Aktivierung des Grabsteins gibt es nicht. */
    const zurueck = await A.mitgliedschaftAktivieren(laden(), k.id, raum);
    expect(zurueck.ok).toBe(false);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 2 });
  }, LIMIT);
});

/* ==========================================================================
   FAIL CLOSED
   ========================================================================== */

describe("Fehler schließen die Tür", () => {
  it("weist einen unbrauchbaren Laufdatensatz ab, statt ihn zu ersetzen", async () => {
    const k = await konto(adresse("kaputt"));
    const raum = raumName("kaputt");
    await anlegen(k.id, raum, { status: "aktiv" });
    for (const unsinn of [{ accountId: k.id, raum, generation: 0 },
      { accountId: k.id, raum, generation: -3 },
      { accountId: k.id, raum, generation: 1.5 },
      { accountId: k.id, raum, generation: "zwei" },
      { accountId: k.id, raum }]) {
      await laden().setJSON(A.mitgliedlaufSchluessel(k.id, raum), unsinn);
      const e = await lauf(k.id, raum);
      expect(e.ok, JSON.stringify(unsinn)).toBe(false);
      if (!e.ok) expect(e.grund).toBe("kaputt");
      /* Nichts stimmt dazu — auch nicht 1. */
      const m = await A.mitgliedschaftLesen(laden(), k.id, raum);
      expect(A.generationStimmt(m, /** @type {any} */ (unsinn.generation))).toBe(false);
      /* Und ein Entzug wirft, statt den Anker zu überschreiben. */
      await expect(A.mitgliedschaftEntziehen(laden(), k.id, raum)).rejects.toThrow();
      expect(await laden().get(A.mitgliedlaufSchluessel(k.id, raum), { type: "json" }))
        .toEqual(unsinn);
      const nach = await A.mitgliedschaftLesen(laden(), k.id, raum);
      expect(nach.status).toBe("aktiv");
    }
  }, LIMIT);

  it("legt ohne lesbaren Lauf keine Mitgliedschaft an", async () => {
    const k = await konto(adresse("kaputt-anlegen"));
    const raum = raumName("kaputt-anlegen");
    await laden().setJSON(A.mitgliedlaufSchluessel(k.id, raum),
      { accountId: k.id, raum, generation: "unsinn" });
    await expect(anlegen(k.id, raum)).rejects.toThrow();
    expect(await laden().get(A.mitgliedSchluessel(k.id, raum), { type: "json" })).toBe(null);
  }, LIMIT);

  it("sagt ohne Generation am Datensatz nein", async () => {
    /* Der Altbestand: Mitgliedschaften aus der Zeit vor dieser Änderung. */
    const k = await konto(adresse("alt"));
    const raum = raumName("alt");
    const e = await anlegen(k.id, raum, { status: "aktiv" });
    if (!e.ok) return;
    const ohne = { ...e.mitgliedschaft };
    delete ohne.generation;
    await laden().setJSON(A.mitgliedSchluessel(k.id, raum), ohne);

    const m = await A.mitgliedschaftLesen(laden(), k.id, raum);
    expect(m.generation).toBe(undefined);
    expect(A.generationStimmt(m, 1)).toBe(false);
    /* Auch nicht mit irgendeiner anderen Zahl. */
    for (const n of [0, 1, 2, null, undefined, "1"]) {
      expect(A.generationStimmt(m, /** @type {any} */ (n))).toBe(false);
    }
  }, LIMIT);

  it("nennt eine falsche Generation nie als stimmig", async () => {
    const m = { generation: 2 };
    expect(A.generationStimmt(m, 2)).toBe(true);
    for (const n of [1, 3, 0, -2, 2.5, "2", null, undefined, {}]) {
      expect(A.generationStimmt(m, /** @type {any} */ (n)), String(n)).toBe(false);
    }
    expect(A.generationStimmt(null, 1)).toBe(false);
    expect(A.generationStimmt({}, 1)).toBe(false);
    expect(A.generationStimmt({ generation: 0 }, 0)).toBe(false);
  }, LIMIT);

  it("lässt bei einem Teilfehler keine alte Generation gültig", async () => {
    /* Der kritische Fall: Der Lauf ist schon weiter, das Schreiben des
       Status scheitert. Danach steht eine Mitgliedschaft mit „aktiv" da,
       deren Generation nicht mehr die aktuelle ist — unbrauchbar, und genau
       das ist die gewollte Richtung. */
    const k = await konto(adresse("teilfehler"));
    const raum = raumName("teilfehler");
    const e = await anlegen(k.id, raum, { status: "aktiv" });
    if (!e.ok) return;

    await expect(A.mitgliedschaftEntziehen(/** @type {any} */ (sperrig(/^mitglied:/)),
      k.id, raum)).rejects.toThrow();

    const m = await A.mitgliedschaftLesen(laden(), k.id, raum);
    expect(m.status).toBe("aktiv");
    expect(m.generation).toBe(1);
    const jetzt = await lauf(k.id, raum);
    expect(jetzt).toEqual({ ok: true, generation: 2 });
    /* Die Mitgliedschaft öffnet damit nichts mehr. */
    expect(A.generationStimmt(m, jetzt.ok ? jetzt.generation : 0)).toBe(false);
  }, LIMIT);

  it("lässt einen gescheiterten Laufschritt den Entzug scheitern", async () => {
    /* Die andere Reihenfolge: Scheitert schon das Weiterzählen, darf der
       Status nicht auf „entzogen" springen — sonst wäre eine später neu
       ausgesprochene Mitgliedschaft wieder Generation 1. */
    const k = await konto(adresse("laufFehler"));
    const raum = raumName("laufFehler");
    await anlegen(k.id, raum, { status: "aktiv" });

    await expect(A.mitgliedschaftEntziehen(
      /** @type {any} */ (sperrig(/^mitgliedlauf:/)), k.id, raum)).rejects.toThrow();

    const m = await A.mitgliedschaftLesen(laden(), k.id, raum);
    expect(m.status).toBe("aktiv");
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 1 });
    /* Der Entzug ist sichtbar nicht geschehen und lässt sich wiederholen. */
    const zweiter = await A.mitgliedschaftEntziehen(laden(), k.id, raum);
    expect(zweiter.ok).toBe(true);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 2 });
  }, LIMIT);
});

/* ==========================================================================
   NIEMAND BEHAUPTET EINE GENERATION
   ========================================================================== */

describe("Die Generation kommt nie von außen", () => {
  it("ignoriert eine mitgeschickte Generation beim Anlegen", async () => {
    const k = await konto(adresse("behauptet"));
    const raum = raumName("behauptet");
    const e = await A.mitgliedschaftAnlegen(laden(), /** @type {any} */ ({
      accountId: k.id, raum, betrieb: 0, mandantId: "m1", person: "p_1",
      rolle: "mitarbeiter", generation: 99, mitgliedlauf: 99, lauf: 99 }));
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.mitgliedschaft.generation).toBe(1);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 1 });
    /* Und die erfundenen Felder sind nicht im Datensatz gelandet. */
    expect(Object.keys(e.mitgliedschaft)).not.toContain("mitgliedlauf");
    expect(Object.keys(e.mitgliedschaft)).not.toContain("lauf");
  }, LIMIT);

  it("nimmt aus keiner Anfrage eine Generation an", async () => {
    /* Kein Endpunkt reicht eine Generation weiter — geprüft am Quelltext
       aller Funktionen, die überhaupt Anfragen annehmen. */
    for (const d of ["anmeldung.mjs", "daten.mjs", "registrierung.mjs",
      "starten.mjs", "einrichten.mjs", "kalender.mjs", "lage.mjs", "zustellung.mjs"]) {
      const text = await readFile(new URL(`../server/funktionen/${d}`, import.meta.url),
        "utf8");
      expect(text.includes("generation"), d).toBe(false);
      expect(text.includes("mitgliedlauf"), d).toBe(false);
    }
  }, LIMIT);

  it("hält die Generation aus Rolle und Recht heraus", async () => {
    /* Die Generation ist keine Berechtigung: Sie sagt nur, ob es noch
       dieselbe Beziehung ist. */
    const rechte = await readFile(new URL("../server/lib/rechte.mjs", import.meta.url),
      "utf8");
    expect(rechte.includes("generation")).toBe(false);
    const sitzungen = await readFile(new URL("../server/lib/sitzungen.mjs",
      import.meta.url), "utf8");
    expect(sitzungen.includes("generation")).toBe(false);
  }, LIMIT);
});

/* ==========================================================================
   NACHTRAGEN UND GLEICHZEITIGKEIT
   ========================================================================== */

describe("Nachtragen für den Altbestand", () => {
  /** Eine Mitgliedschaft ohne Generation, wie sie vor dieser Änderung entstand. */
  async function altbestand(accountId, raum, status = "aktiv") {
    const e = await anlegen(accountId, raum, { status });
    if (!e.ok) throw new Error("Anlage gescheitert");
    const ohne = { ...e.mitgliedschaft };
    delete ohne.generation;
    await laden().setJSON(A.mitgliedSchluessel(accountId, raum), ohne);
    await laden().delete(A.mitgliedlaufSchluessel(accountId, raum));
    return ohne;
  }

  it("trägt ausdrücklich nach und beginnt dabei bei 1", async () => {
    const k = await konto(adresse("nachtragen"));
    const raum = raumName("nachtragen");
    await altbestand(k.id, raum);
    expect((await lauf(k.id, raum)).ok).toBe(false);

    const e = await A.mitgliedschaftGenerationNachtragen(laden(), k.id, raum);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.mitgliedschaft.generation).toBe(1);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 1 });
    expect(A.generationStimmt(e.mitgliedschaft, 1)).toBe(true);
  }, LIMIT);

  it("ändert beim zweiten Mal nichts", async () => {
    const k = await konto(adresse("nachtragen-zwei"));
    const raum = raumName("nachtragen-zwei");
    await altbestand(k.id, raum);
    await A.mitgliedschaftGenerationNachtragen(laden(), k.id, raum);
    const zweite = await A.mitgliedschaftGenerationNachtragen(laden(), k.id, raum);
    expect(zweite.ok).toBe(true);
    if (zweite.ok) {
      expect(zweite.unveraendert).toBe(true);
      expect(zweite.mitgliedschaft.generation).toBe(1);
    }
  }, LIMIT);

  it("erzeugt bei gleichzeitigen Aufrufen genau einen Wert", async () => {
    const k = await konto(adresse("nachtragen-parallel"));
    const raum = raumName("nachtragen-parallel");
    await altbestand(k.id, raum);
    const alle = await Promise.all(Array.from({ length: 8 },
      () => A.mitgliedschaftGenerationNachtragen(laden(), k.id, raum)));
    const werte = new Set(alle.map((e) => (e.ok ? e.mitgliedschaft.generation : "fehler")));
    expect([...werte]).toEqual([1]);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 1 });
  }, LIMIT);

  it("trägt einem Grabstein nichts nach", async () => {
    const k = await konto(adresse("nachtragen-grab"));
    const raum = raumName("nachtragen-grab");
    await altbestand(k.id, raum, "aktiv");
    /* Entzug auf einem Altbestand: zählt den Lauf auf 1 → 2 hoch. */
    await A.mitgliedschaftEntziehen(laden(), k.id, raum);
    const e = await A.mitgliedschaftGenerationNachtragen(laden(), k.id, raum);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("entzogen");
  }, LIMIT);

  it("weist das Nachtragen für eine unbekannte Beziehung ab", async () => {
    const k = await konto(adresse("nachtragen-nichts"));
    const e = await A.mitgliedschaftGenerationNachtragen(laden(), k.id,
      raumName("nachtragen-nichts"));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("unbekannt");
  }, LIMIT);
});

describe("Gleichzeitigkeit", () => {
  it("zählt bei sechs gleichzeitigen Entzügen genau einen Schritt", async () => {
    /* Die Reihe je Beziehung macht aus gleichzeitigen Entzügen
       aufeinanderfolgende: Der erste entzieht, die übrigen sehen den
       Grabstein. Prozesslokal — bei mehreren Instanzen bräuchte es
       bedingtes Schreiben; das ist dokumentiert. */
    const k = await konto(adresse("parallel-entzug"));
    const raum = raumName("parallel-entzug");
    await anlegen(k.id, raum, { status: "aktiv" });
    const alle = await Promise.all(Array.from({ length: 6 },
      () => A.mitgliedschaftEntziehen(laden(), k.id, raum)));
    for (const e of alle) expect(e.ok).toBe(true);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 2 });
    const m = await A.mitgliedschaftLesen(laden(), k.id, raum);
    expect(m.status).toBe("entzogen");
    expect(m.generation).toBe(1);
  }, LIMIT);

  it("hält gleichzeitige Anlagen derselben Beziehung aus", async () => {
    const k = await konto(adresse("parallel-anlage"));
    const raum = raumName("parallel-anlage");
    const alle = await Promise.allSettled(Array.from({ length: 6 },
      () => anlegen(k.id, raum)));
    const gelungen = alle.filter((e) => e.status === "fulfilled" && e.value.ok);
    expect(gelungen.length).toBe(1);
    expect(await lauf(k.id, raum)).toEqual({ ok: true, generation: 1 });
    const m = await A.mitgliedschaftLesen(laden(), k.id, raum);
    expect(m.generation).toBe(1);
  }, LIMIT);
});
