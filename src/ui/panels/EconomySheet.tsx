import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Sparkles, Globe, Building2 } from 'lucide-react';
import { RESOURCE_LIST } from '../../data/resources.data';
import { EconomySystem } from '../../systems/EconomySystem';
import { GameController, GameSnapshot } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

export const EconomySheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [query, setQuery] = useState('');
  const [bulkKeepPct, setBulkKeepPct] = useState<number>(40);
  const { state } = snap;
  const tradeCap = EconomySystem.getTradeCapacity(state);
  const fireDiscount = Math.round(EconomySystem.getFireUpkeepDiscount(state) * 100);
  const latestLedger = state.ledger[state.ledger.length - 1];
  const q = query.trim().toLowerCase();

  const visibleResources = RESOURCE_LIST.filter(
    (r) =>
      (state.level >= r.unlockLevel || state.resources[r.id] > 0) &&
      (!q || r.name.toLowerCase().includes(q) || r.shortCode.toLowerCase().includes(q))
  );

  return (
    <SheetContainer
      title="Economy & Market"
      subtitle={`Treasury: ${Math.floor(state.coins).toLocaleString()} Coins · Trade Cap: ${tradeCap}/batch`}
    >
      <div className="space-y-4 min-w-0">
        {/* Tax Policy Selector with Live Preview */}
        <div className="p-3 rounded-2xl bg-emerald-950/50 border border-emerald-900/50 space-y-2.5 min-w-0">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-semibold text-stone-200">Tax Rate Policy</span>
            <span className="text-stone-300 tabular-nums">
              {state.taxRate <= 0.6
                ? '+8 Happiness'
                : state.taxRate <= 1.05
                  ? 'Balanced (0 Happiness)'
                  : state.taxRate <= 1.55
                    ? '-12 Happiness'
                    : '-26 Happiness'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              [0.5, 'Low 0.5×'],
              [1.0, 'Normal 1×'],
              [1.5, 'High 1.5×'],
              [2.0, 'Max 2×'],
            ].map(([rate, label]) => {
              const numRate = Number(rate);
              const preview = EconomySystem.getTaxImpactPreview(state, numRate);
              const active = Math.abs(state.taxRate - numRate) < 0.05;
              return (
                <button
                  key={String(rate)}
                  type="button"
                  onClick={() => GameController.dispatch({ type: 'SET_TAX_RATE', rate: numRate })}
                  className={`min-h-[48px] px-1 rounded-xl text-[11px] font-medium transition-colors flex flex-col items-center justify-center tabular-nums ${
                    active
                      ? 'bg-amber-500 text-stone-950 font-bold'
                      : 'bg-stone-900 text-stone-300 hover:text-white'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-[9px] ${active ? 'text-stone-900' : 'text-stone-400'}`}>
                    {preview.netPerMin >= 0 ? `+${preview.netPerMin}` : preview.netPerMin}C/m
                    {preview.happinessDelta !== 0
                      ? ` · ${preview.happinessDelta > 0 ? `+${preview.happinessDelta}` : preview.happinessDelta}H`
                      : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rolling Financial Ledger */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs tabular-nums">
          <div className="p-2.5 rounded-xl bg-emerald-950/45 border border-emerald-900/45">
            <div className="text-[10px] text-stone-400">Tax/min</div>
            <div className="font-bold text-emerald-300">+{latestLedger?.taxIncome ?? 0}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/45 border border-emerald-900/45">
            <div className="text-[10px] text-stone-400">Upkeep/m</div>
            <div className="font-bold text-orange-300">-{latestLedger?.upkeepExpense ?? 0}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/45 border border-emerald-900/45">
            <div className="text-[10px] text-stone-400">Wages/m</div>
            <div className="font-bold text-orange-300">-{latestLedger?.wageExpense ?? 0}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/45 border border-emerald-900/45">
            <div className="text-[10px] text-stone-400">Net/min</div>
            <div
              className={`font-bold ${
                (latestLedger?.net ?? 0) >= 0 ? 'text-amber-300' : 'text-red-400'
              }`}
            >
              {(latestLedger?.net ?? 0) >= 0 ? `+${latestLedger?.net ?? 0}` : latestLedger?.net ?? 0}
            </div>
          </div>
        </div>

        {fireDiscount > 0 || state.activeEvent?.id === 'merchant_caravan' || state.activePolicies?.includes('free_trade_act') ? (
          <div className="px-3 py-2 rounded-xl bg-amber-950/45 border border-amber-700/45 text-[11px] text-amber-200 flex flex-wrap gap-3 tabular-nums">
            {fireDiscount > 0 ? <span>Fire Brigade Upkeep Savings: -{fireDiscount}%</span> : null}
            {state.activePolicies?.includes('free_trade_act') ? (
              <span>Open Harbor Charter: +30% Cap · +12% Sell</span>
            ) : null}
            {state.activeEvent?.id === 'merchant_caravan' ? (
              <span>Merchant Caravan: +25% Sell ({state.activeEvent.ticksRemaining}s)</span>
            ) : null}
          </div>
        ) : null}

        {/* International Trade, Foreign Currency & Customs Summary */}
        <div className="p-3 rounded-2xl bg-gradient-to-b from-[#0d2433] to-[#081722] border border-cyan-700/50 space-y-2 tabular-nums">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-bold text-cyan-200">
              <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
              International Trade &amp; Forex
            </span>
            <span className="text-[11px] text-cyan-300 font-semibold">
              1 FX = {(state.economy?.fxRate ?? 10).toFixed(2)} C · Fee {Math.round((state.customsFeeRate ?? 0.08) * 100)}%
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-[#07151f] border border-cyan-900/50">
              <div className="text-[10px] text-stone-400">Foreign Reserve</div>
              <div className="font-bold text-cyan-300">{(state.foreignCurrency ?? 0).toFixed(2)} FX</div>
            </div>
            <div className="p-2 rounded-xl bg-[#07151f] border border-cyan-900/50">
              <div className="text-[10px] text-stone-400">GDP / Inflation</div>
              <div className="font-bold text-stone-100">
                {(state.economy?.gdpCurrent ?? 0).toLocaleString()} · {(state.economy?.inflationRate ?? 0).toFixed(1)}%
              </div>
            </div>
            <div className="p-2 rounded-xl bg-[#07151f] border border-cyan-900/50">
              <div className="text-[10px] text-stone-400">Trade Balance</div>
              <div
                className={`font-bold ${
                  (state.tradeBalance ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'
                }`}
              >
                {(state.tradeBalance ?? 0) >= 0 ? '+' : ''}
                {Math.round(state.tradeBalance ?? 0)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => GameController.openNationalStats('economy')}
            className="w-full min-h-[38px] px-3 rounded-xl bg-cyan-500/20 border border-cyan-500/55 text-cyan-200 font-bold text-xs"
          >
            Open FX Converter, GDP &amp; Inflation Stats
          </button>
        </div>

        {/* Corporate Competition & Sector Market Share */}
        {(state.corporateStats?.length ?? 0) > 0 ? (
          <div className="p-3 rounded-2xl bg-[#0b1f16] border border-emerald-700/50 space-y-2 tabular-nums">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-bold text-amber-300">
                <Building2 className="w-4 h-4 shrink-0" />
                Corporate Competition &amp; Sectors
              </span>
              <span className="text-[11px] text-stone-400">
                {state.corporateStats!.length} active sectors
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {state.corporateStats!.map((cs) => (
                <div
                  key={cs.sector}
                  className="p-2 rounded-xl bg-[#07150e] border border-emerald-900/50 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-100 truncate capitalize">
                      {cs.sector.replace(/_/g, ' ')}
                    </div>
                    <div className="text-[10px] text-stone-400">
                      {cs.buildings} HQ/Offices · {cs.workers} staff
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-emerald-300">+{cs.profitPerMin}C/m</div>
                    <div className="text-[10px] text-amber-300">{cs.marketSharePct}% share</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* One-Tap Capacity % Inventory Balancer */}
        <div className="p-3 rounded-2xl bg-[#0b1f16] border border-emerald-700/50 space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>One-Tap Storage Cap Balancer</span>
            </div>
            <span className="text-[11px] text-stone-300 tabular-nums">Keep {bulkKeepPct}% of Cap</span>
          </div>
          <p className="text-[11px] text-stone-400 leading-snug">
            Keeps {bulkKeepPct}% of each item&apos;s max storage capacity and sells everything above that cap immediately.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {[20, 40, 60, 80].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setBulkKeepPct(pct)}
                className={`min-h-[44px] px-3 rounded-xl text-xs font-bold tabular-nums ${
                  bulkKeepPct === pct
                    ? 'bg-emerald-500 text-stone-950'
                    : 'bg-[#07150e] border border-emerald-800/60 text-stone-300'
                }`}
              >
                {pct}%
              </button>
            ))}
            <input
              type="number"
              min={0}
              max={100}
              aria-label="Bulk keep capacity percentage"
              value={bulkKeepPct}
              onChange={(e) => {
                const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
                setBulkKeepPct(v);
              }}
              className="w-16 min-h-[44px] px-2 rounded-xl bg-[#07150e] border border-emerald-700/70 text-center text-xs font-bold text-amber-300 tabular-nums"
            />
            <button
              type="button"
              disabled={tradeCap === 0}
              onClick={() => GameController.dispatch({ type: 'SELL_EXCESS_BY_PCT', keepPct: bulkKeepPct })}
              className="flex-1 min-w-[140px] min-h-[44px] px-3 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 disabled:from-stone-800 disabled:to-stone-800 disabled:text-stone-500 text-stone-950 font-bold text-xs tabular-nums"
            >
              {tradeCap === 0 ? 'Need Trading Post' : `Keep ${bulkKeepPct}% Cap · Sell Excess`}
            </button>
          </div>
        </div>

        {/* Dynamic Market Exchange */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-semibold text-stone-300">Global Market Exchange</h3>
            {tradeCap === 0 ? (
              <span className="text-[11px] text-amber-300">Build a Trading Post to trade</span>
            ) : (
              <span className="text-[11px] text-emerald-300 tabular-nums">Auto-sell reacts live</span>
            )}
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter goods..."
            className="w-full mb-2.5 px-3 py-2.5 rounded-xl bg-[#07150e] border border-emerald-800/60 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400"
          />

          <div className="space-y-2">
            {visibleResources.map((r) => {
              const stock = Math.floor(state.resources[r.id]);
              const cap = Math.max(1, Math.floor(state.capacities[r.id] ?? r.baseCap));
              const fillPct = Math.min(100, Math.round((stock / cap) * 100));
              const buyP = EconomySystem.getBuyPrice(state, r.id);
              const sellP = EconomySystem.getSellPrice(state, r.id);
              const trend = EconomySystem.getMarketTrend(state, r.id);
              const rule = state.autoTradeRules[r.id];
              const autoEnabled = rule?.mode === 'sell_excess';
              const activeKeepPct =
                typeof rule?.keepPct === 'number'
                  ? rule.keepPct
                  : rule
                    ? Math.round((EconomySystem.getRuleKeepTarget(state, rule) / cap) * 100)
                    : 40;
              const keepUnits = EconomySystem.getRuleKeepTarget(state, {
                resourceId: r.id,
                mode: 'sell_excess',
                threshold: rule?.threshold ?? 0,
                keepPct: activeKeepPct,
              });

              return (
                <div
                  key={r.id}
                  className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-900/45 space-y-2 text-xs tabular-nums min-w-0"
                >
                  {/* Top Info Row */}
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-stone-100 truncate">{r.name}</span>
                        {trend === 'up' ? (
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : trend === 'down' ? (
                          <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        ) : (
                          <Minus className="w-3 h-3 text-stone-500 shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-stone-300 mt-0.5">
                        {stock}/{cap} ({fillPct}%) · Buy <strong className="text-sky-300">{buyP}C</strong> · Sell{' '}
                        <strong className="text-amber-300">{sellP}C</strong>
                      </div>
                      <div className="w-full h-1 bg-[#06120c] rounded-sm overflow-hidden mt-1">
                        <div
                          className={`h-full transition-all ${
                            fillPct >= 85 ? 'bg-amber-400' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quick Buy / Sell Grid */}
                  <div className="grid grid-cols-6 gap-1">
                    {([1, 10, 50] as const).map((amt) => (
                      <button
                        key={`b-${amt}`}
                        type="button"
                        disabled={tradeCap === 0}
                        onClick={() =>
                          GameController.dispatch({ type: 'BUY_RESOURCE', resourceId: r.id, amount: amt })
                        }
                        className="min-h-[44px] rounded-xl bg-sky-800/85 hover:bg-sky-700 disabled:bg-stone-800 disabled:text-stone-500 text-white font-semibold text-[11px]"
                      >
                        +{amt}
                      </button>
                    ))}
                    {([1, 10, 50] as const).map((amt) => (
                      <button
                        key={`s-${amt}`}
                        type="button"
                        disabled={tradeCap === 0 || stock === 0}
                        onClick={() =>
                          GameController.dispatch({ type: 'SELL_RESOURCE', resourceId: r.id, amount: amt })
                        }
                        className="min-h-[44px] rounded-xl bg-amber-500/90 hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-500 text-stone-950 font-bold text-[11px]"
                      >
                        -{amt}
                      </button>
                    ))}
                  </div>

                  {/* Dynamic % of Storage Auto-Sell Rule */}
                  <div className="pt-1.5 border-t border-emerald-900/50 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        disabled={tradeCap === 0}
                        onClick={() => {
                          const nextMode = autoEnabled ? 'none' : 'sell_excess';
                          GameController.dispatch({
                            type: 'SET_AUTO_TRADE',
                            rule: {
                              resourceId: r.id,
                              mode: nextMode,
                              threshold: keepUnits,
                              keepPct: activeKeepPct,
                            },
                          });
                        }}
                        className={`min-h-[44px] px-3 rounded-xl text-[11px] font-bold shrink-0 ${
                          autoEnabled
                            ? 'bg-emerald-600 text-white'
                            : 'bg-stone-800 text-stone-300 disabled:opacity-50'
                        }`}
                      >
                        {autoEnabled ? 'Auto-Sell ON' : 'Auto-Sell OFF'}
                      </button>
                      <span className="text-[11px] text-stone-300 truncate">
                        Keep <strong className="text-amber-300">{keepUnits}</strong> / Cap {cap}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <label className="text-[10px] text-stone-400">Keep%</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        disabled={tradeCap === 0}
                        aria-label={`Auto sell keep percentage for ${r.name}`}
                        value={activeKeepPct}
                        onChange={(e) => {
                          const pct = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
                          GameController.dispatch({
                            type: 'SET_AUTO_TRADE',
                            rule: {
                              resourceId: r.id,
                              mode: 'sell_excess',
                              threshold: Math.floor((cap * pct) / 100),
                              keepPct: pct,
                            },
                          });
                        }}
                        className="w-14 min-h-[44px] px-1.5 rounded-xl bg-[#07150e] border border-emerald-700/70 text-center text-xs font-bold text-amber-300 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SheetContainer>
  );
};
