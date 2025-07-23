import typia from "typia";

import { Graphics } from './graphics';
import { DEFAULT_ATTACK_SCHEDULE } from './attackSchedule';
import { VideoPlayer } from './videoPlayer';
import {
  LevelDataV0,
  AttackInterval,
  BossState,
  BossScheduleResult,
  AttackData,
  AttackDirection,
  CriticalData // <-- import CriticalData
} from './leveldata';
import { EditorHud } from './editorHud';
import { drawArrow, drawCritical } from './battleRenderer'; // <-- update import
import { graphics } from './videosouls'; // <-- import global graphics

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

class DraggedCritical {
  critical: CriticalData;
  ty: "critical";
  constructor(critical: CriticalData) {
    this.critical = critical;
    this.ty = "critical";
  }
}

function attackDataEquals(a: AttackData, b: AttackData): boolean {
  return a.time === b.time &&
    a.direction === b.direction &&
    a.damage === b.damage;
}

function criticalDataEquals(a: CriticalData, b: CriticalData): boolean {
  return a.time === b.time &&
    a.direction === b.direction &&
    a.multiplier === b.multiplier;
}

export class Editor {
  static defaults = {
    attackDamage: 0.1,
    minAttackDistance: 0.1  // minimum seconds between attacks
  } as const;
  frameToAttack: Map<number, AttackData>;
  elements: Map<AttackData, HTMLElement>;
  intervalElements: Map<AttackInterval, IntervalElements>;
  criticalElements: Map<CriticalData, HTMLElement>;
  selected: DraggedAttack | null | DraggedInterval | DraggedCritical;
  playbackBar: HTMLElement;
  recordingControls: HTMLElement;
  playbackWrapper: HTMLElement;
  level: LevelDataV0;
  zoom: number;
  dragged: DraggedAttack | null | DraggedInterval | DraggedCritical;
  freshName: number;
  controlsInfoToggle: HTMLButtonElement | null = null;
  controlsInfoPanel: HTMLElement | null = null;
  controlsInfoVisible: boolean = true;
  hud: EditorHud;
  hudElement: HTMLElement; // <-- Store the HUD element
  videoPlayer: VideoPlayer;

  constructor(level: LevelDataV0, _graphics: Graphics, videoPlayer: VideoPlayer) {
    this.videoPlayer = videoPlayer;
    this.frameToAttack = new Map<number, AttackData>();
    this.elements = new Map<AttackData, HTMLElement>();
    this.intervalElements = new Map<AttackInterval, IntervalElements>();
    this.criticalElements = new Map<CriticalData, HTMLElement>();
    this.selected = null;
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

    // Clone HUD template and insert into DOM
    const template = document.getElementById("record-hud-template") as HTMLTemplateElement;
    if (!template || !template.content) throw new Error("Missing record-hud-template");
    const hudFragment = template.content.cloneNode(true) as DocumentFragment;
    // Find the record-hud element inside the fragment
    const hudClone = hudFragment.querySelector<HTMLElement>("#record-hud")!;
    document.body.appendChild(hudClone);
    this.hudElement = hudClone;

    // --- Add back to menu button handler ---
    const exitBtn = hudClone.querySelector<HTMLButtonElement>("#editor-exit-to-menu-button");
    if (exitBtn) {
      exitBtn.id = "exit-to-menu-button"; // <-- unify id
      exitBtn.className = "exit-to-menu-button"; // <-- unify class
      exitBtn.textContent = "Exit to Menu"; // <-- unify label
      exitBtn.style.display = "block";
      exitBtn.onclick = () => {
        // Dispatch a custom event to notify main app to go back to menu
        window.dispatchEvent(new CustomEvent("editor-back-to-menu"));
      };
    }

    // --- Add export level button next to exit ---
    const exportBtn = document.createElement("button");
    exportBtn.id = "editor-export-level-button";
    exportBtn.className = "editor-export-level-button";
    exportBtn.textContent = "Export Level";
    exportBtn.onclick = () => {
      this.exportLevelToClipboard();
    };
    hudClone.appendChild(exportBtn);

    // --- Add playtest level button next to export ---
    const playtestBtn = document.createElement("button");
    playtestBtn.id = "editor-playtest-level-button";
    playtestBtn.className = "editor-playtest-level-button";
    playtestBtn.textContent = "Playtest Level";
    playtestBtn.onclick = () => {
      window.dispatchEvent(new CustomEvent("editor-playtest-level"));
    };
    hudClone.appendChild(playtestBtn);

    // Wire up controls
    this.recordingControls = hudClone.querySelector<HTMLElement>("#recording-controls")!;
    this.playbackBar = hudClone.querySelector<HTMLElement>("#playback-bar")!;
    this.playbackWrapper = this.recordingControls.querySelector<HTMLElement>("#playback-bar-wrapper")!;

    // Add mousewheel event listeners for zoom/scroll
    this.recordingControls.addEventListener("mousewheel", (event) => {
      this.handleMouseWheelEvent(event);
    }, { passive: false });
    // Firefox
    this.recordingControls.addEventListener("DOMMouseScroll", (event) => {
      this.handleDomMouseScrollEvent(event);
    }, { passive: false });

    this.playbackBar.addEventListener("click", (event) => {
      this.playbackBarClicked(event as MouseEvent);
    });

    // Listen for mouse release anywhere on the document
    document.addEventListener("mouseup", (event) => {
      this.mouseReleased(event as MouseEvent);
    });

    // now add all existing attacks to UI
    this.addAttacks();
    this.addCriticals(); // <-- add criticals to UI

    this.hud = new EditorHud();
  }

  cleanup() {
    console.log("Cleaning up editor state...");
    // Remove the entire HUD from DOM
    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
    }
  }

  private getCurrentTimeSafe(): number {
    return this.videoPlayer.getCurrentTime();
  }

  mouseReleased(event: MouseEvent) {
    if (this.dragged != null) {
      // TODO evil hack with constructor name
      if (this.dragged.ty == "attack") {
        this.dragged = <DraggedAttack>this.dragged;
        // remove the attack
        this.deleteAttack(this.dragged.attack);

        // add the attack back at the mouse position
        this.createAttackAtMousePosition(event.clientX, this.dragged.attack.direction, this.dragged.attack.damage);

        this.dragged = null;
      } else if (this.dragged.ty == "critical") {
        this.dragged = <DraggedCritical>this.dragged;
        this.deleteCritical(this.dragged.critical);
        this.createCriticalAtMousePosition(event.clientX, this.dragged.critical.direction, this.dragged.critical.multiplier);
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
      this.addAttackOrCriticalElement(attack, false);
    }
    for (let [name, interval] of this.level.attackIntervals) {
      this.addIntervalElements(interval);
    }
  }

  addCriticals() {
    for (let crit of this.level.criticals) {
      this.addAttackOrCriticalElement(crit, true);
    }
  }

  // Shared helper for both attacks and criticals
  private addAttackOrCriticalElement(
    data: AttackData | CriticalData,
    isCritical: boolean
  ) {
    const parentElement = this.playbackWrapper;
    let templateElement: HTMLElement | null = null;
    if (isCritical) {
      const tpl = document.getElementById("critical-marker-template") as HTMLTemplateElement | null;
      if (tpl && tpl.content) {
        templateElement = tpl.content.firstElementChild as HTMLElement;
      }
    } else {
      const tpl = document.getElementById("attack-marker-template") as HTMLTemplateElement | null;
      if (tpl && tpl.content) {
        templateElement = tpl.content.firstElementChild as HTMLElement;
      }
    }
    if (!templateElement) {
      console.error("Template element not found for", isCritical ? "critical-marker-template" : "attack-marker-template");
      return;
    }
    let element = templateElement.cloneNode(true) as HTMLElement;
    element.classList.remove("template");
    if (isCritical) element.classList.add("critical-marker");

    // Mouse down handler
    const handleMouseDown = isCritical
      ? ((event: Event) => {
          event.stopPropagation();
          event.preventDefault();
          this.criticalMouseDown(data as CriticalData);
        }) as EventListener
      : ((event: Event) => {
          event.stopPropagation();
          event.preventDefault();
          this.attackMouseDown(data as AttackData);
        }) as EventListener;
    element.querySelector(".marker-handle")!.addEventListener("mousedown", handleMouseDown);

    // Insert chronologically
    const arr = isCritical ? this.level.criticals : this.level.attackData;
    const map = isCritical ? this.criticalElements : this.elements;
    let index = arr.findIndex(a => a.time > data.time);
    if (index == -1) {
      parentElement.insertBefore(element, null);
    } else {
      let nextElem = map.get(arr[index] as any) as HTMLElement | undefined;
      parentElement.insertBefore(element, nextElem ?? null);
    }
    map.set(data as any, element);

    // For attacks, update frameToAttack
    if (!isCritical) {
      this.frameToAttack.set(this.frameIndex(data as AttackData), data as AttackData);
    }

    // Draw arrow for direction using drawArrow/drawCritical
    let arrowImg: HTMLCanvasElement;
    if (isCritical) {
      arrowImg = (data.direction === 8)
        ? graphics.centerCriticalSprite
        : (graphics.criticalSprite ?? graphics.arrowSprite);
    } else {
      arrowImg = graphics.arrowSprite;
    }
    let arrowSize = 70;
    let arrowCanvas = document.createElement("canvas");
    arrowCanvas.width = arrowSize;
    arrowCanvas.height = arrowSize;
    let arrowCtx = arrowCanvas.getContext("2d")!;
    if (isCritical) {
      drawCritical(
        arrowCtx,
        arrowImg,
        data.direction,
        arrowSize / 2,
        arrowSize / 2,
        arrowSize,
        (data as CriticalData).multiplier
      );
    } else {
      drawArrow(
        arrowCtx,
        arrowImg,
        data.direction,
        arrowSize / 2,
        arrowSize / 2,
        arrowSize,
        (data as AttackData).damage
      );
    }

    let arrowElement = document.createElement("div");
    arrowElement.appendChild(arrowCanvas);
    arrowElement.style.position = "absolute";
    let pos_vector: [number, number] = [0, 30];
    let angle = (Math.PI / 4) * data.direction;
    let rotated_vector = roatate_vec2(pos_vector, angle);
    let left = -arrowSize / 2 + rotated_vector[0];
    let top = -arrowSize / 2 + rotated_vector[1];
    arrowElement.style.left = `${left}px`;
    arrowElement.style.bottom = `calc(var(--height) + ${top}px)`;
    arrowElement.style.pointerEvents = "none"; // allow clicks to pass through
    element.appendChild(arrowElement);

    // For criticals, show multiplier label (already drawn by drawArrowOrX, but keep for accessibility)
    if (isCritical) {
      let multLabel = document.createElement("div");
      multLabel.textContent = `x${(data as CriticalData).multiplier}`;
      multLabel.className = "mult-label";
      element.appendChild(multLabel);
    }
  }

  // update all the elements
  draw(mouseX: number, mouseY: number) {
    const clientWidth = this.recordingControls.clientWidth - PLAYBACK_BAR_PADDING * 2;

    let duration = this.videoPlayer.getDuration();
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
    let lineSpacing = this.timeToPx(1.0) - lineLength;
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

    // update all of the critical elements positions
    for (let [crit, element] of this.criticalElements) {
      var left = this.timeToPx(crit.time);
      if (this.dragged != null && this.dragged.ty == "critical") {
        if ((this.dragged as DraggedCritical).critical == crit) {
          left = mouseX - this.playbackBar.getBoundingClientRect().left;
        }
      }
      element.style.left = `${left}px`;
      element.style.setProperty('--height', `50px`);
    }

    // update the playback point
    const playbackPoint = document.querySelector<HTMLElement>("#playback-point")!;
    const playbackPointLeft = this.timeToPx(this.getCurrentTimeSafe());
    playbackPoint.style.left = `${playbackPointLeft}px`;

    if (this.hud.titleInput.value) {
      this.level.title = this.hud.titleInput.value; 
    }

    // Update attack warnings every frame
    this.updateCloseWarning();
  }

  timeToPx(time: number) {
    // Make the bar length proportional to client width and video duration
    const clientWidth = this.recordingControls.clientWidth - PLAYBACK_BAR_PADDING * 2;
    // default 1 minute of content on screen
    let duration = time / 60.0;
    return (duration * clientWidth * this.zoom);
  }

  pxToTime(px: number) {
    const clientWidth = this.recordingControls.clientWidth - PLAYBACK_BAR_PADDING * 2;
    return (px * 60.0 / (clientWidth * this.zoom));
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
    this.videoPlayer.updateTime();

    if (keyJustPressed.has(" ")) {
      if (this.videoPlayer.getPlayerState() == YT.PlayerState.PLAYING) {
        this.videoPlayer.pauseVideo();
      } else {
        this.videoPlayer.playVideo();
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
      this.createAttackAt(this.getCurrentTimeSafe(), currentTargetDir, Editor.defaults.attackDamage);
    }
    if (keyJustPressed.has("i")) {
      this.createIntervalAt(this.getCurrentTimeSafe());
    }
    if (keyJustPressed.has("o")) {
      this.createCriticalAt(this.getCurrentTimeSafe(), currentTargetDir, 1.5);
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

    let playerReady = (this.videoPlayer.getPlayerState() == YT.PlayerState.PAUSED || this.videoPlayer.getPlayerState() == YT.PlayerState.PLAYING);

    // check the state of the player so duration is valid
    if (!deathInterval && playerReady) {
      let startTime = Math.max(this.videoPlayer.getDuration() - 2, 0);
      let endTime = this.videoPlayer.getDuration();
      let newDeathInterval = {
        start: startTime,
        end: endTime,
        name: "death"
      };
      this.createInterval(newDeathInterval);
    }

    if (!introInterval && playerReady) {
      let startTime = 0;
      let endTime = Math.min(2, this.videoPlayer.getDuration());
      let newIntroInterval = {
        start: startTime,
        end: endTime,
        name: "intro"
      };
      this.createInterval(newIntroInterval);
    }

    // if there's no non-special intervals, add a default one
    if (!hasNonSpecialInterval && playerReady) {
      let startTime = Math.min(2, this.videoPlayer.getDuration());
      let endTime = Math.max(this.videoPlayer.getDuration() - 2, startTime + 1);
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

  createCriticalAtMousePosition(pos: number, targetDir: AttackDirection, multiplier: number) {
    let posRelative = pos - this.playbackBar.getBoundingClientRect().left;
    let time = this.pxToTime(posRelative);
    let newCrit: CriticalData = {
      time: time,
      direction: targetDir,
      multiplier: multiplier
    };
    this.createCritical(newCrit);
    this.selectCritical(newCrit);
  }

  createCriticalAt(timestamp: number, targetDir: AttackDirection, multiplier: number) {
    let newCrit: CriticalData = {
      time: timestamp,
      direction: targetDir,
      multiplier: multiplier
    };
    this.createCritical(newCrit);
    this.selectCritical(newCrit);
  }

  createIntervalAt(timestamp: DOMHighResTimeStamp) {
    let endTime = Math.min(timestamp + 2, this.videoPlayer.getDuration());
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
    if (this.selected != null) {
      if (this.selected.ty == "attack") {
        this.deleteAttack(this.selected.attack);
      } else if (this.selected.ty == "interval") {
        this.deleteInterval(this.selected.interval);
      } else if (this.selected.ty == "critical") {
        this.deleteCritical((this.selected as DraggedCritical).critical);
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
    this.videoPlayer.seekTo(seconds, true);
  }

  seekForward(seconds: number) {
    let targetTime = Math.min(Math.max(this.getCurrentTimeSafe() + seconds, 0), this.videoPlayer.getDuration() - 0.05 * seconds);
    this.videoPlayer.seekTo(targetTime, true);
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
      event.preventDefault();
      this.intervalMouseDown(interval, true);
    });
    endElement.addEventListener("mousedown", event => {
      event.stopPropagation();
      event.preventDefault();
      this.intervalMouseDown(interval, false);
    });

    parentElement.appendChild(startElement);
    parentElement.appendChild(endElement);
    parentElement.appendChild(nameElement);
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
    let index = this.level.attackData.findIndex(a => attack.time < a.time);
    if (index == -1) {
      this.level.attackData.push(attack);
    } else {
      this.level.attackData.splice(index, 0, attack);
    }
    this.addAttackOrCriticalElement(attack, false);
  }

  private createCritical(crit: CriticalData) {
    let index = this.level.criticals.findIndex(a => crit.time < a.time);
    if (index == -1) {
      this.level.criticals.push(crit);
    } else {
      this.level.criticals.splice(index, 0, crit);
    }
    this.addAttackOrCriticalElement(crit, true);
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

  private deleteAttackOrCritical(
    data: AttackData | CriticalData,
    isCritical: boolean
  ) {
    const map = isCritical ? this.criticalElements : this.elements;
    const arr = isCritical ? this.level.criticals : this.level.attackData;
    const equals = isCritical ? criticalDataEquals : attackDataEquals;
    const element = map.get(data as any);
    if (element) {
      element.remove();
      map.delete(data as any);
    }
    let index = arr.findIndex(a => equals(a as any, data as any));
    if (index !== -1) {
      arr.splice(index, 1);
    }
    if (!isCritical && this.frameToAttack.get(this.frameIndex(data as AttackData)) == data) {
      this.frameToAttack.delete(this.frameIndex(data as AttackData));
    }
    if (this.selected != null) {
      if (
        (!isCritical && this.selected.ty == "attack" && (this.selected as DraggedAttack).attack == data) ||
        (isCritical && this.selected.ty == "critical" && (this.selected as DraggedCritical).critical == data)
      ) {
        this.selected = null;
      }
    }
  }

  private deleteAttack(attack: AttackData) {
    this.deleteAttackOrCritical(attack, false);
  }

  private deleteCritical(crit: CriticalData) {
    this.deleteAttackOrCritical(crit, true);
  }

  private attackMouseDown(attack: AttackData) {
    this.selectAttack(attack);
    this.dragged = new DraggedAttack(attack);
  }

  private criticalMouseDown(crit: CriticalData) {
    this.selectCritical(crit);
    this.dragged = new DraggedCritical(crit);
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
    for (let critElement of this.criticalElements.values()) {
      critElement.classList.remove("selected");
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
      if (this.videoPlayer) {
        if (isStart) {
          this.seek(interval.start);
        } else {
          this.seek(interval.end);
        }
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

  private selectCritical(crit: CriticalData | null) {
    this.selected = null;
    this.clearSelectClass();
    if (crit != null) {
      this.selected = new DraggedCritical(crit);
      this.criticalElements.get(crit)!.classList.add("selected");
      this.seek(crit.time);
    }
  }

  private updateCloseWarning() {
    // Track which attacks should have warnings
    const shouldWarn = new Set<AttackData>();

    // Sort attacks by time to make comparison easier
    const sortedAttacks = [...this.level.attackData].sort((a, b) => a.time - b.time);

    // Only mark the later attack in each close pair
    for (let i = 1; i < sortedAttacks.length; i++) {
      const prevAttack = sortedAttacks[i - 1];
      const currAttack = sortedAttacks[i];
      const timeDiff = Math.abs(currAttack.time - prevAttack.time);

      if (timeDiff < Editor.defaults.minAttackDistance) {
        shouldWarn.add(currAttack);
      }
    }

    // Add missing warnings and remove obsolete ones
    for (let [attack, element] of this.elements) {
      const existingWarning = element.querySelector('.attack-warning');
      if (shouldWarn.has(attack)) {
        // Add warning if missing
        if (!existingWarning) {
          const warning = document.createElement('div');
          warning.className = 'attack-warning';
          warning.textContent = '!';

          // Tooltip
          const tooltip = document.createElement('div');
          tooltip.className = 'attack-warning-tooltip';
          tooltip.textContent = 'Attack too close to another (< 0.1s apart)';

          warning.appendChild(tooltip);

          element.appendChild(warning);
        }
      } else {
        // Remove warning if present but not needed
        if (existingWarning) {
          existingWarning.remove();
        }
      }
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

  // Helper for mousewheel event (Chrome/Edge/Safari)
  handleMouseWheelEvent(event: Event) {
    if (!(event instanceof WheelEvent)) return;
    if (event.ctrlKey) {
      event.preventDefault();
      this.changeZoom(event);
    } else {
      this.changeScroll(event);
    }
  }

  // Helper for DOMMouseScroll event (Firefox)
  handleDomMouseScrollEvent(event: Event) {
    if (!(event instanceof WheelEvent)) return;
    if (event.ctrlKey) {
      event.preventDefault();
      this.changeZoom(event);
    } else {
      this.changeScroll(event);
    }
  }

  exportLevelToClipboard() {
    const json = JSON.stringify(this.level, (key, value) => {
      if (value instanceof Map) {
        return { __type: 'Map', entries: Array.from(value.entries()) };
      }
      return value;
    }, 2);
    navigator.clipboard.writeText(json).then(() => {
      showFloatingAlert('Level data copied to clipboard.', 30, "60px");
    }).catch(error => {
      showFloatingAlert('Failed to copy level data.', 30, "60px");
    });
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

// Floating notification helper for editor
function showFloatingAlert(message: string, fontSize: number = 40, position: string = "20px", color: string = 'white', font: string = 'Arial') {
  const alertText = document.createElement('div');
  alertText.classList.add("fading-alert");
  alertText.style.fontSize = `${fontSize}px`;
  alertText.style.top = position;
  alertText.style.color = color;
  alertText.style.fontFamily = font;
  alertText.textContent = message;
  alertText.style.position = "absolute";
  alertText.style.left = "50%";
  alertText.style.transform = "translateX(-50%)";
  alertText.style.zIndex = "2000";
  document.body.appendChild(alertText);
  setTimeout(() => {
    alertText.style.opacity = "0";
    setTimeout(() => alertText.remove(), 600);
  }, 1800);
}

export type { AttackInterval, BossState, BossScheduleResult };