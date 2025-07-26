import { LevelDataV0 } from "./leveldata";

export class AutosavesPage {
  element: HTMLElement;

  constructor(
    autosaves: { level: any; timestamp: number }[],
    onLoad: (level: LevelDataV0) => void,
    onBack: () => void
  ) {
    const template = document.getElementById("autosaves-page-template") as HTMLTemplateElement;
    if (!template || !template.content) throw new Error("Missing autosaves-page-template");
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    this.element = fragment.querySelector<HTMLElement>("#autosaves-page")!;
    document.body.appendChild(this.element);

    // Fill autosaves list
    const list = this.element.querySelector("#autosaves-list") as HTMLElement;
    list.innerHTML = "";
    for (let i = autosaves.length - 1; i >= 0; i--) {
      const entry = autosaves[i];
      const div = document.createElement("div");
      div.className = "autosave-entry";
      const date = new Date(entry.timestamp);
      div.innerHTML = `
        <span>Autosave #${i + 1}</span>
        <span class="autosave-timestamp">${date.toLocaleString()}</span>
        <button class="autosave-load-btn">Load</button>
      `;
      const loadBtn = div.querySelector(".autosave-load-btn") as HTMLButtonElement;
      loadBtn.onclick = () => {
        // TODO fix
        onLoad(entry.level);
      };
      list.appendChild(div);
    }

    // Wire up back button
    const backBtn = this.element.querySelector("#autosaves-back") as HTMLButtonElement;
    if (backBtn) {
      backBtn.onclick = () => {
        onBack();
      };
    }
  }

  cleanup() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
