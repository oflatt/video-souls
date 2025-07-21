import { Graphics } from './graphics';
import { AttackAnimation, BattleState, directionNumToSwordPos, directionNumToSwordAngle } from './battle';
import { LevelDataV0 } from './leveldata';

const PARRY_WINDOW = 0.2;
const PARRY_END_LAG = 0.2;
const SUCCESS_PARRY_ANIM_FADE = 0.2;
const ATTACK_WARNING_ADVANCE = 0.5;

interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

function colorToString(color: Color): string {
  const { r, g, b, a = 1 } = color;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function adjustColorOpacity(color: Color, opacity: number): Color {
  return { ...color, a: opacity };
}

function drawArrowWithMultiplier(
  ctx: CanvasRenderingContext2D,
  arrowSprite: HTMLCanvasElement,
  direction: number,
  x: number,
  y: number,
  size: number,
  multiplier?: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(direction * Math.PI / 4);
  ctx.globalAlpha = multiplier ? 0.85 : 1.0;
  ctx.drawImage(arrowSprite, -size / 2, -size / 2, size, size);
  if (multiplier) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "#ffd700";
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
    // Draw multiplier label
    ctx.font = "bold 22px Arial";
    ctx.fillStyle = "#ffd700";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "#fff700";
    ctx.shadowBlur = 8;
    ctx.fillText(`x${multiplier.toFixed(1)}`, 0, -size / 2 - 2);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

export class BattleRenderer {
  private graphics: Graphics;
  private canvas: HTMLCanvasElement;
  private level: LevelDataV0; // <-- Add level reference

  constructor(graphics: Graphics, canvas: HTMLCanvasElement, level: LevelDataV0) {
    this.graphics = graphics;
    this.canvas = canvas;
    this.level = level;
  }

  drawAttackWarning(
    currentTime: number,
    prevTime: number,
    getAttacksInInterval: (start: number, end: number) => any[],
    playWarningSound?: (() => void), // <-- now optional
    arrowless?: boolean // <-- new param
  ) {
    if (arrowless) return; // Suppress all warnings/arrows

    const ctx = this.canvas.getContext('2d')!;
    // check for attack warning sound
    const soundAttack = getAttacksInInterval(prevTime + ATTACK_WARNING_ADVANCE, currentTime + ATTACK_WARNING_ADVANCE);

    if (soundAttack.length > 0 && playWarningSound) {
      playWarningSound();
    }

    const animAttacks = getAttacksInInterval(currentTime, currentTime + ATTACK_WARNING_ADVANCE);
    for (const attack of animAttacks) {
      const attackPos = [...directionNumToSwordPos.get(attack.direction)!];
      attackPos[0] = attackPos[0] * 1.5;
      attackPos[1] = attackPos[1] * 1.5;
      attackPos[0] += 0.5;
      attackPos[1] += 0.5;

      const animTime = (currentTime - attack.time) / ATTACK_WARNING_ADVANCE;
      const opacity = Math.max(0, 1 - animTime);

      const attackX = this.canvas.width * attackPos[0];
      const attackY = this.canvas.height * (1 - attackPos[1]);
      ctx.save();
      ctx.globalAlpha = opacity;

      ctx.translate(attackX, attackY);
      ctx.rotate(attack.direction * Math.PI / 4);
      ctx.drawImage(this.graphics.arrowSprite, -this.graphics.arrowSprite.width / 2, -this.graphics.arrowSprite.height / 2);

      ctx.restore();
    }
  }

  drawSword(currentTime: number, battle: BattleState, getCurrentTargetDirection: () => number) {
    var swordPos = battle.anim.endPos;
    var swordAngle = battle.anim.endAngle;
    var redSwordOutlineStrength = 0.0;
    var greenSwordOutlineStrength = 0.0;
    var xscale = 1.0;
    var yscale = 1.0;
  
    if (battle.anim.state !== AttackAnimation.NONE) {
      const animProgressUncapped = (battle.anim.timeElapsed) / (battle.anim.duration);
      const animProgress = Math.max(Math.min(1.0, animProgressUncapped), 0.0);
      swordPos = [
        battle.anim.startPos[0] + (battle.anim.endPos[0] - battle.anim.startPos[0]) * animProgress,
        battle.anim.startPos[1] + (battle.anim.endPos[1] - battle.anim.startPos[1]) * animProgress,
      ];
  
      const fastExponentialAnimProgress = Math.sqrt(Math.sqrt(animProgress));
      const slowExponentialAnimProgress = Math.pow(animProgress, 0.8);
      var targetAngle = battle.anim.endAngle;
      if (targetAngle - battle.anim.startAngle > Math.PI) {
        targetAngle -= Math.PI * 2;
      }
      if (targetAngle - battle.anim.startAngle < -Math.PI) {
        targetAngle += Math.PI * 2;
      }
      var currentAngle = battle.anim.startAngle + (targetAngle - battle.anim.startAngle) * fastExponentialAnimProgress;
      swordAngle = currentAngle;
  
      const parryWindowProportion = PARRY_WINDOW / (PARRY_WINDOW + PARRY_END_LAG);
      if (battle.anim.state === AttackAnimation.PARRYING && animProgress < parryWindowProportion) {
        redSwordOutlineStrength = Math.sqrt(1.0 - (animProgress / parryWindowProportion));
      }

      xscale = battle.anim.startYScale + (battle.anim.endXScale - battle.anim.startXScale) * slowExponentialAnimProgress;
      yscale = battle.anim.startYScale + (battle.anim.endYScale - battle.anim.startYScale) * slowExponentialAnimProgress;
    }

    if (battle.timeSinceLastParry < SUCCESS_PARRY_ANIM_FADE) {
      greenSwordOutlineStrength = Math.sqrt(1.0 - (battle.timeSinceLastParry / SUCCESS_PARRY_ANIM_FADE));
    }

    const topLeftX = this.canvas.width * swordPos[0];
    const topLeftY = this.canvas.height * swordPos[1];
    var swordOutlineX = topLeftX;
    var swordOutlineY = topLeftY; 
  
    this.drawCenteredRotated(this.graphics.swordSprites.yellowOutline, swordOutlineX, swordOutlineY, swordAngle - Math.PI / 2, redSwordOutlineStrength, xscale, yscale);
    this.drawCenteredRotated(this.graphics.swordSprites.greenOutline, swordOutlineX, swordOutlineY, swordAngle- Math.PI / 2, greenSwordOutlineStrength, xscale, yscale);
    this.drawCenteredRotated(this.graphics.swordSprites.default, topLeftX, topLeftY, swordAngle- Math.PI / 2, 1.0, xscale, yscale);
  }

  drawCriticalMarker(
    battle: BattleState
  ) {
    if (!battle.currentCritical) return;
    const ctx = this.canvas.getContext('2d')!;
    const dir = battle.currentCritical.direction;
    const pos = [...directionNumToSwordPos.get(dir)!];
    const arrowSprite = this.graphics.arrowSprite;
    const size = 60;
    // Place critical marker at the same position as attack warnings/arrows
    const x = this.canvas.width * (0.5 + pos[0] * 1.5);
    const y = this.canvas.height * (1 - (0.5 + pos[1] * 1.5));
    drawArrowWithMultiplier(
      ctx,
      arrowSprite,
      dir,
      x,
      y,
      size,
      battle.currentCritical.multiplier
    );
  }

  drawCanvas(
    currentTime: number,
    prevTime: number,
    battle: BattleState, 
    getAttacksInInterval: (start: number, end: number) => any[], 
    playWarningSound: (() => void) | undefined,
    getCurrentTargetDirection: () => number,
    youtubeVideoName: string,
    arrowless?: boolean // <-- new param
  ) {
    this.drawAttackWarning(currentTime, prevTime, getAttacksInInterval, playWarningSound, arrowless);
    this.drawCriticalMarker(battle); // <-- draw critical marker if present
    this.drawSword(currentTime, battle, getCurrentTargetDirection);

    animateBossName(youtubeVideoName, this.canvas, currentTime, 0.15);

    // Use level.bossHealth for max health
    drawHealthBar(
      this.canvas,
      0.05,
      { r: 255, g: 0, b: 0 },
      battle.bossHealth,
      battle.timeSinceBossHit,
      battle.lastBossHealth,
      this.level.bossHealth
    );
    drawHealthBar(
      this.canvas,
      0.9,
      { r: 0, g: 255, b: 0 },
      battle.playerHealth,
      battle.timeSincePlayerHit,
      battle.lastPlayerHealth,
      1.0
    );
  }

  private drawCenteredRotated(image: HTMLImageElement | HTMLCanvasElement, xpos: number, ypos: number, angle: number, alpha: number, xscale: number, yscale: number) {
    ypos = this.canvas.height - ypos;
    const ctx = this.canvas.getContext('2d')!;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(xpos, ypos);
    ctx.rotate(-angle);
    ctx.scale(xscale, yscale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
  }

  getCurrentTargetAngleRadians(getCurrentTargetDirection: () => number): number {
    return directionNumToSwordAngle.get(getCurrentTargetDirection())!;
  }
}

function animateBossName(
  name: string,
  canvas: HTMLCanvasElement,
  timeElapsed: number,
  yPosition: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();

  const width = canvas.width;
  const height = canvas.height;

  ctx.font = '50px "Cormorant Unicase", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const waveAmplitude = 10;
  const waveFrequency = 1.5;
  const maxWaveLengthMultiplier = 1.2;
  const animationDuration = 1;
  const flashDuration = 0.5;
  const redTextDuration = 0.5;
  const fadeOutDuration = 0.5;

  const totalDuration = animationDuration + flashDuration + redTextDuration + fadeOutDuration;

  if (timeElapsed > totalDuration) return;

  const textWidth = ctx.measureText(name).width;
  const maxWaveLength = textWidth * maxWaveLengthMultiplier;
  const t = Math.min(timeElapsed / animationDuration, 1);
  const waveLength = maxWaveLength * (1 - Math.pow(2, -10 * t));
  const textY = height * yPosition;

  let alpha = 1;
  if (timeElapsed > animationDuration + flashDuration + redTextDuration) {
    const fadeOutFactor = (timeElapsed - (animationDuration + flashDuration + redTextDuration)) / fadeOutDuration;
    alpha = 1 - Math.min(fadeOutFactor, 1);
  }

  ctx.globalAlpha = alpha;

  if (timeElapsed >= animationDuration) {
    const transitionFactor = Math.min((timeElapsed - animationDuration) / flashDuration, 1);
    const redIntensity = 255;
    ctx.fillStyle = `rgba(255, 255, 255, 1)`;
    ctx.shadowColor = `rgba(${redIntensity}, 0, 0, 1)`;
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5 + 4 * transitionFactor;
    ctx.shadowOffsetY = 5 + 4 * transitionFactor;
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fillText(name, width / 2, textY);
  ctx.shadowColor = 'transparent';

  ctx.beginPath();
  const startX = (width - waveLength) / 2;
  const endX = startX + waveLength;

  const step = Math.max(waveLength / 100, 1);
  for (let x = startX; x < endX; x += step) {
    const sineY = waveAmplitude * Math.sin(((x - startX) / waveLength) * waveFrequency * Math.PI * 2);
    ctx.lineTo(x, textY + 30 + sineY);
  }

  ctx.lineTo(endX, textY + 30);
  ctx.strokeStyle = `rgba(255, 255, 255, 0.7)`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function drawHealthBar(
  canvas: HTMLCanvasElement, 
  yPosition: number,
  color: Color, 
  currentHealth: number,
  timeSinceHealthChange: number,
  lastHealth: number,
  maxHealth: number = 1.0 // <-- new param
) {
  const ctx = canvas.getContext('2d')!;
  const barWidth = canvas.width * 0.8;
  const barHeight = 20;
  const xOffset = (canvas.width - barWidth) / 2;
  const shakeDuration = 0.2;
  const shakeMagnitude = 10;

  const yPos = yPosition * canvas.height;
  const lostHealth = lastHealth - currentHealth;

  let shakeOffsetX = 0;
  if (timeSinceHealthChange < shakeDuration) {
    shakeOffsetX = Math.sin((timeSinceHealthChange / shakeDuration) * Math.PI) * shakeMagnitude;
  }

  // Calculate health percentage
  const healthPercent = Math.max(0, Math.min(1, currentHealth / maxHealth));
  const lastHealthPercent = Math.max(0, Math.min(1, lastHealth / maxHealth));

  if (lostHealth > 0) {
    const delay = 0.5;
    let animatedLastHealth = lastHealthPercent;
    if (timeSinceHealthChange > delay) {
      const decrementAmount = (timeSinceHealthChange - delay) / 5 / maxHealth;
      animatedLastHealth = Math.max(healthPercent, lastHealthPercent - decrementAmount);
    }
    const lostHealthWidth = barWidth * animatedLastHealth;
    ctx.fillStyle = colorToString(adjustColorOpacity(color, 0.5));
    ctx.fillRect(xOffset + shakeOffsetX, yPos, lostHealthWidth, barHeight);
  }

  const currentHealthWidth = barWidth * healthPercent;
  ctx.fillStyle = colorToString(color);
  ctx.fillRect(xOffset + shakeOffsetX, yPos, currentHealthWidth, barHeight);

  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.strokeRect(xOffset + shakeOffsetX, yPos, barWidth, barHeight);
}
