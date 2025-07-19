export class Settings {
  volume: number = 70;

  static STORAGE_KEY = "videosouls_settings";

  static load(): Settings {
    try {
      const raw = localStorage.getItem(Settings.STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        const s = new Settings();
        s.volume = typeof obj.volume === "number" ? obj.volume : 100;
        return s;
      }
    } catch {}
    return new Settings();
  }

  save() {
    localStorage.setItem(Settings.STORAGE_KEY, JSON.stringify(this));
  }

  getNormalizedVolume(): number {
    return Math.max(0, Math.min(1, this.volume / 100));
  }
}
