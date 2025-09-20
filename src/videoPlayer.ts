import { LevelDataV0 } from "./leveldata";
import { extractVideoID } from "./utils";

export class VideoPlayer {
  private player: YT.Player;
  private _prevTime: number = 0;
  private _currentTime: number = 0;
  private _seeking: boolean = false;
  private _beforeSeekTime: number = 0;

  constructor(player: YT.Player) {
    this.player = player;
  }

  getCurrentTime(): number {
    return this._currentTime;
  }

  getDuration(): number {
    return this.player.getDuration();
  }

  setLoop(loop: boolean): void {
    this.player.setLoop(loop);
  }

  setPlaylist(playlist: string[]): void {
    this.player.loadPlaylist(playlist);
  }

  seekTo(inputs: number, allowSeekAhead: boolean): void {
    this._seeking = true;
    this._beforeSeekTime = this._currentTime; // Store the time before seeking
    let seconds = Math.min(Math.max(inputs, 0), this.getDuration());
    this.player.seekTo(seconds, allowSeekAhead);
    this._prevTime = seconds; // Update previous time when seeking
    this._currentTime = seconds; // Update current time to match seek
  }

  loadVideoById(videoId: string, startSeconds?: number, suggestedQuality?: YT.SuggestedVideoQuality): void {
    this.player.loadVideoById(videoId, startSeconds, suggestedQuality);
  }

  cueVideoById(videoId: string): void {
    this.player.cueVideoById(videoId);
  }

  pauseVideo(): void {
    this.player.pauseVideo();
  }

  playVideo(): void {
    this.player.playVideo();
  }

  setPlaybackRate(suggestedRate: number): void {
    this.player.setPlaybackRate(suggestedRate);
  }

  getPlayerState(): YT.PlayerState {
    return this.player.getPlayerState();
  }

  getIframe(): HTMLIFrameElement {
    return this.player.getIframe();
  }

  getVideoId(): string | null {
    let url =  this.player.getVideoUrl();
    if (!url) return null;
    return extractVideoID(url);
  }

  // if the video is cued or buffering is the length valid?
  lengthValid(): boolean {
      return this.getPlayerState() == YT.PlayerState.PAUSED || this.getPlayerState() == YT.PlayerState.PLAYING;
  }

  readyForEditor(level: LevelDataV0): boolean {
    console.log("VideoPlayer readyForEditor check:", this.getPlayerState(), this.getVideoId(), level.video);
    return this.lengthValid() && this.getVideoId() === level.video
  }

  // Time management methods
  get prevTime(): number {
    return this._prevTime;
  }

  updateTime(): number {
    // HACK: if we are seeking, don't update unless the time has changed
    if (this._seeking) {
      if (Math.abs(this.player.getCurrentTime() - this._beforeSeekTime) < 0.15) {
        return 0; // No significant change, return 0
      } else {
        this._seeking = false; // Reset seeking state after significant change
      }
    }

    this._prevTime = this._currentTime;
    this._currentTime = this.player.getCurrentTime() ?? 0;
    const deltaTime = this._currentTime - this._prevTime;

    // ensure prevTime is less than or equal to currentTime
    if (this._prevTime > this._currentTime) {
      this._prevTime = this._currentTime;
    }

    return deltaTime;
  }
}
