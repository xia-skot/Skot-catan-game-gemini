interface ResultPlayer {
  score?: unknown;
  breakdown?: Record<string, unknown>;
}

export function recordedPlayerScore(player: ResultPlayer): number | null {
  const valid = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (!valid(player.score)) return null;
  const detail = player.breakdown;
  if (!detail) return player.score;
  const { settlements = 0, cities = 0, longestRoad = false, largestArmy = false, vpCards = 0, islandBonus = 0 } = detail;
  if (!valid(settlements) || !valid(cities) || typeof longestRoad !== 'boolean' ||
      typeof largestArmy !== 'boolean' || !valid(vpCards) || !valid(islandBonus)) return player.score;
  // Older results can store a partial total alongside the score breakdown.
  const total = settlements + cities * 2 + (longestRoad ? 2 : 0) + (largestArmy ? 2 : 0) + vpCards + islandBonus;
  return Number.isSafeInteger(total) ? Math.max(player.score, total) : player.score;
}

export function resultRankPoints(players: readonly ResultPlayer[], player: ResultPlayer): { rank: number; points: number } {
  const participants = players.filter(other => recordedPlayerScore(other) !== null);
  const score = recordedPlayerScore(player);
  if (score === null) return { rank: 0, points: 0 };
  const higher = participants.filter(other => recordedPlayerScore(other)! > score).length;
  return { rank: higher + 1, points: participants.length - higher };
}
