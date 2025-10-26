import { LevelDataV0, stringifyLevelData } from "./leveldata";

export type AutosaveEntry = {
  level: string;
  timestamp: number;
};

export type SavedBattleScore = {
  hitsTaken: number;
  blocks: number;
  rank: string;
  score: number;
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
  levelBestScores: Record<string, SavedBattleScore> = {};
  levelRecentScores: Record<string, SavedBattleScore> = {};
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
        Object.assign(s, obj);
        return s;
      }
    } catch { }
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

  recordLevelScore(levelId: string, score: SavedBattleScore): boolean {
    const currentBest = this.levelBestScores[levelId];
    this.levelRecentScores[levelId] = score;
    let updated = false;
    if (!currentBest || isNewScoreBetter(score, currentBest)) {
      this.levelBestScores[levelId] = score;
      updated = true;
    }
    this.save();
    return updated;
  }

  getLevelScore(levelId: string): SavedBattleScore | undefined {
    return this.levelBestScores[levelId];
  }

  getLevelRecentScore(levelId: string): SavedBattleScore | undefined {
    return this.levelRecentScores[levelId];
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

function isNewScoreBetter(newScore: SavedBattleScore, oldScore: SavedBattleScore): boolean {
  if (newScore.rank === "S+" && oldScore.rank !== "S+") return true;
  if (oldScore.rank === "S+" && newScore.rank !== "S+") return false;
  if (newScore.score < oldScore.score) return true;
  if (newScore.score > oldScore.score) return false;
  if (newScore.hitsTaken !== oldScore.hitsTaken) return newScore.hitsTaken < oldScore.hitsTaken;
  if (newScore.blocks !== oldScore.blocks) return newScore.blocks < oldScore.blocks;
  return false;
}
