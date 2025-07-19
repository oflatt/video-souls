export class AudioPlayer {
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

  setVolume(normalizedVolume: number) {
    // Set volume for all sound effects (assuming they are HTMLAudioElement)
    this.playerAttack.volume = normalizedVolume;
    this.enemyHit.volume = normalizedVolume;
    this.playerHit.volume = normalizedVolume;
    this.parrySound.volume = normalizedVolume;
    this.warnings.forEach(warning => warning.volume = normalizedVolume);
    // Add any other sound effects here
  }
}
