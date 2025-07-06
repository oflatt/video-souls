import { AttackAnimation, BattleState, directionNumToSwordPos, directionNumToSwordAngle } from './battle';
import { AudioPlayer } from './audioPlayer';
import { BossState, BossScheduleResult, AttackInterval } from './editor';

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

  constructor(audio: AudioPlayer) {
    this.audio = audio;
  }

  handleBossAttacks(
    battle: BattleState, 
    currentTime: number, 
    attackData: any[],
    getCurrentTargetDirection: () => number
  ) {
    const attacks = this.getAttacksInInterval(attackData, battle.prevTime, currentTime);
    if (attacks.length > 0) {
      const attack = attacks[0];
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
    battle.lastBossHit = currentTime;

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
    if (currentTime - battle.hitComboTime > COMBO_EXTEND_TIME) {
      battle.hitCombo = 1;
    } else {
      currentCombo = battle.hitCombo;
      battle.hitCombo += 1;
    }
    battle.hitComboTime = currentTime;

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
    battle.anim.lastParryTime = currentTime;
    battle.anim.state = AttackAnimation.NONE;
  }

  private playerTakeDamage(battle: BattleState, currentTime: number) {
    this.audio.playerHit.play();
    battle.lastPlayerHealth = battle.playerHealth;
    battle.playerHealth -= 0.1;
    battle.lastPlayerHit = currentTime;
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
    player: YT.Player,
    attackIntervals: Map<string, AttackInterval>,
    attackSchedule: string
  ) {
    console.log(`[AttackSchedule] Current time: ${currentTime.toFixed(2)}, Current interval: ${battle.currentInterval}, Boss health: ${battle.bossHealth.toFixed(2)}`);
    
    // Check if boss health is zero or lower and transition to death
    if (battle.bossHealth <= 0) {
      const deathInterval = attackIntervals.get("death");
      if (deathInterval && battle.currentInterval !== "death") {
        console.log(`[AttackSchedule] Boss dead, transitioning to death interval`);
        battle.currentInterval = "death";
        player.seekTo(deathInterval.start, true);
        return;
      }
    }

    const scheduleResult = this.evaluateAttackSchedule(
      battle,
      currentTime,
      attackIntervals,
      attackSchedule
    );

    console.log(`[AttackSchedule] Schedule result:`, scheduleResult);

    // Handle schedule result
    if (!scheduleResult.continueNormal && scheduleResult.transitionToInterval) {
      const targetInterval = attackIntervals.get(scheduleResult.transitionToInterval);
      
      if (targetInterval) {
        console.log(`[AttackSchedule] Transitioning from "${battle.currentInterval}" to "${targetInterval.name}" (${targetInterval.start.toFixed(2)}-${targetInterval.end.toFixed(2)})`);
        battle.currentInterval = targetInterval.name;
        
        // Apply interval offset if specified
        const offset = scheduleResult.intervalOffset || 0;
        const seekTime = targetInterval.start + offset;
        console.log(`[AttackSchedule] Seeking to time: ${seekTime.toFixed(2)}`);
        player.seekTo(seekTime, true);
      } else {
        console.warn(`[AttackSchedule] Target interval "${scheduleResult.transitionToInterval}" not found`);
      }
    } else {
      console.log(`[AttackSchedule] Continuing normal behavior in interval "${battle.currentInterval}"`);
    }
  }

  private evaluateAttackSchedule(
    battle: BattleState,
    currentTime: number,
    attackIntervals: Map<string, AttackInterval>,
    attackSchedule: string
  ): BossScheduleResult {
    try {
      // Create available intervals map
      const availableIntervals = new Map();
      for (const [iname, interval] of attackIntervals) {
        availableIntervals.set(iname, interval);
      }

      console.log(`[AttackSchedule] Available intervals:`, Array.from(availableIntervals.keys()));

      // Calculate interval elapsed time
      let intervalElapsedTime = 0;
      const currentInterval = availableIntervals.get(battle.currentInterval);
      if (currentInterval) {
        intervalElapsedTime = currentTime - currentInterval.start;
        console.log(`[AttackSchedule] Current interval "${battle.currentInterval}": start=${currentInterval.start.toFixed(2)}, end=${currentInterval.end.toFixed(2)}, elapsed=${intervalElapsedTime.toFixed(2)}`);
      } else {
        console.log(`[AttackSchedule] Current interval "${battle.currentInterval}" not found in available intervals`);
      }

      // Create boss state - convert Map to plain object for the interpreter
      const availableIntervalsObj: Record<string, AttackInterval> = {};
      for (const [key, value] of availableIntervals) {
        availableIntervalsObj[key] = value;
      }

      const bossState = {
        healthPercentage: battle.bossHealth,
        currentInterval: battle.currentInterval,
        currentTime: currentTime,
        intervalElapsedTime: intervalElapsedTime,
        playerHealthPercentage: battle.playerHealth,
        availableIntervals: availableIntervalsObj
      };

      console.log(`[AttackSchedule] Boss state:`, {
        healthPercentage: bossState.healthPercentage,
        currentInterval: bossState.currentInterval,
        currentTime: bossState.currentTime.toFixed(2),
        intervalElapsedTime: bossState.intervalElapsedTime.toFixed(2),
        playerHealthPercentage: bossState.playerHealthPercentage,
        availableIntervalCount: Object.keys(bossState.availableIntervals).length
      });

      // Create the function code that returns the schedule result
      const functionCode = `
        var bossState = bossStateArg;
        var result = (${attackSchedule.toString()})(bossState);
        result;
      `;

      // Create interpreter with initialization function
      const interpreter = new (window as any).Interpreter(functionCode, (interpreter: any, globalObject: any) => {
        // Add bossState to global scope
        interpreter.setProperty(globalObject, 'bossStateArg', interpreter.nativeToPseudo(bossState));
        
        // Add Math object and methods
        const mathObject = interpreter.createObjectProto(interpreter.OBJECT_PROTO);
        interpreter.setProperty(mathObject, 'floor', interpreter.createNativeFunction((x: number) => Math.floor(x)));
        interpreter.setProperty(mathObject, 'random', interpreter.createNativeFunction(() => Math.random()));
        interpreter.setProperty(globalObject, 'Math', mathObject);
        
        // Add Object.keys method directly to global scope
        interpreter.setProperty(globalObject, 'ObjectKeys', interpreter.createNativeFunction((obj: any) => {
          return interpreter.nativeToPseudo(Object.keys(interpreter.pseudoToNative(obj)));
        }));
      });

      // Run the interpreter
      interpreter.run();
      
      // Get the result and convert back to native
      const result = interpreter.pseudoToNative(interpreter.value);
      console.log(`[AttackSchedule] Raw interpreter result:`, result);
      
      // Log debug information if available
      if (result.debug) {
        console.log(`[AttackSchedule] DEBUG - Reason: ${result.debug.reason}`);
        console.log(`[AttackSchedule] DEBUG - Current Interval: ${result.debug.currentInterval}`);
        console.log(`[AttackSchedule] DEBUG - Available Attack Intervals: [${result.debug.availableAttackIntervals.join(', ')}]`);
        console.log(`[AttackSchedule] DEBUG - Boss Health: ${result.debug.bossHealth.toFixed(3)}`);
        console.log(`[AttackSchedule] DEBUG - Current Time: ${result.debug.currentTime.toFixed(2)}`);
        if (result.debug.intervalEndTime !== undefined) {
          console.log(`[AttackSchedule] DEBUG - Interval End Time: ${result.debug.intervalEndTime.toFixed(2)}`);
        }
        if (result.debug.randomChoice) {
          console.log(`[AttackSchedule] DEBUG - Random Choice: ${result.debug.randomChoice}`);
        }
      }
      
      return result as BossScheduleResult;
    } catch (error) {
      console.error('Error evaluating attack schedule:', error);
      console.error('Attack schedule code:', attackSchedule);
      return { continueNormal: true };
    }
  }
}
