import { CoreEngine } from '../core/CoreEngine';
import { CalendarState, SCHEMA_VERSION, WorldEngineState } from '../core/GameState';
import { BUILDINGS } from '../data/buildings.data';
import { CitizenAccounting } from '../systems/CitizenAccounting';
import { EnvironmentSystem } from '../systems/EnvironmentSystem';

export interface MigrationReport {
  fromVersion: number;
  toVersion: number;
  migratedAt: number;
  backupCreated: boolean;
  backupId?: string;
  cityName: string;
  coinsBefore: number;
  coinsAfter: number;
  populationBefore: number;
  populationAfter: number;
  buildingsBefore: number;
  buildingsAfter: number;
  warnings: string[];
  validationPassed: boolean;
  validationErrors: string[];
}

export interface MigrationResult {
  ok: boolean;
  state?: WorldEngineState;
  error?: string;
  report?: MigrationReport;
}

export class SaveMigrator {
  public static migrate(raw: unknown, opts?: { backupId?: string; backupCreated?: boolean }): MigrationResult {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'Malformed save payload' };
    }
    const candidate = raw as Partial<WorldEngineState>;
    const version = typeof candidate.schemaVersion === 'number' ? candidate.schemaVersion : 0;

    if (version > SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Save schema v${version} is newer than app v${SCHEMA_VERSION}. Please update KUKUS.`,
      };
    }

    const seed = typeof candidate.worldSeed === 'number' ? candidate.worldSeed : 12345;
    const base = CoreEngine.createInitialState(seed);

    const coinsBefore = typeof candidate.coins === 'number' ? candidate.coins : base.coins;
    const popBefore = typeof candidate.population?.total === 'number' ? candidate.population.total : 0;
    const buildingsRaw = Array.isArray(candidate.buildings) ? candidate.buildings : [];
    const warnings: string[] = [];

    // Preserve and normalize cities
    const cityName = candidate.settings?.cityName || base.settings.cityName;
    const cities =
      Array.isArray(candidate.cities) && candidate.cities.length > 0
        ? candidate.cities.map((c) => ({ ...c }))
        : [
            {
              id: 1,
              name: cityName,
              color: '#f59e0b',
              createdTick: 0,
              taxRate: typeof candidate.taxRate === 'number' ? candidate.taxRate : 1.0,
              unlockedTiles: candidate.stats?.unlockedTiles ?? 20,
            },
          ];

    const unlockedBuildingLevels: Record<string, number> = {
      ...(candidate.unlockedBuildingLevels ?? {}),
    };

    const REMOVED_LEGACY_BUILDINGS = new Set([
      'woodcutter_camp',
      'forester_hut',
      'road_connector',
      'automated_logging_factory',
    ]);

    // Normalize buildings, assign missing/duplicate IDs monotonically, compute blueprint levels, and enforce maxPerWorld safety
    const maxPerWorldSeen = new Map<string, number>();
    const usedIds = new Set<number>();
    let highestId = 0;
    for (const rawB of buildingsRaw) {
      if (rawB && typeof rawB === 'object' && typeof rawB.id === 'number' && rawB.id > highestId) {
        highestId = Math.floor(rawB.id);
      }
    }
    let nextIdCursor = Math.max(
      typeof candidate.nextBuildingId === 'number' && candidate.nextBuildingId > 0
        ? Math.floor(candidate.nextBuildingId)
        : 1,
      highestId + 1
    );

    const normalizedBuildings = [];
    for (const b of buildingsRaw) {
      if (!b || typeof b !== 'object' || typeof b.defId !== 'string') continue;
      if (REMOVED_LEGACY_BUILDINGS.has(b.defId)) {
        warnings.push(`Removed obsolete forestry/connector building "${b.defId}" during save migration.`);
        delete unlockedBuildingLevels[b.defId];
        continue;
      }
      const def = BUILDINGS[b.defId];
      if (!def) {
        warnings.push(`Skipped unknown building "${b.defId}" during save migration.`);
        continue;
      }
      if (def.maxPerWorld !== undefined) {
        const seen = maxPerWorldSeen.get(b.defId) ?? 0;
        if (seen >= def.maxPerWorld) {
          warnings.push(`Removed duplicate ${def.name} (maxPerWorld=${def.maxPerWorld})`);
          continue;
        }
        maxPerWorldSeen.set(b.defId, seen + 1);
      }
      let assignedId = typeof b.id === 'number' && b.id > 0 ? Math.floor(b.id) : 0;
      if (assignedId <= 0 || usedIds.has(assignedId)) {
        assignedId = nextIdCursor++;
        warnings.push(`Reassigned duplicate/invalid building ID for ${def.name} -> #${assignedId}.`);
      }
      usedIds.add(assignedId);
      if (assignedId >= nextIdCursor) nextIdCursor = assignedId + 1;

      const canonicalMaxLevel = def.category === 'storage' ? 4 : 5;
      const lvl = Math.min(canonicalMaxLevel, Math.max(1, Math.floor(Number(b.level ?? 1))));
      unlockedBuildingLevels[b.defId] = Math.min(
        canonicalMaxLevel,
        Math.max(unlockedBuildingLevels[b.defId] ?? 1, lvl)
      );
      normalizedBuildings.push({
        ...b,
        id: assignedId,
        level: lvl,
        rotation: (b.rotation === 1 ? 1 : 0) as 0 | 1,
        cityId: typeof b.cityId === 'number' && b.cityId > 0 ? b.cityId : cities[0].id,
      });
    }

    const legacySeason = candidate.season ?? 'spring';
    const seasonIdx = ['spring', 'summer', 'autumn', 'winter'].indexOf(legacySeason);
    const fallbackYear = typeof candidate.year === 'number' && candidate.year >= 1 ? Math.floor(candidate.year) : 1;
    const fallbackDayInSeason =
      typeof candidate.dayInSeason === 'number' && candidate.dayInSeason >= 1
        ? Math.floor(candidate.dayInSeason)
        : 1;
    const fallbackMonth = Math.min(
      12,
      Math.max(1, (seasonIdx >= 0 ? seasonIdx : 0) * 3 + Math.min(3, Math.floor((fallbackDayInSeason - 1) / 28) + 1))
    );
    const rawCal = candidate.calendar as (Partial<CalendarState> & { day?: number; week?: number; totalDays?: number }) | undefined;
    const calYear = typeof rawCal?.year === 'number' && rawCal.year >= 1 ? Math.floor(rawCal.year) : fallbackYear;
    const calMonth =
      typeof rawCal?.month === 'number' && rawCal.month >= 1 && rawCal.month <= 12
        ? Math.floor(rawCal.month)
        : fallbackMonth;
    const rawWeekVal = rawCal?.weekOfMonth ?? rawCal?.week;
    const calWeek =
      typeof rawWeekVal === 'number' && rawWeekVal >= 1 && rawWeekVal <= 4 ? Math.floor(rawWeekVal) : 1;
    const rawDayVal = rawCal?.dayOfWeek ?? rawCal?.day;
    const calDay =
      typeof rawDayVal === 'number' && rawDayVal >= 1 && rawDayVal <= 7 ? Math.floor(rawDayVal) : 1;
    const rawTotalDaysVal = rawCal?.totalDaysElapsed ?? rawCal?.totalDays;
    const calTotalDays =
      typeof rawTotalDaysVal === 'number' && rawTotalDaysVal >= 0
        ? Math.floor(rawTotalDaysVal)
        : ((calYear - 1) * 12 + (calMonth - 1)) * 28 + (calWeek - 1) * 7 + (calDay - 1);

    const rawEcon = candidate.economy;
    const monthKey = `Y${calYear}-M${String(calMonth).padStart(2, '0')}`;

    const migrated: WorldEngineState = {
      ...base,
      ...candidate,
      schemaVersion: SCHEMA_VERSION,
      resources: { ...base.resources, ...(candidate.resources ?? {}) },
      capacities: { ...base.capacities, ...(candidate.capacities ?? {}) },
      marketPrices: { ...base.marketPrices, ...(candidate.marketPrices ?? {}) },
      buildings: normalizedBuildings,
      nextBuildingId: nextIdCursor,
      unlockedBuildingLevels,
      cities,
      activeCityId:
        typeof candidate.activeCityId === 'number' && cities.some((c) => c.id === candidate.activeCityId)
          ? candidate.activeCityId
          : cities[0].id,
      nextCityId:
        typeof candidate.nextCityId === 'number'
          ? candidate.nextCityId
          : Math.max(...cities.map((c) => c.id), 1) + 1,
      zones: Array.isArray(candidate.zones) ? candidate.zones : [],
      population: {
        ...base.population,
        ...(candidate.population ?? {}),
        classes: { ...base.population.classes, ...(candidate.population?.classes ?? {}) },
        needs: { ...base.population.needs, ...(candidate.population?.needs ?? {}) },
        ageBreakdown: {
          ...base.population.ageBreakdown,
          ...(candidate.population?.ageBreakdown ?? {}),
        },
        cohorts: Array.isArray(candidate.population?.cohorts) ? candidate.population.cohorts : [],
      },
      environment: { ...base.environment, ...(candidate.environment ?? {}) },
      stats: { ...base.stats, ...(candidate.stats ?? {}) },
      settings: { ...base.settings, ...(candidate.settings ?? {}) },
      camera: { ...base.camera, ...(candidate.camera ?? {}) },
      activePolicies: Array.isArray(candidate.activePolicies) ? candidate.activePolicies : [],
      foreignCurrency: typeof candidate.foreignCurrency === 'number' ? candidate.foreignCurrency : 0,
      tradeBalance: typeof candidate.tradeBalance === 'number' ? candidate.tradeBalance : 0,
      customsFeeRate: typeof candidate.customsFeeRate === 'number' ? candidate.customsFeeRate : 0.08,
      lifeExpectancy: typeof candidate.lifeExpectancy === 'number' ? candidate.lifeExpectancy : 72,
      sicknessRate: typeof candidate.sicknessRate === 'number' ? candidate.sicknessRate : 8,
      showZoneBorders: Boolean(candidate.showZoneBorders),
      landModeActive: Boolean(candidate.landModeActive),
      corporateStats: Array.isArray(candidate.corporateStats) ? candidate.corporateStats : [],
      treePlantations:
        candidate.treePlantations && typeof candidate.treePlantations === 'object'
          ? candidate.treePlantations
          : {},
      growingTrees: Array.isArray(candidate.growingTrees) ? candidate.growingTrees : [],
      year: calYear,
      calendar: {
        dayOfWeek: calDay,
        weekOfMonth: calWeek,
        month: calMonth,
        year: calYear,
        totalDaysElapsed: calTotalDays,
      },
      economy: {
        fxRate:
          typeof rawEcon?.fxRate === 'number' && Number.isFinite(rawEcon.fxRate) && rawEcon.fxRate > 0
            ? rawEcon.fxRate
            : base.economy.fxRate,
        fxHistory: Array.isArray(rawEcon?.fxHistory) && rawEcon.fxHistory.length > 0 ? rawEcon.fxHistory : base.economy.fxHistory,
        gdpCurrent: typeof rawEcon?.gdpCurrent === 'number' ? rawEcon.gdpCurrent : 0,
        gdpPrevious: typeof rawEcon?.gdpPrevious === 'number' ? rawEcon.gdpPrevious : 0,
        gdpGrowthPct: typeof rawEcon?.gdpGrowthPct === 'number' ? rawEcon.gdpGrowthPct : 0,
        gdpBreakdown: {
          ...base.economy.gdpBreakdown,
          ...(rawEcon?.gdpBreakdown ?? {}),
        },
        inflationRate: typeof rawEcon?.inflationRate === 'number' ? rawEcon.inflationRate : base.economy.inflationRate,
        inflationDrivers:
          Array.isArray(rawEcon?.inflationDrivers) && rawEcon.inflationDrivers.length > 0
            ? rawEcon.inflationDrivers
            : base.economy.inflationDrivers,
        moneySupplyBaseline:
          typeof rawEcon?.moneySupplyBaseline === 'number' && rawEcon.moneySupplyBaseline > 0
            ? rawEcon.moneySupplyBaseline
            : Math.max(500, Math.round(coinsBefore)),
        transactions: Array.isArray(rawEcon?.transactions) ? rawEcon.transactions : [],
        lastUpdatedMonthKey:
          typeof rawEcon?.lastUpdatedMonthKey === 'string' && rawEcon.lastUpdatedMonthKey.length > 0
            ? rawEcon.lastUpdatedMonthKey
            : monthKey,
      },
      utilitySummary: {
        ...base.utilitySummary,
        ...(candidate.utilitySummary ?? {}),
      },
    };
    delete (migrated as unknown as Record<string, unknown>).loggingStats;
    delete (migrated as unknown as Record<string, unknown>).treeRegrowthQueue;

    EnvironmentSystem.syncCalendarToLegacyFields(migrated);
    CitizenAccounting.reconcileCohorts(migrated);

    // Post-migration invariant checks
    const validationErrors: string[] = [];
    if (migrated.coins !== coinsBefore) {
      validationErrors.push(`Coins mismatch: before=${coinsBefore}, after=${migrated.coins}`);
    }
    if (migrated.population.total !== popBefore) {
      validationErrors.push(`Population mismatch: before=${popBefore}, after=${migrated.population.total}`);
    }
    if (migrated.stats.unlockedTiles < 0) {
      validationErrors.push(`Invalid unlockedTiles count: ${migrated.stats.unlockedTiles}`);
    }
    const citizenInv = CitizenAccounting.validateInvariants(migrated);
    if (!citizenInv.valid) {
      validationErrors.push(...citizenInv.errors);
    }

    const report: MigrationReport = {
      fromVersion: version,
      toVersion: SCHEMA_VERSION,
      migratedAt: Date.now(),
      backupCreated: Boolean(opts?.backupCreated),
      backupId: opts?.backupId,
      cityName: migrated.settings.cityName,
      coinsBefore,
      coinsAfter: migrated.coins,
      populationBefore: popBefore,
      populationAfter: migrated.population.total,
      buildingsBefore: buildingsRaw.length,
      buildingsAfter: migrated.buildings.length,
      warnings,
      validationPassed: validationErrors.length === 0,
      validationErrors,
    };

    return {
      ok: validationErrors.length === 0,
      state: migrated,
      error: validationErrors.length > 0 ? validationErrors.join('; ') : undefined,
      report,
    };
  }
}
