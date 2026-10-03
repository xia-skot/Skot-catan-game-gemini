import { io, Socket } from 'socket.io-client';
import { applyStatePatch, type StatePatch } from '../shared/stateSync';
import { applySettingsPatch, type SettingsPatch } from '../shared/roomSetup';

export interface RoomState {
  settingsMutation?: { clientId: string; sequence: number };
  roomId: string;
  hostId: string;
  players: { id: string; name: string; isReady: boolean; disconnected?: boolean; isBot?: boolean; socketId?: string }[];
  spectators?: { id: string; name: string; socketId?: string; disconnected?: boolean }[];
  settings: {
    spectatorHands?: boolean;
    playerCount: number;
    mapType: string;
    botConfig: boolean[];
    botDifficulties?: import('../shared/botDifficulty').BotDifficulty[];
    customBoard?: any[];
    customMapName?: string;
    customMapId?: string;
  };
  gameState?: any;
  reservedUntil?: number | null;
  status?: 'waiting' | 'playing';
  loadedFromSaveName?: string;
  loadedFromSaveId?: string;
}

class SocketService {
  private socket: Socket | null = null;
  public playerId: string;
  private callbacks: Map<string, any> = new Map();
  private settingsClientId = Math.random().toString(36).slice(2);
  private settingsSequence = 0;
  private pendingSettings: { sequence: number; patch: SettingsPatch }[] = [];
  private authoritativeRoom: RoomState | null = null;
  private roomSubscriber?: (state: RoomState) => void;
  private pendingJoin: string | null = null;
  private desiredRoomId: string | null = null;
  private joinRevision = 0;
  private socialListeners = new Map<string, Set<(...args: any[]) => void>>();
  private syncState: { state: any; revision: number } | null = null;
  private syncRequested = false;

  onSocial(event: string, callback: (...args: any[]) => void) {
    if (!this.socialListeners.has(event)) this.socialListeners.set(event, new Set());
    this.socialListeners.get(event)!.add(callback);
    return () => { this.socialListeners.get(event)?.delete(callback); };
  }

  authenticateSocial() {
    const token = localStorage.getItem('catan_auth_token');
    if (token) this.emit('social_auth', token);
  }

  socialRequest(event: string, ...args: any[]): Promise<any> {
    if (!this.socket?.connected) return Promise.resolve({ error: '连接正在恢复，请稍后重试' });
    return new Promise(resolve => {
      this.socket!.timeout(10000).emit(event, ...args, (error: Error | null, result: any) => resolve(error ? { error: '请求超时，请稍后重试' } : result));
    });
  }

  sendReaction(roomId: string, targetId: string, kind: string) {
    if (this.socket?.connected) this.socket.emit('room_reaction', roomId, targetId, kind);
  }

  hasRoomIntent(roomId?: string) {
    return !!this.desiredRoomId && (!roomId || this.desiredRoomId === roomId);
  }

  private clearRoomIntent() {
    this.syncState = null;
    this.syncRequested = false;
    this.desiredRoomId = null;
    this.joinRevision++;
    this.pendingJoin = null;
    this.pendingSettings = [];
    this.authoritativeRoom = null;
  }

  private acceptsGameEvent(context?: { roomId?: string }) {
    return !!this.desiredRoomId && this.authoritativeRoom?.roomId === this.desiredRoomId &&
      (!context?.roomId || context.roomId === this.desiredRoomId);
  }

  private projectedRoom() {
    return this.pendingSettings.reduce((room, update) => applySettingsPatch(room, update.patch), this.authoritativeRoom!);
  }

  constructor() {
    let storedId = localStorage.getItem('catan_player_id');
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 10);
      localStorage.setItem('catan_player_id', storedId);
    }
    this.playerId = storedId;
  }

  private connectionChangeCallbacks: Array<(connected: boolean) => void> = [];

  get isConnected() { return !!this.socket?.connected; }

  onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionChangeCallbacks.push(callback);
    if (this.socket) {
      callback(this.socket.connected);
    }
    return () => {
      this.connectionChangeCallbacks = this.connectionChangeCallbacks.filter(c => c !== callback);
    };
  }

  connect() {
    if (this.socket?.connected) return;
    
    // If socket exists but disconnected, just connect it
    if (this.socket) {
      this.socket.connect();
      return;
    }

    // Create new socket
    this.socket = io(window.location.origin, {
      path: '/socket.io',
      auth: { statePatches: 1 },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      transports: ['polling', 'websocket']
    });

    // Re-bind all sticky listeners whenever a new socket is created
    this.callbacks.forEach((callback, event) => {
      this.socket?.on(event, (...args: any[]) => {
        console.log(`[Socket] Event received: ${event}`, args);
        callback(...args);
      });
    });

    this.socket.on('connect', () => {
      this.syncState = null;
      this.syncRequested = false;
      this.authenticateSocial();
      console.log('[Socket] Connected. ID:', this.socket?.id);
      this.connectionChangeCallbacks.forEach(cb => cb(true));
    });
    for (const event of ['room_invitation', 'invitation_closed', 'invitation_progress', 'room_reaction']) {
      this.socket.on(event, (...args: any[]) => this.socialListeners.get(event)?.forEach(callback => callback(...args)));
    }

    this.socket.on('connect_error', (error) => {
      if (error.message === 'websocket error') {
        console.warn('[Socket] Connection Error (WebSocket fallback to polling):', error.message);
      } else {
        console.warn('[Socket] Connection Error:', error.message);
      }
      this.connectionChangeCallbacks.forEach(cb => cb(false));
      // If websocket fails, it might try polling automatically if transports is set
    });

    this.socket.on('disconnect', (reason) => {
      this.pendingSettings = [];
      this.pendingJoin = null;
      console.log('[Socket] Disconnected. Reason:', reason);
      this.connectionChangeCallbacks.forEach(cb => cb(false));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      // We don't nullify it here if we want to reuse it, 
      // but if we do, connect() handles creating a new one.
    }
  }

  private emit(event: string, ...args: any[]) {
    const revision = this.joinRevision;
    const stillWanted = () => event !== 'join_room' ||
      (revision === this.joinRevision && this.desiredRoomId === args[0]);
    this.connect();

    if (this.socket && this.socket.connected) {
      if (!stillWanted()) return;
      try {
        this.socket.emit(event, ...args);
      } catch (err) {
        console.warn(`Error emitting ${event}:`, err);
      }
      return;
    }

    if (this.socket) {
      const flushEvent = () => {
        if (!stillWanted()) return;
        try {
          this.socket?.emit(event, ...args);
        } catch (err) {
          console.warn(`Error flushing ${event}:`, err);
        }
      };
      this.socket.once('connect', flushEvent);

      // Immediately check if socket connected right as listener was attached
      if (this.socket.connected) {
        this.socket.off('connect', flushEvent);
        if (!stillWanted()) return;
        try {
          this.socket.emit(event, ...args);
        } catch (err) {
          console.warn(`Error emitting ${event}:`, err);
        }
      }
    }
  }

  joinRoom(roomId: string, playerName: string, asSpectator: boolean = false, invitationId?: string) {
    if (!this.playerId) {
      this.playerId = localStorage.getItem('catan_player_id') || Math.random().toString(36).substring(2, 10);
      localStorage.setItem('catan_player_id', this.playerId);
    }
    const requestKey = JSON.stringify([roomId, this.playerId, asSpectator]);
    if (this.pendingJoin === requestKey) return;
    this.desiredRoomId = roomId;
    this.joinRevision++;
    this.pendingJoin = requestKey;
    console.log('[Socket] joinRoom emitted:', roomId, 'playerId:', this.playerId, 'playerName:', playerName);
    this.emit('join_room', roomId, this.playerId, playerName, asSpectator, localStorage.getItem('catan_auth_token'), invitationId);
  }

  getMyActiveRoom(playerName: string, callback: (room: RoomState | null) => void) {
    this.connect();
    if (!this.socket) {
      setTimeout(() => this.getMyActiveRoom(playerName, callback), 100);
      return;
    }

    let handled = false;
    const timeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        callback(null);
      }
    }, 1500);

    this.socket.emit('get_my_active_room', this.playerId, playerName, (room: RoomState | null) => {
      if (!handled) {
        handled = true;
        clearTimeout(timeout);
        callback(room || null);
      }
    });
  }

  getActiveRooms(isAdmin: boolean, callback: (rooms: RoomState[]) => void) {
    this.connect();
    if (!this.socket) {
      setTimeout(() => this.getActiveRooms(isAdmin, callback), 100);
      return;
    }

    let handled = false;
    const timeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        callback([]);
      }
    }, 2500);

    this.socket.emit('get_active_rooms', isAdmin, (rooms: RoomState[]) => {
      if (!handled) {
        handled = true;
        clearTimeout(timeout);
        callback(rooms || []);
      }
    });
  }

  leaveRoom(roomId: string) {
    if (this.desiredRoomId === roomId) this.clearRoomIntent();
    this.emit('leave_room', roomId, this.playerId);
  }

  toggleReady(roomId: string) {
    this.emit('toggle_ready', roomId, this.playerId);
  }

  updateSettings(roomId: string, patch: SettingsPatch) {
    if (!this.socket?.connected || this.authoritativeRoom?.roomId !== roomId || this.authoritativeRoom.gameState) return;
    patch = { ...patch };
    // Socket.IO omits undefined object values. Null explicitly clears a custom map.
    for (const key of ['customBoard', 'customMapName', 'customMapId'] as const) {
      if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] === undefined) patch[key] = null;
    }
    const sequence = ++this.settingsSequence;
    this.pendingSettings.push({ sequence, patch });
    this.roomSubscriber?.(this.projectedRoom());
    this.emit('update_settings', roomId, this.playerId, patch, { clientId: this.settingsClientId, sequence });
  }

  toggleBot(roomId: string, index: number) {
    if (this.authoritativeRoom?.roomId !== roomId) return;
    const enabled = !this.projectedRoom().settings.botConfig[index];
    this.updateSettings(roomId, { botSlot: { index, enabled } });
  }

  sendGameState(roomId: string, gameState: any) {
    this.emit('update_game_state', roomId, gameState);
  }

  sendReactToTrade(roomId: string, tradeId: string, playerId: number, reaction: 'accept' | 'reject') {
    this.emit('react_to_trade', roomId, tradeId, playerId, reaction);
  }

  sendFinalizeTrade(roomId: string, tradeId: string, partnerId: number) {
    this.emit('finalize_trade', roomId, tradeId, partnerId);
  }

  startGame(roomId: string, initialGameState: any) {
    this.emit('start_game', roomId, initialGameState);
  }

  resetGame(roomId: string) {
    console.log(`[Socket] Requesting game reset for room: ${roomId}`);
    this.emit('reset_game', roomId, this.playerId);
  }

  reserveRoom(roomId: string, durationMs: number | null) {
    console.log(`[Socket] Requesting reserve format for room: ${roomId}`);
    this.emit('reserve_room', roomId, durationMs, this.playerId);
  }

  requestSync(roomId: string) {
    this.emit('request_sync', roomId);
  }

  reclaimSlot(roomId: string, targetPlayerId: string) {
    console.log(`[Socket] Requesting to reclaim slot: ${targetPlayerId}`);
    this.emit('reclaim_slot', roomId, this.playerId, targetPlayerId);
  }

  kickPlayer(roomId: string, targetPlayerId: string) {
    this.emit('kick_player', roomId, this.playerId, targetPlayerId);
  }

  demoteToSpectator(roomId: string, targetPlayerId: string) {
    this.emit('demote_to_spectator', roomId, this.playerId, targetPlayerId);
  }

  promoteToPlayer(roomId: string, targetPlayerId: string) {
    this.emit('promote_to_player', roomId, this.playerId, targetPlayerId);
  }

  deleteRoom(roomId: string) {
    this.emit('admin_delete_room', roomId);
  }

  onRoomDeleted(callback: () => void) {
    this.registerCallback('room_deleted', () => {
      if (!this.hasRoomIntent()) return;
      this.clearRoomIntent();
      callback();
    });
  }

  onPlayerKicked(callback: (kickedPlayerId: string) => void) {
    this.registerCallback('player_kicked', (playerId: string) => {
      if (!this.hasRoomIntent()) return;
      if (playerId === this.playerId) this.clearRoomIntent();
      callback(playerId);
    });
  }

  returnToLobby(roomId: string) {
    console.log(`[Socket] Requesting return to lobby for room: ${roomId}`);
    this.emit('return_to_lobby', roomId, this.playerId);
  }

  onRoomState(callback: (state: RoomState) => void) {
    this.roomSubscriber = callback;
    this.registerCallback('room_state', (state: RoomState) => {
      if (!this.hasRoomIntent() || (state && state.roomId !== this.desiredRoomId)) return;
      this.pendingJoin = null;
      if (!state || state.roomId !== this.authoritativeRoom?.roomId || state.gameState) this.pendingSettings = [];
      if (state?.settingsMutation?.clientId === this.settingsClientId) {
        this.pendingSettings = this.pendingSettings.filter(update => update.sequence > state.settingsMutation!.sequence);
      }
      this.authoritativeRoom = state;
      this.syncState = null;
      this.syncRequested = false;
      callback(state ? this.projectedRoom() : state);
    });
  }

  onJoinError(callback: (message: string) => void) {
    this.registerCallback('join_error', (message: string) => {
      this.pendingJoin = null;
      callback(message);
    });
  }

  onGameInit(callback: (state: any, context?: { entry: 'start' | 'resume'; roomId?: string }) => void) {
    this.registerCallback('game_init', (state: any, context?: { entry: 'start' | 'resume'; roomId?: string }) => {
      if (this.acceptsGameEvent(context)) { this.syncState = null; this.syncRequested = false; callback(state, context); }
    });
  }

  onGameUpdate(callback: (state: any) => void) {
    this.registerCallback('game_state_updated', (state: any, context?: { roomId?: string; syncRevision?: number }) => {
      if (!this.acceptsGameEvent(context)) return;
      this.syncRequested = false;
      this.syncState = context?.syncRevision ? { state: JSON.parse(JSON.stringify(state)), revision: context.syncRevision } : null;
      callback(state);
    });
    this.registerCallback('game_state_patch', (patch: StatePatch, context: { roomId: string }) => {
      if (!this.acceptsGameEvent(context)) return;
      const state = this.syncState && applyStatePatch(this.syncState.state, this.syncState.revision, patch);
      if (!state) {
        if (!this.syncRequested) { this.syncRequested = true; this.requestSync(context.roomId); }
        return;
      }
      this.syncState = { state: JSON.parse(JSON.stringify(state)), revision: patch.revision };
      callback(state);
    });
  }

  onGameReset(callback: () => void) {
    this.registerCallback('game_reset', () => {
      if (!this.hasRoomIntent()) return;
      this.clearRoomIntent();
      callback();
    });
  }

  onReturnedToLobby(callback: () => void) {
    this.registerCallback('returned_to_lobby', () => {
      if (!this.hasRoomIntent()) return;
      callback();
    });
  }

  updateSoundSettings(soundSettings: any) {
    this.emit('admin_update_sound_settings', soundSettings);
  }

  onSoundSettingsUpdated(callback: (soundSettings: any) => void) {
    this.registerCallback('sound_settings_updated', callback);
  }

  private registerCallback(event: string, callback: any) {
    console.log(`[Socket] Registering sticky listener for: ${event}`);
    this.callbacks.set(event, callback);
    if (this.socket) {
      this.socket.off(event);
      this.socket.on(event, (...args: any[]) => {
        console.log(`[Socket] Event received: ${event}`, args);
        callback(...args);
      });
    }
  }
}

export const socketService = new SocketService();
