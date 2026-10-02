import { randomUUID } from 'node:crypto';
import { getSetupSlots } from '../shared/roomSetup';
import { resultRankPoints } from '../shared/gameResult';
import { LEADERBOARD_SCORING_VERSION } from '../shared/leaderboard';

interface Identity { id: number; sessionId: string | null; userId: string | null; isOriginalBot: boolean; isGuest: boolean }
interface Recording {
  gameId: string;
  identities: Map<number, Identity>;
  clock?: { startedAt: number; observedAt: number; finishedAt?: number; autoplay: Set<string>; elapsed: Map<string, number> };
  result?: Record<string, any>;
  pending?: Promise<void>;
  saved?: boolean;
}

// Never serialize this metadata to clients or accept it from restored/client game state.
const recordings = new WeakMap<object, Recording>();

export function hasUnsavedLeaderboardResult(room: object): boolean {
  const recording = recordings.get(room);
  return !!recording?.result && !recording.saved;
}

/** Call only after the server accepts a NEW start_game from a room member. */
export function beginLeaderboardGame(room: any, initialState: any, now = Date.now()): boolean {
  recordings.delete(room);
  if (!Array.isArray(initialState?.players) || !Array.isArray(room.players) ||
      !Array.isArray(room.settings?.botConfig) || initialState.players.length !== room.settings?.playerCount) return false;
  const slots = getSetupSlots(room).filter(slot => slot.player || slot.isBot);
  if (slots.length !== initialState.players.length) return false;
  const identities = new Map<number, Identity>();
  const sessions = new Set<string>();
  for (const player of initialState.players) {
    if (!Number.isInteger(player.id) || player.id < 0 || player.id >= initialState.players.length || identities.has(player.id)) return false;
    const slot = slots[player.id], configuredBot = slot.isBot;
    const member: any = slot.player;
    if (configuredBot ? !!player.sessionId : !member || player.sessionId !== member.id || sessions.has(member.id)) return false;
    if (member) sessions.add(member.id);
    // member.userId must be assigned by verified socket authentication, never by playerId/name.
    identities.set(player.id, { id: player.id, sessionId: member?.id || null,
      userId: typeof member?.userId === 'string' ? member.userId : null,
      isOriginalBot: configuredBot, isGuest: !member?.userId });
  }
  recordings.set(room, { gameId: randomUUID(), identities,
    clock: { startedAt: now, observedAt: now,
      autoplay: new Set(initialState.players.filter((player: any) => !identities.get(player.id)?.isOriginalBot && player.isBot === true).map((player: any) => player.sessionId)),
      elapsed: new Map() } });
  return true;
}

/** Accumulate the previous mode up to this accepted transition using server time. */
export function observeLeaderboardGame(room: object, state: any, now = Date.now()): void {
  const recording = recordings.get(room), clock = recording?.clock;
  if (!recording || !clock || clock.finishedAt !== undefined || !Array.isArray(state?.players)) return;
  const time = Math.max(clock.observedAt, now);
  for (const id of clock.autoplay) clock.elapsed.set(id, (clock.elapsed.get(id) || 0) + time - clock.observedAt);
  clock.observedAt = time;
  const humanSessions = new Set([...recording.identities.values()].filter(identity => !identity.isOriginalBot).map(identity => identity.sessionId));
  clock.autoplay = new Set(state.players.filter((player: any) => humanSessions.has(player.sessionId) &&
    player.isBot === true).map((player: any) => player.sessionId));
  if (state.winnerId != null || state.phase === 'finished') clock.finishedAt = time;
}

function resultIdentities(recording: Recording, players: any[]): Identity[] | null {
  if (!recording.clock) return players.map(player => recording.identities.get(player.id)!).filter(Boolean).length === players.length
    ? players.map(player => recording.identities.get(player.id)!) : null;
  const humans = new Map([...recording.identities.values()].filter(identity => !identity.isOriginalBot)
    .map(identity => [identity.sessionId!, identity]));
  const botCount = [...recording.identities.values()].filter(identity => identity.isOriginalBot).length;
  const seen = new Set<string>();
  let bots = 0;
  const matched: Identity[] = [];
  for (const player of players) {
    if (typeof player.sessionId === 'string' && player.sessionId) {
      const identity = humans.get(player.sessionId);
      if (!identity || seen.has(player.sessionId)) return null;
      seen.add(player.sessionId);
      matched.push(identity);
    } else {
      bots++;
      matched.push({ id: player.id, sessionId: null, userId: null, isOriginalBot: true, isGuest: true });
    }
  }
  return seen.size === humans.size && bots === botCount ? matched : null;
}

/** Pass the existing server-built gameRecord, never req.body or a client award/score object. */
export function persistLeaderboardResult(room: object, gameRecord: Record<string, any>, collection: any, now = Date.now()): Promise<void> {
  if (!collection) return Promise.resolve();
  let recording = recordings.get(room);
  if (!recording) {
    // Preserve restored/pre-upgrade history without attributing client-supplied account identities.
    if (!Array.isArray(gameRecord.players) || gameRecord.players.some((player: any) => !Number.isInteger(player.id))) return Promise.resolve();
    recording = { gameId: randomUUID(), identities: new Map(gameRecord.players.map((player: any) => [player.id, {
      id: player.id, sessionId: null, userId: null, isOriginalBot: player.isBot === true, isGuest: true,
    }])) };
    recordings.set(room, recording);
  }
  if (recording.saved) return Promise.resolve();
  if (recording.pending) return recording.pending;
  if (!recording.result) {
    if (!Array.isArray(gameRecord.players) || gameRecord.players.length !== recording.identities.size ||
        new Set(gameRecord.players.map((player: any) => player.id)).size !== recording.identities.size ||
        gameRecord.players.some((player: any) => !recording.identities.has(player.id))) return Promise.resolve();
    const identities = resultIdentities(recording, gameRecord.players);
    if (!identities) return Promise.resolve();
    observeLeaderboardGame(room, gameRecord, now);
    const clock = recording.clock;
    const result: Record<string, any> = structuredClone({ ...gameRecord, gameId: recording.gameId, identityVersion: clock ? 2 : 1,
      accountBindingVersion: clock ? 1 : undefined,
      durationMs: clock ? (clock.finishedAt ?? clock.observedAt) - clock.startedAt : undefined,
      players: gameRecord.players.map((player: any, index: number) => ({ ...player, ...identities[index], id: player.id,
        autoplayMs: clock ? clock.elapsed.get(identities[index].sessionId!) || 0 : undefined })) });
    if (clock) {
      result.scoringVersion = LEADERBOARD_SCORING_VERSION;
      result.players = result.players.map((player: any) => ({ ...player, rankAward: resultRankPoints(result.players, player, result) }));
    }
    recording.result = result;
  }
  // Set pending synchronously. Concurrent winner messages share one write; retry preserves the first result/date.
  const pending = Promise.resolve().then(async () => {
    await collection.updateOne({ gameId: recording.gameId }, { $setOnInsert: recording.result }, { upsert: true });
    recording.saved = true;
  }).finally(() => { recording.pending = undefined; });
  recording.pending = pending;
  return pending;
}
