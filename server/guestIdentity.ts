import { createHmac } from 'node:crypto';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

export async function renameGuest(users: any, id: string, name: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 30) throw new Error('INVALID_NAME');
  if (!ObjectId.isValid(id) || !await users.findOne({ _id: new ObjectId(id), isGuest: true })) throw new Error('GUEST_NOT_FOUND');
  await users.updateOne({ _id: new ObjectId(id), isGuest: true }, { $set: { username: name.trim() } });
  return { id, username: name.trim(), role: 'guest', isGuest: true };
}

export async function loginDeviceGuest(users: any, secret: string, deviceKey: unknown, name: unknown, proof?: unknown) {
  if (typeof deviceKey !== 'string' || !/^[a-zA-Z0-9_-]{32,128}$/.test(deviceKey)) throw new Error('INVALID_DEVICE');
  if (name !== undefined && (typeof name !== 'string' || name.trim().length > 30)) throw new Error('INVALID_NAME');
  if (!users) throw new Error('DATABASE_UNAVAILABLE');
  const hash = createHmac('sha256', secret).update(`guest-device:${deviceKey}`).digest('hex');
  let existing = await users.findOne({ guestDeviceHash: hash, isGuest: true });
  // A legacy account can only be adopted with a signed guest credential, never an arbitrary account ID.
  if (!existing && typeof proof === 'string') {
    try {
      const identity = jwt.verify(proof, secret, { ignoreExpiration: true }) as jwt.JwtPayload;
      if (identity.isGuest === true && typeof identity.userId === 'string' && ObjectId.isValid(identity.userId)) {
        existing = await users.findOne({ _id: new ObjectId(identity.userId), isGuest: true,
          $or: [{ guestDeviceHash: hash }, { guestDeviceHash: { $exists: false } }] });
      }
    } catch { /* Invalid credentials do not grant access to a legacy guest. */ }
  }
  const id = existing?._id || new ObjectId(hash.slice(0, 24));
  const username = typeof name === 'string' && name.trim() ? name.trim() : existing?.username || `游客-${String(id).slice(-6)}`;
  try {
    await users.updateOne({ _id: id, isGuest: true, $or: [{ guestDeviceHash: hash }, { guestDeviceHash: { $exists: false } }] }, {
      $set: { username, guestDeviceHash: hash },
      $setOnInsert: { email: `guest-${id}@guest.local`, role: 'guest', isGuest: true, createdAt: new Date() },
    }, { upsert: true });
  } catch (error: any) {
    if (error.code !== 11000) throw error;
    const winner = await users.findOne({ guestDeviceHash: hash, isGuest: true });
    if (!winner) throw error;
    return { id: String(winner._id), username: winner.username, role: 'guest', isGuest: true };
  }
  return { id: String(id), username, role: 'guest', isGuest: true };
}
