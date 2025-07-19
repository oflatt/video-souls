// main.ts

import { Editor, levelDataFromVideo, LevelDataV0, validateLevelData, BossState, BossScheduleResult, stringifyWithMaps, parseWithMaps } from './editor';
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

export class VideoSouls {
  elements;
  gameMode: GameMode;
  battle: BattleState;
  alerts: AlertData[];
  graphics: Graphics;
  audio: AudioPlayer;
  inputManager: InputManager;
  battleRenderer: BattleRenderer;
  battleLogic: BattleLogic;
  videoPlayer: VideoPlayer;
  // only defined when in editing mode
  editor: Editor;
  settings: Settings;
  volumeSlider: HTMLInputElement;

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

    this.graphics = new Graphics(this.elements.canvas);
    this.battleRenderer = new BattleRenderer(this.graphics, this.elements.canvas);
    this.battleLogic = new BattleLogic(this.audio);
    this.editor = new Editor(this.elements.recordingControls, this.elements.playbackBar, new LevelDataV0(), this.graphics);
    this.gameMode = GameMode.MENU;
    this.battle = initialBattleState();
    this.alerts = [];
    this.settings = Settings.load();

    // Add volume slider to a new settings section at the bottom of the floating menu
    this.volumeSlider = document.createElement("input");
    this.volumeSlider.type = "range";
    this.volumeSlider.min = "0";
    this.volumeSlider.max = "100";
    this.volumeSlider.value = String(this.settings.volume);
    this.volumeSlider.style.width = "200px";
    this.volumeSlider.style.marginBottom = "10px";
    this.volumeSlider.title = "Volume";
    this.volumeSlider.id = "main-menu-volume-slider";

    const volumeLabel = document.createElement("label");
    volumeLabel.textContent = "Volume";
    volumeLabel.htmlFor = "main-menu-volume-slider";
    volumeLabel.style.marginRight = "10px";
    volumeLabel.style.color = "#fff";
    volumeLabel.style.fontSize = "18px";

    // Create a settings section at the bottom
    const settingsSection = document.createElement("div");
    settingsSection.id = "main-menu-settings-section";
    settingsSection.style.display = "flex";
    settingsSection.style.alignItems = "center";
    settingsSection.style.marginTop = "30px";
    settingsSection.style.justifyContent = "center";
    settingsSection.style.width = "100%";
    settingsSection.style.position = "absolute";
    settingsSection.style.bottom = "20px";
    settingsSection.style.left = "0";
    settingsSection.style.right = "0";

    const volumeContainer = document.createElement("div");
    volumeContainer.style.display = "flex";
    volumeContainer.style.alignItems = "center";
    volumeContainer.style.marginBottom = "10px";
    volumeContainer.appendChild(volumeLabel);
    volumeContainer.appendChild(this.volumeSlider);

    settingsSection.appendChild(volumeContainer);

    // Insert settings section at the end of floating menu
    this.elements.floatingMenu.appendChild(settingsSection);

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
    // This requires polling since YT.Player doesn't emit volume change events
    setInterval(() => {
      const ytVol = player.getVolume();
      if (ytVol !== this.settings.volume) {
        this.settings.volume = ytVol;
        this.volumeSlider.value = String(ytVol);
        this.settings.save();
        this.audio.setVolume(this.settings.getNormalizedVolume());
      }
    }, 500);

    this.initializeEventListeners();
    this.loadLevelButtons();
  }

  private async loadLevelButtons() {
    try {
      // Load level files from the levels directory
      const levelFiles = await this.getLevelFiles();

      // Clear existing level buttons
      this.elements.levelsContainer.innerHTML = '';

      // Create a button for each level file
      levelFiles.forEach(levelFile => {
        const button = document.createElement('button');
        button.textContent = this.getLevelDisplayName(levelFile);
        button.className = 'level-button';
        button.addEventListener('click', () => {
          this.loadAndPlayLevel(levelFile);
        });
        this.elements.levelsContainer.appendChild(button);
      });
    } catch (error) {
      console.error('Failed to load level files:', error);
      this.fadingAlert('Failed to load level files', 30, "20px");
    }
  }

  private async getLevelFiles(): Promise<string[]> {
    try {
      // Try to fetch the levels directory listing
      const response = await fetch('/levels/');
      if (!response.ok) {
        throw new Error('Failed to fetch levels directory');
      }

      const html = await response.text();

      // Parse HTML to extract .json files
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const links = Array.from(doc.querySelectorAll('a'));

      return links
        .map(link => link.getAttribute('href'))
        .filter(href => href && href.endsWith('.json'))
        .map(href => href!) as string[];
    } catch (error) {
      // Fallback: return hardcoded level files if directory listing fails
      console.warn('Directory listing failed, using fallback levels:', error);
      return ['level1.json']; // Add more default levels as needed
    }
  }

  private getLevelDisplayName(filename: string): string {
    // Convert filename to display name (e.g., "level1.json" -> "Level 1")
    return filename
      .replace('.json', '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, str => str.toUpperCase());
  }

  private async loadAndPlayLevel(levelFile: string) {
    try {
      const response = await fetch(`/levels/${levelFile}`);
      if (!response.ok) {
        throw new Error(`Failed to load level: ${levelFile}`);
      }

      const levelData = await response.text();
      const level = parseWithMaps(levelData);
      const validation = await validateLevelData(level);

      if (validation === null) {
        this.editor.level = level;
        this.setGameMode(GameMode.PLAYING);
      } else {
        this.fadingAlert(`Invalid level file: ${levelFile}`, 30, "20px");
        console.error('Level validation failed:', validation);
      }
    } catch (error) {
      this.fadingAlert(`Failed to load level: ${levelFile}`, 30, "20px");
      console.error('Error loading level:', error);
    }
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

    this.elements.recordingControls.addEventListener("mousewheel", (event) => { this.recordingMouseWheel(event) }, { passive: false });
    // Firefox
    this.elements.recordingControls.addEventListener("DOMMouseScroll", (event) => { this.recordingMouseWheel(event) }, { passive: false });

    // when mouse is released, send this event to the editor
    document.addEventListener('mouseup', (event) => {
      if (this.gameMode === GameMode.EDITING) {
        this.editor.mouseReleased(event);
      }
    });

    // when the playback bar is clicked, seek to that time
    this.elements.playbackBar.addEventListener('click', (event) => {
      if (this.gameMode === GameMode.EDITING) {
        this.editor.playbackBarClicked(event, this.videoPlayer);
      }
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
      this.editor.draw(this.inputManager.mouseX, this.inputManager.mouseY, this.videoPlayer);
    }

    this.fadeOutAlerts();

    requestAnimationFrame(this.mainLoop.bind(this));
  }

  recordingMouseWheel(event: Event) {
    // check if the event is a wheel event
    if (!(event instanceof WheelEvent)) {
      return;
    }

    // if the control key is pressed, prevent the default behavior
    if (this.inputManager.isKeyPressed('Control')) {
      event.preventDefault();
      // increase the zoom in the editor
      this.editor.changeZoom(event);
    } else {
      this.editor.changeScroll(event);
    }
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
      this.inputManager.getCurrentTargetDirection.bind(this.inputManager)
    );
  }

  doAttack() {
    const currentTime = this.currentTime();
    this.battleLogic.doAttack(this.battle, currentTime);
  }

  startAttack() {
    const currentTime = this.currentTime();
    this.battleLogic.startAttack(this.battle, currentTime);
  }

  doParry() {
    const currentTime = this.currentTime();
    this.battleLogic.doParry(this.battle, currentTime);
  }

  updateState() {
    const currentTime = this.currentTime();

    // if the game mode is editing, update the editor
    if (this.gameMode == GameMode.EDITING) {
      this.editor!.update(this.inputManager.getJustPressedKeys(), this.inputManager.getCurrentTargetDirection(), this.inputManager.mouseX, this.videoPlayer);
    }

    if (this.gameMode == GameMode.PLAYING) {
      // Evaluate attack schedule
      this.battleLogic.handleAttackSchedule(
        this.battle,
        currentTime,
        this.videoPlayer,
        this.editor.level.attackIntervals,
        this.editor.level.attackSchedule
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
      if (this.battle.anim.state !== AttackAnimation.NONE && currentTime >= this.battle.anim.endTime) {

        // if the animation is attack starting, do the attack
        if (this.battle.anim.state === AttackAnimation.ATTACK_STARTING) {
          this.doAttack();
        } else {
          this.battle.anim.state = AttackAnimation.NONE;
        }
      }

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
    }

    // if the sword is not in an animation, move towards user input dir
    this.battleLogic.updateSwordPosition(this.battle, this.inputManager.getCurrentTargetDirection.bind(this.inputManager));

    // check for the escape key
    if (this.inputManager.wasKeyJustPressed('Escape')) {
      // set game mode to menu
      this.setGameMode(GameMode.MENU);
    }

    // check if the player died
    if (this.battle.playerHealth <= 0) {
      this.setGameMode(GameMode.BATTLE_END);
      this.fadingAlert('You Died', 90, "30%", "red", "Cormorant Unicase");
    }

    // Check if boss is in death interval and it has ended (win condition)
    if (this.battle.bossHealth <= 0 && this.battle.currentInterval === "death") {
      const deathInterval = this.editor.level.attackIntervals.get("death");
      if (deathInterval && currentTime >= deathInterval.end) {
        this.setGameMode(GameMode.BATTLE_END);
        this.fadingAlert('You Won', 90, "30%", "green", "Cormorant Unicase");
      }
    }

    this.inputManager.clearJustPressed();
  }

  setGameMode(mode: GameMode) {
    // Clean up editor elements before switching modes
    if (this.gameMode === GameMode.EDITING && this.editor) {
      this.editor.cleanup();
    }

    // always sync the custom level input with the level data using generic stringify
    this.elements.customLevelInput.value = stringifyWithMaps(this.editor.level);

    // clear validation errors
    this.elements.validationError.textContent = '';
    this.elements.validationError.style.display = 'none';


    // if the video is valid, load it
    this.videoPlayer.pauseVideo();

    // reset the sword state
    this.battle = initialBattleState();

    // if the new mode is battle end, show the battle end hud
    if (mode === GameMode.BATTLE_END) {
      this.elements.battleEndHUD.style.display = 'flex';
    } else {
      this.elements.battleEndHUD.style.display = 'none';
    }

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

    // if the new mode is editing, show the editing hud
    if (mode === GameMode.EDITING) {
      this.elements.recordHUD.style.display = 'flex';
    } else {
      this.elements.recordHUD.style.display = 'none';
    }

    // if the new mode is menu, show the menu
    if (mode === GameMode.MENU) {
      // show the export and play buttons if there is any recorded data
      if (this.editor.level.video != null) {
        this.elements.exportButton.style.display = 'block';
        this.elements.customLevelPlayButton.style.display = 'block';
      } else {
        this.elements.exportButton.style.display = 'none';
        this.elements.customLevelPlayButton.style.display = 'none';
      }
    }

    // load the video for editing, make new editor
    if (mode === GameMode.EDITING) {
      if (this.editor.level.video != null) {
        this.videoPlayer.loadVideoById(this.editor.level.video);
      }

      // in the editing mode, create a new editor
      this.editor = new Editor(this.elements.recordingControls, this.elements.playbackBar, this.editor.level, this.graphics);
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

    this.gameMode = mode;

    // Always keep YouTube player volume in sync with settings
    this.elements.player.setVolume(this.settings.volume);
    this.audio.setVolume(this.settings.getNormalizedVolume());
  }

  setCurrentVideo(videoId: string) {
    this.editor.level = levelDataFromVideo(videoId);
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
    const youtubeVideoName = this.elements.player.getIframe().title;

    this.battleRenderer.drawCanvas(
      currentTime,
      this.videoPlayer.prevTime,
      this.battle,
      this.getAttacksInInterval.bind(this),
      this.audio.playWarningSound.bind(this.audio),
      this.inputManager.getCurrentTargetDirection.bind(this.inputManager),
      youtubeVideoName
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
}

// Helper function to extract the video ID from a YouTube URL
function extractVideoID(url: string) {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}
