import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { X, Volume2, VolumeX, Music, BellRing, Sliders, RotateCcw, Shield } from 'lucide-react';
import { audioService, SoundEqualizer, DEFAULT_EQUALIZER, SoundType } from '../audioService';
import { socketService } from '../socketService';

interface SoundSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  inline?: boolean;
  gameContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const SFX_ITEMS: { key: keyof SoundEqualizer; label: string; icon: string }[] = [
  { key: 'dice', label: '掷骰子音效', icon: '🎲' },
  { key: 'resource', label: '资源获取音效', icon: '🌾' },
  { key: 'pirate', label: '海盗/强盗音效', icon: '🏴‍☠️' },
  { key: 'click', label: '按钮点击音效', icon: '🔘' },
  { key: 'build', label: '建造结构音效', icon: '🏗️' },
  { key: 'bgm', label: '背景音乐', icon: '🎵' },
];

export function SoundSettingsModal({ isOpen, onClose, isAdmin = false, inline = false, gameContainerRef }: SoundSettingsModalProps) {
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
  
  const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  const isMobileDevice = typeof window !== 'undefined' && 
    (window.innerWidth < 1024 || window.innerHeight < 1024);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 100000,
  };

  const [enabled, setEnabled] = useState(audioService.enabled);
  const [bgmVol, setBgmVol] = useState(Math.round(audioService.bgmVolume * 100));
  const [sfxVol, setSfxVol] = useState(Math.round(audioService.sfxVolume * 100));
  const [equalizer, setEqualizer] = useState<SoundEqualizer>(audioService.sfxEqualizer);

  const dragControls = useDragControls();
  const dragBoundsRef = React.useRef<HTMLDivElement>(null);
  const lastPreviewRef = React.useRef<{ [key: string]: number }>({});
  const currentPreviewTypeRef = React.useRef<SoundType | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEnabled(audioService.enabled);
      setBgmVol(Math.round(audioService.bgmVolume * 100));
      setSfxVol(Math.round(audioService.sfxVolume * 100));
      setEqualizer(audioService.sfxEqualizer);
      currentPreviewTypeRef.current = null;
    }
    return () => {
      if (!audioService.roomActive) {
        audioService.stopAll(false);
      } else {
        audioService.stopAllSfx();
      }
      currentPreviewTypeRef.current = null;
    };
  }, [isOpen]);

  const handleClose = () => {
    if (!audioService.roomActive) {
      audioService.stopAll(false);
    } else {
      audioService.stopAllSfx();
      // If we are in-game and audio is enabled, resume background music
      if (audioService.enabled) {
        audioService.playBgm();
      }
    }
    currentPreviewTypeRef.current = null;
    onClose();
  };

  if (!isOpen) return null;

  const previewAudio = (type: SoundType) => {
    if (!enabled) return;

    if (type === 'bgm') {
      audioService.playBgm();
      currentPreviewTypeRef.current = 'bgm';
    } else {
      // The user wants BGM to stop playing when adjusting sound effects: "以及调节音效时应该停止播放背景音乐"
      audioService.stopBgm(false);
      audioService.play(type, false, true);
      currentPreviewTypeRef.current = type;
    }
  };

  const handleToggle = () => {
    const nextEnabled = !enabled;
    audioService.enabled = nextEnabled;
    setEnabled(nextEnabled);
    if (nextEnabled) {
      audioService.play('click');
    }
  };

  const handleBgmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setBgmVol(val);
    audioService.bgmVolume = val / 100;
    previewAudio('bgm');
  };

  const handleSfxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSfxVol(val);
    audioService.sfxVolume = val / 100;
    previewAudio('resource');
  };

  const handleEqChange = (key: keyof SoundEqualizer, val: number) => {
    const newEq = { ...equalizer, [key]: val };
    setEqualizer(newEq);
    audioService.setEqualizer(newEq);
    socketService.updateSoundSettings(newEq);
    previewAudio(key as SoundType);

    const token = localStorage.getItem('catan_auth_token');
    if (token) {
      fetch('/api/admin/sound-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ soundSettings: newEq })
      }).catch(() => {});
    }
  };

  const handleResetEq = () => {
    const defaultEq = { ...DEFAULT_EQUALIZER };
    setEqualizer(defaultEq);
    audioService.setEqualizer(defaultEq);
    socketService.updateSoundSettings(defaultEq);

    const token = localStorage.getItem('catan_auth_token');
    if (token) {
      fetch('/api/admin/sound-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ soundSettings: defaultEq })
      }).catch(() => {});
    }
  };

  const mainContent = (
    <div className="space-y-4">
      {/* Main Switch */}
      <div className="flex items-center justify-between p-3 bg-slate-50/50 border border-slate-100 rounded-xl">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg transition-colors ${enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
            {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-800">全部声音</h3>
            <p className="text-[10px] text-slate-400">开启或关闭游戏内所有音效</p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          className={`w-10 h-6 rounded-full p-1 transition-colors duration-300 relative cursor-pointer ${
            enabled ? 'bg-indigo-600' : 'bg-slate-200'
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-300 absolute top-1 ${
              enabled ? 'left-5' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* BGM Slider */}
            {isIOS && (
        <div className="text-[9px] sm:text-[10px] text-orange-500 bg-orange-50 p-2 rounded-lg mb-2 text-left leading-relaxed">
          <span className="font-bold">苹果设备音量：</span><br/>音效可通过滑块调节；背景音乐音量可能受系统限制，请配合手机侧边的<b>实体音量按键</b>调整。
        </div>
      )}
      <div className={`space-y-1.5 transition-all duration-300 ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Music size={13} className="text-indigo-500" /> 背景音乐 (BGM)
          </span>
          <span className="text-[11px] font-mono font-bold text-slate-400">{bgmVol}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={bgmVol}
          onChange={handleBgmChange}
          disabled={!enabled}
          className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
      </div>

      {/* SFX Slider */}
      <div className={`space-y-1.5 transition-all duration-300 ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Volume2 size={13} className="text-indigo-500" /> 主音效音量 (SFX)
          </span>
          <span className="text-[11px] font-mono font-bold text-slate-400">{sfxVol}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={sfxVol}
          onChange={handleSfxChange}
          disabled={!enabled}
          className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
      </div>

      {/* ADMIN EQUALIZER SECTION */}
      {isAdmin && (
        <div className="pt-3.5 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sliders size={13} className="text-amber-500 animate-pulse" /> 音效均衡器
              </h3>
              <p className="text-[9px] text-slate-400 mt-0.5">管理员可调节单项音效比例，实时对所有玩家生效</p>
            </div>
            <button
              onClick={handleResetEq}
              className="text-[10px] font-bold text-amber-600 hover:text-amber-700 hover:bg-amber-50 border border-amber-200/40 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              title="重置所有音效为 100%"
            >
              <RotateCcw size={10} /> 重置
            </button>
          </div>

          <div className="space-y-2.5 bg-slate-50/30 border border-slate-100/50 p-3 rounded-xl max-h-[280px] sm:max-h-[320px] overflow-y-auto no-scrollbar">
            {SFX_ITEMS.map((item) => {
              const val = equalizer[item.key] ?? 100;
              return (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <span>{item.icon}</span> {item.label}
                    </span>
                    <span className="font-mono font-bold text-indigo-600">{val}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    value={val}
                    onChange={(e) => handleEqChange(item.key, Number(e.target.value))}
                    disabled={!enabled}
                    className="w-full h-1 bg-slate-200/60 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 select-none cursor-default">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
           声音设置
           {isAdmin && (
              <span className="ml-auto text-[10px] font-bold bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded-full flex items-center gap-1 border border-amber-200/50">
                <Shield size={10} /> 管理员权限
              </span>
           )}
        </h3>
        {mainContent}
      </div>
    );
  }

  const contentStyle: React.CSSProperties = {};

  return (
    <div 
      ref={dragBoundsRef}
      style={containerStyle}
      className={`bg-black/50 backdrop-blur-sm pointer-events-auto flex ${isMobileDevice ? 'items-stretch p-0' : 'items-center justify-center md:p-4'}`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}>
      
      {/* Backdrop tap to close */}
      <div 
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
        onTouchEnd={(e) => {
          if (e.target === e.currentTarget) {
            e.stopPropagation();
            handleClose();
          }
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
        className="absolute inset-0 bg-transparent cursor-pointer z-10"
      />

      <motion.div
        drag={typeof window !== 'undefined' && window.innerWidth >= 640 && !isMobileDevice}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={dragBoundsRef}
        dragElastic={0}
        dragMomentum={false}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        style={contentStyle}
        className={
          isMobileDevice
            ? 'bg-white w-full h-full rounded-none overflow-hidden flex flex-col pointer-events-auto shadow-none select-none cursor-default relative z-20'
            : `bg-white border-none sm:border border-slate-200 rounded-none sm:rounded-2xl w-full ${
                isAdmin ? 'max-w-full sm:max-w-[370px]' : 'max-w-full sm:max-w-[330px]'
              } h-full sm:h-auto sm:max-h-[90%] overflow-hidden flex flex-col pointer-events-auto shadow-2xl select-none cursor-default relative z-20`
        }
      >
        {/* Standard drag handle bar & Header */}
        <div 
          onPointerDown={(e) => typeof window !== 'undefined' && window.innerWidth >= 640 && dragControls.start(e)}
          className="p-3 sm:p-3.5 px-4 sm:px-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 sm:cursor-grab active:sm:cursor-grabbing hover:bg-slate-100/50 transition-colors select-none"
        >
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
              声音设置
              {isAdmin && (
                <span className="text-[9px] font-bold bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 border border-amber-200/50">
                  <Shield size={10} /> 管理员
                </span>
              )}
            </h2>
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">调整背景音乐和音效音量</p>
          </div>
          <button 
            onClick={handleClose}
            className="w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors pointer-events-auto cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-4 space-y-4 flex-1 min-h-0 overflow-y-auto no-scrollbar pointer-events-auto">
          {mainContent}
        </div>
      </motion.div>
    </div>
  );
}
