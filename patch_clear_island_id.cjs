const fs = require('fs');
const content = fs.readFileSync('src/useCatanGame.ts', 'utf8');

const target = "    // Recalculate islandId to ensure contiguous islands share exactly one ID";
const replacement = "    // Clear all existing islandIds to prevent Desert hexes from leaking old IDs\n    hexes.forEach(h => h.islandId = undefined);\n    // Recalculate islandId to ensure contiguous islands share exactly one ID";

if (content.includes(target)) {
  const updatedContent = content.replace(target, replacement);
  fs.writeFileSync('src/useCatanGame.ts', updatedContent);
  console.log("Patched successfully");
} else {
  console.log("Target not found");
}
