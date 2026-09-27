import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { preloadAllAssets } from '../assetPreloader';
import { SAILING_BOAT_IMG } from '../images';
import { SmartImage } from './SmartImage';

export function StartupScreen({ waitingForAccount, onComplete }: { waitingForAccount: boolean; onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('资源加载中（0/34）');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const sailing = ready && !waitingForAccount;

  useEffect(() => {
    const controller = new AbortController();
    setFailed(0);
    setSeconds(0);
    const reveal = setTimeout(() => setShowProgress(true), 180);
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
    return () => { controller.abort(); clearInterval(clock); clearTimeout(reveal); };
  }, [attempt]);

  useEffect(() => {
    if (!sailing) return;
    const timer = setTimeout(() => callback.current(), 1600);
    return () => clearTimeout(timer);
  }, [sailing]);

  return <div className="app-screen startup-ocean" data-startup={sailing ? 'sailing' : failed ? 'failed' : 'loading'}>
    {sailing && <motion.div className="startup-boat" initial={{ left: '-20%' }} animate={{ left: '120%' }} transition={{ duration: 1.5, ease: 'linear' }}>
      <SmartImage src={SAILING_BOAT_IMG} alt="帆船" className="w-full h-full object-contain" />
    </motion.div>}
    <svg className="startup-sea" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 450 Q125 478 250 450 T500 450 T750 450 T1000 450 L1000 1000 L0 1000Z" fill="#52a3d9" />
      <path d="M0 450 Q125 478 250 450 T500 450 T750 450 T1000 450" stroke="#87c2df" strokeWidth="5" fill="none" />
    </svg>
    <div className="startup-progress">
      {sailing ? <p>正在驶入海域……</p> : showProgress && <>
        <p role="status">{failed ? `还有 ${failed} 项资源未加载成功` : ready ? '资源已就绪，正在连接账号…' : label}</p>
        <div className="startup-meter" role="progressbar" aria-label="资源加载" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div style={{ width: `${progress}%` }} /><span>{progress}%</span>
        </div>
        {!ready && !failed && <p className="startup-elapsed">已等待 {seconds} 秒{seconds >= 10 ? '，网络较慢，正在等待剩余资源' : ''}</p>}
        {failed > 0 && <button onClick={() => setAttempt(value => value + 1)} className="startup-retry"><RefreshCw size={16} />重试未完成资源</button>}
      </>}
    </div>
  </div>;
}
