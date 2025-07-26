import typia from "typia";
import { DEFAULT_ATTACK_SCHEDULE } from "./defaultSchedule";
import { showFloatingAlert } from "./utils";

export enum AttackDirection {
  UP, UP_RIGHT, RIGHT, DOWN_RIGHT, DOWN, DOWN_LEFT, LEFT, UP_LEFT, CENTER
}

export type AttackInterval = {
  start: number,
  end: number,
  name: string
};

export type BossState = {
  healthPercentage: number;
  currentInterval: string;
  currentTime: number;
  intervalElapsedTime: number;
  playerHealthPercentage: number;
  availableIntervals: Record<string, AttackInterval>;
};

export type BossScheduleResult = {
  continueNormal: boolean;
  transitionToInterval?: string;
  intervalOffset?: number;
};

export type AttackData = {
  time: number,
  direction: AttackDirection,
  damage: number,
};

export type CriticalData = {
  time: number,
  direction: AttackDirection,
  multiplier: number,
};

export class LevelDataV0 {
  video: string | null;
  attackData: AttackData[];
  criticals: CriticalData[];
  attackIntervals: Map<string, AttackInterval>;
  attackSchedule: string;
  version: string;
  title: string | null;
  arrowless: boolean;
  bossDamageMultiplier: number; 
  bossHealth: number;

  constructor() {
    this.video = null;
    this.attackData = [];
    this.criticals = [];
    this.attackIntervals = new Map<string, AttackInterval>();
    this.attackSchedule = DEFAULT_ATTACK_SCHEDULE;
    this.version = "0.0.0";
    this.title = null;
    this.arrowless = false;
    this.bossDamageMultiplier = 1.0; 
    this.bossHealth = 4.0;
  }

  getAttacksInInterval(startTime: number, endTime: number): AttackData[] {
    return this.attackData.filter(attack => attack.time > startTime && attack.time <= endTime);
  }
}

export function levelDataFromVideo(videoId: string): LevelDataV0 {
  const level = new LevelDataV0();
  level.video = videoId;
  level.arrowless = false; // <-- Always set
  level.bossDamageMultiplier = 1.0; // <-- always set
  level.bossHealth = 1.0; // <-- always set
  level.criticals = []; // <-- always set
  return level;
}

// Generic JSON utilities for handling Maps and other non-serializable types
export function stringifyWithMaps(obj: any): string {
  return JSON.stringify(obj, (key, value) => {
    if (value instanceof Map) {
      return {
        __type: 'Map',
        entries: Array.from(value.entries())
      };
    }
    return value;
  }, 2);
}

export function parseWithMaps(jsonString: string): any {
  return JSON.parse(jsonString, (key, value) => {
    if (value && typeof value === 'object' && value.__type === 'Map') {
      return new Map(value.entries);
    }
    return value;
  });
}

export function stringifyLevelData(levelData: LevelDataV0): string {
  return stringifyWithMaps(levelData);
}

export function parseLevelData(jsonString: string): LevelDataV0 {
  const parsed = JSON.parse(jsonString);
  const attackIntervals = new Map<string, AttackInterval>();
  if (parsed.attackIntervals) {
    for (const [key, value] of Object.entries(parsed.attackIntervals)) {
      attackIntervals.set(key, value as AttackInterval);
    }
  }
  const levelData = new LevelDataV0();
  levelData.video = parsed.video || null;
  levelData.attackData = parsed.attackData || [];
  levelData.criticals = parsed.criticals || [];
  levelData.attackIntervals = attackIntervals;
  levelData.attackSchedule = parsed.attackSchedule || DEFAULT_ATTACK_SCHEDULE;
  levelData.version = parsed.version || "0.0.0";
  levelData.title = parsed.title || null;
  levelData.arrowless = !!parsed.arrowless; // <-- Always set, fallback to false
  levelData.bossDamageMultiplier = typeof parsed.bossDamageMultiplier === "number" ? parsed.bossDamageMultiplier : 1.0; // <-- parse
  levelData.bossHealth = typeof parsed.bossHealth === "number" ? parsed.bossHealth : 1.0; // <-- parse
  return levelData;
}

// Returns null if the level data is valid, otherwise returns an error message
export function validateLevelData(levelData: unknown): null | string {
  if (typeof levelData !== "object" || levelData === null) {
    return "Expected an object";
  }
  if (!("version" in levelData)) {
    return "Expected a version field";
  }
  if (levelData.version !== "0.0.0") {
    return "Expected version number to be 0.0.0";
  }
  const res = typia.validate<LevelDataV0>(levelData);
  if (res.success) {
    // Additional manual checks for new fields
    if (typeof (levelData as any).bossDamageMultiplier !== "number") {
      return "Expected bossDamageMultiplier to be a number";
    }
    if (typeof (levelData as any).bossHealth !== "number") {
      return "Expected bossHealth to be a number";
    }
    // Validate criticals array
    if (!Array.isArray((levelData as any).criticals)) {
      return "Expected criticals to be an array";
    }
    for (const crit of (levelData as any).criticals) {
      if (typeof crit.time !== "number" || typeof crit.direction !== "number" || typeof crit.multiplier !== "number") {
        return "Each critical must have time:number, direction:number, multiplier:number";
      }
    }
    return null;
  } else {
    return res.errors.map(function (error) {
      return `Error at ${error.path}: expected ${error.expected} but got ${error.value}`;
    }).join("\n");
  }
}

export function exportLevelToClipboard(levelData: LevelDataV0): void {
  const levelString = stringifyLevelData(levelData);
  navigator.clipboard.writeText(levelString).then(() => {
    showFloatingAlert("Level data copied to clipboard!");
  }).catch(err => {
    showFloatingAlert("Failed to copy level data: " + err.message);
  });
}
