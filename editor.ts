namespace Editor {
enum AttackDirection {
  UP, UP_RIGHT, RIGHT, DOWN_RIGHT, DOWN, DOWN_LEFT, LEFT, UP_LEFT, CENTER
}

type AttackData = {
  time: number,
  direction: AttackDirection,
  // currently unused attributes
  damage: number,
};
export type LevelData = {
  video: string | null,
  attackData: AttackData[],
  version: number
};


const FRAME_LENGTH = 0.05;

export class Editor {
  static defaults = {
    attackDamage: 0.1
  } as const;
  frameToAttack: Map<number, AttackData>;
  elements: Map<AttackData, HTMLElement>;
  selectedAttack: AttackData | null;
  player: YT.Player;
  playbackBar: HTMLElement;
  level: LevelData;

  constructor(player: YT.Player, playbackBar: HTMLElement, level: LevelData) {
    this.frameToAttack = new Map<number, AttackData>();
    this.elements = new Map<AttackData, HTMLElement>();
    this.selectedAttack = null;
    this.player = player;
    this.playbackBar = playbackBar;
    const minLength = document.querySelector("#recording-controls")!.clientWidth - 120;
    let nFrames = player.getDuration() * 40;
    let multiplier = Math.max(minLength / nFrames, 1);
    this.playbackBar.style.width = `${nFrames * multiplier}px`;
    this.level = level;
  }

  update(keyJustPressed: Set<string>, currentTargetDir: AttackDirection) {
    if (keyJustPressed.has(" ") || keyJustPressed.has("k")) {
      if (this.player.getPlayerState() == YT.PlayerState.PLAYING) {
        this.player.pauseVideo();
      } else {
        this.player.playVideo();
      }
    }
    if (keyJustPressed.has("ArrowLeft")) {
      this.seekForward(-1);
    }
    if (keyJustPressed.has("ArrowRight")) {
      this.seekForward(1);
    }
    if (keyJustPressed.has(",")) {
      this.seekForward(-0.05);
    }
    if (keyJustPressed.has(".")) {
      this.seekForward(0.05);
    }
    if (keyJustPressed.has("j")) {
      this.seekForward(-10);
    }
    if (keyJustPressed.has("l")) {
      this.seekForward(10);
    }
    if (keyJustPressed.has("Enter")) {
      this.createAttackAt(this.player.getCurrentTime(), currentTargetDir);
    }
    if (keyJustPressed.has("x")) {
      this.removeSelectedAttack();
    }
  }

  createAttackAt(timestamp: DOMHighResTimeStamp, targetDir: AttackDirection) {
    // Disallow overlapping attacks
    let existingAttack = this.frameToAttack.get(this.frameIndex(timestamp));
    if (existingAttack != null) {
      this.deleteAttack(existingAttack);
    }
    let newAttack = {
      time: timestamp,
      direction: targetDir,
      damage: Editor.defaults.attackDamage
    };
    this.addAttack(newAttack);
    this.selectAttack(newAttack);
  }

  selectAttackAt(timestamp: DOMHighResTimeStamp) {
    let existingAttack = this.frameToAttack.get(this.frameIndex(timestamp));
    if (existingAttack != null) {
      this.selectAttack(existingAttack);
    }
  }

  removeSelectedAttack() {
    if (this.selectedAttack != null) {
      this.deleteAttack(this.selectedAttack);
    }
  }

  seekForward(seconds: number) {
    this.playerSeekForward(seconds);
  }

  playerSeekForward(seconds: number) {
    let targetTime = Math.min(Math.max(this.player.getCurrentTime() + seconds, 0), this.player.getDuration() - 0.05 * seconds);
    this.player.seekTo(targetTime, true);
    this.selectAttackAt(targetTime);
    this.updatePlaybackPoint(this.player);
  }

  timeToPx(time: number) {
    return time / this.player.getDuration() * this.playbackBar.clientWidth;
  }

  private updatePlaybackPoint(player: YT.Player) {
    const playbackPoint = document.querySelector<HTMLElement>("#playback-point")!;
    playbackPoint.style.left = `${this.timeToPx(player.getCurrentTime())}px`;
    // playbackPoint.scrollIntoView();
  }

  private addAttack(attack: AttackData) {
    // Set up attack marker element
    const parentElement = document.querySelector<HTMLElement>("#playback-bar")!;
    const templateElement = document.querySelector<HTMLElement>(".attack-marker.template")!;
    let attackElement = <HTMLElement>templateElement.cloneNode(true); // Returns Node type by default
    attackElement.classList.remove("template");
    attackElement.style.left = `${this.timeToPx(attack.time)}px`;
    attackElement.style.setProperty('--height', `${25 + 15 * Math.random()}px`);
    attackElement.querySelector(".marker-handle")!.addEventListener("click", event => {
      if (this.selectedAttack != attack) {
        event.stopPropagation();
        this.selectAttack(attack);
      }
    });
    this.elements.set(attack, attackElement);
    // Insert attack chronologically
    let index = this.level.attackData.findIndex(a => attack.time < a.time);
    if (index == -1) {
      parentElement.insertBefore(attackElement, null);
      this.level.attackData.push(attack);
    } else {
      parentElement.insertBefore(attackElement, this.elements.get(this.level.attackData[index])!);
      this.level.attackData.splice(index, 0, attack);
    }
    this.frameToAttack.set(this.frameIndex(attack), attack);
  }

  private deleteAttack(attack: AttackData) {
    let frameIndex = this.frameIndex(attack);
    if (this.frameToAttack.get(frameIndex) == attack) {
      this.frameToAttack.delete(frameIndex);
    }
    this.elements.get(attack)!.remove();
    let index = this.level.attackData.indexOf(attack);
    this.level.attackData.splice(index, 1);
    if (this.selectedAttack == attack) {
      this.selectedAttack = null;
    }
  }

  private selectAttack(attack: AttackData | null) {
    this.selectedAttack = null;
    for (let element of this.elements.values()) {
      element.classList.remove("selected");
    }
    if (attack != null) {
      this.selectedAttack = attack;
      this.elements.get(attack)!.classList.add("selected");
      this.player.seekTo(attack.time, true);
    }
  }

  frameIndex(timestamp: DOMHighResTimeStamp): number;
  frameIndex(attack: AttackData): number;
  frameIndex(timeOrAttack: DOMHighResTimeStamp | AttackData) {
    if (typeof timeOrAttack == "number") {
      return Math.floor(timeOrAttack / FRAME_LENGTH);
    }
    return Math.floor(timeOrAttack.time / FRAME_LENGTH);
  }
}

}