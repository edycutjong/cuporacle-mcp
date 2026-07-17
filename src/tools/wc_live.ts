/** wc_live — live score / minute / status for one match. */
import { z } from "zod";
import { getMatchById } from "../data/football.js";
import { ok, guard, FOOTBALL_ATTRIBUTION, type ToolDef } from "./shared.js";

const inputSchema = {
  matchId: z.number().int().positive().describe("football-data match id (from wc_fixtures)."),
};

const outputSchema = {
  matchId: z.number(),
  home: z.string(),
  away: z.string(),
  status: z.string(),
  minute: z.number().nullable(),
  score: z.object({
    home: z.number().nullable(),
    away: z.number().nullable(),
    winner: z.string().nullable(),
  }),
  kickoff_utc: z.string(),
  snapshot: z.boolean(),
  attribution: z.string(),
};

export const wcLive: ToolDef = {
  name: "wc_live",
  config: {
    title: "World Cup live score",
    description:
      "Live score, minute and status for one World Cup match by id. Reflects half-time / full-time / " +
      "in-play state. Free.",
    inputSchema,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler: guard(async (args: { matchId: number }) => {
    const res = await getMatchById(args.matchId);
    const m = res.data;
    const structured = {
      matchId: m.id,
      home: m.homeTeam.name ?? "TBD",
      away: m.awayTeam.name ?? "TBD",
      status: m.status,
      minute: m.minute ?? null,
      score: {
        home: m.score.fullTime.home,
        away: m.score.fullTime.away,
        winner: m.score.winner,
      },
      kickoff_utc: m.utcDate,
      snapshot: res.snapshot,
      attribution: FOOTBALL_ATTRIBUTION,
    };
    const sc =
      m.score.fullTime.home != null
        ? `${m.score.fullTime.home}-${m.score.fullTime.away}`
        : "no score yet";
    const min = m.minute != null ? ` ${m.minute}'` : "";
    const summary =
      `${structured.home} vs ${structured.away} — ${m.status}${min}: ${sc}` +
      `${res.snapshot ? " [snapshot]" : ""}\n${FOOTBALL_ATTRIBUTION}`;
    return ok(structured, summary);
  }),
};
