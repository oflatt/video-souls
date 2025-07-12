import { AttackAnimation, BattleState, directionNumToSwordPos, directionNumToSwordAngle } from './battle';
import { AudioPlayer } from './audioPlayer';
import { AttackSchedule } from './attackSchedule';
import { AttackInterval } from './editor';
import { VideoPlayer } from './videoPlayer';

const ATTACK_COMBO_STARTUP_TIMES = [0.2, 0.2, 0.3, 0.2, 0.4];
const ATTACK_COMBO_DAMAGE_MULT = [1.0, 1.1, 1.3, 1.0, 2.2];
const ATTACK_END_LAG = 0.15;
const COMBO_EXTEND_TIME = 3.0;
const STAGGER_TIME = 0.4;
const PARRY_WINDOW = 0.2;
const PARRY_END_LAG = 0.2;

const attackedPosition = [0.7, 0.4];
const attackedAngle = Math.PI / 2;

export class BattleLogic {
  private audio: AudioPlayer;
  private attackSchedule: AttackSchedule;

  constructor(audio: AudioPlayer) {
    this.audio = audio;
    this.attackSchedule = new AttackSchedule();
  }

  handleBossAttacks(
    battle: BattleState, 
    currentTime: number,
    prevTime: number,
    attackData: any[],
    getCurrentTargetDirection: () => number
  ) {
    const attacks = this.getAttacksInInterval(attackData, prevTime, currentTime);
    if (attacks.length > 0) {
      const attack = attacks[0];
      console.log(`Handling attack at time ${attack.time} with direction ${attack.direction}`);
      if (battle.anim.state === AttackAnimation.PARRYING && getCurrentTargetDirection() === attack.direction) {
        this.successParry(battle, currentTime);
      } else {
        this.playerTakeDamage(battle, currentTime);
      }
    }
  }

  // gets the attack direction, if any, for this time period
  // starttime exclusive, endtime inclusive
  getAttacksInInterval(attackData: any[], startTime: number, endTime: number) {
    return attackData.filter(attack => attack.time > startTime && attack.time <= endTime);
  }

  doAttack(battle: BattleState, currentTime: number) {
    battle.lastBossHealth = battle.bossHealth;
    battle.bossHealth -= 0.1 * ATTACK_COMBO_DAMAGE_MULT[battle.hitCombo % ATTACK_COMBO_DAMAGE_MULT.length];
    battle.timeSinceBossHit = 0;  // Reset duration

    battle.anim.state = AttackAnimation.ATTACKING;
    battle.anim.startTime = currentTime;
    battle.anim.endTime = currentTime + ATTACK_END_LAG;

    const closestDir = this.currentClosestDir(battle);
    const attackStartPosition: [number, number] = [...battle.anim.endPos];
    battle.anim.startPos = [attackStartPosition[0], attackStartPosition[1]];
    const attackEndPosition = directionNumToSwordPos.get((closestDir + 4) % 8)!;
    battle.anim.endPos = [0.5 + attackEndPosition[0], 0.5 + attackEndPosition[1]];
    battle.anim.endPos[0] += (Math.random() - 0.5) * 0.1;
    battle.anim.endPos[1] += (Math.random() - 0.5) * 0.1;

    const currentDir = battle.anim.endAngle;
    battle.anim.startAngle = currentDir;
    battle.anim.endAngle = currentDir;
    battle.anim.startYScale = 1.0;
    battle.anim.endYScale = -1.0;
    battle.anim.startXScale = 1.0;
    battle.anim.endXScale = 1.0;

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

    battle.anim.state = AttackAnimation.ATTACK_STARTING;
    battle.anim.startTime = currentTime;
    battle.anim.endTime = currentTime + ATTACK_COMBO_STARTUP_TIMES[currentCombo % ATTACK_COMBO_STARTUP_TIMES.length];

    const closestDir = this.currentClosestDir(battle);
    battle.anim.startPos = [...battle.anim.endPos];
    const attackEndPosition = directionNumToSwordPos.get(closestDir)!;
    battle.anim.endPos = [0.5 + attackEndPosition[0]*1.2, 0.5 + attackEndPosition[1]*1.2];
    battle.anim.endPos[0] += (Math.random() - 0.5) * 0.1;
    battle.anim.endPos[1] += (Math.random() - 0.5) * 0.1;

    const attackDir = this.normalize(directionNumToSwordPos.get(closestDir)!);
    const targetDir = Math.atan2(attackDir[1], attackDir[0]);
    const currentDir = battle.anim.endAngle;
    battle.anim.startAngle = currentDir;
    battle.anim.endAngle = targetDir;
    battle.anim.startYScale = 1.0;
    battle.anim.endYScale = 0.8;
    battle.anim.startXScale = 1.0;
    battle.anim.endXScale = 1.0;

    this.audio.playerAttack.play();
  }

  doParry(battle: BattleState, currentTime: number) {
    battle.anim.state = AttackAnimation.PARRYING;
    battle.anim.startTime = currentTime;
    battle.anim.endTime = currentTime + PARRY_WINDOW + PARRY_END_LAG;
    battle.anim.startPos = [...battle.anim.endPos];
    battle.anim.endPos = [...battle.anim.endPos];
    battle.anim.startAngle = battle.anim.endAngle;
    battle.anim.endAngle = battle.anim.startAngle - (Math.PI / 10);
    battle.anim.startYScale = 1.0;
    battle.anim.endYScale = 1.0;
    battle.anim.startXScale = 1.0;
    battle.anim.endXScale = 1.0;
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
    battle.anim.timeSinceLastParry = 0;  // Reset duration
    battle.anim.state = AttackAnimation.NONE;
  }

  private playerTakeDamage(battle: BattleState, currentTime: number) {
    this.audio.playerHit.play();
    battle.lastPlayerHealth = battle.playerHealth;
    battle.playerHealth -= 0.1;
    battle.timeSincePlayerHit = 0;  // Reset duration
    battle.hitCombo = 0;

    battle.anim.state = AttackAnimation.STAGGERING;
    battle.anim.startTime = currentTime;
    battle.anim.endTime = currentTime + STAGGER_TIME;
    battle.anim.startPos = [...battle.anim.endPos];
    battle.anim.endPos = [
      attackedPosition[0] + (Math.random() - 0.5) * 0.1,
      attackedPosition[1] + (Math.random() - 0.5) * 0.1,
    ];
    battle.anim.startAngle = battle.anim.endAngle;
    battle.anim.endAngle = attackedAngle;
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
}
