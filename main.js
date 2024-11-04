// main.js


const MENU = 'MENU';
const PLAYING = 'PLAYING';
const RECORDING = 'RECORDING';

// directions
const UP = 'UP';
const DOWN = 'DOWN';
const LEFT = 'LEFT';
const RIGHT = 'RIGHT';
const REST = 'REST';

// animations
const NONE = 'NONE';
const PARRYING = 'PARRYING';
const ATTACKING = 'ATTACKING';
const STAGGERING = 'STAGGERING';


const keyToDirection = {
  w: UP,
  a: LEFT,
  s: DOWN,
  d: RIGHT,
};

const parryKey = 'j';

function arrayEquals(a, b) {
  return Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((val, index) => val === b[index]);
}

const eqSet = (xs, ys) =>
  xs.size === ys.size &&
  [...xs].every((x) => ys.has(x));

function directionNum(directionsArr) {
  const directions = new Set(directionsArr);
  if (eqSet(directions, new Set([UP]))) {
    return 0;
  }
  if (eqSet(directions, new Set([UP, RIGHT]))) {
    return 1;
  }
  if (eqSet(directions, new Set([RIGHT]))) {
    return 2;
  }
  if (eqSet(directions, new Set([DOWN, RIGHT]))) {
    return 3;
  }
  if (eqSet(directions, new Set([DOWN]))) {
    return 4;
  }
  if (eqSet(directions, new Set([DOWN, LEFT]))) {
    return 5;
  }
  if (eqSet(directions, new Set([LEFT]))) {
    return 6;
  }
  if (eqSet(directions, new Set([UP, LEFT]))) {
    return 7;
  }
  return 8;
}



const directionNumToDir = {
  0: [-1, 0],
  1: [-1, 1],
  2: [0, 1],
  3: [-1, -1],
  4: [-1, 0],
  5: [-1, 1],
  6: [0, 1],
  7: [-1, -1],
  8: [0, 1],
}
// normalize the direction vectors
for (const key in directionNumToDir) {
  const dir = directionNumToDir[key];
  const length = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
  directionNumToDir[key] = [dir[0] / length, dir[1] / length];
}



// positions relative to center of screen
const blockDirectionPositions = {
  0: [0.0, 0.2],
  1: [0.2, 0.2],
  2: [0.2, 0.0],
  3: [0.2, -0.2],
  4: [0.0, -0.2],
  5: [-0.2, -0.2],
  6: [-0.2, 0.0],
  7: [-0.2, 0.2],
  8: [0.0, 0.0],
}

// position relative to bottom left of screen
const attackedPosition = [0.7, 0.4];
const attackedAngle = Math.PI / 2;


const initialBattleState = {
  pos: [0.5, 0.5],
  dir: [0, 1],
  anim: {
    // none, attacking, or parrying
    state: NONE,
    startTime: 0,
    endTime: 0,
    startPos: [0, 0],
    endPos: [0, 0],
    startAngle: 0,
    endAngle: 0,
    // last parry time adds a green glow after a successful parry
    lastParryTime: -100,
  },
  // readyAt encodes end lag for blocking or attacking
  // only after this time in the video can another input be made
  readyAt: 0,
  // inputs are buffered so that they are not missed and punishes for spam
  bufferedInput: null,

  // health of the player
  health: 1.0,
  // health of the boss
  healthBoss: 1.0,

  // the last time we checked for attacks
  prevTime: 0,
};

// make a global state dictionary to store the game state
const state = {
  level: {
    // the id of the current video being played or recorded
    video: null,
    // a list of attack structs for the current video
    // each attack struct has a time and direction : { time: time_in_seconds, direction: direction_num }
    // see directionNum for the direction_num values
    attackData: [],
    // version number for this version of video souls
    version: 1,
  },
  gameMode: MENU,
  battle: initialBattleState,
  // each alert has a message element and a time to live
  alerts: [],
};


// keep all elements on the page in this dictionary
const elements = {
};


// keep track of which keys are pressed
const keyPressed = {};

// also keep track of which keys were just pressed
const keyJustPressed = {};


const PARRY_WINDOW = 0.2;
const PARRY_END_LAG = 0.2;

const STAGGER_TIME = 0.4;

const ATTACK_WARNING_ADVANCE = 0.2;

// load sword.png
const swordImage = new Image();
swordImage.src = 'sword.png';

// Function to create and add all necessary HTML elements
function initializeGamePage() {
  // Add global styles to make the game container full-screen without any top/bottom margins
  const style = document.createElement('style');
  style.textContent = `
      * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
      }
      html, body {
          width: 100%;
          height: 100%;
          overflow: hidden;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #222;
          color: #fff;
          font-family: Arial, sans-serif;
      }
      #game-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
      }
      #video-player {
          width: 100%;
          height: 100%;
          background-color: #000; /* Placeholder for video */
          pointer-events: none; /* Disable mouse events on video */
      }
      /* Floating menu styles */
      #floating-menu {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          background-color: rgba(0, 0, 0, 0.8);
          padding: 10px 20px;
          border-radius: 8px;
      }
      /* game HUD style */
      #game-hud {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          background-color: rgba(0, 0, 0, 0.8);
          padding: 10px 20px;
          border-radius: 8px;
      }
      input {
          width: 300px;
          padding: 5px;
          border: none;
          border-radius: 4px;
          font-size: 1em;
      }
      button {
          padding: 5px 10px;
          font-size: 1em;
          cursor: pointer;
          border: none;
          border-radius: 4px;
          background-color: #28a745;
          color: #fff;
      }
      #record-button:hover {
          background-color: #218838;
      }
  `;
  document.head.appendChild(style);

  // Load the YouTube IFrame API
  loadYouTubeAPI();

  // Create main game container
  const gameContainer = document.createElement('div');
  gameContainer.id = 'game-container';
  elements.gameContainer = gameContainer;

  // Add video player container
  const videoPlayer = document.createElement('div');
  videoPlayer.id = 'video-player';
  gameContainer.appendChild(videoPlayer);
  elements.videoPlayer = videoPlayer;

  // Append the game container to the body
  document.body.appendChild(gameContainer);

  // Create floating menu
  const floatingMenu = document.createElement('div');
  floatingMenu.id = 'floating-menu';
  elements.floatingMenu = floatingMenu;

  // add video souls title to floating menu
  const videoSoulsTitle = document.createElement('h1');
  videoSoulsTitle.textContent = 'Video Souls';
  floatingMenu.appendChild(videoSoulsTitle);
  elements.videoSoulsTitle = videoSoulsTitle;
  // margin on bottom of 20 px
  videoSoulsTitle.style.marginBottom = '20px';

  // add a play button
  const playButton = document.createElement('button');
  playButton.textContent = 'Play';
  floatingMenu.appendChild(playButton);
  elements.playButton = playButton;
  // hide play button by default
  playButton.style.display = 'none';
  playButton.style.marginBottom = '20px';


  // Create video URL input
  const videoUrlInput = document.createElement('input');
  videoUrlInput.id = 'video-url';
  videoUrlInput.type = 'text';
  videoUrlInput.placeholder = 'Enter YouTube video URL';
  elements.videoUrlInput = videoUrlInput;

  // Create record button
  const recordButton = document.createElement('button');
  recordButton.id = 'record-button';
  recordButton.textContent = 'Record Boss Fight';
  elements.recordButton = recordButton;
  recordButton.style.marginBottom = '20px';

  // create a record speed input with a label
  const recordSpeedDiv = document.createElement('div');
  elements.recordSpeedDiv = recordSpeedDiv;

  const recordSpeedLabel = document.createElement('label');
  recordSpeedLabel.textContent = 'Recording Speed:';
  recordSpeedLabel.htmlFor = 'record-speed';
  elements.recordSpeedLabel = recordSpeedLabel;
  recordSpeedDiv.appendChild(recordSpeedLabel);
  
  const recordSpeedInput = document.createElement('input');
  recordSpeedInput.id = 'record-speed';
  recordSpeedInput.type = 'number';
  recordSpeedInput.placeholder = 'Enter recording speed';
  elements.recordSpeedInput = recordSpeedInput;
  // default to 0.5
  recordSpeedInput.value = 0.5;
  recordSpeedInput.style.marginBottom = '20px';
  recordSpeedDiv.appendChild(recordSpeedInput);

  // Add event listener to record button
  recordButton.addEventListener('click', () => {
    const videoUrl = videoUrlInput.value;
    const recordSpeed = parseFloat(recordSpeedInput.value);

    if (recordSpeed <= 0) {
        fadingAlert('Please enter a recording speed greater than 0.');
        return; // Prevent further execution if speed is invalid
    }

    if (videoUrl) {
        recordVideo(videoUrl, recordSpeed);
    } else {
        fadingAlert('Please enter a valid YouTube URL.');
    }
  });




  // Create export button, hidden by default
  const exportButton = document.createElement('button');
  exportButton.id = 'export-button';
  exportButton.textContent = 'Export';
  elements.exportButton = exportButton;
  exportButton.style.display = 'none';
  exportButton.style.marginBottom = '20px';

  // add a google adsense ad to the floating menu at the bottom
  /*const script = document.createElement('script');
  script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5102275085064362";
  script.setAttribute('async', '');
  script.setAttribute('crossorigin', 'anonymous');*/

  // Add elements to floating menu
  floatingMenu.appendChild(videoUrlInput);
  floatingMenu.appendChild(recordButton);
  floatingMenu.appendChild(recordSpeedDiv);
  floatingMenu.appendChild(exportButton);
  //floatingMenu.appendChild(script);

  // Append floating menu to body
  document.body.appendChild(floatingMenu);

  // Make game hud element
  const gameHUD = document.createElement('div');
  gameHUD.id = 'game-hud';
  elements.gameHUD = gameHUD;

  // add a title text to the game hud for current time
  const currentTimeDebug = document.createElement('h2');
  currentTimeDebug.textContent = 'Current Time';
  gameHUD.appendChild(currentTimeDebug);
  elements.currentTimeDebug = currentTimeDebug;

  // Add game hud to body
  document.body.appendChild(gameHUD);

  // make the game hud hidden by default
  gameHUD.style.display = 'none';

  // make the html canvas for the game, spanning the entire screen
  // it needs to be overlayed on top of the video
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  document.body.appendChild(canvas);
  // it also needs to not be clickable
  canvas.style.pointerEvents = 'none';
  elements.canvas = canvas;

  // add a scaled sword image to elements once swordImage is loaded
  swordImage.onload = () => {
    let scale_factor = (0.15 * canvas.width) / swordImage.width;
    elements.swordImage = scaleImage(swordImage, scale_factor);
    let outlineScaleFactor = (0.16 * canvas.width) / swordImage.width;
    let untinted = scaleImage(swordImage, outlineScaleFactor);
    elements.swordRedOutline = tintImage(untinted, [1.0, 0.2, 0.2]);
    elements.swordGreenOutline = tintImage(untinted, [0.2, 1.0, 0.2]);
  }

  // Add event listener to record button
  recordButton.addEventListener('click', () => {
      const videoUrl = videoUrlInput.value;
      if (videoUrl) {
          recordVideo(videoUrl);
      } else {
          fadingAlert('Please enter a valid YouTube URL.');
      }
  });

  // Add event listener to play button
  playButton.addEventListener('click', () => {
    // set game mode to playing
    setGameMode(PLAYING);
  });

  // Add event listener to export button
  exportButton.addEventListener('click', () => {
    // export the level
    exportLevel(state.level);
  });


  // track keypressed and keyjustpressed
  document.addEventListener('keydown', (event) => {
    if (!keyPressed[event.key]) {
      keyPressed[event.key] = true;
      keyJustPressed[event.key] = true;
    }
  });
  document.addEventListener('keyup', (event) => {
    keyPressed[event.key] = false;
  });
}

function fadingAlert(message) {
  // make an alert text element on top of the screen
  const alertText = document.createElement('div');
  alertText.textContent = message;
  alertText.style.position = 'absolute';
  alertText.style.top = '20px';
  alertText.style.left = '50%';
  alertText.style.transform = 'translateX(-50%)';
  alertText.style.padding = '10px 20px';
  alertText.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  alertText.style.borderRadius = '8px';
  alertText.style.zIndex = '1000';
  document.body.appendChild(alertText);

  state.alerts.push({ message: alertText, ttl: 3000 });
}



// Function to export the level data to json
function exportLevel(level) {
  const json = JSON.stringify(level);
  // copy the link to the clipboard
  navigator.clipboard.writeText(json).then(() => {
    fadingAlert('Level data copied to clipboard.');
  }).catch((error) => {
    fadingAlert('Failed to copy level data to clipboard.');
    console.error('Failed to copy: ', error);
  });
}


// Function to load the YouTube IFrame API
function loadYouTubeAPI() {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

// YouTube API will call this function when API is ready
function onYouTubeIframeAPIReady() {
  elements.player = new YT.Player('video-player', {
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
    },
      events: {
          onReady: mainLoop,
      },
  });
}

function scaleImage(image, scale) {
  const newCanvas = document.createElement('canvas');
  newCanvas.width = image.width * scale;
  newCanvas.height = image.height * scale;
  const ctx = newCanvas.getContext('2d');
  ctx.drawImage(image, 0, 0, newCanvas.width, newCanvas.height);
  return newCanvas;
}

// given an image/canvas and a color multiplier, multiply each rgb value
// in the image by the color multiplier element-wise
// color multiplier is an array of 3 values
function tintImage(image, color_multiplier) {
  const newCanvas = document.createElement('canvas');
  newCanvas.width = image.width;
  newCanvas.height = image.height;
  const ctx = newCanvas.getContext('2d');
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

// Main loop of the game
function mainLoop(event) {
  // update debug text
  const currentTime = elements.player.getCurrentTime();
  const timeInMilliseconds = Math.floor(currentTime * 1000);
  elements.currentTimeDebug.textContent = `Time: ${timeInMilliseconds} ms data: ${state.level.attackData.length}`;

  // clear the canvas
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  updateState();

  // draw the canvas
  drawCanvas();

  // handle fading alerts by making them slowly fade out
  for (let i = state.alerts.length - 1; i >= 0; i--) {
    const alert = state.alerts[i];
    alert.ttl -= 1000 / 60;
    if (alert.ttl <= 0) {
      alert.message.remove();
      state.alerts.splice(i, 1);
    } else {
      alert.message.style.opacity = alert.ttl / 3000;
    }
  }

  // clear keyJustPressed
  for (const key in keyJustPressed) {
    keyJustPressed[key] = false;
  }

  // lastly, set the last time to the current time
  state.battle.prevTime = currentTime;

  requestAnimationFrame(mainLoop); // Schedule the next update
}

// gets the attack direction, if any, for this time period
// starttime exclusive, endtime inclusive
function getAttacksInInterval(startTime, endTime) {
  const attacks = [];
  for (const attack of state.level.attackData) {
    if (attack.time > startTime && attack.time <= endTime) {
      attacks.push(attack);
    }
  }
  return attacks;
}

function successParry() {
  const currentTime = elements.player.getCurrentTime();
  // successful parry
  state.battle.anim.lastParryTime = currentTime;

  // cancel the lag on the parry now that it was successful
  state.battle.readyAt = currentTime-1;
  state.battle.anim.state = NONE;
}

function handleBossAttacks() {
  const currentTime = elements.player.getCurrentTime();
  const attacks = getAttacksInInterval(state.battle.prevTime, currentTime);
  if (attacks.length > 0) {
    // get the first attack (only one attack per frame allowed)
    const attack = attacks[0];
    // if the player is not parrying, take damage
    if (state.battle.anim.state === PARRYING && currentDir() == attack.direction) {
      console.log("parried");
      successParry();
    } else {
      console.log("attacked");
      state.battle.health -= 0.1;

      // start a stagger animation
      state.battle.anim.state = STAGGERING;
      state.battle.anim.startTime = currentTime;
      state.battle.anim.endTime = currentTime + STAGGER_TIME;
      state.battle.anim.startPos = [...state.battle.pos];
      // move the sword to the attacked position plus small random offset
      state.battle.anim.endPos = [
        attackedPosition[0] + (Math.random() - 0.5) * 0.1,
        attackedPosition[1] + (Math.random() - 0.5) * 0.1,
      ];
      // change the angle randomly too
      state.battle.anim.startAngle = Math.atan2(state.battle.dir[0], state.battle.dir[1]);
      state.battle.anim.endAngle = attackedAngle;
    }
  }
}

function currentDir() {
  // find the target direction based on combination of keys pressed
  var directions = [];
  for (const key in keyToDirection) {
    if (keyPressed[key]) {
      directions.push(keyToDirection[key]);
    }
  }
  return directionNum(directions);
}

function currentDirVector() {
  return directionNumToDir[currentDir()];
}

function doParry() {
  const currentTime = elements.player.getCurrentTime();
  state.battle.anim.state = PARRYING;
  state.battle.anim.startTime = currentTime;
  state.battle.anim.endTime = currentTime + PARRY_WINDOW + PARRY_END_LAG;
  state.battle.anim.startPos = [...state.battle.pos];
  state.battle.anim.endPos = [...state.battle.pos];
  state.battle.anim.startAngle = Math.atan2(state.battle.dir[0], state.battle.dir[1]);
  state.battle.anim.endAngle = state.battle.anim.startAngle - (Math.PI / 10);
}

function updateState() {
  const currentTime = elements.player.getCurrentTime();
  // if the game mode is recording, record attacks based on button presses (WASD)
  if (state.gameMode == RECORDING) {
    // check if the parry key is pressed, and add to the attack data if so
    if (keyJustPressed[parryKey]) {
      state.level.attackData.push({ time: currentTime, direction: currentDir() });
    }
  }

  if ((state.gameMode == PLAYING || state.gameMode == RECORDING)) {
    // check if parry button pressed
    if (keyJustPressed[parryKey] && state.battle.bufferedInput === null) {
      // buffer the parry
      state.battle.bufferedInput = parryKey;
    }


    // ready for new buffered action
    if (currentTime >= state.battle.readyAt && state.battle.bufferedInput !== null) {
      if (state.battle.bufferedInput === parryKey) {
        // in recording, do a successful parry
        doParry();

        state.battle.bufferedInput = null;
      }
    }

    // check if we finished an animation
    if (state.battle.anim.state !== NONE && currentTime >= state.battle.anim.endTime) {
      state.battle.anim.state = NONE;
    }

    // check if we were attacked
    handleBossAttacks();
  }

  // if the sword is not in an animation, move towards user input dir
  if (state.battle.anim.state === NONE) {
    const targetDir = currentDirVector();

    // clone the target position so we don't mutate it!
    var targetPos = [...blockDirectionPositions[currentDir()]];

    // offset the target position to center of screen
    targetPos[0] += 0.5;
    targetPos[1] += 0.5;

    // if the position is some epsilon close to the target position, set the position to the target position
    if (Math.abs(state.battle.pos[0] - targetPos[0]) < 0.01 && Math.abs(state.battle.pos[1] - targetPos[1]) < 0.01) {
      state.battle.pos[0] = targetPos[0];
      state.battle.pos[1] = targetPos[1];
    } else {
      // otherwise, move the sword towards the target position
      state.battle.pos[0] += (targetPos[0] - state.battle.pos[0]) / 20;
      state.battle.pos[1] += (targetPos[1] - state.battle.pos[1]) / 20;
    }

    // if the direction is some epsilon close to the target direction, set the direction to the target direction
    if (Math.abs(state.battle.dir[0] - targetDir[0]) < 0.01 && Math.abs(state.battle.dir[1] - targetDir[1]) < 0.01) {
      state.battle.dir[0] = targetDir[0];
      state.battle.dir[1] = targetDir[1];
    } else {
      // otherwise, move the sword towards the target direction by rotating it
      const angle = Math.atan2(state.battle.dir[0], state.battle.dir[1]);
      const targetAngle = Math.atan2(targetDir[0], targetDir[1]);
      const newAngle = angle + (targetAngle - angle) / 20;
      state.battle.dir = [Math.sin(newAngle), Math.cos(newAngle)];
    }
  }

  // check for the escape key
  if (keyJustPressed['Escape']) {
    // set game mode to menu
    setGameMode(MENU);
  }

  // check for when the video ends, go back to menu
  if (state.gameMode === RECORDING && elements.player.getPlayerState() === YT.PlayerState.ENDED) {
    setGameMode(MENU);
  }
}


function drawAttackWarning() {
  const currentTime = elements.player.getCurrentTime();
  const ctx = elements.canvas.getContext('2d');

  // check for attack warning sound
  const soundAttack = getAttacksInInterval(state.battle.prevTime + ATTACK_WARNING_ADVANCE, currentTime + ATTACK_WARNING_ADVANCE);

  // TODO play warning sound

  const animAttacks = getAttacksInInterval(currentTime-ATTACK_WARNING_ADVANCE, currentTime);
  for (const attack of animAttacks) {
    // draw a white circle at the attack
    const attackPos = [...blockDirectionPositions[attack.direction]];
    // make attack pos a bit futher from the center
    attackPos[0] = attackPos[0] * 1.2;
    attackPos[1] = attackPos[1] * 1.2;

    // offset the attack position to center of screen
    attackPos[0] += 0.5;
    attackPos[1] += 0.5;

    const animTime = (currentTime - attack.time) / ATTACK_WARNING_ADVANCE;
    const opacity = Math.max(0, 1 - animTime);

    const attackX = elements.canvas.width * attackPos[0];
    const attackY = elements.canvas.height * (1 - attackPos[1]);
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
function drawCanvas() {
  const currentTime = elements.player.getCurrentTime();

  drawAttackWarning();

  var swordPos = state.battle.pos;
  var swordDir = state.battle.dir;
  var swordOutlineStrength = 0.0;

  // first, determine swordPos and swordDir from animation
  if (state.battle.anim.state !== NONE) {
    console.log("animating sword");
    const animProgressUncapped = (currentTime - state.battle.anim.startTime) / (state.battle.anim.endTime - state.battle.anim.startTime);
    const animProgress = Math.max(Math.min(1.0, animProgressUncapped), 0.0);
    swordPos = [
      state.battle.anim.startPos[0] + (state.battle.anim.endPos[0] - state.battle.anim.startPos[0]) * animProgress,
      state.battle.anim.startPos[1] + (state.battle.anim.endPos[1] - state.battle.anim.startPos[1]) * animProgress,
    ];

    const fastExponentialAnimProgress = Math.sqrt(Math.sqrt(animProgress));
    const currentAngle = state.battle.anim.startAngle + (state.battle.anim.endAngle - state.battle.anim.startAngle) * fastExponentialAnimProgress;
    swordDir = [Math.sin(currentAngle), Math.cos(currentAngle)];

    // sword outline is only visible during the parry window
    const parryWindowProportion = PARRY_WINDOW / (PARRY_WINDOW + PARRY_END_LAG);
    if (state.battle.anim.state === PARRYING && animProgress < parryWindowProportion) {
      swordOutlineStrength = animProgress / parryWindowProportion;
      swordOutlineStrength = 1.0 - swordOutlineStrength;
    }
  }


  // draw swordImage to the canvas at it's current position
  // center it on the xpos and ypos
  const topLeftX = elements.canvas.width * swordPos[0] - elements.swordImage.width / 2;
  // invert sword pos since it starts from the bottom of the screen
  const swordYPos = 1 - swordPos[1];
  const topLeftY = elements.canvas.height * swordYPos - elements.swordImage.height / 2;
  const swortOutlineX = topLeftX - (elements.swordRedOutline.width - elements.swordImage.width) / 2;
  const swordOutlineY = topLeftY - (elements.swordRedOutline.height - elements.swordImage.height) / 2;

  drawCenteredRotated(elements.swordRedOutline, swortOutlineX, swordOutlineY, Math.atan2(swordDir[0], swordDir[1]), swordOutlineStrength);
  drawCenteredRotated(elements.swordImage, topLeftX, topLeftY, Math.atan2(swordDir[0], swordDir[1]), 1.0);
}

function drawCenteredRotated(image, xpos, ypos, angle, alpha) {
  const ctx = elements.canvas.getContext('2d');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(xpos + image.width / 2, ypos + image.height / 2);
  ctx.rotate(angle);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  ctx.restore();
}


function setGameMode(mode) {
  // if the video is valid, load it
  if (state.level.video) {
    elements.player.loadVideoById(state.level.video);
    elements.player.pauseVideo();
  }

  // reset the sword state
  state.battle = initialBattleState;

  // if the new mode is menu, show the menu
  if  (mode === MENU) {
    elements.gameHUD.style.display = 'none';
    elements.floatingMenu.style.display = 'flex';
    // pause the video
    elements.player.pauseVideo();
    // show the export and play buttons if there is any recorded data
    if (state.level.attackData.length > 0) {
      elements.exportButton.style.display = 'block';
      elements.playButton.style.display = 'block';

      elements.playButton.textContent = `Play`;
      elements.exportButton.textContent = `Export`;
    } else {
      elements.exportButton.style.display = 'none';
      elements.playButton.style.display = 'none';
    }
  }
  // if the new mode is playing, show the game hud
  if (mode === PLAYING || mode === RECORDING) {
    // hide the floating menu
    elements.floatingMenu.style.display = 'none';

    var playbackRate = 1.0;
    if (mode === RECORDING) {
      // delete the current recorded attacks
      state.level.attackData = [];
      // set the playback rate to the recording speed
      playbackRate = Number(elements.recordSpeedInput.value);
    }
    elements.player.setPlaybackRate(playbackRate);

    elements.gameHUD.style.display = 'flex';
    elements.player.playVideo();
  }

  state.gameMode = mode;
}

function setCurrentVideo(videoId) {
  state.level.video = videoId;
}

// Function to play a YouTube video by extracting the video ID from the URL
function recordVideo(videoUrl) {
  const videoId = extractVideoID(videoUrl);
  if (videoId) {
    setCurrentVideo(videoId);
    // set recording to true
    setGameMode(RECORDING);
  } else {
      fadingAlert('Invalid YouTube URL');
  }
}

// Helper function to extract the video ID from a YouTube URL
function extractVideoID(url) {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}



// Initialize the game page on load
initializeGamePage();

console.log("Game script loaded and game page initialized.");
