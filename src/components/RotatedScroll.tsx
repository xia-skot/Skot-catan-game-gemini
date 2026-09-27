import React, { useRef, useEffect } from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  shouldApplyPortraitRotation: boolean;
  children: React.ReactNode;
}

export function RotatedScroll({ shouldApplyPortraitRotation, children, className, ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !shouldApplyPortraitRotation) return;

    let startX = 0;
    let startY = 0;
    let scrollTopStart = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      scrollTopStart = el.scrollTop;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // In rotated space (90deg clockwise), physical UP (decreasing clientY) 
      // is actually logical LEFT.
      // Physical RIGHT (increasing clientX) is actually logical UP.
      // Wait, let's re-verify the axes:
      // Phone is portrait. Screen width W.
      // App rotated 90deg clockwise around top-left, then moved to right edge (left: W).
      // Screen (px, py) -> App (py, W - px).
      // So a change in px (delta px) -> change in App Y (delta ay = - delta px)
      // A change in py (delta py) -> change in App X (delta ax = delta py)
      // For vertical scrolling in the app, we care about delta App Y.
      // delta App Y = - delta px.
      // So if user swipes physical right (delta px > 0), delta App Y < 0.
      // Wait, if finger moves towards App Top (which is physical Right), then px INCREASES.
      // delta px > 0.
      // The content should move towards App Top, so scroll down -> scrollTop INCREASES.
      // Native touch scroll:
      // Finger moves up screen (delta py < 0) -> content moves up -> scrollTop INCREASES.
      // So deltaScrollTop = - deltaFinger.
      // In our case, the "finger" on the App's Y axis is `W - px`.
      // delta ay = - delta px.
      // So deltaScrollTop = - (delta ay) = delta px.
      
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      
      if (e.cancelable) {
          e.preventDefault();
      }
      
      // In -90deg rotation, physical X maps to logical Y.
      // Physical swipe left (dx < 0) corresponds to mental swipe down (towards app bottom).
      // Mental swipe down means content moves down, meaning scroll up (scrollTop decreases).
      // So delta scrollTop = dx
      el.scrollTop = scrollTopStart + dx;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Also handle wheel events for mice/trackpads
    const handleWheel = (e: WheelEvent) => {
      // In a rotated element, wheeling up/down (deltaY) affects the physical screen.
      // Actually, wheel events are also in screen space.
      // Native scroll uses deltaY to change scrollTop.
      // Since we are rotated, the browser might try to scroll horizontally.
      // Wait, native wheel on rotated elements usually works fine if you scroll the mouse wheel, 
      // but trackpad swipes might be weird. Let's just fix touch for now, as it's a mobile issue.
    };

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, [shouldApplyPortraitRotation]);

  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}
