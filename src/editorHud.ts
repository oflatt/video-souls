export class EditorHud {
  controlsInfoPanel: HTMLElement | null = null;
  controlsInfoToggle: HTMLButtonElement | null = null;
  controlsInfoVisible: boolean = true;
  titleInput: HTMLInputElement;

  constructor() {
    this.titleInput = document.getElementById("editor-title-input") as HTMLInputElement;
    this.controlsInfoPanel = document.getElementById("controls-info");
    if (this.controlsInfoPanel) {
      let toggleBtn = document.getElementById("controls-info-toggle") as HTMLButtonElement;
      if (!toggleBtn) {
        toggleBtn = document.createElement("button");
        toggleBtn.id = "controls-info-toggle";
        toggleBtn.textContent = "Hide Controls";
        // Move the button inside the controls panel, at the top
        toggleBtn.style.display = "block";
        toggleBtn.style.margin = "0 0 8px 0";
        toggleBtn.style.width = "100%";
        toggleBtn.style.fontSize = "13px";
        toggleBtn.style.padding = "2px 0";
        this.controlsInfoPanel.insertBefore(toggleBtn, this.controlsInfoPanel.firstChild);
      }
      this.controlsInfoToggle = toggleBtn;
      this.controlsInfoVisible = true;
      this.controlsInfoPanel.style.display = "block";
      this.controlsInfoToggle.onclick = () => {
        this.controlsInfoVisible = !this.controlsInfoVisible;
        if (this.controlsInfoVisible) {
          this.controlsInfoPanel!.style.display = "block";
          this.controlsInfoPanel!.insertBefore(this.controlsInfoToggle!, this.controlsInfoPanel!.firstChild);
          this.controlsInfoToggle!.textContent = "Hide Controls";
        } else {
          this.controlsInfoPanel!.style.display = "none";
          // Move the toggle button outside the panel so it remains visible
          document.body.appendChild(this.controlsInfoToggle!);
          this.controlsInfoToggle!.style.position = "absolute";
          this.controlsInfoToggle!.style.top = "10px";
          this.controlsInfoToggle!.style.right = "10px";
          this.controlsInfoToggle!.style.width = "auto";
          this.controlsInfoToggle!.textContent = "Show Controls";
        }
      };
    }
  }

  reset() {
    if (this.controlsInfoPanel && this.controlsInfoToggle) {
      this.controlsInfoPanel.style.display = "block";
      this.controlsInfoPanel.insertBefore(this.controlsInfoToggle, this.controlsInfoPanel.firstChild);
      this.controlsInfoToggle.style.position = "static";
      this.controlsInfoToggle.style.width = "100%";
      this.controlsInfoToggle.textContent = "Hide Controls";
      this.controlsInfoVisible = true;
    }
  }
}
