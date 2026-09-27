import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { preloadAllAssets } from '../assetPreloader';
import { LoadingDots, SailingScene } from './SailingScene';

export function StartupScreen({ waitingForAccount, waitingLabel = '资源已就绪，正在连接账号…', onComplete }: { waitingForAccount: boolean; waitingLabel?: string; onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('资源加载中（0/34）');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const sailing = ready && !waitingForAccount;

  useEffect(() => {
    const controller = new AbortController();
    setFailed(0);
    setSeconds(0);
    const clock = setInterval(() => setSeconds(value => value + 1), 1000);
    void preloadAllAssets((percent, text) => {
      setProgress(percent);
      setLabel(text);
    }, { includeAudio: true, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setReady(result.ready);
      setFailed(result.failed.length);
      clearInterval(clock);
    }).catch(() => { if (!controller.signal.aborted) setFailed(1); clearInterval(clock); });
    return () => { controller.abort(); clearInterval(clock); };
  }, [attempt]);

  return <div className="app-screen startup-ocean" data-startup={sailing ? 'sailing' : failed ? 'failed' : 'loading'}>
    <SailingScene sailing={sailing} onComplete={() => callback.current()} />
    <div className={`startup-progress${sailing ? ' is-sailing' : ''}`}>
      {sailing ? <p>正在驶入海域<LoadingDots /></p> : <>
        <p role="status">{failed ? `还有 ${failed} 项资源未加载成功` : ready ? waitingLabel : label}</p>
        <div className="startup-meter" role="progressbar" aria-label="资源加载" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div style={{ width: `${progress}%` }} /><span>{progress}%</span>
        </div>
        {!ready && !failed && <p className="startup-elapsed">已等待 {seconds} 秒{seconds >= 10 ? '，网络较慢，正在等待剩余资源' : ''}</p>}
        {failed > 0 && <button onClick={() => setAttempt(value => value + 1)} className="startup-retry"><RefreshCw size={16} />重试未完成资源</button>}
      </>}
    </div>
  </div>;
}
