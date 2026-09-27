import { io, Socket } from 'socket.io-client';

export interface RoomState {
  roomId: string;
  hostId: string;
  players: { id: string; name: string; isReady: boolean; disconnected?: boolean; isBot?: boolean; socketId?: string }[];
  spectators?: { id: string; name: string; socketId?: string; disconnected?: boolean }[];
  settings: {
    playerCount: number;
    mapType: string;
    botConfig: boolean[];
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

  constructor() {
    let storedId = localStorage.getItem('catan_player_id');
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 10);
      localStorage.setItem('catan_player_id', storedId);
    }
    this.playerId = storedId;
  }

  private connectionChangeCallbacks: Array<(connected: boolean) => void> = [];

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
      console.log('[Socket] Connected. ID:', this.socket?.id);
      this.connectionChangeCallbacks.forEach(cb => cb(true));
    });

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
    this.connect();

    if (this.socket && this.socket.connected) {
      try {
        this.socket.emit(event, ...args);
      } catch (err) {
        console.warn(`Error emitting ${event}:`, err);
      }
      return;
    }

    if (this.socket) {
      const flushEvent = () => {
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
        try {
          this.socket.emit(event, ...args);
        } catch (err) {
          console.warn(`Error emitting ${event}:`, err);
        }
      }
    }
  }

  joinRoom(roomId: string, playerName: string, asSpectator: boolean = false) {
    if (!this.playerId) {
      this.playerId = localStorage.getItem('catan_player_id') || Math.random().toString(36).substring(2, 10);
      localStorage.setItem('catan_player_id', this.playerId);
    }
    console.log('[Socket] joinRoom emitted:', roomId, 'playerId:', this.playerId, 'playerName:', playerName);
    this.emit('join_room', roomId, this.playerId, playerName, asSpectator);
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
    this.emit('leave_room', roomId, this.playerId);
  }

  toggleReady(roomId: string) {
    this.emit('toggle_ready', roomId, this.playerId);
  }

  updateSettings(roomId: string, settings: any) {
    this.emit('update_settings', roomId, this.playerId, settings);
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
    this.registerCallback('room_deleted', callback);
  }

  onPlayerKicked(callback: (kickedPlayerId: string) => void) {
    this.registerCallback('player_kicked', callback);
  }

  returnToLobby(roomId: string) {
    console.log(`[Socket] Requesting return to lobby for room: ${roomId}`);
    this.emit('return_to_lobby', roomId, this.playerId);
  }

  onRoomState(callback: (state: RoomState) => void) {
    this.registerCallback('room_state', callback);
  }

  onGameInit(callback: (state: any) => void) {
    this.registerCallback('game_init', callback);
  }

  onGameUpdate(callback: (state: any) => void) {
    this.registerCallback('game_state_updated', callback);
  }

  onGameReset(callback: () => void) {
    this.registerCallback('game_reset', callback);
  }

  onReturnedToLobby(callback: () => void) {
    this.registerCallback('returned_to_lobby', callback);
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
