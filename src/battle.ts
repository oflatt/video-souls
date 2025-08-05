import { BattleAnim } from './battleAnim';

export enum AttackAnimation {
  NONE, PARRYING, ATTACK_STARTING, ATTACKING, ATTACK_END_LAG, STAGGERING
}

export type CriticalAnimParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  gravity: number; // <-- new property
};

export type CriticalAnimParticles = {
  t: number;
  particles: CriticalAnimParticle[];
};

export type BattleState = {
  anim: BattleAnim,
  timeSinceLastParry: number;
  timeSinceLastBlock: number;
  hitCombo: number,
  parryCombo: number,
  parryOrBlockCombo: number,
  timeSinceLastHit: number, 
  bufferedInput: string | null,
  playerHealth: number,
  lastPlayerHealth: number,
  timeSincePlayerHit: number,
  bossHealth: number,
  lastBossHealth: number,
  timeSinceBossHit: number,
  currentInterval: string,
  currentCritical: { direction: number, multiplier: number, timeLeft: number } | null,
  criticalAnimParticles?: CriticalAnimParticles // <-- typed property
  numRecentMissedParries: number;
  timeSinceLastMissedParry: number;
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
    timeSinceLastParry: 1000,  // Large initial value
    timeSinceLastBlock: 1000,  // Large initial value
    hitCombo: 0,
    parryCombo: 0,
    parryOrBlockCombo: 0,
    timeSinceLastHit: 1000,  // Large initial value
    bufferedInput: null,
    playerHealth: 1.0,
    lastPlayerHealth: 1.0,
    timeSincePlayerHit: 1000,  // Large initial value
    bossHealth: 1.0,
    lastBossHealth: 1.0,
    timeSinceBossHit: 1000,  // Large initial value
    currentInterval: "intro",
    currentCritical: null,
    criticalAnimParticles: undefined,
    numRecentMissedParries: 0,
    timeSinceLastMissedParry: 1000.0,
  };
}

// Helper function to update time and handle time jumps
export function updateBattleTime(battle: BattleState, deltaTime: number) {
  battle.anim.timeElapsed += deltaTime;
  battle.anim.timeElapsed = Math.min(battle.anim.timeElapsed, battle.anim.duration); 
  battle.timeSinceLastParry += deltaTime;
  battle.timeSinceLastBlock += deltaTime;
  battle.timeSinceLastHit += deltaTime;
  battle.timeSincePlayerHit += deltaTime;
  battle.timeSinceBossHit += deltaTime;
  if (battle.currentCritical) {
    battle.currentCritical.timeLeft -= deltaTime;
    if (battle.currentCritical.timeLeft <= 0) {
      battle.currentCritical = null;
    }
  }

  battle.timeSinceLastMissedParry += deltaTime;
}

export { directionNumToSwordPos, directionNumToSwordAngle };
