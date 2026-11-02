import { affiliationKey } from "@/lib/affiliations";
import type { Election } from "@/lib/types";

// Mayoral leaderboards built from every candidate in every race in elections.json.
// The City's files have no candidate ID, so a "person" is everyone listed under the same name
// (normalized: case, accents and punctuation ignored). The page says so.

export interface RaceResult {
  election: Election;
  nameAsListed: string;
  votes: number;
  sharePct: number;
  rank: number;
}

export interface PersonRecord {
  key: string;
  displayName: string;
  totalVotes: number;
  wins: number;
  races: RaceResult[];
  best: RaceResult;
}

export function raceResults(elections: Election[]): (RaceResult & { key: string; displayName: string })[] {
  return elections.flatMap(e =>
    e.mayor.candidates.map(c => ({
      election: e, nameAsListed: c.nameAsListed, votes: c.votes, rank: c.rank,
      sharePct: (c.votes / e.mayor.totalVotes) * 100,
      key: affiliationKey(c.displayName), displayName: c.displayName,
    })),
  );
}

export function people(elections: Election[]): PersonRecord[] {
  const byKey = new Map<string, PersonRecord>();
  for (const r of raceResults(elections)) {
    const p = byKey.get(r.key);
    if (!p) {
      byKey.set(r.key, { key: r.key, displayName: r.displayName, totalVotes: r.votes, wins: r.rank === 1 ? 1 : 0, races: [r], best: r });
    } else {
      p.totalVotes += r.votes;
      p.wins += r.rank === 1 ? 1 : 0;
      p.races.push(r);
      if (r.votes > p.best.votes) p.best = r;
    }
  }
  return [...byKey.values()].sort((a, b) => b.totalVotes - a.totalVotes);
}

/** Share of each race's mayoral vote held by each finishing position; `others` is everyone below `positions`. */
export function shareByRank(e: Election, positions = 10): { shares: number[]; others: number } {
  const total = e.mayor.totalVotes;
  const top = e.mayor.candidates.slice(0, positions);
  const shares = top.map(c => (c.votes / total) * 100);
  const others = ((total - top.reduce((s, c) => s + c.votes, 0)) / total) * 100;
  return { shares, others };
}
