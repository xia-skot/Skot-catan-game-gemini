import React, { useRef, useEffect } from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  shouldApplyPortraitRotation: boolean;
  children: React.ReactNode;
}

export function RotatedScroll({ shouldApplyPortraitRotation, children, className, style, ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !shouldApplyPortraitRotation) return;
    let touch: { x: number; y: number; time: number; moved: boolean } | null = null;
    let velocity = 0, frame = 0, suppressUntil = 0;
    const stop = () => { cancelAnimationFrame(frame); velocity = 0; touch = null; };
    const start = (event: TouchEvent) => {
      stop();
      if (event.touches.length !== 1 || (event.target as Element).closest('input,textarea,[role="slider"]')) return;
      const point = event.touches[0];
      touch = { x: point.clientX, y: point.clientY, time: performance.now(), moved: false };
    };
    const move = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) { stop(); return; }
      const point = event.touches[0], now = performance.now();
      const dx = point.clientX - touch.x, dy = point.clientY - touch.y;
      if (!touch.moved && Math.abs(dx) < 4) return;
      if (!touch.moved && Math.abs(dy) > Math.abs(dx) * 1.4) { stop(); return; }
      if (event.cancelable) event.preventDefault();
      // Screen X maps to the rotated sidebar's vertical axis.
      el.scrollTop += dx;
      velocity = .6 * velocity + .4 * dx / Math.max(8, now - touch.time);
      touch = { x: point.clientX, y: point.clientY, time: now, moved: true };
    };
    const end = () => {
      if (!touch?.moved) { stop(); return; }
      suppressUntil = performance.now() + 400;
      if (performance.now() - touch.time > 100) velocity = 0;
      touch = null;
      let previous = performance.now();
      const coast = (now: number) => {
        const dt = Math.min(32, now - previous); previous = now;
        const before = el.scrollTop;
        el.scrollTop += velocity * dt;
        velocity *= Math.exp(-dt / 170);
        if (Math.abs(velocity) > .02 && el.scrollTop !== before) frame = requestAnimationFrame(coast);
      };
      frame = requestAnimationFrame(coast);
    };
    const click = (event: MouseEvent) => {
      if (performance.now() < suppressUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', stop);
    el.addEventListener('click', click, true);
    return () => {
      stop();
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', stop);
      el.removeEventListener('click', click, true);
    };
  }, [shouldApplyPortraitRotation]);
  return <div ref={ref} data-rotated-scroll={shouldApplyPortraitRotation || undefined} className={className}
    style={{ ...style, touchAction: shouldApplyPortraitRotation ? 'none' : 'pan-y', overscrollBehavior: 'contain' }} {...rest}>{children}</div>;
}
