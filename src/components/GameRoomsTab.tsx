import React, { useEffect, useState } from 'react';
import { socketService, RoomState } from '../socketService';
import { Swords, Eye, RefreshCw, Trash2 } from 'lucide-react';

interface GameRoomsTabProps {
  currentUser: { id?: string, username: string, role?: string, isAdmin?: boolean } | null;
  onJoinRoom: (roomId: string) => void;
  onSpectateRoom: (roomId: string) => void;
  onReturnToGame?: (roomId?: string) => void;
  onUserFoundInRoom?: (roomId: string) => void;
  isRoomLocked?: boolean;
  activeRoomId?: string | null;
}

export const GameRoomsTab: React.FC<GameRoomsTabProps> = ({ 
  currentUser, 
  onJoinRoom, 
  onSpectateRoom, 
  onReturnToGame,
  onUserFoundInRoom,
  isRoomLocked = false,
  activeRoomId = null
}) => {
  const [rooms, setRooms] = useState<RoomState[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = currentUser?.isAdmin || currentUser?.role === 'admin';

  const fetchRooms = () => {
    socketService.getActiveRooms(isAdmin, (fetchedRooms) => {
      const sanitizedRooms = fetchedRooms || [];
      setRooms(prev => {
        if (JSON.stringify(prev) === JSON.stringify(sanitizedRooms)) {
          return prev;
        }
        return sanitizedRooms;
      });
      setLoading(false);

      const myId = currentUser?.id;
      const myName = currentUser?.username || localStorage.getItem('catan_player_name');
      
      // Auto-detect if user belongs to any active room
      const userRoom = sanitizedRooms.find((room: RoomState) => {
        if (!room) return false;
        return room.players?.some((p: any) => (myId && p.id === myId) || (myName && p.name === myName));
      });
      
      if (userRoom && onUserFoundInRoom && (!isRoomLocked || activeRoomId !== userRoom.roomId)) {
        onUserFoundInRoom(userRoom.roomId);
      }

      const hasMyRoom = sanitizedRooms.some((room: RoomState) => {
        if (!room) return false;
        if (myId && room.hostId === myId) return true;
        if (room.players?.some((p: any) => (myId && p.id === myId) || (myName && p.name === myName))) return true;
        if (room.spectators?.some((s: any) => (myId && s.id === myId) || (myName && s.name === myName))) return true;
        return false;
      });

      if (!hasMyRoom && localStorage.getItem('catan_active_room') && localStorage.getItem('catan_has_created_room') !== 'true') {
        localStorage.removeItem('catan_active_room');
      }
    });
  };

  const handleDeleteRoom = (roomId: string) => {
    socketService.deleteRoom(roomId);
    setTimeout(fetchRooms, 300);
  };

  useEffect(() => {
    fetchRooms();
    
    const interval = setInterval(() => {
      fetchRooms();
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const myId = currentUser?.id;
  const myName = currentUser?.username || localStorage.getItem('catan_player_name');

  const isMyRoom = (room: RoomState) => {
    if (!room) return false;
    if (myId && room.hostId === myId) return true;
    if (room.players?.some((p: any) => (myId && p.id === myId) || (myName && p.name === myName))) return true;
    if (room.spectators?.some((s: any) => (myId && s.id === myId) || (myName && s.name === myName))) return true;
    return false;
  };

  const sortedRooms = [...rooms].sort((a, b) => {
    const aMine = isMyRoom(a);
    const bMine = isMyRoom(b);
    if (aMine && !bMine) return -1;
    if (!aMine && bMine) return 1;
    return 0;
  });

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-serif font-black italic text-slate-800 flex items-center gap-2">
            <Swords size={24} className="text-indigo-600" />
            游戏大厅
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchRooms}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shadow-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm font-bold">加载中...</div>
        ) : sortedRooms.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm font-bold">当前没有活跃的海域</div>
        ) : (
          sortedRooms.map(room => (
            <div key={room.roomId} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-slate-400 tracking-widest">海域</span>
                  <span className="text-lg font-black text-indigo-700">{room.roomId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                     {room.status === 'waiting' ? '约局中' : '游戏中'}
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={() => handleDeleteRoom(room.roomId)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      title="解散海域"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex justify-between items-end mt-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 font-bold">
                    玩家: <span className="text-slate-800">
                      {room.settings?.playerCount || 4}人
                    </span>
                  </span>
                  <span className="text-xs text-slate-500 font-bold">
                    观战: <span className="text-slate-800">{room.spectators?.length || 0}</span>
                  </span>
                </div>
                
                {/* Action Button Logic */}
                <div className="flex items-center gap-2">
                  {isRoomLocked && activeRoomId === room.roomId ? (
                    <button
                      onClick={() => {
                        if (onReturnToGame) onReturnToGame(room.roomId);
                        else onJoinRoom(room.roomId);
                      }}
                      className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-xs rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <RefreshCw size={12} className="animate-pulse" />
                      返回游戏
                    </button>
                  ) : isRoomLocked ? (
                    // Requirement: If player has an active room locked, don't allow joining OR spectating others
                    null
                  ) : room.status === 'waiting' ? (
                    // If not locked and room is waiting
                    (room.players?.length || 0) < (room.settings?.playerCount || 4) ? (
                      <button
                        onClick={() => onJoinRoom(room.roomId)}
                        className="px-4 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-xs rounded-lg transition-colors"
                      >
                        加入海域
                      </button>
                    ) : (
                      // Full room: allow spectating if not locked
                      <button
                        onClick={() => onSpectateRoom(room.roomId)}
                        className="px-4 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Eye size={12} />
                        观战
                      </button>
                    )
                  ) : (
                    // Room is playing/finished
                    room.players?.some((p: any) => 
                      (currentUser?.id && p.id === currentUser.id) || 
                      ((currentUser?.username || localStorage.getItem('catan_player_name')) && p.name === (currentUser?.username || localStorage.getItem('catan_player_name')))
                    ) ? (
                      <button
                        onClick={() => {
                          if (onReturnToGame) onReturnToGame(room.roomId);
                          else onJoinRoom(room.roomId);
                        }}
                        className="px-4 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-xs rounded-lg transition-colors"
                      >
                        返回游戏
                      </button>
                    ) : (
                      // Not user's room and not locked: allow spectating
                      <button
                        onClick={() => onSpectateRoom(room.roomId)}
                        className="px-4 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Eye size={12} />
                        观战
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
