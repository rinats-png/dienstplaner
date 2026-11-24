// WEBSITE-W3: Kopfzeilen der Caddy-Site-Datei der Hauptwebsite (deploy/website/centric-dienstplanung.de.caddy), ohne
// Browser, ohne Caddy, ohne Netz. Der Prüfsatz W2 (e2e/website-pruefsatz.spec.mjs, e2e/website.mjs) bedient die Seiten
// mit einem eigenen Dateiserver und kennt keine Sicherheitsheader; diese Prüfung hält deshalb die Kopfpolitik der
// echten Auslieferung (Site-Datei) fest. Den Lauf mit echtem Caddy macht pruefungen/website-caddy.sh (Docker, nicht Teil
// dieser Prüfung). Befund CC-1 (kein Cache-Control) wird als Ist-Zustand festgehalten, nicht geändert.
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

describe("Zwischenspeicher (Befund CC-1)", () => {
  // Ist-Zustand am 2026-11-24 (Live: kein Cache-Control, nur ETag und Last-Modified, Browser entscheidet nach Heuristik).
  // Die App-Site setzt no-cache. Ob die Website no-cache (HTML) oder eine Frist für /assets/* bekommt, entscheidet der
  // Betreiber; diese Prüfung ändert nichts und wird bei einer bewussten Änderung der Site-Datei angepasst.
  it("BEFUND CC-1: die Site-Datei setzt kein Cache-Control (weder für HTML noch für assets)", () => {
    expect(CODE).not.toMatch(/cache-control/i);
  });
});
