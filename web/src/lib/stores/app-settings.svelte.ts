export type PinMode = 'every-load' | 'session' | 'off';

class AppSettingsStore {
  title = $state('People');
  pinMode = $state<PinMode>('every-load');
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

  apply(settings: { title: string; pinMode: PinMode }) {
    this.title = settings.title;
    this.pinMode = settings.pinMode;
  }
}

export const appSettings = new AppSettingsStore();
