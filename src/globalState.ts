// Keep all "globals" here so they are shared across modules.
export interface GlobalState {
  videoSoulsInstance: import('./videosouls').VideoSouls | null;
}

export const globalState: GlobalState = {
  videoSoulsInstance: null,
};

// Optional helpers if you prefer not to mutate directly
export function setVideoSouls(instance: import('./videosouls').VideoSouls | null) {
  globalState.videoSoulsInstance = instance;
}
export function global() {
  return globalState.videoSoulsInstance!!;
}


export enum EventType {
  SetLevel = "setLevel",
  SetGameMode = "setGameMode",
}

export class EventData {
  event: EventType;
  data: any;

  constructor(event: EventType, data: any) {
    this.event = event;
    this.data = data;
  }
}

