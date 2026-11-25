// WEBSITE-W3: Kopfzeilen der Caddy-Site-Datei der Hauptwebsite (deploy/website/centric-dienstplanung.de.caddy), ohne
// Browser, ohne Caddy, ohne Netz. Der Prüfsatz W2 (e2e/website-pruefsatz.spec.mjs, e2e/website.mjs) bedient die Seiten
// mit einem eigenen Dateiserver und kennt keine Sicherheitsheader; diese Prüfung hält deshalb die Kopfpolitik der
// echten Auslieferung (Site-Datei) fest. Den Lauf mit echtem Caddy macht pruefungen/website-caddy.sh (Docker, nicht Teil
// dieser Prüfung). Befund CC-1 (kein Cache-Control) ist in W3b behoben (no-cache im Snippet); CSP-1 bleibt als begründeter Ist-Zustand.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = readFileSync(path.join(WURZEL, "deploy", "website", "centric-dienstplanung.de.caddy"), "utf8").replace(/\r\n/g, "\n");

// Ohne Kommentarzeilen und ohne Zeilen-Endkommentare (die Site-Datei kennt keine # innerhalb von Zeichenketten).
const CODE = SITE.split("\n").filter((z) => !z.trim().startsWith("#")).join("\n");

/** Inhalt des Blocks, der mit `kopf` beginnt (Klammern gezählt). */
function block(text, kopf) {
  const start = text.indexOf(kopf);
  if (start < 0) return null;
  const auf = text.indexOf("{", start);
  let tiefe = 0;
  for (let i = auf; i < text.length; i++) {
    if (text[i] === "{") tiefe++;
    else if (text[i] === "}" && --tiefe === 0) return text.slice(auf + 1, i);
  }
  return null;
}

const SNIPPET = block(CODE, "(centric_website_kopf)");
const HEADER = SNIPPET ? block(SNIPPET, "header") : null;
const HAUPT = block(CODE, "\ncentric-dienstplanung.de {");
const FEHLER = HAUPT ? block(HAUPT, "handle_errors") : null;

/** Wert einer Kopfzeile "Name "Wert"" im header-Block, sonst null. */
function wert(name) {
  const m = (HEADER || "").match(new RegExp(`^\\s*${name}\\s+"([^"]*)"\\s*$`, "im"));
  return m ? m[1] : null;
}

function csp() {
  const roh = wert("Content-Security-Policy") || "";
  const d = new Map();
  for (const teil of roh.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [name, ...quellen] = teil.split(/\s+/);
    d.set(name, quellen);
  }
  return d;
}

describe("Site-Datei: Aufbau", () => {
  it("Snippet mit header-Block, Hauptdomain-Block und handle_errors sind vorhanden", () => {
    expect(SNIPPET, "Snippet (centric_website_kopf)").not.toBeNull();
    expect(HEADER, "header-Block im Snippet").not.toBeNull();
    expect(HAUPT, "Block centric-dienstplanung.de").not.toBeNull();
    expect(FEHLER, "handle_errors im Hauptblock").not.toBeNull();
  });

  it("das Snippet gilt im Hauptpfad UND in handle_errors (Caddy verwirft Kopfzeilen sonst bei 404)", () => {
    const hauptOhneFehler = HAUPT.replace(FEHLER, "");
    expect(hauptOhneFehler).toMatch(/^\s*import centric_website_kopf\s*$/m);
    expect(FEHLER).toMatch(/^\s*import centric_website_kopf\s*$/m);
  });

  it("die Seite ist statisch: file_server, root unter aktuell, keine Proxy- oder Weiterleitung zur App", () => {
    expect(HAUPT).toMatch(/^\s*root \* \/srv\/centric-website\/aktuell\s*$/m);
    expect(HAUPT).toMatch(/^\s*file_server\s*$/m);
    // Review #519 H1: `file_server browse` (Verzeichnisliste) wuerde das zweite file_server in handle_errors nicht stoeren
    // und die Zeile oben weiter erfuellen; deshalb eine eigene Negativpruefung auf den ganzen Code.
    expect(CODE).not.toMatch(/\bbrowse\b/);
    expect(CODE).not.toMatch(/^[ \t]*file_server[ \t]+\S/m);
    expect(CODE).not.toMatch(/reverse_proxy/);
    expect(CODE).not.toMatch(/app\.centric-dienstplanung\.de/);
  });

  it("kein Zugriffsprotokoll (Datenschutz)", () => {
    expect(CODE).not.toMatch(/^\s*log\b/m);
  });
});

describe("Pflicht-Kopfzeilen", () => {
  it("X-Content-Type-Options nosniff", () => {
    expect(wert("X-Content-Type-Options")).toBe("nosniff");
  });

  it("Referrer-Policy ist gesetzt und nicht unsafe-url/no-referrer-when-downgrade", () => {
    const w = wert("Referrer-Policy");
    expect(w).toBeTruthy();
    expect(["unsafe-url", "no-referrer-when-downgrade", "origin-when-cross-origin"]).not.toContain(w);
  });

  it("X-Frame-Options DENY", () => {
    expect(wert("X-Frame-Options")).toBe("DENY");
  });

  it("HSTS: mindestens ein Jahr; kein includeSubDomains (App und Website teilen die Hauptdomain, Betreiberentscheidung offen)", () => {
    const w = wert("Strict-Transport-Security") || "";
    const alter = Number((w.match(/max-age=(\d+)/) || [])[1]);
    expect(alter).toBeGreaterThanOrEqual(31536000);
    expect(w).not.toMatch(/includeSubDomains|preload/i);
  });

  it("Permissions-Policy sperrt Standort, Kamera, Mikrofon, Zahlung", () => {
    const w = wert("Permissions-Policy") || "";
    for (const f of ["geolocation", "camera", "microphone", "payment"]) expect(w, f).toContain(`${f}=()`);
  });

  it("Server-Kopfzeile wird entfernt", () => {
    expect(HEADER).toMatch(/^\s*-Server\s*$/m);
  });

  it("Antworten werden komprimiert (encode zstd gzip)", () => {
    expect(HAUPT).toMatch(/^\s*encode zstd gzip\s*$/m);
  });
});

describe("Content-Security-Policy: keine externen Quellen", () => {
  it("ist gesetzt und hat die erwarteten Anweisungen", () => {
    const d = csp();
    for (const n of ["default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "frame-ancestors", "base-uri", "object-src", "form-action"]) {
      expect(d.has(n), n).toBe(true);
    }
  });

  it("keine Quelle mit Schema, Host oder Platzhalter: nur 'self', 'none' und data: (nur img-src)", () => {
    for (const [n, quellen] of csp()) {
      for (const q of quellen) {
        expect(q, `${n}: ${q}`).not.toMatch(/^(https?:|wss?:|\*)/i);
        expect(q, `${n}: ${q}`).not.toMatch(/\./); // kein Hostname
        if (q === "data:") expect(n, "data: nur für Bilder").toBe("img-src");
        else expect(["'self'", "'none'", "'unsafe-inline'"], `${n}: ${q}`).toContain(q);
      }
    }
  });

  it("Skripte nur von 'self': kein unsafe-inline, kein unsafe-eval", () => {
    const d = csp();
    expect(d.get("script-src")).toEqual(["'self'"]);
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(wert("Content-Security-Policy")).not.toMatch(/unsafe-eval/);
  });

  it("Einbettung, Basis-URL und Objekte gesperrt", () => {
    const d = csp();
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'none'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
  });

  it("BEFUND CSP-1 (bekannt, in der Site-Datei begründet): style-src erlaubt 'unsafe-inline' wegen style-Attributen; sonst nichts", () => {
    expect(csp().get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });
});

describe("Zwischenspeicher (Befund CC-1, behoben in W3b)", () => {
  // Die App-Site setzt no-cache; die Website bekommt dasselbe: der Browser fragt jedes Mal mit ETag/Last-Modified nach
  // (kein veralteter Stand nach einer Auslieferung, kein Datenverbrauch bei unverändertem Stand). Eine Frist für
  // /assets/* wäre eine Optimierung und braucht Dateinamen mit Prüfsumme; sie ist nicht entschieden und nicht gesetzt.
  it("das Snippet setzt Cache-Control no-cache (Hauptpfad und über das Snippet auch die Fehlerseite)", () => {
    expect(wert("Cache-Control")).toBe("no-cache");
    expect(FEHLER).toMatch(/^\s*import centric_website_kopf\s*$/m);
  });
  it("es gibt genau eine Cache-Control-Zeile und keine Frist (max-age, immutable, public)", () => {
    expect(CODE.match(/cache-control/gi)).toHaveLength(1);
    expect(CODE).not.toMatch(/immutable|s-maxage|stale-while/i);
    expect(wert("Cache-Control")).not.toMatch(/max-age|immutable|public/i);
  });
});

describe("Rauchtest mit echtem Caddy prüft CC-1 auf / und auf der Fehlerseite", () => {
  it("website-caddy.sh verlangt cache-control: no-cache für / und 404", () => {
    const sh = readFileSync(path.join(WURZEL, "pruefungen", "website-caddy.sh"), "utf8");
    expect(sh).toContain(`kopf_hat 'cache-control: no-cache' "/ (CC-1)"`);
    expect(sh).toContain(`kopf_hat 'cache-control: no-cache' "404 (CC-1)"`);
  });
});

describe("Klonanweisung (Review #519 A3): fester Kopf statt beweglichem Zweig", () => {
  const DOKU = readFileSync(path.join(WURZEL, "docs", "DEPLOY-HAUPTWEBSITE.md"), "utf8").replace(/\r\n/g, "\n");
  const ABLAUF_A = DOKU.slice(DOKU.indexOf("## Ablauf A"), DOKU.indexOf("## Ablauf B"));
  const BEFEHLE = (ABLAUF_A.match(/```\n([\s\S]*?)\n```/) || [])[1] || "";
  it("der Befehlsblock holt den Commit <KOPF> (kein --branch) und prüft ihn", () => {
    expect(BEFEHLE).toContain("<KOPF>");
    expect(BEFEHLE).not.toMatch(/--branch/);
    expect(BEFEHLE).toMatch(/git -C \/root\/cs fetch --depth 1 \S+ <KOPF>/);
    expect(BEFEHLE).toMatch(/checkout --detach FETCH_HEAD/);
  });
  it("die Konsole wird nur mit ERWARTETER_KOPF=<KOPF> gestartet", () => {
    expect(BEFEHLE).toMatch(/^ERWARTETER_KOPF=<KOPF> bash \/root\/cs\/deploy\/website\/website-konsole\.sh$/m);
    expect(BEFEHLE).not.toMatch(/^bash \/root\/cs\/deploy\/website\/website-konsole\.sh/m);
  });
  it("kein beweglicher Zweig als Quelle in Doku und Bauanleitung", () => {
    const BAU = readFileSync(path.join(WURZEL, "deploy", "website", "dist-bauen.md"), "utf8");
    expect(DOKU).not.toContain("--branch deploy/hauptwebsite-docker");
    expect(DOKU, "auch Ablauf B holt einen festen Commit").not.toMatch(/git clone[^\n]*--branch/);
    expect(DOKU).toMatch(/git fetch --depth 1 --filter=blob:none \S+ <KOPF>/);
    expect(BAU).not.toMatch(/gehoeren in den Zweig/);
  });
});
