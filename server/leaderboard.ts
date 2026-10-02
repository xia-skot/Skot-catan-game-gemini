import {
  DEFAULT_LEADERBOARD_TOP_COUNT, isLeaderboardTopCount, LEADERBOARD_TIME_ZONE,
  monthBounds, recordTime, LEADERBOARD_SCORING_VERSION, type MonthlyLeaderboard, type LeaderboardGamePoints,
} from '../shared/leaderboard';
import { recordedPlayerScore, storedResultRankPoints } from '../shared/gameResult';

type StoredDocument = Record<string, any>;
interface Participant { id: string; name: string; isBot: boolean; isGuest: boolean; score: number; userId: string | null; sessionId: string | null; autoplayMs?: number; rankAward?: { rank: number; points: number } }
interface EligibleGame { roomId: string; completedAt: number; winnerId: string; players: Participant[]; stableIdentity: boolean; identityVersion?: number; durationMs?: number; scoringVersion?: string; record: StoredDocument }
export interface LeaderboardUserStats { totalGames: number; wins: number; winRate: number; recent3DayGames: number }

const normalizeName = (value: string) => value.trim().toLowerCase();
const isRegistered = (user?: StoredDocument): user is StoredDocument => !!user?._id && user.isGuest === false && user.role !== 'guest';
const seatId = (value: unknown): string | null =>
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
  (typeof value === 'string' && value.trim().length > 0) ? String(value) : null;

/** v17 captured identities before the opening dice reordered seats. Repair only complete, unambiguous permutations. */
export function repairLegacySeatAttribution(record: StoredDocument, users: readonly StoredDocument[]): StoredDocument {
  if (record?.accountBindingVersion === 1 || record?.identityVersion !== 1 || record.scoringVersion || !Array.isArray(record.players)) return record;
  const completedAt = recordTime(record.completedAt);
  if (completedAt === null) return record;
  const names = new Map<string, StoredDocument[]>();
  for (const user of users) if (typeof user.username === 'string' && user.username.trim()) {
    const key = normalizeName(user.username);
    names.set(key, [...(names.get(key) || []), user]);
  }
  const linked = record.players.map((player: any) => player?.userId).filter((id: unknown): id is string => typeof id === 'string' && !!id);
  if (new Set(linked).size !== linked.length) return record;
  if (!linked.length) return record;
  const matched: Array<StoredDocument | null> = [];
  for (const player of record.players) {
    if (!player || typeof player.name !== 'string') return record;
    const candidates = names.get(normalizeName(player.name)) || [];
    if (candidates.length === 1 && candidates[0].isGuest === false && candidates[0].role !== 'guest' &&
        recordTime(candidates[0].createdAt) !== null && recordTime(candidates[0].createdAt)! <= completedAt) {
      matched.push(candidates[0]);
    } else if (candidates.length === 0 && /^领主 AI \d+$/.test(player.name.trim())) {
      matched.push(null);
    } else return record;
  }
  const actual = matched.filter(Boolean).map(user => String(user!._id));
  if (actual.length !== linked.length || new Set(actual).size !== actual.length ||
      !actual.every(id => linked.includes(id))) return record;
  if (record.players.every((player: any, index: number) =>
    (matched[index] ? player.userId === String(matched[index]._id) && player.isOriginalBot === false : player.isOriginalBot === true))) return record;
  return { ...record, attributionRepair: 'legacy-seat-order', players: record.players.map((player: any, index: number) => ({ ...player,
    userId: matched[index] ? String(matched[index]._id) : null,
    isOriginalBot: !matched[index], isGuest: !matched[index], sessionId: null, autoplayMs: undefined })) };
}

function normalizeGame(record: StoredDocument, now: number): EligibleGame | null {
  const completedAt = recordTime(record.completedAt);
  if (completedAt === null || completedAt > now || !Array.isArray(record.players) ||
      (record.phase !== undefined && record.phase !== 'finished') ||
      (record.mapType !== 'standard' && record.mapType !== 'archipelago')) return null;
  const players: Participant[] = [];
  const stableIdentity = record.identityVersion === 1 || record.identityVersion === 2;
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
      rankAward: player.rankAward,
      userId: typeof player.userId === 'string' && player.userId ? player.userId : null,
      sessionId: typeof player.sessionId === 'string' && player.sessionId ? player.sessionId : null });
  }
  if (players.length < 2 || new Set(players.map(player => player.id)).size !== players.length) return null;
  const winnerId = seatId(record.winnerId);
  const winner = players.find(player => player.id === winnerId);
  const target = record.mapType === 'standard' ? 10 : 14;
  if (!winner || winner.score < target || players.some(player => player.score > winner.score)) return null;
  return { roomId: String(record.roomId || ''), completedAt, winnerId: winner.id, players, stableIdentity,
    identityVersion: record.identityVersion, scoringVersion: record.scoringVersion, record,
    durationMs: stableIdentity && Number.isFinite(record.durationMs) && record.durationMs > 0 ? record.durationMs : undefined };
}

/** Older records have no per-game ID. Collapse identical room outcomes conservatively. */
export function eligibleLeaderboardGames(records: readonly StoredDocument[], now = Date.now(), users: readonly StoredDocument[] = []): EligibleGame[] {
  const groups = new Map<string, { game: EligibleGame | null; signature: string; conflict: boolean }>();
  for (const raw of records) {
    if (!raw || typeof raw !== 'object') continue;
    const record = users.length ? repairLegacySeatAttribution(raw, users) : raw;
    const game = normalizeGame(record, now);
    const explicitId = typeof record.gameId === 'string' && record.gameId.trim() ? record.gameId : null;
    // The producer, not an HTTP request, must supply any future gameId. Current records use this legacy key.
    if (!game && !explicitId) continue;
    const roster = game?.players.map(player => [player.id, player.name, player.isBot, player.isGuest, player.score, player.userId, player.sessionId, player.autoplayMs, player.rankAward])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const signature = JSON.stringify([record.mapType, record.turnCount, game?.winnerId, game?.stableIdentity, game?.durationMs, game?.scoringVersion, record.accountBindingVersion, roster]);
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
  // Historical results predate reliable socket identity. Match those against
  // registered accounts only; a guest with the same nickname must not veto credit.
  const names = new Map<string, StoredDocument[]>();
  const ids = new Map(users.filter(isRegistered).map(user => [String(user._id), user]));
  for (const user of users) {
    if (!isRegistered(user) || typeof user.username !== 'string' || !user.username.trim()) continue;
    const key = normalizeName(user.username);
    names.set(key, [...(names.get(key) || []), user]);
  }
  return (player: Participant, game: EligibleGame): StoredDocument | null => {
    if (player.isBot) return null;
    const linked = player.userId ? ids.get(player.userId) : undefined;
    if (game.record.accountBindingVersion === 1) return player.isGuest ? null : linked || null;
    if (linked) return linked;
    const candidates = names.get(player.name) || [];
    return candidates.length === 1 ? candidates[0] : null;
  };
}

function creditedPlayers(game: EligibleGame, resolve: ReturnType<typeof accountResolver>) {
  const matched = game.players.map(player => ({ player, user: resolve(player, game) }));
  const counts = new Map<string, number>();
  for (const { user } of matched) if (user) counts.set(String(user._id), (counts.get(String(user._id)) || 0) + 1);
  return matched.filter(({ user }) => user && counts.get(String(user._id)) === 1);
}

/** One settlement ledger feeds history, user statistics and monthly aggregation. */
function settledGames(records: readonly StoredDocument[], users: readonly StoredDocument[], now: number) {
  const resolve = accountResolver(users);
  return eligibleLeaderboardGames(records, now, users).map(game => ({ game,
    credits: creditedPlayers(game, resolve).map(entry => ({ ...entry,
      award: storedResultRankPoints(game.players, entry.player, game) })),
  }));
}

export function computeLeaderboardUserStats(records: readonly StoredDocument[], users: readonly StoredDocument[], now = Date.now()) {
  const stats = new Map<string, LeaderboardUserStats>();
  for (const user of users) if (user._id && user.isGuest === false) {
    stats.set(String(user._id), { totalGames: 0, wins: 0, winRate: 0, recent3DayGames: 0 });
  }
  for (const { game, credits } of settledGames(records, users, now)) {
    for (const { user, player } of credits) {
      const row = stats.get(String(user!._id))!;
      row.totalGames++;
      if (player.id === game.winnerId) row.wins++;
      if (game.completedAt >= now - 72 * 60 * 60 * 1000) row.recent3DayGames++;
    }
  }
  for (const row of stats.values()) row.winRate = row.totalGames ? Math.round(100 * row.wins / row.totalGames) : 0;
  return stats;
}

/** History and monthly totals use the same eligible matches, account resolver and stored awards. */
export function buildAccountGameHistory(records: readonly StoredDocument[], users: readonly StoredDocument[],
  userId: string, now = Date.now()) {
  const matches = settledGames(records, users, now).flatMap(({ game, credits }) => {
    const credited = credits.find(entry => String(entry.user!._id) === userId);
    return credited ? [{ game, player: credited.player, credits }] : [];
  }).sort((a, b) => b.game.completedAt - a.game.completedAt);
  const games: StoredDocument[] = matches.map(({ game, player, credits }) => ({ ...game.record,
    rankingStatus: 'counted',
    viewerPlayerId: player.id, scoringVersion: LEADERBOARD_SCORING_VERSION,
    players: game.players.map(participant => ({
      ...game.record.players.find((raw: any) => String(raw.id) === participant.id),
      isOriginalBot: participant.isBot,
      rankAward: storedResultRankPoints(game.players, participant, game),
      leaderboardUserId: credits.find(entry => entry.player.id === participant.id)?.user?._id?.toString() || null,
    })) }));
  const account = users.find(user => String(user._id) === userId);
  // Preserve unresolved history for review instead of making it disappear to
  // match the leaderboard. Never silently turn an attribution failure into 0 points.
  const key = (record: StoredDocument) => record.gameId ? `id:${record.gameId}` : JSON.stringify([
    record.roomId, record.turnCount, record.mapType, record.winnerId,
    record.players?.map((player: any) => [String(player.id), player.name, recordedPlayerScore(player)])
      .sort((a: any[], b: any[]) => a[0].localeCompare(b[0])),
  ]);
  const shown = new Set(games.map(key));
  for (const record of records) {
    if (shown.has(key(record)) || !Array.isArray(record.players) || !account) continue;
    const candidates = record.players.filter((player: any) => player && (player.userId === userId ||
      ((!player.userId || !record.identityVersion) && typeof player.name === 'string' &&
        normalizeName(player.name) === normalizeName(account.username || ''))));
    if (!candidates.length) continue;
    const normalized = normalizeGame(record, now);
    const rankingReason = !normalized ? '对局结算数据不完整，待核对' :
      candidates.length !== 1 ? '本局存在重复的玩家身份，待核对' :
      candidates[0].userId === userId && !candidates[0].isGuest ? '重复结算或账号时间信息不一致，待核对' : '本局账号关联信息缺失或不一致，待核对';
    games.push({ ...record, rankingStatus: 'pending', rankingReason, resultValid: !!normalized,
      viewerPlayerId: candidates.length === 1 ? String(candidates[0].id) : undefined });
    shown.add(key(record));
  }
  games.sort((a, b) => (recordTime(b.completedAt) || 0) - (recordTime(a.completedAt) || 0));
  const wins = games.filter(game => game.viewerPlayerId != null && String(game.winnerId) === game.viewerPlayerId).length;
  return { games, stats: { totalGames: games.length, wins, winRate: games.length ? Math.round(100 * wins / games.length) : 0 } };
}

export function buildMonthlyLeaderboard(records: readonly StoredDocument[], users: readonly StoredDocument[],
  month: string, topCount = DEFAULT_LEADERBOARD_TOP_COUNT, now = Date.now(), viewerId?: string): MonthlyLeaderboard {
  if (!isLeaderboardTopCount(topCount)) throw new Error('Invalid leaderboard top count');
  const { start, end } = monthBounds(month);
  const totals = new Map<string, { userId: string; username: string; points: number; gameCount: number; wins: number }>();
  const myGames: LeaderboardGamePoints[] = [];
  // Deduplicate BEFORE the month filter so a retried write across midnight cannot score twice.
  for (const { game, credits } of settledGames(records, users, now)) {
    if (game.completedAt < start || game.completedAt >= end) continue;
    for (const { user, player, award } of credits) {
      const userId = String(user!._id);
      const row = totals.get(userId) || { userId, username: user!.username, points: 0, gameCount: 0, wins: 0 };
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
