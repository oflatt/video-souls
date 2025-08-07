import { global } from './globalState';

export enum InputDirection {
  LEFT = 0b0001,
  UP = 0b0010,
  RIGHT = 0b0100,
  DOWN = 0b1000
}

export type KeybindingAction =
  | 'attack'
  | 'attackAlt'
  | 'parry'
  | 'parryAlt1'
  | 'parryAlt2'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'escape'
  | 'play'
  | 'seekLeft'
  | 'seekRight'
  | 'seekSmallLeft'
  | 'seekSmallRight'
  | 'seekMediumLeft'
  | 'seekMediumRight'
  | 'interval'
  | 'critical'
  | 'delete'
  | 'deleteAlt1'
  | 'deleteAlt2';

export function getKeybinding(action: KeybindingAction): string {
  return global().localSave.keybindings[action];
}

export function getKeyToDirection(): Map<string, InputDirection> {
  return new Map<string, InputDirection>([
    [getKeybinding('up'), InputDirection.UP],
    [getKeybinding('left'), InputDirection.LEFT],
    [getKeybinding('down'), InputDirection.DOWN],
    [getKeybinding('right'), InputDirection.RIGHT],
  ]);
}

export class InputManager {
  private keyPressed = new Set<string>();
  private keyJustPressed = new Set<string>();
  
  public mouseX = 0;
  public mouseY = 0;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    document.body.addEventListener('mousemove', (event) => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    });

    document.addEventListener('keydown', event => {
      if (!this.keyPressed.has(event.key)) {
        this.keyPressed.add(event.key);
        this.keyJustPressed.add(event.key);
      }
    });
    
    document.addEventListener('keyup', event => {
      this.keyPressed.delete(event.key);
    });
  }

  public getJustPressedKeys(): Set<string> {
    return new Set(this.keyJustPressed);
  }

  public wasKeyJustPressed(key: string): boolean {
    return this.keyJustPressed.has(key);
  }

  public clearJustPressed() {
    this.keyJustPressed.clear();
  }

  public getCurrentTargetDirection(): number {
    const keyToDirection = getKeyToDirection();
    const directions: InputDirection[] = [];
    keyToDirection.forEach((dir, key) => {
      if (this.keyPressed.has(key)) {
        directions.push(dir);
      }
    });
    return this.netDirection(directions);
  }

  private netDirection(directionsArr: InputDirection[]) {
    const directions = new Set(directionsArr);
    // Cancel out opposites
    if (directions.has(InputDirection.LEFT) && directions.has(InputDirection.RIGHT)) {
      directions.delete(InputDirection.LEFT);
      directions.delete(InputDirection.RIGHT);
    }
    if (directions.has(InputDirection.UP) && directions.has(InputDirection.DOWN)) {
      directions.delete(InputDirection.UP);
      directions.delete(InputDirection.DOWN);
    }
    // Get combined direction
    let combinedDirection = 0;
    directions.forEach(dir => combinedDirection |= dir);
    return [
      InputDirection.UP,
      InputDirection.UP | InputDirection.RIGHT,
      InputDirection.RIGHT,
      InputDirection.DOWN | InputDirection.RIGHT,
      InputDirection.DOWN,
      InputDirection.DOWN | InputDirection.LEFT,
      InputDirection.LEFT,
      InputDirection.UP | InputDirection.LEFT,
      0
    ].indexOf(combinedDirection);
  }
}
