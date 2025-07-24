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

  private cloneAndPlay(audio: HTMLAudioElement) {
    const sound = audio.cloneNode(true) as HTMLAudioElement;
    sound.volume = audio.volume;
    sound.play();
  }

  playWarningSound() {
    const sound = this.warnings[Math.floor(Math.random() * this.warnings.length)];
    this.cloneAndPlay(sound);
  }

  playEnemyHitSound() {
    this.cloneAndPlay(this.enemyHit);
  }

  playPlayerAttackSound() {
    this.cloneAndPlay(this.playerAttack);
  }

  playPlayerHitSound() {
    this.cloneAndPlay(this.playerHit);
  }

  playParrySound() {
    this.cloneAndPlay(this.parrySound);
  }

  setVolume(normalizedVolume: number) {
    // Ensure volume is finite and in [0, 1]
    const safeVolume = Number.isFinite(normalizedVolume) ? Math.max(0, Math.min(1, normalizedVolume)) : 1;
    this.playerAttack.volume = safeVolume;
    this.enemyHit.volume = safeVolume;
    this.playerHit.volume = safeVolume;
    this.parrySound.volume = safeVolume;
    this.warnings.forEach(warning => warning.volume = safeVolume);
    // Add any other sound effects here
  }
}
