import { AttackAnimation, BattleState, directionNumToSwordPos, directionNumToSwordAngle } from './battle';
import { AudioPlayer } from './audioPlayer';
import { AttackSchedule } from './attackSchedule';
import { AttackInterval } from './editor';
import { VideoPlayer } from './videoPlayer';
import { AttackData, LevelDataV0 } from './leveldata';
import { BattleAnim } from './battleAnim';
import { InputManager } from './inputmanager';
import { ATTACK_COMBO_DAMAGE_MULT, ATTACK_COMBO_STARTUP_TIMES, ATTACK_DURATION, ATTACK_END_LAG, BLOCK_WINDOW, COMBO_EXTEND_TIME, CRITICAL_TIME, PARRY_FORGIVENESS_TIME, PARRY_WINDOW, STAGGER_TIME } from './constants';


const attackedPosition = [0.7, 0.4];
const attackedAngle = Math.PI / 2;

export class BattleLogic {
  private audio: AudioPlayer;
  private attackSchedule: AttackSchedule;
  private level: LevelDataV0;

  constructor(audio: AudioPlayer, level: LevelDataV0) {
    this.audio = audio;
    this.level = level;
    this.attackSchedule = new AttackSchedule(level.attackSchedule); // <-- pass schedule string
  }

  // Helper to calculate total parry duration
  private getParryTotalDuration(battle: BattleState): number {
    let d = BLOCK_WINDOW + 0.1 + Math.min(0.2 * battle.numRecentMissedParries, 0.4);
    return d;
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
      
      if (
        battle.anim.state === AttackAnimation.PARRYING &&
        inputManager.getCurrentTargetDirection() === attack.direction
      ) {
        // Only allow parry if within the parry window
        const parryProgress = battle.anim.timeElapsed / battle.anim.duration;
        const parryTotalDuration = this.getParryTotalDuration(battle);
        const parryWindowProportion = PARRY_WINDOW / parryTotalDuration;
        const blockWindowProportion = BLOCK_WINDOW / parryTotalDuration;
        if (parryProgress < parryWindowProportion) {
          this.successParry(battle, currentTime);
        }  else if (parryProgress < blockWindowProportion) {
          this.blockAttack(battle, attack.damage);
        }
        
        else {
          this.playerTakeDamage(battle, attack.damage);
        }
      } else {
        this.playerTakeDamage(battle, attack.damage);
      }
    }

    // Detect criticals in this frame
    const criticals = this.getCriticalsInInterval(this.level.criticals, prevTime, currentTime);
    if (criticals.length > 0) {
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
  getAttacksInInterval(attackData: AttackData[], startTime: number, endTime: number): AttackData[] {
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

    // No critical logic here
    battle.bossHealth -= 0.1 * damageMult;
    battle.timeSinceBossHit = 0;

    const attackStartPosition: [number, number] = [...battle.anim.endPos];
    const attackEndPosition = directionNumToSwordPos.get((closestDir + 4) % 8)!;
    const endPos: [number, number] = [0.5 + attackEndPosition[0], 0.5 + attackEndPosition[1]];
    endPos[0] += (Math.random() - 0.5) * 0.1;
    endPos[1] += (Math.random() - 0.5) * 0.1;

    const angle = battle.anim.endAngle;

    battle.anim = BattleAnim.attacking(
      attackStartPosition,
      endPos,
      angle,
      ATTACK_DURATION
    );

    this.audio.playEnemyHitSound();
  }

  private doCriticalHit(
    battle: BattleState,
    startPos: [number, number],
    currentDir: number,
    closestDir: number
  ) {
    const attackEndPosition = directionNumToSwordPos.get((closestDir + 4) % 8)!;
    const endPos: [number, number] = [0.5 + attackEndPosition[0], 0.5 + attackEndPosition[1]];
    endPos[0] += (Math.random() - 0.5) * 0.1;
    endPos[1] += (Math.random() - 0.5) * 0.1;

    let damageMult = ATTACK_COMBO_DAMAGE_MULT[battle.hitCombo % ATTACK_COMBO_DAMAGE_MULT.length];
    damageMult *= battle.currentCritical!.multiplier;
    battle.bossHealth -= 0.1 * damageMult;
    battle.timeSinceBossHit = 0;
    battle.lastBossHealth = battle.bossHealth;
    battle.criticalAnimParticles = {
      t: 0,
      particles: Array.from({ length: 7 }, (_, i) => ({
        x: startPos[0],
        y: startPos[1],
        vx: Math.cos(currentDir + (i - 3) * 0.18) * 0.01,
        vy: Math.sin(currentDir + (i - 3) * 0.18) * 0.01,
        life: 2.0,
        gravity: 0.07
      }))
    };
    battle.anim = BattleAnim.criticalHit(
      [startPos[0], startPos[1]],
      endPos,
      currentDir,
      currentDir
    );
    battle.currentCritical = null;
    this.audio.playEnemyHitSound();
  }

  startAttack(battle: BattleState, inputManager: InputManager) {
    var currentCombo = 0;
    if (battle.timeSinceLastHit > COMBO_EXTEND_TIME) {  // Use duration instead of time comparison
      battle.hitCombo = 1;
    } else {
      currentCombo = battle.hitCombo;
      battle.hitCombo += 1;
    }
    battle.timeSinceLastHit = 0;  // Reset duration

    const startPos = [...battle.anim.endPos];
    const currentDir = inputManager.getCurrentTargetDirection();
    const closestDir = this.currentClosestDir(battle);

    if (
      battle.currentCritical &&
      battle.currentCritical.direction === currentDir
    ) {
      this.doCriticalHit(battle, [startPos[0], startPos[1]], currentDir, closestDir);
    } else {
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

      this.audio.playPlayerAttackSound();
    }
  }

  doParry(battle: BattleState, inputManager: InputManager) {
    // Teleport sword to the destination based on current input direction
    const targetDir = inputManager.getCurrentTargetDirection();
    const targetPos = this.getTargetSwordPos(targetDir);
    const targetAngle = directionNumToSwordAngle.get(targetDir)!;
    const parryTotalDuration = this.getParryTotalDuration(battle);
    battle.anim.endPos[0] = targetPos[0];
    battle.anim.endPos[1] = targetPos[1];
    battle.anim.endAngle = targetAngle;
    battle.anim = BattleAnim.parrying(
      [...battle.anim.endPos],
      battle.anim.endAngle,
      parryTotalDuration
    );
  }

  update(battle: BattleState, getCurrentTargetDirection: () => number) {
    if (battle.anim.state === AttackAnimation.NONE) {
      const targetDir = getCurrentTargetDirection();
      const targetAngle = directionNumToSwordAngle.get(targetDir)!;
      const targetPos = this.getTargetSwordPos(targetDir);

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

    // reset missed parries if they haven't parried in a while
    if (battle.timeSinceLastMissedParry > PARRY_FORGIVENESS_TIME) {
      battle.numRecentMissedParries = 0;
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
    this.audio.playParrySound();
    battle.timeSinceLastParry = 0;  // Reset duration
    battle.anim.state = AttackAnimation.NONE;
    // recent missed parries reset
    battle.numRecentMissedParries = 0;
  }

  
  // take half damage, cancel animation
  private blockAttack(battle: BattleState, attackDamage: number) {
    this.audio.playBlockedSound(); 
    battle.lastPlayerHealth = battle.playerHealth;
    battle.playerHealth -= 0.2 * attackDamage * this.level.bossDamageMultiplier;
    battle.anim.state = AttackAnimation.NONE;
    // recent missed parries reset
    battle.numRecentMissedParries = 0;
  }

  private playerTakeDamage(battle: BattleState, attackDamage: number) {
    this.audio.playPlayerHitSound();
    battle.lastPlayerHealth = battle.playerHealth;
    // Use bossDamageMultiplier from level data
    battle.playerHealth -= attackDamage * this.level.bossDamageMultiplier;
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

  // Helper to get sword position for a direction (centered at 0.5, 0.5)
  private getTargetSwordPos(direction: number): [number, number] {
    const pos = directionNumToSwordPos.get(direction)!;
    return [0.5 + pos[0], 0.5 + pos[1]];
  }

  handleAttackSchedule(
    battle: BattleState,
    currentTime: number,
    videoPlayer: VideoPlayer,
    attackIntervals: Map<string, AttackInterval>
  ) {
    this.attackSchedule.handleAttackSchedule(
      battle,
      currentTime,
      videoPlayer,
      attackIntervals,
      this.level.attackSchedule // <-- pass for API compatibility, not used
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
        // if a parry animation is ending, add to recent missed parries
        if (battle.anim.state === AttackAnimation.PARRYING) {
          battle.numRecentMissedParries += 1;
          battle.timeSinceLastMissedParry = 0; // Reset duration
        }

        battle.anim.state = AttackAnimation.NONE;
      }
    }
  }
}
