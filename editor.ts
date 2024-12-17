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
  recordingControls: HTMLElement;
  level: LevelData;
  zoom: number;
  elementDragged: HTMLElement | null;
  

  constructor(player: YT.Player, recordingControls: HTMLElement, playbackBar: HTMLElement, level: LevelData) {
    this.frameToAttack = new Map<number, AttackData>();
    this.elements = new Map<AttackData, HTMLElement>();
    this.selectedAttack = null;
    this.player = player;
    this.playbackBar = playbackBar;
    this.recordingControls = recordingControls;
    this.level = level;
    this.zoom = 1.0;
    this.elementDragged = null;

    // now add all existing attacks to UI
    this.addAttacks();
  }

  mouseReleased(_event: MouseEvent) {

  }

  addAttacks() {
    for (let attack of this.level.attackData) {
      this.addAttackElement(attack);
    }
  }

  // update all the elements
  draw() {
    const scroll = this.recordingControls.scrollLeft;
    const clientWidth = document.querySelector("#record-hud")!.clientWidth - 120;

    // make the outer container the right size
    this.recordingControls.style.width = `${clientWidth+20}px`;
    // make the recordins controls have a series of lines based on the zoom level using repeating linear gradient
    this.recordingControls.style.backgroundImage = `repeating-linear-gradient(#ccc 0 1px, transparent 1px 100%)`;
    this.recordingControls.style.backgroundSize = `${this.timeToPx(5, 0)}px 100%`;


    let duration = this.player.getDuration();
    let possibleW = this.timeToPx(duration, 0.0);
    // if we are zoomed out too far, set zoom to a larger number
    if (possibleW < clientWidth && (this.player.getPlayerState() == YT.PlayerState.PLAYING || this.player.getPlayerState() == YT.PlayerState.PAUSED)) {
      this.zoom = 1.0 / (duration / 60.0);
    }
    
    let finalW = this.timeToPx(duration, 0.0);
    this.playbackBar.style.width = `${finalW}px`;

    // update all of the attack elements positions
    for (let [attack, element] of this.elements) {
      let elementWidth = element.clientWidth;
      // based on the zoom level and clientWidth, position this attack
      let left = this.timeToPx(attack.time, scroll) + elementWidth / 2;
      // offset by 60 since that's where the bar is
      element.style.left = `${left}px`;
      element.style.setProperty('--height', `50px`);
    }

    // update the playback point
    const playbackPoint = document.querySelector<HTMLElement>("#playback-point")!;
    const playbackPointWidth = playbackPoint.clientWidth;
    const playbackPointLeft = this.timeToPx(this.player.getCurrentTime(), scroll) + playbackPointWidth / 2;
    playbackPoint.style.left = `${playbackPointLeft}px`;
  }

  timeToPx(time: number, scroll: number) {
    // Make the bar length proportional to client width and video duration
    const clientWidth = document.querySelector("#record-hud")!.clientWidth - 120;
    // default 1 minute of content on screen
    let duration = time / 60.0;
    // 10 px left padding to account for
    if (scroll > 0) {
      scroll = scroll - 10;
    }
    return (duration * clientWidth * this.zoom) - scroll;
  }

  pxToTime(px: number, scroll: number) {
    const clientWidth = document.querySelector("#record-hud")!.clientWidth - 120;
    if (scroll > 0) {
      scroll = scroll - 10;
    }
    return (px + scroll)*60.0 / (clientWidth * this.zoom);
  }

  changeZoom(amount: number) {
    // first grab the current scroll time
    let scroll = this.recordingControls.scrollLeft;
    let scrollTime = this.pxToTime(scroll, 0);
    this.zoom += amount;
    // set the scroll time to the same position
    this.recordingControls.scrollLeft = this.timeToPx(scrollTime, 0);
  }


  

  update(keyJustPressed: Set<string>, currentTargetDir: AttackDirection) {
    if (keyJustPressed.has(" ")) {
      if (this.player.getPlayerState() == YT.PlayerState.PLAYING) {
        this.player.pauseVideo();
      } else {
        this.player.playVideo();
      }
    }
    if (keyJustPressed.has("ArrowLeft")) {
      this.seekForward(-10);
    }
    if (keyJustPressed.has("ArrowRight")) {
      this.seekForward(10);
    }
    if (keyJustPressed.has("m")) {
      this.seekForward(-0.05);
    }
    if (keyJustPressed.has(".")) {
      this.seekForward(0.05);
    }
    if (keyJustPressed.has("j")) {
      this.seekForward(-0.5);
    }
    if (keyJustPressed.has("l")) {
      this.seekForward(0.5);
    }
    if (keyJustPressed.has("Enter") || keyJustPressed.has("k")) {
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

  selectAttackAt(timestamp: number) {
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

  playbackBarClicked(event: MouseEvent) {
    // check the mouse event is left click
    if (event.button == 0) {
      // get the scroll of the recording controls
      let scroll = this.recordingControls.scrollLeft;

      // get the x position of the click relative to the playback bar
      let mouseX = event.clientX - this.playbackBar.getBoundingClientRect().left;

      // convert the x position to a time
      let time = this.pxToTime(mouseX, scroll);
      // seek to that time
      this.seek(time);
    }
  }

  seek(seconds: number) {
    let targetTime = Math.min(Math.max(seconds, 0), this.player.getDuration());
    this.player.seekTo(targetTime, true);
    this.selectAttackAt(targetTime);
  }

  seekForward(seconds: number) {
    let targetTime = Math.min(Math.max(this.player.getCurrentTime() + seconds, 0), this.player.getDuration() - 0.05 * seconds);
    this.player.seekTo(targetTime, true);
    this.selectAttackAt(targetTime);
  }

  private addAttackElement(attack: AttackData) {
    // Set up attack marker element
    const parentElement = document.querySelector<HTMLElement>("#playback-bar")!;
    const templateElement = document.querySelector<HTMLElement>(".attack-marker.template")!;
    let attackElement = <HTMLElement>templateElement.cloneNode(true); // Returns Node type by default
    attackElement.classList.remove("template");
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
    } else {
      parentElement.insertBefore(attackElement, this.elements.get(this.level.attackData[index])!);
    }
    this.frameToAttack.set(this.frameIndex(attack), attack);
  }
  
  private addAttack(attack: AttackData) {
    // Insert attack chronologically
    let index = this.level.attackData.findIndex(a => attack.time < a.time);
    if (index == -1) {
      this.level.attackData.push(attack);
    } else {
      this.level.attackData.splice(index, 0, attack);
    }
    this.addAttackElement(attack);
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

  frameIndex(timestamp: number): number;
  frameIndex(attack: AttackData): number;
  frameIndex(timeOrAttack: number | AttackData) {
    if (typeof timeOrAttack == "number") {
      return Math.floor(timeOrAttack / FRAME_LENGTH);
    }
    return Math.floor(timeOrAttack.time / FRAME_LENGTH);
  }
}

}