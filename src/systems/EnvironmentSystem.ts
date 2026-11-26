import { BUILDINGS } from '../data/buildings.data';
import { FeatureType, isTreeFeature } from '../data/trees.data';
import type { ChunkManager } from '../core/ChunkManager';
import { SeasonType, TileFlag, WeatherType, WorldEngineState } from '../core/GameState';
import { CHUNK_SIZE, gridToChunk } from '../core/IsoMath';

import { DAYS_PER_WEEK, MONTHS_PER_SEASON, MONTHS_PER_YEAR, WEEKS_PER_MONTH } from '../core/GameState';

const SEASONS: SeasonType[] = ['spring', 'summer', 'autumn', 'winter'];
const DAYS_PER_MONTH = DAYS_PER_WEEK * WEEKS_PER_MONTH; // 28
const DAYS_PER_SEASON = DAYS_PER_MONTH * MONTHS_PER_SEASON; // 84

export interface CalendarAdvanceResult {
  dayChanged: boolean;
  weekChanged: boolean;
  monthChanged: boolean;
  yearChanged: boolean;
}

export interface ClimateModifiers {
  farmMult: number;
  treeRegrowthMult: number;
  windPowerMult: number;
  solarPowerMult: number;
  waterDemandMult: number;
  buildSpeedMult: number;
}

export class EnvironmentSystem {
  public static getClimateModifiers(state: WorldEngineState): ClimateModifiers {
    let farmMult = 1.0;
    let treeRegrowthMult = 1.0;
    let windPowerMult = 1.0;
    let solarPowerMult = 1.0;
    let waterDemandMult = 1.0;
    let buildSpeedMult = 1.0;

    switch (state.season) {
      case 'spring':
        farmMult = 1.05;
        treeRegrowthMult = 1.25;
        break;
      case 'summer':
        farmMult = 1.2;
        solarPowerMult = 1.2;
        waterDemandMult = 1.15;
        break;
      case 'autumn':
        farmMult = 1.15;
        break;
      case 'winter':
        farmMult = 0.55;
        solarPowerMult = 0.7;
        buildSpeedMult = 0.85;
        break;
    }

    switch (state.weather) {
      case 'rain':
        farmMult *= 1.12;
        treeRegrowthMult *= 1.25;
        solarPowerMult *= 0.75;
        break;
      case 'storm':
        windPowerMult *= 1.35;
        solarPowerMult *= 0.55;
        buildSpeedMult *= 0.8;
        break;
      case 'drought':
        farmMult *= 0.7;
        waterDemandMult *= 1.35;
        solarPowerMult *= 1.25;
        break;
      case 'snow':
        farmMult *= 0.65;
        buildSpeedMult *= 0.8;
        break;
      case 'clear':
      default:
        break;
    }

    if (state.settings.difficulty === 'relaxed') {
      farmMult = Math.max(0.85, farmMult);
      buildSpeedMult = Math.max(0.95, buildSpeedMult);
      waterDemandMult = Math.min(1.1, waterDemandMult);
    }

    return {
      farmMult,
      treeRegrowthMult,
      windPowerMult,
      solarPowerMult,
      waterDemandMult,
      buildSpeedMult,
    };
  }

  public static getMonthName(month: number): string {
    const names = [
      'Month 1',
      'Month 2',
      'Month 3',
      'Month 4',
      'Month 5',
      'Month 6',
      'Month 7',
      'Month 8',
      'Month 9',
      'Month 10',
      'Month 11',
      'Month 12',
    ];
    return names[((month - 1) % 12 + 12) % 12];
  }

  public static getCalendarMonthKey(cal: { year: number; month: number }): string {
    return `Y${cal.year}-M${String(cal.month).padStart(2, '0')}`;
  }

  public static syncCalendarToLegacyFields(state: WorldEngineState): void {
    const cal = state.calendar;
    const clampedMonth = Math.max(1, Math.min(MONTHS_PER_YEAR, Math.floor(cal.month || 1)));
    const seasonIdx = Math.floor((clampedMonth - 1) / MONTHS_PER_SEASON);
    const monthInSeason = (clampedMonth - 1) % MONTHS_PER_SEASON;
    const dayInMonth = (cal.weekOfMonth - 1) * DAYS_PER_WEEK + cal.dayOfWeek;
    state.year = Math.max(1, Math.floor(cal.year || 1));
    state.season = SEASONS[seasonIdx] ?? 'spring';
    state.dayInSeason = Math.max(1, Math.min(DAYS_PER_SEASON, monthInSeason * DAYS_PER_MONTH + dayInMonth));
  }

  public static advanceCalendarDay(state: WorldEngineState): CalendarAdvanceResult {
    if (!state.calendar) {
      state.calendar = {
        dayOfWeek: 1,
        weekOfMonth: 1,
        month: 1,
        year: Math.max(1, state.year || 1),
        totalDaysElapsed: 0,
      };
    }

    const cal = state.calendar;
    let weekChanged = false;
    let monthChanged = false;
    let yearChanged = false;

    cal.totalDaysElapsed = Math.max(0, Math.floor(cal.totalDaysElapsed || 0)) + 1;
    cal.dayOfWeek += 1;
    if (cal.dayOfWeek > DAYS_PER_WEEK) {
      cal.dayOfWeek = 1;
      cal.weekOfMonth += 1;
      weekChanged = true;
      if (cal.weekOfMonth > WEEKS_PER_MONTH) {
        cal.weekOfMonth = 1;
        cal.month += 1;
        monthChanged = true;
        if (cal.month > MONTHS_PER_YEAR) {
          cal.month = 1;
          cal.year += 1;
          yearChanged = true;
        }
      }
    }

    this.syncCalendarToLegacyFields(state);

    return {
      dayChanged: true,
      weekChanged,
      monthChanged,
      yearChanged,
    };
  }

  public static tickSeasonAndWeather(state: WorldEngineState): void {

    const rollNextWeather = (season: SeasonType, seedVal: number): WeatherType => {
      const roll = Math.abs((seedVal * 7919) ^ state.worldSeed) % 100;
      if (season === 'spring') {
        return roll < 45 ? 'rain' : roll < 60 ? 'storm' : 'clear';
      } else if (season === 'summer') {
        return roll < 22 && state.settings.mildDisasters ? 'drought' : roll < 38 ? 'storm' : 'clear';
      } else if (season === 'autumn') {
        return roll < 35 ? 'rain' : roll < 50 ? 'storm' : 'clear';
      }
      return roll < 45 ? 'snow' : roll < 60 ? 'rain' : 'clear';
    };

    state.weatherTicksRemaining -= 1;
    if (state.weatherTicksRemaining <= 0) {
      state.weatherTicksRemaining = 75 + ((state.tick * 31) % 65);
      state.weather = state.nextWeather ?? rollNextWeather(state.season, state.tick);
      state.nextWeather = rollNextWeather(state.season, state.tick + 137);
    }
  }

  public static tickWorldEvents(state: WorldEngineState): { startedTitle?: string; startedDesc?: string } {
    if (state.activeEvent) {
      state.activeEvent.ticksRemaining -= 1;
      if (state.activeEvent.ticksRemaining <= 0) {
        state.activeEvent = null;
      }
      return {};
    }

    if (state.tick >= 90 && state.tick % 140 === 0) {
      const pool = [
        {
          id: 'merchant_caravan' as const,
          title: 'Merchant Caravan',
          description: '+25% export sell prices for 48s.',
        },
        {
          id: 'bountiful_harvest' as const,
          title: 'Bountiful Harvest',
          description: '+35% Farm & Grove output for 48s.',
        },
        {
          id: 'gold_rush' as const,
          title: 'Highland Mineral Vein',
          description: '+35% Mine & Quarry output for 48s.',
        },
        {
          id: 'scholar_symposium' as const,
          title: 'Scholar Symposium',
          description: '+40% Research Point speed for 48s.',
        },
      ];
      const picked = pool[Math.floor((state.tick / 140 + state.worldSeed) % pool.length)];
      state.activeEvent = {
        id: picked.id,
        title: picked.title,
        description: picked.description,
        ticksRemaining: 48,
      };
      return { startedTitle: picked.title, startedDesc: picked.description };
    }
    return {};
  }

  public static tickEnvironment(
    state: WorldEngineState,
    chunks: ChunkManager,
    pollutionReduction: number
  ): void {
    if (state.tick % 4 !== 0) return;

    let unlockedCount = 0;
    let treeCount = 0;

    for (const chunk of chunks.getAllLoadedChunks()) {
      if (!chunk.isModified) continue;
      for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
        if ((chunk.flags[i] & TileFlag.Unlocked) !== 0) {
          unlockedCount++;
          const ft = chunk.featureType[i] as FeatureType;
          if (isTreeFeature(ft)) {
            treeCount++;
          }
        }
      }
    }

    const policyPollCut = state.activePolicies?.includes('green_charter') ? 0.3 : 0;
    const totalPollReduction = Math.min(0.85, pollutionReduction + policyPollCut);

    // Stamp spatial local pollution radius onto tiles every 4 ticks
    for (const chunk of chunks.getAllLoadedChunks()) {
      if (chunk.isModified) chunk.pollution.fill(0);
    }

    let netPollution = 0;
    let orchardCount = 0;
    for (const b of state.buildings) {
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      if (b.defId === 'orchard' || b.defId === 'bamboo_grove') orchardCount++;
      if (def.pollutionDelta) {
        let localDelta = 0;
        if (def.pollutionDelta > 0 && b.status === 'active') {
          localDelta = def.pollutionDelta * (1 - totalPollReduction);
          netPollution += localDelta;
        } else if (def.pollutionDelta < 0) {
          localDelta = def.pollutionDelta;
          netPollution += localDelta;
        }
        if (localDelta > 0) {
          const rad = 3;
          for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
              const dist = Math.hypot(dx, dy);
              if (dist > rad) continue;
              const { cx, cy, index } = gridToChunk(b.gx + dx, b.gy + dy);
              const c = chunks.getLoadedChunk(cx, cy);
              if (c) {
                const add = Math.round(localDelta * 3 * (1 - dist / (rad + 0.5)));
                c.pollution[index] = Math.min(255, c.pollution[index] + add);
              }
            }
          }
        }
      }
    }

    let plantationTrees = 0;
    if (state.treePlantations) {
      for (const ps of Object.values(state.treePlantations)) {
        plantationTrees += ps?.activeTrees ?? 0;
      }
    }

    const forestPct = unlockedCount > 0 ? Math.min(100, Math.round(((treeCount + orchardCount * 3 + plantationTrees) / unlockedCount) * 100)) : 80;
    const rawPollution = Math.max(0, Math.min(100, netPollution - forestPct * 0.15));
    const waterPactBonus = state.activePolicies?.includes('eco_water_pact') ? 10 : 0;
    const waterQuality = Math.round(Math.max(15, Math.min(100, 100 - rawPollution * 0.75 + waterPactBonus)));
    const biodiversity = Math.round(Math.max(10, Math.min(100, forestPct * 0.8 + waterQuality * 0.25)));
    const sustainability = Math.round(
      Math.max(0, Math.min(100, forestPct * 0.4 + waterQuality * 0.35 + (100 - rawPollution) * 0.25))
    );

    state.environment = {
      forestCoveragePct: forestPct,
      avgPollution: Math.round(rawPollution),
      waterQuality,
      biodiversity,
      sustainability,
    };
  }
}
