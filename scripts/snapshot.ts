/**
 * snapshot.ts — refresh the committed offline fixtures idempotently.
 *
 * Writes:
 *   fixtures/wc-snapshot.json          (all WC matches, football-data shape)
 *   fixtures/odds/wc-odds-snapshot.json (odds events, the-odds-api shape)
 *
 * Used as labeled fallback data when the live APIs are unreachable / quota-hit,
 * and to keep the vitest suite deterministic and offline.
 *
 *   npm run snapshot
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import { getConfig, WC_COMPETITION_ID, WC_SEASON } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../fixtures");

/**
 * Write a fixture under the fixed `fixtures/` dir only. The relative name is
 * reduced with `basename` on each path segment so a value can never escape the
 * output dir (no `..`, no absolute paths) even if a caller passed something
 * dynamic — the destination is derived solely from constants here, never from
 * the fetched HTTP response.
 */
function writeFixture(relName: string, data: unknown): void {
  const safe = relName.split("/").map((seg) => basename(seg)).filter((s) => s && s !== "..");
  const dest = resolve(FIX, ...safe);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(data, null, 2));
  return void console.log(`wrote ${safe.join("/")}`);
}

async function main(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.footballDataKey || !cfg.oddsApiKey) {
    console.error("Need FOOTBALL_DATA_KEY and ODDS_API_KEY in .env.local to refresh snapshots.");
    process.exit(1);
  }

  const matchesUrl = `https://api.football-data.org/v4/competitions/${WC_COMPETITION_ID}/matches?season=${WC_SEASON}`;
  const matchesRes = await fetch(matchesUrl, { headers: { "X-Auth-Token": cfg.footballDataKey } });
  if (!matchesRes.ok) throw new Error(`football-data ${matchesRes.status}: refusing to snapshot an error body`);
  const matches = (await matchesRes.json()) as { resultSet?: { count?: number }; matches?: unknown[] };
  writeFixture("wc-snapshot.json", matches);
  console.log(`  (${matches.resultSet?.count ?? matches.matches?.length} matches)`);

  const oddsUrl = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?apiKey=${cfg.oddsApiKey}&regions=us,uk,eu&markets=h2h&oddsFormat=decimal`;
  const oddsRes = await fetch(oddsUrl);
  if (!oddsRes.ok) throw new Error(`the-odds-api ${oddsRes.status}: refusing to snapshot an error body`);
  const odds = await oddsRes.json();
  writeFixture("odds/wc-odds-snapshot.json", odds);
  console.log(`  (${Array.isArray(odds) ? odds.length : 0} events)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
