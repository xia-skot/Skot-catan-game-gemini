import { useLayoutEffect, useRef } from 'react';

const backHandlers = new Map<symbol, { priority: number; run: () => boolean }>();
let suppressClickUntil = 0;

export function useBackHandler(enabled: boolean, handler: () => boolean, priority = 10) {
  const latest = useRef(handler);
  latest.current = handler;
  useLayoutEffect(() => {
    if (!enabled) return;
    const key = Symbol('back');
    backHandlers.set(key, { priority, run: () => latest.current() });
    return () => { backHandlers.delete(key); };
  }, [enabled, priority]);
}

export function runTopBackHandler(): boolean {
  const handlers = [...backHandlers.values()].sort((a, b) => b.priority - a.priority);
  return handlers.some(handler => handler.run());
}

export function hasBackHandler(): boolean { return backHandlers.size > 0; }
export function requestAppBack() { window.dispatchEvent(new Event('catan:back')); }
export function suppressGestureClick() { suppressClickUntil = performance.now() + 400; }
export function shouldSuppressGestureClick() { return performance.now() < suppressClickUntil; }

export function isInstalledDisplay(): boolean {
  const apiFullscreen = document.fullscreenElement || (document as any).webkitFullscreenElement;
  return (navigator as any).standalone === true ||
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: minimal-ui)').matches ||
    (matchMedia('(display-mode: fullscreen)').matches && !apiFullscreen);
}
