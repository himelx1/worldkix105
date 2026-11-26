import { useEffect, useRef } from 'react';
import { GameController, useGameSnapshot } from './ui/bridge/GameController';
import { BottomDock } from './ui/hud/BottomDock';
import { NotificationToasts } from './ui/hud/NotificationToasts';
import { TopHud } from './ui/hud/TopHud';
import { GameModals } from './ui/modals/GameModals';
import { AchievementsSheet } from './ui/panels/AchievementsSheet';
import { BuildMenuSheet } from './ui/panels/BuildMenuSheet';
import { EconomySheet } from './ui/panels/EconomySheet';
import { InventorySheet } from './ui/panels/InventorySheet';
import { LandUnlockSheet } from './ui/panels/LandUnlockSheet';
import { LevelUpSheet } from './ui/panels/LevelUpSheet';
import { NationalStatsSheet } from './ui/panels/NationalStatsSheet';
import { PopulationSheet } from './ui/panels/PopulationSheet';
import { QuestsSheet } from './ui/panels/QuestsSheet';
import { SelectionPanels } from './ui/panels/SelectionPanels';
import { SimInspectorDrawer } from './ui/panels/SimInspectorDrawer';
import { TechTreeSheet } from './ui/panels/TechTreeSheet';

export default function App() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const snap = useGameSnapshot();

  useEffect(() => {
    const el = canvasHostRef.current;
    if (!el) return;
    void GameController.mount(el);
    return () => {
      GameController.unmount();
    };
  }, []);

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#091912]">
      {/* Full-bleed Phaser 4 Isometric World Canvas */}
      <div ref={canvasHostRef} className="absolute inset-0 w-full h-full touch-none" />

      {/* Mobile-First UI Overlay Shell */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
        <TopHud snap={snap} />

        {snap.activeSheet === 'none' ? <BottomDock snap={snap} /> : null}
      </div>

      {/* Contextual Selection Cards & Bottom Sheets */}
      <NotificationToasts snap={snap} />
      {snap.activeSheet === 'none' ? <SelectionPanels snap={snap} /> : null}

      {snap.activeSheet === 'build' && <BuildMenuSheet snap={snap} />}
      {snap.activeSheet === 'levelup' && <LevelUpSheet snap={snap} />}
      {snap.activeSheet === 'land' && <LandUnlockSheet snap={snap} />}
      {snap.activeSheet === 'inventory' && <InventorySheet snap={snap} />}
      {snap.activeSheet === 'population' && <PopulationSheet snap={snap} />}
      {snap.activeSheet === 'economy' && <EconomySheet snap={snap} />}
      {snap.activeSheet === 'national_stats' && <NationalStatsSheet snap={snap} />}
      {snap.activeSheet === 'tech' && <TechTreeSheet snap={snap} />}
      {snap.activeSheet === 'quests' && <QuestsSheet snap={snap} />}
      {snap.activeSheet === 'achievements' && <AchievementsSheet snap={snap} />}

      {/* City & District Inspector Drawer */}
      {snap.simInspectorOpen && <SimInspectorDrawer snap={snap} />}

      {/* Pause, Settings & Save Manager Modals */}
      <GameModals snap={snap} />
    </div>
  );
}
