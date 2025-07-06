export enum AttackAnimation {
  NONE, PARRYING, ATTACK_STARTING, ATTACKING, STAGGERING
}

export type BattleState = {
  anim: {
    state: AttackAnimation,
    startTime: number,
    endTime: number,
    startPos: [number, number],
    endPos: [number, number],
    startAngle: number,
    endAngle: number,
    lastParryTime: number,
    startYScale: number,
    endYScale: number,
    startXScale: number,
    endXScale: number,
  },
  hitCombo: number,
  hitComboTime: number,
  bufferedInput: string | null,
  playerHealth: number,
  lastPlayerHealth: number,
  lastPlayerHit: number,
  bossHealth: number,
  lastBossHealth: number,
  lastBossHit: number,
  prevTime: number,
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
    anim: {
      state: AttackAnimation.NONE,
      startTime: 0,
      endTime: 0,
      startPos: [0.5, 0.5],
      endPos: [0.5, 0.5],
      startAngle: 0,
      endAngle: 0,
      lastParryTime: -100,
      startYScale: 1.0,
      endYScale: 1.0,
      startXScale: 1.0,
      endXScale: 1.0,
    },
    bufferedInput: null,
    playerHealth: 1.0,
    lastPlayerHealth: 1.0,
    lastPlayerHit: -100000000,
    bossHealth: 1.0,
    lastBossHealth: 1.0,
    lastBossHit: -100000000,
    prevTime: 0,
    hitCombo: 0,
    hitComboTime: -10000000,
    currentInterval: "intro",
  };
}

export { directionNumToSwordPos, directionNumToSwordAngle };
