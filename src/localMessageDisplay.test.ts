import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationIsHidden, messageDisplayAccount, messageDisplayStorageKey, readMessageDisplay, updateMessageDisplay, visibleConversationMessages } from './localMessageDisplay.ts';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test('hiding survives serialized reload, changes no records, and new IDs resurface even with older/equal timestamps', () => {
  const store = storage();
  const messages = Object.freeze([{ id: 'old', createdAt: 100, content: 'retained' }]);
  updateMessageDisplay('hide-test', 'admin', 'hide', messages, store);
  const display = readMessageDisplay('hide-test', store).admin;
  assert.equal(conversationIsHidden(display, messages), true);
  assert.deepEqual(visibleConversationMessages(display, messages), messages);
  assert.equal(conversationIsHidden(display, [...messages, { id: 'new', createdAt: 100 }]), false);
  assert.equal(conversationIsHidden(display, [...messages, { id: 'delayed', createdAt: 50 }]), false);
  updateMessageDisplay('hide-test', 'admin', 'reveal', [], store);
  assert.equal(conversationIsHidden(readMessageDisplay('hide-test', store).admin, messages), false);
  assert.equal(messages[0].content, 'retained');
});

test('clear hides only known IDs, accumulates snapshots, and remains independent of hiding and other conversations/accounts', () => {
  const store = storage();
  const old = [{ id: 'a' }, { id: 'b' }];
  updateMessageDisplay('clear-test', 'one', 'clear', old, store);
  updateMessageDisplay('clear-test', 'one', 'hide', old, store);
  updateMessageDisplay('clear-test', 'one', 'reveal', [], store);
  assert.deepEqual(visibleConversationMessages(readMessageDisplay('clear-test', store).one, [...old, { id: 'c' }]), [{ id: 'c' }]);
  updateMessageDisplay('clear-test', 'one', 'clear', [{ id: 'c' }], store);
  const state = readMessageDisplay('clear-test', store);
  assert.deepEqual(visibleConversationMessages(state.one, [...old, { id: 'c' }]), []);
  assert.deepEqual(visibleConversationMessages(state.two, old), old);
  assert.deepEqual(readMessageDisplay('different-account', store), {});
});

test('empty roster conversations stay hidden until a message arrives', () => {
  const store = storage();
  updateMessageDisplay('empty-test', 'player:empty', 'hide', [], store);
  const display = readMessageDisplay('empty-test', store)['player:empty'];
  assert.equal(conversationIsHidden(display, []), true);
  assert.equal(conversationIsHidden(display, [{ id: 'first' }]), false);
});

test('stable account IDs preserve display preferences across renames and separate identically named users', () => {
  assert.equal(messageDisplayAccount({ id: 'one', username: 'before' }), messageDisplayAccount({ id: 'one', username: 'after' }));
  assert.notEqual(messageDisplayAccount({ id: 'one', username: 'same' }), messageDisplayAccount({ id: 'two', username: 'same' }));
  assert.notEqual(messageDisplayAccount({ username: 'one' }), messageDisplayAccount({ id: 'one' }));
});

test('malformed local data is tolerated and missing IDs are never silently hidden', () => {
  const store = storage();
  store.setItem(messageDisplayStorageKey('malformed-test'), '{bad json');
  assert.deepEqual(readMessageDisplay('malformed-test', store), {});
  store.setItem(messageDisplayStorageKey('malformed-test'), JSON.stringify({ version: 1, conversations: [['admin', { hiddenMessageIds: [null], clearedMessageIds: 'all' }]] }));
  assert.deepEqual(readMessageDisplay('malformed-test', store), { admin: {} });
  assert.equal(conversationIsHidden({ hiddenMessageIds: [] }, [{}]), false);
  assert.deepEqual(visibleConversationMessages({ clearedMessageIds: ['known'] }, [{}]), [{}]);
});

test('storage failure is reported while keeping the session usable, then persistence can recover', () => {
  const store = storage();
  updateMessageDisplay('failure-test', 'admin', 'clear', [{ id: 'old' }], store);
  const blocked = { getItem: store.getItem, setItem: () => { throw new Error('quota'); } };
  assert.equal(updateMessageDisplay('failure-test', 'admin', 'clear', [{ id: 'new' }], blocked).persisted, false);
  assert.deepEqual(visibleConversationMessages(readMessageDisplay('failure-test', blocked).admin, [{ id: 'old' }, { id: 'new' }]), []);
  assert.equal(updateMessageDisplay('failure-test', 'admin', 'reveal', [], store).persisted, true);
  assert.deepEqual(readMessageDisplay('failure-test', store).admin.clearedMessageIds, ['old', 'new']);
});
