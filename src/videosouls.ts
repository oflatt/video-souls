// main.ts

import { Editor } from './editor';
import { levelDataFromVideo, LevelDataV0, validateLevelData, BossState, BossScheduleResult, stringifyWithMaps, parseWithMaps } from './leveldata';
import { Graphics } from './graphics';
import { InputManager, InputDirection } from './inputmanager';
import { AudioPlayer } from './audioPlayer';
import { BattleRenderer } from './battleRenderer';
import { BattleLogic } from './battleLogic';
import { AttackAnimation, BattleState, initialBattleState, directionNumToSwordAngle, updateBattleTime } from './battle';
import { VideoPlayer } from './videoPlayer';
import { Settings } from './settings';

// Load the interpreter from the local acorn_interpreter.js file
declare const Interpreter: any;

enum GameMode {
  MENU, PLAYING, BATTLE_END, EDITING
}

const ATTACK_COMBO_STARTUP_TIMES = [0.2, 0.2, 0.3, 0.2, 0.4];
const ATTACK_COMBO_DAMAGE_MULT = [1.0, 1.1, 1.3, 1.0, 2.2];
const ATTACK_END_LAG = 0.15;
const COMBO_EXTEND_TIME = 3.0; // number of seconds before combo lapses

const STAGGER_TIME = 0.4;

const PARRY_WINDOW = 0.2;
const PARRY_END_LAG = 0.2;

type AlertData = {
  message: HTMLElement,
  startTime: number,
  lifetime: number
};

// position relative to bottom left of screen
const attackedPosition = [0.7, 0.4];
const attackedAngle = Math.PI / 2;

// Create a global graphics instance and export it
export const graphics = new Graphics(document.querySelector<HTMLCanvasElement>("#game-canvas")!);

// Register global instance for playtest event
(window as any).videoSoulsInstance = null;

// Listen for playtest event from editor HUD
window.addEventListener("editor-playtest-level", () => {
  // Use global instance if available
  const instance = (window as any).videoSoulsInstance;
  if (instance && instance instanceof VideoSouls) {
    instance.setGameMode(GameMode.PLAYING);
  }
});

export class VideoSouls {
  elements;
  gameMode: GameMode;
  battle: BattleState;
  alerts: AlertData[];
  audio: AudioPlayer;
  inputManager: InputManager;
  battleRenderer: BattleRenderer;
  battleLogic: BattleLogic;
  videoPlayer: VideoPlayer;
  // only defined when in editing mode
  editor: Editor;
  settings: Settings;
  volumeSlider: HTMLInputElement;
  battleEndHudElement: HTMLElement | null = null;

  constructor(player: YT.Player) {
    this.videoPlayer = new VideoPlayer(player);
    this.audio = new AudioPlayer();
    this.inputManager = new InputManager();

    this.elements = {
      player: player,

      canvas: document.querySelector<HTMLCanvasElement>("#game-canvas")!,

      gameHUD: document.querySelector<HTMLInputElement>("#game-hud")!,
      battleEndHUD: document.querySelector<HTMLInputElement>("#battle-end-hud")!,
      floatingMenu: document.querySelector<HTMLInputElement>("#floating-menu")!,
      currentTimeDebug: document.querySelector<HTMLDivElement>("#current-time")!,
      playbackRecordHUD: document.querySelector<HTMLInputElement>("#playback-record-hud")!,
      recordHUD: document.querySelector<HTMLInputElement>("#record-hud")!,

      videoUrlInput: document.querySelector<HTMLInputElement>("#video-url")!,

      retryButton: document.querySelector<HTMLButtonElement>("#retry-button")!,
      backButton: document.querySelector<HTMLButtonElement>("#back-button")!,
      recordButton: document.querySelector<HTMLButtonElement>("#record-button")!,
      customLevelPlayButton: document.querySelector<HTMLButtonElement>("#custom-level-play-button")!,
      exportButton: document.querySelector<HTMLButtonElement>("#export-button")!,
      playbackBar: document.querySelector<HTMLInputElement>("#playback-bar")!,
      recordingControls: document.querySelector<HTMLInputElement>("#recording-controls")!,
      customLevelInput: document.querySelector<HTMLInputElement>("#custom-level-input")!,
      customLevelEditButton: document.querySelector<HTMLInputElement>("#custom-level-edit-button")!,
      validationError: document.querySelector<HTMLInputElement>("#validation-error")!,
      levelsContainer: document.querySelector<HTMLDivElement>("#levels-container")!,
    } as const;

    this.editor = new Editor(new LevelDataV0(), graphics, this.videoPlayer);
    this.battleRenderer = new BattleRenderer(this.elements.canvas, this.editor.level);
    this.battleLogic = new BattleLogic(this.audio, this.editor.level);
    this.gameMode = GameMode.MENU;
    this.battle = initialBattleState();
    this.alerts = [];
    this.settings = Settings.load();

    // Use the volume slider from the DOM
    this.volumeSlider = document.getElementById("main-menu-volume-slider") as HTMLInputElement;
    this.volumeSlider.value = String(this.settings.volume);

    // Set initial YouTube player volume
    player.setVolume(this.settings.volume);

    // Set initial sound effect volume
    this.audio.setVolume(this.settings.getNormalizedVolume());

    // Listen for slider changes
    this.volumeSlider.addEventListener("input", () => {
      const vol = Number(this.volumeSlider.value);
      this.settings.volume = vol;
      this.settings.save();
      player.setVolume(vol);
      this.audio.setVolume(this.settings.getNormalizedVolume());
    });

    // Listen for YouTube player volume changes (if user changes via YouTube UI)
    setInterval(() => {
      const ytVol = player.getVolume();
      if (ytVol !== this.settings.volume) {
        this.settings.volume = ytVol;
        this.volumeSlider.value = String(ytVol);
        this.settings.save();
        this.audio.setVolume(this.settings.getNormalizedVolume());
      }
    }, 500);

    // Add Exit to Menu button to game HUD (top left, shared style)
    const exitBtn = document.createElement("button");
    exitBtn.id = "exit-to-menu-button";
    exitBtn.className = "exit-to-menu-button"; // <-- shared CSS class
    exitBtn.textContent = "Exit to Menu";
    exitBtn.addEventListener("click", () => {
      this.setGameMode(GameMode.MENU);
    });
    this.elements.gameHUD.appendChild(exitBtn);

    // Add Edit Level button to game HUD (top left, next to exit)
    const editBtn = document.createElement("button");
    editBtn.id = "game-edit-level-button";
    editBtn.className = "game-edit-level-button";
    editBtn.textContent = "Edit Level";
    editBtn.style.display = "none";
    editBtn.onclick = () => {
      this.setGameMode(GameMode.EDITING);
    };
    this.elements.gameHUD.appendChild(editBtn);

    // Register this instance globally for playtest event
    (window as any).videoSoulsInstance = this;

    this.initializeEventListeners();
    this.loadLevelButtons();
  }

  // Shared helper to fetch and parse a level file
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

  private async loadLevelButtons() {
    try {
      const levelFiles = await this.getLevelFiles();
      this.elements.levelsContainer.innerHTML = '';

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
          this.loadAndPlayLevel(levelFile);
        });
        this.elements.levelsContainer.appendChild(button);
      }
    } catch (error) {
      console.error('Failed to load level files:', error);
      this.fadingAlert('Failed to load level files', 30, "20px");
    }
  }

  private async loadAndPlayLevel(levelFile: string) {
    try {
      console.log(`Loading level from file: ${levelFile}`);
      const level = await this.fetchAndParseLevelFile(levelFile);
      if (level) {
        this.editor.level = level;
        // Recreate battleLogic with new level
        this.battleLogic = new BattleLogic(this.audio, level);
        // Recreate battleRenderer with new level
        this.battleRenderer = new BattleRenderer(this.elements.canvas, level);
        this.setGameMode(GameMode.PLAYING);
      } else {
        this.fadingAlert(`Invalid or failed to load level file: ${levelFile}`, 30, "20px");
      }
    } catch (error) {
      this.fadingAlert(`Failed to load level: ${levelFile}`, 30, "20px");
      console.error('Error loading level:', error);
    }
  }

  private async getLevelFiles(): Promise<string[]> {
    // Try loading levels named level01.json, level02.json, ... until a fetch fails
    const levelFiles: string[] = [];
    const maxLevels = 50; // Arbitrary upper limit to avoid infinite loop
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
    // Convert filename to display name (e.g., "level1.json" -> "Level 1")
    return filename
      .replace('.json', '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, str => str.toUpperCase());
  }

  private initializeEventListeners() {
    // Set canvas size dynamically
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.elements.recordButton.addEventListener('click', () => {
      const videoUrl = this.elements.videoUrlInput.value;
      if (videoUrl) {
        this.recordVideo(videoUrl);
      } else {
        this.fadingAlert('Please enter a valid YouTube URL.', 30, "20px");
      }
    });

    this.elements.retryButton.addEventListener('click', () => {
      this.setGameMode(GameMode.PLAYING);
    });

    this.elements.backButton.addEventListener('click', () => {
      this.setGameMode(GameMode.MENU);
    });

    this.elements.customLevelPlayButton.addEventListener('click', async () => {
      if (await this.importLevel()) {
        this.setGameMode(GameMode.PLAYING);
      }
    });

    this.elements.exportButton.addEventListener('click', () => {
      this.exportLevel();
    });

    this.elements.customLevelEditButton.addEventListener('click', () => {
      // load the level data into the editor
      this.importLevel();
      this.setGameMode(GameMode.EDITING);
    });

    // Listen for editor HUD back button event
    window.addEventListener("editor-back-to-menu", () => {
      this.setGameMode(GameMode.MENU);
    });
  }

  private resizeCanvas() {
    console.log("Resizing canvas to window size");
    this.elements.canvas.width = window.innerWidth;
    this.elements.canvas.height = window.innerHeight;
  }

  mainLoop(_time: DOMHighResTimeStamp) {
    // Update battle time using the helper
    const deltaTime = this.videoPlayer.updateTime();
    updateBattleTime(this.battle, deltaTime);

    const currentTime = this.currentTime();
    const timeInMilliseconds = Math.floor(currentTime * 1000);
    this.elements.currentTimeDebug.textContent = `Time: ${timeInMilliseconds} ms data: ${this.editor.level.attackData.length}`;

    this.updateState();

    const ctx = this.elements.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);

    // draw canvas if we are in playing
    if (this.gameMode === GameMode.PLAYING) {
      this.drawCanvas();
    }
    // draw the sword if we are in editing or playback editing
    if (this.gameMode === GameMode.EDITING) {
      this.drawSword();
      // draw the editor
      this.editor.draw(this.inputManager.mouseX, this.inputManager.mouseY);
    }

    this.fadeOutAlerts();

    requestAnimationFrame(this.mainLoop.bind(this));
  }

  fadingAlert(message: string, fontSize: number = 40, position: string, color: string = 'white', font: string = 'Arial') {
    // make an alert text element on top of the screen
    const alertText = document.createElement('div');
    alertText.classList.add("fading-alert");
    alertText.style.fontSize = `${fontSize}px`;
    alertText.style.top = position;
    alertText.style.color = color;
    alertText.style.fontFamily = font;
    alertText.textContent = message;
    document.body.appendChild(alertText);
    this.alerts.push({
      message: alertText,
      startTime: Date.now(),
      lifetime: 3000
    });
  }

  private fadeOutAlerts() {
    const currentTime = Date.now();
    let remainingAlerts: AlertData[] = [];
    for (let alert of this.alerts) {
      let timeLived = currentTime - alert.startTime;
      if (timeLived > alert.lifetime) {
        alert.message.remove();
      } else {
        alert.message.style.opacity = `${1 - timeLived / alert.lifetime}`;
        remainingAlerts.push(alert);
      }
    }
    this.alerts = remainingAlerts;
  }

  // returns true if the level was successfully imported
  async importLevel(): Promise<boolean> {
    const levelData = this.elements.customLevelInput.value;
    try {
      const level = parseWithMaps(levelData);
      const validation = await validateLevelData(level);
      if (validation === null) {
        this.editor.level = level;
        // Recreate battleLogic with new level
        this.battleLogic = new BattleLogic(this.audio, level);
        // Recreate battleRenderer with new level
        this.battleRenderer = new BattleRenderer(this.elements.canvas, level);
        return true;
      } else {
        this.fadingAlert("Invalid Level- see validation error below", 30, "20px");
        this.elements.validationError.textContent = validation;
        this.elements.validationError.style.display = 'block';
        return false;
      }
    } catch (error) {
      this.fadingAlert('Invalid JSON, failed to parse level data', 30, "20px");
      console.error('Invalid JSON', error);
      return false;
    }
  }

  exportLevel() {
    // use the generic stringify function that handles Maps
    const json = stringifyWithMaps(this.editor.level);
    // copy the link to the clipboard
    navigator.clipboard.writeText(json).then(() => {
      this.fadingAlert('Level data copied to clipboard.', 30, "20px");
    }).catch(error => {
      this.fadingAlert('Failed to copy level data to clipboard.', 30, "20px");
      console.error('Failed to copy: ', error);
    });
  }

  // gets the attack direction, if any, for this time period
  // starttime exclusive, endtime inclusive
  getAttacksInInterval(startTime: number, endTime: number) {
    return this.editor.level.attackData.filter(attack => attack.time > startTime && attack.time <= endTime);
  }

  currentTime(): number {
    return this.videoPlayer.getCurrentTime();
  }

  handleBossAttacks() {
    const currentTime = this.currentTime();
    const prevTime = this.videoPlayer.prevTime;
    this.battleLogic.handleBossAttacks(
      this.battle,
      currentTime,
      prevTime,
      this.editor.level.attackData,
      this.inputManager
    );
  }

  startAttack() {
    this.battleLogic.startAttack(this.battle, this.inputManager);
  }

  doParry() {
    this.battleLogic.doParry(this.battle);
  }

  updateState() {
    const currentTime = this.currentTime();

    // if the sword is not in an animation, move towards user input dir
    this.battleLogic.updateSwordPosition(this.battle, this.inputManager.getCurrentTargetDirection.bind(this.inputManager));

    // if the game mode is editing, update the editor
    if (this.gameMode == GameMode.EDITING) {
      this.editor!.update(this.inputManager.getJustPressedKeys(), this.inputManager.getCurrentTargetDirection(), this.inputManager.mouseX);
    }

    if (this.gameMode == GameMode.PLAYING) {
      // Evaluate attack schedule
      this.battleLogic.handleAttackSchedule(
        this.battle,
        currentTime,
        this.videoPlayer,
        this.editor.level.attackIntervals
      );

      // TODO move key handling input to battle logic file
      if (this.inputManager.wasKeyJustPressed(this.inputManager.attackKey) && this.battle.bufferedInput === null) {
        // buffer attack
        this.battle.bufferedInput = this.inputManager.attackKey;
      }

      // check if parry button pressed
      if (this.inputManager.wasKeyJustPressed(this.inputManager.parryKey) && this.battle.bufferedInput === null) {
        // buffer the parry
        this.battle.bufferedInput = this.inputManager.parryKey;
      }

      // check if we finished an animation
      this.battleLogic.handleAnimations(this.battle, this.inputManager);

      // ready for new buffered action
      if (this.battle.bufferedInput !== null && this.battle.anim.state === AttackAnimation.NONE) {
        if (this.battle.bufferedInput === this.inputManager.parryKey) {
          this.doParry();
          this.battle.bufferedInput = null;
        } else if (this.battle.bufferedInput === this.inputManager.attackKey) {
          this.startAttack();
          this.battle.bufferedInput = null;
        }
      }

      // check if we were attacked in playing mode
      if (this.gameMode === GameMode.PLAYING) {
        this.handleBossAttacks();
      }

      // check for player death or win condition
      if (this.battle.playerHealth <= 0) {
        this.setGameMode(GameMode.BATTLE_END);
      } else if (this.battle.bossHealth <= 0 && this.battle.currentInterval === "death") {
        const deathInterval = this.editor.level.attackIntervals.get("death");
        if (deathInterval && currentTime >= deathInterval.end || this.videoPlayer.getPlayerState() === YT.PlayerState.ENDED) {
          this.setGameMode(GameMode.BATTLE_END);
        }
      }
    }

    
    // check for the escape key
    if (this.inputManager.wasKeyJustPressed('Escape')) {
      // set game mode to menu
      this.setGameMode(GameMode.MENU);
    }

    this.inputManager.clearJustPressed();
  }

  setGameMode(mode: GameMode) {
    // always sync the custom level input with the level data using generic stringify
    this.elements.customLevelInput.value = stringifyWithMaps(this.editor.level);

    // clear validation errors
    this.elements.validationError.textContent = '';
    this.elements.validationError.style.display = 'none';


    // if the video is valid, load it
    this.videoPlayer.pauseVideo();

    // if the new mode is battle end, show the battle end hud
    if (mode === GameMode.BATTLE_END) {
      // Only create HUD when entering battle end
      if (this.battle.playerHealth <= 0) {
        this.createBattleEndHud("lose");
      } else {
        this.createBattleEndHud("win");
      }
      if (this.battleEndHudElement) this.battleEndHudElement.style.display = "flex";
    } else {
      if (this.battleEndHudElement) this.battleEndHudElement.style.display = "none";
    }

    // reset the sword state
    this.battle = initialBattleState();
    // Set bossHealth from level data
    this.battle.bossHealth = this.editor.level.bossHealth;
    this.battle.lastBossHealth = this.editor.level.bossHealth;

    // if the new mode is game, show the game hud
    if (mode === GameMode.PLAYING) {
      this.elements.gameHUD.style.display = 'flex';
    } else {
      this.elements.gameHUD.style.display = 'none';
    }

    // if the new mode is menu, show the menu
    if (mode === GameMode.MENU) {
      this.elements.floatingMenu.style.display = 'flex';
    } else {
      this.elements.floatingMenu.style.display = 'none';
    }

    // load the video for editing, make new editor
    if (mode === GameMode.EDITING) {
      if (this.editor.level.video != null) {
        this.videoPlayer.cueVideoById(this.editor.level.video);
      }

      // Clean up old editor
      this.editor.cleanup();
      // Create new Editor, which now creates HUD itself
      this.editor = new Editor(this.editor.level, graphics, this.videoPlayer);

      // Set the editor title input to the level's title
      const title = this.editor.level.title ?? "";
      if (this.editor.hud && this.editor.hud.titleInput) {
        this.editor.hud.titleInput.value = title;
      }
    }

    // if the new mode is editing, show the editor hud
    if (mode === GameMode.EDITING) {
      this.editor.hudElement.style.display = 'flex';
    } else {
      this.editor.hudElement.style.display = 'none';
    }

    // load the video for playing
    if (mode === GameMode.PLAYING) {
      if (this.editor.level.video != null) {
        this.videoPlayer.loadVideoById(this.editor.level.video);
      }
      this.videoPlayer.pauseVideo();
      this.videoPlayer.setPlaybackRate(1.0);

      this.videoPlayer.playVideo();
    }

    // Show/hide Exit to Menu button based on game mode
    const exitBtn = document.getElementById("exit-to-menu-button");
    if (exitBtn) {
      exitBtn.style.display = (mode === GameMode.PLAYING) ? "block" : "none";
    }
    // Show/hide Edit Level button based on game mode
    const editBtn = document.getElementById("game-edit-level-button");
    if (editBtn) {
      editBtn.style.display = (mode === GameMode.PLAYING) ? "block" : "none";
    }

    this.gameMode = mode;

    // Always keep YouTube player volume in sync with settings
    this.elements.player.setVolume(this.settings.volume);
    this.audio.setVolume(this.settings.getNormalizedVolume());
  }

  setCurrentVideo(videoId: string) {
    this.editor.level = levelDataFromVideo(videoId);
    // Recreate battleLogic with new level
    this.battleLogic = new BattleLogic(this.audio, this.editor.level);
    // Recreate battleRenderer with new level
    this.battleRenderer = new BattleRenderer(this.elements.canvas, this.editor.level);
  }

  // Function to play a YouTube video by extracting the video ID from the URL
  recordVideo(videoUrl: string) {
    const videoId = extractVideoID(videoUrl);
    if (videoId != null) {
      this.setCurrentVideo(videoId);
      this.setGameMode(GameMode.EDITING);
    } else {
      this.fadingAlert('Invalid YouTube URL', 30, "20px");
    }
  }

  private drawCanvas() {
    const currentTime = this.currentTime();
    const displayTitle = this.editor.level.title || this.elements.player.getIframe().title;
    const arrowless = !!this.editor.level.arrowless;

    this.battleRenderer.drawCanvas(
      currentTime,
      this.videoPlayer.prevTime,
      this.battle,
      this.getAttacksInInterval.bind(this),
      arrowless ? undefined : this.audio.playWarningSound.bind(this.audio),
      this.inputManager.getCurrentTargetDirection.bind(this.inputManager),
      displayTitle,
      arrowless // <-- pass arrowless flag
    );
  }

  private drawSword() {
    const currentTime = this.currentTime();
    this.battleRenderer.drawSword(
      currentTime,
      this.battle,
      this.inputManager.getCurrentTargetDirection.bind(this.inputManager)
    );
  }

  currentTargetAngleRadians() {
    return this.battleRenderer.getCurrentTargetAngleRadians(
      this.inputManager.getCurrentTargetDirection.bind(this.inputManager)
    );
  }

  // Helper to create and show the battle end HUD
  private createBattleEndHud(type: "win" | "lose") {
    // Remove previous HUD if present
    if (this.battleEndHudElement && this.battleEndHudElement.parentNode) {
      this.battleEndHudElement.parentNode.removeChild(this.battleEndHudElement);
      this.battleEndHudElement = null;
    }

    // Pick template id
    const templateId = type === "win" ? "battle-end-hud-win-template" : "battle-end-hud-lose-template";
    const template = document.getElementById(templateId) as HTMLTemplateElement;
    if (!template || !template.content) throw new Error(`Missing ${templateId}`);

    const hudFragment = template.content.cloneNode(true) as DocumentFragment;
    const hudClone = hudFragment.querySelector<HTMLElement>("#battle-end-hud")!;
    document.body.appendChild(hudClone);
    this.battleEndHudElement = hudClone;

    // Wire up buttons
    const backBtn = hudClone.querySelector<HTMLButtonElement>("#back-button");
    if (backBtn) backBtn.onclick = () => this.setGameMode(GameMode.MENU);

    const retryBtn = hudClone.querySelector<HTMLButtonElement>("#retry-button");
    if (retryBtn) retryBtn.onclick = () => this.setGameMode(GameMode.PLAYING);

    // Show HUD
    hudClone.style.display = "flex";
  }
}

// Helper function to extract the video ID from a YouTube URL
function extractVideoID(url: string) {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Listen for playtest event from editor HUD
window.addEventListener("editor-playtest-level", () => {
  // Find the VideoSouls instance and set game mode to PLAYING
  // If you use a global, replace with your instance reference
  for (const k in window) {
    const v = (window as any)[k];
    if (v instanceof VideoSouls) {
      v.setGameMode(GameMode.PLAYING);
      break;
    }
  }
});
