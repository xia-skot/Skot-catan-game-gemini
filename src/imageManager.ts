import { useState, useEffect } from 'react';
import { RESOLVED_IMAGE_MAP } from './images';
import { discardCachedAsset, loadAssetBlob } from './assetCache';

const images = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();
const listeners = new Set<() => void>();
const queue: Array<() => void> = [];
let active = 0;
let generation = 0;

async function withImageSlot<T>(task: () => Promise<T>): Promise<T> {
  await new Promise<void>(resolve => {
    const start = () => { active++; resolve(); };
    if (active < 4) start();
    else queue.push(start);
  });
  try { return await task(); }
  finally { active--; queue.shift()?.(); }
}

export function getCachedImageElement(src: string): HTMLImageElement | null {
  const image = images.get(src);
  return image?.complete && image.naturalWidth > 0 ? image : null;
}

export function clearImageCache(): void {
  generation++;
  images.forEach(image => URL.revokeObjectURL(image.src));
  images.clear();
  pending.clear();
  Object.keys(RESOLVED_IMAGE_MAP).forEach(key => delete RESOLVED_IMAGE_MAP[key]);
  listeners.forEach(notify => notify());
}

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) { URL.revokeObjectURL(url); reject(error); }
      else resolve(image);
    };
    const timer = setTimeout(() => finish(new Error('Image decode timed out')), 8000);
    // A successful load with dimensions is usable by both DOM and canvas.
    // Some mobile engines leave decode() pending even after onload.
    image.onload = () => finish(image.naturalWidth > 0 ? undefined : new Error('Empty image'));
    image.onerror = () => finish(new Error('Invalid image data'));
    image.src = url;
  });
}

export function loadGameImage(src: string): Promise<HTMLImageElement> {
  if (!src) return Promise.reject(new Error('Empty image source'));
  const cached = getCachedImageElement(src);
  if (cached) return Promise.resolve(cached);
  if (pending.has(src)) return pending.get(src)!;
  const startedGeneration = generation;
  const promise = withImageSlot(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const image = await decodeImage(await loadAssetBlob(src, 'image', attempt > 0));
        if (generation !== startedGeneration) {
          URL.revokeObjectURL(image.src);
          throw new Error('Image cache reset');
        }
        images.set(src, image);
        RESOLVED_IMAGE_MAP[src] = image.src;
        listeners.forEach(notify => notify());
        return image;
      } catch (error) {
        lastError = error;
        await discardCachedAsset(src);
        if (generation !== startedGeneration) break;
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    throw lastError;
  }).finally(() => {
    // Rejected requests must not poison subsequent retries.
    if (pending.get(src) === promise) pending.delete(src);
  });
  pending.set(src, promise);
  return promise;
}

export function useGameImage(src: string): { image: HTMLImageElement | null; isLoaded: boolean } {
  const [state, setState] = useState(() => ({ src, image: getCachedImageElement(src) }));
  useEffect(() => {
    const update = () => setState({ src, image: getCachedImageElement(src) });
    const load = () => { if (src) void loadGameImage(src).catch(() => {}); };
    const onVisible = () => { if (!document.hidden && !getCachedImageElement(src)) load(); };
    listeners.add(update);
    update();
    load();
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      listeners.delete(update);
      window.removeEventListener('online', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [src]);
  const image = state.src === src ? state.image : getCachedImageElement(src);
  return { image, isLoaded: !!image };
}
