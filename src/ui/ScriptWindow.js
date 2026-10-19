import { CodeJar } from 'codejar';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism-tomorrow.css';

const GEO_KEY = 'mechsim.scriptWindow';

/** The scripting guide shown by the Help button (static, trusted markup). */
const HELP_HTML = `
<h4>How scripting works</h4>
<p>Your code runs once every animation frame. You're given <code>t</code> (seconds since Reset) and <code>m</code> (the control API). No loop needed — just compute a pose and command it.</p>

<h4>Drive motors</h4>
<ul>
<li><code>m.setMotor(name, deg)</code> — set a servo to <code>deg</code>° from its zero. Auto-clamped to the motor's limit.</li>
<li><code>m.angle(name)</code> — the motor's current angle (degrees).</li>
<li><code>m.motorLimit(name)</code> — the motor's travel limit (degrees).</li>
<li><code>m.motor(name).angle</code> — same value as a getter/setter.</li>
</ul>
<p>Motors are addressed by their <b>crank</b> or <b>pivot</b> joint — by name or id.</p>
<pre><code>m.setMotor('Hip', 30 * Math.sin(t));</code></pre>

<h4>Inverse kinematics</h4>
<ul>
<li><code>m.target(name, x, y)</code> — pull a joint toward (x, y) in mm; the solver resolves the rest of the chain. Works on a free joint (one not pinned by a motor).</li>
</ul>
<pre><code>m.target('Feet', 20 * Math.cos(t), -100);</code></pre>

<h4>Read the scene (live)</h4>
<ul>
<li><code>m.getJoint(name)</code> &rarr; <code>{ id, name, x, y, fixed, color }</code></li>
<li><code>m.getLink(name)</code> &rarr; <code>{ a, b, aName, bName, length, currentLength, ax, ay, bx, by }</code></li>
<li><code>m.getMotor(name)</code> &rarr; <code>{ pivot, crank, pivotName, crankName, inverted, zeroDegrees, limitDegrees, angle }</code></li>
<li><code>m.pos(name)</code> &rarr; <code>{ x, y }</code> of a joint.</li>
</ul>
<p>Reading live lets a gait adapt to the real geometry instead of hardcoding coordinates.</p>

<h4>Remember across frames</h4>
<p><code>m.state</code> is an object that survives between frames (cleared when you press Apply). Capture fixed geometry once:</p>
<pre><code>if (!m.state.ok) {
  m.state.home = m.getJoint('Feet');
  m.state.ok = true;
}</code></pre>

<h4>Buttons</h4>
<ul>
<li><b>Apply</b> — compile your code (also clears <code>m.state</code>).</li>
<li><b>Run / Pause</b> — start or stop the simulation.</li>
<li><b>&#8635; t</b> — reset time <code>t</code> to 0.</li>
<li><b>On</b> — enable this script as the active driver.</li>
<li><b>Trail</b> — draw the path each joint traces.</li>
</ul>
`;

/**
 * A draggable, resizable in-app window hosting a lightweight syntax-highlighted
 * JS editor (CodeJar + Prism) for the ScriptDriver. It carries its own Run/
 * Pause, Apply, Reset-t and Enable controls so you can author and run a script
 * without reaching back to the main toolbar.
 *
 * Geometry and open-state persist to localStorage; the script source itself is
 * part of the scene (owned by App), surfaced here through the actions facade.
 */
export class ScriptWindow {
  /**
   * @param {object} actions getScript, setScript, toggleScriptEnabled,
   *   resetScript, togglePlay, isPlaying, onOpenChanged
   */
  constructor(actions) {
    this.actions = actions;
    this.el = null;
    this.jar = null;
    this._open = false;
    this._geo = this._loadGeo();
    this.helpWin = null;             // separate, draggable guide window
    this._helpGeo = this._loadHelpGeo();
  }

  get isOpen() { return this._open; }
  get wasOpen() { return this._geo.open; }

  toggle() { this._open ? this.close() : this.open(); }

  open() {
    if (!this.el) this._build();
    this.el.hidden = false;
    this._open = true;
    this.refresh();
    this._persist();
    this.actions.onOpenChanged?.(true);
  }

  close() {
    this._syncGeoFromEl();
    if (this.el) this.el.hidden = true;
    // Closing the editor also dismisses its guide window.
    if (this.helpWin && !this.helpWin.hidden) {
      this.helpWin.hidden = true;
      if (this.helpBtn) this.helpBtn.textContent = '? Help';
    }
    this._open = false;
    this._persist();
    this.actions.onOpenChanged?.(false);
  }

  // ---- Build ---------------------------------------------------------------

  _build() {
    const win = el('div', 'script-window');
    win.hidden = true;
    win.style.left = `${this._geo.x}px`;
    win.style.top = `${this._geo.y}px`;
    win.style.width = `${this._geo.w}px`;
    win.style.height = `${this._geo.h}px`;

    const title = el('div', 'sw-title');
    const label = el('span', 'sw-name', 'Script');
    const btns = el('div', 'sw-btns');
    this.runBtn = btn('▶ Run', () => this.actions.togglePlay?.());
    this.applyBtn = btn('Apply', () => this._apply(), 'primary');
    this.resetBtn = btn('⟲ t', () => this.actions.resetScript?.());
    const enableWrap = el('label', 'sw-enable');
    this.enable = document.createElement('input');
    this.enable.type = 'checkbox';
    this.enable.addEventListener('change', () => this.actions.toggleScriptEnabled?.(this.enable.checked));
    enableWrap.append(this.enable, document.createTextNode('On'));

    // Trail: draw the path each moving joint traces while the sim runs.
    const trailWrap = el('label', 'sw-enable');
    trailWrap.title = 'Draw the path each joint traces as the mechanism moves';
    this.trail = document.createElement('input');
    this.trail.type = 'checkbox';
    this.trail.addEventListener('change', () => this.actions.setTrail?.(this.trail.checked));
    trailWrap.append(this.trail, document.createTextNode('Trail'));
    this.clearTrailBtn = btn('Clear', () => this.actions.clearTrail?.());
    this.clearTrailBtn.title = 'Erase the recorded joint trails';

    this.helpBtn = btn('? Help', () => this._toggleHelp());
    this.helpBtn.title = 'Show the scripting guide';
    this.closeBtn = btn('✕', () => this.close(), 'close');
    btns.append(this.runBtn, this.applyBtn, this.resetBtn, enableWrap, trailWrap, this.clearTrailBtn, this.helpBtn, this.closeBtn);
    title.append(label, btns);

    const editorWrap = el('div', 'sw-editor');
    this.codeEl = el('div', 'sw-code language-js');
    editorWrap.appendChild(this.codeEl);

    this.status = el('div', 'sw-status');

    win.append(title, editorWrap, this.status);
    document.body.appendChild(win);
    this.el = win;

    this.jar = CodeJar(this.codeEl, (e) => Prism.highlightElement(e), { tab: '  ' });

    this._installDrag(title, win, () => { this._syncGeoFromEl(); this._persist(); });
    this._ro = new ResizeObserver(() => { this._syncGeoFromEl(); this._persist(); });
    this._ro.observe(win);
  }

  _apply() {
    const code = this.jar ? this.jar.toString() : '';
    this.actions.setScript?.(code, this.enable.checked);
  }

  /** Open/close the scripting guide as its own floating window. */
  _toggleHelp() {
    if (!this.helpWin) this._buildHelpWindow();
    const show = this.helpWin.hidden;
    this.helpWin.hidden = !show;
    this.helpBtn.textContent = show ? '✕ Help' : '? Help';
  }

  _buildHelpWindow() {
    const win = el('div', 'script-window help-window');
    win.hidden = true;
    win.style.left = `${this._helpGeo.x}px`;
    win.style.top = `${this._helpGeo.y}px`;
    win.style.width = `${this._helpGeo.w}px`;
    win.style.height = `${this._helpGeo.h}px`;

    const title = el('div', 'sw-title');
    title.append(el('span', 'sw-name', 'Scripting Guide'));
    const btns = el('div', 'sw-btns');
    btns.append(btn('✕', () => this._toggleHelp(), 'close'));
    title.append(btns);

    const body = el('div', 'sw-help');
    body.innerHTML = HELP_HTML;

    win.append(title, body);
    document.body.appendChild(win);
    this.helpWin = win;

    this._installDrag(title, win, () => this._persistHelp());
    this._helpRo = new ResizeObserver(() => this._persistHelp());
    this._helpRo.observe(win);
  }

  _persistHelp() {
    if (!this.helpWin || this.helpWin.hidden) return;
    const r = this.helpWin.getBoundingClientRect();
    this._helpGeo = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    try { localStorage.setItem('mechsim.helpWindow', JSON.stringify(this._helpGeo)); } catch { /* ignore */ }
  }

  _loadHelpGeo() {
    const def = { x: 546, y: 96, w: 340, h: 380 };
    try {
      const g = JSON.parse(localStorage.getItem('mechsim.helpWindow') ?? '');
      return {
        x: Number.isFinite(g.x) ? g.x : def.x,
        y: Number.isFinite(g.y) ? g.y : def.y,
        w: Number.isFinite(g.w) ? g.w : def.w,
        h: Number.isFinite(g.h) ? g.h : def.h
      };
    } catch {
      return def;
    }
  }

  // ---- Sync ----------------------------------------------------------------

  /** Reload code + enabled from the scene (call on scene load). */
  refresh() {
    if (!this.jar) return;
    const s = this.actions.getScript?.() ?? { source: '', enabled: false, error: null };
    if (this.jar.toString() !== (s.source || '')) this.jar.updateCode(s.source || '');
    this.enable.checked = s.enabled;
    if (this.trail) this.trail.checked = this.actions.isTrailOn?.() ?? false;
    this.syncStatus({ playing: this.actions.isPlaying?.() ?? false, error: s.error, enabled: s.enabled });
  }

  /** Lightweight per-frame update of the run button, enable box and error. */
  syncStatus({ playing, error, enabled }) {
    if (!this._open || !this.el) return;
    if (this.runBtn) this.runBtn.textContent = playing ? '❚❚ Pause' : '▶ Run';
    if (this.enable && enabled != null && document.activeElement !== this.enable) {
      this.enable.checked = enabled;
    }
    if (this.status) {
      this.status.textContent = error ? `⚠ ${error}` : '';
      this.status.classList.toggle('err', !!error);
    }
  }

  // ---- Drag / geometry -----------------------------------------------------

  _installDrag(handle, target, onEnd) {
    // Claim touch gestures on the title bar so a finger-drag moves the window
    // instead of the browser treating it as a page scroll (which cancels it).
    handle.style.touchAction = 'none';
    let sx = 0; let sy = 0; let ox = 0; let oy = 0; let dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, input, label')) return; // let controls work
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY;
      const r = target.getBoundingClientRect();
      ox = r.left; oy = r.top;
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const x = clamp(ox + (e.clientX - sx), 0, window.innerWidth - 80);
      const y = clamp(oy + (e.clientY - sy), 0, window.innerHeight - 40);
      target.style.left = `${x}px`;
      target.style.top = `${y}px`;
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      onEnd?.();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  _syncGeoFromEl() {
    if (!this.el || this.el.hidden) return;
    const r = this.el.getBoundingClientRect();
    this._geo = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }

  _persist() {
    try { localStorage.setItem(GEO_KEY, JSON.stringify({ ...this._geo, open: this._open })); } catch { /* ignore */ }
  }

  _loadGeo() {
    const def = { x: 90, y: 96, w: 440, h: 320, open: false };
    try {
      const g = JSON.parse(localStorage.getItem(GEO_KEY) ?? '');
      return {
        x: Number.isFinite(g.x) ? g.x : def.x,
        y: Number.isFinite(g.y) ? g.y : def.y,
        w: Number.isFinite(g.w) ? g.w : def.w,
        h: Number.isFinite(g.h) ? g.h : def.h,
        open: !!g.open
      };
    } catch {
      return def;
    }
  }
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function btn(text, onClick, cls = '') {
  const b = el('button', `sw-b ${cls}`.trim(), text);
  b.addEventListener('click', onClick);
  return b;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
