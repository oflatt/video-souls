// main.js

const MENU = 'MENU';
const PLAYING = 'PLAYING';
const RECORDING = 'RECORDING';

// make a global state dictionary to store the game state
const state = {
  currentVideo: null,
  gameMode: MENU,
};


// keep all elements on the page in this dictionary
const elements = {
};


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
      #record-button {
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

  // add video souls title to floating menu on it's own line
  const videoSoulsTitle = document.createElement('h1');
  videoSoulsTitle.textContent = 'Video Souls';
  floatingMenu.appendChild(videoSoulsTitle);
  elements.videoSoulsTitle = videoSoulsTitle;


  // Create video URL input
  const videoUrlInput = document.createElement('input');
  videoUrlInput.id = 'video-url';
  videoUrlInput.type = 'text';
  videoUrlInput.placeholder = 'Enter YouTube video URL';
  elements.videoUrlInput = videoUrlInput;

  // Create play button
  const recordButton = document.createElement('button');
  recordButton.id = 'record-button';
  recordButton.textContent = 'Record Video Attacks';
  elements.playButton = recordButton;

  // Add elements to floating menu
  floatingMenu.appendChild(videoUrlInput);
  floatingMenu.appendChild(recordButton);

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

  // Add event listener to play button
  recordButton.addEventListener('click', () => {
      const videoUrl = videoUrlInput.value;
      if (videoUrl) {
          recordVideo(videoUrl);
      } else {
          alert('Please enter a valid YouTube URL.');
      }
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
  elements.currentTimeDebug.textContent = `Time: ${timeInMilliseconds} ms`;

  requestAnimationFrame(mainLoop); // Schedule the next update
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


  // if the new mode is menu, show the menu
  if (mode === MENU) {
    elements.floatingMenu.style.display = 'flex';
  }
  // if the new mode is playing, show the game hud
  if (mode === PLAYING) {
    elements.gameHUD.style.display = 'flex';
  }
  // if the new mode is recording, show the game hud
  if (mode === RECORDING) {
    elements.gameHUD.style.display = 'flex';
  }

  state.gameMode = mode;
}

// Function to play a YouTube video by extracting the video ID from the URL
function recordVideo(videoUrl) {
  const videoId = extractVideoID(videoUrl);
  if (videoId) {
      elements.player.loadVideoById(videoId);
      elements.player.setPlaybackRate(0.5); // Set playback speed to half
      // set recording to true
      setGameMode(RECORDING);
      // hide the floating menu
      elements.floatingMenu.style.display = 'none';
  } else {
      alert('Invalid YouTube URL');
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
