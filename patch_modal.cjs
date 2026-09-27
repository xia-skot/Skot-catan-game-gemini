const fs = require('fs');
let content = fs.readFileSync('src/components/SoundSettingsModal.tsx', 'utf8');

const target = `<div className={\`space-y-1.5 transition-all duration-300 \${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}\`}>`;

const isIOSCheck = `
  const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
`;

if (!content.includes('const isIOS')) {
  content = content.replace('const [enabled, setEnabled] = useState(audioService.enabled);', isIOSCheck + '\n  const [enabled, setEnabled] = useState(audioService.enabled);');
}

const replacement = `      {isIOS && (
        <div className="text-[9px] sm:text-[10px] text-orange-500 bg-orange-50 p-2 rounded-lg mb-2 text-left leading-relaxed">
          <span className="font-bold">🍎 苹果设备提示：</span><br/>由于 iOS 系统限制，网页无法直接调节音量大小。请使用手机侧边的<b>实体音量按键</b>来控制声音大小。此处滑块仅供参考。
        </div>
      )}
      <div className={\`space-y-1.5 transition-all duration-300 \${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}\`}>`;

if (content.includes(target) && !content.includes('苹果设备提示')) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/components/SoundSettingsModal.tsx', content);
  console.log("Patched SoundSettingsModal for iOS volume explanation");
} else {
  console.log("Could not find SoundSettingsModal target or already patched");
}
