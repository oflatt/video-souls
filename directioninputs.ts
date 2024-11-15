enum DirectionalInput {
  LEFT = -1,
  RIGHT = 1,
  UP = -3,
  DOWN = 3
}

enum AttackDirection {
  UP, UP_RIGHT, RIGHT, DOWN_RIGHT, DOWN, DOWN_LEFT, LEFT, UP_LEFT, CENTER
}

const DirectionInputManager = {
  // Input mappings
  mappings: new Map<string, DirectionalInput>(),
  // Input state
  pressed: new Set<DirectionalInput>(),
  justPressed: new Set<DirectionalInput>(),
  // Process inputs
  processKeydown: (event: KeyboardEvent) => {
    let input = DirectionInputManager.mappings.get(event.key);
    if (input != null && !DirectionInputManager.pressed.has(input)) {
      DirectionInputManager.pressed.add(input);
      DirectionInputManager.justPressed.add(input);
    }
  },
  processKeyup: (event: KeyboardEvent) => {
    let input = DirectionInputManager.mappings.get(event.key);
    if (input != null && DirectionInputManager.pressed.has(input)) {
      DirectionInputManager.pressed.delete(input);
      DirectionInputManager.justPressed.delete(input);
    }
  },
  processUpdate: () => {
    DirectionInputManager.justPressed.clear();
  },
  // Get current input direction
  getDirection: () => {
    let netDirection = 0;
    for (let dir of DirectionInputManager.pressed) {
      netDirection += dir;
    }
    switch (netDirection) {
      case -4:
        return AttackDirection.UP_LEFT;
      case -3:
        return AttackDirection.UP;
      case -2:
        return AttackDirection.UP_RIGHT;
      case -1:
        return AttackDirection.LEFT;
      case 0:
        return AttackDirection.CENTER;
      case 1:
        return AttackDirection.RIGHT;
      case 2:
        return AttackDirection.DOWN_LEFT;
      case 3:
        return AttackDirection.DOWN;
      case 4:
        return AttackDirection.DOWN_RIGHT;
    }
    throw Array.from(DirectionInputManager.pressed);
  }
} as const;

// TODO: Allow remapping
DirectionInputManager.mappings.set("w", DirectionalInput.UP);
DirectionInputManager.mappings.set("a", DirectionalInput.LEFT);
DirectionInputManager.mappings.set("s", DirectionalInput.DOWN);
DirectionInputManager.mappings.set("d", DirectionalInput.RIGHT);
