# Video Souls

Visit videosouls.com to play the game.

Welcome to the repo for video souls. For local development, simply serve the static webpage with python by running `make serve` in the root directory.

# Custom Javascript Documentation

Video Souls levels allow for a custom "attackSchedule" in the level data. This lets you control the order of attacks and boss behavior using JavaScript.

## Attack Schedule Interface

The `attackSchedule` field in a level is a string of JavaScript code that defines a function. This function is called by the game engine every frame to determine when and how the boss should transition between attack intervals.

**The schedule function receives a single argument: `state` (the boss state object). It must return an object with:**

- `continueNormal` (boolean): If `true`, the boss continues the current interval. If `false`, the boss transitions to a new interval.
- `transitionToInterval` (string, optional): The name of the interval to transition to (required if `continueNormal` is `false`).
- `intervalOffset` (number, optional): The offset in seconds to start the new interval at.

### The `state` object

The `state` object passed to your schedule function contains:

- `healthPercentage`: The boss's current health (0.0 to 1.0).
- `currentInterval`: The name of the current interval.
- `currentTime`: The current time (seconds) in the video.
- `intervalElapsedTime`: Time (seconds) since the current interval started.
- `playerHealthPercentage`: The player's current health (0.0 to 1.0).
- `availableIntervals`: An object mapping interval names to `{start, end, name}`.
- `intervalNamesAlpha`: Array of interval names (excluding "intro" and "death"), sorted alphabetically.
- `intervalNamesByStart`: Array of interval names, sorted by start time.
- `intervalNamesByEnd`: Array of interval names, sorted by end time.

**Additional fields for advanced scheduling:**

- `hitCombo`: Current attack combo count (player's consecutive attacks).
- `parryCombo`: Number of consecutive successful parries.
- `parryOrBlockCombo`: Number of consecutive blocks or parries (resets on hit; increments for either block or parry).
- `timeSinceLastHit`: Time (seconds) since last player attack.
- `timeSincePlayerHit`: Time (seconds) since player was last hit (resets only when taking damage, not on block).
- `timeSinceBossHit`: Time (seconds) since boss was last hit.
- `currentCriticalDir`: Direction of the current critical attack, or `null` if none.
- `currentCriticalTimeLeft`: Time left (seconds) for the current critical attack, or `null` if none.

### Example: Simple Random Schedule

This example picks a random interval (other than "intro" or "death") when the current interval ends.

```js
return function(state) {
  var currentInterval = state.availableIntervals[state.currentInterval];

  // Check if we've reached or passed the end time of the current interval
  if (state.currentTime >= currentInterval.end) {
    var nextInterval = state.intervalNamesAlpha[Math.floor(Math.random() * state.intervalNamesAlpha.length)];

    // pick again if the interval is the same as the current one
    if (nextInterval === state.currentInterval) {
      nextInterval = state.intervalNamesAlpha[Math.floor(Math.random() * state.intervalNamesAlpha.length)];
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
```

### Example: Run Each Interval Once, Then Loop

This example runs each interval once in order, then loops randomly.

```js
var run_each_once = "uninitialized";

return function(state) {
  if (run_each_once === "uninitialized") {
    run_each_once = state.intervalNamesAlpha.slice();
  }

  var currentInterval = state.availableIntervals[state.currentInterval];

  if (state.currentTime >= currentInterval.end) {
    var nextInterval;
    if (run_each_once.length > 0) {
      nextInterval = run_each_once.shift();
    } else {
      var randomIndex = Math.floor(Math.random() * state.intervalNamesAlpha.length);
      nextInterval = state.intervalNamesAlpha[randomIndex];
    }
    return {
      continueNormal: false,
      transitionToInterval: nextInterval,
      intervalOffset: 0
    };
  }
  return { continueNormal: true };
};
```

### Example: Weighted Random Choice

You can use custom logic to weight certain intervals more or less likely.

```js
return function(state) {
  var currentInterval = state.availableIntervals[state.currentInterval];

  if (state.currentTime >= currentInterval.end) {
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

    if (nextInterval === state.currentInterval) {
      nextInterval = weighted[Math.floor(Math.random() * weighted.length)];
    }

    return {
      continueNormal: false,
      transitionToInterval: nextInterval,
      intervalOffset: 0
    };
  }
  return { continueNormal: true };
};
```

## Tips

- The schedule function is called every frame, so keep it efficient.
- You can use variables outside the returned function for persistent state (see the `run_each_once` example).
- Always return an object with at least `{ continueNormal: true }` or `{ continueNormal: false, transitionToInterval: ..., intervalOffset: ... }`.
- At the start of a battle, the engine seeks to the beginning of the "intro" interval if present.

## Debugging

You can use `console.log`, `console.warn`, and `console.error` in your schedule code for debugging. These are available inside the schedule interpreter.

If your schedule code is invalid or throws an error, the boss will default to continuing the current interval. An error is printed to the browser console so you can debug it.

We support ES5 JavaScript: internally we use this javascript interpreter for safety: https://github.com/NeilFraser/JS-Interpreter.

---

# TODO

- ability to change things like health and other stats in the level editor
- in the park tree video
- give ranks for levels (combination of time and times hit, author time part of calculation)
- crits tutorial
  turtle- belly has crit
  music with turtle
  attacking with back turned 
  box painted green
  How to do critical hits, and what do they do
    they give you more damage and a quicker attack
  If you are early on your parry you may still block most of the damage
  Spamming parry makes the parry end lag longer
- editor tutorial (rickroll?)
- Auto special effects preprocessing on videos?
- Different weapons
  - Different attack speeds/damage tradeoff
  - Custom weapons, upload png or use link to png
- Video tutorial for video souls
- ability for enemies to parry
- make custom javascript more powerful (healing, damage, detecting or parrying attacks, etc)
- documentation for custom javascript