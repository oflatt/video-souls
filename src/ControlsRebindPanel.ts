import { global } from './globalState';
import { Keybindings } from './LocalSave';

export class ControlsRebindPanel {
  panelElement: HTMLElement;
  closeButton: HTMLButtonElement;
  listElement: HTMLElement;

  constructor() {
    // Clone the template
    const tpl = document.getElementById('controls-rebind-template') as HTMLTemplateElement;
    if (!tpl || !tpl.content) throw new Error('Missing controls-rebind-template');
    const fragment = tpl.content.cloneNode(true) as DocumentFragment;
    this.panelElement = fragment.querySelector('#controls-rebind-panel')!;
    this.closeButton = this.panelElement.querySelector('#controls-rebind-close')!;
    this.listElement = this.panelElement.querySelector('#controls-rebind-list')!;
    document.body.appendChild(this.panelElement);

    this.renderList();
    this.closeButton.onclick = () => this.cleanup();
  }

  renderList() {
    this.listElement.innerHTML = '';
    const keybindings: Keybindings = global().localSave.keybindings;
    for (const action in keybindings) {
      if (!Object.prototype.hasOwnProperty.call(keybindings, action)) continue;
      const row = document.createElement('div');
      row.className = 'controls-rebind-row';
      const label = document.createElement('span');
      label.className = 'controls-rebind-label';
      label.textContent = action;
      const key = document.createElement('span');
      key.className = 'controls-rebind-key';
      key.textContent = keybindings[action as keyof Keybindings];
      const rebindBtn = document.createElement('button');
      rebindBtn.className = 'controls-rebind-btn';
      rebindBtn.textContent = 'Rebind';
      rebindBtn.onclick = () => {
        rebindBtn.textContent = 'Press a key...';
        const onKeyDown = (e: KeyboardEvent) => {
          e.preventDefault();
          const newKey = e.key;
          global().localSave.keybindings[action as keyof Keybindings] = newKey;
          global().localSave.save();
          window.removeEventListener('keydown', onKeyDown, true);
          this.renderList();
        };
        window.addEventListener('keydown', onKeyDown, true);
      };
      row.appendChild(rebindBtn);
      row.appendChild(label);
      row.appendChild(key);
      this.listElement.appendChild(row);
    }
  }

  cleanup() {
    if (this.panelElement && this.panelElement.parentNode) {
      this.panelElement.parentNode.removeChild(this.panelElement);
    }
  }
}
