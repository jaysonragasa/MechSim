import { el } from './dom.js';

/**
 * A lightweight right-click context menu. Built from a list of entries;
 * dismisses on outside click, Escape, or after an action runs.
 */
export class ContextMenu {
  constructor() {
    this.root = null;
    this._onDocDown = (e) => {
      if (this.root && !this.root.contains(e.target)) this.hide();
    };
    this._onKey = (e) => { if (e.key === 'Escape') this.hide(); };
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {Array<{label:string, onClick?:Function, title?:string, danger?:boolean, separator?:boolean}>} entries
   */
  show(clientX, clientY, entries) {
    this.hide();
    const menu = el('div', 'context-menu');
    if (entries.title) menu.appendChild(el('div', 'menu-title', entries.title));
    for (const entry of entries.items ?? entries) {
      if (entry.separator) { menu.appendChild(el('div', 'menu-sep')); continue; }
      if (entry.heading) { menu.appendChild(el('div', 'menu-title', entry.heading)); continue; }
      const b = el('button', entry.danger ? 'danger' : '', entry.label);
      if (entry.title) b.title = entry.title;
      b.addEventListener('click', () => { this.hide(); entry.onClick?.(); });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    this.root = menu;

    // Position within the viewport.
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const x = Math.min(clientX, window.innerWidth - w - 8);
    const y = Math.min(clientY, window.innerHeight - h - 8);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    setTimeout(() => {
      document.addEventListener('pointerdown', this._onDocDown);
      document.addEventListener('keydown', this._onKey);
    }, 0);
  }

  hide() {
    if (this.root) {
      this.root.remove();
      this.root = null;
      document.removeEventListener('pointerdown', this._onDocDown);
      document.removeEventListener('keydown', this._onKey);
    }
  }
}
