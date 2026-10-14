import { el, input } from './dom.js';

/**
 * Live read-out of motor angles (respecting each motor's zero reference,
 * invert and limit) and link angles measured from their start joint.
 *
 * The header (title + "Names on canvas" toggle) is built once so it survives
 * the per-frame body refresh; only the list body is rebuilt on update.
 */
export class InfoOverlay {
  /**
   * @param {HTMLElement} root
   * @param {object} [cb] { onToggleLabels(checked) }
   */
  constructor(root, cb = {}) {
    this.root = root;
    this.cb = cb;
    this.visible = false;
    this._buildShell();
  }

  _buildShell() {
    this.root.innerHTML = '';
    const head = el('div', 'info-head');
    head.appendChild(el('h3', null, 'Info'));
    const toggle = el('label', 'info-toggle');
    this._labelCheck = input('checkbox', {});
    this._labelCheck.addEventListener('change', () => this.cb.onToggleLabels?.(this._labelCheck.checked));
    toggle.append(this._labelCheck, el('span', null, 'Names on canvas'));
    head.appendChild(toggle);
    this.body = el('div', 'info-body');
    this.root.append(head, this.body);
  }

  /** Reflect the current label-mode state in the checkbox. */
  setLabels(on) {
    if (this._labelCheck) this._labelCheck.checked = on;
  }

  toggle() { this.setVisible(!this.visible); }

  setVisible(v) {
    this.visible = v;
    this.root.hidden = !v;
  }

  /**
   * @param {import('../domain/Mechanism.js').Mechanism} mechanism
   * @param {import('../simulation/AngleDriver.js').AngleDriver[]} drivers
   */
  update(mechanism, drivers) {
    if (!this.visible) return;
    this.body.innerHTML = '';

    this.body.appendChild(el('h3', null, 'Motors'));
    if (drivers.length === 0) {
      this.body.appendChild(el('div', 'info-empty', 'No motors.'));
    } else {
      for (const d of drivers) {
        const limit = d.limitDegrees >= 360 ? '360°' : `${d.limitDegrees}°`;
        this.body.appendChild(this._rowEl(
          `${d.crank.name}`,
          `${d.measuredAngleDegrees().toFixed(1)}°  (0@${d.zeroDegrees}°, ≤${limit}${d.inverted ? ', inv' : ''})`
        ));
      }
    }

    this.body.appendChild(el('h3', null, 'Links'));
    if (mechanism.links.length === 0) {
      this.body.appendChild(el('div', 'info-empty', 'No links.'));
    } else {
      for (const l of mechanism.links) {
        const v = l.jointB.position.sub(l.jointA.position);
        let deg = (v.angle * 180) / Math.PI % 360;
        if (deg < 0) deg += 360;
        this.body.appendChild(this._rowEl(l.name, `${deg.toFixed(1)}°  ·  ${v.length.toFixed(1)} mm`));
      }
    }
  }

  _rowEl(k, v) {
    const r = el('div', 'info-row');
    r.append(el('span', 'k', k), el('span', 'v', v));
    return r;
  }
}
