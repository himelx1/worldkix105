import { BUILDINGS, WorkerClass } from '../data/buildings.data';
import type { AgeGroup, CitizenCohort, WorldEngineState } from '../core/GameState';
import { getBuildingStatsAtLevel } from './BuildingSimulation';

export interface CityPopulationSummary {
  cityId: number;
  cityName: string;
  total: number;
  housingCapacity: number;
  employed: number;
  unemployed: number;
  homeless: number;
  ageBreakdown: Record<AgeGroup, number>;
}

export interface CitizenInvariantReport {
  valid: boolean;
  errors: string[];
  worldTotal: number;
  cohortTotal: number;
  citySumTotal: number;
  ageSumTotal: number;
  employedCohortTotal: number;
  cityBreakdown: CityPopulationSummary[];
}

/**
 * Authoritative single-city Citizen Cohort accounting system.
 * Guarantees that every resident belongs to exactly one city, one home (or homeless),
 * one age group, and one employment status without double-counting across cities or aggregates.
 */
export class CitizenAccounting {
  public static reconcileCohorts(state: WorldEngineState): void {
    const total = Math.max(0, Math.floor(state.population.total));
    const defaultCityId = state.cities[0]?.id ?? 1;

    // 1. Age distribution derived consistently (children ~12%, underage students ~10%, adults ~68%, elderly ~10%)
    const children = total > 0 ? Math.floor(total * 0.12) : 0;
    const underage = total > 0 ? Math.floor(total * 0.1) : 0;
    const elderly = total > 0 ? Math.floor(total * 0.1) : 0;
    const adults = Math.max(0, total - children - underage - elderly);

    state.population.ageBreakdown = {
      child: children,
      underage,
      adult: adults,
      elderly,
    };

    state.population.availableWorkforce = adults;

    if (total === 0) {
      state.population.cohorts = [];
      state.population.homeless = 0;
      state.population.employed = 0;
      state.population.unemployed = 0;
      return;
    }

    // 2. Collect finished homes & compute per-home housing allocation (single city per home)
    const homes = state.buildings.filter(
      (b) => b.status !== 'constructing' && (BUILDINGS[b.defId]?.housingCapacity ?? 0) > 0
    );
    const schools = state.buildings.filter(
      (b) => b.status !== 'constructing' && BUILDINGS[b.defId]?.category === 'educational'
    );
    const workplaces = state.buildings.filter(
      (b) => b.status !== 'constructing' && b.enabled && b.assignedWorkers > 0
    );

    const cohorts: CitizenCohort[] = [];
    let remainingPop = total;
    let totalHoused = 0;

    // Allocate residents to homes proportionally without exceeding housing capacity
    const homeAllocations: Array<{ homeId: number; cityId: number; residents: number }> = [];
    const totalHomeCap = homes.reduce((acc, h) => {
      const def = BUILDINGS[h.defId];
      return acc + (def ? getBuildingStatsAtLevel(def, h.level).housingCapacity : 0);
    }, 0);

    for (let i = 0; i < homes.length && remainingPop > 0; i++) {
      const h = homes[i];
      const def = BUILDINGS[h.defId]!;
      const cap = getBuildingStatsAtLevel(def, h.level).housingCapacity;
      const share =
        i === homes.length - 1
          ? Math.min(cap, remainingPop)
          : Math.min(cap, Math.round((cap / Math.max(1, totalHomeCap)) * total), remainingPop);
      if (share > 0) {
        homeAllocations.push({
          homeId: h.id,
          cityId: h.cityId ?? defaultCityId,
          residents: share,
        });
        remainingPop -= share;
        totalHoused += share;
      }
    }

    // Overflow goes into any spare home capacity first before becoming homeless
    for (let i = 0; i < homes.length && remainingPop > 0; i++) {
      const h = homes[i];
      const def = BUILDINGS[h.defId]!;
      const cap = getBuildingStatsAtLevel(def, h.level).housingCapacity;
      const existing = homeAllocations.find((a) => a.homeId === h.id);
      const cur = existing?.residents ?? 0;
      const room = Math.max(0, cap - cur);
      const add = Math.min(room, remainingPop);
      if (add > 0) {
        if (existing) existing.residents += add;
        else homeAllocations.push({ homeId: h.id, cityId: h.cityId ?? defaultCityId, residents: add });
        remainingPop -= add;
        totalHoused += add;
      }
    }

    const homelessCount = Math.max(0, remainingPop);
    state.population.homeless = homelessCount;
    if (homelessCount > 0) {
      homeAllocations.push({
        homeId: -1, // sentinel mapped to null homeBuildingId
        cityId: state.activeCityId || defaultCityId,
        residents: homelessCount,
      });
    }

    // Track per-city workplaces to assign employed cohorts strictly to working-age adults
    let employedBudget = Math.min(adults, Math.max(0, state.population.employed));
    state.population.employed = employedBudget;
    state.population.unemployed = Math.max(0, adults - employedBudget);
    const workQueue: Array<{ id: number; cityId: number; workerClass: WorkerClass; slots: number }> =
      workplaces.map((w) => ({
        id: w.id,
        cityId: w.cityId ?? defaultCityId,
        workerClass: BUILDINGS[w.defId]?.workerClass ?? 'laborer',
        slots: w.assignedWorkers,
      }));

    // Distribute age groups across home allocations cleanly so sums match exact global breakdown
    let remChild = children;
    let remUnderage = underage;
    let remElderly = elderly;
    let remAdults = adults;

    for (let idx = 0; idx < homeAllocations.length; idx++) {
      const alloc = homeAllocations[idx];
      const homeBuildingId = alloc.homeId === -1 ? null : alloc.homeId;
      const isLast = idx === homeAllocations.length - 1;
      let left = alloc.residents;

      const cChild = isLast ? remChild : Math.min(remChild, Math.floor(alloc.residents * 0.12));
      remChild -= cChild;
      left -= cChild;

      const cUnderage = isLast ? remUnderage : Math.min(remUnderage, Math.floor(alloc.residents * 0.1));
      remUnderage -= cUnderage;
      left -= cUnderage;

      const cElderly = isLast ? remElderly : Math.min(remElderly, Math.floor(alloc.residents * 0.1));
      remElderly -= cElderly;
      left -= cElderly;

      const cAdult = Math.max(0, Math.min(remAdults, left));
      remAdults -= cAdult;

      if (cChild > 0) {
        cohorts.push({
          id: `c_${alloc.cityId}_${alloc.homeId}_child`,
          cityId: alloc.cityId,
          homeBuildingId,
          ageGroup: 'child',
          employmentStatus: 'homemaker',
          workerClass: 'laborer',
          workplaceOrSchoolId: null,
          count: cChild,
        });
      }

      if (cUnderage > 0) {
        const localSchool =
          schools.find((s) => (s.cityId ?? defaultCityId) === alloc.cityId) ?? schools[0] ?? null;
        cohorts.push({
          id: `c_${alloc.cityId}_${alloc.homeId}_student`,
          cityId: alloc.cityId,
          homeBuildingId,
          ageGroup: 'underage',
          employmentStatus: 'student',
          workerClass: 'laborer',
          workplaceOrSchoolId: localSchool?.id ?? null,
          count: cUnderage,
        });
      }

      if (cElderly > 0) {
        cohorts.push({
          id: `c_${alloc.cityId}_${alloc.homeId}_elderly`,
          cityId: alloc.cityId,
          homeBuildingId,
          ageGroup: 'elderly',
          employmentStatus: 'retired',
          workerClass: 'laborer',
          workplaceOrSchoolId: null,
          count: cElderly,
        });
      }

      let adultLeft = cAdult;
      // Assign employed adults to workplaces (preferring same-city workplaces first)
      while (adultLeft > 0 && employedBudget > 0) {
        const match =
          workQueue.find((w) => w.slots > 0 && w.cityId === alloc.cityId) ??
          workQueue.find((w) => w.slots > 0);
        if (!match) break;
        const take = Math.min(adultLeft, employedBudget, match.slots);
        match.slots -= take;
        employedBudget -= take;
        adultLeft -= take;
        cohorts.push({
          id: `c_${alloc.cityId}_${alloc.homeId}_emp_${match.id}`,
          cityId: alloc.cityId,
          homeBuildingId,
          ageGroup: 'adult',
          employmentStatus: 'employed',
          workerClass: match.workerClass,
          workplaceOrSchoolId: match.id,
          count: take,
        });
      }

      if (adultLeft > 0) {
        cohorts.push({
          id: `c_${alloc.cityId}_${alloc.homeId}_unemp`,
          cityId: alloc.cityId,
          homeBuildingId,
          ageGroup: 'adult',
          employmentStatus: 'unemployed',
          workerClass: 'laborer',
          workplaceOrSchoolId: null,
          count: adultLeft,
        });
      }
    }

    void totalHoused;
    state.population.cohorts = cohorts;
  }

  public static getCityPopulationBreakdown(state: WorldEngineState): CityPopulationSummary[] {
    const map = new Map<number, CityPopulationSummary>();
    for (const c of state.cities) {
      map.set(c.id, {
        cityId: c.id,
        cityName: c.name,
        total: 0,
        housingCapacity: 0,
        employed: 0,
        unemployed: 0,
        homeless: 0,
        ageBreakdown: { child: 0, underage: 0, adult: 0, elderly: 0 },
      });
    }

    for (const b of state.buildings) {
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def?.housingCapacity) continue;
      const cid = b.cityId ?? state.cities[0]?.id ?? 1;
      const entry = map.get(cid);
      if (entry) {
        entry.housingCapacity += getBuildingStatsAtLevel(def, b.level).housingCapacity;
      }
    }

    for (const ch of state.population.cohorts) {
      const entry = map.get(ch.cityId);
      if (!entry) continue;
      entry.total += ch.count;
      entry.ageBreakdown[ch.ageGroup] += ch.count;
      if (ch.employmentStatus === 'employed') entry.employed += ch.count;
      else if (ch.employmentStatus === 'unemployed') entry.unemployed += ch.count;
      if (ch.homeBuildingId === null) entry.homeless += ch.count;
    }

    return Array.from(map.values());
  }

  public static validateInvariants(state: WorldEngineState): CitizenInvariantReport {
    const errors: string[] = [];
    const cityIds = new Set(state.cities.map((c) => c.id));
    const buildingCityMap = new Map<number, number>();
    for (const b of state.buildings) {
      buildingCityMap.set(b.id, b.cityId ?? state.cities[0]?.id ?? 1);
    }

    let cohortTotal = 0;
    let employedCohortTotal = 0;
    const ageSums: Record<AgeGroup, number> = { child: 0, underage: 0, adult: 0, elderly: 0 };

    for (const ch of state.population.cohorts) {
      if (ch.count < 0) errors.push(`Cohort ${ch.id} has negative count ${ch.count}`);
      if (!cityIds.has(ch.cityId)) errors.push(`Cohort ${ch.id} references unknown cityId ${ch.cityId}`);
      if (ch.homeBuildingId !== null) {
        const homeCity = buildingCityMap.get(ch.homeBuildingId);
        if (homeCity === undefined) {
          errors.push(`Cohort ${ch.id} references missing homeBuildingId ${ch.homeBuildingId}`);
        } else if (homeCity !== ch.cityId) {
          errors.push(`Cohort ${ch.id} cityId ${ch.cityId} mismatches home cityId ${homeCity}`);
        }
      }
      cohortTotal += ch.count;
      ageSums[ch.ageGroup] += ch.count;
      if (ch.employmentStatus === 'employed') employedCohortTotal += ch.count;
    }

    const cityBreakdown = this.getCityPopulationBreakdown(state);
    const citySumTotal = cityBreakdown.reduce((acc, c) => acc + c.total, 0);
    const ageSumTotal = ageSums.child + ageSums.underage + ageSums.adult + ageSums.elderly;

    if (cohortTotal !== state.population.total) {
      errors.push(`Cohort sum (${cohortTotal}) !== world population (${state.population.total})`);
    }
    if (citySumTotal !== state.population.total) {
      errors.push(`City sum (${citySumTotal}) !== world population (${state.population.total})`);
    }
    if (ageSumTotal !== state.population.total) {
      errors.push(`Age breakdown sum (${ageSumTotal}) !== world population (${state.population.total})`);
    }
    if (employedCohortTotal !== state.population.employed) {
      errors.push(
        `Employed cohort sum (${employedCohortTotal}) !== state.population.employed (${state.population.employed})`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      worldTotal: state.population.total,
      cohortTotal,
      citySumTotal,
      ageSumTotal,
      employedCohortTotal,
      cityBreakdown,
    };
  }
}
