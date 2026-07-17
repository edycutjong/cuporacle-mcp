/**
 * football-data.org client (FIFA World Cup 2026, competition id 2000).
 *
 * Free tier: header `X-Auth-Token`. We cache 60s and fall back to a committed
 * snapshot (labeled) when the network or quota fails, so tools never hard-crash
 * mid-demo. Attribution required: "Football data provided by the
 * Football-Data.org API".
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getConfig, WC_COMPETITION_ID, WC_SEASON } from "../config.js";
import { dataCache } from "./cache.js";
import { CupOracleError } from "../errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, "../../fixtures/wc-snapshot.json");
const API_BASE = "https://api.football-data.org/v4";

export interface RawTeam {
  id: number | null;
  name: string | null;
  shortName?: string | null;
  tla?: string | null;
  crest?: string | null;
}
export interface RawScore {
  winner: string | null;
  duration: string;
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
}
export interface RawMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group?: string | null;
  matchday?: number | null;
  minute?: number | null;
  injuryTime?: number | null;
  score: RawScore;
  homeTeam: RawTeam;
  awayTeam: RawTeam;
}
export interface MatchesResponse {
  resultSet?: { count: number; first?: string; last?: string; played?: number };
  matches: RawMatch[];
}

/** Normalized fixture used by wc_fixtures. */
export interface Fixture {
  id: number;
  home: string;
  away: string;
  kickoff_utc: string;
  stage: string;
  status: string;
  group?: string;
}

export interface DataResult<T> {
  data: T;
  /** true when served from the committed snapshot rather than live API. */
  snapshot: boolean;
  fetched_utc: string;
}

function teamName(t: RawTeam): string {
  return t?.name ?? t?.shortName ?? "TBD";
}

export function toFixture(m: RawMatch): Fixture {
  return {
    id: m.id,
    home: teamName(m.homeTeam),
    away: teamName(m.awayTeam),
    kickoff_utc: m.utcDate,
    stage: m.stage,
    status: m.status,
    ...(m.group ? { group: m.group } : {}),
  };
}

function loadSnapshot(): MatchesResponse | undefined {
  if (!existsSync(SNAPSHOT_PATH)) return undefined;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as MatchesResponse;
  } catch {
    return undefined;
  }
}

async function fetchAllMatches(): Promise<MatchesResponse> {
  const cfg = getConfig();
  // Throw (not silently substitute) so getAllMatches' catch owns the snapshot
  // path and the `snapshot` flag on results is always accurate.
  if (!cfg.footballDataKey) {
    throw new CupOracleError("DATA_UNAVAILABLE", "FOOTBALL_DATA_KEY is not set.");
  }
  const url = `${API_BASE}/competitions/${WC_COMPETITION_ID}/matches?season=${WC_SEASON}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": cfg.footballDataKey } });
  if (!res.ok) {
    throw new CupOracleError("DATA_UNAVAILABLE", `football-data.org returned ${res.status}`, {
      details: { status: res.status },
    });
  }
  return (await res.json()) as MatchesResponse;
}

/** All World Cup matches (cached 60s, snapshot fallback on failure). */
export async function getAllMatches(): Promise<DataResult<RawMatch[]>> {
  try {
    const resp = await dataCache.get("football:all", fetchAllMatches);
    return { data: resp.matches ?? [], snapshot: false, fetched_utc: new Date().toISOString() };
  } catch (err) {
    const snap = loadSnapshot();
    if (snap) {
      return { data: snap.matches ?? [], snapshot: true, fetched_utc: new Date().toISOString() };
    }
    throw err;
  }
}

export async function getMatchById(id: number): Promise<DataResult<RawMatch>> {
  const all = await getAllMatches();
  const match = all.data.find((m) => m.id === id);
  if (!match) {
    throw new CupOracleError("MATCH_NOT_FOUND", `No World Cup match with id ${id}.`, {
      hint: "Call wc_fixtures to list valid match ids and kickoff times.",
    });
  }
  return { data: match, snapshot: all.snapshot, fetched_utc: all.fetched_utc };
}

/**
 * Fixtures for a given date (YYYY-MM-DD) or, if omitted, the next window of
 * upcoming/live matches (default: all not-yet-finished matches, soonest first).
 */
export async function getFixtures(date?: string): Promise<DataResult<Fixture[]>> {
  const all = await getAllMatches();
  let matches = all.data;
  if (date) {
    matches = matches.filter((m) => m.utcDate.slice(0, 10) === date);
  } else {
    const upcoming = matches
      .filter((m) => m.status !== "FINISHED" && m.status !== "AWARDED")
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    matches = upcoming.length > 0 ? upcoming : matches.slice(-8);
  }
  matches = [...matches].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  return { data: matches.map(toFixture), snapshot: all.snapshot, fetched_utc: all.fetched_utc };
}
