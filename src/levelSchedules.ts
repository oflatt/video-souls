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

// Usage: ts-node scheduleExamples.ts

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
  console.log(`Copied ${label} level script to ${target}`);
}

copyLevel(targetPath, ZOMBIE_ATTACK_SCHEDULE, "zombie");
copyLevel(crabTargetPath, CRAB_ATTACK_SCHEDULE, "crab");
