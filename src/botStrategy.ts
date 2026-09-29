import { BOT_LEVELS, normalizeBotDifficulty } from '../shared/botDifficulty';
import { COSTS, HEX_RESOURCES } from './constants';
import { getHexesForEdge, getHexesForVertex } from './useCatanGame';
import { DevCardType, HexType, ResourceType, type GameState, type Player, type TradeOffer } from './types';

export const resources = Object.values(ResourceType);
export const emptyResources = (): Record<ResourceType, number> => ({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 });
type Cost = Partial<Record<ResourceType, number>>;
type Vertex = { id: string; hexIds: string[] };
export type BotBuild = { type: 'settlement' | 'city' | 'road' | 'ship' | 'devCard'; id: string; hexIds: string[]; score: number; cost: Cost };
export type BotLegalMoves = { villages: Vertex[]; cities: Vertex[]; roads: string[]; ships: string[]; edges: string[] };
export const botLevel = (p: Player) => p.sessionId ? 'expert' : normalizeBotDifficulty(p.botDifficulty);
export const canPay = (p: Player, cost: Cost) => resources.every(r => p.resources[r] >= (cost[r] || 0));
const dots = (number: number | null) => number && number !== 7 ? Math.max(0, 6 - Math.abs(7 - number)) : 0;
export const publicScore = (s: GameState, p: Player) => s.settlements.filter(v => v.playerId === p.id).reduce((n, v) => n + (v.isCity ? 2 : 1), 0) +
  (p.islandBonusPoints || 0) + (s.longestRoadPlayerId === p.id ? 2 : 0) + (s.largestArmyPlayerId === p.id ? 2 : 0);

function production(s: GameState, playerId: number) {
  const totals = emptyResources();
  for (const v of s.settlements.filter(v => v.playerId === playerId)) {
    for (const h of s.board.filter(h => v.hexIds.includes(h.id))) {
      const r = HEX_RESOURCES[h.type];
      if (r !== 'none') totals[r] += dots(h.number) * (v.isCity ? 2 : 1);
    }
  }
  return totals;
}

export function scoreVillage(s: GameState, p: Player, hexIds: string[], vertexId: string) {
  const level = botLevel(p);
  const yields = production(s, p.id);
  const hexes = s.board.filter(h => hexIds.includes(h.id));
  let score = 0;
  for (const h of hexes) {
    if (h.type === HexType.Sea || h.type === HexType.Desert) continue;
    const r = HEX_RESOURCES[h.type];
    const scarcity = r === 'none' ? 1.5 : 1 + 3 / (3 + yields[r]);
    score += dots(h.number) * (level === 'beginner' ? 1 : scarcity);
    if (level === 'expert' && (r === ResourceType.Ore || r === ResourceType.Grain)) score += dots(h.number) * 0.25;
    if (h.id === s.robberHexId) score -= 1;
  }
  if (level !== 'beginner') {
    if (hexes.some(h => h.isIsland && h.islandId !== undefined && !p.discoveredIslandIds?.includes(h.islandId))) score += 10;
    const port = s.ports.find(port => port.vertexIds.includes(vertexId));
    if (port) score += port.type === '3:1' ? 2 : Math.min(5, yields[port.type] / 2);
  }
  return score;
}

export function chooseSetupVillage(s: GameState, p: Player, vertices: Vertex[], random = Math.random) {
  return vertices.map(v => ({ v, score: scoreVillage(s, p, v.hexIds, v.id) + random() * BOT_LEVELS[botLevel(p)].noise }))
    .sort((a, b) => b.score - a.score)[0]?.v;
}

// Bounded graph search values reachable village sites without crossing opponents or switching road/ship at an empty vertex.
export function planBotBuilds(s: GameState, p: Player, legal: BotLegalMoves, random = Math.random): BotBuild[] {
  const profile = BOT_LEVELS[botLevel(p)];
  const hexCache = new Map<string, ReturnType<typeof getHexesForVertex>>();
  const vertexHexes = (id: string) => {
    if (!hexCache.has(id)) hexCache.set(id, getHexesForVertex(s.board, id));
    return hexCache.get(id)!;
  };
  const occupied = new Map([...s.roads.map(e => ({ ...e, type: 'road' })), ...s.ships.map(e => ({ ...e, type: 'ship' }))].map(e => [e.edgeId, e]));
  const buildings = new Map(s.settlements.map(v => [v.vertexId, v]));
  const adjacency = new Map<string, { id: string; next: string; land: boolean; sea: boolean }[]>();
  for (const id of legal.edges) {
    const hexes = getHexesForEdge(s.board, id);
    const [a, b] = id.split('|');
    const terrain = { id, land: hexes.some(h => h.type !== HexType.Sea && !h.isOuterSea), sea: hexes.some(h => h.type === HexType.Sea || h.isOuterSea) && !hexes.some(h => h.id === s.pirateHexId) };
    adjacency.set(a, [...(adjacency.get(a) || []), { ...terrain, next: b }]);
    adjacency.set(b, [...(adjacency.get(b) || []), { ...terrain, next: a }]);
  }
  const siteScore = new Map<string, number>();
  const potential = (id: string) => {
    if (siteScore.has(id)) return siteScore.get(id)!;
    const [x, y] = id.split(',').map(Number);
    const hexes = vertexHexes(id);
    const blocked = buildings.has(id) || hexes.some(h => h.id === s.pirateHexId) || hexes.every(h => h.type === HexType.Sea || h.type === HexType.Desert) ||
      s.settlements.some(v => { const [vx, vy] = v.vertexId.split(',').map(Number); return Math.hypot(vx - x, vy - y) < 50; });
    const value = blocked ? 0 : scoreVillage(s, p, hexes.map(h => h.id), id) + 8;
    siteScore.set(id, value);
    return value;
  };
  const routeScore = (edgeId: string, type: 'road' | 'ship') => {
    let best = 0;
    const queue = edgeId.split('|').map(id => ({ id, depth: 1 }));
    const seen = new Set(queue.map(v => v.id));
    for (let i = 0; i < queue.length; i++) {
      const { id, depth } = queue[i];
      if (buildings.has(id) && buildings.get(id)!.playerId !== p.id) continue;
      best = Math.max(best, potential(id) / depth);
      if (depth >= profile.depth) continue;
      for (const e of adjacency.get(id) || []) {
        const owner = occupied.get(e.id);
        if (seen.has(e.next) || (type === 'road' ? !e.land : !e.sea) || (owner && (owner.playerId !== p.id || owner.type !== type))) continue;
        seen.add(e.next);
        queue.push({ id: e.next, depth: depth + 1 });
      }
    }
    const samePaths = type === 'road' ? s.roads : s.ships;
    const connection = edgeId.split('|').reduce((n, id) => n + samePaths.filter(e => e.playerId === p.id && e.edgeId.split('|').includes(id)).length, 0);
    const longest = botLevel(p) === 'expert' && p.longestRoadLength >= 3 ? Math.min(5, connection * 2) : 0;
    return best * 0.65 + longest + 0.5;
  };
  const plans: BotBuild[] = [];
  const add = (type: BotBuild['type'], id: string, hexIds: string[], score: number) => plans.push({ type, id, hexIds, score: score + random() * profile.noise, cost: COSTS[type] });
  if (p.settlements < 5) legal.villages.forEach(v => add('settlement', v.id, v.hexIds, 20 + scoreVillage(s, p, v.hexIds, v.id)));
  if (p.cities < 4) legal.cities.forEach(v => add('city', v.id, v.hexIds, 18 + scoreVillage(s, p, v.hexIds, v.id)));
  legal.roads.forEach(id => add('road', id, [], routeScore(id, 'road')));
  legal.ships.forEach(id => add('ship', id, [], routeScore(id, 'ship')));
  if (s.bankDevCards.length) add('devCard', '', [], 7 + (botLevel(p) === 'expert' ? Math.min(p.knightsPlayed, 3) * 2 + (publicScore(s, p) >= (s.targetScore || (s.mapType === 'standard' ? 10 : 14)) - 2 ? 8 : 0) : 0));
  return plans.sort((a, b) => b.score - a.score);
}

const deficit = (p: Player, cost: Cost) => resources.reduce((n, r) => n + Math.max(0, (cost[r] || 0) - p.resources[r]), 0);
export const chooseBotGoal = (p: Player, plans: BotBuild[]) => [...plans].sort((a, b) => b.score / (1 + deficit(p, b.cost) * 0.7) - a.score / (1 + deficit(p, a.cost) * 0.7))[0];
const resourceValue = (p: Player, r: ResourceType, goal?: Cost) => 1 + (p.resources[r] < (goal ? goal[r] || 0 : 1) ? 1.5 : 0) + 1 / (1 + p.resources[r]);

export function chooseBotResources(s: GameState, p: Player, amount: number, goal?: Cost) {
  const result = emptyResources();
  const copy = { ...p, resources: { ...p.resources } };
  for (let i = 0; i < amount; i++) {
    const r = resources.filter(r => s.bankResources[r] > result[r]).sort((a, b) => resourceValue(copy, b, goal) - resourceValue(copy, a, goal))[0];
    if (!r) break;
    result[r]++;
    copy.resources[r]++;
  }
  return result;
}

export function chooseBotDiscard(p: Player, amount: number) {
  const remaining = { ...p, resources: { ...p.resources } };
  const result = emptyResources();
  const goal = p.settlements >= 3 ? COSTS.city : COSTS.settlement;
  for (let i = 0; i < amount; i++) {
    const r = resources.filter(r => remaining.resources[r] > 0).sort((a, b) => resourceValue(remaining, a, goal) - resourceValue(remaining, b, goal))[0];
    if (!r) break;
    result[r]++; remaining.resources[r]--;
  }
  return result;
}

export function acceptBotTrade(s: GameState, p: Player, trade: TradeOffer) {
  if (!canPay(p, trade.request)) return false;
  const give = resources.reduce((n, r) => n + trade.request[r], 0);
  const take = resources.reduce((n, r) => n + trade.offer[r], 0);
  if (!give || !take) return false;
  if (botLevel(p) === 'beginner') return take >= give;
  const initiator = s.players.find(other => other.id === trade.initiatorId);
  if (botLevel(p) === 'expert' && initiator && publicScore(s, initiator) >= (s.targetScore || (s.mapType === 'standard' ? 10 : 14)) - 1) return false;
  const goal = p.settlements >= 3 ? COSTS.city : COSTS.settlement;
  return resources.reduce((n, r) => n + (trade.offer[r] - trade.request[r]) * resourceValue(p, r, goal), 0) > 0.1;
}

export function proposeBotTrade(p: Player, goal: BotBuild | undefined, count: number, signatures: string[]) {
  if (!goal || count >= BOT_LEVELS[botLevel(p)].trades) return null;
  const need = resources.filter(r => p.resources[r] < (goal.cost[r] || 0));
  const surplus = resources.filter(r => p.resources[r] > Math.max(goal.cost[r] || 0, 1)).sort((a, b) => p.resources[b] - p.resources[a]);
  for (const receive of need) for (const give of surplus) {
    const signature = `${give}:${receive}`;
    if (give === receive || signatures.includes(signature)) continue;
    return { offer: { ...emptyResources(), [give]: 1 }, request: { ...emptyResources(), [receive]: 1 }, signature };
  }
  return null;
}

export function chooseBotBankTrade(s: GameState, p: Player, goal?: BotBuild) {
  if (!goal) return null;
  const owned = s.settlements.filter(v => v.playerId === p.id).map(v => v.vertexId);
  const ports = s.ports.filter(port => port.vertexIds.some(id => owned.includes(id)));
  for (const receive of resources.filter(r => p.resources[r] < (goal.cost[r] || 0) && s.bankResources[r] > 0)) {
    for (const give of [...resources].sort((a, b) => p.resources[b] - p.resources[a])) {
      const rate = ports.some(port => port.type === give) ? 2 : ports.some(port => port.type === '3:1') ? 3 : 4;
      if (give !== receive && p.resources[give] - rate >= (goal.cost[give] || 0)) return { give, receive };
    }
  }
  return null;
}

export function chooseBotBlockade(s: GameState, p: Player) {
  const expert = botLevel(p) === 'expert';
  const targets: { id: string; pirate: boolean; score: number }[] = [];
  for (const h of s.board) {
    const pirate = h.type === HexType.Sea;
    if (pirate ? s.mapType === 'standard' || h.id === s.pirateHexId : h.id === s.robberHexId) continue;
    let score = 0;
    for (const v of s.settlements.filter(v => v.hexIds.includes(h.id))) {
      const other = s.players.find(other => other.id === v.playerId)!;
      const threat = expert ? 1 + publicScore(s, other) / 10 : 1;
      score += (v.playerId === p.id ? -2 : threat) * (pirate ? 1 : dots(h.number) * (v.isCity ? 2 : 1));
    }
    if (pirate) for (const ship of s.ships) {
      if (!getHexesForEdge([h], ship.edgeId).length) continue;
      score += ship.playerId === p.id ? -10 : 5;
    }
    targets.push({ id: h.id, pirate, score });
  }
  return targets.sort((a, b) => b.score - a.score)[0];
}

export function chooseBotMonopoly(s: GameState, p: Player) {
  // Use public production and hand sizes, never the opponents' private resource mix.
  const expected = emptyResources();
  for (const other of s.players.filter(other => other.id !== p.id)) {
    const yieldMap = production(s, other.id);
    const total = resources.reduce((n, r) => n + yieldMap[r], 0) || 1;
    const cards = resources.reduce((n, r) => n + other.resources[r], 0);
    resources.forEach(r => { expected[r] += cards * yieldMap[r] / total; });
  }
  return [...resources].sort((a, b) => expected[b] * resourceValue(p, b) - expected[a] * resourceValue(p, a))[0];
}

export function chooseBotDevCard(s: GameState, p: Player, plans: BotBuild[]) {
  if (s.hasPlayedDevCardThisTurn) return null;
  const cards = p.devCards;
  if (cards.includes(DevCardType.Knight)) {
    const blocked = s.settlements.some(v => v.playerId === p.id && v.hexIds.includes(s.robberHexId)) ||
      s.ships.some(ship => ship.playerId === p.id && getHexesForEdge(s.board, ship.edgeId).some(h => h.id === s.pirateHexId));
    if (blocked || (s.hasRolled && botLevel(p) !== 'beginner' && s.largestArmyPlayerId !== p.id)) return DevCardType.Knight;
  }
  if (!s.hasRolled) return null;
  const goal = chooseBotGoal(p, plans);
  if (cards.includes(DevCardType.YearOfPlenty) && goal && deficit(p, goal.cost) > 0 && deficit(p, goal.cost) <= 2 && resources.some(r => s.bankResources[r] > 0)) return DevCardType.YearOfPlenty;
  if (cards.includes(DevCardType.RoadBuilding) && plans.some(plan => (plan.type === 'road' || plan.type === 'ship') && plan.score > 1)) return DevCardType.RoadBuilding;
  if (cards.includes(DevCardType.Monopoly) && s.players.filter(other => other.id !== p.id).reduce((n, other) => n + resources.reduce((sum, r) => sum + other.resources[r], 0), 0) >= 6) return DevCardType.Monopoly;
  return null;
}
