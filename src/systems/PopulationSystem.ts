import { BUILDINGS } from '../data/buildings.data';
import type { HappinessDriver, HappinessReport, WorldEngineState } from '../core/GameState';
import { getBuildingStatsAtLevel } from './BuildingSimulation';
import { ResourceSystem } from './ResourceSystem';
import { CitizenAccounting } from './CitizenAccounting';
import { DistrictServiceSystem } from './DistrictServiceSystem';

export class PopulationSystem {
  public static computeHappinessReport(state: WorldEngineState): HappinessReport {
    const pop = state.population.total;
    const { needs } = state.population;
    const foodRatio = needs.food ?? 1;
    const waterRatio = needs.water ?? 1;
    const healthRatio = needs.healthcare ?? 1;
    const safetyRatio = needs.safety ?? 1;
    const recRatio = needs.recreation ?? 0.5;

    let flatHappiness = 0;
    for (const b of state.buildings) {
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      const stats = getBuildingStatsAtLevel(def, b.level);
      if ((b.status === 'active' || def.minWorkers === 0) && stats.happinessBonus) {
        flatHappiness += stats.happinessBonus;
      }
    }

    const foodVariety = ['berries', 'wheat', 'corn', 'vegetables', 'fruits', 'bread', 'meat', 'eggs', 'milk'].filter(
      (id) => (state.resources[id as keyof typeof state.resources] ?? 0) >= 1
    ).length;

    const taxDelta =
      state.taxRate <= 0.6 ? 8 : state.taxRate <= 1.05 ? 0 : state.taxRate <= 1.55 ? -12 : -26;
    const pollutionPenalty = Math.round(Math.min(20, state.environment.avgPollution * 0.45));
    const foodDelta = Math.round(
      foodRatio >= 0.9 ? 8 + Math.min(6, foodVariety * 1.5) : -24 * (1 - foodRatio)
    );
    const waterDelta = Math.round(pop > 8 && waterRatio < 0.8 ? -16 * (1 - waterRatio) : waterRatio * 6);
    const servicesDelta = Math.round((healthRatio + safetyRatio + recRatio) * 5);
    const sustainabilityDelta = Math.round((state.environment.sustainability - 50) * 0.14);
    const flatDelta = Math.round(Math.min(18, flatHappiness));

    const hasFestival = (state.festivalTicksRemaining ?? 0) > 0;
    const hasPlazaOrTech =
      state.unlockedTechIds.includes('civic_festivals') ||
      state.buildings.some((b) => b.defId === 'festival_plaza' && b.status !== 'constructing');
    const festivalBoost = hasFestival ? (hasPlazaOrTech ? 22 : 15) : 0;

    let policyHappy = 0;
    if (state.activePolicies?.includes('free_bread')) policyHappy += 10;
    if (state.activePolicies?.includes('double_shift')) policyHappy -= 6;
    const isEveningOrNight = state.timeOfDayHours >= 17.5 || state.timeOfDayHours < 5.5;
    if (state.activePolicies?.includes('night_bazaar_act') && isEveningOrNight) policyHappy += 4;

    const luxuryComfort =
      ((state.resources.coffee ?? 0) >= 1 ? 2 : 0) +
      ((state.resources.tea ?? 0) >= 1 ? 2 : 0) +
      ((state.resources.spices ?? 0) >= 1 ? 2 : 0) +
      ((state.resources.luxury_goods ?? 0) >= 1 ? 3 : 0);
    const homelessPenalty = Math.round(Math.min(18, (state.population.homeless ?? 0) * 1.5));

    const drivers: HappinessDriver[] = [
      {
        id: 'food',
        label: 'Food Supply & Variety',
        delta: foodDelta,
        category: 'food',
        detail:
          foodRatio >= 0.9
            ? `${foodVariety} food varieties stocked (${Math.round(foodRatio * 100)}% fed)`
            : `Low food stock (${Math.round(foodRatio * 100)}% fed) — build farms or bakeries`,
        actionLabel: foodRatio < 0.9 || foodVariety < 3 ? 'Build Farm / Bakery' : undefined,
        actionSheet: 'build',
        recommendedDefId: state.level >= 4 ? 'bakery' : 'wheat_farm',
      },
      {
        id: 'water',
        label: 'Clean Water Coverage',
        delta: waterDelta,
        category: 'water',
        detail:
          waterRatio >= 0.9
            ? 'All homes & districts supplied with fresh water'
            : `Water shortage (${Math.round(waterRatio * 100)}% met) — expand wells/towers`,
        actionLabel: waterRatio < 0.9 ? 'Build Water Supply' : undefined,
        actionSheet: 'build',
        recommendedDefId: state.level >= 9 ? 'water_tower' : 'water_well',
      },
      {
        id: 'taxes',
        label: `Tax Rate (${Math.round(state.taxRate * 10)}%)`,
        delta: taxDelta,
        category: 'tax',
        detail:
          taxDelta > 0
            ? 'Low taxes keep residents cheerful'
            : taxDelta === 0
              ? 'Balanced standard tax rate'
              : 'High taxes frustrate citizens — lower taxes for morale boost',
        actionLabel: taxDelta < 0 ? 'Adjust Tax Rate' : undefined,
        actionSheet: 'economy',
      },
      {
        id: 'services',
        label: 'Health, Safety & Recreation',
        delta: servicesDelta + flatDelta,
        category: 'service',
        detail: `Health ${Math.round(healthRatio * 100)}% · Safety ${Math.round(safetyRatio * 100)}% · Parks ${Math.round(recRatio * 100)}%`,
        actionLabel:
          healthRatio < 0.75
            ? 'Build Clinic'
            : safetyRatio < 0.75
              ? 'Build Watchtower'
              : recRatio < 0.75
                ? 'Build Village Park'
                : undefined,
        actionSheet: 'build',
        recommendedDefId:
          healthRatio < 0.75 ? 'clinic' : safetyRatio < 0.75 ? 'watchtower' : 'village_park',
      },
      {
        id: 'environment',
        label: 'Air & Green Sustainability',
        delta: sustainabilityDelta - pollutionPenalty,
        category: 'environment',
        detail: `Sustainability ${state.environment.sustainability}% · Pollution ${state.environment.avgPollution}%`,
        actionLabel:
          state.environment.avgPollution > 15 || state.environment.sustainability < 60
            ? 'Build Park / Trees'
            : undefined,
        actionSheet: 'build',
        recommendedDefId: 'village_park',
      },
    ];

    if (homelessPenalty > 0) {
      drivers.push({
        id: 'housing',
        label: 'Overcrowding / Homeless',
        delta: -homelessPenalty,
        category: 'housing',
        detail: `${state.population.homeless} citizens lack homes`,
        actionLabel: 'Build Housing',
        actionSheet: 'build',
        recommendedDefId: state.level >= 5 ? 'cottage' : 'leaf_hut',
      });
    }

    if (festivalBoost + policyHappy + luxuryComfort !== 0) {
      drivers.push({
        id: 'civic_luxuries',
        label: 'Festivals, Policies & Luxuries',
        delta: festivalBoost + policyHappy + luxuryComfort,
        category: 'policy',
        detail: hasFestival
          ? `City Festival active (+${festivalBoost}) · Luxury comfort +${luxuryComfort}`
          : `Policy impact ${policyHappy >= 0 ? `+${policyHappy}` : policyHappy} · Luxuries +${luxuryComfort}`,
        actionLabel: !hasFestival ? 'Civic Festival' : undefined,
        actionSheet: 'economy',
      });
    }

    const recommendations = drivers
      .filter((d) => d.delta <= 4 || Boolean(d.actionLabel))
      .sort((a, b) => a.delta - b.delta);

    return {
      score: state.population.happiness,
      base: 52,
      drivers,
      recommendations,
    };
  }

  public tickPopulation(state: WorldEngineState, weatherWaterMult: number): void {
    let housingCap = 0;
    let waterOut = 0;
    let waterDemand = 0;
    let healthCap = 0;
    let eduCap = 0;
    let safetyCap = 0;
    let recCap = 0;
    let flatHappiness = 0;
    let lifeExpBuildings = 0;
    let hasImmigrationOffice = false;

    for (const b of state.buildings) {
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      const stats = getBuildingStatsAtLevel(def, b.level);
      if (b.defId === 'immigration_office' && b.status === 'active') hasImmigrationOffice = true;
      if (stats.lifeExpectancyBonus && b.status === 'active') {
        lifeExpBuildings += stats.lifeExpectancyBonus;
      }

      if (stats.housingCapacity > 0) {
        housingCap += stats.housingCapacity;
      }
      if (stats.waterOutput > 0 && b.enabled) {
        waterOut += stats.waterOutput;
      }
      if (stats.waterDemand > 0 && b.enabled) {
        waterDemand += Math.round(stats.waterDemand * weatherWaterMult);
      }
      if (b.status === 'active' || def.minWorkers === 0) {
        if (stats.healthcareBonus > 0) healthCap += stats.healthcareBonus;
        if (stats.educationBonus > 0) {
          const cov = DistrictServiceSystem.getBuildingCoverage(b, state);
          eduCap += Math.round(stats.educationBonus * cov.educationBonusMult);
        }
        if (stats.safetyBonus > 0) safetyCap += stats.safetyBonus;
        if (stats.recreationBonus > 0) recCap += stats.recreationBonus;
        if (stats.happinessBonus > 0) flatHappiness += stats.happinessBonus;
      }
    }

    void weatherWaterMult;
    state.population.capacity = housingCap;

    const pop = state.population.total;
    // Food consumption evaluated every 10 ticks for smooth stability
    let foodSatisfaction = 1;
    let foodVariety = 1;
    if (pop > 0 && state.tick % 10 === 0) {
      const nutritionNeeded = pop * 0.032; // ~0.19 units / citizen / min
      const res = ResourceSystem.consumeFoodUnits(state, nutritionNeeded);
      foodSatisfaction = res.satisfiedRatio;
      foodVariety = res.varietyCount;
      state.population.needs.food = foodSatisfaction;
    } else if (pop === 0) {
      state.population.needs.food = 1;
    } else {
      foodSatisfaction = state.population.needs.food;
    }

    const medStockBoost = (state.resources.medicine ?? 0) >= 1 ? 0.15 : 0;
    if (pop > 0 && state.tick % 20 === 0) {
      if ((state.resources.medicine ?? 0) >= 0.25) {
        state.resources.medicine = Math.max(0, state.resources.medicine - 0.25);
      }
      if ((state.resources.coffee ?? 0) >= 0.2) {
        state.resources.coffee = Math.max(0, state.resources.coffee - 0.2);
      }
      if ((state.resources.spices ?? 0) >= 0.2) {
        state.resources.spices = Math.max(0, state.resources.spices - 0.2);
      }
      if ((state.resources.tea ?? 0) >= 0.2) {
        state.resources.tea = Math.max(0, state.resources.tea - 0.2);
      }
    }

    const deliveredWater = state.waterDelivered ?? waterOut;
    const totalWaterNeed = Math.max(state.waterDemand ?? 0, waterDemand);
    const waterRatio =
      pop === 0 || totalWaterNeed === 0
        ? 1
        : Math.min(1, deliveredWater / Math.max(1, totalWaterNeed));
    const healthRatio = pop === 0 ? 1 : Math.min(1, healthCap / Math.max(10, pop) + medStockBoost);
    const eduRatio = pop === 0 ? 0 : Math.min(1, eduCap / Math.max(15, pop));
    const safetyRatio = pop === 0 ? 1 : Math.min(1, safetyCap / Math.max(15, pop));
    const recRatio = pop === 0 ? 0.5 : Math.min(1, recCap / Math.max(20, pop));

    state.population.needs.water = waterRatio;
    state.population.needs.healthcare = healthRatio;
    state.population.needs.education = eduRatio;
    state.population.needs.safety = safetyRatio;
    state.population.needs.recreation = recRatio;

    // Sickness rate & life expectancy driven by healthcare, water quality, pollution, and parks
    const poll = state.environment.avgPollution ?? 0;
    const rawSickness = Math.max(
      1,
      Math.min(60, 8 + poll * 0.45 - healthRatio * 12 - waterRatio * 6 - Math.min(8, lifeExpBuildings * 0.4))
    );
    state.sicknessRate = Number(rawSickness.toFixed(1));
    const rawLifeExp = Math.max(
      48,
      Math.min(
        94,
        66 + healthRatio * 9 + waterRatio * 5 + recRatio * 3 + Math.min(10, lifeExpBuildings) - rawSickness * 0.35
      )
    );
    state.lifeExpectancy = Number(rawLifeExp.toFixed(1));

    // Tax impact on happiness
    const taxPenalty =
      state.taxRate <= 0.6
        ? 8
        : state.taxRate <= 1.05
          ? 0
          : state.taxRate <= 1.55
            ? -12
            : -26;

    const pollutionPenalty = Math.min(20, state.environment.avgPollution * 0.45);
    const foodDelta = foodSatisfaction >= 0.9 ? 8 + Math.min(6, foodVariety * 1.5) : -24 * (1 - foodSatisfaction);
    const waterDelta = pop > 8 && waterRatio < 0.8 ? -16 * (1 - waterRatio) : waterRatio * 6;
    const servicesDelta = (healthRatio + safetyRatio + recRatio) * 5;
    const sustainabilityDelta = (state.environment.sustainability - 50) * 0.14;

    const hasFestival = (state.festivalTicksRemaining ?? 0) > 0;
    const hasPlazaOrTech =
      state.unlockedTechIds.includes('civic_festivals') ||
      state.buildings.some((b) => b.defId === 'festival_plaza' && b.status !== 'constructing');
    const festivalBoost = hasFestival ? (hasPlazaOrTech ? 22 : 15) : 0;

    let policyHappy = 0;
    if (state.activePolicies?.includes('free_bread')) policyHappy += 10;
    if (state.activePolicies?.includes('double_shift')) policyHappy -= 6;
    const isEveningOrNight = state.timeOfDayHours >= 17.5 || state.timeOfDayHours < 5.5;
    if (state.activePolicies?.includes('night_bazaar_act') && isEveningOrNight) policyHappy += 4;
    const luxuryComfort =
      ((state.resources.coffee ?? 0) >= 1 ? 2 : 0) +
      ((state.resources.tea ?? 0) >= 1 ? 2 : 0) +
      ((state.resources.spices ?? 0) >= 1 ? 2 : 0) +
      ((state.resources.luxury_goods ?? 0) >= 1 ? 3 : 0);

    const homelessPenalty = Math.min(18, (state.population.homeless ?? 0) * 1.5);
    const rawHappiness =
      52 +
      foodDelta +
      waterDelta +
      taxPenalty +
      servicesDelta +
      Math.min(18, flatHappiness) +
      sustainabilityDelta +
      festivalBoost +
      policyHappy +
      luxuryComfort -
      pollutionPenalty -
      homelessPenalty;

    state.population.happiness = Math.round(Math.max(0, Math.min(100, rawHappiness)));

    // Population growth or emigration
    if (housingCap > pop && state.population.happiness >= 48 && foodSatisfaction > 0.4) {
      // First settlers arrive quickly once Leaf Huts are built
      const baseRate = pop < 8 ? 0.45 : (0.12 + (state.population.happiness - 45) * 0.012);
      const festGrowth = hasFestival ? 1.35 : 1.0;
      const immigMult = hasImmigrationOffice ? 1.25 : 1.0;
      state.population.growthAccumulator += baseRate * festGrowth * immigMult;
      if (state.population.growthAccumulator >= 1) {
        const gained = Math.min(housingCap - pop, Math.floor(state.population.growthAccumulator));
        state.population.total += gained;
        state.population.growthAccumulator -= gained;
      }
    } else if (pop > 4 && (state.population.happiness < 25 || foodSatisfaction < 0.15)) {
      state.population.growthAccumulator -= 0.18;
      if (state.population.growthAccumulator <= -1) {
        const lost = Math.min(pop - 4, Math.floor(Math.abs(state.population.growthAccumulator)));
        state.population.total = Math.max(4, pop - lost);
        state.population.growthAccumulator += lost;
      }
    }

    if (state.population.total > housingCap) {
      state.population.total = housingCap;
    }

    if (state.population.total > state.stats.maxPopulation) {
      state.stats.maxPopulation = state.population.total;
    }

    // Class distribution derived cleanly from Education coverage
    const total = state.population.total;
    const engineerShare = eduRatio >= 0.4 ? Math.min(0.28, (eduRatio - 0.3) * 0.4) : 0;
    const artisanShare = eduRatio >= 0.15 ? Math.min(0.4, eduRatio * 0.5) : Math.min(0.15, total > 12 ? 0.1 : 0);
    const engineers = Math.floor(total * engineerShare);
    const artisans = Math.floor(total * artisanShare);
    const laborers = Math.max(0, total - engineers - artisans);

    state.population.classes = {
      laborer: laborers,
      artisan: artisans,
      engineer: engineers,
    };

    CitizenAccounting.reconcileCohorts(state);
  }
}

