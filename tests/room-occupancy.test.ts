import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictingRoom } from '../server/roomOccupancy';

test('unfinished seats remain occupied after leaving or autoplay', () => {
  const room = { roomId: 'old', players: [{ id: 'account', disconnected: true }], gameState: { winnerId: null } };
  assert.equal(conflictingRoom([room], 'account', 'new'), room);
  assert.equal(conflictingRoom([room], 'account', 'old'), undefined);
  assert.equal(conflictingRoom([room], 'other', 'new'), undefined);
});
test('waiting room blocks duplicates; completed or removed room releases account', () => {
  const room = { roomId: 'old', players: [{ id: 'account' }] };
  assert.equal(conflictingRoom([room], 'account', 'new'), room);
  assert.equal(conflictingRoom([{ ...room, gameState: { winnerId: 0 } }], 'account', 'new'), undefined);
  assert.equal(conflictingRoom([], 'account', 'new'), undefined);
});
