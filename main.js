// main.js

const MENU = 'MENU';
const PLAYING = 'PLAYING';
const RECORDING = 'RECORDING';

// directions
const UP = 'UP';
const DOWN = 'DOWN';
const LEFT = 'LEFT';
const RIGHT = 'RIGHT';
const CENTER = 'CENTER';
const REST = 'REST';

const BLOCKING = 'BLOCKING';
const ATTACKING = 'ATTACKING';


const keyToDirection = {
  w: UP,
  a: LEFT,
  s: DOWN,
  d: RIGHT,
  space: CENTER,
};


// block direction angles
const blockDirectionVectors = {
  // point the sword left to block up
  UP: [-1, 0],
  // same for down
  DOWN: [-1, 0],
  // point the sword up to block left
  LEFT: [0, 1],
  // same for right
  RIGHT: [0, 1],
  CENTER: [0, 1],
  Rest: [0.5, 0.86602540378],
}

const blockDirectionPositions = {
  UP: [0.5, 0.7],
  DOWN: [0.5, 0.3],
  LEFT: [0.3, 0.5],
  RIGHT: [0.7, 0.5],
  CENTER: [0.5, 0.5],
}


// make a global state dictionary to store the game state
const state = {
  level: {
    // the id of the current video being played or recorded
    video: null,
    // a list of attack structs for the current video
    // each attack struct has a time and direction
    attackData: [],
  },
  gameMode: MENU,
  // sword coordinates and direction
  // coordinates are 0.0 to 1.0 with 0.0 being the bottom left and 1.0 being the top right
  // moving the sword requires a interpolation of the direction and position to the target
  sword: {
    pos: [0.5, 0.5],
    dir: [0, 1],
    state: BLOCKING,
    blockDir: REST,
    // readyAt encodes end lag for blocking or attacking
    // only after this time in the video can another input be made
    readyAt: 0,
  },
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


const BLOCK_END_LAG = 0.2;

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
      #video-url {
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
  recordButton.textContent = 'Record Video Attacks';
  elements.recordButton = recordButton;
  recordButton.style.marginBottom = '20px';

  // Create export button, hidden by default
  const exportButton = document.createElement('button');
  exportButton.id = 'export-button';
  exportButton.textContent = 'Export';
  elements.exportButton = exportButton;
  exportButton.style.display = 'none';
  exportButton.style.marginBottom = '20px';

  // Add elements to floating menu
  floatingMenu.appendChild(videoUrlInput);
  floatingMenu.appendChild(recordButton);
  floatingMenu.appendChild(exportButton);

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
    let new_canvas = document.createElement('canvas');
    let scale_factor = (0.15 * canvas.width) / swordImage.width;
    new_canvas.width = scale_factor * swordImage.width;
    new_canvas.height = scale_factor * swordImage.height;
    let new_ctx = new_canvas.getContext('2d');
    new_ctx.drawImage(swordImage, 0, 0, new_canvas.width, new_canvas.height);
    elements.swordImage = new_canvas;
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
    exportLevel();
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



// Function to export the level data to a link
// link in dev mode is local host
function exportLevel() {
  const link = `http://localhost:8000/?data=${encodeURIComponent(JSON.stringify(state.level))}`;
  // copy the link to the clipboard
  navigator.clipboard.writeText(link).then(() => {
    // TODO show a success message
  }).catch((error) => {
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

// Main loop of the game
function mainLoop(event) {
  // update debug text
  const timeInSeconds = elements.player.getCurrentTime();
  const timeInMilliseconds = Math.floor(timeInSeconds * 1000);
  elements.currentTimeDebug.textContent = `Time: ${timeInMilliseconds} ms data: ${state.level.attackData.length}`;

  // clear the canvas
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  // if the game mode is recording, record attacks based on button presses (WASD)
  if (state.gameMode == RECORDING) {
    // check key just pressed for each direction, adding to attack data
    if (keyJustPressed['w']) {
      state.level.attackData.push({ time: timeInMilliseconds, direction: UP });
    }
    if (keyJustPressed['s']) {
      state.level.attackData.push({ time: timeInMilliseconds, direction: DOWN });
    }
    if (keyJustPressed['a']) {
      state.level.attackData.push({ time: timeInMilliseconds, direction: LEFT });
    }
    if (keyJustPressed['d']) {
      state.level.attackData.push({ time: timeInMilliseconds, direction: RIGHT });
    }
  }

  if ((state.gameMode == PLAYING || state.gameMode == RECORDING) && timeInSeconds >= state.sword.readyAt) {
    // for each direction in keyToDirection, check if the key is just pressed
    // if it is, set the sword block direction to the corresponding direction
    // this starts it moving towards that position
    for (const key in keyToDirection) {
      if (keyJustPressed[key]) {
        state.sword.state = BLOCKING;
        state.sword.blockDir = keyToDirection[key];
        state.sword.readyAt = timeInSeconds + BLOCK_END_LAG;
      }
    }
  }

  // if the sword is blocking and the readyAt time has passed
  if (state.sword.state === BLOCKING && timeInSeconds >= state.sword.readyAt) {
    // set the sword state to resting
    state.sword.state = REST;
  }

  // if the sword is blocking, move it towards the block direction and position
  if (state.sword.state === BLOCKING) {
    const targetDir = blockDirectionVectors[state.sword.blockDir];
    const targetPos = blockDirectionPositions[state.sword.blockDir];

    // if the position is some epsilon close to the target position, set the position to the target position
    if (Math.abs(state.sword.pos[0] - targetPos[0]) < 0.01 && Math.abs(state.sword.pos[1] - targetPos[1]) < 0.01) {
      state.sword.pos[0] = targetPos[0];
      state.sword.pos[1] = targetPos[1];
    } else {
      // otherwise, move the sword towards the target position
      state.sword.pos[0] += (targetPos[0] - state.sword.pos[0]) / 20;
      state.sword.pos[1] += (targetPos[1] - state.sword.pos[1]) / 20;
    }

    // if the direction is some epsilon close to the target direction, set the direction to the target direction
    if (Math.abs(state.sword.dir[0] - targetDir[0]) < 0.01 && Math.abs(state.sword.dir[1] - targetDir[1]) < 0.01) {
      state.sword.dir[0] = targetDir[0];
      state.sword.dir[1] = targetDir[1];
    } else {
      // otherwise, move the sword towards the target direction by rotating it
      const angle = Math.atan2(state.sword.dir[0], state.sword.dir[1]);
      const targetAngle = Math.atan2(targetDir[0], targetDir[1]);
      const newAngle = angle + (targetAngle - angle) / 20;
      state.sword.dir = [Math.sin(newAngle), Math.cos(newAngle)];
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

  requestAnimationFrame(mainLoop); // Schedule the next update
}


// Draw the sword, health bars, ect to the canvas based on the data in state
function drawCanvas() {
  // draw swordImage to the canvas at it's current position
  // center it on the xpos and ypos
  const ctx = elements.canvas.getContext('2d');
  const topLeftX = elements.canvas.width * state.sword.pos[0] - elements.swordImage.width / 2;
  // invert sword pos since it starts from the bottom of the screen
  const swordYPos = 1 - state.sword.pos[1];
  const topLeftY = elements.canvas.height * swordYPos - elements.swordImage.height / 2;
  ctx.save();
  ctx.translate(topLeftX + elements.swordImage.width / 2, topLeftY + elements.swordImage.height / 2);
  ctx.rotate(Math.atan2(state.sword.dir[0], state.sword.dir[1]));
  ctx.drawImage(elements.swordImage, -elements.swordImage.width / 2, -elements.swordImage.height / 2);
  ctx.restore();
}


function setGameMode(mode) {
  // if the current mode is menu, hide the menu
  if (state.gameMode === MENU) {
    elements.floatingMenu.style.display = 'none';
  }
  // if the current mode is playing, hide the game hud
  if (state.gameMode === PLAYING) {
    elements.gameHUD.style.display = 'none';
  }
  // if the current mode is recording, hide the game hud
  if (state.gameMode === RECORDING) {
    elements.gameHUD.style.display = 'none';
  }

  // if the video is valid, load it
  if (state.level.video) {
    elements.player.loadVideoById(state.level.video);
    elements.player.pauseVideo();
  }

  // if the new mode is menu, show the menu
  if (mode === MENU) {
    elements.floatingMenu.style.display = 'flex';
    // pause the video
    elements.player.pauseVideo();
    // show the export and play buttons if there is any recorded data
    if (state.level.attackData.length > 0) {
      elements.exportButton.style.display = 'block';
      elements.playButton.style.display = 'block';

      // set the play button's text to "Play {title of youtube video}"
      const currentVideoName = elements.player.getVideoData().title;
      elements.playButton.textContent = `Play "${currentVideoName}"`;
      elements.exportButton.textContent = `Export "${currentVideoName}"`;
    } else {
      elements.exportButton.style.display = 'none';
      elements.playButton.style.display = 'none';
    }
  }
  // if the new mode is playing, show the game hud
  if (mode === PLAYING) {
    elements.gameHUD.style.display = 'flex';
    elements.player.playVideo();
  }
  // if the new mode is recording, show the game hud
  if (mode === RECORDING) {
    // delete the current recorded attacks
    state.level.attackData = [];
    elements.gameHUD.style.display = 'flex';
    elements.player.setPlaybackRate(0.5); // Set playback speed to half
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
