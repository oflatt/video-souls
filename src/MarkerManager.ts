import { AttackData, AttackInterval, CriticalData, LevelDataV0 } from "./leveldata";
import { drawArrow, drawCritical } from './battleRenderer';
import { graphics } from './videosouls';
import { roatate_vec2, frameIndex } from './utils';
import { VideoPlayer } from "./videoPlayer";

export class IntervalElements {
  startElement: HTMLElement;
  endElement: HTMLElement;
  nameElement: HTMLElement;

  constructor(startElement: HTMLElement, endElement: HTMLElement, nameElement: HTMLElement) {
    this.startElement = startElement;
    this.endElement = endElement;
    this.nameElement = nameElement;
  }
}

export class DraggedInterval {
  interval: AttackInterval;
  isStart: boolean;
  ty: "interval";

  constructor(interval: AttackInterval, isStart: boolean) {
    this.interval = interval;
    this.isStart = isStart;
    this.ty = "interval";
  }
}

export class DraggedAttack {
  attack: AttackData;
  ty: "attack";

  constructor(attack: AttackData) {
    this.attack = attack;
    this.ty = "attack";
  }
}

export class DraggedCritical {
  critical: CriticalData;
  ty: "critical";
  constructor(critical: CriticalData) {
    this.critical = critical;
    this.ty = "critical";
  }
}


export class MarkerManager {
  frameToAttack: Map<number, AttackData>;
  elements: Map<AttackData, HTMLElement>;
  intervalElements: Map<AttackInterval, IntervalElements>;
  criticalElements: Map<CriticalData, HTMLElement>;
  selected: DraggedAttack | null | DraggedInterval | DraggedCritical;
  playbackWrapper: HTMLElement;
  savedCursorTime: number | null;
  level: LevelDataV0;
  dragged: DraggedAttack | null | DraggedInterval | DraggedCritical;
  videoPlayer: VideoPlayer;

  constructor(playbackWrapper: HTMLElement, level: LevelDataV0, videoPlayer: VideoPlayer) {
    this.frameToAttack = new Map<number, AttackData>();
    this.elements = new Map<AttackData, HTMLElement>();
    this.intervalElements = new Map<AttackInterval, IntervalElements>();
    this.criticalElements = new Map<CriticalData, HTMLElement>();
    this.selected = null;
    this.playbackWrapper = playbackWrapper;
    this.savedCursorTime = null;
    this.level = level;
    this.dragged = null;
    this.videoPlayer = videoPlayer;
  }

  clearSelectClass() {
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

  selectInterval(interval: AttackInterval, isStart: boolean) {
    this.selected = null;
    this.clearSelectClass();
    if (interval != null) {
      this.selected = new DraggedInterval(interval, isStart);
      this.intervalElements.get(interval)!.startElement.classList.add("selected");
      this.intervalElements.get(interval)!.endElement.classList.add("selected");
      this.intervalElements.get(interval)!.nameElement.classList.add("selected");
    }
  }

  selectAttack(attack: AttackData | null) {
    this.selected = null;
    this.clearSelectClass();
    if (attack != null) {
      this.selected = new DraggedAttack(attack);
      this.elements.get(attack)!.classList.add("selected");
    }
  }

  selectCritical(crit: CriticalData | null) {
    this.selected = null;
    this.clearSelectClass();
    if (crit != null) {
      this.selected = new DraggedCritical(crit);
      this.criticalElements.get(crit)!.classList.add("selected");
    }
  }

  intervalMouseDown(interval: AttackInterval, isStart: boolean) {
    // Save the current cursor time at drag start
    this.savedCursorTime = this.cursorTime();
    this.selectInterval(interval, isStart);
    this.dragged = new DraggedInterval(interval, isStart);
  }

  attackMouseDown(attack: AttackData) {
    // Save the current cursor time at drag start
    this.savedCursorTime = this.cursorTime();
    this.selectAttack(attack);
    this.dragged = new DraggedAttack(attack);
  }

  criticalMouseDown(crit: CriticalData) {
    // Save the current cursor time at drag start
    this.savedCursorTime = this.cursorTime();
    this.selectCritical(crit);
    this.dragged = new DraggedCritical(crit);
  }

  addAttackOrCriticalElement(
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
          // Use selectCritical only
          this.criticalMouseDown(data as CriticalData);
        }) as EventListener
      : ((event: Event) => {
          event.stopPropagation();
          event.preventDefault();
          // Use selectAttack only
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
      this.frameToAttack.set(frameIndex(data as AttackData), data as AttackData);
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
    let pos_vector: [number, number] = [0, 30];
    let angle = (Math.PI / 4) * data.direction;
    let rotated_vector = roatate_vec2(pos_vector, angle);
    let left = -arrowSize / 2 + rotated_vector[0];
    let top = -arrowSize / 2 + rotated_vector[1];
    arrowElement.style.left = `${left}px`;
    arrowElement.style.bottom = `calc(var(--height) + ${top}px)`;

    arrowElement.className = "attack-arrow";
    arrowElement.style.pointerEvents = "none";
    element.appendChild(arrowElement);

    // --- Editable input for damage/multiplier ---
    let input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.className = "damage-input";
    input.value = isCritical
      ? String((data as CriticalData).multiplier)
      : String((data as AttackData).damage);
    input.addEventListener("keydown", (e) => {
      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "Tab"
      ) {
        e.preventDefault();
      }
    });

    input.addEventListener("input", () => {
      if (isCritical) {
        let crit = data as CriticalData;
        let val = Number(input.value);
        if (Number.isFinite(val)) {
          this.deleteAttackOrCritical(crit, true);
          const newCrit: CriticalData = {
            time: crit.time,
            direction: crit.direction,
            multiplier: val
          };
          this.createCritical(newCrit);
          this.selectCritical(newCrit);
        }
      } else {
        let attack = data as AttackData;
        let val = Number(input.value);
        if (Number.isFinite(val)) {
          this.deleteAttackOrCritical(attack, false);
          const newAttack: AttackData = {
            time: attack.time,
            direction: attack.direction,
            damage: val
          };
          this.createAttack(newAttack);
          this.selectAttack(newAttack);
        }
      }
    });

    element.appendChild(input);

    // For criticals, show multiplier label
    if (isCritical) {
      let multLabel = document.createElement("div");
      multLabel.textContent = `x${(data as CriticalData).multiplier}`;
      multLabel.className = "mult-label";
      element.appendChild(multLabel);
    }
  }

  deleteAttackOrCritical(
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
    if (!isCritical && this.frameToAttack.get(frameIndex(data as AttackData)) == data) {
      this.frameToAttack.delete(frameIndex(data as AttackData));
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

  createAttack(attack: AttackData) {
    let index = this.level.attackData.findIndex(a => attack.time < a.time);
    if (index == -1) {
      this.level.attackData.push(attack);
    } else {
      this.level.attackData.splice(index, 0, attack);
    }
    this.addAttackOrCriticalElement(
      attack,
      false
    );
  }

  createCritical(crit: CriticalData) {
    let index = this.level.criticals.findIndex(a => crit.time < a.time);
    if (index == -1) {
      this.level.criticals.push(crit);
    } else {
      this.level.criticals.splice(index, 0, crit);
    }
    this.addAttackOrCriticalElement(
      crit,
      true
    );
  }

  createInterval(interval: AttackInterval) {
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
    this.level.attackIntervals.set(interval.name, interval);

    this.addIntervalElements(interval); // <-- use shared method
  }

  addIntervalElements(interval: AttackInterval) {
    // ...existing code for creating and wiring up interval elements...
    const parentElement = this.playbackWrapper;
    let startElement = document.createElement("div");
    startElement.classList.add("interval-start");
    let endElement = document.createElement("div");
    endElement.classList.add("interval-end");

    let nameElement = document.createElement("input");
    nameElement.type = "text";
    nameElement.value = interval.name;
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

  deleteInterval(interval: AttackInterval) {
    const elements = this.intervalElements.get(interval);
    if (elements) {
      elements.startElement.remove();
      elements.endElement.remove();
      elements.nameElement.remove();
      this.intervalElements.delete(interval);
    }
    this.level.attackIntervals.delete(interval.name);
    if (this.selected != null && this.selected.ty == "interval" && this.selected.interval == interval) {
      this.selected = null;
    }
  }

  cursorTime(): number {
    if (this.savedCursorTime !== null) {
      return this.savedCursorTime;
    }
    return this.videoPlayer.getCurrentTime();
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
