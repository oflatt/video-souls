import { AttackAnimation } from './battle';

export class BattleAnim {
  state: AttackAnimation;
  timeElapsed: number;
  duration: number;
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
    this.timeElapsed = 1;
    this.duration = 1;
    this.startPos = [0.5, 0.5];
    this.endPos = [0.5, 0.5];
    this.startAngle = 0;
    this.endAngle = 0;
    this.startYScale = 1.0;
    this.endYScale = 1.0;
    this.startXScale = 1.0;
    this.endXScale = 1.0;
  }

  isOver(): boolean {
    return this.timeElapsed >= this.duration;
  }

  static attackStarting(
    startPos: [number, number],
    endPos: [number, number],
    startAngle: number,
    endAngle: number,
    duration: number
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.ATTACK_STARTING;
    anim.timeElapsed = 0; // Reset time elapsed for new animation
    anim.duration = duration; // Set the total duration of the animation
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
    startPos: [number, number],
    endPos: [number, number],
    angle: number,
    duration: number
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.ATTACKING;
    anim.timeElapsed = 0; // Reset time elapsed for new animation
    anim.duration = duration; // Set the total duration of the animation
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
    pos: [number, number],
    angle: number,
    duration: number
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.PARRYING;
    anim.timeElapsed = 0; // Reset time elapsed for new animation
    anim.duration = duration; // Set the total duration of the animation
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
    pos: [number, number],
    angle: number,
    duration: number
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.ATTACK_END_LAG;
    anim.timeElapsed = 0; // Reset time elapsed for new animation
    anim.duration = duration; // Set the total duration of the animation
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

  static staggering(
    startPos: [number, number],
    endPos: [number, number],
    startAngle: number,
    endAngle: number,
    duration: number
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.STAGGERING;
    anim.timeElapsed = 0;
    anim.duration = duration;
    anim.startPos = [...startPos];
    anim.endPos = [...endPos];
    anim.startAngle = startAngle;
    anim.endAngle = endAngle;
    anim.startYScale = 1.0;
    anim.endYScale = 1.0;
    anim.startXScale = 1.0;
    anim.endXScale = 1.0;
    return anim;
  }

  static criticalHit(
    startPos: [number, number],
    endPos: [number, number],
    startAngle: number,
    endAngle: number,
    duration: number = 0.18 // very quick
  ): BattleAnim {
    const anim = new BattleAnim();
    anim.state = AttackAnimation.ATTACKING; // reuse ATTACKING state for now
    anim.timeElapsed = 0;
    anim.duration = duration;
    anim.startPos = [...startPos];
    anim.endPos = [...endPos];
    anim.startAngle = startAngle;
    anim.endAngle = endAngle;
    anim.startYScale = 1.2;
    anim.endYScale = -1.2;
    anim.startXScale = 1.2;
    anim.endXScale = 1.2;
    return anim;
  }
}
