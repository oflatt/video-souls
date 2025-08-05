import { global } from './globalState';
import { VideoPlayer } from './videoPlayer';

export class EditorHud {
  controlsInfoPanel: HTMLElement | null = null;
  controlsInfoToggle: HTMLButtonElement | null = null;
  controlsInfoVisible: boolean = false;
  titleInput: HTMLInputElement;
  controlsInfoInstance: HTMLElement | null = null;
  hudElement: HTMLElement | null = null;
  speedSlider: HTMLInputElement | null = null;
  speedValue: HTMLElement | null = null;

  constructor() {
    this.titleInput = document.getElementById("editor-title-input") as HTMLInputElement;
    this.hudElement = document.getElementById("record-hud") as HTMLElement;

    this.controlsInfoToggle = document.getElementById("controls-info-toggle") as HTMLButtonElement;
    if (this.controlsInfoToggle) {
      this.controlsInfoToggle.textContent = "Show Controls";
      this.controlsInfoToggle.onclick = () => {
        this.controlsInfoVisible = !this.controlsInfoVisible;
        if (this.controlsInfoVisible) {
          // Instantiate controls-info from template as child of HUD
          if (!this.controlsInfoInstance) {
            const tpl = document.getElementById("controls-info-template") as HTMLTemplateElement;
            if (tpl && tpl.content) {
              const fragment = tpl.content.cloneNode(true) as DocumentFragment;
              this.controlsInfoInstance = fragment.querySelector<HTMLElement>("#controls-info")!;
              if (this.hudElement) {
                this.hudElement.appendChild(this.controlsInfoInstance);
              }
              this.controlsInfoPanel = this.controlsInfoInstance;
            }
          }
          this.controlsInfoToggle!.textContent = "Hide Controls";
        } else {
          // Remove controls-info from HUD
          if (this.controlsInfoInstance && this.controlsInfoInstance.parentNode) {
            this.controlsInfoInstance.parentNode.removeChild(this.controlsInfoInstance);
            this.controlsInfoInstance = null;
            this.controlsInfoPanel = null;
          }
          this.controlsInfoToggle!.textContent = "Show Controls";
        }
      };
    }

    // --- Playback speed slider handling ---
    this.speedSlider = document.getElementById("editor-speed-slider") as HTMLInputElement;
    this.speedValue = document.getElementById("editor-speed-value") as HTMLElement;
    if (!global()) {
      return;
    }
    let savedSpeed = global().localSave.editorVideoSpeed || 1; // 
    // Default to 1 if not set
    if (this.speedSlider) {
      this.speedSlider.value = String(savedSpeed);
      if (this.speedValue) this.speedValue.textContent = `${Number(savedSpeed).toFixed(2)}x`;
      this.speedSlider.addEventListener("input", () => {
        const val = Number(this.speedSlider!.value);
        global().videoPlayer.setPlaybackRate(val);
        if (this.speedValue) this.speedValue.textContent = `${val.toFixed(2)}x`;
        // Save to LocalSave
        console.log("Saving editor video speed:", val);
        global().localSave.editorVideoSpeed = val;
        global().localSave.save();
      });
    } else {
      // If slider not found, update anyway if present in DOM (for safety)
      const domSlider = document.getElementById("editor-speed-slider") as HTMLInputElement;
      const domValue = document.getElementById("editor-speed-value") as HTMLElement;
      if (domSlider) domSlider.value = String(savedSpeed);
      if (domValue) domValue.textContent = `${Number(savedSpeed).toFixed(2)}x`;
    }
  }
}
