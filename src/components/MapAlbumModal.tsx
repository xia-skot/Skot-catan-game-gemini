import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Trash2, 
  MoreVertical, 
  Type, 
  CloudUpload, 
  Globe 
} from 'lucide-react';
import { HexType } from '../types';

interface MapAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedMaps: any[];
  currentUser: any;
  onSelectMap: (map: any) => void;
  onDeleteMap: (map: any) => void;
  onRenameMap: (map: any, newName: string) => void;
  onUploadMap: (map: any) => void;
  onGenerateNew: () => void;
  albumFilter: '2-4' | '5' | '6';
  setAlbumFilter: (val: '2-4' | '5' | '6') => void;
  MapPreviewRenderer?: React.ComponentType<{ board: any[], isTopologyOnly?: boolean, isLogo?: boolean }>;
  selectedMapId?: string | null;
}

export function MapAlbumModal({
  isOpen,
  onClose,
  savedMaps,
  currentUser,
  onSelectMap,
  onDeleteMap,
  onRenameMap,
  onUploadMap,
  onGenerateNew,
  albumFilter,
  setAlbumFilter,
  MapPreviewRenderer,
  selectedMapId
}: MapAlbumModalProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [renamingMapId, setRenamingMapId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [deletingMapId, setDeletingMapId] = useState<string | null>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const filteredMaps = useMemo(() => {
    return savedMaps.filter(map => {
      if (albumFilter === '2-4') return map.playerCount >= 2 && map.playerCount <= 4;
      if (albumFilter === '5') return map.playerCount === 5;
      if (albumFilter === '6') return map.playerCount === 6;
      return true;
    });
  }, [savedMaps, albumFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100000] bg-[#f8fafc] pointer-events-auto flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* Top Header Navigation Bar */}
      <div className="px-4 sm:px-8 py-3 sm:py-4 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black transition-colors"
          >
            ← 返回房间
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <h2 className="text-base sm:text-xl font-serif font-black italic text-slate-800">地图收藏册</h2>
        </div>

        <button 
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-xs transition-colors"
          title="关闭"
        >
          ✕
        </button>
      </div>

      {/* Main Album Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 no-scrollbar bg-[#f8fafc]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex bg-slate-200/60 p-1 rounded-xl border border-slate-200/80">
              <button 
                onClick={() => setAlbumFilter('2-4')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${albumFilter === '2-4' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                2-4人
              </button>
              <button 
                onClick={() => setAlbumFilter('5')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${albumFilter === '5' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                5人
              </button>
              <button 
                onClick={() => setAlbumFilter('6')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${albumFilter === '6' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                6人
              </button>
            </div>
            
            <button 
              onClick={() => {
                onClose();
                onGenerateNew();
              }}
              className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-md shadow-indigo-200"
            >
              ✨ 随机生成新地图
            </button>
          </div>

          {filteredMaps.length === 0 ? (
            <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border border-slate-200/80">
              <div className="text-4xl mb-3 opacity-50">🗺️</div>
              <p className="text-xs font-bold tracking-widest uppercase">暂无相关收藏地图</p>
              <p className="text-[11px] mt-1 text-slate-400">点击上方按钮生成并收藏</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredMaps.map(map => {
                const isSelected = selectedMapId === map.id;
                return (
                  <div 
                    key={map.id} 
                    className={`p-4 rounded-2xl border transition-all group flex flex-col relative ${isSelected ? 'bg-indigo-50/30 border-indigo-500 shadow-md shadow-indigo-100 ring-2 ring-indigo-500/10' : 'bg-white border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-200'}`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 bg-indigo-600 text-white rounded-full text-[10px] shadow-sm z-10">
                        ✓
                      </div>
                    )}
                    <div className="mb-3 pr-8 relative">
                      <div className="flex items-center gap-2 mb-1">
                        {renamingMapId === map.id ? (
                          <input
                            autoFocus
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onBlur={() => {
                              if (renameInput.trim() && renameInput.trim() !== map.name) {
                                onRenameMap(map, renameInput.trim());
                              }
                              setRenamingMapId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (renameInput.trim() && renameInput.trim() !== map.name) {
                                  onRenameMap(map, renameInput.trim());
                                }
                                setRenamingMapId(null);
                              } else if (e.key === 'Escape') {
                                setRenamingMapId(null);
                              }
                            }}
                            className="text-xs font-black uppercase tracking-widest text-indigo-900 bg-white border border-indigo-200 outline-none rounded px-1 w-full"
                          />
                        ) : (
                          <h3 className={`text-xs font-black uppercase tracking-widest truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`} title={map.name}>
                            {map.name}
                          </h3>
                        )}
                        {map.isDb && <span className="bg-amber-100 text-[9px] px-1.5 py-0.5 rounded font-black text-amber-800 uppercase tracking-widest shrink-0">官方</span>}
                      </div>
                      <p className="text-[10px] text-slate-400">{map.date || '未知时间'}</p>

                      <div className="absolute top-0 -right-2">
                         <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === map.id ? null : map.id);
                            }}
                            className={`p-1 rounded-lg transition-colors ${activeMenuId === map.id ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}
                         >
                           <MoreVertical size={14} />
                         </button>
                         
                         <AnimatePresence>
                           {activeMenuId === map.id && (
                             <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                                className="absolute right-0 top-full mt-1 w-28 bg-white rounded-xl shadow-xl border border-slate-100 z-30 py-1 overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                             >
                                <button 
                                  onClick={() => {
                                    const nextName = prompt('输入新名称：', map.name);
                                    if (nextName && nextName.trim()) {
                                      onRenameMap(map, nextName.trim());
                                    }
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-[11px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2 transition-colors"
                                >
                                  <Type size={12} /> 重命名
                                </button>

                                {map.isLocal && currentUser?.role === 'admin' && (
                                   <button 
                                      onClick={() => {
                                        onUploadMap(map);
                                        setActiveMenuId(null);
                                      }}
                                      className="w-full px-3 py-1.5 text-left text-[11px] font-bold text-amber-600 hover:bg-amber-50 flex items-center gap-2 transition-colors"
                                    >
                                      <CloudUpload size={12} /> 上传云端
                                   </button>
                                )}

                                <button 
                                  onClick={() => {
                                    onDeleteMap(map);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-[11px] font-bold text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                >
                                  <Trash2 size={12} /> 删除地图
                                </button>
                             </motion.div>
                           )}
                         </AnimatePresence>
                      </div>
                    </div>
                    
                    {/* Map Preview */}
                    <div className={`aspect-video rounded-xl mb-3 flex-1 flex flex-col justify-center items-center overflow-hidden border shadow-inner relative min-h-[140px] ${isSelected ? 'bg-white border-indigo-100' : 'bg-slate-50 border-slate-200'}`}>
                       {MapPreviewRenderer && map.board ? (
                         <div className="absolute inset-0 pointer-events-none">
                           <MapPreviewRenderer board={map.board} isTopologyOnly={true} />
                         </div>
                       ) : (
                         <div className="flex flex-col items-center">
                           <span className="text-3xl mb-1">{map.mapType === 'standard' ? '🌍' : '🏝️'}</span>
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{map.mapType === 'standard' ? '标准大陆' : '群岛世界'}</span>
                         </div>
                       )}
                    </div>

                    <div className="flex gap-2 mt-auto pt-1">
                       <button 
                          onClick={() => onSelectMap(map)}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                       >
                          {isSelected ? '正在使用' : '应用到大厅'}
                       </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
