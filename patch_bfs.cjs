const fs = require('fs');
const content = fs.readFileSync('src/useCatanGame.ts', 'utf8');

const target = "    // Recalculate islandId to ensure contiguous islands share exactly one ID\n    let currentIslandId = 1;\n    const unvisitedIslands = new Set(hexes.filter(h => h.isIsland).map(h => h.id));\n    \n    while (unvisitedIslands.size > 0) {\n        const startId = Array.from(unvisitedIslands)[0];\n        const queue = [startId];\n        unvisitedIslands.delete(startId);\n        \n        while (queue.length > 0) {\n            const currId = queue.shift();\n            const curr = hexes.find(h => h.id === currId);\n            if (curr) {\n                curr.islandId = currentIslandId;\n                const neighbors = hexes.filter(n => n.isIsland && Math.max(Math.abs(n.q - curr.q), Math.abs(n.r - curr.r), Math.abs((n.q + n.r) - (curr.q + curr.r))) === 1);\n                for (const n of neighbors) {\n                    if (unvisitedIslands.has(n.id)) {\n                        unvisitedIslands.delete(n.id);\n                        queue.push(n.id);\n                    }\n                }\n            }\n        }\n        currentIslandId++;\n    }";

const replacement = "    // Recalculate islandId to ensure contiguous islands share exactly one ID\n    let currentIslandId = 1;\n    const isValidIslandHex = (h) => h.isIsland && h._category !== 'Desert' && h.type !== 5;\n    const unvisitedIslands = new Set(hexes.filter(isValidIslandHex).map(h => h.id));\n    \n    while (unvisitedIslands.size > 0) {\n        const startId = Array.from(unvisitedIslands)[0];\n        const queue = [startId];\n        unvisitedIslands.delete(startId);\n        \n        while (queue.length > 0) {\n            const currId = queue.shift();\n            const curr = hexes.find(h => h.id === currId);\n            if (curr) {\n                curr.islandId = currentIslandId;\n                const neighbors = hexes.filter(n => isValidIslandHex(n) && Math.max(Math.abs(n.q - curr.q), Math.abs(n.r - curr.r), Math.abs((n.q + n.r) - (curr.q + curr.r))) === 1);\n                for (const n of neighbors) {\n                    if (unvisitedIslands.has(n.id)) {\n                        unvisitedIslands.delete(n.id);\n                        queue.push(n.id);\n                    }\n                }\n            }\n        }\n        currentIslandId++;\n    }";

if (content.includes(target)) {
  const updatedContent = content.replace(target, replacement);
  fs.writeFileSync('src/useCatanGame.ts', updatedContent);
  console.log("Patched successfully");
} else {
  console.log("Target not found");
}
