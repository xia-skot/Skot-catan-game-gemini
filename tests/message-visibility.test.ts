import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadMessage } from '../server/messageVisibility';

test('guest mail is private to its stable account ID, not its editable name', () => {
  const id = '666666666666666666666666';
  const message = { type: 'private', targetUserId: id, targetUserName: 'same', senderId: '555555555555555555555555', senderName: 'Admin' };
  assert.equal(canReadMessage(message, { id, name: 'renamed', guest: true, admin: false }), true);
  for (const guest of [true, false]) assert.equal(canReadMessage(message, { id: '111111111111111111111111', name: 'same', guest, admin: false }), false);
  assert.equal(canReadMessage(message, { id: null, name: null, guest: false, admin: false }), false);
  assert.equal(canReadMessage(message, { id: 'admin', name: 'Admin', guest: false, admin: true }), true);
});

test('only authenticated registered accounts retain legacy name-only mail compatibility', () => {
  const message = { type: 'private', targetUserId: 'legacy' };
  assert.equal(canReadMessage(message, { id: 'user', name: 'legacy', guest: false, admin: false }), true);
  assert.equal(canReadMessage(message, { id: 'guest', name: 'legacy', guest: true, admin: false }), false);
  assert.equal(canReadMessage({ type: 'system' }, { id: null, name: null, guest: true, admin: false }), true);
});
