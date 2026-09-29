export interface ConversationDisplay {
  hiddenMessageIds?: string[];
  clearedMessageIds?: string[];
}

export type MessageDisplayState = Record<string, ConversationDisplay>;
type MessageIdentity = { id?: string };
type DisplayStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const MESSAGE_DISPLAY_EVENT = 'catan:message-display';
const memory = new Map<string, MessageDisplayState>();
const volatileAccounts = new Set<string>();

export function messageDisplayAccount(user: { id?: string; _id?: string; userId?: string; username?: string }): string {
  const id = user.id || user._id || user.userId;
  return id ? `id:${id}` : `name:${user.username || ''}`;
}

export function messageDisplayStorageKey(account: string): string {
  return `catan_message_display_v1:${encodeURIComponent(account)}`;
}

function validIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0);
}

export function readMessageDisplay(account: string, storage?: DisplayStorage): MessageDisplayState {
  if (volatileAccounts.has(account)) return memory.get(account) || {};
  try {
    const raw = (storage || localStorage).getItem(messageDisplayStorageKey(account));
    if (!raw) { memory.delete(account); return {}; }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.conversations)) return {};
    const entries: [string, ConversationDisplay][] = [];
    for (const entry of parsed.conversations) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !entry[1] || typeof entry[1] !== 'object') continue;
      const value: ConversationDisplay = {};
      if (validIds(entry[1].hiddenMessageIds)) value.hiddenMessageIds = entry[1].hiddenMessageIds;
      if (validIds(entry[1].clearedMessageIds)) value.clearedMessageIds = entry[1].clearedMessageIds;
      entries.push([entry[0], value]);
    }
    const state = Object.fromEntries(entries);
    memory.set(account, state);
    return state;
  } catch {
    return memory.get(account) || {};
  }
}

export function conversationIsHidden<T extends MessageIdentity>(display: ConversationDisplay | undefined, messages: readonly T[]): boolean {
  if (!display?.hiddenMessageIds) return false;
  const seen = new Set(display.hiddenMessageIds);
  // Exact IDs allow delayed messages and messages sharing a timestamp to resurface.
  return messages.every(message => !!message.id && seen.has(message.id));
}

export function visibleConversationMessages<T extends MessageIdentity>(display: ConversationDisplay | undefined, messages: readonly T[]): T[] {
  const cleared = new Set(display?.clearedMessageIds);
  return messages.filter(message => !message.id || !cleared.has(message.id));
}

export function updateMessageDisplay(
  account: string,
  conversation: string,
  action: 'hide' | 'clear' | 'reveal',
  messages: readonly MessageIdentity[] = [],
  storage?: DisplayStorage,
): { state: MessageDisplayState; persisted: boolean } {
  const state = readMessageDisplay(account, storage);
  const previous = Object.hasOwn(state, conversation) ? state[conversation] : {};
  const next = { ...previous };
  const ids = messages.flatMap(message => message.id ? [message.id] : []);
  if (action === 'hide') next.hiddenMessageIds = [...new Set(ids)];
  if (action === 'clear') next.clearedMessageIds = [...new Set([...(next.clearedMessageIds || []), ...ids])];
  if (action === 'reveal') delete next.hiddenMessageIds;
  const updated = { ...state, [conversation]: next };
  memory.set(account, updated);
  let persisted = true;
  try {
    (storage || localStorage).setItem(messageDisplayStorageKey(account), JSON.stringify({ version: 1, conversations: Object.entries(updated) }));
    volatileAccounts.delete(account);
  } catch {
    persisted = false;
    volatileAccounts.add(account);
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(MESSAGE_DISPLAY_EVENT, { detail: { account } }));
  return { state: updated, persisted };
}
