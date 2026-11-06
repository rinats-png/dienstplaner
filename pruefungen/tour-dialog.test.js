/* Die geführte Tour darf Dialoge nicht verdecken (Befund V4 Phase 2):
   sie blendet sich aus, solange ein aria-modal-Dialog offen ist. */
import { describe, it, expect } from "vitest";
import { appQuelle } from "./app-quelle.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = appQuelle();

describe("Tour und Dialoge", () => {
  it("TourLeiste beobachtet offene Dialoge und blendet sich aus, ohne sich abzubauen", () => {
    const i = app.indexOf("function TourLeiste(");
    expect(i).toBeGreaterThan(0);
    const rumpf = app.slice(i, i + 6000);
    expect(rumpf).toContain("useModalOffen()");
    expect(rumpf).toMatch(/display:\s*dialogOffen \? "none" : undefined/);
    /* Hooks vor dem frühen return, sonst wechselt die Hook-Reihenfolge */
    expect(rumpf.indexOf("useModalOffen()")).toBeLessThan(rumpf.indexOf("return null"));
  });
  it("useModalOffen fragt aria-modal und die offene Seitenleiste am Dokument ab", () => {
    const i = app.indexOf("function useModalOffen(");
    expect(app.slice(i, i + 700)).toContain('[aria-modal="true"]');
  });
});
