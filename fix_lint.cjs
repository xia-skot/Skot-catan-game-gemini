const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/e\.target\.closest/g, '(e.target as Element).closest');
content = content.replace(/getScrollableParent\(e\.target\)/g, 'getScrollableParent(e.target as Element)');

fs.writeFileSync('src/App.tsx', content);
console.log("Lint fixed");
