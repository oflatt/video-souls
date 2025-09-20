import { LocalSave } from "./LocalSave";
import { AudioPlayer } from "./audioPlayer";
import { LevelDataV0, parseLevelData, validateLevelData } from "./leveldata";
import { GameMode } from "./GameMode";
import { showFloatingAlert } from "./utils";
import { AutosavesPage } from "./AutosavesPage"; // <-- import new class
import { global } from './globalState';
import { ControlsRebindPanel } from './ControlsRebindPanel';

export class MainMenu {
  audio: AudioPlayer;
  volumeSlider: HTMLInputElement;
  soundEffectVolumeSlider: HTMLInputElement;
  menuVolumeSlider: HTMLInputElement;
  levelsContainer: HTMLDivElement;
  onLoadAndPlayLevel: ((level: LevelDataV0) => void) | null = null;
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
  autosavesButton: HTMLButtonElement;
  autosavesPage: AutosavesPage | null = null; // <-- now stores instance

  constructor(localSave: LocalSave) {
    this.audio = new AudioPlayer();

    this.volumeSlider = document.getElementById("main-menu-volume-slider") as HTMLInputElement;
    this.soundEffectVolumeSlider = document.getElementById("main-menu-sfx-volume-slider") as HTMLInputElement;
    this.menuVolumeSlider = document.getElementById("main-menu-menu-volume-slider") as HTMLInputElement;
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
    this.autosavesButton = document.getElementById("autosaves-main-menu-button") as HTMLButtonElement;
    const rebindControlsButton = document.getElementById("main-menu-rebind-controls-button") as HTMLButtonElement;
    if (rebindControlsButton) {
      rebindControlsButton.onclick = () => {
        new ControlsRebindPanel();
      };
    }

    if (this.volumeSlider) this.volumeSlider.value = String(localSave.videoVolume);
    if (this.soundEffectVolumeSlider) this.soundEffectVolumeSlider.value = String(localSave.soundEffectVolume);
    if (this.menuVolumeSlider) this.menuVolumeSlider.value = String(localSave.menuVolume);

    this.audio.setVolume(localSave.getNormalizedSoundEffectVolume());

    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", () => {
        const vol = Number(this.volumeSlider.value);
        global().localSave.videoVolume = vol;
        global().localSave.save(); // <-- save immediately on change
        this.saveSettings();
      });
    }
    if (this.soundEffectVolumeSlider) {
      this.soundEffectVolumeSlider.addEventListener("input", () => {
        const sfxVol = Number(this.soundEffectVolumeSlider.value);
        global().localSave.soundEffectVolume = sfxVol;
        global().localSave.save();
        this.audio.setVolume(global().localSave.getNormalizedSoundEffectVolume());
      });
    }
    if (this.menuVolumeSlider) {
      this.menuVolumeSlider.addEventListener("input", () => {
        const menuVol = Number(this.menuVolumeSlider.value);
        global().localSave.menuVolume = menuVol;
        global().localSave.save();
      });
    }

    // Wire up Exit to Menu button
    if (this.exitToMenuButton) {
      this.exitToMenuButton.onclick = () => {
        global().setGameMode(GameMode.MENU);
      };
    }

    // Wire up Edit Level button
    if (this.gameEditLevelButton) {
      this.gameEditLevelButton.onclick = () => {
        global().setGameMode(GameMode.EDITING);
      };
      this.gameEditLevelButton.style.display = "none";
    }

    this.retryButton.addEventListener('click', () => {
      global().setGameMode(GameMode.PLAYING);
    });

    this.backButton.addEventListener('click', () => {
      global().setGameMode(GameMode.MENU);
    });

    this.customLevelPlayButton.addEventListener('click', async () => {
      await this.importLevel();
    });

    this.customLevelEditButton.addEventListener('click', async () => {
      await this.importLevel();
      global().setGameMode(GameMode.EDITING);
    });

    if (this.autosavesButton) {
      this.autosavesButton.onclick = () => {
        if (!this.autosavesPage) {
          this.autosavesPage = new AutosavesPage(
            global().localSave.autosaves,
            () => {
              this.autosavesPage?.cleanup();
              this.autosavesPage = null;
              const floatingMenu = document.getElementById("floating-menu");
              if (floatingMenu) floatingMenu.style.display = "flex";
            }
          );
        }
      };
    }

    window.addEventListener("editor-back-to-menu", () => {
      global().setGameMode(GameMode.MENU);
    });
  }

  saveSettings() {
    global().localSave.save();
  }

  cleanup() {
    if (this.autosavesPage) {
      this.autosavesPage.cleanup();
      this.autosavesPage = null;
    }
    // Hide main menu
    const floatingMenu = document.getElementById("floating-menu");
    if (floatingMenu) floatingMenu.style.display = "none";
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
          global().setLevel(level!);
          global().setGameMode(GameMode.PLAYING);
      });
      this.levelsContainer.appendChild(button);
    }
  }

  async importLevel(): Promise<boolean> {
    const levelData = this.customLevelInput.value;
    try {
      const level = parseLevelData(levelData);
      if (level && level.video) {
        global().setLevel(level);
        global().setGameMode(GameMode.PLAYING);
        return true;
      } else {
        const validation = validateLevelData(level);
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
      const level = parseLevelData(levelData);
      if (level) {
        return level as LevelDataV0;
      } else {
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
    for (let i = 0; i <= maxLevels; i++) {
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
