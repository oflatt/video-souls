// main.ts

import { Editor } from './editor';
import { levelDataFromVideo, LevelDataV0,  BossState, BossScheduleResult, stringifyLevelData, LevelMeta,  } from './leveldata';
import { Graphics } from './graphics';
import { InputManager, InputDirection, getKeybinding } from './inputmanager';
import { BattleRenderer } from './battleRenderer';
import { BattleLogic } from './battleLogic';
import { AttackAnimation, BattleState, initialBattleState, directionNumToSwordAngle, updateBattleTime } from './battle';
import { VideoPlayer } from './videoPlayer';
import { LocalSave } from './LocalSave';
import { CommunityLevelsPage } from "./CommunityLevelsPage";
import { extractVideoID, showFloatingAlert } from './utils';
import { MainMenu } from './MainMenu'; // <-- import MainMenu
import { GameMode } from './GameMode';
import { EventData, EventType, setVideoSouls } from './globalState';
import { BattleEndHudManager } from './BattleEndHudManager';

type EzStandaloneQueue = Array<() => void> | { push: (handler: () => void) => unknown };

type EzStandalone = {
  cmd?: EzStandaloneQueue;
  showAds?: (slotId: number) => void;
};

declare global {
  interface Window {
    ezstandalone?: EzStandalone;
  }

  var ezstandalone: EzStandalone | undefined;
}

type LevelLoadEventData = {
  level: LevelDataV0;
  meta: LevelMeta | null;
};

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
  inputManager: InputManager;
  battleRenderer: BattleRenderer;
  battleLogic: BattleLogic;
  videoPlayer: VideoPlayer;
  editor: Editor;
  // only defined when in editing mode
  localSave: LocalSave;
  communityLevelsPage: CommunityLevelsPage | null = null;
  mainMenu: MainMenu;
  needsFreshAutosave: boolean = true; // <-- track if we need a fresh autosave
  lastAutosaveTime: number = 0; // <-- track last autosave timestamp
  events: EventData[];
  currentLevelMeta: LevelMeta | null = null;
  private battleEndHud: BattleEndHudManager | null = null;

  constructor(player: YT.Player) {
    this.videoPlayer = new VideoPlayer(player);
    this.inputManager = new InputManager();

    this.elements = {
      player: player,
      canvas: document.querySelector<HTMLCanvasElement>("#game-canvas")!,
      gameHUD: document.querySelector<HTMLInputElement>("#game-hud")!,
      battleEndHUD: document.querySelector<HTMLInputElement>("#battle-end-hud")!,
      floatingMenu: document.querySelector<HTMLInputElement>("#floating-menu")!,
      menuAdPlaceholder: document.querySelector<HTMLDivElement>("#ezoic-pub-ad-placeholder-107")!,
      siteFooter: document.querySelector<HTMLElement>(".site-footer")!,
      currentTimeDebug: document.querySelector<HTMLDivElement>("#current-time")!,
      videoUrlInput: document.querySelector<HTMLInputElement>("#video-url")!,
      recordButton: document.querySelector<HTMLButtonElement>("#record-button")!,
      customLevelInput: document.querySelector<HTMLInputElement>("#custom-level-input")!,
      validationError: document.querySelector<HTMLInputElement>("#validation-error")!,
    } as const;


    this.events = [];
    this.localSave = LocalSave.load();
  this.mainMenu = new MainMenu(this.localSave); 
    this.editor = new Editor(new LevelDataV0(), graphics, this.videoPlayer);
    this.battleRenderer = new BattleRenderer(this.elements.canvas);
    this.battleLogic = new BattleLogic(this.mainMenu.audio, this.editor.level());
    this.gameMode = GameMode.MENU;
    this.battle = initialBattleState();
    this.currentLevelMeta = null;

    // Set initial sound effect volume
    this.mainMenu.audio.setVolume(this.localSave.getNormalizedSoundEffectVolume());

    this.needsFreshAutosave = true;
    this.lastAutosaveTime = Date.now();

    // Add Community Levels button event
    const communityBtn = document.getElementById("community-levels-main-menu-button") as HTMLButtonElement;
    if (communityBtn) {
      communityBtn.onclick = () => {
        this.showCommunityLevelsPage();
      };
    }

    // Register this instance globally for playtest event
    (window as any).videoSoulsInstance = this;


    // Set canvas size dynamically
    this.elements.recordButton.addEventListener('click', () => {
      const videoUrl = this.elements.videoUrlInput.value;
      if (videoUrl) {
        this.recordVideo(videoUrl);
      } else {
        showFloatingAlert('Please enter a valid YouTube URL.', 30, "20px");
      }
    });

    this.mainMenu.exportButton.addEventListener('click', () => {
      this.exportLevel();
    });
  this.mainMenu.loadLevelButtons(this.localSave); // <-- call mainMenu's method
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // set initial game mode
    this.setGameModeNow(GameMode.MENU);

    setVideoSouls(this);
  }

  private resizeCanvas() {
    this.elements.canvas.width = window.innerWidth;
    this.elements.canvas.height = window.innerHeight;
  }

  setLevel(level: LevelDataV0, meta: LevelMeta | null) {
    this.events.push(new EventData(EventType.SetLevel, { level, meta } as LevelLoadEventData));
  }

  level(): LevelDataV0 {
    return this.editor.level();
  }

  mainLoop(_time: DOMHighResTimeStamp) {
    // do any events
    for (const event of this.events) {
      if (event.event == EventType.SetLevel) {
  const payload = event.data as LevelLoadEventData;
        this.editor.setLevel(payload.level);
        this.currentLevelMeta = payload.meta ?? null;
      }
      if (event.event == EventType.SetGameMode) {
        this.setGameModeNow(event.data as GameMode);
      }
    }

    // clear events
    this.events = [];


    // keep the player's volume in sync with the settings
    // if we are in the menu, use menu volume
    if (this.gameMode === GameMode.MENU) {
      this.elements.player.setVolume(this.localSave.menuVolume);
    } else {
      this.elements.player.setVolume(this.localSave.videoVolume);
    }
    

    // Update battle time using the helper
    const deltaTime = this.videoPlayer.updateTime();
    updateBattleTime(this.battle, deltaTime);

    //const currentTime = this.videoPlayer.getCurrentTime();
    //const timeInMilliseconds = Math.floor(currentTime * 1000);
    //this.elements.currentTimeDebug.textContent = `Time: ${timeInMilliseconds} ms data: ${this.editor.level().attackData.length}`;

    this.updateState();

    const ctx = this.elements.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);

    // draw canvas if we are in playing
    if (this.gameMode === GameMode.PLAYING) {
      this.drawCanvas();
    }

    // draw the sword if we are in editing or playback editing
    if (this.gameMode === GameMode.EDITING) {
      // Directly call drawSword instead of wrapper
      this.battleRenderer.drawSword(
        this.battle,
      );
      // draw the editor
      this.editor.draw(this.inputManager.mouseX, this.inputManager.mouseY);
    }

    // draw health bars only if showing death or win screen
    if (this.gameMode === GameMode.BATTLE_END) {
      this.battleRenderer.drawHealthBarsOnly(this.battle, this.editor.level(), false); // <-- don't show sliver
    }

    requestAnimationFrame(this.mainLoop.bind(this));
  }

  exportLevel() {
    // use the generic stringify function that handles Maps
    const json = stringifyLevelData(this.editor.level());
    // copy the link to the clipboard
    navigator.clipboard.writeText(json).then(() => {
      showFloatingAlert('Level data copied to clipboard.', 30, "20px");
    }).catch(error => {
      showFloatingAlert('Failed to copy level data to clipboard.', 30, "20px");
      console.error('Failed to copy: ', error);
    });
  }

  handleBossAttacks() {
    const currentTime = this.videoPlayer.getCurrentTime();
    const prevTime = this.videoPlayer.prevTime;
    this.battleLogic.handleBossAttacks(
      this.battle,
      currentTime,
      prevTime,
      this.editor.level().attackData,
      this.inputManager
    );
  }


  updateState() {
    const currentTime = this.videoPlayer.getCurrentTime();

    // if the sword is not in an animation, move towards user input dir
    this.battleLogic.update(this.battle, this.inputManager.getCurrentTargetDirection.bind(this.inputManager));

    // if the game mode is editing, update the editor
    if (this.gameMode == GameMode.EDITING) {
      this.editor!.update();
    }

    if (this.gameMode == GameMode.PLAYING) {
      // Evaluate attack schedule
      this.battleLogic.handleAttackSchedule(
        this.battle,
        currentTime,
        this.videoPlayer,
        this.editor.level().attackIntervals
      );

      // Check all attack keys
      const attackKeys = [getKeybinding("attack"), getKeybinding("attackAlt")];
      const parryKeys = [getKeybinding("parry"), getKeybinding("parryAlt1"), getKeybinding("parryAlt2")];
      if (attackKeys.some(key => this.inputManager.wasKeyJustPressed(key)) && this.battle.bufferedInput === null) {
        this.battle.bufferedInput = attackKeys.find(key => this.inputManager.wasKeyJustPressed(key))!;
      }
      if (parryKeys.some(key => this.inputManager.wasKeyJustPressed(key)) && this.battle.bufferedInput === null) {
        this.battle.bufferedInput = parryKeys.find(key => this.inputManager.wasKeyJustPressed(key))!;
      }

      // check if we finished an animation
      this.battleLogic.handleAnimations(this.battle, this.inputManager);

      // ready for new buffered action
      if (this.battle.bufferedInput !== null && this.battle.anim.state === AttackAnimation.NONE) {
        if (parryKeys.includes(this.battle.bufferedInput)) {
          this.battleLogic.doParry(this.battle, this.inputManager);
          this.battle.bufferedInput = null;
        } else if (attackKeys.includes(this.battle.bufferedInput)) {
          this.battleLogic.startAttack(this.battle, this.inputManager);
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
      } else if (this.battle.currentInterval === "death") {
        const deathInterval = this.editor.level().attackIntervals.get("death");
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

    // --- AUTOSAVE LOGIC ---
    if (this.gameMode === GameMode.EDITING) {
      const now = Date.now();
      if (now - this.lastAutosaveTime > 1000) { // every 1 seconds
        this.doAutosave();
        this.lastAutosaveTime = now;
      }
    }

    this.inputManager.clearJustPressed(); 

    // hack: if we are in state menu play the video
    if (this.gameMode === GameMode.MENU) {
      if (this.videoPlayer.getPlayerState() === YT.PlayerState.CUED || this.videoPlayer.getPlayerState() === YT.PlayerState.UNSTARTED) {
        this.videoPlayer.playVideo();
      }
    }
  }

  setGameMode(mode: GameMode) {
    this.events.push(new EventData(EventType.SetGameMode, mode));
  }

  private setGameModeNow(mode: GameMode) {
    // always sync the custom level input with the level data using generic stringify
    this.elements.customLevelInput.value = stringifyLevelData(this.editor.level());

    // clear validation errors
    this.elements.validationError.textContent = '';
    this.elements.validationError.style.display = 'none';


    // if the video is valid, load it
    this.videoPlayer.pauseVideo();

    // --- Video speed logic ---
    if (mode === GameMode.MENU) {
      this.videoPlayer.setPlaybackRate(1.0);
    }
    if (mode === GameMode.EDITING) {
      // Restore editor speed from LocalSave
      const speed = this.localSave.editorVideoSpeed ?? 1;
      this.videoPlayer.setPlaybackRate(speed);
    }

    // --- Video zoom/pan logic for main menu ---
    const iframe = this.videoPlayer.getIframe();
    if (iframe) {
      if (mode === GameMode.MENU) {
        // Zoom in (scale up) and pan right (translateX)
        iframe.style.transition = "transform 0.5s cubic-bezier(.4,2,.6,1)";
        iframe.style.transform = "scale(1.5) translateX(10%)";
        iframe.style.transformOrigin = "center center";
      } else {
        // Reset zoom/pan
        iframe.style.transition = "transform 0.5s cubic-bezier(.4,2,.6,1)";
        iframe.style.transform = "scale(1) translateX(0)";
        iframe.style.transformOrigin = "center center";
      }
    }

    // if the new mode is battle end, show the battle end hud
    if (mode === GameMode.BATTLE_END) {
      this.battleEndHud?.destroy();
      this.battleEndHud = new BattleEndHudManager(this.localSave, this.mainMenu.audio);
      if (this.battle.playerHealth <= 0) {
        this.battleEndHud.showLose();
      } else {
        this.battleEndHud.showWin({
          hits: this.battle.hitsTaken ?? 0,
          blocks: this.battle.blocksPerformed ?? 0,
          meta: this.currentLevelMeta,
        });
      }
    } else {
      this.battleEndHud?.destroy();
      this.battleEndHud = null;
    }

    // if the new mode is game, show the game hud and reset battle state
    if (mode === GameMode.PLAYING) {
      this.elements.gameHUD.style.display = 'flex';
      // reset the sword state
  this.battle = initialBattleState();
  // Set bossHealth from level data
      this.battle.bossHealth = this.editor.level().bossHealth;
      this.battle.lastBossHealth = this.editor.level().bossHealth;

      this.battleLogic = new BattleLogic(this.mainMenu.audio, this.editor.level());
      this.battleRenderer = new BattleRenderer(this.elements.canvas);
    } else {
      this.elements.gameHUD.style.display = 'none';
    }

    // if the new mode is menu, show the menu, cue the main menu video
    if (mode === GameMode.MENU) {
      this.elements.floatingMenu.style.display = 'flex';
      this.videoPlayer.cueVideoById("zXOyzH-_UhQ");
      this.videoPlayer.playVideo();
      this.videoPlayer.setLoop(true);
      this.videoPlayer.setPlaylist([
        "zXOyzH-_UhQ", // Main menu video
      ]);
      this.mainMenu.updateLevelButtonRanks();
      this.setMenuChromeVisibility(true);
      this.requestMainMenuAd();
    } else {
      this.elements.floatingMenu.style.display = 'none';
      this.videoPlayer.setLoop(false);
      this.mainMenu.cleanup(); // <-- cleanup main menu if switching away
      this.videoPlayer.setPlaylist([]); // Clear playlist when not in menu
      this.setMenuChromeVisibility(false);
    }

    // load the video for editing, make new editor
    if (mode === GameMode.EDITING) {
      let vid = this.editor.level().video;
      if (vid != null) {
        this.videoPlayer.cueVideoById(vid);
      }

      // Clean up old editor
      this.editor.cleanup();
      // Create new Editor, which now creates HUD itself
      this.editor = new Editor(this.editor.level(), graphics, this.videoPlayer);

      // Set the editor title input to the level's title
      const title = this.editor.level().title ?? "";
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
      let vid = this.editor.level().video;
      if (vid != null) {
        this.videoPlayer.loadVideoById(vid);
      }
      this.videoPlayer.setPlaybackRate(1.0);

      this.videoPlayer.playVideo();
    }

    // Show/hide Exit to Menu button based on game mode
    if (this.mainMenu.exitToMenuButton) {
      this.mainMenu.exitToMenuButton.style.display = (mode === GameMode.PLAYING) ? "block" : "none";
    }
    // Show/hide Edit Level button based on game mode
    if (this.mainMenu.gameEditLevelButton) {
      this.mainMenu.gameEditLevelButton.style.display = (mode === GameMode.PLAYING) ? "block" : "none";
    }

    this.gameMode = mode;

    this.mainMenu.audio.setVolume(this.localSave.getNormalizedSoundEffectVolume()); // <-- use sound effect volume

    this.needsFreshAutosave = true; // <-- set flag when game state changes
  }

  showCommunityLevelsPage() {
  // Hide main menu
  this.elements.floatingMenu.style.display = "none";
  this.setMenuChromeVisibility(false);
    // Remove previous instance if present
    if (this.communityLevelsPage) {
      this.communityLevelsPage.cleanup();
      this.communityLevelsPage = null;
    }
    // Create and show new page, wire up callbacks
    this.communityLevelsPage = new CommunityLevelsPage(
      () => this.hideCommunityLevelsPage(),
      (level: LevelDataV0, meta: LevelMeta) => this.loadCommunityLevel(level, meta)
    );
  }

  hideCommunityLevelsPage() {
    if (this.communityLevelsPage) {
      this.communityLevelsPage.cleanup();
      this.communityLevelsPage = null;
    }
  this.elements.floatingMenu.style.display = "flex";
  this.setMenuChromeVisibility(true);
  }

  loadCommunityLevel(level: LevelDataV0, meta: LevelMeta) {
    this.setLevel(level, meta);
    this.hideCommunityLevelsPage();
    this.setGameMode(GameMode.PLAYING);
  }

  // Function to play a YouTube video by extracting the video ID from the URL
  recordVideo(videoUrl: string) {
    const videoId = extractVideoID(videoUrl);
    if (videoId != null) {
      this.setLevel(levelDataFromVideo(videoId), null);
      this.setGameMode(GameMode.EDITING);
    } else {
      showFloatingAlert('Invalid YouTube URL', 30, "20px");
    }
  }

  private drawCanvas() {
    const currentTime = this.videoPlayer.getCurrentTime();
    const displayTitle = this.editor.level().title || this.elements.player.getIframe().title;
    const arrowless = !!this.editor.level().arrowless;

    this.battleRenderer.drawCanvas(
      currentTime,
      this.videoPlayer.prevTime,
      this.battle,
      this.editor.level(),
      this.mainMenu.audio,
      displayTitle,
      arrowless
    );
  }


  // Returns true if the level is empty (no attacks, no intervals except intro/death, no criticals)
  private isLevelEmpty(level: LevelDataV0): boolean {
    if (!level) return true;
    if (level.attackData && level.attackData.length > 0) return false;
    if (level.criticals && level.criticals.length > 0) return false;
    if (level.attackIntervals && typeof level.attackIntervals.forEach === "function") {
      let hasNonSpecial = false;
      level.attackIntervals.forEach((interval, name) => {
        if (name !== "intro" && name !== "death" && name !== "1") hasNonSpecial = true;
      });
      if (hasNonSpecial) return false;
    }
    return true;
  }

  private doAutosave() {
    const level = this.editor.level();
    if (this.isLevelEmpty(level)) return; // <-- skip autosave if empty
    if (this.localSave.autosaves.length === 0 || this.needsFreshAutosave) {
      this.localSave.addAutosave(level);
      this.needsFreshAutosave = false;
    } else {
      this.localSave.overwriteLastAutosave(level);
    }
  }

  private setMenuChromeVisibility(visible: boolean): void {
    const placeholder = this.elements.menuAdPlaceholder;
    if (placeholder) {
      placeholder.style.display = visible ? "block" : "none";
    }

    const footer = this.elements.siteFooter;
    if (footer) {
      footer.style.display = visible ? "" : "none";
    }
  }

  private requestMainMenuAd(): void {
    if (typeof window === "undefined") {
      return;
    }

    const resolveStandalone = (): EzStandalone => {
      if (window.ezstandalone) {
        return window.ezstandalone;
      }

      if (typeof ezstandalone !== "undefined") {
        window.ezstandalone = ezstandalone;
        return window.ezstandalone ?? {};
      }

      window.ezstandalone = { cmd: [] };
      return window.ezstandalone;
    };

    const standalone = resolveStandalone();

    if (typeof standalone.showAds === "function") {
      standalone.showAds(107);
      return;
    }

    let queue = standalone.cmd;
    if (!queue) {
      standalone.cmd = [];
      queue = standalone.cmd;
    }

    if (Array.isArray(queue)) {
      queue.push(() => {
        const active = window.ezstandalone ?? (typeof ezstandalone !== "undefined" ? ezstandalone : undefined);
        if (active && typeof active.showAds === "function") {
          active.showAds(107);
        }
      });
      return;
    }

    if (queue && typeof queue.push === "function") {
      queue.push(() => {
        const active = window.ezstandalone ?? (typeof ezstandalone !== "undefined" ? ezstandalone : undefined);
        if (active && typeof active.showAds === "function") {
          active.showAds(107);
        }
      });
      return;
    }

    console.warn("ezstandalone command queue unavailable; ad slot 107 not queued");
  }
}

