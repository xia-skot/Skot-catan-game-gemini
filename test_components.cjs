const fs = require('fs');
const content = fs.readFileSync('src/useCatanGame.ts', 'utf8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('// Clear all existing islandIds to prevent Desert hexes from leaking old IDs'));
const end = lines.findIndex(l => l.includes('return hexes;'));
console.log(`Start: ${start}, End: ${end}`);
