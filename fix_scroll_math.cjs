const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace('const newScrollLeft = scrollLeftStart + dy;', 'const newScrollLeft = scrollLeftStart - dy;');
fs.writeFileSync('src/App.tsx', content);
console.log("Fixed horizontal scroll math");
