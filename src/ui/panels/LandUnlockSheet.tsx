import React from 'react';
import { Coins, Compass, Droplets, Lock, MapPin, ShieldCheck } from 'lucide-react';
import { formatCompactNumber } from '../../core/Formatters';
import { GameController, GameSnapshot } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

export const LandUnlockSheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const { state } = snap;
  const landStats = GameController.engine.chunks.getLandStatistics();

  const statCards = [
    {
      label: 'Total Land Blocks',
      value: formatCompactNumber(landStats.totalLandBlocks),
      sub: 'Dry terrain tiles in surveyed territory',
      icon: <Compass className="w-4 h-4 text-emerald-300 shrink-0" />,
      tone: 'text-stone-100',
    },
    {
      label: 'Total Owned Land Blocks',
      value: formatCompactNumber(landStats.totalOwnedLandBlocks),
      sub: 'Unlocked dry land plots owned by your cities',
      icon: <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />,
      tone: 'text-emerald-300',
    },
    {
      label: 'Total Unlocked Land Blocks',
      value: formatCompactNumber(landStats.totalUnlockedLandBlocks),
      sub: 'All unlocked land and coastal tiles',
      icon: <MapPin className="w-4 h-4 text-amber-300 shrink-0" />,
      tone: 'text-amber-300',
    },
    {
      label: 'Total Locked Land Blocks',
      value: formatCompactNumber(landStats.totalLockedLandBlocks),
      sub: 'Frontier blocks available to expand into',
      icon: <Lock className="w-4 h-4 text-stone-400 shrink-0" />,
      tone: 'text-stone-300',
    },
    {
      label: 'Total Water Area',
      value: `${formatCompactNumber(landStats.totalWaterAreaBlocks)} blocks`,
      sub: `${formatCompactNumber(landStats.totalWaterAreaBlocks * 100)} m² river & ocean tiles`,
      icon: <Droplets className="w-4 h-4 text-sky-300 shrink-0" />,
      tone: 'text-sky-300',
    },
    {
      label: 'Total Owned Land Area',
      value: `${formatCompactNumber(landStats.totalOwnedLandAreaBlocks * 100)} m²`,
      sub: `${(landStats.totalOwnedLandAreaBlocks * 0.01).toFixed(2)} ha (${formatCompactNumber(landStats.totalOwnedLandAreaBlocks)} blocks)`,
      icon: <MapPin className="w-4 h-4 text-lime-300 shrink-0" />,
      tone: 'text-lime-300',
    },
  ];

  return (
    <SheetContainer
      title="Land Overview"
      subtitle={`Owned Cities: ${state.cities.length} · Treasury: ${formatCompactNumber(state.coins)}C`}
    >
      <div className="space-y-2.5 text-sm text-stone-200 tabular-nums">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {statCards.map((item) => (
            <div
              key={item.label}
              className="p-3.5 rounded-2xl bg-gradient-to-b from-[#132b1f] to-[#0a1a12] border border-emerald-700/50 space-y-1"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-stone-300">
                <span>{item.label}</span>
                {item.icon}
              </div>
              <div className={`text-xl font-extrabold ${item.tone}`}>{item.value}</div>
              <div className="text-[11px] text-stone-400">{item.sub}</div>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-b from-[#192c1d] to-[#0b1910] border border-amber-500/45 flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="text-xs font-bold text-amber-200 uppercase tracking-wide">
              Total Land Value
            </div>
            <div className="text-[11px] text-stone-400">
              Combined assessed value of all owned blocks
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xl font-extrabold text-amber-300 shrink-0">
            <Coins className="w-5 h-5 text-amber-400 shrink-0" />
            <span>{formatCompactNumber(landStats.totalLandValue)}C</span>
          </div>
        </div>
      </div>
    </SheetContainer>
  );
};
