import { AttackData, AttackInterval, CriticalData } from "./leveldata";

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

  constructor() {
    this.frameToAttack = new Map<number, AttackData>();
    this.elements = new Map<AttackData, HTMLElement>();
    this.intervalElements = new Map<AttackInterval, IntervalElements>();
    this.criticalElements = new Map<CriticalData, HTMLElement>();
    this.selected = null;
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
}
