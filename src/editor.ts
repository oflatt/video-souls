// TODO file too big
import typia from "typia";

import { Graphics } from './graphics';
import { VideoPlayer } from './videoPlayer';
import {
  LevelDataV0,
  AttackInterval,
  BossState,
  BossScheduleResult,
  AttackData,
  AttackDirection,
  CriticalData,
  exportLevelToClipboard
} from './leveldata';
import { EditorHud } from './editorHud';
import { drawArrow, drawCritical } from './battleRenderer'; // <-- update import
import { graphics } from './videosouls'; // <-- import global graphics
import { roatate_vec2 } from './utils';
import { showFloatingAlert } from './utils';
import { DraggedAttack, DraggedCritical, DraggedInterval, IntervalElements, MarkerManager } from './MarkerManager';
import { frameIndex } from './utils'; // <-- import from utils

const PLAYBACK_BAR_PADDING = 20;


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
    attackDamage: 1.0,
    minAttackDistance: 0.1  // minimum seconds between attacks
  } as const;

  markerManager: MarkerManager;
  playbackBar: HTMLElement;
  recordingControls: HTMLElement;
  zoom: number;
  dragged: DraggedAttack | null | DraggedInterval | DraggedCritical;
  freshName: number;
  controlsInfoToggle: HTMLButtonElement | null = null;
  controlsInfoPanel: HTMLElement | null = null;
  controlsInfoVisible: boolean = true;
  hud: EditorHud;
  hudElement: HTMLElement;
  videoPlayer: VideoPlayer;

  constructor(level: LevelDataV0, _graphics: Graphics, videoPlayer: VideoPlayer) {
    this.videoPlayer = videoPlayer;
    this.zoom = 1.0;
    this.dragged = null;
    this.freshName = 0;
    for (let [name, interval] of level.attackIntervals) {
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
      exportLevelToClipboard(this.markerManager.level);
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

    this.markerManager = new MarkerManager(this.recordingControls.querySelector<HTMLElement>("#playback-bar-wrapper")!, level);

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
    this.markerManager.savedCursorTime = null; // <-- initialize in markerManager
  }

  cleanup() {
    // Remove the entire HUD from DOM
    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
    }
    this.markerManager.savedCursorTime = null; // <-- clear in markerManager
  }

  private getCurrentTimeSafe(): number {
    // If dragging, keep the cursor at the saved time
    if (this.markerManager.savedCursorTime !== null) {
      return this.markerManager.savedCursorTime;
    }
    return this.videoPlayer.getCurrentTime();
  }

  mouseReleased(event: MouseEvent) {
    if (this.markerManager.savedCursorTime !== null) {
      this.videoPlayer.seekTo(this.markerManager.savedCursorTime, true); // <-- fix reference
      this.markerManager.savedCursorTime = null;
    }
    if (this.dragged != null) {
      // TODO evil hack with constructor name
      if (this.dragged.ty == "attack") {
        this.dragged = <DraggedAttack>this.dragged;
        // remove the attack
        this.markerManager.deleteAttackOrCritical(this.dragged.attack, false); // <-- fix reference

        // add the attack back at the mouse position
        this.createAttackAtMousePosition(event.clientX, this.dragged.attack.direction, this.dragged.attack.damage);

        this.dragged = null;
      } else if (this.dragged.ty == "critical") {
        this.dragged = <DraggedCritical>this.dragged;
        this.markerManager.deleteAttackOrCritical(this.dragged.critical, true); // <-- fix reference
        this.createCriticalAtMousePosition(event.clientX, this.dragged.critical.direction, this.dragged.critical.multiplier);
        this.dragged = null;
      } else if (this.dragged.constructor.name == "DraggedInterval") {
        this.dragged = <DraggedInterval>this.dragged;
        // remove the interval
        this.markerManager.deleteInterval(this.dragged.interval); // <-- use markerManager

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

        this.markerManager.createInterval(newInterval); // <-- use markerManager
        this.markerManager.selectInterval(newInterval, this.dragged.isStart);
        this.dragged = null;
      }
    }
  }

  addAttacks() {
    for (let attack of this.markerManager.level.attackData) {
      this.markerManager.addAttackOrCriticalElement(attack, false);
    }
    for (let [name, interval] of this.markerManager.level.attackIntervals) {
      this.markerManager.addIntervalElements(interval); // <-- use markerManager
    }
  }

  addCriticals() {
    for (let crit of this.markerManager.level.criticals) {
      this.markerManager.addAttackOrCriticalElement(crit, true);
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
    this.markerManager.playbackWrapper = this.recordingControls.querySelector<HTMLElement>("#playback-bar-wrapper")!;
    // lines every 1 second
    let lineLength = 3;
    let lineSpacing = this.timeToPx(1.0) - lineLength;
    // make stripes- grey for lineLength, then transparent from lineLength to lineSpacing
    this.markerManager.playbackWrapper.style.backgroundImage = `repeating-linear-gradient(to right, grey 0px, grey ${lineLength}px, transparent ${lineLength}px, transparent ${lineSpacing}px, grey ${lineSpacing}px)`;


    // update all of the attack elements positions
    for (let [attack, element] of this.markerManager.elements) {
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
    for (let [interval, elements] of this.markerManager.intervalElements) {
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
    for (let [crit, element] of this.markerManager.criticalElements) {
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
    // Use savedCursorTime if set, otherwise use video time
    const playbackPointLeft = this.timeToPx(this.getCurrentTimeSafe());
    playbackPoint.style.left = `${playbackPointLeft}px`;

    if (this.hud.titleInput.value) {
      this.markerManager.level.title = this.hud.titleInput.value; 
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
      this.videoPlayer.seekTo(time, true);
    }

    // now check if there is a "death" attack interval, if not, add one
    var deathInterval = this.markerManager.level.attackIntervals.get("death");
    var introInterval = this.markerManager.level.attackIntervals.get("intro");
    var hasNonSpecialInterval = false;
    for (let [name, interval] of this.markerManager.level.attackIntervals) {
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
      this.markerManager.createInterval(newDeathInterval); // <-- use markerManager
    }

    if (!introInterval && playerReady) {
      let startTime = 0;
      let endTime = Math.min(2, this.videoPlayer.getDuration());
      let newIntroInterval = {
        start: startTime,
        end: endTime,
        name: "intro"
      };
      this.markerManager.createInterval(newIntroInterval); // <-- use markerManager
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
      this.markerManager.createInterval(defaultInterval); // <-- use markerManager
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
    this.markerManager.createAttack(newAttack);
    this.markerManager.selectAttack(newAttack);
  }

  createAttackAt(timestamp: DOMHighResTimeStamp, targetDir: AttackDirection, damage: number) {
    let existingAttack = this.markerManager.frameToAttack.get(frameIndex(timestamp));
    if (existingAttack != null) {
      this.markerManager.deleteAttackOrCritical(existingAttack, false); // <-- fix reference
    }
    let newAttack = {
      time: timestamp,
      direction: targetDir,
      damage: damage
    };
    this.markerManager.createAttack(newAttack);
    this.markerManager.selectAttack(newAttack);
  }

  createCriticalAtMousePosition(pos: number, targetDir: AttackDirection, multiplier: number) {
    let posRelative = pos - this.playbackBar.getBoundingClientRect().left;
    let time = this.pxToTime(posRelative);
    let newCrit: CriticalData = {
      time: time,
      direction: targetDir,
      multiplier: multiplier
    };
    this.markerManager.createCritical(newCrit);
    this.markerManager.selectCritical(newCrit);
  }

  createCriticalAt(timestamp: number, targetDir: AttackDirection, multiplier: number) {
    let newCrit: CriticalData = {
      time: timestamp,
      direction: targetDir,
      multiplier: multiplier
    };
    this.markerManager.createCritical(newCrit);
    this.markerManager.selectCritical(newCrit);
  }

  createIntervalAt(timestamp: DOMHighResTimeStamp) {
    let endTime = Math.min(timestamp + 2, this.videoPlayer.getDuration());
    if (endTime == timestamp) {
      return;
    }
    let newInterval = {
      start: timestamp,
      end: endTime,
      name: this.freshName.toString()
    };
    this.freshName += 1;
    this.markerManager.createInterval(newInterval); // <-- use markerManager
  }

  selectAttackAt(timestamp: number) {
    let existingAttack = this.markerManager.frameToAttack.get(frameIndex(timestamp)); // <-- use utils
    if (existingAttack != null) {
      this.markerManager.selectAttack(existingAttack);
    }
  }

  removeSelected() {
    if (this.markerManager.selected != null) {
      if (this.markerManager.selected.ty == "attack") {
        this.markerManager.deleteAttackOrCritical(this.markerManager.selected.attack, false); // <-- fix reference
      } else if (this.markerManager.selected.ty == "interval") {
        this.markerManager.deleteInterval(this.markerManager.selected.interval);
      } else if (this.markerManager.selected.ty == "critical") {
        this.markerManager.deleteAttackOrCritical((this.markerManager.selected as DraggedCritical).critical, true); // <-- fix reference
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
      this.markerManager.selectAttack(null);
      // seek to that time
      this.videoPlayer.seekTo(time, true); // <-- fix reference
    }
  }

  seekForward(seconds: number) {
    let targetTime = Math.min(Math.max(this.getCurrentTimeSafe() + seconds, 0), this.videoPlayer.getDuration() - 0.05 * seconds);
    this.videoPlayer.seekTo(targetTime, true);
  }

  private updateCloseWarning() {
    // Track which attacks should have warnings
    const shouldWarn = new Set<AttackData>();

    // Sort attacks by time to make comparison easier
    const sortedAttacks = [...this.markerManager.level.attackData].sort((a, b) => a.time - b.time);

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
    for (let [attack, element] of this.markerManager.elements) {
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
}

export type { AttackInterval, BossState, BossScheduleResult };

