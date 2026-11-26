import Phaser from 'phaser';
import type { CoreEngine } from '../core/CoreEngine';
import type { PerfMonitor } from '../persistence/PerfMonitor';
import type { AudioSystem } from './AudioSystem';
import { SceneCallbacks, WorldScene } from './WorldScene';

export class PhaserHost {
  public readonly game: Phaser.Game;
  public readonly worldScene: WorldScene;

  constructor(
    parent: HTMLElement,
    engine: CoreEngine,
    audio: AudioSystem,
    perf: PerfMonitor,
    callbacks: SceneCallbacks
  ) {
    this.worldScene = new WorldScene();
    this.worldScene.configure(engine, audio, perf, callbacks);

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight,
      backgroundColor: '#091912',
      antialias: true,
      roundPixels: true,
      banner: false,
      disableContextMenu: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        zoom: 1,
      },
      render: {
        pixelArt: false,
        antialias: true,
        powerPreference: 'default',
      },
      fps: {
        target: 60,
        min: 20,
      },
      scene: [this.worldScene],
    };

    // Keep capped DPR accessible without inflating framebuffer beyond 2x
    void dpr;
    this.game = new Phaser.Game(config);
  }

  public destroy(): void {
    this.game.destroy(true);
  }
}
