import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { MapType } from '../types';

interface MapGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerCount: number;
  mapType: MapType;
  generatePreview: () => void;
  saveMapToAlbum: () => void;
  startWithPreviewMap: () => void;
  previewBoard: any[];
  MapPreviewRenderer: React.ComponentType<{ board: any[], isTopologyOnly?: boolean, isLogo?: boolean }>;
}

export function MapGeneratorModal({
  isOpen,
  onClose,
  playerCount,
  mapType,
  generatePreview,
  saveMapToAlbum,
  startWithPreviewMap,
  previewBoard,
  MapPreviewRenderer
}: MapGeneratorModalProps) {
  
  useEffect(() => {
    if (isOpen) {
      generatePreview();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-4 sm:p-6"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        className="w-full max-w-5xl max-h-[90%] bg-stone-50 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-stone-200"
      >
        <div className="p-4 sm:p-6 pb-4 flex justify-between items-center border-b border-stone-200 bg-white">
          <h2 className="text-lg sm:text-2xl font-serif font-black italic text-stone-800">地图生成与预览</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 font-bold"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-stone-100 relative">
           <div className="flex-1 relative min-h-[300px] flex items-center justify-center">
             {previewBoard.length > 0 && (
                <div className="absolute inset-0">
                   <MapPreviewRenderer board={previewBoard} isTopologyOnly={true} />
                </div>
             )}
             
             {/* Regenerate overlay button */}
             <div className="absolute top-4 right-4 z-10">
                <button
                   onClick={generatePreview}
                   className="px-4 py-2 bg-white/90 hover:bg-white text-stone-800 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2 border border-stone-200"
                >
                  <span className="text-lg">🎲</span>
                  重新生成
                </button>
             </div>
           </div>

           <div className="p-4 sm:p-6 bg-white w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-stone-200 flex flex-col justify-between shrink-0">
             <div>
               <h3 className="text-sm font-black uppercase tracking-widest text-stone-800 mb-2">地图信息</h3>
               <div className="space-y-2 mb-6">
                 <div className="flex justify-between items-center bg-stone-50 p-2 sm:p-3 rounded-lg border border-stone-100">
                   <span className="text-xs font-bold text-stone-500">类型</span>
                   <span className="text-xs font-black text-stone-800">{mapType === 'standard' ? '🌍 标准大陆' : '🏝️ 群岛世界'}</span>
                 </div>
                 <div className="flex justify-between items-center bg-stone-50 p-2 sm:p-3 rounded-lg border border-stone-100">
                   <span className="text-xs font-bold text-stone-500">玩家人数</span>
                   <span className="text-xs font-black text-stone-800">{playerCount} 人</span>
                 </div>
               </div>
             </div>

             <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    saveMapToAlbum();
                    // optional: small toast or just close
                  }}
                  className="w-full py-3 bg-stone-100 text-stone-700 hover:bg-stone-200 hover:text-stone-900 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                >
                  ⭐ 加入收藏图册
                </button>
                <button 
                  onClick={() => {
                    startWithPreviewMap();
                    onClose();
                  }}
                  className="w-full py-3 sm:py-4 bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/30"
                >
                  使用此地图
                </button>
             </div>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
