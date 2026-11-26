import { BUILDINGS, getBuildingFootprint } from '../data/buildings.data';
import { BuildingInstance, WorldEngineState, ZONE_ID_TO_TYPE, ZoneId, ZoneType } from '../core/GameState';

export interface BuildingServiceCoverage {
  hasCivicHqOrSub: boolean;
  hasTaxCoverage: boolean;
  hasEducationCoverage: boolean;
  hasWorkerCoverage: boolean;
  hasGovCoverage: boolean;
  taxBonusMult: number;
  prodBonusMult: number;
  educationBonusMult: number;
}

const ZONE_PROD_BONUSES: Partial<Record<ZoneType, number>> = {
  industrial: 1.12,
  heavy_industrial: 1.22,
  agricultural: 1.18,
  sez: 1.2,
  epz: 1.25,
  fishing: 1.25,
  mining: 1.22,
  forestry: 1.25,
  logistics: 1.2,
  port: 1.18,
  tech_park: 1.25,
  research: 1.22,
};

const ZONE_TAX_BONUSES: Partial<Record<ZoneType, number>> = {
  residential: 1.1,
  commercial: 1.15,
  financial: 1.25,
  government: 1.18,
  sez: 1.2,
  epz: 1.22,
  port: 1.16,
};

interface IndexedServiceOffice {
  defId: string;
  cityId: number;
  ox: number;
  oy: number;
  radius: number;
  isMainOrGov: boolean;
}

/**
 * Evaluates local district service coverage provided by Regional Sub-Offices,
 * Government institutions, and 16 district zones.
 */
export class DistrictServiceSystem {
  private static cacheTick = -1;
  private static cacheBldCount = -1;
  private static activeOffices: IndexedServiceOffice[] = [];
  private static baseCoverageByBuildingId = new Map<number, BuildingServiceCoverage>();

  public static prepareTickCache(state: WorldEngineState): void {
    this.cacheTick = state.tick;
    this.cacheBldCount = state.buildings.length;
    this.activeOffices = [];
    this.baseCoverageByBuildingId.clear();

    for (let i = 0; i < state.buildings.length; i++) {
      const office = state.buildings[i];
      if (office.status === 'constructing' || !office.enabled) continue;
      const oDef = BUILDINGS[office.defId];
      if (!oDef || (!oDef.isMainHq && !oDef.isSubOffice && oDef.category !== 'government')) continue;

      const oFp = getBuildingFootprint(oDef, office.rotation ?? 0);
      this.activeOffices.push({
        defId: office.defId,
        cityId: office.cityId ?? 1,
        ox: office.gx + oFp.width * 0.5,
        oy: office.gy + oFp.height * 0.5,
        radius: oDef.isSubOffice
          ? (oDef.serviceRadius ?? 12) + (office.level - 1) * 2
          : 28 + (office.level - 1) * 4,
        isMainOrGov: Boolean(oDef.isMainHq || oDef.category === 'government'),
      });
    }
  }

  public static getZoneBonuses(zoneId: ZoneId | number): { prodMult: number; taxMult: number } {
    const zt = ZONE_ID_TO_TYPE[zoneId] ?? 'none';
    return {
      prodMult: ZONE_PROD_BONUSES[zt] ?? 1.0,
      taxMult: ZONE_TAX_BONUSES[zt] ?? 1.0,
    };
  }

  public static getBuildingCoverage(
    b: BuildingInstance,
    state: WorldEngineState,
    tileZoneId?: ZoneId | number
  ): BuildingServiceCoverage {
    if (this.cacheTick !== state.tick || this.cacheBldCount !== state.buildings.length) {
      this.prepareTickCache(state);
    }

    let baseCov = this.baseCoverageByBuildingId.get(b.id);
    if (!baseCov) {
      const def = BUILDINGS[b.defId];
      const fp = def ? getBuildingFootprint(def, b.rotation ?? 0) : { width: 1, height: 1 };
      const cx = b.gx + fp.width * 0.5;
      const cy = b.gy + fp.height * 0.5;

      let hasCivicHqOrSub = false;
      let hasTaxCoverage = false;
      let hasEducationCoverage = false;
      let hasWorkerCoverage = false;
      let hasGovCoverage = false;

      for (let i = 0; i < this.activeOffices.length; i++) {
        const office = this.activeOffices[i];
        const dist = Math.hypot(cx - office.ox, cy - office.oy);
        const inSameCity = office.cityId === (b.cityId ?? 1);
        const covers = office.isMainOrGov ? inSameCity || dist <= office.radius : dist <= office.radius;
        if (!covers) continue;

        const id = office.defId;
        if (
          id === 'main_town_hall' ||
          id === 'sub_town_hall' ||
          id === 'city_hall' ||
          id === 'government_hq' ||
          id === 'parliament_building'
        ) {
          hasCivicHqOrSub = true;
        }
        if (
          id === 'government_office' ||
          id === 'sub_government_office' ||
          id === 'government_hq' ||
          id === 'parliament_building' ||
          id === 'court_house' ||
          id === 'public_records_office'
        ) {
          hasGovCoverage = true;
        }
        if (
          id === 'tax_office' ||
          id === 'sub_tax_office' ||
          id === 'regional_tax_office' ||
          id === 'ministry_finance'
        ) {
          hasTaxCoverage = true;
        }
        if (
          id === 'education_ministry' ||
          id === 'sub_education_office' ||
          id === 'ministry_agriculture' ||
          id === 'census_office'
        ) {
          hasEducationCoverage = true;
        }
        if (
          id === 'worker_office' ||
          id === 'sub_worker_office' ||
          id === 'employment_office' ||
          id === 'ministry_trade' ||
          id === 'ministry_transport'
        ) {
          hasWorkerCoverage = true;
        }
      }

      baseCov = {
        hasCivicHqOrSub,
        hasTaxCoverage,
        hasEducationCoverage,
        hasWorkerCoverage,
        hasGovCoverage,
        taxBonusMult: hasTaxCoverage ? 1.15 : 1.0,
        prodBonusMult: (hasWorkerCoverage ? 1.12 : 1.0) * (hasGovCoverage ? 1.05 : 1.0),
        educationBonusMult: hasEducationCoverage ? 1.25 : 1.0,
      };
      this.baseCoverageByBuildingId.set(b.id, baseCov);
    }

    if (tileZoneId === undefined || tileZoneId === 0) {
      return baseCov;
    }

    const zBonus = this.getZoneBonuses(tileZoneId);
    if (zBonus.taxMult === 1.0 && zBonus.prodMult === 1.0) {
      return baseCov;
    }

    return {
      ...baseCov,
      taxBonusMult: baseCov.taxBonusMult * zBonus.taxMult,
      prodBonusMult: baseCov.prodBonusMult * zBonus.prodMult,
    };
  }

  public static computeWorldServiceCoveragePct(state: WorldEngineState): number {
    this.prepareTickCache(state);
    let totalTargets = 0;
    let covered = 0;
    for (let i = 0; i < state.buildings.length; i++) {
      const b = state.buildings[i];
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def || def.isMainHq || def.isSubOffice || def.category === 'government') continue;
      totalTargets++;
      const cov = this.getBuildingCoverage(b, state);
      if (
        cov.hasCivicHqOrSub ||
        cov.hasTaxCoverage ||
        cov.hasEducationCoverage ||
        cov.hasWorkerCoverage ||
        cov.hasGovCoverage
      ) {
        covered++;
      }
    }
    if (totalTargets === 0) return 100;
    const pct = Math.round((covered / totalTargets) * 100);
    if (state.utilitySummary) {
      state.utilitySummary.serviceCoveragePct = pct;
    }
    return pct;
  }
}
