import { VideoSouls } from './videosouls';

// HACK to make typescript happy
declare const window: any;

// YouTube API will call this function when API is ready
window.onYouTubeIframeAPIReady = function () {
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