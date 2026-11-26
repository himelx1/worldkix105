import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Building2,
  Calendar,
  Coins,
  Droplets,
  Flame,
  Globe,
  Layers,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
  Warehouse,
  Wheat,
  Zap,
} from 'lucide-react';
import { formatCompactNumber } from '../../core/Formatters';
import { EconomySystem } from '../../systems/EconomySystem';
import { EnvironmentSystem } from '../../systems/EnvironmentSystem';
import { StatisticsSystem } from '../../systems/StatisticsSystem';
import { GameController, GameSnapshot, NationalStatsSection } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

const SECTION_TABS: Array<{ id: NationalStatsSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'utilities', label: 'Power & Water' },
  { id: 'resources', label: 'Resources & Storage' },
  { id: 'population', label: 'Population' },
  { id: 'economy', label: 'Economy & FX' },
];

export const NationalStatsSheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const { state, nationalStatsSection: activeTab } = snap;
  const [resourceGroupTab, setResourceGroupTab] = useState<'materials' | 'cropsAndFood' | 'manufactured'>('materials');
  const [fxDirection, setFxDirection] = useState<'local_to_fx' | 'fx_to_local'>('local_to_fx');
  const [fxAmountInput, setFxAmountInput] = useState<string>('100');
  const [fxFeedback, setFxFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const report = useMemo(
    () => StatisticsSystem.computeNationalStatistics(state, GameController.engine.chunks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state,
      state.tick,
      state.coins,
      state.foreignCurrency,
      state.powerDelivered,
      state.waterDelivered,
      state.calendar?.totalDaysElapsed,
      state.economy?.fxRate,
      state.economy?.gdpCurrent,
      state.economy?.transactions.length,
    ]
  );

  const { calendar, utilities, resources, population, economy } = report;
  const monthName = EnvironmentSystem.getMonthName(calendar.month);
  const seasonLabel = calendar.season.charAt(0).toUpperCase() + calendar.season.slice(1);
  const weatherLabel = calendar.weather.charAt(0).toUpperCase() + calendar.weather.slice(1);

  const parsedAmount = Number(fxAmountInput);
  const fxPreview = EconomySystem.previewCurrencyConversion(
    state,
    fxDirection,
    Number.isFinite(parsedAmount) ? parsedAmount : 0
  );

  const handleApplyFxPct = (pct: number) => {
    setFxFeedback(null);
    if (fxDirection === 'local_to_fx') {
      const amt = Math.floor(state.coins * pct);
      setFxAmountInput(String(Math.max(1, amt)));
    } else {
      const amt = Math.floor((state.foreignCurrency ?? 0) * pct * 100) / 100;
      setFxAmountInput(String(amt > 0 ? amt : 0));
    }
  };

  const handleConvertCurrency = () => {
    const amt = Number(fxAmountInput);
    const res = GameController.dispatchResult({
      type: 'CONVERT_CURRENCY',
      direction: fxDirection,
      amount: Number.isFinite(amt) ? amt : 0,
    });
    if (res.ok) {
      setFxFeedback({
        ok: true,
        text: fxPreview.valid
          ? fxDirection === 'local_to_fx'
            ? `Converted ${fxPreview.inputAmount.toLocaleString()} Local -> ${fxPreview.outputAmount.toFixed(2)} FX`
            : `Converted ${fxPreview.inputAmount.toFixed(2)} FX -> ${fxPreview.outputAmount.toLocaleString()} Local`
          : 'Currency converted successfully.',
      });
    } else {
      setFxFeedback({
        ok: false,
        text: res.reason ?? 'Conversion failed.',
      });
    }
  };

  const currentResGroup =
    resourceGroupTab === 'materials'
      ? { title: 'Materials & Industrial Inputs', data: resources.groups.materials }
      : resourceGroupTab === 'cropsAndFood'
        ? { title: 'Crops & Food Supplies', data: resources.groups.cropsAndFood }
        : { title: 'Manufactured & Finished Goods', data: resources.groups.manufactured };

  return (
    <SheetContainer
      title="National Statistics"
      subtitle={`Year ${calendar.year} · ${monthName} · Week ${calendar.weekOfMonth} · Day ${calendar.dayOfWeek} · ${seasonLabel} (${weatherLabel})`}
    >
      {/* Top Section Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2.5 mb-3 border-b border-emerald-900/50">
        {SECTION_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => GameController.setNationalStatsSection(tab.id)}
              className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold shrink-0 transition-colors ${
                active
                  ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold shadow'
                  : 'bg-[#081912] border border-emerald-800/60 text-stone-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SECTION 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-3 tabular-nums">
          {/* Calendar Card */}
          <div className="p-3 rounded-2xl bg-[#081912] border border-emerald-800/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold text-amber-300">
                <Calendar className="w-4 h-4 shrink-0" /> National Calendar
              </span>
              <span className="text-[11px] text-stone-400">
                7d/wk · 4w/mo · 12m/yr ({calendar.totalDaysElapsed} days elapsed)
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Year</div>
                <div className="font-bold text-stone-100">Y{calendar.year}</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Month</div>
                <div className="font-bold text-stone-100">M{calendar.month}/12</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Week</div>
                <div className="font-bold text-stone-100">W{calendar.weekOfMonth}/4</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Day</div>
                <div className="font-bold text-amber-300">D{calendar.dayOfWeek}/7</div>
              </div>
            </div>
          </div>

          {/* Core Macro & Infrastructure KPI Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => GameController.setNationalStatsSection('utilities')}
              className="text-left p-3 rounded-2xl bg-[#081912] border border-amber-700/45 hover:border-amber-500/70 space-y-1 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] text-amber-300 font-bold">
                <span className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> Electricity Grid
                </span>
                <span>{utilities.electricity.availabilityPct}%</span>
              </div>
              <div className="text-sm font-bold text-stone-100">
                {utilities.electricity.delivered} / {utilities.electricity.totalDemand} MW
              </div>
              <div className="text-[10px] text-stone-400">
                Cap {utilities.electricity.installedCapacity} MW · Disc {utilities.electricity.disconnectedBuildings}
              </div>
            </button>

            <button
              type="button"
              onClick={() => GameController.setNationalStatsSection('utilities')}
              className="text-left p-3 rounded-2xl bg-[#081912] border border-sky-700/45 hover:border-sky-500/70 space-y-1 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] text-sky-300 font-bold">
                <span className="flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5" /> Water Network
                </span>
                <span>{utilities.water.availabilityPct}%</span>
              </div>
              <div className="text-sm font-bold text-stone-100">
                {utilities.water.delivered} / {utilities.water.totalDemand} Flow
              </div>
              <div className="text-[10px] text-stone-400">
                Cap {utilities.water.installedCapacity} Flow · Disc {utilities.water.disconnectedBuildings}
              </div>
            </button>

            <button
              type="button"
              onClick={() => GameController.setNationalStatsSection('economy')}
              className="text-left p-3 rounded-2xl bg-[#081912] border border-emerald-700/50 hover:border-emerald-500/70 space-y-1 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] text-emerald-300 font-bold">
                <span className="flex items-center gap-1">
                  <BarChart3 className="w-3.5 h-3.5" /> National GDP
                </span>
                <span className={economy.gdpGrowthPct >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {economy.gdpGrowthPct >= 0 ? `+${economy.gdpGrowthPct}%` : `${economy.gdpGrowthPct}%`}
                </span>
              </div>
              <div className="text-sm font-bold text-stone-100">{formatCompactNumber(economy.gdpCurrent)} C</div>
              <div className="text-[10px] text-stone-400">
                Inflation {economy.inflationRate.toFixed(1)}% · 1 FX = {economy.fxRate.toFixed(2)} C
              </div>
            </button>

            <button
              type="button"
              onClick={() => GameController.setNationalStatsSection('resources')}
              className="text-left p-3 rounded-2xl bg-[#081912] border border-emerald-700/50 hover:border-emerald-500/70 space-y-1 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] text-lime-300 font-bold">
                <span className="flex items-center gap-1">
                  <Warehouse className="w-3.5 h-3.5" /> Storage Use
                </span>
                <span>{resources.overallUtilizationPct}%</span>
              </div>
              <div className="text-sm font-bold text-stone-100">
                {formatCompactNumber(resources.totalStored)} / {formatCompactNumber(resources.totalCapacity)}
              </div>
              <div className="text-[10px] text-stone-400">
                {resources.storageBuildingCount} facilities · {resources.overflowCount} full
              </div>
            </button>
          </div>

          {/* Treasury & Population Quick Strip */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-900/50">
              <div className="text-[10px] text-stone-400">Local Treasury</div>
              <div className="font-bold text-amber-300">{Math.floor(economy.localCoins).toLocaleString()} C</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-900/50">
              <div className="text-[10px] text-stone-400">Foreign Reserve</div>
              <div className="font-bold text-cyan-300">{economy.foreignCurrency.toFixed(2)} FX</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-900/50">
              <div className="text-[10px] text-stone-400">Population</div>
              <div className="font-bold text-sky-300">
                {population.total}/{population.capacity}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: UTILITIES (ELECTRICITY & WATER) */}
      {activeTab === 'utilities' && (
        <div className="space-y-4 tabular-nums text-xs">
          {/* Electricity Block */}
          <div className="p-3 rounded-2xl bg-[#081912] border border-amber-700/55 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-bold text-amber-300 text-sm">
                <Zap className="w-4 h-4 shrink-0" /> Electricity Distribution
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-700/50 font-bold text-amber-200">
                {utilities.electricity.availabilityPct}% Supply
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Installed Cap</div>
                <div className="font-bold text-stone-100">{utilities.electricity.installedCapacity} MW</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Operating Gen</div>
                <div className="font-bold text-emerald-300">{utilities.electricity.generated} MW</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Total Demand</div>
                <div className="font-bold text-stone-100">{utilities.electricity.totalDemand} MW</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Connected Dem</div>
                <div className="font-bold text-stone-200">{utilities.electricity.connectedDemand} MW</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Delivered</div>
                <div className="font-bold text-amber-300">{utilities.electricity.delivered} MW</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Unserved</div>
                <div
                  className={`font-bold ${
                    utilities.electricity.unservedDemand > 0 ? 'text-red-400' : 'text-emerald-300'
                  }`}
                >
                  {utilities.electricity.unservedDemand} MW
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-300 pt-1">
              <span>
                Connected: <strong className="text-emerald-300">{utilities.electricity.connectedBuildings}</strong> ·
                Disconnected:{' '}
                <strong className={utilities.electricity.disconnectedBuildings > 0 ? 'text-red-400' : 'text-stone-200'}>
                  {utilities.electricity.disconnectedBuildings}
                </strong>{' '}
                · Brownout:{' '}
                <strong className={utilities.electricity.brownoutBuildings > 0 ? 'text-amber-300' : 'text-stone-200'}>
                  {utilities.electricity.brownoutBuildings}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  GameController.setOverlayMode('power');
                  GameController.setActiveSheet('none');
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/60 text-amber-200 font-semibold"
              >
                Show Power Overlay
              </button>
            </div>

            {utilities.electricity.networks.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-emerald-900/50">
                <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                  Connected Road/Conductor Power Grids ({utilities.electricity.networks.length})
                </div>
                {utilities.electricity.networks.map((net) => (
                  <div
                    key={`pnet_${net.networkId}`}
                    className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-amber-300">Grid #{net.networkId}</span>
                      <span className="text-stone-400 ml-1.5">
                        {net.producerCount} plants · {net.consumerCount} consumers · {net.tileCount} tiles
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-stone-100">
                        {net.delivered}/{net.connectedDemand} MW
                      </span>{' '}
                      <span className={net.availabilityPct >= 99 ? 'text-emerald-300' : 'text-amber-300'}>
                        ({net.availabilityPct}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Water Block */}
          <div className="p-3 rounded-2xl bg-[#081912] border border-sky-700/55 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-bold text-sky-300 text-sm">
                <Droplets className="w-4 h-4 shrink-0" /> Water Distribution
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-sky-950/80 border border-sky-700/50 font-bold text-sky-200">
                {utilities.water.availabilityPct}% Supply
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Installed Cap</div>
                <div className="font-bold text-stone-100">{utilities.water.installedCapacity} Flow</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Operating Gen</div>
                <div className="font-bold text-emerald-300">{utilities.water.generated} Flow</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Total Demand</div>
                <div className="font-bold text-stone-100">{utilities.water.totalDemand} Flow</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Connected Dem</div>
                <div className="font-bold text-stone-200">{utilities.water.connectedDemand} Flow</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Delivered</div>
                <div className="font-bold text-sky-300">{utilities.water.delivered} Flow</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Unserved</div>
                <div
                  className={`font-bold ${
                    utilities.water.unservedDemand > 0 ? 'text-red-400' : 'text-emerald-300'
                  }`}
                >
                  {utilities.water.unservedDemand} Flow
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-300 pt-1">
              <span>
                Connected: <strong className="text-emerald-300">{utilities.water.connectedBuildings}</strong> ·
                Disconnected:{' '}
                <strong className={utilities.water.disconnectedBuildings > 0 ? 'text-red-400' : 'text-stone-200'}>
                  {utilities.water.disconnectedBuildings}
                </strong>{' '}
                · Shortage:{' '}
                <strong className={utilities.water.shortageBuildings > 0 ? 'text-amber-300' : 'text-stone-200'}>
                  {utilities.water.shortageBuildings}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  GameController.setOverlayMode('water');
                  GameController.setActiveSheet('none');
                }}
                className="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-500/60 text-sky-200 font-semibold"
              >
                Show Water Overlay
              </button>
            </div>

            {utilities.water.networks.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-emerald-900/50">
                <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                  Connected Road/Pipe Water Networks ({utilities.water.networks.length})
                </div>
                {utilities.water.networks.map((net) => (
                  <div
                    key={`wnet_${net.networkId}`}
                    className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-sky-300">Pipe Net #{net.networkId}</span>
                      <span className="text-stone-400 ml-1.5">
                        {net.producerCount} pumps · {net.consumerCount} consumers · {net.tileCount} tiles
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-stone-100">
                        {net.delivered}/{net.connectedDemand} Flow
                      </span>{' '}
                      <span className={net.availabilityPct >= 99 ? 'text-emerald-300' : 'text-amber-300'}>
                        ({net.availabilityPct}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: RESOURCES & STORAGE */}
      {activeTab === 'resources' && (
        <div className="space-y-3 tabular-nums text-xs">
          {/* Overall Storage Bar */}
          <div className="p-3 rounded-2xl bg-[#081912] border border-emerald-800/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-100 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-400" /> National Storage Summary
              </span>
              <span className="font-bold text-amber-300">{resources.overallUtilizationPct}% Used</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#06120c] overflow-hidden border border-emerald-900/60">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-amber-400"
                style={{ width: `${Math.min(100, resources.overallUtilizationPct)}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div>
                <div className="text-stone-400">Stored</div>
                <div className="font-bold text-stone-100">{formatCompactNumber(resources.totalStored)}</div>
              </div>
              <div>
                <div className="text-stone-400">Total Cap</div>
                <div className="font-bold text-stone-100">{formatCompactNumber(resources.totalCapacity)}</div>
              </div>
              <div>
                <div className="text-stone-400">Remaining</div>
                <div className="font-bold text-emerald-300">{formatCompactNumber(resources.totalRemaining)}</div>
              </div>
            </div>
          </div>

          {/* Granaries vs Warehouses Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[resources.granary, resources.warehouse].map((fac) => (
              <div
                key={fac.kind}
                className={`p-3 rounded-2xl bg-[#081912] border space-y-1.5 ${
                  fac.kind === 'granary' ? 'border-amber-700/50' : 'border-sky-700/50'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className={fac.kind === 'granary' ? 'text-amber-300 flex items-center gap-1' : 'text-sky-300 flex items-center gap-1'}>
                    {fac.kind === 'granary' ? <Wheat className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                    {fac.label}
                  </span>
                  <span className="text-[11px] text-stone-300">{fac.buildingCount} bldgs</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#06120c] overflow-hidden">
                  <div
                    className={fac.kind === 'granary' ? 'h-full bg-amber-400' : 'h-full bg-sky-400'}
                    style={{ width: `${Math.min(100, fac.utilizationPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-stone-300">
                  <span>
                    {formatCompactNumber(fac.totalStored)} / {formatCompactNumber(fac.totalCapacity)} ({fac.utilizationPct}%)
                  </span>
                  <span>
                    Free: <strong className="text-emerald-300">{formatCompactNumber(fac.remainingCapacity)}</strong>
                  </span>
                </div>
                <div className="text-[10px] text-stone-400">
                  +{fac.capacityPerResource}/slot bonus · {fac.overflowResourceCount} at cap
                </div>
              </div>
            ))}
          </div>

          {/* Category Selector + Resource Table */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [
                ['materials', 'Materials'],
                ['cropsAndFood', 'Crops & Food'],
                ['manufactured', 'Manufactured'],
              ] as const
            ).map(([gid, label]) => (
              <button
                key={gid}
                type="button"
                onClick={() => setResourceGroupTab(gid)}
                className={`min-h-[34px] px-3 rounded-xl text-[11px] font-semibold shrink-0 ${
                  resourceGroupTab === gid
                    ? 'bg-emerald-500 text-stone-950 font-bold'
                    : 'bg-[#081912] border border-emerald-800/60 text-stone-300'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => GameController.setActiveSheet('inventory')}
              className="ml-auto min-h-[34px] px-3 rounded-xl text-[11px] font-semibold bg-amber-500/20 border border-amber-500/60 text-amber-200 shrink-0"
            >
              Open Full Inventory
            </button>
          </div>

          <div className="p-2.5 rounded-2xl bg-[#081912] border border-emerald-800/50 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-stone-300 pb-1 border-b border-emerald-900/50">
              <span className="font-bold text-stone-100">{currentResGroup.title}</span>
              <span>
                {formatCompactNumber(currentResGroup.data.stored)} / {formatCompactNumber(currentResGroup.data.capacity)}
              </span>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {currentResGroup.data.items.map((item) => (
                <div
                  key={item.id}
                  className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/45 flex items-center justify-between gap-2 text-[11px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-semibold text-stone-100 truncate">{item.name}</span>
                      {item.overflow && (
                        <span className="px-1.5 py-0.2 rounded bg-red-950 border border-red-600/60 text-[9px] font-bold text-red-300">
                          FULL
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-stone-400 mt-0.5">
                      Remaining: {formatCompactNumber(item.remaining)} · {item.utilizationPct}% used
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-stone-100">
                      {Math.floor(item.stored)} / {item.capacity}
                    </div>
                    {Math.abs(item.ratePerMin) > 0.05 && (
                      <div className={`text-[10px] ${item.ratePerMin >= 0 ? 'text-emerald-300' : 'text-orange-300'}`}>
                        {item.ratePerMin >= 0 ? '+' : ''}
                        {item.ratePerMin.toFixed(1)}/m
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: POPULATION */}
      {activeTab === 'population' && (
        <div className="space-y-3 tabular-nums text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-800/55">
              <div className="text-[10px] text-stone-400">Total Population</div>
              <div className="text-base font-bold text-sky-300">{population.total}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-800/55">
              <div className="text-[10px] text-stone-400">Housing Capacity</div>
              <div className="text-base font-bold text-stone-100">{population.capacity}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-800/55">
              <div className="text-[10px] text-stone-400">Available Housing</div>
              <div className="text-base font-bold text-emerald-300">{population.availableCapacity}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-800/55">
              <div className="text-[10px] text-stone-400">Employed / Workforce</div>
              <div className="text-base font-bold text-emerald-300">
                {population.employed} / {population.availableWorkforce}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-800/55">
              <div className="text-[10px] text-stone-400">Unemployed / Vacant Jobs</div>
              <div className="text-base font-bold text-amber-300">
                {population.unemployed} / {population.vacantJobs}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-800/55">
              <div className="text-[10px] text-stone-400">Homeless · Happiness</div>
              <div className="text-base font-bold text-stone-100">
                <span className={population.homeless > 0 ? 'text-red-400' : 'text-emerald-300'}>
                  {population.homeless}
                </span>{' '}
                · {population.happiness}%
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => GameController.setActiveSheet('population')}
            className="w-full min-h-[42px] px-3 rounded-xl bg-emerald-500/20 border border-emerald-600/60 text-emerald-200 font-bold flex items-center justify-center gap-2"
          >
            <Users className="w-4 h-4" /> Open Detailed Society, Cohorts &amp; Workforce
          </button>
        </div>
      )}

      {/* SECTION 5: ECONOMY, CURRENCIES, FX CONVERTER, GDP & INFLATION */}
      {activeTab === 'economy' && (
        <div className="space-y-3.5 tabular-nums text-xs">
          {/* Balances & Exchange Rate */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-[#081912] border border-amber-700/50">
              <div className="text-[10px] text-stone-400 flex items-center justify-center gap-1">
                <Coins className="w-3 h-3 text-amber-400" /> Local Currency
              </div>
              <div className="font-bold text-amber-300 text-sm">{Math.floor(economy.localCoins).toLocaleString()} C</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081912] border border-cyan-700/50">
              <div className="text-[10px] text-stone-400 flex items-center justify-center gap-1">
                <Globe className="w-3 h-3 text-cyan-400" /> Foreign Reserve
              </div>
              <div className="font-bold text-cyan-300 text-sm">{economy.foreignCurrency.toFixed(2)} FX</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081912] border border-emerald-700/50">
              <div className="text-[10px] text-stone-400">Exchange Rate</div>
              <div className="font-bold text-stone-100 text-sm">1 FX = {economy.fxRate.toFixed(2)} C</div>
            </div>
          </div>

          {/* Central Bank FX Converter */}
          <div className="p-3 rounded-2xl bg-gradient-to-b from-[#0d2433] to-[#081722] border border-cyan-700/55 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-bold text-cyan-200">
                <ArrowLeftRight className="w-4 h-4 text-cyan-400" /> Currency Converter
              </span>
              <span className="text-[10px] text-stone-400">Next update: Month rollover</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFxDirection('local_to_fx');
                  setFxFeedback(null);
                }}
                className={`min-h-[38px] px-2 rounded-xl font-bold text-xs ${
                  fxDirection === 'local_to_fx'
                    ? 'bg-cyan-400 text-stone-950'
                    : 'bg-[#06121b] border border-cyan-900/60 text-stone-300'
                }`}
              >
                Local Coins → FX
              </button>
              <button
                type="button"
                onClick={() => {
                  setFxDirection('fx_to_local');
                  setFxFeedback(null);
                }}
                className={`min-h-[38px] px-2 rounded-xl font-bold text-xs ${
                  fxDirection === 'fx_to_local'
                    ? 'bg-cyan-400 text-stone-950'
                    : 'bg-[#06121b] border border-cyan-900/60 text-stone-300'
                }`}
              >
                FX → Local Coins
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={fxDirection === 'local_to_fx' ? 1 : 0.01}
                step={fxDirection === 'local_to_fx' ? 10 : 1}
                value={fxAmountInput}
                onChange={(e) => {
                  setFxAmountInput(e.target.value);
                  setFxFeedback(null);
                }}
                aria-label="Currency conversion amount"
                className="flex-1 min-w-0 min-h-[40px] px-3 rounded-xl bg-[#06121b] border border-cyan-800/70 text-stone-100 font-bold text-xs"
              />
              {[0.25, 0.5, 1].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleApplyFxPct(pct)}
                  className="min-h-[40px] px-2.5 rounded-xl bg-[#06121b] border border-cyan-900/60 text-cyan-200 font-semibold text-[11px]"
                >
                  {pct === 1 ? 'Max' : `${Math.round(pct * 100)}%`}
                </button>
              ))}
            </div>

            <div className="p-2 rounded-xl bg-[#06121b] border border-cyan-900/50 flex items-center justify-between gap-2 text-[11px]">
              {fxPreview.valid ? (
                <>
                  <span className="text-stone-300">
                    Spend{' '}
                    <strong className="text-stone-100">
                      {fxDirection === 'local_to_fx'
                        ? `${fxPreview.inputAmount.toLocaleString()} C`
                        : `${fxPreview.inputAmount.toFixed(2)} FX`}
                    </strong>
                  </span>
                  <span className="font-bold text-emerald-300">
                    Receive{' '}
                    {fxDirection === 'local_to_fx'
                      ? `${fxPreview.outputAmount.toFixed(2)} FX`
                      : `${fxPreview.outputAmount.toLocaleString()} C`}
                  </span>
                </>
              ) : (
                <span className="text-amber-300">{fxPreview.reason}</span>
              )}
            </div>

            <button
              type="button"
              disabled={!fxPreview.valid}
              onClick={handleConvertCurrency}
              className="w-full min-h-[42px] px-3 rounded-xl bg-gradient-to-b from-cyan-400 to-cyan-500 disabled:from-stone-800 disabled:to-stone-800 disabled:text-stone-500 text-stone-950 font-bold text-xs"
            >
              Convert Currency
            </button>

            {fxFeedback && (
              <div
                className={`p-2 rounded-xl text-[11px] font-semibold ${
                  fxFeedback.ok
                    ? 'bg-emerald-950/75 border border-emerald-700/60 text-emerald-200'
                    : 'bg-red-950/75 border border-red-700/60 text-red-200'
                }`}
              >
                {fxFeedback.text}
              </div>
            )}
          </div>

          {/* GDP & Economic Growth */}
          <div className="p-3 rounded-2xl bg-[#081912] border border-emerald-800/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-emerald-300">
                <Activity className="w-4 h-4" /> National GDP &amp; Growth
              </span>
              <span
                className={`flex items-center gap-1 font-bold ${
                  economy.gdpGrowthPct >= 0 ? 'text-emerald-300' : 'text-red-400'
                }`}
              >
                {economy.gdpGrowthPct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {economy.gdpGrowthPct >= 0 ? '+' : ''}
                {economy.gdpGrowthPct.toFixed(2)}% MoM
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Current GDP</div>
                <div className="font-bold text-stone-100 text-sm">{economy.gdpCurrent.toLocaleString()} C</div>
              </div>
              <div className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Previous Month GDP</div>
                <div className="font-bold text-stone-300 text-sm">{economy.gdpPrevious.toLocaleString()} C</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
              <div className="p-1.5 rounded-lg bg-[#06120c] border border-emerald-900/45">
                <div className="text-stone-400">Production</div>
                <div className="font-bold text-stone-100">{economy.gdpBreakdown.productionValue}</div>
              </div>
              <div className="p-1.5 rounded-lg bg-[#06120c] border border-emerald-900/45">
                <div className="text-stone-400">Commerce</div>
                <div className="font-bold text-stone-100">{economy.gdpBreakdown.commercialValue}</div>
              </div>
              <div className="p-1.5 rounded-lg bg-[#06120c] border border-emerald-900/45">
                <div className="text-stone-400">Services</div>
                <div className="font-bold text-stone-100">{economy.gdpBreakdown.servicesValue}</div>
              </div>
              <div className="p-1.5 rounded-lg bg-[#06120c] border border-emerald-900/45">
                <div className="text-stone-400">Net Exports</div>
                <div className="font-bold text-stone-100">{economy.gdpBreakdown.netExportsValue}</div>
              </div>
            </div>
          </div>

          {/* Inflation & Drivers */}
          <div className="p-3 rounded-2xl bg-[#081912] border border-orange-800/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-orange-300">
                <Flame className="w-4 h-4" /> Inflation Monitor
              </span>
              <span
                className={`font-bold ${
                  economy.inflationRate > 4
                    ? 'text-red-400'
                    : economy.inflationRate > 1.5
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }`}
              >
                {economy.inflationRate >= 0 ? '+' : ''}
                {economy.inflationRate.toFixed(1)}%
              </span>
            </div>
            <ul className="space-y-1 text-[11px] text-stone-300">
              {economy.inflationDrivers.map((d, idx) => (
                <li key={idx} className="px-2 py-1 rounded-lg bg-[#06120c] border border-emerald-900/45">
                  {d}
                </li>
              ))}
            </ul>
          </div>

          {/* Monthly FX Rate History */}
          {economy.fxHistory.length > 0 && (
            <div className="p-3 rounded-2xl bg-[#081912] border border-emerald-800/55 space-y-2">
              <div className="font-bold text-stone-100 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-cyan-400" /> Monthly FX Rate History
                </span>
                <span className="text-[10px] text-stone-400">Last {economy.fxHistory.length} months</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {economy.fxHistory.map((h) => (
                  <div
                    key={h.monthKey}
                    className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/45 space-y-0.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300">
                        {h.monthKey} · 1 FX = {h.rate.toFixed(2)} C
                      </span>
                      <span className={h.deltaPct <= 0 ? 'text-emerald-300' : 'text-orange-300'}>
                        {h.deltaPct >= 0 ? `+${h.deltaPct}%` : `${h.deltaPct}%`}
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-400">{h.factors.join(' · ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Financial Transactions */}
          <div className="p-3 rounded-2xl bg-[#081912] border border-emerald-800/55 space-y-2">
            <div className="flex items-center justify-between font-bold text-stone-100">
              <span>Financial Transaction Ledger</span>
              <span className="text-[10px] text-stone-400">{economy.recentTransactions.length} entries</span>
            </div>
            {economy.recentTransactions.length === 0 ? (
              <div className="text-[11px] text-stone-400 py-1">
                No FX conversions or trade settlements recorded yet.
              </div>
            ) : (
              <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                {economy.recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-2 rounded-xl bg-[#06120c] border border-emerald-900/45 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-200 truncate">{tx.summary}</div>
                      <div className="text-[10px] text-stone-400">
                        {tx.monthKey} · Local {Math.floor(tx.localBalanceAfter).toLocaleString()} C · FX{' '}
                        {tx.fxBalanceAfter.toFixed(2)}
                      </div>
                    </div>
                    <span
                      className={`font-bold shrink-0 ${tx.amount >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}
                    >
                      {tx.amount >= 0 ? '+' : ''}
                      {tx.currency === 'FX' ? `${tx.amount.toFixed(2)} FX` : `${Math.round(tx.amount)} C`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </SheetContainer>
  );
};
