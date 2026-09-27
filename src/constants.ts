import { HexType, ResourceType } from './types';

export const HEX_RESOURCES: Record<HexType, ResourceType | 'none'> = {
  [HexType.Forest]: ResourceType.Lumber,
  [HexType.Hills]: ResourceType.Brick,
  [HexType.Pasture]: ResourceType.Wool,
  [HexType.Fields]: ResourceType.Grain,
  [HexType.Mountains]: ResourceType.Ore,
  [HexType.Desert]: 'none',
  [HexType.Sea]: 'none',
  [HexType.Gold]: 'none', // Gold provides any resource
};

export const RESOURCE_NAMES: Record<ResourceType, string> = {
  [ResourceType.Lumber]: '木材',
  [ResourceType.Brick]: '砖块',
  [ResourceType.Wool]: '羊毛',
  [ResourceType.Grain]: '小麦',
  [ResourceType.Ore]: '矿石',
};

export const RESOURCE_EMOJIS: Record<ResourceType, string> = {
  [ResourceType.Lumber]: '🌲',
  [ResourceType.Brick]: '🧱',
  [ResourceType.Wool]: '🐑',
  [ResourceType.Grain]: '🌾',
  [ResourceType.Ore]: '⛰️',
};

export const HEX_NAMES: Record<HexType, string> = {
  [HexType.Forest]: '森林',
  [HexType.Hills]: '丘陵',
  [HexType.Pasture]: '牧场',
  [HexType.Fields]: '耕地',
  [HexType.Mountains]: '山脉',
  [HexType.Desert]: '沙漠',
  [HexType.Sea]: '海洋',
  [HexType.Gold]: '金矿',
};

export const RESOURCE_COLORS: Record<ResourceType | 'gold' | 'desert' | 'sea', string> = {
  [ResourceType.Lumber]: '#2e6629', // Deep Forest Green
  [ResourceType.Brick]: '#d16b54',  // Clay Red
  [ResourceType.Wool]: '#8ac43f',   // Pasture Lime
  [ResourceType.Grain]: '#f2c73a',  // Golden Yellow
  [ResourceType.Ore]: '#8ba1b5',    // Mountain Gray
  gold: '#ffd700',
  desert: '#dca467',
  sea: '#4eaadd',
};

export const PLAYER_COLORS = [
  '#E74C3C', // Red
  '#3498DB', // Blue
  '#F1C40F', // Yellow
  '#E67E22', // Orange
  '#2ECC71', // Green
  '#8E44AD', // Purple
];

export const COSTS = {
  road: { [ResourceType.Lumber]: 1, [ResourceType.Brick]: 1 },
  ship: { [ResourceType.Lumber]: 1, [ResourceType.Wool]: 1 },
  settlement: { [ResourceType.Lumber]: 1, [ResourceType.Brick]: 1, [ResourceType.Wool]: 1, [ResourceType.Grain]: 1 },
  city: { [ResourceType.Grain]: 2, [ResourceType.Ore]: 3 },
  devCard: { [ResourceType.Wool]: 1, [ResourceType.Grain]: 1, [ResourceType.Ore]: 1 },
};
