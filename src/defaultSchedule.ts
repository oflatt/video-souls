export const DEFAULT_ATTACK_SCHEDULE = `
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
}`;
