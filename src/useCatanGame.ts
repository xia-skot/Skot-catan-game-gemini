import { useState, useCallback, useEffect } from 'react';
import { GameState, Hex, HexType, ResourceType, Player, DevCardType, MapType, Port, Settlement, Road, Ship, TradeOffer } from './types';
import { PLAYER_COLORS, COSTS } from './constants';

const HEX_SIZE = 50;

// Helper to find hexes adjacent to an edge
export function getHexesForEdge(board: any[], edgeId: string) {
  return board.filter(h => {
    const HEX_RADIUS = 40;
    const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
    const HEX_HEIGHT = 2 * HEX_RADIUS;
    const x = HEX_WIDTH * (h.q + h.r / 2);
    const y = HEX_HEIGHT * 0.75 * h.r;
    
    for (let i = 0; i < 6; i++) {
      const a1 = (Math.PI / 180) * (60 * i + 30);
      const a2 = (Math.PI / 180) * (60 * ((i + 1) % 6) + 30);
      const x1 = x + HEX_RADIUS * Math.cos(a1);
      const y1 = y + HEX_RADIUS * Math.sin(a1);
      const x2 = x + HEX_RADIUS * Math.cos(a2);
      const y2 = y + HEX_RADIUS * Math.sin(a2);
      const v1 = `${Math.round(x1)},${Math.round(y1)}`;
      const v2 = `${Math.round(x2)},${Math.round(y2)}`;
      const key = [v1, v2].sort().join('|');
      if (key === edgeId) return true;
    }
    return false;
  });
}

// Helper to find hexes adjacent to a vertex
export function getHexesForVertex(board: any[], vertexId: string) {
  return board.filter(h => {
    const HEX_RADIUS = 40;
    const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
    const HEX_HEIGHT = 2 * HEX_RADIUS;
    const x = HEX_WIDTH * (h.q + h.r / 2);
    const y = HEX_HEIGHT * 0.75 * h.r;
    
    for (let i = 0; i < 6; i++) {
      const angle_rad = (Math.PI / 180) * (60 * i + 30);
      const vx = x + HEX_RADIUS * Math.cos(angle_rad);
      const vy = y + HEX_RADIUS * Math.sin(angle_rad);
      const key = `${Math.round(vx)},${Math.round(vy)}`;
      if (key === vertexId) return true;
    }
    return false;
  });
}

export function calculateLongestRoad(playerId: number, roads: Road[], ships: Ship[], settlements: Settlement[]): number {
  const playerRoads = roads.filter(e => e.playerId === playerId).map(e => e.edgeId);
  const playerShips = ships.filter(e => e.playerId === playerId).map(e => e.edgeId);
  if (playerRoads.length === 0 && playerShips.length === 0) return 0;

  const ownSettlements = new Set(settlements.filter(s => s.playerId === playerId).map(s => s.vertexId));
  const opponentSettlements = new Set(settlements.filter(s => s.playerId !== playerId).map(s => s.vertexId));

  const allPlayerEdges = [
    ...playerRoads.map(e => ({ id: e, type: 'road' })),
    ...playerShips.map(e => ({ id: e, type: 'ship' }))
  ];

  const edgeToIdx: Record<string, number> = {};
  let eIdx = 0;
  for (const e of allPlayerEdges) {
    if (edgeToIdx[e.id] === undefined) {
      edgeToIdx[e.id] = eIdx++;
    }
  }

  const adj: Record<string, { idx: number, type: string, nextVertex: string }[]> = {};
  for (const edge of allPlayerEdges) {
    const [v1, v2] = edge.id.split('|');
    if (!adj[v1]) adj[v1] = [];
    if (!adj[v2]) adj[v2] = [];
    const idx = edgeToIdx[edge.id];
    adj[v1].push({ idx, type: edge.type, nextVertex: v2 });
    adj[v2].push({ idx, type: edge.type, nextVertex: v1 });
  }

  let maxLength = 0;

  function dfsFast(currentVertex: string, visitedMask: number, currentLength: number, lastEdgeType: string | null) {
    if (currentLength > maxLength) {
      maxLength = currentLength;
    }

    if (opponentSettlements.has(currentVertex) && currentLength > 0) {
      return;
    }

    const edges = adj[currentVertex] || [];
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const bit = 1 << edge.idx;
      if ((visitedMask & bit) === 0) {
        // 连接路和船必须修建村庄
        if (lastEdgeType !== null && lastEdgeType !== edge.type && !ownSettlements.has(currentVertex)) {
          continue;
        }
        dfsFast(edge.nextVertex, visitedMask | bit, currentLength + 1, edge.type);
      }
    }
  }

  for (const startVertex of Object.keys(adj)) {
    dfsFast(startVertex, 0, 0, null);
  }

  return maxLength;
}

export function updateLongestRoad(players: Player[], roads: Road[], ships: Ship[], settlements: Settlement[], currentLongestRoadPlayerId: number | null) {
  let newLongestRoadPlayerId = currentLongestRoadPlayerId;
  let maxRoadLength = 0;
  
  const updatedPlayers = [...players];

  for (let i = 0; i < updatedPlayers.length; i++) {
    const length = calculateLongestRoad(updatedPlayers[i].id, roads, ships, settlements);
    updatedPlayers[i] = { ...updatedPlayers[i], longestRoadLength: length };
    if (length > maxRoadLength) {
      maxRoadLength = length;
    }
  }

  if (maxRoadLength >= 5) {
    if (currentLongestRoadPlayerId === null) {
      const candidate = updatedPlayers.find(p => p.longestRoadLength === maxRoadLength);
      if (candidate) {
        newLongestRoadPlayerId = candidate.id;
      }
    } else {
      const currentHolder = updatedPlayers[currentLongestRoadPlayerId];
      if (maxRoadLength > currentHolder.longestRoadLength) {
        const candidate = updatedPlayers.find(p => p.longestRoadLength === maxRoadLength);
        if (candidate) {
          newLongestRoadPlayerId = candidate.id;
        }
      } else if (currentHolder.longestRoadLength < 5) {
        const eligiblePlayers = updatedPlayers.filter(p => p.longestRoadLength >= 5);
        if (eligiblePlayers.length === 0) {
          newLongestRoadPlayerId = null;
        } else {
          const maxPlayers = eligiblePlayers.filter(p => p.longestRoadLength === maxRoadLength);
          if (maxPlayers.length === 1) {
            newLongestRoadPlayerId = maxPlayers[0].id;
          } else {
            newLongestRoadPlayerId = null;
          }
        }
      }
    }
  } else {
    newLongestRoadPlayerId = null;
  }

  // Adjust victory points
  if (newLongestRoadPlayerId !== currentLongestRoadPlayerId) {
    if (currentLongestRoadPlayerId !== null) {
      const oldPlayer = updatedPlayers.find(p => p.id === currentLongestRoadPlayerId);
      if (oldPlayer) {
        oldPlayer.victoryPoints -= 2;
      }
    }
    if (newLongestRoadPlayerId !== null) {
      const newPlayer = updatedPlayers.find(p => p.id === newLongestRoadPlayerId);
      if (newPlayer) {
        newPlayer.victoryPoints += 2;
      }
    }
  }

  return { players: updatedPlayers, longestRoadPlayerId: newLongestRoadPlayerId };
}

// ... Helper function to finalize knight play and check largest army ...
function finalizeKnightPlay(prev: GameState, updatedPlayers: Player[], checkWinner: (players: Player[], mapType?: MapType) => number | null) {
  if (prev.playingDevCard !== DevCardType.Knight) {
    return { largestArmyPlayerId: prev.largestArmyPlayerId, winnerId: prev.winnerId };
  }

  const currentPlayer = { ...updatedPlayers[prev.currentPlayerIndex], knightsPlayed: updatedPlayers[prev.currentPlayerIndex].knightsPlayed + 1 };
  updatedPlayers[prev.currentPlayerIndex] = currentPlayer;

  let newLargestArmyPlayerId = prev.largestArmyPlayerId;
  if (currentPlayer.knightsPlayed >= 3) {
    if (prev.largestArmyPlayerId === null) {
      newLargestArmyPlayerId = currentPlayer.id;
    } else if (prev.largestArmyPlayerId !== currentPlayer.id) {
      const currentLargestArmyPlayer = prev.players[prev.largestArmyPlayerId];
      if (currentPlayer.knightsPlayed > currentLargestArmyPlayer.knightsPlayed) {
        newLargestArmyPlayerId = currentPlayer.id;
      }
    }

    if (newLargestArmyPlayerId !== prev.largestArmyPlayerId) {
      if (prev.largestArmyPlayerId !== null) {
        const oldPlayer = updatedPlayers.find(p => p.id === prev.largestArmyPlayerId);
        if (oldPlayer) oldPlayer.victoryPoints -= 2;
      }
      if (newLargestArmyPlayerId !== null) {
        const newPlayer = updatedPlayers.find(p => p.id === newLargestArmyPlayerId);
        if (newPlayer) newPlayer.victoryPoints += 2;
      }
    }
  }

  const winnerId = checkWinner(updatedPlayers, prev.mapType);
  return { largestArmyPlayerId: newLargestArmyPlayerId, winnerId };
}

export function useCatanGame() {
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Helper to fill holes in the mainland
  const fillMainlandHoles = (shape: { q: number, r: number, category: string }[]) => {
    const gridMap = new Map<string, { q: number, r: number, category: string }>();
    shape.forEach(s => gridMap.set(`${s.q},${s.r}`, s));
    
    const visited = new Set<string>();
    const queue: { q: number, r: number }[] = [];
    
    // Start from all OuterSea or edge hexes
    shape.filter(s => s.category === 'OuterSea').forEach(s => {
      queue.push({ q: s.q, r: s.r });
      visited.add(`${s.q},${s.r}`);
    });
    
    const directions = [
      { q: 1, r: 0 }, { q: -1, r: 0 },
      { q: 0, r: 1 }, { q: 0, r: -1 },
      { q: 1, r: -1 }, { q: -1, r: 1 }
    ];
    
    while (queue.length > 0) {
      const { q, r } = queue.shift()!;
      
      for (const dir of directions) {
        const nq = q + dir.q;
        const nr = r + dir.r;
        const key = `${nq},${nr}`;
        const neighbor = gridMap.get(key);
        
        if (neighbor && !visited.has(key)) {
          if (neighbor.category !== 'Mainland' && neighbor.category !== 'Island') {
            visited.add(key);
            queue.push({ q: nq, r: nr });
          }
        }
      }
    }
    
    // Any InnerSea not visited is a hole
    shape.forEach(s => {
      if (s.category === 'InnerSea' && !visited.has(`${s.q},${s.r}`)) {
        s.category = 'Mainland';
      }
    });
  };

  const generateMapTopology = useCallback((mapType: MapType, playerCount: number) => {
    const isLarge = playerCount > 4;
    const radius = isLarge ? 3 : 2;
    const totalRadius = radius + 1;

    let shape: { q: number, r: number, category: 'Mainland' | 'Island' | 'InnerSea' | 'OuterSea' | 'Desert' | 'GoldCandidate' }[] = [];

    // 1. Generate Grid Shape
    if (mapType === 'archipelago') {
      const topEdge = playerCount <= 4 ? 5 : playerCount === 5 ? 6 : 7;
      const R = 3; 
      const S = topEdge - 4; 
      const qOffset = Math.floor(S / 2);

      for (let r = -R; r <= R; r++) {
        const qMin = Math.max(-R, -r - R);
        const qMax = Math.min(R + S, -r + R + S);
        for (let q = qMin; q <= qMax; q++) {
          shape.push({ q: q - qOffset, r, category: 'InnerSea' });
        }
      }
      
      const innerSet = new Set(shape.map(s => `${s.q},${s.r}`));
      const outerCandidates = new Set<string>();
      shape.forEach(s => {
        const neighbors = [
            {q: s.q+1, r: s.r}, {q: s.q-1, r: s.r},
            {q: s.q, r: s.r+1}, {q: s.q, r: s.r-1},
            {q: s.q+1, r: s.r-1}, {q: s.q-1, r: s.r+1}
        ];
        neighbors.forEach(n => {
            const key = `${n.q},${n.r}`;
            if (!innerSet.has(key)) {
                outerCandidates.add(key);
            }
        });
      });
      outerCandidates.forEach(k => {
          const [q, r] = k.split(',').map(Number);
          shape.push({ q, r, category: 'OuterSea' });
      });

    } else {
      for (let q = -totalRadius; q <= totalRadius; q++) {
        for (let r = -totalRadius; r <= totalRadius; r++) {
          if (Math.abs(q + r) <= totalRadius) {
            const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
            if (dist === totalRadius) {
              shape.push({ q, r, category: 'OuterSea' });
            } else {
              shape.push({ q, r, category: 'InnerSea' });
            }
          }
        }
      }
    }

    // 2. Generate Land Masses
    let goldCount = 0;
    let desertCount = 0;

    if (mapType === 'archipelago') {
        if (playerCount === 4) { goldCount = 2; desertCount = 3; }
        else if (playerCount === 6) { goldCount = 3; desertCount = 5; }
        else { goldCount = 2; desertCount = 3; } // 5 players
    } else {
        goldCount = isLarge ? 3 : 1;
        desertCount = isLarge ? 2 : 1;
    }
    
    const landLimit = mapType === 'archipelago' ? 0 : (isLarge ? 37 : 19); // landLimit unused in archipelago now
    const landHexes = new Map<string, {id: number, category: 'Mainland' | 'Island'}>();

    if (mapType === 'standard') {
        const innerHexes = shape.filter(s => s.category === 'InnerSea').sort(() => Math.random() - 0.5);
        for (let i = 0; i < landLimit && i < innerHexes.length; i++) {
            innerHexes[i].category = 'Mainland';
        }
        fillMainlandHoles(shape);

        // Standard map MUST have at least one desert (1 for small, 2 for large)
        const mainlandHexes = shape.filter(s => s.category === 'Mainland');
        const numStandardDeserts = isLarge ? 2 : 1;
        for (let i = 0; i < numStandardDeserts && i < mainlandHexes.length; i++) {
            // Picking random mainland hexes for desert
            const randomIndex = Math.floor(Math.random() * mainlandHexes.length);
            const target = mainlandHexes.splice(randomIndex, 1)[0];
            target.category = 'Desert';
        }
    } else {
        let minIslands = 2, maxIslands = 3, minIslandSize = 2, maxIslandSize = 4, minTotalIslandHexes = 8, maxTotalIslandHexes = 9;
        if (playerCount === 5) { minIslands = 3; maxIslands = 4; minIslandSize = 2; maxIslandSize = 4; minTotalIslandHexes = 10; maxTotalIslandHexes = 11; }
        if (playerCount === 6) { minIslands = 3; maxIslands = 5; minIslandSize = 3; maxIslandSize = 5; minTotalIslandHexes = 14; maxTotalIslandHexes = 15; }

        let numIslands = 0;
        let islandTargetSizes: number[] = [];
        let totalIslandHexes = 0;
        
        while (totalIslandHexes < minTotalIslandHexes || totalIslandHexes > maxTotalIslandHexes) {
            numIslands = Math.floor(Math.random() * (maxIslands - minIslands + 1)) + minIslands;
            islandTargetSizes = [];
            for (let i = 0; i < numIslands; i++) {
                islandTargetSizes.push(Math.floor(Math.random() * (maxIslandSize - minIslandSize + 1)) + minIslandSize);
            }
            totalIslandHexes = islandTargetSizes.reduce((a, b) => a + b, 0);
        }
        
        // Identify strictly edge candidates (InnerSea adjacent to OuterSea)
        const outerSeaSet = new Set(shape.filter(s => s.category === 'OuterSea').map(s => `${s.q},${s.r}`));
        const allInnerSea = shape.filter(s => s.category === 'InnerSea');
        const strictEdgeCandidates = allInnerSea.filter(s => {
            const neighbors = [
                {q: s.q+1, r: s.r}, {q: s.q-1, r: s.r},
                {q: s.q, r: s.r+1}, {q: s.q, r: s.r-1},
                {q: s.q+1, r: s.r-1}, {q: s.q-1, r: s.r+1}
            ];
            return neighbors.some(n => outerSeaSet.has(`${n.q},${n.r}`));
        });

        let islandsPlacedCount = 0;
        let retryCount = 0;
        const MAX_RETRIES = 100;

        // Retry loop for island placement
        while (islandsPlacedCount < numIslands && retryCount < MAX_RETRIES) {
            // Reset for this attempt
            landHexes.clear();
            islandsPlacedCount = 0;
            let islandIdCounter = 1;
            
            // Shuffle candidates for randomness
            const currentCandidates = [...strictEdgeCandidates].sort(() => Math.random() - 0.5);

            for (const targetSize of islandTargetSizes) {
                let seedFound = false;
                for (const seed of currentCandidates) {
                    const seedKey = `${seed.q},${seed.r}`;
                    if (landHexes.has(seedKey)) continue;

                    // Check distance from other islands
                    let isFarEnough = true;
                    for (const [key] of landHexes.entries()) {
                        const [lq, lr] = key.split(',').map(Number);
                        const dist = Math.max(Math.abs(seed.q - lq), Math.abs(seed.r - lr), Math.abs(seed.q + seed.r - (lq + lr)));
                        if (dist < 3) { 
                            isFarEnough = false;
                            break;
                        }
                    }

                    if (isFarEnough) {
                        const islandQueue = [seed];
                        const visitedInIsland = new Set([seedKey]);
                        
                        // Temporary map for this island to verify it can grow
                        const tempIslandHexes = new Map<string, {id: number, category: 'Mainland' | 'Island'}>();
                        tempIslandHexes.set(seedKey, {id: islandIdCounter, category: 'Island'});

                        while(islandQueue.length > 0 && visitedInIsland.size < targetSize) {
                            const current = islandQueue.shift()!;
                            const neighbors = [
                                {q: current.q+1, r: current.r}, {q: current.q-1, r: current.r},
                                {q: current.q, r: current.r+1}, {q: current.q, r: current.r-1},
                                {q: current.q+1, r: current.r-1}, {q: current.q-1, r: current.r+1}
                            ];
                            
                            // Prioritize neighbors that are also edge candidates to encourage growth along the rim
                            neighbors.sort((a, b) => {
                                const aIsEdge = outerSeaSet.has(`${a.q},${a.r}`) || strictEdgeCandidates.some(s => s.q === a.q && s.r === a.r);
                                const bIsEdge = outerSeaSet.has(`${b.q},${b.r}`) || strictEdgeCandidates.some(s => s.q === b.q && s.r === b.r);
                                if (aIsEdge && !bIsEdge) return -1;
                                if (!aIsEdge && bIsEdge) return 1;
                                return Math.random() - 0.5;
                            });

                            for (const n of neighbors) {
                                const nKey = `${n.q},${n.r}`;
                                const nHex = shape.find(s => s.q === n.q && s.r === n.r);
                                // Can grow into InnerSea that is not already occupied
                                if (nHex && nHex.category === 'InnerSea' && !landHexes.has(nKey) && !tempIslandHexes.has(nKey) && visitedInIsland.size < targetSize) {
                                    tempIslandHexes.set(nKey, {id: islandIdCounter, category: 'Island'});
                                    visitedInIsland.add(nKey);
                                    islandQueue.push(nHex);
                                }
                            }
                        }

                        // Only commit if we reached target size (or close to it, e.g. >= targetSize - 1)
                        // For strictness, let's require full size or at least min size
                        if (visitedInIsland.size >= minIslandSize) {
                            tempIslandHexes.forEach((val, key) => {
                                landHexes.set(key, val);
                                const [q, r] = key.split(',').map(Number);
                                const hex = shape.find(s => s.q === q && s.r === r);
                                if (hex) hex.category = 'Island';
                            });
                            islandIdCounter++;
                            islandsPlacedCount++;
                            seedFound = true;
                            break; 
                        }
                    }
                }
                if (!seedFound) {
                    // If we failed to place an island, break and retry the whole process
                    break;
                }
            }
            retryCount++;
        }
        
        // If we failed after retries, fallback (should be rare)
        if (islandsPlacedCount < numIslands) {
            console.warn("Failed to place all islands after retries");
        }

        // 2. Create Buffer Zone (Sea/Desert) & Place Deserts
        const bufferSet = new Set<string>();
        landHexes.forEach((val, key) => {
            if (val.category === 'Island') {
                const [q, r] = key.split(',').map(Number);
                const neighbors = [
                    {q: q+1, r: r}, {q: q-1, r: r},
                    {q: q, r: r+1}, {q: q, r: r-1},
                    {q: q+1, r: r-1}, {q: q-1, r: r+1}
                ];
                for (const n of neighbors) {
                    const nKey = `${n.q},${n.r}`;
                    const hex = shape.find(s => s.q === n.q && s.r === n.r);
                    // Only add to buffer if it's InnerSea and not already an Island
                    if (hex && hex.category === 'InnerSea' && !landHexes.has(nKey)) {
                        bufferSet.add(nKey);
                    }
                }
            }
        });

        // Place Deserts in Buffer (Cluster them)
        const bufferArray = Array.from(bufferSet);
        let desertsToPlace = desertCount;
        const desertHexes = new Set<string>();

        if (bufferArray.length > 0 && desertsToPlace > 0) {
            // Pick first random desert
            let currentKey = bufferArray[Math.floor(Math.random() * bufferArray.length)];
            desertHexes.add(currentKey);
            desertsToPlace--;

            while (desertsToPlace > 0) {
                // Try to find a buffer neighbor of existing deserts
                const candidates = new Set<string>();
                desertHexes.forEach(k => {
                    const [q, r] = k.split(',').map(Number);
                    const neighbors = [
                        {q: q+1, r: r}, {q: q-1, r: r},
                        {q: q, r: r+1}, {q: q, r: r-1},
                        {q: q+1, r: r-1}, {q: q-1, r: r+1}
                    ];
                    for (const n of neighbors) {
                        const nKey = `${n.q},${n.r}`;
                        if (bufferSet.has(nKey) && !desertHexes.has(nKey)) {
                            candidates.add(nKey);
                        }
                    }
                });

                if (candidates.size > 0) {
                    const arr = Array.from(candidates);
                    currentKey = arr[Math.floor(Math.random() * arr.length)];
                    desertHexes.add(currentKey);
                    desertsToPlace--;
                } else {
                    // No adjacent buffer found, pick random remaining buffer
                    const remaining = bufferArray.filter(k => !desertHexes.has(k));
                    if (remaining.length === 0) break;
                    currentKey = remaining[Math.floor(Math.random() * remaining.length)];
                    desertHexes.add(currentKey);
                    desertsToPlace--;
                }
            }
        }

        // Apply Desert category
        desertHexes.forEach(k => {
            const [q, r] = k.split(',').map(Number);
            const hex = shape.find(s => s.q === q && s.r === r);
            if (hex) hex.category = 'Desert';
        });

        // 3. Fill Mainland (All remaining InnerSea that are not in buffer)
        shape.forEach(s => {
            const key = `${s.q},${s.r}`;
            if (s.category === 'InnerSea' && !bufferSet.has(key)) {
                s.category = 'Mainland';
                landHexes.set(key, {id: 0, category: 'Mainland'});
            }
        });

        // 4. Clean up isolated mainland hexes (islands that shouldn't exist)
        // Find the largest connected component of Mainland and remove everything else
        const mainlandKeys = Array.from(landHexes.entries())
            .filter(([k, v]) => v.category === 'Mainland')
            .map(([k]) => k);
        
        if (mainlandKeys.length > 0) {
            const visited = new Set<string>();
            let largestComponent: string[] = [];

            for (const key of mainlandKeys) {
                if (visited.has(key)) continue;
                
                const component: string[] = [];
                const queue = [key];
                visited.add(key);
                
                while (queue.length > 0) {
                    const curr = queue.shift()!;
                    component.push(curr);
                    const [q, r] = curr.split(',').map(Number);
                    const neighbors = [
                        {q: q+1, r: r}, {q: q-1, r: r},
                        {q: q, r: r+1}, {q: q, r: r-1},
                        {q: q+1, r: r-1}, {q: q-1, r: r+1}
                    ];
                    
                    for (const n of neighbors) {
                        const nKey = `${n.q},${n.r}`;
                        if (landHexes.has(nKey) && landHexes.get(nKey)!.category === 'Mainland' && !visited.has(nKey)) {
                            visited.add(nKey);
                            queue.push(nKey);
                        }
                    }
                }
                
                if (component.length > largestComponent.length) {
                    largestComponent = component;
                }
            }
            
            // Remove small components
            const largestSet = new Set(largestComponent);
            mainlandKeys.forEach(key => {
                if (!largestSet.has(key)) {
                    const [q, r] = key.split(',').map(Number);
                    const hex = shape.find(s => s.q === q && s.r === r);
                    if (hex) {
                        hex.category = 'InnerSea'; // Turn back to sea
                        landHexes.delete(key);
                    }
                }
            });
        }
    }

    const hexes: Hex[] = shape.map(s => {
        const landInfo = landHexes.get(`${s.q},${s.r}`);
        return {
            id: `${s.q},${s.r}`,
            q: s.q,
            r: s.r,
            type: s.category === 'Desert' ? HexType.Desert : HexType.Sea, 
            number: null,
            isMainland: s.category === 'Mainland' || s.category === 'GoldCandidate' || (s.category === 'Desert' && !shape.some(x => x.category === 'Island' && Math.max(Math.abs(x.q-s.q), Math.abs(x.r-s.r)) < 2)), 
            isIsland: s.category === 'Island',
            isOuterSea: s.category === 'OuterSea',
            _category: s.category,
            category: s.category,
            isStartingLand: false,
            islandId: landInfo ? landInfo.id : undefined
        } as any;
    });
    
    hexes.forEach(h => {
        if (h.type === HexType.Desert) {
            const neighbors = hexes.filter(n => Math.max(Math.abs(n.q - h.q), Math.abs(n.r - h.r), Math.abs((n.q + n.r) - (h.q + h.r))) === 1);
            if (neighbors.some(n => n.isMainland)) h.isMainland = true;
            if (neighbors.some(n => n.isIsland)) h.isIsland = true;
        }
    });

    // Calculate isStartingLand
    const unvisited = new Set(hexes.filter(h => h._category === 'Mainland').map(h => `${h.q},${h.r}`));
    let largestComponent: string[] = [];
    
    while (unvisited.size > 0) {
        const start = Array.from(unvisited)[0];
        const comp: string[] = [];
        const queue = [start];
        unvisited.delete(start);
        
        while (queue.length > 0) {
            const current = queue.shift()!;
            comp.push(current);
            const [q, r] = current.split(',').map(Number);
            const neighbors = [
                {q: q+1, r: r}, {q: q-1, r: r},
                {q: q, r: r+1}, {q: q, r: r-1},
                {q: q+1, r: r-1}, {q: q-1, r: r+1}
            ];
            for (const n of neighbors) {
                const key = `${n.q},${n.r}`;
                if (unvisited.has(key)) {
                    unvisited.delete(key);
                    queue.push(key);
                }
            }
        }
        if (comp.length > largestComponent.length) {
            largestComponent = comp;
        }
    }
    
    const startingLandSet = new Set(largestComponent);
    hexes.forEach(h => {
        if (startingLandSet.has(`${h.q},${h.r}`)) {
            h.isStartingLand = true;
        }
    });

    // Find all connected components of land hexes (excluding deserts)
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
    });
    return hexes;
  }, []);

  const distributeResources = useCallback((hexes: Hex[], mapType: MapType, playerCount: number) => {
      // Clone hexes to avoid mutating original topology data
      const newHexes = hexes.map(h => ({...h, number: null}));
      
      // Identify all land hexes (Mainland + Island)
      const landHexes = newHexes.filter(h => h.isMainland || h.isIsland);
      
      // Separate Desert (Fixed position) from potential resource slots
      const desertHexes = landHexes.filter(h => h._category === 'Desert' || h.type === HexType.Desert);
      const availableLandSlots = landHexes.filter(h => !desertHexes.some(d => d.id === h.id));
      
      // Reset all land types to Sea temporarily so we can distribute everything fresh
      availableLandSlots.forEach(h => h.type = HexType.Sea);

      // 1. Determine Gold Mine count and distribution
      let goldCount = 0;
      if (mapType === 'archipelago') {
          goldCount = playerCount <= 4 ? 2 : 3;
      } else {
          goldCount = playerCount > 4 ? 1 : 0;
      }

      let goldPlaced = 0;
      // In Archipelago, gold should preferentially be on DIFFERENT Islands for balanced exploration
      if (mapType === 'archipelago') {
          const islandHexes = availableLandSlots.filter(h => h.isIsland);
          const islandsById = new Map<number, Hex[]>();
          islandHexes.forEach(h => {
              if (h.islandId !== undefined) {
                  if (!islandsById.has(h.islandId)) islandsById.set(h.islandId, []);
                  islandsById.get(h.islandId)!.push(h);
              }
          });

          const islandIds = Array.from(islandsById.keys()).sort(() => Math.random() - 0.5);
          
          // First pass: one gold per island
          for (const id of islandIds) {
              if (goldPlaced >= goldCount) break;
              const islandHexes = islandsById.get(id)!;
              const randomHex = islandHexes[Math.floor(Math.random() * islandHexes.length)];
              randomHex.type = HexType.Gold;
              goldPlaced++;
          }
      }

      // Fill remaining gold if needed (or for standard map)
      const remainingForGold = availableLandSlots.filter(h => h.type === HexType.Sea);
      const shuffledRemainingForGold = [...remainingForGold].sort(() => Math.random() - 0.5);
      for (const hex of shuffledRemainingForGold) {
          if (goldPlaced >= goldCount) break;
          hex.type = HexType.Gold;
          goldPlaced++;
      }

      // 2. Distribute Standard Resources
      const standardResourceSlots = availableLandSlots.filter(h => h.type === HexType.Sea);
      
      const mainlandResSlots = standardResourceSlots.filter(h => h.isMainland);
      const islandResSlots = standardResourceSlots.filter(h => h.isIsland);

      const getBalancedPool = (count: number) => {
        const types = [HexType.Forest, HexType.Pasture, HexType.Fields, HexType.Hills, HexType.Mountains];
        let pool: HexType[] = [];
        const base = Math.floor(count / types.length);
        const remainder = count % types.length;
        for (let i = 0; i < types.length; i++) {
            for (let j = 0; j < base; j++) {
                pool.push(types[i]);
            }
        }
        const shuffledTypes = [...types].sort(() => Math.random() - 0.5);
        for (let i = 0; i < remainder; i++) {
            pool.push(shuffledTypes[i]);
        }
        return pool.sort(() => Math.random() - 0.5);
      };

      const mainlandResPool = getBalancedPool(mainlandResSlots.length);
      const islandResPool = getBalancedPool(islandResSlots.length);

      const assignResources = (slots: Hex[], pool: HexType[]) => {
          const shuffledSlots = [...slots].sort(() => Math.random() - 0.5);
          for (const hex of shuffledSlots) {
            const adj = newHexes.filter(n => Math.max(Math.abs(n.q - hex.q), Math.abs(n.r - hex.r), Math.abs((n.q + n.r) - (hex.q + hex.r))) === 1);
            const neighborTypes = new Set<HexType>();
            adj.forEach(n => { if (n.type !== HexType.Sea && n.type !== HexType.Desert && n.type !== HexType.Gold) neighborTypes.add(n.type); });
            
            const candidateIndex = pool.findIndex(r => !neighborTypes.has(r));
            if (candidateIndex !== -1) {
                hex.type = pool.splice(candidateIndex, 1)[0];
            } else {
                hex.type = pool.pop() || HexType.Sea;
            }
          }
      };

      if (mapType === 'archipelago') {
          assignResources(mainlandResSlots, mainlandResPool);
          assignResources(islandResSlots, islandResPool);
      } else {
          assignResources(standardResourceSlots, getBalancedPool(standardResourceSlots.length));
      }

      // 3. Distribute Numbers (2-12, skip 7)
      const mainlandHexes = newHexes.filter(h => h.isMainland && h.type !== HexType.Desert);
      const islandHexes = newHexes.filter(h => h.isIsland && h.type !== HexType.Desert);
      const allHexesNeedingNumbers = [...mainlandHexes, ...islandHexes];
      
      const countTarget = allHexesNeedingNumbers.length;
      
      const getMainlandNumberPool = (count: number) => {
        let pool: number[] = [];
        let count2_12 = Math.round(count * (1 / 18));
        let count3_4_10_11 = Math.round(count * (2 / 18));
        let count6_8 = Math.round(count * (2 / 18));
        
        if (count === 18) {
            count2_12 = 1;
            count3_4_10_11 = 2;
            count6_8 = 2;
        }

        for(let i=0; i<count2_12; i++) pool.push(2, 12);
        for(let i=0; i<count3_4_10_11; i++) pool.push(3, 4, 10, 11);
        for(let i=0; i<count6_8; i++) pool.push(6, 8);
        
        let remaining = count - pool.length;
        if (remaining > 0) {
            let fillers = [5, 9];
            for (let i = 0; i < remaining; i++) {
                pool.push(fillers[i % fillers.length]);
            }
        } else if (pool.length > count) {
            let toRemove = pool.length - count;
            const trimmable = pool.map((v, i) => ({v, i})).filter(x => x.v !== 6 && x.v !== 8).sort(() => Math.random() - 0.5);
            let indicesToRemove = new Set(trimmable.slice(0, toRemove).map(x => x.i));
            pool = pool.filter((_, i) => !indicesToRemove.has(i));
        }
        
        return pool.sort(() => Math.random() - 0.5);
      };

      const getIslandNumberPool = (count: number) => {
          let pool: number[] = [];
          const numbers = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
          let base = Math.floor(count / numbers.length);
          let remainder = count % numbers.length;
          
          for (let i = 0; i < numbers.length; i++) {
              for (let j = 0; j < base; j++) {
                  pool.push(numbers[i]);
              }
          }
          const shuffledNumbers = [...numbers].sort(() => Math.random() - 0.5);
          for (let i = 0; i < remainder; i++) {
              pool.push(shuffledNumbers[i]);
          }
          return pool.sort(() => Math.random() - 0.5);
      };

      const isRed = (n: number) => n === 6 || n === 8;
      const areAdjacent = (h1: Hex, h2: Hex) => Math.max(Math.abs(h1.q - h2.q), Math.abs(h1.r - h2.r), Math.abs((h1.q + h1.r) - (h2.q + h2.r))) === 1;

      let success = false;
      let attempts = 0;
      while (!success && attempts < 500) {
        attempts++;
        const currentHexes = allHexesNeedingNumbers.map(h => ({...h, id: h.id, q: h.q, r: h.r, isMainland: h.isMainland, isIsland: h.isIsland, number: null as number | null, type: h.type}));
        
        const mainlandDraft = currentHexes.filter(h => h.isMainland);
        const islandDraft = currentHexes.filter(h => h.isIsland);

        const mPool = getMainlandNumberPool(mainlandDraft.length).sort(() => Math.random() - 0.5);
        const iPool = getIslandNumberPool(islandDraft.length).sort(() => Math.random() - 0.5);

        const distributeGroup = (draft: any[], pool: number[]) => {
            const reds = pool.filter(isRed);
            const normals = pool.filter(n => !isRed(n));
            const shuffledDraft = [...draft].sort(() => Math.random() - 0.5);
            
            let redsPlaced = 0;
            const usedRedTypes = new Set<string>();
            
            for (let attempt = 0; attempt < 3; attempt++) {
                for (const h of shuffledDraft) {
                    if (h.number !== null) continue;
                    if (redsPlaced >= reds.length) break;
                    
                    const hasRedNeighbor = currentHexes.some(other => 
                       other.number !== null && isRed(other.number) && areAdjacent(h as any, other as any)
                    );
                    
                    if (!hasRedNeighbor) {
                       if (attempt < 2 && usedRedTypes.has(h.type)) continue;
                       h.number = reds[redsPlaced++];
                       usedRedTypes.add(h.type);
                    }
                }
            }
            if (redsPlaced < reds.length) return false;
            
            for (const h of draft) {
                if (h.number === null) {
                    h.number = normals.pop()!;
                }
            }
            return true;
        };

        const mSuccess = distributeGroup(mainlandDraft, mPool);
        if (!mSuccess) continue;
        
        const iSuccess = distributeGroup(islandDraft, iPool);
        if (!iSuccess) continue;
        
        success = true;
        allHexesNeedingNumbers.forEach((h) => {
            const result = currentHexes.find(ch => ch.id === h.id);
            if (result) h.number = result.number;
        });
      }

      if (!success) {
          const currentHexes = allHexesNeedingNumbers.map(h => ({...h, id: h.id, q: h.q, r: h.r, isMainland: h.isMainland, isIsland: h.isIsland, number: null as number | null}));
          const mainlandDraft = currentHexes.filter(h => h.isMainland);
          const islandDraft = currentHexes.filter(h => h.isIsland);

          const mPool = getMainlandNumberPool(mainlandDraft.length).sort(() => Math.random() - 0.5);
          const iPool = getIslandNumberPool(islandDraft.length).sort(() => Math.random() - 0.5);

          mainlandDraft.forEach((h, i) => h.number = mPool[i]);
          islandDraft.forEach((h, i) => h.number = iPool[i]);
          
          for (let i = 0; i < 200; i++) {
              let hasViolation = false;
              for (const h of currentHexes) {
                  if (h.number !== null && isRed(h.number)) {
                      const neighbors = currentHexes.filter(other => areAdjacent(h as any, other as any));
                      if (neighbors.some(n => n.number !== null && isRed(n.number))) {
                          hasViolation = true;
                          const group = h.isMainland ? mainlandDraft : islandDraft;
                          const safeNonReds = group.filter(x => {
                              if (x.number === null || isRed(x.number)) return false;
                              const xNeighbors = currentHexes.filter(other => areAdjacent(x as any, other as any));
                              return !xNeighbors.some(n => n.number !== null && n.id !== h.id && isRed(n.number));
                          });
                          
                          let target;
                          if (safeNonReds.length > 0) {
                              target = safeNonReds[Math.floor(Math.random() * safeNonReds.length)];
                          } else {
                              const nonReds = group.filter(x => x.number !== null && !isRed(x.number));
                              if (nonReds.length > 0) target = nonReds[Math.floor(Math.random() * nonReds.length)];
                          }
                          
                          if (target) {
                              const temp = h.number;
                              h.number = target.number;
                              target.number = temp;
                          }
                      }
                  }
              }
              if (!hasViolation) break;
          }
          
          allHexesNeedingNumbers.forEach((h) => {
              const result = currentHexes.find(ch => ch.id === h.id);
              if (result) h.number = result.number;
          });
      }

      // Special handling for archipelago gold mines - sometimes restrict numbers if needed for balance
      if (mapType === 'archipelago') {
          const goldHexes = newHexes.filter(h => h.type === HexType.Gold && h.number !== null);
          const preferredGoldNums = [2, 3, 4, 10, 11, 12];
          goldHexes.forEach(gHex => {
              if (gHex.number && !preferredGoldNums.includes(gHex.number)) {
                  const candidate = newHexes.find(h => h.type !== HexType.Gold && h.type !== HexType.Desert && h.type !== HexType.Sea && h.number !== null && preferredGoldNums.includes(h.number));
                  if (candidate && candidate.number) {
                      const temp = gHex.number;
                      gHex.number = candidate.number;
                      candidate.number = temp;
                  }
              }
          });
      }
      if (window.location.search.includes('debug')) {
        const counts = (hexList: Hex[]) => {
          const res: Record<string, number> = {};
          const nums: Record<number, number> = {};
          hexList.forEach(h => {
            if (h.type !== HexType.Sea && h.type !== HexType.Desert) {
              const typeStr = ResourceType[h.type as any] || h.type;
              res[typeStr] = (res[typeStr] || 0) + 1;
              if (h.number) {
                nums[h.number] = (nums[h.number] || 0) + 1;
              }
            }
          });
          return { resources: res, numbers: nums };
        };
        console.group("🎲 Map Generation Stats");
        console.log("Mainland Stats:", counts(newHexes.filter(h => h.isMainland)));
        console.log("Islands Stats:", counts(newHexes.filter(h => h.isIsland)));
        console.groupEnd();
      }

      return newHexes;
  }, []);

  const generateEdgesAndVertices = (hexes: Hex[]) => {
    const vertices = new Map<string, any>();
    const edges = new Map<string, any>();
    const HEX_RADIUS = 40;
    const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
    const HEX_HEIGHT = 2 * HEX_RADIUS;

    hexes.forEach(hex => {
      const x = HEX_WIDTH * (hex.q + hex.r / 2);
      const y = HEX_HEIGHT * 0.75 * hex.r;

      for (let i = 0; i < 6; i++) {
        const angle_rad = (Math.PI / 180) * (60 * i + 30);
        const vx = x + HEX_RADIUS * Math.cos(angle_rad);
        const vy = y + HEX_RADIUS * Math.sin(angle_rad);
        const vKey = `${Math.round(vx)},${Math.round(vy)}`;
        if (!vertices.has(vKey)) {
          vertices.set(vKey, { id: vKey, x: vx, y: vy, hexIds: [hex.id] });
        } else {
          vertices.get(vKey).hexIds.push(hex.id);
        }

        const angle2_rad = (Math.PI / 180) * (60 * ((i + 1) % 6) + 30);
        const vx2 = x + HEX_RADIUS * Math.cos(angle2_rad);
        const vy2 = y + HEX_RADIUS * Math.sin(angle2_rad);
        const vKey2 = `${Math.round(vx2)},${Math.round(vy2)}`;

        const edgeKey = [vKey, vKey2].sort().join('|');
        if (!edges.has(edgeKey)) {
          edges.set(edgeKey, { id: edgeKey, v1: vKey, v2: vKey2, x1: vx, y1: vy, x2: vx2, y2: vy2 });
        }
      }
    });

    return { edges: Array.from(edges.values()), vertices: Array.from(vertices.values()) };
  };

  const generateBoard = useCallback((mapType: MapType = 'standard', playerCount: number = 4) => {
    const topology = generateMapTopology(mapType, playerCount);
    const hexes = distributeResources(topology, mapType, playerCount);
    const { edges, vertices } = generateEdgesAndVertices(hexes);
    return { hexes, edges, vertices };
  }, [generateMapTopology, distributeResources, generateEdgesAndVertices]);



  const initGame = useCallback((playerCount: number, mapType: MapType = 'standard', customBoard?: Hex[], botConfig?: boolean[], connectedPlayers?: string[], playerNames?: string[], seatNumbers?: number[]) => {
    let cpIndex = 0;
    const players: Player[] = Array.from({ length: playerCount }, (_, i) => {
      const isConfiguredBot = botConfig ? botConfig[i] : false;
      const isRealPlayer = !isConfiguredBot && connectedPlayers && cpIndex < connectedPlayers.length;
      
      let pName = `玩家 ${i + 1}`;
      let pSessionId: string | undefined = undefined;
      
      if (isRealPlayer) {
        pName = (playerNames && playerNames[cpIndex]) ? playerNames[cpIndex] : pName;
        pSessionId = connectedPlayers?.[cpIndex];
        cpIndex++;
      } else if (isConfiguredBot) {
        pName = `领主 AI ${seatNumbers?.[i] ?? i + 1}`;
      }

      return {
        id: i,
        name: pName,
        color: PLAYER_COLORS[i],
        isBot: isConfiguredBot,
        sessionId: pSessionId,
        resources: {
          [ResourceType.Lumber]: 0,
          [ResourceType.Brick]: 0,
          [ResourceType.Wool]: 0,
          [ResourceType.Grain]: 0,
          [ResourceType.Ore]: 0,
        },
        victoryPoints: 0,
        roads: 0,
      ships: 0,
      settlements: 0,
      cities: 0,
      devCards: [],
      devCardsBoughtThisTurn: [],
      playedDevCards: [],
      knightsPlayed: 0,
      longestRoadLength: 0,
      vpCardsCount: 0,
      islandBonusPoints: 0,
      discoveredIslandIds: [],
    };
    });

    let initialHexes: Hex[];
    if (customBoard) {
      // Re-distribute resources and numbers for the custom board to ensure fresh game
      initialHexes = distributeResources(customBoard, mapType, playerCount);
    } else {
      initialHexes = generateBoard(mapType, playerCount).hexes;
    }

    const { hexes, edges, vertices } = { 
      hexes: initialHexes, 
      ...generateEdgesAndVertices(initialHexes) 
    };

    const desertHex = hexes.find(h => h.type === HexType.Desert);

    // Generate Ports
    const ports: Port[] = [];
    
    // 1. Identify Land Hexes
    const landHexes = hexes.filter(h => h.isMainland || h.isIsland);
    
    // 2. Count edge occurrences to find coastal edges
    const edgeCounts = new Map<string, number>();
    const edgeToVertexMap = new Map<string, [string, string]>();
    
    landHexes.forEach(hex => {
        const HEX_RADIUS = 40;
        const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
        const HEX_HEIGHT = 2 * HEX_RADIUS;
        const x = HEX_WIDTH * (hex.q + hex.r / 2);
        const y = HEX_HEIGHT * 0.75 * hex.r;
        
        for (let i = 0; i < 6; i++) {
            const a1 = (Math.PI / 180) * (60 * i + 30);
            const a2 = (Math.PI / 180) * (60 * ((i + 1) % 6) + 30);
            const x1 = x + HEX_RADIUS * Math.cos(a1);
            const y1 = y + HEX_RADIUS * Math.sin(a1);
            const x2 = x + HEX_RADIUS * Math.cos(a2);
            const y2 = y + HEX_RADIUS * Math.sin(a2);
            const v1 = `${Math.round(x1)},${Math.round(y1)}`;
            const v2 = `${Math.round(x2)},${Math.round(y2)}`;
            const edgeKey = [v1, v2].sort().join('|');
            
            edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) || 0) + 1);
            edgeToVertexMap.set(edgeKey, [v1, v2]);
        }
    });

    // 3. Filter Coastal Edges (count === 1)
    // Only consider edges that are not shared between two land hexes
    let coastalEdges = Array.from(edgeCounts.entries())
        .filter(([_, count]) => count === 1)
        .map(([key, _]) => key);
        
    // 4. Shuffle edges for random placement
    coastalEdges.sort(() => Math.random() - 0.5);
    
    // 5. Determine Port Types
    const numPorts = playerCount <= 4 ? 9 : 11;
    
    const portTypes: (ResourceType | '3:1')[] = [];
    
    if (numPorts === 9) {
        portTypes.push('3:1', '3:1', '3:1', '3:1');
        portTypes.push(ResourceType.Lumber, ResourceType.Brick, ResourceType.Wool, ResourceType.Grain, ResourceType.Ore);
    } else {
        portTypes.push('3:1', '3:1', '3:1', '3:1', '3:1');
        portTypes.push(ResourceType.Lumber, ResourceType.Brick, ResourceType.Wool, ResourceType.Wool, ResourceType.Grain, ResourceType.Ore);
    }
    
    // Shuffle types
    portTypes.sort(() => Math.random() - 0.5);
    
    // 6. Place Ports
    const occupiedVertices = new Set<string>();
    
    for (const type of portTypes) {
        // Find an edge that doesn't conflict (ensure spacing)
        const edgeIndex = coastalEdges.findIndex(edge => {
            const [v1, v2] = edgeToVertexMap.get(edge)!;
            return !occupiedVertices.has(v1) && !occupiedVertices.has(v2);
        });
        
        if (edgeIndex !== -1) {
            const edge = coastalEdges[edgeIndex];
            const [v1, v2] = edgeToVertexMap.get(edge)!;
            
            ports.push({
                edgeId: edge,
                type: type,
                vertexIds: [v1, v2]
            });
            
            // Mark vertices as occupied to prevent adjacent ports
            occupiedVertices.add(v1);
            occupiedVertices.add(v2);
            
            // Remove used edge
            coastalEdges.splice(edgeIndex, 1);
        }
    }

    const devCards: DevCardType[] = [
      ...Array(14).fill(DevCardType.Knight),
      ...Array(5).fill(DevCardType.VictoryPoint),
      ...Array(2).fill(DevCardType.RoadBuilding),
      ...Array(2).fill(DevCardType.YearOfPlenty),
      ...Array(2).fill(DevCardType.Monopoly),
    ].sort(() => Math.random() - 0.5);

    const state: GameState = {
      board: hexes,
      ports,
      players,
      currentPlayerIndex: 0,
      dice: [0, 0],
      robberHexId: desertHex?.id || '0,0',
      pirateHexId: mapType === 'standard' ? null : 'pirate_start',
      settlements: [],
      roads: [],
      ships: [],
      phase: 'initial_dice_roll',
      initialDiceRolls: {},
      initialRollQueue: players.map((_, i) => i),
      setupStep: 0,
      hasRolled: false,
      hasBuiltThisTurn: false,
      hasPlayedDevCardThisTurn: false,
      longestRoadPlayerId: null,
      largestArmyPlayerId: null,
      winnerId: null,
      bankResources: {
        [ResourceType.Lumber]: 24,
        [ResourceType.Brick]: 24,
        [ResourceType.Wool]: 24,
        [ResourceType.Grain]: 24,
        [ResourceType.Ore]: 24,
      },
      bankDevCards: devCards,
      mapType,
      targetScore: mapType === 'standard' ? 10 : 14,
      pendingStealFrom: [],
      pendingGoldRewards: [],
      pendingDiscards: [],
      tradeOffers: [],
    };

    setGameState(state);
    return state;
  }, [generateBoard]);

  const resolveInitialRoll = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.phase !== 'initial_dice_roll' || !prev.hasRolled) return prev;

      const currentId = prev.players[prev.currentPlayerIndex].id;
      const rollSum = prev.dice[0] + prev.dice[1];
      
      const playerHistory = prev.initialDiceRolls[currentId] || [];
      const newHistory = [...playerHistory, rollSum];
      const newRolls = { ...prev.initialDiceRolls, [currentId]: newHistory };

      const queue = prev.initialRollQueue ? [...prev.initialRollQueue] : [];
      const queueIndex = queue.indexOf(currentId);
      if (queueIndex !== -1) queue.splice(queueIndex, 1);

      if (queue.length > 0) {
         return {
             ...prev,
             initialDiceRolls: newRolls,
             initialRollQueue: queue,
             currentPlayerIndex: prev.players.findIndex(p => p.id === queue[0]),
             hasRolled: false,
             dice: [0, 0]
         };
      }

      const playersByHistory = prev.players.map(p => ({ id: p.id, history: newRolls[p.id] || [] }));

      playersByHistory.sort((a, b) => {
          const minLen = Math.min(a.history.length, b.history.length);
          for (let i = 0; i < minLen; i++) {
              if (b.history[i] !== a.history[i]) {
                  return b.history[i] - a.history[i];
              }
          }
          return b.history.length - a.history.length;
      });

      const ties = new Set<number>();
      for (let i = 0; i < playersByHistory.length - 1; i++) {
          const a = playersByHistory[i];
          const b = playersByHistory[i+1];
          if (a.history.length === b.history.length) {
              let isTie = true;
              for (let j = 0; j < a.history.length; j++) {
                  if (a.history[j] !== b.history[j]) isTie = false;
              }
              if (isTie) {
                  ties.add(a.id);
                  ties.add(b.id);
              }
          }
      }

      if (ties.size > 0) {
          const newQueue = Array.from(ties);
          return {
              ...prev,
              initialDiceRolls: newRolls,
              initialRollQueue: newQueue,
              currentPlayerIndex: prev.players.findIndex(p => p.id === newQueue[0]),
              hasRolled: false,
              dice: [0, 0]
          };
      }

      const newPlayers = playersByHistory.map(ph => {
          return { ...prev.players.find(p => p.id === ph.id)! };
      });
      
      const newRollsKeysReassigned: Record<number, number[]> = {};
      newPlayers.forEach((p, idx) => {
          newRollsKeysReassigned[idx] = newRolls[p.id];
          p.id = idx;
      });

      return {
          ...prev,
          players: newPlayers,
          initialDiceRolls: newRollsKeysReassigned,
          initialRollQueue: [],
          phase: 'setup',
          currentPlayerIndex: 0,
          hasRolled: false,
          dice: [0, 0]
      };
    });
  }, []);

  const rollDice = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.phase === 'finished') return prev;

      if (prev.phase === 'initial_dice_roll') {
        if (prev.hasRolled) return prev;
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        return { ...prev, dice: [d1, d2], hasRolled: true };
      }

      if (prev.phase === 'setup' || prev.hasRolled) return prev;
      
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      return { ...prev, dice: [d1, d2] as [number, number], hasRolled: true, diceRollPending: true };
    });
  }, []);

  const resolveDiceRoll = useCallback(() => {
    setGameState(prev => {
      if (!prev || !prev.hasRolled || prev.diceRollPending === false) return prev;
      if (prev.phase === 'initial_dice_roll' || prev.phase === 'setup') return prev;
      if (prev.dice[0] === 0 || prev.dice[1] === 0) return prev;

      const total = prev.dice[0] + prev.dice[1];
      const next = { ...prev, diceRollPending: false };

      if (total === 7) {
        next.activeBuildMode = null;
        // Check for players with > 7 cards
        const pendingDiscards: { playerId: number, amount: number }[] = [];
        next.players.forEach(p => {
          const totalCards = Object.values(p.resources).reduce((a, b) => a + b, 0);
          if (totalCards > 7) {
            pendingDiscards.push({ playerId: p.id, amount: Math.floor(totalCards / 2) });
          }
        });

        next.phase = 'rolling_7';
        next.pendingDiscards = pendingDiscards;
      } else {
        // Distribute resources
        const updatedPlayers = [...next.players];
        const updatedBank = { ...next.bankResources };
        const pendingGold: { playerId: number, amount: number }[] = [];

        next.board.forEach(hex => {
          if (hex.number === total && hex.id !== next.robberHexId && hex.id !== next.pirateHexId) {
            next.settlements.forEach(s => {
              if (s.hexIds.includes(hex.id)) {
                const amount = s.isCity ? 2 : 1;
                
                if (hex.type === HexType.Gold) {
                  pendingGold.push({ playerId: s.playerId, amount });
                } else {
                  const resourceMap: any = {
                    [HexType.Forest]: ResourceType.Lumber,
                    [HexType.Hills]: ResourceType.Brick,
                    [HexType.Pasture]: ResourceType.Wool,
                    [HexType.Fields]: ResourceType.Grain,
                    [HexType.Mountains]: ResourceType.Ore,
                  };
                  const resToGive = resourceMap[hex.type];
                  if (resToGive && updatedBank[resToGive] >= amount) {
                    updatedPlayers[s.playerId] = {
                      ...updatedPlayers[s.playerId],
                      resources: {
                        ...updatedPlayers[s.playerId].resources,
                        [resToGive]: updatedPlayers[s.playerId].resources[resToGive] + amount
                      }
                    };
                    updatedBank[resToGive] -= amount;
                  }
                }
              }
            });
          }
        });

        next.players = updatedPlayers;
        next.bankResources = updatedBank;
        
        if (pendingGold.length > 0) {
          next.phase = 'gold_selection';
          next.pendingGoldRewards = Object.values(pendingGold.reduce((acc, curr) => {
            if (!acc[curr.playerId]) acc[curr.playerId] = { playerId: curr.playerId, amount: 0 };
            acc[curr.playerId].amount += curr.amount;
            return acc;
          }, {} as Record<number, { playerId: number, amount: number }>));
        }
      }
      return next;
    });
  }, []);

  const discardCards = useCallback((playerId: number, resources: Record<ResourceType, number>) => {
    setGameState(prev => {
      if (!prev || prev.phase !== 'discard') return prev;
      
      const pendingIdx = prev.pendingDiscards.findIndex(p => p.playerId === playerId);
      if (pendingIdx === -1) return prev;
      
      const pending = prev.pendingDiscards[pendingIdx];
      const discardCount = Object.values(resources).reduce((a, b) => a + b, 0);
      
      if (discardCount !== pending.amount) return prev; // Must discard exact amount
      
      const updatedPlayers = [...prev.players];
      const player = { ...updatedPlayers[playerId], resources: { ...updatedPlayers[playerId].resources } };
      const updatedBank = { ...prev.bankResources };
      
      // Remove resources
      for (const [res, amt] of Object.entries(resources)) {
        if (player.resources[res as ResourceType] < amt) return prev; // Validation
        player.resources[res as ResourceType] -= amt;
        updatedBank[res as ResourceType] += amt;
      }
      
      updatedPlayers[playerId] = player;
      
      const nextPendingDiscards = [...prev.pendingDiscards];
      nextPendingDiscards.splice(pendingIdx, 1);
      
      let nextPhase: GameState['phase'] = prev.phase;
      if (nextPendingDiscards.length === 0) {
        nextPhase = 'robber';
      }
      
      return {
        ...prev,
        players: updatedPlayers,
        bankResources: updatedBank,
        pendingDiscards: nextPendingDiscards,
        phase: nextPhase
      };
    });
  }, []);

  const nextTurn = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.phase === 'setup' || prev.phase === 'finished' || prev.phase === 'initial_dice_roll' || prev.phase === 'order_determination') return prev;
      
      const updatedPlayers = [...prev.players];
      updatedPlayers[prev.currentPlayerIndex] = {
        ...updatedPlayers[prev.currentPlayerIndex],
        devCards: [...updatedPlayers[prev.currentPlayerIndex].devCards, ...(updatedPlayers[prev.currentPlayerIndex].devCardsBoughtThisTurn || [])],
        devCardsBoughtThisTurn: []
      };

      const pendingTradesClosed = (prev.tradeOffers || []).map(offer => 
        offer.status === 'pending' ? { ...offer, status: 'canceled' as const } : offer
      );

      return {
        ...prev,
        players: updatedPlayers,
        tradeOffers: pendingTradesClosed,
        currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length,
        phase: 'main',
        hasRolled: false,
        hasBuiltThisTurn: false,
        hasPlayedDevCardThisTurn: false,
        activeBuildMode: null,
      };
    });
  }, []);

  const calculatePlayerScore = (p: Player) => {
    const unplayedVPCards = p.devCards.filter(c => c === DevCardType.VictoryPoint).length;
    const vpBoughtThisTurn = (p.devCardsBoughtThisTurn || []).filter(c => c === DevCardType.VictoryPoint).length;
    // victoryPoints tracks other bonus points (Longest Road, Largest Army)
    // we also include islandBonusPoints and total VP cards (unplayed + played)
    // Note: p.victoryPoints is a bit redundant now if we use specific fields, 
    // but we'll use it to store total VP from cards and bonuses for now to keep it simple, 
    // or just sum everything here.
    const totalVpCards = unplayedVPCards + vpBoughtThisTurn + (p.playedDevCards?.filter(c => c === DevCardType.VictoryPoint).length || 0);
    
    return (p.settlements * 1) + (p.cities * 2) + p.victoryPoints + unplayedVPCards + vpBoughtThisTurn;
  };

  const getTargetScore = (mapType?: MapType) => {
    const currentMapType = mapType || gameState?.mapType || 'standard';
    return currentMapType === 'standard' ? 10 : 14;
  };

  const checkWinner = (players: Player[], mapType?: MapType) => {
    // Standard Catan rule: you can only win during your turn
    // (though in some digital versions it's immediate)
    const target = getTargetScore(mapType);
    const winner = players.find(p => calculatePlayerScore(p) >= target);
    return winner ? winner.id : null;
  };
 
  const buildRoad = useCallback((edgeId: string) => {
    setGameState(prev => {
      if (!prev) return null; if (prev.phase === 'finished') return prev;
      const player = prev.players[prev.currentPlayerIndex];
      
      const hexes = getHexesForEdge(prev.board, edgeId);
      
      // Check if road is on pure sea (invalid)
      const hasLand = hexes.some(h => h.type !== HexType.Sea && !h.isOuterSea);
      if (!hasLand) return prev;

      // Check if occupied
      if (prev.roads.some(r => r.edgeId === edgeId) || prev.ships.some(s => s.edgeId === edgeId)) return prev;

      const isSetup = prev.phase === 'setup';
      
      const totalRoads = prev.roads.filter(r => r.playerId === player.id).length;
      if (totalRoads >= 15) {
          console.warn("Road limit reached (15)");
          // Clear build mode if active, since we hit the limit
          return { ...prev, activeBuildMode: null };
      }

      const setupRoadsThisTurn = prev.roads.filter(r => r.playerId === prev.currentPlayerIndex).length;
      const setupSettlementsThisTurn = prev.settlements.filter(s => s.playerId === prev.currentPlayerIndex).length;

      // In setup, must build settlement first, then road
      if (isSetup) {
        if (setupRoadsThisTurn >= setupSettlementsThisTurn) return prev;
      } else if (prev.phase === 'road_building') {
        // Free road
      } else {
        const cost = COSTS.road;
        for (const [res, amt] of Object.entries(cost)) {
          if (player.resources[res as ResourceType] < amt) return prev;
        }
      }

      // Check connectivity
      const [v1Id, v2Id] = edgeId.split('|');

      const hasSettlementAtV1 = prev.settlements.some(s => s.playerId === player.id && s.vertexId === v1Id);
      const hasSettlementAtV2 = prev.settlements.some(s => s.playerId === player.id && s.vertexId === v2Id);
      
      const oppSettlementAtV1 = prev.settlements.some(s => s.playerId !== player.id && s.vertexId === v1Id);
      const oppSettlementAtV2 = prev.settlements.some(s => s.playerId !== player.id && s.vertexId === v2Id);

      const hasRoadAtV1 = prev.roads.some(r => r.playerId === player.id && r.edgeId !== edgeId && r.edgeId.split('|').includes(v1Id));
      const hasRoadAtV2 = prev.roads.some(r => r.playerId === player.id && r.edgeId !== edgeId && r.edgeId.split('|').includes(v2Id));
      
      const hasShipAtV1 = prev.ships.some(s => s.playerId === player.id && s.edgeId !== edgeId && s.edgeId.split('|').includes(v1Id));
      const hasShipAtV2 = prev.ships.some(s => s.playerId === player.id && s.edgeId !== edgeId && s.edgeId.split('|').includes(v2Id));
      
      // 道路可连接现有道路；若要与船只连接，该交汇顶点必须建有自己的村庄/城市
      const canConnectV1 = hasSettlementAtV1 || (hasRoadAtV1 && !oppSettlementAtV1);
      const canConnectV2 = hasSettlementAtV2 || (hasRoadAtV2 && !oppSettlementAtV2);
      const hasConnection = canConnectV1 || canConnectV2;

      // In setup, the road must connect to the settlement just placed
      if (isSetup) {
        const lastSettlement = prev.settlements.filter(s => s.playerId === player.id).pop();
        if (!lastSettlement || (lastSettlement.vertexId !== v1Id && lastSettlement.vertexId !== v2Id)) return prev;
      } else if (!hasConnection) {
        return prev;
      }

      const updatedPlayers = [...prev.players];
      const updatedPlayer = { 
        ...player, 
        roads: player.roads + 1,
        resources: { ...player.resources } 
      };
      const updatedBank = { ...prev.bankResources };

      let nextPhase = prev.phase;
      let nextFreeRoads = prev.freeRoads;

      if (!isSetup && prev.phase !== 'road_building') {
        for (const [res, amt] of Object.entries(COSTS.road)) {
          updatedPlayer.resources[res as ResourceType] -= amt;
          updatedBank[res as ResourceType] += amt;
        }
      } else if (prev.phase === 'road_building') {
        nextFreeRoads = (nextFreeRoads || 0) - 1;
        if (nextFreeRoads <= 0) {
          nextPhase = 'main';
        }
      }
      updatedPlayers[prev.currentPlayerIndex] = updatedPlayer;

      let nextStep = prev.setupStep;
      let nextPlayerIdx = prev.currentPlayerIndex;

      if (isSetup) {
        nextStep += 1;
        const playerCount = prev.players.length;
        if (nextStep < playerCount) {
          nextPlayerIdx = nextStep;
        } else if (nextStep < playerCount * 2) {
          nextPlayerIdx = playerCount - 1 - (nextStep - playerCount);
        } else {
          nextPhase = 'main';
          nextPlayerIdx = 0;
        }
      }

      const newRoads = [...prev.roads, { edgeId, playerId: player.id }];
      const { players: playersAfterRoad, longestRoadPlayerId } = updateLongestRoad(updatedPlayers, newRoads, prev.ships, prev.settlements, prev.longestRoadPlayerId);

      const winnerId = checkWinner(playersAfterRoad, prev.mapType);

      // Check if player can still build another road
      const costRoad = COSTS.road;
      let stillCanBuildRoad = true;
      if (nextPhase === 'road_building') {
        stillCanBuildRoad = (nextFreeRoads || 0) > 0;
      } else {
        for (const [res, amt] of Object.entries(costRoad)) {
          if (playersAfterRoad[prev.currentPlayerIndex].resources[res as ResourceType] < amt) {
            stillCanBuildRoad = false;
            break;
          }
        }
        if (playersAfterRoad[prev.currentPlayerIndex].roads >= 15) stillCanBuildRoad = false;
      }

      return {
        ...prev,
        players: playersAfterRoad,
        bankResources: updatedBank,
        roads: newRoads,
        phase: winnerId !== null ? 'finished' : nextPhase,
        winnerId,
        playingDevCard: nextPhase === 'main' ? null : prev.playingDevCard,
        setupStep: nextStep,
        currentPlayerIndex: nextPlayerIdx,
        freeRoads: nextFreeRoads,
        hasBuiltThisTurn: isSetup || prev.phase === 'road_building' ? prev.hasBuiltThisTurn : true,
        longestRoadPlayerId,
        activeBuildMode: winnerId !== null ? null : (isSetup ? (nextPhase === 'main' ? null : 'settlement') : (stillCanBuildRoad ? 'road' : null)),
      };
    });
  }, []);

  const buildShip = useCallback((edgeId: string) => {
    setGameState(prev => {
      if (!prev) return null; if (prev.phase === 'finished') return prev;
      const player = prev.players[prev.currentPlayerIndex];
      
      const isSetup = prev.phase === 'setup';
      if (isSetup) return prev; // Cannot build ships in setup

      const totalShips = prev.ships.filter(s => s.playerId === player.id).length;
      if (totalShips >= 15) {
          console.warn("Ship limit reached (15)");
          return { ...prev, activeBuildMode: null };
      }

      if (prev.phase === 'road_building') {
        // Free ship
      } else {
        const cost = COSTS.ship;
        for (const [res, amt] of Object.entries(cost)) {
          if (player.resources[res as ResourceType] < amt) return prev;
        }
      }

      // Check connectivity
      const [v1Id, v2Id] = edgeId.split('|');

      const hasSettlementAtV1 = prev.settlements.some(s => s.playerId === player.id && s.vertexId === v1Id);
      const hasSettlementAtV2 = prev.settlements.some(s => s.playerId === player.id && s.vertexId === v2Id);
      
      const oppSettlementAtV1 = prev.settlements.some(s => s.playerId !== player.id && s.vertexId === v1Id);
      const oppSettlementAtV2 = prev.settlements.some(s => s.playerId !== player.id && s.vertexId === v2Id);

      const hasShipAtV1 = prev.ships.some(s => s.playerId === player.id && s.edgeId !== edgeId && s.edgeId.split('|').includes(v1Id));
      const hasShipAtV2 = prev.ships.some(s => s.playerId === player.id && s.edgeId !== edgeId && s.edgeId.split('|').includes(v2Id));

      const hasRoadAtV1 = prev.roads.some(r => r.playerId === player.id && r.edgeId !== edgeId && r.edgeId.split('|').includes(v1Id));
      const hasRoadAtV2 = prev.roads.some(r => r.playerId === player.id && r.edgeId !== edgeId && r.edgeId.split('|').includes(v2Id));

      // 船只可连接现有船只；若要与道路/陆地相连修船，必须在交汇顶点修建村庄/城市
      const canConnectV1 = hasSettlementAtV1 || (hasShipAtV1 && !oppSettlementAtV1);
      const canConnectV2 = hasSettlementAtV2 || (hasShipAtV2 && !oppSettlementAtV2);
      const hasConnection = canConnectV1 || canConnectV2;

      if (!hasConnection) return prev;

      const hexes = getHexesForEdge(prev.board, edgeId);
      
      // Ships must be on sea edges or coastal edges
      const hasSea = hexes.some(h => h.type === HexType.Sea);
      if (!hasSea) return prev;

      // Check for Pirate
      const hasPirate = hexes.some(h => h.id === prev.pirateHexId);
      if (hasPirate) return prev;

      // Check if occupied
      if (prev.roads.some(r => r.edgeId === edgeId) || prev.ships.some(s => s.edgeId === edgeId)) return prev;

      const updatedPlayers = [...prev.players];
      const updatedPlayer = { 
        ...player, 
        ships: player.ships + 1,
        resources: { ...player.resources } 
      };
      const updatedBank = { ...prev.bankResources };

      let nextPhase = prev.phase;
      let nextFreeRoads = prev.freeRoads;

      if (prev.phase !== 'road_building') {
        for (const [res, amt] of Object.entries(COSTS.ship)) {
          updatedPlayer.resources[res as ResourceType] -= amt;
          updatedBank[res as ResourceType] += amt;
        }
      } else if (prev.phase === 'road_building') {
        nextFreeRoads = (nextFreeRoads || 0) - 1;
        if (nextFreeRoads <= 0) {
          nextPhase = 'main';
        }
      }
      updatedPlayers[prev.currentPlayerIndex] = updatedPlayer;

      const newShips = [...prev.ships, { edgeId, playerId: player.id }];
      const { players: playersAfterShip, longestRoadPlayerId } = updateLongestRoad(updatedPlayers, prev.roads, newShips, prev.settlements, prev.longestRoadPlayerId);

      const winnerId = checkWinner(playersAfterShip, prev.mapType);

      // Check if player can still build another ship
      const costShip = COSTS.ship;
      let stillCanBuildShip = true;
      if (prev.phase === 'road_building') {
        stillCanBuildShip = (nextFreeRoads || 0) > 0;
      } else {
        for (const [res, amt] of Object.entries(costShip)) {
          if (playersAfterShip[prev.currentPlayerIndex].resources[res as ResourceType] < amt) {
            stillCanBuildShip = false;
            break;
          }
        }
        if (playersAfterShip[prev.currentPlayerIndex].ships >= 15) stillCanBuildShip = false;
      }

      return {
        ...prev,
        players: playersAfterShip,
        bankResources: updatedBank,
        ships: newShips,
        phase: winnerId !== null ? 'finished' : nextPhase,
        winnerId,
        playingDevCard: nextPhase === 'main' ? null : prev.playingDevCard,
        freeRoads: nextFreeRoads,
        hasBuiltThisTurn: prev.phase === 'road_building' ? prev.hasBuiltThisTurn : true,
        longestRoadPlayerId,
        activeBuildMode: (winnerId !== null || !stillCanBuildShip) ? null : 'ship',
      };
    });
  }, []);

  const buildSettlement = useCallback((vertexId: string, hexIds: string[]) => {
    setGameState(prev => {
      if (!prev) return null; if (prev.phase === 'finished') return prev;
      const player = prev.players[prev.currentPlayerIndex];
      
      const isSetup = prev.phase === 'setup';
      const setupSettlementsThisTurn = prev.settlements.filter(s => s.playerId === prev.currentPlayerIndex).length;
      const setupRoadsThisTurn = prev.roads.filter(r => r.playerId === prev.currentPlayerIndex).length;

      // Cannot build on pure Sea vertices
      const isAllSea = hexIds.every(id => {
        const hex = prev.board.find(h => h.id === id);
        return hex?.type === HexType.Sea;
      });
      if (isAllSea) return prev;

      if (isSetup) {
        if (setupSettlementsThisTurn > setupRoadsThisTurn) return prev;
        if (setupSettlementsThisTurn >= 2) return prev;
        
        // Cannot build on Gold during setup
        const isGold = hexIds.some(id => {
          const hex = prev.board.find(h => h.id === id);
          return hex?.type === HexType.Gold;
        });
        if (isGold) return prev;
      } else {
        // Settlement limit (5 in standard Catan)
        if (player.settlements >= 5) {
          console.warn("Settlement limit reached (5)");
          return prev;
        }

        const cost = COSTS.settlement;
        for (const [res, amt] of Object.entries(cost)) {
          if (player.resources[res as ResourceType] < amt) return prev;
        }

        // Check connectivity for main phase
        const hasRoadConnection = 
          prev.roads.some(r => r.playerId === player.id && r.edgeId.includes(vertexId)) ||
          prev.ships.some(s => s.playerId === player.id && s.edgeId.includes(vertexId));
        if (!hasRoadConnection) return prev;
      }

      // Check distance rule (no adjacent settlements)
      const [vx, vy] = vertexId.split(',').map(Number);
      const isTooClose = prev.settlements.some(s => {
        const [sx, sy] = s.vertexId.split(',').map(Number);
        const dist = Math.sqrt(Math.pow(vx - sx, 2) + Math.pow(vy - sy, 2));
        return dist < 50; // HEX_RADIUS is 40, distance between adjacent vertices is ~40
      });
      if (isTooClose) return prev;
      
      // Check if surrounded by sea/desert (cannot build if all adjacent hexes are sea/desert)
      const adjacentHexes = hexIds.map(id => prev.board.find(h => h.id === id)).filter(Boolean);
      const allBarren = adjacentHexes.every(h => h!.type === HexType.Sea || h!.type === HexType.Desert);
      if (allBarren) return prev;

      // Check for island settlement bonus
      const isIslandSettlement = adjacentHexes.some(h => h!.isIsland && h!.type !== HexType.Desert);
      
      const currentDiscovered = player.discoveredIslandIds || [];
      const newIslandIdsTouching = adjacentHexes
        .filter(h => h!.isIsland && h!.islandId !== undefined)
        .map(h => h!.islandId as number);
      
      const newlyDiscoveredIds: number[] = [];
      newIslandIdsTouching.forEach(id => {
        if (!currentDiscovered.includes(id) && !newlyDiscoveredIds.includes(id)) {
          newlyDiscoveredIds.push(id);
        }
      });

      let bonusPoints = 0;
      if (!isSetup && newlyDiscoveredIds.length > 0) {
        bonusPoints = newlyDiscoveredIds.length > 0 ? 2 : 0; // 2 points per newly discovered island
      }

      const updatedPlayers = [...prev.players];
      const updatedPlayer = { 
        ...player, 
        settlements: player.settlements + 1,
        resources: { ...player.resources },
        victoryPoints: player.victoryPoints + bonusPoints,
        islandBonusPoints: player.islandBonusPoints + bonusPoints,
        discoveredIslandIds: [...currentDiscovered, ...newlyDiscoveredIds]
      };
      const updatedBank = { ...prev.bankResources };

      if (!isSetup) {
        for (const [res, amt] of Object.entries(COSTS.settlement)) {
          updatedPlayer.resources[res as ResourceType] -= amt;
          updatedBank[res as ResourceType] += amt;
        }
      } else if (setupSettlementsThisTurn === 1) {
        // Second settlement gives resources
        hexIds.forEach(hexId => {
          const hex = prev.board.find(h => h.id === hexId);
          if (hex && hex.type !== HexType.Desert && hex.type !== HexType.Sea) {
            const resourceMap: any = {
              [HexType.Forest]: ResourceType.Lumber,
              [HexType.Hills]: ResourceType.Brick,
              [HexType.Pasture]: ResourceType.Wool,
              [HexType.Fields]: ResourceType.Grain,
              [HexType.Mountains]: ResourceType.Ore,
            };
            const res = resourceMap[hex.type];
            if (res && updatedBank[res] > 0) {
              updatedPlayer.resources[res] += 1;
              updatedBank[res] -= 1;
            }
          }
        });
      }

      updatedPlayers[prev.currentPlayerIndex] = updatedPlayer;

      const newSettlements = [...prev.settlements, { vertexId, hexIds, playerId: player.id, isCity: false }];
      const { players: playersAfterSettlement, longestRoadPlayerId } = updateLongestRoad(updatedPlayers, prev.roads, prev.ships, newSettlements, prev.longestRoadPlayerId);
      
      const winnerId = checkWinner(playersAfterSettlement, prev.mapType);
      
      // Check if player can still build another settlement
      const cost = COSTS.settlement;
      let stillCanBuild = true;
      for (const [res, amt] of Object.entries(cost)) {
        if (playersAfterSettlement[prev.currentPlayerIndex].resources[res as ResourceType] < amt) {
          stillCanBuild = false;
          break;
        }
      }
      if (playersAfterSettlement[prev.currentPlayerIndex].settlements >= 5) stillCanBuild = false;

      return {
        ...prev,
        players: playersAfterSettlement,
        bankResources: updatedBank,
        settlements: newSettlements,
        hasBuiltThisTurn: isSetup ? prev.hasBuiltThisTurn : true,
        longestRoadPlayerId,
        winnerId,
        phase: winnerId !== null ? 'finished' : prev.phase,
        activeBuildMode: winnerId !== null ? null : (isSetup ? 'road' : (stillCanBuild ? 'settlement' : null)),
      };
    });
  }, []);

  const upgradeToCity = useCallback((vertexId: string) => {
    setGameState(prev => {
      if (!prev) return null; if (prev.phase === 'finished') return prev;
      const player = prev.players[prev.currentPlayerIndex];
      const cost = COSTS.city;

      // City limit (4 in standard Catan)
      if (player.cities >= 4) {
        console.warn("City limit reached (4)");
        return prev;
      }

      for (const [res, amt] of Object.entries(cost)) {
        if (player.resources[res as ResourceType] < amt) return prev;
      }

      // Check for Pirate
      const hexes = getHexesForVertex(prev.board, vertexId);
      const hasPirate = hexes.some(h => h.id === prev.pirateHexId);
      if (hasPirate) return prev;

      const settlementIdx = prev.settlements.findIndex(s => s.vertexId === vertexId && s.playerId === player.id && !s.isCity);
      if (settlementIdx === -1) return prev;

      const updatedPlayers = [...prev.players];
      const updatedPlayer = { 
        ...player, 
        settlements: player.settlements - 1,
        cities: player.cities + 1,
        resources: { ...player.resources }
      };
      const updatedBank = { ...prev.bankResources };

      for (const [res, amt] of Object.entries(cost)) {
        updatedPlayer.resources[res as ResourceType] -= amt;
        updatedBank[res as ResourceType] += amt;
      }
      updatedPlayers[prev.currentPlayerIndex] = updatedPlayer;

      const updatedSettlements = [...prev.settlements];
      updatedSettlements[settlementIdx] = { ...updatedSettlements[settlementIdx], isCity: true };
      
      const winnerId = checkWinner(updatedPlayers, prev.mapType);

      // Check if player can still build another city
      const costCity = COSTS.city;
      let stillCanBuild = true;
      for (const [res, amt] of Object.entries(costCity)) {
        if (updatedPlayers[prev.currentPlayerIndex].resources[res as ResourceType] < amt) {
          stillCanBuild = false;
          break;
        }
      }
      if (updatedPlayers[prev.currentPlayerIndex].cities >= 4) stillCanBuild = false;

      return {
        ...prev,
        players: updatedPlayers,
        bankResources: updatedBank,
        settlements: updatedSettlements,
        hasBuiltThisTurn: true,
        phase: winnerId !== null ? 'finished' : prev.phase,
        winnerId,
        activeBuildMode: (winnerId !== null || !stillCanBuild) ? null : 'city',
      };
    });
  }, []);

  const buyDevCard = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.bankDevCards.length === 0) return prev;
      const player = prev.players[prev.currentPlayerIndex];
      const cost = COSTS.devCard;

      for (const [res, amt] of Object.entries(cost)) {
        if (player.resources[res as ResourceType] < amt) return prev;
      }

      const updatedPlayers = [...prev.players];
      const updatedBankDevCards = [...prev.bankDevCards];
      const drawnCard = updatedBankDevCards.pop()!;
      
      const updatedPlayer = { 
        ...player, 
        devCardsBoughtThisTurn: [...(player.devCardsBoughtThisTurn || []), drawnCard],
        resources: { ...player.resources }
      };
      
      const updatedBankResources = { ...prev.bankResources };

      for (const [res, amt] of Object.entries(cost)) {
        updatedPlayer.resources[res as ResourceType] -= amt;
        updatedBankResources[res as ResourceType] += amt;
      }
      updatedPlayers[prev.currentPlayerIndex] = updatedPlayer;
      
      const winnerId = checkWinner(updatedPlayers, prev.mapType);

      return {
        ...prev,
        players: updatedPlayers,
        bankResources: updatedBankResources,
        bankDevCards: updatedBankDevCards,
        hasBuiltThisTurn: true,
        phase: winnerId !== null ? 'finished' : prev.phase,
        winnerId,
      };
    });
  }, []);

  const playDevCard = useCallback((cardType: DevCardType) => {
    setGameState(prev => {
      if (!prev) return null; if (prev.phase === 'finished') return prev;
      const player = prev.players[prev.currentPlayerIndex];
      const cardIdx = player.devCards.indexOf(cardType);
      if (cardIdx === -1) return prev;

      const updatedPlayers = [...prev.players];
      const updatedDevCards = [...player.devCards];
      updatedDevCards.splice(cardIdx, 1);
      
      const updatedPlayer = { 
        ...player, 
        devCards: updatedDevCards,
        playedDevCards: [...(player.playedDevCards || []), cardType]
      };
      let nextPhase = prev.phase;
      let freeRoads = prev.freeRoads;
      
      let newEvent = prev.lastDevCardEvent;
      if (cardType !== DevCardType.VictoryPoint) {
        let actionStr = '';
        if (cardType === DevCardType.Knight) actionStr = '发动骑士';
        else if (cardType === DevCardType.Monopoly) actionStr = '开启垄断';
        else if (cardType === DevCardType.YearOfPlenty) actionStr = '使用丰收之年';
        else if (cardType === DevCardType.RoadBuilding) actionStr = '使用道路建设';
        newEvent = { playerName: player.name, cardType: actionStr, timestamp: Date.now() };
      }
      
      if (cardType === DevCardType.VictoryPoint) {
        // VP cards shouldn't be playable manually, but just in case
        updatedPlayer.victoryPoints += 1;
      } else if (cardType === DevCardType.Knight) {
        nextPhase = 'robber';
      } else if (cardType === DevCardType.YearOfPlenty) {
        nextPhase = 'year_of_plenty';
      } else if (cardType === DevCardType.Monopoly) {
        nextPhase = 'monopoly';
      } else if (cardType === DevCardType.RoadBuilding) {
        nextPhase = 'road_building';
        freeRoads = 2;
      }
      
      updatedPlayers[prev.currentPlayerIndex] = updatedPlayer;
      
      const winnerId = checkWinner(updatedPlayers, prev.mapType);
      
      return { 
        ...prev, 
        players: updatedPlayers, 
        phase: winnerId !== null ? 'finished' : nextPhase, 
        winnerId,
        freeRoads,
        hasPlayedDevCardThisTurn: cardType !== DevCardType.VictoryPoint,
        playingDevCard: cardType !== DevCardType.VictoryPoint ? cardType : null,
        activeBuildMode: nextPhase === 'road_building' ? 'road' : null,
        lastDevCardEvent: newEvent,
      };
    });
  }, []);

  const cancelDevCard = useCallback(() => {
    setGameState(prev => {
      if (!prev || !prev.playingDevCard) return prev;
      
      const cardType = prev.playingDevCard;
      
      // Cannot cancel road building if a road has already been built, but we can end the phase
      if (cardType === DevCardType.RoadBuilding && prev.freeRoads !== 2) {
        return {
          ...prev,
          phase: 'main',
          freeRoads: 0,
          playingDevCard: null,
          activeBuildMode: null,
        };
      }

      const updatedPlayers = [...prev.players];
      const currentPlayer = { ...updatedPlayers[prev.currentPlayerIndex] };
      
      currentPlayer.devCards = [...currentPlayer.devCards, cardType];
      const playedIdx = currentPlayer.playedDevCards.lastIndexOf(cardType);
      if (playedIdx !== -1) {
        currentPlayer.playedDevCards = currentPlayer.playedDevCards.filter((_, i) => i !== playedIdx);
      }

      updatedPlayers[prev.currentPlayerIndex] = currentPlayer;

      return {
        ...prev,
        players: updatedPlayers,
        phase: 'main',
        hasPlayedDevCardThisTurn: false,
        playingDevCard: null,
        freeRoads: 0,
        activeBuildMode: null,
      };
    });
  }, []);

  const moveRobber = useCallback((hexId: string) => {
    setGameState(prev => {
      if (!prev || (prev.phase !== 'robber' && prev.phase !== 'robber_move')) return prev;
      if (hexId === prev.robberHexId) return prev; // Cannot choose original position
      const hex = prev.board.find(h => h.id === hexId);
      if (!hex || hex.type === HexType.Sea) return prev;
      
      // Find players to steal from
      const playersToStealFrom = Array.from(new Set(
        prev.settlements
          .filter(s => s.hexIds.includes(hexId) && s.playerId !== prev.currentPlayerIndex)
          .map(s => s.playerId)
      ));

      if (playersToStealFrom.length > 0) {
        return {
          ...prev,
          robberHexId: hexId,
          phase: 'stealing',
          selectedStealTarget: null,
          pendingStealFrom: playersToStealFrom
        };
      }

      const updatedPlayers = [...prev.players];
      const { largestArmyPlayerId, winnerId } = finalizeKnightPlay(prev, updatedPlayers, checkWinner);
      
      return {
        ...prev,
        players: updatedPlayers,
        robberHexId: hexId,
        phase: winnerId !== null ? 'finished' : 'main',
        winnerId,
        largestArmyPlayerId,
        playingDevCard: null
      };
    });
  }, []);

  const movePirate = useCallback((hexId: string) => {
    setGameState(prev => {
      if (!prev || (prev.phase !== 'robber' && prev.phase !== 'robber_move')) return prev;
      if (hexId === prev.pirateHexId) return prev; // Cannot choose original position
      const hex = prev.board.find(h => h.id === hexId);
      if (!hex || hex.type !== HexType.Sea) return prev;
      
      const px = Math.sqrt(3) * 40 * (hex.q + hex.r / 2);
      const py = 80 * 0.75 * hex.r;
      const hexEdges = [];
      for (let i = 0; i < 6; i++) {
        const a1 = (Math.PI / 180) * (60 * i + 30);
        const a2 = (Math.PI / 180) * (60 * ((i + 1) % 6) + 30);
        const x1 = px + 40 * Math.cos(a1);
        const y1 = py + 40 * Math.sin(a1);
        const x2 = px + 40 * Math.cos(a2);
        const y2 = py + 40 * Math.sin(a2);
        const v1 = `${Math.round(x1)},${Math.round(y1)}`;
        const v2 = `${Math.round(x2)},${Math.round(y2)}`;
        hexEdges.push([v1, v2].sort().join('|'));
      }

      const playersToStealFrom = Array.from(new Set(
        prev.ships
          .filter(s => hexEdges.includes(s.edgeId) && s.playerId !== prev.currentPlayerIndex)
          .map(s => s.playerId)
      ));

      if (playersToStealFrom.length > 0) {
        return {
          ...prev,
          pirateHexId: hexId,
          phase: 'stealing',
          selectedStealTarget: null,
          pendingStealFrom: playersToStealFrom
        };
      }

      const updatedPlayers = [...prev.players];
      const { largestArmyPlayerId, winnerId } = finalizeKnightPlay(prev, updatedPlayers, checkWinner);

      return {
        ...prev,
        players: updatedPlayers,
        pirateHexId: hexId,
        phase: winnerId !== null ? 'finished' : 'main',
        winnerId,
        largestArmyPlayerId,
        playingDevCard: null
      };
    });
  }, []);

  const resolveYearOfPlenty = useCallback((res1: ResourceType, res2: ResourceType) => {
    setGameState(prev => {
      if (!prev || prev.phase !== 'year_of_plenty') return prev;
      const updatedPlayers = [...prev.players];
      const player = { 
        ...updatedPlayers[prev.currentPlayerIndex],
        resources: { ...updatedPlayers[prev.currentPlayerIndex].resources }
      };
      const updatedBank = { ...prev.bankResources };

      if (updatedBank[res1] > 0) {
        player.resources[res1]++;
        updatedBank[res1]--;
      }
      if (res1 !== res2 && updatedBank[res2] > 0) {
        player.resources[res2]++;
        updatedBank[res2]--;
      } else if (res1 === res2 && updatedBank[res1] > 0) {
        player.resources[res1]++;
        updatedBank[res1]--;
      }

      updatedPlayers[prev.currentPlayerIndex] = player;
      return {
        ...prev,
        players: updatedPlayers,
        bankResources: updatedBank,
        phase: 'main',
        playingDevCard: null
      };
    });
  }, []);

  const resolveMonopoly = useCallback((resource: ResourceType) => {
    setGameState(prev => {
      if (!prev || prev.phase !== 'monopoly') return prev;
      const updatedPlayers = [...prev.players];
      let totalStolen = 0;

      for (let i = 0; i < updatedPlayers.length; i++) {
        if (i === prev.currentPlayerIndex) continue;
        const amount = updatedPlayers[i].resources[resource];
        if (amount > 0) {
          updatedPlayers[i] = {
            ...updatedPlayers[i],
            resources: {
              ...updatedPlayers[i].resources,
              [resource]: 0
            }
          };
          totalStolen += amount;
        }
      }

      const currentPlayer = { 
        ...updatedPlayers[prev.currentPlayerIndex],
        resources: { ...updatedPlayers[prev.currentPlayerIndex].resources }
      };
      currentPlayer.resources[resource] += totalStolen;
      updatedPlayers[prev.currentPlayerIndex] = currentPlayer;

      return {
        ...prev,
        players: updatedPlayers,
        phase: 'main',
        selectedStealTarget: null,
        pendingStealFrom: [],
        playingDevCard: null
      };
    });
  }, []);

  const selectStealTarget = useCallback((playerId: number | null) => {
    setGameState(prev => {
      if (!prev || prev.phase !== 'stealing') return prev;
      return {
        ...prev,
        selectedStealTarget: playerId
      };
    });
  }, []);

  const stealResource = useCallback((fromPlayerId: number) => {
    setGameState(prev => {
      if (!prev || prev.phase !== 'stealing') return prev;
      const fromPlayer = prev.players[fromPlayerId];
      const currentPlayer = prev.players[prev.currentPlayerIndex];
      
      const availableResources = Object.entries(fromPlayer.resources)
        .filter(([_, count]) => count > 0)
        .flatMap(([res, count]) => Array(count).fill(res as ResourceType));
      
      if (availableResources.length === 0) {
        const updatedPlayers = [...prev.players];
        const { largestArmyPlayerId, winnerId } = finalizeKnightPlay(prev, updatedPlayers, checkWinner);
        return { 
          ...prev, 
          players: updatedPlayers,
          phase: winnerId !== null ? 'finished' : 'main', 
          winnerId,
          largestArmyPlayerId,
          selectedStealTarget: null, 
          pendingStealFrom: [], 
          playingDevCard: null 
        };
      }

      const stolenRes = availableResources[Math.floor(Math.random() * availableResources.length)];
      
      const updatedPlayers = [...prev.players];
      updatedPlayers[fromPlayerId] = {
        ...fromPlayer,
        resources: { ...fromPlayer.resources, [stolenRes]: fromPlayer.resources[stolenRes] - 1 }
      };
      updatedPlayers[prev.currentPlayerIndex] = {
        ...currentPlayer,
        resources: { ...currentPlayer.resources, [stolenRes]: currentPlayer.resources[stolenRes] + 1 }
      };

      const { largestArmyPlayerId, winnerId } = finalizeKnightPlay(prev, updatedPlayers, checkWinner);

      return {
        ...prev,
        players: updatedPlayers,
        phase: winnerId !== null ? 'finished' : 'main',
        winnerId,
        largestArmyPlayerId,
        pendingStealFrom: [],
        selectedStealTarget: null,
        playingDevCard: null
      };
    });
  }, []);

  const doSteal = useCallback((fromPlayerId: number) => {
    selectStealTarget(fromPlayerId);
    setTimeout(() => {
      stealResource(fromPlayerId);
    }, 1000);
  }, [selectStealTarget, stealResource]);

  const selectGoldResource = useCallback((selectedResources: Record<ResourceType, number>) => {
    setGameState(prev => {
      if (!prev || prev.phase !== 'gold_selection' || prev.pendingGoldRewards.length === 0) return prev;
      
      const reward = prev.pendingGoldRewards[0];
      const updatedPlayers = [...prev.players];
      const player = { ...updatedPlayers[reward.playerId], resources: { ...updatedPlayers[reward.playerId].resources } };
      const updatedBank = { ...prev.bankResources };

      // Verify bank has enough resources
      for (const [res, count] of Object.entries(selectedResources)) {
        if (updatedBank[res as ResourceType] < count) return prev;
      }

      // Distribute resources
      for (const [res, count] of Object.entries(selectedResources)) {
        const resourceType = res as ResourceType;
        if (count > 0) {
          player.resources[resourceType] += count;
          updatedBank[resourceType] -= count;
        }
      }

      updatedPlayers[reward.playerId] = player;

      const remainingRewards = prev.pendingGoldRewards.slice(1);

      return {
        ...prev,
        players: updatedPlayers,
        bankResources: updatedBank,
        pendingGoldRewards: remainingRewards,
        phase: remainingRewards.length === 0 ? 'main' : 'gold_selection'
      };
    });
  }, []);

  const tradeWithBank = useCallback((give: ResourceType, receive: ResourceType) => {
    setGameState(prev => {
      if (!prev) return null; if (prev.phase === 'finished') return prev;
      const player = prev.players[prev.currentPlayerIndex];
      
      const playerPorts = prev.ports.filter(p => {
        const settlement = prev.settlements.find(s => p.vertexIds.includes(s.vertexId) && s.playerId === player.id);
        return !!settlement;
      });

      const specificPort = playerPorts.find(p => p.type === give);
      const genericPort = playerPorts.find(p => p.type === '3:1');
      
      let tradeRatio = 4;
      if (specificPort) tradeRatio = 2;
      else if (genericPort) tradeRatio = 3;

      if (player.resources[give] < tradeRatio || prev.bankResources[receive] < 1) return prev;

      const updatedPlayers = [...prev.players];
      const updatedPlayer = { 
        ...player, 
        resources: { ...player.resources }
      };
      const updatedBank = { ...prev.bankResources };

      updatedPlayer.resources[give] -= tradeRatio;
      updatedPlayer.resources[receive] += 1;
      updatedBank[give] += tradeRatio;
      updatedBank[receive] -= 1;

      updatedPlayers[prev.currentPlayerIndex] = updatedPlayer;

      return { ...prev, players: updatedPlayers, bankResources: updatedBank };
    });
  }, []);

  const addResources = useCallback((playerId: number, amount: number) => {
    setGameState(prev => {
      if (!prev) return null; if (prev.phase === 'finished') return prev;
      const updatedPlayers = [...prev.players];
      const p = { ...updatedPlayers[playerId], resources: { ...updatedPlayers[playerId].resources } };
      Object.values(ResourceType).forEach(r => {
        p.resources[r] += amount;
      });
      updatedPlayers[playerId] = p;
      return { ...prev, players: updatedPlayers };
    });
  }, []);



  const setPlayerResource = useCallback((playerId: number, resource: ResourceType, amount: number) => {
    setGameState(prev => {
      if (!prev) return null; if (prev.phase === 'finished') return prev;
      const updatedPlayers = [...prev.players];
      const p = { ...updatedPlayers[playerId] };
      
      const oldAmount = p.resources[resource];
      const diff = amount - oldAmount;
      
      p.resources = { ...p.resources, [resource]: amount };
      updatedPlayers[playerId] = p;
      
      const updatedBank = { ...prev.bankResources };
      updatedBank[resource] -= diff;
      
      return { ...prev, players: updatedPlayers, bankResources: updatedBank };
    });
  }, []);

  const setDice = useCallback((d1: number, d2: number) => {
    const total = d1 + d2;
    setGameState(prev => {
      if (!prev) return null; if (prev.phase === 'finished') return prev;
      const next = { ...prev, dice: [d1, d2] as [number, number], hasRolled: true };
      
      if (total === 7) {
        // Check for players with > 7 cards
        const pendingDiscards: { playerId: number, amount: number }[] = [];
        next.players.forEach(p => {
          const totalCards = Object.values(p.resources).reduce((a, b) => a + b, 0);
          if (totalCards > 7) {
            pendingDiscards.push({ playerId: p.id, amount: Math.floor(totalCards / 2) });
          }
        });

        if (pendingDiscards.length > 0) {
          next.phase = 'rolling_7';
          next.pendingDiscards = pendingDiscards;
        } else {
          next.phase = 'rolling_7';
        }
      } else {
        // Distribute resources immediately for non-7
        const updatedPlayers = [...next.players];
        const updatedBank = { ...next.bankResources };
        const pendingGold: { playerId: number, amount: number }[] = [];

        next.board.forEach(hex => {
          if (hex.number === total && hex.id !== next.robberHexId && hex.id !== next.pirateHexId) {
            next.settlements.forEach(s => {
              if (s.hexIds.includes(hex.id)) {
                const amount = s.isCity ? 2 : 1;
                
                if (hex.type === HexType.Gold) {
                  pendingGold.push({ playerId: s.playerId, amount });
                } else {
                  const resourceMap: any = {
                    [HexType.Forest]: ResourceType.Lumber,
                    [HexType.Hills]: ResourceType.Brick,
                    [HexType.Pasture]: ResourceType.Wool,
                    [HexType.Fields]: ResourceType.Grain,
                    [HexType.Mountains]: ResourceType.Ore,
                  };
                  const resToGive = resourceMap[hex.type];
                  if (resToGive && updatedBank[resToGive] >= amount) {
                    updatedPlayers[s.playerId] = {
                      ...updatedPlayers[s.playerId],
                      resources: {
                        ...updatedPlayers[s.playerId].resources,
                        [resToGive]: updatedPlayers[s.playerId].resources[resToGive] + amount
                      }
                    };
                    updatedBank[resToGive] -= amount;
                  }
                }
              }
            });
          }
        });

        next.players = updatedPlayers;
        next.bankResources = updatedBank;
        
        if (pendingGold.length > 0) {
          next.phase = 'gold_selection';
          next.pendingGoldRewards = Object.values(pendingGold.reduce((acc, curr) => {
            if (!acc[curr.playerId]) acc[curr.playerId] = { playerId: curr.playerId, amount: 0 };
            acc[curr.playerId].amount += curr.amount;
            return acc;
          }, {} as Record<number, { playerId: number, amount: number }>));
        }
      }
      return next;
    });
  }, []);

  const toggleBot = useCallback((playerId: number) => {
    setGameState(prev => {
      if (!prev || prev.phase === 'finished') return prev;
      const newPlayers = [...prev.players];
      newPlayers[playerId] = { ...newPlayers[playerId], isBot: !newPlayers[playerId].isBot };
      return { ...prev, players: newPlayers };
    });
  }, []);

  useEffect(() => {
    if (gameState?.phase === 'rolling_7') {
      setGameState(prev => {
        if (!prev || prev.phase === 'finished') return prev;
        return {
          ...prev,
          phase: prev.pendingDiscards.length > 0 ? 'discard' : 'robber'
        };
      });
    }
  }, [gameState?.phase]);

  const syncGameState = useCallback((newState: GameState) => {
    setGameState(newState);
  }, []);

  const proposeTrade = useCallback((offer: Record<ResourceType, number>, request: Record<ResourceType, number>, targetPlayerId: number | null) => {
    setGameState(prev => {
      if (!prev || prev.phase === 'finished') return prev;
      const newOffer: TradeOffer = {
        id: Math.random().toString(36).substring(2, 9),
        initiatorId: prev.currentPlayerIndex,
        targetPlayerId,
        offer,
        request,
        status: 'pending',
        acceptedBy: [],
        rejectedBy: [],
      };
      return { ...prev, tradeOffers: [...(prev.tradeOffers || []), newOffer] };
    });
  }, []);

  const reactToTrade = useCallback((tradeId: string, playerId: number, reaction: 'accept' | 'reject') => {
    setGameState(prev => {
      if (!prev || prev.phase === 'finished') return prev;
      const offers = (prev.tradeOffers || []).map(offer => {
        if (offer.id === tradeId) {
          // Prevent duplicate reactions
          if (offer.acceptedBy.includes(playerId) || offer.rejectedBy.includes(playerId)) return offer;
          
          if (reaction === 'accept') {
            return { ...offer, acceptedBy: [...offer.acceptedBy, playerId] };
          } else {
            const newRejectedBy = [...offer.rejectedBy, playerId];
            // If everyone (except initiator) rejected, mark as canceled/rejected
            if (newRejectedBy.length >= prev.players.length - 1) {
              return { ...offer, rejectedBy: newRejectedBy, status: 'canceled' as const };
            }
            return { ...offer, rejectedBy: [...offer.rejectedBy, playerId] };
          }
        }
        return offer;
      });
      return { ...prev, tradeOffers: offers };
    });
  }, []);

  const cancelTrade = useCallback((tradeId: string) => {
    setGameState(prev => {
      if (!prev || prev.phase === 'finished') return prev;
      const offers = (prev.tradeOffers || []).map(offer => 
        offer.id === tradeId ? { ...offer, status: 'canceled' as const } : offer
      );
      return { ...prev, tradeOffers: offers };
    });
  }, []);

  const finalizeTrade = useCallback((tradeId: string, partnerId: number) => {
    setGameState(prev => {
      if (!prev || prev.phase === 'finished') return prev;
      const offer = (prev.tradeOffers || []).find(o => o.id === tradeId);
      if (!offer) return prev;

      // Ensure both have resources
      const initiator = prev.players.find(p => p.id === offer.initiatorId);
      const partner = prev.players.find(p => p.id === partnerId);
      
      if (!initiator || !partner) return prev;

      let initiatorHasResources = true;
      let partnerHasResources = true;

      const types = Object.values(ResourceType);
      types.forEach(t => {
        if ((initiator.resources[t] || 0) < (offer.offer[t] || 0)) initiatorHasResources = false;
        if ((partner.resources[t] || 0) < (offer.request[t] || 0)) partnerHasResources = false;
      });

      if (!initiatorHasResources || !partnerHasResources) {
        return prev; // Trade impossible
      }

      const updatedPlayers = prev.players.map(p => {
        if (p.id === initiator.id) {
          const newRes = { ...p.resources };
          types.forEach(t => {
            newRes[t] = (newRes[t] || 0) - (offer.offer[t] || 0) + (offer.request[t] || 0);
          });
          return { ...p, resources: newRes };
        } else if (p.id === partner.id) {
          const newRes = { ...p.resources };
          types.forEach(t => {
            newRes[t] = (newRes[t] || 0) + (offer.offer[t] || 0) - (offer.request[t] || 0);
          });
          return { ...p, resources: newRes };
        }
        return p;
      });

      const offers = (prev.tradeOffers || []).map(o => 
        o.id === tradeId ? { ...o, status: 'completed' as const, completedWith: partnerId } : o
      );

      return { ...prev, players: updatedPlayers, tradeOffers: offers };
    });
  }, []);

  const setBuildModeSync = useCallback((mode: GameState['activeBuildMode']) => {
    setGameState(prev => {
      if (!prev || prev.phase === 'finished') return prev;
      return { ...prev, activeBuildMode: mode };
    });
  }, []);

  const resetGame = useCallback(() => {
    setGameState(null);
  }, []);

  return {
    gameState,
    syncGameState,
    resetGame,
    initGame,
    toggleBot,
    rollDice,
    resolveDiceRoll,
    resolveInitialRoll,
    nextTurn,
    buildRoad,
    buildShip,
    buildSettlement,
    upgradeToCity,
    tradeWithBank,
    buyDevCard,
    playDevCard,
    cancelDevCard,
    resolveYearOfPlenty,
    resolveMonopoly,
    moveRobber,
    movePirate,
    selectStealTarget,
    stealResource,
    doSteal,
    selectGoldResource,
    addResources,
    generateMapTopology,
    distributeResources,
    discardCards,
    // Debug functions
    setPlayerResource,
    setDice,
    setBuildModeSync,
    proposeTrade,
    reactToTrade,
    cancelTrade,
    finalizeTrade
  };
}
