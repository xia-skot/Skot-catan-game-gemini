import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Monitor, Smartphone, RotateCw, RefreshCw, Eraser, ExternalLink } from 'lucide-react';
import './preview.css';

const devices = [{ name: '电脑', width: 1280, height: 800 }, { name: '安卓 / 华为', width: 360, height: 814 }, { name: 'iPhone', width: 393, height: 852 }];
function Preview() {
  const [device, setDevice] = useState(2);
  const [landscape, setLandscape] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const selected = devices[device];
  const width = landscape ? selected.height : selected.width;
  const height = landscape ? selected.width : selected.height;
  const send = (action: string) => frame.current?.contentWindow?.postMessage(action, location.origin);
  return <>
    <header>
      <strong>卡坦岛 <small>本地演示</small></strong>
      <nav aria-label="设备尺寸">
        {devices.map((item, index) => <button key={item.name} aria-pressed={device === index} onClick={() => setDevice(index)}>{index === 0 ? <Monitor size={17} /> : <Smartphone size={17} />}{item.name}</button>)}
      </nav>
      <div className="tools">
        <button title="切换横竖屏" aria-label="切换横竖屏" onClick={() => setLandscape(value => !value)}><RotateCw size={18} /></button>
        <button title="重置演示消息和账号状态" aria-label="重置演示" onClick={() => send('catan-demo:reset')}><RefreshCw size={18} /></button>
        <button title="清除演示贴图缓存" aria-label="清除贴图缓存" onClick={() => send('catan-demo:clear-images')}><Eraser size={18} /></button>
        <a href="/" target="_blank" title="打开完整界面" aria-label="打开完整界面"><ExternalLink size={18} /></a>
      </div>
    </header>
    <main><iframe ref={frame} src="/" title="卡坦岛演示" style={{ width, height }} allow="autoplay; fullscreen" /></main>
  </>;
}
if (import.meta.env.DEV && import.meta.env.MODE === 'demo') createRoot(document.getElementById('root')!).render(<Preview />);
