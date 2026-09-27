import { useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { suppressGestureClick } from './navigation';

const tabs = ['lobby', 'rooms', 'profile', 'rules'] as const;
type Tab = typeof tabs[number];

export function useLobbySwipe(tab: Tab, select: (tab: Tab) => void, canSwipe: () => boolean) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; y: number; time: number; id: number; axis: 'pending' | 'x' | 'y' } | null>(null);
  const reset = () => { gesture.current = null; setOffset(0); setDragging(false); };
  useEffect(reset, [tab]);
  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    reset();
    const target = event.target as HTMLElement;
    if (!canSwipe() || event.touches.length !== 1 || target.closest('input,textarea,select,[role="slider"],.no-swipe,[data-no-swipe]')) return;
    const touch = event.touches[0];
    // Edge gestures belong exclusively to the back handler.
    if (touch.clientX <= 32 || touch.clientX >= window.innerWidth - 20) return;
    gesture.current = { x: touch.clientX, y: touch.clientY, time: performance.now(), id: touch.identifier, axis: 'pending' };
  };
  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start) return;
    if (!canSwipe() || event.touches.length !== 1) { reset(); return; }
    const touch = event.touches[0];
    if (touch.identifier !== start.id) { reset(); return; }
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (start.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
      start.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
    }
    if (start.axis !== 'x') return;
    const index = tabs.indexOf(tab);
    const atEnd = (index === 0 && dx > 0) || (index === tabs.length - 1 && dx < 0);
    setOffset(atEnd ? dx * 0.2 : dx);
    setDragging(true);
  };
  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = gesture.current;
    reset();
    if (!start || start.axis !== 'x' || !canSwipe()) return;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === start.id);
    if (!touch) return;
    suppressGestureClick();
    const dx = touch.clientX - start.x;
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - start.time);
    if (Math.abs(dx) < 28 && !(Math.abs(dx) >= 18 && velocity > 0.35)) return;
    const index = Math.max(0, Math.min(tabs.length - 1, tabs.indexOf(tab) + (dx < 0 ? 1 : -1)));
    select(tabs[index]);
  };
  return { offset, dragging, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset };
}
