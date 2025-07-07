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

  seekTo(seconds: number, allowSeekAhead: boolean): void {
    this.player.seekTo(seconds, allowSeekAhead);
    this._prevTime = seconds; // Update previous time when seeking
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

  updateTime() {
    this._prevTime = this.getCurrentTime();
    this._currentTime = this.player.getCurrentTime() ?? 0;
  }
}
