/* SSOT-Abgleich: REST-Ausweichweg und fail-closed (gh wird injiziert, kein Netz). */
import { describe, it, expect } from "vitest";
import { restZuPrListe, gemergteViaGh } from "../werkzeug/ssot-abgleich.mjs";

const pr = (n, merged, ref) => ({ number: n, title: `T${n}`, merged_at: merged, head: { ref } });
const zeilen = (...l) => l.map((x) => JSON.stringify(x)).join("\n");

describe("REST-Antwort -> PR-Liste", () => {
  it("übernimmt nur gemergte PRs im Format {number,title,headRefName}", () => {
    const out = restZuPrListe(zeilen(pr(1, "2026-11-01T00:00:00Z", "a/b"), pr(2, null, "c"), pr(3, "2026-11-02T00:00:00Z", "d")));
    expect(out).toEqual([
      { number: 1, title: "T1", headRefName: "a/b" },
      { number: 3, title: "T3", headRefName: "d" },
    ]);
  });
  it("versteht auch ein JSON-Array", () => {
    expect(restZuPrListe(JSON.stringify([pr(5, "x", "r")]))).toEqual([{ number: 5, title: "T5", headRefName: "r" }]);
  });
});

describe("gemergteViaGh", () => {
  it("nutzt GraphQL, wenn es funktioniert", () => {
    const aufrufe = [];
    const gh = (a) => { aufrufe.push(a[0]); return JSON.stringify([{ number: 9, title: "x", headRefName: "y" }]); };
    expect(gemergteViaGh(gh)).toEqual([{ number: 9, title: "x", headRefName: "y" }]);
    expect(aufrufe).toEqual(["pr"]);
  });
  it("weicht bei GraphQL-Fehler (HTTP 403) auf REST aus", () => {
    const gh = (a) => {
      if (a[0] === "pr") throw new Error("HTTP 403: API rate limit exceeded");
      if (a[0] === "repo") return "rinats-png/dienstplaner\n";
      expect(a[0]).toBe("api");
      expect(a).toContain("--paginate");
      expect(a.join(" ")).toContain("repos/rinats-png/dienstplaner/pulls?state=closed&base=integration/release-v4&per_page=100");
      return zeilen(pr(7, "t", "feat/x"), pr(8, null, "feat/y"));
    };
    expect(gemergteViaGh(gh)).toEqual([{ number: 7, title: "T7", headRefName: "feat/x" }]);
  });
  it("fail-closed: scheitert auch REST, bricht es mit klarer Meldung ab", () => {
    const gh = (a) => { throw new Error(a[0] === "pr" ? "HTTP 403" : "HTTP 502"); };
    expect(() => gemergteViaGh(gh)).toThrow(/nicht ermittelbar.*HTTP 403.*REST.*HTTP 502.*nichts als gemergt/s);
  });
  it("fail-closed: unbrauchbarer Repo-Name oder kaputtes JSON liefert keine Liste", () => {
    const g1 = (a) => { if (a[0] === "pr") throw new Error("403"); return "kaputt name"; };
    expect(() => gemergteViaGh(g1)).toThrow(/nicht ermittelbar/);
    const g2 = (a) => { if (a[0] === "pr") throw new Error("403"); if (a[0] === "repo") return "o/r"; return "{nicht json"; };
    expect(() => gemergteViaGh(g2)).toThrow(/nicht ermittelbar/);
  });
});
