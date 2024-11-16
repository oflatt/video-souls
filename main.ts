// main.ts

enum GameMode {
  MENU, PLAYING, RECORDING
}

enum InputDirection {
  LEFT = 0b0001,
  UP = 0b0010,
  RIGHT = 0b0100,
  DOWN = 0b1000
}

enum AttackDirection {
  UP, UP_RIGHT, RIGHT, DOWN_RIGHT, DOWN, DOWN_LEFT, LEFT, UP_LEFT, CENTER
}

enum AttackAnimation {
  NONE, PARRYING, ATTACKING, STAGGERING
}


const keyToDirection = new Map<string, InputDirection>([
  ['w', InputDirection.UP],
  ['a', InputDirection.LEFT],
  ['s', InputDirection.DOWN],
  ['d', InputDirection.RIGHT],
]);

const parryKey = 'j';


type BattleState = {
  // positions are relative to bottom-left of screen, 0.0 to 1.0
  pos: [number, number],
  // direction vectors are x, y normalized
  dir: [number, number],
  anim: {
    state: AttackAnimation,
    startTime: number,
    endTime: number,
    startPos: [number, number],
    endPos: [number, number],
    startAngle: number,
    endAngle: number,
    // last parry time adds a green glow after a successful parry
    lastParryTime: number
  },
  // readyAt encodes end lag for blocking or attacking
  // only after this time in the video can another input be made
  readyAt: number,
  // inputs are buffered so that they are not missed and punishes for spam
  bufferedInput: string | null,
  health: number,
  healthBoss: number,
  // the last time we checked for attacks
  prevTime: number
};
type AttackData = {
  time: number,
  direction: AttackDirection
};
type LevelData = {
  video: string | null,
  attackData: AttackData[],
  version: number
};
type AlertData = {
  message: HTMLElement,
  startTime: number,
  lifetime: number
};
type StateData = {
  level: LevelData,
  gameMode: GameMode,
  battle: BattleState,
  alerts: AlertData[]
};


const keyPressed = new Set<string>();
const keyJustPressed = new Set<string>();

const PARRY_WINDOW = 0.2;
const PARRY_END_LAG = 0.2;
const SUCCESS_PARRY_ANIM_FADE = 0.2;

const STAGGER_TIME = 0.4;

const ATTACK_WARNING_ADVANCE = 0.2;


function initialBattleState(): BattleState {
  return {
    // positions are relative to bottom-left of screen
    pos: [0.5, 0.5],
    // direction vectors are x, y normalized
    dir: [0, 1],
    anim: {
      state: AttackAnimation.NONE,
      startTime: 0,
      endTime: 0,
      startPos: [0, 0],
      endPos: [0, 0],
      startAngle: 0,
      endAngle: 0,
      lastParryTime: -100,
    },
    readyAt: 0,
    bufferedInput: null,
    health: 1.0,
    healthBoss: 1.0,
    prevTime: 0,
  };
}


class Graphics {
  swordSprites: {
    default: HTMLImageElement | HTMLCanvasElement,
    yellowOutline: HTMLImageElement | HTMLCanvasElement,
    greenOutline: HTMLImageElement | HTMLCanvasElement,
  };

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
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness > 0) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }

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
  level: LevelData;
  gameMode: GameMode;
  battle: BattleState;
  alerts: AlertData[];
  graphics: Graphics;

  constructor(player: YT.Player) {
    this.elements = {
      player: player,

      canvas: document.querySelector<HTMLCanvasElement>("#game-canvas")!,

      gameHUD: document.querySelector<HTMLInputElement>("#game-hud")!,
      floatingMenu: document.querySelector<HTMLInputElement>("#floating-menu")!,
      currentTimeDebug: document.querySelector<HTMLDivElement>("#current-time")!,

      videoUrlInput: document.querySelector<HTMLInputElement>("#video-url")!,
      recordSpeedInput: document.querySelector<HTMLInputElement>("#record-speed")!,

      recordButton: document.querySelector<HTMLButtonElement>("#record-button")!,
      playButton: document.querySelector<HTMLButtonElement>("#play-button")!,
      exportButton: document.querySelector<HTMLButtonElement>("#export-button")!,
    } as const;

    this.level = {
      video: null,
      attackData: [],
      version: 1,
    };
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
          this.fadingAlert('Please enter a valid YouTube URL.');
        }
    });
    this.elements.playButton.addEventListener('click', () => {
      this.setGameMode(GameMode.PLAYING);
    });
  
    this.elements.exportButton.addEventListener('click', () => {
      this.exportLevel();
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
  }

  mainLoop(time: DOMHighResTimeStamp) {
    // Debug
    const currentTime = this.elements.player.getCurrentTime();
    const timeInMilliseconds = Math.floor(currentTime * 1000);
    this.elements.currentTimeDebug.textContent = `Time: ${timeInMilliseconds} ms data: ${this.level.attackData.length}`;
    
    this.updateState();

    const ctx = this.elements.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
    this.drawCanvas();

    this.fadeOutAlerts();

    keyJustPressed.clear();

    this.battle.prevTime = currentTime;

    requestAnimationFrame(this.mainLoop.bind(this));
  }

  fadingAlert(message: string) {
    // make an alert text element on top of the screen
    const alertText = document.createElement('div');
    alertText.classList.add("fading-alert");
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
    const json = JSON.stringify(this.level);
    // copy the link to the clipboard
    navigator.clipboard.writeText(json).then(() => {
      this.fadingAlert('Level data copied to clipboard.');
    }).catch(error => {
      this.fadingAlert('Failed to copy level data to clipboard.');
      console.error('Failed to copy: ', error);
    });
  }

  // gets the attack direction, if any, for this time period
  // starttime exclusive, endtime inclusive
  getAttacksInInterval(startTime: number, endTime: number) {
    return this.level.attackData.filter(attack => attack.time > startTime && attack.time <= endTime);
  }

  successParry() {
    const currentTime = this.elements.player.getCurrentTime();
    // successful parry
    this.battle.anim.lastParryTime = currentTime;
    // cancel the lag on the parry now that it was successful
    this.battle.readyAt = currentTime - 1;
    this.battle.anim.state = AttackAnimation.NONE;
  }

  handleBossAttacks() {
    const currentTime = this.elements.player.getCurrentTime();
    const attacks = this.getAttacksInInterval(this.battle.prevTime, currentTime);
    if (attacks.length > 0) {
      // get the first attack (only one attack per frame allowed)
      const attack = attacks[0];
      // if the player is not parrying, take damage
      if (this.battle.anim.state === AttackAnimation.PARRYING && currentDir() == attack.direction) {
        this.successParry();
      } else {
        this.battle.health -= 0.1;
  
        // start a stagger animation
        this.battle.anim.state = AttackAnimation.STAGGERING;
        this.battle.anim.startTime = currentTime;
        this.battle.anim.endTime = currentTime + STAGGER_TIME;
        this.battle.anim.startPos = [...this.battle.pos];
        // move the sword to the attacked position plus small random offset
        this.battle.anim.endPos = [
          attackedPosition[0] + (Math.random() - 0.5) * 0.1,
          attackedPosition[1] + (Math.random() - 0.5) * 0.1,
        ];
        // change the angle randomly too
        this.battle.anim.startAngle = Math.atan2(this.battle.dir[0], this.battle.dir[1]);
        this.battle.anim.endAngle = attackedAngle;
      }
    }
  }

  doParry() {
    const currentTime = this.elements.player.getCurrentTime();
    this.battle.anim.state = AttackAnimation.PARRYING;
    this.battle.anim.startTime = currentTime;
    this.battle.anim.endTime = currentTime + PARRY_WINDOW + PARRY_END_LAG;
    this.battle.anim.startPos = [...this.battle.pos];
    this.battle.anim.endPos = [...this.battle.pos];
    this.battle.anim.startAngle = Math.atan2(this.battle.dir[0], this.battle.dir[1]);
    this.battle.anim.endAngle = this.battle.anim.startAngle - (Math.PI / 10);
  }

  updateState() {
    const currentTime = this.elements.player.getCurrentTime();
    // if the game mode is recording, record attacks based on button presses (WASD)
    if (this.gameMode == GameMode.RECORDING) {
      // check if the parry key is pressed, and add to the attack data if so
      if (keyJustPressed.has(parryKey)) {
        this.level.attackData.push({ time: currentTime, direction: currentDir() });
      }
    }
  
    if ((this.gameMode == GameMode.PLAYING || this.gameMode == GameMode.RECORDING)) {
      // check if parry button pressed
      if (keyJustPressed.has(parryKey) && this.battle.bufferedInput === null) {
        // buffer the parry
        this.battle.bufferedInput = parryKey;
      }

      // ready for new buffered action
      if (currentTime >= this.battle.readyAt && this.battle.bufferedInput !== null) {
        if (this.battle.bufferedInput === parryKey) {
          // in recording, do a successful parry
          this.doParry();
          this.battle.bufferedInput = null;
        }
      }
  
      // check if we finished an animation
      if (this.battle.anim.state !== AttackAnimation.NONE && currentTime >= this.battle.anim.endTime) {
        this.battle.anim.state = AttackAnimation.NONE;
      }
  
      // check if we were attacked
      this.handleBossAttacks();
    }
  
    // if the sword is not in an animation, move towards user input dir
    if (this.battle.anim.state === AttackAnimation.NONE) {
      const targetDir = currentDirVector();
  
      // clone the target position so we don't mutate it!
      var targetPos = [...blockDirectionPositions.get(currentDir())!];
  
      // offset the target position to center of screen
      targetPos[0] += 0.5;
      targetPos[1] += 0.5;
  
      // if the position is some epsilon close to the target position, set the position to the target position
      if (Math.abs(this.battle.pos[0] - targetPos[0]) < 0.01 && Math.abs(this.battle.pos[1] - targetPos[1]) < 0.01) {
        this.battle.pos[0] = targetPos[0];
        this.battle.pos[1] = targetPos[1];
      } else {
        // otherwise, move the sword towards the target position
        this.battle.pos[0] += (targetPos[0] - this.battle.pos[0]) / 20;
        this.battle.pos[1] += (targetPos[1] - this.battle.pos[1]) / 20;
      }
  
      // if the direction is some epsilon close to the target direction, set the direction to the target direction
      if (Math.abs(this.battle.dir[0] - targetDir[0]) < 0.01 && Math.abs(this.battle.dir[1] - targetDir[1]) < 0.01) {
        this.battle.dir[0] = targetDir[0];
        this.battle.dir[1] = targetDir[1];
      } else {
        // otherwise, move the sword towards the target direction by rotating it
        const angle = Math.atan2(this.battle.dir[0], this.battle.dir[1]);
        const targetAngle = Math.atan2(targetDir[0], targetDir[1]);
        const newAngle = angle + (targetAngle - angle) / 20;
        this.battle.dir = [Math.sin(newAngle), Math.cos(newAngle)];
      }
    }
  
    // check for the escape key
    if (keyJustPressed.has('Escape')) {
      // set game mode to menu
      this.setGameMode(GameMode.MENU);
    }
  
    // check for when the video ends, go back to menu
    if (this.gameMode === GameMode.RECORDING && this.elements.player.getPlayerState() === YT.PlayerState.ENDED) {
      this.setGameMode(GameMode.MENU);
    }
  }

  setGameMode(mode: GameMode) {
    // if the video is valid, load it
    if (this.level.video !== null) {
      this.elements.player.loadVideoById(this.level.video);
      this.elements.player.pauseVideo();
    }
  
    // reset the sword state
    this.battle = initialBattleState();
  
    // if the new mode is menu, show the menu
    if  (mode === GameMode.MENU) {
      this.elements.gameHUD.style.display = 'none';
      this.elements.floatingMenu.style.display = 'flex';
      // pause the video
      this.elements.player.pauseVideo();
      // show the export and play buttons if there is any recorded data
      if (this.level.attackData.length > 0) {
        this.elements.exportButton.style.display = 'block';
        this.elements.playButton.style.display = 'block';
      } else {
        this.elements.exportButton.style.display = 'none';
        this.elements.playButton.style.display = 'none';
      }
    }
    // if the new mode is playing, show the game hud
    if (mode === GameMode.PLAYING || mode === GameMode.RECORDING) {
      // hide the floating menu
      this.elements.floatingMenu.style.display = 'none';
  
      var playbackRate = 1.0;
      if (mode === GameMode.RECORDING) {
        // delete the current recorded attacks
        this.level.attackData = [];
        // set the playback rate to the recording speed
        playbackRate = Number(this.elements.recordSpeedInput.value);
      }
      this.elements.player.setPlaybackRate(playbackRate);
  
      this.elements.gameHUD.style.display = 'flex';
      this.elements.player.playVideo();
    }
  
    this.gameMode = mode;
  }
  
  setCurrentVideo(videoId: string) {
    this.level.video = videoId;
  }

  // Function to play a YouTube video by extracting the video ID from the URL
  recordVideo(videoUrl: string) {
    const videoId = extractVideoID(videoUrl);
    if (videoId != null) {
      this.setCurrentVideo(videoId);
      this.setGameMode(GameMode.RECORDING);
    } else {
      this.fadingAlert('Invalid YouTube URL');
    }
  }

  private drawAttackWarning() {
    const currentTime = this.elements.player.getCurrentTime();
    const ctx = this.elements.canvas.getContext('2d')!;
  
    // check for attack warning sound
    const soundAttack = this.getAttacksInInterval(this.battle.prevTime + ATTACK_WARNING_ADVANCE, currentTime + ATTACK_WARNING_ADVANCE);
  
    // TODO play warning sound
  
    const animAttacks = this.getAttacksInInterval(currentTime - ATTACK_WARNING_ADVANCE, currentTime);
    for (const attack of animAttacks) {
      // draw a white circle at the attack
      const attackPos = [...blockDirectionPositions.get(attack.direction)!];
      // make attack pos a bit futher from the center
      attackPos[0] = attackPos[0] * 1.2;
      attackPos[1] = attackPos[1] * 1.2;
  
      // offset the attack position to center of screen
      attackPos[0] += 0.5;
      attackPos[1] += 0.5;
  
      const animTime = (currentTime - attack.time) / ATTACK_WARNING_ADVANCE;
      const opacity = Math.max(0, 1 - animTime);
  
      const attackX = this.elements.canvas.width * attackPos[0];
      const attackY = this.elements.canvas.height * (1 - attackPos[1]);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.arc(attackX, attackY, 10, 0, 2 * Math.PI);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw the sword, health bars, ect to the canvas based on the data in state
  private drawCanvas() {
    const currentTime = this.elements.player.getCurrentTime();
  
    this.drawAttackWarning();
  
    var swordPos = this.battle.pos;
    var swordDir = this.battle.dir;
    console.log(swordPos, swordDir);
    var redSwordOutlineStrength = 0.0;
    var greenSwordOutlineStrength = 0.0;
  
    // first, determine swordPos and swordDir from animation
    if (this.battle.anim.state !== AttackAnimation.NONE) {
      const animProgressUncapped = (currentTime - this.battle.anim.startTime) / (this.battle.anim.endTime - this.battle.anim.startTime);
      const animProgress = Math.max(Math.min(1.0, animProgressUncapped), 0.0);
      swordPos = [
        this.battle.anim.startPos[0] + (this.battle.anim.endPos[0] - this.battle.anim.startPos[0]) * animProgress,
        this.battle.anim.startPos[1] + (this.battle.anim.endPos[1] - this.battle.anim.startPos[1]) * animProgress,
      ];
  
      const fastExponentialAnimProgress = Math.sqrt(Math.sqrt(animProgress));
      const currentAngle = this.battle.anim.startAngle + (this.battle.anim.endAngle - this.battle.anim.startAngle) * fastExponentialAnimProgress;
      swordDir = [Math.sin(currentAngle), Math.cos(currentAngle)];
  
      // sword outline is only visible during the parry window
      const parryWindowProportion = PARRY_WINDOW / (PARRY_WINDOW + PARRY_END_LAG);
      if (this.battle.anim.state === AttackAnimation.PARRYING && animProgress < parryWindowProportion) {
        redSwordOutlineStrength = Math.sqrt(1.0 - (animProgress / parryWindowProportion));
      }
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
  
    this.drawCenteredRotated(this.graphics.swordSprites.yellowOutline, swordOutlineX, swordOutlineY, Math.atan2(swordDir[0], swordDir[1]), redSwordOutlineStrength);
    this.drawCenteredRotated(this.graphics.swordSprites.greenOutline, swordOutlineX, swordOutlineY, Math.atan2(swordDir[0], swordDir[1]), greenSwordOutlineStrength);
    this.drawCenteredRotated(this.graphics.swordSprites.default, topLeftX, topLeftY, Math.atan2(swordDir[0], swordDir[1]), 1.0);
  }
  
  private drawCenteredRotated(image: HTMLImageElement | HTMLCanvasElement, xpos: number, ypos: number, angle: number, alpha: number) {
    // invert ypos since it starts from the bottom of the screen
    ypos = this.elements.canvas.height - ypos;
    const ctx = this.elements.canvas.getContext('2d')!;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(xpos, ypos);
    ctx.rotate(angle);
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
  const videoSouls = new VideoSouls(player);
  player.addEventListener("onReady", videoSouls.mainLoop.bind(videoSouls, 1000 / 60));
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
  
const directionNumToDir = new Map<number, [number, number]>([
  [0, [-1, 0]],
  [1, [-1, 1]],
  [2, [0, 1]],
  [3, [-1, -1]],
  [4, [-1, 0]],
  [5, [-1, 1]],
  [6, [0, 1]],
  [7, [-1, -1]],
  [8, [0, 1]],
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

// position relative to bottom left of screen
const attackedPosition = [0.7, 0.4];
const attackedAngle = Math.PI / 2;

function currentDir() {
  // find the target direction based on combination of keys pressed
  var directions: InputDirection[] = [];
  keyToDirection.forEach((dir, key) => {
    if (keyPressed.has(key)) {
      directions.push(dir);
    }
  })
  return netDirection(directions);
}

function currentDirVector() {
  return directionNumToDir.get(currentDir())!;
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
