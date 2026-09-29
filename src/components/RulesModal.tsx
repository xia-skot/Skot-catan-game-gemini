import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SmartImage } from './SmartImage';
import { requestAppBack, useBackHandler } from '../navigation';
import { X, BookOpen, Map, Users, Star, Hammer, Ship as ShipIcon, Home, Castle, Trophy, Anchor, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  FOREST_IMG,
  FIELDS_IMG,
  PASTURE_IMG,
  Desert_IMG,
  Mountains_IMG,
  HILLS_IMG,
  GOLD_IMG,
  SEA_HEX_IMG,
  LUMBER_ICON,
  BRICK_ICON,
  WOOL_ICON,
  GRAIN_ICON,
  ORE_ICON,
  getDevCardImg,
  getImageUrl,
  getImageCandidates
} from '../images';

interface RulesModalProps {
  isOpen?: boolean;
  isActive?: boolean;
  onClose?: () => void;
  inline?: boolean;
  activeView?: string;
  onActiveViewChange?: (view: any) => void;
}

const HexImg = ({ src, alt }: { src: string, alt: string }) => {
  return (
    <div className={`w-12 h-[54px] mb-1.5 flex items-center justify-center relative`}>
      <div className={`absolute inset-0 bg-slate-300`} style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
      <div className="absolute inset-[2px] overflow-hidden bg-slate-100 flex items-center justify-center" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
        <SmartImage
          src={src}
          alt={alt}
          className="w-full h-full object-cover scale-[1.4]"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
};

const MockPort = ({ type }: { type: '3:1' | 'wood' | 'brick' | 'wool' | 'grain' | 'ore' }) => {
  const is3to1 = type === '3:1';
  let icon = '';
  let text = '2:1';
  
  if (is3to1) {
    text = '3:1';
  } else if (type === 'wood') {
    icon = LUMBER_ICON;
  } else if (type === 'brick') {
    icon = BRICK_ICON;
  } else if (type === 'wool') {
    icon = WOOL_ICON;
  } else if (type === 'grain') {
    icon = GRAIN_ICON;
  } else if (type === 'ore') {
    icon = ORE_ICON;
  }

  return (
    <div className="w-12 h-[54px] mb-1.5 flex flex-col items-center justify-center relative scale-[0.8]">
      <div className="absolute w-[3px] h-6 bg-[#8B5A2B] left-[13px] top-[10px]" />
      <div className="absolute w-[3px] h-6 bg-[#8B5A2B] right-[13px] top-[10px]" />
      <div className="absolute top-[3px] w-12 h-[22px] bg-[#FFFDF7] border-[1.5px] border-[#C8A97E] rounded-full shadow-sm flex items-center justify-center px-0.5">
        <span className="text-[9px] font-bold text-[#5C4033] mr-0.5">{text}</span>
        {is3to1 ? (
          <Star size={10} className="text-amber-500 fill-amber-500" />
        ) : (
          <SmartImage src={icon} alt={type} className="w-3 h-3 object-contain" />
        )}
      </div>
    </div>
  );
};

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose, inline = false, isActive = true, activeView: propActiveView, onActiveViewChange }) => {
  const [internalActiveView, setInternalActiveView] = useState<'menu' | 'resources' | 'flow' | 'scoring' | 'building' | 'devcards'>('menu');
  const activeView = propActiveView !== undefined ? propActiveView : internalActiveView;
  const setActiveView = (v: any) => {
    setInternalActiveView(v);
    if (onActiveViewChange) onActiveViewChange(v);
  };
  const [isPortrait, setIsPortrait] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsPortrait(window.innerWidth < window.innerHeight);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useBackHandler(isActive && (inline || !!isOpen) && (activeView !== 'menu' || !inline), () => {
    if (activeView !== 'menu') setActiveView('menu');
    else onClose?.();
    return true;
  }, inline ? 20 : 90);

  if (!inline && !isOpen) return null;

  const isMobileDevice = typeof window !== 'undefined' && 
    (window.innerWidth < 1024 || window.innerHeight < 1024);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 100000,
  };

  const contentStyle: React.CSSProperties = {};
  const headerPaddingClass = inline
    ? 'py-2.5 sm:py-3'
    : 'py-2.5 sm:py-3 pt-[calc(0.625rem+env(safe-area-inset-top,0px))]';

  const content = (
    <motion.div 
      initial={inline ? false : { opacity: 0, scale: 0.95, y: 20 }}
      animate={inline ? false : { opacity: 1, scale: 1, y: 0 }}
      style={contentStyle}
      className={`relative z-10 flex flex-col overflow-hidden ${
        inline 
          ? 'w-full h-full bg-transparent' 
          : isMobileDevice
            ? 'bg-slate-50 w-full h-full rounded-none shadow-none'
            : 'bg-slate-50 w-full h-full md:max-h-[90%] md:max-w-xl md:rounded-3xl rounded-none shadow-2xl'
      }`}
    >
      {/* Header Profile Section */}
      <div className={`bg-white px-4 sm:px-5 ${headerPaddingClass} shadow-2xs z-10 shrink-0 relative flex justify-between items-center w-full rounded-none border-b border-slate-200/80 shadow-sm`}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center border-2 border-indigo-200/50 relative overflow-hidden shrink-0">
            <BookOpen size={22} />
          </div>
          <div>
            <div className="text-base font-black text-slate-800 leading-tight">游戏规则与指南</div>
            <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">新手指南与玩法介绍</div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
            {(activeView !== 'menu' || !inline) && (
              <button 
                onClick={requestAppBack}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                title="返回"
              >
                <ArrowLeft size={18} />
              </button>
            )}
        </div>
      </div>

      {/* Content */}
      <div 
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar relative max-w-2xl w-full mx-auto touch-pan-y"
        style={{ overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}
      >
        {activeView === 'menu' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="menu"
              initial={inline ? false : { opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="p-4 space-y-6 pb-12">
                <div className="bg-white rounded-3xl p-2 shadow-sm border border-slate-100">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 px-3 pt-2 flex items-center gap-2">
                    <BookOpen size={14} /> 规则分类
                  </h3>
                  <div className="space-y-1">
                    <button 
                      onClick={() => setActiveView('resources')} 
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Star size={16} />
                        </div>
                        <h3 className="font-bold text-slate-700 text-sm">资源板块</h3>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-emerald-400 transition-colors"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                    
                    <button 
                      onClick={() => setActiveView('flow')} 
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Users size={16} />
                        </div>
                        <h3 className="font-bold text-slate-700 text-sm">游戏流程</h3>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-sky-400 transition-colors"><path d="m9 18 6-6-6-6"/></svg>
                    </button>

                    <button 
                      onClick={() => setActiveView('scoring')} 
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Trophy size={16} />
                        </div>
                        <h3 className="font-bold text-slate-700 text-sm">计分规则</h3>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-amber-400 transition-colors"><path d="m9 18 6-6-6-6"/></svg>
                    </button>

                    <button 
                      onClick={() => setActiveView('building')} 
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Map size={16} />
                        </div>
                        <h3 className="font-bold text-slate-700 text-sm">建筑与消耗</h3>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-rose-400 transition-colors"><path d="m9 18 6-6-6-6"/></svg>
                    </button>

                    <button 
                      onClick={() => setActiveView('devcards')} 
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <BookOpen size={16} />
                        </div>
                        <h3 className="font-bold text-slate-700 text-sm">发展卡详情</h3>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-violet-400 transition-colors"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'resources' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="resources"
              initial={inline ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 space-y-6 pb-12"
            >
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Star size={16} /> 资源产出
                </h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <HexImg src={FOREST_IMG} alt="森林" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">森林</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20 justify-center">
                        <SmartImage src={LUMBER_ICON} alt="木材" className="w-4 h-4 object-contain" /> 木材
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <HexImg src={HILLS_IMG} alt="丘陵" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">丘陵</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20 justify-center">
                        <SmartImage src={BRICK_ICON} alt="砖块" className="w-4 h-4 object-contain" /> 砖块
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <HexImg src={PASTURE_IMG} alt="牧场" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">牧场</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20 justify-center">
                        <SmartImage src={WOOL_ICON} alt="羊毛" className="w-4 h-4 object-contain" /> 羊毛
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <HexImg src={FIELDS_IMG} alt="麦田" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">麦田</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20 justify-center">
                        <SmartImage src={GRAIN_ICON} alt="小麦" className="w-4 h-4 object-contain" /> 小麦
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <HexImg src={Mountains_IMG} alt="矿山" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">矿山</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20 justify-center">
                        <SmartImage src={ORE_ICON} alt="铁矿石" className="w-4 h-4 object-contain" /> 铁矿石
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <HexImg src={GOLD_IMG} alt="金矿" />
                      </div>
                      <span className="font-bold text-amber-700 text-sm">金矿</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 font-bold bg-amber-50 border border-amber-100 shadow-sm px-2.5 py-1 rounded-xl w-20 justify-center">
                        产出任意
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <HexImg src={Desert_IMG} alt="沙漠" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">沙漠</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold bg-slate-100 border border-slate-200 shadow-sm px-2.5 py-1 rounded-xl w-20 justify-center">
                        无产出
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <HexImg src={SEA_HEX_IMG} alt="海洋" />
                      </div>
                      <span className="font-bold text-sky-700 text-sm">海洋</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center gap-1.5 text-xs text-sky-600 font-bold bg-sky-50 border border-sky-100 shadow-sm px-2.5 py-1 rounded-xl w-20 justify-center">
                        航行水域
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-black text-sky-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Anchor size={16} /> 港口交易
                </h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <MockPort type="3:1" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">任意港口</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center justify-center text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20">
                        3:1 任意
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <MockPort type="wood" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">木材港口</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center justify-center text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20">
                        2:1 木材
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <MockPort type="brick" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">砖块港口</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center justify-center text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20">
                        2:1 砖块
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <MockPort type="wool" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">羊毛港口</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center justify-center text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20">
                        2:1 羊毛
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <MockPort type="grain" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">麦田港口</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center justify-center text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20">
                        2:1 小麦
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <MockPort type="ore" />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">矿山港口</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight size={14} className="text-slate-300" />
                      <div className="flex items-center justify-center text-xs text-slate-600 font-bold bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-xl w-20">
                        2:1 铁矿石
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'flow' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="flow"
              initial={inline ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 space-y-6 pb-12"
            >
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-black text-sky-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Users size={16} /> 回合流程
                </h3>
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[15px] before:w-0.5 before:bg-slate-100">
                  <div className="relative pl-10">
                    <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-black text-sm shadow-sm ring-4 ring-white border border-sky-200">1</div>
                    <h4 className="font-bold text-slate-800 mb-1">掷骰子</h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">每个回合开始时必须掷骰子。地图上对应该数字的板块将为相邻的定居点(1个)/城市(2个)产出资源。</p>
                    
                    <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3 relative">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-amber-600 font-black text-xs">掷出7（强盗事件）</span>
                      </div>
                      <p className="text-[10px] text-amber-700 leading-relaxed font-medium">不产出资源。手牌超过7张的玩家必须丢弃一半卡牌。掷骰者需移动强盗至某一板块，并抢夺相邻的一名玩家的一张资源卡。</p>
                    </div>
                  </div>
                  <div className="relative pl-10">
                    <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-black text-sm shadow-sm ring-4 ring-white border border-sky-200">2</div>
                    <h4 className="font-bold text-slate-800 mb-1">交易</h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">你可以与其他玩家自由交易，或与银行(4:1)及港口(3:1或2:1)进行固定比例的兑换。</p>
                  </div>
                  <div className="relative pl-10">
                    <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-black text-sm shadow-sm ring-4 ring-white border border-sky-200">3</div>
                    <h4 className="font-bold text-slate-800 mb-1">建设</h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">使用资源建设道路、船只、定居点、升级城市，或购买发展卡。购买的发展卡需等待下个回合才能打出（胜利点卡除外）。</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'scoring' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="scoring"
              initial={inline ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 space-y-6 pb-12"
            >
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-black text-amber-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Trophy size={16} /> 目标分数获胜制
                </h3>
                <p className="text-xs text-slate-500 font-medium mb-4">最先在自己回合达到目标分数的玩家直接赢得游戏（<strong>标准大陆模式为 10 分，群岛世界模式为 14 分</strong>）。具体得分方式如下：</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Home size={18} className="text-slate-400" />
                      <div>
                        <div className="font-bold text-slate-700 text-sm">定居点 (村庄)</div>
                      </div>
                    </div>
                    <div className="text-amber-500 font-black shrink-0">+1 分</div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Trophy size={18} className="text-slate-400" />
                      <div>
                        <div className="font-bold text-slate-700 text-sm">城市</div>
                      </div>
                    </div>
                    <div className="text-amber-500 font-black shrink-0">+2 分</div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Map size={18} className="text-slate-400" />
                      <div>
                        <div className="font-bold text-slate-700 text-sm">最长道路</div>
                        <div className="text-[9px] text-slate-400">最少5条相连</div>
                      </div>
                    </div>
                    <div className="text-amber-500 font-black shrink-0">+2 分</div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <span className="text-lg leading-none grayscale opacity-60">⚔️</span>
                      <div>
                        <div className="font-bold text-slate-700 text-sm">最大军队</div>
                        <div className="text-[9px] text-slate-400">最少3张骑士卡</div>
                      </div>
                    </div>
                    <div className="text-amber-500 font-black shrink-0">+2 分</div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <span className="text-lg leading-none grayscale opacity-60">🏆</span>
                      <div>
                        <div className="font-bold text-slate-700 text-sm">胜利点卡</div>
                        <div className="text-[9px] text-slate-400">隐藏在手中</div>
                      </div>
                    </div>
                    <div className="text-amber-500 font-black shrink-0">+1 分</div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Anchor size={18} className="text-slate-400" />
                      <div>
                        <div className="font-bold text-slate-700 text-sm">岛屿初始建房</div>
                        <div className="text-[9px] text-slate-400">非出生岛首个定居点额外加分</div>
                      </div>
                    </div>
                    <div className="text-amber-500 font-black shrink-0">+2 分</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'building' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="building"
              initial={inline ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 space-y-6 pb-12"
            >
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-black text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Hammer size={16} /> 建设成本
                </h3>
                <div className="space-y-2">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-500">
                        <Hammer size={16} />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">道路</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <SmartImage src={BRICK_ICON} alt="砖块" className="w-5 h-5 object-contain" />
                      <span className="text-slate-300 mx-0.5">+</span>
                      <SmartImage src={LUMBER_ICON} alt="木材" className="w-5 h-5 object-contain" />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-500">
                          <ShipIcon size={16} />
                        </div>
                        <span className="font-bold text-slate-700 text-sm">船只 (群岛世界)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <SmartImage src={WOOL_ICON} alt="羊毛" className="w-5 h-5 object-contain" />
                        <span className="text-slate-300 mx-0.5">+</span>
                        <SmartImage src={LUMBER_ICON} alt="木材" className="w-5 h-5 object-contain" />
                      </div>
                    </div>
                    <p className="text-[10px] text-amber-600 font-medium pl-11">
                      建造规则：道路与船只必须通过自己的村庄或城市衔接，登上新岛后也一样。
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-500">
                        <Home size={16} />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">定居点</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <SmartImage src={BRICK_ICON} alt="砖块" className="w-5 h-5 object-contain" />
                      <SmartImage src={LUMBER_ICON} alt="木材" className="w-5 h-5 object-contain" />
                      <SmartImage src={WOOL_ICON} alt="羊毛" className="w-5 h-5 object-contain" />
                      <SmartImage src={GRAIN_ICON} alt="小麦" className="w-5 h-5 object-contain" />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-500">
                        <Castle size={16} />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">城市</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <SmartImage src={GRAIN_ICON} alt="小麦" className="w-5 h-5 object-contain" />
                      <SmartImage src={GRAIN_ICON} alt="小麦" className="w-5 h-5 object-contain" />
                      <span className="text-slate-300 mx-0.5">+</span>
                      <SmartImage src={ORE_ICON} alt="铁矿石" className="w-5 h-5 object-contain" />
                      <SmartImage src={ORE_ICON} alt="铁矿石" className="w-5 h-5 object-contain" />
                      <SmartImage src={ORE_ICON} alt="铁矿石" className="w-5 h-5 object-contain" />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-500">
                        <BookOpen size={16} />
                      </div>
                      <span className="font-bold text-slate-700 text-sm">发展卡</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <SmartImage src={WOOL_ICON} alt="羊毛" className="w-5 h-5 object-contain" />
                      <SmartImage src={GRAIN_ICON} alt="小麦" className="w-5 h-5 object-contain" />
                      <SmartImage src={ORE_ICON} alt="铁矿石" className="w-5 h-5 object-contain" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {activeView === 'devcards' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="devcards"
              initial={inline ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 space-y-6 pb-12"
            >
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-black text-violet-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <BookOpen size={16} /> 卡牌说明
                </h3>
                <div className="space-y-3">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <SmartImage src={getDevCardImg('knight')} alt="骑士卡" className="w-7 h-7 object-contain" /> 骑士卡
                      </h4>
                      <span className="text-[10px] font-black text-slate-400 tracking-wider">共 14 张</span>
                    </div>
                    <p className="text-slate-600 text-xs font-medium leading-relaxed">打出后可以移动强盗或海盗，并从受影响板块的玩家手中随机抽取一张资源卡。最先打出3张骑士卡的玩家获得“最大军队”称号（2分）。</p>
                  </div>
                  
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <SmartImage src={getDevCardImg('victory_point')} alt="胜利点卡" className="w-7 h-7 object-contain" /> 胜利点卡
                      </h4>
                      <span className="text-[10px] font-black text-slate-400 tracking-wider">共 5 张</span>
                    </div>
                    <p className="text-slate-600 text-xs font-medium leading-relaxed">每张卡片价值1个胜利点。隐藏在手中，可以在达到获胜条件时立刻打出并赢得游戏。</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <SmartImage src={getDevCardImg('road_building')} alt="道路建设" className="w-7 h-7 object-contain" /> 道路建设
                      </h4>
                      <span className="text-[10px] font-black text-slate-400 tracking-wider">共 2 张</span>
                    </div>
                    <p className="text-slate-600 text-xs font-medium leading-relaxed">打出后可以免费在地图上建设两条道路或船只（必须符合建造规则）。</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <SmartImage src={getDevCardImg('year_of_plenty')} alt="丰收之年" className="w-7 h-7 object-contain" /> 丰收之年
                      </h4>
                      <span className="text-[10px] font-black text-slate-400 tracking-wider">共 2 张</span>
                    </div>
                    <p className="text-slate-600 text-xs font-medium leading-relaxed">打出后可以立刻从银行免费拿取任意两张你选择的资源卡。</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <SmartImage src={getDevCardImg('monopoly')} alt="垄断" className="w-7 h-7 object-contain" /> 垄断
                      </h4>
                      <span className="text-[10px] font-black text-slate-400 tracking-wider">共 2 张</span>
                    </div>
                    <p className="text-slate-600 text-xs font-medium leading-relaxed">打出后声明一种资源，所有其他玩家必须将他们手中该种资源的所有卡片全部交给你。</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );

  if (inline) {
    return (
      <>
        {content}
      </>
    );
  }

  return (
    <AnimatePresence>
      <div 
        style={containerStyle}
        className={`bg-black/50 backdrop-blur-sm pointer-events-auto flex ${isMobileDevice ? 'items-stretch p-0' : 'items-center justify-center md:p-4'}`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              onClose?.();
            }
          }}
          className="absolute inset-0 bg-transparent cursor-pointer"
        />
        {content}
      </div>
    </AnimatePresence>
  );
};
