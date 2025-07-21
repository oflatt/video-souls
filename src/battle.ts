export enum AttackAnimation {
  NONE, PARRYING, ATTACK_STARTING, ATTACKING, STAGGERING
}

// New BattleAnim class for anim field
export class BattleAnim {
  state: AttackAnimation;
  startTime: number;
  endTime: number;
  startPos: [number, number];
  endPos: [number, number];
  startAngle: number;
  endAngle: number;
  timeSinceLastParry: number;
  startYScale: number;
  endYScale: number;
  startXScale: number;
  endXScale: number;

  constructor() {
    this.state = AttackAnimation.NONE;
    this.startTime = 0;
    this.endTime = 0;
    this.startPos = [0.5, 0.5];
    this.endPos = [0.5, 0.5];
    this.startAngle = 0;
    this.endAngle = 0;
    this.timeSinceLastParry = 1000;
    this.startYScale = 1.0;
    this.endYScale = 1.0;
    this.startXScale = 1.0;
    this.endXScale = 1.0;
  }
}

export type BattleState = {
  anim: BattleAnim,
  hitCombo: number,
  timeSinceLastHit: number, 
  bufferedInput: string | null,
  playerHealth: number,
  lastPlayerHealth: number,
  timeSincePlayerHit: number,
  bossHealth: number,
  lastBossHealth: number,
  timeSinceBossHit: number,
  currentInterval: string,
};

const directionNumToSwordAngle = new Map<number, number>([
  [0, 4 * Math.PI / 4],
  [1, 3 * Math.PI / 4],
  [2, 2 * Math.PI / 4],
  [3, 1 * Math.PI / 4],
  [4, 4 * Math.PI / 4],
  [5, 3 * Math.PI / 4],
  [6, 2 * Math.PI / 4],
  [7, 5 * Math.PI / 4],
  [8, 2 * Math.PI / 4],
]);

const directionNumToSwordPos = new Map<number, [number, number]>([
  [0, [0.0, 0.2]],
  [1, [0.2, 0.2]],
  [2, [0.2, 0.0]],
  [3, [0.2, -0.2]],
  [4, [0.0, -0.2]],
  [5, [-0.2, -0.2]],
  [6, [-0.2, 0.0]],
  [7, [-0.2, 0.2]],
  [8, [0.0, 0.0]],
]);

export function initialBattleState(): BattleState {
  return {
    anim: new BattleAnim(),
    bufferedInput: null,
    playerHealth: 1.0,
    lastPlayerHealth: 1.0,
    timeSincePlayerHit: 1000,  // Large initial value
    bossHealth: 1.0,
    lastBossHealth: 1.0,
    timeSinceBossHit: 1000,  // Large initial value
    hitCombo: 0,
    timeSinceLastHit: 1000,  // Large initial value
    currentInterval: "intro",
  };
}

// Helper function to update time and handle time jumps
export function updateBattleTime(battle: BattleState, deltaTime: number) {
  battle.anim.timeSinceLastParry += deltaTime;
  battle.timeSinceLastHit += deltaTime;
  battle.timeSincePlayerHit += deltaTime;
  battle.timeSinceBossHit += deltaTime;
}

export { directionNumToSwordPos, directionNumToSwordAngle };
