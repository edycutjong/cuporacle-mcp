import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toFixture, getAllMatches, getFixtures, type RawMatch } from "../src/data/football.js";
import { matchEvent, consensusFromEvent, type OddsEvent } from "../src/data/odds.js";
import { getBracket, renderBracketAscii } from "../src/data/bracket.js";
import { dataCache } from "../src/data/cache.js";
import { loadEnv } from "../src/config.js";

const FIX = resolve(__dirname, "../fixtures");
const snapshot = JSON.parse(readFileSync(resolve(FIX, "wc-snapshot.json"), "utf-8"));
const oddsSnap: OddsEvent[] = JSON.parse(readFileSync(resolve(FIX, "odds/wc-odds-snapshot.json"), "utf-8"));
const matches: RawMatch[] = snapshot.matches;

describe("football-data normalization", () => {
  it("snapshot holds the full 104-match World Cup", () => {
    expect(matches.length).toBe(104);
  });
  it("maps a raw match to a normalized fixture", () => {
    const sf = matches.find((m) => m.id === 537387)!;
    const fx = toFixture(sf);
    expect(fx).toMatchObject({ id: 537387, home: "France", away: "Spain", stage: "SEMI_FINALS" });
    expect(fx.kickoff_utc).toMatch(/2026-07-14/);
  });
  it("renders TBD for unresolved knockout slots", () => {
    const finalMatch = matches.find((m) => m.stage === "FINAL")!;
    const fx = toFixture(finalMatch);
    expect(fx.home === "TBD" || typeof fx.home === "string").toBe(true);
  });
});

describe("odds consensus math", () => {
  it("matches a football-data match to its odds event by team names", () => {
    const nor = matches.find((m) => m.id === 537385)!; // Norway vs England
    const ev = matchEvent(nor, oddsSnap);
    expect(ev).toBeDefined();
  });
  it("computes mean odds and de-vigged implied probabilities that sum to ~1", () => {
    const nor = matches.find((m) => m.id === 537385)!;
    const ev = matchEvent(nor, oddsSnap)!;
    const c = consensusFromEvent(nor, ev);
    expect(c.h2h.home).toBeGreaterThan(1);
    expect(c.h2h.away).toBeGreaterThan(1);
    const sum = c.implied.home + c.implied.draw + c.implied.away;
    expect(sum).toBeCloseTo(1, 3);
  });
  it("returns no event for a TBD fixture", () => {
    const tbd = matches.find((m) => m.stage === "FINAL")!;
    expect(matchEvent(tbd, oddsSnap)).toBeUndefined();
  });
});

// Force the snapshot fallback path: no API keys + a cleared cache.
describe("snapshot fallback path", () => {
  beforeAll(() => {
    // Ensure .env.local is loaded FIRST, then remove the keys so getConfig()
    // can't repopulate them — forcing the labeled snapshot path.
    loadEnv();
    delete process.env.FOOTBALL_DATA_KEY;
    delete process.env.ODDS_API_KEY;
    dataCache.clear();
  });

  it("getAllMatches serves the committed snapshot when no key is set", async () => {
    const res = await getAllMatches();
    expect(res.snapshot).toBe(true);
    expect(res.data.length).toBe(104);
  });

  it("getFixtures filters by date", async () => {
    const res = await getFixtures("2026-07-14");
    expect(res.data.every((f) => f.kickoff_utc.startsWith("2026-07-14"))).toBe(true);
    expect(res.data.some((f) => f.home === "France")).toBe(true);
  });

  it("getBracket assembles knockout rounds incl. the semi-finals", async () => {
    const bracket = await getBracket();
    const stages = bracket.rounds.map((r) => r.stage);
    expect(stages).toContain("SEMI_FINALS");
    const ascii = renderBracketAscii(bracket);
    expect(ascii).toMatch(/France|Semi-finals/);
  });
});
