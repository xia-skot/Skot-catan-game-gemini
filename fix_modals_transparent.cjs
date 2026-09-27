const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace any bg-black/40 backdrop-blur-sm with bg-transparent
content = content.replace(/bg-black\/40\s+backdrop-blur-sm/g, 'bg-transparent');

// 1. Central Action Modals (Discard, Robber, Monopoly, Year of Plenty, Gold)
content = content.replace(
  `className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"`,
  `className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"\n            onPointerDown={(e) => e.stopPropagation()}\n            onMouseDown={(e) => e.stopPropagation()}\n            onTouchStart={(e) => e.stopPropagation()}`
);

// 2. Player Trade Modal
content = content.replace(
  `className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"\n            onClick={() => setShowPlayerTradeModal(false)}`,
  `className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"\n            onPointerDown={(e) => e.stopPropagation()}\n            onMouseDown={(e) => e.stopPropagation()}\n            onTouchStart={(e) => e.stopPropagation()}\n            onClick={(e) => { e.stopPropagation(); setShowPlayerTradeModal(false); }}`
);

// 3. Bank Trade Modal
content = content.replace(
  `className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"\n            onClick={() => setShowTradeModal(false)}`,
  `className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"\n            onPointerDown={(e) => e.stopPropagation()}\n            onMouseDown={(e) => e.stopPropagation()}\n            onTouchStart={(e) => e.stopPropagation()}\n            onClick={(e) => { e.stopPropagation(); setShowTradeModal(false); }}`
);

// 4. Stealing Modal
content = content.replace(
  `className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-4 w-full"`,
  `className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-4 w-full"\n            onPointerDown={(e) => e.stopPropagation()}\n            onMouseDown={(e) => e.stopPropagation()}\n            onTouchStart={(e) => e.stopPropagation()}\n            onClick={(e) => e.stopPropagation()}`
);

fs.writeFileSync('src/App.tsx', content);
console.log("Updated App.tsx with transparent event-blocking modal overlays");
