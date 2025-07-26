import { Settings } from "./settings";
import { AudioPlayer } from "./audioPlayer";
import { LevelDataV0, validateLevelData, parseWithMaps } from "./leveldata";
import { GameMode } from "./GameMode";
import { showFloatingAlert } from "./utils";

export class MainMenu {
  settings: Settings;
  audio: AudioPlayer;
  volumeSlider: HTMLInputElement;
  soundEffectVolumeSlider: HTMLInputElement;
  levelsContainer: HTMLDivElement;
  onLoadAndPlayLevel: ((level: LevelDataV0) => void) | null = null;
  onLoadLevel: ((level: LevelDataV0) => void) | null = null; // <-- new callback
  onSetGameMode: ((mode: GameMode) => void) | null = null;   // <-- new callback
  exitToMenuButton: HTMLButtonElement;
  gameEditLevelButton: HTMLButtonElement;
  customLevelInput: HTMLInputElement;
  validationError: HTMLElement;
  recordButton: HTMLButtonElement;
  retryButton: HTMLButtonElement;
  backButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  customLevelPlayButton: HTMLButtonElement;
  customLevelEditButton: HTMLButtonElement;
  videoUrlInput: HTMLInputElement;

  constructor() {
    this.settings = Settings.load();
    this.audio = new AudioPlayer();

    this.volumeSlider = document.getElementById("main-menu-volume-slider") as HTMLInputElement;
    this.soundEffectVolumeSlider = document.getElementById("main-menu-sfx-volume-slider") as HTMLInputElement;
    this.levelsContainer = document.getElementById("levels-container") as HTMLDivElement;
    this.exitToMenuButton = document.getElementById("exit-to-menu-button") as HTMLButtonElement;
    this.gameEditLevelButton = document.getElementById("game-edit-level-button") as HTMLButtonElement;
    this.customLevelInput = document.getElementById("custom-level-input") as HTMLInputElement;
    this.validationError = document.getElementById("validation-error") as HTMLElement;
    this.recordButton = document.getElementById("record-button") as HTMLButtonElement;
    this.retryButton = document.getElementById("retry-button") as HTMLButtonElement;
    this.backButton = document.getElementById("back-button") as HTMLButtonElement;
    this.exportButton = document.getElementById("export-button") as HTMLButtonElement;
    this.customLevelPlayButton = document.getElementById("custom-level-play-button") as HTMLButtonElement;
    this.customLevelEditButton = document.getElementById("custom-level-edit-button") as HTMLButtonElement;
    this.videoUrlInput = document.getElementById("video-url") as HTMLInputElement;

    if (this.volumeSlider) this.volumeSlider.value = String(this.settings.videoVolume);
    if (this.soundEffectVolumeSlider) this.soundEffectVolumeSlider.value = String(this.settings.soundEffectVolume);

    this.audio.setVolume(this.getNormalizedSoundEffectVolume());

    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", () => {
        const vol = Number(this.volumeSlider.value);
        this.settings.videoVolume = vol;
        this.saveSettings();
      });
    }
    if (this.soundEffectVolumeSlider) {
      this.soundEffectVolumeSlider.addEventListener("input", () => {
        const sfxVol = Number(this.soundEffectVolumeSlider.value);
        this.settings.soundEffectVolume = sfxVol;
        this.saveSettings();
        this.audio.setVolume(this.getNormalizedSoundEffectVolume());
      });
    }

    // Wire up Exit to Menu button
    if (this.exitToMenuButton) {
      this.exitToMenuButton.onclick = () => {
        if (this.onSetGameMode) this.onSetGameMode(GameMode.MENU);
      };
    }

    // Wire up Edit Level button
    if (this.gameEditLevelButton) {
      this.gameEditLevelButton.onclick = () => {
        if (this.onSetGameMode) this.onSetGameMode(GameMode.EDITING);
      };
      this.gameEditLevelButton.style.display = "none";
    }

    this.retryButton.addEventListener('click', () => {
      if (this.onSetGameMode) this.onSetGameMode(GameMode.PLAYING);
    });

    this.backButton.addEventListener('click', () => {
      if (this.onSetGameMode) this.onSetGameMode(GameMode.MENU);
    });

    this.customLevelPlayButton.addEventListener('click', async () => {
      await this.importLevel();
    });

    this.customLevelEditButton.addEventListener('click', async () => {
      await this.importLevel();
      if (this.onSetGameMode) this.onSetGameMode(GameMode.EDITING);
    });

    window.addEventListener("editor-back-to-menu", () => {
      if (this.onSetGameMode) this.onSetGameMode(GameMode.MENU);
    });
  }

  saveSettings() {
    this.settings.save();
  }

  getNormalizedVolume(): number {
    return this.settings.getNormalizedVolume();
  }

  getNormalizedSoundEffectVolume(): number {
    return this.settings.getNormalizedSoundEffectVolume();
  }

  async loadLevelButtons() {
    const levelFiles = await this.getLevelFiles();
    this.levelsContainer.innerHTML = '';

    for (const levelFile of levelFiles) {
      let titleText = "";
      const level = await this.fetchAndParseLevelFile(levelFile);
      if (level && level.title) {
        titleText = String(level.title);
      }
      const button = document.createElement('button');
      button.textContent = titleText
        ? `${this.getLevelDisplayName(levelFile)} — ${titleText}`
        : this.getLevelDisplayName(levelFile);
      button.className = 'level-button';
      button.addEventListener('click', () => {
        if (level && this.onLoadLevel) {
          this.onLoadLevel(level); // <-- call loadLevel
        }
        if (this.onSetGameMode) {
          this.onSetGameMode(GameMode.PLAYING); // <-- call setGameMode
        }
      });
      this.levelsContainer.appendChild(button);
    }
  }

  async importLevel(): Promise<boolean> {
    const levelData = this.customLevelInput.value;
    try {
      const level = parseWithMaps(levelData);
      const validation = await validateLevelData(level);
      if (validation === null) {
        if (this.onLoadLevel) {
          this.onLoadLevel(level);
        }
        if (this.onSetGameMode) {
          this.onSetGameMode(GameMode.PLAYING);
        }
        return true;
      } else {
        showFloatingAlert("Invalid Level- see validation error below", 30, "20px");
        this.validationError.textContent = validation;
        this.validationError.style.display = 'block';
        return false;
      }
    } catch (error) {
      showFloatingAlert('Invalid JSON, failed to parse level data', 30, "20px");
      console.error('Invalid JSON', error);
      return false;
    }
  }

  private async fetchAndParseLevelFile(levelFile: string): Promise<LevelDataV0 | null> {
    try {
      const response = await fetch(`/levels/${levelFile}`);
      if (!response.ok) return null;
      const levelData = await response.text();
      const level = parseWithMaps(levelData);
      const validation = await validateLevelData(level);
      if (validation === null) {
        return level as LevelDataV0;
      } else {
        console.error('Level validation failed:', validation);
        return null;
      }
    } catch (error) {
      console.error('Error fetching/parsing level:', error);
      return null;
    }
  }

  private async getLevelFiles(): Promise<string[]> {
    const levelFiles: string[] = [];
    const maxLevels = 50;
    for (let i = 1; i <= maxLevels; i++) {
      const filename = `${i.toString().padStart(2, '0')}.json`;
      try {
        const response = await fetch(`/levels/${filename}`, { method: 'HEAD' });
        if (response.ok) {
          levelFiles.push(filename);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
    return levelFiles;
  }

  private getLevelDisplayName(filename: string): string {
    return filename
      .replace('.json', '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, str => str.toUpperCase());
  }
}
