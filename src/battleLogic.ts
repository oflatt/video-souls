import { AttackAnimation, BattleState, directionNumToSwordPos, directionNumToSwordAngle } from './battle';
import { AudioPlayer } from './audioPlayer';
import { AttackSchedule } from './attackSchedule';
import { AttackInterval } from './editor';
import { VideoPlayer } from './videoPlayer';
import { LevelDataV0 } from './leveldata';
import { BattleAnim } from './battleAnim';
import { InputManager } from './inputmanager';

const ATTACK_COMBO_STARTUP_TIMES = [0.2, 0.2, 0.3, 0.2, 0.4];
const ATTACK_COMBO_DAMAGE_MULT = [1.0, 1.1, 1.3, 1.0, 2.2];
const ATTACK_DURATION = 0.3;
const ATTACK_END_LAG = 0.3;
const COMBO_EXTEND_TIME = 3.0;
const STAGGER_TIME = 0.4;
const PARRY_WINDOW = 0.2;
const PARRY_END_LAG = 0.2;
const CRITICAL_TIME = 2.5; // Duration (seconds) a critical is active

const attackedPosition = [0.7, 0.4];
const attackedAngle = Math.PI / 2;

export class BattleLogic {
  private audio: AudioPlayer;
  private attackSchedule: AttackSchedule;
  private level: LevelDataV0;

  constructor(audio: AudioPlayer, level: LevelDataV0) {
    this.audio = audio;
    this.attackSchedule = new AttackSchedule();
    this.level = level;
  }

  handleBossAttacks(
    battle: BattleState, 
    currentTime: number,
    prevTime: number,
    attackData: any[],
    inputManager: InputManager
  ) {
    const attacks = this.getAttacksInInterval(attackData, prevTime, currentTime);
    if (attacks.length > 0) {
      const attack = attacks[0];
      if (battle.anim.state === AttackAnimation.PARRYING && inputManager.getCurrentTargetDirection() === attack.direction) {
        this.successParry(battle, currentTime);
      } else {
        this.playerTakeDamage(battle, currentTime);
      }
    }

    // Detect criticals in this frame
    const criticals = this.getCriticalsInInterval(this.level.criticals, prevTime, currentTime);
    if (criticals.length > 0) {
      console.log("Critical detected:", criticals[0]);
      const crit = criticals[0];
      battle.currentCritical = {
        direction: crit.direction,
        multiplier: crit.multiplier,
        timeLeft: CRITICAL_TIME
      };
    }
  }

  // gets the attack direction, if any, for this time period
  // starttime exclusive, endtime inclusive
  getAttacksInInterval(attackData: any[], startTime: number, endTime: number) {
    return attackData.filter(attack => attack.time > startTime && attack.time <= endTime);
  }

  // gets the criticals, if any, for this time period
  // starttime exclusive, endtime inclusive
  getCriticalsInInterval(criticalData: any[], startTime: number, endTime: number) {
    return criticalData.filter(crit => crit.time > startTime && crit.time <= endTime);
  }

  doAttack(battle: BattleState, inputManager: InputManager) {
    battle.lastBossHealth = battle.bossHealth;

    let damageMult = ATTACK_COMBO_DAMAGE_MULT[battle.hitCombo % ATTACK_COMBO_DAMAGE_MULT.length];
    const closestDir = this.currentClosestDir(battle);
    const currentDir = inputManager.getCurrentTargetDirection();
    let didCritical = false;
    if (
      battle.currentCritical &&
      battle.currentCritical.direction === currentDir
    ) {
      damageMult *= battle.currentCritical.multiplier;
      battle.currentCritical = null;
      didCritical = true;
    }

    battle.bossHealth -= 0.1 * damageMult;
    battle.timeSinceBossHit = 0;

    const attackStartPosition: [number, number] = [...battle.anim.endPos];
    const attackEndPosition = directionNumToSwordPos.get((closestDir + 4) % 8)!;
    const endPos: [number, number] = [0.5 + attackEndPosition[0], 0.5 + attackEndPosition[1]];
    endPos[0] += (Math.random() - 0.5) * 0.1;
    endPos[1] += (Math.random() - 0.5) * 0.1;

    const angle = battle.anim.endAngle;

    if (didCritical) {
      console.log("Critical hit detected, applying critical animation");
      battle.criticalAnimParticles = {
        t: 0,
        particles: Array.from({ length: 7 }, (_, i) => ({
          x: attackStartPosition[0],
          y: attackStartPosition[1],
          vx: Math.cos(angle + (i - 3) * 0.18) * 0.01,
          vy: Math.sin(angle + (i - 3) * 0.18) * 0.01,
          life: 2.0, // particles last 2 seconds
          gravity: 0.07
        }))
      };
      battle.anim = BattleAnim.criticalHit(
        attackStartPosition,
        endPos,
        angle,
        angle,
        0.18
      );
    } else {
      battle.anim = BattleAnim.attacking(
        attackStartPosition,
        endPos,
        angle,
        ATTACK_DURATION
      );
    }

    this.audio.enemyHit.play();
  }

  startAttack(battle: BattleState, currentTime: number) {
    var currentCombo = 0;
    if (battle.timeSinceLastHit > COMBO_EXTEND_TIME) {  // Use duration instead of time comparison
      battle.hitCombo = 1;
    } else {
      currentCombo = battle.hitCombo;
      battle.hitCombo += 1;
    }
    battle.timeSinceLastHit = 0;  // Reset duration

    const closestDir = this.currentClosestDir(battle);
    const startPos = [...battle.anim.endPos];
    const attackEndPosition = directionNumToSwordPos.get(closestDir)!;
    const endPos: [number, number] = [
      0.5 + attackEndPosition[0] * 1.2,
      0.5 + attackEndPosition[1] * 1.2
    ];
    endPos[0] += (Math.random() - 0.5) * 0.1;
    endPos[1] += (Math.random() - 0.5) * 0.1;

    const attackDir = this.normalize(directionNumToSwordPos.get(closestDir)!);
    const targetDir = Math.atan2(attackDir[1], attackDir[0]);
    const currentDir = battle.anim.endAngle;

    battle.anim = BattleAnim.attackStarting(
      [startPos[0], startPos[1]],
      endPos,
      currentDir,
      targetDir,
      ATTACK_COMBO_STARTUP_TIMES[currentCombo % ATTACK_COMBO_STARTUP_TIMES.length]
    );

    this.audio.playerAttack.play();
  }

  doParry(battle: BattleState) {
    battle.anim = BattleAnim.parrying(
      [...battle.anim.endPos],
      battle.anim.endAngle,
      PARRY_WINDOW + PARRY_END_LAG
    );
  }

  updateSwordPosition(battle: BattleState, getCurrentTargetDirection: () => number) {
    if (battle.anim.state === AttackAnimation.NONE) {
      const targetAngle = directionNumToSwordAngle.get(getCurrentTargetDirection())!;
      var targetPos = [...directionNumToSwordPos.get(getCurrentTargetDirection())!];
      targetPos[0] += 0.5;
      targetPos[1] += 0.5;

      if (Math.abs(battle.anim.endPos[0] - targetPos[0]) < 0.01 && Math.abs(battle.anim.endPos[1] - targetPos[1]) < 0.01) {
        battle.anim.endPos[0] = targetPos[0];
        battle.anim.endPos[1] = targetPos[1];
      } else {
        battle.anim.endPos[0] += (targetPos[0] - battle.anim.endPos[0]) / 20;
        battle.anim.endPos[1] += (targetPos[1] - battle.anim.endPos[1]) / 20;
      }

      if (Math.abs(battle.anim.endAngle - targetAngle) < 0.01) {
        battle.anim.endAngle = targetAngle;
      } else {
        var newAngle = battle.anim.endAngle + (targetAngle - battle.anim.endAngle) / 20;
        if (Math.abs(targetAngle - battle.anim.endAngle) > Math.PI) {
          newAngle = battle.anim.endAngle + (targetAngle - battle.anim.endAngle + Math.PI * 2) / 20;
        }
        battle.anim.endAngle = newAngle;
      }
    }
  }

  currentClosestDir(battle: BattleState) {
    var closestDir = 1;
    var closestDist = 100000000;
    for (let i = 0; i < 8; i++) {
      const dist = Math.hypot(battle.anim.endPos[0] - (0.5 + directionNumToSwordPos.get(i)![0]), battle.anim.endPos[1] - (0.5 + directionNumToSwordPos.get(i)![1]));
      if (dist < closestDist) {
        closestDist = dist;
        closestDir = i;
      }
    }
    return closestDir;
  }

  private successParry(battle: BattleState, currentTime: number) {
    this.audio.parrySound.play();
    battle.timeSinceLastParry = 0;  // Reset duration
    battle.anim.state = AttackAnimation.NONE;
  }

  private playerTakeDamage(battle: BattleState, currentTime: number) {
    this.audio.playerHit.play();
    battle.lastPlayerHealth = battle.playerHealth;
    // Use bossDamageMultiplier from level data
    battle.playerHealth -= 0.1 * this.level.bossDamageMultiplier;
    battle.timeSincePlayerHit = 0;  // Reset duration
    battle.hitCombo = 0;

    battle.anim = BattleAnim.staggering(
      [...battle.anim.endPos],
      [
        attackedPosition[0] + (Math.random() - 0.5) * 0.1,
        attackedPosition[1] + (Math.random() - 0.5) * 0.1,
      ],
      battle.anim.endAngle,
      attackedAngle,
      STAGGER_TIME
    );
  }

  private normalize(vec: [number, number]) {
    const [x, y] = vec;
    const length = Math.sqrt(x * x + y * y);
    return [x / length, y / length];
  }

  handleAttackSchedule(
    battle: BattleState,
    currentTime: number,
    videoPlayer: VideoPlayer,
    attackIntervals: Map<string, AttackInterval>,
    attackSchedule: string
  ) {
    this.attackSchedule.handleAttackSchedule(
      battle,
      currentTime,
      videoPlayer,
      attackIntervals,
      attackSchedule
    );
  }

  handleAnimations(
    battle: BattleState,
    inputManager: InputManager
  ) {
    if (battle.anim.state !== AttackAnimation.NONE && battle.anim.isOver()) {
      if (battle.anim.state === AttackAnimation.ATTACK_STARTING) {
        this.doAttack(battle, inputManager);
      } else if (battle.anim.state === AttackAnimation.ATTACKING) {
        // Transition to ATTACK_END_LAG animation
        battle.anim = BattleAnim.attackEndLag(
          [...battle.anim.endPos],
          battle.anim.endAngle,
          ATTACK_END_LAG
        );
      } else {
        battle.anim.state = AttackAnimation.NONE;
      }
    }
  }
}
