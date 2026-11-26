import type { ChunkManager } from '../core/ChunkManager';
import { WorldEngineState } from '../core/GameState';
import { unpackTileX, unpackTileY } from '../core/IsoMath';
import { BUILDINGS } from '../data/buildings.data';
import type { LogisticsAndTransportSystem } from './LogisticsAndTransportSystem';
import type { RoadNetworkSummary, RoadNetworkSystem } from './RoadNetworkSystem';
import { UtilityNetworkSystem } from './UtilityNetworkSystem';

export type DiagnosticCategory = 'all' | 'roads' | 'utilities' | 'vehicles';

export interface DiagnosticIssue {
  id: string;
  category: 'roads' | 'utilities' | 'vehicles';
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  resolutionHint: string;
  gx: number;
  gy: number;
  buildingId?: number;
}

export interface NetworkDiagnosticsReport {
  issues: DiagnosticIssue[];
  counts: {
    total: number;
    critical: number;
    warning: number;
    roads: number;
    utilities: number;
    vehicles: number;
  };
  roadSummary: RoadNetworkSummary;
  utilityHealth: {
    powerAvailableGen: number;
    powerDistCapacity: number;
    powerDemand: number;
    powerDelivered: number;
    waterAvailableGen: number;
    waterDistCapacity: number;
    waterDemand: number;
    waterDelivered: number;
  };
}

export class NetworkDiagnosticsSystem {
  public static analyze(
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem,
    logistics: LogisticsAndTransportSystem
  ): NetworkDiagnosticsReport {
    roadNet.recomputeIfDirty(chunks, state);
    const issues: DiagnosticIssue[] = [];
    const seenIds = new Set<string>();

    const pushIssue = (issue: DiagnosticIssue) => {
      if (seenIds.has(issue.id)) return;
      seenIds.add(issue.id);
      issues.push(issue);
    };

    // 1. Disconnected road clusters & congested corridors
    const clusterStats = roadNet.getAllClusterStats();
    const clusterRepTile = roadNet.getCachedClusterRepresentatives();

    for (const info of clusterStats.values()) {
      if (info.roadClass !== 'road' || !info.isDisconnected) continue;
      const rep = clusterRepTile.get(info.id) ?? { gx: 0, gy: 0 };
      pushIssue({
        id: `road_cluster_${info.id}`,
        category: 'roads',
        severity: info.buildings > 0 ? 'critical' : 'warning',
        title: `Disconnected Road Segment (#${info.id})`,
        detail: `${info.count} road ${info.count === 1 ? 'tile' : 'tiles'} isolated from the main road network${info.buildings > 0 ? ` (${info.buildings} buildings affected)` : ''}.`,
        resolutionHint: 'Link this segment to the main road network.',
        gx: rep.gx,
        gy: rep.gy,
      });
    }

    // Top congested road corridors
    const hotRoads: Array<{ gx: number; gy: number; load: number }> = [];
    for (const [k, load] of roadNet.getTileCongestionMap().entries()) {
      if (load < 0.65) continue;
      hotRoads.push({ gx: unpackTileX(k), gy: unpackTileY(k), load });
    }
    hotRoads.sort((a, b) => b.load - a.load);
    for (const hr of hotRoads.slice(0, 4)) {
      pushIssue({
        id: `road_cong_${hr.gx}_${hr.gy}`,
        category: 'roads',
        severity: hr.load >= 0.85 ? 'critical' : 'warning',
        title: `Heavy Traffic Congestion (${Math.round(hr.load * 100)}%)`,
        detail: `Road bottleneck detected at (${hr.gx}, ${hr.gy}) slowing cargo & commuter traffic.`,
        resolutionHint: 'Upgrade to Two-Lane / Four-Lane / Highway or add bypass parallel routes.',
        gx: hr.gx,
        gy: hr.gy,
      });
    }

    // 2. Building-level Roads, Power & Water diagnostics
    for (const b of state.buildings) {
      if (b.status === 'constructing' || !b.enabled) continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;

      const access = roadNet.getCachedRoadAccess(b, chunks);
      const needsHeavy =
        def.category === 'industrial' ||
        def.category === 'production' ||
        def.category === 'storage' ||
        def.subCategory === 'trade_port' ||
        (def.truckCapacity ?? 0) > 0;

      if (def.requiresRoad && access.accessPoints.length === 0) {
        pushIssue({
          id: `bldg_no_road_${b.id}`,
          category: 'roads',
          severity: 'critical',
          title: `${def.name}: No Road Access`,
          detail: b.roadReason || `Building at (${b.gx}, ${b.gy}) is not adjacent to any drivable road.`,
          resolutionHint: 'Build a road adjacent to the building footprint.',
          gx: b.gx,
          gy: b.gy,
          buildingId: b.id,
        });
      } else if (needsHeavy && access.restrictedForHeavyTrucks) {
        pushIssue({
          id: `bldg_heavy_road_${b.id}`,
          category: 'roads',
          severity: 'warning',
          title: `${def.name}: Heavy Truck Restricted`,
          detail: `Connected only to dirt/residential lanes at (${b.gx}, ${b.gy}); heavy freight trucks face speed & route penalties.`,
          resolutionHint: 'Upgrade adjacent road to Paved, Industrial, Two-Lane, or Four-Lane Road.',
          gx: b.gx,
          gy: b.gy,
          buildingId: b.id,
        });
      }

      if ((def.powerDemand ?? 0) > 0 && b.powerReason && b.powerReason !== 'ok') {
        const isCritical = !b.powerConnected || (b.powerSatisfaction ?? 0) <= 0.1;
        const hintMap: Record<string, string> = {
          not_connected_to_network: 'Connect this building via a continuous road or Power Line to a generator.',
          disconnected_section_no_source: 'Link this isolated road/wire network to a running Power Plant or Generator.',
          source_inactive: 'Fuel, staff, or enable the connected power generator.',
          distribution_overloaded: 'Expand generation on this connected network.',
          insufficient_supply: 'Build additional Power Generators or upgrade existing ones on this network.',
        };
        pushIssue({
          id: `bldg_power_${b.id}`,
          category: 'utilities',
          severity: isCritical ? 'critical' : 'warning',
          title: `${def.name}: Power ${b.powerReason.replace(/_/g, ' ')}`,
          detail: `Grid delivery at ${Math.round((b.powerSatisfaction ?? 0) * 100)}% (${b.gx}, ${b.gy}).`,
          resolutionHint: hintMap[b.powerReason] ?? 'Check Power Grid overlay.',
          gx: b.gx,
          gy: b.gy,
          buildingId: b.id,
        });
      }

      if ((def.waterDemand ?? 0) > 0 && b.waterReason && b.waterReason !== 'ok') {
        const isCritical = !b.waterConnected || (b.waterSatisfaction ?? 0) <= 0.1;
        const hintMap: Record<string, string> = {
          not_connected_to_network: 'Connect this building via a continuous road or Water Pipe to a water source.',
          disconnected_section_no_source: 'Connect this isolated road/pipe segment to a working Water Source.',
          source_inactive: 'Staff, power, or enable the connected Water Source.',
          distribution_overloaded: 'Expand water production on this connected network.',
          insufficient_supply: 'Construct or upgrade a Water Tower, Well, or Treatment Plant on this network.',
        };
        pushIssue({
          id: `bldg_water_${b.id}`,
          category: 'utilities',
          severity: isCritical ? 'critical' : 'warning',
          title: `${def.name}: Water ${b.waterReason.replace(/_/g, ' ')}`,
          detail: `Water flow at ${Math.round((b.waterSatisfaction ?? 0) * 100)}% (${b.gx}, ${b.gy}).`,
          resolutionHint: hintMap[b.waterReason] ?? 'Check Water Network overlay.',
          gx: b.gx,
          gy: b.gy,
          buildingId: b.id,
        });
      }
    }

    // 3. Orphaned power lines & water pipes (tiles without any source connected)
    const snap = UtilityNetworkSystem.getLastSnapshot();
    if (snap) {
      let orphanPowerReported = 0;
      for (const key of snap.powerTiles) {
        if (snap.powerTileNet.has(key)) continue;
        const gx = unpackTileX(key);
        const gy = unpackTileY(key);
        pushIssue({
          id: `orphan_power_${Math.floor(gx / 8)}_${Math.floor(gy / 8)}`,
          category: 'utilities',
          severity: 'warning',
          title: `Disconnected Power Line Section`,
          detail: `Power line at (${gx}, ${gy}) is not linked to any power generator.`,
          resolutionHint: 'Connect this wire run to a Solar Array, Wind Turbine, or Coal Power Plant.',
          gx,
          gy,
        });
        if (++orphanPowerReported >= 4) break;
      }

      let orphanWaterReported = 0;
      for (const key of snap.waterTiles) {
        if (snap.waterTileNet.has(key)) continue;
        const gx = unpackTileX(key);
        const gy = unpackTileY(key);
        pushIssue({
          id: `orphan_water_${Math.floor(gx / 8)}_${Math.floor(gy / 8)}`,
          category: 'utilities',
          severity: 'warning',
          title: `Disconnected Water Pipe Section`,
          detail: `Water pipe at (${gx}, ${gy}) has no active water source connected.`,
          resolutionHint: 'Link this pipe network to a Water Well, Water Tower, or Pumping Station.',
          gx,
          gy,
        });
        if (++orphanWaterReported >= 4) break;
      }
    }

    // 4. Vehicle & Logistics route diagnostics
    for (const rd of logistics.getRouteDiagnostics()) {
      pushIssue({
        id: `log_${rd.id}`,
        category: 'vehicles',
        severity: rd.severity,
        title: rd.title,
        detail: rd.detail,
        resolutionHint: 'Verify valid drivable road connectivity and widen bottlenecked segments.',
        gx: rd.gx,
        gy: rd.gy,
      });
    }

    for (const rv of logistics.roadVehicles) {
      if (rv.blockedSec >= 4.0) {
        pushIssue({
          id: `veh_stalled_${rv.id}`,
          category: 'vehicles',
          severity: 'warning',
          title: `Cargo Vehicle #${rv.id} Delayed`,
          detail: rv.statusReason ?? `Delayed by traffic or dead-end near (${Math.round(rv.gx)}, ${Math.round(rv.gy)}).`,
          resolutionHint: 'Check one-way lane directions or widen intersecting roads.',
          gx: Math.round(rv.gx),
          gy: Math.round(rv.gy),
          buildingId: rv.sourceBuildingId,
        });
      }
    }

    issues.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return a.category.localeCompare(b.category);
    });

    const counts = {
      total: issues.length,
      critical: issues.filter((i) => i.severity === 'critical').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      roads: issues.filter((i) => i.category === 'roads').length,
      utilities: issues.filter((i) => i.category === 'utilities').length,
      vehicles: issues.filter((i) => i.category === 'vehicles').length,
    };

    return {
      issues,
      counts,
      roadSummary: roadNet.getNetworkSummary(logistics.roadVehicles.length),
      utilityHealth: {
        powerAvailableGen: state.powerAvailableGen ?? state.powerGenerated ?? 0,
        powerDistCapacity: state.powerDistCapacity ?? 0,
        powerDemand: state.powerDemand ?? 0,
        powerDelivered: state.powerDelivered ?? 0,
        waterAvailableGen: state.waterAvailableGen ?? state.waterGenerated ?? 0,
        waterDistCapacity: state.waterDistCapacity ?? 0,
        waterDemand: state.waterDemand ?? 0,
        waterDelivered: state.waterDelivered ?? 0,
      },
    };
  }
}
