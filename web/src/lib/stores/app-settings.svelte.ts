export type PinMode = 'every-load' | 'session' | 'off';
export type AppMode = 'content' | 'travel';

class AppSettingsStore {
  title = $state('People');
  pinMode = $state<PinMode>('every-load');
  flattenSubfolders = $state(true);
  mode = $state<AppMode>('content');
  /** false until somebody sets a PIN; the PIN screen is skipped meanwhile */
  pinConfigured = $state(true);
  #loading?: Promise<void>;

  load() {
    this.#loading ??= this.refresh();
    return this.#loading;
  }

  async refresh() {
    try {
      const response = await fetch('/api/view/app-settings');
      if (response.ok) {
        this.apply(await response.json());
      }
    } catch {
      // keep the defaults, the server may be restarting
    }
  }

  apply(settings: { title: string; pinMode: PinMode; flattenSubfolders: boolean; mode: AppMode; pinConfigured?: boolean }) {
    this.title = settings.title;
    this.pinMode = settings.pinMode;
    this.flattenSubfolders = settings.flattenSubfolders;
    this.mode = settings.mode;
    this.pinConfigured = settings.pinConfigured ?? this.pinConfigured;
  }
}

export const appSettings = new AppSettingsStore();
