export class Settings {
  volume: number = 70;
  soundEffectVolume: number = 60; // <-- new property

  static STORAGE_KEY = "videosouls_settings";

  static load(): Settings {
    try {
      const raw = localStorage.getItem(Settings.STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        const s = new Settings();
        s.volume = typeof obj.volume === "number" ? obj.volume : 100;
        s.soundEffectVolume = typeof obj.soundEffectVolume === "number" ? obj.soundEffectVolume : 60; // <-- load from storage or default
        return s;
      }
    } catch {}
    return new Settings();
  }

  save() {
    localStorage.setItem(Settings.STORAGE_KEY, JSON.stringify(this));
  }

  getNormalizedVolume(): number {
    const v = this.volume;
    if (!Number.isFinite(v)) return 1;
    return Math.max(0, Math.min(1, v / 100));
  }

  getNormalizedSoundEffectVolume(): number {
    const v = this.soundEffectVolume;
    if (!Number.isFinite(v)) return 0.6;
    return Math.max(0, Math.min(1, v / 100));
  }
}
