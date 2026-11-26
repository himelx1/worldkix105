export type SfxKind =
  | 'chop'
  | 'tree_clear'
  | 'build'
  | 'road'
  | 'unlock'
  | 'levelup'
  | 'coin'
  | 'discovery'
  | 'festival'
  | 'move'
  | 'demolish'
  | 'error'
  | 'ui';

export interface AmbientAudioContext {
  population: number;
  activeBuildings: number;
  timeOfDayHours: number;
  weather: 'clear' | 'rain' | 'storm' | 'drought' | 'snow';
  speed: number;
  hasWaterVisible: boolean;
  festivalActive?: boolean;
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterVol = 0.7;
  private sfxVol = 0.85;
  private ambientVol = 0.65;
  private lastPlayed: Partial<Record<SfxKind, number>> = {};

  private ambientInit = false;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;
  private natureCooldown = 1.6;
  private cityCooldown = 1.2;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.ctx && !this.ambientInit) {
      this.initAmbientBed(this.ctx);
    }
  }

  public setVolumes(master: number, sfx: number, ambient = this.ambientVol): void {
    this.masterVol = Math.max(0, Math.min(1, master));
    this.sfxVol = Math.max(0, Math.min(1, sfx));
    this.ambientVol = Math.max(0, Math.min(1, ambient));
  }

  private initAmbientBed(ctx: AudioContext): void {
    this.ambientInit = true;
    const length = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.02) * 0.45;
    }

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(ctx.destination);
    windSrc.start();
    this.windFilter = windFilter;
    this.windGain = windGain;

    const waterSrc = ctx.createBufferSource();
    waterSrc.buffer = buf;
    waterSrc.loop = true;
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'highpass';
    waterFilter.frequency.value = 950;
    const waterGain = ctx.createGain();
    waterGain.gain.value = 0;
    waterSrc.connect(waterFilter).connect(waterGain).connect(ctx.destination);
    waterSrc.start();
    this.waterGain = waterGain;
  }

  public updateAmbient(dtSec: number, env: AmbientAudioContext): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.ambientInit) return;

    const vol = this.masterVol * this.ambientVol;
    const now = this.ctx.currentTime;

    if (vol <= 0.01 || env.speed === 0) {
      this.windGain?.gain.setTargetAtTime(0, now, 0.25);
      this.waterGain?.gain.setTargetAtTime(0, now, 0.25);
      return;
    }

    const stormFactor = env.weather === 'storm' ? 1.8 : env.weather === 'rain' ? 1.25 : 1.0;
    const targetWind = vol * 0.055 * stormFactor;
    this.windGain?.gain.setTargetAtTime(targetWind, now, 0.4);
    this.windFilter?.frequency.setTargetAtTime(
      env.weather === 'storm' ? 520 : 310 + Math.sin(now * 0.35) * 65,
      now,
      0.5
    );

    const rainAmt = env.weather === 'storm' ? 0.095 : env.weather === 'rain' ? 0.065 : 0;
    const streamAmt = env.hasWaterVisible ? 0.028 : 0;
    this.waterGain?.gain.setTargetAtTime(vol * (rainAmt + streamAmt), now, 0.4);

    this.natureCooldown -= dtSec;
    if (this.natureCooldown <= 0) {
      const isNight = env.timeOfDayHours >= 19.2 || env.timeOfDayHours < 5.5;
      if (isNight) {
        this.natureCooldown = 1.4 + Math.random() * 2.2;
        this.playCricketChirp(vol * 0.04);
      } else if (env.weather !== 'storm') {
        this.natureCooldown = 2.0 + Math.random() * 3.2;
        this.playBirdChirp(vol * 0.048);
      } else {
        this.natureCooldown = 3.0;
      }
    }

    this.cityCooldown -= dtSec;
    if (this.cityCooldown <= 0 && (env.population > 0 || env.activeBuildings > 0 || env.festivalActive)) {
      const density = Math.min(1, (env.population + env.activeBuildings * 2) / 30);
      this.cityCooldown =
        (env.festivalActive ? 0.7 : Math.max(0.65, 2.8 - density * 1.9)) + Math.random() * 1.1;

      const r = Math.random();
      if (env.festivalActive && r < 0.6) {
        this.playMarketChime(vol * 0.055);
      } else if (r < 0.45) {
        this.playCityTap(vol * (0.032 + density * 0.03));
      } else if (r < 0.78 && env.population >= 3) {
        this.playMarketChime(vol * (0.024 + density * 0.025));
      } else if (env.activeBuildings >= 2) {
        this.playWorkshopClink(vol * (0.022 + density * 0.025));
      }
    }
  }

  private playBirdChirp(peak: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 1650 + Math.random() * 900;
    const g = this.ctx.createGain();
    g.connect(this.ctx.destination);
    this.playTone(this.ctx, g, 'sine', base, base * 1.32, t, 0.07, peak);

    const g2 = this.ctx.createGain();
    g2.connect(this.ctx.destination);
    this.playTone(this.ctx, g2, 'sine', base * 1.15, base * 0.92, t + 0.09, 0.08, peak * 0.85);
  }

  private playCricketChirp(peak: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const g = this.ctx.createGain();
      g.connect(this.ctx.destination);
      this.playTone(this.ctx, g, 'triangle', 3850, 3950, t + i * 0.045, 0.025, peak);
    }
  }

  private playCityTap(peak: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pitch = 210 + Math.random() * 90;
    const g = this.ctx.createGain();
    g.connect(this.ctx.destination);
    this.playTone(this.ctx, g, 'triangle', pitch, pitch * 0.65, t, 0.05, peak);
    if (Math.random() < 0.65) {
      const g2 = this.ctx.createGain();
      g2.connect(this.ctx.destination);
      this.playTone(this.ctx, g2, 'triangle', pitch * 1.06, pitch * 0.68, t + 0.16, 0.05, peak * 0.78);
    }
  }

  private playWorkshopClink(peak: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.ctx.destination);
    this.playTone(this.ctx, g, 'sine', 920 + Math.random() * 180, 740, t, 0.08, peak);
  }

  private playMarketChime(peak: number): void {
    if (!this.ctx) return;
    const notes = [523.25, 587.33, 659.25, 783.99];
    const n = notes[Math.floor(Math.random() * notes.length)];
    const g = this.ctx.createGain();
    g.connect(this.ctx.destination);
    this.playTone(this.ctx, g, 'sine', n, n * 0.995, this.ctx.currentTime, 0.24, peak);
  }

  public play(kind: SfxKind): void {
    const vol = this.masterVol * this.sfxVol;
    if (vol <= 0.01 || !this.ctx || this.ctx.state !== 'running') return;

    const nowMs = performance.now();
    const minInterval = kind === 'chop' || kind === 'road' ? 55 : 40;
    if (nowMs - (this.lastPlayed[kind] ?? 0) < minInterval) return;
    this.lastPlayed[kind] = nowMs;

    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.connect(this.ctx.destination);

    switch (kind) {
      case 'chop':
        this.playTone(this.ctx, gain, 'triangle', 165, 85, now, 0.08, vol * 0.25);
        break;
      case 'tree_clear':
        this.playTone(this.ctx, gain, 'sine', 240, 420, now, 0.14, vol * 0.22);
        break;
      case 'build':
        this.playTone(this.ctx, gain, 'triangle', 190, 280, now, 0.12, vol * 0.22);
        break;
      case 'road':
        this.playTone(this.ctx, gain, 'sine', 140, 120, now, 0.06, vol * 0.15);
        break;
      case 'unlock':
        this.playTone(this.ctx, gain, 'sine', 330, 520, now, 0.16, vol * 0.22);
        break;
      case 'coin':
        this.playTone(this.ctx, gain, 'sine', 660, 880, now, 0.11, vol * 0.18);
        break;
      case 'discovery': {
        this.playTone(this.ctx, gain, 'sine', 440, 659, now, 0.16, vol * 0.22);
        setTimeout(() => {
          if (this.ctx && this.ctx.state === 'running') {
            const g2 = this.ctx.createGain();
            g2.connect(this.ctx.destination);
            this.playTone(this.ctx, g2, 'sine', 659, 880, this.ctx.currentTime, 0.22, vol * 0.2);
          }
        }, 90);
        break;
      }
      case 'festival': {
        const chord = [523.25, 659.25, 783.99, 1046.5];
        chord.forEach((freq, idx) => {
          setTimeout(() => {
            if (this.ctx && this.ctx.state === 'running') {
              const g2 = this.ctx.createGain();
              g2.connect(this.ctx.destination);
              this.playTone(this.ctx, g2, 'triangle', freq, freq * 1.01, this.ctx.currentTime, 0.2, vol * 0.18);
            }
          }, idx * 75);
        });
        break;
      }
      case 'levelup':
        this.playTone(this.ctx, gain, 'triangle', 392, 523, now, 0.14, vol * 0.24);
        setTimeout(() => {
          if (this.ctx && this.ctx.state === 'running') {
            const g2 = this.ctx.createGain();
            g2.connect(this.ctx.destination);
            this.playTone(this.ctx, g2, 'triangle', 523, 784, this.ctx.currentTime, 0.22, vol * 0.24);
          }
        }, 100);
        break;
      case 'move':
        this.playTone(this.ctx, gain, 'triangle', 260, 390, now, 0.11, vol * 0.2);
        break;
      case 'demolish':
        this.playTone(this.ctx, gain, 'sawtooth', 180, 75, now, 0.14, vol * 0.16);
        break;
      case 'error':
        this.playTone(this.ctx, gain, 'sawtooth', 150, 105, now, 0.12, vol * 0.12);
        break;
      case 'ui':
      default:
        this.playTone(this.ctx, gain, 'sine', 420, 460, now, 0.045, vol * 0.1);
        break;
    }
  }

  private playTone(
    ctx: AudioContext,
    gain: GainNode,
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    startTime: number,
    duration: number,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), startTime + duration);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}
