import { BUILDINGS } from '../data/buildings.data';
import { FeatureType, isMatureTreeFeature } from '../data/trees.data';
import type { ChunkManager } from '../core/ChunkManager';
import { BuildingInstance, TileFlag, WorldEngineState } from '../core/GameState';
import { CHUNK_SIZE, localTileIndex, tileKey } from '../core/IsoMath';
import { BuildingSystem } from './BuildingSystem';
import { ResourceSystem } from './ResourceSystem';
import { ROADS, RoadType } from '../data/roads.data';
import { GridPoint, PathfindingSystem, TransportMode } from './PathfindingSystem';

export type ChopOutcome = ReturnType<typeof BuildingSystem.chopTile>;

import { resolveBuildingProfession } from './StatisticsSystem';

export type CitizenVisualRole =
  | 'normal'
  | 'laborer'
  | 'artisan'
  | 'engineer'
  | 'child'
  | 'gov_officer'
  | 'police'
  | 'executive'
  | 'office_worker'
  | 'factory_worker'
  | 'farmer'
  | 'fisherman'
  | 'construction_worker'
  | 'student'
  | 'teacher'
  | 'doctor'
  | 'nurse'
  | 'firefighter'
  | 'shopkeeper'
  | 'chef'
  | 'miner'
  | 'forester'
  | 'courier'
  | 'tourist'
  | 'teenager'
  | 'adult'
  | 'elderly';

export type CitizenTask =
  | 'idle_stroll'
  | 'idle_rest'
  | 'walk_to_tree'
  | 'chopping'
  | 'walk_to_work'
  | 'working'
  | 'carrying_home';

export type CargoKind = 'none' | 'wood' | 'food' | 'stone' | 'goods';

export interface CitizenAgent {
  id: number;
  role: CitizenVisualRole;
  homeBuildingId: number | null;
  workBuildingId: number | null;
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  goalGx: number;
  goalGy: number;
  path: GridPoint[];
  pathMode: TransportMode;
  task: CitizenTask;
  carrying: CargoKind;
  taskTimer: number;
  stridePhase: number;
  facing: 1 | -1;
  targetTileGx: number;
  targetTileGy: number;
}

export interface CitizenWorkEvents {
  onChopHit: (gx: number, gy: number, outcome: ChopOutcome) => void;
  onAutoDelivery: (gx: number, gy: number, label: string, color: string) => void;
}

const CROWD_CAP_BY_SETTING: Record<'auto' | 'low' | 'medium' | 'high', number> = {
  low: 16,
  medium: 32,
  auto: 44,
  high: 64,
};

export class CitizenSystem {
  public readonly agents: CitizenAgent[] = [];
  private nextAgentId = 1;
  private syncTimer = 0;
  private cachedTrees: GridPoint[] = [];
  private treeCacheTick = -999;
  private aStarBudgetThisFrame = 4;

  // Per-frame lightweight lookup caches (eliminate state.buildings.find inside 64-agent loops)
  private buildingByIdCache = new Map<number, BuildingInstance>();
  private entranceCache = new Map<number, GridPoint | null>();
  private cachedDropoff: BuildingInstance | undefined = undefined;
  private cachedPark: BuildingInstance | undefined = undefined;
  private cachedOpenWorkplace: BuildingInstance | undefined = undefined;

  public invalidateTreeCache(): void {
    this.treeCacheTick = -999;
    this.cachedTrees = [];
  }

  public reset(): void {
    this.agents.length = 0;
    this.nextAgentId = 1;
    this.syncTimer = 0;
    this.cachedTrees = [];
    this.treeCacheTick = -999;
    this.buildingByIdCache.clear();
    this.entranceCache.clear();
  }

  private refreshFrameCaches(state: WorldEngineState): void {
    this.buildingByIdCache.clear();
    this.entranceCache.clear();
    this.cachedDropoff = undefined;
    this.cachedPark = undefined;
    this.cachedOpenWorkplace = undefined;

    for (let i = 0; i < state.buildings.length; i++) {
      const b = state.buildings[i];
      this.buildingByIdCache.set(b.id, b);
      if (b.status === 'constructing') continue;
      if (
        !this.cachedDropoff &&
        (BUILDINGS[b.defId]?.category === 'storage' ||
          b.defId === 'market_stall' ||
          b.defId === 'main_town_hall' ||
          b.defId === 'sub_town_hall')
      ) {
        this.cachedDropoff = b;
      }
      if (!this.cachedPark && (b.defId === 'village_park' || b.defId === 'school')) {
        this.cachedPark = b;
      }
      if (!this.cachedOpenWorkplace && b.status === 'active' && b.enabled && b.assignedWorkers > 0 && b.entranceValid !== false) {
        this.cachedOpenWorkplace = b;
      }
    }
  }

  private getCachedEntrance(b: BuildingInstance, chunks: ChunkManager): GridPoint | null {
    if (this.entranceCache.has(b.id)) {
      return this.entranceCache.get(b.id) ?? null;
    }
    const ent = PathfindingSystem.findBuildingEntrance(b, chunks, 'citizen');
    this.entranceCache.set(b.id, ent);
    return ent;
  }

  public update(
    dtSec: number,
    state: WorldEngineState,
    chunks: ChunkManager,
    events?: CitizenWorkEvents,
    occupiedVehicleTiles?: ReadonlySet<number>
  ): void {
    this.syncTimer += dtSec;
    this.aStarBudgetThisFrame = 8;
    const cap = CROWD_CAP_BY_SETTING[state.settings.crowdDensity ?? 'auto'] ?? 44;
    const targetCount = Math.min(cap, Math.max(0, state.population.total));

    this.refreshFrameCaches(state);

    if (this.agents.length !== targetCount || this.syncTimer >= 1.5) {
      this.syncTimer = 0;
      this.syncAgentsToPopulation(targetCount, state, chunks);
    }

    if (this.agents.length === 0) return;

    const isNight = state.timeOfDayHours >= 20 || state.timeOfDayHours < 5.5;

    for (let i = 0; i < this.agents.length; i++) {
      this.stepAgent(this.agents[i], dtSec, isNight, state, chunks, events, occupiedVehicleTiles);
    }
  }

  private findSafeSpawnTile(home: BuildingInstance | null, idx: number, chunks: ChunkManager): GridPoint {
    if (home) {
      const ent = this.getCachedEntrance(home, chunks);
      if (ent) return ent;
    }
    const b = chunks.getUnlockedGridBounds();
    for (let gy = b.minGy; gy <= b.maxGy; gy++) {
      for (let gx = b.minGx; gx <= b.maxGx; gx++) {
        if (PathfindingSystem.isTilePassable(gx + (idx % 2), gy, chunks, 'citizen')) {
          return { gx: gx + (idx % 2), gy };
        }
        if (PathfindingSystem.isTilePassable(gx, gy, chunks, 'citizen')) {
          return { gx, gy };
        }
      }
    }
    return { gx: 2, gy: 1 };
  }

  private resolveWorkplaceVisualRole(defId: string): CitizenVisualRole {
    if (
      defId === 'watchtower' ||
      defId === 'police_station' ||
      defId === 'police_hq'
    ) {
      return 'police';
    }
    if (defId === 'fire_station' || defId === 'fire_department') {
      return 'firefighter';
    }
    if (
      defId === 'main_town_hall' ||
      defId === 'sub_town_hall' ||
      defId === 'government_office' ||
      defId === 'sub_government_office' ||
      defId === 'tax_office' ||
      defId === 'sub_tax_office' ||
      defId === 'education_ministry' ||
      defId === 'sub_education_office' ||
      defId === 'worker_office' ||
      defId === 'sub_worker_office'
    ) {
      return 'gov_officer';
    }
    const prof = resolveBuildingProfession(defId);
    if (prof) return prof;
    const def = BUILDINGS[defId];
    if (!def) return 'laborer';
    if (def.workerClass === 'engineer') return 'engineer';
    if (def.workerClass === 'artisan') return 'artisan';
    return 'laborer';
  }

  private syncAgentsToPopulation(targetCount: number, state: WorldEngineState, chunks: ChunkManager): void {
    const homes = state.buildings.filter(
      (b) => b.status !== 'constructing' && BUILDINGS[b.defId]?.category === 'residential'
    );
    const workplaces = state.buildings.filter(
      (b) => b.status !== 'constructing' && b.enabled && b.assignedWorkers > 0
    );

    while (this.agents.length < targetCount) {
      const home = homes.length > 0 ? homes[this.agents.length % homes.length] : null;
      const spawn = this.findSafeSpawnTile(home, this.agents.length, chunks);
      const id = this.nextAgentId++;
      this.agents.push({
        id,
        role: 'normal',
        homeBuildingId: home?.id ?? null,
        workBuildingId: null,
        gx: spawn.gx,
        gy: spawn.gy,
        targetGx: spawn.gx,
        targetGy: spawn.gy,
        goalGx: spawn.gx,
        goalGy: spawn.gy,
        path: [],
        pathMode: 'citizen',
        task: 'idle_stroll',
        carrying: 'none',
        taskTimer: 0.15 + (id % 5) * 0.12,
        stridePhase: id * 1.1,
        facing: 1,
        targetTileGx: spawn.gx,
        targetTileGy: spawn.gy,
      });
    }

    if (this.agents.length > targetCount) {
      this.agents.length = targetCount;
    }

    const total = Math.max(1, state.population.total);
    const childShare =
      ((state.population.ageBreakdown?.child ?? 0) + (state.population.ageBreakdown?.underage ?? 0)) / total;
    const childCount = Math.min(
      Math.max(0, Math.round(this.agents.length * childShare)),
      Math.floor(this.agents.length * 0.3)
    );

    const workSlots: Array<{ id: number; defId: string }> = [];
    for (const wb of workplaces) {
      for (let k = 0; k < wb.assignedWorkers; k++) {
        workSlots.push({ id: wb.id, defId: wb.defId });
      }
    }

    const hasWatchtowerOrGov = state.buildings.some(
      (b) =>
        b.status !== 'constructing' &&
        (b.defId === 'watchtower' ||
          b.defId === 'fire_station' ||
          b.defId === 'main_town_hall' ||
          b.defId === 'government_office')
    );

    const artShare = state.population.classes.artisan / total;
    const engShare = state.population.classes.engineer / total;

    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (homes.length > 0 && (!a.homeBuildingId || !homes.some((h) => h.id === a.homeBuildingId))) {
        a.homeBuildingId = homes[i % homes.length].id;
      }

      if (i < childCount) {
        a.role = 'child';
        a.workBuildingId = null;
        continue;
      }

      const workIdx = i - childCount;
      if (workIdx < workSlots.length) {
        const slot = workSlots[workIdx];
        a.workBuildingId = slot.id;
        a.role = this.resolveWorkplaceVisualRole(slot.defId);
      } else {
        a.workBuildingId = null;
        const frac = workIdx / Math.max(1, this.agents.length - childCount);
        if (hasWatchtowerOrGov && i % 9 === 0) a.role = 'police';
        else if (hasWatchtowerOrGov && i % 11 === 0) a.role = 'gov_officer';
        else if (frac < engShare) a.role = 'engineer';
        else if (frac < engShare + artShare) a.role = 'artisan';
        else a.role = i % 2 === 0 ? 'normal' : 'laborer';
      }
    }
  }

  private assignPathTo(
    agent: CitizenAgent,
    goalGx: number,
    goalGy: number,
    chunks: ChunkManager
  ): boolean {
    const startX = Math.round(agent.gx);
    const startY = Math.round(agent.gy);

    if (!PathfindingSystem.isTilePassable(startX, startY, chunks, agent.pathMode)) {
      const safe = this.findSafeSpawnTile(null, agent.id, chunks);
      agent.gx = safe.gx;
      agent.gy = safe.gy;
    }

    if (this.aStarBudgetThisFrame <= 0) {
      // Lightweight single-step fallback when A* budget is saturated this frame
      return false;
    }
    this.aStarBudgetThisFrame -= 1;

    const path = PathfindingSystem.findPath(
      Math.round(agent.gx),
      Math.round(agent.gy),
      Math.round(goalGx),
      Math.round(goalGy),
      chunks,
      agent.pathMode
    );
    if (!path || path.length === 0) return false;
    agent.goalGx = Math.round(goalGx);
    agent.goalGy = Math.round(goalGy);
    agent.path = path;
    agent.targetGx = path[0].gx;
    agent.targetGy = path[0].gy;
    return true;
  }

  private stepAgent(
    agent: CitizenAgent,
    dtSec: number,
    isNight: boolean,
    state: WorldEngineState,
    chunks: ChunkManager,
    events?: CitizenWorkEvents,
    occupiedVehicleTiles?: ReadonlySet<number>
  ): void {
    if (agent.path.length > 0) {
      const wp = agent.path[0];
      if (!PathfindingSystem.isTilePassable(wp.gx, wp.gy, chunks, agent.pathMode)) {
        const rerouted = this.assignPathTo(agent, agent.goalGx, agent.goalGy, chunks);
        if (!rerouted) {
          agent.path = [];
          agent.task = 'idle_rest';
          agent.taskTimer = 0.6;
        }
        return;
      }
      agent.targetGx = wp.gx;
      agent.targetGy = wp.gy;
    }

    const dx = agent.targetGx - agent.gx;
    const dy = agent.targetGy - agent.gy;
    const dist = Math.hypot(dx, dy);

    if (dist > 0.08) {
      const curX = Math.round(agent.gx);
      const curY = Math.round(agent.gy);
      const curChunk = chunks.getLoadedChunkForGrid(curX, curY);
      const road = curChunk ? (curChunk.roadType[localTileIndex(curX, curY)] as RoadType) : RoadType.None;
      const tX = Math.round(agent.targetGx);
      const tY = Math.round(agent.targetGy);
      const targetChunk = chunks.getLoadedChunkForGrid(tX, tY);
      const targetRoad = targetChunk ? (targetChunk.roadType[localTileIndex(tX, tY)] as RoadType) : RoadType.None;
      if (
        occupiedVehicleTiles &&
        targetRoad !== RoadType.None &&
        targetRoad !== RoadType.Rail &&
        occupiedVehicleTiles.has(tileKey(tX, tY))
      ) {
        // Yield briefly on sidewalk/curb until vehicle clears the tile
        return;
      }
      const roadBoost = road !== RoadType.None ? Math.min(1.85, ROADS[road]?.speedMultiplier ?? 1.1) : 1.0;
      const baseSpeed = agent.carrying !== 'none' ? 1.25 : agent.role === 'child' ? 1.7 : 1.55;
      const step = Math.min(dist, baseSpeed * roadBoost * dtSec);
      const vx = (dx / dist) * step;
      const vy = (dy / dist) * step;
      agent.gx += vx;
      agent.gy += vy;
      agent.facing = vx - vy >= 0 ? 1 : -1;
      agent.stridePhase += dtSec * 10 * roadBoost;
      return;
    }

    agent.gx = agent.targetGx;
    agent.gy = agent.targetGy;
    if (agent.path.length > 0) {
      agent.path.shift();
      if (agent.path.length > 0) {
        agent.targetGx = agent.path[0].gx;
        agent.targetGy = agent.path[0].gy;
        return;
      }
    }

    if (agent.task === 'chopping') {
      agent.taskTimer -= dtSec;
      agent.stridePhase += dtSec * 12;
      if (agent.taskTimer > 0) return;

      const outcome = BuildingSystem.chopTile(agent.targetTileGx, agent.targetTileGy, 18, chunks, state, {
        allowImmature: false,
      });
      if (outcome.hit) {
        events?.onChopHit(agent.targetTileGx, agent.targetTileGy, outcome);
        if (outcome.cleared) {
          this.invalidateTreeCache();
          agent.carrying = outcome.bonusName === 'berries' ? 'food' : 'wood';
          this.sendToDeposit(agent, state, chunks, isNight);
        } else {
          agent.taskTimer = 1.0;
        }
      } else {
        this.invalidateTreeCache();
        this.pickNextTask(agent, isNight, state, chunks);
      }
      return;
    }

    if (agent.task === 'walk_to_tree') {
      const tileChunk = chunks.getLoadedChunkForGrid(agent.targetTileGx, agent.targetTileGy);
      const tidx = localTileIndex(agent.targetTileGx, agent.targetTileGy);
      const ft = tileChunk ? (tileChunk.featureType[tidx] as FeatureType) : FeatureType.None;
      const isWildClearable =
        tileChunk &&
        (tileChunk.flags[tidx] & TileFlag.Unlocked) !== 0 &&
        tileChunk.buildingRef[tidx] === -1 &&
        tileChunk.roadType[tidx] === RoadType.None &&
        (isMatureTreeFeature(ft) || ft === FeatureType.StoneOutcrop);
      if (isWildClearable) {
        agent.task = 'chopping';
        agent.taskTimer = 0.75;
      } else {
        this.pickNextTask(agent, isNight, state, chunks);
      }
      return;
    }

    if (agent.task === 'walk_to_work') {
      agent.task = 'working';
      agent.taskTimer = 2.4;
      return;
    }

    if (agent.task === 'working') {
      agent.taskTimer -= dtSec;
      agent.stridePhase += dtSec * 8;
      if (agent.taskTimer > 0) return;

      const workB = this.findBuilding(state, agent.workBuildingId);
      const def = workB ? BUILDINGS[workB.defId] : null;
      if (def) {
        if (def.category === 'agricultural') agent.carrying = 'food';
        else if (
          def.id === 'stone_quarry' ||
          def.id === 'gold_mine' ||
          def.id === 'silver_mine' ||
          def.id === 'coal_mine' ||
          def.category === 'industrial'
        ) {
          agent.carrying = 'stone';
        } else if (
          def.id === 'automated_tree_plantation_factory' ||
          def.id === 'lumber_mill' ||
          def.id === 'heavy_lumber_complex' ||
          def.id === 'bamboo_grove' ||
          def.id === 'rubber_tapper'
        ) {
          agent.carrying = 'wood';
        } else {
          agent.carrying = 'goods';
        }
      }
      this.sendToDeposit(agent, state, chunks, isNight);
      return;
    }

    if (agent.task === 'carrying_home') {
      if (agent.carrying === 'wood') {
        const added = ResourceSystem.addClamped(state, 'wood', 1);
        if (added > 0) events?.onAutoDelivery(agent.gx, agent.gy, '+1 Wood', '#bef264');
      } else if (agent.carrying === 'food') {
        const added = ResourceSystem.addClamped(state, 'berries', 1);
        if (added > 0) events?.onAutoDelivery(agent.gx, agent.gy, '+1 Berries', '#fdba74');
      } else if (agent.carrying === 'stone') {
        const added = ResourceSystem.addClamped(state, 'stone', 1);
        if (added > 0) events?.onAutoDelivery(agent.gx, agent.gy, '+1 Stone', '#cbd5e1');
      } else if (agent.carrying === 'goods') {
        state.coins += 2;
        state.stats.totalCoinsEarned += 2;
        events?.onAutoDelivery(agent.gx, agent.gy, '+2C', '#fde047');
      }
      agent.carrying = 'none';
      this.pickNextTask(agent, isNight, state, chunks);
      return;
    }

    agent.taskTimer -= dtSec;
    if (agent.taskTimer <= 0) {
      this.pickNextTask(agent, isNight, state, chunks);
    }
  }

  private sendToDeposit(
    agent: CitizenAgent,
    state: WorldEngineState,
    chunks: ChunkManager,
    isNight: boolean
  ): void {
    const dropoff = this.cachedDropoff ?? this.findBuilding(state, agent.homeBuildingId);

    const entrance = dropoff ? this.getCachedEntrance(dropoff, chunks) : null;
    if (entrance && this.assignPathTo(agent, entrance.gx, entrance.gy, chunks)) {
      agent.task = 'carrying_home';
      return;
    }
    agent.carrying = 'none';
    this.pickNextTask(agent, isNight, state, chunks);
  }

  private pickNextTask(
    agent: CitizenAgent,
    isNight: boolean,
    state: WorldEngineState,
    chunks: ChunkManager
  ): void {
    // Children & Patrol officers stroll around homes/parks/public buildings
    if (agent.role === 'child') {
      const park = this.cachedPark;
      const ent = park ? this.getCachedEntrance(park, chunks) : null;
      if (ent && (agent.id % 2 === 0) && this.assignPathTo(agent, ent.gx, ent.gy, chunks)) {
        agent.task = 'idle_stroll';
        agent.taskTimer = 1.6;
        return;
      }
      const stroll = this.findRandomUnlockedWalkTile(agent, chunks);
      if (stroll && this.assignPathTo(agent, stroll.gx, stroll.gy, chunks)) {
        agent.task = 'idle_stroll';
        agent.taskTimer = 1.4;
        return;
      }
      agent.task = 'idle_rest';
      agent.taskTimer = 1.6;
      return;
    }

    // 1. Immediate wild tree / stone clearing priority for idle hands, gatherers, foresters,
    //    and a rotating clearing detail (factory production runs on b.assignedWorkers so visual clearing never hurts output).
    const ownWorkB = this.findBuilding(state, agent.workBuildingId);
    const isDesignatedHarvester =
      ownWorkB?.defId === 'gatherer_hut' ||
      ownWorkB?.defId === 'heavy_lumber_complex' ||
      ownWorkB?.defId === 'lumber_mill';
    const isEmergencyOrGov = agent.role === 'police' || agent.role === 'firefighter' || agent.role === 'gov_officer';
    const canChopNow =
      !ownWorkB ||
      isDesignatedHarvester ||
      (!isEmergencyOrGov && (agent.id === 1 || agent.id % 4 === 0));

    if (canChopNow) {
      const treeTile = this.findNearestUnlockedTree(agent.gx, agent.gy, state.tick, chunks);
      if (treeTile && this.assignPathTo(agent, treeTile.gx, treeTile.gy, chunks)) {
        agent.task = 'walk_to_tree';
        agent.targetTileGx = treeTile.gx;
        agent.targetTileGy = treeTile.gy;
        return;
      }
    }

    // 2. Work-seeking: assigned workers commute to their workplace (or fallback open workplace when no trees remain)
    let workB = ownWorkB;
    if (!workB && agent.role !== 'police' && agent.role !== 'gov_officer') {
      workB = this.cachedOpenWorkplace;
    }

    if (workB && (!isNight || agent.id % 2 === 0)) {
      const workEnt = this.getCachedEntrance(workB, chunks);
      if (workEnt && this.assignPathTo(agent, workEnt.gx, workEnt.gy, chunks)) {
        agent.task = 'walk_to_work';
        return;
      }
    }

    // 3. Fallback: if workplace couldn't be reached, still try chopping any reachable mature wild tree
    if (!canChopNow) {
      const treeTile = this.findNearestUnlockedTree(agent.gx, agent.gy, state.tick, chunks);
      if (treeTile && this.assignPathTo(agent, treeTile.gx, treeTile.gy, chunks)) {
        agent.task = 'walk_to_tree';
        agent.targetTileGx = treeTile.gx;
        agent.targetTileGy = treeTile.gy;
        return;
      }
    }

    // 4. Walk across any open unlocked tile (even without roads); if no open space exists, stand still cleanly
    const strollTile = this.findRandomUnlockedWalkTile(agent, chunks);
    if (strollTile && this.assignPathTo(agent, strollTile.gx, strollTile.gy, chunks)) {
      agent.task = 'idle_stroll';
      agent.taskTimer = 1.4 + ((agent.id * 17) % 10) * 0.15;
      return;
    }

    // No work and no walkable space left -> stand still cleanly
    agent.task = 'idle_rest';
    agent.taskTimer = 2.0;
  }

  private refreshTreeCacheIfNeeded(curTick: number, chunks: ChunkManager): void {
    if (curTick - this.treeCacheTick < 4 && this.cachedTrees.length > 0) return;
    this.treeCacheTick = curTick;
    const found: GridPoint[] = [];
    for (const chunk of chunks.getAllLoadedChunks()) {
      const baseX = chunk.cx * CHUNK_SIZE;
      const baseY = chunk.cy * CHUNK_SIZE;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const gy = baseY + ly;
        const rowOff = ly * CHUNK_SIZE;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const i = rowOff + lx;
          if ((chunk.flags[i] & TileFlag.Unlocked) === 0) continue;
          if (chunk.buildingRef[i] !== -1) continue;
          if (chunk.roadType[i] !== RoadType.None) continue;
          const ft = chunk.featureType[i] as FeatureType;
          if (!isMatureTreeFeature(ft) && ft !== FeatureType.StoneOutcrop) continue;
          const gx = baseX + lx;
          if (PathfindingSystem.isTilePassable(gx, gy, chunks, 'citizen')) {
            found.push({ gx, gy });
          }
        }
      }
    }
    this.cachedTrees = found;
  }

  private findNearestUnlockedTree(
    fromGx: number,
    fromGy: number,
    curTick: number,
    chunks: ChunkManager
  ): GridPoint | null {
    this.refreshTreeCacheIfNeeded(curTick, chunks);
    let best: GridPoint | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.cachedTrees.length; i++) {
      const t = this.cachedTrees[i];
      const chunk = chunks.getLoadedChunkForGrid(t.gx, t.gy);
      if (!chunk) continue;
      const idx = localTileIndex(t.gx, t.gy);
      if ((chunk.flags[idx] & TileFlag.Unlocked) === 0) continue;
      if (chunk.buildingRef[idx] !== -1 || chunk.roadType[idx] !== RoadType.None) continue;
      const ft = chunk.featureType[idx] as FeatureType;
      if (!isMatureTreeFeature(ft) && ft !== FeatureType.StoneOutcrop) continue;
      const d = Math.hypot(t.gx - fromGx, t.gy - fromGy);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  private findRandomUnlockedWalkTile(
    agent: CitizenAgent,
    chunks: ChunkManager
  ): GridPoint | null {
    const b = chunks.getUnlockedGridBounds();
    for (let tries = 0; tries < 10; tries++) {
      const h1 = Math.abs(Math.sin(agent.id * 12.9898 + tries * 78.233 + agent.stridePhase));
      const h2 = Math.abs(Math.cos(agent.id * 45.164 + tries * 19.17 + agent.stridePhase));
      const gx = b.minGx + Math.floor((h1 % 1) * (b.maxGx - b.minGx + 1));
      const gy = b.minGy + Math.floor((h2 % 1) * (b.maxGy - b.minGy + 1));
      if (PathfindingSystem.isTilePassable(gx, gy, chunks, 'citizen')) {
        return { gx, gy };
      }
    }
    return null;
  }

  private findBuilding(_state: WorldEngineState, id: number | null): BuildingInstance | undefined {
    if (id === null) return undefined;
    return this.buildingByIdCache.get(id);
  }
}

