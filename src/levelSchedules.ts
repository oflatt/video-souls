export const RUN_EACH_ONCE_FIRST = `
var run_each_once = "uninitialized";

return function(state) {
  if (run_each_once === "uninitialized") {
    run_each_once = state.intervalNamesAlpha.slice();
  }

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

export const ZOMBIE_ATTACK_SCHEDULE = `
return function(state) {
  var currentInterval = state.availableIntervals[state.currentInterval];

  // Check if we've reached or passed the end time of the current interval
  if (state.currentTime >= currentInterval.end) {
    // Pick a random attack interval, but interval '5' is half as likely
    var intervals = state.intervalNamesAlpha.slice();
    var weighted = [];
    for (var i = 0; i < intervals.length; i++) {
      if (intervals[i] === "5") {
        weighted.push("5"); // only one entry for '5'
      } else {
        weighted.push(intervals[i]);
        weighted.push(intervals[i]); // double entry for others
      }
    }
    var randomIndex = Math.floor(Math.random() * weighted.length);
    var nextInterval = weighted[randomIndex];

    // pick again if the interval is the same as the current one
    if (nextInterval === state.currentInterval) {
      nextInterval = weighted[Math.floor(Math.random() * weighted.length)];
    }

    return {
      continueNormal: false,
      transitionToInterval: nextInterval,
      intervalOffset: 0
    };
  }
  // Continue with current behavior
  return { continueNormal: true };
};`;

export const CRAB_ATTACK_SCHEDULE = `
return function(state) {
  // Check if current interval is completed (reached the end time)
  var currentInterval = state.availableIntervals[state.currentInterval];

  // Check if we've reached or passed the end time of the current interval
  if (state.currentTime >= currentInterval.end) {
    // Pick a random attack interval, but interval '5' is 1/3 as likely
    var intervals = state.intervalNamesAlpha.slice();
    var weighted = [];
    for (var i = 0; i < intervals.length; i++) {
      if (intervals[i] === "5") {
        weighted.push("5"); // only one entry for '5'
      } else {
        weighted.push(intervals[i]);
        weighted.push(intervals[i]);
        weighted.push(intervals[i]); // triple entry for others
      }
    }
    var randomIndex = Math.floor(Math.random() * weighted.length);
    var nextInterval = weighted[randomIndex];

    // pick again if the interval is the same as the current one
    if (nextInterval === state.currentInterval) {
      nextInterval = weighted[Math.floor(Math.random() * weighted.length)];
    }

    return {
      continueNormal: false,
      transitionToInterval: nextInterval,
      intervalOffset: 0
    };
  }
  // Continue with current behavior
  return { continueNormal: true };
};`;

export const PING_PONG_PLAYER_SCHEDULE = `
return function(state) {
  var currentInterval = state.availableIntervals[state.currentInterval];

  // Check if we've reached or passed the end time of the current interval
  if (state.currentTime >= currentInterval.end) {
    var intervals = state.intervalNamesAlpha.slice();
    var weighted = [];
    var lowHealth = state.healthPercentage < (1/3);

    for (var i = 0; i < intervals.length; i++) {
      if (intervals[i] === "3") {
        if (lowHealth) {
          // If under 1/3 health, interval 3 is 3x as likely
          weighted.push("3");
          weighted.push("3");
          weighted.push("3");
        }
        // If not low health, do not add interval 3 at all
      } else {
        weighted.push(intervals[i]);
      }
    }

    // If not low health and weighted is empty (all intervals were "3"), fallback to all intervals except "3"
    if (weighted.length === 0) {
      weighted = intervals.filter(function(x) { return x !== "3"; });
      // If still empty, fallback to all intervals
      if (weighted.length === 0) weighted = intervals.slice();
    }

    var randomIndex = Math.floor(Math.random() * weighted.length);
    var nextInterval = weighted[randomIndex];

    // pick again if the interval is the same as the current one
    if (nextInterval === state.currentInterval) {
      nextInterval = weighted[Math.floor(Math.random() * weighted.length)];
    }

    return {
      continueNormal: false,
      transitionToInterval: nextInterval,
      intervalOffset: 0
    };
  }
  // Continue with current behavior
  return { continueNormal: true };
};
`;

export const TUTORIAL_SCHEDULE = `
var tutorialStep = 0;
var orderedIntervals = ["intro", "0", "1", "3", "2", "4", "6", "7"];

return function(state) {
  var currentIntervalName = state.currentInterval;
  var currentInterval = state.availableIntervals[currentIntervalName];

  // Wait until current interval ends
  if (state.currentTime >= currentInterval.end) {
    // Check if we need to validate parryOrBlockCombo
    if ((currentIntervalName === "0" && state.parryOrBlockCombo < 2) ||
        ((currentIntervalName === "3" || currentIntervalName === "4" || currentIntervalName === "7") &&
         state.parryOrBlockCombo < 1)) {
      return { continueNormal: false, transitionToInterval: currentIntervalName, intervalOffset: 0 }; // Wait until parry requirement met
    }

    // Advance to next step or to death
    tutorialStep++;
    if (tutorialStep >= orderedIntervals.length) {
      return {
        continueNormal: false,
        transitionToInterval: "death",
        intervalOffset: 0
      };
    }

    var next = orderedIntervals[tutorialStep];
    return {
      continueNormal: false,
      transitionToInterval: next,
      intervalOffset: 0
    };
  }

  // Continue current interval
  return { continueNormal: true };
};
`

// Usage: ts-node src/levelSchedules.ts

import * as fs from "fs";
import * as path from "path";

// Path to the target 01.json file
const targetPath = path.resolve(__dirname, "../levels/01.json");
// Path to the target 02.json file
const crabTargetPath = path.resolve(__dirname, "../levels/02.json");

function copyLevel(target: string, schedule: string, label: string) {
  const json = fs.readFileSync(target, "utf8");
  const data = JSON.parse(json);
  data.attackSchedule = schedule;
  fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf8");
}

copyLevel(targetPath, ZOMBIE_ATTACK_SCHEDULE, "zombie");
copyLevel(crabTargetPath, CRAB_ATTACK_SCHEDULE, "crab");
copyLevel(path.resolve(__dirname, "../levels/04.json"), PING_PONG_PLAYER_SCHEDULE, "ping pong player");
copyLevel(path.resolve(__dirname, "../levels/00.json"), TUTORIAL_SCHEDULE, "tutorial");
