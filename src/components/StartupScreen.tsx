import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { preloadAllAssets } from '../assetPreloader';
import { LoadingDots, SailingScene } from './SailingScene';

export function StartupScreen({ waitingForAccount, onComplete }: { waitingForAccount: boolean; onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('资源加载中（0/34）');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const displayed = useRef(0);
  const [sailing, setSailing] = useState(false);
  const [waterSettled, setWaterSettled] = useState(false);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const complete = ready && !waitingForAccount && failed === 0;
  // Media accounts for 98%; the final step also requires the app and account.
  const targetProgress = complete ? 100 : Math.floor(progress * 0.98);

  useEffect(() => {
    const from = displayed.current;
    const start = performance.now();
    let frame: number;
    const update = (now: number) => {
      const fraction = Math.min(1, (now - start) / 420);
      displayed.current = Math.round(from + (targetProgress - from) * fraction);
      setDisplayProgress(displayed.current);
      if (fraction < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [targetProgress]);

  useEffect(() => {
    if (!complete || displayProgress !== 100 || !waterSettled) return;
    const timer = setTimeout(() => setSailing(true), 180);
    return () => clearTimeout(timer);
  }, [complete, displayProgress, waterSettled]);

  useEffect(() => {
    if (complete || failed) return;
    const clock = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(clock);
  }, [complete, failed]);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(0);
    setSeconds(0);
    void preloadAllAssets((percent, text) => {
      setProgress(percent);
      setLabel(text);
    }, { includeAudio: true, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setReady(result.ready);
      setFailed(result.failed.length);
    }).catch(() => { if (!controller.signal.aborted) setFailed(1); });
    return () => { controller.abort(); };
  }, [attempt]);

  return <div className="app-screen startup-ocean" data-startup={sailing ? 'sailing' : failed ? 'failed' : 'loading'}>
    <SailingScene sailing={sailing} waterProgress={displayProgress} onWaterSettled={() => setWaterSettled(true)} onComplete={() => callback.current()} />
    <div className="startup-progress startup-loading" aria-hidden={sailing}>
        <p role="status">{failed ? `还有 ${failed} 项资源未加载成功` : label}</p>
        <div className="startup-meter" role="progressbar" aria-label="资源加载" aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayProgress}>
          <div style={{ width: `${displayProgress}%` }} /><span>{displayProgress}%</span>
        </div>
        <p className="startup-elapsed">已等待 {seconds} 秒<br />{failed ? '请重试未完成资源' : ready && waitingForAccount ? '正在准备游戏…' : !ready && seconds >= 10 ? '正在等待剩余资源' : '\u00a0'}</p>
        {failed > 0 && <button onClick={() => setAttempt(value => value + 1)} className="startup-retry"><RefreshCw size={16} />重试未完成资源</button>}
    </div>
    <div className="startup-progress is-sailing startup-caption" aria-hidden={!sailing}>
      <p>正在驶入海域<LoadingDots /></p>
    </div>
  </div>;
}
