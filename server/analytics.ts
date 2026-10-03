import { recordTime } from '../shared/leaderboard';

type Document = Record<string, any>;
export type Period = 'day' | 'week' | 'month';
const DAY = 86400000, OFFSET = 8 * 3600000;
export const beijingDate = (time = Date.now()) => new Date(time + OFFSET).toISOString().slice(0, 10);

export function periodStart(time: number, period: Period): number {
  const date = new Date(time + OFFSET);
  date.setUTCHours(0, 0, 0, 0);
  if (period === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  if (period === 'month') date.setUTCDate(1);
  return date.getTime() - OFFSET;
}

function shiftPeriod(start: number, period: Period, amount: number) {
  if (period !== 'month') return start + amount * DAY * (period === 'week' ? 7 : 1);
  const date = new Date(start + OFFSET);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.getTime() - OFFSET;
}

export function parseAnalyticsQuery(query: Record<string, unknown>, now = Date.now()) {
  const period = query.period ?? 'day';
  const date = query.date ?? beijingDate(now);
  if (!['day', 'week', 'month'].includes(String(period)) || typeof period !== 'string' ||
      typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期或统计周期无效');
  const time = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(time) || beijingDate(time) !== date || date < '2000-01-01' || date > beijingDate(now)) throw new Error('请选择有效日期，不能晚于今天');
  return { period: period as Period, time };
}

// Count saved completed matches independently of scoring eligibility. Room codes can be reused.
export function completedGames(records: readonly Document[], now = Date.now()) {
  const seen = new Set<string>();
  return records.filter(record => {
    const time = recordTime(record.completedAt);
    if (time === null || time > now || (record.phase && record.phase !== 'finished')) return false;
    const key = record.gameId ? `game:${record.gameId}` : record._id ? `record:${record._id}` : null;
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}

export function buildAnalytics(users: readonly Document[], records: readonly Document[], period: Period, time: number, now = Date.now()) {
  const games = completedGames(records, now);
  const times = games.map(game => recordTime(game.completedAt)!);
  const count = (start: number, end: number) => times.filter(value => value >= start && value < end).length;
  const isGuest = (user: Document) => user.isGuest === true || user.role === 'guest';
  const guests = users.filter(isGuest), registered = users.filter(user => user.isGuest === false && !isGuest(user));
  const anchor = periodStart(time, period);
  const rows = Array.from({ length: period === 'day' ? 7 : 12 }, (_, index) => {
    const start = shiftPeriod(anchor, period, -index), end = shiftPeriod(start, period, 1);
    const joined = (list: readonly Document[]) => list.filter(user => {
      const created = recordTime(user.createdAt);
      return created !== null && created >= start && created < end && created <= now;
    }).length;
    return { start: beijingDate(start), end: beijingDate(end - 1), games: count(start, end),
      registered: joined(registered), guests: joined(guests) };
  });
  return { generatedAt: new Date(now).toISOString(), period, timeZone: 'Asia/Shanghai', rows,
    totals: { registered: registered.length, guests: guests.length, games: games.length,
      today: count(periodStart(now, 'day'), now + 1), week: count(periodStart(now, 'week'), now + 1),
      month: count(periodStart(now, 'month'), now + 1) } };
}
