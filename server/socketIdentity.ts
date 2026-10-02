import jwt from 'jsonwebtoken';

/** Room identity must come from the same signed account token as HTTP requests. */
export function verifiedRoomIdentity(token: unknown, playerId: unknown, secret: string) {
  if (typeof token !== 'string' || typeof playerId !== 'string' || !playerId) return null;
  try {
    const identity = jwt.verify(token, secret);
    if (typeof identity === 'string' || identity.userId !== playerId || typeof identity.isGuest !== 'boolean') return null;
    const isGuest = identity.isGuest || identity.role === 'guest';
    return { accountId: playerId, userId: isGuest ? undefined : playerId, isGuest };
  } catch { return null; }
}
