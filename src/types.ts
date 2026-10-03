export enum ResourceType {
  Lumber = 'lumber',
  Brick = 'brick',
  Wool = 'wool',
  Grain = 'grain',
  Ore = 'ore',
}

export enum HexType {
  Forest = 'forest',
  Hills = 'hills',
  Pasture = 'pasture',
  Fields = 'fields',
  Mountains = 'mountains',
  Desert = 'desert',
  Sea = 'sea',
  Gold = 'gold',
}

export interface Hex {
  id: string;
  q: number;
  r: number;
  type: HexType;
  number: number | null;
  isMainland?: boolean;
  isIsland?: boolean;
  isOuterSea?: boolean;
  isStartingLand?: boolean;
  _category?: string;
  category?: string;
  islandId?: number;
}

export enum DevCardType {
  Knight = 'knight',
  VictoryPoint = 'victoryPoint',
  RoadBuilding = 'roadBuilding',
  YearOfPlenty = 'yearOfPlenty',
  Monopoly = 'monopoly',
}

export interface Player {
  publicResourceCount?: number;
  publicDevCardCount?: number;
  id: number;
  name: string;
  color: string;
  isBot: boolean;
  botDifficulty?: import('../shared/botDifficulty').BotDifficulty;
  resources: Record<ResourceType, number>;
  victoryPoints: number;
  roads: number;
  ships: number;
  settlements: number;
  cities: number;
  devCards: DevCardType[]; // List of development cards owned
  devCardsBoughtThisTurn: DevCardType[];
  playedDevCards: DevCardType[];
  knightsPlayed: number;
  longestRoadLength: number;
  vpCardsCount: number;
  islandBonusPoints: number;
  discoveredIslandIds: number[];
  sessionId?: string;
}

export type MapType = 'standard' | 'archipelago';

export interface Port {
  edgeId: string;
  type: ResourceType | '3:1';
  vertexIds: [string, string];
}

export interface TradeOffer {
  createdAt?: number;
  id: string;
  initiatorId: number;
  targetPlayerId: number | null; // null for all players
  offer: Record<ResourceType, number>;
  request: Record<ResourceType, number>;
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'canceled';
  completedWith?: number;
  acceptedBy: number[];
  rejectedBy: number[];
}

export interface GameState {
  handsHidden?: boolean;
  publicBankDevCardCount?: number;
  botTradesThisTurn?: number;
  botTradeSignatures?: string[];
  board: Hex[];
  ports: Port[];
  players: Player[];
  currentPlayerIndex: number;
  dice: [number, number];
  robberHexId: string;
  pirateHexId: string | null;
  settlements: Settlement[];
  roads: Road[];
  ships: Ship[];
  phase: 'setup' | 'main' | 'discard' | 'robber' | 'robber_move' | 'stealing' | 'gold_selection' | 'year_of_plenty' | 'monopoly' | 'road_building' | 'rolling_7' | 'finished' | 'initial_dice_roll' | 'order_determination';
  setupStep: number; // 0 to (playerCount * 2 - 1)
  initialDiceRolls: Record<number, number[]>; // Maps playerId to dice roll history
  initialRollQueue?: number[]; // Queue of playerIds who need to roll
  hasRolled: boolean;
  diceRollPending?: boolean;
  hasBuiltThisTurn: boolean;
  hasPlayedDevCardThisTurn: boolean;
  longestRoadPlayerId: number | null;
  largestArmyPlayerId: number | null;
  winnerId: number | null;
  bankResources: Record<ResourceType, number>;
  bankDevCards: DevCardType[]; // Deck of development cards
  mapType: MapType;
  targetScore?: number;
  pendingStealFrom: number[]; // Player IDs to steal from
  selectedStealTarget?: number | null; // Player ID being targeted for steal
  pendingGoldRewards: { playerId: number, amount: number }[]; // Players who need to pick gold rewards
  pendingDiscards: { playerId: number, amount: number }[]; // Players who need to discard cards
  freeRoads?: number;
  playingDevCard?: DevCardType | null;
  activeBuildMode?: 'road' | 'settlement' | 'city' | 'ship' | null;
  tradeOffers: TradeOffer[];
  lastDevCardEvent?: { playerName: string; cardType: string; timestamp: number } | null;
}

export interface Settlement {
  hexIds: string[]; // Usually 3 hexes meet at a vertex
  vertexId: string;
  playerId: number;
  isCity: boolean;
}

export interface Road {
  edgeId: string;
  playerId: number;
}

export interface Ship {
  edgeId: string;
  playerId: number;
}
