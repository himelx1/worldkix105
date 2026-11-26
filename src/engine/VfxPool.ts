import type Phaser from 'phaser';

interface FloatingLabel {
  text: Phaser.GameObjects.Text;
  life: number;
  maxLife: number;
}

interface ChipParticle {
  rect: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  life: number;
}

export class VfxPool {
  private readonly scene: Phaser.Scene;
  private labels: FloatingLabel[] = [];
  private particles: ChipParticle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    for (let i = 0; i < 20; i++) {
      const text = scene.add
        .text(0, 0, '', {
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#fef08a',
          stroke: '#09140f',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(900000)
        .setVisible(false);
      this.labels.push({ text, life: 0, maxLife: 0.9 });
    }

    for (let i = 0; i < 32; i++) {
      const rect = scene.add
        .rectangle(0, 0, 4, 4, 0xd97706)
        .setDepth(899999)
        .setVisible(false);
      this.particles.push({ rect, vx: 0, vy: 0, life: 0 });
    }
  }

  public spawnText(wx: number, wy: number, message: string, color = '#fef08a'): void {
    const slot = this.labels.find((l) => l.life <= 0);
    if (!slot) return;
    slot.text.setText(message).setColor(color).setPosition(wx, wy).setAlpha(1).setVisible(true);
    slot.life = slot.maxLife;
  }

  public spawnChips(wx: number, wy: number, color = 0xb45309, count = 5): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (p.life > 0) continue;
      p.rect
        .setFillStyle(color)
        .setPosition(wx, wy)
        .setAlpha(1)
        .setVisible(true);
      p.vx = (Math.random() - 0.5) * 70;
      p.vy = -40 - Math.random() * 55;
      p.life = 0.45;
      spawned++;
      if (spawned >= count) break;
    }
  }

  public update(dtSec: number): void {
    for (const l of this.labels) {
      if (l.life <= 0) continue;
      l.life -= dtSec;
      l.text.y -= 26 * dtSec;
      l.text.setAlpha(Math.max(0, l.life / l.maxLife));
      if (l.life <= 0) l.text.setVisible(false);
    }

    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dtSec;
      p.vy += 180 * dtSec;
      p.rect.x += p.vx * dtSec;
      p.rect.y += p.vy * dtSec;
      p.rect.setAlpha(Math.max(0, p.life / 0.45));
      if (p.life <= 0) p.rect.setVisible(false);
    }
  }
}
