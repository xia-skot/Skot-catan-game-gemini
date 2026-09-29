const ENTRY_ORIGIN = 'https://skot-game.onrender.com';
const TOKEN_KEY = 'catan_auth_token';
const NAME_KEY = 'catan_player_name';

let resolveReady: () => void = () => {};
let settled = false;
const ready = new Promise<void>(resolve => { resolveReady = resolve; });

function finish() {
  if (settled) return;
  settled = true;
  resolveReady();
}

if (typeof window === 'undefined' || window.parent === window) {
  finish();
} else {
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== ENTRY_ORIGIN || event.data?.type !== 'catan:session-response') return;
    const token = event.data.token;
    const username = event.data.username;
    if (typeof token === 'string' && token.length > 20 && token.length < 8192) {
      localStorage.setItem(TOKEN_KEY, token);
      if (typeof username === 'string' && username.length <= 80) localStorage.setItem(NAME_KEY, username);
    } else {
      const existing = localStorage.getItem(TOKEN_KEY);
      if (existing) syncSessionToEntry(existing, localStorage.getItem(NAME_KEY) || '');
    }
    finish();
  });
  window.parent.postMessage({ type: 'catan:session-request' }, ENTRY_ORIGIN);
  window.setTimeout(finish, 1200);
}

export function waitForEntrySession() {
  return ready;
}

export function syncSessionToEntry(token: string, username: string) {
  if (window.parent === window || !token) return;
  window.parent.postMessage({ type: 'catan:session-update', token, username }, ENTRY_ORIGIN);
}

export function clearEntrySession() {
  if (window.parent === window) return;
  window.parent.postMessage({ type: 'catan:session-clear' }, ENTRY_ORIGIN);
}
