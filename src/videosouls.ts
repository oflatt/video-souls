// main.ts

import { Editor, levelDataFromVideo, LevelDataV0, validateLevelData, BossState, BossScheduleResult, AttackScheduleFunction, stringifyWithMaps, parseWithMaps } from './editor';
import { Graphics } from './graphics';
import { InputManager, InputDirection } from './inputmanager';
import { AudioPlayer } from './audioPlayer';
import { BattleRenderer } from './battleRenderer';
import { BattleLogic } from './battleLogic';
import { AttackAnimation, BattleState, initialBattleState, directionNumToSwordAngle } from './battle';

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
  // only defined when in editing mode
  editor: Editor;

  constructor(player: YT.Player) {
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
      level1Button: document.querySelector<HTMLButtonElement>("#lv1-button")!,
      playbackBar: document.querySelector<HTMLInputElement>("#playback-bar")!,
      recordingControls: document.querySelector<HTMLInputElement>("#recording-controls")!,
      customLevelInput: document.querySelector<HTMLInputElement>("#custom-level-input")!,
      customLevelEditButton: document.querySelector<HTMLInputElement>("#custom-level-edit-button")!,
      validationError: document.querySelector<HTMLInputElement>("#validation-error")!,
    } as const;

    this.graphics = new Graphics(this.elements.canvas);
    this.battleRenderer = new BattleRenderer(this.graphics, this.elements.canvas);
    this.battleLogic = new BattleLogic(this.audio);
    this.editor = new Editor(player, this.elements.recordingControls, this.elements.playbackBar, new LevelDataV0(), this.graphics);
    this.gameMode = GameMode.MENU;
    this.battle = initialBattleState();
    this.alerts = [];

    this.initializeEventListeners();
  }

  private initializeEventListeners() {
    this.elements.canvas.width = window.innerWidth;
    this.elements.canvas.height = window.innerHeight;
  
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

    this.elements.level1Button.addEventListener('click', () => {
      const videoUrl = 'https://www.youtube.com/watch?v=xi6fSPv7M18';
      this.recordVideo(videoUrl);
    });

    this.elements.customLevelEditButton.addEventListener('click', () => {
      // load the level data into the editor
      this.importLevel();
      this.setGameMode(GameMode.EDITING);
    });

    this.elements.recordingControls.addEventListener("mousewheel", (event) => { this.recordingMouseWheel(event) }, { passive: false});
    // Firefox
    this.elements.recordingControls.addEventListener("DOMMouseScroll", (event) => { this.recordingMouseWheel(event) }, { passive: false});

    // when mouse is released, send this event to the editor
    document.addEventListener('mouseup', (event) => {
      if (this.gameMode === GameMode.EDITING) {
        this.editor.mouseReleased(event);
      }
    });

    // when the playback bar is clicked, seek to that time
    this.elements.playbackBar.addEventListener('click', (event) => {
      if (this.gameMode === GameMode.EDITING) {
        this.editor.playbackBarClicked(event);
      }
    });
  }

  mainLoop(_time: DOMHighResTimeStamp) {
    // Debug
    const currentTime = this.elements.player.getCurrentTime();
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

    this.battle.prevTime = currentTime;

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

  successParry() {
    this.audio.parrySound.play();
    const currentTime = this.elements.player.getCurrentTime();
    // successful parry
    this.battle.anim.lastParryTime = currentTime;
    this.battle.anim.state = AttackAnimation.NONE;
  }

  currentClosestDir() {
    // first, find the sword position closest to the current sword pos
    var closestDir = 1;
    var closestDist = 100000000;
    for (let i = 0; i < 8; i++) {
      const dist = Math.hypot(this.battle.anim.endPos[0] - (0.5 + directionNumToSwordPos.get(i)![0]), this.battle.anim.endPos[1] - (0.5 + directionNumToSwordPos.get(i)![1]));
      if (dist < closestDist) {
        closestDist = dist;
        closestDir = i;
      }
    }
    return closestDir;
  }

  handleBossAttacks() {
    const currentTime = this.elements.player.getCurrentTime();
    this.battleLogic.handleBossAttacks(
      this.battle,
      currentTime,
      this.getAttacksInInterval.bind(this),
      this.inputManager.getCurrentTargetDirection.bind(this.inputManager)
    );
  }

  doAttack() {
    const currentTime = this.elements.player.getCurrentTime();
    this.battleLogic.doAttack(this.battle, currentTime);
  }

  startAttack() {
    const currentTime = this.elements.player.getCurrentTime();
    this.battleLogic.startAttack(this.battle, currentTime);
  }

  doParry() {
    const currentTime = this.elements.player.getCurrentTime();
    this.battleLogic.doParry(this.battle, currentTime);
  }

  private evaluateAttackSchedule(): BossScheduleResult {
    const currentTime = this.elements.player.getCurrentTime();
    
    try {
      // Create available intervals map
      const availableIntervals = new Map();
      for (const [iname, interval] of this.editor.level.attackIntervals) {
        availableIntervals.set(iname, interval);
      }

      // Calculate interval elapsed time
      let intervalElapsedTime = 0;
      const currentInterval = availableIntervals.get(this.battle.currentInterval);
      if (currentInterval) {
        intervalElapsedTime = currentTime - currentInterval.start;
      }

      // Create boss state
      const bossState: BossState = {
        healthPercentage: this.battle.bossHealth,
        currentInterval: this.battle.currentInterval,
        currentTime: currentTime,
        intervalElapsedTime: intervalElapsedTime,
        playerHealthPercentage: this.battle.playerHealth,
        availableIntervals: availableIntervals
      };

      // Create the function code that returns the schedule result
      const functionCode = `
        var bossState = bossStateArg;
        var result = (${this.editor.level.attackSchedule.toString()})(bossState);
        result;
      `;

      // Create interpreter with initialization function
      const interpreter = new Interpreter(functionCode, (interpreter: any, globalObject: any) => {
        // Add bossState to global scope
        interpreter.setProperty(globalObject, 'bossStateArg', interpreter.nativeToPseudo(bossState));
        
        // Add Map constructor and methods if needed
        const mapConstructor = interpreter.createNativeFunction(() => {
          return interpreter.nativeToPseudo(new Map());
        });
        interpreter.setProperty(globalObject, 'Map', mapConstructor);
      });

      // Run the interpreter
      interpreter.run();
      
      // Get the result and convert back to native
      const result = interpreter.pseudoToNative(interpreter.value);
      return result as BossScheduleResult;
    } catch (error) {
      console.error('Error evaluating attack schedule:', error);
      return { continueNormal: true };
    }
  }

  private handleAttackSchedule() {
    const currentTime = this.elements.player.getCurrentTime();

    // Check if boss health is zero or lower and transition to death
    if (this.battle.bossHealth <= 0) {
      const deathInterval = this.editor.level.attackIntervals.get("death");
      if (deathInterval && this.battle.currentInterval !== "death") {
        this.battle.currentInterval = "death";
        this.elements.player.seekTo(deathInterval.start, true);
        return;
      }
    }

    const scheduleResult = this.evaluateAttackSchedule();

    // Handle schedule result
    if (!scheduleResult.continueNormal && scheduleResult.transitionToInterval) {
      const targetInterval = this.editor.level.attackIntervals.get(scheduleResult.transitionToInterval);
      
      if (targetInterval) {
        this.battle.currentInterval = targetInterval.name;
        
        // Apply interval offset if specified
        const offset = scheduleResult.intervalOffset || 0;
        const seekTime = targetInterval.start + offset;
        this.elements.player.seekTo(seekTime, true);
      }
    }
  }

  updateState() {
    const currentTime = this.elements.player.getCurrentTime();

    // if the game mode is editing, update the editor
    if (this.gameMode == GameMode.EDITING) {
      this.editor!.update(this.inputManager.getJustPressedKeys(), this.inputManager.getCurrentTargetDirection(), this.inputManager.mouseX);
    }

    if (this.gameMode == GameMode.PLAYING) {
      // Evaluate attack schedule
      this.handleAttackSchedule();

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
          // in recording, do a successful parry
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

    // check for when the video ends, loop it
    if (this.gameMode === GameMode.PLAYING && this.elements.player.getPlayerState() === YT.PlayerState.ENDED) {
      // loop the video
      this.elements.player.seekTo(0.0, true);
      this.elements.player.playVideo();
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
    this.elements.player.pauseVideo();
  
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
    if  (mode === GameMode.MENU) {
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
        this.elements.player.loadVideoById(this.editor.level.video);
      }

      // in the editing mode, create a new editor
      this.editor = new Editor(this.elements.player, this.elements.recordingControls, this.elements.playbackBar, this.editor.level, this.graphics);
    }

    // load the video for playing
    if (mode === GameMode.PLAYING) {
      if (this.editor.level.video != null) {
        this.elements.player.loadVideoById(this.editor.level.video);
      }
      this.elements.player.pauseVideo();
      this.elements.player.setPlaybackRate(1.0);
  
      this.elements.player.playVideo();
    }
  
    this.gameMode = mode;
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
    const currentTime = this.elements.player.getCurrentTime();
    const youtubeVideoName = this.elements.player.getIframe().title;
    
    this.battleRenderer.drawCanvas(
      currentTime,
      this.battle,
      this.getAttacksInInterval.bind(this),
      this.audio.playWarningSound.bind(this.audio),
      this.inputManager.getCurrentTargetDirection.bind(this.inputManager),
      youtubeVideoName
    );
  }

  private drawSword() {
    const currentTime = this.elements.player.getCurrentTime();
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
