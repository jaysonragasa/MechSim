import { el } from './dom.js';

/**
 * A docked inspector that lives in a fixed corner of the canvas rather than
 * floating next to the picked object. Same content contract as FloatingPanel
 * (show(title, body)/hide()/visible) so App can swap between them freely based
 * on the user's placement preference.
 */
export class DockPanel {
  /** @param {HTMLElement} container The fixed docked container element. */
  constructor(container) {
    this.container = container;
    this.anchor = null; // unused; kept for interface parity with FloatingPanel
    this._visible = false;
  }

  get visible() { return this._visible; }

  show(title, bodyEl) {
    this.container.innerHTML = '';
    const head = el('div', 'popover-head');
    head.appendChild(el('span', null, title));
    const close = el('button', 'close', '✕');
    close.addEventListener('click', () => this.hide());
    head.appendChild(close);
    const body = el('div', 'popover-body');
    body.appendChild(bodyEl);
    this.container.append(head, body);
    this.container.hidden = false;
    this._visible = true;
  }

  reposition() { /* docked: fixed position, nothing to do */ }

  hide() {
    this.container.innerHTML = '';
    this.container.hidden = true;
    this._visible = false;
  }
}
