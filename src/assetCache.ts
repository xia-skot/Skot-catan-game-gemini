import manifest from './assetManifest.json';

const CACHE_PREFIX = 'catan-media-';
const CACHE_NAME = `${CACHE_PREFIX}${manifest.version}`;
let cachePromise: Promise<Cache | null> | undefined;

async function mediaCache(): Promise<Cache | null> {
  if (!cachePromise) {
    cachePromise = (async () => {
      if (!('caches' in window)) return null;
      const cache = await caches.open(CACHE_NAME);
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
      return cache;
    })().catch(() => null);
  }
  return cachePromise;
}

export async function discardCachedAsset(src: string): Promise<void> {
  const cache = await mediaCache();
  await cache?.delete(src).catch(() => false);
}

export async function clearMediaCache(): Promise<void> {
  const cache = await mediaCache();
  if (cache) await Promise.all((await cache.keys()).map(key => cache.delete(key)));
}

export async function loadAssetBlob(src: string, mediaType: 'image' | 'audio', reload = false): Promise<Blob> {
  const cache = await mediaCache();
  if (!reload && cache) {
    const cached = await cache.match(src).catch(() => undefined);
    if (cached?.ok && cached.headers.get('content-type')?.startsWith(`${mediaType}/`)) {
      try {
        const blob = await cached.blob();
        if (blob.size) return blob;
      } catch {}
      await cache.delete(src).catch(() => false);
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(src, { signal: controller.signal, cache: reload ? 'reload' : 'default' });
    if (!response.ok || !response.headers.get('content-type')?.startsWith(`${mediaType}/`)) {
      throw new Error(`Invalid ${mediaType} response: ${response.status} ${src}`);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error(`Empty asset: ${src}`);
    if (cache) await cache.put(src, new Response(blob, { headers: { 'Content-Type': blob.type } })).catch(() => {});
    return blob;
  } finally {
    clearTimeout(timer);
  }
}
