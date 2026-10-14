import { el } from './dom.js';

/**
 * A single reusable floating popover anchored near a point on the canvas.
 * The host (App) fills it with content built by the Inspector. Only one is
 * shown at a time; clicking its close button or calling hide() dismisses it.
 */
export class FloatingPanel {
  /** @param {HTMLElement} layer The absolutely-positioned floating layer. */
  constructor(layer) {
    this.layer = layer;
    this.root = null;
    this.anchor = null; // { xPx, yPx } in layer-local coordinates
  }

  get visible() { return !!this.root; }

  /**
   * Show a popover with a title and body element near a layer-local point.
   * @param {string} title
   * @param {HTMLElement} bodyEl
   * @param {{x:number, y:number}} atPx layer-local coordinates
   */
  show(title, bodyEl, atPx) {
    this.hide();
    const pop = el('div', 'popover');
    const head = el('div', 'popover-head');
    head.appendChild(el('span', null, title));
    const close = el('button', 'close', '✕');
    close.addEventListener('click', () => this.hide());
    head.appendChild(close);
    const body = el('div', 'popover-body');
    body.appendChild(bodyEl);
    pop.append(head, body);
    this.layer.appendChild(pop);
    this.root = pop;
    this.anchor = atPx;
    this._place(atPx);
    return pop;
  }

  _place(atPx) {
    const pop = this.root;
    const lw = this.layer.clientWidth;
    const lh = this.layer.clientHeight;
    const pw = pop.offsetWidth || 248;
    const ph = pop.offsetHeight || 160;
    let x = atPx.x + 14;
    let y = atPx.y + 14;
    if (x + pw > lw - 8) x = Math.max(8, atPx.x - pw - 14);
    if (y + ph > lh - 8) y = Math.max(8, lh - ph - 8);
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
  }

  /** Reposition to track a moving anchor (e.g. joint being dragged). */
  reposition(atPx) {
    if (!this.root) return;
    this.anchor = atPx;
    this._place(atPx);
  }

  hide() {
    if (this.root) {
      this.root.remove();
      this.root = null;
      this.anchor = null;
    }
  }
}
