const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/className="absolute inset-0 z-\[100\] flex items-center justify-center p-4 bg-transparent transition-all"/g, 'className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-all pointer-events-auto"');
content = content.replace(/className="absolute inset-0 z-\[100\] bg-transparent flex items-center justify-center pointer-events-auto"/g, 'className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-auto"');
fs.writeFileSync('src/App.tsx', content);
