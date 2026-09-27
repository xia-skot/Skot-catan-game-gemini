const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/className="absolute inset-0 z-\[10001\] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"/g, `className="absolute inset-0 z-[10001] bg-black/40 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"`);

content = content.replace(/className="absolute inset-0 z-\[10001\] bg-transparent pointer-events-auto flex items-center justify-center p-4 w-full"/g, `className="absolute inset-0 z-[10001] bg-black/40 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-4 w-full"`);

fs.writeFileSync('src/App.tsx', content);
console.log("Fixed modals overlay");
