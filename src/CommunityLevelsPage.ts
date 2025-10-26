import { CommunityLevelEntry, fetchCommunityLevels } from "./communityLevels";
import { LevelDataV0, LevelMeta } from "./leveldata";

export class CommunityLevelsPage {
  levels: CommunityLevelEntry[] = [];
  loaded: boolean = false;
  rootElement: HTMLElement;

  constructor(onBack?: () => void, onLevelSelected?: (level: LevelDataV0, meta: LevelMeta) => void) {
    // Instantiate the template and add to DOM
    const template = document.getElementById("community-levels-template") as HTMLTemplateElement;
    if (!template || !template.content) throw new Error("Missing community-levels-template");
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const root = fragment.querySelector<HTMLElement>("#community-levels-page")!;
    document.body.appendChild(root);
    this.rootElement = root;

    // Wire up back button
    const backBtn = root.querySelector<HTMLButtonElement>("#community-levels-back");
    if (backBtn) {
      backBtn.onclick = () => {
        if (onBack) onBack();
        this.cleanup();
      };
    }

    // Wire up refresh button
    const refreshBtn = root.querySelector<HTMLButtonElement>("#community-levels-refresh");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        this.loadLevels().then(() => this.renderLevels(onLevelSelected));
      };
    }

    // Initial load and render
    this.loadLevels().then(() => this.renderLevels(onLevelSelected));
  }

  async loadLevels() {
    this.levels = await fetchCommunityLevels();
    this.loaded = true;
  }

  renderLevels(onLevelSelected?: (level: LevelDataV0, meta: LevelMeta) => void) {
    const listElem = this.rootElement.querySelector<HTMLDivElement>("#community-levels-list");
    if (!listElem) return;
    listElem.innerHTML = "";
    for (const level of this.levels) {
      const btn = document.createElement("button");
      btn.textContent = level.title;
      btn.style.fontSize = "18px";
      btn.onclick = () => {
        if (onLevelSelected) onLevelSelected(level.level, level.meta);
      };

      // --- Add YouTube thumbnail preview ---
      const videoId = level.level.video;
      if (typeof videoId === "string" && videoId.length === 11) {
        const img = document.createElement("img");
        img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        img.alt = "YouTube thumbnail";
        img.style.width = "120px";
        img.style.height = "68px";
        img.style.objectFit = "cover";
        img.style.marginRight = "10px";
        img.style.verticalAlign = "middle";
        btn.prepend(img);
      }

      listElem.appendChild(btn);
    }
  }

  cleanup() {
    if (this.rootElement && this.rootElement.parentNode) {
      this.rootElement.parentNode.removeChild(this.rootElement);
    }
  }
}
