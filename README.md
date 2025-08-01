# Video Souls

Visit videosouls.com to play the game.

Welcome to the repo for video souls. For local development, simply serve the static webpage with python by running `make serve` in the root directory.

# Custom Javascript Documentation

Video Souls levels allow for a custom "attackSchedule" in the level data. This allows you to have custom logic for each level controlling the order of attacks and more.

## Attack Schedule Interface

The `attackSchedule` field in a level is a string of JavaScript code that defines a function. This function is called by the game engine to determine when and how the boss should transition between attack intervals.

**The schedule function receives a single argument: `state` (the boss state object). It must return an object with the following properties:**

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

- The schedule function is re-evaluated every frame, so keep it efficient.
- You can use variables outside the returned function for persistent state (see the `run_each_once` example).
- Always return an object with at least `{ continueNormal: true }` or `{ continueNormal: false, transitionToInterval: ..., intervalOffset: ... }`.

## Debugging

If your schedule code is invalid or throws an error, the boss will default to continuing the current interval.
However an error is printed to the browser console so you can debug it. This also happens when a parsing error occurs.

We support  ES5 JavaScript: internally we use this javascript interpreter for safety: https://github.com/NeilFraser/JS-Interpreter.

---

# TODO

- in the park tree video
- crits in ping pong player video
- Auto special effects preprocessing on videos?
- Different weapons
  - Different attack speeds/damage tradeoff
  - Custom weapons, upload png or use link to png
- Video tutorial for video souls
- ability for enemies to parry
- make custom javascript more powerful (healing, damage, detecting or parrying attacks, ect)
- documentation for custom javascript