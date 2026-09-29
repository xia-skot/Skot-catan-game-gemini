import React from 'react';
import { motion } from 'motion/react';
import { Trophy, Home, Award, Castle, Waypoints, Swords, Flag, User, X } from 'lucide-react';
import { GameState, DevCardType } from '../types';
import { RotatedScroll } from './RotatedScroll';

const CircleOne = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M10 8l2 -2v12" />
  </svg>
);

interface GameOverModalProps {
  gameState: GameState;
  onReturnToLobby: () => void;
  onReturnToMap: () => void;
  maxWidth?: number;
  shouldApplyPortraitRotation?: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({ 
  gameState, 
  onReturnToLobby, 
  onReturnToMap, 
  maxWidth,
  shouldApplyPortraitRotation = false 
}) => {
  if (!gameState) return null;

  // Helper to calculate specific player stats
  const getPlayerStats = (playerId: number) => {
    const player = gameState.players.find(p => p.id === playerId);
    const settlements = gameState.settlements.filter(s => s.playerId === playerId && !s.isCity).length;
    const cities = gameState.settlements.filter(s => s.playerId === playerId && s.isCity).length;
    const roads = gameState.roads.filter(r => r.playerId === playerId).length;
    const ships = gameState.ships.filter(s => s.playerId === playerId).length;
    
    const totalVpCards = (player?.devCards.filter(c => c === DevCardType.VictoryPoint).length || 0) + 
                        ((player?.devCardsBoughtThisTurn || []).filter(c => c === DevCardType.VictoryPoint).length || 0) +
                        (player?.playedDevCards?.filter(c => c === DevCardType.VictoryPoint).length || 0);

    const vpBreakdown = [
      { id: 'settlements', label: '村庄', icon: Home, value: settlements, points: settlements },
      { id: 'cities', label: '城市', icon: Castle, value: cities, points: cities * 2 },
      { id: 'roads', label: '最长道路', icon: Waypoints, value: gameState.longestRoadPlayerId === playerId ? 1 : 0, points: gameState.longestRoadPlayerId === playerId ? 2 : 0 },
      { id: 'army', label: '最多骑士', icon: Swords, value: gameState.largestArmyPlayerId === playerId ? 1 : 0, points: gameState.largestArmyPlayerId === playerId ? 2 : 0 },
      { id: 'cards', label: '胜利点卡', icon: CircleOne, value: totalVpCards, points: totalVpCards },
      { id: 'islands', label: '登岛奖励', icon: Flag, value: player?.islandBonusPoints || 0, points: player?.islandBonusPoints || 0 },
    ];

    const totalVp = vpBreakdown.reduce((sum, item) => sum + item.points, 0);

    return { settlements, cities, roads, ships, vpBreakdown, totalVp };
  };

  const playersWithStats = gameState.players.map(p => ({
    ...p,
    stats: getPlayerStats(p.id)
  }));

  const sortedPlayers = [...playersWithStats].sort((a, b) => b.stats.totalVp - a.stats.totalVp);

  return (
    <motion.div 
      data-game-report
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-0 z-[100000] flex flex-col bg-stone-50 overflow-hidden w-full h-full pointer-events-auto select-none"
    >
      {/* Vertical & Horizontal Rankings Container */}
      <RotatedScroll 
        shouldApplyPortraitRotation={shouldApplyPortraitRotation}
        className="flex-1 overflow-auto bg-white no-scrollbar relative z-10 px-4 pb-4"
      >
        <div className="w-full flex flex-col gap-2">
          {/* Header Row */}
          {sortedPlayers.length > 0 && (
            <div className="sticky top-0 z-40 flex items-end mb-1 border-b border-black/5 pb-2 pt-3 bg-white">
              <div className="sticky left-0 z-50 w-44 shrink-0 bg-white flex items-center gap-2 px-3 h-10">
                <Trophy size={18} className="text-amber-600 shrink-0" />
                <h2 className="text-base font-bold text-slate-900 whitespace-nowrap">本局战报</h2>
              </div>
              <div className="grid grid-cols-6 items-center px-4 bg-white flex-1 min-w-[300px]">
                {sortedPlayers[0].stats.vpBreakdown.map((item) => (
                  <div key={item.id} className="flex flex-col items-center justify-center gap-1">
                    <item.icon size={16} className="text-stone-400" />
                    <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="sticky right-0 z-50 w-20 shrink-0 bg-white flex justify-end">
                <button onClick={onReturnToMap} className="w-10 h-10 flex items-center justify-center text-stone-500 hover:bg-stone-100 rounded-lg" title="关闭/查看地图"><X size={20} /></button>
              </div>
            </div>
          )}
          {sortedPlayers.map((player, index) => {
            const isWinner = (gameState.winnerId !== null && gameState.winnerId !== undefined) 
              ? player.id === gameState.winnerId 
              : index === 0;

            return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`group relative flex items-stretch transition-all ${
                  isWinner 
                    ? 'bg-amber-50/80 rounded-xl shadow-sm' 
                    : 'border-b border-black/5 last:border-b-0 hover:bg-stone-50'
                }`}
              >
                {/* Left Section: Rank & Player Info (Sticky) */}
                <div className={`sticky left-0 z-20 flex items-center gap-3 shrink-0 w-44 py-2.5 px-3 transition-colors ${
                  isWinner ? 'bg-amber-50/90 rounded-l-xl' : 'bg-white group-hover:bg-stone-50'
                }`}>
                  <div className="relative flex-shrink-0">
                    <div 
                      className={`flex items-center justify-center text-white font-serif font-black italic shadow-sm relative z-10 w-8 h-8 rounded-lg text-sm`}
                      style={{ backgroundColor: player.color }}
                    >
                      #{1 + sortedPlayers.filter(other => other.stats.totalVp > player.stats.totalVp).length}
                    </div>
                    {isWinner && (
                      <div className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-black w-5 h-5 rounded-full flex items-center justify-center text-[11px] shadow-sm border border-white z-20">
                        👑
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col min-w-0 justify-center">
                    <span className="text-sm font-black text-slate-900 truncate leading-tight">
                      {player.name}
                    </span>
                  </div>
                </div>

                {/* Middle Section: Horizontal Score Breakdown */}
                <div className="grid grid-cols-6 items-center px-4 py-2.5 bg-transparent flex-1 min-w-[300px]">
                  {player.stats.vpBreakdown.map((item) => (
                    <div 
                      key={item.id} 
                      className={`flex flex-col items-center justify-center transition-opacity ${
                        item.points > 0 
                        ? 'opacity-100' 
                        : 'opacity-30 grayscale'
                      }`}
                    >
                      <span className={`text-[14px] font-serif font-black italic leading-none ${item.points > 0 ? 'text-amber-600' : 'text-stone-400'}`}>
                        {item.points > 0 ? `+${item.points}` : '0'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Right Section: Total Score (Sticky) */}
                <div className={`sticky right-0 z-20 flex items-center justify-end w-20 shrink-0 py-2.5 px-4 transition-colors ${
                  isWinner ? 'bg-amber-50/90 rounded-r-xl' : 'bg-white group-hover:bg-stone-50'
                }`}>
                  <span className={`text-2xl font-serif font-black italic tabular-nums leading-none ${isWinner ? 'text-amber-600' : 'text-slate-800'}`}>
                    {player.stats.totalVp}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </RotatedScroll>
    </motion.div>
  );
};
