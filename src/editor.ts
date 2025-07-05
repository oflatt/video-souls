import typia from "typia";

import { Graphics } from './graphics';


enum AttackDirection {
  UP, UP_RIGHT, RIGHT, DOWN_RIGHT, DOWN, DOWN_LEFT, LEFT, UP_LEFT, CENTER
}

type AttackInterval = {
  start: number,
  end: number,
  name: string
};

// Input interface for the attack schedule function
type BossState = {
  // Boss health as a percentage (0.0 to 1.0)
  healthPercentage: number;
  // Current attack interval the boss is in (null if not in any interval)
  currentInterval: string;
  // Current video playback time in seconds
  currentTime: number;
  // Time elapsed since the current interval started (0 if not in interval)
  intervalElapsedTime: number;
  // Player health as a percentage (0.0 to 1.0)
  playerHealthPercentage: number;
  // TODO add information about the player to allow smarter AI? Like if they are attacking or not
  // Map from interval name to interval data
  availableIntervals: Map<string, AttackInterval>;
};

// Output interface for controlling boss behavior
type BossScheduleResult = {
  // Whether to continue with the current behavior
  continueNormal: boolean;
  // If not continuing normal, transition to this interval immediately
  transitionToInterval?: string; // interval name
  // Optional: offset into the interval to start at
  intervalOffset?: number;
};

// Type definition for the attack schedule function
type AttackScheduleFunction = (state: BossState) => BossScheduleResult;

const DEFAULT_ATTACK_SCHEDULE = `function(state) {
  // Default attack schedule: pick random intervals after the first one
  
  // If we're in the intro interval, continue normally
  if (state.currentInterval === "intro") {
    return { continueNormal: true };
  }
  
  // If we're in the death interval, continue normally
  if (state.currentInterval === "death") {
    return { continueNormal: true };
  }
  
  // Get all non-special intervals (not intro/death)
  var attackIntervals = [];
  var availableIntervals = state.availableIntervals;
  // Convert Map to array for easier handling in interpreter
  var intervalNames = [];
  availableIntervals.forEach(function(interval, name) {
    if (name !== "intro" && name !== "death") {
      intervalNames.push(name);
    }
  });
  
  // If no attack intervals available, go to death immediately
  if (intervalNames.length === 0) {
    return {
      continueNormal: false,
      transitionToInterval: "death",
      intervalOffset: 0
    };
  }
  
  // If we're not in any interval, start with intro
  if (!state.currentInterval || state.currentInterval === "") {
    return {
      continueNormal: false,
      transitionToInterval: "intro",
      intervalOffset: 0
    };
  }
  
  // Get current interval from available intervals
  var currentInterval = availableIntervals.get(state.currentInterval);
  if (currentInterval) {
    var intervalDuration = currentInterval.end - currentInterval.start;
    var progressRatio = state.intervalElapsedTime / intervalDuration;
    
    // Near the end of current interval (90% through), transition
    if (progressRatio >= 0.9) {
      // For simplicity, just continue for now
      // In a real implementation, you'd pick a random next interval
      return { continueNormal: true };
    }
  }
  
  // Otherwise continue with current behavior
  return { continueNormal: true };
}`;

type AttackData = {
  time: number,
  direction: AttackDirection,
  // currently unused attributes
  damage: number,
};

export function levelDataFromVideo(videoId: string): LevelDataV0 {
  const level = new LevelDataV0();
  level.video = videoId;
  return level;
}

export class LevelDataV0 {
  video: string | null;
  attackData: AttackData[];
  attackIntervals: Map<string, AttackInterval>;
  // JavaScript string that evaluates to a function controlling boss AI behavior
  // The function should have signature: (state: BossState) => BossScheduleResult
  attackSchedule: String;
  // version number for backwards compatibility, list changes here
  version: String;

  constructor() {
    this.video = null;
    this.attackData = [];
    this.attackIntervals = new Map<string, AttackInterval>();
    this.attackSchedule = DEFAULT_ATTACK_SCHEDULE;
    this.version = "0.0.0";
  }
};


const FRAME_LENGTH = 0.05;
const PLAYBACK_BAR_PADDING = 20;


class IntervalElements {
  startElement: HTMLElement;
  endElement: HTMLElement;
  nameElement: HTMLElement;

  constructor(startElement: HTMLElement, endElement: HTMLElement, nameElement: HTMLElement) {
    this.startElement = startElement;
    this.endElement = endElement;
    this.nameElement = nameElement;
  }
}

class DraggedInterval {
  interval: AttackInterval;
  isStart: boolean;
  ty: "interval";

  constructor(interval: AttackInterval, isStart: boolean) {
    this.interval = interval;
    this.isStart = isStart;
    this.ty = "interval";
  } 
}

class DraggedAttack {
  attack: AttackData;
  ty: "attack";

  constructor(attack: AttackData) {
    this.attack = attack;
    this.ty = "attack";
  }
}

export class Editor {
  static defaults = {
    attackDamage: 0.1
  } as const;
  frameToAttack: Map<number, AttackData>;
  elements: Map<AttackData, HTMLElement>;
  intervalElements: Map<AttackInterval, IntervalElements>;
  selected: DraggedAttack | null | DraggedInterval;
  player: YT.Player;
  playbackBar: HTMLElement;
  recordingControls: HTMLElement;
  playbackWrapper: HTMLElement;
  level: LevelDataV0;
  zoom: number;
  dragged: DraggedAttack | null | DraggedInterval;
  freshName: number;
  graphics: Graphics;

  constructor(player: YT.Player, recordingControls: HTMLElement, playbackBar: HTMLElement, level: LevelDataV0, graphics: Graphics) {
    this.graphics = graphics;
    this.frameToAttack = new Map<number, AttackData>();
    this.elements = new Map<AttackData, HTMLElement>();
    this.intervalElements = new Map<AttackInterval, IntervalElements>();
    this.selected = null;
    this.player = player;
    this.playbackBar = playbackBar;
    this.recordingControls = recordingControls;
    this.playbackWrapper = recordingControls.querySelector<HTMLElement>("#playback-bar-wrapper")!;
    this.level = level;
    this.zoom = 1.0;
    this.dragged = null;
    // find a number greater than all the existing ones to avoid name collisions
    this.freshName = 0;
    for (let [name, interval] of this.level.attackIntervals) {
      let stringNum = parseInt(name);
      if (!isNaN(stringNum) && stringNum >= this.freshName) {
        this.freshName = stringNum + 1;
      }
    }

    // now add all existing attacks to UI
    this.addAttacks();
  }

  mouseReleased(event: MouseEvent) {
    console.log("dragged: ", this.dragged);
    if (this.dragged != null) {
      // TODO evil hack with constructor name
      if (this.dragged.ty == "attack") {
        this.dragged = <DraggedAttack>this.dragged;
        // remove the attack
        this.deleteAttack(this.dragged.attack);

        // add the attack back at the mouse position
        this.createAttackAtMousePosition(event.clientX, this.dragged.attack.direction, this.dragged.attack.damage);

        this.dragged = null;
      } else if (this.dragged.constructor.name == "DraggedInterval") {
        this.dragged = <DraggedInterval>this.dragged;
        // remove the interval
        this.deleteInterval(this.dragged.interval);

        var newInterval: AttackInterval = {
          start: 0,
          end: 0,
          name: this.dragged.interval.name
        };
        newInterval.start = this.dragged.interval.start;
        newInterval.end = this.dragged.interval.end;
        if (this.dragged.isStart) {
          newInterval.start = this.pxToTime(event.clientX - this.playbackBar.getBoundingClientRect().left);
          // make sure the end is after or equal to the start
          if (newInterval.end < newInterval.start) {
            newInterval.end = newInterval.start;
          }
        } else {
          newInterval.end = this.pxToTime(event.clientX - this.playbackBar.getBoundingClientRect().left);
          // make sure the start is before or eqaual to the end
          if (newInterval.start > newInterval.end) {
            newInterval.start = newInterval.end;
          }
        }

        this.createInterval(newInterval);
        // select the new interval at the same endpoint
        this.selectInterval(newInterval, this.dragged.isStart);
        this.dragged = null;
      }
    }
  }

  addAttacks() {
    for (let attack of this.level.attackData) {
      this.addAttackElement(attack);
    }

    for (let [name, interval] of this.level.attackIntervals) {
      this.addIntervalElements(interval);
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
      if (this.dragged != null && this.dragged.ty == "attack") {
        if (this.dragged.attack == attack) {
          left = mouseX - this.playbackBar.getBoundingClientRect().left;
        }
      }

      element.style.left = `${left}px`;
      element.style.setProperty('--height', `50px`);
    }

    // update all the interval elements positions
    for (let [interval, elements] of this.intervalElements) {
      var startLeft = this.timeToPx(interval.start);
      var endLeft = this.timeToPx(interval.end);
      if (this.dragged != null && this.dragged.constructor.name == "DraggedInterval") {
        this.dragged = <DraggedInterval>this.dragged;
        if (this.dragged.interval == interval) {
          if (this.dragged.isStart) {
            startLeft = mouseX - this.playbackBar.getBoundingClientRect().left;
          } else {
            endLeft = mouseX - this.playbackBar.getBoundingClientRect().left;
          }
        }
      }

      elements.startElement.style.left = `${startLeft}px`;
      elements.endElement.style.left = `${endLeft}px`;
      elements.nameElement.style.left = `${(startLeft + endLeft) / 2}px`;
      elements.nameElement.style.width = (interval.name.length + 2) + "ch";
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
  

  update(keyJustPressed: Set<string>, currentTargetDir: AttackDirection, mouseX: number) {
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
    if (keyJustPressed.has("i")) {
      this.createIntervalAt(this.player.getCurrentTime());
    }
    if (keyJustPressed.has("x") || keyJustPressed.has("Backspace") || keyJustPressed.has("Delete")) {
      this.removeSelected();
    }


    // if an attack is being dragged, seek to mouse cursor
    if (this.dragged != null) {
      let posRelative = mouseX - this.playbackBar.getBoundingClientRect().left;
      let time = this.pxToTime(posRelative);
      this.seek(time);
    }

    // now check if there is a "death" attack interval, if not, add one
    var deathInterval = this.level.attackIntervals.get("death");
    var introInterval = this.level.attackIntervals.get("intro");
    var hasNonSpecialInterval = false;
    for (let [name, interval] of this.level.attackIntervals) {
      if (name !== "death" && name !== "intro") {
        hasNonSpecialInterval = true;
        break;
      }
    }
    
    let playerReady = (this.player.getPlayerState() == YT.PlayerState.PAUSED || this.player.getPlayerState() == YT.PlayerState.PLAYING);

    // check the state of the player so duration is valid
    if (!deathInterval && playerReady) {
      let startTime = Math.max(this.player.getDuration() - 2, 0);
      let endTime = this.player.getDuration();
      let newDeathInterval = {
        start: startTime,
        end: endTime,
        name: "death"
      };
      this.createInterval(newDeathInterval);
    }
    
    if (!introInterval && playerReady) {
      let startTime = 0;
      let endTime = Math.min(2, this.player.getDuration());
      let newIntroInterval = {
        start: startTime,
        end: endTime,
        name: "intro"
      };
      this.createInterval(newIntroInterval);
    }

    // if there's no non-special intervals, add a default one
    if (!hasNonSpecialInterval && playerReady) {
      let startTime = Math.min(2, this.player.getDuration());
      let endTime = Math.max(this.player.getDuration() - 2, startTime + 1);
      let defaultInterval = {
        start: startTime,
        end: endTime,
        name: this.freshName.toString()
      };
      this.freshName += 1;
      this.createInterval(defaultInterval);
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

  createIntervalAt(timestamp: DOMHighResTimeStamp) {
    let endTime = Math.min(timestamp + 2, this.player.getDuration());
    // if the end time is the same as the start time, don't create
    if (endTime == timestamp) {
      return;
    }
    
    let newInterval = {
      start: timestamp,
      end: endTime,
      name: this.freshName.toString()
    };
    this.freshName += 1;

    this.createInterval(newInterval);
  }

  selectAttackAt(timestamp: number) {
    let existingAttack = this.frameToAttack.get(this.frameIndex(timestamp));
    if (existingAttack != null) {
      this.selectAttack(existingAttack);
    }
  }

  removeSelected() {
    console.log("selected to remove: ", this.selected);
    if (this.selected != null) {
      if (this.selected.ty == "attack") {
        this.deleteAttack(this.selected.attack);
      } else if (this.selected.ty == "interval") {
        this.deleteInterval(this.selected.interval);
      }
    }
  }

  /// get a mouse event relative to the playback bar's coordinates
  playbackBarClicked(event: MouseEvent) {
    // check the mouse event is left click
    if (event.button == 0) {
      let mouseX = event.offsetX;
      // convert the x position to a time
      let time = this.pxToTime(mouseX);
      // deselect the current attack
      this.selectAttack(null);
      // seek to that time
      this.seek(time);
    }
  }

  seek(seconds: number) {
    let targetTime = Math.min(Math.max(seconds, 0), this.player.getDuration());
    this.player.seekTo(targetTime, true);
  }

  seekForward(seconds: number) {
    let targetTime = Math.min(Math.max(this.player.getCurrentTime() + seconds, 0), this.player.getDuration() - 0.05 * seconds);
    this.player.seekTo(targetTime, true);
  }

  private addIntervalElements(interval: AttackInterval) {   
    const parentElement = this.playbackWrapper;
    let startElement = document.createElement("div");
    startElement.classList.add("interval-start");
    let endElement = document.createElement("div");
    endElement.classList.add("interval-end");

    // text input for name
    let nameElement = document.createElement("input");
    nameElement.type = "text";
    nameElement.value = interval.name;
    // make it not editable for now
    nameElement.readOnly = true;
    nameElement.classList.add("interval-name");

    let elements = new IntervalElements(startElement, endElement, nameElement);

    this.intervalElements.set(interval, elements);

    startElement.addEventListener("mousedown", event => {
      event.stopPropagation();
      this.intervalMouseDown(interval, true);
    });
    endElement.addEventListener("mousedown", event => {
      event.stopPropagation();
      this.intervalMouseDown(interval, false);
    });

    parentElement.appendChild(startElement);
    parentElement.appendChild(endElement);
    parentElement.appendChild(nameElement);
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

    // now add an arrow image to the attack element based on the direction of the attack
    let arrowImg = this.graphics.arrowSprite;
    let arrowSize = 50;
    let arrowDir = attack.direction;
    let arrowCanvas = document.createElement("canvas");
    arrowCanvas.width = arrowSize;
    arrowCanvas.height = arrowSize;
    let arrowCtx = arrowCanvas.getContext("2d")!;
    arrowCtx.translate(arrowSize/2, arrowSize/2);
    arrowCtx.rotate((Math.PI/4) * attack.direction);
    arrowCtx.drawImage(arrowImg, -arrowSize/2, -arrowSize/2, arrowSize, arrowSize);
    // now add the canvas to the attack element in the right position
    let arrowElement = document.createElement("div");
    arrowElement.appendChild(arrowCanvas);
    arrowElement.style.position = "absolute";
    let pos_vector: [number, number] = [0, 30];
    // rotate pos_vector clockwise by attack data direction
    let angle = (Math.PI/4) * attack.direction;
    let rotated_vector = roatate_vec2(pos_vector, angle);
    let left = -arrowSize/2 + rotated_vector[0];
    let top = -arrowSize/2 + rotated_vector[1];
    arrowElement.style.left = `${left}px`;
    arrowElement.style.bottom = `calc(var(--height) + ${top}px)`;

    attackElement.appendChild(arrowElement);
  }

  private createInterval(interval: AttackInterval) {
    // Check if any intervals have overlapping times
    let existingInterval: AttackInterval | undefined;
    for (let [name, otherInterval] of this.level.attackIntervals) {
      if (interval.start == otherInterval.start || interval.end == otherInterval.end) {
        existingInterval = otherInterval;
        break;
      }
    }
    if (existingInterval !== undefined) {
      return;
    }

    // add interval to the map
    this.level.attackIntervals.set(interval.name, interval);

    // add the interval elements
    this.addIntervalElements(interval);
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

  private deleteInterval(interval: AttackInterval) {
    this.intervalElements.get(interval)!.startElement.remove();
    this.intervalElements.get(interval)!.endElement.remove();
    this.intervalElements.get(interval)!.nameElement.remove();
    this.intervalElements.delete(interval);
    this.level.attackIntervals.delete(interval.name);
    if (this.selected != null && this.selected.ty == "interval" && this.selected.interval == interval) {
      this.selected = null;
    }
  }

  private deleteAttack(attack: AttackData) {
    let frameIndex = this.frameIndex(attack);
    if (this.frameToAttack.get(frameIndex) == attack) {
      this.frameToAttack.delete(frameIndex);
    }
    this.elements.get(attack)!.remove();
    let index = this.level.attackData.indexOf(attack);
    this.level.attackData.splice(index, 1);
    if (this.selected != null && this.selected.ty == "attack" && this.selected.attack == attack) {
      this.selected = null;
    }
  }

  private attackMouseDown(attack: AttackData) {
    this.selectAttack(attack);
    this.dragged = new DraggedAttack(attack);
  }

  private intervalMouseDown(interval: AttackInterval, isStart: boolean) {
    this.selectInterval(interval, isStart);
    this.dragged = new DraggedInterval(interval, isStart);
  }

  private clearSelectClass() {
    for (let elements of this.intervalElements.values()) {
      elements.startElement.classList.remove("selected");
      elements.endElement.classList.remove("selected");
      elements.nameElement.classList.remove("selected");
    }
    for (let attackElement of this.elements.values()) {
      attackElement.classList.remove("selected");
    }
  }

  private selectInterval(interval: AttackInterval, isStart: boolean) {
    this.selected = null;
    this.clearSelectClass();
    if (interval != null) {
      this.selected = new DraggedInterval(interval, isStart);
      this.intervalElements.get(interval)!.startElement.classList.add("selected");
      this.intervalElements.get(interval)!.endElement.classList.add("selected");
      this.intervalElements.get(interval)!.nameElement.classList.add("selected");
      if (isStart) {
        this.seek(interval.start);
      } else {
        this.seek(interval.end);
      }
    }
  }

  private selectAttack(attack: AttackData | null) {
    this.selected = null;
    this.clearSelectClass();
    if (attack != null) {
      this.selected = new DraggedAttack(attack);
      this.elements.get(attack)!.classList.add("selected");
      this.seek(attack.time);
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

// rotate a vector by radians, clockwise
function roatate_vec2(vec: [number, number], clockwise_angle: number): [number, number] {
  let angle = -clockwise_angle;
  let x = vec[0];
  let y = vec[1];
  let rotated_x = x * Math.cos(angle) - y * Math.sin(angle);
  let rotated_y = x * Math.sin(angle) + y * Math.cos(angle);
  return [rotated_x, rotated_y];
}



// Returns null if the level data is valid, otherwise returns an error message
export function validateLevelData(levelData: unknown): null | string {
  // check that it's an object
  if (typeof levelData !== "object" || levelData === null) {
    return "Expected an object";
  }

  // check that it has a version field
  if (!("version" in levelData)) {
    return "Expected a version field";
  }

  // check that the version number is "0.0.0"
  if (levelData.version !== "0.0.0") {
    return "Expected version number to be 0.0.0";
  }


  const res = typia.validate<LevelDataV0>(levelData);
  if (res.success) {
    return null;
  } else {
    return res.errors.map(function (error) {
      return `Error at ${error.path}: expected ${error.expected} but got ${error.value}`;
    }).join("\n");
  }
}

export type { AttackInterval, BossState, BossScheduleResult, AttackScheduleFunction };