import { useState, useEffect } from 'react';
import { getImageCandidates, RESOLVED_IMAGE_MAP } from './images';

// Global RAM caches
const IMAGE_ELEMENT_CACHE = new Map<string, HTMLImageElement>();
const IMAGE_PROMISE_CACHE = new Map<string, Promise<HTMLImageElement>>();
const CACHE_STORAGE_NAME = 'catan-image-cache-v1';

/**
 * Get an already loaded & decoded HTMLImageElement synchronously from RAM
 */
export function getCachedImageElement(src: string): HTMLImageElement | null {
  if (!src) return null;
  const direct = IMAGE_ELEMENT_CACHE.get(src);
  if (direct && direct.complete && direct.naturalWidth > 0) return direct;
  
  const resolved = RESOLVED_IMAGE_MAP[src];
  if (resolved) {
    const resImg = IMAGE_ELEMENT_CACHE.get(resolved);
    if (resImg && resImg.complete && resImg.naturalWidth > 0) return resImg;
  }
  return null;
}

/**
 * Load a single image with candidate failover, GPU decoding, and multi-tier caching
 */
export function loadGameImage(originalSrc: string): Promise<HTMLImageElement> {
  if (!originalSrc) {
    return Promise.reject(new Error('Empty image source'));
  }

  // 1. Check RAM cache
  const cached = getCachedImageElement(originalSrc);
  if (cached) {
    return Promise.resolve(cached);
  }

  // 2. Check pending promise
  if (IMAGE_PROMISE_CACHE.has(originalSrc)) {
    return IMAGE_PROMISE_CACHE.get(originalSrc)!;
  }

  const promise = (async () => {
    const candidates = getImageCandidates(originalSrc);
    if (candidates.length === 0) {
      throw new Error(`No candidates for ${originalSrc}`);
    }

    // Try loading single candidate
    const tryCandidate = (url: string, timeoutMs = 4000): Promise<HTMLImageElement> => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        let isDone = false;
        const timer = setTimeout(() => {
          if (!isDone) {
            isDone = true;
            reject(new Error(`Timeout loading ${url}`));
          }
        }, timeoutMs);

        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.referrerPolicy = 'no-referrer';

        img.onload = async () => {
          if (isDone) return;
          if (img.naturalWidth > 0) {
            isDone = true;
            clearTimeout(timer);
            // Pre-decode into GPU memory for instant rendering
            try {
              if ('decode' in img) {
                await img.decode();
              }
            } catch {}
            resolve(img);
          } else {
            isDone = true;
            clearTimeout(timer);
            reject(new Error(`Corrupted image ${url}`));
          }
        };

        img.onerror = () => {
          if (!isDone) {
            isDone = true;
            clearTimeout(timer);
            reject(new Error(`Failed to load ${url}`));
          }
        };

        img.src = url;
        if (img.complete && img.naturalWidth > 0) {
          isDone = true;
          clearTimeout(timer);
          resolve(img);
        }
      });
    };

    // Fast attempt with first candidate (or proxy)
    let loadedImg: HTMLImageElement | null = null;
    let winningUrl = candidates[0];

    try {
      loadedImg = await tryCandidate(candidates[0], 1500);
      winningUrl = candidates[0];
    } catch {
      // Race remaining candidates concurrently
      const remaining = candidates.slice(1);
      const racePromises = remaining.map(url => 
        tryCandidate(url, 3500).then(img => ({ img, url }))
      );
      try {
        const winner = await Promise.any(racePromises);
        loadedImg = winner.img;
        winningUrl = winner.url;
      } catch (err) {
        // As a last resort, try fetching via server proxy directly
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(originalSrc)}`;
        try {
          loadedImg = await tryCandidate(proxyUrl, 5000);
          winningUrl = proxyUrl;
        } catch {
          throw new Error(`All CDN and proxy sources failed for ${originalSrc}`);
        }
      }
    }

    if (loadedImg) {
      IMAGE_ELEMENT_CACHE.set(originalSrc, loadedImg);
      IMAGE_ELEMENT_CACHE.set(winningUrl, loadedImg);
      RESOLVED_IMAGE_MAP[originalSrc] = winningUrl;
      return loadedImg;
    }

    throw new Error(`Could not load ${originalSrc}`);
  })();

  IMAGE_PROMISE_CACHE.set(originalSrc, promise);
  return promise;
}

/**
 * React Hook for Konva canvas and React components:
 * Guarantees zero blank frames when preloaded!
 */
export function useGameImage(src: string): { image: HTMLImageElement | null; isLoaded: boolean } {
  const [image, setImage] = useState<HTMLImageElement | null>(() => getCachedImageElement(src));

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    const cached = getCachedImageElement(src);
    if (cached) {
      setImage(cached);
      return;
    }

    let isMounted = true;
    loadGameImage(src)
      .then((img) => {
        if (isMounted) {
          setImage(img);
        }
      })
      .catch((err) => {
        console.warn(`[useGameImage] Failed to load ${src}:`, err);
      });

    return () => {
      isMounted = false;
    };
  }, [src]);

  return { image, isLoaded: !!image };
}
