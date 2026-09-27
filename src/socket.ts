import { io, Socket } from 'socket.io-client';

// Use current origin
const URL = typeof window !== 'undefined' ? window.location.origin : '';

export const socket: Socket = io(URL, {
  autoConnect: false,
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});
