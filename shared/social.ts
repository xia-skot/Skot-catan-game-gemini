export const GIFTS = ['flower', 'coffee', 'egg', 'pan'] as const;
export const CAPTAIN_EMOTES = ['please', 'laugh', 'smug', 'cry', 'angry', 'tongue', 'bored', 'giggle'] as const;
// Accept an in-flight reaction from older clients during a rolling deployment.
export const EMOTES = [...CAPTAIN_EMOTES, 'handshake'] as const;
export type ReactionKind = typeof GIFTS[number] | typeof EMOTES[number];
export interface RoomInvitation { id: string; roomId: string; origin: string; hostName: string; recipientId: string; expiresAt: number }
export interface RoomReaction { id: string; roomId: string; actorId: string; actorName: string; targetId: string; kind: ReactionKind; createdAt: number }
export function freeSeats(room: any) {
  return !room || room.gameState ? 0 : Math.max(0, (room.settings?.playerCount || 4) - room.players.length - (room.settings?.botConfig || []).filter(Boolean).length);
}
export function groupOnline(sessions: any[]) {
  const priority: Record<string, number> = { idle: 0, spectating: 1, waiting: 2, playing: 3 };
  const users = new Map<string, any>();
  for (const session of sessions) {
    const old = users.get(session.accountId);
    if (!old || priority[session.status] > priority[old.status]) users.set(session.accountId, session);
  }
  return [...users.values()];
}
