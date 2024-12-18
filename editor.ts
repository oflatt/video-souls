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
const PLAYBACK_BAR_PADDING = 20;

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
  playbackWrapper: HTMLElement;
  level: LevelData;
  zoom: number;
  attackDragged: AttackData | null;
  

  constructor(player: YT.Player, recordingControls: HTMLElement, playbackBar: HTMLElement, level: LevelData) {
    this.frameToAttack = new Map<number, AttackData>();
    this.elements = new Map<AttackData, HTMLElement>();
    this.selectedAttack = null;
    this.player = player;
    this.playbackBar = playbackBar;
    this.recordingControls = recordingControls;
    this.playbackWrapper = recordingControls.querySelector<HTMLElement>("#playback-bar-wrapper")!;
    this.level = level;
    this.zoom = 1.0;
    this.attackDragged = null;

    // now add all existing attacks to UI
    this.addAttacks();
  }

  mouseReleased(event: MouseEvent) {
    if (this.attackDragged != null) {
      // remove the attack
      this.deleteAttack(this.attackDragged);

      // add the attack back at the mouse position
      this.createAttackAtMousePosition(event.clientX, this.attackDragged.direction, this.attackDragged.damage);

      this.attackDragged = null;
    }
  }

  addAttacks() {
    for (let attack of this.level.attackData) {
      this.addAttackElement(attack);
    }
  }

  // update all the elements
  draw(mouseX: number, mouseY: number) {
    const clientWidth = this.recordingControls.clientWidth - PLAYBACK_BAR_PADDING*2;

    let duration = this.player.getDuration();
    let possibleW = this.timeToPx(duration);
    // if we are zoomed out too far, set zoom to a larger number
    if (possibleW < clientWidth && !Number.isNaN(duration) && duration != 0) {
      this.zoom = 1.0 / (duration / 60.0);
    }
    
    let finalW = this.timeToPx(duration);
    this.playbackBar.style.width = `${finalW}px`;

    // the recordins controls have a series of lines based on the zoom level using repeating linear gradient
    this.playbackWrapper = this.recordingControls.querySelector<HTMLElement>("#playback-bar-wrapper")!;
    // lines every 1 second
    let lineLength = 3;
    let lineSpacing = this.timeToPx(1.0)-lineLength;
    // make stripes- grey for lineLength, then transparent from lineLength to lineSpacing
    this.playbackWrapper.style.backgroundImage = `repeating-linear-gradient(to right, grey 0px, grey ${lineLength}px, transparent ${lineLength}px, transparent ${lineSpacing}px, grey ${lineSpacing}px)`;


    // update all of the attack elements positions
    for (let [attack, element] of this.elements) {
      // if this one is being dragged, follow mouse
      var left = this.timeToPx(attack.time);
      if (this.attackDragged == attack) {
        left = mouseX - this.playbackBar.getBoundingClientRect().left;
      }

      // offset by 60 since that's where the bar is
      element.style.left = `${left}px`;
      element.style.setProperty('--height', `50px`);
    }

    // update the playback point
    const playbackPoint = document.querySelector<HTMLElement>("#playback-point")!;
    const playbackPointLeft = this.timeToPx(this.player.getCurrentTime());
    playbackPoint.style.left = `${playbackPointLeft}px`;
  }

  timeToPx(time: number) {
    // Make the bar length proportional to client width and video duration
    const clientWidth = this.recordingControls.clientWidth - PLAYBACK_BAR_PADDING*2;
    // default 1 minute of content on screen
    let duration = time / 60.0;
    return (duration * clientWidth * this.zoom);
  }

  pxToTime(px: number) {
    const clientWidth = this.recordingControls.clientWidth - PLAYBACK_BAR_PADDING*2;
    return (px*60.0 / (clientWidth * this.zoom));
  }

  changeZoom(event: WheelEvent) {
    // grab the mouse position
    let mouseX = event.offsetX;
    let relativeX = mouseX - this.recordingControls.scrollLeft;
    // get the time at that position
    let time = this.pxToTime(mouseX);

    // now change the zoom level
    this.zoom += -event.deltaY / 1000;

    // now make the scroll such that the time is at the same position
    let positionNewCoordinates = this.timeToPx(time);
    let targetScroll = positionNewCoordinates - relativeX;
    this.recordingControls.scrollLeft = targetScroll;
  }

  changeScroll(event: WheelEvent) {
    this.recordingControls.scrollLeft += -event.deltaY / 5;
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
      this.createAttackAt(this.player.getCurrentTime(), currentTargetDir, Editor.defaults.attackDamage);
    }
    if (keyJustPressed.has("x")) {
      this.removeSelectedAttack();
    }
  }

  createAttackAtMousePosition(pos: number, targetDir: AttackDirection, damage: number) {
    let posRelative = pos - this.playbackBar.getBoundingClientRect().left;
    let time = this.pxToTime(posRelative);
    let newAttack = {
      time: time,
      direction: targetDir,
      damage: damage
    };
    this.createAttack(newAttack);
    this.selectAttack(newAttack);
  }

  createAttackAt(timestamp: DOMHighResTimeStamp, targetDir: AttackDirection, damage: number) {
    // Disallow overlapping attacks
    let existingAttack = this.frameToAttack.get(this.frameIndex(timestamp));
    if (existingAttack != null) {
      this.deleteAttack(existingAttack);
    }
    let newAttack = {
      time: timestamp,
      direction: targetDir,
      damage: damage
    };
    this.createAttack(newAttack);
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

  /// get a mouse event relative to the playback bar's coordinates
  playbackBarClicked(event: MouseEvent) {
    console.log("mousex", event.offsetX);
    // check the mouse event is left click
    if (event.button == 0) {
      let mouseX = event.offsetX;
      // convert the x position to a time
      let time = this.pxToTime(mouseX);
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
    const parentElement = this.playbackWrapper;
    const templateElement = document.querySelector<HTMLElement>(".attack-marker.template")!;
    let attackElement = <HTMLElement>templateElement.cloneNode(true); // Returns Node type by default
    attackElement.classList.remove("template");
    attackElement.querySelector(".marker-handle")!.addEventListener("mousedown", event => {
      event.stopPropagation();
      this.attackMouseDown(attack);
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
  
  private createAttack(attack: AttackData) {
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

  private attackMouseDown(attack: AttackData) {
    console.log("attackMouseDown", attack);
    this.selectAttack(attack);
    this.attackDragged = attack;
  }

  private selectAttack(attack: AttackData | null) {
    this.selectedAttack = null;
    for (let element of this.elements.values()) {
      element.classList.remove("selected");
    }
    if (attack != null) {
      this.selectedAttack = attack;
      this.elements.get(attack)!.classList.add("selected");
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