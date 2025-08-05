import { Graphics } from './graphics';
import { AttackAnimation, BattleState, directionNumToSwordPos, directionNumToSwordAngle } from './battle';
import { getAttacksInInterval, LevelDataV0 } from './leveldata';
import { graphics } from './videosouls'; // <-- import global graphics
import { PARRY_WINDOW } from './constants';
import { AudioPlayer } from './audioPlayer';
import { InputManager } from './inputmanager';

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

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  arrowSprite: HTMLCanvasElement,
  direction: number,
  x: number,
  y: number,
  size: number,
  damage: number
) {
  ctx.save();
  ctx.translate(x, y);

  let auraScale = 1.0;
  if (damage > 0.1) {
    auraScale = 1.0 + Math.min((damage - 0.1) * 4, 2.0); // scale up, max 3x
  }

  ctx.globalAlpha = 1.0;
  ctx.shadowColor = "#a00";
  ctx.shadowBlur = 8 * auraScale;

  if (direction === 8) {
    ctx.drawImage(graphics.xSprite, -size / 2, -size / 2, size, size);
  } else {
    ctx.rotate(direction * Math.PI / 4);
    ctx.drawImage(arrowSprite, -size / 2, -size / 2, size, size);
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawCritical(
  ctx: CanvasRenderingContext2D,
  arrowSprite: HTMLCanvasElement,
  direction: number,
  x: number,
  y: number,
  size: number,
  multiplier: number
) {
  ctx.save();
  ctx.translate(x, y);

  ctx.globalAlpha = 0.85;

  if (direction === 8) {
    ctx.drawImage(graphics.centerCriticalSprite, -size / 2, -size / 2, size, size);
  } else {
    ctx.rotate(direction * Math.PI / 4);
    ctx.drawImage(arrowSprite, -size / 2, -size / 2, size, size);
  }

  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "#ffd700";
  ctx.globalAlpha = 0.5;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1.0;
  ctx.font = "bold 22px Arial";
  ctx.fillStyle = "#ffd700";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`x${multiplier.toFixed(1)}`, 0, -size / 2 - 2);

  ctx.restore();
}

export class BattleRenderer {
  private canvas: HTMLCanvasElement;
  private level: LevelDataV0; // <-- Add level reference

  constructor(canvas: HTMLCanvasElement, level: LevelDataV0) {
    this.canvas = canvas;
    this.level = level;
  }

  private drawAttackWarningArrow(
    attack: any,
    directionCountMap: Map<number, number>,
    currentTime: number,
    arrowDrawSize: number,
    canvasWidth: number,
    canvasHeight: number
  ) {
    const count = directionCountMap.get(attack.direction) ?? 0;

    let attackPos: [number, number];
    if (attack.direction === 8) {
      // For center, move to the right for each additional arrow
      const baseX = 0.5;
      const baseY = 0.5;
      const spacing = 0.06 * count;
      attackPos = [baseX + spacing, baseY];
    } else {
      // For other directions, move radially outward
      const base = [...directionNumToSwordPos.get(attack.direction)!];
      const baseDistance = 1.5;
      const extraDistance = 0.7 * count;
      const totalDistance = baseDistance + extraDistance;
      attackPos = [
        base[0] * totalDistance + 0.5,
        base[1] * totalDistance + 0.5
      ];
    }

    const animTime = (currentTime - attack.time) / ATTACK_WARNING_ADVANCE;
    const opacity = Math.max(0, 1 - animTime);

    // Center horizontally, offset using height for symmetry, scale by 1.5
    const attackX = canvasWidth / 2 + 1.5 * canvasHeight * (attackPos[0] - 0.5);
    const attackY = canvasHeight * (1 - attackPos[1]);

    const ctx = this.canvas.getContext('2d')!;
    ctx.save();
    ctx.globalAlpha = opacity;
    drawArrow(
      ctx,
      graphics.arrowSprite,
      attack.direction,
      attackX,
      attackY,
      arrowDrawSize,
      attack.damage
    );
    ctx.restore();

    directionCountMap.set(attack.direction, count + 1);
  }

  drawAttackWarning(
    currentTime: number,
    prevTime: number,
    level: LevelDataV0,
    audio: AudioPlayer,
    arrowless?: boolean // <-- new param
  ) {
    if (arrowless) return; // Suppress all warnings/arrows

    // check for attack warning sound
    const soundAttack = getAttacksInInterval(level, prevTime + ATTACK_WARNING_ADVANCE, currentTime + ATTACK_WARNING_ADVANCE);

    if (soundAttack.length > 0 && !arrowless) {
      audio.playWarningSound();
    }

    // Get all attacks in the warning window
    const animAttacks = getAttacksInInterval(level, currentTime, currentTime + ATTACK_WARNING_ADVANCE);

    const arrowDrawSize = graphics.arrowSprite.width / 2;
    // Map from direction number to how many arrows have been drawn for that direction
    const directionCountMap = new Map<number, number>();
    for (const attack of animAttacks) {
      this.drawAttackWarningArrow(
        attack,
        directionCountMap,
        currentTime,
        arrowDrawSize,
        this.canvas.width,
        this.canvas.height
      );
    }
  }

  drawSword(battle: BattleState) {
    var swordPos = battle.anim.endPos;
    var swordAngle = battle.anim.endAngle;
    var redSwordOutlineStrength = 0.0;
    var greenSwordOutlineStrength = 0.0;
    var orangeSwordOutlineStrength = 0.0; // <-- new variable
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
  
      const parryTotalDuration = battle.anim.duration;
      const parryWindowProportion = PARRY_WINDOW / parryTotalDuration;
      if (battle.anim.state === AttackAnimation.PARRYING && animProgress < parryWindowProportion) {
        redSwordOutlineStrength = Math.sqrt(1.0 - (animProgress / parryWindowProportion));
      }

      xscale = battle.anim.startYScale + (battle.anim.endXScale - battle.anim.startXScale) * slowExponentialAnimProgress;
      yscale = battle.anim.startYScale + (battle.anim.endYScale - battle.anim.startYScale) * slowExponentialAnimProgress;
    }

    if (battle.timeSinceLastParry < SUCCESS_PARRY_ANIM_FADE) {
      greenSwordOutlineStrength = Math.sqrt(1.0 - (battle.timeSinceLastParry / SUCCESS_PARRY_ANIM_FADE));
    }

    // Orange glow for block (parryOrBlockCombo > 0, parryCombo == 0, and recent hit)
    if (
      battle.parryOrBlockCombo > 0 &&
      battle.parryCombo == 0 &&
      battle.timeSincePlayerHit < SUCCESS_PARRY_ANIM_FADE
    ) {
      orangeSwordOutlineStrength = Math.sqrt(1.0 - (battle.timeSincePlayerHit / SUCCESS_PARRY_ANIM_FADE));
    }

    // Center horizontally, offset using height for symmetry, scale by 1.5
    const topLeftX = this.canvas.width / 2 + 1.5 * this.canvas.height * (swordPos[0] - 0.5);
    const topLeftY = this.canvas.height * swordPos[1];
    var swordOutlineX = topLeftX;
    var swordOutlineY = topLeftY; 
  
    // Draw sword 1.5x as big
    const swordScale = 1.5;
    this.drawCenteredRotated(
      graphics.swordSprites.yellowOutline,
      swordOutlineX,
      swordOutlineY,
      swordAngle - Math.PI / 2,
      redSwordOutlineStrength,
      xscale * swordScale,
      yscale * swordScale
    );
    this.drawCenteredRotated(
      graphics.swordSprites.greenOutline,
      swordOutlineX,
      swordOutlineY,
      swordAngle - Math.PI / 2,
      greenSwordOutlineStrength,
      xscale * swordScale,
      yscale * swordScale
    );
    // Draw orange outline for block
    if (orangeSwordOutlineStrength > 0) {
      // Use yellowOutline sprite, but tint orange
      const ctx = this.canvas.getContext('2d')!;
      ctx.save();
      ctx.globalAlpha = orangeSwordOutlineStrength;
      ctx.translate(swordOutlineX, this.canvas.height - swordOutlineY);
      ctx.rotate(-(swordAngle - Math.PI / 2));
      ctx.scale(xscale * swordScale, yscale * swordScale);
      ctx.drawImage(graphics.swordSprites.yellowOutline, -graphics.swordSprites.yellowOutline.width / 2, -graphics.swordSprites.yellowOutline.height / 2);
      // Overlay orange tint
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(255,140,0,0.7)";
      ctx.fillRect(-graphics.swordSprites.yellowOutline.width / 2, -graphics.swordSprites.yellowOutline.height / 2, graphics.swordSprites.yellowOutline.width, graphics.swordSprites.yellowOutline.height);
      ctx.restore();
    }
    this.drawCenteredRotated(
      graphics.swordSprites.default,
      topLeftX,
      topLeftY,
      swordAngle - Math.PI / 2,
      1.0,
      xscale * swordScale,
      yscale * swordScale
    );
  }

  drawCriticalParticles(battle: BattleState) {
    const particles = battle.criticalAnimParticles;
    if (particles && Array.isArray(particles.particles)) {
      const ctx = this.canvas.getContext('2d')!;
      particles.t += 1 / 60;
      // Get sword position to attract particles
      const swordPos = battle.anim.endPos;
      for (const p of particles.particles) {
        // Gravity: pull toward sword position
        const swordX = swordPos[0];
        const swordY = swordPos[1];
        const dx = swordX - p.x;
        const dy = swordY - p.y;
        // Apply gravity as acceleration toward sword (reduce effect)
        p.vx += dx * p.gravity * 0.02;
        p.vy += dy * p.gravity * 0.02;
        // Apply friction to slow down over time
        p.vx *= 0.98;
        p.vy *= 0.98;
        // Update position
        p.x += p.vx;
        p.y += p.vy;
        // Fade out over 1 second
        p.life -= 1 / 60;

        // Despawn if close to sword
        const distToSword = Math.hypot(dx, dy);
        if (distToSword < 0.04 && p.life > 0) {
          p.life = 0;
        }

        // Draw particle
        const px = this.canvas.width * p.x;
        const py = this.canvas.height * (1 - p.y);
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / 1.0);
        ctx.beginPath();
        ctx.arc(px, py, 7 * Math.max(0.5, p.life / 1.0), 0, 2 * Math.PI);
        ctx.fillStyle = "#ffd700";
        ctx.shadowColor = "#fff700";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.restore();
      }
      if (particles.particles.every(p => p.life <= 0)) {
        battle.criticalAnimParticles = undefined;
      }
    }
  }

  drawCriticalMarker(
    battle: BattleState
  ) {
    if (!battle.currentCritical) return;
    const ctx = this.canvas.getContext('2d')!;
    const dir = battle.currentCritical.direction;
    const pos = [...directionNumToSwordPos.get(dir)!];
    // Use centerCriticalSprite for direction 8, otherwise criticalSprite
    let sprite: HTMLCanvasElement;
    if (dir === 8) {
      sprite = graphics.centerCriticalSprite;
    } else {
      sprite = graphics.criticalSprite ?? graphics.arrowSprite;
    }
    const size = graphics.arrowSprite.width / 2;
    // Center horizontally, offset using height for symmetry, scale by 1.5
    const x = this.canvas.width / 2 + 1.5 * this.canvas.height * (pos[0] * 0.9);
    const y = this.canvas.height * (1 - (0.5 + pos[1] * 0.9));
    drawCritical(
      ctx,
      sprite,
      dir,
      x,
      y,
      size,
      battle.currentCritical.multiplier
    );
  }

  drawHealthBarsOnly(
    battle: BattleState,
    level: LevelDataV0,
    showSliver: boolean
  ) {
    // Draw boss health bar
    drawHealthBar(
      this.canvas,
      0.05,
      { r: 255, g: 0, b: 0 },
      battle.bossHealth,
      battle.timeSinceBossHit,
      battle.lastBossHealth,
      level.bossHealth,
      showSliver
    );
    // Draw player health bar
    drawHealthBar(
      this.canvas,
      0.9,
      { r: 0, g: 255, b: 0 },
      battle.playerHealth,
      battle.timeSincePlayerHit,
      battle.lastPlayerHealth,
      1.0,
      showSliver
    );
  }

  drawCanvas(
    currentTime: number,
    prevTime: number,
    battle: BattleState, 
    level: LevelDataV0, 
    audio: AudioPlayer,
    youtubeVideoName: string,
    arrowless?: boolean // <-- new param
  ) {
    this.drawCriticalMarker(battle);
    this.drawSword(battle);
    this.drawCriticalParticles(battle); // <-- always draw particles if present
    this.drawAttackWarning(currentTime, prevTime, level, audio, arrowless);

    animateBossName(youtubeVideoName, this.canvas, currentTime, 0.15);

    this.drawHealthBarsOnly(battle, level, true); // <-- always show sliver in gameplay
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
  maxHealth: number = 1.0, // <-- new param
  showSliver: boolean = true // <-- new param
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

  // Always show a sliver of green (or color) at the left
  const minSliverPx = 4;
  let currentHealthWidth = barWidth * healthPercent;
  if (showSliver && currentHealth > 0 && currentHealthWidth < minSliverPx) {
    currentHealthWidth = minSliverPx;
  }

  if (lostHealth > 0) {
    const delay = 0.5;
    let animatedLastHealth = lastHealthPercent;
    if (timeSinceHealthChange > delay) {
      const decrementAmount = (timeSinceHealthChange - delay) / 5 / maxHealth;
      animatedLastHealth = Math.max(healthPercent, lastHealthPercent - decrementAmount);
    }
    let lostHealthWidth = barWidth * animatedLastHealth;
    if (showSliver && lastHealth > 0 && lostHealthWidth < minSliverPx) {
      lostHealthWidth = minSliverPx;
    }
    ctx.fillStyle = colorToString(adjustColorOpacity(color, 0.5));
    ctx.fillRect(xOffset + shakeOffsetX, yPos, lostHealthWidth, barHeight);
  }

  ctx.fillStyle = colorToString(color);
  ctx.fillRect(xOffset + shakeOffsetX, yPos, currentHealthWidth, barHeight);

  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.strokeRect(xOffset + shakeOffsetX, yPos, barWidth, barHeight);
}
