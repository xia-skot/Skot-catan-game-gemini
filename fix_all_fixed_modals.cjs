const fs = require('fs');

// 1. SoundSettingsModal.tsx
let ssContent = fs.readFileSync('src/components/SoundSettingsModal.tsx', 'utf8');
ssContent = ssContent.replace(
  /className="absolute inset-0 z-\[10001\] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"/g,
  'className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"'
);
fs.writeFileSync('src/components/SoundSettingsModal.tsx', ssContent);

// 2. RulesModal.tsx
let rContent = fs.readFileSync('src/components/RulesModal.tsx', 'utf8');
rContent = rContent.replace(
  /className="absolute inset-0 z-\[10001\] bg-transparent pointer-events-auto flex items-center justify-center p-4 sm:p-6"/g,
  'className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-4 sm:p-6"'
);
fs.writeFileSync('src/components/RulesModal.tsx', rContent);

// 3. UserProfileModal.tsx
let upContent = fs.readFileSync('src/components/UserProfileModal.tsx', 'utf8');
upContent = upContent.replace(
  /className="absolute inset-0 z-\[10001\] bg-transparent pointer-events-auto flex items-center justify-center p-4"/g,
  'className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-4"'
);
fs.writeFileSync('src/components/UserProfileModal.tsx', upContent);

// 4. MapGeneratorModal.tsx
let mgContent = fs.readFileSync('src/components/MapGeneratorModal.tsx', 'utf8');
mgContent = mgContent.replace(
  /className="absolute inset-0 z-\[10001\] bg-transparent pointer-events-auto flex items-center justify-center p-4 sm:p-6"/g,
  'className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-4 sm:p-6"'
);
fs.writeFileSync('src/components/MapGeneratorModal.tsx', mgContent);

// 5. SaveMapConfirmModal.tsx
let smcContent = fs.readFileSync('src/components/SaveMapConfirmModal.tsx', 'utf8');
smcContent = smcContent.replace(
  /className="absolute inset-0 z-\[10001\] bg-transparent pointer-events-auto flex items-center justify-center p-4"/g,
  'className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-4"'
);
fs.writeFileSync('src/components/SaveMapConfirmModal.tsx', smcContent);

// 6. MapAlbumModal.tsx
let maContent = fs.readFileSync('src/components/MapAlbumModal.tsx', 'utf8');
maContent = maContent.replace(
  /className="absolute inset-0 z-\[10001\] bg-\[\#f8fafc\] pointer-events-auto flex flex-col overflow-hidden animate-in fade-in duration-200"/g,
  'className="fixed inset-0 z-[100000] bg-[#f8fafc] pointer-events-auto flex flex-col overflow-hidden animate-in fade-in duration-200"'
);
fs.writeFileSync('src/components/MapAlbumModal.tsx', maContent);

// 7. App.tsx
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Replace all absolute inset-0 z-[10001] with fixed inset-0 z-[100000]
appContent = appContent.replace(
  /className="absolute inset-0 z-\[10001\]/g,
  'className="fixed inset-0 z-[100000]'
);

fs.writeFileSync('src/App.tsx', appContent);

console.log("Successfully converted all modals to fixed inset-0 z-[100000]!");
