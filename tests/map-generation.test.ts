import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useCatanGame } from '../src/useCatanGame';
import { Hex, HexType, MapType } from '../src/types';

let game: ReturnType<typeof useCatanGame>;
renderToString(createElement(() => { game = useCatanGame(); return null; }));
(globalThis as any).window = { location: { search: '' } };
const adjacent = (a: Hex, b: Hex) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)) === 1;
const red = (h: Hex) => h.number === 6 || h.number === 8;
function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

for (const mapType of ['standard', 'archipelago'] as MapType[]) for (const players of [2, 3, 4, 5, 6]) {
  test(`${mapType}/${players}: generated and reshuffled maps obey constraints`, () => {
    const original = Math.random;
    const bad: any[] = [], distributions = new Map<string, number>();
    const sizes = new Set<string>();
    try {
      for (let seed = 1; seed <= 1000; seed++) {
        Math.random = seeded(seed * 1009 + players);
        const topology = game.generateMapTopology(mapType, players);
        for (let shuffle = 0; shuffle < 2; shuffle++) {
          const board = game.distributeResources(topology, mapType, players);
          const main = board.filter(h => h.isMainland && h.number !== null);
          const islands = board.filter(h => h.isIsland && h.number !== null);
          assert.equal(board.filter(h => h.type === HexType.Gold).length, mapType === 'archipelago' ? (players <= 4 ? 2 : 3) : players > 4 ? 1 : 0);
          if (mapType === 'archipelago') {
            assert(islands.length >= (players <= 4 ? 8 : players === 5 ? 10 : 14));
            assert(islands.length <= (players <= 4 ? 9 : players === 5 ? 11 : 15));
            assert(new Set(islands.map(h => h.islandId)).size >= (players <= 4 ? 2 : 3));
            assert(islands.every(a => islands.every(b => a.islandId === b.islandId || !adjacent(a, b))), 'separate island IDs must not touch');
          }
          const pairs = main.flatMap((a, i) => main.slice(i + 1).filter(b => red(a) && red(b) && adjacent(a, b)));
          const goldCounts = new Map<number, number>();
          islands.filter(h => h.type === HexType.Gold).forEach(h => goldCounts.set(h.islandId!, (goldCounts.get(h.islandId!) || 0) + 1));
          const nums = (list: Hex[]) => [2,3,4,5,6,8,9,10,11,12].map(n => list.filter(h => h.number === n).length);
          const m = main.length, a = Math.round(m / 18), b = Math.round(m / 9), rest = m - a * 2 - b * 6;
          if (rest >= 0) assert.deepEqual(nums(main), [a,b,b,Math.ceil(rest/2),b,b,Math.floor(rest/2),b,b,a]);
          assert(nums(islands).every(n => n === Math.floor(islands.length / 10) || n === Math.ceil(islands.length / 10)));
          const key = JSON.stringify({ main: nums(main), islands: nums(islands) });
          distributions.set(key, (distributions.get(key) || 0) + 1);
          sizes.add(`${main.length}/${islands.length}`);
          if (pairs.length || [...goldCounts.values()].some(n => n > 1)) bad.push({ seed, shuffle, redPairs: pairs.length, gold: [...goldCounts.values()] });
          assert(board.every(h => h.type === HexType.Sea || h.type === HexType.Desert ? h.number === null : Number.isInteger(h.number) && h.number! >= 2 && h.number! <= 12 && h.number !== 7));
        }
      }
    } finally { Math.random = original; }
    console.log(JSON.stringify({ mapType, players, samples: 2000, sizes: [...sizes].sort(), invalid: bad.length, examples: bad.slice(0, 3), distributions: [...distributions].slice(0, 2) }));
    assert.equal(bad.length, 0);
  });
}

test('too few islands never causes gold fallback to double an island', () => {
  const topology = [
    ...Array.from({ length: 12 }, (_, q) => ({ id: `${q},0`, q, r: 0, type: HexType.Sea, number: null, isMainland: true, isIsland: false })),
    ...[0, 1, 2].map(q => ({ id: `${q},5`, q, r: 5, type: HexType.Sea, number: null, isMainland: false, isIsland: true, islandId: 1 })),
  ];
  for (let i = 0; i < 30; i++) {
    const board = game.distributeResources(topology, 'archipelago', 4);
    assert.equal(board.filter(h => h.type === HexType.Gold).length, 2);
    assert.equal(board.filter(h => h.isIsland && h.type === HexType.Gold).length, 1);
  }
});
