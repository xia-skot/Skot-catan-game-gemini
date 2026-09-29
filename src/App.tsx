import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect, startTransition } from 'react';
import { Stage, Layer, RegularPolygon, Text, Group, Circle, Line, Path, Image, Rect } from 'react-konva';
import { Html } from 'react-konva-utils';
import Konva from 'konva';

// Monkey-patch Konva.Stage.prototype.setPointersPositions to correctly transform coordinates when CSS rotated in portrait mode
const origSetPointersPositions = Konva.Stage.prototype.setPointersPositions;

Konva.Stage.prototype.setPointersPositions = function (evt: any) {
  if (!evt) {
    origSetPointersPositions.call(this, evt);
    return;
  }

  const content = this.content;
  if (!content) {
    origSetPointersPositions.call(this, evt);
    return;
  }

  const rotatedContainer = content.closest('[data-portrait-rotated="true"]');
  if (!rotatedContainer) {
    origSetPointersPositions.call(this, evt);
    return;
  }

  const rect = content.getBoundingClientRect();
  const scaleX = rect.height / content.clientWidth || 1;
  const scaleY = rect.width / content.clientHeight || 1;

  const getRotatedPos = (clientX: number, clientY: number) => {
    return {
      x: (clientY - rect.top) / scaleX,
      y: (rect.right - clientX) / scaleY,
    };
  };

  if (evt.touches !== undefined) {
    this._pointerPositions = [];
    this._changedPointerPositions = [];

    Array.prototype.forEach.call(evt.touches, (touch: any) => {
      const pos = getRotatedPos(touch.clientX, touch.clientY);
      this._pointerPositions.push({
        id: touch.identifier,
        x: pos.x,
        y: pos.y,
      });
    });

    Array.prototype.forEach.call(evt.changedTouches || evt.touches, (touch: any) => {
      const pos = getRotatedPos(touch.clientX, touch.clientY);
      this._changedPointerPositions.push({
        id: touch.identifier,
        x: pos.x,
        y: pos.y,
      });
    });

    if (this._pointerPositions.length > 0) {
      this.pointerPos = this._pointerPositions[0];
    }
  } else {
    const pos = getRotatedPos(evt.clientX, evt.clientY);
    this.pointerPos = pos;
    const firstId = (Konva.Util as any)._getFirstPointerId(evt);
    this._pointerPositions = [{ x: pos.x, y: pos.y, id: firstId }];
    this._changedPointerPositions = [{ x: pos.x, y: pos.y, id: firstId }];
  }
};

// Global patch to fix native touch scrolling when the UI is CSS rotated 90deg
if (typeof window !== 'undefined') {
  let activeScrollTarget = null;
  let startX = 0;
  let startY = 0;
  let scrollTopStart = 0;
  let scrollLeftStart = 0;

  const getScrollableParent = (node: any): HTMLElement | null => {
    if (node == null || !(node instanceof HTMLElement)) {
      return null;
    }
    if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
      const style = window.getComputedStyle(node);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowX === 'auto' || style.overflowX === 'scroll') {
        return node;
      }
    }
    return getScrollableParent(node.parentNode);
  };

  const isAppleDevice = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    
    // Check if we are inside a game container
    const gameContainer = (e.target as Element).closest && (e.target as Element).closest('[data-portrait-rotated]');
    if (!gameContainer) return;

    activeScrollTarget = getScrollableParent(e.target as Element);
    if (activeScrollTarget) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      scrollTopStart = activeScrollTarget.scrollTop;
      scrollLeftStart = activeScrollTarget.scrollLeft;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1 || !activeScrollTarget) return;

    const gameContainer = (e.target as Element).closest && (e.target as Element).closest('[data-portrait-rotated]');
    if (!gameContainer) return;
    
    const isRotated = gameContainer.getAttribute('data-portrait-rotated') === 'true';
    
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    const style = window.getComputedStyle(activeScrollTarget);
    let hasScrolled = false;
    
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      const maxScrollTop = activeScrollTarget.scrollHeight - activeScrollTarget.clientHeight;
      if (maxScrollTop > 0) {
        let newScrollTop = 0;
        if (isRotated) {
          // Both Apple and Android share the same direction
          newScrollTop = scrollTopStart + dx;
        } else {
          newScrollTop = scrollTopStart - dy;
        }
        activeScrollTarget.scrollTop = Math.max(0, Math.min(maxScrollTop, newScrollTop));
        hasScrolled = true;
      }
    }
    
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
      const maxScrollLeft = activeScrollTarget.scrollWidth - activeScrollTarget.clientWidth;
      if (maxScrollLeft > 0) {
        let newScrollLeft = 0;
        if (isRotated) {
          // Horizontal scrolling direction is different on Apple devices
          newScrollLeft = isAppleDevice ? (scrollLeftStart + dy) : (scrollLeftStart - dy);
        } else {
          newScrollLeft = scrollLeftStart - dx;
        }
        activeScrollTarget.scrollLeft = Math.max(0, Math.min(maxScrollLeft, newScrollLeft));
        hasScrolled = true;
      }
    }
    
    if (hasScrolled && e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });
  
  window.addEventListener('touchend', () => {
    activeScrollTarget = null;
  });
  window.addEventListener('touchcancel', () => {
    activeScrollTarget = null;
  });
}

import { useCatanGame, getHexesForEdge, getHexesForVertex } from './useCatanGame';
import { HexType, ResourceType, DevCardType, MapType, GameState } from './types';
import { HEX_RESOURCES, RESOURCE_NAMES, HEX_NAMES, RESOURCE_COLORS, PLAYER_COLORS, COSTS } from './constants';
import { GameOverModal } from './components/GameOverModal';
import { motion, AnimatePresence, useDragControls, MotionConfig } from 'motion/react';
import { audioService } from './audioService';
import { preloadAllAssets } from './assetPreloader';
import { SailingTransition, SailingScene, LoadingDots } from './components/SailingScene';
import { getSetupSlots, getRoomController } from '../shared/roomSetup';
import { BOT_LEVELS, BOT_TURN_LIMIT_MS, BOT_TRADE_WAIT_MS, normalizeBotDifficulty } from '../shared/botDifficulty';
import { acceptBotTrade, botLevel, canPay, chooseBotBankTrade, chooseBotBlockade, chooseBotDevCard, chooseBotDiscard, chooseBotGoal, chooseBotMonopoly, chooseBotResources, chooseSetupVillage, planBotBuilds, proposeBotTrade, publicScore, resources as botResources } from './botStrategy';
import { AssetGate } from './components/AssetGate';
import { SmartImage } from './components/SmartImage';
import { useLobbySwipe } from './useLobbySwipe';
import { MESSAGE_READ_EVENT, readMessageIds } from './messageReadState';
import { hasBackHandler, isInstalledDisplay, requestAppBack, runTopBackHandler, shouldSuppressGestureClick, suppressGestureClick, useBackHandler } from './navigation';
import { 
  Dices, 
  User, 
  Ship as ShipIcon, 
  Home, 
  Map as MapIcon, 
  ChevronRight,
  ChevronDown,
  Trophy,
  Castle,
  Hammer,
  Repeat,
  Info,
  Settings,
  X,
  BookOpen,
  Bell,
  Users,
  Play,
  Eye,
  AlertTriangle,
  Bot,
  Check,
  Copy,
  LogOut,
  Trash2,
  RotateCw,
  RotateCcw,
  RefreshCw,
  Lock,
  Loader2,
  Swords,
  Clock,
  LogOut as LogOutIcon,
  Bug,
  Smartphone,
  MapPin,
  Volume2
} from 'lucide-react';
import { RotatedScroll } from './components/RotatedScroll';
import { ResourceSelector } from './components/ResourceSelector';
import { GoldSelectionPanel } from './components/GoldSelectionPanel';
import { MapAlbumModal } from './components/MapAlbumModal';
import { MapGeneratorModal } from './components/MapGeneratorModal';
import { SaveMapConfirmModal } from './components/SaveMapConfirmModal';
import { LoginScreen } from './components/LoginScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { UserProfileModal } from './components/UserProfileModal';
import { RulesModal } from './components/RulesModal';
import { SoundSettingsModal } from './components/SoundSettingsModal';
import { GameRoomsTab } from './components/GameRoomsTab';
import { PwaGuideModal } from './components/PwaGuideModal';
import { socketService, RoomState } from './socketService';
import { safeFetchJson } from './fetchUtils';
import { 
  FOREST_IMG, FIELDS_IMG, PASTURE_IMG, Desert_IMG, Mountains_IMG, 
  HILLS_IMG, GOLD_IMG, SEA_HEX_IMG, ROBBER_IMG, FOOTPRINT_IMG, ANCHOR_IMG, PIRATE_SHIP_IMG,
  DEV_CARD_ICON, RES_CARD_ICON, ROAD_ICON, MAP_ALBUM_ICON,
  RESOURCE_ICONS, SAILING_BOAT_IMG, CATAN_LOGO_IMG, ALL_GAME_IMAGES,
  getImageUrl, getImageCandidates, getDevCardImg
} from './images';
import { getCachedImageElement, loadGameImage, useGameImage } from './imageManager';

export const SmartImg = SmartImage;

const ResourceIcon = ({ type, className = "w-4 h-4" }: { type: ResourceType, className?: string }) => (
  <SmartImg 
    src={RESOURCE_ICONS[type]} 
    className={`${className} object-contain inline-block align-middle`} 
    alt={RESOURCE_NAMES[type]} 
  />
);

const HEX_RADIUS = 40;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const HEX_HEIGHT = 2 * HEX_RADIUS;


const PortIcon = ({ type, x, y, flip }: { type: string, x: number, y: number, flip: boolean }) => {
  const resourceType = type as ResourceType;
  const iconSrc = type !== '3:1' ? (RESOURCE_ICONS[resourceType] || '') : '';
  const { image } = useGameImage(iconSrc);

  if (type === '3:1') {
    return (
      <Path
        x={x}
        y={y}
        data="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
        fill="#FFA500"
        scale={{ x: 0.55, y: 0.55 }}
        offsetX={12}
        offsetY={12}
        rotation={flip ? 180 : 0}
      />
    );
  }

  if (!image) return null;

  return (
    <Image
      image={image}
      x={x}
      y={y}
      width={18}
      height={18}
      offsetX={9}
      offsetY={9}
      rotation={flip ? 180 : 0}
    />
  );
};

const PortraitOverlay = () => (
  <div className="absolute inset-0 z-[9999] bg-stone-900/80 flex flex-col items-center justify-center text-white px-8 text-center animate-in fade-in duration-500 pointer-events-auto">
    <motion.div
      animate={{ rotate: [0, 90, 90, 0] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", times: [0, 0.4, 0.6, 1] }}
      className="mb-8 p-6 bg-indigo-500/20 rounded-full border border-indigo-500/30 shadow-2xl shadow-indigo-500/20"
    >
      <RotateCw size={64} className="text-indigo-400" />
    </motion.div>
    <h2 className="text-2xl sm:text-3xl font-serif font-black italic mb-4 tracking-tight leading-none">请旋转手机屏幕</h2>
    <p className="text-[11px] sm:text-sm opacity-100 max-w-[320px] sm:max-w-none whitespace-nowrap leading-relaxed font-black text-white drop-shadow-md">
      为了获得最佳游戏体验，推荐使用横屏模式进行游戏。
    </p>
    <p className="text-[10px] sm:text-xs opacity-70 font-bold text-white mt-1">
      (确保手机的“自动旋转”设置已打开)
    </p>
    <div className="mt-12 flex flex-col items-center gap-2 opacity-30">
      <div className="w-1 h-12 bg-white/20 rounded-full overflow-hidden">
        <motion.div 
          animate={{ y: [0, 48, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-full h-1/2 bg-indigo-400" 
        />
      </div>
      <span className="text-[10px] uppercase font-black tracking-widest leading-none">LANDSCAPE ONLY</span>
    </div>
  </div>
);

const Port = ({ port, cx, cy, nx, ny }: { port: any, cx: number, cy: number, nx: number, ny: number }) => {
  const distance = 18; // Distance from edge to pill center
  const angleRad = Math.atan2(ny, nx);
  let rotation = angleRad * 180 / Math.PI + 90;
  rotation = (rotation + 360) % 360;
  
  // Flip the content if it would be upside down
  const flip = rotation > 90 && rotation < 270;

  return (
    <Group x={cx} y={cy} rotation={rotation} listening={false}>
      {/* Pier / Dock lines */}
      <Line
        points={[-4, 0, -4, -distance]}
        stroke="#8B5A2B"
        strokeWidth={3}
        perfectDrawEnabled={false}
      />
      <Line
        points={[4, 0, 4, -distance]}
        stroke="#8B5A2B"
        strokeWidth={3}
        perfectDrawEnabled={false}
      />

      {/* Pill Group */}
      <Group y={-distance} rotation={0}>
        {/* Pill Background */}
        <Rect
          x={-22}
          y={-11}
          width={44}
          height={22}
          cornerRadius={11}
          fill="#FFFDF7"
          stroke="#C8A97E"
          strokeWidth={2}
          shadowColor="rgba(0,0,0,0.15)"
          shadowBlur={4}
          shadowOffsetY={2}
        />

        {/* Icon */}
        <PortIcon type={port.type} x={flip ? 11 : -11} y={0} flip={flip} />

        {/* Text */}
        <Text
          text={port.type === '3:1' ? '3:1' : '2:1'}
          fontSize={12}
          fontStyle="bold"
          fill="#5C4033"
          x={flip ? -9 : 9}
          y={0}
          width={24}
          height={12}
          offsetX={12}
          offsetY={6}
          align="center"
          verticalAlign="middle"
          fontFamily="Inter"
          rotation={flip ? 180 : 0}
        />
      </Group>
    </Group>
  );
};




const TokenPulse = () => {
  const circle = useRef<Konva.Circle>(null);
  useEffect(() => {
    const node = circle.current;
    if (!node) return;
    const animation = new Konva.Animation(frame => {
      const pulse = (frame!.time % 1200) / 1200;
      node.setAttrs({ radius: 18 + pulse * 12, strokeWidth: 4 * (1 - pulse), opacity: 1 - pulse });
    }, node.getLayer());
    animation.start();
    return () => { animation.stop(); };
  }, []);
  return <Circle ref={circle} radius={18} stroke="#EF4444" strokeWidth={4} listening={false} perfectDrawEnabled={false} />;
};

const RobberToken = ({ x, y, isPhaseRobber }: { x: number, y: number, isPhaseRobber: boolean }) => {
  const { image: img } = useGameImage(ROBBER_IMG);

  return (
    <Group x={x} y={y} listening={false}>
      {isPhaseRobber && <TokenPulse />}
      {img ? (
        <Image 
          image={img} 
          width={36} 
          height={36} 
          x={-18} 
          y={-18} 
          shadowColor="black"
          shadowBlur={8}
          shadowOpacity={0.6}
          shadowOffsetX={2}
          shadowOffsetY={4}
          perfectDrawEnabled={false}
        />
      ) : (
        <Text text="👤" fontSize={24} offsetX={12} offsetY={12} />
      )}
    </Group>
  );
};

const FootprintToken = () => {
  const { image: img } = useGameImage(FOOTPRINT_IMG);

  if (img) {
    return (
      <Image 
        image={img} 
        width={36} 
        height={36} 
        x={-18} 
        y={-18} 
        shadowColor="black"
        shadowBlur={6}
        shadowOpacity={0.4}
        perfectDrawEnabled={false}
      />
    );
  }

  return (
    <Group offsetX={12} offsetY={12} scaleX={1.3} scaleY={1.3}>
      <Path data="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" fill="rgba(255,255,255,0.9)" stroke="#000000" strokeWidth={1} />
      <Path data="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" fill="rgba(255,255,255,0.9)" stroke="#000000" strokeWidth={1} />
      <Path data="M16 17h4" stroke="#000000" strokeWidth={1.5} />
      <Path data="M4 13h4" stroke="#000000" strokeWidth={1.5} />
    </Group>
  );
};

const AnchorToken = () => {
  const { image: img } = useGameImage(ANCHOR_IMG);

  if (img) {
    return (
      <Image 
        image={img} 
        width={36} 
        height={36} 
        x={-18} 
        y={-18} 
        shadowColor="black"
        shadowBlur={6}
        shadowOpacity={0.4}
        perfectDrawEnabled={false}
      />
    );
  }

  return (
    <Group offsetX={12} offsetY={12} scaleX={1.3} scaleY={1.3}>
      <Path data="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" fill="rgba(255,255,255,0.9)" stroke="#000000" strokeWidth={1} />
      <Path data="M5 12h14M12 15v7M8 22h8" stroke="#000000" strokeWidth={2} strokeLineCap="round" />
    </Group>
  );
};

const PirateToken = ({ x, y, isPhaseRobber }: { x: number, y: number, isPhaseRobber: boolean }) => {
  const { image: img } = useGameImage(PIRATE_SHIP_IMG);

  return (
    <Group x={x} y={y} listening={false}>
      {isPhaseRobber && <TokenPulse />}
      {img ? (
        <Image 
          image={img} 
          width={36} 
          height={36} 
          x={-18} 
          y={-18} 
          shadowColor="black"
          shadowBlur={8}
          shadowOpacity={0.6}
          shadowOffsetX={2}
          shadowOffsetY={4}
          perfectDrawEnabled={false}
        />
      ) : (
        <Text text="🏴‍☠️" fontSize={24} offsetX={12} offsetY={12} />
      )}
    </Group>
  );
};

const seededRandom = (seed: number) => {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

function SailingLoadingScreen({ onComplete, text = '正在驶入海域', loop = false, onCancel, loadAssets = true }: { onComplete: () => void; text?: string; loop?: boolean; onCancel?: () => void; loadAssets?: boolean }) {
  const screen = <SailingTransition onComplete={onComplete} loop={loop} text={text} />;
  return loadAssets ? <AssetGate onCancel={onCancel || onComplete}>{screen}</AssetGate> : screen;
}

export default function App({ onAccountReady }: { onAccountReady?: () => void }) {
  const [showSoundModal, setShowSoundModal] = useState(false);
  const robberDragControls = useDragControls();
  const playerTradeDragControls = useDragControls();
  const devCardDragControls = useDragControls();
  const bankTradeDragControls = useDragControls();
  const stealDragControls = useDragControls();
  const activeTradeDragControls = useDragControls();
  const exitOptionsDragControls = useDragControls();
  const dissolveRoomDragControls = useDragControls();

  useEffect(() => {
    const unlockAudio = () => { void audioService.unlockAll(); };
    const handleGlobalClick = (e: MouseEvent) => {
      unlockAudio();
      const target = e.target as HTMLElement;
      if (target.closest('.no-click-sound')) return;
      // Check if it's a button or inside a button
      if (target.closest('button') || target.closest('[role="button"]') || target.closest('.cursor-pointer')) {
        audioService.play('click');
      }
    };
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('touchstart', unlockAudio, { passive: true });
    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    return () => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('pointerdown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    const fetchSoundSettings = async () => {
      try {
        const res = await fetch('/api/sound-settings');
        if (res.ok) {
          const ct = res.headers.get('content-type');
          if (ct && ct.includes('application/json')) {
            const data = await res.json();
            if (data?.soundSettings) {
              audioService.setEqualizer(data.soundSettings);
            }
          }
        }
      } catch (err) {
        console.warn('[App] Failed to fetch sound settings:', err);
      }
    };

    fetchSoundSettings();

    socketService.onSoundSettingsUpdated((settings) => {
      if (settings && typeof settings === 'object') {
        audioService.setEqualizer(settings);
      }
    });
  }, []);

  const [devCardOverlay, setDevCardOverlay] = useState<{ playerName: string, actionStr: string } | null>(null);
  const [confirmDevCard, setConfirmDevCard] = useState<DevCardType | null>(null);
  
  
  const { 
    gameState, 
    syncGameState,
    initGame, 
    toggleBot,
    rollDice, 
    resolveDiceRoll,
    resolveInitialRoll,
    nextTurn, 
    buildRoad, 
    buildShip,
    buildSettlement, 
    upgradeToCity, 
    tradeWithBank,
    buyDevCard,
    playDevCard,
    cancelDevCard,
    resolveYearOfPlenty,
    resolveMonopoly,
    moveRobber,
    movePirate,
    selectStealTarget,
    stealResource,
    doSteal,
    selectGoldResource,
    addResources,
    generateMapTopology,
    distributeResources,
    discardCards,
    setPlayerResource,
    setDice,
    setBuildModeSync,
    proposeTrade,
    reactToTrade,
    cancelTrade,
    finalizeTrade,
    resetGame
  } = useCatanGame();

  const [hasResolvedGameOver, setHasResolvedGameOver] = useState(false);

  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [isJoinSpectator, setIsJoinSpectator] = useState(() => localStorage.getItem('catan_is_spectator') === 'true');
  const isSpectator = useMemo(() => {
    if (isJoinSpectator) return true;
    if (gameState && gameState.players && gameState.players.length > 0) {
      const isPlayerInGame = gameState.players.some(p => p.sessionId === socketService.playerId);
      if (!isPlayerInGame) return true;
    }
    if (roomState) {
      const isPlayerInRoom = roomState.players?.some(p => p.id === socketService.playerId);
      if (!isPlayerInRoom) return true;
      if (roomState.spectators?.some(s => s.id === socketService.playerId)) return true;
    }
    return false;
  }, [gameState, roomState, isJoinSpectator, socketService.playerId]);

  // Dice rolling animation states
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [rollingDiceValues, setRollingDiceValues] = useState<[number, number]>([1, 1]);
  const [diceAnimId, setDiceAnimId] = useState<number>(0);

  const prevDiceRef = useRef<[number, number] | null>(null);
  const prevHasRolledRef = useRef<boolean>(false);

  // Freeze resource card updates during dice roll animation
  const [displayedResourcesMap, setDisplayedResourcesMap] = useState<Record<number, Record<ResourceType, number>>>({});
  const prevPlayerResourcesRef = useRef<Record<number, Record<ResourceType, number>>>({});

  const prevPhaseRef = useRef<string>("");
  const prevBuildCountRef = useRef<number>(-1);
  
  useEffect(() => {
    if (!gameState) return;
    
    // Pirate sound logic
    if (gameState.phase !== prevPhaseRef.current) {
      const enteredPirateMode = (gameState.phase === 'robber' || gameState.phase === 'discard') && prevPhaseRef.current !== 'discard' && prevPhaseRef.current !== 'robber';
      const leftPirateMode = (prevPhaseRef.current === 'robber' || prevPhaseRef.current === 'discard') && gameState.phase !== 'discard' && gameState.phase !== 'robber';

      if (enteredPirateMode) {
        audioService.play('pirate', true); // loop
      } else if (leftPirateMode) {
        audioService.stop('pirate');
      }
      prevPhaseRef.current = gameState.phase;
    }

    // Build sound logic
    const currentBuildCount = (gameState.settlements?.length || 0) + (gameState.settlements?.filter(s => s.isCity).length || 0) + (gameState.roads?.length || 0) + (gameState.ships?.length || 0);
    if (prevBuildCountRef.current !== -1 && currentBuildCount > prevBuildCountRef.current) {
      audioService.play('build');
    }
    prevBuildCountRef.current = currentBuildCount;
    
  }, [gameState]);

  const [diceSum, setDiceSum] = useState<string>("?");
  const controllerRef = useRef<string | null>(null);
  useEffect(() => {
    // If we are currently rolling, always show "?"
    if (isDiceRolling) {
      setDiceSum("?");
      return;
    }

    // Otherwise, show the sum if we have dice values and hasRolled is true
    if (gameState?.dice && gameState.hasRolled && gameState.dice[0] > 0) {
      setDiceSum(String(gameState.dice[0] + gameState.dice[1]));
    } else {
      setDiceSum("?");
    }
  }, [isDiceRolling, gameState?.dice?.[0], gameState?.dice?.[1], gameState?.hasRolled]);

  useEffect(() => {
    if (!gameState) return;
    
    // Always keep the ref updated with the latest state when NOT rolling
    if (!isDiceRolling) {
      const map: Record<number, Record<ResourceType, number>> = {};
      gameState.players.forEach(p => {
        map[p.id] = { ...p.resources };
      });
      prevPlayerResourcesRef.current = map;
      setDisplayedResourcesMap(map);
    } else if (Object.keys(prevPlayerResourcesRef.current).length === 0) {
      // If we just joined and it's already rolling, initialize with current state as fallback
      const map: Record<number, Record<ResourceType, number>> = {};
      gameState.players.forEach(p => {
        map[p.id] = { ...p.resources };
      });
      prevPlayerResourcesRef.current = map;
      setDisplayedResourcesMap(map);
    }
  }, [gameState, isDiceRolling]);

  const rollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!gameState) return;

    const hasRolled = gameState.hasRolled;
    const currentDice = gameState.dice;

    const wasFalseNowTrue = !prevHasRolledRef.current && hasRolled;
    const diceChanged = prevDiceRef.current && 
      (prevDiceRef.current[0] !== currentDice[0] || prevDiceRef.current[1] !== currentDice[1]) && 
      (currentDice[0] > 0 && currentDice[1] > 0);

    // Update refs immediately so subsequent re-renders don't keep triggered state
    prevHasRolledRef.current = hasRolled;
    prevDiceRef.current = currentDice ? [...currentDice] : null;

    console.log('Dice useEffect triggered', { wasFalseNowTrue, diceChanged, phase: gameState.phase, hasRolled, currentDice: currentDice });
    if (wasFalseNowTrue || diceChanged) {
      // Freeze resources to pre-roll snapshot immediately
      if (Object.keys(prevPlayerResourcesRef.current).length > 0) {
        setDisplayedResourcesMap(prevPlayerResourcesRef.current);
      }
      setIsDiceRolling(true);
      audioService.play('dice');
      const newAnimId = Date.now();
      setDiceAnimId(newAnimId);
      
      if (rollingTimerRef.current) {
        clearTimeout(rollingTimerRef.current);
      }

      rollingTimerRef.current = setTimeout(() => {
        setIsDiceRolling(false);
        audioService.stop('dice');
        rollingTimerRef.current = null;
        // Only active player (who is not a bot in their own client, or the host handling bots) 
        // should resolve the dice roll to push to others. 
        // Spectators should just wait for the sync.
        if (!isSpectator) {
          // Fix: only the active player (or the host if the active player is a bot) should resolve the dice.
          const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myPlayerIndex;
          const isActivePlayerBot = gameState.players[gameState.currentPlayerIndex]?.isBot;
          const isTrueHost = controllerRef.current === socketService.playerId;
          
          if (socketService.isConnected && ((!isActivePlayerBot && isMyTurn) || (isActivePlayerBot && isTrueHost))) {
            resolveDiceRoll();
          }
        }
      }, 2500); // 2.5 seconds animation duration
    }
  }, [gameState?.hasRolled, gameState?.dice?.[0], gameState?.dice?.[1], gameState?.phase, isSpectator, isDiceRolling, resolveDiceRoll]);

  useEffect(() => {
    return () => {
      if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);
    };
  }, []);

  const handleReturnToLobby = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    // Instantly interrupt and stop all audio/SFX
    audioService.stopAllSfx();
    setShowSailingScreen(false);
    
    const roomId = roomState?.roomId || inputRoomId;
    let clearRoom = false;
    let lockRoom = false;
    let keepGameActive = false;
    
    // Determine the state based on the current context
    if (gameState?.winnerId !== null && gameState?.winnerId !== undefined) {
      // Game ended: Refresh room code
      clearRoom = true;
      socketService.resetGame(roomId);
    } else if (isSpectator || isJoinSpectator) {
      // Spectator leaves: Refresh room code UNLESS they have a real room locked
      const stickyRoomId = localStorage.getItem('catan_active_room');
      const wasLocked = localStorage.getItem('catan_has_created_room') === 'true';
      
      // If they had a locked room before spectating (and it wasn't the one they spectated), keep it
      if (wasLocked && stickyRoomId && stickyRoomId !== roomId) {
        clearRoom = false;
        lockRoom = true;
        keepGameActive = false;
      } else {
        clearRoom = true;
      }
    } else if (gameStarted) {
      // Mid-game player: Keep room code and LOCK it
      clearRoom = false;
      lockRoom = true;
      keepGameActive = true;
    } else if (isJoinedLobby) {
      // In lobby/matching interface: Keep room code but DO NOT lock it
      clearRoom = false;
      lockRoom = false;
      keepGameActive = false;
    } else {
      // Default: Refresh room code
      clearRoom = true;
    }
    
    if (clearRoom) {
      localStorage.removeItem('catan_active_room');
      localStorage.removeItem('catan_has_created_room');
      localStorage.removeItem('catan_game_active');
      localStorage.removeItem('catan_map_preview_seed');
      setIsRoomLocked(false);
      setInputRoomId(Math.floor(100000 + Math.random() * 900000).toString());
      
      try {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('room');
        window.history.replaceState(window.history.state, '', newUrl.pathname);
      } catch (err) {}
    } else {
      // Keep existing room code
      setInputRoomId(roomId);
      localStorage.setItem('catan_active_room', roomId);
      localStorage.setItem('catan_has_created_room', lockRoom ? 'true' : 'false');
      setIsRoomLocked(lockRoom);
      
      if (keepGameActive) {
        localStorage.setItem('catan_game_active', 'true');
      } else {
        localStorage.removeItem('catan_game_active');
      }
      
      try {
        const newUrl = new URL(window.location.href);
        if (lockRoom) {
          newUrl.searchParams.set('room', roomId);
        } else {
          newUrl.searchParams.delete('room');
        }
        window.history.replaceState(window.history.state, '', newUrl.pathname + newUrl.search);
      } catch (err) {}
    }
    
    socketService.leaveRoom(roomId);
    
    // Completely wipe React states to return to Main Menu (Main Interface)
    audioService.roomActive = false;
    localStorage.removeItem('catan_is_spectator');
    setIsJoinSpectator(false);
    setRoomState(null);
    setGameStarted(false);
    setShowGameOver(false);
    setHasResolvedGameOver(false);
    setIsJoinedLobby(false); // Jump to Main Menu
    setActiveLobbyTab('lobby'); // Force jump to the code input screen (Main Interface)
    setShowSailingScreen(false);
    syncGameState(null as any);
    resetGame();
    audioService.stopAll(true);
    setIsStartingGame(false);
  };

  const handleReturnToMap = () => {
    setShowGameOver(false);
    setHasResolvedGameOver(true);
  };

  const isRemoteUpdateRef = useRef(false);
  const playerBarRef = useRef<HTMLDivElement>(null);
  const mainMapRef = useRef<HTMLDivElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const devCardOverlayRef = useRef<HTMLDivElement>(null);
  
  const [activeLobbyTab, setActiveLobbyTab] = useState<'lobby' | 'rooms' | 'profile' | 'rules'>('lobby');
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  useEffect(() => { if (!isAuthLoading) onAccountReady?.(); }, [isAuthLoading, onAccountReady]);
  const [gameStarted, setGameStarted] = useState(() => {
    return localStorage.getItem('catan_game_active') === 'true';
  });
  const gameStartedRef = useRef(gameStarted);
  useEffect(() => {
    gameStartedRef.current = gameStarted;
  }, [gameStarted]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('catan_auth_token');
      if (token) {
        try {
          const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` }});
          if (res.ok) {
            const ct = res.headers.get('content-type');
            if (ct && ct.includes('application/json')) {
              const data = await res.json();
              if (data && data.user) {
                setCurrentUser(data.user);
                socketService.playerId = data.user.id;
                localStorage.setItem('catan_player_name', data.user.username);
              } else {
                localStorage.removeItem('catan_auth_token');
              }
            } else {
              localStorage.removeItem('catan_auth_token');
            }
          } else {
            console.warn('[App] Auth check status:', res.status);
            if (res.status === 401 || res.status === 403) {
              localStorage.removeItem('catan_auth_token');
            }
          }
        } catch (err) {
          console.warn('[App] Auth check failed:', err);
        }
      }
      setIsAuthLoading(false);
    };
    checkAuth();
  }, []);



  const playerName = currentUser?.username || localStorage.getItem('catan_player_name') || `玩家-${Math.floor(Math.random()*1000)}`;
  
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [hasUnreadPrivateMsgs, setHasUnreadPrivateMsgs] = useState(false);
  const [gameActionToast, setGameActionToast] = useState<string | null>(null);

  const showGameToast = useCallback((msg: string) => {
    setGameActionToast(msg);
    setTimeout(() => {
      setGameActionToast(prev => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setHasUnreadPrivateMsgs(false);
      return;
    }
    let latestMessages: any[] = [];
    const updateUnread = () => {
      const read = readMessageIds(currentUser.username || 'user');
      setHasUnreadPrivateMsgs(latestMessages.some(m => (m.type === 'private' || m.targetUserId) && !read.has(m.id) && m.senderName !== currentUser.username && m.senderId !== currentUser.id));
    };
    const checkUnread = async () => {
      try {
        const token = localStorage.getItem('catan_auth_token');
        const res = await fetch('/api/messages', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await safeFetchJson(res);
          if (data?.messages) {
            latestMessages = data.messages;
            updateUnread();
          }
        }
      } catch (e) {
        // ignore background poll errors
      }
    };

    checkUnread();
    const interval = setInterval(checkUnread, 4000);
    window.addEventListener(MESSAGE_READ_EVENT, updateUnread);
    window.addEventListener('storage', updateUnread);
    return () => {
      clearInterval(interval);
      window.removeEventListener(MESSAGE_READ_EVENT, updateUnread);
      window.removeEventListener('storage', updateUnread);
    };
  }, [currentUser]);
  const [mapPreviewSeed, setMapPreviewSeed] = useState(() => Number(localStorage.getItem('catan_map_preview_seed')) || 40);
  const [inputRoomId, setInputRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const activeRoom = localStorage.getItem('catan_active_room');
    if (params.get('room')) return params.get('room')!;
    if (activeRoom) return activeRoom;
    return Math.floor(100000 + Math.random() * 900000).toString();
  });
  
  const [isRoomLocked, setIsRoomLocked] = useState(() => {
    return !!localStorage.getItem('catan_active_room') && localStorage.getItem('catan_has_created_room') === 'true';
  });
  
  const [isJoinedLobby, setIsJoinedLobby] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const gameActive = localStorage.getItem('catan_game_active') === 'true';
    const activeRoom = localStorage.getItem('catan_active_room');
    
    // Requirement: On refresh, if game was not active, return to main menu
    // If game was active, auto-enter game. If URL has room, auto-enter lobby/game.
    if (params.get('room')) return true;
    return gameActive && !!activeRoom;
  });

  useEffect(() => {
    // We no longer remove catan_active_room here to ensure it's "locked" on the main interface
  }, [isJoinedLobby, activeLobbyTab]);
  const isAutoReconnectingRef = useRef(!!localStorage.getItem('catan_active_room') && localStorage.getItem('catan_has_created_room') === 'true');
  const hasCreatedRoomRef = useRef(localStorage.getItem('catan_has_created_room') === 'true');
  const [spectatorFocusId, setSpectatorFocusId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const myPlayerIndex = useMemo(() => {
    if (!gameState) return -1;
    if (isSpectator) return -1;
    return gameState.players.findIndex(p => p.sessionId === socketService.playerId);
  }, [gameState, isSpectator]);

  const visiblePlayerIndex = useMemo(() => {
    if (isSpectator) {
      if (spectatorFocusId !== null && gameState?.players[spectatorFocusId]) {
        return spectatorFocusId;
      }
      if (gameState && gameState.currentPlayerIndex !== undefined && gameState.currentPlayerIndex !== -1) {
        return gameState.currentPlayerIndex;
      }
    }
    return myPlayerIndex !== -1 ? myPlayerIndex : 0;
  }, [isSpectator, spectatorFocusId, gameState?.players, myPlayerIndex, gameState?.currentPlayerIndex]);

  const visiblePlayer = useMemo(() => {
    if (!gameState) return null;
    return gameState.players[visiblePlayerIndex];
  }, [gameState, visiblePlayerIndex]);

  useEffect(() => {
    socketService.connect();
    
    // Auto-fill room ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      setInputRoomId(roomParam);
    }
    
    socketService.onRoomState((state: any) => {
      if (!state) {
        // If we are currently in an auto-reconnect attempt, don't clear the UI immediately
        // as the join request may still be in flight.
        if (isAutoReconnectingRef.current) {
          return;
        }
        setIsJoinedLobby(false);
        localStorage.removeItem('catan_active_room');
        localStorage.removeItem('catan_game_active');
        return;
      }
      isAutoReconnectingRef.current = false; // Successfully connected/reconnected
      setRoomState(state);
      setPlayerCount(state.settings.playerCount);
      setMapType(state.settings.mapType as MapType);
      setBotConfig(state.settings.botConfig);
      
      // Auto-populate the debug archive save name if the room was loaded from an archive
      if (state.loadedFromSaveName && !debugSaveName) {
        setDebugSaveName(state.loadedFromSaveName);
      }
      
      setIsJoinedLobby(true); // Always set isJoinedLobby when room state is received
      
      if (state.gameState) {
        console.log('[Socket] Game is active, syncing game state');
        isRemoteUpdateRef.current = true;
        syncGameState(state.gameState);
        localStorage.setItem('catan_game_active', 'true');
        
        // Show sailing screen ONLY if player was not already in game
        if (!gameStartedRef.current) {
          setGameStarted(true);
          const asSpec = isSpectator || localStorage.getItem('catan_is_spectator') === 'true';
          setSailingText(asSpec ? "正在驶入海域......" : "重新驶入海域......");
          setShowSailingScreen(true);
        } else {
          setGameStarted(true);
        }
        gameStartedRef.current = true;
      } else {
        localStorage.removeItem('catan_game_active');
        gameStartedRef.current = false;
        setGameStarted(false);
        setShowSailingScreen(false);
      }
    });

    socketService.onGameInit((newState, context) => {
      // Entry metadata stays correct even if a room update arrives later.
      if (context || !gameStartedRef.current) {
        setSailingText(context?.entry === 'resume' ? '重新驶入海域' : '正在驶入海域');
      }
      if (context?.entry === 'start' || !gameStartedRef.current) {
        setShowSailingScreen(true);
      }
      gameStartedRef.current = true;
      isRemoteUpdateRef.current = true;
      syncGameState(newState);
      setGameStarted(true);
      setHasManuallyInteracted(false);
      setIsStartingGame(false);
      localStorage.setItem('catan_game_active', 'true');
    });

    socketService.onGameUpdate((newState) => {
      if (!gameStartedRef.current) {
        setSailingText('重新驶入海域');
        setShowSailingScreen(true);
      }
      gameStartedRef.current = true;
      isRemoteUpdateRef.current = true;
      syncGameState(newState);
      setGameStarted(true); // Always ensure UI switches to game
      setIsStartingGame(false);
      localStorage.setItem('catan_game_active', 'true');
    });

    socketService.onGameReset(() => {
      console.log('Game reset received from server - Cleaning up...');
      
      localStorage.removeItem('catan_active_room');
      localStorage.removeItem('catan_game_active');
      localStorage.removeItem('catan_has_created_room');
      setIsRoomLocked(false);
      setInputRoomId(Math.floor(100000 + Math.random() * 900000).toString());
      setRoomState(prevRoom => {
        const isSelfReset = prevRoom?.hostId === socketService.playerId;
        if (!isSelfReset && prevRoom) {
          setTimeout(() => alert('房间已被房主解散。'), 100);
        }
        return null; // implicitly clears the room state
      });

      // 1. Clear local game state first to prevent re-sync
      syncGameState(null as any);
      audioService.stopAllSfx();
      
      // 3. Reset UI flags
      setGameStarted(false);
      setShowGameOver(false);
      setHasResolvedGameOver(false);
      setIsJoinedLobby(false); // Force back to room search screen
      setActiveLobbyTab('lobby');
      setIsStartingGame(false);
      setShowSailingScreen(false);
      
      // 4. Remove room param from URL
      window.history.replaceState(window.history.state, '', window.location.pathname);
    });

    socketService.onReturnedToLobby(() => {
      console.log('Returned to lobby...');
      syncGameState(null as any);
      setGameStarted(false);
      setShowGameOver(false);
      setHasResolvedGameOver(false);
      setIsStartingGame(false);
      setIsJoinedLobby(false);
      setActiveLobbyTab('lobby');
    });

    socketService.onPlayerKicked((kickedPlayerId: string) => {
       if (kickedPlayerId === socketService.playerId) {
         // Silently return to menu to avoid exiting full screen with alert
          setIsJoinedLobby(false);
          setActiveLobbyTab('lobby');
          setIsRoomLocked(false);
          setRoomState(null);
          syncGameState(null as any);
          setGameStarted(false);
          setShowSailingScreen(false);
          audioService.stopAllSfx();
          localStorage.removeItem('catan_active_room');
          localStorage.removeItem('catan_has_created_room');
          localStorage.removeItem('catan_game_active');
          setInputRoomId(Math.floor(100000 + Math.random() * 900000).toString());
       }
    });

    socketService.onRoomDeleted(() => {
      setIsJoinedLobby(false);
      setActiveLobbyTab('lobby');
      setIsRoomLocked(false);
      setRoomState(null);
      syncGameState(null as any);
      setGameStarted(false);
      setShowSailingScreen(false);
      audioService.stopAllSfx();
      localStorage.removeItem('catan_active_room');
      localStorage.removeItem('catan_has_created_room');
      localStorage.removeItem('catan_game_active');
      setInputRoomId(Math.floor(100000 + Math.random() * 900000).toString());
    });

    return () => {
      socketService.disconnect();
    };
  }, [syncGameState]);

  const currentRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentRoomIdRef.current = roomState?.roomId || inputRoomId;
  }, [roomState?.roomId, inputRoomId]);

  useEffect(() => {
    if (gameState) {
      if (isSpectator) {
        return;
      }
      if (isRemoteUpdateRef.current) {
        isRemoteUpdateRef.current = false;
      } else {
        if (currentRoomIdRef.current) {
          socketService.sendGameState(currentRoomIdRef.current, gameState);
        }
      }
    }
  }, [gameState, isSpectator]);

  // Background check for user's active room to ensure sticky lock even after fresh login
  useEffect(() => {
    if (!currentUser || isAuthLoading) return;
    
    const checkUserRoom = () => {
      // Don't interrupt if we are already in a room or currently in the game view
      if (roomState || gameStarted || isJoinedLobby) return;
      
      socketService.getMyActiveRoom(playerName, (userRoom: any) => {
        if (!userRoom) return;
        if (!isRoomLocked || inputRoomId !== userRoom.roomId) {
          setInputRoomId(userRoom.roomId);
          setIsRoomLocked(true);
          localStorage.setItem('catan_active_room', userRoom.roomId);
          localStorage.setItem('catan_has_created_room', 'true');
        }
      });
    };

    // Run once on load/auth
    checkUserRoom();
    
    // Then periodically
    const interval = setInterval(checkUserRoom, 10000);
    return () => clearInterval(interval);
  }, [currentUser, isAuthLoading, roomState, gameStarted, isJoinedLobby, isRoomLocked, inputRoomId, playerName]);

  useEffect(() => {
    if (isAuthLoading || !currentUser) return;

    // Only run once after auth is resolved
    if (isAutoReconnectingRef.current === false) return; // already processed

    const activeRoom = localStorage.getItem('catan_active_room');
    const wasInGame = localStorage.getItem('catan_game_active') === 'true';
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    
    // Priority: URL > LocalStorage
    const roomIdToJoin = roomFromUrl || activeRoom;

    if (roomIdToJoin) {
      const asSpec = localStorage.getItem('catan_is_spectator') === 'true';
      if (wasInGame || roomFromUrl) {
        // Reconnect directly to game with loading screen
        setSailingText(asSpec ? "正在驶入海域......" : "重新驶入海域......");
        setShowSailingScreen(true);
      }
      // Wait a tiny bit for UI state to settle before joining, so socket uses correct ID
      setTimeout(() => {
        const asSpec = localStorage.getItem('catan_is_spectator') === 'true';
        socketService.joinRoom(roomIdToJoin, playerName, asSpec);
        isAutoReconnectingRef.current = false;
      }, 50);
    } else {
      isAutoReconnectingRef.current = false;
    }
  }, [isAuthLoading, currentUser, playerName]);

  const handleJoinRoom = () => {
    hasCreatedRoomRef.current = true;
    let finalRoomId = inputRoomId.trim();
    if (!finalRoomId || finalRoomId.length < 1) {
      finalRoomId = Math.floor(100000 + Math.random() * 900000).toString();
      setInputRoomId(finalRoomId);
    }
    
    localStorage.setItem('catan_player_name', playerName);
    localStorage.setItem('catan_active_room', finalRoomId);
    localStorage.setItem('catan_has_created_room', 'true');
    setIsRoomLocked(true);
    localStorage.removeItem('catan_is_spectator');
    setIsJoinSpectator(false);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('room', finalRoomId);
    window.history.replaceState(window.history.state, '', newUrl.pathname + newUrl.search);

    socketService.joinRoom(finalRoomId, playerName);
    setIsJoinedLobby(true);
  };

  const handleRestoreGame = (restoredRoomId: string) => {
    setSailingText('重新驶入海域');
    setShowSailingScreen(true);
    setInputRoomId(restoredRoomId);
    setIsRoomLocked(true);
    localStorage.setItem('catan_active_room', restoredRoomId);
    localStorage.setItem('catan_game_active', 'true');
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('room', restoredRoomId);
    window.history.replaceState(window.history.state, '', newUrl.pathname + newUrl.search);
    
    socketService.connect();
    socketService.joinRoom(restoredRoomId, playerName, false);
    setIsJoinedLobby(true);
    setActiveLobbyTab('lobby');
  };

  const handleFullLogout = useCallback(() => {
    const activeRoom = roomState?.roomId || localStorage.getItem('catan_active_room');
    if (activeRoom) {
      socketService.leaveRoom(activeRoom);
    }

    localStorage.removeItem('catan_auth_token');
    localStorage.removeItem('catan_player_name');
    localStorage.removeItem('catan_guest_id');
    localStorage.removeItem('catan_active_room');
    localStorage.removeItem('catan_has_created_room');
    localStorage.removeItem('catan_game_active');
    localStorage.removeItem('catan_is_spectator');

    const freshGuestId = Math.random().toString(36).substring(2, 10);
    localStorage.setItem('catan_player_id', freshGuestId);
    socketService.playerId = freshGuestId;

    setCurrentUser(null);
    setRoomState(null);
    setIsRoomLocked(false);
    setIsJoinedLobby(false);
    setIsJoinSpectator(false);
    setGameStarted(false);
    setShowSailingScreen(false);
    audioService.stopAllSfx();

    const newRoomId = Math.floor(100000 + Math.random() * 900000).toString();
    setInputRoomId(newRoomId);
    setActiveLobbyTab('lobby');

    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [roomState?.roomId]);

  const handleCopyRoomCode = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomState?.roomId || inputRoomId);
    const text = url.toString();
    
    const showToast = () => {
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showToast).catch((err) => {
        console.error('Clipboard copy failed, using fallback', err);
        fallbackCopyTextToClipboard(text);
      });
    } else {
      fallbackCopyTextToClipboard(text);
    }

    function fallbackCopyTextToClipboard(textToCopy: string) {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      // Avoid scrolling to bottom
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        showToast();
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleToggleReady = () => {
    // Optimistically update the UI before the server response
    setRoomState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.map(p => 
          p.id === socketService.playerId ? { ...p, isReady: !p.isReady } : p
        )
      };
    });
    if (roomState?.roomId) {
      socketService.toggleReady(roomState.roomId);
    }
  };

  const syncSettings = (newSettings: Partial<RoomState['settings']>) => {
    if (!roomState?.roomId) return;
    socketService.updateSettings(roomState.roomId, newSettings);
  };

  const activePlayerId = (gameState?.phase === 'discard' && (gameState?.pendingDiscards?.length || 0) > 0)
    ? gameState!.pendingDiscards[0].playerId 
    : (gameState?.phase === 'gold_selection' && (gameState?.pendingGoldRewards?.length || 0) > 0)
    ? gameState!.pendingGoldRewards[0].playerId
    : gameState?.currentPlayerIndex ?? 0;

  const botProcessorId = roomState && socketService.isConnected ? getRoomController(roomState) : null;
  controllerRef.current = botProcessorId;

  useEffect(() => {
    if (!gameState?.diceRollPending || isDiceRolling || botProcessorId !== socketService.playerId ||
      !gameState.players[gameState.currentPlayerIndex]?.isBot) return;
    // A new controller can finish the previous controller's in-flight dice roll.
    const timer = setTimeout(resolveDiceRoll, 150);
    return () => clearTimeout(timer);
  }, [gameState?.diceRollPending, gameState?.currentPlayerIndex, gameState?.players, isDiceRolling, botProcessorId, resolveDiceRoll]);

  const amIActivePlayer = useMemo(() => {
    if (!gameState || isSpectator) return false;
    const player = gameState.players[activePlayerId];
    if (!player) return false;
    if (player.isBot) return false; // Bot is never a human active player
    if (!roomState) return true; // Single player mode
    return player.sessionId === socketService.playerId || player.id === myPlayerIndex;
  }, [gameState, activePlayerId, isSpectator, roomState, myPlayerIndex]);

  const me = useMemo(() => {
    if (!gameState || myPlayerIndex === -1) return gameState?.players[0]; 
    return gameState.players[myPlayerIndex];
  }, [gameState, myPlayerIndex]);

  const currentPlayer = useMemo(() => {
    if (!gameState) return null;
    return gameState.players[gameState.currentPlayerIndex];
  }, [gameState]);

  useEffect(() => {
    if (gameState?.lastDevCardEvent) {
      // Show overlay if event is recent
      if (Date.now() - gameState.lastDevCardEvent.timestamp < 1500) {
        setDevCardOverlay({ 
          playerName: gameState.lastDevCardEvent.playerName, 
          actionStr: gameState.lastDevCardEvent.cardType 
        });
        const timer = setTimeout(() => {
          setDevCardOverlay(null);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState?.lastDevCardEvent?.timestamp]);

  const isMyHumanTurn = useMemo(() => {
    if (!gameState || isSpectator || isDiceRolling) return false;
    const player = gameState.players[activePlayerId];
    return player?.sessionId === socketService.playerId;
  }, [gameState, activePlayerId, isSpectator, isDiceRolling]);

  const canBuild = ((gameState?.phase === 'main' && gameState.hasRolled) || 
    gameState?.phase === 'setup' || 
    gameState?.phase === 'road_building') && isMyHumanTurn;

  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>(() => {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;
      setWindowSize(previous => previous.width === w && previous.height === h ? previous : { width: w, height: h });
      if (w > h) {
        setDeviceOrientation('landscape');
      } else {
        setDeviceOrientation('portrait');
      }
    };

    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (window.innerWidth > window.innerHeight) {
        setDeviceOrientation('landscape');
        return;
      }
      if (e.gamma !== null && e.beta !== null) {
        const absGamma = Math.abs(e.gamma);
        const absBeta = Math.abs(e.beta);
        if (absGamma > 40 && absBeta < 60) {
          setDeviceOrientation('landscape');
        } else if (absGamma < 25 && absBeta > 30) {
          setDeviceOrientation('portrait');
        }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.addEventListener('deviceorientation', handleDeviceOrientation);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, []);

  const isPortrait = windowSize.width < windowSize.height;
  const shouldApplyPortraitRotation = isPortrait;

  const logicalWindowSize = {
    width: shouldApplyPortraitRotation ? windowSize.height : windowSize.width,
    height: shouldApplyPortraitRotation ? windowSize.width : windowSize.height
  };
  const isMobile = logicalWindowSize.width < 1024;

  // Auto-scroll to active player on mobile
  useEffect(() => {
    if (isMobile && playerBarRef.current && activePlayerId !== undefined && gameState) {
      const timer = setTimeout(() => {
        const container = playerBarRef.current;
        const activeCard = container?.querySelector(`[data-player-index="${activePlayerId}"]`) as HTMLElement;
        
        if (activeCard && container) {
          // Calculate the target scroll position to center the active card
          const targetX = activeCard.offsetLeft - (container.clientWidth / 2) + (activeCard.clientWidth / 2);
          
          container.scrollTo({
            left: targetX,
            behavior: 'smooth'
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activePlayerId, isMobile, gameState?.phase]);

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  const lastCenter = useRef<{x: number, y: number} | null>(null);
  const lastDist = useRef<number>(0);

  const getDistance = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  const getCenter = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  };

  const handleTouchMove = (e: any) => {
    // IMPORTANT: Always prevent default to stop native browser behavior (scrolling/zoom)
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const touches = e.evt.touches;
    const numTouches = touches.length;

    if (numTouches === 1) {
      if (!stage.draggable()) {
        stage.draggable(true);
      }
    } else if (numTouches >= 2) {
      setHasManuallyInteracted(true);
      
      // PERFORMANCE: Cache layer during multi-touch zoom
    if (boardLayerRef.current && !boardLayerRef.current.isCached()) {
        // Use standard device pixel ratio for performance
        boardLayerRef.current.cache({ pixelRatio: (window.devicePixelRatio || 1) });
      }

      // Stop any pending drag operation to allow smooth zoom
      if (stage.isDragging()) {
        stage.stopDrag();
      }
      if (stage.draggable()) {
        stage.draggable(false);
      }

      const touch1 = touches[0];
      const touch2 = touches[1];

      const getTouchPos = (t: any) => {
        if (stage && stage.content && shouldApplyPortraitRotation) {
          const rect = stage.content.getBoundingClientRect();
          const scaleX = rect.height / stage.content.clientWidth || 1;
          const scaleY = rect.width / stage.content.clientHeight || 1;
          return {
            x: (t.clientY - rect.top) / scaleX,
            y: (rect.right - t.clientX) / scaleY,
          };
        }
        return { x: t.clientX, y: t.clientY };
      };

      const p1 = getTouchPos(touch1);
      const p2 = getTouchPos(touch2);
      
      const dist = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;

      if (!lastDist.current) {
        lastDist.current = dist;
        lastCenter.current = { x: centerX, y: centerY };
        return;
      }
      
      const stageScale = stage.scaleX();
      const stageX = stage.x();
      const stageY = stage.y();

      // Point relative to the stage coordinate system
      const pointToX = (lastCenter.current!.x - stageX) / stageScale;
      const pointToY = (lastCenter.current!.y - stageY) / stageScale;

      const newScale = stageScale * (dist / lastDist.current);
      // Reasonable scale limits for mobile
      const clampedScale = Math.max(0.15, Math.min(4, newScale));

      stage.scale({ x: clampedScale, y: clampedScale });

      stage.position({
        x: centerX - pointToX * clampedScale,
        y: centerY - pointToY * clampedScale,
      });
      
      lastDist.current = dist;
      lastCenter.current = { x: centerX, y: centerY };
      lastGestureTime.current = Date.now();
    } else {
      if (lastDist.current !== 0) {
        lastDist.current = 0;
        lastCenter.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    lastDist.current = 0;
    lastCenter.current = null;

    // PERFORMANCE: Clear cache after interaction
    if (boardLayerRef.current?.isCached()) {
      boardLayerRef.current.clearCache();
      boardLayerRef.current.batchDraw();
    }

    // Restore draggable state after a short delay to prevent sudden jumps
    setTimeout(() => {
      const stage = stageRef.current;
      if (stage && !stage.draggable()) stage.draggable(true);
    }, 50);
  };

  const handleTouchStart = () => {
    lastDist.current = 0;
    lastCenter.current = null;
  };

  const [showPlayerTradeModal, setShowPlayerTradeModal] = useState(false);
  const [playerTradeOffer, setPlayerTradeOffer] = useState<Record<ResourceType, number>>({} as any);
  const [playerTradeRequest, setPlayerTradeRequest] = useState<Record<ResourceType, number>>({} as any);
  const [playerTradeTarget, setPlayerTradeTarget] = useState<number | null>(null);

  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [closedTradeIds, setClosedTradeIds] = useState<Set<string>>(new Set());
  const [finalizingTradeIds, setFinalizingTradeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!gameState?.tradeOffers) return;
    gameState.tradeOffers.forEach(offer => {
      if (offer.status !== 'pending' && !closedTradeIds.has(offer.id)) {
        setTimeout(() => {
          setClosedTradeIds(prev => {
            const next = new Set(prev);
            next.add(offer.id);
            return next;
          });
        }, 500);
      }
    });
  }, [gameState?.tradeOffers, closedTradeIds]);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showBackInterceptToast, setShowBackInterceptToast] = useState(false);
  const backToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const [isStandalone, setIsStandalone] = useState(isInstalledDisplay);
  useEffect(() => {
    const handleInstall = (event: Event) => { event.preventDefault(); setDeferredPrompt(event); };
    const update = () => setIsStandalone(isInstalledDisplay());
    const queries = ['standalone', 'fullscreen', 'minimal-ui'].map(mode => matchMedia(`(display-mode: ${mode})`));
    window.addEventListener('beforeinstallprompt', handleInstall);
    window.addEventListener('appinstalled', update);
    queries.forEach(query => query.addEventListener('change', update));
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstall);
      window.removeEventListener('appinstalled', update);
      queries.forEach(query => query.removeEventListener('change', update));
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (gameState) {
      document.body.style.backgroundColor = '#f5f2ed';
    } else {
      document.body.style.backgroundColor = '#f8fafc';
    }
  }, [!!gameState]);

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`PWA install prompt outcome: ${outcome}`);
      } catch (err) {
        console.error('PWA install error:', err);
      }
       setDeferredPrompt(null);
     } else {
       setShowPwaGuide(true);
     }
   };
 
   const lobbySwipe = useLobbySwipe(activeLobbyTab, setActiveLobbyTab, () =>
     !hasBackHandler() && !showSailingScreen && !showMapAlbum && !showMapGenerator &&
     (activeLobbyTab !== 'profile' || profileActiveView === 'menu') &&
     (activeLobbyTab !== 'rules' || rulesActiveView === 'menu')
   );

  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [showSailingScreen, setShowSailingScreen] = useState(false);
  const [sailingText, setSailingText] = useState(() => {
    const wasInGame = localStorage.getItem('catan_game_active') === 'true';
    const asSpec = localStorage.getItem('catan_is_spectator') === 'true';
    return (wasInGame && !asSpec) ? "重新驶入海域......" : "正在驶入海域......";
  });
  
  useEffect(() => {
    audioService.tempMuteSfx = showSailingScreen;
    if (showSailingScreen) {
      audioService.stopAllSfx();
      audioService.roomActive = false;
    } else if (isJoinedLobby) {
      audioService.roomActive = true;
    }
  }, [showSailingScreen, isJoinedLobby]);

  useEffect(() => {
    if (isAuthLoading) return;

    // BGM only plays after fully entering the game screen (gameStarted is true, sailing loading is finished, and we are joined in lobby)
    const isFullyInGame = gameStarted && !showSailingScreen && isJoinedLobby;

    if (!isFullyInGame) {
      audioService.stopBgm(true);
      return;
    }

    const checkAndPlayBgm = () => {
      if (!isFullyInGame) return;
      if (!audioService.enabled || showSoundModal || document.hidden) return;

      if (!audioService.isBgmPlaying) {
        audioService.playBgm();
      }
    };

    // Try to play immediately (in case autoplay is permitted or we are already active)
    checkAndPlayBgm();

    // Set up robust gesture listeners to start/resume BGM on any user interaction
    const handleUserGesture = () => {
      checkAndPlayBgm();
    };

    document.addEventListener('click', handleUserGesture);
    document.addEventListener('keydown', handleUserGesture);
    document.addEventListener('mousedown', handleUserGesture);
    document.addEventListener('touchstart', handleUserGesture);
    window.addEventListener('focus', checkAndPlayBgm);
    document.addEventListener('visibilitychange', checkAndPlayBgm);

    return () => {
      document.removeEventListener('click', handleUserGesture);
      document.removeEventListener('keydown', handleUserGesture);
      document.removeEventListener('mousedown', handleUserGesture);
      document.removeEventListener('touchstart', handleUserGesture);
      window.removeEventListener('focus', checkAndPlayBgm);
      document.removeEventListener('visibilitychange', checkAndPlayBgm);
    };
  }, [isAuthLoading, gameStarted, showSailingScreen, isJoinedLobby, showSoundModal]);

  const [showDebugConsole, setShowDebugConsole] = useState(false);
  const [debugSaveName, setDebugSaveName] = useState('');
  const [debugSaveStatus, setDebugSaveStatus] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [showDebugButton, setShowDebugButton] = useState(false);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const logoClickCountRef = useRef(0);
  const logoStartTimeRef = useRef<number>(0);

  const [showGameOver, setShowGameOver] = useState(false);
  const [showDissolveRoomConfirm, setShowDissolveRoomConfirm] = useState(false);
  const [showExitOptions, setShowExitOptions] = useState(false);
  const [showReserveRoomModal, setShowReserveRoomModal] = useState(false);
  const [reserveCustomMinutes, setReserveCustomMinutes] = useState('60');
  const [isConnected, setIsConnected] = useState(true);

  const handleLogoClick = useCallback(() => {
    if (currentUser?.role !== 'admin') {
      logoClickCountRef.current = 0;
      logoStartTimeRef.current = 0;
      return;
    }
    const now = Date.now();
    if (now - logoStartTimeRef.current > 3000) {
      logoClickCountRef.current = 1;
      logoStartTimeRef.current = now;
    } else {
      logoClickCountRef.current += 1;
    }
    
    console.log(`Logo clicked ${logoClickCountRef.current} times`);

    if (logoClickCountRef.current === 3) {
      if (!isJoinedLobby && !gameStarted) {
        console.log('Triggering seed modification prompt (3 clicks)');
        const res = prompt('请输入你要设置的随机种子序号(数字):', mapPreviewSeed.toString());
        if (res && !isNaN(Number(res))) {
          setMapPreviewSeed(Number(res));
          localStorage.setItem('catan_map_preview_seed', res);
        }
        logoClickCountRef.current = 0;
        logoStartTimeRef.current = 0;
      }
    }

    if (logoClickCountRef.current === 5) {
      if (gameStarted) {
        console.log('Toggling debug button visibility (5 clicks)');
        setShowDebugButton(prev => {
          const newState = !prev;
          if (!newState) {
            setDebugModeEnabled(false);
            setShowDebugConsole(false);
          }
          return newState;
        });
        logoClickCountRef.current = 0;
        logoStartTimeRef.current = 0;
      }
    }
  }, [mapPreviewSeed, isJoinedLobby, gameStarted, currentUser?.role]);

  useEffect(() => {
    if (!gameStarted) {
      setIsBoardReady(false);
    }
  }, [gameStarted]);

  // Keep-alive ping (every 5 mins)
  useEffect(() => {
    const keepAliveInterval = setInterval(() => {
      // Use silent failure for keep-alive
      fetch('/api/health').catch(() => {
        // Silently ignore ping failures as they are expected during server restarts or network hiccups
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(keepAliveInterval);
  }, []);

  useEffect(() => {
    let wasConnected = socketService.isConnected;
    return socketService.onConnectionChange((connected) => {
      const reconnected = connected && !wasConnected;
      wasConnected = connected;
      setIsConnected(connected);
      if (reconnected && isJoinedLobby && !isAuthLoading && currentUser) {
        const roomId = roomState?.roomId || inputRoomId;
        if (roomId) {
          console.log('[App] Reconnected, rejoining room:', roomId);
          const asSpec = localStorage.getItem('catan_is_spectator') === 'true';
          socketService.joinRoom(roomId, playerName, asSpec);
        }
      }
    });
  }, [isJoinedLobby, roomState?.roomId, inputRoomId, playerName, isAuthLoading, currentUser]);

  const [isInitializingGame, setIsInitializingGame] = useState(false);
  const [playerCount, setPlayerCount] = useState(4);
  const [botConfig, setBotConfig] = useState<boolean[]>(Array(6).fill(false));
  const [mapType, setMapType] = useState<MapType>('archipelago');
  const [tradeGive, setTradeGive] = useState<ResourceType | null>(null);
  const [tradeReceive, setTradeReceive] = useState<ResourceType | null>(null);
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const buildMode = gameState?.activeBuildMode ?? null;
  const isHost = !isSpectator && roomState?.hostId === socketService.playerId;

  const handleSetBuildMode = useCallback((mode: typeof buildMode) => {
    if (isMyHumanTurn) {
      setBuildModeSync(mode);
    }
  }, [isMyHumanTurn, setBuildModeSync]);
  const stageRef = useRef<any>(null);
  const boardLayerRef = useRef<any>(null);
  const lastGestureTime = useRef(0);
  const [imageElements, setImageElements] = useState<Record<string, HTMLImageElement>>({});

  const [connectedPlayers, setConnectedPlayers] = useState<string[]>([]);


  const [discardSelection, setDiscardSelection] = useState<Record<ResourceType, number>>({
    [ResourceType.Lumber]: 0,
    [ResourceType.Brick]: 0,
    [ResourceType.Wool]: 0,
    [ResourceType.Grain]: 0,
    [ResourceType.Ore]: 0,
  });

  useEffect(() => {
    // Reset discard selection when the discarding player changes
    setDiscardSelection({
      [ResourceType.Lumber]: 0,
      [ResourceType.Brick]: 0,
      [ResourceType.Wool]: 0,
      [ResourceType.Grain]: 0,
      [ResourceType.Ore]: 0,
    });
  }, [gameState?.pendingDiscards[0]?.playerId]);

  useEffect(() => {
    if (!gameState) {
      setHasResolvedGameOver(false);
      return;
    }
    
    if (gameState.phase === 'finished' && !hasResolvedGameOver && !showGameOver) {
      setShowGameOver(true);
    }

    if (gameState.phase !== 'finished') {
      setHasResolvedGameOver(false);
    }
  }, [gameState?.phase, hasResolvedGameOver, showGameOver]);

  const hexCoords = useMemo(() => {
    if (!gameState || !gameState.board) return [];
    const hexes = Array.isArray(gameState.board) ? gameState.board : [];
    return hexes.map(hex => {
      const x = HEX_WIDTH * (hex.q + hex.r / 2);
      const y = HEX_HEIGHT * 0.75 * hex.r;
      return { ...hex, x, y, radius: HEX_RADIUS };
    });
  }, [gameState?.board]);

  const hasManuallyInteractedRef = useRef(false);

  const setHasManuallyInteracted = useCallback((val: boolean) => {
    hasManuallyInteractedRef.current = val;
  }, []);

  const [isBoardReady, setIsBoardReady] = useState(false);

  const centerMap = useCallback((force = false) => {
    if (!stageRef.current || hexCoords.length === 0) return;
    if (hasManuallyInteractedRef.current && !force) return;

    const stage = stageRef.current;
    const bounds = {
      minX: Infinity, minY: Infinity,
      maxX: -Infinity, maxY: -Infinity
    };

    // Find the bounding box of the actual land/sea hexes, ignoring the outer sea buffer
    hexCoords.forEach(hex => {
      if (hex.isOuterSea) return;
      bounds.minX = Math.min(bounds.minX, hex.x - hex.radius);
      bounds.minY = Math.min(bounds.minY, hex.y - hex.radius);
      bounds.maxX = Math.max(bounds.maxX, hex.x + hex.radius);
      bounds.maxY = Math.max(bounds.maxY, hex.y + hex.radius);
    });

    const mapWidth = bounds.maxX - bounds.minX;
    const mapHeight = bounds.maxY - bounds.minY;
    const sWidth = stage.width();
    const sHeight = stage.height();

    if (mapWidth === 0 || mapHeight === 0 || sWidth === 0 || sHeight === 0) return;

    const scaleX = sWidth / mapWidth;
    const scaleY = sHeight / mapHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9; // Use 90% of the space for a bit more padding

    stage.scale({ x: scale, y: scale });

    // Center the map within the stage
    const newX = (sWidth - mapWidth * scale) / 2 - bounds.minX * scale;
    const newY = (sHeight - mapHeight * scale) / 2 - bounds.minY * scale;
    
    stage.position({ x: newX, y: newY });
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
    
    // Ensure the transformation is committed before revealing to avoid "jumps"
    requestAnimationFrame(() => {
      setTimeout(() => {
        setIsBoardReady(true);
      }, 100);
    });
  }, [hexCoords]);

  useEffect(() => {
    if (gameState && gameStarted) {
      const t4 = setTimeout(() => setIsBoardReady(true), 150);
      return () => {
        clearTimeout(t4);
      };
    }
  }, [gameState, gameStarted]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;
      setWindowSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
      
      // Force panels to always show
      setShowLeftPanel(true);
      setShowRightPanel(true);
      
      // Center map on screen resize
      if (gameStarted) {
        hasManuallyInteractedRef.current = false;
        centerMap(true);
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Initial enter game center
    if (gameStarted) {
      hasManuallyInteractedRef.current = false;
      centerMap(true);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [centerMap, gameStarted]);

  const zoomEndTimeoutRef = useRef<any>(null);

  const handleWheel = (e: any) => {
    setHasManuallyInteracted(true);
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    // PERFORMANCE: Cache layer during wheel zoom
    if (boardLayerRef.current) {
      if (zoomEndTimeoutRef.current) clearTimeout(zoomEndTimeoutRef.current);
      if (!boardLayerRef.current.isCached()) {
        boardLayerRef.current.cache({ pixelRatio: (window.devicePixelRatio || 1) });
      }
      zoomEndTimeoutRef.current = setTimeout(() => {
        boardLayerRef.current?.clearCache();
        boardLayerRef.current?.batchDraw();
      }, 400);
    }

    const scaleBy = 1.1;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

    // Limit scale
    if (newScale < 0.1 || newScale > 5) return;

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    stage.batchDraw();
  };
  const [localSavedMaps, setLocalSavedMaps] = useState<any[]>(() => {
    const saved = localStorage.getItem('catan_saved_maps');
    return saved ? JSON.parse(saved) : [];
  });
  const [dbMaps, setDbMaps] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/maps')
      .then(res => {
        if (!res.ok) return null;
        const ct = res.headers.get('content-type');
        if (ct && ct.includes('application/json')) return res.json();
        return null;
      })
      .then(data => {
         if (data?.maps) setDbMaps(data.maps);
      })
      .catch(err => console.warn('[App] Fetch maps error:', err));
  }, []);

  const savedMaps = useMemo(() => {
    return [
      ...dbMaps.map(m => ({ ...m.mapData, id: m._id, name: m.name, isDb: true })),
      ...localSavedMaps.map(m => ({ ...m, isLocal: true }))
    ];
  }, [dbMaps, localSavedMaps]);

  const [mapSaveDialog, setMapSaveDialog] = useState<{ show: boolean, name: string, topology: any, board: any } | null>(null);
  const [showMapGenerator, setShowMapGenerator] = useState(false);
  const [showMapAlbum, setShowMapAlbum] = useState(false);
  const [atlasLogoError, setAtlasLogoError] = useState(false);
  const [albumFilter, setAlbumFilter] = useState<'2-4' | '5' | '6'>('2-4');
  const [previewTopology, setPreviewTopology] = useState<any>(null);

  const filteredMaps = useMemo(() => {
    return savedMaps.filter(map => {
      if (albumFilter === '2-4') return map.playerCount >= 2 && map.playerCount <= 4;
      if (albumFilter === '5') return map.playerCount === 5;
      if (albumFilter === '6') return map.playerCount === 6;
      return true;
    });
  }, [savedMaps, albumFilter]);
  const [previewBoard, setPreviewBoard] = useState<any[]>([]);

  // Synchronize state values for popstate event handler closures without trigger re-renders or stale variables
  const roomStateRef = useRef(roomState);
  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  const isJoinedLobbyRef = useRef(isJoinedLobby);
  useEffect(() => {
    isJoinedLobbyRef.current = isJoinedLobby;
  }, [isJoinedLobby]);

  const activeLobbyTabRef = useRef(activeLobbyTab);
  useEffect(() => {
    activeLobbyTabRef.current = activeLobbyTab;
  }, [activeLobbyTab]);

  const handleReturnToLobbyRef = useRef(handleReturnToLobby);
  useEffect(() => {
    handleReturnToLobbyRef.current = handleReturnToLobby;
  }, [handleReturnToLobby]);

  const showRulesModalRef = useRef(showRulesModal);
  useEffect(() => {
    showRulesModalRef.current = showRulesModal;
  }, [showRulesModal]);

  const showSoundModalRef = useRef(showSoundModal);
  useEffect(() => {
    showSoundModalRef.current = showSoundModal;
  }, [showSoundModal]);

  const [rulesActiveView, setRulesActiveView] = useState<'menu' | string>('menu');
  const rulesActiveViewRef = useRef(rulesActiveView);
  useEffect(() => {
    rulesActiveViewRef.current = rulesActiveView;
  }, [rulesActiveView]);

  const [profileActiveView, setProfileActiveView] = useState<'menu' | string>('menu');
  useBackHandler(showPwaGuide, () => { setShowPwaGuide(false); return true; }, 120);
  useBackHandler(showSoundModal, () => { setShowSoundModal(false); return true; }, 110);
  useBackHandler(!!confirmAction, () => { setConfirmAction(null); return true; }, 150);
  useBackHandler(showDissolveRoomConfirm, () => { setShowDissolveRoomConfirm(false); return true; }, 140);
  useBackHandler(showReserveRoomModal, () => { setShowReserveRoomModal(false); return true; }, 130);
  useBackHandler(showExitOptions, () => { setShowExitOptions(false); return true; }, 100);
  useBackHandler(showMapGenerator, () => { setShowMapGenerator(false); return true; }, 100);
  useBackHandler(showMapAlbum, () => { setShowMapAlbum(false); return true; }, 90);
  useBackHandler(showPlayerTradeModal, () => { setShowPlayerTradeModal(false); return true; }, 100);
  useBackHandler(showTradeModal, () => { setShowTradeModal(false); return true; }, 100);
  const profileActiveViewRef = useRef(profileActiveView);
  useEffect(() => {
    profileActiveViewRef.current = profileActiveView;
  }, [profileActiveView]);

  useEffect(() => {
    window.dispatchEvent(new Event('catan:navigation'));
  }, [activeLobbyTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.history.state?.catanHistoryVersion !== 5) {
      window.history.replaceState({ catanBase: true, catanHistoryVersion: 5 }, '');
      window.history.pushState({ catanBuffer: true, catanHistoryVersion: 5 }, '');
      window.history.pushState({ catanApp: true, catanHistoryVersion: 5 }, '');
    }

    const performAppBackAction = () => {
      if (runTopBackHandler()) return true;
      // 1. In game
      if (gameStartedRef.current) {
        if (showSoundModalRef.current) {
          setShowSoundModal(false);
          return true;
        }
        if (showRulesModalRef.current) {
          if (rulesActiveViewRef.current !== 'menu') {
            setRulesActiveView('menu');
            return true;
          }
          setShowRulesModal(false);
          setRulesActiveView('menu');
          return true;
        }
        // In game and no modals open -> do nothing (suppress exit / fullscreen interception prompt)
        return true;
      }

      // 2. Matching screen
      const inMatchingScreen = (roomStateRef.current !== null || isJoinedLobbyRef.current) && !gameStartedRef.current;
      if (inMatchingScreen) {
        if (handleReturnToLobbyRef.current) {
          handleReturnToLobbyRef.current();
        }
        return true;
      }

      // 3. Modals open in lobby
      if (showSoundModalRef.current) {
        setShowSoundModal(false);
        return true;
      }
      if (showRulesModalRef.current) {
        if (rulesActiveViewRef.current !== 'menu') {
          setRulesActiveView('menu');
          return true;
        }
        setShowRulesModal(false);
        setRulesActiveView('menu');
        return true;
      }

      // Primary tabs are peers. Only a nested view consumes an in-app back.
      const inLobby = !roomStateRef.current && !isJoinedLobbyRef.current;
      if (inLobby) {
        if (activeLobbyTabRef.current === 'profile') {
          if (profileActiveViewRef.current !== 'menu') {
            setProfileActiveView('menu');
            return true;
          }
        }
        if (activeLobbyTabRef.current === 'rules') {
          if (rulesActiveViewRef.current !== 'menu') {
            setRulesActiveView('menu');
            return true;
          }
        }
      }

      return false;
    };

    let lastEdgeBack = -Infinity;
    let exitArmedAt = -Infinity;
    let leaving = false;
    let releasingGuard = false;
    let restoringGuard = false;
    const historyPosition = () => window.history.state?.catanApp ? 2 : window.history.state?.catanBuffer ? 1 : 0;
    let lastHistoryPosition = historyPosition();
    let exitRecoveryTimer: ReturnType<typeof setTimeout>;
    const restoreGuard = () => {
      if (!window.history.state?.catanApp && !restoringGuard) {
        // Reuse the existing entry. pushState after Back makes Chromium mark
        // every same-document entry skippable until the next real interaction.
        restoringGuard = true;
        window.history.go(2 - historyPosition());
      }
    };
    const handleBack = (fromPop = false) => {
      if (leaving) return;
      if (performAppBackAction()) {
        restoreGuard();
        exitArmedAt = -Infinity;
        setShowBackInterceptToast(false);
      } else if (performance.now() - exitArmedAt < 1000) {
        leaving = true;
        setShowBackInterceptToast(false);
        if (backToastTimeoutRef.current) clearTimeout(backToastTimeoutRef.current);
        window.history.go(-historyPosition() - 1);
        // An installed app may have no previous document to return to.
        // Do not leave its in-app navigation permanently disabled in that case.
        exitRecoveryTimer = setTimeout(() => {
          leaving = false;
          exitArmedAt = -Infinity;
          restoreGuard();
        }, 700);
        return;
      } else {
        exitArmedAt = performance.now();
        setShowBackInterceptToast(true);
        // Leave the base entry exposed for one second so a native Back can exit
        // an installed app even when it has no previous web document.
        if (historyPosition() > 0) {
          releasingGuard = true;
          window.history.go(-historyPosition());
        }
        if (backToastTimeoutRef.current) clearTimeout(backToastTimeoutRef.current);
        backToastTimeoutRef.current = setTimeout(() => {
          exitArmedAt = -Infinity;
          setShowBackInterceptToast(false);
          if (!leaving) restoreGuard();
        }, 1000);
      }
    };
    const handlePopState = () => {
      const position = historyPosition();
      const movingForward = position > lastHistoryPosition;
      lastHistoryPosition = position;
      if (movingForward) {
        restoringGuard = false;
        if (position < 2 && exitArmedAt === -Infinity) restoreGuard();
        return;
      }
      if (releasingGuard) { releasingGuard = false; return; }
      if (leaving) return;
      if (performance.now() - lastEdgeBack > 400) handleBack(true);
      else {
        lastEdgeBack = -Infinity;
        restoreGuard();
      }
    };
    const appBack = () => { handleBack(); };
    const resetExit = () => {
      leaving = false;
      clearTimeout(exitRecoveryTimer);
      exitArmedAt = -Infinity;
      setShowBackInterceptToast(false);
      if (backToastTimeoutRef.current) clearTimeout(backToastTimeoutRef.current);
      restoreGuard();
    };
    const restoreOnVisible = () => { if (!document.hidden) resetExit(); };
    const suppressClick = (event: MouseEvent) => {
      if (shouldSuppressGestureClick()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    let edge: { x: number; y: number; id: number; horizontal: boolean; cancelled: boolean } | null = null;
    const cancelEdge = () => { edge = null; };
    const handleTouchStart = (event: TouchEvent) => {
      edge = null;
      if (event.touches.length !== 1) return;
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select,button,[role="slider"],[data-no-back],canvas')) return;
      const canGoBack = hasBackHandler() || !gameStartedRef.current;
      const touch = event.touches[0];
      if (!canGoBack || touch.clientX > 32) return;
      edge = { x: touch.clientX, y: touch.clientY, id: touch.identifier, horizontal: false, cancelled: false };
      if (event.cancelable) event.preventDefault();
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!edge || edge.cancelled) return;
      if (event.touches.length !== 1) { cancelEdge(); return; }
      const touch = event.touches[0];
      const dx = touch.clientX - edge.x;
      const dy = touch.clientY - edge.y;
      if (!edge.horizontal && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
        edge.horizontal = dx > Math.abs(dy) * 1.2;
        edge.cancelled = !edge.horizontal;
      }
      if (edge.horizontal && event.cancelable) event.preventDefault();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      const gesture = edge;
      edge = null;
      if (!gesture || gesture.cancelled) return;
      const touch = [...event.changedTouches].find(item => item.identifier === gesture.id);
      if (touch && touch.clientX - gesture.x >= 48 && Math.abs(touch.clientY - gesture.y) < 60) {
        lastEdgeBack = performance.now();
        suppressGestureClick();
        handleBack();
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('catan:back', appBack);
    window.addEventListener('catan:navigation', resetExit);
    window.addEventListener('pageshow', resetExit);
    window.addEventListener('focus', resetExit);
    document.addEventListener('visibilitychange', restoreOnVisible);
    window.addEventListener('click', suppressClick, true);
    window.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', cancelEdge);
    // A refresh during the exit-confirmation second may restore the base entry.
    restoreGuard();
    return () => {
      clearTimeout(exitRecoveryTimer);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('catan:back', appBack);
      window.removeEventListener('catan:navigation', resetExit);
      window.removeEventListener('pageshow', resetExit);
      window.removeEventListener('focus', resetExit);
      document.removeEventListener('visibilitychange', restoreOnVisible);
      window.removeEventListener('click', suppressClick, true);
      window.removeEventListener('touchstart', handleTouchStart, true);
      window.removeEventListener('touchmove', handleTouchMove, true);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', cancelEdge);
      if (backToastTimeoutRef.current) {
        clearTimeout(backToastTimeoutRef.current);
      }
    };
  }, []);



  const canAfford = useCallback((cost: Record<string, number>) => {
    if (!gameState || !me) return false;
    return Object.entries(cost).every(([res, amt]) => me.resources[res as ResourceType] >= amt);
  }, [gameState, me]);

  // Auto-exit build mode if resources are insufficient (unless it's setup or road building card)
  useEffect(() => {
    if (buildMode && gameState?.phase === 'main') {
      const freeRoads = gameState.freeRoads || 0;
      if (buildMode === 'road' && freeRoads > 0) return;
      
      const costs = {
        road: COSTS.road,
        settlement: COSTS.settlement,
        city: COSTS.city,
        ship: COSTS.ship
      };
      if (!canAfford(costs[buildMode])) {
        handleSetBuildMode(null);
      }
    }
  }, [gameState?.players, gameState?.currentPlayerIndex, buildMode, canAfford, handleSetBuildMode, gameState?.freeRoads, gameState?.phase]);

  const generatePreview = useCallback(() => {
    const topology = generateMapTopology(mapType, playerCount);
    setPreviewTopology(topology);
    const board = distributeResources(topology, mapType, playerCount);
    setPreviewBoard(board);
  }, [mapType, playerCount, generateMapTopology, distributeResources]);

  const saveMapToAlbum = () => {
    if (!previewTopology) return;
    const dateStr = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '');
    const defaultName = `${mapType === 'standard' ? '标准大陆' : '群岛世界'}-${playerCount}人-${dateStr}`;
    setMapSaveDialog({ show: true, name: defaultName, topology: previewTopology, board: previewBoard });
  };

  const handleConfirmSaveMap = async (name: string, isOfficial: boolean) => {
    if (!mapSaveDialog) return;
    
    const newMap = {
      id: Date.now().toString(),
      name,
      playerCount,
      mapType,
      topology: mapSaveDialog.topology,
      board: mapSaveDialog.board,
      date: new Date().toLocaleString()
    };

    if (isOfficial && currentUser?.role === 'admin') {
      const token = localStorage.getItem('catan_auth_token');
      try {
        const res = await fetch('/api/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, mapData: newMap })
        });
        if (res.ok) {
          fetch('/api/maps')
            .then(r => r.ok && r.headers.get('content-type')?.includes('application/json') ? r.json() : null)
            .then(d => d && setDbMaps(d.maps || []))
            .catch(() => {});
          alert('地图已保存到官方云图册！');
          setMapSaveDialog(null);
          return;
        }
      } catch(e) {
        console.warn(e);
      }
    }

    const updated = [...localSavedMaps, newMap];
    setLocalSavedMaps(updated);
    localStorage.setItem('catan_saved_maps', JSON.stringify(updated));
    alert('地图已保存到本地图册！');
    setMapSaveDialog(null);
  };

  const usePreviewMap = () => {
    syncSettings({ 
      customBoard: previewBoard,
      customMapName: '随机生成地图',
      customMapId: 'temp_preview'
    });
    setShowMapGenerator(false);
  };

  const useSavedMap = (savedMap: any) => {
    const board = savedMap.board || distributeResources(savedMap.topology, savedMap.mapType, savedMap.playerCount);
    syncSettings({
      customBoard: board,
      customMapName: savedMap.name,
      customMapId: savedMap.id
    });
    setShowMapAlbum(false);
  };

  const deleteSavedMap = async (map: any) => {
    if (map.isDb) {
       if (currentUser?.role !== 'admin') {
         // silently return to avoid exiting fullscreen with alert
         return;
       }
       // removed window.confirm to prevent exiting fullscreen mode
       const token = localStorage.getItem('catan_auth_token');
       try {
         await fetch(`/api/maps/${map.id}`, {
           method: 'DELETE',
           headers: { Authorization: `Bearer ${token}` }
         });
         setDbMaps(dbMaps.filter(m => m._id !== map.id));
       } catch (e) {
         console.warn(e);
       }
       return;
    }

    const updated = localSavedMaps.filter((m: any) => m.id !== map.id);
    setLocalSavedMaps(updated);
    localStorage.setItem('catan_saved_maps', JSON.stringify(updated));
  };

  const renameSavedMap = async (map: any, newName: string) => {
    if (map.isDb) {
      if (currentUser?.role !== 'admin') {
        // silently return to avoid exiting fullscreen
        return;
      }
      const token = localStorage.getItem('catan_auth_token');
      try {
        const res = await fetch(`/api/maps/${map.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: newName })
        });
        if (res.ok) {
          setDbMaps(dbMaps.map(m => m._id === map.id ? { ...m, name: newName } : m));
        }
      } catch (e) {
        console.warn(e);
      }
      return;
    }

    const updated = localSavedMaps.map((m: any) => m.id === map.id ? { ...m, name: newName } : m);
    setLocalSavedMaps(updated);
    localStorage.setItem('catan_saved_maps', JSON.stringify(updated));
  };

  const uploadMapToCloud = async (map: any) => {
    if (currentUser?.role !== 'admin') return;
    setConfirmAction({
      message: `确定要将本地地图 "${map.name}" 上传到官方云图册吗？`,
      onConfirm: async () => {
        const token = localStorage.getItem('catan_auth_token');
        try {
          const res = await fetch('/api/maps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: map.name, mapData: map })
          });
          if (res.ok) {
            fetch('/api/maps')
              .then(r => r.ok && r.headers.get('content-type')?.includes('application/json') ? r.json() : null)
              .then(d => d && setDbMaps(d.maps || []))
              .catch(() => {});
          }
        } catch (e) {
          console.warn(e);
        }
      }
    });
  };

  // Auto-select build mode during setup phase
  useEffect(() => {
    if (gameState?.phase === 'setup') {
      const pIdx = gameState.currentPlayerIndex;
      const settlementsCount = gameState.settlements.filter(s => s.playerId === pIdx).length;
      const roadsCount = gameState.roads.filter(r => r.playerId === pIdx).length;
      const shipsCount = gameState.ships.filter(s => s.playerId === pIdx).length;
      
      if (settlementsCount > (roadsCount + shipsCount)) {
        if (buildMode !== 'road' && buildMode !== 'ship') handleSetBuildMode('road');
      } else {
        if (buildMode !== 'settlement') handleSetBuildMode('settlement');
      }
    } else if (gameState?.phase === 'initial_dice_roll' || gameState?.phase === 'discard') {
      if (buildMode !== null) handleSetBuildMode(null);
    }
  }, [gameState?.phase, gameState?.currentPlayerIndex, gameState?.settlements.length, gameState?.roads.length, gameState?.ships.length, handleSetBuildMode, buildMode]);

  const checkIsValidEdge = useCallback((edgeId: string, mode: 'road' | 'ship') => {
    if (!gameState) return false;
    const player = gameState.players[gameState.currentPlayerIndex];
    
    // Check limits
    const numRoads = gameState.roads.filter(r => r.playerId === player.id).length;
    const numShips = gameState.ships.filter(s => s.playerId === player.id).length;
    if (mode === 'road' && numRoads >= 15) return false;
    if (mode === 'ship' && numShips >= 15) return false;

    // Check if occupied
    if (gameState.roads.some(r => r.edgeId === edgeId) || gameState.ships.some(s => s.edgeId === edgeId)) return false;


    const hexes = getHexesForEdge(gameState.board, edgeId);
    
    // Pirate check - only blocks SHIPS
    if (mode === 'ship' && hexes.some(h => h.id === gameState.pirateHexId)) return false;

    // Robber check - usually doesn't block roads, but let's keep consistency if needed. 
    // In standard Catan, robber doesn't block building, but let's assume it doesn't here.

    if (mode === 'road') {
      // Road: Must have at least one land hex adjacent
      if (hexes.length > 0 && hexes.every(h => h.type === HexType.Sea || h.isOuterSea)) return false;
      if (hexes.length === 0) return false;
    } else {
      // Ship: Must have at least one sea hex adjacent
      if (!hexes.some(h => h.type === HexType.Sea || h.isOuterSea)) return false;
    }

    // Connectivity
    const [v1Id, v2Id] = edgeId.split('|');
    
    // Setup phase logic
    if (gameState.phase === 'setup') {
        if (mode === 'ship') return false; // No ships in setup
        // In setup, road must connect to the last placed settlement
        const lastSettlement = gameState.settlements.filter(s => s.playerId === player.id).pop();
        if (!lastSettlement) return false;
        return lastSettlement.vertexId === v1Id || lastSettlement.vertexId === v2Id;
    }

    // Main phase connectivity
    const hasSettlementAtV1 = gameState.settlements.some(s => s.playerId === player.id && s.vertexId === v1Id);
    const hasSettlementAtV2 = gameState.settlements.some(s => s.playerId === player.id && s.vertexId === v2Id);
    
    const oppSettlementAtV1 = gameState.settlements.some(s => s.playerId !== player.id && s.vertexId === v1Id);
    const oppSettlementAtV2 = gameState.settlements.some(s => s.playerId !== player.id && s.vertexId === v2Id);

    const hasRoadAtV1 = gameState.roads.some(r => r.playerId === player.id && r.edgeId !== edgeId && r.edgeId.split('|').includes(v1Id));
    const hasRoadAtV2 = gameState.roads.some(r => r.playerId === player.id && r.edgeId !== edgeId && r.edgeId.split('|').includes(v2Id));
    
    const hasShipAtV1 = gameState.ships.some(s => s.playerId === player.id && s.edgeId !== edgeId && s.edgeId.split('|').includes(v1Id));
    const hasShipAtV2 = gameState.ships.some(s => s.playerId === player.id && s.edgeId !== edgeId && s.edgeId.split('|').includes(v2Id));

    if (mode === 'road') {
      // 道路可连接现有道路；若要与船只连接，该交汇顶点必须建有自己的村庄/城市
      const canConnectV1 = hasSettlementAtV1 || (hasRoadAtV1 && !oppSettlementAtV1);
      const canConnectV2 = hasSettlementAtV2 || (hasRoadAtV2 && !oppSettlementAtV2);
      return canConnectV1 || canConnectV2;
    } else {
      // 船只可连接现有船只；若要与道路/陆地相连修船，必须在交汇顶点修建村庄/城市
      const canConnectV1 = hasSettlementAtV1 || (hasShipAtV1 && !oppSettlementAtV1);
      const canConnectV2 = hasSettlementAtV2 || (hasShipAtV2 && !oppSettlementAtV2);
      return canConnectV1 || canConnectV2;
    }
  }, [gameState]);

  const checkIsValidVertex = useCallback((vertexId: string, mode: 'settlement' | 'city') => {
    if (!gameState) return false;
    const player = gameState.players[gameState.currentPlayerIndex];

    const hexes = getHexesForVertex(gameState.board, vertexId);
    
    if (hexes.some(h => h.id === gameState.pirateHexId)) return false;

    if (mode === 'city') {
      // Must be own settlement and not city
      const settlement = gameState.settlements.find(s => s.vertexId === vertexId);
      return settlement && settlement.playerId === player.id && !settlement.isCity;
    }

    // Settlement mode
    // Must be empty
    if (gameState.settlements.some(s => s.vertexId === vertexId)) return false;

    // Must not be all sea
    if (hexes.every(h => h.type === HexType.Sea || h.type === HexType.Desert)) return false;

    // Distance rule
    const [vx, vy] = vertexId.split(',').map(Number);
    const isTooClose = gameState.settlements.some(s => {
      const [sx, sy] = s.vertexId.split(',').map(Number);
      const dist = Math.sqrt(Math.pow(vx - sx, 2) + Math.pow(vy - sy, 2));
      return dist < 50;
    });
    if (isTooClose) return false;

    // Setup phase
    if (gameState.phase === 'setup') {
        // Check if Gold (forbidden in setup)
        if (hexes.some(h => h.type === HexType.Gold)) return false;
        // Must be starting land
        if (!hexes.some(h => h.isStartingLand)) return false;
        return true;
    }

    // Main phase connectivity
    const hasRoadConnection = 
      gameState.roads.some(r => r.playerId === player.id && r.edgeId.split('|').includes(vertexId)) ||
      gameState.ships.some(s => s.playerId === player.id && s.edgeId.split('|').includes(vertexId));
      
    return hasRoadConnection;
  }, [gameState]);

  const [pendingRobberHex, setPendingRobberHex] = useState<{ id: string, type: HexType, x: number, y: number } | null>(null);
  const [pendingBuild, setPendingBuild] = useState<{ type: 'settlement' | 'city' | 'road' | 'ship', id: string, hexIds?: string[], x: number, y: number } | null>(null);

  // Auto-cancel pending build or pending robber if player clicks anywhere else on screen
  useEffect(() => {
    if (!pendingBuild && !pendingRobberHex) return;

    const handleGlobalPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest('.pending-confirm-btn')) {
        return; // Clicked the confirm button itself
      }
      setPendingBuild(null);
      setPendingRobberHex(null);
    };

    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', handleGlobalPointerDown, { capture: true });
    }, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', handleGlobalPointerDown, { capture: true });
    };
  }, [pendingBuild, pendingRobberHex]);

  const handleVertexClick = useCallback((vertexId: string, hexIds: string[], x: number, y: number) => {
    if (!canBuild) return;
    
    if (buildMode === 'settlement') {
        if (checkIsValidVertex(vertexId, 'settlement')) {
            setPendingBuild({ type: 'settlement', id: vertexId, hexIds, x, y });
        }
    } else if (buildMode === 'city') {
        if (checkIsValidVertex(vertexId, 'city')) {
            setPendingBuild({ type: 'city', id: vertexId, x, y });
        }
    }
  }, [canBuild, buildMode, checkIsValidVertex]);

  const handleEdgeClick = useCallback((edgeId: string, x: number, y: number) => {
    if (!canBuild) return;

    if (buildMode === 'road') {
        if (checkIsValidEdge(edgeId, 'road')) {
            setPendingBuild({ type: 'road', id: edgeId, x, y });
        } else {
            const player = gameState?.players[gameState.currentPlayerIndex];
            if (player && gameState) {
                const [v1, v2] = edgeId.split('|');
                const hasShipV1 = gameState.ships.some(s => s.playerId === player.id && s.edgeId.split('|').includes(v1));
                const hasShipV2 = gameState.ships.some(s => s.playerId === player.id && s.edgeId.split('|').includes(v2));
                const hasVillageV1 = gameState.settlements.some(s => s.playerId === player.id && s.vertexId === v1);
                const hasVillageV2 = gameState.settlements.some(s => s.playerId === player.id && s.vertexId === v2);
                if ((hasShipV1 && !hasVillageV1) || (hasShipV2 && !hasVillageV2)) {
                    showGameToast("连接路和船必须修建村庄，否则无法修路！");
                }
            }
        }
    } else if (buildMode === 'ship') {
        if (checkIsValidEdge(edgeId, 'ship')) {
            setPendingBuild({ type: 'ship', id: edgeId, x, y });
        } else {
            const player = gameState?.players[gameState.currentPlayerIndex];
            if (player && gameState) {
                const [v1, v2] = edgeId.split('|');
                const hasRoadV1 = gameState.roads.some(r => r.playerId === player.id && r.edgeId.split('|').includes(v1));
                const hasRoadV2 = gameState.roads.some(r => r.playerId === player.id && r.edgeId.split('|').includes(v2));
                const hasVillageV1 = gameState.settlements.some(s => s.playerId === player.id && s.vertexId === v1);
                const hasVillageV2 = gameState.settlements.some(s => s.playerId === player.id && s.vertexId === v2);
                if ((hasRoadV1 && !hasVillageV1) || (hasRoadV2 && !hasVillageV2)) {
                    showGameToast("连接路和船必须修建村庄，否则无法修船！");
                }
            }
        }
    }
  }, [canBuild, buildMode, checkIsValidEdge, gameState, showGameToast]);

  const handleHexClick = useCallback((hexId: string, type: HexType, x: number, y: number) => {
      // Only allow phase-related hex clicks (robber/pirate movement) if it's the active player's turn
      if (gameState?.phase === 'robber' && amIActivePlayer) {
          if (type === HexType.Sea) {
              if (hexId === gameState.pirateHexId) return;
          } else {
              if (hexId === gameState.robberHexId) return;
          }
          setPendingRobberHex({ id: hexId, type, x, y });
      } else {
          setSelectedHex(hexId);
      }
  }, [gameState?.phase, gameState?.robberHexId, gameState?.pirateHexId, amIActivePlayer]);

  const vertices = useMemo(() => {
    const vMap = new Map<string, { x: number, y: number, hexIds: string[], id: string }>();
    hexCoords.forEach(hex => {
      for (let i = 0; i < 6; i++) {
        const angle_rad = (Math.PI / 180) * (60 * i + 30);
        const vx = hex.x + HEX_RADIUS * Math.cos(angle_rad);
        const vy = hex.y + HEX_RADIUS * Math.sin(angle_rad);
        const key = `${Math.round(vx)},${Math.round(vy)}`;
        
        if (!vMap.has(key)) {
          vMap.set(key, { x: vx, y: vy, hexIds: [hex.id], id: key });
        } else {
          const v = vMap.get(key)!;
          if (!v.hexIds.includes(hex.id)) v.hexIds.push(hex.id);
        }
      }
    });
    // Filter out vertices that only touch OuterSea
    return Array.from(vMap.values()).filter(v => {
      return v.hexIds.some(id => {
        const hex = hexCoords.find(h => h.id === id);
        return hex && !hex.isOuterSea;
      });
    });
  }, [hexCoords]);

  const edges = useMemo(() => {
    const eMap = new Map<string, { x1: number, y1: number, x2: number, y2: number, id: string, hexIds: string[] }>();
    hexCoords.forEach(hex => {
      for (let i = 0; i < 6; i++) {
        const a1 = (Math.PI / 180) * (60 * i + 30);
        const a2 = (Math.PI / 180) * (60 * ((i + 1) % 6) + 30);
        const x1 = hex.x + HEX_RADIUS * Math.cos(a1);
        const y1 = hex.y + HEX_RADIUS * Math.sin(a1);
        const x2 = hex.x + HEX_RADIUS * Math.cos(a2);
        const y2 = hex.y + HEX_RADIUS * Math.sin(a2);
        
        const v1 = `${Math.round(x1)},${Math.round(y1)}`;
        const v2 = `${Math.round(x2)},${Math.round(y2)}`;
        const key = [v1, v2].sort().join('|');
        if (!eMap.has(key)) {
          eMap.set(key, { x1, y1, x2, y2, id: key, hexIds: [hex.id] });
        } else {
          const e = eMap.get(key)!;
          if (!e.hexIds.includes(hex.id)) e.hexIds.push(hex.id);
        }
      }
    });
    
    // Filter out edges that only touch OuterSea
    return Array.from(eMap.values()).filter(e => {
      return e.hexIds.some(id => {
        const hex = hexCoords.find(h => h.id === id);
        return hex && !hex.isOuterSea;
      });
    });
  }, [hexCoords]);

  const openPlayerTradeModal = () => {
    setPlayerTradeOffer({
        [ResourceType.Lumber]: 0,
        [ResourceType.Brick]: 0,
        [ResourceType.Wool]: 0,
        [ResourceType.Grain]: 0,
        [ResourceType.Ore]: 0
    });
    setPlayerTradeRequest({
        [ResourceType.Lumber]: 0,
        [ResourceType.Brick]: 0,
        [ResourceType.Wool]: 0,
        [ResourceType.Grain]: 0,
        [ResourceType.Ore]: 0
    });
    setPlayerTradeTarget(null);
    setShowPlayerTradeModal(true);
  };

  const handleTrade = () => {
    if (tradeGive && tradeReceive) {
      for (let i = 0; i < tradeQuantity; i++) {
        tradeWithBank(tradeGive, tradeReceive);
      }
      setTradeGive(null);
      setTradeReceive(null);
      setTradeQuantity(1);
      setShowTradeModal(false);
    }
  };

  const getTradeRatio = useCallback((resource: ResourceType) => {
    if (!gameState) return 4;
    const player = gameState.players[gameState.currentPlayerIndex];
    
    // Find player's settlements
    const playerSettlements = gameState.settlements.filter(s => s.playerId === player.id);
    const playerVertexIds = new Set(playerSettlements.map(s => s.vertexId));
    
    // Check ports
    const playerPorts = gameState.ports.filter(p => 
        p.vertexIds.some(v => playerVertexIds.has(v))
    );
    
    const specificPort = playerPorts.find(p => p.type === resource);
    if (specificPort) return 2;
    
    const genericPort = playerPorts.find(p => p.type === '3:1');
    if (genericPort) return 3;
    
    return 4;
  }, [gameState]);

  const maxTradeQuantity = useMemo(() => {
    if (!tradeGive || !gameState) return 0;
    const player = gameState.players[gameState.currentPlayerIndex];
    const ratio = getTradeRatio(tradeGive);
    return Math.floor(player.resources[tradeGive] / ratio);
  }, [tradeGive, gameState, getTradeRatio]);

  const currentTradeRatio = tradeGive ? getTradeRatio(tradeGive) : 4;

  useEffect(() => {
    if (tradeQuantity > maxTradeQuantity && maxTradeQuantity > 0) {
      setTradeQuantity(maxTradeQuantity);
    } else if (maxTradeQuantity === 0) {
      setTradeQuantity(1);
    }
  }, [maxTradeQuantity, tradeQuantity]);

  // --- HUMAN STUCK STATE RECOVERY ---
  useEffect(() => {
    if (!gameState) return;
    const activePlayer = gameState.players[activePlayerId];
    if (activePlayer?.isBot || !isMyHumanTurn) return;

    // If a human player is stuck in 'stealing' phase with a target selected but the action didn't complete
    if (gameState.phase === 'stealing' && gameState.selectedStealTarget !== null) {
      const timer = setTimeout(() => {
        stealResource(gameState.selectedStealTarget!);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState?.phase, gameState?.selectedStealTarget, isMyHumanTurn, stealResource]);

  // Auto-sync state periodically to prevent desync
  useEffect(() => {
    // Deliberately removed periodic sync to prevent optimistic state rollbacks.
    // Instead we rely on WebSocket TCP delivery and manual sync on reconnect.
  }, [roomState?.roomId, gameStarted]);

  const botTurnStartRef = useRef(Date.now());
  const previousBotTurnRef = useRef('');
  const [botWakeTick, setBotWakeTick] = useState(0);
  useEffect(() => {
    const key = `${gameState?.currentPlayerIndex}:${gameState?.hasRolled}`;
    if (key !== previousBotTurnRef.current) {
      previousBotTurnRef.current = key;
      botTurnStartRef.current = Date.now();
    }
  }, [gameState?.currentPlayerIndex, gameState?.hasRolled]);

  useEffect(() => {
    if (botProcessorId !== socketService.playerId || !gameState?.players[gameState.currentPlayerIndex]?.isBot ||
        gameState.phase !== 'main' || !gameState.hasRolled || isDiceRolling) return;
    const timer = setInterval(() => {
      if (controllerRef.current === socketService.playerId && socketService.isConnected &&
          Date.now() - botTurnStartRef.current >= BOT_TURN_LIMIT_MS) nextTurn();
    }, 500);
    return () => clearInterval(timer);
  }, [gameState, botProcessorId, isDiceRolling, nextTurn]);

  useEffect(() => {
    if (!gameState || gameState.phase !== 'discard' || isDiceRolling || botProcessorId !== socketService.playerId) return;
    const timers = gameState.pendingDiscards.filter(item => gameState.players[item.playerId]?.isBot).map(item =>
      setTimeout(() => {
        if (controllerRef.current === socketService.playerId && socketService.isConnected)
          discardCards(item.playerId, chooseBotDiscard(gameState.players[item.playerId], item.amount));
      }, 600));
    return () => timers.forEach(clearTimeout);
  }, [gameState, botProcessorId, isDiceRolling, discardCards]);

  useEffect(() => {
    if (!gameState || !roomState || isDiceRolling || botProcessorId !== socketService.playerId) return;
    const player = gameState.players[activePlayerId];
    if (!player?.isBot) return;
    const timer = setTimeout(() => {
      if (controllerRef.current !== socketService.playerId || !socketService.isConnected) return;
      const state = gameState;
      const wake = () => setBotWakeTick(value => value + 1);
      if (state.phase === 'initial_dice_roll') { if (!state.hasRolled) rollDice(); return; }
      if (['discard', 'finished', 'order_determination', 'rolling_7'].includes(state.phase)) return;
      if (state.phase === 'gold_selection') {
        const amount = state.pendingGoldRewards[0]?.amount || 0;
        const chosen = chooseBotResources(state, player, amount);
        selectGoldResource(chosen);
        return;
      }
      if (state.phase === 'monopoly') { resolveMonopoly(chooseBotMonopoly(state, player)); return; }
      if (state.phase === 'robber' || state.phase === 'robber_move') {
        const target = chooseBotBlockade(state, player);
        if (target) (target.pirate ? movePirate : moveRobber)(target.id);
        return;
      }
      if (state.phase === 'stealing') {
        if (state.selectedStealTarget != null) stealResource(state.selectedStealTarget);
        else {
          const target = state.pendingStealFrom.map(id => state.players[id]).filter(Boolean)
            .sort((a, b) => publicScore(state, b) - publicScore(state, a))[0];
          if (target) selectStealTarget(target.id);
        }
        return;
      }
      const villageMoves = vertices.filter(v => checkIsValidVertex(v.id, 'settlement'));
      if (state.phase === 'setup' && state.settlements.filter(v => v.playerId === player.id).length ===
          [...state.roads, ...state.ships].filter(path => path.playerId === player.id).length) {
        const village = chooseSetupVillage(state, player, villageMoves);
        if (village) buildSettlement(village.id, village.hexIds);
        return;
      }
      const plans = planBotBuilds(state, player, {
        villages: villageMoves,
        cities: vertices.filter(v => checkIsValidVertex(v.id, 'city')),
        roads: edges.filter(e => checkIsValidEdge(e.id, 'road')).map(e => e.id),
        ships: edges.filter(e => checkIsValidEdge(e.id, 'ship')).map(e => e.id),
        edges: edges.map(e => e.id),
      });
      const goal = chooseBotGoal(player, plans);
      const execute = (plan: typeof plans[number]) => {
        if (plan.type === 'city') upgradeToCity(plan.id);
        else if (plan.type === 'settlement') buildSettlement(plan.id, plan.hexIds);
        else if (plan.type === 'road') buildRoad(plan.id);
        else if (plan.type === 'ship') buildShip(plan.id);
        else buyDevCard();
      };
      if (state.phase === 'year_of_plenty') {
        const selected = chooseBotResources(state, player, 2, goal?.cost);
        const cards = botResources.flatMap(r => Array(selected[r]).fill(r));
        resolveYearOfPlenty(cards[0] || ResourceType.Ore, cards[1] || cards[0] || ResourceType.Ore);
        return;
      }
      if (state.phase === 'setup' || state.phase === 'road_building') {
        const path = plans.find(plan => plan.type === 'road' || plan.type === 'ship');
        if (path) execute(path);
        else if (state.phase === 'road_building') syncGameState({ ...state, phase: 'main', freeRoads: 0, playingDevCard: null });
        return;
      }
      if (state.phase !== 'main') return;
      if (state.hasRolled && Date.now() - botTurnStartRef.current >= BOT_TURN_LIMIT_MS) { nextTurn(); return; }
      const pending = state.tradeOffers?.find(offer => offer.initiatorId === player.id && offer.status === 'pending');
      if (pending) {
        const partner = pending.acceptedBy.map(id => state.players[id]).find(other => other && canPay(other, pending.request));
        if (!canPay(player, pending.offer) || Date.now() - (pending.createdAt || 0) >= BOT_TRADE_WAIT_MS) cancelTrade(pending.id);
        else if (partner) { socketService.sendFinalizeTrade(roomState.roomId, pending.id, partner.id); wake(); }
        else wake();
        return;
      }
      const card = chooseBotDevCard(state, player, plans);
      if (card) { playDevCard(card); return; }
      if (!state.hasRolled) { rollDice(); return; }
      const affordable = plans.find(plan => canPay(player, plan.cost) && (plan.type !== 'road' && plan.type !== 'ship' || plan.score > 1));
      if (affordable) { execute(affordable); return; }
      const proposal = proposeBotTrade(player, goal, state.botTradesThisTurn || 0, state.botTradeSignatures || []);
      if (proposal) { proposeTrade(proposal.offer, proposal.request, null); return; }
      const bank = chooseBotBankTrade(state, player, goal);
      if (bank) { tradeWithBank(bank.give, bank.receive); return; }
      nextTurn();
    }, 650);
    return () => clearTimeout(timer);
  }, [gameState, roomState?.roomId, botWakeTick, activePlayerId, botProcessorId, isDiceRolling, vertices, edges,
    checkIsValidVertex, checkIsValidEdge, buildSettlement, buildRoad, buildShip, upgradeToCity, rollDice, nextTurn,
    moveRobber, movePirate, stealResource, selectStealTarget, selectGoldResource, resolveYearOfPlenty, resolveMonopoly,
    playDevCard, tradeWithBank, buyDevCard, proposeTrade, cancelTrade, syncGameState]);

  useEffect(() => {
    if (gameState?.phase !== 'initial_dice_roll' || !gameState.hasRolled || botProcessorId !== socketService.playerId) return;
    const timer = setTimeout(resolveInitialRoll, 3600);
    return () => clearTimeout(timer);
  }, [gameState?.phase, gameState?.hasRolled, botProcessorId, resolveInitialRoll]);

  useEffect(() => {
    if (!gameState || !roomState || botProcessorId !== socketService.playerId) return;
    const timer = setTimeout(() => {
      if (controllerRef.current !== socketService.playerId || !socketService.isConnected) return;
      for (const offer of gameState.tradeOffers || []) {
        if (offer.status !== 'pending') continue;
        for (const player of gameState.players) {
          if (!player.isBot || player.id === offer.initiatorId || (offer.targetPlayerId !== null && offer.targetPlayerId !== player.id) ||
              offer.acceptedBy.includes(player.id) || offer.rejectedBy.includes(player.id)) continue;
          socketService.sendReactToTrade(roomState.roomId, offer.id, player.id, acceptBotTrade(gameState, player, offer) ? 'accept' : 'reject');
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [gameState?.tradeOffers, gameState?.players, botProcessorId, roomState?.roomId]);

  const handleStartGame = async () => {
    setIsStartingGame(true);
    setSailingText("正在驶入海域......");
    setShowSailingScreen(true);
    // Yield to the browser so the Sailing screen renders before blocking
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!roomState) { setIsStartingGame(false); setShowSailingScreen(false); return; }
    if (roomState.hostId !== socketService.playerId) { setIsStartingGame(false); setShowSailingScreen(false); return; }
    
    const allReady = roomState.players.every(p => p.isReady);
    if (!allReady) {
      console.warn("请等待所有玩家就绪后再开始游戏");
      setIsStartingGame(false);
      setShowSailingScreen(false);
      return;
    }

    const totalBotCount = roomState.settings?.botConfig?.filter(b => b).length || 0;
    const totalPlayersCount = roomState.players.length + totalBotCount;
    const requiredPlayers = roomState.settings?.playerCount || 4;
    
    if (totalPlayersCount !== requiredPlayers) {
        console.warn(`游戏需要配置刚好 ${requiredPlayers} 名玩家（包含真实玩家和机器人）`);
        setIsStartingGame(false);
        setShowSailingScreen(false);
        return;
    }

    const assignedSessions = roomState.players.map(p => p.id);
    const assignedNames = roomState.players.map(p => p.name);
    
    // Instead of directly initGame, set to initial_dice_roll phase
    const configuredSlots = getSetupSlots(roomState).filter(slot => slot.isBot || slot.player);
    const initialState = initGame(
      roomState.settings.playerCount, 
      roomState.settings.mapType as MapType, 
      roomState.settings.customBoard, 
      configuredSlots.map(slot => slot.isBot),
      assignedSessions,
      assignedNames,
      configuredSlots.map(slot => slot.index + 1),
      configuredSlots.map(slot => normalizeBotDifficulty(roomState.settings.botDifficulties?.[slot.index]))
    );
    
    if (initialState) {
      // Set to initial_dice_roll and initialize empty rolls
      const initialStateWithRolls = {
        ...initialState,
        phase: 'initial_dice_roll' as const,
        initialDiceRolls: {}
      };
      if (roomState?.roomId) {
        socketService.startGame(roomState.roomId, initialStateWithRolls);
      }
    } else {
      setIsStartingGame(false);
      setShowSailingScreen(false);
    }
  };

  const isHostInLobby = !isSpectator && (!roomState || roomState.hostId === socketService.playerId);

  const standard2PlayerMap = useMemo(() => {
    const originalMathRandom = Math.random;
    try {
      Math.random = seededRandom(mapPreviewSeed);
      const topology = generateMapTopology('standard', 2);
      return distributeResources(topology, 'standard', 2);
    } finally {
      Math.random = originalMathRandom;
    }
  }, [generateMapTopology, distributeResources, mapPreviewSeed]);

  const archipelago6PlayerMap = useMemo(() => {
    const originalMathRandom = Math.random;
    try {
      Math.random = seededRandom(mapPreviewSeed + 86420);
      const topology = generateMapTopology('archipelago', 6);
      return distributeResources(topology, 'archipelago', 6);
    } finally {
      Math.random = originalMathRandom;
    }
  }, [generateMapTopology, distributeResources, mapPreviewSeed]);

  // Flexible style for Login and Lobby
  const flexibleContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    touchAction: 'pan-y'
  };

  // Locked landscape style for the Game
  const lockedLandscapeStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'fixed',
    top: 0,
    left: 0,
    overflow: 'hidden',
    touchAction: 'none',
    backgroundColor: '#f5f2ed'
  };

  const gameContainerBaseStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f5f2ed',
    color: '#1a1a1a',
    overflow: 'hidden',
    position: 'relative'
  };

  const portraitRotatedStyle: React.CSSProperties = {
    ...gameContainerBaseStyle,
    width: `${windowSize.height}px`,
    height: `${windowSize.width}px`,
    transform: 'rotate(90deg)',
    transformOrigin: 'top left',
    position: 'absolute',
    top: 0,
    left: `${windowSize.width}px`,
    padding: 0
  };

  const landscapeStyle: React.CSSProperties = {
    ...gameContainerBaseStyle,
    width: '100%',
    height: '100%',
    padding: 0
  };

  const exitToast = showBackInterceptToast ? <div role="status" className="exit-toast">再按一次返回键退出卡坦岛</div> : null;
  if (isAuthLoading) {
    return null;
  }

  if (!currentUser) {
    return <><LoginScreen onLoginSuccess={user => setCurrentUser(user)} />{exitToast}</>;
  }

  const actingPlayer = gameState?.players ? gameState.players[activePlayerId] : undefined;
  const settlementsCount = (gameState?.settlements || []).filter(s => s.playerId === activePlayerId).length;
  const roadsCount = (gameState?.roads || []).filter(r => r.playerId === activePlayerId).length;
  const shipsCount = (gameState?.ships || []).filter(s => s.playerId === activePlayerId).length;
  const totalRoadsAndShips = roadsCount + shipsCount;
  
  const canTrade = gameState?.phase === 'main' && gameState.hasRolled && !gameState.hasBuiltThisTurn && isMyHumanTurn;
  const canPlayDevCard = gameState?.phase === 'main' && isMyHumanTurn;

  const leftWidth = isMobile ? Math.max(logicalWindowSize.width * 0.18, 160) : 280;
  const rightWidth = isMobile ? Math.max(logicalWindowSize.width * 0.20, 180) : 280;
  const stageWidth = logicalWindowSize.width - leftWidth - rightWidth;
  const headerHeight = isMobile ? 48 : 58;

  const nextAction = (() => {
    if (!gameState) return null;
    const actingPlayerName = actingPlayer?.name || `玩家 ${activePlayerId + 1}`;
    
    if (gameState.phase === 'order_determination' || gameState.phase === 'initial_dice_roll') {
      const myRolls = gameState.initialDiceRolls[myPlayerIndex];
      const hasRolled = myRolls && myRolls.length > 0;
      if (activePlayerId === myPlayerIndex) {
        return hasRolled ? "等待结果..." : "请掷骰决定顺序";
      }
      return hasRolled ? "等待结果..." : `等待 ${actingPlayerName} 掷骰`;
    }

    if (gameState.phase === 'setup') {
      return activePlayerId === myPlayerIndex 
        ? "初始建设：请放置建筑" 
        : `等待 ${actingPlayerName} 建设`;
    }

    if (activePlayerId === myPlayerIndex) {
      if (!gameState.hasRolled && gameState.phase === 'main') return "请掷骰子回合开始";
      if (gameState.phase === 'main') return "交易与建设中";
      if (gameState.phase === 'discard') return "请弃置一半资源";
      if (gameState.phase === 'robber' || gameState.phase === 'robber_move') return "请移动强盗";
      if (gameState.phase === 'stealing') return "请选择窃取对象";
      if (gameState.phase === 'road_building') return "建设道路/船只";
      if (gameState.phase === 'year_of_plenty') return "领取丰收资源";
      if (gameState.phase === 'monopoly') return "执行资源垄断";
      if (gameState.phase === 'gold_selection') return "领取金矿奖励";
    }

    // Waiting for others
    const phaseShortNames: Record<string, string> = {
      'main': '回合中',
      'discard': '弃牌中',
      'robber': '移动强盗',
      'robber_move': '移动强盗',
      'stealing': '窃取中',
      'road_building': '道路/船只建设',
      'year_of_plenty': '丰收之年',
      'monopoly': '垄断中',
      'gold_selection': '奖励确认'
    };
    const phaseDesc = phaseShortNames[gameState.phase] || '行动中';
    return `${actingPlayerName} ${phaseDesc}...`;
  })();

  const renderGameModals = () => (
    <>
      <AnimatePresence>
        {showRulesModal && (
          <RulesModal 
            isOpen={showRulesModal} 
            onClose={() => { setShowRulesModal(false); setRulesActiveView('menu'); }} 
            activeView={rulesActiveView} 
            onActiveViewChange={setRulesActiveView} 
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSoundModal && (
          <SoundSettingsModal 
            isOpen={showSoundModal} 
            onClose={() => setShowSoundModal(false)} 
            isAdmin={currentUser?.role === 'admin'}
            gameContainerRef={gameContainerRef}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPwaGuide && (
          <PwaGuideModal 
            isOpen={showPwaGuide} 
            onClose={() => setShowPwaGuide(false)} 
            onInstall={handleInstallPwa}
            hasDeferredPrompt={!!deferredPrompt}
          />
        )}
      </AnimatePresence>
    </>
  );

  const renderNonGameWrapper = (content: React.ReactNode) => {
    return (
      <div 
        className="app-screen app-safe-top bg-slate-50"
      >
        {content}
      </div>
    );
  };

  let mainContent: React.ReactNode = null;

  if (!roomState) {
    mainContent = renderNonGameWrapper(
      <div 
        onTouchStart={lobbySwipe.onTouchStart}
        onTouchMove={lobbySwipe.onTouchMove}
        onTouchEnd={lobbySwipe.onTouchEnd}
        onTouchCancel={lobbySwipe.onTouchCancel}
        data-lobby-tabs={activeLobbyTab}
        data-subpage={(activeLobbyTab === 'profile' && profileActiveView !== 'menu') || (activeLobbyTab === 'rules' && rulesActiveView !== 'menu') ? 'true' : undefined}
        style={{ touchAction: 'pan-y' }}
        className="flex flex-col h-full w-full bg-slate-50 font-sans relative overflow-hidden text-slate-900"
      >
        <div
          data-lobby-panels
          style={{
            width: '400%',
            display: 'flex',
            flex: '1 1 0%',
            minHeight: 0,
            transform: `translate3d(calc(-${['lobby', 'rooms', 'profile', 'rules'].indexOf(activeLobbyTab) * 25}% + ${lobbySwipe.offset}px), 0, 0)`,
            transition: lobbySwipe.dragging ? 'none' : 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Tab 1: lobby */}
          <div inert={activeLobbyTab !== 'lobby'} aria-hidden={activeLobbyTab !== 'lobby'} className="w-[25%] h-full flex-shrink-0 relative overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="relative z-10 flex flex-col items-center h-full w-full px-6 max-w-sm mx-auto pt-[15vh]"
            >
              <SmartImg src={CATAN_LOGO_IMG} alt="Catan Logo" className="w-14 h-14 sm:w-20 sm:h-20 object-contain drop-shadow-lg mb-4 cursor-pointer" onClick={handleLogoClick} />
              <h1 className="text-lg sm:text-xl font-serif font-black italic mb-8 text-slate-800 tracking-tight leading-none">CATAN</h1>
              
              {!isStandalone && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowPwaGuide(true)}
                  className="mb-6 -mt-3 px-3.5 py-2 rounded-full bg-indigo-50 hover:bg-indigo-100/60 border border-indigo-100/50 text-[11px] sm:text-xs font-bold text-indigo-600 transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-600/5 cursor-pointer"
                >
                  <Smartphone size={13} className="text-indigo-500 animate-pulse" />
                  <span>为获取最佳体验，建议添加到主屏幕</span>
                </motion.button>
              )}
              
              <div className="flex flex-col gap-4 text-left w-full">
                  <div className="group">
                    <label className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-0.5 block group-focus-within:text-indigo-600 transition-colors">房间代码</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={inputRoomId}
                        readOnly={isRoomLocked || isJoinedLobby}
                        onChange={e => {
                          if (isRoomLocked) return;
                          const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                          setInputRoomId(val);
                        }}
                        placeholder="6位房间代码"
                        className={`w-full ${isRoomLocked ? 'bg-slate-100 text-slate-500 cursor-not-allowed opacity-80' : 'bg-white focus:bg-white'} border-2 border-slate-200 px-4 py-3 rounded-xl outline-none font-black font-mono tracking-[0.3em] text-center transition-all focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 text-sm shadow-sm`}
                      />
                    </div>
                  </div>
                  
                  <button 
                    id="join-room-button"
                    type="button"
                    disabled={isJoinedLobby}
                    aria-busy={isJoinedLobby}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isJoinedLobbyRef.current) return;
                      isJoinedLobbyRef.current = true;
                      const activeRoom = localStorage.getItem('catan_active_room');
                      const enteredCode = inputRoomId.trim();
                      const targetRoom = (isRoomLocked && activeRoom) ? activeRoom : (enteredCode || Math.floor(100000 + Math.random() * 900000).toString());
                      
                      if (!inputRoomId.trim()) {
                        setInputRoomId(targetRoom);
                      }
                      
                      const asSpec = (isRoomLocked && activeRoom) ? (isSpectator || localStorage.getItem('catan_is_spectator') === 'true') : false;
                      if (!asSpec) {
                        setIsJoinSpectator(false);
                        localStorage.removeItem('catan_is_spectator');
                      }
                      localStorage.setItem('catan_active_room', targetRoom);
                      localStorage.setItem('catan_has_created_room', 'true');
                      setIsRoomLocked(true);

                      const newUrl = new URL(window.location.href);
                      newUrl.searchParams.set('room', targetRoom);
                      window.history.replaceState(window.history.state, '', newUrl.pathname + newUrl.search);

                      if (localStorage.getItem('catan_game_active') === 'true') {
                        setSailingText('重新驶入海域');
                        setShowSailingScreen(true);
                      }
                      setIsJoinedLobby(true);
                      socketService.connect();
                      socketService.joinRoom(targetRoom, playerName, asSpec);
                    }}
                    className="join-room-button w-full bg-indigo-600 text-white py-3 rounded-xl font-black uppercase tracking-[0.2em] hover:bg-indigo-700 hover:shadow-[0_8px_30px_rgba(79,70,229,0.3)] active:scale-[0.98] transition-all relative overflow-hidden group text-sm shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] cursor-pointer disabled:cursor-wait touch-manipulation z-20"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <Swords size={16} />
                      进入海域
                    </span>
                    <div className="join-room-sheen absolute inset-0 bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-500 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  </button>
              </div>
            </motion.div>
          </div>

          {/* Tab 2: rooms */}
          <div inert={activeLobbyTab !== 'rooms'} aria-hidden={activeLobbyTab !== 'rooms'} className="w-[25%] h-full flex-shrink-0 relative overflow-hidden">
             <div className="w-full h-full flex flex-col">
               <GameRoomsTab 
                 currentUser={currentUser} 
                 isRoomLocked={isRoomLocked}
                 activeRoomId={localStorage.getItem('catan_active_room')}
                 onUserFoundInRoom={(roomId) => {
                   setInputRoomId(roomId);
                   setIsRoomLocked(true);
                   localStorage.setItem('catan_active_room', roomId);
                   localStorage.setItem('catan_has_created_room', 'true');
                 }}
                 onReturnToGame={(roomId) => {
                  const activeRoom = roomId || localStorage.getItem('catan_active_room');
                  if (activeRoom) {
                    setSailingText('重新驶入海域');
                    setShowSailingScreen(true);
                    setInputRoomId(activeRoom);
                    const asSpec = isSpectator || localStorage.getItem('catan_is_spectator') === 'true';
                    setIsJoinedLobby(true);
                    socketService.connect();
                    socketService.joinRoom(activeRoom, playerName, asSpec);
                  } else {
                    setActiveLobbyTab('lobby');
                  }
                }}
                onJoinRoom={(roomId) => {
                  setInputRoomId(roomId);
                  localStorage.setItem('catan_active_room', roomId);
                  localStorage.setItem('catan_has_created_room', 'true');
                  setIsRoomLocked(true);
                  setIsJoinedLobby(true);
                  socketService.connect();
                  socketService.joinRoom(roomId, playerName);
                }}
                onSpectateRoom={(roomId) => {
                  setInputRoomId(roomId);
                  localStorage.setItem('catan_player_name', playerName);
                  localStorage.setItem('catan_is_spectator', 'true');
                  setIsJoinSpectator(true);
                  setIsJoinedLobby(true);
                  socketService.connect();
                  socketService.joinRoom(roomId, playerName, true);
                }}
               />
             </div>
          </div>

          {/* Tab 3: profile */}
          <div inert={activeLobbyTab !== 'profile'} aria-hidden={activeLobbyTab !== 'profile'} className="w-[25%] h-full flex-shrink-0 relative overflow-hidden">
            <div className="w-full h-full flex flex-col relative overflow-hidden">
              <UserProfileModal
                currentUser={currentUser}
                onClose={() => {}}
                onUpdateSuccess={(updatedUser) => setCurrentUser(updatedUser)}
                onLogout={handleFullLogout}
                inline={true}
                isActive={activeLobbyTab === 'profile'}
                disableHistory={true}
                onRestoreGame={handleRestoreGame}
                activeView={profileActiveView}
                onActiveViewChange={setProfileActiveView}
              />
            </div>
          </div>

          {/* Tab 4: rules */}
          <div inert={activeLobbyTab !== 'rules'} aria-hidden={activeLobbyTab !== 'rules'} className="w-[25%] h-full flex-shrink-0 relative overflow-hidden">
            <div className="w-full h-full flex flex-col relative overflow-hidden">
              <RulesModal isOpen={true} isActive={activeLobbyTab === 'rules'} onClose={() => {}} inline={true} activeView={rulesActiveView} onActiveViewChange={setRulesActiveView} />
            </div>
          </div>
        </div>
        {/* Bottom Tab Bar */}
        <div hidden={(activeLobbyTab === 'profile' && profileActiveView !== 'menu') || (activeLobbyTab === 'rules' && rulesActiveView !== 'menu')} className="lobby-tab-bar shrink-0 w-full bg-white border-t border-slate-100 pt-1.5 px-6 flex justify-center gap-10 sm:gap-16 z-50">
           <button
             onClick={() => setActiveLobbyTab('lobby')}
             className={`flex flex-col items-center gap-0 transition-all ${activeLobbyTab === 'lobby' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <div className={`p-1 rounded-xl transition-all ${activeLobbyTab === 'lobby' ? '' : ''}`}>
               <Swords size={18} />
             </div>
             <span className="text-[9px] font-bold tracking-widest">约战</span>
           </button>

           <button
             onClick={() => setActiveLobbyTab('rooms')}
             className={`flex flex-col items-center gap-0 transition-all ${activeLobbyTab === 'rooms' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <div className={`p-1 rounded-xl transition-all ${activeLobbyTab === 'rooms' ? '' : ''}`}>
               <Home size={18} />
             </div>
             <span className="text-[9px] font-bold tracking-widest">大厅</span>
           </button>

           <button
             onClick={() => setActiveLobbyTab('profile')}
             className={`flex flex-col items-center gap-0 transition-all ${activeLobbyTab === 'profile' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <div className="p-1 rounded-xl transition-all relative">
               <User size={18} />
               {hasUnreadPrivateMsgs && (
                 <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
               )}
             </div>
             <span className="text-[9px] font-bold tracking-widest">我的</span>
           </button>

           <button
             onClick={() => setActiveLobbyTab('rules')}
             className={`flex flex-col items-center gap-0 transition-all ${activeLobbyTab === 'rules' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <div className={`p-1 rounded-xl transition-all ${activeLobbyTab === 'rules' ? '' : ''}`}>
               <BookOpen size={18} />
             </div>
             <span className="text-[9px] font-bold tracking-widest">规则</span>
           </button>
        </div>
      </div>
    );
  } else if (!gameStarted) {
    mainContent = renderNonGameWrapper(
      <>
      <MapAlbumModal
        isOpen={showMapAlbum}
        onClose={() => setShowMapAlbum(false)}
        savedMaps={savedMaps}
        currentUser={currentUser}
        onSelectMap={useSavedMap}
        onDeleteMap={deleteSavedMap}
        onRenameMap={renameSavedMap}
        onUploadMap={uploadMapToCloud}
        onGenerateNew={() => {
          setShowMapAlbum(false);
          setShowMapGenerator(true);
        }}
        albumFilter={albumFilter}
        setAlbumFilter={setAlbumFilter}
        MapPreviewRenderer={MapPreview}
        selectedMapId={roomState?.settings?.customMapId}
      />

      <MapGeneratorModal
        isOpen={showMapGenerator}
        onClose={() => setShowMapGenerator(false)}
        playerCount={roomState?.settings?.playerCount || 4}
        mapType={roomState?.settings?.mapType as MapType || 'standard'}
        generatePreview={generatePreview}
        saveMapToAlbum={saveMapToAlbum}
        startWithPreviewMap={usePreviewMap}
        previewBoard={previewBoard}
        MapPreviewRenderer={MapPreview}
      />

      <SaveMapConfirmModal
        isOpen={!!mapSaveDialog}
        onClose={() => setMapSaveDialog(null)}
        defaultName={mapSaveDialog?.name || ''}
        isAdmin={currentUser?.role === 'admin'}
        onSave={handleConfirmSaveMap}
      />

      {confirmAction && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-transparent transition-all pointer-events-auto">
          <div className="bg-white/95 border border-slate-200/90 rounded-xl p-4 shadow-xl max-w-[280px] sm:max-w-xs w-full mx-auto animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-xs sm:text-sm font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block shrink-0" />
              操作确认
            </h3>
            <p className="text-[11px] sm:text-xs font-medium text-slate-600 leading-relaxed mb-4">{confirmAction.message}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  confirmAction.onConfirm();
                  setConfirmAction(null);
                }}
                className="px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      
      <div style={flexibleContainerStyle}>
        <div className="flex flex-col sm:flex-row h-full w-full bg-[#f8fafc] font-sans overflow-y-auto sm:overflow-hidden no-scrollbar relative selection:bg-indigo-600 selection:text-white">
        {/* Decorative Background Gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,_rgba(79,70,229,0.08)_0%,_rgba(79,70,229,0)_60%)] pointer-events-none z-0" />
        
        {/* Left Side: Branding & Controls */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex-none sm:flex-1 flex flex-col p-3 sm:p-4 lg:p-5 relative z-10 overflow-visible sm:overflow-hidden min-h-[min-content] sm:min-h-0 shrink-0 justify-between"
        >
          {/* Header & Logo Section */}
          <div className="flex items-center gap-2.5 px-1 pb-2 relative cursor-pointer shrink-0 border-b border-slate-100/80" onClick={handleLogoClick}>
            <div className="relative shrink-0 flex items-center justify-center group">
              {isSpectator && (
                <div className="absolute inset-0 z-50 pointer-events-auto bg-transparent cursor-default" title="观战模式" />
              )}
              <SmartImg src={CATAN_LOGO_IMG} alt="Catan Logo" className="w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11 object-contain relative z-10 group-hover:scale-105 transition-transform duration-300" />
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-serif font-black italic tracking-tighter text-slate-900 leading-none">CATAN</h1>
            </div>
          </div>

          <div className="w-full max-w-lg space-y-2.5 sm:space-y-3 px-1 flex flex-col justify-end min-h-0 mt-2 sm:mt-0">
            {/* Map Settings */}
            <div className={!isHostInLobby ? 'opacity-70 pointer-events-none' : ''}>
              <div className="flex items-center justify-between mb-1.5 ml-1">
                <h3 className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">地图选择</h3>
                {isHostInLobby && <span className="text-[8px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">配置中</span>}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'standard', label: '标准大陆', board: standard2PlayerMap, desc: '经典单块大陆 · 10分获胜' },
                  { id: 'archipelago', label: '群岛世界', board: archipelago6PlayerMap, desc: '探索独立岛屿 · 14分获胜' }
                ].map(map => {
                  const isSelected = mapType === map.id && !roomState?.settings?.customBoard;
                  return (
                    <button
                      key={map.id}
                      onClick={() => syncSettings({ mapType: map.id, customBoard: undefined, customMapName: undefined, customMapId: undefined })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-300 border ${isSelected ? 'bg-white border-indigo-500 shadow-md shadow-indigo-100 ring-2 ring-indigo-500/10' : 'bg-white/60 border-slate-100 hover:border-indigo-200 hover:bg-white text-slate-700'}`}
                    >
                      <div className={`w-12 h-8 sm:w-16 sm:h-10 relative overflow-hidden flex items-center justify-center transition-transform duration-300 ${isSelected ? 'scale-105' : ''}`}>
                        <div className="absolute inset-x-0 inset-y-[-20%] pointer-events-none">
                          <MapPreview board={map.board} isTopologyOnly={true} isLogo={true} />
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] ${isSelected ? 'text-indigo-600' : ''}`}>{map.label}</span>
                        <span className="text-[7px] opacity-50 font-bold mt-0.5 uppercase tracking-wider">{map.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 items-stretch pt-0.5">
              {isHostInLobby ? (
                <button
                  onClick={() => setShowMapAlbum(true)}
                  className={`w-full flex flex-col items-center justify-center p-2 rounded-xl transition-all group overflow-hidden relative border ${roomState?.settings?.customBoard ? 'bg-white border-indigo-500 shadow-md shadow-indigo-100 ring-2 ring-indigo-500/10' : 'bg-indigo-50/60 border-indigo-100/60 hover:bg-indigo-100/50'}`}
                >
                  {roomState?.settings?.customBoard ? (
                    <div className="absolute inset-0 opacity-100 group-hover:scale-105 transition-transform duration-300">
                      <MapPreview board={roomState.settings.customBoard} isTopologyOnly={true} isLogo={true} />
                    </div>
                  ) : (
                    <>
                      <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center relative mb-0.5">
                        {!atlasLogoError ? (
                          <SmartImg 
                            src={MAP_ALBUM_ICON} 
                            className="w-full h-full object-contain relative z-10" 
                            alt="Atlas" 
                            referrerPolicy="no-referrer"
                            onError={() => setAtlasLogoError(true)}
                          />
                        ) : (
                          <span className="text-lg">🗺️</span>
                        )}
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-widest text-indigo-900 mt-0.5 relative z-10">地图收藏册</span>
                    </>
                  )}
                </button>
              ) : (
                <div />
              )}

              <div className="w-full flex flex-col gap-1.5 justify-center">
                {!roomState?.players.find(p => p.id === socketService.playerId)?.isReady ? (
                  <button 
                    onClick={handleToggleReady}
                    disabled={isSpectator}
                    className={`relative z-50 w-full bg-emerald-600 text-white py-2 sm:py-2.5 rounded-xl font-black uppercase tracking-[0.15em] shadow-md shadow-emerald-200 hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] disabled:opacity-30 disabled:cursor-not-allowed disabled:grayscale ${isSpectator ? 'opacity-50 grayscale' : ''}`}
                  >
                    <Play size={isMobile ? 11 : 13} fill="currentColor" />
                    {isHostInLobby ? '就绪' : '准备游戏'}
                  </button>
                ) : (
                  <button 
                    onClick={handleToggleReady}
                    disabled={isSpectator}
                    className={`w-full bg-white text-slate-500 py-2 sm:py-2.5 rounded-xl font-black uppercase tracking-[0.15em] border-2 border-slate-100 hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] ${isSpectator ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                  >
                    <X size={isMobile ? 11 : 13} />
                    等待房主开启游戏
                  </button>
                )}
                {isHostInLobby && !isSpectator && (
                  <button 
                    onClick={handleStartGame}
                    disabled={isStartingGame || !roomState?.players.every(p => p.isReady) || !roomState || (roomState.players.length + (roomState.settings?.botConfig?.filter(b => b).length || 0)) !== roomState.settings?.playerCount}
                    className="w-full bg-slate-900 text-white py-2 sm:py-2.5 rounded-xl font-black uppercase tracking-[0.15em] shadow-md hover:bg-black active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:grayscale text-[9px] sm:text-[10px] relative overflow-hidden"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-1.5">
                      {isStartingGame ? (
                        <>
                          <div className="w-2.5 h-2.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                          生成中
                        </>
                      ) : (
                        roomState?.players.every(p => p.isReady) ? '开启游戏' : '等待全体玩家就绪'
                      )}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>


        {/* Right Side: Online Status & Room Info */}
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="w-full sm:h-full flex flex-col p-3 sm:p-4 lg:p-5 bg-white/80 sm:bg-white/60 backdrop-blur-3xl border-l border-slate-200/80 z-20 sm:w-[310px] md:w-[360px] lg:w-[410px] shrink-0 sm:overflow-hidden min-h-[min-content] sm:min-h-0 shadow-none"
        >
          <div className="flex flex-col gap-2.5 sm:gap-3 w-full max-w-sm mx-auto h-full justify-between">
            
            {/* Room Info Section */}
            <div className="relative shrink-0">
              <div className="bg-white p-2.5 rounded-xl border border-slate-100/90 shadow-2xs grid grid-cols-3 gap-1 items-center">
                {/* 1. 在线匹配玩家 and Player count */}
                <div className="flex flex-col items-center justify-center gap-1 pr-1 border-r border-slate-100/80">
                  <span className="text-[9px] uppercase font-black tracking-widest text-emerald-600 leading-none text-center block w-full truncate">在线匹配</span>
                  <div className={`flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-full border ${((roomState?.players.length || 0) + botConfig.filter(b => b).length) > playerCount ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${((roomState?.players.length || 0) + botConfig.filter(b => b).length) > playerCount ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    <span className="text-[10px] font-mono font-black tracking-tight leading-none">{(roomState?.players.length || 0) + botConfig.filter(b => b).length} / {playerCount}</span>
                  </div>
                </div>

                {/* 2. 设定人数 and dropdown */}
                <div className="flex flex-col items-center justify-center gap-1 px-1 border-r border-slate-100/80">
                  <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 leading-none text-center block w-full truncate">设定人数</span>
                  <div className="relative flex items-center justify-center">
                    <div className={`relative flex items-center gap-1 px-2 py-0.5 rounded-lg border ${
                      isHostInLobby 
                        ? 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/25 shadow-2xs active:scale-95' 
                        : 'bg-slate-100/40 border-slate-100'
                    } transition-all duration-200`}>
                      <select 
                        value={playerCount} 
                        onChange={e => {
                          const newCount = Number(e.target.value);
                          syncSettings({ playerCount: newCount });
                        }}
                        disabled={!isHostInLobby}
                        className="text-[11px] sm:text-[12px] font-mono font-black text-slate-800 outline-none disabled:opacity-50 appearance-none cursor-pointer pr-3.5 bg-transparent leading-none text-left"
                        style={{ width: 'auto', minWidth: '40px' }}
                      >
                        {[2, 3, 4, 5, 6].map(num => <option key={num} value={num}>{num} 人</option>)}
                      </select>
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* 3. 房间代码 and copy */}
                <div className="flex flex-col items-center justify-center gap-1 pl-1">
                  <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 leading-none text-center block w-full truncate">房间代码</span>
                  <div className="flex items-center justify-center gap-1 h-5 w-full">
                    <span className="text-[11px] sm:text-[12px] font-mono font-black text-slate-800 tracking-tight leading-none">{roomState?.roomId || inputRoomId}</span>
                    <div className="flex items-center gap-0.5">
                      <Eye size={9} className="text-slate-400" />
                      <span className="text-[9px] font-mono font-black text-slate-500">{roomState?.spectators?.length || 0}</span>
                    </div>
                    <button 
                      onClick={handleCopyRoomCode}
                      className="hover:bg-indigo-50 p-0.5 rounded transition-colors text-indigo-400 hover:text-indigo-600"
                      title="复制房间代码"
                    >
                      <Copy size={9} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Players List */}
            <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto pr-0.5 no-scrollbar py-0.5">
              {(roomState ? getSetupSlots(roomState) : []).map(({ index: globalIndex, isBot, player: p }) => {

                if (!isBot && p) {
                  return (
                    <div key={p.id} className="flex items-center justify-between p-1.5 sm:p-2 rounded-xl bg-white border border-slate-100 shadow-2xs transition-all hover:border-indigo-200 group">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 relative bg-slate-50 border border-slate-100">
                          <User size={12} className="text-slate-400" />
                          {roomState.hostId === p.id && (
                            <div className="absolute -top-1 -right-1 bg-indigo-600 border border-white text-white p-0.5 rounded-full text-[5px] shadow-xs" title="房主">👑</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-black text-[10px] sm:text-[11px] leading-none text-slate-800 tracking-tight flex items-center gap-1 truncate">
                            {p.name} {p.disconnected && <span className="text-red-500 text-[8px] animate-pulse">(掉线)</span>}
                          </span>
                          {p.id === socketService.playerId && <span className="text-[6px] font-black uppercase tracking-widest text-indigo-500 mt-0.5 block leading-none">这是我</span>}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        {isHostInLobby && p.id !== socketService.playerId && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  message: `确定要把 ${p.name} 降级为观众吗？`,
                                  onConfirm: () => socketService.demoteToSpectator(roomState.roomId, p.id)
                                });
                              }}
                              className="text-[8px] font-black bg-slate-100 text-slate-500 hover:bg-orange-100 hover:text-orange-600 px-1.5 py-0.5 rounded transition-colors"
                            >
                              降级
                            </button>
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  message: `确定要把 ${p.name} 踢出房间吗？`,
                                  onConfirm: () => socketService.kickPlayer(roomState.roomId, p.id)
                                });
                              }}
                              className="text-[8px] font-black bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 px-1.5 py-0.5 rounded transition-colors"
                            >
                              踢出
                            </button>
                          </div>
                        )}
                        {p.isReady ? (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <Check size={8} className="text-emerald-600" />
                            <span className="text-[7px] font-black uppercase tracking-widest text-emerald-600">已就绪</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                            <div className="w-1 h-1 rounded-full bg-slate-300 animate-pulse" />
                            <span className="text-[7px] font-black uppercase tracking-widest text-slate-400">筹备中</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={`empty-${globalIndex}`} data-ai-slot={globalIndex} data-configured={isBot} className={`flex items-center justify-between p-1.5 sm:p-2 rounded-xl border transition-all duration-300 ${isBot ? 'bg-white border-indigo-100/80 shadow-2xs' : 'bg-slate-50/50 border-dashed border-slate-200/80 hover:border-indigo-200 group'}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center transition-all ${isBot ? 'bg-indigo-50 border border-indigo-100' : 'border border-dashed border-slate-200/80 bg-white group-hover:bg-indigo-50/50'}`}>
                        {isBot ? <Bot size={12} className="text-indigo-600" /> : <Users size={10} className="text-slate-300" />}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-[10px] sm:text-[11px] font-black leading-tight ${isBot ? 'text-slate-800' : 'text-slate-400'}`}>{isBot ? `领主 AI ${globalIndex + 1}` : '未占领席位'}</span>
                        {isBot && <span className="text-[8px] font-bold text-indigo-400 leading-none mt-1">{BOT_LEVELS[normalizeBotDifficulty(roomState.settings.botDifficulties?.[globalIndex])].label} AI</span>}
                      </div>
                    </div>
                    {isHostInLobby && (
                      <div className="flex items-center gap-2 shrink-0">
                      <select aria-label={`AI ${globalIndex + 1} 难度`} className="text-[10px] border border-slate-200 rounded px-1 py-1 bg-white text-slate-600" value={normalizeBotDifficulty(roomState.settings.botDifficulties?.[globalIndex])} onChange={e => socketService.updateSettings(roomState.roomId, { botLevel: { index: globalIndex, difficulty: normalizeBotDifficulty(e.target.value) } })}>
                        {Object.entries(BOT_LEVELS).map(([value, level]) => <option key={value} value={value}>{level.label}</option>)}
                      </select>
                      <button 
                        onClick={() => socketService.toggleBot(roomState.roomId, globalIndex)}
                        disabled={!isBot && roomState.players.length + botConfig.filter(Boolean).length >= playerCount}
                        title={!isBot && roomState.players.length + botConfig.filter(Boolean).length >= playerCount ? '配置人数已满' : undefined}
                        className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${isBot ? 'bg-red-50 text-red-500 border-red-100 hover:bg-red-500 hover:text-white hover:border-red-500' : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-600 hover:text-white hover:border-indigo-600'}`}
                      >
                        {isBot ? '取消配置' : '配置AI玩家'}
                      </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {roomState?.spectators && roomState.spectators.length > 0 && (
              <div className="pt-1.5 border-t border-slate-100">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 px-1 flex items-center gap-1.5"><Eye size={9} /> 观众席 ({roomState.spectators.length})</h3>
                <div className="flex flex-col gap-1 overflow-y-auto max-h-20 pr-1 no-scrollbar">
                  {roomState.spectators.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-100 group">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded flex items-center justify-center bg-slate-200 text-slate-400">
                          <Eye size={9} />
                        </div>
                        <span className="font-black text-[9px] text-slate-600 truncate max-w-[90px]">{s.name} {s.disconnected && <span className="text-red-500 text-[7px] animate-pulse">(掉线)</span>}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {isHostInLobby && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  message: `确定要把 ${s.name} 升级为玩家吗？`,
                                  onConfirm: () => socketService.promoteToPlayer(roomState.roomId, s.id)
                                });
                              }}
                              className="text-[8px] font-black bg-slate-200 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 px-1 py-0.5 rounded transition-colors"
                            >
                              上船
                            </button>
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  message: `确定要把 ${s.name} 踢出房间吗？`,
                                  onConfirm: () => socketService.kickPlayer(roomState.roomId, s.id)
                                });
                              }}
                              className="text-[8px] font-black bg-slate-200 text-slate-600 hover:bg-red-100 hover:text-red-600 px-1 py-0.5 rounded transition-colors"
                            >
                              踢出
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="pt-1.5 pb-0.5 flex items-center justify-center gap-3 border-t border-slate-100 shrink-0">
               <button 
                 onClick={handleReturnToLobby}
                 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 py-0.5"
               >
                 <LogOut size={11} className="scale-x-[-1]" />
                 离开房间
               </button>
               
               {isHostInLobby && !isSpectator && (
                 <>
                   <div className="w-1 h-1 rounded-full bg-slate-200" />
                   <button 
                     onClick={() => {
                       const roomId = roomState?.roomId || inputRoomId;
                       if (roomId) {
                         setConfirmAction({
                           message: '确定要解散此房间吗？所有玩家将被移出。',
                           onConfirm: () => {
                             socketService.resetGame(roomId);
                           }
                         });
                       }
                     }}
                     className="text-[10px] font-black uppercase tracking-[0.15em] text-red-400 hover:text-red-600 transition-colors flex items-center gap-1 py-0.5"
                   >
                     <Trash2 size={10} />
                     解散房间
                   </button>
                 </>
               )}
            </div>
          </div>
        </motion.div>
      </div>
      {showDebugButton && (
        <button 
          onClick={() => {
            const newMode = !debugModeEnabled;
            setDebugModeEnabled(newMode);
            setShowDebugConsole(newMode);
          }}
          className="fixed bottom-4 left-4 z-50 bg-indigo-600 text-white p-3 rounded-full shadow-lg"
        >
          调试
        </button>
      )}

      {/* Game Action / Rule Warning Toast */}
      <AnimatePresence>
        {gameActionToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-[12px] sm:text-sm px-4 py-2 rounded-xl shadow-2xl whitespace-nowrap z-[99999] font-bold flex items-center gap-1.5"
          >
            <span>⚠️</span>
            <span>{gameActionToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Copy Toast fixed at screen level */}
      <AnimatePresence>
        {showCopyToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[12px] sm:text-sm px-4 py-2 rounded-xl shadow-2xl whitespace-nowrap z-[9999] font-medium"
          >
            已复制房间代码，去邀请好友来玩吧
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back Gesture Intercept Toast */}
      <AnimatePresence>
        {showBackInterceptToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white text-[11px] sm:text-xs px-5 py-2.5 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-2 z-[99999] font-bold text-center w-[90%] max-w-[320px] backdrop-blur-md"
          >
            <span className="text-amber-400 shrink-0">⚠️</span>
            <span>已为您拦截侧滑返回，避免误退游戏。</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
    );
  } else if (!gameState) {
    mainContent = (
      <>
        <div style={lockedLandscapeStyle}>
          <div className="flex flex-col items-center justify-center h-full w-full bg-sky-100 text-[#0c4a6e] relative overflow-hidden" >
            {/* Ocean atmosphere */}
            <div className="absolute inset-0 bg-white/40 pointer-events-none" />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center relative z-10"
            >
              <h1 className="text-6xl sm:text-8xl font-serif italic font-black mb-4 tracking-tighter text-[#0c4a6e] drop-shadow-[0_2px_10px_rgba(255,255,255,0.8)]">CATAN</h1>
              <div className="w-24 h-1 bg-indigo-200 mx-auto mb-10 overflow-hidden rounded-full">
                <motion.div 
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-full h-full bg-[#0369a1]"
                />
              </div>
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.5em] font-black text-[#0369a1]">连接卡坦岛......</p>
            </motion.div>
          </div>
        </div>
      </>
    );
  } else {
    mainContent = (
      <>
    {/* {isSpectator && roomState && (
      <button 
        onClick={handleReturnToLobby}
        className="fixed top-2 right-2 z-[9999] flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-full font-black uppercase tracking-[0.2em] shadow-md hover:bg-red-700 transition-all border border-white/20 pointer-events-auto text-[10px] group"
      >
        <LogOut size={12} className="group-hover:-translate-x-1 transition-transform" />
        <span>退出</span>
      </button>
    )} */}
    <div style={lockedLandscapeStyle}>
      <div 
        ref={gameContainerRef}
        data-portrait-rotated={shouldApplyPortraitRotation ? "true" : "false"}
        style={shouldApplyPortraitRotation ? portraitRotatedStyle : landscapeStyle}
        className="font-sans selection:bg-black selection:text-white"
      >

      <header className="w-full flex items-center bg-white border-b border-black/5 z-50 overflow-hidden" style={{ height: headerHeight }}>
        {/* Left: Logo & Room Code & 4 Action Buttons - Width aligned with left resource panel */}
        <div 
          style={{ width: leftWidth }} 
          className="flex items-center justify-between px-1 sm:px-2 h-full border-r border-black/5 shrink-0 bg-white overflow-hidden relative z-10"
        >
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1 cursor-default" onClick={handleLogoClick}>
            <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0 relative">
              {isSpectator && (
                <div className="absolute inset-0 z-50 pointer-events-auto bg-transparent cursor-default" title="观战模式" />
              )}
              <SmartImg src={CATAN_LOGO_IMG} alt="Catan Logo" className="w-full h-full object-contain drop-shadow-sm" />
            </div>
            <div className="flex flex-col justify-center font-sans min-w-0">
              <span className="text-[8px] sm:text-[9px] uppercase font-black tracking-wider text-stone-400 leading-none whitespace-nowrap mb-0.5">海域代码</span>
              <span className="text-[11px] sm:text-[13px] font-black tracking-tight text-stone-800 leading-none whitespace-nowrap">{roomState?.roomId || 'OFFLINE'}</span>
            </div>
          </div>

          {/* 4 Logo Buttons Grid: Compact 2x2 */}
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-0.5 shrink-0 ml-1 items-center justify-items-center">
            {/* Top-Left: Rules (Yellow line & fill) */}
            <button 
              onClick={(e) => { e.stopPropagation(); setShowRulesModal(true); }}
              className="text-amber-500 hover:text-amber-600 transition-all active:scale-90 flex items-center justify-center p-0.5"
              title="游戏规则"
            >
              <BookOpen size={13} strokeWidth={2.2} className="fill-amber-400/30" />
            </button>

            {/* Top-Right: Sound (Yellow line & fill) */}
            <button 
              onClick={(e) => { e.stopPropagation(); setShowSoundModal(true); }}
              className="text-amber-500 hover:text-amber-600 transition-all active:scale-90 flex items-center justify-center p-0.5"
              title="声音设置"
            >
              <Volume2 size={13} strokeWidth={2.2} className="fill-amber-400/30" />
            </button>

            {/* Bottom-Left: Spectator Eye (Red lines; Eye icon aligned with Book icon above) */}
            {(() => {
              const specCount = roomState?.spectators?.length || 0;
              const hasSpectators = specCount > 0;
              return (
                <div 
                  className={`p-0.5 relative flex items-center justify-center transition-all ${
                    hasSpectators 
                      ? 'text-red-500' 
                      : 'text-stone-400 hover:text-stone-500'
                  }`}
                  title={`观战人数: ${specCount}`}
                >
                  <Eye size={13} strokeWidth={2.2} className={hasSpectators ? 'text-red-500 fill-red-500/20' : 'text-stone-400'} />
                  <span className="absolute left-full ml-0.5 text-[9px] font-mono font-black leading-none">{specCount}</span>
                </div>
              );
            })()}

            {/* Bottom-Right: Exit button (Red line icon) */}
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (isHost && gameStarted) {
                  setShowExitOptions(true);
                } else {
                  handleReturnToLobby();
                }
              }}
              className="text-red-500 hover:text-red-600 transition-all active:scale-90 flex items-center justify-center p-0.5"
              title={isSpectator ? "退出观战" : "离开房间"}
            >
              <LogOut size={13} strokeWidth={2.2} className="scale-x-[-1]" />
            </button>
          </div>
        </div>

        {/* Center: Player Cards */}
        <div 
          ref={playerBarRef}
          className="flex-1 flex justify-start overflow-x-auto no-scrollbar py-1 px-4 sm:px-6"
        >
          <div className="flex items-center gap-2 lg:gap-4 pr-6 min-w-max">
            {gameState.players.map((p, i) => {
              const isCurrent = i === activePlayerId;
              const displayResources = (isDiceRolling && !isSpectator && displayedResourcesMap[p.id]) ? displayedResourcesMap[p.id] : p.resources;
              const resourceCount = Object.values(displayResources).reduce((a, b) => a + b, 0);
              const publicScore = (p.settlements * 1) + (p.cities * 2) + p.victoryPoints;
              const isFocused = isSpectator && i === spectatorFocusId;

              return (
                <div 
                  key={p.id} 
                  data-player-index={i}
                  onClick={() => {
                    console.log("Player card clicked for index:", i);
                    if (isSpectator) {
                      setSpectatorFocusId(prev => prev === i ? null : i);
                      console.log("Spectator focus set/unset to:", i);
                    }
                  }}
                  className={`relative shrink-0 group flex items-center ${isMobile ? 'gap-1 px-1.5 py-0.5' : 'gap-2 px-3 py-1'} rounded-full transition-all duration-500 
                    ${isCurrent ? 'bg-indigo-50 border border-indigo-100 shadow-sm' : 'opacity-60 hover:opacity-100'}
                    ${isFocused && !isCurrent ? 'ring-2 ring-indigo-400 bg-indigo-50/50 opacity-100' : ''}
                    ${isSpectator ? 'cursor-pointer active:scale-95' : 'cursor-default'}
                  `}>
                <div 
                  onClick={() => {
                    if (p.sessionId === socketService.playerId) {
                      toggleBot(p.id);
                    }
                  }}
                  className={`rounded-full border border-white ring-1 ring-black/10 flex items-center justify-center shrink-0 transition-transform ${isMobile ? 'w-5 h-5' : 'w-4 h-4'} ${p.sessionId === socketService.playerId ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
                  style={{ backgroundColor: p.color }}
                >
                  {p.isBot ? (
                    <Bot size={isMobile ? 10 : 8} color={p.color === '#F1C40F' ? '#000' : '#FFF'} />
                  ) : (
                    <User size={isMobile ? 10 : 8} color={p.color === '#F1C40F' ? '#000' : '#FFF'} />
                  )}
                </div>
                <div className="flex flex-col flex-1 pl-0.5">
                    <div className="flex items-center gap-1">
                      <span className={`${isMobile ? 'text-[9px]' : 'text-[11px]'} font-bold leading-none truncate max-w-[40px] md:max-w-[80px]`}>{p.name}</span>
                      {roomState?.players?.find(rp => rp.id === p.sessionId)?.disconnected && (
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] bg-red-100 text-red-600 px-1 py-0.5 rounded font-bold shadow-sm whitespace-nowrap animate-pulse">掉线</span>
                        </div>
                      )}
                      {gameState.longestRoadPlayerId === p.id && (
                        <div className="flex items-center justify-center px-0.5 py-[1px] rounded-sm bg-[#b79148]/20 border border-[#b79148]/40 shadow-sm" title={`最长道路 (${p.longestRoadLength})`}>
                          <SmartImg src={ROAD_ICON} alt="longest-road" className="w-2.5 h-2.5 object-contain" />
                        </div>
                      )}
                      {gameState.largestArmyPlayerId === p.id && (
                        <div className="flex items-center justify-center px-0.5 py-[1px] rounded-sm bg-slate-500/20 border border-slate-500/40 shadow-sm" title={`最大名望骑士 (${p.knightsPlayed})`}>
                          <span className="text-[8px] leading-none">⚔️</span>
                        </div>
                      )}
                      {((gameState.phase === 'initial_dice_roll' || gameState.phase === 'order_determination' || (gameState.phase === 'setup' && gameState.settlements.length < gameState.players.length)) && gameState.initialDiceRolls[i]) ? (
                        <div className="flex items-center gap-0.5 px-1 rounded-sm bg-orange-500/10 border border-orange-500/20">
                          <span className="text-[8px] font-black text-orange-600">
                            {(isDiceRolling && i === activePlayerId) ? "?" : String(gameState.initialDiceRolls[i][gameState.initialDiceRolls[i].length - 1] || 0)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center mt-0.5 leading-none">
                      <span className={`${isMobile ? 'text-[8px]' : 'text-[10px]'} font-bold opacity-80 whitespace-nowrap`}>{publicScore}/{gameState.mapType === 'standard' ? 10 : 14}分</span>
                      <span className={`flex items-center gap-0.5 ${isMobile ? 'text-[8px]' : 'text-[10px]'} font-mono opacity-80 whitespace-nowrap ml-1`} title="资源">
                        <SmartImg src={RES_CARD_ICON} alt="res" className="w-2.5 h-2.5 object-contain" />
                        {resourceCount}
                      </span>
                      <span className={`flex items-center gap-0.5 ${isMobile ? 'text-[8px]' : 'text-[10px]'} font-mono opacity-80 whitespace-nowrap ml-1`} title="发展卡">
                        <SmartImg src={DEV_CARD_ICON} alt="dev" className="w-2.5 h-2.5 object-contain" />
                        {p.devCards.length + (p.devCardsBoughtThisTurn?.length || 0) + p.playedDevCards.length}
                      </span>
                      <span className={`flex items-center gap-0.5 ${isMobile ? 'text-[8px]' : 'text-[10px]'} font-mono opacity-80 whitespace-nowrap ml-1`} title="最长道路">
                        <SmartImg src={ROAD_ICON} alt="road" className="w-2.5 h-2.5 object-contain" />
                        {p.longestRoadLength}
                      </span>
                      <span className={`flex items-center gap-0.5 ${isMobile ? 'text-[8px]' : 'text-[10px]'} font-mono opacity-80 whitespace-nowrap ml-1`} title="骑士">
                        <span className="text-[10px]">⚔️</span>
                        {p.knightsPlayed}
                      </span>
                    </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden relative">

        {/* Left Panel */}
        <AnimatePresence>
          {showLeftPanel && (
            <motion.aside 
              initial={{ width: leftWidth }}
              animate={{ width: leftWidth }}
              exit={{ width: 0 }}
              className={`border-r border-black/5 flex flex-col bg-white h-full max-h-full min-h-0 shrink-0 relative ${confirmDevCard ? 'z-[100000]' : 'z-50'}`}
            >
              <RotatedScroll
                data-game-resource-scroll
                shouldApplyPortraitRotation={shouldApplyPortraitRotation}
                className={`flex-1 flex flex-col min-h-0 overflow-y-auto overscroll-contain touch-pan-y no-scrollbar overflow-x-hidden ${isMobile ? 'p-1 gap-1' : 'p-4 lg:p-5 gap-6'}`}
              >
              <section className={isMobile ? 'pt-1' : 'pt-4 border-t border-black/5'}>
            <div className={`flex items-center justify-between ${isMobile ? 'mb-1' : 'mb-4'}`}>
              <h3 className="text-[9px] uppercase tracking-[0.2em] font-black opacity-30">银行库存</h3>
            </div>
            <div className={`grid grid-cols-3 grid-rows-2 ${isMobile ? 'gap-0.5' : 'gap-1'}`}>
              {Object.entries(gameState.bankResources).map(([res, count]) => {
                return (
                <div key={res} className={`flex items-center justify-between ${isMobile ? 'p-0.5 px-1' : 'p-1.5'} rounded-md bg-stone-100/50 border border-black/10`}>
                  <ResourceIcon type={res as ResourceType} className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                  <span className={`${isMobile ? 'text-[7px]' : 'text-[9px]'} font-mono font-bold opacity-60`}>{count}</span>
                </div>
                );
              })}
              <div className={`flex items-center justify-between ${isMobile ? 'p-0.5 px-1' : 'p-1.5'} rounded-md bg-red-600 shadow-sm text-white`}>
                <span className={`${isMobile ? 'text-[7px]' : 'text-[9px]'} font-black`}>发</span>
                <span className={`${isMobile ? 'text-[7px]' : 'text-[9px]'} font-mono font-bold`}>{gameState.bankDevCards.length}</span>
              </div>
            </div>
          </section>

          <section className={`${isMobile ? 'pt-1' : 'pt-4'} border-t border-black/5`}>
            <div className={`flex items-center justify-between ${isMobile ? 'mb-1' : 'mb-2'}`}>
              <h3 className="text-[9px] uppercase tracking-[0.2em] font-black opacity-30">
                {isSpectator ? `${visiblePlayer?.name || '玩家'}的资源卡` : (gameState.phase === 'discard' && gameState.pendingDiscards.some(p => p.playerId === myPlayerIndex) ? '弃牌阶段' : '我的资源卡')}
              </h3>
            </div>
            {/* Action panels removed from here, now in Central overlay */}
            <div className="grid grid-cols-1 gap-1">
              {Object.entries((isDiceRolling && !isSpectator && visiblePlayer && displayedResourcesMap[visiblePlayer.id]) ? displayedResourcesMap[visiblePlayer.id] : (visiblePlayer?.resources || {})).map(([res, count]) => (
                  <ResourceRow key={res} type={res as ResourceType} count={count} compact={isMobile} playerId={visiblePlayer?.id} />
                ))}
              </div>
          </section>

          <section className="pt-2 border-t border-black/5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] uppercase tracking-[0.2em] font-black opacity-30">
                {isSpectator ? `${visiblePlayer?.name || '玩家'}的发展卡` : '我的发展卡'}
              </h3>
            </div>
            <div className="space-y-1.5">
              {visiblePlayer?.devCards.length === 0 && (!visiblePlayer?.devCardsBoughtThisTurn || visiblePlayer?.devCardsBoughtThisTurn.length === 0) && (!visiblePlayer?.playedDevCards || visiblePlayer?.playedDevCards.length === 0) ? (
                <p className="text-[10px] opacity-30 italic">暂无发展卡</p>
              ) : (
                <>
                  {/* Playable Cards */}
                  {visiblePlayer && visiblePlayer.devCards.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[9px] uppercase tracking-widest font-bold opacity-40">可使用</h4>
                      <div className="grid grid-cols-1 gap-1">
                        {Object.values(DevCardType).map(type => {
                          const isCurrentlyPlaying = gameState.playingDevCard === type && visiblePlayer.id === gameState.players[gameState.currentPlayerIndex].id;
                          const count = visiblePlayer.devCards.filter(c => c === type).length + (isCurrentlyPlaying ? 1 : 0);
                          if (count === 0) return null;
                          
                          return (
                            <div key={`playable-${type}`} className="flex items-center justify-between py-1 px-1.5 rounded-md bg-white border border-red-200 hover:shadow-sm transition-all group overflow-visible">
                              <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 md:w-7 md:h-7 shrink-0 rounded bg-white flex items-center justify-center text-xs relative shadow-inner border border-red-50">
                                  <SmartImg src={getDevCardImg(type)} alt={type} className="w-4 h-4 md:w-5 md:h-5 object-contain" />
                                  {count > 1 && (
                                    <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-black text-white rounded-full flex items-center justify-center text-[8px] font-bold ring-1 ring-white z-30">
                                      {count}
                                    </div>
                                  )}
                                </div>
                                <span className="font-bold uppercase tracking-tight text-[10px] md:text-[11px] text-slate-700 group-hover:text-red-600 transition-colors">
                                  {type === DevCardType.Knight ? '骑士' : 
                                   type === DevCardType.VictoryPoint ? '胜利点' :
                                   type === DevCardType.RoadBuilding ? '道路建设' :
                                   type === DevCardType.YearOfPlenty ? '丰收之年' : '垄断'}
                                </span>
                              </div>
                              {type !== DevCardType.VictoryPoint && (
                                <div className="flex items-center gap-1 grayscale group-hover:grayscale-0 transition-all shrink-0">
                                  {gameState.playingDevCard === type ? (
                                    visiblePlayer.id === me.id ? (
                                      <button 
                                        onClick={() => cancelDevCard()}
                                        className="text-[10px] font-black uppercase tracking-wider bg-stone-800 text-white px-2.5 py-1.5 rounded-full hover:bg-black transition-all shadow-sm active:scale-95"
                                      >
                                        取消
                                      </button>
                                    ) : (
                                      <span className="text-[7px] font-black uppercase tracking-widest bg-stone-100 text-stone-400 px-1 py-0.5 rounded-full">
                                        使用中
                                      </span>
                                    )
                                  ) : (
                                    <button 
                                      onClick={() => setConfirmDevCard(type)}
                                      disabled={!canPlayDevCard || gameState.hasPlayedDevCardThisTurn || visiblePlayer.id !== me.id || confirmDevCard !== null}
                                      className="text-[10px] font-black uppercase tracking-wider bg-red-600 text-white px-2.5 py-1.5 rounded-full hover:bg-red-700 transition-all shadow-sm active:scale-95 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed"
                                    >
                                      使用
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bought This Turn */}
                  {visiblePlayer && visiblePlayer.devCardsBoughtThisTurn && visiblePlayer.devCardsBoughtThisTurn.length > 0 && (
                    <div className="space-y-1">
                      <h4 className="text-[9px] uppercase tracking-widest font-bold opacity-40">本回合购买</h4>
                      <div className="grid grid-cols-1 gap-1">
                        {Object.values(DevCardType).map(type => {
                          const count = visiblePlayer.devCardsBoughtThisTurn.filter(c => c === type).length;
                          if (count === 0) return null;
                          
                          return (
                            <div key={`bought-${type}`} className="flex items-center justify-between py-1 px-1.5 rounded-md bg-white border border-red-100 shadow-sm opacity-60 overflow-visible">
                              <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 md:w-7 md:h-7 shrink-0 rounded bg-white flex items-center justify-center text-[8px] relative border border-red-50">
                                  <SmartImg src={getDevCardImg(type)} alt={type} className="w-4 h-4 md:w-5 md:h-5 object-contain" />
                                  {count > 1 && (
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-black text-white rounded-full flex items-center justify-center text-[7px] font-bold ring-1 ring-white z-30">
                                      {count}
                                    </div>
                                  )}
                                </div>
                                <span className="font-bold uppercase tracking-tight text-[10px] md:text-[11px] text-slate-500">
                                  {type === DevCardType.Knight ? '骑士' : 
                                   type === DevCardType.VictoryPoint ? '胜利点' :
                                   type === DevCardType.RoadBuilding ? '道路建设' :
                                   type === DevCardType.YearOfPlenty ? '丰收之年' : '垄断'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Played Cards */}
                  {visiblePlayer && visiblePlayer.playedDevCards && visiblePlayer.playedDevCards.length > 0 && (
                    <div className="space-y-1">
                      <h4 className="text-[9px] uppercase tracking-widest font-bold opacity-40">已使用</h4>
                      <div className="grid grid-cols-1 gap-1">
                        {Object.values(DevCardType).map(type => {
                          const count = visiblePlayer.playedDevCards.filter(c => c === type).length;
                          if (count === 0 || (gameState.playingDevCard === type && count === 1)) return null;
                          
                          const displayCount = gameState.playingDevCard === type ? count - 1 : count;
                          if (displayCount === 0) return null;
                          
                          return (
                            <div key={`played-${type}`} className="flex items-center justify-between py-1 px-1.5 rounded-md bg-white border border-red-50 shadow-sm opacity-50 overflow-visible">
                              <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 md:w-7 md:h-7 shrink-0 rounded bg-white flex items-center justify-center text-[8px] relative border border-red-50">
                                  <SmartImg src={getDevCardImg(type)} alt={type} className="w-4 h-4 md:w-5 md:h-5 object-contain" />
                                  {displayCount > 1 && (
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-black text-white rounded-full flex items-center justify-center text-[7px] font-bold ring-1 ring-white z-30">
                                      {displayCount}
                                    </div>
                                  )}
                                </div>
                                <span className="font-bold uppercase tracking-tight text-[10px] md:text-[11px] text-slate-400">
                                  {type === DevCardType.Knight ? '骑士' : 
                                   type === DevCardType.VictoryPoint ? '胜利点' :
                                   type === DevCardType.RoadBuilding ? '道路建设' :
                                   type === DevCardType.YearOfPlenty ? '丰收之年' : '垄断'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
               )}
              </div>
            </section>
          </RotatedScroll>
         </motion.aside>
      )}
    </AnimatePresence>

          <main className="flex-1 relative flex flex-col min-h-0 bg-stone-100/50">
            <AnimatePresence>
              {devCardOverlay && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute top-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
              >
                <div className="bg-black/80 backdrop-blur-md px-4 py-1.5 rounded-full text-white shadow-2xl flex items-center justify-center border border-white/10">
                  <p className="font-bold tracking-widest text-xs sm:text-sm whitespace-nowrap">
                    <span className="text-amber-400">{devCardOverlay.playerName}</span> {devCardOverlay.actionStr}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Guidance Text */}
          {gameStarted && nextAction && (
            <div className="absolute bottom-1.5 left-1.5 z-40 max-w-[40%] pointer-events-none">
              <p className="text-[10px] font-black italic uppercase tracking-[0.2em] text-black/25 leading-none">
                {nextAction}
              </p>
            </div>
          )}

          
          {gameStarted && (
            <div className={`absolute top-1 left-1 z-[50] flex flex-col gap-0.5 pointer-events-auto ${isMobile ? 'scale-90 origin-top-left' : ''}`}>
              {isHost && !isSpectator && (
                <button 
                  onClick={() => setShowReserveRoomModal(true)}
                  className={`flex items-center justify-center gap-1.5 ${isMobile ? 'px-2 py-1 text-[9px] rounded-md' : 'px-3 py-2 text-[11px] rounded-lg'} bg-white/90 backdrop-blur-xl border border-black/5 text-stone-600 font-bold uppercase tracking-widest shadow-xl hover:bg-emerald-50 hover:text-emerald-600 transition-all transform active:scale-95 group relative`}
                  title="保留房间"
                >
                  <Clock size={isMobile ? 10 : 14} className={roomState?.reservedUntil ? "text-emerald-500" : ""} />
                  {roomState?.reservedUntil && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500"></span>}
                  <span className="hidden md:inline">{roomState?.reservedUntil ? '已保留' : '保留房间'}</span>
                </button>
              )}
            </div>
          )}

          {/* Connection Error Banner */}
          {!isConnected && (
            <div className="absolute inset-0 z-[999] flex flex-col items-center justify-center bg-transparent pointer-events-auto">
              <div className="bg-red-500 text-white px-8 py-6 rounded-[2rem] shadow-2xl shadow-red-500/20 text-center flex flex-col items-center animate-pulse">
                <RefreshCw size={48} className="animate-spin mb-4" />
                <h3 className="font-black text-2xl uppercase tracking-widest drop-shadow-sm">连接已断开</h3>
                <p className="text-sm opacity-90 mt-2 font-medium max-w-sm leading-relaxed">正在尝试重新连接到服务器，请稍候...</p>
              </div>
            </div>
          )}



          {gameStarted && (
            <div className={`absolute top-2 right-2 z-[100] flex gap-1 ${isMobile ? 'flex-col gap-1' : ''}`}>
              {gameState.winnerId !== null && (
                <button
                  onClick={() => setShowGameOver(true)}
                  className={`flex items-center gap-2 ${isMobile ? 'px-2 py-1 text-[9px] rounded-md' : 'px-5 py-2.5 text-[13px] rounded-lg'} backdrop-blur-xl border border-black/5 font-bold uppercase tracking-widest shadow-xl transition-all transform active:scale-95 bg-white/90 text-amber-600 animate-pulse`}
                >
                  <Trophy size={isMobile ? 10 : 16} />
                  <span>结算</span>
                </button>
              )}
              <button
                id="toggle-bot-button"
                onClick={() => toggleBot(myPlayerIndex)}
                className={`flex items-center gap-2 ${isMobile ? 'px-2 py-1 text-[9px] rounded-md' : 'px-5 py-2.5 text-[13px] rounded-lg'} backdrop-blur-xl border border-black/5 font-bold uppercase tracking-widest shadow-xl transition-all transform active:scale-95 ${me?.isBot ? 'bg-indigo-500 text-white' : 'bg-white/90 text-stone-600'} ${isSpectator ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isSpectator}
              >
                <Bot size={isMobile ? 10 : 16} />
                <span>托管</span>
              </button>
            </div>
          )}

          {/* Debug Button */}
          {showDebugButton && (
            <button 
              onClick={() => {
                const newMode = !debugModeEnabled;
                setDebugModeEnabled(newMode);
                setShowDebugConsole(newMode);
              }}
              className="absolute bottom-4 left-4 z-50 bg-indigo-600 text-white p-3 rounded-full shadow-lg"
            >
              调试
            </button>
          )}

          <div className={`w-full h-full ${isBoardReady ? 'opacity-100' : 'opacity-0'}`}>
            <Stage 
            ref={stageRef}
            width={stageWidth} 
            height={logicalWindowSize.height - headerHeight}
            draggable
            onDragStart={() => {
              setHasManuallyInteracted(true);
              if (boardLayerRef.current) {
                // Standard pixel ratio for performance during interaction
                boardLayerRef.current.cache({ pixelRatio: (window.devicePixelRatio || 1) });
              }
            }}
            onDragEnd={() => {
              boardLayerRef.current?.clearCache();
            }}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={(e) => {
              if (e.target === e.target.getStage()) {
                setPendingBuild(null);
                setPendingRobberHex(null);
              }
              handleTouchEnd();
            }}
            onPointerDown={(e) => {
              if (e.target === e.target.getStage()) {
                setPendingBuild(null);
                setPendingRobberHex(null);
              }
            }}
            onDblClick={() => {
              if (Date.now() - lastGestureTime.current > 300) {
                centerMap(true);
              }
            }}
            onDblTap={() => {
              if (Date.now() - lastGestureTime.current > 300) {
                centerMap(true);
              }
            }}
          >
            <Layer ref={boardLayerRef} name="board-terrain">
              {hexCoords.filter(hex => !hex.isOuterSea).map((hex) => (
                <HexCell 
                  key={hex.id} 
                  hex={hex} 
                  isSelected={selectedHex === hex.id}
                  isRobber={gameState.robberHexId === hex.id}
                  isPirate={gameState.pirateHexId === hex.id}
                  onClick={() => handleHexClick(hex.id, hex.type as HexType, hex.x, hex.y)}
                />
              ))}
              
              {/* Debug: Detection Areas */}
              {debugModeEnabled && hexCoords.filter(hex => !hex.isOuterSea).map(hex => (
                <Circle
                  key={`debug-${hex.id}`}
                  x={hex.x}
                  y={hex.y}
                  radius={12}
                  fill="rgba(255, 0, 0, 0.3)"
                  stroke="red"
                  strokeWidth={1}
                  listening={false}
                />
              ))}

              {/* Edges for Roads/Ships */}
              {edges.map(edge => {
                const road = gameState.roads.find(r => r.edgeId === edge.id);
                const ship = gameState.ships.find(s => s.edgeId === edge.id);
                const port = gameState.ports.find(p => p.edgeId === edge.id);
                const isPendingEdge = pendingBuild && (pendingBuild.type === 'road' || pendingBuild.type === 'ship') && pendingBuild.id === edge.id;
                const color = road ? gameState.players.find(p => p.id === road.playerId)?.color : ship ? gameState.players.find(p => p.id === ship.playerId)?.color : 'transparent';
                const effectiveBuildMode = isMyHumanTurn ? buildMode : (gameState?.activeBuildMode || null);
                
                let nx = 0;
                let ny = 0;

                if (port) {
                  const adjacentHexes = getHexesForEdge(hexCoords, edge.id);
                  const landHex = adjacentHexes.find(h => h && (h.isMainland || h.isIsland));
                  if (landHex) {
                    const cx = (edge.x1 + edge.x2) / 2;
                    const cy = (edge.y1 + edge.y2) / 2;
                    const dx = cx - landHex.x;
                    const dy = cy - landHex.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len > 0) {
                      nx = dx / len;
                      ny = dy / len;
                    }
                  }
                }

                return (
                  <Group key={edge.id}>
                    {port && (
                      <Port 
                        port={port} 
                        cx={(edge.x1 + edge.x2) / 2} 
                        cy={(edge.y1 + edge.y2) / 2} 
                        nx={nx}
                        ny={ny}
                      />
                    )}
                    <Line
                      id={`edge-debug-${edge.id}`}
                      points={[edge.x1, edge.y1, edge.x2, edge.y2]}
                      stroke="rgba(255, 0, 0, 0.2)"
                      strokeWidth={20}
                      listening={false}
                      perfectDrawEnabled={false}
                      visible={debugModeEnabled}
                    />
                    <Line
                      id={`edge-${edge.id}`}
                      points={[edge.x1, edge.y1, edge.x2, edge.y2]}
                      stroke={color !== 'transparent' ? color : ((effectiveBuildMode === 'road' || effectiveBuildMode === 'ship') && checkIsValidEdge(edge.id, effectiveBuildMode as any) ? 'rgba(0,0,0,0.3)' : 'transparent')}
                      strokeWidth={6}
                      hitStrokeWidth={25}
                      dash={ship ? [10, 5] : []}
                      lineCap="round"
                      lineJoin="round"
                      listening={color !== 'transparent' || ((effectiveBuildMode === 'road' || effectiveBuildMode === 'ship') && checkIsValidEdge(edge.id, effectiveBuildMode as any))}
                      onClick={() => handleEdgeClick(edge.id, (edge.x1+edge.x2)/2, (edge.y1+edge.y2)/2)}
                      onTap={() => handleEdgeClick(edge.id, (edge.x1+edge.x2)/2, (edge.y1+edge.y2)/2)}
                      perfectDrawEnabled={false}
                      onMouseEnter={(e: any) => {
                        if (canBuild && (buildMode === 'road' || buildMode === 'ship') && checkIsValidEdge(edge.id, buildMode)) {
                          e.target.stroke('rgba(0,0,0,0.5)');
                          e.target.getStage().container().style.cursor = 'pointer';
                        }
                      }}
                      onMouseLeave={(e: any) => {
                        if (canBuild && (buildMode === 'road' || buildMode === 'ship') && checkIsValidEdge(edge.id, buildMode)) {
                          e.target.stroke('rgba(0,0,0,0.3)');
                          e.target.getStage().container().style.cursor = 'default';
                        }
                      }}
                    />
                    {/* White pending road/ship preview in exact edge layer */}
                    {isPendingEdge && (
                      <Line
                        points={[edge.x1, edge.y1, edge.x2, edge.y2]}
                        stroke="#ffffff"
                        strokeWidth={6}
                        dash={pendingBuild.type === 'ship' ? [10, 5] : []}
                        lineCap="round"
                        lineJoin="round"
                        shadowColor="rgba(0,0,0,0.5)"
                        shadowBlur={4}
                        listening={false}
                        perfectDrawEnabled={false}
                      />
                    )}
                  </Group>
                );
              })}

              {/* Vertices for Settlements/Cities */}
              {vertices.map(vertex => {
                const settlement = gameState.settlements.find(s => s.vertexId === vertex.id);
                const isPendingVertex = pendingBuild && (pendingBuild.type === 'settlement' || pendingBuild.type === 'city') && pendingBuild.id === vertex.id;
                const color = settlement ? gameState.players.find(p => p.id === settlement.playerId)?.color : 'transparent';
                const effectiveBuildMode = isMyHumanTurn ? buildMode : (gameState?.activeBuildMode || null);
                const isValid = (isMyHumanTurn ? canBuild : true) && (effectiveBuildMode === 'settlement' || effectiveBuildMode === 'city') && checkIsValidVertex(vertex.id, effectiveBuildMode as any);

                const isValidCityUpgrade = settlement && !settlement.isCity && effectiveBuildMode === 'city' && checkIsValidVertex(vertex.id, 'city');
                
                const handleMouseEnter = (e: any) => {
                  if (isValid || isValidCityUpgrade) {
                    if (isMyHumanTurn) e.target.getStage().container().style.cursor = 'pointer';
                    e.target.to({ scaleX: 1.2, scaleY: 1.2, duration: 0.1 });
                  }
                };

                const handleMouseLeave = (e: any) => {
                  if (isValid || isValidCityUpgrade) {
                    if (isMyHumanTurn) e.target.getStage().container().style.cursor = 'default';
                    e.target.to({ scaleX: 1, scaleY: 1, duration: 0.1 });
                  }
                };

                const handleClick = () => handleVertexClick(vertex.id, vertex.hexIds, vertex.x, vertex.y);

                return (
                  <Group key={vertex.id} id={`vertex-${vertex.id}`} x={vertex.x} y={vertex.y}>
                    {/* Debug hit area for vertices */}
                    {debugModeEnabled && (
                      <Circle
                        radius={12}
                        fill="rgba(0, 255, 0, 0.2)"
                        stroke="green"
                        strokeWidth={1}
                        listening={false}
                      />
                    )}
                    {/* Invisible hit area for city upgrade */}
                    {isValidCityUpgrade && (
                      <Circle 
                        radius={16}
                        fill={debugModeEnabled ? "rgba(0, 0, 255, 0.2)" : "transparent"}
                        stroke={debugModeEnabled ? "blue" : "transparent"}
                        strokeWidth={debugModeEnabled ? 1 : 0}
                        onClick={handleClick}
                        onTap={handleClick}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                      />
                    )}
                    {settlement && !(isPendingVertex && pendingBuild?.type === 'city') ? (
                      settlement.isCity ? (
                        // City Icon (Lucide Castle)
                        <Group 
                          x={0} 
                          y={0} 
                          offsetX={12} 
                          offsetY={12} 
                          scaleX={1.15} 
                          scaleY={1.15}
                          listening={false}
                        >
                          <Path
                            data="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z"
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth={1.8}
                            shadowColor="black"
                            shadowBlur={5}
                            shadowOpacity={0.35}
                            perfectDrawEnabled={false}
                          />
                          <Path
                            data="M18 11V4H6v7"
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth={1.8}
                            perfectDrawEnabled={false}
                          />
                          <Path
                            data="M6 11V9a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2"
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                            perfectDrawEnabled={false}
                          />
                          <Path
                            data="M22 11V9a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v2"
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                            perfectDrawEnabled={false}
                          />
                          <Path
                            data="M15 22v-4a3 3 0 0 0-6 0v4Z"
                            fill="#ffffff"
                            stroke="#ffffff"
                            strokeWidth={1}
                            strokeLineCap="round"
                            strokeLineJoin="round"
                            perfectDrawEnabled={false}
                          />
                          <Path
                            data="M10 4V2 M14 4V2"
                            stroke="#ffffff"
                            strokeWidth={1.8}
                            strokeLineCap="round"
                            perfectDrawEnabled={false}
                          />
                        </Group>
                      ) : (
                        // Settlement / Village Icon (Lucide Home)
                        <Group 
                          x={0} 
                          y={0} 
                          offsetX={12} 
                          offsetY={12} 
                          scaleX={1.1} 
                          scaleY={1.1}
                          listening={isValidCityUpgrade}
                          onClick={handleClick}
                          onTap={handleClick}
                          onMouseEnter={handleMouseEnter}
                          onMouseLeave={handleMouseLeave}
                        >
                          <Path
                            data="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth={1.8}
                            shadowColor="black"
                            shadowBlur={5}
                            shadowOpacity={0.35}
                            perfectDrawEnabled={false}
                          />
                          <Path
                            data="M10 22v-5a2 2 0 0 1 4 0v5Z"
                            fill="#ffffff"
                            stroke="#ffffff"
                            strokeWidth={1}
                            strokeLineCap="round"
                            strokeLineJoin="round"
                            perfectDrawEnabled={false}
                          />
                        </Group>
                      )
                    ) : (
                      // Preview Icon & Hit Area
                      isValid && (
                        <>
                          <Circle
                            radius={16} // Provide a generous hit area for ease of use
                            fill={debugModeEnabled ? "rgba(255, 0, 0, 0.2)" : "transparent"}
                            stroke={debugModeEnabled ? "red" : "transparent"}
                            strokeWidth={debugModeEnabled ? 1 : 0}
                            onClick={handleClick}
                            onTap={handleClick}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            perfectDrawEnabled={false}
                          />
                          <Circle
                            radius={6} // Visual indicator
                            fill={'rgba(0,0,0,0.3)'}
                            listening={false}
                            perfectDrawEnabled={false}
                          />
                        </>
                      )
                    )}

                    {/* White outline preview for settlement or city in vertex layer */}
                    {isPendingVertex && (
                      pendingBuild.type === 'settlement' ? (
                        <Group offsetX={12} offsetY={12} scaleX={1.1} scaleY={1.1} listening={false}>
                          <Path
                            data="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                            fill="transparent"
                            stroke="#ffffff"
                            strokeWidth={2}
                            shadowColor="black"
                            shadowBlur={5}
                            shadowOpacity={0.35}
                            perfectDrawEnabled={false}
                          />
                          <Path
                            data="M10 22v-5a2 2 0 0 1 4 0v5Z"
                            fill="transparent"
                            stroke="#ffffff"
                            strokeWidth={1.2}
                            strokeLineCap="round"
                            strokeLineJoin="round"
                            perfectDrawEnabled={false}
                          />
                        </Group>
                      ) : (
                        <Group offsetX={12} offsetY={12} scaleX={1.15} scaleY={1.15} listening={false}>
                          <Path
                            data="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z"
                            fill="transparent"
                            stroke="#ffffff"
                            strokeWidth={2}
                            shadowColor="black"
                            shadowBlur={5}
                            shadowOpacity={0.35}
                            perfectDrawEnabled={false}
                          />
                          <Path data="M18 11V4H6v7" fill="transparent" stroke="#ffffff" strokeWidth={2} perfectDrawEnabled={false} />
                          <Path data="M6 11V9a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2" fill="transparent" stroke="#ffffff" strokeWidth={1.5} perfectDrawEnabled={false} />
                          <Path data="M22 11V9a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v2" fill="transparent" stroke="#ffffff" strokeWidth={1.5} perfectDrawEnabled={false} />
                          <Path data="M15 22v-4a3 3 0 0 0-6 0v4Z" fill="transparent" stroke="#ffffff" strokeWidth={1.2} strokeLineCap="round" strokeLineJoin="round" perfectDrawEnabled={false} />
                          <Path data="M10 4V2 M14 4V2" stroke="#ffffff" strokeWidth={2} strokeLineCap="round" perfectDrawEnabled={false} />
                        </Group>
                      )
                    )}
                  </Group>
                );
              })}

            </Layer>
            {/* Animated markers must not redraw every terrain tile while scrolling. */}
            <Layer name="board-markers">
              {/* Robber/Pirate Icons - Rendered last to be on top */}
              {hexCoords.map(hex => {
                const isRobber = gameState.robberHexId === hex.id;
                const isPirate = gameState.pirateHexId === hex.id;
                const isPhaseRobber = gameState.phase === 'robber';
                
                if (isRobber) {
                  return <RobberToken key={`robber-${hex.id}`} x={hex.x} y={hex.y} isPhaseRobber={isPhaseRobber} />;
                }
                if (isPirate) {
                  return <PirateToken key={`pirate-${hex.id}`} x={hex.x} y={hex.y} isPhaseRobber={isPhaseRobber} />;
                }
                return null;
              })}
              {gameState?.pirateHexId === 'pirate_start' && (() => {
                  const OuterHexes = gameState.board.map(hex => ({
                      ...hex,
                      x: HEX_WIDTH * (hex.q + hex.r / 2),
                      y: HEX_HEIGHT * 0.75 * hex.r
                  })).filter(h => h.isOuterSea || h._category === 'OuterSea' || h.type === HexType.Sea);
                  
                  if (OuterHexes.length > 0) {
                      // Sort by x + y to get the top-left most hex
                      const edgeSea = OuterHexes.sort((a, b) => (a.x + a.y) - (b.x + b.y))[0];
                      return <PirateToken key="pirate-start" x={edgeSea.x} y={edgeSea.y} isPhaseRobber={gameState.phase === 'robber'} />;
                  }
                  return null;
              })()}

              {/* Pending Build Indicator Button */}
              {pendingBuild && (
                <Group x={pendingBuild.x} y={pendingBuild.y} listening={false}>
                  <Html divProps={{ style: { position: 'absolute', pointerEvents: 'auto', zIndex: 50 } }}>
                    <div style={{ transform: 'translate(-50%, calc(-100% - 28px))' }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pendingBuild.type === 'settlement') buildSettlement(pendingBuild.id, pendingBuild.hexIds!);
                          else if (pendingBuild.type === 'city') upgradeToCity(pendingBuild.id);
                          else if (pendingBuild.type === 'road') buildRoad(pendingBuild.id);
                          else if (pendingBuild.type === 'ship') buildShip(pendingBuild.id);
                          setPendingBuild(null);
                        }} 
                        className="pending-confirm-btn px-3 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs rounded-full shadow-lg border border-red-400 whitespace-nowrap flex items-center gap-1 cursor-pointer transition-all animate-in zoom-in duration-150"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        确认修建
                      </button>
                    </div>
                  </Html>
                </Group>
              )}

              {/* Pending Robber / Pirate Indicator */}
              {pendingRobberHex && (
                <Group x={pendingRobberHex.x} y={pendingRobberHex.y} listening={false}>
                  {pendingRobberHex.type === HexType.Sea ? <AnchorToken /> : <FootprintToken />}
                  <Html divProps={{ style: { position: 'absolute', pointerEvents: 'auto', zIndex: 50 } }}>
                    <div style={{ transform: 'translate(-50%, calc(-100% - 28px))' }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pendingRobberHex.type === HexType.Sea) movePirate(pendingRobberHex.id);
                          else moveRobber(pendingRobberHex.id);
                          setPendingRobberHex(null);
                        }} 
                        className="pending-confirm-btn px-3 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs rounded-full shadow-lg border border-red-400 whitespace-nowrap flex items-center gap-1 cursor-pointer transition-all animate-in zoom-in duration-150"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        确认移动
                      </button>
                    </div>
                  </Html>
                </Group>
              )}
            </Layer>
          </Stage>
          
          {/* Inline Action Confirmations - Fixed to screen instead of map */}


          </div>

          {/* Dice Floating Controls */}
          <AnimatePresence>
            {!gameState.hasRolled && gameState.phase !== 'setup' && (
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5, x: 100, y: 100 }}
                transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
                className="absolute bottom-4 right-4 flex flex-col items-center gap-6 z-40"
              >
                <motion.button 
                  whileHover={isMyHumanTurn ? { scale: 1.05 } : {}}
                  whileTap={isMyHumanTurn ? { scale: 0.95 } : {}}
                  onClick={() => isMyHumanTurn && rollDice()}
                  disabled={!isMyHumanTurn}
                  className={`no-click-sound ${isMobile ? 'px-3 py-1.5' : 'px-8 py-4'} rounded-xl shadow-xl border flex items-center gap-1.5 group transition-all ${
                    isMyHumanTurn 
                      ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-400" 
                      : "bg-stone-100 text-stone-400 cursor-not-allowed border-stone-200"
                  }`}
                >
                  <Dices size={isMobile ? 14 : 24} className={isMyHumanTurn ? "animate-pulse" : ""} />
                  <span className={`${isMobile ? 'text-[10px]' : 'text-xl'} font-black tracking-widest uppercase`}>掷骰子</span>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {(gameState.hasRolled || (gameState.phase === 'initial_dice_roll' && gameState.dice && gameState.dice[0] > 0)) && (
              <motion.div
                key={gameState.hasRolled ? 'main-roll' : `initial-roll-${Object.keys(gameState.initialDiceRolls).length}`}
                initial={{ opacity: 0, scale: 0.5, x: 100, y: 100 }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.5, y: -50 }}
                transition={{ type: 'spring', bounce: 0.5, duration: 0.6 }}
                className="absolute bottom-4 right-4 flex flex-col items-center gap-6 z-40"
              >
                <div 
                  className="bg-white rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.1)] border border-black/5 flex items-center overflow-visible"
                  style={{
                    padding: `${(isMobile ? 24 : 44) * 0.3}px ${(isMobile ? 24 : 44) * 0.4}px`,
                    gap: `${(isMobile ? 24 : 44) / 2}px`
                  }}
                >
                  <div className="flex overflow-visible" style={{ gap: `${(isMobile ? 24 : 44) / 4}px` }}>
                    <DiceFace 
                      key={`dice1-${diceAnimId}`} 
                      value={gameState.dice?.[0] || 1} 
                      isRolling={isDiceRolling}
                      diceIndex={1}
                      size={isMobile ? 24 : 44}
                    />
                    <DiceFace 
                      key={`dice2-${diceAnimId}`} 
                      value={gameState.dice?.[1] || 1} 
                      isRolling={isDiceRolling}
                      diceIndex={2}
                      size={isMobile ? 24 : 44}
                    />
                  </div>
                  <div data-dice-result className="dice-result" style={{ fontSize: `${(isMobile ? 24 : 44) * 0.8}px` }}>
                    <p 
                      className={`text-orange-500 ${isDiceRolling ? 'animate-pulse opacity-60' : ''}`}
                    >
                      {diceSum}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        
</main>

        {/* Right Panel */}
        <AnimatePresence>
          {showRightPanel && (
            <motion.aside 
              initial={{ width: rightWidth }}
              animate={{ width: rightWidth }}
              exit={{ width: 0 }}
              className={`border-l border-black/5 ${isMobile ? 'p-1' : 'p-2 lg:p-2.5'} flex flex-col h-full bg-white overflow-hidden shrink-0 z-50 relative`}
            >
              <section className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-1 shrink-0">
                  <h3 className="text-[9px] uppercase tracking-[0.2em] font-black opacity-30">建设</h3>
                </div>
                <RotatedScroll
                  shouldApplyPortraitRotation={shouldApplyPortraitRotation}
                  className="flex-1 flex flex-col gap-1 min-h-0 overflow-y-auto no-scrollbar px-1"
                >
              {gameState?.phase === 'road_building' ? (
                <div className="flex-1 flex flex-col gap-2 p-1">
                  <p className="text-[10px] sm:text-xs font-bold text-slate-500 text-center mb-1 leading-tight">
                    {gameState?.mapType === 'archipelago' ? '免资源建设 2 条道路或船只' : '免资源建设 2 条道路'}
                  </p>
                  <BuildItem 
                    id="build-road"
                    compact={isMobile}
                    icon={<Hammer size={16} />} 
                    label="道路" 
                    cost={{}}
                    active={buildMode === 'road'}
                    activeColor={currentPlayer?.color}
                    disabled={false}
                    onClick={() => handleSetBuildMode(buildMode === 'road' ? null : 'road')} 
                  />
                  {gameState?.mapType === 'archipelago' && (
                    <BuildItem 
                      id="build-ship"
                      compact={isMobile}
                      icon={<ShipIcon size={16} />} 
                      label="船只" 
                      cost={{}}
                      active={buildMode === 'ship'}
                      activeColor={currentPlayer?.color}
                      disabled={false}
                      onClick={() => handleSetBuildMode(buildMode === 'ship' ? null : 'ship')} 
                    />
                  )}
                </div>
              ) : (
                <>
                  <BuildItem 
                    id="build-road"
                    compact={isMobile}
                    icon={<Hammer size={16} />} 
                    label="道路" 
                    cost={COSTS.road} 
                    active={buildMode === 'road'}
                    activeColor={currentPlayer?.color}
                    disabled={!canBuild || (!canAfford(COSTS.road) && gameState?.phase !== 'setup') || (gameState?.phase === 'setup' && settlementsCount <= totalRoadsAndShips)}
                    onClick={() => handleSetBuildMode(buildMode === 'road' ? null : 'road')} 
                  />
                  <BuildItem 
                    id="build-ship"
                    compact={isMobile}
                    icon={<ShipIcon size={16} />} 
                    label="船只" 
                    cost={COSTS.ship} 
                    active={buildMode === 'ship'}
                    activeColor={currentPlayer?.color}
                    disabled={!canBuild || (!canAfford(COSTS.ship) || gameState?.mapType === 'standard') || (gameState?.phase === 'setup' && settlementsCount <= totalRoadsAndShips)}
                    onClick={() => handleSetBuildMode(buildMode === 'ship' ? null : 'ship')} 
                  />
                  <BuildItem 
                    id="build-settlement"
                    compact={isMobile}
                    icon={<Home size={16} />} 
                    label="村庄" 
                    cost={COSTS.settlement} 
                    active={buildMode === 'settlement'}
                    activeColor={currentPlayer?.color}
                    disabled={!canBuild || (!canAfford(COSTS.settlement) && gameState?.phase !== 'setup') || (gameState?.phase === 'setup' && settlementsCount > totalRoadsAndShips)}
                    onClick={() => handleSetBuildMode(buildMode === 'settlement' ? null : 'settlement')} 
                  />
                  <BuildItem 
                    id="build-city"
                    compact={isMobile}
                    icon={<Castle size={16} />} 
                    label="城市" 
                    cost={COSTS.city} 
                    active={buildMode === 'city'}
                    activeColor={currentPlayer?.color}
                    disabled={!canBuild || !canAfford(COSTS.city) || gameState?.phase === 'setup'}
                    onClick={() => handleSetBuildMode(buildMode === 'city' ? null : 'city')} 
                  />
                  <BuildItem 
                    id="buy-dev-card"
                    compact={isMobile}
                    icon={<BookOpen size={16} />} 
                    label="发展卡" 
                    cost={COSTS.devCard} 
                    disabled={!canBuild || !canAfford(COSTS.devCard) || gameState?.phase === 'setup'}
                    onClick={buyDevCard} 
                  />
                </>
              )}
            </RotatedScroll>
          </section>

          {/* Removed duplicate development cards section here */}

          <section className="pt-1.5 mt-auto border-t border-black/5 space-y-1">
            <div className={`flex ${isMobile ? 'flex-col gap-1' : 'gap-1.5'}`}>
              <button 
                id="trade-bank-button"
                onClick={() => setShowTradeModal(true)}
                disabled={!canTrade}
                className={`flex-1 flex items-center justify-center ${isMobile ? 'gap-1 p-2 rounded-lg h-6' : 'gap-1.5 p-1 rounded-lg h-9'} bg-white border border-black/5 ${!canTrade ? 'cursor-not-allowed text-black' : 'hover:border-black/20 hover:shadow-xl group'} transition-all`}
              >
                <Repeat size={isMobile ? 12 : 14} className="opacity-40 group-hover:rotate-180 transition-transform duration-500" />
                <span className={`${isMobile ? 'text-[8px]' : 'text-xs'} font-bold uppercase tracking-widest whitespace-nowrap`}>银行兑换</span>
              </button>
              <button 
                id="trade-player-button"
                onClick={openPlayerTradeModal}
                disabled={!canTrade}
                className={`flex-1 flex items-center justify-center ${isMobile ? 'gap-1 p-2 rounded-lg h-6' : 'gap-1.5 p-1 rounded-lg h-9'} bg-white border border-black/5 ${!canTrade ? 'cursor-not-allowed text-black' : 'hover:border-black/20 hover:shadow-xl group'} transition-all`}
              >
                <Users size={isMobile ? 12 : 14} className="opacity-40" />
                <span className={`${isMobile ? 'text-[8px]' : 'text-xs'} font-bold uppercase tracking-widest whitespace-nowrap`}>玩家交易</span>
              </button>
            </div>
            <div className="relative">
               <div className="relative group">
                <button 
                  id="end-turn-button"
                  onClick={nextTurn}
                  disabled={!isMyHumanTurn || (gameState?.phase === 'main' && !gameState.hasRolled) || gameState?.playingDevCard != null || (gameState?.phase === 'robber') || gameState?.phase === 'discard' || gameState?.phase === 'initial_dice_roll' || gameState?.phase === 'order_determination' || isDiceRolling}
                  className={`w-full flex items-center justify-center gap-1 ${isMobile ? 'rounded-lg h-7' : 'rounded-lg h-10'} bg-black text-white hover:bg-zinc-800 transition-all group disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <ChevronRight size={14} className="opacity-40" />
                  <span className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-bold uppercase tracking-widest`}>结束回合</span>
                </button>
              </div>
            </div>
          </section>
        </motion.aside>
      )}
    </AnimatePresence>

      {/* Game Modals (Moved to root of gameContainerRef to cover full viewport including header and panels) */}
      {renderGameModals()}
{/* Exit Options Modal */}
      <AnimatePresence>
        {showExitOptions && (
          <div className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}>
            <motion.div 
              drag
              dragListener={false}
              dragControls={exitOptionsDragControls}
              dragConstraints={gameContainerRef}
              dragElastic={0}
              dragMomentum={false}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              style={{
                width: '100%',
                maxWidth: `${Math.min(300, Math.max(200, stageWidth - 16))}px`
              }}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col pointer-events-auto shadow-2xl select-none cursor-default"
            >
              {/* Standard drag handle bar & Header */}
              <div 
                onPointerDown={(e) => exitOptionsDragControls.start(e)}
                className="p-2 sm:p-2.5 px-3 sm:px-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 cursor-grab active:cursor-grabbing hover:bg-slate-100/50 transition-colors select-none"
              >
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                    退出选项
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">离开当前正在进行的游戏</p>
                </div>
                <button 
                  onClick={() => setShowExitOptions(false)}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors pointer-events-auto cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Body */}
              <div className="p-3 sm:p-4 space-y-2.5 flex-1 pointer-events-auto">
                <button 
                  onClick={() => {
                    handleReturnToLobby();
                    setShowExitOptions(false);
                  }}
                  className="w-full py-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer pointer-events-auto shadow-sm"
                >
                  <LogOutIcon size={14} className="scale-x-[-1]" />
                  <span>中途离开</span>
                </button>

                <button 
                  onClick={() => {
                    setShowExitOptions(false);
                    setShowDissolveRoomConfirm(true);
                  }}
                  className="w-full py-2.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer pointer-events-auto shadow-sm"
                >
                  <Trash2 size={14} />
                  <span>解散房间</span>
                </button>

                <button 
                  onClick={() => setShowExitOptions(false)}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer pointer-events-auto shadow-sm text-center"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reserve Room Modal */}
      <AnimatePresence>
        {showReserveRoomModal && (
          <div className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-4"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReserveRoomModal(false)}
              className="absolute inset-0 bg-transparent"
            />
            <motion.div 
              initial={{ scale: 0.94, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 10 }}
              className="relative bg-white rounded-2xl shadow-2xl p-4 max-w-[310px] w-full flex flex-col overflow-hidden border border-stone-100"
            >
              {/* Close X Button */}
              <button
                onClick={() => setShowReserveRoomModal(false)}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-800 flex items-center justify-center transition-colors"
                title="关闭"
              >
                <X size={15} strokeWidth={2.5} />
              </button>

              {/* Header */}
              <div className="flex items-center gap-2.5 mb-3.5 pr-6">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-2xs">
                  <Clock size={18} strokeWidth={2.2} />
                </div>
                <h3 className="text-base font-black text-stone-900 tracking-tight leading-none">
                  保留房间
                </h3>
              </div>

              {/* Active Reservation Info Card */}
              {roomState?.reservedUntil && (
                <div className="mb-3.5 p-2.5 bg-emerald-50/90 border border-emerald-200/80 rounded-xl flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      正在保留中
                    </span>
                    <span className="text-xs font-mono font-black text-emerald-700">
                      至 {new Date(roomState.reservedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      socketService.reserveRoom(roomState?.roomId || inputRoomId, null);
                      setShowReserveRoomModal(false);
                    }}
                    className="w-full py-1 bg-white hover:bg-red-50 text-red-600 font-bold text-[11px] rounded-lg transition-all border border-emerald-200/60 hover:border-red-200 shadow-2xs active:scale-95"
                  >
                    取消保留状态
                  </button>
                </div>
              )}

              {/* Presets Grid */}
              <div className="space-y-1.5 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block px-0.5">快速选择</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button 
                    onClick={() => {
                      socketService.reserveRoom(roomState?.roomId || inputRoomId, 30 * 60 * 1000);
                      setShowReserveRoomModal(false);
                    }}
                    className="py-2 px-1 bg-stone-50 hover:bg-emerald-500 hover:text-white border border-stone-200/80 hover:border-emerald-500 text-stone-700 font-bold text-xs rounded-xl transition-all active:scale-95 text-center"
                  >
                    30 分钟
                  </button>
                  <button 
                    onClick={() => {
                      socketService.reserveRoom(roomState?.roomId || inputRoomId, 60 * 60 * 1000);
                      setShowReserveRoomModal(false);
                    }}
                    className="py-2 px-1 bg-stone-50 hover:bg-emerald-500 hover:text-white border border-stone-200/80 hover:border-emerald-500 text-stone-700 font-bold text-xs rounded-xl transition-all active:scale-95 text-center"
                  >
                    1 小时
                  </button>
                  <button 
                    onClick={() => {
                      socketService.reserveRoom(roomState?.roomId || inputRoomId, 3 * 60 * 60 * 1000);
                      setShowReserveRoomModal(false);
                    }}
                    className="py-2 px-1 bg-stone-50 hover:bg-emerald-500 hover:text-white border border-stone-200/80 hover:border-emerald-500 text-stone-700 font-bold text-xs rounded-xl transition-all active:scale-95 text-center"
                  >
                    3 小时
                  </button>
                </div>
              </div>

              {/* Custom Input */}
              <div className="space-y-1.5 mb-3.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block px-0.5">自定义时长</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex-grow flex items-center bg-stone-50 border border-stone-200 focus-within:border-emerald-500 focus-within:bg-white rounded-xl px-2.5 py-1.5 transition-all">
                    <input 
                      type="number" 
                      value={reserveCustomMinutes}
                      onChange={(e) => setReserveCustomMinutes(e.target.value)}
                      className="w-full bg-transparent text-xs font-mono font-bold outline-hidden text-stone-800 placeholder-stone-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="时长"
                      min="1"
                    />
                    <span className="text-xs font-bold text-stone-400 shrink-0 ml-1">分钟</span>
                  </div>
                  <button 
                    onClick={() => {
                      const mins = parseInt(reserveCustomMinutes, 10);
                      if (mins > 0) {
                        socketService.reserveRoom(roomState?.roomId || inputRoomId, mins * 60 * 1000);
                        setShowReserveRoomModal(false);
                      }
                    }}
                    className="py-1.5 px-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shrink-0 shadow-xs active:scale-95 transition-all"
                  >
                    确认
                  </button>
                </div>
              </div>

              {/* Close button */}
              <button 
                onClick={() => setShowReserveRoomModal(false)}
                className="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-xs rounded-xl transition-colors"
              >
                关闭
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

{/* Dissolve Room Confirmation Modal */}
      <AnimatePresence>
        {showDissolveRoomConfirm && (
          <div className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full">
            <motion.div 
              drag
              dragListener={false}
              dragControls={dissolveRoomDragControls}
              dragConstraints={gameContainerRef}
              dragElastic={0}
              dragMomentum={false}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              style={{
                width: '100%',
                maxWidth: `${Math.min(300, Math.max(200, stageWidth - 16))}px`
              }}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col pointer-events-auto shadow-2xl select-none cursor-default"
            >
              {/* Standard drag handle bar & Header */}
              <div 
                onPointerDown={(e) => dissolveRoomDragControls.start(e)}
                className="p-2 sm:p-2.5 px-3 sm:px-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 cursor-grab active:cursor-grabbing hover:bg-slate-100/50 transition-colors select-none"
              >
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                    解散房间
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">解散后数据将不可恢复</p>
                </div>
                <button 
                  onClick={() => setShowDissolveRoomConfirm(false)}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors pointer-events-auto cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Body */}
              <div className="p-3 sm:p-4 flex-1 pointer-events-auto">
                <div className="flex flex-col w-full gap-2">
                  <button 
                    onClick={() => {
                      const roomId = roomState?.roomId || inputRoomId;
                      socketService.resetGame(roomId);
                      localStorage.removeItem('catan_active_room');
                      setInputRoomId(Math.floor(100000 + Math.random() * 900000).toString());
                      setIsJoinedLobby(false);
                      setRoomState(null);
                      syncGameState(null as any);
                      setGameStarted(false);
                      window.history.replaceState(window.history.state, '', window.location.pathname);
                      setShowDissolveRoomConfirm(false);
                    }}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer pointer-events-auto shadow-sm"
                  >
                    确定解散
                  </button>
                  <button 
                    onClick={() => setShowDissolveRoomConfirm(false)}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer pointer-events-auto shadow-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gameState?.tradeOffers?.filter(o => !closedTradeIds.has(o.id)).map(offer => {
            const initiator = gameState.players.find(p => p.id === offer.initiatorId);
            if (!initiator) return null;
            const isInitiator = offer.initiatorId === myPlayerIndex;
            const isTarget = offer.targetPlayerId === null || offer.targetPlayerId === myPlayerIndex;
            
            // Only show targeted trades to relevant players
            if (offer.targetPlayerId !== null && !isInitiator && !isTarget) return null;

            const completedWith = (offer as any).completedWith;

            return (
              <motion.div
                key={`trade-alert-wrap-${offer.id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"
              >
                <motion.div
                  key={`trade-alert-${offer.id}`}
                  drag
                  dragListener={false}
                  dragControls={activeTradeDragControls}
                  dragConstraints={gameContainerRef}
                  dragElastic={0}
                  dragMomentum={false}
                  onClick={(e) => e.stopPropagation()}
                  initial={{ scale: 0.95, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 10 }}
                  style={{
                    width: '100%',
                    maxWidth: `${Math.min(320, Math.max(200, stageWidth - 16))}px`
                  }}
                  className="bg-white border border-slate-200 rounded-2xl max-h-[90%] overflow-hidden flex flex-col pointer-events-auto shadow-2xl select-none cursor-default"
                >
                  <div 
                    onPointerDown={(e) => activeTradeDragControls.start(e)}
                    className="p-2 sm:p-2.5 px-3 sm:px-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 cursor-grab active:cursor-grabbing hover:bg-slate-100/50 transition-colors select-none"
                  >
                    <div>
                      <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                        玩家交易
                        {offer.status === 'completed' && <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">已成交</span>}
                        {offer.status === 'canceled' && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">已取消</span>}
                      </h2>
                      <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">来自 {initiator.name}</p>
                    </div>
                    {isInitiator && offer.status === 'pending' ? (
                      <button 
                        onClick={() => cancelTrade(offer.id)} 
                        className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors pointer-events-auto cursor-pointer"
                      >
                        取消交易
                      </button>
                    ) : (
                      <button 
                        onClick={() => setClosedTradeIds(prev => {
                          const next = new Set(prev);
                          next.add(offer.id);
                          return next;
                        })}
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors pointer-events-auto cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <RotatedScroll shouldApplyPortraitRotation={shouldApplyPortraitRotation} className="p-2.5 sm:p-3 space-y-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar pointer-events-auto">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-50/40 border border-slate-200/60 p-2 rounded-xl flex flex-col items-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{isInitiator ? '你送出' : 'TA送出'}</span>
                        <div className="flex gap-1.5 flex-wrap justify-center min-h-[28px] items-center">
                          {Object.values(ResourceType).filter(r => (offer.offer[r] || 0) > 0).map(r => (
                            <div key={`offer-res-${r}`} className="flex items-center gap-1 bg-white border border-slate-200/80 px-1.5 py-0.5 rounded-lg shadow-sm">
                                <ResourceIcon type={r as ResourceType} className="w-3.5 h-3.5" />
                                <span className="text-[11px] font-bold text-slate-800">{offer.offer[r]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-center text-slate-400 bg-slate-100 w-6 h-6 rounded-full shrink-0">
                        <Repeat size={12} />
                      </div>

                      <div className="flex-1 bg-slate-50/40 border border-slate-200/60 p-2 rounded-xl flex flex-col items-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{isInitiator ? '你得到' : 'TA要求'}</span>
                        <div className="flex gap-1.5 flex-wrap justify-center min-h-[28px] items-center">
                          {Object.values(ResourceType).filter(r => (offer.request[r] || 0) > 0).map(r => (
                            <div key={`req-res-${r}`} className="flex items-center gap-1 bg-white border border-slate-200/80 px-1.5 py-0.5 rounded-lg shadow-sm">
                                <ResourceIcon type={r as ResourceType} className="w-3.5 h-3.5" />
                                <span className="text-[11px] font-bold text-slate-800">{offer.request[r]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 py-1">
                      {gameState.players.map(p => {
                        if (p.id === initiator.id) return null;
                        const isMe = p.id === myPlayerIndex;
                        const isAccepted = offer.acceptedBy.includes(p.id);
                        let isRejected = offer.rejectedBy.includes(p.id);
                        
                        const canAfford = Object.entries(offer.request || {}).every(
                          ([r, count]) => !count || (p.resources[r as ResourceType] || 0) >= (count as number)
                        );
                        
                        const status = isAccepted ? 'accept' : (isRejected ? 'reject' : 'pending');
                        const isFinalPartner = completedWith === p.id;

                        return (
                          <div 
                            key={`player-react-${p.id}`} 
                            className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                              isFinalPartner 
                                ? 'bg-emerald-50/60 border-emerald-200/60' 
                                : 'bg-slate-50/40 border-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                              <span className={`text-[11px] sm:text-xs font-bold truncate max-w-[100px] ${isFinalPartner ? 'text-emerald-700 font-extrabold' : 'text-slate-700'}`}>
                                {p.name} {isMe && '(你)'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isMe && status === 'pending' && !isInitiator && offer.status === 'pending' ? (
                                <div className="flex gap-1">
                                  <button 
                                    onClick={() => roomState?.roomId && socketService.sendReactToTrade(roomState.roomId, offer.id, p.id, 'reject')}
                                    className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100/50 rounded-lg text-[10px] font-bold transition-all cursor-pointer pointer-events-auto"
                                  >
                                    拒绝
                                  </button>
                                  <button 
                                    onClick={() => roomState?.roomId && socketService.sendReactToTrade(roomState.roomId, offer.id, p.id, 'accept')}
                                    disabled={!canAfford}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer pointer-events-auto ${
                                      canAfford 
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' 
                                        : 'bg-slate-100 text-slate-400 border border-slate-200/40 cursor-not-allowed'
                                    }`}
                                  >
                                    {canAfford ? '接受' : '资源不足'}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {isFinalPartner && (
                                    <span className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold shadow-sm">
                                      🤝 成交
                                    </span>
                                  )}
                                  {!isFinalPartner && status === 'accept' && (
                                    <span className="px-2 py-0.5 sm:py-1 bg-emerald-50 text-emerald-700 border border-emerald-100/60 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      接受
                                    </span>
                                  )}
                                  {!isFinalPartner && status === 'reject' && (
                                    <span className="px-2 py-0.5 sm:py-1 bg-red-50 text-red-600 border border-red-100/50 rounded-lg text-[10px] font-bold">
                                      拒绝
                                    </span>
                                  )}
                                  {!isFinalPartner && status === 'pending' && !isMe && offer.status === 'pending' && (
                                    <div className="w-3.5 h-3.5 rounded-full border border-slate-200 border-t-slate-400 animate-spin opacity-40" />
                                  )}

                                  {isInitiator && status === 'accept' && offer.status === 'pending' && (
                                    <button 
                                      disabled={finalizingTradeIds.has(offer.id)}
                                      onClick={() => {
                                          setFinalizingTradeIds(prev => new Set([...prev, offer.id]));
                                          setTimeout(() => {
                                            if (roomState?.roomId) socketService.sendFinalizeTrade(roomState.roomId, offer.id, p.id);
                                          }, 500);
                                      }}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all shadow-sm active:scale-95 cursor-pointer pointer-events-auto ${
                                        finalizingTradeIds.has(offer.id) 
                                          ? 'bg-slate-200 text-slate-400 border border-slate-300/30' 
                                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                      }`}
                                    >
                                      {finalizingTradeIds.has(offer.id) ? '处理中...' : '成交'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </RotatedScroll>
                </motion.div>
              </motion.div>
            );
        })}
      </AnimatePresence>

      {/* Game Initializing/Loading Overlays */}
      <AnimatePresence>
        {isInitializingGame && gameStarted && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] bg-white flex flex-col items-center justify-center"
          >
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="flex flex-col items-center"
            >
              <div className="w-24 h-24 mb-6 bg-slate-50 rounded-[2rem] flex items-center justify-center shadow-2xl relative">
                <SmartImg src={CATAN_LOGO_IMG} alt="Catan" className="w-16 h-16 object-contain z-10" />
                <div className="absolute inset-0 border-4 border-indigo-500/20 border-t-indigo-500 rounded-[2rem] animate-spin" />
              </div>
              <h2 className="text-2xl font-serif font-black italic text-slate-800">正在生成地图...</h2>
              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold mt-4 animate-pulse">
                系统初始化中
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Debug Panel */}
      <AnimatePresence>
        {showDebugConsole && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed top-20 right-4 bg-white/90 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-black/5 w-80 z-[300] max-h-[80%] overflow-y-auto no-scrollbar"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black uppercase tracking-widest text-xs">调试控制台</h3>
              <button onClick={() => setShowDebugConsole(false)} className="p-2 hover:bg-black/5 rounded-full">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="font-bold text-[10px] uppercase tracking-widest opacity-40 mb-3">地图分布</h4>
                <div className="space-y-4">
                  {(() => {
                    const counts = (hexList: any[]) => {
                      const res: Record<string, number> = {};
                      const nums: Record<number, number> = {};
                      hexList.forEach(h => {
                        if (h.type !== HexType.Sea && h.type !== HexType.Desert) {
                          const typeStr = h.type === HexType.Forest ? '木材' :
                                          h.type === HexType.Hills ? '砖块' :
                                          h.type === HexType.Pasture ? '羊毛' :
                                          h.type === HexType.Fields ? '小麦' :
                                          h.type === HexType.Mountains ? '铁矿石' :
                                          h.type === HexType.Gold ? '金矿' : h.type;
                          res[typeStr] = (res[typeStr] || 0) + 1;
                          if (h.number) {
                            nums[h.number] = (nums[h.number] || 0) + 1;
                          }
                        }
                      });
                      return { resources: res, numbers: nums };
                    };
                    console.log("Debug map stats:", gameState?.board?.map(h => ({id: h.id, type: h.type, isMain: h.isMainland, isIs: h.isIsland})));
                    const mainlandStats = counts(gameState?.board?.filter(h => h.isMainland || (!h.isMainland && !h.isIsland && h.type !== HexType.Sea && h.type !== HexType.Desert)) || []);
                    const islandsStats = counts(gameState?.board?.filter(h => h.isIsland) || []);

                    return (
                      <>
                        <div className="bg-stone-50 p-3 rounded-xl text-[10px]">
                          <div className="font-bold mb-1">主岛资源分布</div>
                          <div className="mb-2">
                            <span className="opacity-60">资源:</span> {Object.entries(mainlandStats.resources).map(([k,v]) => `${k}x${v}`).join(', ')}
                          </div>
                          <div>
                             <span className="opacity-60">数字:</span> {Object.entries(mainlandStats.numbers).map(([k,v]) => `${k}x${v}`).join(', ')}
                          </div>
                        </div>
                        <div className="bg-stone-50 p-3 rounded-xl text-[10px]">
                          <div className="font-bold mb-1">小岛综合分布</div>
                          <div className="mb-2">
                            <span className="opacity-60">资源:</span> {Object.entries(islandsStats.resources).map(([k,v]) => `${k}x${v}`).join(', ')}
                          </div>
                          <div>
                             <span className="opacity-60">数字:</span> {Object.entries(islandsStats.numbers).map(([k,v]) => `${k}x${v}`).join(', ')}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-[10px] uppercase tracking-widest opacity-40 mb-3">控制骰子</h4>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                    <button
                      key={num}
                      onClick={() => {
                        // Simple logic to split num into two dice
                        const d1 = Math.floor(num / 2);
                        const d2 = num - d1;
                        setDice(d1, d2);
                      }}
                      className="w-8 h-8 bg-stone-100 hover:bg-black hover:text-white rounded-lg text-xs font-mono font-bold transition-colors"
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-[10px] uppercase tracking-widest opacity-40 mb-3">资源管理 (当前玩家)</h4>
                <div className="space-y-2">
                  {Object.values(ResourceType).map(res => (
                    <div key={res} className="flex items-center justify-between p-2 bg-stone-50 rounded-xl">
                      <div className="flex items-center gap-2">
                        <ResourceIcon type={res as ResourceType} className="w-4 h-4" />
                        <span className="text-xs font-bold">{RESOURCE_NAMES[res]}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setPlayerResource(activePlayerId, res, Math.max(0, actingPlayer.resources[res] - 5))}
                          className="w-6 h-6 bg-white border border-black/10 rounded-full flex items-center justify-center hover:bg-stone-100"
                        >
                          -
                        </button>
                        <span className="font-mono text-xs w-4 text-center">{actingPlayer.resources[res]}</span>
                        <button 
                          onClick={() => setPlayerResource(activePlayerId, res, actingPlayer.resources[res] + 5)}
                          className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center hover:bg-zinc-800"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-[10px] uppercase tracking-widest opacity-40 mb-3">系统管理 (调试存档)</h4>
                <div className="space-y-3 bg-stone-50/50 p-3 rounded-2xl border border-black/5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">
                      自定义存档名称 {roomState?.loadedFromSaveName && <span className="text-emerald-600 font-black text-[9px]">(来自已载入存档)</span>}
                    </label>
                    <input 
                      type="text"
                      value={debugSaveName}
                      onChange={(e) => setDebugSaveName(e.target.value)}
                      placeholder={roomState?.loadedFromSaveName || `调试存档_${new Date().toLocaleTimeString()}`}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 font-sans"
                    />
                  </div>

                  <button 
                    onClick={() => {
                      const defaultName = roomState?.loadedFromSaveName || `调试存档_${new Date().toLocaleTimeString()}`;
                      const saveName = debugSaveName.trim() || defaultName;
                      const roomId = roomState?.roomId || inputRoomId;
                      const token = localStorage.getItem('catan_auth_token');
                      const isOverwrite = roomState?.loadedFromSaveName === saveName;
                      
                      setDebugSaveStatus(null);
                      
                      fetch('/api/admin/save-game', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ roomId, saveName })
                      })
                      .then(async (res) => {
                        const data = await safeFetchJson(res);
                        if (!res.ok) {
                          throw new Error(data?.error || '保存失败');
                        }
                        setDebugSaveStatus({ 
                          type: 'success', 
                          text: isOverwrite 
                            ? `存档「${saveName}」已直接覆盖保存成功！可以在【我的】->【调试】页面中查看并继续加载。` 
                            : `新存档「${saveName}」保存成功！可以在【我的】->【调试】页面中查看并加载。` 
                        });
                        setDebugSaveName(saveName);
                      })
                      .catch(err => {
                        setDebugSaveStatus({ type: 'error', text: `保存失败: ${err.message}` });
                      });
                    }}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer font-sans"
                  >
                    <Bug size={14} className="animate-bounce" /> 保存当前游戏进度
                  </button>

                  {debugSaveStatus && (
                    <div className={`p-2.5 rounded-xl text-[11px] font-medium leading-normal text-center font-sans ${debugSaveStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                      {debugSaveStatus.text}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gold Selection Modal Removed */}

      {/* Central Action Modals (Discard, Monopoly, Year of Plenty, Gold Selection) */}
      <AnimatePresence>
        {((gameState.phase === 'discard' && gameState.pendingDiscards.some(p => p.playerId === myPlayerIndex)) ||
          (gameState.phase === 'year_of_plenty' && amIActivePlayer) ||
          (gameState.phase === 'monopoly' && amIActivePlayer) ||
          (gameState.phase === 'gold_selection' && (gameState.pendingGoldRewards?.length || 0) > 0 && gameState.pendingGoldRewards[0].playerId === myPlayerIndex)) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-resource-choice-overlay
            className="fixed inset-0 z-[100000] bg-transparent pointer-events-none flex items-center justify-center p-2 sm:p-4 w-full"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div 
              drag
              dragListener={false}
              dragControls={robberDragControls}
              dragConstraints={gameContainerRef}
              dragElastic={0}
              dragMomentum={false}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              style={{
                width: '100%',
                maxWidth: `${Math.min(300, Math.max(200, stageWidth - 16))}px`
              }}
              className="bg-white border border-slate-200 rounded-2xl max-h-[92%] overflow-hidden flex flex-col pointer-events-auto shadow-2xl select-none cursor-default"
            >
              {/* Header */}
              <div 
                onPointerDown={(e) => robberDragControls.start(e)}
                className="p-2 sm:p-2.5 px-3 sm:px-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 cursor-grab active:cursor-grabbing hover:bg-slate-100/50 transition-colors select-none"
              >
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                    {gameState.phase === 'discard' && '强盗突袭！'}
                    {gameState.phase === 'year_of_plenty' && '丰收之年'}
                    {gameState.phase === 'monopoly' && '垄断资源'}
                    {gameState.phase === 'gold_selection' && '淘金热'}
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
                    {gameState.phase === 'discard' && `请弃掉 ${gameState.pendingDiscards.find(p => p.playerId === myPlayerIndex)?.amount || 0} 张资源卡`}
                    {gameState.phase === 'year_of_plenty' && '请从银行任选 2 张资源'}
                    {gameState.phase === 'monopoly' && '所有玩家必须交出你选中的资源'}
                    {gameState.phase === 'gold_selection' && `请选择 ${gameState.pendingGoldRewards[0]?.amount || 1} 张奖励资源`}
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="p-2 sm:p-3 flex-1 pointer-events-auto flex flex-col min-h-0 overflow-hidden">
                {gameState.phase === 'discard' && (
                  <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium leading-tight mb-1.5 px-0.5 shrink-0">
                      资源数量超标，请选择弃掉 <span className="font-bold text-red-600">{((gameState.pendingDiscards.find(p => p.playerId === myPlayerIndex)?.amount || 0) - Object.values(discardSelection).reduce((a, b) => a + b, 0))}</span> 张资源卡：
                    </p>
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                      <DiscardPanel 
                        key={myPlayerIndex} 
                        player={me} 
                        amount={gameState.pendingDiscards.find(p => p.playerId === myPlayerIndex)?.amount || 0} 
                        onDiscard={(res) => discardCards(myPlayerIndex, res)} 
                        onChange={setDiscardSelection}
                        shouldApplyPortraitRotation={shouldApplyPortraitRotation}
                      />
                    </div>
                  </div>
                )}

                {gameState.phase === 'year_of_plenty' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <ResourceSelector 
                        title="第一张资源"
                        selected={tradeGive}
                        onSelect={setTradeGive}
                      />
                      <ResourceSelector 
                        title="第二张资源"
                        selected={tradeReceive}
                        onSelect={setTradeReceive}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button 
                        onClick={cancelDevCard}
                        className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all cursor-pointer"
                      >
                        取消
                      </button>
                      <button 
                        onClick={() => {
                          if (tradeGive && tradeReceive) {
                            resolveYearOfPlenty(tradeGive, tradeReceive);
                            setTradeGive(null);
                            setTradeReceive(null);
                          }
                        }}
                        disabled={!tradeGive || !tradeReceive}
                        className="flex-[1.5] bg-black text-white py-2 rounded-xl font-bold text-xs hover:bg-zinc-800 transition-all disabled:opacity-20 active:scale-95 cursor-pointer"
                      >
                        确认领取
                      </button>
                    </div>
                  </div>
                )}

                {gameState.phase === 'monopoly' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-5 gap-1">
                      {Object.values(ResourceType).map(res => (
                        <button
                          key={`mono-${res}`}
                          onClick={() => setTradeGive(res)}
                          className={`p-1.5 sm:p-2 rounded-xl border transition-all flex flex-col items-center gap-1 cursor-pointer ${tradeGive === res ? 'border-black bg-slate-50 scale-105 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                        >
                          <ResourceIcon type={res as ResourceType} className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button 
                        onClick={cancelDevCard}
                        className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all cursor-pointer"
                      >
                        取消
                      </button>
                      <button 
                        onClick={() => {
                          if (tradeGive) {
                            resolveMonopoly(tradeGive);
                            setTradeGive(null);
                          }
                        }}
                        disabled={!tradeGive}
                        className="flex-[1.5] bg-black text-white py-2 rounded-xl font-bold text-xs hover:bg-zinc-800 transition-all disabled:opacity-20 active:scale-95 cursor-pointer"
                      >
                        执行垄断
                      </button>
                    </div>
                  </div>
                )}

                {gameState.phase === 'gold_selection' && (
                  <div className="space-y-3">
                    <GoldSelectionPanel 
                      bankResources={gameState.bankResources}
                      amount={gameState.pendingGoldRewards[0].amount}
                      onSelect={selectGoldResource}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player Trade Modal */}
      <AnimatePresence>
        {showPlayerTradeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowPlayerTradeModal(false); }}
          >
            <motion.div 
              drag
              dragListener={false}
              dragControls={playerTradeDragControls}
              dragConstraints={gameContainerRef}
              dragElastic={0}
              dragMomentum={false}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              style={{
                width: '100%',
                maxWidth: `${Math.min(320, Math.max(200, stageWidth - 16))}px`
              }}
              className="bg-white border border-slate-200 rounded-2xl max-h-[calc(100%-16px)] overflow-hidden flex flex-col pointer-events-auto shadow-2xl select-none cursor-default"
            >
              <div 
                onPointerDown={(e) => playerTradeDragControls.start(e)}
                className="p-2 sm:p-2.5 px-3 sm:px-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 cursor-grab active:cursor-grabbing hover:bg-slate-100/50 transition-colors select-none"
              >
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">玩家交易</h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">与其他玩家交换资源</p>
                </div>
                <button 
                  onClick={() => setShowPlayerTradeModal(false)}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors pointer-events-auto cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <RotatedScroll shouldApplyPortraitRotation={shouldApplyPortraitRotation} className="p-2.5 sm:p-3 space-y-2 text-xs flex-1 min-h-0 overflow-y-auto no-scrollbar pr-0.5 pointer-events-auto">
                <div>
                  <h3 className="font-bold text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">你送出</h3>
                  <div className="grid grid-cols-5 gap-1">
                    {Object.values(ResourceType).map(r => (
                      <div key={`offer-${r}`} className="p-0.5 sm:p-1 py-1 border border-slate-200/80 rounded-xl bg-slate-50/50 flex flex-col items-center justify-between gap-0.5">
                        <ResourceIcon type={r as ResourceType} className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                        <div className="flex items-center gap-0.5 w-full justify-between px-0.5">
                          <button 
                            disabled={(playerTradeOffer[r] || 0) <= 0}
                            onClick={() => setPlayerTradeOffer(prev => ({...prev, [r]: (prev[r] || 0) - 1}))}
                            className="w-3.5 h-3.5 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-100 transition-colors text-[9px] pointer-events-auto cursor-pointer"
                          >-</button>
                          <span className="font-bold text-[10px] sm:text-xs text-slate-800">{playerTradeOffer[r] || 0}</span>
                          <button 
                            disabled={(playerTradeOffer[r] || 0) >= (me.resources[r] || 0)}
                            onClick={() => setPlayerTradeOffer(prev => ({...prev, [r]: (prev[r] || 0) + 1}))}
                            className="w-3.5 h-3.5 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-100 transition-colors text-[9px] pointer-events-auto cursor-pointer"
                          >+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">你希望得到</h3>
                  <div className="grid grid-cols-5 gap-1">
                    {Object.values(ResourceType).map(r => (
                      <div key={`request-${r}`} className="p-0.5 sm:p-1 py-1 border border-slate-200/80 rounded-xl bg-slate-50/50 flex flex-col items-center justify-between gap-0.5">
                        <ResourceIcon type={r as ResourceType} className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                        <div className="flex items-center gap-0.5 w-full justify-between px-0.5">
                          <button 
                            disabled={(playerTradeRequest[r] || 0) <= 0}
                            onClick={() => setPlayerTradeRequest(prev => ({...prev, [r]: (prev[r] || 0) - 1}))}
                            className="w-3.5 h-3.5 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-100 transition-colors text-[9px] pointer-events-auto cursor-pointer"
                          >-</button>
                          <span className="font-bold text-[10px] sm:text-xs text-slate-800">{playerTradeRequest[r] || 0}</span>
                          <button 
                            onClick={() => setPlayerTradeRequest(prev => ({...prev, [r]: (prev[r] || 0) + 1}))}
                            className="w-3.5 h-3.5 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 transition-colors text-[9px] pointer-events-auto cursor-pointer"
                          >+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">交易对象</h3>
                  <div className="flex flex-wrap gap-1 font-sans">
                    <button
                      onClick={() => setPlayerTradeTarget(null)}
                      className={`px-2 py-0.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-bold transition-all pointer-events-auto cursor-pointer ${playerTradeTarget === null ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      所有人
                    </button>
                    {gameState?.players.filter(p => p.id !== me.id && !p.isBot).map(p => (
                      <button
                        key={`target-${p.id}`}
                        onClick={() => setPlayerTradeTarget(p.id)}
                        className={`px-2 py-0.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-bold transition-all pointer-events-auto cursor-pointer ${playerTradeTarget === p.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  disabled={
                    Object.values(playerTradeOffer).reduce((a,b) => a+b, 0) === 0 || 
                    Object.values(playerTradeRequest).reduce((a,b) => a+b, 0) === 0
                  }
                  onClick={() => {
                    proposeTrade(playerTradeOffer, playerTradeRequest, playerTradeTarget);
                    setShowPlayerTradeModal(false);
                  }}
                  className="w-full bg-indigo-600 text-white px-4 py-1.5 sm:py-2 rounded-xl font-bold tracking-wide disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-indigo-700 text-[11px] sm:text-xs shadow-md active:scale-[0.98] mt-1 pointer-events-auto cursor-pointer"
                >
                  发起交易
                </button>
              </RotatedScroll>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dev Card Confirmation Modal Removed from here, moved to Map container */}

      {/* Trade Modal */}
      <AnimatePresence>
        {showTradeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-2 sm:p-4 w-full"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowTradeModal(false); }}
          >
            <motion.div 
              drag
              dragListener={false}
              dragControls={bankTradeDragControls}
              dragConstraints={gameContainerRef}
              dragElastic={0}
              dragMomentum={false}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              style={{
                width: '100%',
                maxWidth: `${Math.min(320, Math.max(200, stageWidth - 16))}px`
              }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[calc(100%-16px)] overflow-hidden flex flex-col pointer-events-auto select-none cursor-default"
            >
              <div 
                onPointerDown={(e) => bankTradeDragControls.start(e)}
                className="p-2 sm:p-2.5 px-3 sm:px-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 cursor-grab active:cursor-grabbing hover:bg-slate-100/50 transition-colors select-none"
              >
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">银行兑换</h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">与银行进行 {tradeGive ? getTradeRatio(tradeGive) : '4/3/2'}:1 资源交换</p>
                </div>
                <button onClick={() => setShowTradeModal(false)} className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors pointer-events-auto cursor-pointer">
                  <X size={14} />
                </button>
              </div>
              <RotatedScroll shouldApplyPortraitRotation={shouldApplyPortraitRotation} className="p-2.5 sm:p-3 space-y-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar pointer-events-auto">
                {/* Pay Section (Give) */}
                <div>
                  <h3 className="font-bold text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 mb-0.5 flex justify-between">
                    <span>你送出</span>
                    {tradeGive && <span className="text-indigo-600 normal-case font-bold text-[9px] sm:text-[10px]">兑换比率 {getTradeRatio(tradeGive)}:1</span>}
                  </h3>
                  <div className="grid grid-cols-5 gap-1">
                    {Object.values(ResourceType).map(r => {
                      const ratio = getTradeRatio(r);
                      return (
                        <button 
                          key={`bank-give-${r}`} 
                          onClick={() => {
                            setTradeGive(r);
                            if (tradeReceive === r) setTradeReceive(null);
                          }}
                          className={`p-1 sm:p-1.5 border rounded-xl flex flex-col items-center justify-center gap-1 pointer-events-auto cursor-pointer transition-all ${tradeGive === r ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/80 text-slate-700'}`}
                        >
                          <ResourceIcon type={r as ResourceType} className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
                          <span className={`text-[8px] sm:text-[9px] font-mono font-bold px-1 py-0.5 rounded ${tradeGive === r ? 'bg-indigo-700/50 text-indigo-200' : 'bg-slate-200/60 text-slate-500'}`}>
                            {ratio}:1
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Get Section (Receive) */}
                <div>
                  <h3 className="font-bold text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
                    你希望得到
                  </h3>
                  <div className="grid grid-cols-5 gap-1">
                    {Object.values(ResourceType).map(r => {
                      const isDisabled = tradeGive === r;
                      return (
                        <button 
                          key={`bank-receive-${r}`} 
                          disabled={isDisabled}
                          onClick={() => setTradeReceive(r)}
                          className={`p-1 sm:p-1.5 border rounded-xl flex flex-col items-center justify-center gap-1 pointer-events-auto cursor-pointer transition-all ${tradeReceive === r ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/80 text-slate-700 disabled:opacity-30'}`}
                        >
                          <ResourceIcon type={r as ResourceType} className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
                          <span className={`text-[8px] sm:text-[9px] font-mono font-bold px-1 py-0.5 rounded ${tradeReceive === r ? 'bg-indigo-700/50 text-indigo-200' : 'bg-slate-200/60 text-slate-500'}`}>
                            1
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </RotatedScroll>
              <div className="p-2.5 sm:p-3 bg-slate-50/80 flex flex-col gap-2 shrink-0 border-t border-slate-100 pointer-events-auto">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span className="font-bold text-slate-500 text-[11px] sm:text-xs">交换数量:</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
                      <button 
                        onClick={() => setTradeQuantity(Math.max(1, tradeQuantity - 1))}
                        className="w-4.5 h-4.5 sm:w-5 sm:h-5 rounded hover:bg-slate-100 flex items-center justify-center transition-colors text-xs font-bold text-slate-700 pointer-events-auto cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-mono font-bold text-xs text-slate-800">{tradeQuantity}</span>
                      <button 
                        onClick={() => setTradeQuantity(Math.min(maxTradeQuantity, tradeQuantity + 1))}
                        className="w-4.5 h-4.5 sm:w-5 sm:h-5 rounded hover:bg-slate-100 flex items-center justify-center transition-colors text-xs font-bold text-slate-700 pointer-events-auto cursor-pointer"
                        disabled={tradeQuantity >= maxTradeQuantity}
                      >
                        +
                      </button>
                    </div>
                    <span className="text-[9px] sm:text-[10px] text-slate-400">限额 {maxTradeQuantity}</span>
                  </div>
                </div>
                <button 
                  disabled={!tradeGive || !tradeReceive || tradeGive === tradeReceive || maxTradeQuantity < 1}
                  onClick={handleTrade}
                  className="w-full bg-indigo-600 text-white py-1.5 sm:py-2 rounded-xl font-bold tracking-wide disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.98] text-[11px] sm:text-xs hover:bg-indigo-700 pointer-events-auto cursor-pointer"
                >
                  确认兑换 ({tradeQuantity * currentTradeRatio} 换 {tradeQuantity})
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stealing Modal */}
      <AnimatePresence mode="wait">
        {gameState.phase === 'stealing' && (
          <motion.div 
            key="stealing-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100000] bg-transparent pointer-events-auto flex items-center justify-center p-4 w-full"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div 
              drag
              dragListener={false}
              dragControls={stealDragControls}
              dragConstraints={gameContainerRef}
              dragElastic={0}
              dragMomentum={false}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              style={{
                width: '100%',
                maxWidth: `${Math.min(320, Math.max(200, stageWidth - 16))}px`
              }}
              className="bg-white border border-slate-200 rounded-2xl max-h-[calc(100%-16px)] overflow-hidden flex flex-col pointer-events-auto shadow-2xl select-none cursor-default"
            >
              {/* Header */}
              <div 
                onPointerDown={(e) => stealDragControls.start(e)}
                className="p-2.5 sm:p-3 px-3 sm:px-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 cursor-grab active:cursor-grabbing hover:bg-slate-100/50 transition-colors select-none"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5 truncate">
                    选择一位玩家偷取卡牌
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">
                    从相邻建筑的玩家手中抽取随机资源
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="p-2.5 sm:p-4 flex-1 pointer-events-auto space-y-2">
                <div className="grid grid-cols-1 gap-2 w-full pointer-events-auto">
                {gameState.pendingStealFrom.map(pid => (
                  <button
                    key={pid}
                    onClick={() => {
                      if (isMyHumanTurn && gameState.selectedStealTarget == null) {
                        doSteal(pid);
                      }
                    }}
                    disabled={!isMyHumanTurn || gameState.selectedStealTarget != null}
                    className={`flex items-center justify-between px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border transition-all relative overflow-hidden group pointer-events-auto cursor-pointer ${
                      gameState.selectedStealTarget === pid
                        ? "bg-black text-white border-black scale-[1.01] shadow-md"
                        : gameState.selectedStealTarget != null
                          ? "opacity-20 border-slate-200"
                          : isMyHumanTurn 
                            ? "bg-slate-50/50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/50 active:scale-98" 
                            : "opacity-40 bg-slate-50 border-slate-200 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center gap-2 relative z-10 text-left min-w-0 flex-1 mr-2">
                      <div className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0" style={{ backgroundColor: gameState.players[pid].color }} />
                      <span className={`font-bold tracking-tight text-xs truncate max-w-[100px] sm:max-w-[130px] ${gameState.selectedStealTarget === pid ? 'text-white' : 'text-slate-800'}`}>{gameState.players[pid].name}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 sm:gap-2 relative z-10 shrink-0">
                      <span className={`text-[10px] font-medium whitespace-nowrap ${gameState.selectedStealTarget === pid ? 'text-slate-200' : 'text-slate-500'}`}>卡牌 {Object.values(gameState.players[pid].resources).reduce((a,b)=>a+b,0)}</span>
                      {isMyHumanTurn && gameState.selectedStealTarget === null && (
                        <ChevronRight size={12} className="text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      )}
                      {gameState.selectedStealTarget === pid && (
                        <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center animate-pulse shrink-0">
                          <Check size={10} className="text-white" />
                        </div>
                      )}
                    </div>

                    {gameState.selectedStealTarget === pid && (
                      <motion.div 
                        layoutId="active-target-bg"
                        className="absolute inset-0 bg-black z-0"
                      />
                    )}
                  </button>
                ))}
              </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Dev Card Confirmation Backdrop & Modal */}
      <AnimatePresence>
        {confirmDevCard && (
          <>
            {/* Transparent click blocker backdrop positioned under left panel but above main UI */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[99998] bg-transparent pointer-events-auto cursor-default select-none"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
            {/* Confirmation Card Popup Modal on absolute top layer */}
            <motion.div 
              ref={devCardOverlayRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100002] bg-transparent flex items-center justify-center p-4 pointer-events-none"
            >
              <motion.div 
                drag
                dragConstraints={devCardOverlayRef}
                dragElastic={0.1}
                dragMomentum={false}
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white border-2 border-red-200 w-[160px] sm:w-[190px] rounded-2xl shadow-2xl p-3.5 sm:p-5 text-center pointer-events-auto cursor-grab active:cursor-grabbing select-none"
              >
                {/* Poker Card Visual Header / Illustration */}
                <div className="w-12 h-18 sm:w-14 sm:h-20 rounded-lg bg-white border border-stone-100 shadow-sm mx-auto flex items-center justify-center p-1 mb-2 relative overflow-hidden group">
                  <SmartImg src={getDevCardImg(confirmDevCard)} alt="dev card" className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute top-0.5 left-1 text-[5px] font-black text-red-600/20 uppercase tracking-tighter">CATAN</div>
                  <div className="absolute bottom-0.5 right-1 text-[5px] font-black text-red-600/20 uppercase tracking-tighter">DEV</div>
                </div>

                <h2 className="text-xs sm:text-sm font-serif font-black text-stone-900 mb-0.5">
                  {confirmDevCard === DevCardType.Knight ? '发动骑士' : 
                   confirmDevCard === DevCardType.VictoryPoint ? '使用胜利点' :
                   confirmDevCard === DevCardType.RoadBuilding ? '道路建设' :
                   confirmDevCard === DevCardType.YearOfPlenty ? '丰收之年' : '资源垄断'}
                </h2>
                <p className="text-[9px] sm:text-[10px] font-medium text-stone-500 mb-3 leading-tight px-0.5">
                  {confirmDevCard === DevCardType.Knight ? '移动强盗并偷取资源卡。' : 
                   confirmDevCard === DevCardType.VictoryPoint ? '直接获得 1 点胜利点。' :
                   confirmDevCard === DevCardType.RoadBuilding ? '免费建造 2 条道路。' :
                   confirmDevCard === DevCardType.YearOfPlenty ? '免费领取 2 张资源。' : '选择资源，玩家必须交出。'}
                </p>
                
                <div className="space-y-1.5 pointer-events-auto">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      playDevCard(confirmDevCard);
                      setConfirmDevCard(null);
                    }}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-black uppercase tracking-widest text-[11px] shadow-md transition-all active:scale-95 pointer-events-auto cursor-pointer"
                  >
                    确认使用
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDevCard(null);
                    }}
                    className="w-full bg-stone-100 hover:bg-stone-200 text-stone-600 py-2 rounded-xl font-bold uppercase tracking-wider text-[11px] transition-colors pointer-events-auto cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>



    {/* Game Over Modal (Direct child of gameContainerRef so it covers full screen including header and inherits portrait landscape rotation) */}
    <AnimatePresence>
      {showGameOver && (
        <GameOverModal 
          gameState={gameState} 
          maxWidth={stageWidth}
          shouldApplyPortraitRotation={shouldApplyPortraitRotation}
          onReturnToLobby={handleReturnToLobby}
          onReturnToMap={handleReturnToMap}
        />
      )}
    </AnimatePresence>
    </div>
  </div>
  </>
  );
  }

  return (
    <MotionConfig transformPagePoint={(point) => {
      if (shouldApplyPortraitRotation) {
        return {
          x: point.y,
          y: windowSize.width - point.x
        };
      }
      return point;
    }}>
      <>
        {gameStarted && roomState ? <AssetGate onCancel={handleReturnToLobby}>{mainContent}</AssetGate> : mainContent}
        {!roomState && !isJoinedLobby && exitToast}
        {showSailingScreen && (
          <SailingLoadingScreen 
            key="sailing-loader" 
            loop={!gameStarted || !isBoardReady}
            onComplete={() => {
              if (roomState) {
                setShowSailingScreen(false);
              }
            }} 
            onCancel={() => { setShowSailingScreen(false); handleReturnToLobby(); }}
            text={sailingText} 
          />
        )}

        {/* Global Rules and Sound Settings Modals (rendered at root to bypass any rotated wrapper and remain upright/portrait on vertical screens) */}
        <AnimatePresence>
          {showRulesModal && (
            <RulesModal 
              isOpen={showRulesModal} 
              onClose={() => { setShowRulesModal(false); setRulesActiveView('menu'); }} 
              activeView={rulesActiveView} 
              onActiveViewChange={setRulesActiveView} 
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showSoundModal && (
            <SoundSettingsModal 
              isOpen={showSoundModal} 
              onClose={() => setShowSoundModal(false)} 
              isAdmin={currentUser?.role === 'admin'}
              gameContainerRef={gameContainerRef}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showPwaGuide && (
            <PwaGuideModal 
              isOpen={showPwaGuide} 
              onClose={() => setShowPwaGuide(false)} 
              onInstall={handleInstallPwa}
              hasDeferredPrompt={!!deferredPrompt}
            />
          )}
        </AnimatePresence>
      </>
    </MotionConfig>
  );
}

function MapPreview({ board, isTopologyOnly = false, isLogo = false }: { board: any[], isTopologyOnly?: boolean, isLogo?: boolean }) {
  const [scale, setScale] = useState(0.5);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    
    updateDimensions();
    
    const resizeObserver = new ResizeObserver(() => updateDimensions());
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!board || board.length === 0 || dimensions.width === 0 || dimensions.height === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    const relevantHexes = board.filter(hex => !(hex.isOuterSea || hex.category === 'OuterSea'));
    if (relevantHexes.length === 0) return;

    relevantHexes.forEach(hex => {
      const x = HEX_WIDTH * (hex.q + hex.r / 2);
      const y = HEX_HEIGHT * 0.75 * hex.r;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    const boardWidth = maxX - minX + HEX_WIDTH * 2;
    const boardHeight = maxY - minY + HEX_HEIGHT * 2;
    const scaleX = dimensions.width / boardWidth;
    const scaleY = dimensions.height / boardHeight;
    setScale(Math.min(scaleX, scaleY) * 0.9);
    setIsReady(true);
  }, [board, dimensions]);

  const hexCoords = useMemo(() => {
    if (!board) return [];
    return board
      .filter(hex => !(hex.isOuterSea || hex.category === 'OuterSea'))
      .map(hex => {
        const x = HEX_WIDTH * (hex.q + hex.r / 2);
        const y = HEX_HEIGHT * 0.75 * hex.r;
        return { ...hex, x, y, radius: HEX_RADIUS };
      });
  }, [board]);

  return (
    <div ref={containerRef} className={`w-full h-full flex items-center justify-center transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
      <Stage width={dimensions.width} height={dimensions.height}>
        <Layer x={dimensions.width / 2} y={dimensions.height / 2} scale={{ x: scale, y: scale }}>
          {hexCoords.map(hex => {
            let fill = '#fff';
            if (isTopologyOnly) {
              const isDesert = (hex.type === HexType.Desert || hex.category === 'Desert') && !isLogo;
              const isMainland = hex.category === 'Mainland' || hex.isMainland || (hex.category === 'Desert' && isLogo) || (hex.type === HexType.Gold && hex.isMainland);
              const isIsland = hex.category === 'Island' || hex.isIsland || (hex.type === HexType.Gold && hex.isIsland);
              
              if (isDesert) fill = '#dca467'; // 沙漠 (Desert)
              else if (isMainland) fill = '#558b2f'; // 大陆 (Mainland)
              else if (isIsland) fill = '#7cb342'; // 岛屿 (Island)
              else fill = '#4eaadd'; // 内海 (InnerSea)
            } else {
              const resType = hex.type === HexType.Gold ? 'gold' : hex.type === HexType.Desert ? 'desert' : hex.type === HexType.Sea ? 'sea' : HEX_RESOURCES[hex.type as HexType];
              fill = RESOURCE_COLORS[resType as any] || '#ccc';
            }

            return (
              <Group key={hex.id} x={hex.x} y={hex.y}>
                <RegularPolygon
                  sides={6}
                  radius={HEX_RADIUS - 1}
                  fill={fill}
                  stroke="rgba(0,0,0,0.1)"
                  strokeWidth={1}
                  rotation={0}
                />
                {!isTopologyOnly && hex.number && (
                  <Group>
                    <Circle radius={12} fill="#fff" shadowBlur={2} shadowOpacity={0.2} />
                    <Text
                      text={hex.number.toString()}
                      fontSize={14}
                      fontStyle="bold"
                      fontFamily="Times New Roman, Times, serif"
                      fill={hex.number === 6 || hex.number === 8 ? '#d32f2f' : '#333'}
                      offsetX={hex.number > 9 ? 8 : 4}
                      offsetY={6}
                    />
                  </Group>
                )}
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}

function ResourceRow({ type, count, compact, playerId }: { type: ResourceType, count: number, compact?: boolean, playerId?: string | number }) {
  const prevCount = useRef<number>(count);
  const prevPlayerId = useRef<string | number | undefined>(playerId);
  const [anim, setAnim] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    if (prevPlayerId.current !== playerId) {
      // Player switched or first load, just update refs without animation
      prevCount.current = count;
      prevPlayerId.current = playerId;
      setAnim(null);
      return;
    }

    if (count > prevCount.current) {
      const diff = count - prevCount.current;
      audioService.play('resource');
      setAnim({
        id: Date.now(),
        text: `+${diff}`
      });
    }
    prevCount.current = count;
  }, [count, playerId]);

  useEffect(() => {
    if (anim) {
      const timer = setTimeout(() => {
        setAnim(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [anim]);

  return (
    <div className={`flex items-center justify-between ${compact ? 'py-1 px-1.5' : 'py-2 px-3'} rounded-md bg-white border border-black/10 hover:shadow-md transition-all group`}>
      <style>{`
        @keyframes resourceBounceFade {
          0% {
            transform: scale(0.3) translateY(0);
            color: rgb(239, 68, 68);
            opacity: 0;
          }
          10% {
            transform: scale(1.4) translateY(-4px);
            color: rgb(239, 68, 68);
            opacity: 1;
          }
          20% {
            transform: scale(0.9) translateY(1px);
            color: rgb(239, 68, 68);
            opacity: 1;
          }
          30% {
            transform: scale(1) translateY(0);
            color: rgb(239, 68, 68);
            opacity: 1;
          }
          33.3% {
            transform: scale(1) translateY(0);
            color: rgb(239, 68, 68);
            opacity: 1;
          }
          100% {
            transform: scale(1) translateY(0);
            color: rgb(156, 163, 175);
            opacity: 0;
          }
        }
        .resource-diff-anim {
          animation: resourceBounceFade 3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          display: inline-block;
        }
      `}</style>
      <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
        <div 
          className={`${compact ? 'w-5 h-5' : 'w-8 h-8 md:w-9 md:h-9'} shrink-0 rounded-sm lg:rounded-md flex items-center justify-center shadow-inner transition-transform group-hover:scale-110`}
        >
          <ResourceIcon type={type} className={compact ? 'w-3.5 h-3.5' : 'w-5 h-5 lg:w-6 lg:h-6'} />
        </div>
        <span className={`font-black uppercase tracking-tight opacity-70 group-hover:opacity-100 transition-opacity ${compact ? 'text-[8px]' : 'text-[11px]'}`}>{RESOURCE_NAMES[type]}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {anim && (
          <span 
            key={anim.id} 
            className={`resource-diff-anim font-mono font-black ${compact ? 'text-[10px] mr-0.5' : 'text-sm mr-1'}`}
          >
            {anim.text}
          </span>
        )}
        <span className={`font-mono font-black ${compact ? 'text-[9px] pl-1' : 'text-base'}`}>{count}</span>
      </div>
    </div>
  );
}

function BuildItem({ id, icon, label, cost, onClick, active, disabled, compact, isDevCard, activeColor }: { id?: string, icon: React.ReactNode, label: string, cost: Record<string, number>, onClick?: () => void, active?: boolean, disabled?: boolean, compact?: boolean, isDevCard?: boolean, activeColor?: string }) {
  return (
    <button 
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between ${compact ? 'py-1 px-2' : 'py-3 px-4'} rounded-xl border transition-all ${disabled ? '' : 'group'} ${active ? 'scale-[1.01]' : `bg-white border-black/5 ${disabled ? '' : 'hover:border-black/20 hover:shadow-xl'}`} ${disabled ? 'cursor-not-allowed text-black' : ''} flex-1 min-h-0 min-w-0 lg:max-h-20`}
      style={active ? { 
        backgroundColor: (activeColor || '#10b981') + '08', 
        borderColor: (activeColor || '#10b981') + '30',
        boxShadow: `0 8px 24px -6px ${(activeColor || '#10b981')}20`
      } : {}}
    >
      <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-3'} min-w-0`}>
        <div 
          className={`${compact ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-10 h-10'} shrink-0 rounded-lg flex items-center justify-center transition-all duration-300 ${active ? '' : (disabled ? 'bg-stone-100 text-stone-400' : 'bg-black text-white')}`}
          style={active ? { backgroundColor: activeColor, color: 'white' } : {}}
        >
          {React.cloneElement(icon as React.ReactElement<any>, { size: compact ? 12 : 18 })}
        </div>
        <div className="flex flex-col items-start min-w-0">
          <span className={`${compact ? 'text-[8px] sm:text-[9px]' : 'text-sm'} font-black uppercase tracking-widest truncate w-full ${active ? 'text-stone-900 opacity-90' : 'text-stone-800'}`}>{label}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 opacity-60 shrink-0">
        <div className="flex gap-1.5">
          {Object.entries(cost).map(([res, amt]) => (
            <div key={res} className="flex flex-col items-center gap-0.5">
              <ResourceIcon type={res as ResourceType} className={compact ? 'w-2.5 h-2.5' : 'w-5 h-5'} />
              <span className={`${compact ? 'text-[7px]' : 'text-[10px]'} font-mono font-bold leading-none`}>{amt}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

function HexCell({ hex, isSelected, isRobber, isPirate, onClick }: { hex: any, isSelected: boolean, isRobber: boolean, isPirate: boolean, onClick: () => void }) {
  const getHexImgSrc = (type: HexType) => {
    switch (type) {
      case HexType.Forest: return FOREST_IMG;
      case HexType.Hills: return HILLS_IMG;
      case HexType.Pasture: return PASTURE_IMG;
      case HexType.Fields: return FIELDS_IMG;
      case HexType.Mountains: return Mountains_IMG;
      case HexType.Desert: return Desert_IMG;
      case HexType.Gold: return GOLD_IMG;
      case HexType.Sea: return SEA_HEX_IMG;
      default: return '';
    }
  };

  const src = getHexImgSrc(hex.type);
  const { image } = useGameImage(src);

  const color = RESOURCE_COLORS[hex.type === HexType.Gold ? 'gold' : hex.type === HexType.Desert ? 'desert' : hex.type === HexType.Sea ? 'sea' : (HEX_RESOURCES[hex.type as HexType] as any)] || '#ccc';

  return (
    <Group 
      x={hex.x} 
      y={hex.y} 
      onClick={onClick} 
      onTap={onClick}
      onMouseEnter={(e: any) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'pointer';
      }}
      onMouseLeave={(e: any) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'default';
      }}
    >
      <RegularPolygon
        sides={6}
        radius={HEX_RADIUS - 1}
        fill={image ? undefined : color}
        fillPatternImage={image || undefined}
        fillPatternScale={image ? { x: (HEX_RADIUS * 2) / image.width, y: (HEX_RADIUS * 2) / image.height } : undefined}
        fillPatternOffset={image ? { x: image.width / 2, y: image.height / 2 } : undefined}
        stroke="rgba(0,0,0,0.1)"
        strokeWidth={1}
        opacity={hex.type === HexType.Sea ? 0.8 : 1}
        shadowBlur={isRobber || isPirate ? 20 : 0}
        shadowOpacity={0.2}
        rotation={0}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />
      
      {hex.number && (
        <Group listening={false}>
          <Circle 
            radius={12} 
            fill="rgba(255, 255, 255, 0.7)" 
            stroke="rgba(0,0,0,0.1)" 
            strokeWidth={1}
            shadowBlur={5}
            shadowOpacity={0.1}
            perfectDrawEnabled={false}
          />
          <Text
            text={hex.number.toString()}
            fontSize={12}
            name="hex-number"
            fontStyle="bold"
            fill={hex.number === 6 || hex.number === 8 ? '#E74C3C' : '#1a1a1a'}
            width={24}
            height={16}
            offsetX={12}
            offsetY={8}
            align="center"
            verticalAlign="middle"
            fontFamily="Times New Roman, Times, serif"
          />
          <ProbabilityDots value={hex.number} />
        </Group>
      )}
    </Group>
  );
}

function ProbabilityDots({ value }: { value: number }) {
  const dots = value === 2 || value === 12 ? 1 : 
               value === 3 || value === 11 ? 2 :
               value === 4 || value === 10 ? 3 :
               value === 5 || value === 9 ? 4 :
               value === 6 || value === 8 ? 5 : 0;
  
  return (
    <Group y={8}>
      {Array.from({ length: dots }).map((_, i) => (
        <Circle 
          key={i} 
          x={(i - (dots - 1) / 2) * 3} 
          radius={1} 
          fill={value === 6 || value === 8 ? '#E74C3C' : '#000'} 
          opacity={0.8}
          perfectDrawEnabled={false}
        />
      ))}
    </Group>
  );
}

function DiceFacePips({ value }: { value: number }) {
  // Indices for active dots in a 3x3 grid:
  // 0 1 2
  // 3 4 5
  // 6 7 8
  const getPipIndices = (val: number) => {
    switch (val) {
      case 1: return [4];
      case 2: return [0, 8];
      case 3: return [0, 4, 8];
      case 4: return [0, 2, 6, 8];
      case 5: return [0, 2, 4, 6, 8];
      case 6: return [0, 2, 3, 5, 6, 8];
      default: return [];
    }
  };

  const activeIndices = getPipIndices(value);

  return (
    <div className="w-full h-full p-[14%] grid grid-cols-3 grid-rows-3 gap-[6%]">
      {Array.from({ length: 9 }).map((_, idx) => {
        const isActive = activeIndices.includes(idx);
        if (!isActive) return <div key={idx} />;
        
        // Special red center pip for face 1
        const isRedCenter = value === 1 && idx === 4;
        return (
          <div 
            key={idx} 
            className={`rounded-full shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.65)] ${
              isRedCenter 
                ? 'bg-red-500 scale-110 shadow-[inset_0_1.5px_2px_rgba(150,0,0,0.8)]' 
                : 'bg-neutral-800'
            }`} 
          />
        );
      })}
    </div>
  );
}

function DiceFace({ value, isRolling, diceIndex, size = 44 }: { value: number, isRolling?: boolean, diceIndex: 1 | 2, size?: number }) {
  const getTargetAngles = (val: number) => {
    switch (val) {
      case 1: return { x: 0, y: 0 };
      case 6: return { x: 0, y: 180 };
      case 3: return { x: 0, y: 90 };
      case 4: return { x: 0, y: -90 };
      case 2: return { x: -90, y: 0 };
      case 5: return { x: 90, y: 0 };
      default: return { x: 0, y: 0 };
    }
  };

  const [angles, setAngles] = useState(() => {
    const base = getTargetAngles(value);
    return { x: base.x, y: base.y, z: 0 };
  });
  const [isAnimating, setIsAnimating] = useState(false);
  const wasRollingRef = useRef(false);
  const halfSize = size / 2;

  useEffect(() => {
    const base = getTargetAngles(value);
    if (isRolling) {
      setIsAnimating(true);
      wasRollingRef.current = true;
      // Immediately reset to a starting offset (no transition) to prepare for a big spin
      const initX = Math.floor(Math.random() * 90) - 45;
      const initY = Math.floor(Math.random() * 90) - 45;
      const initZ = Math.floor(Math.random() * 90) - 45;
      
      setAngles({ x: initX, y: initY, z: initZ });

      // Apply the massive 3D spins in next frame
      const frame = requestAnimationFrame(() => {
        const spinsX = diceIndex === 1 ? 6 : 5;
        const spinsY = diceIndex === 1 ? 5 : 6;
        const spinsZ = diceIndex === 1 ? 4 : 3;
        
        setAngles({
          x: spinsX * 360 + base.x,
          y: spinsY * 360 + base.y,
          z: spinsZ * 360 // Perfectly flat frontal face, no organic lean/tilt
        });
      });

      return () => cancelAnimationFrame(frame);
    } else {
      setIsAnimating(false);
      wasRollingRef.current = false;
      setAngles({ x: base.x, y: base.y, z: 0 });
    }
  }, [value, isRolling, diceIndex]);

  return (
    <div className="relative select-none overflow-visible origin-center" style={{ width: size, height: size, perspective: '300px' }}>
      <style>{`
        @keyframes diceBounce {
          0% { transform: translateY(0) scale(0.8); }
          15% { transform: translateY(-38px) scale(1.15) rotate(12deg); }
          30% { transform: translateY(10px) scale(0.85) rotate(-8deg); }
          45% { transform: translateY(-18px) scale(1.08) rotate(5deg); }
          60% { transform: translateY(5px) scale(0.95) rotate(-3deg); }
          75% { transform: translateY(-6px) scale(1.02) rotate(1deg); }
          90% { transform: translateY(1px) scale(0.99); }
          100% { transform: translateY(0) scale(1); }
        }
        .dice-bounce-active {
          animation: diceBounce 2.5s cubic-bezier(0.15, 0.85, 0.3, 1) forwards;
        }
      `}</style>
      <div 
        className={`w-full h-full relative ${isAnimating ? 'dice-bounce-active' : ''}`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div 
          className="w-full h-full relative"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${angles.x}deg) rotateY(${angles.y}deg) rotateZ(${angles.z}deg)`,
            transition: isAnimating ? 'transform 2.5s cubic-bezier(0.15, 0.85, 0.3, 1)' : 'none'
          }}
        >
          {/* Front Face: 1 */}
          <div className="absolute inset-0 bg-stone-50 rounded-lg border border-black/15 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1),_0_2px_4px_rgba(0,0,0,0.05)]" style={{ transform: `rotateY(0deg) translateZ(${halfSize}px)`, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            <DiceFacePips value={1} />
          </div>
          {/* Back Face: 6 */}
          <div className="absolute inset-0 bg-stone-50 rounded-lg border border-black/15 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1),_0_2px_4px_rgba(0,0,0,0.05)]" style={{ transform: `rotateY(180deg) translateZ(${halfSize}px)`, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            <DiceFacePips value={6} />
          </div>
          {/* Left Face: 3 */}
          <div className="absolute inset-0 bg-stone-50 rounded-lg border border-black/15 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1),_0_2px_4px_rgba(0,0,0,0.05)]" style={{ transform: `rotateY(-90deg) translateZ(${halfSize}px)`, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            <DiceFacePips value={3} />
          </div>
          {/* Right Face: 4 */}
          <div className="absolute inset-0 bg-stone-50 rounded-lg border border-black/15 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1),_0_2px_4px_rgba(0,0,0,0.05)]" style={{ transform: `rotateY(90deg) translateZ(${halfSize}px)`, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            <DiceFacePips value={4} />
          </div>
          {/* Top Face: 2 */}
          <div className="absolute inset-0 bg-stone-50 rounded-lg border border-black/15 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1),_0_2px_4px_rgba(0,0,0,0.05)]" style={{ transform: `rotateX(90deg) translateZ(${halfSize}px)`, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            <DiceFacePips value={2} />
          </div>
          {/* Bottom Face: 5 */}
          <div className="absolute inset-0 bg-stone-50 rounded-lg border border-black/15 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1),_0_2px_4px_rgba(0,0,0,0.05)]" style={{ transform: `rotateX(-90deg) translateZ(${halfSize}px)`, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            <DiceFacePips value={5} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, color, desc }: { title: string, color: string, desc: string }) {
  return (
    <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl shadow-2xl border border-black/5 w-48 transition-transform hover:-translate-y-1">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-3 h-3 rounded-full ${color} shadow-lg`} />
        <span className="text-[10px] font-black uppercase tracking-widest">{title}</span>
      </div>
      <p className="text-[10px] opacity-40 leading-relaxed font-medium">{desc}</p>
    </div>
  );
}

function CostCard({ label, cost }: { label: string, cost: Record<string, number> }) {
  return (
    <div className="p-4 rounded-2xl bg-stone-50 border border-black/5">
      <h4 className="font-black text-[10px] uppercase tracking-widest mb-3 opacity-40">{label}</h4>
      <div className="flex flex-wrap gap-2">
        {Object.entries(cost).map(([res, amt]) => (
          <div key={res} className="flex flex-col items-center gap-0.5 bg-white px-2 py-1 rounded-lg border border-black/5 shadow-sm min-w-[32px]">
            <ResourceIcon type={res as ResourceType} className="w-3 h-3" />
            <span className="text-[9px] font-bold">{amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiscardPanel({ player, amount, onDiscard, onChange, shouldApplyPortraitRotation }: { player: any, amount: number, onDiscard: (res: any) => void, onChange?: (res: any) => void, shouldApplyPortraitRotation: boolean }) {
  const [selected, setSelected] = useState<Record<ResourceType, number>>({
    [ResourceType.Lumber]: 0,
    [ResourceType.Brick]: 0,
    [ResourceType.Wool]: 0,
    [ResourceType.Grain]: 0,
    [ResourceType.Ore]: 0,
  });

  const totalSelected = Object.values(selected).reduce((a, b) => a + b, 0);
  const remaining = amount - totalSelected;

  const handleIncrement = (res: ResourceType) => {
    if (totalSelected < amount && player.resources[res] > selected[res]) {
      const newVal = { ...selected, [res]: selected[res] + 1 };
      setSelected(newVal);
      onChange?.(newVal);
    }
  };

  const handleDecrement = (res: ResourceType) => {
    if (selected[res] > 0) {
      const newVal = { ...selected, [res]: selected[res] - 1 };
      setSelected(newVal);
      onChange?.(newVal);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <RotatedScroll shouldApplyPortraitRotation={shouldApplyPortraitRotation} className="flex-1 overflow-y-auto space-y-1 p-1 no-scrollbar min-h-0">
        {Object.values(ResourceType).map(res => {
          const count = player.resources[res];
          if (count === 0) return null;
          return (
            <div key={res} className="flex items-center justify-between px-2.5 py-1.5 bg-white rounded-lg shadow-sm border border-black/[0.04] shrink-0">
              <div className="flex items-center gap-1.5">
                <ResourceIcon type={res as ResourceType} className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="font-bold text-[11px] sm:text-xs text-slate-700">{RESOURCE_NAMES[res as ResourceType]}</span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">({count})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => handleDecrement(res)}
                  disabled={selected[res] === 0}
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-20 transition-all text-[10px] sm:text-xs font-black shrink-0"
                >
                  -
                </button>
                <span className="font-mono font-black w-4 text-center text-[11px] sm:text-xs text-slate-800 shrink-0">{selected[res]}</span>
                <button 
                  onClick={() => handleIncrement(res)}
                  disabled={totalSelected >= amount || selected[res] >= count}
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-black text-white flex items-center justify-center hover:bg-zinc-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-40 transition-all text-[10px] sm:text-xs font-black shadow-sm shrink-0"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </RotatedScroll>

      <div className="shrink-0 p-1 pt-2 mt-auto bg-white/80 backdrop-blur-sm border-t border-slate-50 z-10">
        <button 
          onClick={() => onDiscard(selected)}
          disabled={remaining !== 0}
          className="w-full py-2 sm:py-2.5 bg-slate-900 text-white rounded-lg text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:opacity-60 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
        >
          确认弃牌
        </button>
      </div>
    </div>
  );
}
