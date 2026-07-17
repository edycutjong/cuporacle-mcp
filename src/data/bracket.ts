/**
 * Knockout bracket assembly from football-data matches.
 *
 * Groups matches by knockout stage and renders each tie with its score/status,
 * so wc_bracket answers "who's through to the final?" without another API.
 */
import { getAllMatches, type RawMatch } from "./football.js";

export interface BracketTie {
  id: number;
  home: string;
  away: string;
  kickoff_utc: string;
  status: string;
  score?: string;
  winner?: string;
}
export interface BracketRound {
  stage: string;
  label: string;
  ties: BracketTie[];
}
export interface Bracket {
  rounds: BracketRound[];
  snapshot: boolean;
  fetched_utc: string;
}

const KNOCKOUT_ORDER: Array<{ stage: string; label: string }> = [
  { stage: "LAST_16", label: "Round of 16" },
  { stage: "ROUND_OF_16", label: "Round of 16" },
  { stage: "QUARTER_FINALS", label: "Quarter-finals" },
  { stage: "SEMI_FINALS", label: "Semi-finals" },
  { stage: "THIRD_PLACE", label: "Third-place play-off" },
  { stage: "FINAL", label: "Final" },
];

function name(t: RawMatch["homeTeam"]): string {
  return t?.name ?? "TBD";
}

function toTie(m: RawMatch): BracketTie {
  const hasScore = m.score?.fullTime?.home != null && m.score?.fullTime?.away != null;
  const tie: BracketTie = {
    id: m.id,
    home: name(m.homeTeam),
    away: name(m.awayTeam),
    kickoff_utc: m.utcDate,
    status: m.status,
  };
  if (hasScore) {
    tie.score = `${m.score.fullTime.home}-${m.score.fullTime.away}`;
    if (m.score.winner === "HOME_TEAM") tie.winner = tie.home;
    else if (m.score.winner === "AWAY_TEAM") tie.winner = tie.away;
  }
  return tie;
}

export async function getBracket(): Promise<Bracket> {
  const all = await getAllMatches();
  const seen = new Set<string>();
  const rounds: BracketRound[] = [];
  for (const { stage, label } of KNOCKOUT_ORDER) {
    if (seen.has(label)) continue;
    const ties = all.data
      .filter((m) => m.stage === stage)
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
      .map(toTie);
    if (ties.length > 0) {
      rounds.push({ stage, label, ties });
      seen.add(label);
    }
  }
  return { rounds, snapshot: all.snapshot, fetched_utc: all.fetched_utc };
}

/** Compact monospace bracket for docs / the wc_bracket text summary. */
export function renderBracketAscii(bracket: Bracket): string {
  const lines: string[] = [];
  for (const round of bracket.rounds) {
    lines.push(`── ${round.label} ──`);
    for (const t of round.ties) {
      const score = t.score ? ` (${t.score})` : "";
      const arrow = t.winner ? `  → ${t.winner}` : "";
      lines.push(`  ${t.home} vs ${t.away}${score}${arrow}`);
    }
  }
  return lines.join("\n");
}
