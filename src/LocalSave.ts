import { LevelDataV0, stringifyLevelData } from "./leveldata";

export type AutosaveEntry = {
  level: string;
  timestamp: number;
};

export class LocalSave {
  videoVolume: number = 100;
  soundEffectVolume: number = 50;
  autosaves: AutosaveEntry[] = [];
  editorVideoSpeed: number = 1; // <-- add property

  static STORAGE_KEY = "videosouls_settings";

  static load(): LocalSave {
    try {
      const raw = localStorage.getItem(LocalSave.STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        const s = new LocalSave();
        s.videoVolume = typeof obj.volume === "number" ? obj.volume : 100;
        s.soundEffectVolume = typeof obj.soundEffectVolume === "number" ? obj.soundEffectVolume : 60; // <-- load from storage or default
        s.autosaves = Array.isArray(obj.autosaves) ? obj.autosaves : []; // <-- load autosaves
        s.editorVideoSpeed = typeof obj.editorVideoSpeed === "number" ? obj.editorVideoSpeed : 1; // <-- load
        return s;
      }
    } catch {}
    return new LocalSave();
  }

  save() {
    localStorage.setItem(LocalSave.STORAGE_KEY, JSON.stringify(this));
  }

  addAutosave(level: LevelDataV0) {
    const levelDataString = stringifyLevelData(level);
    this.autosaves.push({
      level: levelDataString,
      timestamp: Date.now()
    });
    // Limit to 100 autosaves
    if (this.autosaves.length > 100) {
      this.autosaves = this.autosaves.slice(-100);
    }
    this.save();
  }

  overwriteLastAutosave(level: any) {
    if (this.autosaves.length === 0) {
      this.addAutosave(level);
    } else {
      const last = this.autosaves.length - 1;
      this.autosaves[last] = {
        level,
        timestamp: Date.now()
      };
      // Limit to 100 autosaves
      if (this.autosaves.length > 100) {
        this.autosaves = this.autosaves.slice(-100);
      }
      this.save();
    }
  }

  getNormalizedVolume(): number {
    const v = this.videoVolume;
    if (!Number.isFinite(v)) return 1;
    return Math.max(0, Math.min(1, v / 100));
  }

  getNormalizedSoundEffectVolume(): number {
    const v = this.soundEffectVolume;
    if (!Number.isFinite(v)) return 0.6;
    return Math.max(0, Math.min(1, v / 100));
  }
}
