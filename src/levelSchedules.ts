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

export const LOAN_SHARK_SCHEDULE = `
var didStartAttack = false;
var didSpecialAttack = false;
return function(state) {
  console.log('Loan Shark health:', state.healthPercentage);
  var currentInterval = state.availableIntervals[state.currentInterval];
  // Always start with attack 0 at the beginning
  if (!didStartAttack) {
    didStartAttack = true;
    return {
      continueNormal: false,
      transitionToInterval: "0",
      intervalOffset: 0
    };
  }
  // If health is below 0.6 and we haven't done attack 2 yet, do it once
  if (state.healthPercentage < 0.6 && !didSpecialAttack) {
    didSpecialAttack = true;
    console.log('Loan Shark: Doing special attack 2!');
    return {
      continueNormal: false,
      transitionToInterval: "2",
      intervalOffset: 0
    };
  }
  // After doing attack 2, resume normal behavior (excluding 2)
  if (state.currentTime >= currentInterval.end) {
    var intervals = state.intervalNamesAlpha.filter(function(x) { return x !== "2"; });
    var randomIndex = Math.floor(Math.random() * intervals.length);
    var nextInterval = intervals[randomIndex];
    // pick again if the interval is the same as the current one
    if (nextInterval === state.currentInterval) {
      nextInterval = intervals[Math.floor(Math.random() * intervals.length)];
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
`

// Usage: ts-node src/levelSchedules.ts

import * as fs from "fs";
import * as path from "path";

const LEVELS_DIR = path.resolve(__dirname, "../levels");

function findLevelPathByTitle(title: string): string | null {
  const files = fs.readdirSync(LEVELS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(LEVELS_DIR, file);
    try {
      const json = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(json);
      if (data.title === title) {
        return filePath;
      }
    } catch {}
  }
  return null;
}

function copyLevelByTitle(title: string, schedule: string) {
  const target = findLevelPathByTitle(title);
  if (!target) {
    console.warn(`Level with title '${title}' not found.`);
    return;
  }
  const json = fs.readFileSync(target, "utf8");
  const data = JSON.parse(json);
  data.attackSchedule = schedule;
  fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf8");
  console.log(`Updated attackSchedule for level '${title}' in file ${target}`);
}

copyLevelByTitle("Zombie", ZOMBIE_ATTACK_SCHEDULE);
copyLevelByTitle("Crab", CRAB_ATTACK_SCHEDULE);
copyLevelByTitle("Ping Pong Pain", PING_PONG_PLAYER_SCHEDULE);
copyLevelByTitle("Tutorial", TUTORIAL_SCHEDULE);
copyLevelByTitle("Loan Shark", LOAN_SHARK_SCHEDULE);
