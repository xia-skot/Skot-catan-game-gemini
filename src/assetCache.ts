import manifest from './assetManifest.json';

const CACHE_PREFIX = 'catan-media-';
const CACHE_NAME = `${CACHE_PREFIX}${manifest.version}`;
let cachePromise: Promise<Cache | null> | undefined;
const blobs = new Map<string, Blob>();
const requests = new Map<string, Promise<Blob>>();

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
  blobs.delete(src);
  const cache = await mediaCache();
  await cache?.delete(src).catch(() => false);
}

export async function clearMediaCache(): Promise<void> {
  blobs.clear();
  const cache = await mediaCache();
  if (cache) await Promise.all((await cache.keys()).map(key => cache.delete(key)));
}

async function readAssetBlob(src: string, mediaType: 'image' | 'audio', reload = false): Promise<Blob> {
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
  // The bundled BGM can take over 12 seconds on mobile connections.
  // Keep a finite deadline without aborting otherwise valid slow downloads.
  const timer = setTimeout(() => controller.abort(), mediaType === 'audio' ? 60000 : 30000);
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

export function loadAssetBlob(src: string, mediaType: 'image' | 'audio', reload = false): Promise<Blob> {
  if (!reload && blobs.has(src)) return Promise.resolve(blobs.get(src)!);
  if (requests.has(src)) return requests.get(src)!;
  const request = readAssetBlob(src, mediaType, reload).then(blob => {
    blobs.set(src, blob);
    return blob;
  }).finally(() => { if (requests.get(src) === request) requests.delete(src); });
  requests.set(src, request);
  return request;
}
