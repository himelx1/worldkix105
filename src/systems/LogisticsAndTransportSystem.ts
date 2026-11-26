import { BUILDINGS } from '../data/buildings.data';
import type { ResourceId } from '../data/resources.data';
import { getRoadProperties, ROADS, RoadType } from '../data/roads.data';
import type { ChunkManager } from '../core/ChunkManager';
import {
  BuildingInstance,
  RoadVehicleAgent,
  RoadVehicleKind,
  TileFlag,
  TrainAgent,
  VehicleClass,
  WorldEngineState,
} from '../core/GameState';
import { CHUNK_SIZE, localTileIndex, tileKey } from '../core/IsoMath';
import { PathfindingSystem } from './PathfindingSystem';
import { ResourceSystem } from './ResourceSystem';
import type { RoadNetworkSystem } from './RoadNetworkSystem';

export interface TransportDeliveryEvent {
  gx: number;
  gy: number;
  label: string;
  color: string;
}

export interface LogisticsRouteDiagnostic {
  id: string;
  category: 'vehicle_route';
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  gx: number;
  gy: number;
}

const CARGO_FALLBACK_RESOURCES: ResourceId[] = ['wood', 'stone', 'wheat', 'bricks', 'iron_ingots', 'tools'];

function getVehicleClass(kind: RoadVehicleKind): VehicleClass {
  switch (kind) {
    case 'car':
    case 'taxi':
      return 'car';
    case 'delivery_van':
    case 'fish_van':
      return 'van';
    case 'bus':
      return 'bus';
    case 'emergency':
      return 'emergency';
    default:
      return 'heavy_truck';
  }
}

function getBaseMaxSpeed(kind: RoadVehicleKind): number {
  switch (kind) {
    case 'emergency':
      return 3.4;
    case 'car':
      return 2.95;
    case 'taxi':
      return 2.85;
    case 'delivery_van':
    case 'fish_van':
      return 2.55;
    case 'bus':
      return 2.25;
    case 'cargo_truck':
    case 'construction_truck':
      return 2.05;
    case 'container_truck':
      return 1.9;
    case 'tractor':
      return 1.6;
  }
}

function getLaneOffsetForTile(
  gx: number,
  gy: number,
  vehicleId: number,
  chunks: ChunkManager
): number {
  const chunk = chunks.getLoadedChunkForGrid(gx, gy);
  if (!chunk) return 0;
  const rt = chunk.roadType[localTileIndex(gx, gy)] as RoadType;
  if (rt === RoadType.None || rt === RoadType.Rail) return 0;
  const props = getRoadProperties(rt);
  if (props.totalLanes <= 1) return 0;
  const baseOffset =
    props.widthClass === 'highway'
      ? 0.24
      : props.widthClass === 'wide'
        ? 0.2
        : 0.16;
  const multiLaneShift = props.lanesPerDirection >= 2 ? (vehicleId % 2 === 0 ? -0.04 : 0.05) : 0;
  return baseOffset + multiLaneShift;
}

export class LogisticsAndTransportSystem {
  public readonly trains: TrainAgent[] = [];
  public readonly roadVehicles: RoadVehicleAgent[] = [];

  private nextId = 1;
  private syncAccum = 0;
  private trafficSampleAccum = 0;
  private internalSimClockSec = 0;
  private cachedRailTiles: Array<{ gx: number; gy: number }> = [];
  private cachedRoadTiles: Array<{ gx: number; gy: number; unlocked?: boolean; clusterId?: number }> = [];
  private cachedRoadTilesByCluster = new Map<number, Array<{ gx: number; gy: number }>>();
  private railSet = new Set<number>();
  private roadSet = new Set<number>();
  private cachedNetVer = -1;

  // Heavy-truck route issues observed during live dispatch
  private routeDiagnosticsMap = new Map<string, LogisticsRouteDiagnostic>();

  public reset(): void {
    this.trains.length = 0;
    this.roadVehicles.length = 0;
    this.cachedRailTiles = [];
    this.cachedRoadTiles = [];
    this.cachedRoadTilesByCluster.clear();
    this.railSet.clear();
    this.roadSet.clear();
    this.cachedNetVer = -1;
    this.syncAccum = 0;
    this.trafficSampleAccum = 0;
    this.internalSimClockSec = 0;
    this.routeDiagnosticsMap.clear();
  }

  public getRouteDiagnostics(): LogisticsRouteDiagnostic[] {
    return Array.from(this.routeDiagnosticsMap.values());
  }

  public update(
    dtSec: number,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet?: RoadNetworkSystem,
    simTimeSec?: number,
    onEvent?: (ev: TransportDeliveryEvent) => void
  ): void {
    this.internalSimClockSec += dtSec;
    const effectiveTimeSec = simTimeSec ?? this.internalSimClockSec;

    this.syncAccum += dtSec;
    if (
      this.syncAccum >= 2.0 ||
      (this.trains.length === 0 &&
        this.roadVehicles.length === 0 &&
        this.syncAccum >= 0.4)
    ) {
      this.syncAccum = 0;
      if (roadNet) {
        roadNet.recomputeIfDirty(chunks, state);
      }
      this.rebuildNetworkCacheIfNeeded(chunks, roadNet);
      this.syncTrains(state);
      this.syncRoadVehicles(state, chunks, roadNet);
    }

    this.stepTrains(dtSec);
    this.stepRoadVehicles(dtSec, state, chunks, roadNet, effectiveTimeSec, onEvent);

    if (roadNet) {
      this.trafficSampleAccum += dtSec;
      if (this.trafficSampleAccum >= 0.35) {
        this.trafficSampleAccum = 0;
        const tileVehicleCount = new Map<number, number>();
        const tileWaitingCount = new Map<number, number>();

        for (let i = 0; i < this.roadVehicles.length; i++) {
          const rv = this.roadVehicles[i];
          const key = tileKey(Math.round(rv.gx), Math.round(rv.gy));
          tileVehicleCount.set(key, (tileVehicleCount.get(key) ?? 0) + 1);
          if (rv.state === 'waiting_signal' || rv.state === 'waiting_traffic') {
            tileWaitingCount.set(key, (tileWaitingCount.get(key) ?? 0) + 1);
          }
        }

        roadNet.recordTrafficSample(tileVehicleCount, tileWaitingCount, chunks, state);
      }
    }
  }

  private rebuildNetworkCacheIfNeeded(chunks: ChunkManager, roadNet?: RoadNetworkSystem): void {
    const targetVer = roadNet ? roadNet.networkVersion : -2;
    if (roadNet && this.cachedNetVer === targetVer) {
      return;
    }
    this.cachedNetVer = targetVer;
    this.cachedRailTiles = [];
    this.cachedRoadTiles = [];
    this.cachedRoadTilesByCluster.clear();
    this.railSet.clear();
    this.roadSet.clear();

    if (roadNet) {
      const allRoads = roadNet.getCachedRoadTiles();
      for (let i = 0; i < allRoads.length; i++) {
        const entry = allRoads[i];
        if (entry.type === RoadType.Rail) {
          this.cachedRailTiles.push({ gx: entry.gx, gy: entry.gy });
          this.railSet.add(entry.key);
        } else {
          this.cachedRoadTiles.push(entry);
          this.roadSet.add(entry.key);
          if (entry.clusterId > 0) {
            let list = this.cachedRoadTilesByCluster.get(entry.clusterId);
            if (!list) {
              list = [];
              this.cachedRoadTilesByCluster.set(entry.clusterId, list);
            }
            list.push(entry);
          }
        }
      }
      return;
    }

    for (const chunk of chunks.getAllLoadedChunks()) {
      const baseX = chunk.cx * CHUNK_SIZE;
      const baseY = chunk.cy * CHUNK_SIZE;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const gy = baseY + ly;
        const rowOff = ly * CHUNK_SIZE;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const i = rowOff + lx;
          const rt = chunk.roadType[i] as RoadType;
          if (rt === RoadType.None) continue;
          const gx = baseX + lx;
          const key = tileKey(gx, gy);
          if (rt === RoadType.Rail) {
            this.cachedRailTiles.push({ gx, gy });
            this.railSet.add(key);
          } else {
            const unlocked = (chunk.flags[i] & TileFlag.Unlocked) !== 0;
            this.cachedRoadTiles.push({ gx, gy, unlocked });
            this.roadSet.add(key);
          }
        }
      }
    }
  }

  private syncTrains(state: WorldEngineState): void {
    if (this.cachedRailTiles.length < 3) {
      this.trains.length = 0;
      return;
    }

    const stationCount = state.buildings.filter((b) => {
      const def = BUILDINGS[b.defId];
      return def?.transitKind === 'rail' && b.status !== 'constructing' && b.enabled;
    }).length;
    const hasFreightYard = state.buildings.some(
      (b) => b.defId === 'freight_rail_yard' && b.status !== 'constructing'
    );

    const desiredTrains = Math.min(
      8,
      Math.max(1, Math.min(Math.floor(this.cachedRailTiles.length / 6), 1 + stationCount))
    );

    while (this.trains.length < desiredTrains) {
      const start = this.cachedRailTiles[(this.trains.length * 5) % this.cachedRailTiles.length];
      this.trains.push({
        id: this.nextId++,
        kind: hasFreightYard && this.trains.length % 2 === 1 ? 'freight' : 'passenger',
        gx: start.gx,
        gy: start.gy,
        prevGx: start.gx,
        prevGy: start.gy,
        progress: 1,
        facing: 1,
        cars: 3,
      });
    }
    if (this.trains.length > desiredTrains) {
      this.trains.length = desiredTrains;
    }
  }

  private stepTrains(dtSec: number): void {
    if (this.trains.length === 0 || this.railSet.size === 0) return;

    for (let ti = 0; ti < this.trains.length; ti++) {
      const train = this.trains[ti];
      const tx = Math.round(train.gx);
      const ty = Math.round(train.gy);
      if (!this.railSet.has(tileKey(tx, ty))) {
        if (this.cachedRailTiles.length > 0) {
          const fallback = this.cachedRailTiles[train.id % this.cachedRailTiles.length];
          train.gx = fallback.gx;
          train.gy = fallback.gy;
          train.prevGx = fallback.gx;
          train.prevGy = fallback.gy;
          train.progress = 1;
        }
        continue;
      }

      if (train.progress >= 1) {
        const neighbors: Array<[number, number]> = [];
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (this.railSet.has(tileKey(nx, ny))) {
            neighbors.push([nx, ny]);
          }
        }
        if (neighbors.length === 0) continue;

        const forward = neighbors.filter(([nx, ny]) => nx !== train.prevGx || ny !== train.prevGy);
        const pool = forward.length > 0 ? forward : neighbors;
        const pick = pool[(train.id + tx * 3 + ty * 7) % pool.length];
        train.prevGx = tx;
        train.prevGy = ty;
        train.progress = 0;
        const dx = pick[0] - tx;
        const dy = pick[1] - ty;
        train.facing = dx - dy >= 0 ? 1 : -1;
        train.gx = tx + dx * 0.01;
        train.gy = ty + dy * 0.01;
      } else {
        const dirX = Math.sign(train.gx - train.prevGx);
        const dirY = Math.sign(train.gy - train.prevGy);
        const destX = train.prevGx + dirX;
        const destY = train.prevGy + dirY;
        const speed = train.kind === 'passenger' ? 3.2 : 2.3;
        train.progress = Math.min(1, train.progress + speed * dtSec);
        train.gx = train.prevGx + dirX * train.progress;
        train.gy = train.prevGy + dirY * train.progress;
        if (train.progress >= 1) {
          train.gx = destX;
          train.gy = destY;
        }
      }
    }
  }

  private getRoadAccessibleBuildings(
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet?: RoadNetworkSystem
  ): BuildingInstance[] {
    const out: BuildingInstance[] = [];
    for (const b of state.buildings) {
      if (!b.enabled) continue;
      if (roadNet) {
        const access = roadNet.getCachedRoadAccess(b, chunks);
        if (access.accessPoints.some((ap) => ap.roadType !== RoadType.Rail)) {
          out.push(b);
        }
      } else if (PathfindingSystem.findBuildingEntrances(b, chunks, 'vehicle').length > 0) {
        out.push(b);
      }
    }
    return out;
  }

  private syncRoadVehicles(
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet?: RoadNetworkSystem
  ): void {
    if (this.cachedRoadTiles.length < 2) {
      this.roadVehicles.length = 0;
      return;
    }

    const roadBuildings = this.getRoadAccessibleBuildings(state, chunks, roadNet);

    let busWanted = 0;
    let taxiWanted = 0;
    let carWanted = 0;
    let deliveryWanted = 0;
    let fishVanWanted = 0;
    let cargoWanted = 0;
    let containerWanted = 0;
    let tractorWanted = 0;
    let constructionWanted = 0;
    let emergencyWanted = 0;

    for (const b of roadBuildings) {
      const def = BUILDINGS[b.defId];
      if (!def) continue;

      if (b.status === 'constructing') {
        constructionWanted = Math.min(3, constructionWanted + 1);
        continue;
      }

      if (def.transitKind === 'bus') busWanted += 2;
      if (def.transitKind === 'taxi') taxiWanted += 2;
      if (def.category === 'residential') carWanted += 1;
      if (def.category === 'commercial' || def.subCategory === 'market') deliveryWanted += 1;
      if (def.subCategory === 'fishing' || b.defId === 'fish_market') fishVanWanted += 1;
      if (def.subCategory === 'farming' || b.defId === 'farm_equipment_depot') tractorWanted += 1;
      if (
        def.category === 'production' ||
        def.category === 'industrial' ||
        def.category === 'storage' ||
        def.subCategory === 'mega_factory'
      ) {
        cargoWanted += 1;
      }
      if (
        def.subCategory === 'trade_port' ||
        def.exportsSurplus ||
        def.importsUnavailable ||
        def.isCustoms ||
        def.transitKind === 'sea' ||
        def.transitKind === 'air'
      ) {
        containerWanted += 1;
      }
      if (def.category === 'healthcare' || (def.safetyBonus ?? 0) > 0) {
        emergencyWanted += 1;
      }
    }

    if (roadBuildings.length >= 2 && carWanted === 0 && state.population.total > 0) {
      carWanted = 1;
    }

    const desiredKinds: RoadVehicleKind[] = [];
    const pushCapped = (kind: RoadVehicleKind, count: number, cap: number) => {
      const n = Math.min(cap, count);
      for (let i = 0; i < n; i++) desiredKinds.push(kind);
    };

    pushCapped('bus', busWanted, 6);
    pushCapped('taxi', taxiWanted, 5);
    pushCapped('car', Math.floor((carWanted + 1) / 2), 6);
    pushCapped('delivery_van', deliveryWanted, 5);
    pushCapped('fish_van', fishVanWanted, 3);
    pushCapped('cargo_truck', cargoWanted, 6);
    pushCapped('container_truck', containerWanted, 4);
    pushCapped('tractor', tractorWanted, 3);
    pushCapped('construction_truck', constructionWanted, 3);
    pushCapped('emergency', emergencyWanted, 3);

    desiredKinds.length = Math.min(desiredKinds.length, 32);

    if (desiredKinds.length === 0) {
      this.roadVehicles.length = 0;
      return;
    }

    while (this.roadVehicles.length < desiredKinds.length) {
      const idx = this.roadVehicles.length;
      const kind = desiredKinds[idx];
      const start = this.pickSpawnRoadTile(kind, roadBuildings, chunks, idx);
      const vClass = getVehicleClass(kind);
      const veh: RoadVehicleAgent = {
        id: this.nextId++,
        kind,
        vehicleClass: vClass,
        gx: start.gx,
        gy: start.gy,
        prevGx: start.gx,
        prevGy: start.gy,
        nextGx: start.gx,
        nextGy: start.gy,
        progress: 1,
        facing: 1,
        vx: 0,
        vy: 0,
        laneOffset: 0,
        speed: 0,
        maxSpeed: getBaseMaxSpeed(kind),
        state: 'idle',
        waitTimer: 0.2 + ((idx * 0.21) % 2.1),
        blockedSec: 0,
        route: [],
        routeIdx: 0,
        routeVersion: 0,
      };
      this.roadVehicles.push(veh);
    }

    if (this.roadVehicles.length > desiredKinds.length) {
      this.roadVehicles.length = desiredKinds.length;
    }

    let syncTripBudget = 2;
    for (let i = 0; i < this.roadVehicles.length; i++) {
      const veh = this.roadVehicles[i];
      if (veh.kind !== desiredKinds[i]) {
        veh.kind = desiredKinds[i];
        veh.vehicleClass = getVehicleClass(desiredKinds[i]);
        veh.maxSpeed = getBaseMaxSpeed(desiredKinds[i]);
      }
      if (veh.route.length === 0 && veh.state === 'idle' && veh.waitTimer <= 0 && syncTripBudget > 0) {
        syncTripBudget--;
        this.assignTrip(veh, state, chunks, roadNet, roadBuildings);
      }
    }
  }

  private pickSpawnRoadTile(
    kind: RoadVehicleKind,
    roadBuildings: BuildingInstance[],
    chunks: ChunkManager,
    seedIdx: number
  ): { gx: number; gy: number } {
    if (roadBuildings.length > 0) {
      const b = roadBuildings[seedIdx % roadBuildings.length];
      const entrances = PathfindingSystem.findBuildingEntrances(b, chunks, 'vehicle');
      if (entrances.length > 0) return entrances[0];
    }
    void kind;
    return this.cachedRoadTiles[(seedIdx * 7) % this.cachedRoadTiles.length];
  }

  private pickSourceAndDest(
    kind: RoadVehicleKind,
    state: WorldEngineState,
    roadBuildings: BuildingInstance[],
    roadNet?: RoadNetworkSystem,
    seed = 1
  ): {
    source?: BuildingInstance;
    dest?: BuildingInstance;
    cargoResource?: ResourceId;
    cargoAmount?: number;
  } {
    if (roadBuildings.length === 0) return {};

    const constructing = roadBuildings.filter((b) => b.status === 'constructing');
    const active = roadBuildings.filter((b) => b.status !== 'constructing');
    const byMatch = (pred: (b: BuildingInstance) => boolean) => active.filter(pred);

    let sources: BuildingInstance[] = [];
    let dests: BuildingInstance[] = [];
    let cargoResource: ResourceId | undefined;
    let cargoAmount = 0;

    switch (kind) {
      case 'construction_truck': {
        sources = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(
            def &&
              (def.category === 'storage' ||
                def.category === 'industrial' ||
                def.category === 'government' ||
                b.defId === 'sawmill_mega')
          );
        });
        if (sources.length === 0) sources = active;
        dests = constructing;
        cargoResource = 'bricks';
        cargoAmount = 2;
        break;
      }
      case 'container_truck': {
        sources = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(
            def &&
              (def.subCategory === 'trade_port' ||
                def.exportsSurplus ||
                def.importsUnavailable ||
                def.isCustoms ||
                def.transitKind === 'sea' ||
                def.transitKind === 'air')
          );
        });
        dests = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(
            def && (def.category === 'storage' || def.category === 'industrial' || def.category === 'production')
          );
        });
        cargoResource = 'tools';
        cargoAmount = 3;
        break;
      }
      case 'cargo_truck': {
        sources = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(
            def && (def.category === 'production' || def.category === 'industrial' || def.subCategory === 'mega_factory')
          );
        });
        dests = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(def && (def.category === 'storage' || def.category === 'commercial' || def.subCategory === 'market'));
        });
        break;
      }
      case 'delivery_van': {
        sources = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(def && (def.category === 'agricultural' || def.category === 'storage' || def.category === 'production'));
        });
        dests = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(def && (def.category === 'commercial' || def.subCategory === 'market' || def.category === 'residential'));
        });
        cargoResource = 'bread';
        cargoAmount = 2;
        break;
      }
      case 'fish_van': {
        sources = byMatch((b) => BUILDINGS[b.defId]?.subCategory === 'fishing');
        dests = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(def && (b.defId === 'fish_market' || def.category === 'commercial' || def.subCategory === 'market'));
        });
        cargoResource = 'fish';
        cargoAmount = 2;
        break;
      }
      case 'tractor': {
        sources = byMatch((b) => b.defId === 'farm_equipment_depot' || BUILDINGS[b.defId]?.subCategory === 'farming');
        dests = byMatch((b) => BUILDINGS[b.defId]?.subCategory === 'farming' || BUILDINGS[b.defId]?.category === 'agricultural');
        cargoResource = 'wheat';
        cargoAmount = 2;
        break;
      }
      case 'emergency': {
        sources = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(def && (def.category === 'healthcare' || (def.safetyBonus ?? 0) > 0));
        });
        dests = byMatch((b) => BUILDINGS[b.defId]?.category === 'residential' || BUILDINGS[b.defId]?.category === 'industrial');
        break;
      }
      case 'bus':
      case 'taxi': {
        sources = byMatch((b) => BUILDINGS[b.defId]?.transitKind === kind || BUILDINGS[b.defId]?.category === 'residential');
        dests = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(def && (def.category === 'commercial' || def.category === 'government' || def.category === 'educational' || def.category === 'recreational'));
        });
        break;
      }
      default: {
        sources = byMatch((b) => BUILDINGS[b.defId]?.category === 'residential');
        dests = byMatch((b) => {
          const def = BUILDINGS[b.defId];
          return Boolean(def && (def.category === 'commercial' || def.category === 'government' || def.category === 'industrial' || def.subCategory === 'corporate'));
        });
        break;
      }
    }

    if (sources.length === 0) sources = active.length > 0 ? active : roadBuildings;
    if (dests.length === 0) dests = active.length > 0 ? active : roadBuildings;

    const source = sources[seed % sources.length];
    const sourceCluster = source.connectedRoadCluster;

    // Prevent duplicate identical active cargo assignments on same source+dest if alternatives exist
    const sameClusterDests = dests.filter(
      (d) => d.id !== source.id && (sourceCluster === 0 || d.connectedRoadCluster === sourceCluster)
    );
    const activePairs = new Set(
      this.roadVehicles
        .filter((v) => !v.returning && v.sourceBuildingId === source.id && v.destBuildingId)
        .map((v) => v.destBuildingId!)
    );
    const nonDupDests = sameClusterDests.filter((d) => !activePairs.has(d.id));
    const destPool = nonDupDests.length > 0 ? nonDupDests : sameClusterDests;

    const dest = destPool.length > 0 ? destPool[(seed * 3 + 1) % destPool.length] : undefined;

    if (!cargoResource && source) {
      const sDef = BUILDINGS[source.defId];
      const outKeys = sDef?.recipe ? (Object.keys(sDef.recipe.outputs) as ResourceId[]) : [];
      if (outKeys.length > 0) {
        cargoResource = outKeys[seed % outKeys.length];
        cargoAmount = 2;
      } else if (sDef?.isAutomatedTreePlantation) {
        cargoResource = 'wood';
        cargoAmount = 4;
      } else if (kind === 'cargo_truck') {
        cargoResource = CARGO_FALLBACK_RESOURCES[seed % CARGO_FALLBACK_RESOURCES.length];
        cargoAmount = 1;
      }
    }

    void state;
    void roadNet;
    return { source, dest, cargoResource, cargoAmount };
  }

  private assignTrip(
    veh: RoadVehicleAgent,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet?: RoadNetworkSystem,
    cachedBuildings?: BuildingInstance[]
  ): boolean {
    const roadBuildings = cachedBuildings ?? this.getRoadAccessibleBuildings(state, chunks, roadNet);
    const curGx = Math.round(veh.gx);
    const curGy = Math.round(veh.gy);
    const onRoadNow = this.roadSet.has(tileKey(curGx, curGy));

    const { source, dest, cargoResource, cargoAmount } = this.pickSourceAndDest(
      veh.kind,
      state,
      roadBuildings,
      roadNet,
      veh.id + state.tick
    );

    veh.sourceBuildingId = source?.id;
    veh.destBuildingId = dest?.id;
    if (veh.returning) {
      veh.cargoResource = undefined;
      veh.cargoAmount = 0;
    } else {
      veh.cargoResource = cargoResource;
      veh.cargoAmount = cargoAmount;
    }

    const congestionMap = roadNet?.getTileCongestionMap();
    const pathOpts = { vehicleClass: veh.vehicleClass, congestionMap };

    const targetB = veh.returning ? source : dest ?? source;
    if (targetB) {
      const targetEntrances = PathfindingSystem.findBuildingEntrances(targetB, chunks, 'vehicle');
      let startTile = onRoadNow ? { gx: curGx, gy: curGy } : null;
      if (!startTile && source && veh.state === 'idle') {
        const srcEntrances = PathfindingSystem.findBuildingEntrances(source, chunks, 'vehicle');
        if (srcEntrances.length > 0) {
          startTile = srcEntrances[0];
          veh.gx = startTile.gx;
          veh.gy = startTile.gy;
          veh.prevGx = startTile.gx;
          veh.prevGy = startTile.gy;
        }
      }

      if (startTile && targetEntrances.length > 0) {
        const startCid = roadNet ? roadNet.getRoadClusterId(startTile.gx, startTile.gy) : 0;
        for (let i = 0; i < targetEntrances.length && i < 4; i++) {
          const endTile = targetEntrances[i];
          if (endTile.gx === startTile.gx && endTile.gy === startTile.gy) continue;
          if (roadNet && startCid > 0) {
            const endCid = roadNet.getRoadClusterId(endTile.gx, endTile.gy);
            if (endCid > 0 && endCid !== startCid) continue;
          }
          const path = PathfindingSystem.findPath(
            startTile.gx,
            startTile.gy,
            endTile.gx,
            endTile.gy,
            chunks,
            'vehicle',
            560,
            pathOpts
          );
          if (path && path.length > 0) {
            if (veh.vehicleClass === 'heavy_truck') {
              const suit = PathfindingSystem.inspectRouteSuitability(path, chunks, veh.vehicleClass);
              if (!suit.suitable && suit.sampleRestrictedCoord) {
                this.routeDiagnosticsMap.set(`heavy_local_freight_${veh.id}`, {
                  id: `heavy_local_freight_${veh.id}`,
                  category: 'vehicle_route',
                  severity: 'warning',
                  title: 'Freight Truck on Unsuitable Narrow Street',
                  detail: `Truck #${veh.id} (${veh.kind}) had to cross ${suit.restrictedTiles} narrow/residential tile(s) due to no arterial bypass.`,
                  gx: suit.sampleRestrictedCoord.gx,
                  gy: suit.sampleRestrictedCoord.gy,
                });
              } else {
                this.routeDiagnosticsMap.delete(`heavy_local_freight_${veh.id}`);
              }
            }

            veh.route = path;
            veh.routeIdx = 0;
            veh.routeVersion = roadNet?.networkVersion ?? 1;
            veh.prevGx = startTile.gx;
            veh.prevGy = startTile.gy;
            veh.nextGx = path[0].gx;
            veh.nextGy = path[0].gy;
            veh.progress = 0;
            veh.state = 'en_route';
            veh.blockedSec = 0;
            veh.statusReason = veh.returning ? 'Returning empty on road' : 'Delivering freight on road';
            return true;
          }
        }
      }
    }

    if (onRoadNow) {
      const clusterId = roadNet?.getRoadClusterId(curGx, curGy) ?? 0;
      const sameClusterTiles =
        clusterId > 0 && roadNet
          ? (this.cachedRoadTilesByCluster.get(clusterId) ?? this.cachedRoadTiles)
          : this.cachedRoadTiles;

      for (let attempt = 0; attempt < 5 && sameClusterTiles.length > 1; attempt++) {
        const pick = sameClusterTiles[(veh.id * 17 + state.tick * 7 + attempt * 13) % sameClusterTiles.length];
        if (pick.gx === curGx && pick.gy === curGy) continue;
        const path = PathfindingSystem.findPath(curGx, curGy, pick.gx, pick.gy, chunks, 'vehicle', 320, pathOpts);
        if (path && path.length > 0) {
          veh.route = path;
          veh.routeIdx = 0;
          veh.routeVersion = roadNet?.networkVersion ?? 1;
          veh.prevGx = curGx;
          veh.prevGy = curGy;
          veh.nextGx = path[0].gx;
          veh.nextGy = path[0].gy;
          veh.progress = 0;
          veh.state = 'en_route';
          veh.blockedSec = 0;
          veh.statusReason = 'Patrolling connected road network';
          return true;
        }
      }
    }

    veh.route = [];
    veh.routeIdx = 0;
    veh.state = 'idle';
    veh.speed = 0;
    veh.waitTimer = 1.6 + (veh.id % 5) * 0.25;
    veh.statusReason = 'Blocked: No connected road route';
    return false;
  }

  private rerouteOrRecover(
    veh: RoadVehicleAgent,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet?: RoadNetworkSystem,
    cachedBuildings?: BuildingInstance[]
  ): void {
    const tx = Math.round(veh.gx);
    const ty = Math.round(veh.gy);
    let onRoadNow = this.roadSet.has(tileKey(tx, ty));
    if (!onRoadNow) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (this.roadSet.has(tileKey(nx, ny))) {
          veh.gx = nx;
          veh.gy = ny;
          veh.prevGx = nx;
          veh.prevGy = ny;
          veh.nextGx = nx;
          veh.nextGy = ny;
          veh.progress = 1;
          onRoadNow = true;
          break;
        }
      }
    }

    if (!onRoadNow) {
      veh.route = [];
      veh.routeIdx = 0;
      veh.state = 'idle';
      veh.speed = 0;
      veh.waitTimer = 2.0;
      veh.statusReason = 'Halted: Road removed underneath vehicle';
      return;
    }

    if (veh.route.length > 0) {
      const goal = veh.route[veh.route.length - 1];
      const curX = Math.round(veh.gx);
      const curY = Math.round(veh.gy);
      if (this.roadSet.has(tileKey(goal.gx, goal.gy))) {
        const curCid = roadNet ? roadNet.getRoadClusterId(curX, curY) : 0;
        const goalCid = roadNet ? roadNet.getRoadClusterId(goal.gx, goal.gy) : 0;
        if (curCid === 0 || goalCid === 0 || curCid === goalCid) {
          const newPath = PathfindingSystem.findPath(curX, curY, goal.gx, goal.gy, chunks, 'vehicle', 480, {
            vehicleClass: veh.vehicleClass,
            congestionMap: roadNet?.getTileCongestionMap(),
          });
          if (newPath && newPath.length > 0) {
            veh.route = newPath;
            veh.routeIdx = 0;
            veh.routeVersion = roadNet?.networkVersion ?? 1;
            veh.prevGx = curX;
            veh.prevGy = curY;
            veh.nextGx = newPath[0].gx;
            veh.nextGy = newPath[0].gy;
            veh.progress = 0;
            veh.state = 'en_route';
            veh.blockedSec = 0;
            veh.statusReason = 'Rerouted on road network';
            return;
          }
        }
      }
    }

    this.assignTrip(veh, state, chunks, roadNet, cachedBuildings);
  }

  private applyDeliveryCompletion(
    veh: RoadVehicleAgent,
    state: WorldEngineState,
    onEvent?: (ev: TransportDeliveryEvent) => void
  ): void {
    if (veh.returning) return;
    const dest = veh.destBuildingId ? state.buildings.find((b) => b.id === veh.destBuildingId) : undefined;
    if (!dest) return;

    if (veh.kind === 'construction_truck' && dest.status === 'constructing') {
      dest.buildProgress = Math.min(0.99, dest.buildProgress + 0.04);
      if (veh.id % 2 === 0) {
        onEvent?.({ gx: dest.gx, gy: dest.gy, label: '+4% Build Supply', color: '#fbbf24' });
      }
      return;
    }

    if (
      veh.cargoResource &&
      veh.cargoAmount &&
      veh.cargoAmount > 0 &&
      (veh.kind === 'cargo_truck' ||
        veh.kind === 'container_truck' ||
        veh.kind === 'delivery_van' ||
        veh.kind === 'fish_van' ||
        veh.kind === 'tractor')
    ) {
      const added = ResourceSystem.addClamped(state, veh.cargoResource, veh.cargoAmount);
      if (added > 0 && veh.id % 5 === 0) {
        onEvent?.({ gx: dest.gx, gy: dest.gy, label: `+${added} Freight`, color: '#38bdf8' });
      }
      const def = BUILDINGS[dest.defId];
      if (def?.exportsSurplus || def?.category === 'commercial') {
        state.coins += 1;
        state.stats.totalCoinsEarned += 1;
      }
    }
  }

  private stepRoadVehicles(
    dtSec: number,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem | undefined,
    simTimeSec: number,
    onEvent?: (ev: TransportDeliveryEvent) => void
  ): void {
    if (this.roadVehicles.length === 0 || this.roadSet.size === 0) return;

    const tileBuckets = new Map<number, RoadVehicleAgent[]>();
    for (let i = 0; i < this.roadVehicles.length; i++) {
      const v = this.roadVehicles[i];
      const key = tileKey(Math.round(v.gx), Math.round(v.gy));
      let list = tileBuckets.get(key);
      if (!list) {
        list = [];
        tileBuckets.set(key, list);
      }
      list.push(v);
    }

    const netVer = roadNet?.networkVersion ?? 1;
    let aStarBudget = 3;
    let cachedBuildings: BuildingInstance[] | undefined = undefined;

    for (let vi = 0; vi < this.roadVehicles.length; vi++) {
      const veh = this.roadVehicles[vi];
      const tx = Math.round(veh.gx);
      const ty = Math.round(veh.gy);

      if (!this.roadSet.has(tileKey(tx, ty))) {
        if (aStarBudget > 0) {
          aStarBudget--;
          if (!cachedBuildings) cachedBuildings = this.getRoadAccessibleBuildings(state, chunks, roadNet);
          this.rerouteOrRecover(veh, state, chunks, roadNet, cachedBuildings);
        } else {
          veh.waitTimer = 0.2;
        }
        continue;
      }

      if (veh.state === 'loading' || veh.state === 'unloading' || veh.state === 'idle') {
        veh.speed = 0;
        veh.waitTimer -= dtSec;
        if (veh.waitTimer <= 0) {
          if (aStarBudget > 0) {
            aStarBudget--;
            if (veh.state === 'unloading') {
              veh.returning = !veh.returning;
            }
            if (!cachedBuildings) cachedBuildings = this.getRoadAccessibleBuildings(state, chunks, roadNet);
            this.assignTrip(veh, state, chunks, roadNet, cachedBuildings);
          } else {
            veh.waitTimer = 0.18 + (veh.id % 4) * 0.06;
          }
        }
        continue;
      }

      if (roadNet && veh.routeVersion !== netVer) {
        let routeIntact = veh.route.length > 0 && veh.routeIdx < veh.route.length;
        if (routeIntact) {
          const lookaheadEnd = Math.min(veh.route.length, veh.routeIdx + 8);
          let px = tx;
          let py = ty;
          for (let i = veh.routeIdx; i < lookaheadEnd; i++) {
            const wp = veh.route[i];
            if (!PathfindingSystem.isEdgeTraversable(px, py, wp.gx, wp.gy, chunks, 'vehicle')) {
              routeIntact = false;
              break;
            }
            px = wp.gx;
            py = wp.gy;
          }
        }
        if (routeIntact) {
          veh.routeVersion = netVer;
        } else if (aStarBudget > 0) {
          aStarBudget--;
          if (!cachedBuildings) cachedBuildings = this.getRoadAccessibleBuildings(state, chunks, roadNet);
          this.rerouteOrRecover(veh, state, chunks, roadNet, cachedBuildings);
          continue;
        } else {
          continue;
        }
      }

      if (veh.progress >= 1 || (veh.nextGx === veh.prevGx && veh.nextGy === veh.prevGy)) {
        if (veh.routeIdx >= veh.route.length) {
          if (!veh.returning) {
            this.applyDeliveryCompletion(veh, state, onEvent);
          }
          veh.cargoAmount = 0;
          veh.cargoResource = undefined;
          veh.state = 'unloading';
          veh.waitTimer = veh.returning ? 0.5 : 0.85;
          veh.speed = 0;
          continue;
        }

        const wp = veh.route[veh.routeIdx];
        const dx = wp.gx - tx;
        const dy = wp.gy - ty;

        if (Math.abs(dx) + Math.abs(dy) !== 1) {
          if (aStarBudget > 0) {
            aStarBudget--;
            if (!cachedBuildings) cachedBuildings = this.getRoadAccessibleBuildings(state, chunks, roadNet);
            this.rerouteOrRecover(veh, state, chunks, roadNet, cachedBuildings);
          }
          continue;
        }

        if (!PathfindingSystem.isEdgeTraversable(tx, ty, wp.gx, wp.gy, chunks, 'vehicle')) {
          if (aStarBudget > 0) {
            aStarBudget--;
            if (!cachedBuildings) cachedBuildings = this.getRoadAccessibleBuildings(state, chunks, roadNet);
            this.rerouteOrRecover(veh, state, chunks, roadNet, cachedBuildings);
          }
          continue;
        }

        if (roadNet && veh.vehicleClass !== 'emergency') {
          const sig = roadNet.getSignalState(wp.gx, wp.gy, dx, dy, simTimeSec, chunks);
          if (sig === 'red') {
            veh.state = 'waiting_signal';
            veh.speed = 0;
            veh.blockedSec += dtSec;
            continue;
          }
        }

        const nextOcc = tileBuckets.get(tileKey(wp.gx, wp.gy));
        if (nextOcc && nextOcc.length > 0) {
          const wpChunk = chunks.getLoadedChunkForGrid(wp.gx, wp.gy);
          const nrt = wpChunk ? (wpChunk.roadType[localTileIndex(wp.gx, wp.gy)] as RoadType) : RoadType.None;
          const cap = Math.max(1, getRoadProperties(nrt).lanesPerDirection) + 1;
          let blockedByAhead = nextOcc.length >= cap;
          if (!blockedByAhead) {
            for (let oi = 0; oi < nextOcc.length; oi++) {
              const other = nextOcc[oi];
              if (other.id !== veh.id && other.progress < 0.42 && (other.vx !== dx || other.vy !== dy)) {
                blockedByAhead = true;
                break;
              }
            }
          }
          if (blockedByAhead) {
            veh.state = 'waiting_traffic';
            veh.speed = 0;
            veh.blockedSec += dtSec;
            const staggerThresh = 3.5 + (veh.id % 7) * 0.35;
            if (veh.blockedSec > staggerThresh && aStarBudget > 0) {
              aStarBudget--;
              if (!cachedBuildings) cachedBuildings = this.getRoadAccessibleBuildings(state, chunks, roadNet);
              this.rerouteOrRecover(veh, state, chunks, roadNet, cachedBuildings);
            }
            continue;
          }
        }

        veh.prevGx = tx;
        veh.prevGy = ty;
        veh.nextGx = wp.gx;
        veh.nextGy = wp.gy;
        veh.vx = dx;
        veh.vy = dy;
        veh.facing = dx - dy >= 0 ? 1 : -1;
        veh.progress = 0;
        veh.state = 'en_route';
        veh.blockedSec = 0;
      }

      const dirX = veh.nextGx - veh.prevGx;
      const dirY = veh.nextGy - veh.prevGy;
      if (Math.abs(dirX) + Math.abs(dirY) !== 1) {
        if (aStarBudget > 0) {
          aStarBudget--;
          if (!cachedBuildings) cachedBuildings = this.getRoadAccessibleBuildings(state, chunks, roadNet);
          this.rerouteOrRecover(veh, state, chunks, roadNet, cachedBuildings);
        }
        continue;
      }

      let leaderCapSpeed = Infinity;
      const pKey = tileKey(veh.prevGx, veh.prevGy);
      const nKey = tileKey(veh.nextGx, veh.nextGy);
      const pList = tileBuckets.get(pKey);
      if (pList) {
        for (let pi = 0; pi < pList.length; pi++) {
          const peer = pList[pi];
          if (peer.id === veh.id) continue;
          if (peer.prevGx === veh.prevGx && peer.prevGy === veh.prevGy && peer.nextGx === veh.nextGx && peer.nextGy === veh.nextGy) {
            const gap = peer.progress - veh.progress;
            if (gap > 0 && gap < 0.44) {
              leaderCapSpeed = Math.min(leaderCapSpeed, peer.speed * 0.85);
              if (gap < 0.25) leaderCapSpeed = 0;
            }
          }
        }
      }
      if (nKey !== pKey) {
        const nList = tileBuckets.get(nKey);
        if (nList) {
          for (let pi = 0; pi < nList.length; pi++) {
            const peer = nList[pi];
            if (peer.id === veh.id) continue;
            if (peer.prevGx === veh.prevGx && peer.prevGy === veh.prevGy && peer.nextGx === veh.nextGx && peer.nextGy === veh.nextGy) {
              const gap = peer.progress - veh.progress;
              if (gap > 0 && gap < 0.44) {
                leaderCapSpeed = Math.min(leaderCapSpeed, peer.speed * 0.85);
                if (gap < 0.25) leaderCapSpeed = 0;
              }
            }
          }
        }
      }

      const curChunk = chunks.getLoadedChunkForGrid(tx, ty);
      const rt = curChunk ? (curChunk.roadType[localTileIndex(tx, ty)] as RoadType) : RoadType.None;
      const roadSpeedMult = ROADS[rt]?.speedMultiplier ?? 1.0;
      const cong = roadNet?.getTileCongestion(tx, ty) ?? 0;
      const desiredSpeed = Math.min(
        leaderCapSpeed,
        veh.maxSpeed * Math.min(2.3, roadSpeedMult) * Math.max(0.45, 1 - cong * 0.45)
      );

      if (desiredSpeed <= 0.05) {
        veh.speed = Math.max(0, veh.speed - 7.5 * dtSec);
        veh.state = 'waiting_traffic';
        veh.blockedSec += dtSec;
        const staggerThresh = 3.8 + (veh.id % 7) * 0.35;
        if (veh.blockedSec > staggerThresh && aStarBudget > 0) {
          aStarBudget--;
          if (!cachedBuildings) cachedBuildings = this.getRoadAccessibleBuildings(state, chunks, roadNet);
          this.rerouteOrRecover(veh, state, chunks, roadNet, cachedBuildings);
        }
        continue;
      }

      veh.state = 'en_route';
      veh.blockedSec = 0;
      veh.speed =
        veh.speed < desiredSpeed
          ? Math.min(desiredSpeed, veh.speed + 5.5 * dtSec)
          : Math.max(desiredSpeed, veh.speed - 7.0 * dtSec);

      veh.progress = Math.min(1, veh.progress + veh.speed * dtSec);
      veh.gx = veh.prevGx + dirX * veh.progress;
      veh.gy = veh.prevGy + dirY * veh.progress;
      veh.laneOffset = getLaneOffsetForTile(tx, ty, veh.id, chunks);

      if (veh.progress >= 1) {
        veh.gx = veh.nextGx;
        veh.gy = veh.nextGy;
        veh.routeIdx += 1;
      }
    }
  }
}
