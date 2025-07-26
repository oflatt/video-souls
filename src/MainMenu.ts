import { Settings } from "./settings";
import { AudioPlayer } from "./audioPlayer";

export class MainMenu {
  settings: Settings;
  audio: AudioPlayer;

  constructor() {
    this.settings = Settings.load();
    this.audio = new AudioPlayer();
  }

  saveSettings() {
    this.settings.save();
  }

  getNormalizedVolume(): number {
    return this.settings.getNormalizedVolume();
  }

  getNormalizedSoundEffectVolume(): number {
    return this.settings.getNormalizedSoundEffectVolume();
  }
}
