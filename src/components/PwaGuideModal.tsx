import React from 'react';
import { motion } from 'motion/react';
import { X, Share, PlusSquare, Smartphone, Check, Download, AlertCircle } from 'lucide-react';

interface PwaGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall?: () => void;
  hasDeferredPrompt: boolean;
}

export function PwaGuideModal({ isOpen, onClose, onInstall, hasDeferredPrompt }: PwaGuideModalProps) {
  if (!isOpen) return null;

  // Detect basic user agent
  const isIOS = typeof window !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isSafari = typeof window !== 'undefined' && /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|OPiOS|mercury/i.test(navigator.userAgent);

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', duration: 0.4 }}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-indigo-600 animate-pulse" />
            <h3 className="text-base font-bold text-slate-800 font-sans tracking-tight">添加到主屏幕</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200/80 active:scale-95 transition-all text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-5 font-sans scrollbar-thin">
          
          {/* Conditional Guidance */}
          {isIOS ? (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>iOS 苹果系统限制，仅能通过 Safari 浏览器手动添加。</span>
              </div>

              <div className="space-y-3.5">
                <p className="text-xs font-bold text-slate-500">📌 手动添加步骤（只需3步）：</p>
                
                {/* Step 1 */}
                <div className="flex items-start gap-3.5 p-3 rounded-xl border border-slate-100 hover:bg-slate-50/30 transition-all">
                  <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black shrink-0">1</div>
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold text-slate-800">在 Safari 浏览器中点击底部【分享】图标</p>
                    <p className="text-slate-400 mt-1 flex items-center gap-1">
                      ( 寻找下方中央的 <Share className="w-4 h-4 text-blue-500 inline" /> 图标，即带有向上箭头的正方形 )
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3.5 p-3 rounded-xl border border-slate-100 hover:bg-slate-50/30 transition-all">
                  <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black shrink-0">2</div>
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold text-slate-800">在菜单中向下滑动，选择【添加到主屏幕】</p>
                    <p className="text-slate-400 mt-1 flex items-center gap-1">
                      ( 寻找带有 <PlusSquare className="w-4 h-4 text-slate-600 inline" /> 的选项 )
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3.5 p-3 rounded-xl border border-slate-100 hover:bg-slate-50/30 transition-all">
                  <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black shrink-0">3</div>
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold text-slate-800">点击右上角的【添加】按钮</p>
                    <p className="text-slate-400 mt-1">设置完成！桌面图标将自动生成。</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-bold text-slate-500">📌 如何添加到主屏幕：</p>

              {hasDeferredPrompt && onInstall ? (
                <div className="space-y-3">
                  <div className="text-xs text-slate-600 leading-relaxed">
                    您的浏览器支持一键快速安装！点击下方按钮将游戏快速生成为桌面 App 吧。
                  </div>
                  <button
                    onClick={onInstall}
                    className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>立即一键添加 / 安装应用</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="flex items-start gap-3.5 p-3 rounded-xl border border-slate-100">
                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black shrink-0">1</div>
                    <div className="text-xs leading-relaxed">
                      <p className="font-bold text-slate-800">点击浏览器右上角的【菜单/设置】图标</p>
                      <p className="text-slate-400 mt-1">通常是右上角的三点或三个横线。</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5 p-3 rounded-xl border border-slate-100">
                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black shrink-0">2</div>
                    <div className="text-xs leading-relaxed">
                      <p className="font-bold text-slate-800">点击【添加到主屏幕】或【安装应用】</p>
                      <p className="text-slate-400 mt-1">
                        浏览器会自动下载精美图标并创建桌面启动快捷方式！
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 active:scale-95 transition-all text-slate-600 text-xs font-bold"
          >
            我已知晓
          </button>
        </div>
      </motion.div>
    </div>
  );
}
