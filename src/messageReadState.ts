const memory = new Map<string, Set<string>>();
export const MESSAGE_READ_EVENT = 'catan:messages-read';

export function readMessageIds(username = 'user'): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(`catan_read_msgs_${username}`) || '[]');
    const ids = new Set<string>(Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []);
    memory.get(username)?.forEach(id => ids.add(id));
    return ids;
  } catch { return new Set(memory.get(username)); }
}

export function markMessagesRead(username: string, ids: string[]): void {
  const read = readMessageIds(username);
  ids.forEach(id => read.add(id));
  memory.set(username, read);
  try { localStorage.setItem(`catan_read_msgs_${username}`, JSON.stringify([...read])); } catch {}
  window.dispatchEvent(new CustomEvent(MESSAGE_READ_EVENT, { detail: { username } }));
}
