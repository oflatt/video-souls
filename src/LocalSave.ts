import { LevelDataV0, stringifyLevelData } from "./leveldata";

export type AutosaveEntry = {
  level: string;
  timestamp: number;
};

export type Keybindings = {
  attack: string;
  attackAlt: string;
  parry: string;
  parryAlt1: string;
  parryAlt2: string;
  up: string;
  down: string;
  left: string;
  right: string;
  escape: string;
  play: string;
  seekLeft: string;
  seekRight: string;
  seekSmallLeft: string;
  seekSmallRight: string;
  seekMediumLeft: string;
  seekMediumRight: string;
  interval: string;
  critical: string;
  delete: string;
  deleteAlt1: string;
  deleteAlt2: string;
};

export class LocalSave {
  videoVolume: number = 100;
  soundEffectVolume: number = 50;
  menuVolume: number = 100; // <-- new property
  autosaves: AutosaveEntry[] = [];
  editorVideoSpeed: number = 1; // <-- add property
  keybindings: Keybindings = {
    attack: 'j',
    attackAlt: 'h',
    parry: 'k',
    parryAlt1: 'l',
    parryAlt2: ';',
    up: 'w',
    down: 's',
    left: 'a',
    right: 'd',
    escape: 'Escape',
    play: ' ',
    seekLeft: 'ArrowLeft',
    seekRight: 'ArrowRight',
    seekSmallLeft: 'm',
    seekSmallRight: '.',
    seekMediumLeft: 'j',
    seekMediumRight: 'l',
    interval: 'i',
    critical: 'o',
    delete: 'x',
    deleteAlt1: 'Backspace',
    deleteAlt2: 'Delete',
  };

  static STORAGE_KEY = "videosouls_settings";

  static load(): LocalSave {
    try {
      const raw = localStorage.getItem(LocalSave.STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        const s = new LocalSave();
        s.videoVolume = typeof obj.volume === "number" ? obj.volume : 100;
        s.soundEffectVolume = typeof obj.soundEffectVolume === "number" ? obj.soundEffectVolume : 60; 
        s.autosaves = Array.isArray(obj.autosaves) ? obj.autosaves : []; 
        s.editorVideoSpeed = typeof obj.editorVideoSpeed === "number" ? obj.editorVideoSpeed : 1;
        s.keybindings = typeof obj.keybindings === "object" && obj.keybindings !== null ? { ...s.keybindings, ...obj.keybindings } : s.keybindings;
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
      // delete last autosave
      this.autosaves = this.autosaves.slice(0, -1);
      this.addAutosave(level);
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

  getNormalizedMenuVolume(): number {
    const v = this.menuVolume;
    if (!Number.isFinite(v)) return 1.0;
    return Math.max(0, Math.min(1, v / 100));
  }
}
