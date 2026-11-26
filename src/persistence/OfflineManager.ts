import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface OfflineStatus {
  isOnline: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  canPromptInstall: boolean;
  swReady: boolean;
  updateAvailable: boolean;
  storagePersisted: boolean;
  quotaFreeMB: number | null;
}

class OfflineManagerImpl {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private listeners = new Set<() => void>();

  public status: OfflineStatus = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isStandalone: false,
    isIOS: false,
    canPromptInstall: false,
    swReady: false,
    updateAvailable: false,
    storagePersisted: false,
    quotaFreeMB: null,
  };

  private initialized = false;

  public init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    const ua = window.navigator.userAgent.toLowerCase();
    this.status.isIOS = /iphone|ipad|ipod/.test(ua);
    this.status.isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    window.addEventListener('online', () => {
      this.status.isOnline = true;
      this.notify();
    });
    window.addEventListener('offline', () => {
      this.status.isOnline = false;
      this.notify();
    });

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.status.canPromptInstall = true;
      this.notify();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.status.canPromptInstall = false;
      this.status.isStandalone = true;
      this.notify();
    });

    this.updateSW = registerSW({
      immediate: true,
      onOfflineReady: () => {
        this.status.swReady = true;
        this.notify();
      },
      onNeedRefresh: () => {
        this.status.updateAvailable = true;
        this.notify();
      },
    });

    void this.checkStorage();
  }

  public async checkStorage(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    try {
      if (navigator.storage?.persisted) {
        this.status.storagePersisted = await navigator.storage.persisted();
      }
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        if (est.quota && est.usage !== undefined) {
          this.status.quotaFreeMB = Math.round((est.quota - est.usage) / (1024 * 1024));
        }
      }
      this.notify();
    } catch {
      // Ignore quota estimation failure on restricted browsers
    }
  }

  public async requestPersistence(): Promise<boolean> {
    try {
      if (navigator.storage?.persist) {
        const granted = await navigator.storage.persist();
        this.status.storagePersisted = granted;
        this.notify();
        return granted;
      }
    } catch {
      // Ignore
    }
    return false;
  }

  public async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      this.deferredPrompt = null;
      this.status.canPromptInstall = false;
      this.notify();
      return true;
    }
    return false;
  }

  public async applyUpdate(): Promise<void> {
    if (this.updateSW) {
      await this.updateSW(true);
    }
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}

export const OfflineManager = new OfflineManagerImpl();
