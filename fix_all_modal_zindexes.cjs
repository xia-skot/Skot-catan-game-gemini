const fs = require('fs');

// 1. App.tsx: update showReserveRoomModal
let appContent = fs.readFileSync('src/App.tsx', 'utf8');
appContent = appContent.replace(
  '<div className="absolute inset-0 z-[300] flex items-center justify-center p-4">',
  '<div className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-4"\n            onPointerDown={(e) => e.stopPropagation()}\n            onMouseDown={(e) => e.stopPropagation()}\n            onTouchStart={(e) => e.stopPropagation()}\n            onClick={(e) => e.stopPropagation()}>'
);
fs.writeFileSync('src/App.tsx', appContent);

// 2. UserProfileModal.tsx
let upContent = fs.readFileSync('src/components/UserProfileModal.tsx', 'utf8');
upContent = upContent.replace(
  '<div className="absolute inset-0 z-50 flex items-center justify-center p-4">',
  '<div className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-4"\n        onPointerDown={(e) => e.stopPropagation()}\n        onMouseDown={(e) => e.stopPropagation()}\n        onTouchStart={(e) => e.stopPropagation()}\n        onClick={(e) => e.stopPropagation()}>'
);
fs.writeFileSync('src/components/UserProfileModal.tsx', upContent);

// 3. RulesModal.tsx
let rContent = fs.readFileSync('src/components/RulesModal.tsx', 'utf8');
rContent = rContent.replace(
  '<div className="absolute inset-0 z-[500] flex items-center justify-center p-4 sm:p-6">',
  '<div className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-4 sm:p-6"\n        onPointerDown={(e) => e.stopPropagation()}\n        onMouseDown={(e) => e.stopPropagation()}\n        onTouchStart={(e) => e.stopPropagation()}\n        onClick={(e) => e.stopPropagation()}>'
);
fs.writeFileSync('src/components/RulesModal.tsx', rContent);

// 4. MapAlbumModal.tsx
let maContent = fs.readFileSync('src/components/MapAlbumModal.tsx', 'utf8');
maContent = maContent.replace(
  '<div className="absolute inset-0 z-[100] bg-[#f8fafc] flex flex-col overflow-hidden animate-in fade-in duration-200">',
  '<div className="absolute inset-0 z-[10001] bg-[#f8fafc] pointer-events-auto flex flex-col overflow-hidden animate-in fade-in duration-200">'
);
fs.writeFileSync('src/components/MapAlbumModal.tsx', maContent);

// 5. MapGeneratorModal.tsx
let mgContent = fs.readFileSync('src/components/MapGeneratorModal.tsx', 'utf8');
mgContent = mgContent.replace(
  '<div className="absolute inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-transparent">',
  '<div className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-4 sm:p-6"\n      onPointerDown={(e) => e.stopPropagation()}\n      onMouseDown={(e) => e.stopPropagation()}\n      onTouchStart={(e) => e.stopPropagation()}\n      onClick={(e) => e.stopPropagation()}>'
);
fs.writeFileSync('src/components/MapGeneratorModal.tsx', mgContent);

// 6. SaveMapConfirmModal.tsx
let smcContent = fs.readFileSync('src/components/SaveMapConfirmModal.tsx', 'utf8');
smcContent = smcContent.replace(
  '<div className="absolute inset-0 z-[100] flex items-center justify-center p-4">',
  '<div className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-4"\n      onPointerDown={(e) => e.stopPropagation()}\n      onMouseDown={(e) => e.stopPropagation()}\n      onTouchStart={(e) => e.stopPropagation()}\n      onClick={(e) => e.stopPropagation()}>'
);
fs.writeFileSync('src/components/SaveMapConfirmModal.tsx', smcContent);

// 7. SoundSettingsModal.tsx
let ssContent = fs.readFileSync('src/components/SoundSettingsModal.tsx', 'utf8');
ssContent = ssContent.replace(
  '<div className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full">',
  '<div className="absolute inset-0 z-[10001] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"\n      onPointerDown={(e) => e.stopPropagation()}\n      onMouseDown={(e) => e.stopPropagation()}\n      onTouchStart={(e) => e.stopPropagation()}\n      onClick={(e) => e.stopPropagation()}>'
);
fs.writeFileSync('src/components/SoundSettingsModal.tsx', ssContent);

console.log("Updated all modal z-indexes and event catchers!");
