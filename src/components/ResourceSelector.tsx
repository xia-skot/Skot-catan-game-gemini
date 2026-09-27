import React from 'react';
import { ResourceType } from '../types';
import { RESOURCE_ICONS } from '../images';
import { RESOURCE_NAMES } from '../constants';

interface ResourceSelectorProps {
  title: string;
  selected: ResourceType | null;
  onSelect: (type: ResourceType) => void;
  disabledTypes?: ResourceType[];
}

export const ResourceSelector: React.FC<ResourceSelectorProps> = ({ title, selected, onSelect, disabledTypes = [] }) => {
  return (
    <div className="bg-white p-3 rounded-2xl border border-black/5 shadow-sm">
      <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 text-center">{title}</h4>
      <div className="grid grid-cols-5 gap-1">
        {Object.values(ResourceType).map(res => (
          <button
            key={res}
            onClick={() => onSelect(res)}
            disabled={disabledTypes.includes(res)}
            className={`p-1.5 rounded-xl border transition-all flex flex-col items-center gap-1 flex-1 disabled:opacity-30 disabled:cursor-not-allowed ${selected === res ? 'border-black bg-stone-50 scale-105 shadow-md' : 'border-black/5 hover:border-black/20 hover:bg-stone-50'}`}
          >
            <img src={RESOURCE_ICONS[res]} className="w-5 h-5 object-contain" alt={RESOURCE_NAMES[res]} referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>
    </div>
  );
};
