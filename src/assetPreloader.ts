import { ALL_GAME_IMAGES, SAILING_BOAT_IMG, CATAN_LOGO_IMG } from './images';
import { audioService } from './audioService';
import { loadGameImage } from './imageManager';

type ProgressCallback = (progressPercent: number, label: string) => void;
type PreloadOptions = {
  includeAudio?: boolean;
};

let isPreloaded = false;
let isPreloading = false;
let activePreloadPromise: Promise<void> | null = null;
let currentProgress = 0;
let currentLabel = '资源加载中...';
const progressListeners: ProgressCallback[] = [];

const CACHE_KEY = 'catan_assets_cached_v5';

export function isResetCacheRequested(): boolean {
  try {
    return typeof window !== 'undefined' && window.location.search.toLowerCase().includes('resetcache');
  } catch {
    return false;
  }
}

export function shouldShowAssetLoadingScreen(): boolean {
  if (isPreloaded) return false;
  if (isResetCacheRequested()) return true;
  try {
    return localStorage.getItem(CACHE_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function checkIsAssetsCached(): boolean {
  try {
    if (isResetCacheRequested()) {
      clearAssetsCache();
      return false;
    }
  } catch {}
  if (isPreloaded) return true;
  try {
    return localStorage.getItem(CACHE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function clearAssetsCache(): void {
  isPreloaded = false;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

export async function preloadAllAssets(
  onProgress?: ProgressCallback,
  options: PreloadOptions = {}
): Promise<void> {
  const isAlreadyCached = checkIsAssetsCached();
  const includeAudio = options.includeAudio === true;

  if (onProgress) {
    progressListeners.push(onProgress);
    if (isPreloading) {
      onProgress(currentProgress, currentLabel);
    }
  }

  if (isPreloading) return activePreloadPromise || Promise.resolve();
  isPreloading = true;

  const broadcastProgress = (percent: number, label: string) => {
    currentProgress = percent;
    currentLabel = label;
    progressListeners.forEach(fn => {
      try {
        fn(percent, label);
      } catch (e) {}
    });
  };

  activePreloadPromise = (async () => {
    const baseProgress = isAlreadyCached ? 70 : 5;
    const progressRange = isAlreadyCached ? 29 : 94;

    // Priority load sailboat and logo first
    broadcastProgress(baseProgress, isAlreadyCached ? '正在唤醒本地贴图...' : '正在初始化关键动画资源...');
    await Promise.allSettled([
      loadGameImage(SAILING_BOAT_IMG),
      loadGameImage(CATAN_LOGO_IMG),
    ]);

    const totalImages = ALL_GAME_IMAGES.length;
    const totalAudio = includeAudio ? 6 : 0;
    const totalAssets = totalImages + totalAudio;

    let loadedAssets = 0;

    const notifyProgress = (label: string) => {
      loadedAssets++;
      const percent = Math.min(99, Math.round(baseProgress + (loadedAssets / totalAssets) * progressRange));
      broadcastProgress(percent, label);
    };

    // Preload and decode all images into RAM. The localStorage flag only means the
    // browser likely has disk cache; each page open still needs decoded Image objects
    // before Konva can draw texture fills without blank frames.
    const imagePromises = ALL_GAME_IMAGES.map((src) => {
      return loadGameImage(src)
        .then(() => {
          notifyProgress(isAlreadyCached ? '正在恢复游戏贴图...' : '正在加载游戏贴图与图标...');
        })
        .catch((err) => {
          console.warn(`[AssetPreloader] Warning loading image ${src}:`, err);
          notifyProgress(isAlreadyCached ? '正在恢复游戏贴图...' : '正在加载游戏贴图与图标...');
        });
    });

    const assetPromises: Promise<unknown>[] = [...imagePromises];

    if (includeAudio) {
      assetPromises.push(audioService.preloadAllAudio(() => {
        notifyProgress('正在预缓存音频与音效...');
      }).catch(() => {}));
    } else {
      audioService.preloadAllAudio().catch(() => {});
    }

    await Promise.allSettled(assetPromises);

    isPreloaded = true;
    try {
      localStorage.setItem(CACHE_KEY, 'true');
    } catch {}

    broadcastProgress(100, '所有资源预加载完成');
  })().finally(() => {
    isPreloading = false;
    activePreloadPromise = null;
  });

  return activePreloadPromise;
}
