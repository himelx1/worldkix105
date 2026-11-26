import React, { useState } from 'react';
import { RESOURCE_LIST, ResourceCategory } from '../../data/resources.data';
import { getStorageSystemSummary } from '../../systems/BuildingSimulation';
import type { GameSnapshot } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

export const InventorySheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [cat, setCat] = useState<'all' | ResourceCategory>('all');
  const [query, setQuery] = useState('');
  const { state } = snap;
  const q = query.trim().toLowerCase();
  const storageSummary = getStorageSystemSummary(state);

  const list = RESOURCE_LIST.filter(
    (r) =>
      (cat === 'all' || r.category === cat) &&
      (!q || r.name.toLowerCase().includes(q) || r.shortCode.toLowerCase().includes(q))
  );

  const totalOverflowCount =
    storageSummary.crop.overflowItems.length + storageSummary.material.overflowItems.length;

  return (
    <SheetContainer
      title="Resource Inventory & Storage"
      subtitle={`Crop Cap: ${storageSummary.crop.capacityPerItem}/crop · Material Cap: ${storageSummary.material.capacityPerItem}/item`}
    >
      {/* Crop Storage vs Material Storage Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 tabular-nums">
        <div className="p-3 rounded-2xl bg-[#081912] border border-amber-600/50 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-amber-300">
            <span>Crop Storage (Granaries)</span>
            <span>{storageSummary.crop.activeBuildingCount} active</span>
          </div>
          <div className="text-[11px] text-stone-200">
            Per Crop Cap: <strong className="text-stone-100">{storageSummary.crop.capacityPerItem}</strong>{' '}
            <span className="text-stone-400">
              (Base {storageSummary.crop.baseCapacityPerItem} + {storageSummary.crop.bonusCapacity})
            </span>
          </div>
          <div className="text-[11px] text-stone-400">
            Stored Total: <strong className="text-amber-200">{storageSummary.crop.totalStoredUnits}</strong> /{' '}
            {storageSummary.crop.totalCapacityUnits}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-[#081912] border border-sky-600/50 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-sky-300">
            <span>Material Storage (Warehouses)</span>
            <span>{storageSummary.material.activeBuildingCount} active</span>
          </div>
          <div className="text-[11px] text-stone-200">
            Per Item Cap: <strong className="text-stone-100">{storageSummary.material.capacityPerItem}</strong>{' '}
            <span className="text-stone-400">
              (Base {storageSummary.material.baseCapacityPerItem} + {storageSummary.material.bonusCapacity})
            </span>
          </div>
          <div className="text-[11px] text-stone-400">
            Stored Total: <strong className="text-sky-200">{storageSummary.material.totalStoredUnits}</strong> /{' '}
            {storageSummary.material.totalCapacityUnits}
          </div>
        </div>
      </div>

      {totalOverflowCount > 0 ? (
        <div className="mb-3 p-2.5 rounded-xl bg-amber-950/60 border border-amber-600/55 text-[11px] text-amber-200">
          Storage surplus detected on {totalOverflowCount}{' '}
          {totalOverflowCount === 1 ? 'resource' : 'resources'} above current capacity. Existing stock stays preserved, and new production resumes once stock drops below capacity or storage is upgraded.
        </div>
      ) : null}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${RESOURCE_LIST.length} resources...`}
        className="w-full mb-2.5 px-3 py-2 rounded-xl bg-[#07150e] border border-emerald-800/60 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400"
      />
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2.5 mb-3 border-b border-emerald-900/40">
        {(
          [
            ['all', 'All'],
            ['natural', 'Natural'],
            ['agricultural', 'Food & Crops'],
            ['industrial', 'Industrial'],
            ['manufactured', 'Manufactured'],
          ] as Array<['all' | ResourceCategory, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setCat(id)}
            className={`min-h-[38px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
              cat === id ? 'bg-amber-500 text-stone-950 font-semibold' : 'bg-emerald-950/70 text-stone-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {list.map((r) => {
          const cur = Math.floor(state.resources[r.id] ?? 0);
          const cap = state.capacities[r.id] ?? r.baseCap;
          const pct = Math.min(100, Math.round((cur / Math.max(1, cap)) * 100));
          const net = state.netRatesPerMin[r.id] ?? 0;
          const overCap = cur > cap;

          return (
            <div
              key={r.id}
              className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
                overCap
                  ? 'bg-amber-950/45 border-amber-700/60'
                  : 'bg-emerald-950/45 border-emerald-900/50'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="font-semibold text-stone-100 truncate">{r.name}</span>
                  <span className="text-[9px] uppercase text-stone-400 shrink-0">
                    {r.storageGroup === 'granary' ? 'Crop' : 'Mat'}
                  </span>
                </div>
                <div className="flex items-center gap-2 tabular-nums shrink-0">
                  {net !== 0 ? (
                    <span className={net > 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {net > 0 ? `+${net}` : net}/m
                    </span>
                  ) : null}
                  <span className={overCap ? 'text-amber-300 font-bold' : 'text-stone-200 font-medium'}>
                    {cur}/{cap}
                  </span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-stone-900 rounded-sm overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: r.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SheetContainer>
  );
};
