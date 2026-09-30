import {
  DEFAULT_LEADERBOARD_TOP_COUNT, isLeaderboardTopCount, LEADERBOARD_TIME_ZONE,
  monthBounds, recordTime, LEADERBOARD_SCORING_VERSION, type MonthlyLeaderboard, type LeaderboardGamePoints,
} from '../shared/leaderboard';
import { recordedPlayerScore, resultRankPoints } from '../shared/gameResult';

type StoredDocument = Record<string, any>;
interface Participant { id: string; name: string; isBot: boolean; isGuest: boolean; score: number; userId: string | null; sessionId: string | null; autoplayMs?: number }
interface EligibleGame { roomId: string; completedAt: number; winnerId: string; players: Participant[]; stableIdentity: boolean; durationMs?: number }
export interface LeaderboardUserStats { totalGames: number; wins: number; winRate: number; recent3DayGames: number }

const normalizeName = (value: string) => value.trim().toLowerCase();
const seatId = (value: unknown): string | null =>
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
  (typeof value === 'string' && value.trim().length > 0) ? String(value) : null;

function normalizeGame(record: StoredDocument, now: number): EligibleGame | null {
  const completedAt = recordTime(record.completedAt);
  if (completedAt === null || completedAt > now || !Array.isArray(record.players) ||
      (record.phase !== undefined && record.phase !== 'finished') ||
      (record.mapType !== 'standard' && record.mapType !== 'archipelago')) return null;
  const players: Participant[] = [];
  const stableIdentity = record.identityVersion === 1;
  if (record.identityVersion !== undefined && !stableIdentity) return null;
  for (const player of record.players) {
    if (!player || typeof player !== 'object') return null;
    if (player.isSpectator === true || player.role === 'spectator') continue;
    const id = seatId(player.id);
    const isBot = stableIdentity ? player.isOriginalBot : player.isBot;
    const score = recordedPlayerScore(player);
    if (id === null || typeof player.name !== 'string' || !player.name.trim() ||
        typeof isBot !== 'boolean' || score === null) return null;
    players.push({ id, name: normalizeName(player.name), isBot,
      isGuest: player.isGuest === true, score,
      autoplayMs: stableIdentity && Number.isFinite(player.autoplayMs) && player.autoplayMs >= 0 ? player.autoplayMs : undefined,
      userId: typeof player.userId === 'string' && player.userId ? player.userId : null,
      sessionId: typeof player.sessionId === 'string' && player.sessionId ? player.sessionId : null });
  }
  if (players.length < 2 || new Set(players.map(player => player.id)).size !== players.length) return null;
  const winnerId = seatId(record.winnerId);
  const winner = players.find(player => player.id === winnerId);
  const target = record.mapType === 'standard' ? 10 : 14;
  if (!winner || winner.score < target || players.some(player => player.score > winner.score)) return null;
  return { roomId: String(record.roomId || ''), completedAt, winnerId: winner.id, players, stableIdentity,
    durationMs: stableIdentity && Number.isFinite(record.durationMs) && record.durationMs > 0 ? record.durationMs : undefined };
}

/** Older records have no per-game ID. Collapse identical room outcomes conservatively. */
export function eligibleLeaderboardGames(records: readonly StoredDocument[], now = Date.now()): EligibleGame[] {
  const groups = new Map<string, { game: EligibleGame | null; signature: string; conflict: boolean }>();
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const game = normalizeGame(record, now);
    const explicitId = typeof record.gameId === 'string' && record.gameId.trim() ? record.gameId : null;
    // The producer, not an HTTP request, must supply any future gameId. Current records use this legacy key.
    if (!game && !explicitId) continue;
    const roster = game?.players.map(player => [player.id, player.name, player.isBot, player.isGuest, player.score, player.userId, player.sessionId, player.autoplayMs])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const signature = JSON.stringify([record.mapType, record.turnCount, game?.winnerId, game?.stableIdentity, game?.durationMs, roster]);
    let key: string;
    if (explicitId) key = `id:${explicitId}`;
    else {
      if (typeof record.roomId !== 'string' || !record.roomId.trim() ||
          !Number.isSafeInteger(record.turnCount) || record.turnCount < 0) continue;
      key = JSON.stringify(['legacy', record.roomId, signature]);
    }
    const existing = groups.get(key);
    if (!existing) groups.set(key, { game, signature, conflict: !game });
    else if (!game || existing.signature !== signature) existing.conflict = true;
    else if (existing.game && game.completedAt < existing.game.completedAt) existing.game = game;
  }
  return [...groups.values()].filter(group => !group.conflict && group.game).map(group => group.game!);
}

function accountResolver(users: readonly StoredDocument[]) {
  // Include guests when detecting name collisions: a guest may have used a registered player's name.
  const names = new Map<string, StoredDocument[]>();
  const ids = new Map(users.filter(user => user._id).map(user => [String(user._id), user]));
  for (const user of users) {
    if (typeof user.username !== 'string' || !user.username.trim()) continue;
    const key = normalizeName(user.username);
    names.set(key, [...(names.get(key) || []), user]);
  }
  return (player: Participant, game: EligibleGame): StoredDocument | null => {
    if (player.isBot || player.isGuest) return null;
    const candidates = game.stableIdentity ? (player.userId && ids.has(player.userId) ? [ids.get(player.userId)!] : []) : names.get(player.name) || [];
    if (candidates.length !== 1) return null;
    const user = candidates[0], registeredAt = recordTime(user.createdAt);
    if (!user._id || user.isGuest !== false || user.role === 'guest' || registeredAt === null || registeredAt > game.completedAt) return null;
    return user;
  };
}

function creditedPlayers(game: EligibleGame, resolve: ReturnType<typeof accountResolver>) {
  const matched = game.players.map(player => ({ player, user: resolve(player, game) }));
  const counts = new Map<string, number>();
  for (const { user } of matched) if (user) counts.set(String(user._id), (counts.get(String(user._id)) || 0) + 1);
  return matched.filter(({ user }) => user && counts.get(String(user._id)) === 1);
}

export function computeLeaderboardUserStats(records: readonly StoredDocument[], users: readonly StoredDocument[], now = Date.now()) {
  const stats = new Map<string, LeaderboardUserStats>();
  for (const user of users) if (user._id && user.isGuest === false) {
    stats.set(String(user._id), { totalGames: 0, wins: 0, winRate: 0, recent3DayGames: 0 });
  }
  const resolve = accountResolver(users);
  for (const game of eligibleLeaderboardGames(records, now)) {
    for (const { user, player } of creditedPlayers(game, resolve)) {
      const row = stats.get(String(user!._id))!;
      row.totalGames++;
      if (player.id === game.winnerId) row.wins++;
      if (game.completedAt >= now - 72 * 60 * 60 * 1000) row.recent3DayGames++;
    }
  }
  for (const row of stats.values()) row.winRate = row.totalGames ? Math.round(100 * row.wins / row.totalGames) : 0;
  return stats;
}

export function buildMonthlyLeaderboard(records: readonly StoredDocument[], users: readonly StoredDocument[],
  month: string, topCount = DEFAULT_LEADERBOARD_TOP_COUNT, now = Date.now(), viewerId?: string): MonthlyLeaderboard {
  if (!isLeaderboardTopCount(topCount)) throw new Error('Invalid leaderboard top count');
  const { start, end } = monthBounds(month), resolve = accountResolver(users);
  const totals = new Map<string, { userId: string; username: string; points: number; gameCount: number; wins: number }>();
  const myGames: LeaderboardGamePoints[] = [];
  // Deduplicate BEFORE the month filter so a retried write across midnight cannot score twice.
  for (const game of eligibleLeaderboardGames(records, now)) {
    if (game.completedAt < start || game.completedAt >= end) continue;
    for (const { user, player } of creditedPlayers(game, resolve)) {
      const userId = String(user!._id);
      const row = totals.get(userId) || { userId, username: user!.username, points: 0, gameCount: 0, wins: 0 };
      const award = resultRankPoints(game.players, player, game);
      row.points += award.points;
      if (userId === viewerId) myGames.push({ roomId: game.roomId, completedAt: new Date(game.completedAt).toISOString(),
        rank: award.rank, playerCount: game.players.length, points: award.points });
      row.gameCount++;
      if (player.id === game.winnerId) row.wins++;
      totals.set(userId, row);
    }
  }
  const ordered = [...totals.values()].sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
  let rank = 0;
  const entries = ordered.slice(0, topCount).map((entry, index) => {
    if (index === 0 || entry.points !== ordered[index - 1].points) rank = index + 1;
    return { ...entry, rank, winRate: Math.round(100 * entry.wins / entry.gameCount) };
  });
  return { month, timeZone: LEADERBOARD_TIME_ZONE, topCount, totalPlayers: ordered.length,
    entries, generatedAt: new Date(now).toISOString(), source: 'stored-client-results', scoringVersion: LEADERBOARD_SCORING_VERSION,
    ...(viewerId ? { myGames: myGames.sort((a, b) => b.completedAt.localeCompare(a.completedAt)) } : {}) };
}
