/**
 * the-odds-api.com client — consensus h2h odds for the FIFA World Cup.
 *
 * Free tier is 500 req/mo, so we cache 60s. Odds events key on team names +
 * commence_time (not football-data ids), so we match by normalized team name.
 * Consensus = mean decimal odds across bookmakers; implied probability is the
 * de-vigged (normalized) inverse.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getConfig } from "../config.js";
import { dataCache } from "./cache.js";
import { CupOracleError } from "../errors.js";
import type { RawMatch } from "./football.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, "../../fixtures/odds/wc-odds-snapshot.json");
const API_BASE = "https://api.the-odds-api.com/v4";
const SPORT = "soccer_fifa_world_cup";

export interface OddsOutcome {
  name: string;
  price: number;
}
export interface OddsMarket {
  key: string;
  last_update: string;
  outcomes: OddsOutcome[];
}
export interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsMarket[];
}
export interface OddsEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

export interface ConsensusOdds {
  matchId: number;
  home_team: string;
  away_team: string;
  commence_time: string;
  /** Mean decimal odds across bookmakers. */
  h2h: { home: number; draw: number; away: number };
  /** De-vigged implied probabilities (sum to 1). */
  implied: { home: number; draw: number; away: number };
  books_count: number;
  snapshot_utc: string;
}

export interface OddsResult {
  data: ConsensusOdds;
  snapshot: boolean;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

function loadSnapshot(): OddsEvent[] | undefined {
  if (!existsSync(SNAPSHOT_PATH)) return undefined;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as OddsEvent[];
  } catch {
    return undefined;
  }
}

async function fetchOddsEvents(): Promise<OddsEvent[]> {
  const cfg = getConfig();
  // Throw on any miss so getOddsEvents' catch owns the labeled snapshot path.
  if (!cfg.oddsApiKey) {
    throw new CupOracleError("DATA_UNAVAILABLE", "ODDS_API_KEY is not set.");
  }
  const url = `${API_BASE}/sports/${SPORT}/odds?apiKey=${cfg.oddsApiKey}&regions=us,uk,eu&markets=h2h&oddsFormat=decimal`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new CupOracleError("DATA_UNAVAILABLE", `the-odds-api returned ${res.status}`, {
      details: { status: res.status },
    });
  }
  return (await res.json()) as OddsEvent[];
}

export async function getOddsEvents(): Promise<{ events: OddsEvent[]; snapshot: boolean }> {
  try {
    const events = await dataCache.get("odds:all", fetchOddsEvents);
    return { events, snapshot: false };
  } catch (err) {
    const snap = loadSnapshot();
    if (snap) return { events: snap, snapshot: true };
    throw err;
  }
}

/** Find the odds event that corresponds to a football-data match (by team names). */
export function matchEvent(match: RawMatch, events: OddsEvent[]): OddsEvent | undefined {
  const home = normalize(match.homeTeam.name ?? "");
  const away = normalize(match.awayTeam.name ?? "");
  if (!home || !away) return undefined; // unresolved (TBD) fixtures have no odds
  return events.find((e) => {
    const eh = normalize(e.home_team);
    const ea = normalize(e.away_team);
    const direct = (eh.includes(home) || home.includes(eh)) && (ea.includes(away) || away.includes(ea));
    const swapped = (eh.includes(away) || away.includes(eh)) && (ea.includes(home) || home.includes(ea));
    return direct || swapped;
  });
}

/** Mean decimal odds + de-vigged implied probabilities for one match. */
export function consensusFromEvent(match: RawMatch, event: OddsEvent): ConsensusOdds {
  const homeName = match.homeTeam.name ?? event.home_team;
  const awayName = match.awayTeam.name ?? event.away_team;
  const homeKey = normalize(homeName);
  const awayKey = normalize(awayName);

  const acc = { home: [] as number[], draw: [] as number[], away: [] as number[] };
  for (const bk of event.bookmakers) {
    const h2h = bk.markets.find((m) => m.key === "h2h");
    if (!h2h) continue;
    for (const o of h2h.outcomes) {
      const on = normalize(o.name);
      if (on === "draw" || on === "tie") acc.draw.push(o.price);
      else if (on.includes(homeKey) || homeKey.includes(on)) acc.home.push(o.price);
      else if (on.includes(awayKey) || awayKey.includes(on)) acc.away.push(o.price);
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const h2h = { home: mean(acc.home), draw: mean(acc.draw), away: mean(acc.away) };

  const invH = h2h.home > 0 ? 1 / h2h.home : 0;
  const invD = h2h.draw > 0 ? 1 / h2h.draw : 0;
  const invA = h2h.away > 0 ? 1 / h2h.away : 0;
  const sum = invH + invD + invA || 1;
  const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
  const round3 = (n: number) => Math.round(n * 1e3) / 1e3;

  return {
    matchId: match.id,
    home_team: homeName,
    away_team: awayName,
    commence_time: event.commence_time,
    h2h: { home: round3(h2h.home), draw: round3(h2h.draw), away: round3(h2h.away) },
    implied: { home: round4(invH / sum), draw: round4(invD / sum), away: round4(invA / sum) },
    books_count: event.bookmakers.length,
    snapshot_utc: new Date().toISOString(),
  };
}

export async function getOddsForMatch(match: RawMatch): Promise<OddsResult> {
  const { events, snapshot } = await getOddsEvents();
  const event = matchEvent(match, events);
  if (!event) {
    throw new CupOracleError("DATA_UNAVAILABLE", `No consensus odds available yet for match ${match.id}.`, {
      hint:
        "Odds usually appear only once both teams are known and books have posted a line. " +
        "Unresolved (TBD) knockout slots have no odds until the prior round settles.",
    });
  }
  return { data: consensusFromEvent(match, event), snapshot };
}
