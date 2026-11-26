import React, { useMemo, useState } from 'react';
import { X, Building2, Zap, Droplets, AlertTriangle, Info, Map, Users, Activity, Crosshair } from 'lucide-react';
import { formatCompactNumber } from '../../core/Formatters';
import { UtilityFlag, ZONE_META, ZoneType } from '../../core/GameState';
import { BUILDINGS } from '../../data/buildings.data';
import { DEPOSIT_NAMES, DepositType } from '../../data/trees.data';
import type { OverlayMode } from '../../engine/WorldScene';
import { AdvisorSystem } from '../../systems/AdvisorSystem';
import { CitizenAccounting } from '../../systems/CitizenAccounting';
import type { DiagnosticCategory } from '../../systems/NetworkDiagnosticsSystem';
import { GameController, GameSnapshot } from '../bridge/GameController';

type InspectorTab = 'overview' | 'diagnostics' | 'cities' | 'utilities' | 'workforce';

const ZONES: ZoneType[] = Object.keys(ZONE_META) as ZoneType[];

const OVERLAYS: Array<{ id: OverlayMode; label: string }> = [
  { id: 'none', label: 'Off' },
  { id: 'power', label: 'Power' },
  { id: 'water', label: 'Water' },
  { id: 'zones', label: 'Zones' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'paths', label: 'Paths' },
  { id: 'traffic', label: 'Traffic' },
];

export const SimInspectorDrawer: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [tab, setTab] = useState<InspectorTab>('overview');
  const [diagFilter, setDiagFilter] = useState<DiagnosticCategory>('all');
  const [newCityName, setNewCityName] = useState('New Harbor');
  const [renameText, setRenameText] = useState('');
  const [gxInput, setGxInput] = useState(() => String(snap.selectedTile?.gx ?? 2));
  const [gyInput, setGyInput] = useState(() => String(snap.selectedTile?.gy ?? 1));

  const { state } = snap;
  const invariantReport = useMemo(
    () => CitizenAccounting.validateInvariants(state),
    [state, state.tick, state.population.total, state.buildings.length]
  );
  const advice = useMemo(
    () => AdvisorSystem.getAdvice(state, GameController.engine.chunks),
    [state, state.tick, state.buildings.length, state.population.total]
  );
  const diagnostics = useMemo(
    () => GameController.getNetworkDiagnostics(),
    [Math.floor(state.tick / 2), state.buildings.length, state.roadConnectedCount, snap.overlayMode, tab]
  );
  const filteredIssues = useMemo(
    () =>
      diagFilter === 'all'
        ? diagnostics.issues
        : diagnostics.issues.filter((i) => i.category === diagFilter),
    [diagnostics, diagFilter]
  );

  const parsedGx = Number.isFinite(Number(gxInput)) ? Math.trunc(Number(gxInput)) : 0;
  const parsedGy = Number.isFinite(Number(gyInput)) ? Math.trunc(Number(gyInput)) : 0;
  const inspected = GameController.engine.inspectTile(parsedGx, parsedGy);
  const utilSummary = state.utilitySummary;
  const roadSummary = diagnostics.roadSummary;

  return (
    <aside className="pointer-events-auto fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-[#091811]/97 border-l border-emerald-700/60 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-800/60 bg-[#0d2117]">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-amber-300 shrink-0" />
          <h2 className="text-sm font-bold text-stone-100 truncate">City &amp; District Inspector</h2>
        </div>
        <button
          type="button"
          aria-label="Close Inspector"
          onClick={() => GameController.setSimInspectorOpen(false)}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#07130d] border border-emerald-800/70 text-stone-300 hover:text-white shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1 p-2 border-b border-emerald-900/60 bg-[#07130d] text-[11px]">
        {(
          [
            ['overview', 'Overview'],
            ['diagnostics', diagnostics.counts.total > 0 ? `Alerts (${diagnostics.counts.total})` : 'Alerts'],
            ['cities', 'Cities'],
            ['utilities', 'Utilities'],
            ['workforce', 'Staff'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-[40px] px-1 rounded-lg font-semibold whitespace-nowrap truncate ${
              tab === id
                ? 'bg-amber-400 text-stone-950 font-bold'
                : id === 'diagnostics' && diagnostics.counts.critical > 0
                  ? 'bg-red-950/60 text-red-200 border border-red-700/60'
                  : 'bg-[#0c1e15] text-stone-300 border border-emerald-900/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs text-stone-200 tabular-nums">
        {tab === 'overview' && (
          <>
            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-stone-100">
                <Map className="w-3.5 h-3.5 text-amber-300" />
                <span>Map Overlay Mode</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {OVERLAYS.map((ov) => (
                  <button
                    key={ov.id}
                    type="button"
                    onClick={() => GameController.setOverlayMode(ov.id)}
                    className={`min-h-[34px] rounded-lg font-semibold text-[11px] ${
                      snap.overlayMode === ov.id
                        ? 'bg-amber-400 text-stone-950 font-bold'
                        : 'bg-[#07130d] border border-emerald-900/60 text-stone-300'
                    }`}
                  >
                    {ov.label}
                  </button>
                ))}
              </div>
              <div className="p-2 rounded-lg bg-[#07130d] border border-emerald-900/50 text-[11px] space-y-1">
                <div className="flex items-center justify-between text-stone-200 font-semibold">
                  <span>Road Network</span>
                  <span className="text-sky-300">
                    {roadSummary.totalRoadTiles} tiles · {roadSummary.networkCount}{' '}
                    {roadSummary.networkCount === 1 ? 'net' : 'nets'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-stone-400">
                  <span>Vehicles: {roadSummary.activeVehicles}</span>
                  <span>
                    Avg Load: {roadSummary.avgCongestionPct}%
                    {roadSummary.congestedTiles > 0 ? ` (${roadSummary.congestedTiles} busy)` : ''}
                  </span>
                </div>
                {roadSummary.disconnectedClusters > 0 ? (
                  <div className="text-amber-300 font-medium">
                    Disconnected: {roadSummary.disconnectedSegments} tiles across{' '}
                    {roadSummary.disconnectedClusters} isolated{' '}
                    {roadSummary.disconnectedClusters === 1 ? 'segment' : 'segments'}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-1.5">
              <div className="font-bold text-stone-100">City Advisor</div>
              <div className="space-y-1.5">
                {advice.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2 rounded-lg border text-[11px] space-y-0.5 ${
                      item.severity === 'critical'
                        ? 'bg-red-950/60 border-red-700/60 text-red-100'
                        : item.severity === 'warning'
                          ? 'bg-amber-950/50 border-amber-700/50 text-amber-100'
                          : 'bg-[#07130d] border-emerald-900/50 text-stone-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      {item.severity === 'tip' ? (
                        <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      )}
                      <span>{item.title}</span>
                    </div>
                    <div className="text-[10px] opacity-90">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-1.5">
              <div className="font-bold text-stone-100">Citizens &amp; Demographics</div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] text-stone-300">
                <div>Total: {formatCompactNumber(invariantReport.worldTotal)}</div>
                <div>Housing Cap: {formatCompactNumber(state.population.capacity)}</div>
                <div>Employed: {formatCompactNumber(state.population.employed)}</div>
                <div>Homeless: {formatCompactNumber(state.population.homeless)}</div>
              </div>
              <div className="text-[11px] text-stone-400 pt-1 border-t border-emerald-900/60">
                Child {state.population.ageBreakdown.child} · Student {state.population.ageBreakdown.underage} · Adult{' '}
                {state.population.ageBreakdown.adult} · Elderly {state.population.ageBreakdown.elderly}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-1.5">
              <div className="font-bold text-stone-100">Per-City Finances &amp; Population</div>
              {invariantReport.cityBreakdown.map((c) => {
                const fin = state.cityEconomy?.[c.cityId];
                return (
                  <div
                    key={c.cityId}
                    className="p-2 rounded-lg bg-[#07130d] border border-emerald-900/50 space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-stone-100">
                        #{c.cityId} {c.cityName}
                      </span>
                      <span className="font-bold text-sky-300">{formatCompactNumber(c.total)} pop</span>
                    </div>
                    <div className="text-[11px] text-stone-400 flex items-center justify-between">
                      <span>
                        Cap {c.housingCapacity} · Emp {c.employed}
                      </span>
                      {fin ? (
                        <span className={fin.net >= 0 ? 'text-emerald-300 font-semibold' : 'text-red-300 font-semibold'}>
                          {fin.net >= 0 ? '+' : ''}
                          {fin.net}C/m (Tax {fin.taxIncome}C)
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'diagnostics' && (
          <>
            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-bold text-stone-100">
                  <Activity className="w-3.5 h-3.5 text-amber-300" /> Network Diagnostics
                </span>
                <span className="text-[11px] text-stone-400">
                  {diagnostics.counts.critical} Critical · {diagnostics.counts.warning} Warning
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1 bg-[#07130d] p-1 rounded-lg border border-emerald-900/60">
                {(
                  [
                    ['all', `All (${diagnostics.counts.total})`],
                    ['roads', `Roads (${diagnostics.counts.roads})`],
                    ['utilities', `Grid (${diagnostics.counts.utilities})`],
                    ['vehicles', `Fleet (${diagnostics.counts.vehicles})`],
                  ] as const
                ).map(([cid, label]) => (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => setDiagFilter(cid)}
                    className={`min-h-[36px] px-1 rounded-md text-[10px] font-semibold whitespace-nowrap truncate ${
                      diagFilter === cid
                        ? 'bg-amber-400 text-stone-950 font-bold'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredIssues.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#0d2117] border border-emerald-800/60 text-center space-y-1">
                <div className="text-xs font-bold text-emerald-300">No Active Network Issues</div>
                <div className="text-[11px] text-stone-400">
                  All connected roads, utility grids, and cargo routes are operating normally.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-3 rounded-xl border space-y-1.5 ${
                      issue.severity === 'critical'
                        ? 'bg-red-950/45 border-red-700/60 text-red-100'
                        : 'bg-[#0d2117] border-amber-700/50 text-stone-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-bold leading-snug">{issue.title}</div>
                        <div className="text-[10px] text-stone-400 capitalize">
                          {issue.category} · {issue.severity} · ({issue.gx}, {issue.gy})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (issue.category === 'utilities') {
                            GameController.setOverlayMode(
                              issue.title.toLowerCase().includes('water') ? 'water' : 'power'
                            );
                          } else {
                            GameController.setOverlayMode('traffic');
                          }
                          GameController.focusCoordinate(issue.gx, issue.gy, issue.title, issue.buildingId);
                        }}
                        className="min-h-[40px] px-2.5 rounded-lg bg-[#07130d] border border-emerald-700/70 text-amber-300 hover:text-amber-200 font-semibold text-[11px] flex items-center gap-1 shrink-0"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        Locate
                      </button>
                    </div>
                    <div className="text-[11px] text-stone-300 leading-relaxed">{issue.detail}</div>
                    <div className="text-[10px] text-emerald-300/95 leading-snug">{issue.resolutionHint}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'cities' && (
          <>
            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-2">
              <div className="font-bold text-stone-100">Cities ({state.cities.length})</div>
              <div className="space-y-1.5">
                {state.cities.map((c) => (
                  <div
                    key={c.id}
                    className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${
                      c.id === state.activeCityId
                        ? 'bg-emerald-950/70 border-amber-400/70'
                        : 'bg-[#07130d] border-emerald-900/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        #{c.id} {c.name}
                      </div>
                      <div className="text-[11px] text-stone-400">{c.unlockedTiles} unlocked tiles</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => GameController.dispatch({ type: 'SET_ACTIVE_CITY', cityId: c.id })}
                      className="min-h-[34px] px-2.5 rounded-lg bg-emerald-700 text-white font-semibold text-[11px]"
                    >
                      {c.id === state.activeCityId ? 'Active' : 'Select'}
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  placeholder="New city name"
                  className="flex-1 h-10 px-2.5 rounded-lg bg-[#06110b] border border-emerald-800/70 text-stone-100"
                />
                <button
                  type="button"
                  onClick={() => GameController.dispatch({ type: 'CREATE_CITY', name: newCityName })}
                  className="min-h-[40px] px-3 rounded-lg bg-amber-400 text-stone-950 font-bold"
                >
                  Create
                </button>
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  placeholder={`Rename #${state.activeCityId}...`}
                  className="flex-1 h-10 px-2.5 rounded-lg bg-[#06110b] border border-emerald-800/70 text-stone-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!renameText.trim()) return;
                    GameController.dispatch({
                      type: 'RENAME_CITY',
                      cityId: state.activeCityId,
                      name: renameText,
                    });
                    setRenameText('');
                  }}
                  className="min-h-[40px] px-3 rounded-lg bg-emerald-700 text-white font-semibold"
                >
                  Rename
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-2">
              <div className="font-bold text-stone-100">Tile City &amp; Zone Assignment</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-stone-400">
                  gx
                  <input
                    type="number"
                    value={gxInput}
                    onChange={(e) => setGxInput(e.target.value)}
                    className="mt-0.5 w-full h-9 px-2 rounded-lg bg-[#06110b] border border-emerald-800/70 text-stone-100"
                  />
                </label>
                <label className="text-[11px] text-stone-400">
                  gy
                  <input
                    type="number"
                    value={gyInput}
                    onChange={(e) => setGyInput(e.target.value)}
                    className="mt-0.5 w-full h-9 px-2 rounded-lg bg-[#06110b] border border-emerald-800/70 text-stone-100"
                  />
                </label>
              </div>
              <div className="p-2 rounded-lg bg-[#07130d] border border-emerald-900/50 text-[11px] space-y-0.5">
                <div>
                  Biome: {inspected.biomeName} · Unlocked: {inspected.unlocked ? 'Yes' : 'No'}
                </div>
                <div>
                  Owner: #{inspected.cityId} ({inspected.cityName}) · Zone: {inspected.zoneType}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  GameController.dispatch({
                    type: 'ASSIGN_TILE_CITY_ZONE',
                    gx: parsedGx,
                    gy: parsedGy,
                    cityId: state.activeCityId,
                  })
                }
                className="w-full min-h-[36px] px-2.5 rounded-lg bg-emerald-700 text-white font-semibold text-[11px]"
              >
                Assign Tile to City #{state.activeCityId}
              </button>

              <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto pr-1">
                {ZONES.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() =>
                      GameController.dispatch({
                        type: 'ASSIGN_TILE_CITY_ZONE',
                        gx: parsedGx,
                        gy: parsedGy,
                        zoneType: z,
                      })
                    }
                    className={`min-h-[34px] px-2 rounded text-[10px] font-semibold flex items-center gap-1.5 ${
                      inspected.zoneType === z
                        ? 'bg-amber-400 text-stone-950 font-bold'
                        : 'bg-[#07130d] border border-emerald-900/50 text-stone-300'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: ZONE_META[z].colorHex }}
                    />
                    <span className="truncate">{ZONE_META[z].name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'utilities' && (
          <>
            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-2.5">
              <div className="font-bold text-stone-100">Grid &amp; Pipe Health</div>
              <div className="grid grid-cols-1 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-[#07130d] border border-emerald-900/50 space-y-1">
                  <div className="flex items-center justify-between text-amber-300 font-semibold">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" /> Power Grid
                    </span>
                    <span>
                      Conn {utilSummary.powerConnectedCount} · Disc {utilSummary.powerDisconnectedCount}
                      {utilSummary.powerBrownoutCount > 0 ? ` · Low ${utilSummary.powerBrownoutCount}` : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-stone-300">
                    <div>Installed Cap: <strong>{snap.state.powerInstalledCapacity ?? diagnostics.utilityHealth.powerAvailableGen} MW</strong></div>
                    <div>Operating Gen: <strong>{diagnostics.utilityHealth.powerAvailableGen} MW</strong></div>
                    <div>Demand / Deliv: <strong>{diagnostics.utilityHealth.powerDemand} / <span className="text-amber-200">{diagnostics.utilityHealth.powerDelivered}</span> MW</strong></div>
                    <div>Unserved: <strong className={(snap.state.powerUnservedDemand ?? 0) > 0 ? 'text-red-300' : 'text-emerald-300'}>{snap.state.powerUnservedDemand ?? Math.max(0, diagnostics.utilityHealth.powerDemand - diagnostics.utilityHealth.powerDelivered)} MW</strong></div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#07130d] border border-emerald-900/50 space-y-1">
                  <div className="flex items-center justify-between text-sky-300 font-semibold">
                    <span className="flex items-center gap-1">
                      <Droplets className="w-3.5 h-3.5" /> Water Network
                    </span>
                    <span>
                      Conn {utilSummary.waterConnectedCount} · Disc {utilSummary.waterDisconnectedCount}
                      {utilSummary.waterShortageCount > 0 ? ` · Low ${utilSummary.waterShortageCount}` : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-stone-300">
                    <div>Installed Cap: <strong>{snap.state.waterInstalledCapacity ?? diagnostics.utilityHealth.waterAvailableGen} Flow</strong></div>
                    <div>Operating Gen: <strong>{diagnostics.utilityHealth.waterAvailableGen} Flow</strong></div>
                    <div>Demand / Deliv: <strong>{diagnostics.utilityHealth.waterDemand} / <span className="text-sky-200">{diagnostics.utilityHealth.waterDelivered}</span> Flow</strong></div>
                    <div>Unserved: <strong className={(snap.state.waterUnservedDemand ?? 0) > 0 ? 'text-red-300' : 'text-emerald-300'}>{snap.state.waterUnservedDemand ?? Math.max(0, diagnostics.utilityHealth.waterDemand - diagnostics.utilityHealth.waterDelivered)} Flow</strong></div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-emerald-300">Sub-Office Coverage: {utilSummary.serviceCoveragePct}%</span>
                <button
                  type="button"
                  onClick={() => {
                    GameController.setSimInspectorOpen(false);
                    GameController.openNationalStats('utilities');
                  }}
                  className="px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/55 text-amber-200 font-semibold"
                >
                  Full Utility Grids
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-2">
              <div className="font-bold text-stone-100">Map Utility Paint Tools</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ['power_line', 'Power Line (8C)', 'bg-amber-500/20 border-amber-500/50 text-amber-200'],
                    ['substation', 'Substation (45C)', 'bg-amber-500/20 border-amber-400/70 text-amber-100'],
                    ['water_pipe', 'Water Pipe (8C)', 'bg-sky-500/20 border-sky-500/50 text-sky-200'],
                    ['water_pump', 'Water Pump (45C)', 'bg-sky-500/20 border-sky-400/70 text-sky-100'],
                  ] as const
                ).map(([kind, label, cls]) => {
                  const active = snap.tool.mode === 'place_utility' && snap.tool.kind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        GameController.setTool({ mode: 'place_utility', kind });
                        GameController.setOverlayMode(kind.startsWith('power') || kind === 'substation' ? 'power' : 'water');
                      }}
                      className={`min-h-[38px] px-2 rounded-lg border text-[11px] font-semibold ${
                        active ? 'bg-amber-400 border-amber-300 text-stone-950 font-bold' : cls
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => GameController.setTool({ mode: 'remove_utility', kind: 'power' })}
                  className={`min-h-[36px] px-2 rounded-lg border text-[11px] font-semibold ${
                    snap.tool.mode === 'remove_utility' && snap.tool.kind === 'power'
                      ? 'bg-red-500 text-white border-red-400'
                      : 'bg-[#07130d] border-emerald-900/50 text-stone-300'
                  }`}
                >
                  Remove Power
                </button>
                <button
                  type="button"
                  onClick={() => GameController.setTool({ mode: 'remove_utility', kind: 'water' })}
                  className={`min-h-[36px] px-2 rounded-lg border text-[11px] font-semibold ${
                    snap.tool.mode === 'remove_utility' && snap.tool.kind === 'water'
                      ? 'bg-red-500 text-white border-red-400'
                      : 'bg-[#07130d] border-emerald-900/50 text-stone-300'
                  }`}
                >
                  Remove Water
                </button>
              </div>
              <button
                type="button"
                onClick={() => GameController.setTool({ mode: 'inspect_chop' })}
                className="w-full min-h-[36px] rounded-lg bg-[#07130d] border border-emerald-800/60 text-stone-200 font-semibold text-[11px]"
              >
                Return to Standard Pointer
              </button>
              <div className="p-2 rounded-lg bg-[#07130d] border border-emerald-900/50 text-[11px]">
                Tile ({parsedGx}, {parsedGy}): Power={(inspected.utilityNet & UtilityFlag.PowerLine) !== 0 ? 'Yes' : 'No'} · Water=
                {(inspected.utilityNet & UtilityFlag.WaterPipe) !== 0 ? 'Yes' : 'No'}
              </div>
            </div>
          </>
        )}

        {tab === 'workforce' && (
          <>
            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-2">
              <div className="flex items-center justify-between font-bold text-stone-100">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-300" /> Workforce Controls
                </span>
                <span className="text-[11px] text-sky-300">
                  {state.population.employed}/{state.population.total} employed
                </span>
              </div>

              <label className="flex items-center justify-between p-2 rounded-lg bg-[#07130d] border border-emerald-900/50 cursor-pointer">
                <span className="text-[11px] font-semibold">Auto-Assign Available Workers</span>
                <input
                  type="checkbox"
                  checked={state.workforceAutoAssign !== false}
                  onChange={(e) =>
                    GameController.dispatch({ type: 'SET_WORKFORCE_AUTO', enabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-amber-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    GameController.dispatch({
                      type: 'RECRUIT_WORKERS',
                      cityId: state.activeCityId || 1,
                      count: 5,
                    })
                  }
                  className="min-h-[38px] px-2 rounded-lg bg-emerald-700 text-white font-semibold text-[11px]"
                >
                  Recruit +5 (90C)
                </button>
                <button
                  type="button"
                  disabled={(state.emergencyWorkTicksRemaining ?? 0) > 0}
                  onClick={() => GameController.dispatch({ type: 'DISPATCH_EMERGENCY_WORKERS' })}
                  className="min-h-[38px] px-2 rounded-lg bg-amber-500 disabled:bg-stone-700 disabled:text-stone-400 text-stone-950 font-bold text-[11px]"
                >
                  {(state.emergencyWorkTicksRemaining ?? 0) > 0
                    ? `Emergency ${state.emergencyWorkTicksRemaining}s`
                    : 'Emergency Shift (60C)'}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-2">
              <div className="font-bold text-stone-100">Mineral Deposit Locator</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    DepositType.Silver,
                    DepositType.Gold,
                    DepositType.Coal,
                    DepositType.IronOre,
                    DepositType.CopperOre,
                    DepositType.Stone,
                  ] as DepositType[]
                ).map((dep) => (
                  <button
                    key={dep}
                    type="button"
                    onClick={() => GameController.locateTarget({ depositType: dep, keepTool: true })}
                    className="min-h-[36px] px-2 rounded-lg bg-[#07130d] border border-emerald-800/60 text-stone-200 hover:border-amber-400/70 text-[11px] font-semibold text-left"
                  >
                    Find {DEPOSIT_NAMES[dep]}
                  </button>
                ))}
              </div>
              <div className="p-2 rounded-lg bg-[#07130d] border border-emerald-900/50 text-[11px]">
                Selected ({parsedGx}, {parsedGy}): {DEPOSIT_NAMES[inspected.depositType as DepositType] ?? 'None'} · Qty{' '}
                {inspected.depositQty}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0d2117] border border-emerald-800/60 space-y-2">
              <div className="font-bold text-stone-100">Factory Blueprint Levels</div>
              <div className="space-y-1.5">
                {(
                  [
                    'leaf_hut',
                    'automated_tree_plantation_factory',
                    'stone_quarry',
                    'silver_mine',
                    'silver_smelter',
                    'heavy_lumber_complex',
                    'mega_brick_kiln',
                    'regional_bakery_plant',
                    'industrial_steel_complex',
                    'advanced_agro_greenhouse',
                  ] as const
                ).map((defId) => {
                  const def = BUILDINGS[defId];
                  if (!def) return null;
                  const lvl = state.unlockedBuildingLevels[defId] ?? 1;
                  return (
                    <div
                      key={defId}
                      className="p-2 rounded-lg bg-[#07130d] border border-emerald-900/50 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-stone-100 truncate">
                          {def.name} ({def.width}×{def.height})
                        </div>
                        <div className="text-[11px] text-stone-400">
                          Blueprint Lv.{lvl}/{def.maxLevel}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={lvl >= def.maxLevel}
                        onClick={() => GameController.dispatch({ type: 'UPGRADE_BLUEPRINT', defId })}
                        className="min-h-[36px] px-2.5 rounded-lg bg-amber-400 disabled:bg-stone-700 disabled:text-stone-400 text-stone-950 font-bold text-[11px] shrink-0"
                      >
                        {lvl >= def.maxLevel ? 'Max' : 'Upgrade'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
