export interface PerfMetrics {
  fps: number;
  frameTimeP95Ms: number;
  simTickMs: number;
  loadedChunks: number;
  lowPowerActive: boolean;
}

export class PerfMonitor {
  private frameSamples: number[] = [];
  private lastSimMs = 0;
  private loadedChunks = 1;
  private lowPowerActive = false;

  public recordFrameDelta(deltaMs: number): void {
    if (deltaMs <= 0 || deltaMs > 500) return;
    this.frameSamples.push(deltaMs);
    if (this.frameSamples.length > 60) {
      this.frameSamples.shift();
    }
  }

  public recordSimDuration(ms: number, chunkCount: number): void {
    this.lastSimMs = Number(ms.toFixed(2));
    this.loadedChunks = chunkCount;
  }

  public setLowPowerActive(active: boolean): void {
    this.lowPowerActive = active;
  }

  public getMetrics(): PerfMetrics {
    if (this.frameSamples.length === 0) {
      return {
        fps: 60,
        frameTimeP95Ms: 16.7,
        simTickMs: this.lastSimMs,
        loadedChunks: this.loadedChunks,
        lowPowerActive: this.lowPowerActive,
      };
    }

    const avg =
      this.frameSamples.reduce((acc, v) => acc + v, 0) / this.frameSamples.length;
    const sorted = [...this.frameSamples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];

    return {
      fps: Math.min(120, Math.round(1000 / Math.max(1, avg))),
      frameTimeP95Ms: Number(p95.toFixed(1)),
      simTickMs: this.lastSimMs,
      loadedChunks: this.loadedChunks,
      lowPowerActive: this.lowPowerActive,
    };
  }
}
