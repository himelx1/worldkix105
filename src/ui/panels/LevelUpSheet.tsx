import React, { useMemo, useState } from 'react';
import {
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  Coins,
  Compass,
  Lock,
  Search,
  Sparkles,
} from 'lucide-react';
import { formatCompactNumber } from '../../core/Formatters';
import type { BuildingCategory } from '../../data/buildings.data';
import {
  getLevelUpCatalog,
  type LevelUpEntry,
  type LevelUpStatus,
} from '../../systems/BuildingSimulation';
import { BuildingSystem } from '../../systems/BuildingSystem';
import { GameController, GameSnapshot } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

type CategoryFilter =
  | 'all'
  | 'residential'
  | 'production'
  | 'agricultural'
  | 'storage'
  | 'utilities'
  | 'civic';

type StatusFilter = 'all' | LevelUpStatus;
type SortMode = 'ready_first' | 'level_desc' | 'name_asc';

const STATUS_PRIORITY: Record<LevelUpStatus, number> = {
  ready: 0,
  waiting_resources: 1,
  requirements_unmet: 2,
  max_level: 3,
};

function matchesCategoryFilter(cat: BuildingCategory, filter: CategoryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'residential') return cat === 'residential';
  if (filter === 'production') return cat === 'production' || cat === 'industrial';
  if (filter === 'agricultural') return cat === 'agricultural';
  if (filter === 'storage') return cat === 'storage';
  if (filter === 'utilities') return cat === 'energy' || cat === 'environmental';
  return (
    cat === 'educational' ||
    cat === 'healthcare' ||
    cat === 'government' ||
    cat === 'commercial' ||
    cat === 'recreational' ||
    cat === 'transportation'
  );
}

export const LevelUpSheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [catFilter, setCatFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('ready_first');
  const [query, setQuery] = useState('');

  const { state } = snap;
  const q = query.trim().toLowerCase();

  const allEntries = useMemo(
    () => getLevelUpCatalog(state, (rid) => BuildingSystem.getResourceProducers(rid)),
    [state]
  );

  const readyCount = allEntries.filter((e) => e.status === 'ready').length;
  const waitingCount = allEntries.filter((e) => e.status === 'waiting_resources').length;
  const maxCount = allEntries.filter((e) => e.status === 'max_level').length;

  const filtered = useMemo(() => {
    const list = allEntries.filter((e) => {
      if (!matchesCategoryFilter(e.def.category, catFilter)) return false;
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (
        q &&
        !e.def.name.toLowerCase().includes(q) &&
        !e.cityName.toLowerCase().includes(q) &&
        !e.def.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortMode === 'ready_first') {
        const diff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
        if (diff !== 0) return diff;
        return a.level - b.level || a.def.name.localeCompare(b.def.name);
      }
      if (sortMode === 'level_desc') {
        return b.level - a.level || a.def.name.localeCompare(b.def.name);
      }
      return a.def.name.localeCompare(b.def.name) || a.level - b.level;
    });
  }, [allEntries, catFilter, statusFilter, sortMode, q]);

  return (
    <SheetContainer
      title="Building Level Up"
      subtitle={`${readyCount} Ready · ${waitingCount} Waiting · ${maxCount} Max Level (${allEntries.length} Total)`}
    >
      {/* Live Resource Summary Strip */}
      <div className="grid grid-cols-4 gap-1.5 mb-3 p-2.5 rounded-2xl bg-[#07150e] border border-emerald-800/60 text-xs tabular-nums">
        <div className="min-w-0">
          <div className="text-[10px] text-stone-400">Coins</div>
          <div className="font-bold text-amber-300 truncate">{formatCompactNumber(state.coins)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-stone-400">Wood</div>
          <div className="font-bold text-lime-300 truncate">{formatCompactNumber(state.resources.wood)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-stone-400">Stone</div>
          <div className="font-bold text-stone-200 truncate">{formatCompactNumber(state.resources.stone)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-stone-400">Materials</div>
          <div className="font-bold text-sky-300 truncate">
            {formatCompactNumber(state.resources.building_materials)}
          </div>
        </div>
      </div>

      {/* Search & Sort Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search buildings or cities..."
            className="w-full min-h-[40px] pl-8 pr-3 rounded-xl bg-[#07150e] border border-emerald-800/60 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400"
          />
        </div>
        <select
          aria-label="Sort buildings"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="min-h-[40px] px-2.5 rounded-xl bg-[#07150e] border border-emerald-800/60 text-xs font-semibold text-stone-100"
        >
          <option value="ready_first">Sort: Ready First</option>
          <option value="level_desc">Sort: Highest Level</option>
          <option value="name_asc">Sort: Name</option>
        </select>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2">
        {(
          [
            ['all', 'All'],
            ['residential', 'Housing'],
            ['production', 'Craft & Industry'],
            ['agricultural', 'Farms & Agro'],
            ['storage', 'Storage'],
            ['utilities', 'Utilities'],
            ['civic', 'Civic & Trade'],
          ] as Array<[CategoryFilter, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setCatFilter(id)}
            className={`min-h-[38px] px-3 rounded-xl text-xs whitespace-nowrap shrink-0 transition-colors ${
              catFilter === id
                ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold'
                : 'bg-[#0a1d14] border border-emerald-800/50 text-stone-300 font-medium hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3 mb-3 border-b border-emerald-800/45 tabular-nums">
        {(
          [
            ['all', `All (${allEntries.length})`],
            ['ready', `Ready (${readyCount})`],
            ['waiting_resources', `Waiting (${waitingCount})`],
            ['max_level', `Max (${maxCount})`],
            ['requirements_unmet', 'Building'],
          ] as Array<[StatusFilter, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStatusFilter(id)}
            className={`min-h-[34px] px-2.5 rounded-lg text-[11px] whitespace-nowrap shrink-0 border transition-colors ${
              statusFilter === id
                ? 'bg-emerald-500 border-emerald-400 text-stone-950 font-bold'
                : 'bg-[#08160f] border-emerald-900/60 text-stone-300 font-medium'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Building Upgrade List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-4 rounded-2xl bg-[#0a1c13] border border-emerald-800/50 text-xs text-stone-300 text-center">
            {allEntries.length === 0
              ? 'No buildings placed yet. Build structures from the Build menu first.'
              : 'No buildings match the selected filters.'}
          </div>
        ) : null}

        {filtered.map((entry) => (
          <LevelUpCard key={entry.building.id} entry={entry} />
        ))}
      </div>
    </SheetContainer>
  );
};

const LevelUpCard: React.FC<{ entry: LevelUpEntry }> = ({ entry }) => {
  const { building, def, level, maxLevel, status, statusReason, cityName, deltas, cost } = entry;

  const statusTone =
    status === 'ready'
      ? 'bg-emerald-950/75 border-emerald-600/50 text-emerald-300'
      : status === 'waiting_resources'
        ? 'bg-amber-950/65 border-amber-700/50 text-amber-200'
        : status === 'max_level'
          ? 'bg-stone-900/80 border-amber-500/40 text-amber-300'
          : 'bg-sky-950/70 border-sky-700/50 text-sky-200';

  const StatusIcon =
    status === 'ready'
      ? CheckCircle2
      : status === 'max_level'
        ? Sparkles
        : status === 'requirements_unmet'
          ? Clock
          : Lock;

  return (
    <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#132b1f] to-[#0a1a12] border border-emerald-700/55 space-y-2.5 tabular-nums">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-stone-100 truncate">{def.name}</span>
            <span className="text-xs font-extrabold text-amber-300 shrink-0">
              Lv.{level}/{maxLevel}
            </span>
          </div>
          <div className="text-[11px] text-stone-400 truncate">
            {cityName} · #{building.id} · ({building.gx}, {building.gy})
          </div>
        </div>
        <button
          type="button"
          onClick={() => GameController.focusBuilding(building.id)}
          className="min-h-[38px] px-2.5 rounded-xl bg-[#091c12] border border-emerald-800/70 text-sky-200 hover:text-white text-[11px] font-semibold flex items-center gap-1 shrink-0"
        >
          <Compass className="w-3.5 h-3.5" />
          Locate
        </button>
      </div>

      {/* Status Row */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold ${statusTone}`}>
        <StatusIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{statusReason}</span>
      </div>

      {/* Stat Comparisons & Next Level Deltas */}
      {deltas.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
          {deltas.map((d) => (
            <div
              key={d.label}
              className="p-2 rounded-xl bg-[#07150e] border border-emerald-900/60 min-w-0"
            >
              <div className="text-[10px] text-stone-400 truncate">{d.label}</div>
              <div className="font-bold text-stone-100 truncate">
                {d.current} → <span className="text-emerald-300">{d.next}</span>
              </div>
              <div className="text-[10px] font-semibold text-amber-300">{d.deltaText}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Upgrade Requirements & Action */}
      {cost ? (
        <div className="pt-1 border-t border-emerald-800/45 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span
              className={`inline-flex items-center gap-1 font-bold ${
                cost.missingCoins === 0 ? 'text-amber-300' : 'text-red-300'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              {cost.coinsHave.toLocaleString()}/{cost.coinCost.toLocaleString()}C
            </span>
            {cost.materials.map((m) => (
              <span
                key={m.resourceId}
                className={m.missing === 0 ? 'text-emerald-300 font-medium' : 'text-red-300 font-semibold'}
              >
                {m.name}: {m.have}/{m.need}
              </span>
            ))}
          </div>

          <button
            type="button"
            disabled={status !== 'ready'}
            onClick={() => GameController.dispatch({ type: 'UPGRADE_BUILDING', buildingId: building.id })}
            className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 disabled:from-stone-800 disabled:to-stone-800 disabled:text-stone-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#92400e] disabled:shadow-none active:translate-y-[1px]"
          >
            <ArrowUpCircle className="w-4 h-4 shrink-0" />
            {status === 'ready'
              ? `Upgrade to Lv.${level + 1} (${cost.coinCost.toLocaleString()}C)`
              : status === 'requirements_unmet'
                ? 'Finish Construction First'
                : `Missing Resources (${cost.coinCost.toLocaleString()}C)`}
          </button>
        </div>
      ) : null}
    </div>
  );
};
