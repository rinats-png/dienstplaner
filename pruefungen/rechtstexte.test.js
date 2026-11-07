/* ==========================================================================
   RECHTSTEXTE (Entwürfe in rechtliches/) — Abgleich mit dem Code

   Textprüfung, keine Rechtsprüfung. Die Entwürfe bleiben ENTWURF; offene
   Punkte stehen als [ZU_KLAEREN]. Geprüft wird nur, dass die Texte nichts
   behaupten, was der Code oder die Betriebsunterlagen widerlegen
   (docs/legal/TECHNISCHE-FOLGEAUFGABEN.md, T-01, T-02, T-03, T-05, T-07, T-16).
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLLEN_VERGEBBAR } from "../server/lib/rechte.mjs";
import { PUSH_DIENSTE } from "../server/lib/pushziel.mjs";

const WURZEL = fileURLToPath(new URL("..", import.meta.url));
const lies = (p) => readFileSync(join(WURZEL, p), "utf8");
const texte = Object.fromEntries(readdirSync(join(WURZEL, "rechtliches")).filter((n) => n.endsWith(".md"))
  .map((n) => [n, lies(`rechtliches/${n}`)]));
const avv = texte["auftragsverarbeitung.md"];
const anlage2 = avv.slice(avv.indexOf("# Anlage 2"));
const ZAHLWORT = { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10 };

describe("T-01: ODR", () => {
  it("kein Text verlinkt die eingestellte ODR-Plattform (nur der Quellennachweis rechtsquellen.md und die README nennen sie)", () => {
    for (const [name, t] of Object.entries(texte)) {
      if (name === "rechtsquellen.md" || name === "README.md") continue;
      expect(t, name).not.toContain("ec.europa.eu/consumers/odr");
    }
  });
});

describe("T-02: AVV Anlage 1", () => {
  it("die genannte Rollenzahl entspricht ROLLEN_VERGEBBAR", () => {
    const m = /mit (\p{L}+) vergebbaren Rollen/u.exec(avv);
    expect(m, "Satz „mit … vergebbaren Rollen“ fehlt").not.toBeNull();
    expect(ZAHLWORT[m[1]]).toBe(ROLLEN_VERGEBBAR.length);
    expect(avv).not.toMatch(/acht Rollen/);
  });

  it("der Zweite-Faktor-Satz nennt Betreiber und Verwalter und schließt Kundenzugänge ausdrücklich aus", () => {
    const zeile = avv.split("\n").find((z) => z.includes("Zweiter Faktor (TOTP)"));
    expect(zeile).toBeTruthy();
    expect(zeile).toMatch(/Betreiberzugänge/);
    expect(zeile).toMatch(/Verwalterschlüssel/);
    expect(zeile).toMatch(/Zugänge der Kunden[\s\S]*keinen zweiten Faktor/);
    expect(avv).not.toMatch(/Faktor[^.]*für alle Zugänge/);
  });

  it("die Sicherungsbeschreibung nennt die restic-Aufbewahrung wie das Skript", () => {
    const skript = lies("deploy/sicherung/sicherung-ausser-haus.sh");
    expect(skript).toContain("--keep-daily 7 --keep-weekly 4 --keep-monthly 12");
    expect(avv).toContain("7 tägliche, 4 wöchentliche und 12 monatliche Stände");
  });
});

describe("T-03: Push-Dienste und Mailweg", () => {
  it("jeder Host der Standardliste in pushziel.mjs steht in Anlage 2", () => {
    expect(PUSH_DIENSTE.length).toBeGreaterThan(0);
    for (const h of PUSH_DIENSTE) expect(anlage2, h).toContain(`\`${h}\``);
  });

  it("Push steht in Anlage 2 als „bei Aktivierung“ und nicht als genehmigt", () => {
    const zeile = anlage2.split("\n").find((z) => z.includes("Push-Dienste der Browserhersteller"));
    expect(zeile).toContain("bei Aktivierung");
    expect(zeile).toContain("bis dahin nicht genehmigt");
  });

  it("der Mailweg: Resend ist der einzige implementierte Weg, SMTP ist nicht behauptet", () => {
    expect(texte["datenschutz.md"]).toMatch(/Resend ist der einzige im Quelltext implementierte Versandweg/);
    expect(anlage2).toMatch(/SMTP-Dienst des Hosters ist nicht implementiert/);
    const post = lies("server/lib/post.mjs");
    expect(post).toContain("api.resend.com");
    expect(post).not.toMatch(/nodemailer|createTransport|smtp:\/\//i);
  });
});

describe("T-05: Herkunftskürzel und Hoster-Protokolle", () => {
  it("kein Text nennt das Kürzel „nicht zurückrechenbar“", () => {
    for (const [name, t] of Object.entries(texte)) expect(t, name).not.toMatch(/nicht (zurück|rück)rechenbar/i);
  });

  it("AVV und Datenschutzerklärung sprechen von einem pseudonymisierten Kürzel, das personenbezogen bleibt", () => {
    expect(avv).toContain("pseudonymisiertes Kürzel");
    expect(texte["datenschutz.md"]).toContain("pseudonymisiertes Kürzel");
    expect(texte["datenschutz.md"]).toMatch(/nicht anonym/);
  });

  it("Roh-IP in Caddy-, Container- und Hoster-Protokollen bleibt als [ZU_KLAEREN] offen", () => {
    for (const name of ["auftragsverarbeitung.md", "datenschutz.md"]) {
      const t = texte[name];
      expect(t, name).toMatch(/Roh-IP/);
      expect(t, name).toMatch(/Caddy/);
      expect(t, name).toMatch(/Hoster/);
    }
    expect(avv).toContain("[ZU_KLAEREN: Roh-IP-Inventar je Ebene");
  });
});

describe("T-07: Fristen nur bei aktiviertem Datenschutzlauf", () => {
  it("die Vorgabe in .env.example ist „vorschau“", () => {
    expect(lies(".env.example")).toMatch(/^# CENTRIC_DATENSCHUTZLAUF=vorschau$/m);
  });

  it("AVV § 6 der Anlage 1 knüpft die Fristen an den aktivierten Datenschutzlauf", () => {
    expect(avv).toMatch(/wirken nur bei aktiviertem Datenschutzlauf \(Modus „an“\); die Vorgabe ist „vorschau“/);
  });

  it("die Datenschutzerklärung sagt, dass vollzogene Löschung erst mit Modus „an“ zugesagt wird", () => {
    expect(texte["datenschutz.md"]).toMatch(/erst zugesagt, wenn der Betreiber den Modus „an“ belegt/);
  });
});

describe("T-16: Sicherungskopien und Zusage", () => {
  it("keine Zusage „Sicherungskopien binnen 60 Tagen“; die Abweichung zur restic-Aufbewahrung ist benannt", () => {
    expect(avv).toMatch(/nicht vereinbar und wird deshalb nicht gegeben/);
    expect(texte["agb.md"]).toMatch(/Zusage „Sicherungskopien binnen 60 Tagen“ wird nicht gegeben/);
    expect(texte["loeschkonzept.md"]).toMatch(/\*\*Abweichung:\*\*/);
  });

  it("die Aufbewahrung im Text entspricht Skript und Betriebsanleitung", () => {
    expect(lies("docs/BETRIEB-SICHERUNG.md")).toContain("--keep-daily 7 --keep-weekly 4 --keep-monthly 12");
    expect(lies("deploy/sicherung/sicherung-ausser-haus.sh")).toContain("--keep-monthly 12");
    expect(texte["loeschkonzept.md"]).toContain("7 tägliche, 4 wöchentliche, 12 monatliche");
  });
});

describe("Entwurfsstatus bleibt", () => {
  it("die geänderten Texte tragen weiter ENTWURF und offene [ZU_KLAEREN]-Punkte", () => {
    for (const name of ["auftragsverarbeitung.md", "datenschutz.md", "agb.md", "loeschkonzept.md"]) {
      expect(texte[name], name).toMatch(/ENTWURF/);
      expect(texte[name], name).toContain("[ZU_KLAEREN");
    }
  });
});
