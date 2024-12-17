// main.ts

enum GameMode {
  MENU, PLAYING, BATTLE_END, EDITING
}

enum InputDirection {
  LEFT = 0b0001,
  UP = 0b0010,
  RIGHT = 0b0100,
  DOWN = 0b1000
}

enum AttackAnimation {
  NONE, PARRYING, ATTACK_STARTING, ATTACKING, STAGGERING
}


const keyToDirection = new Map<string, InputDirection>([
  ['w', InputDirection.UP],
  ['a', InputDirection.LEFT],
  ['s', InputDirection.DOWN],
  ['d', InputDirection.RIGHT],
]);

const parryKey = 'k';
const attackKey = 'j';


type BattleState = {
  anim: {
    state: AttackAnimation,
    startTime: number,
    endTime: number,
    startPos: [number, number],
    endPos: [number, number],
    // directions in radians on the unit circle, blade of the sword points in this direction
    startAngle: number,
    endAngle: number,
    // last parry time adds a green glow after a successful parry
    lastParryTime: number,
    startYScale: number,
    endYScale: number,
    startXScale: number,
    endXScale: number,
  },
  hitCombo: number, // number of successful 
  hitComboTime: number, // last time the combo was extended
  // inputs are buffered so that they are not missed and punishes for spam
  bufferedInput: string | null,
  playerHealth: number,
  lastPlayerHealth: number,
  lastPlayerHit: number, // the time the player was last hit
  bossHealth: number,
  lastBossHealth: number,
  lastBossHit: number, // the time the boss was last hit
  // the last time we checked for attacks
  prevTime: number
};

type AlertData = {
  message: HTMLElement,
  startTime: number,
  lifetime: number
};

const keyPressed = new Set<string>();
const keyJustPressed = new Set<string>();

const PARRY_WINDOW = 0.2;
const PARRY_END_LAG = 0.2;
const SUCCESS_PARRY_ANIM_FADE = 0.2;

const ATTACK_COMBO_STARTUP_TIMES = [0.2, 0.2, 0.3, 0.2, 0.4];
const ATTACK_COMBO_DAMAGE_MULT = [1.0, 1.1, 1.3, 1.0, 1.8];
const ATTACK_END_LAG = 0.15;
const COMBO_EXTEND_TIME = 3.0; // number of seconds before combo lapses

const STAGGER_TIME = 0.4;

const ATTACK_WARNING_ADVANCE = 0.5;


function initialBattleState(): BattleState {
  return {
    anim: {
      state: AttackAnimation.NONE,
      startTime: 0,
      endTime: 0,
      startPos: [0.5, 0.5],
      endPos: [0.5, 0.5],
      startAngle: 0,
      endAngle: 0,
      lastParryTime: -100,
      startYScale: 1.0,
      endYScale: 1.0,
      startXScale: 1.0,
      endXScale: 1.0,
    },
    bufferedInput: null,
    playerHealth: 1.0,
    lastPlayerHealth: 1.0,
    lastPlayerHit: -100000000,
    bossHealth: 1.0,
    lastBossHealth: 1.0,
    lastBossHit: -100000000,
    prevTime: 0,
    hitCombo: 0,
    hitComboTime: -10000000,
  };
}

class AudioPlayer {
  // warning sound for incoming attacks
  warnings: HTMLAudioElement[] = [];
  enemyHit: HTMLAudioElement;
  playerAttack: HTMLAudioElement;
  playerHit: HTMLAudioElement;
  parrySound: HTMLAudioElement;


  constructor() {
    for (let i = 1; i <= 3; i++) {
      const audio = new Audio(`audio/warning${i}.wav`);
      this.warnings.push(audio);
    }
    this.enemyHit = new Audio('audio/enemyHit.wav');
    this.playerAttack = new Audio('audio/playerAttack.wav');
    this.playerHit = new Audio('audio/playerHit.wav');
    this.parrySound = new Audio('audio/parry.wav');
  }

  playWarningSound() {
    const sound = this.warnings[Math.floor(Math.random() * this.warnings.length)];
    sound.play();
  }
}

class Graphics {
  swordSprites: {
    default: HTMLImageElement | HTMLCanvasElement,
    yellowOutline: HTMLImageElement | HTMLCanvasElement,
    greenOutline: HTMLImageElement | HTMLCanvasElement,
  };
  arrowSprite: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    // Load sword sprites
    this.swordSprites = {
      default: new Image(),
      yellowOutline: new Image(),
      greenOutline: new Image(),
    };
    const swordImage = new Image();
    swordImage.src = 'sword.png';

    // add a scaled sword image to elements once swordImage is loaded
    swordImage.addEventListener('load', () => {
      let scale_factor = (0.15 * canvas.width) / swordImage.width;
      this.swordSprites.default = scaleImage(swordImage, scale_factor, scale_factor);
      let untinted = makeGlow(this.swordSprites.default, 0.1);
      this.swordSprites.yellowOutline = tintImage(untinted, [1.0, 1.0, 0.2]);
      this.swordSprites.greenOutline = tintImage(untinted, [0.2, 1.0, 0.2]);
    });

    const arrowImage = new Image();
    arrowImage.src = 'arrow.png';
    this.arrowSprite = document.createElement('canvas');
    arrowImage.addEventListener('load', () => {
      let scale_factor = (0.05 * canvas.width) / arrowImage.width;
      const scaled = scaleImage(arrowImage, scale_factor, scale_factor);
      const glowBefore = makeGlow(scaled, 0.1);
      const glow = tintImage(glowBefore, [1.0, 0.5, 0.5]);
      
      // draw scaled onto glowBig
      const ctx2 = glow.getContext('2d')!;
      ctx2.drawImage(scaled, (glow.width - scaled.width) / 2, (glow.height - scaled.height) / 2);

      this.arrowSprite = glow;
    });
  }
}

// Make a white glow around the image or canvas.
// The glow is created by doing a blur on the image
function makeGlow(img: HTMLCanvasElement, range: number): HTMLCanvasElement {
  // first, make a version of the image with is black and white
  const canvas1 = document.createElement('canvas');
  canvas1.width = img.width;
  canvas1.height = img.height;
  const ctx1 = canvas1.getContext('2d')!;
  ctx1.drawImage(img, 0.0, 0.0);
  const imageData = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] > 0) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
  ctx1.putImageData(imageData, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = img.width*1.5;
  canvas.height = img.height*1.5;
  const ctx = canvas.getContext('2d')!;
  const blur_num_pxs = Math.floor(canvas.width * range);
  ctx.filter = `blur(${blur_num_pxs}px) brightness(100%)`;
  const drawX = (canvas.width - img.width) / 2;
  const drawY = (canvas.height - img.height) / 2;
  ctx.drawImage(canvas1, drawX, drawY);

  // get the image data and make alpha channel less transparent
  const imageData2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data2 = imageData2.data;
  for (let i = 0; i < data2.length; i += 4) {
    data2[i + 3] = Math.min(255, Math.pow(data2[i + 3], 1.5));
  }
  ctx.putImageData(imageData2, 0, 0);

  // also make a short bright outline around the image
  ctx.filter = 'blur(4px) brightness(1000%)';
  ctx.drawImage(canvas1, drawX, drawY);


  return canvas;
}

class VideoSouls {
  elements;
  gameMode: GameMode;
  battle: BattleState;
  alerts: AlertData[];
  graphics: Graphics;
  audio: AudioPlayer;
  // only defined when in editing mode
  editor: Editor.Editor;

  constructor(player: YT.Player) {
    this.audio = new AudioPlayer();

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
      playButton: document.querySelector<HTMLButtonElement>("#play-button")!,
      exportButton: document.querySelector<HTMLButtonElement>("#export-button")!,
      level1Button: document.querySelector<HTMLButtonElement>("#lv1-button")!,
      playbackBar: document.querySelector<HTMLInputElement>("#playback-bar")!,
      recordingControls: document.querySelector<HTMLInputElement>("#recording-controls")!,
    } as const;

    this.editor = new Editor.Editor(player, this.elements.recordingControls, this.elements.playbackBar, { video: null, attackData: [], version: 1 });
    this.gameMode = GameMode.MENU;
    this.battle = initialBattleState();
    this.alerts = [];

    this.initializeEventListeners();
    this.graphics = new Graphics(this.elements.canvas);
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

    this.elements.playButton.addEventListener('click', () => {
      this.setGameMode(GameMode.PLAYING);
    });
  
    this.elements.exportButton.addEventListener('click', () => {
      this.exportLevel();
    });

    this.elements.level1Button.addEventListener('click', () => {
      const videoUrl = 'https://www.youtube.com/watch?v=xi6fSPv7M18';
      this.recordVideo(videoUrl);
    });

    document.addEventListener('keydown', event => {
      if (!keyPressed.has(event.key)) {
        keyPressed.add(event.key);
        keyJustPressed.add(event.key);
      }
    });
    document.addEventListener('keyup', event => {
      keyPressed.delete(event.key);
    });

    this.elements.recordingControls.addEventListener("mousewheel", (event) => { this.mouseWheel(event) }, { passive: false});
    // Firefox
    this.elements.recordingControls.addEventListener("DOMMouseScroll", (event) => { this.mouseWheel(event) }, { passive: false});

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

  mainLoop(time: DOMHighResTimeStamp) {
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
      this.editor.draw();
    }

    this.fadeOutAlerts();

    keyJustPressed.clear();

    this.battle.prevTime = currentTime;

    requestAnimationFrame(this.mainLoop.bind(this));
  }

  mouseWheel(event: Event) {
    // check if the event is a wheel event
    if (!(event instanceof WheelEvent)) {
      return;
    }

    // if the control key is pressed, prevent the default behavior
    if (keyPressed.has('Control')) {
      event.preventDefault();
      // increase the zoom in the editor
      this.editor.changeZoom(-event.deltaY / 1000);
    } else {
      this.elements.recordingControls.scrollLeft += event.deltaY;
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

  exportLevel() {
    const json = JSON.stringify(this.editor.level);
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
      const dist = Math.hypot(this.battle.anim.endPos[0] - (0.5 + blockDirectionPositions.get(i)![0]), this.battle.anim.endPos[1] - (0.5 + blockDirectionPositions.get(i)![1]));
      if (dist < closestDist) {
        closestDist = dist;
        closestDir = i;
      }
    }
    return closestDir;
  }

  handleBossAttacks() {
    const currentTime = this.elements.player.getCurrentTime();
    const attacks = this.getAttacksInInterval(this.battle.prevTime, currentTime);
    if (attacks.length > 0) {
      // get the first attack (only one attack per frame allowed)
      const attack = attacks[0];
      // if the player is not parrying, take damage
      if (this.battle.anim.state === AttackAnimation.PARRYING && currentTargetDir() == attack.direction) {
        this.successParry();
      } else {
        this.audio.playerHit.play();
        this.battle.lastPlayerHealth = this.battle.playerHealth;
        this.battle.playerHealth -= 0.1;
        this.battle.lastPlayerHit = currentTime;

        // reset hit combo
        this.battle.hitCombo = 0;
  
        // start a stagger animation
        this.battle.anim.state = AttackAnimation.STAGGERING;
        this.battle.anim.startTime = currentTime;
        this.battle.anim.endTime = currentTime + STAGGER_TIME;
        this.battle.anim.startPos = [...this.battle.anim.endPos];
        // move the sword to the attacked position plus small random offset
        this.battle.anim.endPos = [
          attackedPosition[0] + (Math.random() - 0.5) * 0.1,
          attackedPosition[1] + (Math.random() - 0.5) * 0.1,
        ];
        // change the angle randomly too
        this.battle.anim.startAngle = this.battle.anim.endAngle;
        this.battle.anim.endAngle = attackedAngle;
      }
    }
  }

  doAttack() {
    const currentTime = this.elements.player.getCurrentTime();

    this.battle.lastBossHealth = this.battle.bossHealth;
    this.battle.bossHealth -= 0.1 * ATTACK_COMBO_DAMAGE_MULT[this.battle.hitCombo % ATTACK_COMBO_DAMAGE_MULT.length];
    this.battle.lastBossHit = currentTime;

    this.battle.anim.state = AttackAnimation.ATTACKING;
    this.battle.anim.startTime = currentTime;
    this.battle.anim.endTime = currentTime + ATTACK_END_LAG;

    const closestDir = this.currentClosestDir();
    // set the start position to current sword position
    const attackStartPosition: [number, number] = [...this.battle.anim.endPos];
    this.battle.anim.startPos = [attackStartPosition[0], attackStartPosition[1]];
    const attackEndPosition = blockDirectionPositions.get((closestDir + 4) % 8)!;
    this.battle.anim.endPos = [0.5 + attackEndPosition[0], 0.5 + attackEndPosition[1]];
    this.battle.anim.endPos[0] += (Math.random() - 0.5) * 0.1;
    this.battle.anim.endPos[1] += (Math.random() - 0.5) * 0.1;

    const currentDir = this.battle.anim.endAngle
    this.battle.anim.startAngle = currentDir;
    this.battle.anim.endAngle = currentDir;
    this.battle.anim.startYScale = 1.0;
    this.battle.anim.endYScale = -1.0;
    this.battle.anim.startXScale = 1.0;
    this.battle.anim.endXScale = 1.0;

    // play attack hit enemy sound
    this.audio.enemyHit.play();
  }

  startAttack() {
    const currentTime = this.elements.player.getCurrentTime();
    var currentCombo = 0;
    // check if the combo is reset
    if (currentTime - this.battle.hitComboTime > COMBO_EXTEND_TIME) {
      this.battle.hitCombo = 1;
    } else  {
      currentCombo = this.battle.hitCombo;
      this.battle.hitCombo += 1;
    }
    this.battle.hitComboTime = currentTime;

    this.battle.anim.state = AttackAnimation.ATTACK_STARTING;
    this.battle.anim.startTime = currentTime;
    this.battle.anim.endTime = currentTime + ATTACK_COMBO_STARTUP_TIMES[currentCombo % ATTACK_COMBO_STARTUP_TIMES.length];

    const closestDir = this.currentClosestDir();
    // set the start position to current pos
    this.battle.anim.startPos = [...this.battle.anim.endPos];
    // make the end further away from the center in the same direction
    const attackEndPosition = blockDirectionPositions.get(closestDir)!;
    this.battle.anim.endPos = [0.5 + attackEndPosition[0]*1.2, 0.5 + attackEndPosition[1]*1.2];
    this.battle.anim.endPos[0] += (Math.random() - 0.5) * 0.1;
    this.battle.anim.endPos[1] += (Math.random() - 0.5) * 0.1;

    const attackDir = normalize(blockDirectionPositions.get(closestDir)!);
    const targetDir = Math.atan2(attackDir[1], attackDir[0]);
    const currentDir = this.battle.anim.endAngle;
    this.battle.anim.startAngle = currentDir;
    this.battle.anim.endAngle = targetDir;
    this.battle.anim.startYScale = 1.0;
    this.battle.anim.endYScale = 0.8;
    this.battle.anim.startXScale = 1.0;
    this.battle.anim.endXScale = 1.0;

    // play attack swish sound
    this.audio.playerAttack.play();
  }

  doParry() {
    const currentTime = this.elements.player.getCurrentTime();
    this.battle.anim.state = AttackAnimation.PARRYING;
    this.battle.anim.startTime = currentTime;
    this.battle.anim.endTime = currentTime + PARRY_WINDOW + PARRY_END_LAG;
    this.battle.anim.startPos = [...this.battle.anim.endPos];
    this.battle.anim.endPos = [...this.battle.anim.endPos];
    this.battle.anim.startAngle = this.battle.anim.endAngle;
    this.battle.anim.endAngle = this.battle.anim.startAngle - (Math.PI / 10);
    this.battle.anim.startYScale = 1.0;
    this.battle.anim.endYScale = 1.0;
    this.battle.anim.startXScale = 1.0;
    this.battle.anim.endXScale = 1.0;
  }

  updateState() {
    const currentTime = this.elements.player.getCurrentTime();

    // if the game mode is editing, update the editor
    if (this.gameMode == GameMode.EDITING) {
      this.editor!.update(keyJustPressed, currentTargetDir());
    }

  
    if (this.gameMode == GameMode.PLAYING) {
      if (keyJustPressed.has(attackKey) && this.battle.bufferedInput === null) {
        // buffer attack
        this.battle.bufferedInput = attackKey;
      }

      // check if parry button pressed
      if (keyJustPressed.has(parryKey) && this.battle.bufferedInput === null) {
        // buffer the parry
        this.battle.bufferedInput = parryKey;
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
        if (this.battle.bufferedInput === parryKey) {
          // in recording, do a successful parry
          this.doParry();
          this.battle.bufferedInput = null;
        } else if (this.battle.bufferedInput === attackKey) {
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
    if (this.battle.anim.state === AttackAnimation.NONE) {
      const targetAngle = currentTargetAngleRadians();
  
      // clone the target position so we don't mutate it!
      var targetPos = [...blockDirectionPositions.get(currentTargetDir())!];
  
      // offset the target position to center of screen
      targetPos[0] += 0.5;
      targetPos[1] += 0.5;
  
      // if the position is some epsilon close to the target position, set the position to the target position
      if (Math.abs(this.battle.anim.endPos[0] - targetPos[0]) < 0.01 && Math.abs(this.battle.anim.endPos[1] - targetPos[1]) < 0.01) {
        this.battle.anim.endPos[0] = targetPos[0];
        this.battle.anim.endPos[1] = targetPos[1];
      } else {
        // otherwise, move the sword towards the target position
        this.battle.anim.endPos[0] += (targetPos[0] - this.battle.anim.endPos[0]) / 20;
        this.battle.anim.endPos[1] += (targetPos[1] - this.battle.anim.endPos[1]) / 20;
      }
  
      // if the direction is some epsilon close to the target direction, set the direction to the target direction
      if (Math.abs(this.battle.anim.endAngle - targetAngle) < 0.01) {
        this.battle.anim.endAngle = targetAngle;
      } else {
        // find the shortest path to the target angle
        var newAngle = this.battle.anim.endAngle + (targetAngle - this.battle.anim.endAngle) / 20;
        if (Math.abs(targetAngle - this.battle.anim.endAngle) > Math.PI) {
          newAngle = this.battle.anim.endAngle + (targetAngle - this.battle.anim.endAngle + Math.PI * 2) / 20;
        }

        this.battle.anim.endAngle = newAngle;
      }
    }
  
    // check for the escape key
    if (keyJustPressed.has('Escape')) {
      // set game mode to menu
      this.setGameMode(GameMode.MENU);
    }

    // check if the player died
    if (this.battle.playerHealth <= 0) {
      this.setGameMode(GameMode.BATTLE_END);
      this.fadingAlert('You Died', 90, "30%", "red", "Cormorant Unicase");
    }

    if (this.battle.bossHealth <= 0) {
      this.setGameMode(GameMode.BATTLE_END);
      this.fadingAlert('You Won', 90, "30%", "green", "Cormorant Unicase");
    }

    // check for when the video ends, loop it
    if (this.gameMode === GameMode.PLAYING && this.elements.player.getPlayerState() === YT.PlayerState.ENDED) {
      // loop the video
      this.elements.player.seekTo(0.0, true);
      this.elements.player.playVideo();
    }
  }

  setGameMode(mode: GameMode) {
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
      if (this.editor.level.attackData.length > 0) {
        this.elements.exportButton.style.display = 'block';
        this.elements.playButton.style.display = 'block';
      } else {
        this.elements.exportButton.style.display = 'none';
        this.elements.playButton.style.display = 'none';
      }
    }

    // load the video for editing, make new editor
    if (mode === GameMode.EDITING) {
      if (this.editor.level.video != null) {
        this.elements.player.loadVideoById(this.editor.level.video);
      }

      // delete the current recorded attacks
      this.editor.level.attackData = [];

      // in the editing mode, create a new editor
      this.editor = new Editor.Editor(this.elements.player, this.elements.recordingControls, this.elements.playbackBar, this.editor.level);
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
    this.editor.level.video = videoId;
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

  private drawAttackWarning() {
    const currentTime = this.elements.player.getCurrentTime();
    const ctx = this.elements.canvas.getContext('2d')!;
  
    // check for attack warning sound
    const soundAttack = this.getAttacksInInterval(this.battle.prevTime + ATTACK_WARNING_ADVANCE, currentTime + ATTACK_WARNING_ADVANCE);
  
    if (soundAttack.length > 0) {
      this.audio.playWarningSound();
    }
  
    const animAttacks = this.getAttacksInInterval(currentTime, currentTime + ATTACK_WARNING_ADVANCE);
    for (const attack of animAttacks) {
      const attackPos = [...blockDirectionPositions.get(attack.direction)!];
      // make attack pos a bit futher from the center
      attackPos[0] = attackPos[0] * 1.5;
      attackPos[1] = attackPos[1] * 1.5;
  
      // offset the attack position to center of screen
      attackPos[0] += 0.5;
      attackPos[1] += 0.5;
  
      const animTime = (currentTime - attack.time) / ATTACK_WARNING_ADVANCE;
      const opacity = Math.max(0, 1 - animTime);
  
      const attackX = this.elements.canvas.width * attackPos[0];
      const attackY = this.elements.canvas.height * (1 - attackPos[1]);
      ctx.save();
      ctx.globalAlpha = opacity;

      // draw the arrow sprite
      ctx.translate(attackX, attackY);
      // rotate by the angle of the attack
      ctx.rotate(attack.direction * Math.PI / 4);
      ctx.drawImage(this.graphics.arrowSprite, -this.graphics.arrowSprite.width / 2, -this.graphics.arrowSprite.height / 2);

      ctx.restore();
    }
  }

  private drawSword() {
    const currentTime = this.elements.player.getCurrentTime();
    var swordPos = this.battle.anim.endPos;
    var swordAngle = this.battle.anim.endAngle;
    var redSwordOutlineStrength = 0.0;
    var greenSwordOutlineStrength = 0.0;
    var xscale = 1.0;
    var yscale = 1.0;
  
    // first, determine swordPos and swordDir from animation
    if (this.battle.anim.state !== AttackAnimation.NONE) {
      const animProgressUncapped = (currentTime - this.battle.anim.startTime) / (this.battle.anim.endTime - this.battle.anim.startTime);
      const animProgress = Math.max(Math.min(1.0, animProgressUncapped), 0.0);
      swordPos = [
        this.battle.anim.startPos[0] + (this.battle.anim.endPos[0] - this.battle.anim.startPos[0]) * animProgress,
        this.battle.anim.startPos[1] + (this.battle.anim.endPos[1] - this.battle.anim.startPos[1]) * animProgress,
      ];
  
      const fastExponentialAnimProgress = Math.sqrt(Math.sqrt(animProgress));
      const slowExponentialAnimProgress = Math.pow(animProgress, 0.8);
      var targetAngle = this.battle.anim.endAngle;
      // if target angle is more than 180 degrees away, subtract 360 degrees so we rotate the other way
      if (targetAngle - this.battle.anim.startAngle > Math.PI) {
        targetAngle -= Math.PI * 2;
      }
      // if the target angle is less than -180 degrees away, add 360 degrees so we rotate the other way
      if (targetAngle - this.battle.anim.startAngle < -Math.PI) {
        targetAngle += Math.PI * 2;
      }
      var currentAngle = this.battle.anim.startAngle + (targetAngle - this.battle.anim.startAngle) * fastExponentialAnimProgress;
      swordAngle = currentAngle;
  
      // sword outline is only visible during the parry window
      const parryWindowProportion = PARRY_WINDOW / (PARRY_WINDOW + PARRY_END_LAG);
      if (this.battle.anim.state === AttackAnimation.PARRYING && animProgress < parryWindowProportion) {
        redSwordOutlineStrength = Math.sqrt(1.0 - (animProgress / parryWindowProportion));
      }

      // interpolate squish using slowExponentialAnimProgress
      xscale = this.battle.anim.startYScale + (this.battle.anim.endXScale - this.battle.anim.startXScale) * slowExponentialAnimProgress;
      yscale = this.battle.anim.startYScale + (this.battle.anim.endYScale - this.battle.anim.startYScale) * slowExponentialAnimProgress;
    }

    // fading green outline if we just parried successfully
    if (currentTime - this.battle.anim.lastParryTime < SUCCESS_PARRY_ANIM_FADE) {
      greenSwordOutlineStrength = Math.sqrt(1.0 - ((currentTime - this.battle.anim.lastParryTime) / SUCCESS_PARRY_ANIM_FADE));
    }

    // draw swordImage to the canvas at it's current position
    // center it on the xpos and ypos
    const topLeftX = this.elements.canvas.width * swordPos[0];
    const topLeftY = this.elements.canvas.height * swordPos[1];
    var swordOutlineX = topLeftX;
    var swordOutlineY = topLeftY; 
  
    this.drawCenteredRotated(this.graphics.swordSprites.yellowOutline, swordOutlineX, swordOutlineY, swordAngle - Math.PI / 2, redSwordOutlineStrength, xscale, yscale);
    this.drawCenteredRotated(this.graphics.swordSprites.greenOutline, swordOutlineX, swordOutlineY, swordAngle- Math.PI / 2, greenSwordOutlineStrength, xscale, yscale);
    this.drawCenteredRotated(this.graphics.swordSprites.default, topLeftX, topLeftY, swordAngle- Math.PI / 2, 1.0, xscale, yscale);
  }

  // Draw the sword, health bars, ect to the canvas based on the data in state
  private drawCanvas() {
    const currentTime = this.elements.player.getCurrentTime();
  
    this.drawAttackWarning();
  
    this.drawSword();

    // draw the boss name
    const youtubeVideoName = this.elements.player.getIframe().title;
    animateBossName(youtubeVideoName, this.elements.canvas, currentTime, 0.15);

    // draw the boss health at the top
    drawHealthBar(this.elements.canvas, 0.05, { r: 255, g: 0, b: 0 }, this.battle.bossHealth, this.battle.lastBossHit, this.battle.lastBossHealth, currentTime);
    // draw the player health at the bottom
    drawHealthBar(this.elements.canvas, 0.9, { r: 0, g: 255, b: 0 }, this.battle.playerHealth, this.battle.lastPlayerHit, this.battle.lastPlayerHealth, currentTime);
  }
  
  // rotates by angle counter clockwise, and squishes by squish
  private drawCenteredRotated(image: HTMLImageElement | HTMLCanvasElement, xpos: number, ypos: number, angle: number, alpha: number, xscale: number, yscale: number) {
    // invert ypos since it starts from the bottom of the screen
    ypos = this.elements.canvas.height - ypos;
    const ctx = this.elements.canvas.getContext('2d')!;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(xpos, ypos);
    ctx.rotate(-angle);
    ctx.scale(xscale, yscale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
  }
}


// YouTube API will call this function when API is ready
function onYouTubeIframeAPIReady() {
  const player = new YT.Player('video-player', {
    height: '100%',
    width: '100%',
    videoId: '',
    playerVars: {
      autoplay: 1,
      controls: 0,
      modestbranding: 1, // Reduce YouTube branding
      rel: 0,            // Do not show related videos at the end
      fs: 0,             // Disable fullscreen button
      iv_load_policy: 3, // Disable video annotations
      showinfo: 0,       // Remove video title
      cc_load_policy: 0, // Hide closed captions
    }
  });
  player.addEventListener("onReady", () => {
    player.setPlaybackQuality("highres");
    const videoSouls = new VideoSouls(player);
    videoSouls.mainLoop.bind(videoSouls, 1000 / 60)()
  });
}

// Helper function to extract the video ID from a YouTube URL
function extractVideoID(url: string) {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Directions

function netDirection(directionsArr: InputDirection[]) {
  const directions = new Set(directionsArr);
  // Cancel out opposites
  if (directions.has(InputDirection.LEFT) && directions.has(InputDirection.RIGHT)) {
    directions.delete(InputDirection.LEFT);
    directions.delete(InputDirection.RIGHT);
  }
  if (directions.has(InputDirection.UP) && directions.has(InputDirection.DOWN)) {
    directions.delete(InputDirection.UP);
    directions.delete(InputDirection.DOWN);
  }
  // Get combined direction
  let combinedDirection = 0;
  directions.forEach(dir => combinedDirection |= dir);
  return [
    InputDirection.UP,
    InputDirection.UP | InputDirection.RIGHT,
    InputDirection.RIGHT,
    InputDirection.DOWN | InputDirection.RIGHT,
    InputDirection.DOWN,
    InputDirection.DOWN | InputDirection.LEFT,
    InputDirection.LEFT,
    InputDirection.UP | InputDirection.LEFT,
    0
  ].indexOf(combinedDirection);
}
  
const directionNumToAngle = new Map<number, number>([
  [0, 4 * Math.PI / 4],
  [1, 3 * Math.PI / 4],
  [2, 2 * Math.PI / 4],
  [3, 1 * Math.PI / 4],
  [4, 4 * Math.PI / 4],
  [5, 3 * Math.PI / 4],
  [6, 2 * Math.PI / 4],
  [7, 5 * Math.PI / 4],
  [8, 2 * Math.PI / 4],
]);


// positions relative to center of screen
const blockDirectionPositions = new Map<number, [number, number]>([
  [0, [0.0, 0.2]],
  [1, [0.2, 0.2]],
  [2, [0.2, 0.0]],
  [3, [0.2, -0.2]],
  [4, [0.0, -0.2]],
  [5, [-0.2, -0.2]],
  [6, [-0.2, 0.0]],
  [7, [-0.2, 0.2]],
  [8, [0.0, 0.0]],
]);

const attackStartPosition = [0.65, 0.7];
const attackEndPosition = [0.35, 0.2];

// position relative to bottom left of screen
const attackedPosition = [0.7, 0.4];
const attackedAngle = Math.PI / 2;


function currentTargetAngleRadians() {
  return directionNumToAngle.get(currentTargetDir())!;
}


function currentTargetDir() {
  // find the target direction based on combination of keys pressed
  var directions: InputDirection[] = [];
  keyToDirection.forEach((dir, key) => {
    if (keyPressed.has(key)) {
      directions.push(dir);
    }
  })
  return netDirection(directions);
}

// Image manipulations

function scaleImage(image: HTMLImageElement | HTMLCanvasElement, scaleW: number, scaleH: number) {
  const newCanvas = document.createElement('canvas');
  newCanvas.width = image.width * scaleW;
  newCanvas.height = image.height * scaleH;
  const ctx = newCanvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, newCanvas.width, newCanvas.height);
  return newCanvas;
}

// given an image/canvas and a color multiplier, multiply each rgb value
// in the image by the color multiplier element-wise
// color multiplier is an array of 3 values
function tintImage(image: HTMLImageElement | HTMLCanvasElement, color_multiplier: [number, number, number]) {
  const newCanvas = document.createElement('canvas');
  newCanvas.width = image.width;
  newCanvas.height = image.height;
  const ctx = newCanvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, newCanvas.width, newCanvas.height);
  const imageData = ctx.getImageData(0, 0, newCanvas.width, newCanvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] *= color_multiplier[0];
    data[i + 1] *= color_multiplier[1];
    data[i + 2] *= color_multiplier[2];
  }
  ctx.putImageData(imageData, 0, 0);
  return newCanvas;
}

function animateBossName(
  name: string,
  canvas: HTMLCanvasElement,
  timeElapsed: number,
  yPosition: number // Y position as a fraction of the canvas height (0 = top, 1 = bottom)
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();

  const width = canvas.width;
  const height = canvas.height;

  // Set up text properties with a gothic, dramatic font
  ctx.font = '50px "Cormorant Unicase", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Parameters for the animation
  const waveAmplitude = 10; // Amplitude of the sine wave under the text
  const waveFrequency = 1.5; // Fewer oscillations (lower frequency)
  const maxWaveLengthMultiplier = 1.2; // 20% wider than the text width
  const animationDuration = 1; // Duration in seconds to animate the wave
  const flashDuration = 0.5; // Duration of transition to red drop shadow
  const redTextDuration = 0.5; // Duration the red text stays on screen
  const fadeOutDuration = 0.5; // Duration of fade-out

  const totalDuration =
    animationDuration + flashDuration + redTextDuration + fadeOutDuration;

  // Stop rendering after the entire animation
  if (timeElapsed > totalDuration) return;

  // Calculate the width of the text
  const textWidth = ctx.measureText(name).width;

  // Calculate maximum wave length based on text width
  const maxWaveLength = textWidth * maxWaveLengthMultiplier;

  // Adjust wave length with an exponential easing function
  const t = Math.min(timeElapsed / animationDuration, 1); // Cap at 1
  const waveLength = maxWaveLength * (1 - Math.pow(2, -10 * t)); // Exponential ease-out

  // Calculate the Y position of the text and wave based on the parameter
  const textY = height * yPosition;

  // Handle fade-out phase
  let alpha = 1;
  if (timeElapsed > animationDuration + flashDuration + redTextDuration) {
    const fadeOutFactor =
      (timeElapsed - (animationDuration + flashDuration + redTextDuration)) /
      fadeOutDuration;
    alpha = 1 - Math.min(fadeOutFactor, 1); // Gradually reduce alpha
  }

  // Set global alpha for fade-out
  ctx.globalAlpha = alpha;

  // Transition to red drop shadow or outline immediately after animation ends
  if (timeElapsed >= animationDuration) {
    const transitionFactor = Math.min(
      (timeElapsed - animationDuration) / flashDuration,
      1
    ); // Normalize for flash duration
    const redIntensity = 255;
    ctx.fillStyle = `rgba(255, 255, 255, 1)`;
    ctx.shadowColor = `rgba(${redIntensity}, 0, 0, 1)`;
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5 + 4 * transitionFactor; // Gradually increase offset
    ctx.shadowOffsetY = 5 + 4 * transitionFactor;
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Draw the text
  ctx.fillText(name, width / 2, textY);

  // Clear the shadow for the wave
  ctx.shadowColor = 'transparent';

  // Draw the animated wave expanding from the center, keeping it visible until the fade-out ends
  ctx.beginPath();
  const startX = (width - waveLength) / 2;
  const endX = startX + waveLength;

  // Create a smoother wave by adjusting the X increment
  const step = Math.max(waveLength / 100, 1); // Adjust step size based on wave length
  for (let x = startX; x < endX; x += step) {
    // Calculate the sine wave for each x
    const sineY =
      waveAmplitude * Math.sin(((x - startX) / waveLength) * waveFrequency * Math.PI * 2);
    ctx.lineTo(x, textY + 30 + sineY);
  }

  // Finalize the line path
  ctx.lineTo(endX, textY + 30); // End point of the curve
  ctx.strokeStyle = `rgba(255, 255, 255, 0.7)`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Restore canvas state
  ctx.restore();
}

interface Color {
  r: number;
  g: number;
  b: number;
  a?: number; // Optional alpha value, defaults to 1 if not provided
}

function colorToString(color: Color): string {
  const { r, g, b, a = 1 } = color;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function adjustColorOpacity(color: Color, opacity: number): Color {
  return { ...color, a: opacity };
}

function drawHealthBar(
  canvas: HTMLCanvasElement, 
  yPosition: number, // value from 0 to 1, relative to canvas height
  color: Color, 
  currentHealth: number, // value from 0 to 1
  lastHealthChangeTime: number, // in seconds
  lastHealth: number, // value from 0 to 1
  currentTime: number // in seconds
) {
  const ctx = canvas.getContext('2d')!;
  const barWidth = canvas.width * 0.8;
  const barHeight = 20;
  const xOffset = (canvas.width - barWidth) / 2;
  const shakeDuration = 0.2; // seconds
  const shakeMagnitude = 10; // pixels (increased for more dramatic effect)

  // Calculate the actual y position based on the canvas height
  const yPos = yPosition * canvas.height;

  // Determine how much health was lost
  const lostHealth = lastHealth - currentHealth;

  // Time since the health change
  const timeSinceChange = currentTime - lastHealthChangeTime;

  // Shake effect for the entire bar after getting hit
  let shakeOffsetX = 0;
  if (timeSinceChange < shakeDuration) {
    shakeOffsetX = Math.sin((timeSinceChange / shakeDuration) * Math.PI) * shakeMagnitude;
  }

  // Draw lost health bar (darker bar, tinted with the same color)
  if (lostHealth > 0) {
    const delay = 0.5; // seconds delay before starting the lost health animation
    let animatedLastHealth = lastHealth;
    if (timeSinceChange > delay) {
      const decrementAmount = (timeSinceChange - delay) / 5; // Slow decrease over time (5 seconds)
      animatedLastHealth = Math.max(currentHealth, lastHealth - decrementAmount);
    }
    const lostHealthWidth = barWidth * animatedLastHealth;
    ctx.fillStyle = colorToString(adjustColorOpacity(color, 0.5)); // Darker tint of the original color
    ctx.fillRect(xOffset + shakeOffsetX, yPos, lostHealthWidth, barHeight);
  }

  // Draw current health bar
  const currentHealthWidth = barWidth * currentHealth;
  ctx.fillStyle = colorToString(color);
  ctx.fillRect(xOffset + shakeOffsetX, yPos, currentHealthWidth, barHeight);

  // Draw border
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.strokeRect(xOffset + shakeOffsetX, yPos, barWidth, barHeight);
}


function normalize(vec: [number, number]) {
  const [x, y] = vec;
  const length = Math.sqrt(x * x + y * y);
  return [x / length, y / length];
}