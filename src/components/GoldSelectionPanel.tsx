import React, { useState } from 'react';
import { ResourceType } from '../types';
import { RESOURCE_ICONS } from '../images';
import { RESOURCE_NAMES } from '../constants';

interface GoldSelectionPanelProps {
  bankResources: Record<ResourceType, number>;
  amount: number;
  onSelect: (selected: Record<ResourceType, number>) => void;
}

export const GoldSelectionPanel: React.FC<GoldSelectionPanelProps> = ({ bankResources, amount, onSelect }) => {
  const [selections, setSelections] = useState<Record<ResourceType, number>>({
    [ResourceType.Lumber]: 0,
    [ResourceType.Brick]: 0,
    [ResourceType.Wool]: 0,
    [ResourceType.Grain]: 0,
    [ResourceType.Ore]: 0,
  });

  const totalSelected = Object.values(selections).reduce((sum, count) => sum + count, 0);

  const handleAdjust = (res: ResourceType, delta: number) => {
    const newVal = selections[res] + delta;
    if (newVal >= 0 && (delta < 0 || totalSelected < amount) && (delta < 0 || bankResources[res] > selections[res])) {
      setSelections(prev => ({ ...prev, [res]: newVal }));
    }
  };

  const isComplete = totalSelected === amount;

  return (
    <div className="flex flex-col w-full h-full">
      <div className="mb-4">
        <h3 className="font-bold text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">请选择资源</h3>
        <p className="text-[9px] text-slate-500 mb-2">还需选择: {amount - totalSelected} 份</p>
        <div className="grid grid-cols-5 gap-1">
          {Object.values(ResourceType).map(res => (
            <div key={`gold-${res}`} className="p-0.5 sm:p-1 py-1 border border-slate-200/80 rounded-xl bg-slate-50/50 flex flex-col items-center justify-between gap-0.5">
              <img src={RESOURCE_ICONS[res]} className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 object-contain mb-0.5" alt={RESOURCE_NAMES[res]} referrerPolicy="no-referrer" />
              <div className="flex items-center gap-0.5 w-full justify-between px-0.5">
                <button 
                  disabled={selections[res] <= 0}
                  onClick={() => handleAdjust(res, -1)}
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-100 transition-colors text-[9px] pointer-events-auto cursor-pointer"
                >-</button>
                <span className="font-bold text-[10px] sm:text-xs text-slate-800">{selections[res]}</span>
                <button 
                  disabled={totalSelected >= amount || selections[res] >= bankResources[res]}
                  onClick={() => handleAdjust(res, 1)}
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-100 transition-colors text-[9px] pointer-events-auto cursor-pointer"
                >+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1 mt-auto">
        <button 
          disabled={!isComplete}
          onClick={() => onSelect(selections)}
          className="w-full py-3 sm:py-3.5 bg-slate-900 text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest shadow-md hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:opacity-60 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          确认领取
        </button>
      </div>
    </div>
  );
};
