import { BUILDINGS } from '../data/buildings.data';
import { FOOD_RESOURCE_IDS, RESOURCE_LIST, RESOURCES, ResourceId } from '../data/resources.data';
import type { WorldEngineState } from '../core/GameState';
import { getBuildingStatsAtLevel } from './BuildingSimulation';

export class ResourceSystem {
  public static createInitialResources(): {
    resources: Record<ResourceId, number>;
    capacities: Record<ResourceId, number>;
  } {
    const resources = {} as Record<ResourceId, number>;
    const capacities = {} as Record<ResourceId, number>;
    for (const r of RESOURCE_LIST) {
      resources[r.id] = 0;
      capacities[r.id] = r.baseCap;
    }
    return { resources, capacities };
  }

  public static recalculateCapacities(state: WorldEngineState): void {
    let granaryBonus = 0;
    let warehouseBonus = 0;

    for (const b of state.buildings) {
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      const stats = getBuildingStatsAtLevel(def, b.level);
      granaryBonus += stats.granaryBonus;
      warehouseBonus += stats.warehouseBonus + stats.storageCapacityBonus;
    }

    for (const r of RESOURCE_LIST) {
      const bonus = r.storageGroup === 'granary' ? granaryBonus : warehouseBonus;
      state.capacities[r.id] = r.baseCap + bonus;
      // Preserve existing stored resources above reduced cap; new inflow blocks until stock drops below cap.
    }
  }

  public static canAfford(
    state: WorldEngineState,
    coinCost: number,
    materials: Partial<Record<ResourceId, number>>
  ): boolean {
    if (state.coins < coinCost) return false;
    for (const [id, amt] of Object.entries(materials)) {
      const req = amt ?? 0;
      if (req > 0 && (state.resources[id as ResourceId] ?? 0) < req) {
        return false;
      }
    }
    return true;
  }

  public static consume(
    state: WorldEngineState,
    coinCost: number,
    materials: Partial<Record<ResourceId, number>>
  ): boolean {
    if (!this.canAfford(state, coinCost, materials)) return false;
    state.coins = Math.max(0, state.coins - coinCost);
    for (const [id, amt] of Object.entries(materials)) {
      const req = amt ?? 0;
      if (req > 0) {
        const rid = id as ResourceId;
        state.resources[rid] = Math.max(0, state.resources[rid] - req);
      }
    }
    return true;
  }

  public static hasSpaceForAll(
    state: WorldEngineState,
    outputs: Partial<Record<ResourceId, number>>
  ): boolean {
    for (const [id, amt] of Object.entries(outputs)) {
      const add = amt ?? 0;
      if (add <= 0) continue;
      const rid = id as ResourceId;
      if (state.resources[rid] + add > state.capacities[rid]) {
        return false;
      }
    }
    return true;
  }

  public static addClamped(state: WorldEngineState, id: ResourceId, amount: number): number {
    if (amount <= 0) return 0;
    const cap = state.capacities[id] ?? 100;
    const before = state.resources[id] ?? 0;
    const after = Math.min(cap, before + amount);
    state.resources[id] = after;
    return after - before;
  }

  public static getTotalFoodUnits(state: WorldEngineState): number {
    let total = 0;
    for (const fid of FOOD_RESOURCE_IDS) {
      total += state.resources[fid] * RESOURCES[fid].foodValue;
    }
    return total;
  }

  public static consumeFoodUnits(state: WorldEngineState, nutritionNeeded: number): {
    satisfiedRatio: number;
    varietyCount: number;
  } {
    if (nutritionNeeded <= 0) {
      let variety = 0;
      for (const fid of FOOD_RESOURCE_IDS) {
        if (state.resources[fid] > 0) variety++;
      }
      return { satisfiedRatio: 1, varietyCount: variety };
    }

    let remaining = nutritionNeeded;
    let varietyCount = 0;
    // Prefer higher quality foods first
    const ordered = [...FOOD_RESOURCE_IDS].sort(
      (a, b) => RESOURCES[b].foodValue - RESOURCES[a].foodValue
    );

    for (const fid of ordered) {
      const avail = state.resources[fid];
      if (avail <= 0) continue;
      varietyCount++;
      const val = RESOURCES[fid].foodValue;
      const unitsToEat = Math.min(avail, remaining / val);
      state.resources[fid] = Math.max(0, avail - unitsToEat);
      remaining -= unitsToEat * val;
      if (remaining <= 0.001) {
        remaining = 0;
        break;
      }
    }

    const satisfiedRatio = Math.max(0, Math.min(1, (nutritionNeeded - remaining) / nutritionNeeded));
    return { satisfiedRatio, varietyCount };
  }
}
