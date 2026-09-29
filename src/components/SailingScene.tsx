import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SAILING_BOAT_IMG } from '../images';
import { SmartImage } from './SmartImage';

export function LoadingDots() {
  return <span className="loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>;
}

export function SailingScene({ sailing = true, loop = false, onComplete, waterProgress, onWaterSettled }: { sailing?: boolean; loop?: boolean; onComplete?: () => void; waterProgress?: number; onWaterSettled?: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const level = Math.max(0, Math.min(1, (waterProgress ?? 100) / 100));
  const levelRef = useRef(level);
  levelRef.current = level;
  const settledCallback = useRef(onWaterSettled);
  settledCallback.current = onWaterSettled;
  const [phase, setPhase] = useState(0);
  const livePhase = useRef(0);
  const paintWave = useRef<(angle: number) => void>(() => {});
  const rising = waterProgress !== undefined;
  useEffect(() => {
    if (!rising) return;
    let frame: number;
    let previous = performance.now();
    let angle = 0;
    let speed = 0.0024;
    const tick = (now: number) => {
      const dt = Math.min(40, now - previous);
      previous = now;
      const target = levelRef.current < 1 ? 0.0024 : 0;
      speed += (target - speed) * (1 - Math.exp(-dt / 100));
      angle += speed * dt;
      livePhase.current = angle;
      paintWave.current(angle);
      if (levelRef.current === 1 && speed < 0.00001) {
        setPhase(angle);
        settledCallback.current?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [rising]);
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, []);
  const completed = useRef(false);
  const shadowPath = useRef<SVGPathElement>(null);
  const waterPath = useRef<SVGPathElement>(null);
  const crestPath = useRef<SVGPathElement>(null);
  useEffect(() => { completed.current = false; }, [sailing]);

  const scene = useMemo(() => {
    const { width: w, height: h } = size;
    const portrait = w < h;
    const wavelength = portrait ? w / 2 : w / 3.5;
    const amplitude = Math.min(wavelength * (portrait ? 0.05 : 0.03), h * (portrait ? 0.02 : 0.03)) * level;
    const baseY = h * (1 - 0.55 * level);
    const boatSize = portrait ? w / 8 : h / 6;
    const waveY = (x: number) => Math.sin(x / wavelength * Math.PI * 2 + phase) * amplitude + baseY;
    const waveLine = (angle: number) => {
      const y = (x: number) => Math.sin(x / wavelength * Math.PI * 2 + angle) * amplitude + baseY;
      let line = `M0 ${y(0)}`;
      for (let x = 10; x < w; x += 10) line += ` L${x} ${y(x)}`;
      return line + ` L${w} ${y(w)}`;
    };
    const line = waveLine(rising ? livePhase.current : phase);
    // The boat and water use the same curve, including its slope at the hull.
    const frames = sailing ? Array.from({ length: 101 }, (_, i) => {
      const x = -300 + (w + boatSize * 0.6 + 300) * i / 100;
      const angle = Math.atan(Math.cos(x / wavelength * Math.PI * 2 + phase) * amplitude * Math.PI * 2 / wavelength) * (portrait ? 0.2 : 0.12) * 180 / Math.PI;
      return `${i}% { transform: translate3d(${x}px, ${waveY(x)}px, 0) rotate(${angle}deg); }`;
    }).join('\n') : '';
    return { line, fill: `${line} L${w} ${h} L0 ${h} Z`, boatSize, frames, waveLine };
  }, [size, level, phase, sailing, rising]);

  // Keep frame updates out of React so loading the lazy application is not starved.
  paintWave.current = angle => {
    const line = scene.waveLine(angle);
    shadowPath.current?.setAttribute('d', line);
    crestPath.current?.setAttribute('d', line);
    waterPath.current?.setAttribute('d', `${line} L${size.width} ${size.height} L0 ${size.height} Z`);
    container.current?.setAttribute('data-wave-phase', String(angle));
  };

  return <div ref={container} className="startup-sea" data-water-level={level} data-wave-phase={phase} aria-hidden="true">
    <style>{`@keyframes sailBoatAnim { ${scene.frames} }`}</style>
    {sailing && <div className="startup-boat" data-sailing-boat
      onAnimationIteration={() => {
        // Readiness must not restart the voyage or start a second completion timer.
        if (!loop && !completed.current) { completed.current = true; callback.current?.(); }
      }}
      style={{ transformOrigin: '0 0', animation: 'sailBoatAnim 2.5s linear infinite' }}>
      <SmartImage src={SAILING_BOAT_IMG} alt="帆船" style={{ width: scene.boatSize, height: scene.boatSize, transform: 'translate(-50%, -95%)' }} className="object-contain" />
    </div>}
    <svg className="startup-sea" viewBox={`0 0 ${size.width} ${size.height}`}>
      <path ref={shadowPath} d={scene.line} stroke="#1e6b9c" strokeWidth="12" opacity="0.4" fill="none" style={{ filter: 'blur(5px)' }} />
      <path ref={waterPath} d={scene.fill} fill="#27a6e6" />
      <path ref={crestPath} d={scene.line} stroke="#85caec" strokeWidth="4" fill="none" />
    </svg>
  </div>;
}

export function SailingTransition({ text, loop = false, onComplete }: { text: string; loop?: boolean; onComplete: () => void }) {
  return <div className="app-screen startup-ocean" data-game-sailing>
    <SailingScene loop={loop} onComplete={onComplete} />
    <div className="startup-progress is-sailing"><p role="status">{text.replace(/[.\u2026]+$/, '')}<LoadingDots /></p></div>
  </div>;
}
