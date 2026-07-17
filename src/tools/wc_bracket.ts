/** wc_bracket — knockout bracket state (who's through to the final). */
import { z } from "zod";
import { getBracket, renderBracketAscii } from "../data/bracket.js";
import { ok, guard, FOOTBALL_ATTRIBUTION, type ToolDef } from "./shared.js";

const tieShape = z.object({
  id: z.number(),
  home: z.string(),
  away: z.string(),
  kickoff_utc: z.string(),
  status: z.string(),
  score: z.string().optional(),
  winner: z.string().optional(),
});

const outputSchema = {
  rounds: z.array(z.object({ stage: z.string(), label: z.string(), ties: z.array(tieShape) })),
  ascii: z.string(),
  snapshot: z.boolean(),
  attribution: z.string(),
};

export const wcBracket: ToolDef = {
  name: "wc_bracket",
  config: {
    title: "World Cup knockout bracket",
    description:
      "Current knockout bracket state (Round of 16 → Final) with scores and winners where known. Free.",
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler: guard(async () => {
    const bracket = await getBracket();
    const ascii = renderBracketAscii(bracket);
    const structured = {
      rounds: bracket.rounds,
      ascii,
      snapshot: bracket.snapshot,
      attribution: FOOTBALL_ATTRIBUTION,
    };
    const summary = `${ascii}${bracket.snapshot ? "\n[snapshot]" : ""}\n\n${FOOTBALL_ATTRIBUTION}`;
    return ok(structured, summary);
  }),
};
