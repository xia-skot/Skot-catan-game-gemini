import { ALL_GAME_IMAGES, SAILING_BOAT_IMG, CATAN_LOGO_IMG } from './images';
import { audioService } from './audioService';
import { loadGameImage, getCachedImageElement } from './imageManager';

type ProgressCallback = (progressPercent: number, label: string) => void;

let isPreloaded = false;
let isPreloading = false;
let currentProgress = 0;
let currentLabel = '资源加载中...';
const progressListeners: ProgressCallback[] = [];

const CACHE_KEY = 'catan_assets_cached_v4';

export function checkIsAssetsCached(): boolean {
  try {
    if (typeof window !== 'undefined' && window.location.search.toLowerCase().includes('resetcache')) {
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
  onProgress?: ProgressCallback
): Promise<void> {
  const isAlreadyCached = checkIsAssetsCached();

  // If already marked as cached, quickly parallel-warm the RAM cache with a fast timeout
  if (isAlreadyCached && !isPreloading) {
    // Warm key images into memory first so zero blank frames happen
    await Promise.race([
      Promise.allSettled(ALL_GAME_IMAGES.map(src => loadGameImage(src))),
      new Promise(resolve => setTimeout(resolve, 800))
    ]);
    isPreloaded = true;
    currentProgress = 100;
    if (onProgress) onProgress(100, '资源已就绪');
    audioService.preloadAllAudio().catch(() => {});
    return;
  }

  if (onProgress) {
    progressListeners.push(onProgress);
    if (isPreloading) {
      onProgress(currentProgress, currentLabel);
    }
  }

  if (isPreloading) return;
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

  // Priority load sailboat and logo first
  broadcastProgress(5, '正在初始化关键动画资源...');
  await Promise.allSettled([
    loadGameImage(SAILING_BOAT_IMG),
    loadGameImage(CATAN_LOGO_IMG),
  ]);

  const totalImages = ALL_GAME_IMAGES.length;
  const totalAudio = 6;
  const totalAssets = totalImages + totalAudio;

  let loadedAssets = 0;

  const notifyProgress = (label: string) => {
    loadedAssets++;
    const percent = Math.min(99, Math.round(5 + (loadedAssets / totalAssets) * 94));
    broadcastProgress(percent, label);
  };

  // Preload and decode all images into RAM
  const imagePromises = ALL_GAME_IMAGES.map((src) => {
    return loadGameImage(src)
      .then(() => {
        notifyProgress('正在加载游戏贴图与图标...');
      })
      .catch((err) => {
        console.warn(`[AssetPreloader] Warning loading image ${src}:`, err);
        notifyProgress('正在加载游戏贴图与图标...');
      });
  });

  // Preload audio
  const audioPromise = audioService.preloadAllAudio(() => {
    notifyProgress('正在预缓存音频与音效...');
  }).catch(() => {});

  await Promise.allSettled([...imagePromises, audioPromise]);

  isPreloaded = true;
  isPreloading = false;
  try {
    localStorage.setItem(CACHE_KEY, 'true');
  } catch {}

  broadcastProgress(100, '所有资源预加载完成');
}


