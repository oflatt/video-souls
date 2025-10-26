import { AudioPlayer } from "./audioPlayer";
import { LevelMeta } from "./leveldata";
import { LocalSave, SavedBattleScore } from "./LocalSave";
import { global } from "./globalState";
import { GameMode } from "./GameMode";

export type BattleWinStats = {
  hits: number;
  blocks: number;
  meta: LevelMeta | null;
};

export class BattleEndHudManager {
  private hudElement: HTMLElement | null = null;
  private revealTimeouts: number[] = [];

  constructor(
    private readonly localSave: LocalSave,
    private readonly audio: AudioPlayer,
  ) {}

  showWin(stats: BattleWinStats) {
    const hud = this.createHud("win");
    hud.style.display = "flex";
    this.populateWinHud(hud, stats);
  }

  showLose() {
    const hud = this.createHud("lose");
    hud.style.display = "flex";
  }

  destroy() {
    this.clearRevealTimers();
    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
    }
    this.hudElement = null;
  }

  private createHud(type: "win" | "lose"): HTMLElement {
    this.destroy();

    const templateId =
      type === "win" ? "battle-end-hud-win-template" : "battle-end-hud-lose-template";
    const template = document.getElementById(templateId) as HTMLTemplateElement;
    if (!template || !template.content) {
      throw new Error(`Missing ${templateId}`);
    }

    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const hudClone = fragment.querySelector<HTMLElement>("#battle-end-hud");
    if (!hudClone) {
      throw new Error("Battle end HUD template missing #battle-end-hud root");
    }

    document.body.appendChild(hudClone);
    this.hudElement = hudClone;

    const backButton = hudClone.querySelector<HTMLButtonElement>("#back-button");
    if (backButton) {
      backButton.onclick = () => global().setGameMode(GameMode.MENU);
    }

    const retryButton = hudClone.querySelector<HTMLButtonElement>("#retry-button");
    if (retryButton) {
      retryButton.onclick = () => global().setGameMode(GameMode.PLAYING);
    }

    return hudClone;
  }

  private populateWinHud(root: HTMLElement, stats: BattleWinStats) {
    const { hits, blocks, meta } = stats;
    const blockPenalty = blocks * 0.25;
    const grade = this.calculateBattleGrade(hits, blocks);
    const totalPenalty = grade.score;

    const hitsElem = root.querySelector<HTMLElement>("#battle-hits-value");
    if (hitsElem) hitsElem.textContent = hits.toString();

    const blocksElem = root.querySelector<HTMLElement>("#battle-blocks-value");
    if (blocksElem) blocksElem.textContent = blocks.toString();

    const blockPenaltyElem = root.querySelector<HTMLElement>("#battle-block-penalty-value");
    if (blockPenaltyElem) blockPenaltyElem.textContent = blockPenalty.toFixed(2);

    const totalPenaltyElem = root.querySelector<HTMLElement>("#battle-score-value");
    if (totalPenaltyElem) totalPenaltyElem.textContent = totalPenalty.toFixed(2);

    const rankElem = root.querySelector<HTMLElement>("#battle-rank-letter");
    if (rankElem) rankElem.textContent = grade.rank;

    const rankLabelElem = root.querySelector<HTMLElement>("#battle-rank-label");
    if (rankLabelElem) {
      rankLabelElem.textContent = grade.label ?? "";
      rankLabelElem.style.display = grade.label ? "block" : "none";
    }

    const saveStatusElem = root.querySelector<HTMLElement>("#battle-save-status");
    let bestLine = "";

    if (meta && meta.id) {
      const previousBest = this.localSave.getLevelScore(meta.id);
      const savedScore: SavedBattleScore = {
        hitsTaken: hits,
        blocks,
        rank: grade.rank,
        score: totalPenalty,
        timestamp: Date.now(),
      };
      const newBest = this.localSave.recordLevelScore(meta.id, savedScore);
      const bestAfter = this.localSave.getLevelScore(meta.id);
      if (bestAfter) {
        bestLine = `${meta.displayName ?? meta.id} best: ${bestAfter.rank} (${bestAfter.score.toFixed(2)})`;
      }
      if (saveStatusElem) {
        if (newBest) {
          saveStatusElem.textContent = "New personal best saved";
          saveStatusElem.classList.add("battle-save-status--highlight");
        } else if (previousBest) {
          saveStatusElem.textContent = "Personal best unchanged";
          saveStatusElem.classList.remove("battle-save-status--highlight");
        } else {
          saveStatusElem.textContent = "Result stored";
          saveStatusElem.classList.add("battle-save-status--highlight");
        }
      }
    } else if (saveStatusElem) {
      saveStatusElem.textContent = "Result not saved (custom level)";
      saveStatusElem.classList.remove("battle-save-status--highlight");
    }

    const bestElem = root.querySelector<HTMLElement>("#battle-best-line");
    if (bestElem) {
      bestElem.textContent = bestLine;
      bestElem.style.display = bestLine ? "block" : "none";
    }

    this.scheduleBattleLineReveal(root);
  }

  private scheduleBattleLineReveal(root: HTMLElement) {
    this.clearRevealTimers();

    const battleLines = Array.from(root.querySelectorAll<HTMLElement>(".battle-line"));
    const baseDelay = 150;
    const delayBetween = 220;
    let revealIndex = 0;

    for (const line of battleLines) {
      line.classList.remove("battle-line--visible");

      const computedDisplay = window.getComputedStyle(line).display;
      const isHidden = computedDisplay === "none";
      const hasContent = line.children.length > 0 || (line.textContent ?? "").trim().length > 0;

      if (isHidden || !hasContent) {
        continue;
      }

      const timeout = window.setTimeout(() => {
        line.classList.add("battle-line--visible");
        this.audio.playParrySound();
      }, baseDelay + revealIndex * delayBetween);

      this.revealTimeouts.push(timeout);
      revealIndex += 1;
    }
  }

  private clearRevealTimers() {
    for (const timeout of this.revealTimeouts) {
      window.clearTimeout(timeout);
    }
    this.revealTimeouts = [];
  }

  private calculateBattleGrade(hits: number, blocks: number): {
    rank: string;
    label?: string;
    score: number;
  } {
    const blockPenalty = blocks * 0.25;
    const score = hits + blockPenalty;

    if (hits === 0 && blocks === 0) {
      return { rank: "S+", label: "Perfect", score };
    }
    if (score <= 1) {
      return { rank: "S", label: "Masterful", score };
    }
    if (score <= 2) {
      return { rank: "A", label: "Excellent", score };
    }
    if (score <= 3) {
      return { rank: "B", label: "Solid", score };
    }
    if (score <= 5) {
      return { rank: "C", label: "Survivor", score };
    }
    return { rank: "D", label: "Keep Practicing", score };
  }
}
