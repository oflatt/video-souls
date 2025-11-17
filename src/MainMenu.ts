import { LocalSave } from "./LocalSave";
import { AudioPlayer } from "./audioPlayer";
import { LevelDataV0, LevelMeta, parseLevelData, validateLevelData } from "./leveldata";
import { GameMode } from "./GameMode";
import { showFloatingAlert } from "./utils";
import { AutosavesPage } from "./AutosavesPage"; // <-- import new class
import { global, globalState } from './globalState';
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
  private howToPlayLoadPromise: Promise<boolean> | null = null;
  private howToPlayLoaded = false;

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
  this.setupHowToPlayModal();
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
          const floatingMenu = document.getElementById("floating-menu");
          if (floatingMenu) floatingMenu.style.display = "none";
          const menuAdPlaceholder = document.getElementById("ezoic-pub-ad-placeholder-107");
          if (menuAdPlaceholder) menuAdPlaceholder.style.display = "none";
          this.autosavesPage = new AutosavesPage(
            global().localSave.autosaves,
            () => {
              this.autosavesPage?.cleanup();
              this.autosavesPage = null;
              const floatingMenu = document.getElementById("floating-menu");
              if (floatingMenu) floatingMenu.style.display = "flex";
              const menuAdPlaceholder = document.getElementById("ezoic-pub-ad-placeholder-107");
              if (menuAdPlaceholder) menuAdPlaceholder.style.display = "block";
            }
          );
        }
      };
    }

    window.addEventListener("editor-back-to-menu", () => {
      global().setGameMode(GameMode.MENU);
    });
  }

  private setupHowToPlayModal(): void {
    const button = document.getElementById("how-to-play-button") as HTMLButtonElement | null;
    const backdrop = document.getElementById("how-to-play-backdrop") as HTMLDivElement | null;
    const dialog = backdrop?.querySelector(".how-to-play-dialog") as HTMLDivElement | null;
    const closeButton = backdrop?.querySelector(".how-to-play-close") as HTMLButtonElement | null;
    const content = document.getElementById("how-to-play-dialog-content") as HTMLDivElement | null;

    if (!button || !backdrop || !dialog || !closeButton || !content) {
      return;
    }

    dialog.setAttribute("aria-describedby", "how-to-play-dialog-content");

    const focusableSelector = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
    let focusableElements: HTMLElement[] = [];
    let lastFocusedElement: HTMLElement | null = null;

    const updateFocusableElements = () => {
      focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(el => !el.hasAttribute("disabled"));
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      updateFocusableElements();

      if (focusableElements.length === 0) {
        event.preventDefault();
        closeButton.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const openModal = async () => {
      lastFocusedElement = (document.activeElement as HTMLElement) ?? null;
      backdrop.hidden = false;
      requestAnimationFrame(() => backdrop.classList.add("open"));
      closeButton.focus();
      document.addEventListener("keydown", handleKeydown);

      if (!this.howToPlayLoaded) {
        if (!this.howToPlayLoadPromise) {
          content.innerHTML = '<p class="how-to-play-loading">Loading...</p>';
          this.howToPlayLoadPromise = this.loadHowToPlayContent(content);
        }
        const loaded = await this.howToPlayLoadPromise;
        this.howToPlayLoaded = loaded;
        if (!loaded) {
          this.howToPlayLoadPromise = null;
        }
      }

      updateFocusableElements();
      (focusableElements[0] ?? closeButton).focus();
    };

    const closeModal = () => {
      backdrop.classList.remove("open");
      backdrop.hidden = true;
      document.removeEventListener("keydown", handleKeydown);
      focusableElements = [];
      const fallback = lastFocusedElement ?? button;
      fallback?.focus();
    };

    button.addEventListener("click", () => { void openModal(); });
    closeButton.addEventListener("click", () => closeModal());
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) {
        closeModal();
      }
    });
  }

  private async loadHowToPlayContent(target: HTMLElement): Promise<boolean> {
    try {
      const response = await fetch("how-to-play.html", {
        headers: { Accept: "text/html" },
        cache: "no-cache",
      });
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const htmlText = await response.text();
      const parser = new DOMParser();
      const parsed = parser.parseFromString(htmlText, "text/html");
      const content = parsed.getElementById("how-to-play-content");

      if (content) {
        target.innerHTML = content.innerHTML;
      } else {
        target.innerHTML = htmlText;
      }

      const heading = target.querySelector<HTMLElement>("#how-to-play-heading");
      if (heading && !heading.hasAttribute("tabindex")) {
        heading.setAttribute("tabindex", "-1");
      }

      return true;
    } catch (error) {
      console.error("Failed to load how-to-play instructions", error);
      target.innerHTML = '<p class="how-to-play-error">Unable to load instructions right now. Please check your connection and try again.</p>';
      return false;
    }
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

  async loadLevelButtons(fallbackLocalSave?: LocalSave) {
    const localSave = this.resolveLocalSave(fallbackLocalSave);
    const levelFiles = await this.getLevelFiles();
    this.levelsContainer.innerHTML = '';

    for (const levelFile of levelFiles) {
      const level = await this.fetchAndParseLevelFile(levelFile);
      if (!level) continue;

      let titleText = "";
      if (level.title) {
        titleText = String(level.title);
      }
      const displayName = this.getLevelDisplayName(levelFile);
      const levelId = titleText || displayName;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'level-button';
      button.dataset.levelId = levelId;

      const labelText = titleText
        ? `${displayName} — ${titleText}`
        : displayName;
      const labelSpan = document.createElement('span');
      labelSpan.className = 'level-button-label';
      labelSpan.textContent = labelText;
      button.dataset.label = labelSpan.textContent ?? "";

      const rankSpan = document.createElement('span');
      rankSpan.className = 'level-button-rank';

      button.append(labelSpan, rankSpan);

      button.addEventListener('click', () => {
        const meta: LevelMeta = {
          source: "official",
          id: levelId,
          displayName: levelId,
        };
        global().setLevel(level, meta);
        global().setGameMode(GameMode.PLAYING);
      });

      this.updateSingleLevelButtonRank(button, levelId, localSave);
      this.levelsContainer.appendChild(button);
    }
  }

  updateLevelButtonRanks(fallbackLocalSave?: LocalSave) {
    const localSave = this.resolveLocalSave(fallbackLocalSave);
    const buttons = Array.from(this.levelsContainer.querySelectorAll<HTMLButtonElement>('.level-button'));
    for (const button of buttons) {
      const levelId = button.dataset.levelId;
      if (!levelId) continue;
      this.updateSingleLevelButtonRank(button, levelId, localSave);
    }
  }

  private updateSingleLevelButtonRank(button: HTMLButtonElement, levelId: string, fallbackLocalSave?: LocalSave | null) {
    const rankSpan = button.querySelector<HTMLSpanElement>('.level-button-rank');
    if (!rankSpan) return;

    const localSave = this.resolveLocalSave(fallbackLocalSave);
    const score = localSave?.getLevelScore(levelId);
    const baseLabel = button.dataset.label ?? button.textContent ?? levelId;

    if (score && score.rank) {
      rankSpan.textContent = score.rank;
      rankSpan.classList.remove('level-button-rank--empty');
      rankSpan.title = `Personal best: ${score.rank} (${score.score.toFixed(2)})`;
      button.setAttribute('aria-label', `${baseLabel} — Best rank ${score.rank}`);
    } else {
      rankSpan.textContent = "—";
      rankSpan.classList.add('level-button-rank--empty');
      rankSpan.removeAttribute('title');
      button.setAttribute('aria-label', `${baseLabel} — No rank recorded`);
    }
  }

  private resolveLocalSave(fallback?: LocalSave | null): LocalSave | null {
    const instance = globalState.videoSoulsInstance ?? null;
    if (instance && instance.localSave) {
      return instance.localSave;
    }
    return fallback ?? null;
  }

  async importLevel(): Promise<boolean> {
    const levelData = this.customLevelInput.value;
    try {
      const level = parseLevelData(levelData);
      if (level && level.video) {
        global().setLevel(level, null);
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
