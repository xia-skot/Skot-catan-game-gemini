const fs = require('fs');
const content = fs.readFileSync('src/useCatanGame.ts', 'utf8');

const updatedContent = content.replace("h.type !== 5", "h.type !== 'desert'");
fs.writeFileSync('src/useCatanGame.ts', updatedContent);
console.log("Patched successfully");
