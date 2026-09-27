const fs = require('fs');
const content = fs.readFileSync('src/useCatanGame.ts', 'utf8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('// Clear all existing islandIds to prevent Desert hexes from leaking old IDs'));
const end = lines.findIndex(l => l.includes('return hexes;')) - 1;

const newLogic = `    // Find all connected components of land hexes (excluding deserts)
    const isLand = (h) => (h.isMainland || h.isIsland) && h._category !== 'Desert' && h.type !== 'desert';
    const unvisitedLand = new Set(hexes.filter(isLand).map(h => h.id));
    
    let currentIslandId = 1;
    
    // Reset all land hexes' mainland/island status
    hexes.forEach(h => {
        if (isLand(h)) {
            h.isMainland = false;
            h.isIsland = false;
            h.islandId = undefined;
        } else if (h._category === 'Desert' || h.type === 'desert') {
            h.isMainland = false;
            h.isIsland = false;
            h.islandId = undefined;
        }
    });
    
    while (unvisitedLand.size > 0) {
        const startId = Array.from(unvisitedLand)[0];
        const queue = [startId];
        unvisitedLand.delete(startId);
        
        const component = [];
        let hasStartingLand = false;
        
        while (queue.length > 0) {
            const currId = queue.shift();
            const curr = hexes.find(h => h.id === currId);
            if (curr) {
                component.push(curr);
                if (curr.isStartingLand) hasStartingLand = true;
                
                const neighbors = hexes.filter(n => isLand(n) && Math.max(Math.abs(n.q - curr.q), Math.abs(n.r - curr.r), Math.abs((n.q + n.r) - (curr.q + curr.r))) === 1);
                for (const n of neighbors) {
                    if (unvisitedLand.has(n.id)) {
                        unvisitedLand.delete(n.id);
                        queue.push(n.id);
                    }
                }
            }
        }
        
        if (hasStartingLand) {
            // This entire component is the Mainland
            component.forEach(h => h.isMainland = true);
        } else {
            // This component is an Independent Island
            component.forEach(h => {
                h.isIsland = true;
                h.islandId = currentIslandId;
            });
            currentIslandId++;
        }
    }
    
    // Deserts inherit Mainland/Island status if they touch them (optional, for visual consistency)
    hexes.forEach(h => {
        if (h._category === 'Desert' || h.type === 'desert') {
            const neighbors = hexes.filter(n => Math.max(Math.abs(n.q - h.q), Math.abs(n.r - h.r), Math.abs((n.q + n.r) - (h.q + h.r))) === 1);
            if (neighbors.some(n => n.isMainland)) h.isMainland = true;
            if (neighbors.some(n => n.isIsland)) h.isIsland = true;
        }
    });`;

lines.splice(start, end - start + 1, newLogic);
fs.writeFileSync('src/useCatanGame.ts', lines.join('\n'));
console.log("Patched successfully");
