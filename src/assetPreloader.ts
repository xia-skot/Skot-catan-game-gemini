import { ALL_GAME_IMAGES } from './images';
import { audioService } from './audioService';
import { clearImageCache, getCachedImageElement, loadGameImage } from './imageManager';
import { clearMediaCache } from './assetCache';

type ProgressCallback = (progressPercent: number, label: string) => void;
export type PreloadResult = { ready: boolean; loaded: string[]; failed: string[] };
type PreloadOptions = { includeAudio?: boolean; signal?: AbortSignal };
let activePreload: Promise<PreloadResult> | null = null;
const listeners = new Set<ProgressCallback>();
let resetTask: Promise<void> | null = null;

export const checkIsAssetsCached = () => ALL_GAME_IMAGES.every(src => !!getCachedImageElement(src));
export const shouldShowAssetLoadingScreen = () => !checkIsAssetsCached();
export const isResetCacheRequested = () => new URLSearchParams(window.location.search).has('resetcache');

export async function clearAssetsCache(): Promise<void> {
  if (activePreload) await activePreload;
  clearImageCache();
  await clearMediaCache();
}

export function preloadAllAssets(onProgress?: ProgressCallback, options: PreloadOptions = {}): Promise<PreloadResult> {
  if (onProgress && !options.signal?.aborted) listeners.add(onProgress);
  const unsubscribe = () => { if (onProgress) listeners.delete(onProgress); };
  options.signal?.addEventListener('abort', unsubscribe, { once: true });
  const notify = () => {
    const loaded = ALL_GAME_IMAGES.filter(src => getCachedImageElement(src)).length;
    const percent = Math.floor(loaded / ALL_GAME_IMAGES.length * 100);
    const label = loaded === ALL_GAME_IMAGES.length ? '贴图已就绪' : `正在补齐贴图（${loaded}/${ALL_GAME_IMAGES.length}）`;
    listeners.forEach(fn => { try { fn(percent, label); } catch {} });
  };
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
  const audio = audioService.preloadAllAudio();
  const result = options.includeAudio ? activePreload.then(async result => { await audio; return result; }) : activePreload;
  void audio.catch(() => {});
  return result.finally(() => {
    unsubscribe();
    options.signal?.removeEventListener('abort', unsubscribe);
  });
}
