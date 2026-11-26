import { BUILDINGS, BuildingCategory } from '../data/buildings.data';
import type { BuildingInstance, WorldEngineState } from '../core/GameState';
import { getBuildingStatsAtLevel } from './BuildingSimulation';

const CATEGORY_ORDER: BuildingCategory[] = [
  'energy',
  'agricultural',
  'healthcare',
  'environmental',
  'production',
  'industrial',
  'commercial',
  'educational',
  'government',
  'transportation',
  'storage',
  'recreational',
  'residential',
];

const EMERGENCY_CATS = new Set<BuildingCategory>([
  'energy',
  'healthcare',
  'agricultural',
  'environmental',
]);

export class WorkforceSystem {
  public getEffectiveMaxWorkers(b: BuildingInstance, workerStrainReduction = 0): number {
    const def = BUILDINGS[b.defId];
    if (!def || def.maxWorkers <= 0) return 0;
    const baseMax = getBuildingStatsAtLevel(def, b.level).maxWorkers;
    return Math.max(1, Math.round(baseMax * (1 - workerStrainReduction)));
  }

  public assignWorkers(state: WorldEngineState, workerStrainReduction = 0): void {
    const total = Math.max(0, Math.floor(state.population.total));
    const children = total > 0 ? Math.floor(total * 0.12) : 0;
    const underage = total > 0 ? Math.floor(total * 0.1) : 0;
    const elderly = total > 0 ? Math.floor(total * 0.1) : 0;
    const availableWorkforce = Math.max(0, total - children - underage - elderly);

    let availableTotal = availableWorkforce;
    let employed = 0;
    let totalJobs = 0;

    // Reset assignments first
    for (const b of state.buildings) {
      b.assignedWorkers = 0;
    }

    const activeBuildings = state.buildings.filter(
      (b) => b.status !== 'constructing' && b.enabled && (BUILDINGS[b.defId]?.maxWorkers ?? 0) > 0
    );

    for (const b of activeBuildings) {
      totalJobs += this.getEffectiveMaxWorkers(b, workerStrainReduction);
    }

    const emergencyActive = (state.emergencyWorkTicksRemaining ?? 0) > 0;

    // Sort by emergency boost + player priority desc, then category critical order
    activeBuildings.sort((a, b) => {
      const defA = BUILDINGS[a.defId]!;
      const defB = BUILDINGS[b.defId]!;
      const basePrioA = state.workforcePriorities[defA.category] ?? 3;
      const basePrioB = state.workforcePriorities[defB.category] ?? 3;
      const prioA = emergencyActive && EMERGENCY_CATS.has(defA.category) ? 6 : basePrioA;
      const prioB = emergencyActive && EMERGENCY_CATS.has(defB.category) ? 6 : basePrioB;
      if (prioA !== prioB) return prioB - prioA;
      return CATEGORY_ORDER.indexOf(defA.category) - CATEGORY_ORDER.indexOf(defB.category);
    });

    // Pass 1: Assign manually pinned buildings first
    for (const b of activeBuildings) {
      const effectiveMax = this.getEffectiveMaxWorkers(b, workerStrainReduction);
      if (b.lockedWorkers !== null) {
        const want = Math.min(effectiveMax, Math.max(0, b.lockedWorkers));
        const give = Math.min(availableTotal, want);
        b.assignedWorkers = give;
        availableTotal -= give;
        employed += give;
      }
    }

    if (state.workforceAutoAssign !== false) {
      // Pass 2: Ensure minimum workers for unlocked buildings
      for (const b of activeBuildings) {
        if (b.lockedWorkers !== null) continue;
        const def = BUILDINGS[b.defId]!;
        const effectiveMax = this.getEffectiveMaxWorkers(b, workerStrainReduction);
        const minNeed = Math.min(availableTotal, Math.min(effectiveMax, def.minWorkers));
        b.assignedWorkers = minNeed;
        availableTotal -= minNeed;
        employed += minNeed;
      }

      // Pass 3: Fill up to effectiveMax proportionally by priority
      for (const b of activeBuildings) {
        if (availableTotal <= 0) break;
        if (b.lockedWorkers !== null) continue;
        const effectiveMax = this.getEffectiveMaxWorkers(b, workerStrainReduction);
        const room = Math.max(0, effectiveMax - b.assignedWorkers);
        const extra = Math.min(availableTotal, room);
        b.assignedWorkers += extra;
        availableTotal -= extra;
        employed += extra;
      }
    }

    state.population.availableWorkforce = availableWorkforce;
    state.population.totalJobs = totalJobs;
    state.population.occupiedJobs = employed;
    state.population.vacantJobs = Math.max(0, totalJobs - employed);
    state.population.employed = employed;
    state.population.unemployed = Math.max(0, availableWorkforce - employed);
  }

  public getWorkerEfficiency(b: BuildingInstance, state: WorldEngineState, workerStrainReduction = 0): number {
    const def = BUILDINGS[b.defId];
    if (!def || def.maxWorkers === 0) return 1.0;
    if (b.assignedWorkers < def.minWorkers || b.assignedWorkers === 0) return 0;

    const effectiveMax = this.getEffectiveMaxWorkers(b, workerStrainReduction);
    const ratio = Math.min(1.15, b.assignedWorkers / effectiveMax);
    const happinessMod = 0.65 + (state.population.happiness / 100) * 0.5;
    return Math.pow(ratio, 0.85) * happinessMod;
  }
}
