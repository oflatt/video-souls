export class VideoPlayer {
  private player: YT.Player;
  private _prevTime: number = 0;
  private _currentTime: number = 0;

  constructor(player: YT.Player) {
    this.player = player;
  }

  getCurrentTime(): number {
    return this._currentTime;
  }

  getDuration(): number {
    return this.player.getDuration();
  }

  seekTo(inputs: number, allowSeekAhead: boolean): void {
    let seconds = Math.min(Math.max(inputs, 0), this.getDuration());
    this.player.seekTo(seconds, allowSeekAhead);
    this._prevTime = seconds; // Update previous time when seeking
    this._currentTime = seconds; // Update current time to match seek
  }

  loadVideoById(videoId: string, startSeconds?: number, suggestedQuality?: YT.SuggestedVideoQuality): void {
    this.player.loadVideoById(videoId, startSeconds, suggestedQuality);
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

  // Time management methods
  get prevTime(): number {
    return this._prevTime;
  }

  updateTime(): number {
    this._prevTime = this._currentTime;
    this._currentTime = this.player.getCurrentTime() ?? 0;
    const deltaTime = this._currentTime - this._prevTime;

    // ensure prevTime is less than or equal to currentTime
    if (this._prevTime > this._currentTime) {
      this._prevTime = this._currentTime;
    }

    // HACK: youtube player seeking is async, so for big jumps we want prevTime to track with currentTime
    if (Math.abs(deltaTime) > 0.15) {
      this._prevTime = this._currentTime;
    }

    return deltaTime;
  }
}
