import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  ScrollText,
  Smile,
  Hammer,
  ArrowRight,
  HeartPulse,
  Briefcase,
  Building2,
  MapPin,
} from 'lucide-react';
import type { BuildingCategory } from '../../data/buildings.data';
import { CITY_POLICIES } from '../../data/policies.data';
import { PopulationSystem } from '../../systems/PopulationSystem';
import { StatisticsSystem } from '../../systems/StatisticsSystem';
import { GameController, GameSnapshot } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

type PopSubTab = 'overview' | 'professions' | 'districts' | 'buildings';

const PRIORITY_CATS: Array<[BuildingCategory, string]> = [
  ['agricultural', 'Food & Farming'],
  ['energy', 'Power & Water'],
  ['production', 'Crafting & Mills'],
  ['industrial', 'Mining & Heavy Industry'],
  ['healthcare', 'Healthcare'],
  ['educational', 'Education & Research'],
  ['commercial', 'Trade & Commerce'],
  ['government', 'Government & Services'],
  ['transportation', 'Transport & Logistics'],
  ['environmental', 'Forestry & Ecology'],
];

export const PopulationSheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [subTab, setSubTab] = useState<PopSubTab>('overview');
  const { state } = snap;
  const { population, environment, workforcePriorities, waterGenerated, waterDemand } = state;
  const happyReport = PopulationSystem.computeHappinessReport(state);
  const statsSnap = useMemo(
    () => StatisticsSystem.computeSnapshot(state, GameController.engine.chunks),
    [state, state.tick, state.buildings.length, population.total, state.stats.unlockedTiles]
  );

  const hasPlaza = state.buildings.some(
    (b) => b.defId === 'festival_plaza' && b.status !== 'constructing'
  );
  const baseCost = 120 + population.total * 3;
  const festCost = hasPlaza ? Math.round(baseCost * 0.5) : baseCost;
  const festRem = state.festivalTicksRemaining ?? 0;
  const festCool = state.festivalCooldownTicks ?? 0;
  const activePolicies = state.activePolicies ?? [];

  return (
    <SheetContainer
      title="Society, Professions & Civic Stats"
      subtitle={`Citizens: ${population.total}/${population.capacity} · Happiness: ${population.happiness}% · Life Exp: ${statsSnap.lifeExpectancy}y`}
    >
      <div className="space-y-4 min-w-0">
        {/* Sub-Tab Switcher */}
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              ['overview', 'Overview'],
              ['professions', '24 Roles'],
              ['districts', 'Districts'],
              ['buildings', 'Workplaces'],
            ] as Array<[PopSubTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`min-h-[42px] px-2 rounded-xl text-xs font-bold transition-all ${
                subTab === id
                  ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950'
                  : 'bg-[#0a1d14] border border-emerald-800/60 text-stone-300 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {subTab === 'overview' && (
          <>
            {/* Health & Life Expectancy Bar */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs tabular-nums">
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60">
                <div className="text-[10px] text-stone-400 flex items-center justify-center gap-1">
                  <HeartPulse className="w-3 h-3 text-emerald-400" /> Life Exp.
                </div>
                <div className="text-base font-extrabold text-emerald-300">{statsSnap.lifeExpectancy} yrs</div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60">
                <div className="text-[10px] text-stone-400">Sickness</div>
                <div
                  className={`text-base font-extrabold ${
                    statsSnap.sicknessRate <= 10 ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {statsSnap.sicknessRate}%
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60">
                <div className="text-[10px] text-stone-400">Healthcare</div>
                <div className="text-base font-extrabold text-sky-300">{statsSnap.healthcareCoveragePct}%</div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60">
                <div className="text-[10px] text-stone-400">Education</div>
                <div className="text-base font-extrabold text-indigo-300">{statsSnap.educationCoveragePct}%</div>
              </div>
            </div>

            {/* Population vs Adult Workforce & Job Slots */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs tabular-nums">
              <div className="p-2 rounded-xl bg-[#091c13] border border-emerald-800/55">
                <div className="text-[10px] text-stone-400">Total Pop</div>
                <div className="text-sm font-extrabold text-stone-100">{statsSnap.total}</div>
              </div>
              <div className="p-2 rounded-xl bg-[#091c13] border border-emerald-800/55">
                <div className="text-[10px] text-stone-400">Workforce</div>
                <div className="text-sm font-extrabold text-cyan-300">{statsSnap.availableWorkforce}</div>
              </div>
              <div className="p-2 rounded-xl bg-[#091c13] border border-emerald-800/55">
                <div className="text-[10px] text-stone-400">Employed</div>
                <div className="text-sm font-extrabold text-emerald-300">{statsSnap.employed}</div>
              </div>
              <div className="p-2 rounded-xl bg-[#091c13] border border-emerald-800/55">
                <div className="text-[10px] text-stone-400">Jobs Filled</div>
                <div className="text-sm font-extrabold text-amber-300">
                  {statsSnap.occupiedJobs}/{statsSnap.totalJobs}
                </div>
              </div>
            </div>

            {/* Happiness Index & Actionable Improvement Guide */}
            <div className="p-3 rounded-2xl bg-gradient-to-b from-[#132b1f] to-[#0a1a12] border border-emerald-700/55 space-y-2.5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-bold text-stone-100">
                  <Smile className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Happiness Index &amp; Guide</span>
                </div>
                <span
                  className={`text-sm font-extrabold tabular-nums ${
                    happyReport.score >= 72
                      ? 'text-emerald-300'
                      : happyReport.score >= 45
                        ? 'text-amber-300'
                        : 'text-red-300'
                  }`}
                >
                  {happyReport.score}%
                </span>
              </div>

              <div className="w-full h-2 bg-[#06120c] border border-emerald-900/60 rounded-sm overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    happyReport.score >= 72
                      ? 'bg-emerald-500'
                      : happyReport.score >= 45
                        ? 'bg-amber-400'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, happyReport.score))}%` }}
                />
              </div>

              <div className="space-y-1.5">
                {happyReport.drivers.map((d) => (
                  <div
                    key={d.id}
                    className="p-2.5 rounded-xl bg-[#07150e] border border-emerald-900/50 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-100 truncate">{d.label}</span>
                        <span
                          className={`font-bold tabular-nums shrink-0 ${
                            d.delta > 0 ? 'text-emerald-300' : d.delta < 0 ? 'text-red-300' : 'text-stone-400'
                          }`}
                        >
                          {d.delta > 0 ? `+${d.delta}` : d.delta}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-400 leading-snug mt-0.5">{d.detail}</div>
                    </div>
                    {d.actionLabel ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (d.recommendedDefId) {
                            GameController.setTool({ mode: 'build', defId: d.recommendedDefId, rotation: 0 });
                            GameController.setActiveSheet('none');
                          } else if (d.actionSheet) {
                            GameController.setActiveSheet(d.actionSheet);
                          }
                        }}
                        className="min-h-[44px] px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-[11px] flex items-center gap-1 shrink-0"
                      >
                        {d.recommendedDefId ? <Hammer className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                        {d.actionLabel}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {/* City Festival Launcher */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-950/60 to-emerald-950/60 border border-amber-700/50 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-bold text-amber-200">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  City Lantern Festival
                </div>
                <div className="text-[11px] text-stone-300 mt-0.5 tabular-nums">
                  {festRem > 0
                    ? `Active (${festRem}s): +Happiness, +50% Tax revenue, +35% Growth`
                    : festCool > 0
                      ? `Next festival available in ${festCool}s`
                      : `+15..22 Happiness, +50% Tax & +35% Growth for 60s${hasPlaza ? ' (Plaza 50% off)' : ''}`}
                </div>
              </div>
              <button
                type="button"
                disabled={festRem > 0 || festCool > 0 || state.coins < festCost}
                onClick={() => GameController.dispatch({ type: 'START_FESTIVAL' })}
                className="min-h-[44px] px-4 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 disabled:from-stone-800 disabled:to-stone-800 disabled:text-stone-500 text-stone-950 font-bold text-xs tabular-nums shrink-0"
              >
                {festRem > 0
                  ? `Live · ${festRem}s`
                  : festCool > 0
                    ? `Cooldown ${festCool}s`
                    : `Host (${festCost}C)`}
              </button>
            </div>

            {/* Citizen Needs */}
            <div>
              <h3 className="text-xs font-semibold text-stone-300 mb-2">Citizen Needs Coverage</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(
                  [
                    ['Food Supply', population.needs.food, '#f97316'],
                    ['Clean Water', population.needs.water, '#0ea5e9'],
                    ['Healthcare', population.needs.healthcare, '#10b981'],
                    ['Education', population.needs.education, '#6366f1'],
                    ['Safety', population.needs.safety, '#eab308'],
                    ['Recreation', population.needs.recreation, '#a855f7'],
                  ] as Array<[string, number, string]>
                ).map(([label, val, col]) => {
                  const pct = Math.round(val * 100);
                  return (
                    <div key={label} className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-900/40">
                      <div className="flex justify-between text-stone-200 mb-1 tabular-nums">
                        <span>{label}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-stone-900 rounded-sm overflow-hidden">
                        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: col }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Civic Edicts & Policies */}
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-stone-300 mb-2">
                <ScrollText className="w-3.5 h-3.5 text-amber-400" />
                Civic Edicts &amp; Policies
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CITY_POLICIES.map((pol) => {
                  const unlocked = state.level >= pol.unlockLevel;
                  const enacted = activePolicies.includes(pol.id);
                  return (
                    <div
                      key={pol.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                        enacted
                          ? 'bg-emerald-900/45 border-emerald-500/70'
                          : 'bg-emerald-950/40 border-emerald-900/45'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-stone-100 truncate">{pol.name}</div>
                        <div className="text-[11px] text-lime-300 leading-snug">{pol.effectText}</div>
                        <div className="text-[10px] text-stone-400 leading-snug">{pol.tradeoffText}</div>
                      </div>
                      <button
                        type="button"
                        disabled={!unlocked}
                        onClick={() => GameController.dispatch({ type: 'TOGGLE_POLICY', policyId: pol.id })}
                        className={`min-h-[44px] px-3 rounded-xl font-bold text-xs shrink-0 tabular-nums ${
                          !unlocked
                            ? 'bg-stone-900 text-stone-500'
                            : enacted
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-emerald-700 text-white hover:bg-emerald-600'
                        }`}
                      >
                        {!unlocked ? `Lv.${pol.unlockLevel}` : enacted ? 'Repeal' : 'Enact'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ecology & Sustainability */}
            <div>
              <h3 className="text-xs font-semibold text-stone-300 mb-2">Environment &amp; Sustainability</h3>
              <div className="grid grid-cols-4 gap-2 text-center text-xs tabular-nums">
                <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-900/40">
                  <div className="text-[10px] text-stone-400">Forest</div>
                  <div className="font-semibold text-lime-300">{environment.forestCoveragePct}%</div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-900/40">
                  <div className="text-[10px] text-stone-400">Pollution</div>
                  <div className="font-semibold text-orange-300">{environment.avgPollution}</div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-900/40">
                  <div className="text-[10px] text-stone-400">Water Q.</div>
                  <div className="font-semibold text-sky-300">{environment.waterQuality}%</div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-900/40">
                  <div className="text-[10px] text-stone-400">Sustain.</div>
                  <div className="font-semibold text-emerald-300">{environment.sustainability}</div>
                </div>
              </div>
            </div>

            {/* Workforce Priority Controls */}
            <div>
              <h3 className="text-xs font-semibold text-stone-300 mb-2">Workforce Assignment Priorities</h3>
              <div className="space-y-1.5">
                {PRIORITY_CATS.map(([cat, label]) => {
                  const prio = workforcePriorities[cat] ?? 3;
                  return (
                    <div
                      key={cat}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-900/40"
                    >
                      <span className="text-xs text-stone-200">{label}</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((lv) => (
                          <button
                            key={lv}
                            type="button"
                            onClick={() =>
                              GameController.dispatch({
                                type: 'SET_WORKFORCE_PRIORITY',
                                category: cat,
                                priority: lv,
                              })
                            }
                            className={`w-7 h-7 rounded text-xs font-semibold tabular-nums ${
                              prio === lv
                                ? 'bg-amber-500 text-stone-950'
                                : 'bg-stone-900 text-stone-400 hover:text-white'
                            }`}
                          >
                            {lv}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {subTab === 'professions' && (
          <div className="space-y-3.5 tabular-nums">
            {/* Employment & Job Market Summary */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Adult Workforce</div>
                <div className="text-base font-bold text-cyan-300">{statsSnap.availableWorkforce}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Employed</div>
                <div className="text-base font-bold text-emerald-300">{statsSnap.employed}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Unemployed Adults</div>
                <div className="text-base font-bold text-amber-300">{statsSnap.unemployed}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Total Jobs</div>
                <div className="text-base font-bold text-stone-100">{statsSnap.totalJobs}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Vacant Jobs</div>
                <div className="text-base font-bold text-sky-300">{statsSnap.vacantJobs}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
                <div className="text-[10px] text-stone-400">Homeless</div>
                <div className="text-base font-bold text-red-300">{statsSnap.homeless}</div>
              </div>
            </div>

            {/* Employment & Age Groups */}
            <div className="p-3 rounded-2xl bg-[#091c13] border border-emerald-800/55 space-y-1.5 text-xs">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 shrink-0" />
                Employment &amp; Demographics
              </div>
              {statsSnap.employmentBreakdown.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-stone-200 py-0.5">
                  <span>{row.label}</span>
                  <strong className="text-stone-100">{row.count}</strong>
                </div>
              ))}
            </div>

            {/* All 24 Professions */}
            <div className="p-3 rounded-2xl bg-[#091c13] border border-emerald-800/55 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-300">All 24 Citizen Professions</span>
                <span className="text-[11px] text-stone-400">Pop: {statsSnap.total}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {statsSnap.professions.map((p) => (
                  <div
                    key={p.profession}
                    className="px-2.5 py-2 rounded-xl bg-[#06120c] border border-emerald-900/50 flex items-center justify-between gap-2"
                  >
                    <span className="text-stone-200 truncate">{p.label}</span>
                    <span className="font-bold text-amber-300 shrink-0">
                      {p.count} <span className="text-[10px] text-stone-400">({p.pct}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Housing Breakdown */}
            <div className="p-3 rounded-2xl bg-[#091c13] border border-emerald-800/55 space-y-1.5 text-xs">
              <div className="font-bold text-sky-300">Housing Distribution</div>
              {statsSnap.housingBreakdown.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-stone-200 py-0.5">
                  <span>{h.label}</span>
                  <strong className="text-sky-200">{h.count}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {subTab === 'districts' && (
          <div className="space-y-3.5 tabular-nums">
            <div className="p-3 rounded-2xl bg-[#091c13] border border-emerald-800/55 space-y-2 text-xs">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 shrink-0" />
                Industry Workforce Breakdown
              </div>
              <div className="space-y-1.5">
                {statsSnap.industryBreakdown.map((ind) => (
                  <div
                    key={ind.id}
                    className="px-2.5 py-2 rounded-xl bg-[#06120c] border border-emerald-900/50 flex items-center justify-between gap-2"
                  >
                    <span className="text-stone-200 truncate">{ind.label}</span>
                    <strong className="text-emerald-300 shrink-0">{ind.count} workers</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#091c13] border border-emerald-800/55 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-300">All 16 City District Zones</span>
                <span className="text-[11px] text-stone-400">
                  Water: {state.waterDelivered ?? waterGenerated}/{waterDemand} (Cap {waterGenerated})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {statsSnap.districtBreakdown.map((d) => (
                  <div
                    key={d.zone}
                    className="px-2.5 py-2 rounded-xl bg-[#06120c] border border-emerald-900/50 flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1.5 text-stone-200 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: d.colorHex }}
                      />
                      <span className="truncate">{d.name}</span>
                    </span>
                    <span className="text-[11px] text-amber-300 font-semibold shrink-0">
                      {d.tiles}T · {d.buildings}B · {d.workers}W
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {subTab === 'buildings' && (
          <div className="space-y-3 tabular-nums">
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-950/50 border border-emerald-900/50 text-xs">
              <span className="flex items-center gap-1.5 text-stone-200 font-semibold">
                <Building2 className="w-4 h-4 text-amber-300 shrink-0" />
                Active Sites: {statsSnap.buildingRows.length}
              </span>
              {state.buildings.some((b) => !b.enabled) ? (
                <button
                  type="button"
                  onClick={() => GameController.dispatch({ type: 'RESUME_ALL_BUILDINGS' })}
                  className="min-h-[34px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
                >
                  Resume Paused
                </button>
              ) : null}
            </div>

            {statsSnap.buildingRows.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#07150e] border border-emerald-900/50 text-xs text-stone-400 text-center">
                No completed housing or workplace buildings yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {statsSnap.buildingRows.slice(0, 60).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => GameController.focusBuilding(row.id)}
                    className="w-full text-left p-2.5 rounded-xl bg-[#081911] hover:bg-[#0d2419] border border-emerald-800/55 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-stone-100 truncate">
                        {row.name} · Lv.{row.level}
                      </div>
                      <div className="text-[10px] text-stone-400 capitalize">
                        {row.kind} · {row.status.replace('_', ' ')}
                      </div>
                    </div>
                    <span className="font-bold text-amber-300 shrink-0">
                      {row.current}/{row.capacity}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SheetContainer>
  );
};
