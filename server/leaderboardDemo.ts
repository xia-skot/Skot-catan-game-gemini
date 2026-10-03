import { ObjectId } from 'mongodb';
import { computeLeaderboardUserStats } from './leaderboard';
import { DEFAULT_LEADERBOARD_TOP_COUNT } from '../shared/leaderboard';
import type { LeaderboardStore } from './leaderboardRoutes';

/** Isolated demo data. Register using the SAME authentication/admin middleware as production. */
export function createDemoLeaderboardStore(now = () => Date.now()) {
  let topCount = DEFAULT_LEADERBOARD_TOP_COUNT;
  const userIds = ['111111111111111111111111', '444444444444444444444444', '555555555555555555555555'];
  const users = userIds.map((id, index) => ({ _id: new ObjectId(id), username: ['体验玩家', '海岛玩家', '演示管理员'][index],
    email: `leaderboard-${index}@example.test`, isGuest: false, role: index === 2 ? 'admin' : 'user',
    createdAt: new Date(Date.UTC(2025, index, 1)) }));
  function games() {
    return [0, 1, 2].map(index => ({ gameId: `demo-monthly-${index}`, identityVersion: 1, roomId: 'DEMO',
      mapType: 'standard', winnerId: index % 2, turnCount: 20 + index, completedAt: new Date(now() - index * 48 * 3600000),
      players: [
        { id: 0, name: users[0].username, userId: userIds[0], sessionId: 'demo-seat-0', isOriginalBot: false, isBot: false, score: index % 2 ? 8 : 10 },
        { id: 1, name: users[1].username, userId: userIds[1], sessionId: 'demo-seat-1', isOriginalBot: false, isBot: true, score: index % 2 ? 10 : 8 },
        { id: 2, name: 'AI', userId: null, sessionId: null, isOriginalBot: true, isBot: true, score: 6 },
      ] }));
  }
  const store: LeaderboardStore = {
    readRecords: async () => ({ games: games(), users }),
    readTopCount: async () => topCount,
    writeTopCount: async count => { topCount = count; },
  };
  return { store, reset: () => { topCount = DEFAULT_LEADERBOARD_TOP_COUNT; }, users,
    stats: () => {
      const records = games(), computed = computeLeaderboardUserStats(records, users, now());
      const allUsers = users.map(user => ({ ...user, ...computed.get(String(user._id)) }));
      const allGuests = [{ _id: '666666666666666666666666', username: '体验游客', isGuest: true, role: 'guest', createdAt: new Date(now()), totalGames: 0, wins: 0, winRate: 0, recent3DayGames: 0 }];
      return { stats: { users: users.length, guests: allGuests.length, games: records.length }, settings: { maxVisibleRooms: 10 },
        allUsers, allGuests, latestUsers: allUsers, latestGames: records };
    },
  };
}
