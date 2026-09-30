interface ResultPlayer {
  id?: unknown;
  isBot?: boolean;
  isOriginalBot?: boolean;
  autoplayMs?: unknown;
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

export function resultRankPoints(players: readonly ResultPlayer[], player: ResultPlayer,
  game: { durationMs?: unknown; winnerId?: unknown } = {}): { rank: number; points: number } {
  const participants = players.filter(other => recordedPlayerScore(other) !== null);
  const score = recordedPlayerScore(player);
  if (score === null) return { rank: 0, points: 0 };
  const higher = participants.filter(other => recordedPlayerScore(other)! > score).length;
  const isBot = (entry: ResultPlayer) => entry.isOriginalBot ?? entry.isBot ?? false;
  const humans = participants.filter(other => !isBot(other)).length;
  const excessiveAutoplay = typeof game.durationMs === 'number' && Number.isFinite(game.durationMs) && game.durationMs > 0 &&
    typeof player.autoplayMs === 'number' && Number.isFinite(player.autoplayMs) && player.autoplayMs > game.durationMs / 2;
  const soloLoss = humans === 1 && game.winnerId != null && String(player.id) !== String(game.winnerId);
  return { rank: higher + 1, points: isBot(player) || excessiveAutoplay || soloLoss ? 0 : Math.max(0, humans - higher) };
}
