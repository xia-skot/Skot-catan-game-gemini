import test from 'node:test';
import assert from 'node:assert/strict';
import { applySettingsPatch } from '../shared/roomSetup';
import { BOT_LEVELS, BOT_TURN_LIMIT_MS } from '../shared/botDifficulty';
import { acceptBotTrade, botLevel, chooseBotBankTrade, chooseBotBlockade, chooseBotDevCard, chooseBotDiscard, chooseBotResources, chooseSetupVillage, emptyResources, planBotBuilds, proposeBotTrade } from '../src/botStrategy';
import { DevCardType, HexType, ResourceType, type GameState, type Player, type TradeOffer } from '../src/types';
const player = (id = 0): Player => ({ id, name: `AI ${id}`, color: '#222', isBot: true, botDifficulty: 'expert', resources: emptyResources(), settlements: 0, cities: 0, roads: 0, ships: 0, victoryPoints: 0, devCards: [], devCardsBoughtThisTurn: [], playedDevCards: [], knightsPlayed: 0, longestRoadLength: 0, vpCardsCount: 0, islandBonusPoints: 0, discoveredIslandIds: [] });
const state = (): GameState => ({ players: [player(), player(1)], board: [], ports: [], settlements: [], roads: [], ships: [], bankResources: { lumber: 24, brick: 24, wool: 24, grain: 24, ore: 24 }, bankDevCards: [DevCardType.Knight], mapType: 'archipelago', phase: 'main', hasRolled: true, currentPlayerIndex: 0, robberHexId: 'desert', pirateHexId: null, tradeOffers: [], longestRoadPlayerId: null, largestArmyPlayerId: null } as GameState);
const goal = { type: 'city' as const, id: '0,0', hexIds: [], score: 20, cost: { ore: 3, grain: 2 } };

test('difficulty patches are per-seat, normalized, and do not enable or displace seats', () => {
  const room = { hostId: 'human', players: [{ id: 'human', name: 'Human' }], settings: { playerCount: 4, mapType: 'standard', botConfig: [false, true, false, true] } };
  const next = applySettingsPatch(room, { botLevel: { index: 3, difficulty: 'expert' } });
  assert.equal((next.settings as any).botDifficulties[3], 'expert');
  assert.deepEqual(next.settings.botConfig.slice(0, 4), room.settings.botConfig);
  assert.equal((applySettingsPatch(next, { botLevel: { index: 0, difficulty: 'beginner' } }).settings as any).botDifficulties[0], 'standard');
  assert.equal((applySettingsPatch(next, { botLevel: { index: 3, difficulty: 'bogus' as any } }).settings as any).botDifficulties[3], 'standard');
  assert.equal(botLevel({ ...player(), sessionId: 'human', botDifficulty: 'beginner' }), 'expert');
  assert.equal(BOT_TURN_LIMIT_MS, 15000);
});

test('expert values missing resources while beginner prefers raw production', () => {
  const s = state(), p = s.players[0];
  s.board = [HexType.Forest, HexType.Forest, HexType.Forest, HexType.Mountains, HexType.Fields, HexType.Pasture].map((type, i) => ({ id: String(i), q: i, r: 0, type, number: i < 3 ? 6 : 5 }));
  s.settlements = [{ playerId: 0, vertexId: 'existing', hexIds: ['0', '1', '2'], isCity: false }];
  const vertices = [{ id: 'wood', hexIds: ['0', '1', '2'] }, { id: 'balanced', hexIds: ['3', '4', '5'] }];
  assert.equal(chooseSetupVillage(s, { ...p, botDifficulty: 'beginner' }, vertices, () => 0)?.id, 'wood');
  assert.equal(chooseSetupVillage(s, p, vertices, () => 0)?.id, 'balanced');
});

test('trade proposals respect tier budgets, distinct signatures, and construction reserves', () => {
  const p = player(); p.resources = { lumber: 5, brick: 2, wool: 1, grain: 2, ore: 2 };
  const first = proposeBotTrade(p, goal, 0, [])!;
  assert.equal(first.request.ore, 1);
  assert.equal(first.offer.grain, 0);
  assert.notEqual(proposeBotTrade(p, goal, 1, [first.signature])?.signature, first.signature);
  assert.equal(proposeBotTrade(p, goal, 2, []), null);
  assert.equal(proposeBotTrade({ ...p, botDifficulty: 'beginner' }, goal, 0, []), null);
  assert.equal(BOT_LEVELS.standard.trades, 1);
});

test('bank trades use an owned specialized port without consuming goal resources', () => {
  const s = state(), p = s.players[0];
  p.resources = { lumber: 2, brick: 0, wool: 0, grain: 2, ore: 2 };
  assert.equal(chooseBotBankTrade(s, p, goal), null);
  s.ports = [{ edgeId: 'a|b', type: ResourceType.Lumber, vertexIds: ['a', 'b'] }];
  s.settlements = [{ playerId: 0, vertexId: 'a', hexIds: [], isCity: false }];
  assert.deepEqual(chooseBotBankTrade(s, p, goal), { give: 'lumber', receive: 'ore' });
  s.bankResources.ore = 0;
  assert.equal(chooseBotBankTrade(s, p, goal), null);
});

test('trade acceptance values shortages and rejects trades that cannot be paid', () => {
  const s = state(), p = s.players[0]; p.resources.lumber = 4;
  const offer = { initiatorId: 1, request: { ...emptyResources(), lumber: 1 }, offer: { ...emptyResources(), ore: 1 } } as TradeOffer;
  assert.equal(acceptBotTrade(s, p, offer), true);
  assert.equal(acceptBotTrade(s, p, { ...offer, request: { ...emptyResources(), ore: 1 } }), false);
});

test('resource selection respects stock, and discarding preserves city materials', () => {
  const s = state(), p = s.players[0]; p.resources.ore = 2; p.resources.grain = 1;
  assert.deepEqual(chooseBotResources(s, p, 2, goal.cost), { lumber: 0, brick: 0, wool: 0, grain: 1, ore: 1 });
  s.bankResources = emptyResources(); s.bankResources.wool = 1;
  assert.equal(chooseBotResources(s, p, 4).wool, 1);
  p.settlements = 3; p.resources.lumber = 8;
  assert.equal(chooseBotDiscard(p, 4).lumber, 4);
});

test('pirate or robber choice is driven by impact, not a coin flip', () => {
  const s = state(), p = s.players[0];
  s.board = [{ id: 'sea', q: 0, r: 0, type: HexType.Sea, number: null }, { id: 'land', q: 1, r: 0, type: HexType.Forest, number: 6 }];
  s.settlements = [{ playerId: 1, vertexId: 'far', hexIds: ['land'], isCity: false }];
  assert.equal(chooseBotBlockade(s, p)?.pirate, false);
  s.ships = ['0,40|35,20', '-35,20|0,40', '-35,-20|-35,20'].map(edgeId => ({ edgeId, playerId: 1 }));
  assert.equal(chooseBotBlockade(s, p)?.pirate, true);
  s.ships.forEach(ship => ship.playerId = 0);
  assert.equal(chooseBotBlockade(s, p)?.pirate, false);
});

test('development card actions are limited to old cards and one action card per turn', () => {
  const s = state(), p = s.players[0];
  p.devCardsBoughtThisTurn = [DevCardType.Knight];
  assert.equal(chooseBotDevCard(s, p, []), null);
  p.devCards = [DevCardType.YearOfPlenty]; p.resources = { ...emptyResources(), ore: 2, grain: 1 };
  assert.equal(chooseBotDevCard(s, p, [goal]), DevCardType.YearOfPlenty);
  s.hasPlayedDevCardThisTurn = true;
  assert.equal(chooseBotDevCard(s, p, [goal]), null);
});

test('plans prioritize productive buildings and honor piece limits', () => {
  const s = state(), p = s.players[0];
  s.board = [{ id: 'land', q: 0, r: 0, type: HexType.Forest, number: 6 }];
  const legal = { villages: [{ id: '35,20', hexIds: ['land'] }], cities: [], roads: [], ships: [], edges: [] };
  assert.equal(planBotBuilds(s, p, legal, () => 0)[0].type, 'settlement');
  p.settlements = 5;
  assert.equal(planBotBuilds(s, p, legal, () => 0).some(plan => plan.type === 'settlement'), false);
});
