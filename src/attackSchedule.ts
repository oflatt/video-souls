import { BattleState } from './battle';
import { BossState, BossScheduleResult, AttackInterval } from './editor';

export class AttackSchedule {
  handleAttackSchedule(
    battle: BattleState,
    currentTime: number,
    player: YT.Player,
    attackIntervals: Map<string, AttackInterval>,
    attackSchedule: string
  ) {
    // Check if boss health is zero or lower and transition to death
    if (battle.bossHealth <= 0) {
      const deathInterval = attackIntervals.get("death");
      if (deathInterval && battle.currentInterval !== "death") {
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

    // Handle schedule result
    if (!scheduleResult.continueNormal && scheduleResult.transitionToInterval) {
      const targetInterval = attackIntervals.get(scheduleResult.transitionToInterval);
      
      if (targetInterval) {
        battle.currentInterval = targetInterval.name;
        
        // Apply interval offset if specified
        const offset = scheduleResult.intervalOffset || 0;
        const seekTime = targetInterval.start + offset;
        player.seekTo(seekTime, true);
      }
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

      // Calculate interval elapsed time
      let intervalElapsedTime = 0;
      const currentInterval = availableIntervals.get(battle.currentInterval);
      if (currentInterval) {
        intervalElapsedTime = currentTime - currentInterval.start;
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

      // Serialize boss state to JSON for the interpreter
      const bossStateJson = JSON.stringify(bossState);

      // Create the function code that wraps the schedule function and passes data as parameters
      const functionCode = `
        function evaluateSchedule(bossStateJson) {
          var bossState = JSON.parse(bossStateJson);
          var result = (${attackSchedule.toString()})(bossState);
          return JSON.stringify(result);
        }
        evaluateSchedule(bossStateJsonArg);
      `;

      // Create interpreter with initialization function
      const interpreter = new (window as any).Interpreter(functionCode, (interpreter: any, globalObject: any) => {
        // Add bossState JSON as a parameter
        interpreter.setProperty(globalObject, 'bossStateJsonArg', bossStateJson);
        
        // Add Math object and methods
        const mathObject = interpreter.createObjectProto(interpreter.OBJECT_PROTO);
        interpreter.setProperty(mathObject, 'floor', interpreter.createNativeFunction((x: number) => Math.floor(x)));
        interpreter.setProperty(mathObject, 'random', interpreter.createNativeFunction(() => Math.random()));
        interpreter.setProperty(globalObject, 'Math', mathObject);
      });

      // Run the interpreter
      interpreter.run();
      
      // Get the result and parse it back to native object
      const resultJson = interpreter.value;
      const result = JSON.parse(resultJson);
      
      return result as BossScheduleResult;
    } catch (error) {
      console.error('Error evaluating attack schedule:', error);
      console.error('Attack schedule code:', attackSchedule);
      return { continueNormal: true };
    }
  }
}
