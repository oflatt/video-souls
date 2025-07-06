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
}
