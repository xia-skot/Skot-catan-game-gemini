const ENTRY_ORIGIN = 'https://skot-game.onrender.com';
const TOKEN_KEY = 'catan_auth_token';
const NAME_KEY = 'catan_player_name';
const DEVICE_KEY = 'catan_guest_device_key';
export function guestDeviceKey() {
  let key = localStorage.getItem(DEVICE_KEY);
  if (!key || !/^[a-zA-Z0-9_-]{32,128}$/.test(key)) {
    key = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY, key);
  }
  return key;
}

// Cross-node invitation handoff never puts a credential in the query or server logs.
if (typeof window !== 'undefined' && window.location.hash.startsWith('#catan-session=')) {
  try {
    const data = JSON.parse(decodeURIComponent(window.location.hash.slice(15)));
    if (typeof data.token === 'string' && data.token.length < 8192) localStorage.setItem(TOKEN_KEY, data.token);
    if (typeof data.device === 'string' && /^[a-zA-Z0-9_-]{32,128}$/.test(data.device)) localStorage.setItem(DEVICE_KEY, data.device);
  } catch { /* Invalid handoffs fall back to ordinary login. */ }
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

export function navigateInvitation(origin: string, roomId: string, invitationId: string) {
  const url = new URL(origin);
  if (url.origin !== window.location.origin && !/^https:\/\/skot-game0[123]\.onrender\.com$/.test(url.origin)) throw new Error('邀请地址不受信任');
  url.pathname = '/'; url.search = ''; url.hash = '';
  url.searchParams.set('room', roomId); url.searchParams.set('invite', invitationId);
  localStorage.removeItem('catan_is_spectator');
  localStorage.removeItem('catan_active_room');
  localStorage.removeItem('catan_game_active');
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'catan:invitation-navigate', url: url.href }, ENTRY_ORIGIN);
  } else {
    if (url.origin !== window.location.origin) url.hash = 'catan-session=' + encodeURIComponent(JSON.stringify({ token: localStorage.getItem(TOKEN_KEY), device: guestDeviceKey() }));
    window.location.assign(url.href);
  }
}

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
    if (typeof event.data.guestDeviceKey === 'string' && /^[a-zA-Z0-9_-]{32,128}$/.test(event.data.guestDeviceKey)) localStorage.setItem(DEVICE_KEY, event.data.guestDeviceKey);
    if (typeof event.data.guestProof === 'string' && event.data.guestProof.length < 8192) localStorage.setItem('catan_guest_proof', event.data.guestProof);
    if (typeof token === 'string' && token.length > 20 && token.length < 8192) {
      localStorage.setItem(TOKEN_KEY, token);
      if (typeof username === 'string' && username.length <= 80) localStorage.setItem(NAME_KEY, username);
    } else {
      const existing = localStorage.getItem(TOKEN_KEY);
      if (existing) syncSessionToEntry(existing, localStorage.getItem(NAME_KEY) || '');
    }
    finish();
  });
  window.parent.postMessage({ type: 'catan:session-request', guestDeviceKey: guestDeviceKey() }, ENTRY_ORIGIN);
  window.setTimeout(finish, 1200);
}

export function waitForEntrySession() {
  return ready;
}

export function syncSessionToEntry(token: string, username: string) {
  if (window.parent === window || !token) return;
  window.parent.postMessage({ type: 'catan:session-update', token, username, guestDeviceKey: guestDeviceKey(), guestProof: localStorage.getItem('catan_guest_proof') }, ENTRY_ORIGIN);
}

export function clearEntrySession() {
  if (window.parent === window) return;
  window.parent.postMessage({ type: 'catan:session-clear' }, ENTRY_ORIGIN);
}
