const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Insert the patch at the top of App.tsx, just after Konva patch
const patch = `
// Global patch to fix native touch scrolling when the UI is CSS rotated 90deg
if (typeof window !== 'undefined') {
  let activeScrollTarget = null;
  let startX = 0;
  let startY = 0;
  let scrollTopStart = 0;
  let scrollLeftStart = 0;

  const getScrollableParent = (node) => {
    if (node == null) {
      return null;
    }
    if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
      const style = window.getComputedStyle(node);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowX === 'auto' || style.overflowX === 'scroll') {
        return node;
      }
    }
    return getScrollableParent(node.parentNode);
  };

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    
    // Check if we are inside a rotated container
    const rotatedContainer = e.target.closest && e.target.closest('[data-portrait-rotated="true"]');
    if (!rotatedContainer) return;

    activeScrollTarget = getScrollableParent(e.target);
    if (activeScrollTarget) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      scrollTopStart = activeScrollTarget.scrollTop;
      scrollLeftStart = activeScrollTarget.scrollLeft;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1 || !activeScrollTarget) return;

    const rotatedContainer = e.target.closest && e.target.closest('[data-portrait-rotated="true"]');
    if (!rotatedContainer) return;
    
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Physical right (dx > 0) -> App up (scrollTop increases)
    // Physical down (dy > 0) -> App right (scrollLeft increases)
    const style = window.getComputedStyle(activeScrollTarget);
    
    let hasScrolled = false;
    
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      const maxScrollTop = activeScrollTarget.scrollHeight - activeScrollTarget.clientHeight;
      const newScrollTop = scrollTopStart + dx;
      
      // Only prevent default if we are actually scrolling within bounds
      if (maxScrollTop > 0) {
          activeScrollTarget.scrollTop = newScrollTop;
          hasScrolled = true;
      }
    }
    
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
      const maxScrollLeft = activeScrollTarget.scrollWidth - activeScrollTarget.clientWidth;
      // physical down (dy > 0) -> App Right. But wait, App Left is Physical Top.
      // So physical down (dy > 0) is movement towards App Left.
      // So scrollLeft should DECREASE?
      // Let's re-verify X axis.
      // App is rotated 90deg clockwise. Top is Right. Left is Top.
      // Finger moves DOWN (towards App Left). dy > 0.
      // Content should move towards App Left.
      // Moving content towards left = scrolling right = scrollLeft INCREASES.
      // So dy > 0 -> scrollLeft increases.
      const newScrollLeft = scrollLeftStart + dy;
      if (maxScrollLeft > 0) {
          activeScrollTarget.scrollLeft = newScrollLeft;
          hasScrolled = true;
      }
    }
    
    if (hasScrolled && e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });
  
  window.addEventListener('touchend', () => {
    activeScrollTarget = null;
  });
  window.addEventListener('touchcancel', () => {
    activeScrollTarget = null;
  });
}
`;

const lines = content.split('\n');
const insertIndex = lines.findIndex(l => l.includes('import { useCatanGame'));
lines.splice(insertIndex, 0, patch);
fs.writeFileSync('src/App.tsx', lines.join('\n'));
console.log("Patched global scrolling");
