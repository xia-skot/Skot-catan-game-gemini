import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { checkIsAssetsCached, preloadAllAssets } from '../assetPreloader';

export function AssetGate({ children, onCancel, onReady }: { children: React.ReactNode; onCancel: () => void; onReady?: () => void }) {
  const [ready, setReady] = useState(checkIsAssetsCached);
  const [label, setLabel] = useState('正在准备贴图');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(false);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  useEffect(() => { if (ready) readyCallback.current?.(); }, [ready]);
  useEffect(() => {
    if (ready) return;
    const controller = new AbortController();
    const timer = setTimeout(() => setVisible(true), 180);
    setFailed(false);
    void preloadAllAssets((_, text) => setLabel(text), { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setReady(result.ready);
      setFailed(!result.ready);
      if (!result.ready) setLabel(`还有 ${result.failed.length} 张贴图未就绪`);
    }).catch(() => { if (!controller.signal.aborted) { setFailed(true); setLabel('贴图暂时未能加载'); } });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [attempt, ready]);
  if (ready) return <>{children}</>;
  return <div className="app-screen flex flex-col items-center justify-center bg-slate-50 text-slate-700 gap-5" aria-busy={!failed}>
    {visible && <>
      <p role="status" className="text-sm font-medium">{label}</p>
      <div className="flex gap-4">
        {failed && <button onClick={() => setAttempt(value => value + 1)} className="flex gap-2 items-center px-4 py-2 bg-indigo-600 text-white rounded-lg"><RefreshCw size={16} />重试</button>}
        <button onClick={onCancel} className="flex gap-2 items-center px-4 py-2 border border-slate-300 rounded-lg"><ArrowLeft size={16} />返回大厅</button>
      </div>
    </>}
  </div>;
}
