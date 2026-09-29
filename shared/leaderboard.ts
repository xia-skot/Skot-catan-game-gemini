export const LEADERBOARD_TIME_ZONE = 'Asia/Shanghai';
export const DEFAULT_LEADERBOARD_TOP_COUNT = 20;
export const MAX_LEADERBOARD_TOP_COUNT = 100;
export const LEADERBOARD_SCORING_VERSION = 'rank-points-v15';

export interface LeaderboardGamePoints {
  roomId: string;
  completedAt: string;
  rank: number;
  playerCount: number;
  points: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  points: number;
  gameCount: number;
  wins: number;
  winRate: number;
}

export interface MonthlyLeaderboard {
  month: string;
  timeZone: typeof LEADERBOARD_TIME_ZONE;
  topCount: number;
  totalPlayers: number;
  entries: LeaderboardEntry[];
  generatedAt: string;
  source: 'stored-client-results';
  scoringVersion: string;
  myGames?: LeaderboardGamePoints[];
}

export type PlayerSortField = 'createdAt' | 'winRate' | 'totalGames' | 'recent3DayGames';
export type SortDirection = 'asc' | 'desc';

export function isLeaderboardTopCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_LEADERBOARD_TOP_COUNT;
}

export function shanghaiMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEADERBOARD_TIME_ZONE, year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`;
}

export function monthBounds(month: string): { start: number; end: number } {
  if (!/^[2-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid calendar month');
  const [year, number] = month.split('-').map(Number);
  // Shanghai has used UTC+08:00 without DST throughout the supported years (2000+).
  return { start: Date.UTC(year, number - 1, 1, -8), end: Date.UTC(year, number, 1, -8) };
}

export function shiftMonth(month: string, delta: number): string {
  monthBounds(month);
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function recordTime(value: unknown): number | null {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return null;
  // Stored ISO dates must carry an offset, never depend on the server's local timezone.
  if (typeof value === 'string' && !/(Z|[+-]\d\d:\d\d)$/i.test(value)) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

export function sortAdminPlayers<T extends {
  _id?: unknown; username?: string; createdAt?: unknown;
  winRate?: number; totalGames?: number; recent3DayGames?: number;
}>(players: readonly T[], field: PlayerSortField, direction: SortDirection): T[] {
  const value = (player: T) => field === 'createdAt' ? recordTime(player.createdAt) :
    typeof player[field] === 'number' && Number.isFinite(player[field]) ? player[field] as number : null;
  return [...players].sort((a, b) => {
    const left = value(a), right = value(b);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    if (left !== null && right !== null && left !== right) return (left - right) * (direction === 'asc' ? 1 : -1);
    return (a.username || '').localeCompare(b.username || '', 'zh-CN') || String(a._id || '').localeCompare(String(b._id || ''));
  });
}
