import { BattleState } from './battle';
import { BossState, BossScheduleResult, AttackInterval } from './editor';
import { VideoPlayer } from './videoPlayer';

export const DEFAULT_ATTACK_SCHEDULE = `
return function(state) {
  // Check if current interval is completed (reached the end time)
  var currentInterval = state.availableIntervals[state.currentInterval];

  // Check if we've reached or passed the end time of the current interval
  if (state.currentTime >= currentInterval.end) {
    // Pick a random attack interval
    var randomIndex = Math.floor(Math.random() * state.intervalNamesAlpha.length);
    var nextInterval = state.intervalNamesAlpha[randomIndex];
    
    return {
      continueNormal: false,
      transitionToInterval: nextInterval,
      intervalOffset: 0
    };
  }
  
  // Continue with current behavior
  return { continueNormal: true };
}`;


export const RUN_EACH_ONCE_FIRST = `
var run_each_once = "uninitialized";

return function(state) {
  if (run_each_once === "uninitialized") {
    run_each_once = state.intervalNamesAlpha.slice();
  }

  // Check if current interval is completed (reached the end time)
  var currentInterval = state.availableIntervals[state.currentInterval];

  // Check if we've reached or passed the end time of the current interval
  if (state.currentTime >= currentInterval.end) {
    // If run_each_once is not empty, pick the next interval from it
    var nextInterval;
    if (run_each_once.length > 0) {
      nextInterval = run_each_once.shift();
    } else {
      // Fallback: pick a random attack interval
      var randomIndex = Math.floor(Math.random() * state.intervalNamesAlpha.length);
      nextInterval = state.intervalNamesAlpha[randomIndex];
    }
    
    return {
      continueNormal: false,
      transitionToInterval: nextInterval,
      intervalOffset: 0
    };
  }
  
  // Continue with current behavior
  return { continueNormal: true };
}`;

export class AttackSchedule {
  private interpreter: any;
  private globalObject: any;
  private scheduleFunctionName: string;

  constructor(attackSchedule: string) {
    this.scheduleFunctionName = "evaluateSchedule";
    const functionCode = `
      var ${this.scheduleFunctionName} = (function () {
        ${attackSchedule}
      })();
    `;
    // Create interpreter with the schedule function loaded and init function
    this.interpreter = new (window as any).Interpreter(functionCode, (interpreter: any, globalObject: any) => {
      this.globalObject = globalObject;
      // Example: add alert API if needed
      // interpreter.setProperty(globalObject, 'alert', interpreter.createNativeFunction(window.alert));
    });
  }

  handleAttackSchedule(
    battle: BattleState,
    currentTime: number,
    videoPlayer: VideoPlayer,
    attackIntervals: Map<string, AttackInterval>,
    attackSchedule: string // kept for API compatibility, but not used
  ) {
    // If we're in the death interval, do nothing (handled outside schedule)
    if (battle.currentInterval === "death") {
      return;
    }

    // Check if boss health is zero or lower and transition to death
    if (battle.bossHealth <= 0) {
      const deathInterval = attackIntervals.get("death");
      if (deathInterval && battle.currentInterval !== "death") {
        battle.currentInterval = "death";
        videoPlayer.seekTo(deathInterval.start, true);
        return;
      }
    }

    const scheduleResult = this.evaluateAttackSchedule(
      battle,
      currentTime,
      attackIntervals
    );

    // Handle schedule result
    if (!scheduleResult.continueNormal && scheduleResult.transitionToInterval) {
      const targetInterval = attackIntervals.get(scheduleResult.transitionToInterval);
      
      if (targetInterval) {
        battle.currentInterval = targetInterval.name;
        
        // Apply interval offset if specified
        const offset = scheduleResult.intervalOffset || 0;
        const seekTime = targetInterval.start + offset;
        videoPlayer.seekTo(seekTime, true);
      }
    }
  }

  private evaluateAttackSchedule(
    battle: BattleState,
    currentTime: number,
    attackIntervals: Map<string, AttackInterval>
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
      const intervalEntries: [string, AttackInterval][] = [];
      for (const [key, value] of availableIntervals) {
        availableIntervalsObj[key] = value;
        if (key !== "intro" && key !== "death") {
          intervalEntries.push([key, value]);
        }
      }
      // Alphabetical
      const intervalNamesAlpha: string[] = [...intervalEntries]
        .map(([key]) => key)
        .sort((a, b) => a.localeCompare(b));
      // By start time
      const intervalNamesByStart: string[] = [...intervalEntries]
        .sort((a, b) => a[1].start - b[1].start)
        .map(([key]) => key);
      // By end time
      const intervalNamesByEnd: string[] = [...intervalEntries]
        .sort((a, b) => a[1].end - b[1].end)
        .map(([key]) => key);

      const bossState = {
        healthPercentage: battle.bossHealth,
        currentInterval: battle.currentInterval,
        currentTime: currentTime,
        intervalElapsedTime: intervalElapsedTime,
        playerHealthPercentage: battle.playerHealth,
        availableIntervals: availableIntervalsObj,
        intervalNamesAlpha: intervalNamesAlpha,
        intervalNamesByStart: intervalNamesByStart,
        intervalNamesByEnd: intervalNamesByEnd
      };

      // Pass bossState as a global variable
      this.interpreter.setProperty(
        this.globalObject,
        'bossStateArg',
        JSON.stringify(bossState)
      );

      // Append code to call the schedule function and store result
      this.interpreter.appendCode(`
        var __scheduleResult = ${this.scheduleFunctionName}(JSON.parse(bossStateArg));
      `);

      // Run the interpreter to completion
      this.interpreter.run();

      // Get the result from the global object
      const result = this.interpreter.getProperty(this.globalObject, '__scheduleResult');
      // Convert result to native object
      const nativeResult = this.interpreter.pseudoToNative(result);

      return nativeResult as BossScheduleResult;
    } catch (error) {
      console.error('Error evaluating attack schedule:', error);
      return { continueNormal: true };
    }
  }
}
