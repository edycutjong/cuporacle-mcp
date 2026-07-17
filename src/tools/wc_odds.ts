/** wc_odds — consensus h2h odds + de-vigged implied probabilities for a match. */
import { z } from "zod";
import { getMatchById } from "../data/football.js";
import { getOddsForMatch } from "../data/odds.js";
import { ok, guard, type ToolDef } from "./shared.js";

const inputSchema = {
  matchId: z.number().int().positive().describe("football-data match id (from wc_fixtures)."),
};

const outputSchema = {
  matchId: z.number(),
  home_team: z.string(),
  away_team: z.string(),
  h2h: z.object({ home: z.number(), draw: z.number(), away: z.number() }),
  implied: z.object({ home: z.number(), draw: z.number(), away: z.number() }),
  books_count: z.number(),
  snapshot: z.boolean(),
  snapshot_utc: z.string(),
};

export const wcOdds: ToolDef = {
  name: "wc_odds",
  config: {
    title: "World Cup consensus odds",
    description:
      "Consensus head-to-head odds (mean decimal price across books) and de-vigged implied " +
      "probabilities for one match. Free. Odds appear only once both teams are known.",
    inputSchema,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler: guard(async (args: { matchId: number }) => {
    const match = await getMatchById(args.matchId);
    const res = await getOddsForMatch(match.data);
    const o = res.data;
    const structured = {
      matchId: o.matchId,
      home_team: o.home_team,
      away_team: o.away_team,
      h2h: o.h2h,
      implied: o.implied,
      books_count: o.books_count,
      snapshot: res.snapshot,
      snapshot_utc: o.snapshot_utc,
    };
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const summary =
      `${o.home_team} vs ${o.away_team} — consensus (${o.books_count} books)` +
      `${res.snapshot ? " [snapshot]" : ""}\n` +
      `  home ${o.h2h.home} (${pct(o.implied.home)}) | draw ${o.h2h.draw} (${pct(o.implied.draw)}) | ` +
      `away ${o.h2h.away} (${pct(o.implied.away)})`;
    return ok(structured, summary);
  }),
};
