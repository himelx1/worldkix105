import { BUILDINGS } from '../data/buildings.data';
import type { ChunkManager } from '../core/ChunkManager';
import type { WorldEngineState } from '../core/GameState';

export interface CityAdviceItem {
  id: string;
  severity: 'critical' | 'warning' | 'tip';
  title: string;
  detail: string;
}

export class AdvisorSystem {
  public static getAdvice(state: WorldEngineState, _chunks?: ChunkManager): CityAdviceItem[] {
    const items: CityAdviceItem[] = [];

    const noPower = state.buildings.filter((b) => b.status === 'no_power').length;
    if (noPower > 0) {
      items.push({
        id: 'power_outage',
        severity: 'critical',
        title: `${noPower} building${noPower > 1 ? 's' : ''} lack power`,
        detail: 'Connect Power Lines or Substations from a power generator to unpowered buildings.',
      });
    }

    if (state.utilitySummary?.powerBrownoutCount > 0) {
      items.push({
        id: 'power_brownout',
        severity: 'warning',
        title: `Power grid brownout (${state.powerGenerated}/${state.powerDemand} MW)`,
        detail: 'Connected demand exceeds generator capacity. Build or upgrade power generators.',
      });
    }

    const noWater = state.buildings.filter((b) => b.status === 'no_water').length;
    if (noWater > 0) {
      items.push({
        id: 'water_disconnected',
        severity: 'critical',
        title: `${noWater} building${noWater > 1 ? 's' : ''} disconnected from water`,
        detail: 'Lay Water Pipes or Water Pumps linking wells/pumps to industrial and civic structures.',
      });
    }

    if (state.waterDemand > 0 && state.waterGenerated < state.waterDemand) {
      items.push({
        id: 'water_shortage',
        severity: 'warning',
        title: `Water supply deficit (${state.waterGenerated}/${state.waterDemand})`,
        detail: 'Total water supply is below city demand. Build another Well or Water Pump.',
      });
    }

    const depletedMines = state.buildings.filter((b) => b.status === 'deposit_depleted').length;
    if (depletedMines > 0) {
      items.push({
        id: 'depleted_mines',
        severity: 'warning',
        title: `${depletedMines} mine${depletedMines > 1 ? 's' : ''} exhausted local veins`,
        detail: 'Demolish depleted mines and relocate to fresh mineral veins.',
      });
    }

    if (state.population.homeless > 0) {
      items.push({
        id: 'homeless',
        severity: 'warning',
        title: `${state.population.homeless} citizens lack housing`,
        detail: 'Build or upgrade residential housing to eliminate homelessness.',
      });
    }

    const noWorkers = state.buildings.filter((b) => b.status === 'no_workers').length;
    if (noWorkers > 0) {
      items.push({
        id: 'worker_shortage',
        severity: 'warning',
        title: `${noWorkers} building${noWorkers > 1 ? 's' : ''} need more workers`,
        detail: 'Add housing, recruit workers, or adjust category priorities.',
      });
    }

    const noRoad = state.buildings.filter((b) => b.status === 'no_road').length;
    if (noRoad > 0) {
      items.push({
        id: 'no_road',
        severity: 'warning',
        title: `${noRoad} building${noRoad > 1 ? 's' : ''} not beside a road`,
        detail: 'Connect buildings to your road network for worker access and deliveries.',
      });
    }

    if (state.buildings.length >= 8 && (state.utilitySummary?.serviceCoveragePct ?? 100) < 50) {
      items.push({
        id: 'sub_office_coverage',
        severity: 'tip',
        title: `District coverage at ${state.utilitySummary.serviceCoveragePct}%`,
        detail: 'Place Regional Sub-Offices near outlying districts for local tax, school, and worker boosts.',
      });
    }

    const congested = state.buildings.some((b) => (b.congestionFactor ?? 1) < 0.85);
    if (congested) {
      items.push({
        id: 'road_congestion',
        severity: 'tip',
        title: 'Road traffic congestion detected',
        detail: 'Upgrade Dirt roads to Stone/Paved roads or add a Cart Depot to speed deliveries.',
      });
    }

    if (items.length === 0 && state.buildings.length > 0) {
      const activeCount = state.buildings.filter((b) => b.status === 'active').length;
      const topDef = BUILDINGS[state.buildings[0].defId];
      void topDef;
      items.push({
        id: 'all_good',
        severity: 'tip',
        title: 'All city systems running smoothly',
        detail: `${activeCount} active buildings operating with balanced utilities and workforce.`,
      });
    }

    return items;
  }
}
