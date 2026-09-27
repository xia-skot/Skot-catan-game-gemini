export interface SetupPlayer { id: string; name: string; isReady?: boolean; socketId?: string; disconnected?: boolean }
export interface SetupSettings {
  playerCount: number;
  mapType: string;
  botConfig: boolean[];
  customBoard?: any[];
  customMapName?: string;
  customMapId?: string;
}
export interface SetupRoom {
  hostId: string;
  players: SetupPlayer[];
  spectators?: SetupPlayer[];
  settings: SetupSettings;
}
export type SettingsPatch = Partial<SetupSettings> & { botSlot?: { index: number; enabled: boolean } };

export function getRoomController(room: SetupRoom, includeSpectators = true): string | null {
  const connected = room.players.filter(player => !player.disconnected && !!player.socketId);
  return connected.find(player => player.id === room.hostId)?.id || connected[0]?.id ||
    (includeSpectators ? room.spectators?.find(player => !player.disconnected && !!player.socketId)?.id : null) || null;
}

export function getSetupSlots(room: SetupRoom) {
  const bots = room.settings.botConfig;
  const lastBot = bots.lastIndexOf(true);
  const length = Math.max(room.settings.playerCount, lastBot + 1, room.players.length + bots.filter(Boolean).length);
  let human = 0;
  const slots = Array.from({ length }, (_, index) => ({
    index,
    isBot: !!bots[index],
    player: bots[index] ? undefined : room.players[human++],
  }));
  let emptySeats = Math.max(0, room.settings.playerCount - slots.filter(slot => slot.isBot || slot.player).length);
  return slots.filter(slot => slot.isBot || slot.player || emptySeats-- > 0);
}

export function applySettingsPatch<T extends SetupRoom>(room: T, patch: SettingsPatch): T {
  const settings = { ...room.settings };
  for (const key of ['mapType', 'customBoard', 'customMapName', 'customMapId'] as const) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      if (key !== 'mapType' && patch[key] == null) delete settings[key];
      else (settings as any)[key] = patch[key];
    }
  }
  if (Number.isInteger(patch.playerCount) && patch.playerCount! >= 2 && patch.playerCount! <= 6) settings.playerCount = patch.playerCount!;
  settings.botConfig = Array.from({ length: 10 }, (_, index) => !!(patch.botConfig || settings.botConfig)[index]);
  const slot = patch.botSlot;
  if (slot && Number.isInteger(slot.index) && slot.index >= 0 && slot.index < 10 && typeof slot.enabled === 'boolean') {
    const occupiedByHuman = getSetupSlots(room).some(item => item.index === slot.index && !!item.player);
    const count = room.players.length + settings.botConfig.filter(Boolean).length;
    if (!occupiedByHuman && (!slot.enabled || count < settings.playerCount || settings.botConfig[slot.index])) {
      settings.botConfig[slot.index] = slot.enabled;
    }
  }
  const players = [...room.players];
  const spectators = [...(room.spectators || [])];
  let excess = players.length + settings.botConfig.filter(Boolean).length - settings.playerCount;
  // Keep selected seats in place. Vacant earlier seats must not replace a selected AI.
  for (let i = settings.botConfig.length - 1; i >= 0 && excess > 0; i--) {
    if (settings.botConfig[i]) { settings.botConfig[i] = false; excess--; }
  }
  for (let i = players.length - 1; i >= 0 && excess > 0; i--) {
    if (players[i].id === room.hostId) continue;
    const [player] = players.splice(i, 1);
    if (!spectators.some(spectator => spectator.id === player.id)) spectators.push({ ...player, isReady: false });
    excess--;
  }
  return { ...room, settings, players, spectators };
}
