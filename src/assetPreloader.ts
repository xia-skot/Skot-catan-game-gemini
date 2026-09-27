import { ALL_GAME_IMAGES } from './images';
import { audioService } from './audioService';
import { clearImageCache, getCachedImageElement, loadGameImage } from './imageManager';
import { clearMediaCache } from './assetCache';

type ProgressCallback = (progressPercent: number, label: string) => void;
export type PreloadResult = { ready: boolean; loaded: string[]; failed: string[] };
type PreloadOptions = { includeAudio?: boolean; signal?: AbortSignal };
let activePreload: Promise<PreloadResult> | null = null;
const listeners = new Set<{ callback: ProgressCallback; audio: boolean }>();
let resetTask: Promise<void> | null = null;

function notify() {
  const images = ALL_GAME_IMAGES.filter(src => getCachedImageElement(src)).length;
  listeners.forEach(({ callback, audio }) => {
    const total = ALL_GAME_IMAGES.length + (audio ? 6 : 0);
    const loaded = images + (audio ? audioService.getLoadedAudioUrls().length : 0);
    try { callback(Math.floor(loaded / total * 100), `资源加载中（${loaded}/${total}）`); } catch {}
  });
}

export const checkIsAssetsCached = () => ALL_GAME_IMAGES.every(src => !!getCachedImageElement(src));
export const shouldShowAssetLoadingScreen = () => !checkIsAssetsCached();
export const isResetCacheRequested = () => new URLSearchParams(window.location.search).has('resetcache');

export async function clearAssetsCache(): Promise<void> {
  if (activePreload) await activePreload;
  clearImageCache();
  await clearMediaCache();
}

export function preloadAllAssets(onProgress?: ProgressCallback, options: PreloadOptions = {}): Promise<PreloadResult> {
  const listener = onProgress ? { callback: onProgress, audio: !!options.includeAudio } : null;
  if (listener && !options.signal?.aborted) listeners.add(listener);
  const unsubscribe = () => { if (listener) listeners.delete(listener); };
  options.signal?.addEventListener('abort', unsubscribe, { once: true });
  if (!activePreload) {
    if (isResetCacheRequested() && !resetTask) {
      clearImageCache();
      resetTask = clearMediaCache();
      const url = new URL(location.href);
      url.searchParams.delete('resetcache');
      history.replaceState(history.state, '', url);
    }
    activePreload = (async () => {
      if (resetTask) await resetTask;
      notify();
      const results = await Promise.allSettled(ALL_GAME_IMAGES.map(src => loadGameImage(src).finally(notify)));
      const loaded = ALL_GAME_IMAGES.filter((_, i) => results[i].status === 'fulfilled');
      const failed = ALL_GAME_IMAGES.filter((_, i) => results[i].status === 'rejected');
      return { ready: failed.length === 0, loaded, failed };
    })().finally(() => { activePreload = null; });
  }
  notify();
  const result = activePreload.then(async images => {
    const audio = audioService.preloadAllAudio(notify);
    if (!options.includeAudio) { void audio.catch(() => {}); return images; }
    const sounds = await audio;
    notify();
    return { ready: images.ready && sounds.failed.length === 0, loaded: [...images.loaded, ...sounds.loaded], failed: [...images.failed, ...sounds.failed] };
  });
  return result.finally(() => {
    unsubscribe();
    options.signal?.removeEventListener('abort', unsubscribe);
  });
}
