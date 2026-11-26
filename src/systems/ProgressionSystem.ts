import { ACHIEVEMENTS } from '../data/achievements.data';
import { getLevelCoinReward, getXpForNextLevel, GUIDED_QUESTS, QuestDef } from '../data/levels.data';
import type { NotificationItem, WorldEngineState } from '../core/GameState';

export interface QuestProgressEntry {
  quest: QuestDef;
  progress: number;
  completed: boolean;
  unlocked: boolean;
}

export class ProgressionSystem {
  private nextNotifId = 1;
  private notifications: NotificationItem[] = [];

  public pushNotification(
    state: WorldEngineState,
    severity: NotificationItem['severity'],
    title: string,
    message: string
  ): void {
    // Deduplicate identical recent titles within 15 ticks
    const duplicate = this.notifications.find((n) => n.title === title && state.tick - n.tick < 15);
    if (duplicate) return;

    this.notifications.unshift({
      id: this.nextNotifId++,
      tick: state.tick,
      severity,
      title,
      message,
    });
    if (this.notifications.length > 25) {
      this.notifications.length = 25;
    }
  }

  public getNotifications(): NotificationItem[] {
    return this.notifications;
  }

  public tickProgression(state: WorldEngineState, onLevelUp: (newLevel: number, reward: number) => void): void {
    // 1. Evaluate Level Ups
    let threshold = getXpForNextLevel(state.level);
    while (state.xp >= threshold) {
      state.xp -= threshold;
      state.level += 1;
      const coinReward = getLevelCoinReward(state.level);
      state.coins += coinReward;
      state.stats.totalCoinsEarned += coinReward;
      this.pushNotification(
        state,
        'milestone',
        `Level ${state.level} Reached`,
        `+${coinReward} Coins awarded and new technologies/buildings unlocked.`
      );
      onLevelUp(state.level, coinReward);
      threshold = getXpForNextLevel(state.level);
    }

    // 2. Evaluate All Guided Quests (never stalls behind an earlier quest!)
    for (const q of GUIDED_QUESTS) {
      if (state.completedQuestIds.includes(q.id)) continue;
      if (this.getQuestProgress(state, q) >= q.targetValue) {
        state.completedQuestIds.push(q.id);
        if (state.trackedQuestId === q.id) {
          state.trackedQuestId = null;
        }
        state.coins += q.rewardCoins;
        state.stats.totalCoinsEarned += q.rewardCoins;
        state.xp += q.rewardXp;
        this.pushNotification(
          state,
          'milestone',
          `Quest Complete: ${q.title}`,
          `+${q.rewardCoins} Coins · +${q.rewardXp} XP`
        );
      }
    }

    // Re-check level-ups in case quest XP pushed player past a level threshold
    threshold = getXpForNextLevel(state.level);
    while (state.xp >= threshold) {
      state.xp -= threshold;
      state.level += 1;
      const coinReward = getLevelCoinReward(state.level);
      state.coins += coinReward;
      state.stats.totalCoinsEarned += coinReward;
      this.pushNotification(
        state,
        'milestone',
        `Level ${state.level} Reached`,
        `+${coinReward} Coins awarded and new technologies/buildings unlocked.`
      );
      onLevelUp(state.level, coinReward);
      threshold = getXpForNextLevel(state.level);
    }

    // 3. Evaluate Achievements
    for (const a of ACHIEVEMENTS) {
      if (state.unlockedAchievements.includes(a.id)) continue;
      const val = this.getAchievementStat(state, a.statKey);
      if (val >= a.target) {
        state.unlockedAchievements.push(a.id);
        state.coins += a.rewardCoins;
        state.stats.totalCoinsEarned += a.rewardCoins;
        state.xp += a.rewardXp;
        this.pushNotification(
          state,
          'milestone',
          `Achievement: ${a.title}`,
          `${a.description} (+${a.rewardCoins}C, +${a.rewardXp} XP)`
        );
      }
    }
  }

  public getAllQuestProgress(state: WorldEngineState): QuestProgressEntry[] {
    return GUIDED_QUESTS.map((quest) => {
      const completed = state.completedQuestIds.includes(quest.id);
      const unlocked = state.level >= (quest.minLevel ?? 1);
      const progress = completed
        ? quest.targetValue
        : Math.min(quest.targetValue, this.getQuestProgress(state, quest));
      return { quest, progress, completed, unlocked };
    });
  }

  /**
   * Returns up to `limit` parallel active uncompleted quests appropriate for player's level
   * so one stalled exploration/craft mission never freezes the rest of the quest board.
   */
  public getActiveQuests(state: WorldEngineState, limit = 3): Array<{ quest: QuestDef; progress: number }> {
    const entries = this.getAllQuestProgress(state).filter((e) => !e.completed && e.unlocked);
    if (entries.length > 0) {
      return entries.slice(0, limit).map((e) => ({ quest: e.quest, progress: e.progress }));
    }
    // Fallback to next upcoming quest even if minLevel higher
    const nextAny = this.getAllQuestProgress(state).find((e) => !e.completed);
    return nextAny ? [{ quest: nextAny.quest, progress: nextAny.progress }] : [];
  }

  public getActiveQuest(state: WorldEngineState): { quest: QuestDef; progress: number } | null {
    const active = this.getActiveQuests(state, 6);
    if (active.length === 0) return null;
    if (state.trackedQuestId) {
      const pinned = active.find((a) => a.quest.id === state.trackedQuestId);
      if (pinned) return pinned;
    }
    return active[0];
  }

  public getQuestProgress(state: WorldEngineState, q: QuestDef): number {
    switch (q.targetType) {
      case 'trees_cut':
        return state.stats.treesCut;
      case 'unlocked_tiles':
        return state.stats.unlockedTiles;
      case 'road_count':
        return Math.max(state.roadConnectedCount, state.stats.roadsBuilt);
      case 'population':
        return state.population.total;
      case 'tech_count':
        return state.unlockedTechIds.length;
      case 'level':
        return state.level;
      case 'building_count':
        return state.buildings.filter((b) => b.defId === q.buildingId && b.status !== 'constructing').length;
      case 'ruins_explored':
        return state.stats.ruinsExplored;
      case 'festivals_held':
        return state.stats.festivalsHeld;
      case 'buildings_moved':
        return state.stats.buildingsMoved ?? 0;
      case 'trades_completed':
        return state.stats.tradesCompleted ?? 0;
      default:
        return 0;
    }
  }

  private getAchievementStat(
    state: WorldEngineState,
    key: (typeof ACHIEVEMENTS)[number]['statKey']
  ): number {
    switch (key) {
      case 'treesCut':
        return state.stats.treesCut;
      case 'unlockedTiles':
        return state.stats.unlockedTiles;
      case 'buildingsBuilt':
        return state.stats.buildingsBuilt;
      case 'roadsBuilt':
        return state.stats.roadsBuilt;
      case 'maxPopulation':
        return state.stats.maxPopulation;
      case 'totalCoinsEarned':
        return Math.floor(state.stats.totalCoinsEarned);
      case 'techUnlockedCount':
        return state.unlockedTechIds.length;
      case 'level':
        return state.level;
      case 'tradesCompleted':
        return state.stats.tradesCompleted;
      case 'ruinsExplored':
        return state.stats.ruinsExplored;
      case 'festivalsHeld':
        return state.stats.festivalsHeld;
      case 'buildingsMoved':
        return state.stats.buildingsMoved ?? 0;
      default:
        return 0;
    }
  }
}
