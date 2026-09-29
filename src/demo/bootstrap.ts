export async function prepareDemo() {
  const role = new URLSearchParams(location.search).get('demoRole') === 'admin' ? 'admin' : 'user';
  const response = await fetch(`/api/demo/session?role=${role}`);
  if (!response.ok) throw new Error('Demo server is unavailable');
  const { token, user } = await response.json();
  const previousId = localStorage.getItem('catan_player_id');
  if (previousId && previousId !== user.id) {
    for (const key of ['catan_active_room', 'catan_game_active', 'catan_has_created_room', 'catan_is_spectator']) localStorage.removeItem(key);
  }
  localStorage.setItem('catan_auth_token', token);
  localStorage.setItem('catan_player_id', user.id);
  localStorage.setItem('catan_player_name', user.username);
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data === 'catan-demo:reset') {
      await fetch('/api/demo/reset', { method: 'POST' });
      for (const key of Object.keys(localStorage)) if (key.startsWith('catan_')) localStorage.removeItem(key);
      location.reload();
    }
    if (event.data === 'catan-demo:clear-images') {
      const { clearAssetsCache } = await import('../assetPreloader');
      await clearAssetsCache();
      location.reload();
    }
  });
}
