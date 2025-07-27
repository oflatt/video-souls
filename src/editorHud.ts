export class EditorHud {
  controlsInfoPanel: HTMLElement | null = null;
  controlsInfoToggle: HTMLButtonElement | null = null;
  controlsInfoVisible: boolean = false;
  titleInput: HTMLInputElement;
  controlsInfoInstance: HTMLElement | null = null;
  hudElement: HTMLElement | null = null; // <-- track parent HUD element

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
  }
}
