import { BUILDINGS } from '../data/buildings.data';
import { TECH_MAP, TECH_TREE, TechDef } from '../data/techTree.data';
import type { WorldEngineState } from '../core/GameState';
import { getBuildingStatsAtLevel } from './BuildingSimulation';

export interface TechModifiers {
  chopDamageMult: number;
  farmYieldMult: number;
  buildSpeedMult: number;
  mineYieldMult: number;
  prodSpeedMult: number;
  researchSpeedMult: number;
  workerNeedReduction: number;
  pollutionReduction: number;
}

export class TechSystem {
  public static getAggregatedModifiers(state: WorldEngineState): TechModifiers {
    const mods: TechModifiers = {
      chopDamageMult: 1,
      farmYieldMult: 1,
      buildSpeedMult: 1,
      mineYieldMult: 1,
      prodSpeedMult: 1,
      researchSpeedMult: 1,
      workerNeedReduction: 0,
      pollutionReduction: 0,
    };

    for (const id of state.unlockedTechIds) {
      const def = TECH_MAP[id];
      if (!def?.modifiers) continue;
      if (def.modifiers.chopDamageMult) mods.chopDamageMult *= def.modifiers.chopDamageMult;
      if (def.modifiers.farmYieldMult) mods.farmYieldMult += def.modifiers.farmYieldMult;
      if (def.modifiers.buildSpeedMult) mods.buildSpeedMult += def.modifiers.buildSpeedMult;
      if (def.modifiers.mineYieldMult) mods.mineYieldMult += def.modifiers.mineYieldMult;
      if (def.modifiers.prodSpeedMult) mods.prodSpeedMult += def.modifiers.prodSpeedMult;
      if (def.modifiers.researchSpeedMult) mods.researchSpeedMult += def.modifiers.researchSpeedMult;
      if (def.modifiers.workerNeedReduction) mods.workerNeedReduction += def.modifiers.workerNeedReduction;
      if (def.modifiers.pollutionReduction) mods.pollutionReduction += def.modifiers.pollutionReduction;
    }

    mods.workerNeedReduction = Math.min(0.45, mods.workerNeedReduction);
    mods.pollutionReduction = Math.min(0.65, mods.pollutionReduction);
    return mods;
  }

  public static canStartTech(state: WorldEngineState, techId: string): { ok: boolean; reason?: string } {
    const def = TECH_MAP[techId];
    if (!def) return { ok: false, reason: 'Unknown technology' };
    if (state.unlockedTechIds.includes(techId)) return { ok: false, reason: 'Already researched' };
    if (state.activeTechId === techId) return { ok: false, reason: 'Already researching' };
    for (const pre of def.prerequisites) {
      if (!state.unlockedTechIds.includes(pre)) {
        return { ok: false, reason: `Requires ${TECH_MAP[pre]?.name ?? pre}` };
      }
    }
    if (state.coins < def.coinCost) {
      return { ok: false, reason: `Needs ${def.coinCost} Coins` };
    }
    return { ok: true };
  }

  public static startTech(state: WorldEngineState, techId: string): { ok: boolean; reason?: string } {
    const check = this.canStartTech(state, techId);
    if (!check.ok) return check;
    const def = TECH_MAP[techId]!;
    state.coins -= def.coinCost;
    state.activeTechId = techId;
    state.activeTechProgress = 0;
    return { ok: true };
  }

  public static tickResearch(
    state: WorldEngineState,
    mods: TechModifiers,
    onUnlock: (tech: TechDef) => void
  ): void {
    // Passive base 0.5 RP/min so early Axe Mastery is reachable even before Libraries
    let rpPerSec = 0.015;

    for (const b of state.buildings) {
      if (b.status !== 'active') continue;
      const def = BUILDINGS[b.defId];
      if (!def?.rpPerMin) continue;

      const stats = getBuildingStatsAtLevel(def, b.level);
      const workerScale = stats.maxWorkers > 0 ? Math.min(1, b.assignedWorkers / stats.maxWorkers) : 1;
      let paperOk = true;
      if (stats.rpPaperCostPerMin > 0 && state.tick % 20 === 0) {
        const paperNeed = Math.max(1, Math.round(stats.rpPaperCostPerMin / 3));
        if (state.resources.paper >= paperNeed) {
          state.resources.paper -= paperNeed;
        } else {
          paperOk = false;
        }
      }

      const efficiency = paperOk ? 1.0 : 0.45;
      rpPerSec += (stats.rpPerMin / 60) * workerScale * efficiency * mods.researchSpeedMult;
    }

    if (state.activePolicies?.includes('scholar_grants')) {
      rpPerSec *= 1.35;
    }
    if (state.activeEvent?.id === 'scholar_symposium') {
      rpPerSec *= 1.4;
    }

    state.researchPoints += rpPerSec;

    if (!state.activeTechId) return;
    const active = TECH_MAP[state.activeTechId];
    if (!active) {
      state.activeTechId = null;
      return;
    }

    // Transfer accumulated RP into active tech
    const needed = Math.max(0, active.rpCost - state.activeTechProgress);
    const spend = Math.min(needed, state.researchPoints);
    state.researchPoints -= spend;
    state.activeTechProgress += spend;

    if (state.activeTechProgress >= active.rpCost - 0.001) {
      state.unlockedTechIds.push(active.id);
      state.activeTechId = null;
      state.activeTechProgress = 0;
      onUnlock(active);
    }
  }

  public static getAllTechs(): TechDef[] {
    return TECH_TREE;
  }
}
