import { AttackAnimation } from './battle';

export class BattleAnim {
  state: AttackAnimation;
  // TODO bugged due to moving times, change to how long has elapsed and total duration instead
  startTime: number;
  endTime: number;
  startPos: [number, number];
  endPos: [number, number];
  startAngle: number;
  endAngle: number;
  startYScale: number;
  endYScale: number;
  startXScale: number;
  endXScale: number;

  constructor() {
    this.state = AttackAnimation.NONE;
    this.startTime = 0;
    this.endTime = 0;
    this.startPos = [0.5, 0.5];
    this.endPos = [0.5, 0.5];
    this.startAngle = 0;
    this.endAngle = 0;
    this.startYScale = 1.0;
    this.endYScale = 1.0;
    this.startXScale = 1.0;
    this.endXScale = 1.0;
  }

  static attackStarting(
    currentTime: number,
    startPos: [number, number],
    endPos: [number, number],
    startAngle: number,
    endAngle: number,
    duration: number
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.ATTACK_STARTING;
    anim.startTime = currentTime;
    anim.endTime = currentTime + duration;
    anim.startPos = [...startPos];
    anim.endPos = [...endPos];
    anim.startAngle = startAngle;
    anim.endAngle = endAngle;
    anim.startYScale = 1.0;
    anim.endYScale = 0.8;
    anim.startXScale = 1.0;
    anim.endXScale = 1.0;
    return anim;
  }

  static attacking(
    currentTime: number,
    startPos: [number, number],
    endPos: [number, number],
    angle: number,
    duration: number
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.ATTACKING;
    anim.startTime = currentTime;
    anim.endTime = currentTime + duration;
    anim.startPos = [...startPos];
    anim.endPos = [...endPos];
    anim.startAngle = angle;
    anim.endAngle = angle;
    anim.startYScale = 1.0;
    anim.endYScale = -1.0;
    anim.startXScale = 1.0;
    anim.endXScale = 1.0;
    return anim;
  }

  static parrying(
    currentTime: number,
    pos: [number, number],
    angle: number,
    duration: number
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.PARRYING;
    anim.startTime = currentTime;
    anim.endTime = currentTime + duration;
    anim.startPos = [...pos];
    anim.endPos = [...pos];
    anim.startAngle = angle;
    anim.endAngle = angle - (Math.PI / 10);
    anim.startYScale = 1.0;
    anim.endYScale = 1.0;
    anim.startXScale = 1.0;
    anim.endXScale = 1.0;
    return anim;
  }

  static attackEndLag(
    currentTime: number,
    pos: [number, number],
    angle: number,
    duration: number
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.ATTACK_END_LAG;
    anim.startTime = currentTime;
    anim.endTime = currentTime + duration;
    anim.startPos = [...pos];
    // Drift: move slightly in the attack direction and a little down
    const driftAmount = -0.06;
    const downAmount = 0.01;
    anim.endPos = [
      pos[0] + Math.cos(angle) * driftAmount,
      pos[1] + Math.sin(angle) * driftAmount - downAmount
    ];
    anim.startAngle = angle;
    anim.endAngle = angle;
    anim.startYScale = -1.0;
    anim.endYScale = -1.0;
    anim.startXScale = 1.0;
    anim.endXScale = 1.0;
    return anim;
  }
}
