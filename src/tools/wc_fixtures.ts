/** wc_fixtures — World Cup fixtures for a date, or the next upcoming window. */
import { z } from "zod";
import { getFixtures } from "../data/football.js";
import { ok, guard, FOOTBALL_ATTRIBUTION, type ToolDef } from "./shared.js";

const inputSchema = {
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional()
    .describe("Optional day filter (UTC), e.g. 2026-07-14. Omit for the next upcoming fixtures."),
};

const fixtureShape = {
  id: z.number(),
  home: z.string(),
  away: z.string(),
  kickoff_utc: z.string(),
  stage: z.string(),
  status: z.string(),
  group: z.string().optional(),
};

const outputSchema = {
  matches: z.array(z.object(fixtureShape)),
  count: z.number(),
  snapshot: z.boolean(),
  attribution: z.string(),
};

export const wcFixtures: ToolDef = {
  name: "wc_fixtures",
  config: {
    title: "World Cup fixtures",
    description:
      "List FIFA World Cup 2026 fixtures. Pass a date (YYYY-MM-DD) for that day, or omit to get the " +
      "next upcoming matches (soonest first). Free.",
    inputSchema,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler: guard(async (args: { date?: string }) => {
    const res = await getFixtures(args.date);
    const structured = {
      matches: res.data,
      count: res.data.length,
      snapshot: res.snapshot,
      attribution: FOOTBALL_ATTRIBUTION,
    };
    const label = args.date ? `on ${args.date}` : "upcoming";
    const lines = res.data
      .slice(0, 12)
      .map((m) => `  #${m.id}  ${m.kickoff_utc}  [${m.stage}]  ${m.home} vs ${m.away}  (${m.status})`);
    const summary =
      `${res.data.length} World Cup fixture(s) ${label}${res.snapshot ? " [snapshot]" : ""}:\n` +
      lines.join("\n") +
      `\n\n${FOOTBALL_ATTRIBUTION}`;
    return ok(structured, summary);
  }),
};
