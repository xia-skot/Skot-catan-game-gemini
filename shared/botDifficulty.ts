export const BOT_LEVELS = {
  beginner: { label: '入门', depth: 1, noise: 5, trades: 0 },
  standard: { label: '进阶', depth: 3, noise: 1.5, trades: 1 },
  expert: { label: '专家', depth: 5, noise: 0, trades: 2 },
} as const;
export type BotDifficulty = keyof typeof BOT_LEVELS;
export const normalizeBotDifficulty = (value: unknown): BotDifficulty =>
  value === 'beginner' || value === 'expert' ? value : 'standard';
export const BOT_TURN_LIMIT_MS = 15000;
export const BOT_TRADE_WAIT_MS = 10000;
