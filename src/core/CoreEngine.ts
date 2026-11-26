import { BUILDINGS, BuildingCategory, getBuildingFootprint } from '../data/buildings.data';
import { POLICY_MAP } from '../data/policies.data';
import { RESOURCES, ResourceId } from '../data/resources.data';
import { FeatureType, TREE_SPECIES } from '../data/trees.data';
import { BIOME_NAMES, ChunkManager } from './ChunkManager';
import type { CommandResult, GameCommand } from './CommandTypes';
import { IN_GAME_HOUR_SECONDS } from './Formatters';
import {
  BiomeId,
  ChunkData,
  OfflineSummary,
  SCHEMA_VERSION,
  TileFlag,
  TileInspection,
  WorldEngineState,
  ZONE_ID_TO_TYPE,
  ZONE_TYPE_TO_ID,
} from './GameState';
import { gridToChunk, tileKey } from './IsoMath';
import {
  clampBuildingLevel,
  getBuildingStatsAtLevel,
  getEffectiveMaxLevel,
} from '../systems/BuildingSimulation';
import { BuildingSystem } from '../systems/BuildingSystem';
import { CitizenAccounting } from '../systems/CitizenAccounting';
import { EconomySystem } from '../systems/EconomySystem';
import { EnvironmentSystem } from '../systems/EnvironmentSystem';
import { PopulationSystem } from '../systems/PopulationSystem';
import { ProductionSystem } from '../systems/ProductionSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { RoadNetworkSystem } from '../systems/RoadNetworkSystem';
import { TechSystem } from '../systems/TechSystem';
import { WorkforceSystem } from '../systems/WorkforceSystem';
import { CitizenSystem } from '../systems/CitizenSystem';
import { UtilityNetworkSystem } from '../systems/UtilityNetworkSystem';
import { DistrictServiceSystem } from '../systems/DistrictServiceSystem';
import { PathfindingSystem } from '../systems/PathfindingSystem';
import { LogisticsAndTransportSystem } from '../systems/LogisticsAndTransportSystem';
import { NetworkDiagnosticsSystem, type NetworkDiagnosticsReport } from '../systems/NetworkDiagnosticsSystem';
import { TreeGrowthSystem } from '../systems/TreeGrowthSystem';
import { TreePlantationSystem } from '../systems/TreePlantationSystem';
import { FinanceSystem } from '../systems/FinanceSystem';

export type EngineEvent =
  | { type: 'CHOP_HIT'; gx: number; gy: number; cleared: boolean; wood: number; coins: number; xp: number; fromCitizen?: boolean }
  | { type: 'AUTO_DELIVERY'; gx: number; gy: number; label: string; color: string }
  | { type: 'RUIN_EXPLORED'; gx: number; gy: number; coins: number; rp: number }
  | { type: 'FESTIVAL_STARTED' }
  | { type: 'TILE_UNLOCKED'; gx: number; gy: number }
  | { type: 'BUILDING_PLACED'; buildingId: number; defId: string; gx: number; gy: number }
  | { type: 'BUILDING_MOVED'; buildingId: number; defId: string; gx: number; gy: number }
  | { type: 'BUILDING_COMPLETED'; buildingId: number; defId: string; gx: number; gy: number; xp: number }
  | { type: 'ROAD_PLACED'; gx: number; gy: number }
  | { type: 'ROAD_REMOVED'; gx: number; gy: number; refundCoins: number }
  | { type: 'LEVEL_UP'; level: number; rewardCoins: number }
  | { type: 'TECH_UNLOCKED'; techId: string; name: string }
  | { type: 'STATE_CHANGED' };

export class CoreEngine {
  public state: WorldEngineState;
  public chunks: ChunkManager;

  public readonly roadNet = new RoadNetworkSystem();
  public readonly buildingSys = new BuildingSystem();
  public readonly populationSys = new PopulationSystem();
  public readonly workforce = new WorkforceSystem();
  public readonly productionSys = new ProductionSystem();
  public readonly progression = new ProgressionSystem();
  public readonly citizens = new CitizenSystem();
  public readonly logistics = new LogisticsAndTransportSystem();
  private drivingViaAdvanceFrame = false;
  private simClockSec = 0;
  private readonly movingVehicleTilesCache = new Set<number>();
  private diagCache: NetworkDiagnosticsReport | null = null;
  private diagCacheKey = '';
  private diagCacheClockSec = -999;

  private listeners = new Set<(ev: EngineEvent) => void>();
  private tickAccumulatorMs = 0;

  constructor(seed = Math.floor(Math.random() * 0x7fffffff) + 1) {
    this.state = CoreEngine.createInitialState(seed);
    this.chunks = new ChunkManager(seed);
    this.state.stats.unlockedTiles = this.chunks.countUnlockedTiles();
  }

  public static createInitialState(seed: number): WorldEngineState {
    const { resources, capacities } = ResourceSystem.createInitialResources();
    const priorities: Record<BuildingCategory, number> = {
      energy: 5,
      agricultural: 5,
      healthcare: 4,
      environmental: 4,
      production: 4,
      industrial: 3,
      commercial: 3,
      educational: 3,
      government: 3,
      transportation: 3,
      storage: 2,
      recreational: 2,
      residential: 1,
    };

    return {
      schemaVersion: SCHEMA_VERSION,
      worldSeed: seed,
      tick: 0,
      speed: 1,
      coins: 500,
      xp: 0,
      level: 1,
      researchPoints: 0,
      activeTechId: null,
      activeTechProgress: 0,
      unlockedTechIds: [],
      completedQuestIds: [],
      trackedQuestId: null,
      unlockedAchievements: [],
      resources,
      capacities,
      netRatesPerMin: {},
      buildings: [],
      nextBuildingId: 1,
      unlockedBuildingLevels: {},
      cities: [
        {
          id: 1,
          name: 'Kukus Valley',
          color: '#f59e0b',
          createdTick: 0,
          taxRate: 1.0,
          unlockedTiles: 20,
        },
      ],
      activeCityId: 1,
      nextCityId: 2,
      zones: [],
      workforcePriorities: priorities,
      workforceAutoAssign: true,
      emergencyWorkTicksRemaining: 0,
      taxRate: 1.0,
      marketPrices: EconomySystem.createInitialMarketPrices(),
      marketPrevPrices: {},
      autoTradeRules: {},
      ledger: [],
      cityEconomy: {},
      foreignCurrency: 0,
      tradeBalance: 0,
      customsFeeRate: 0.08,
      lifeExpectancy: 72,
      sicknessRate: 8,
      showZoneBorders: false,
      landModeActive: false,
      treePlantations: {},
      growingTrees: [],
      corporateStats: [],
      season: 'spring',
      dayInSeason: 1,
      year: 1,
      calendar: {
        dayOfWeek: 1,
        weekOfMonth: 1,
        month: 1,
        year: 1,
        totalDaysElapsed: 0,
      },
      timeOfDayHours: 8.5,
      weather: 'clear',
      nextWeather: 'rain',
      weatherTicksRemaining: 90,
      activePolicies: [],
      festivalTicksRemaining: 0,
      festivalCooldownTicks: 0,
      activeEvent: null,
      economy: FinanceSystem.createInitialEconomyState(500, 0),
      population: {
        total: 0,
        capacity: 0,
        happiness: 75,
        classes: { laborer: 0, artisan: 0, engineer: 0 },
        employed: 0,
        unemployed: 0,
        homeless: 0,
        availableWorkforce: 0,
        totalJobs: 0,
        occupiedJobs: 0,
        vacantJobs: 0,
        ageBreakdown: { child: 0, underage: 0, adult: 0, elderly: 0 },
        cohorts: [],
        growthAccumulator: 0,
        needs: {
          food: 1,
          water: 1,
          healthcare: 1,
          education: 0,
          safety: 1,
          recreation: 0.5,
        },
      },
      environment: {
        forestCoveragePct: 90,
        avgPollution: 0,
        waterQuality: 100,
        biodiversity: 95,
        sustainability: 92,
      },
      powerInstalledCapacity: 0,
      powerGenerated: 0,
      powerAvailableGen: 0,
      powerDistCapacity: 0,
      powerDelivered: 0,
      powerDemand: 0,
      powerConnectedDemand: 0,
      powerUnservedDemand: 0,
      waterInstalledCapacity: 0,
      waterGenerated: 0,
      waterAvailableGen: 0,
      waterDistCapacity: 0,
      waterDelivered: 0,
      waterDemand: 0,
      waterConnectedDemand: 0,
      waterUnservedDemand: 0,
      utilitySummary: {
        powerConnectedCount: 0,
        powerDisconnectedCount: 0,
        powerBrownoutCount: 0,
        powerInstalledCapacity: 0,
        powerConnectedDemand: 0,
        powerUnservedDemand: 0,
        powerAvailabilityPct: 0,
        waterConnectedCount: 0,
        waterDisconnectedCount: 0,
        waterShortageCount: 0,
        waterInstalledCapacity: 0,
        waterConnectedDemand: 0,
        waterUnservedDemand: 0,
        waterAvailabilityPct: 0,
        powerNetworks: [],
        waterNetworks: [],
        serviceCoveragePct: 0,
      },
      roadConnectedCount: 0,
      stats: {
        treesCut: 0,
        unlockedTiles: 20,
        buildingsBuilt: 0,
        roadsBuilt: 0,
        maxPopulation: 0,
        totalCoinsEarned: 0,
        tradesCompleted: 0,
        playTimeSeconds: 0,
        ruinsExplored: 0,
        festivalsHeld: 0,
        buildingsMoved: 0,
      },
      camera: { x: 0, y: 64, zoom: 1.15 },
      settings: {
        cityName: 'Kukus Valley',
        difficulty: 'standard',
        masterVolume: 0.7,
        sfxVolume: 0.85,
        ambientVolume: 0.35,
        graphicsMode: 'auto',
        crowdDensity: 'auto',
        reducedAnimations: false,
        mildDisasters: true,
        haptics: true,
        timeMode: 'normal',
        weatherMode: 'random',
      },
    };
  }

  public subscribe(listener: (ev: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(ev: EngineEvent): void {
    for (const l of this.listeners) l(ev);
  }

  public loadState(savedState: WorldEngineState, persistedChunks: ChunkData[]): void {
    if (typeof savedState.timeOfDayHours !== 'number' || !Number.isFinite(savedState.timeOfDayHours)) {
      savedState.timeOfDayHours = 8.5;
    }
    savedState.activePolicies ??= [];
    savedState.trackedQuestId ??= null;
    savedState.marketPrevPrices ??= {};
    savedState.nextWeather ??= 'rain';
    savedState.festivalTicksRemaining ??= 0;
    savedState.festivalCooldownTicks ??= 0;
    savedState.activeEvent ??= null;
    savedState.stats.ruinsExplored ??= 0;
    savedState.stats.festivalsHeld ??= 0;
    savedState.stats.buildingsMoved ??= 0;
    savedState.stats.tradesCompleted ??= 0;
    savedState.unlockedBuildingLevels ??= {};
    if (!Array.isArray(savedState.cities) || savedState.cities.length === 0) {
      savedState.cities = [
        {
          id: 1,
          name: savedState.settings.cityName || 'Kukus Valley',
          color: '#f59e0b',
          createdTick: 0,
          taxRate: savedState.taxRate ?? 1.0,
          unlockedTiles: savedState.stats.unlockedTiles ?? 20,
        },
      ];
    }
    savedState.activeCityId ??= savedState.cities[0].id;
    savedState.nextCityId ??= Math.max(...savedState.cities.map((c) => c.id), 1) + 1;
    savedState.zones ??= [];
    savedState.population.homeless ??= 0;
    savedState.population.availableWorkforce ??= 0;
    savedState.population.totalJobs ??= 0;
    savedState.population.occupiedJobs ??= savedState.population.employed ?? 0;
    savedState.population.vacantJobs ??= 0;
    savedState.powerDelivered ??= savedState.powerGenerated ?? 0;
    savedState.waterDelivered ??= savedState.waterGenerated ?? 0;
    savedState.treePlantations ??= {};
    savedState.growingTrees ??= [];
    savedState.population.ageBreakdown ??= { child: 0, underage: 0, adult: 0, elderly: 0 };
    savedState.population.cohorts ??= [];
    savedState.settings.crowdDensity ??= 'auto';
    savedState.workforceAutoAssign ??= true;
    savedState.emergencyWorkTicksRemaining ??= 0;
    savedState.cityEconomy ??= {};
    savedState.foreignCurrency ??= 0;
    savedState.tradeBalance ??= 0;
    savedState.customsFeeRate ??= 0.08;
    savedState.lifeExpectancy ??= 72;
    savedState.sicknessRate ??= 8;
    savedState.showZoneBorders ??= false;
    savedState.landModeActive ??= false;
    savedState.corporateStats ??= [];
    savedState.utilitySummary ??= {
      powerConnectedCount: 0,
      powerDisconnectedCount: 0,
      powerBrownoutCount: 0,
      powerInstalledCapacity: 0,
      powerConnectedDemand: 0,
      powerUnservedDemand: 0,
      powerAvailabilityPct: 0,
      waterConnectedCount: 0,
      waterDisconnectedCount: 0,
      waterShortageCount: 0,
      waterInstalledCapacity: 0,
      waterConnectedDemand: 0,
      waterUnservedDemand: 0,
      waterAvailabilityPct: 0,
      powerNetworks: [],
      waterNetworks: [],
      serviceCoveragePct: 0,
    };
    if (!savedState.calendar) {
      savedState.calendar = {
        dayOfWeek: 1,
        weekOfMonth: 1,
        month: 1,
        year: Math.max(1, savedState.year || 1),
        totalDaysElapsed: 0,
      };
    }
    EnvironmentSystem.syncCalendarToLegacyFields(savedState);
    FinanceSystem.ensureEconomyState(savedState);

    // Enforce unique monotonic building IDs and canonical maxLevels on load
    const seenIds = new Set<number>();
    let maxExistingId = 0;
    for (const b of savedState.buildings) {
      if (typeof b.id === 'number' && b.id > maxExistingId) maxExistingId = Math.floor(b.id);
    }
    let nextIdCursor = Math.max(
      typeof savedState.nextBuildingId === 'number' && savedState.nextBuildingId > 0
        ? Math.floor(savedState.nextBuildingId)
        : 1,
      maxExistingId + 1
    );
    const idFixedBuildings: typeof savedState.buildings = [];
    for (const b of savedState.buildings) {
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      let bid = typeof b.id === 'number' && b.id > 0 ? Math.floor(b.id) : 0;
      if (bid <= 0 || seenIds.has(bid)) {
        bid = nextIdCursor++;
      }
      seenIds.add(bid);
      if (bid >= nextIdCursor) nextIdCursor = bid + 1;
      b.id = bid;
      b.level = clampBuildingLevel(def, b.level);
      idFixedBuildings.push(b);
    }
    savedState.buildings = idFixedBuildings;
    savedState.nextBuildingId = nextIdCursor;

    this.state = savedState;
    this.chunks = new ChunkManager(savedState.worldSeed);
    this.chunks.setTick(savedState.tick);
    this.chunks.loadPersistedChunks(persistedChunks);

    // Reconcile chunk buildingRef grids: scrub any orphaned ghost refs and stamp surviving buildings
    BuildingSystem.reconcileBuildingRefs(this.state, this.chunks);
    TreeGrowthSystem.backfillFromLoadedChunks(this.state, this.chunks);

    this.syncCityTileCounts();
    this.roadNet.markDirty();
    this.roadNet.recomputeIfDirty(this.chunks, this.state);
    UtilityNetworkSystem.markDirty();
    UtilityNetworkSystem.evaluateNetworks(
      this.state,
      this.chunks,
      EnvironmentSystem.getClimateModifiers(this.state),
      true
    );
    DistrictServiceSystem.prepareTickCache(this.state);
    DistrictServiceSystem.computeWorldServiceCoveragePct(this.state);
    ResourceSystem.recalculateCapacities(this.state);
    CitizenAccounting.reconcileCohorts(this.state);
    FinanceSystem.refreshMacroMetrics(this.state);
    this.citizens.reset();
    this.logistics.reset();
    this.diagCache = null;
    this.simClockSec = 0;
    this.emit({ type: 'STATE_CHANGED' });
  }

  public applyOfflineCatchup(elapsedSeconds: number): OfflineSummary | null {
    if (elapsedSeconds < 30 || this.state.speed === 0) return null;
    // Bounded up to 4 hours at conservative 35% offline efficiency
    const clampedSec = Math.min(4 * 3600, elapsedSeconds);
    const effectiveMin = (clampedSec / 60) * 0.35;
    if (effectiveMin < 0.2) return null;

    const lastLedger = this.state.ledger[this.state.ledger.length - 1];
    const netCoinPerMin = Math.max(0, lastLedger?.net ?? 0);
    const coinsEarned = Math.round(netCoinPerMin * effectiveMin);
    if (coinsEarned > 0) {
      this.state.coins += coinsEarned;
      this.state.stats.totalCoinsEarned += coinsEarned;
    }

    let totalResourcesProduced = 0;
    let topResourceName: string | undefined;
    let topResourceAmount = 0;

    for (const b of this.state.buildings) {
      if (b.status !== 'active') continue;
      const def = BUILDINGS[b.defId];
      if (!def?.recipe) continue;
      // Conservative offline catch-up grants raw & agricultural yields without depleting mines or negative chains
      if (Object.keys(def.recipe.inputs).length > 0 || def.requiredDeposit) continue;
      const mult = getBuildingStatsAtLevel(def, b.level).multiplier;
      const cycles = (effectiveMin * 60) / Math.max(1, def.recipe.cycleSeconds);
      for (const [k, amt] of Object.entries(def.recipe.outputs)) {
        if (!amt) continue;
        const rid = k as ResourceId;
        const added = ResourceSystem.addClamped(this.state, rid, Math.floor(cycles * amt * mult));
        if (added > 0) {
          totalResourcesProduced += added;
          if (added > topResourceAmount) {
            topResourceAmount = added;
            topResourceName = RESOURCES[rid]?.name ?? rid;
          }
        }
      }
    }

    if (coinsEarned <= 0 && totalResourcesProduced <= 0) return null;
    this.emit({ type: 'STATE_CHANGED' });
    return {
      elapsedSeconds: Math.round(clampedSec),
      effectiveMinutes: Math.round(effectiveMin),
      coinsEarned,
      resourcesProduced: totalResourcesProduced,
      topResourceName,
      topResourceAmount,
    };
  }

  public syncCityTileCounts(): void {
    for (const c of this.state.cities) {
      c.unlockedTiles = this.chunks.countUnlockedTilesForCity(c.id);
    }
  }

  public resetNewWorld(cityName = 'Kukus Valley', difficulty: 'standard' | 'relaxed' = 'standard'): void {
    const newSeed = Math.floor(Math.random() * 0x7fffffff) + 1;
    const fresh = CoreEngine.createInitialState(newSeed);
    fresh.settings.cityName = cityName;
    fresh.settings.difficulty = difficulty;
    if (fresh.cities[0]) {
      fresh.cities[0].name = cityName;
    }
    this.state = fresh;
    this.chunks = new ChunkManager(newSeed);
    this.roadNet.markDirty();
    UtilityNetworkSystem.markDirty();
    this.citizens.reset();
    this.logistics.reset();
    this.diagCache = null;
    this.simClockSec = 0;
    this.tickAccumulatorMs = 0;
    this.emit({ type: 'STATE_CHANGED' });
  }

  private advanceClock(simDtSec: number): boolean {
    if (simDtSec <= 0) return false;
    const prevHours = Number.isFinite(this.state.timeOfDayHours) ? this.state.timeOfDayHours : 8.5;
    const prevTotalMins = Math.floor((((prevHours % 24) + 24) % 24) * 60 + 1e-6) % 1440;

    const rawHours = prevHours + simDtSec / IN_GAME_HOUR_SECONDS;
    const daysCrossed = Math.floor(rawHours / 24);
    if (daysCrossed > 0) {
      for (let i = 0; i < daysCrossed; i++) {
        const calRes = EnvironmentSystem.advanceCalendarDay(this.state);
        if (calRes.monthChanged) {
          EconomySystem.onCalendarMonthChanged(this.state);
        }
      }
    }

    this.state.timeOfDayHours = ((rawHours % 24) + 24) % 24;
    const nextTotalMins = Math.floor(this.state.timeOfDayHours * 60 + 1e-6) % 1440;
    return prevTotalMins !== nextTotalMins;
  }

  private collectMovingVehicleTiles(): ReadonlySet<number> {
    const occupied = this.movingVehicleTilesCache;
    occupied.clear();
    for (const rv of this.logistics.roadVehicles) {
      if (rv.state === 'en_route') {
        occupied.add(tileKey(Math.round(rv.gx), Math.round(rv.gy)));
      }
    }
    return occupied;
  }

  public advanceFrame(deltaMs: number): boolean {
    if (this.state.speed === 0) return false;
    const clamped = Math.min(250, Math.max(0, deltaMs));
    const realDtSec = clamped / 1000;
    const simDtSec = realDtSec * this.state.speed;

    // Advance in-game clock: 1 in-game hour = 60s at 1x (4 real min = 4 game hrs; 24 real min = 24h day cycle)
    const clockMinuteChanged = this.advanceClock(simDtSec);

    if (this.state.settings.weatherMode === 'always_clear') {
      this.state.weather = 'clear';
    }

    this.simClockSec += simDtSec;
    this.logistics.update(
      simDtSec,
      this.state,
      this.chunks,
      this.roadNet,
      this.simClockSec,
      (ev) => {
        this.emit({ type: 'AUTO_DELIVERY', gx: ev.gx, gy: ev.gy, label: ev.label, color: ev.color });
      }
    );
    const occupiedVehicles = this.collectMovingVehicleTiles();

    // Smooth 60fps autonomous citizen movement & automated tree/resource collection
    this.citizens.update(
      simDtSec,
      this.state,
      this.chunks,
      {
        onChopHit: (gx, gy, outcome) => {
          if (outcome.cleared) {
            this.state.xp += outcome.xpGained;
          }
          this.emit({
            type: 'CHOP_HIT',
            gx,
            gy,
            cleared: outcome.cleared,
            wood: outcome.woodGained,
            coins: outcome.coinsGained,
            xp: outcome.xpGained,
            fromCitizen: true,
          });
        },
        onAutoDelivery: (gx, gy, label, color) => {
          this.emit({ type: 'AUTO_DELIVERY', gx, gy, label, color });
        },
      },
      occupiedVehicles
    );

    this.drivingViaAdvanceFrame = true;
    this.tickAccumulatorMs += clamped * this.state.speed;
    let ticked = false;
    let safety = 0;
    while (this.tickAccumulatorMs >= 1000 && safety < 5) {
      this.tickAccumulatorMs -= 1000;
      this.stepSimulationTick();
      ticked = true;
      safety++;
    }
    this.drivingViaAdvanceFrame = false;
    if (!ticked && clockMinuteChanged) {
      this.emit({ type: 'STATE_CHANGED' });
    }
    return ticked;
  }

  public stepSimulationTick(): void {
    this.state.tick += 1;
    this.state.stats.playTimeSeconds += 1;
    if (!this.drivingViaAdvanceFrame) {
      this.advanceClock(1);
      this.simClockSec += 1;
      this.logistics.update(1, this.state, this.chunks, this.roadNet, this.simClockSec);
      const occupiedVehicles = this.collectMovingVehicleTiles();
      this.citizens.update(1, this.state, this.chunks, undefined, occupiedVehicles);
    }
    if (this.state.settings.weatherMode === 'always_clear') {
      this.state.weather = 'clear';
    }
    this.chunks.setTick(this.state.tick);

    if (this.state.festivalTicksRemaining > 0) this.state.festivalTicksRemaining -= 1;
    if (this.state.festivalCooldownTicks > 0) this.state.festivalCooldownTicks -= 1;
    if (this.state.emergencyWorkTicksRemaining > 0) this.state.emergencyWorkTicksRemaining -= 1;

    const techMods = TechSystem.getAggregatedModifiers(this.state);
    EnvironmentSystem.tickSeasonAndWeather(this.state);
    const evOut = EnvironmentSystem.tickWorldEvents(this.state);
    if (evOut.startedTitle) {
      this.progression.pushNotification(this.state, 'info', evOut.startedTitle, evOut.startedDesc ?? '');
    }
    const climate = EnvironmentSystem.getClimateModifiers(this.state);

    this.buildingSys.tickConstruction(
      this.state,
      techMods.buildSpeedMult,
      climate.buildSpeedMult,
      (b, xp) => {
        this.state.xp += xp;
        UtilityNetworkSystem.markDirty();
        this.roadNet.invalidateBuildingBoostCache();
        this.emit({
          type: 'BUILDING_COMPLETED',
          buildingId: b.id,
          defId: b.defId,
          gx: b.gx,
          gy: b.gy,
          xp,
        });
      }
    );

    DistrictServiceSystem.prepareTickCache(this.state);
    this.roadNet.recomputeIfDirty(this.chunks, this.state);
    UtilityNetworkSystem.evaluateNetworks(this.state, this.chunks, climate);
    DistrictServiceSystem.computeWorldServiceCoveragePct(this.state);
    if (this.state.tick % 5 === 1) {
      for (const b of this.state.buildings) {
        b.entranceValid = PathfindingSystem.findBuildingEntrance(b, this.chunks, 'citizen') !== null;
      }
    }
    this.populationSys.tickPopulation(this.state, climate.waterDemandMult);
    this.workforce.assignWorkers(this.state, techMods.workerNeedReduction);
    CitizenAccounting.reconcileCohorts(this.state);
    this.productionSys.tickProduction(
      this.state,
      this.chunks,
      this.roadNet,
      this.workforce,
      techMods,
      climate
    );

    const treeRes = TreeGrowthSystem.tick(this.state, this.chunks, climate);
    if (treeRes.maturedCount > 0) {
      this.citizens.invalidateTreeCache();
    }
    EnvironmentSystem.tickEnvironment(this.state, this.chunks, techMods.pollutionReduction);
    EconomySystem.tickEconomy(this.state);

    TechSystem.tickResearch(this.state, techMods, (tech) => {
      this.state.xp += tech.xpReward;
      this.progression.pushNotification(
        this.state,
        'milestone',
        `Researched: ${tech.name}`,
        tech.effectSummary
      );
      this.emit({ type: 'TECH_UNLOCKED', techId: tech.id, name: tech.name });
    });

    this.progression.tickProgression(this.state, (newLevel, reward) => {
      this.emit({ type: 'LEVEL_UP', level: newLevel, rewardCoins: reward });
    });

    this.emit({ type: 'STATE_CHANGED' });
  }

  public dispatch(cmd: GameCommand): CommandResult {
    switch (cmd.type) {
      case 'CHOP_TILE': {
        const mods = TechSystem.getAggregatedModifiers(this.state);
        const dmg = (cmd.isManualTap ? 15 : 10) * mods.chopDamageMult;
        const out = BuildingSystem.chopTile(cmd.gx, cmd.gy, dmg, this.chunks, this.state);
        if (!out.hit) return { ok: false, reason: 'Nothing to harvest on unlocked tile' };
        if (out.cleared) {
          this.citizens.invalidateTreeCache();
          this.state.xp += out.xpGained;
          this.progression.tickProgression(this.state, (lvl, rew) => {
            this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
          });
        }
        this.emit({
          type: 'CHOP_HIT',
          gx: cmd.gx,
          gy: cmd.gy,
          cleared: out.cleared,
          wood: out.woodGained,
          coins: out.coinsGained,
          xp: out.xpGained,
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'REPLANT_TILE': {
        const ok = BuildingSystem.replantTile(cmd.gx, cmd.gy, this.chunks, this.state);
        if (!ok) return { ok: false, reason: 'Cannot plant sapling on unlocked land here' };
        this.citizens.invalidateTreeCache();
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'EXPLORE_RUIN': {
        const res = BuildingSystem.exploreRuin(cmd.gx, cmd.gy, this.chunks, this.state);
        if (!res.ok) return { ok: false, reason: res.reason };
        this.state.xp += res.xp;
        this.progression.pushNotification(
          this.state,
          'milestone',
          'Ancient Ruin Explored',
          `Recovered +${res.coins}C, +${res.rp} RP, +${res.stone} Stone, +${res.wood} Wood!`
        );
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'RUIN_EXPLORED', gx: cmd.gx, gy: cmd.gy, coins: res.coins, rp: res.rp });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'UNLOCK_TILE': {
        if (!this.chunks.canUnlockTile(cmd.gx, cmd.gy)) {
          return { ok: false, reason: 'Must border an already-unlocked tile' };
        }
        const cost = this.chunks.computeUnlockCost(cmd.gx, cmd.gy);
        if (this.state.coins < cost) {
          return { ok: false, reason: `Needs ${cost} Coins` };
        }
        this.state.coins -= cost;
        this.chunks.unlockTile(cmd.gx, cmd.gy, this.state.activeCityId || 1);
        this.state.stats.unlockedTiles += 1;
        this.syncCityTileCounts();
        this.citizens.invalidateTreeCache();
        this.state.xp += 12;
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'TILE_UNLOCKED', gx: cmd.gx, gy: cmd.gy });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'UNLOCK_BATCH_FRONTIER': {
        let unlockedAny = 0;
        const ownerCity = this.state.activeCityId || 1;
        // Two passes so radial cluster unlocks outward cleanly
        for (let pass = 0; pass < 2; pass++) {
          for (let dy = -cmd.radius; dy <= cmd.radius; dy++) {
            for (let dx = -cmd.radius; dx <= cmd.radius; dx++) {
              const tx = cmd.centerGx + dx;
              const ty = cmd.centerGy + dy;
              if (!this.chunks.canUnlockTile(tx, ty)) continue;
              const cost = this.chunks.computeUnlockCost(tx, ty);
              if (this.state.coins < cost) continue;
              this.state.coins -= cost;
              this.chunks.unlockTile(tx, ty, ownerCity);
              this.state.stats.unlockedTiles += 1;
              this.state.xp += 12;
              unlockedAny++;
              this.emit({ type: 'TILE_UNLOCKED', gx: tx, gy: ty });
            }
          }
        }
        if (unlockedAny === 0) return { ok: false, reason: 'No affordable frontier tiles in range' };
        this.syncCityTileCounts();
        this.citizens.invalidateTreeCache();
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'UNLOCK_CHUNK': {
        if (!this.chunks.canUnlockChunk(cmd.cx, cmd.cy)) {
          return { ok: false, reason: 'Chunk must border an already-unlocked tile' };
        }
        const quote = this.chunks.getChunkUnlockCost(cmd.cx, cmd.cy);
        if (quote.lockedCount === 0) {
          return { ok: false, reason: 'Chunk is already fully unlocked' };
        }
        if (this.state.coins < quote.cost) {
          return { ok: false, reason: `Needs ${quote.cost} Coins to unlock chunk` };
        }
        this.state.coins -= quote.cost;
        const added = this.chunks.unlockChunk(cmd.cx, cmd.cy, this.state.activeCityId || 1);
        this.state.stats.unlockedTiles += added;
        this.syncCityTileCounts();
        this.citizens.invalidateTreeCache();
        this.state.xp += added * 6;
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'TILE_UNLOCKED', gx: cmd.cx * 16 + 8, gy: cmd.cy * 16 + 8 });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'PLACE_BUILDING': {
        const res = this.buildingSys.placeBuilding(
          cmd.defId,
          cmd.gx,
          cmd.gy,
          this.state,
          this.chunks,
          this.roadNet,
          cmd.rotation ?? 0,
          cmd.targetLevel
        );
        if (!res.ok || !res.building) return { ok: false, reason: res.reason };
        UtilityNetworkSystem.markDirty();
        this.roadNet.invalidateBuildingBoostCache();
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({
          type: 'BUILDING_PLACED',
          buildingId: res.building.id,
          defId: cmd.defId,
          gx: cmd.gx,
          gy: cmd.gy,
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'MOVE_BUILDING': {
        const res = this.buildingSys.moveBuilding(
          cmd.buildingId,
          cmd.gx,
          cmd.gy,
          this.state,
          this.chunks,
          this.roadNet,
          cmd.rotation
        );
        if (!res.ok || !res.building) return { ok: false, reason: res.reason };
        TreePlantationSystem.onMoveBuilding(res.building, this.state, this.chunks);
        UtilityNetworkSystem.markDirty();
        this.roadNet.invalidateBuildingBoostCache();
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({
          type: 'BUILDING_MOVED',
          buildingId: res.building.id,
          defId: res.building.defId,
          gx: cmd.gx,
          gy: cmd.gy,
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'PLACE_ROAD': {
        const res = this.buildingSys.placeRoad(
          cmd.roadType,
          cmd.gx,
          cmd.gy,
          this.state,
          this.chunks,
          this.roadNet
        );
        if (!res.ok) return { ok: false, reason: res.reason };
        UtilityNetworkSystem.markDirty();
        UtilityNetworkSystem.evaluateNetworks(
          this.state,
          this.chunks,
          EnvironmentSystem.getClimateModifiers(this.state),
          true
        );
        this.state.xp += res.xpGained;
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'ROAD_PLACED', gx: cmd.gx, gy: cmd.gy });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'REMOVE_ROAD': {
        const res = this.buildingSys.removeRoad(
          cmd.gx,
          cmd.gy,
          this.state,
          this.chunks,
          this.roadNet
        );
        if (!res.ok) return { ok: false, reason: res.reason };
        UtilityNetworkSystem.markDirty();
        UtilityNetworkSystem.evaluateNetworks(
          this.state,
          this.chunks,
          EnvironmentSystem.getClimateModifiers(this.state),
          true
        );
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'ROAD_REMOVED', gx: cmd.gx, gy: cmd.gy, refundCoins: res.refundCoins });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'SET_ROAD_DIRECTION': {
        if (!this.chunks.isUnlocked(cmd.gx, cmd.gy)) {
          return { ok: false, reason: 'Unlock tile first before changing lane direction' };
        }
        const ok = this.chunks.setRoadDirection(cmd.gx, cmd.gy, cmd.direction);
        if (!ok) {
          return { ok: false, reason: 'No road on this tile' };
        }
        this.roadNet.markDirty();
        this.roadNet.recomputeIfDirty(this.chunks, this.state);
        this.emit({ type: 'ROAD_PLACED', gx: cmd.gx, gy: cmd.gy });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'UPGRADE_BUILDING': {
        const res = this.buildingSys.upgradeBuilding(cmd.buildingId, this.state);
        if (!res.ok) return { ok: false, reason: res.reason };
        const upgB = this.state.buildings.find((item) => item.id === cmd.buildingId);
        if (upgB && BUILDINGS[upgB.defId]?.isAutomatedTreePlantation) {
          TreePlantationSystem.ensurePlantationState(upgB, this.state);
        }
        UtilityNetworkSystem.markDirty();
        this.roadNet.invalidateBuildingBoostCache();
        this.workforce.assignWorkers(
          this.state,
          TechSystem.getAggregatedModifiers(this.state).workerNeedReduction
        );
        this.state.xp += res.xpGained;
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'UPGRADE_BLUEPRINT': {
        const def = BUILDINGS[cmd.defId];
        if (!def) return { ok: false, reason: 'Unknown building' };
        this.state.unlockedBuildingLevels ??= {};
        const maxLvl = getEffectiveMaxLevel(def);
        const curLevel = Math.min(maxLvl, Math.max(1, this.state.unlockedBuildingLevels[cmd.defId] ?? 1));
        if (curLevel >= maxLvl) {
          return { ok: false, reason: `${def.name} blueprint is already max Lv.${maxLvl}` };
        }
        const cost = Math.max(100, Math.round(def.coinCost * 1.25 * curLevel));
        if (this.state.coins < cost) {
          return { ok: false, reason: `Needs ${cost} Coins to upgrade ${def.name} blueprint` };
        }
        this.state.coins -= cost;
        this.state.unlockedBuildingLevels[cmd.defId] = curLevel + 1;
        this.state.xp += 30;
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'RUSH_CONSTRUCTION': {
        const res = this.buildingSys.rushConstruction(cmd.buildingId, this.state);
        if (!res.ok || !res.building) return { ok: false, reason: res.reason };
        UtilityNetworkSystem.markDirty();
        this.roadNet.invalidateBuildingBoostCache();
        this.state.xp += res.xpGained;
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({
          type: 'BUILDING_COMPLETED',
          buildingId: res.building.id,
          defId: res.building.defId,
          gx: res.building.gx,
          gy: res.building.gy,
          xp: res.xpGained,
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'BUY_MISSING_FOR_BUILDING': {
        const req = BuildingSystem.getGlobalBuildRequirements(cmd.defId, this.state);
        if (req.missingMaterials.length === 0) {
          return { ok: false, reason: 'You already have all required materials' };
        }
        const items = req.missingMaterials.map((m) => ({
          resourceId: m.resourceId,
          amount: m.missing,
        }));
        const res = EconomySystem.buyMissingMaterials(
          this.state,
          items,
          cmd.allowEmergency ?? true
        );
        if (!res.ok) return { ok: false, reason: res.reason };
        this.progression.pushNotification(
          this.state,
          'info',
          'Materials Delivered',
          `Purchased missing supplies for ${res.cost} Coins.`
        );
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'CLEAR_AREA_OBSTACLES': {
        let clearedAny = 0;
        for (const t of cmd.tiles) {
          if (!this.chunks.isUnlocked(t.gx, t.gy)) continue;
          const info = this.inspectTile(t.gx, t.gy);
          if (info.featureType === FeatureType.None) continue;
          if (info.featureType === FeatureType.AncientRuin) {
            const ruinRes = BuildingSystem.exploreRuin(t.gx, t.gy, this.chunks, this.state);
            if (ruinRes.ok) {
              this.state.xp += ruinRes.xp;
              this.emit({ type: 'RUIN_EXPLORED', gx: t.gx, gy: t.gy, coins: ruinRes.coins, rp: ruinRes.rp });
              clearedAny++;
            }
          } else {
            const out = BuildingSystem.chopTile(t.gx, t.gy, 999, this.chunks, this.state);
            if (out.hit) {
              this.state.xp += out.xpGained;
              this.emit({
                type: 'CHOP_HIT',
                gx: t.gx,
                gy: t.gy,
                cleared: out.cleared,
                wood: out.woodGained,
                coins: out.coinsGained,
                xp: out.xpGained,
              });
              clearedAny++;
            }
          }
        }
        if (clearedAny === 0) return { ok: false, reason: 'No unlocked obstacles on footprint' };
        this.citizens.invalidateTreeCache();
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'DEMOLISH_BUILDING': {
        const ok = this.buildingSys.demolishBuilding(cmd.buildingId, this.state, this.chunks);
        if (!ok) return { ok: false, reason: 'Cannot demolish' };
        TreePlantationSystem.onDemolishBuilding(cmd.buildingId, this.state);
        UtilityNetworkSystem.markDirty();
        this.roadNet.invalidateBuildingBoostCache();
        this.workforce.assignWorkers(this.state);
        CitizenAccounting.reconcileCohorts(this.state);
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'TOGGLE_BUILDING': {
        const b = this.state.buildings.find((item) => item.id === cmd.buildingId);
        if (!b) return { ok: false };
        b.enabled = !b.enabled;
        if (b.status !== 'constructing') {
          b.status = b.enabled ? 'active' : 'disabled';
        }
        UtilityNetworkSystem.markDirty();
        this.roadNet.invalidateBuildingBoostCache();
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'RESUME_ALL_BUILDINGS': {
        let resumed = 0;
        for (const b of this.state.buildings) {
          if (!b.enabled) {
            b.enabled = true;
            if (b.status === 'disabled') b.status = 'active';
            resumed++;
          }
        }
        if (resumed === 0) return { ok: false, reason: 'No paused buildings' };
        UtilityNetworkSystem.markDirty();
        this.roadNet.invalidateBuildingBoostCache();
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'SET_BUILDING_WORKERS': {
        const b = this.state.buildings.find((item) => item.id === cmd.buildingId);
        if (!b) return { ok: false };
        const maxCap = this.workforce.getEffectiveMaxWorkers(
          b,
          TechSystem.getAggregatedModifiers(this.state).workerNeedReduction
        );
        if (maxCap <= 0) return { ok: false, reason: 'Building does not employ workers' };
        b.lockedWorkers =
          cmd.lockedWorkers === null
            ? null
            : Math.max(0, Math.min(maxCap, cmd.lockedWorkers));
        this.workforce.assignWorkers(this.state, TechSystem.getAggregatedModifiers(this.state).workerNeedReduction);
        CitizenAccounting.reconcileCohorts(this.state);
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'SET_WORKFORCE_PRIORITY': {
        this.state.workforcePriorities[cmd.category] = Math.max(1, Math.min(5, cmd.priority));
        this.workforce.assignWorkers(this.state, TechSystem.getAggregatedModifiers(this.state).workerNeedReduction);
        CitizenAccounting.reconcileCohorts(this.state);
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'SET_WORKFORCE_AUTO': {
        this.state.workforceAutoAssign = cmd.enabled;
        this.workforce.assignWorkers(this.state, TechSystem.getAggregatedModifiers(this.state).workerNeedReduction);
        CitizenAccounting.reconcileCohorts(this.state);
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'RECRUIT_WORKERS': {
        const count = Math.max(1, Math.min(25, Math.floor(cmd.count)));
        const room = Math.max(0, this.state.population.capacity - this.state.population.total);
        if (room <= 0) {
          return { ok: false, reason: 'No spare housing capacity — build or upgrade homes first' };
        }
        const actual = Math.min(count, room);
        const cost = actual * 18;
        if (this.state.coins < cost) {
          return { ok: false, reason: `Needs ${cost} Coins to recruit ${actual} workers` };
        }
        this.state.coins -= cost;
        this.state.population.total += actual;
        if (this.state.population.total > this.state.stats.maxPopulation) {
          this.state.stats.maxPopulation = this.state.population.total;
        }
        this.workforce.assignWorkers(this.state, TechSystem.getAggregatedModifiers(this.state).workerNeedReduction);
        CitizenAccounting.reconcileCohorts(this.state);
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'DISPATCH_EMERGENCY_WORKERS': {
        if ((this.state.emergencyWorkTicksRemaining ?? 0) > 0) {
          return { ok: false, reason: `Emergency shift active (${this.state.emergencyWorkTicksRemaining}s left)` };
        }
        const cost = 60;
        if (this.state.coins < cost) {
          return { ok: false, reason: `Needs ${cost} Coins for emergency shift dispatch` };
        }
        this.state.coins -= cost;
        this.state.emergencyWorkTicksRemaining = 45;
        this.workforce.assignWorkers(this.state, TechSystem.getAggregatedModifiers(this.state).workerNeedReduction);
        CitizenAccounting.reconcileCohorts(this.state);
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'SET_TAX_RATE': {
        this.state.taxRate = Math.max(0.5, Math.min(2.0, cmd.rate));
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'TOGGLE_POLICY': {
        const pDef = POLICY_MAP[cmd.policyId];
        if (!pDef) return { ok: false, reason: 'Unknown policy' };
        if (this.state.level < pDef.unlockLevel) {
          return { ok: false, reason: `Requires Level ${pDef.unlockLevel}` };
        }
        this.state.activePolicies ??= [];
        const idx = this.state.activePolicies.indexOf(cmd.policyId);
        if (idx >= 0) {
          this.state.activePolicies.splice(idx, 1);
        } else {
          this.state.activePolicies.push(cmd.policyId);
        }
        UtilityNetworkSystem.markDirty();
        this.roadNet.invalidateBuildingBoostCache();
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'START_FESTIVAL': {
        if ((this.state.festivalTicksRemaining ?? 0) > 0) {
          return { ok: false, reason: 'Festival already underway' };
        }
        if ((this.state.festivalCooldownTicks ?? 0) > 0) {
          return { ok: false, reason: `Cooldown: ${this.state.festivalCooldownTicks}s remaining` };
        }
        const baseCost = 120 + this.state.population.total * 3;
        const hasPlaza = this.state.buildings.some(
          (b) => b.defId === 'festival_plaza' && b.status !== 'constructing'
        );
        const cost = hasPlaza ? Math.round(baseCost * 0.5) : baseCost;
        if (this.state.coins < cost) {
          return { ok: false, reason: `Needs ${cost} Coins to host Festival` };
        }
        this.state.coins -= cost;
        this.state.festivalTicksRemaining = 60;
        this.state.festivalCooldownTicks = 120;
        this.state.stats.festivalsHeld += 1;
        this.state.xp += 35;
        this.progression.pushNotification(
          this.state,
          'milestone',
          'City Festival Launched',
          '+15..22 Happiness, +50% Tax revenue, and +35% growth for 60s!'
        );
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'FESTIVAL_STARTED' });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'BUY_RESOURCE': {
        const res = EconomySystem.buyResource(this.state, cmd.resourceId, cmd.amount);
        if (res.ok) {
          this.progression.tickProgression(this.state, (lvl, rew) => {
            this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
          });
        }
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: res.ok, reason: res.reason };
      }

      case 'SELL_RESOURCE': {
        const res = EconomySystem.sellResource(this.state, cmd.resourceId, cmd.amount);
        if (res.ok) {
          this.progression.tickProgression(this.state, (lvl, rew) => {
            this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
          });
        }
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: res.ok, reason: res.reason };
      }

      case 'SELL_ALL_EXCESS': {
        const res = EconomySystem.sellAllExcess(this.state, cmd.keepAmount);
        if (res.ok) {
          this.progression.pushNotification(
            this.state,
            'info',
            'Bulk Export Complete',
            `Sold ${res.itemsSold} surplus goods for +${res.totalEarned} Coins.`
          );
          this.progression.tickProgression(this.state, (lvl, rew) => {
            this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
          });
        }
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: res.ok, reason: res.reason };
      }

      case 'SELL_EXCESS_BY_PCT': {
        const res = EconomySystem.sellExcessByPct(this.state, cmd.keepPct);
        if (res.ok) {
          this.progression.pushNotification(
            this.state,
            'info',
            `Balanced Storage (${cmd.keepPct}% Cap)`,
            `Sold ${res.itemsSold} surplus units for +${res.totalEarned} Coins.`
          );
          this.progression.tickProgression(this.state, (lvl, rew) => {
            this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
          });
        }
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: res.ok, reason: res.reason };
      }

      case 'SET_AUTO_TRADE': {
        this.state.autoTradeRules[cmd.rule.resourceId] = cmd.rule;
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'CONVERT_CURRENCY': {
        const res = EconomySystem.convertCurrency(this.state, cmd.direction, cmd.amount);
        if (!res.ok) return { ok: false, reason: res.reason };
        FinanceSystem.refreshMacroMetrics(this.state);
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'START_TECH': {
        const res = TechSystem.startTech(this.state, cmd.techId);
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'STATE_CHANGED' });
        return res;
      }

      case 'SET_SPEED': {
        this.state.speed = cmd.speed;
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'SET_TIME_OF_DAY': {
        if (!Number.isFinite(cmd.hours)) return { ok: false, reason: 'Invalid hour' };
        this.state.timeOfDayHours = ((cmd.hours % 24) + 24) % 24;
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'UPDATE_SETTINGS': {
        this.state.settings = { ...this.state.settings, ...cmd.partial };
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'SET_CAMERA': {
        this.state.camera = { x: cmd.x, y: cmd.y, zoom: cmd.zoom };
        return { ok: true };
      }

      case 'SET_TRACKED_QUEST': {
        this.state.trackedQuestId = cmd.questId;
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'TERRAFORM_TILE': {
        const cost = 75;
        if (this.state.coins < cost) {
          return { ok: false, reason: `Needs ${cost} Coins to terraform` };
        }
        const pre = this.chunks.terraformTile(cmd.gx, cmd.gy, cmd.action, false);
        if (!pre.ok) {
          if (pre.needsConfirm && cmd.confirmDemolish) {
            const { chunk, index } = this.chunks.getTile(cmd.gx, cmd.gy);
            if (pre.blocker === 'building' && chunk.buildingRef[index] !== -1) {
              const victimId = chunk.buildingRef[index];
              this.buildingSys.demolishBuilding(victimId, this.state, this.chunks);
              TreePlantationSystem.onDemolishBuilding(victimId, this.state);
            }
            if (chunk.roadType[index] !== 0) {
              this.buildingSys.removeRoad(cmd.gx, cmd.gy, this.state, this.chunks, this.roadNet);
            }
            const retry = this.chunks.terraformTile(cmd.gx, cmd.gy, cmd.action, true);
            if (!retry.ok) return { ok: false, reason: retry.reason };
          } else {
            return { ok: false, reason: pre.reason, needsConfirm: pre.needsConfirm };
          }
        }
        if (cmd.action === 'to_water') {
          TreeGrowthSystem.removeAt(this.state, cmd.gx, cmd.gy);
        }
        this.state.coins -= cost;
        this.state.xp += 15;
        this.roadNet.markDirty();
        this.roadNet.recomputeIfDirty(this.chunks, this.state);
        UtilityNetworkSystem.markDirty();
        UtilityNetworkSystem.evaluateNetworks(
          this.state,
          this.chunks,
          EnvironmentSystem.getClimateModifiers(this.state),
          true
        );
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'CREATE_CITY': {
        const trimmed = cmd.name.trim();
        if (!trimmed) return { ok: false, reason: 'City name cannot be empty' };
        const palette = ['#f59e0b', '#38bdf8', '#a3e635', '#f472b6', '#c084fc', '#fb7185'];
        const id = this.state.nextCityId++;
        const city = {
          id,
          name: trimmed.slice(0, 28),
          color: cmd.color ?? palette[(id - 1) % palette.length],
          createdTick: this.state.tick,
          taxRate: 1.0,
          unlockedTiles: 0,
        };
        this.state.cities.push(city);
        this.state.activeCityId = id;
        this.state.settings.cityName = city.name;
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'RENAME_CITY': {
        const trimmed = cmd.name.trim();
        if (!trimmed) return { ok: false, reason: 'City name cannot be empty' };
        const city = this.state.cities.find((c) => c.id === cmd.cityId);
        if (!city) return { ok: false, reason: 'City not found' };
        city.name = trimmed.slice(0, 28);
        if (this.state.activeCityId === city.id) {
          this.state.settings.cityName = city.name;
        }
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'SET_ACTIVE_CITY': {
        const city = this.state.cities.find((c) => c.id === cmd.cityId);
        if (!city) return { ok: false, reason: 'City not found' };
        this.state.activeCityId = city.id;
        this.state.settings.cityName = city.name;
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'ASSIGN_TILE_CITY_ZONE': {
        if (!this.chunks.isUnlocked(cmd.gx, cmd.gy)) {
          return { ok: false, reason: 'Tile must be unlocked before assigning city or zone' };
        }
        if (cmd.cityId !== undefined) {
          const cityExists = this.state.cities.some((c) => c.id === cmd.cityId);
          if (!cityExists) return { ok: false, reason: 'Target city does not exist' };
          const { chunk, index } = this.chunks.getTile(cmd.gx, cmd.gy);
          if (chunk.buildingRef[index] !== -1) {
            return { ok: false, reason: 'Cannot reassign city ownership underneath an existing building' };
          }
          this.chunks.setTileCityId(cmd.gx, cmd.gy, cmd.cityId);
          this.syncCityTileCounts();
        }
        if (cmd.zoneType !== undefined) {
          this.chunks.setTileZone(cmd.gx, cmd.gy, ZONE_TYPE_TO_ID[cmd.zoneType]);
        }
        CitizenAccounting.reconcileCohorts(this.state);
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'SET_UTILITY_TILE': {
        if (!this.chunks.isUnlocked(cmd.gx, cmd.gy)) {
          return { ok: false, reason: 'Tile must be unlocked before modifying utilities' };
        }
        this.chunks.setTileUtilityFlag(cmd.gx, cmd.gy, cmd.flag, cmd.enabled);
        UtilityNetworkSystem.markDirty();
        UtilityNetworkSystem.evaluateNetworks(
          this.state,
          this.chunks,
          EnvironmentSystem.getClimateModifiers(this.state),
          true
        );
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'PLACE_UTILITY': {
        const res = UtilityNetworkSystem.placeUtility(cmd.kind, cmd.gx, cmd.gy, this.state, this.chunks);
        if (!res.ok) return res;
        UtilityNetworkSystem.markDirty();
        UtilityNetworkSystem.evaluateNetworks(
          this.state,
          this.chunks,
          EnvironmentSystem.getClimateModifiers(this.state),
          true
        );
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'REMOVE_UTILITY': {
        const res = UtilityNetworkSystem.removeUtility(cmd.kind, cmd.gx, cmd.gy, this.state, this.chunks);
        if (!res.ok) return res;
        UtilityNetworkSystem.markDirty();
        UtilityNetworkSystem.evaluateNetworks(
          this.state,
          this.chunks,
          EnvironmentSystem.getClimateModifiers(this.state),
          true
        );
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'UNLOCK_RECTANGLE': {
        const quote = this.chunks.getRectangleUnlockQuote(cmd.startGx, cmd.startGy, cmd.width, cmd.height);
        if (!quote.valid) return { ok: false, reason: quote.reason };
        if (this.state.coins < quote.totalCost) {
          return { ok: false, reason: `Needs ${quote.totalCost} Coins to purchase ${quote.toUnlockCount} tiles` };
        }
        this.state.coins -= quote.totalCost;
        const added = this.chunks.unlockRectangle(
          cmd.startGx,
          cmd.startGy,
          cmd.width,
          cmd.height,
          this.state.activeCityId || 1
        );
        this.state.stats.unlockedTiles += added;
        this.syncCityTileCounts();
        this.citizens.invalidateTreeCache();
        this.state.xp += added * 8;
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({
          type: 'TILE_UNLOCKED',
          gx: cmd.startGx + Math.floor(cmd.width / 2),
          gy: cmd.startGy + Math.floor(cmd.height / 2),
        });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'BUILD_ROAD_GRID': {
        const res = this.buildingSys.buildRoadGrid(
          cmd.startGx,
          cmd.startGy,
          cmd.width,
          cmd.height,
          cmd.spacing,
          cmd.roadType,
          this.state,
          this.chunks,
          this.roadNet
        );
        if (!res.ok) return { ok: false, reason: res.reason };
        UtilityNetworkSystem.markDirty();
        UtilityNetworkSystem.evaluateNetworks(
          this.state,
          this.chunks,
          EnvironmentSystem.getClimateModifiers(this.state),
          true
        );
        this.state.xp += res.xpGained;
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'ROAD_PLACED', gx: cmd.startGx, gy: cmd.startGy });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'UPGRADE_CONNECTED_ROADS': {
        const res = this.buildingSys.upgradeConnectedRoadNetwork(
          cmd.gx,
          cmd.gy,
          cmd.targetRoadType,
          this.state,
          this.chunks,
          this.roadNet
        );
        if (!res.ok) return { ok: false, reason: res.reason };
        UtilityNetworkSystem.markDirty();
        UtilityNetworkSystem.evaluateNetworks(
          this.state,
          this.chunks,
          EnvironmentSystem.getClimateModifiers(this.state),
          true
        );
        this.state.xp += res.xpGained;
        this.progression.tickProgression(this.state, (lvl, rew) => {
          this.emit({ type: 'LEVEL_UP', level: lvl, rewardCoins: rew });
        });
        this.emit({ type: 'ROAD_PLACED', gx: cmd.gx, gy: cmd.gy });
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'PAINT_TERRAIN_BRUSH': {
        const r = Math.max(0, Math.min(6, Math.floor(cmd.radius)));
        if (cmd.brush === 'unlock') {
          let unlockedAny = 0;
          const ownerCity = this.state.activeCityId || 1;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              if (r > 0 && dx * dx + dy * dy > r * r + 0.5) continue;
              const tx = cmd.gx + dx;
              const ty = cmd.gy + dy;
              if (!this.chunks.canUnlockTile(tx, ty)) continue;
              const cost = this.chunks.computeUnlockCost(tx, ty);
              if (this.state.coins < cost) continue;
              this.state.coins -= cost;
              this.chunks.unlockTile(tx, ty, ownerCity);
              this.state.stats.unlockedTiles += 1;
              this.state.xp += 12;
              unlockedAny++;
              this.emit({ type: 'TILE_UNLOCKED', gx: tx, gy: ty });
            }
          }
          if (unlockedAny === 0) return { ok: false, reason: 'No affordable frontier tiles in brush' };
          this.syncCityTileCounts();
          this.citizens.invalidateTreeCache();
          this.emit({ type: 'STATE_CHANGED' });
          return { ok: true };
        }

        if (cmd.brush === 'water' || cmd.brush === 'land') {
          const terraResult = this.chunks.applyTerrainBrush(cmd.gx, cmd.gy, r, cmd.brush);
          if (terraResult.changed === 0) {
            if (terraResult.skippedMountains > 0) {
              return { ok: false, reason: 'Mountains cannot be terraformed' };
            }
            return { ok: false, reason: 'No unlocked empty land/water tiles in brush range' };
          }
          const cost = terraResult.changed * 45;
          if (this.state.coins >= cost) this.state.coins -= cost;
          this.roadNet.markDirty();
          this.roadNet.recomputeIfDirty(this.chunks, this.state);
          this.emit({ type: 'STATE_CHANGED' });
          return { ok: true };
        }

        const zId = cmd.zoneType ? ZONE_TYPE_TO_ID[cmd.zoneType] : 0;
        const brushRes = this.chunks.applyTerrainBrush(
          cmd.gx,
          cmd.gy,
          r,
          cmd.brush,
          zId
        );
        if (brushRes.changed === 0) {
          return { ok: false, reason: 'No matching tiles in brush radius' };
        }
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'TOGGLE_ZONE_BORDERS': {
        this.state.showZoneBorders = cmd.enabled;
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }

      case 'TOGGLE_LAND_MODE': {
        this.state.landModeActive = cmd.enabled;
        this.emit({ type: 'STATE_CHANGED' });
        return { ok: true };
      }
    }
  }

  public inspectTile(gx: number, gy: number): TileInspection {
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = this.chunks.getOrCreateChunk(cx, cy);
    const biomeId = chunk.biomeId[index] as BiomeId;
    const unlocked = (chunk.flags[index] & TileFlag.Unlocked) !== 0;
    const featureType = chunk.featureType[index] as FeatureType;
    const species = TREE_SPECIES[featureType];
    const bRef = chunk.buildingRef[index];
    let building = bRef >= 0 ? this.state.buildings.find((b) => b.id === bRef) ?? null : null;
    if (bRef >= 0 && !building) {
      chunk.buildingRef[index] = -1;
      this.chunks.markChunkModified(cx, cy);
    }
    const cityId = unlocked ? (chunk.cityRef[index] > 0 ? chunk.cityRef[index] : 1) : 0;
    const cityName = cityId > 0 ? (this.state.cities.find((c) => c.id === cityId)?.name ?? `City #${cityId}`) : 'Wilderness';
    const zoneType = ZONE_ID_TO_TYPE[chunk.zoneType[index]] ?? 'none';

    const hasRoad = chunk.roadType[index] !== 0;

    return {
      gx,
      gy,
      biomeId,
      biomeName: BIOME_NAMES[biomeId] ?? 'Wilderness',
      elevation: chunk.elevation[index],
      moisture: chunk.moisture[index],
      unlocked,
      canUnlock: !unlocked && this.chunks.isAdjacentToUnlocked(gx, gy),
      unlockCost: this.chunks.computeUnlockCost(gx, gy),
      featureType,
      featureHp: chunk.featureHp[index],
      featureMaxHp: species?.maxHp ?? 0,
      depositType: chunk.depositType[index],
      depositQty: chunk.depositQty[index],
      roadType: chunk.roadType[index],
      building,
      pollution: chunk.pollution[index],
      cityId,
      cityName,
      zoneType,
      utilityNet: chunk.utilityNet[index],
      roadDirection: hasRoad ? this.chunks.getRoadDirection(gx, gy) : undefined,
      roadClusterId: hasRoad ? this.roadNet.getRoadClusterId(gx, gy) : 0,
      roadIntersectionKind: hasRoad ? this.roadNet.getIntersectionKind(gx, gy, this.chunks) : 'none',
      roadCongestion: hasRoad ? this.roadNet.getTileCongestion(gx, gy) : 0,
      roadDisconnected: hasRoad ? this.roadNet.isRoadDisconnected(gx, gy) : false,
    };
  }

  public getNetworkDiagnostics(force = false): NetworkDiagnosticsReport {
    let blockedAlertCount = 0;
    for (let i = 0; i < this.logistics.roadVehicles.length; i++) {
      if (this.logistics.roadVehicles[i].blockedSec >= 4.0) blockedAlertCount++;
    }
    const routeDiagCount = this.logistics.getRouteDiagnostics().length;
    const key = `${this.roadNet.networkVersion}:${UtilityNetworkSystem.getEvalVersion()}:${this.state.buildings.length}:${blockedAlertCount}:${routeDiagCount}`;

    if (
      !force &&
      this.diagCache !== null &&
      this.diagCacheKey === key &&
      Math.abs(this.simClockSec - this.diagCacheClockSec) < 2.0
    ) {
      return this.diagCache;
    }

    this.diagCache = NetworkDiagnosticsSystem.analyze(this.state, this.chunks, this.roadNet, this.logistics);
    this.diagCacheKey = key;
    this.diagCacheClockSec = this.simClockSec;
    return this.diagCache;
  }
}
