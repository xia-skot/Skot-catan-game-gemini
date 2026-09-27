const fs = require('fs');
const content = fs.readFileSync('src/useCatanGame.ts', 'utf8');

const insertionPoint = "    hexes.forEach(h => {\n        if (startingLandSet.has(`${h.q},${h.r}`)) {\n            h.isStartingLand = true;\n        }\n    });\n";

const newLogic = `
    // Recalculate islandId to ensure contiguous islands share exactly one ID
    let currentIslandId = 1;
    const unvisitedIslands = new Set(hexes.filter(h => h.isIsland).map(h => h.id));
    
    while (unvisitedIslands.size > 0) {
        const startId = Array.from(unvisitedIslands)[0];
        const queue = [startId];
        unvisitedIslands.delete(startId);
        
        while (queue.length > 0) {
            const currId = queue.shift();
            const curr = hexes.find(h => h.id === currId);
            if (curr) {
                curr.islandId = currentIslandId;
                const neighbors = hexes.filter(n => n.isIsland && Math.max(Math.abs(n.q - curr.q), Math.abs(n.r - curr.r), Math.abs((n.q + n.r) - (curr.q + curr.r))) === 1);
                for (const n of neighbors) {
                    if (unvisitedIslands.has(n.id)) {
                        unvisitedIslands.delete(n.id);
                        queue.push(n.id);
                    }
                }
            }
        }
        currentIslandId++;
    }
`;

const updatedContent = content.replace(insertionPoint, insertionPoint + newLogic);
fs.writeFileSync('src/useCatanGame.ts', updatedContent);
