/**
 * Builds and manages the right-hand control panel DOM.
 *
 * Strict separation of concerns: the panel never touches domain objects
 * directly. It reads display state through getters and triggers changes only
 * through the injected `actions` facade (Dependency Inversion). This keeps all
 * mutation funnelling through the App, which owns consistency.
 *
 *   - build()            : create the static section skeleton once
 *   - refresh()          : rebuild dynamic lists after structural changes
 *   - tick(viewState)    : cheaply update live values each animation frame
 */
export class ControlPanel {
  /**
   * @param {HTMLElement} root
   * @param {object} actions Facade of App operations (see App.actions()).
   */
  constructor(root, actions) {
    this.root = root;
    this.actions = actions;
    /** @type {Map<string, {x: HTMLInputElement, y: HTMLInputElement}>} */
    this._coordInputs = new Map();
    // DOM element per item, so a hover anywhere can light up the right row.
    this._jointEls = new Map(); // jointId -> element
    this._linkEls = new Map();  // link -> element
    this._bodyEls = new Map();  // body -> element
    // Per-section collapsed state (keyed by title), remembered across reloads.
    this._collapsed = this._loadCollapsed();
  }

  _loadCollapsed() {
    try { return JSON.parse(localStorage.getItem('mechsim.panels.v1') || '{}') || {}; }
    catch { return {}; }
  }

  _saveCollapsed() {
    try { localStorage.setItem('mechsim.panels.v1', JSON.stringify(this._collapsed)); } catch { /* ignore */ }
  }

  /** A collapsible panel section whose open/closed state persists by title. */
  _section(title) {
    const sec = el('section', 'panel-section');
    const h = el('h2');
    const label = el('span');
    label.textContent = title;
    const chev = el('span', 'sec-chevron');
    chev.textContent = '▾';
    h.append(label, chev);
    const body = el('div', 'panel-body');
    sec.append(h, body);

    if (this._collapsed[title]) sec.classList.add('collapsed');
    h.addEventListener('click', () => {
      const nowCollapsed = !sec.classList.contains('collapsed');
      sec.classList.toggle('collapsed', nowCollapsed);
      this._collapsed[title] = nowCollapsed;
      this._saveCollapsed();
    });
    return sec;
  }

  build() {
    this.root.innerHTML = '';
    this.root.appendChild(this._presetsSection());
    this.root.appendChild(this._simulationSection());
    this.root.appendChild(this._gridSection());
    this.root.appendChild(this._motorSection());
    this.root.appendChild(this._jointsSection());
    this.root.appendChild(this._linksSection());
    this.root.appendChild(this._rigidSection());
    this.refresh();
  }

  // ---- Static sections ----------------------------------------------------

  _presetsSection() {
    const sec = this._section('Presets');
    const body = sec.querySelector('.panel-body');
    const group = el('div', 'btn-group');
    const serial = button('Leg · serial', () => this.actions.loadPreset('legSerial'), 'primary');
    serial.title = 'Robot leg in serial connection (2 DOF)';
    const parallel = button('Leg · parallel', () => this.actions.loadPreset('legMultilinkage'), 'primary');
    parallel.title = 'Robot leg in parallel connection with 2 links';
    const parallelHorn = button('Leg · parallel 2', () => this.actions.loadPreset('legParallelHorn'), 'primary');
    parallelHorn.title = 'Robot leg, parallel with tibia servo horn + linkage';
    group.append(
      serial,
      parallel,
      parallelHorn,
      button('Slider-crank', () => this.actions.loadPreset('sliderCrank'), 'primary'),
      button('Empty', () => this.actions.loadPreset('empty'), 'ghost')
    );
    body.appendChild(group);
    body.appendChild(hint('Load a starting mechanism, then drag joints or edit coordinates below. All distances are in millimeters.'));
    return sec;
  }

  _simulationSection() {
    const sec = this._section('Simulation');
    const body = sec.querySelector('.panel-body');

    this._playBtn = button('▶ Play', () => this.actions.togglePlay(), 'primary');
    const resetBtn = button('⟲ Reset view', () => this.actions.resetView());
    const grp = el('div', 'btn-group');
    grp.append(this._playBtn, resetBtn);
    body.appendChild(grp);

    // Solver accuracy (iterations).
    const iterRow = el('div', 'row');
    iterRow.appendChild(label('Solver'));
    this._iterValue = el('span', 'readout');
    this._iterSlider = input('range', { min: 4, max: 60, step: 1, value: 24 });
    this._iterSlider.addEventListener('input', () => {
      const n = Number(this._iterSlider.value);
      this.actions.setIterations(n);
      this._iterValue.textContent = `${n} it`;
    });
    iterRow.append(this._iterSlider, this._iterValue);
    this._iterValue.textContent = '24 it';
    body.appendChild(iterRow);
    body.appendChild(hint('More solver iterations = stiffer, more accurate linkages.'));
    return sec;
  }

  _gridSection() {
    const sec = this._section('Grid & snapping');
    const body = sec.querySelector('.panel-body');
    const snap = this.actions.getSnap ? this.actions.getSnap() : { enabled: false, step: 5 };

    const enRow = el('label', 'row');
    enRow.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:auto';
    this._snapEnable = input('checkbox', {});
    this._snapEnable.checked = snap.enabled;
    this._snapEnable.addEventListener('change', () => this.actions.setSnapEnabled?.(this._snapEnable.checked));
    enRow.append(this._snapEnable, document.createTextNode('Snap to grid (G)'));
    body.appendChild(enRow);

    const stepRow = el('div', 'row');
    stepRow.appendChild(label('Step'));
    const stepInput = input('number', { min: 0.1, step: 0.5, value: snap.step });
    stepInput.addEventListener('change', () => this.actions.setSnapStep?.(Number(stepInput.value) || 5));
    const mm = el('span', 'tag');
    mm.textContent = 'mm';
    stepRow.append(stepInput, mm);
    body.appendChild(stepRow);
    body.appendChild(hint('Joints snap to this grid step when added or dragged. The Snap toolbar button toggles it too.'));
    return sec;
  }

  _motorSection() {
    const sec = this._section('Motor');
    const body = sec.querySelector('.panel-body');
    this._motorBody = body;
    return sec;
  }

  _jointsSection() {
    const sec = this._section('Joints');
    this._jointList = el('div', 'joint-list');
    sec.querySelector('.panel-body').appendChild(this._jointList);
    return sec;
  }

  _linksSection() {
    const sec = this._section('Links & arms');
    const body = sec.querySelector('.panel-body');
    this._linkBody = body;
    return sec;
  }

  _rigidSection() {
    const sec = this._section('Rigid bodies & offsets');
    const body = sec.querySelector('.panel-body');
    this._bodyBody = body;
    return sec;
  }

  // ---- Dynamic refresh ----------------------------------------------------

  refresh() {
    // Guard against refresh() being called before build() has created the
    // section elements (App loads a preset during construction).
    if (!this._jointList || !this._linkBody || !this._motorBody || !this._bodyBody) return;
    this._coordInputs.clear();
    this._jointEls.clear();
    this._linkEls.clear();
    this._bodyEls.clear();
    this._renderJointList();
    this._renderLinkControls();
    this._renderBodyControls();
    this._renderMotorControls();
  }

  _renderJointList() {
    const list = this._jointList;
    list.innerHTML = '';
    const joints = this.actions.getJoints();
    if (joints.length === 0) {
      list.appendChild(hint('No joints yet. Add one above or load a preset.'));
      return;
    }
    for (const joint of joints) {
      list.appendChild(this._jointItem(joint));
    }
  }

  _jointItem(joint) {
    const item = el('div', 'joint-item');

    const head = el('div', 'joint-head');
    const name = el('span', 'joint-name');
    const dot = el('span', `dot ${joint.fixed ? 'ground' : 'free'}`);
    const nameField = nameInput(joint.name, (v) => this.actions.renameJoint(joint, v));
    name.append(dot, nameField);
    const del = button('✕', () => this.actions.removeJoint(joint), 'ghost danger');
    del.style.padding = '2px 8px';
    head.append(name, del);
    item.appendChild(head);

    this._jointEls.set(joint.id, item);
    this._attachHover(item, { type: 'joint', ref: joint });

    const coords = el('div', 'joint-coords');
    const xf = field('X mm');
    const yf = field('Y mm');
    xf.input.value = round(joint.position.x);
    yf.input.value = round(joint.position.y);
    const commit = () => this.actions.setJointPosition(
      joint,
      Number(xf.input.value) || 0,
      Number(yf.input.value) || 0
    );
    xf.input.addEventListener('change', commit);
    yf.input.addEventListener('change', commit);
    coords.append(xf.wrap, yf.wrap);
    item.appendChild(coords);
    this._coordInputs.set(joint.id, { x: xf.input, y: yf.input });

    const row = el('div', 'row');
    row.style.marginTop = '6px';
    const fixedWrap = el('label', '');
    fixedWrap.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:auto';
    const cb = input('checkbox', {});
    cb.checked = joint.fixed;
    cb.addEventListener('change', () => this.actions.setJointFixed(joint, cb.checked));
    fixedWrap.append(cb, document.createTextNode('Grounded (anchored)'));
    row.appendChild(fixedWrap);
    item.appendChild(row);

    return item;
  }

  _renderLinkControls() {
    const body = this._linkBody;
    body.innerHTML = '';

    const links = this.actions.getLinks();
    if (links.length) {
      const listWrap = el('div', 'joint-list');
      listWrap.style.marginTop = '10px';
      for (const link of links) {
        const li = el('div', 'joint-item');
        const head = el('div', 'joint-head');
        const nameWrap = el('span', 'joint-name');
        nameWrap.append(nameInput(link.name, (v) => this.actions.renameLink(link, v)));
        head.append(
          nameWrap,
          button('✕', () => this.actions.removeLink(link), 'ghost danger')
        );
        const ends = el('p', 'hint');
        ends.style.margin = '0 0 6px';
        ends.textContent = `${link.jointA.name} — ${link.jointB.name}`;
        const lenRow = el('div', 'row');
        lenRow.style.marginTop = '6px';
        lenRow.appendChild(label('Length'));
        const lenInput = input('number', { step: 0.5, value: round(link.length) });
        lenInput.addEventListener('change', () =>
          this.actions.setLinkLength(link, Number(lenInput.value) || link.length));
        const unit = el('span', 'tag');
        unit.textContent = 'mm';
        lenRow.append(lenInput, unit);
        li.append(head, ends, lenRow);
        this._linkEls.set(link, li);
        this._attachHover(li, { type: 'link', ref: link });
        listWrap.appendChild(li);
      }
      body.appendChild(listWrap);
    } else {
      body.appendChild(hint('Use the Link tool (L) to connect joints into links.'));
    }
  }

  _renderBodyControls() {
    const body = this._bodyBody;
    body.innerHTML = '';
    const joints = this.actions.getJoints();
    const bodies = this.actions.getBodies();

    if (bodies.length) {
      const listWrap = el('div', 'joint-list');
      listWrap.style.marginTop = '10px';
      for (const b of bodies) {
        const li = el('div', 'joint-item');
        const head = el('div', 'joint-head');
        const title = el('span', 'joint-name');
        const dot = el('span', 'dot');
        dot.style.cssText = 'background:#ffb454;border-radius:2px';
        title.append(dot, nameInput(b.name, (v) => this.actions.renameBody(b, v)));
        head.append(title, button('✕', () => this.actions.removeRigidBody(b), 'ghost danger'));
        li.appendChild(head);

        const count = el('p', 'hint');
        count.style.margin = '0 0 6px';
        count.textContent = `${b.memberCount} pivots · ${b.joints.map((j) => j.name).join(', ')}`;
        li.appendChild(count);

        this._bodyEls.set(b, li);
        this._attachHover(li, { type: 'body', ref: b });

        // Fold an existing joint into this body (lock another point).
        const nonMembers = joints.filter((j) => !b.has(j));
        if (nonMembers.length) {
          const addRow = el('div', 'row');
          const sel = select(nonMembers);
          addRow.append(sel, button('+ add joint', () => {
            if (sel.value) this.actions.addJointToBody(b, sel.value);
          }));
          li.appendChild(addRow);
        }

        // Weld a brand-new pivot at an offset (X/Y mm). It moves rigidly with the body.
        const offRow = el('div', 'joint-coords');
        const xf = field('offset X mm');
        const yf = field('offset Y mm');
        xf.input.value = '0';
        yf.input.value = '0';
        offRow.append(xf.wrap, yf.wrap);
        li.appendChild(offRow);
        li.appendChild(button('+ Weld offset pivot', () => {
          this.actions.addBodyPivot(b, Number(xf.input.value) || 0, Number(yf.input.value) || 0);
        }));
        listWrap.appendChild(li);
      }
      body.appendChild(listWrap);
    } else {
      body.appendChild(hint('With the Link tool, multi-select connected links and right-click → Convert to rigid body.'));
    }
  }

  _renderMotorControls() {
    const body = this._motorBody;
    body.innerHTML = '';
    const joints = this.actions.getJoints();
    const drivers = this.actions.getDrivers();

    if (drivers.length) {
      for (const d of drivers) {
        const li = el('div', 'joint-item');
        const head = el('div', 'joint-head');
        head.append(
          el('span', 'joint-name').also((n) => (n.textContent = `${d.pivot.name.split(' ')[0]} → ${d.crank.name.split(' ')[0]}`)),
          button('✕', () => this.actions.removeMotor(d), 'ghost danger')
        );
        li.appendChild(head);

        const speedRow = el('div', 'row');
        speedRow.appendChild(label('Speed'));
        const speed = input('range', { min: -360, max: 360, step: 5, value: d.speedDegPerSec });
        const readout = el('span', 'readout');
        readout.textContent = `${d.speedDegPerSec}°/s`;
        speed.addEventListener('input', () => {
          d.speedDegPerSec = Number(speed.value);
          readout.textContent = `${d.speedDegPerSec}°/s`;
        });
        speedRow.append(speed, readout);
        li.appendChild(speedRow);

        const angleRow = el('div', 'row');
        angleRow.appendChild(label('Angle'));
        d._angleReadout = el('span', 'readout');
        d._angleReadout.textContent = `${d.angleDegrees.toFixed(0)}°`;
        angleRow.appendChild(d._angleReadout);
        li.appendChild(angleRow);

        body.appendChild(li);
      }
    } else {
      body.appendChild(hint('No motors. Select a joint (Select tool), then in its editor choose "Make motor".'));
    }
  }

  // ---- Cross-highlight ----------------------------------------------------

  /** Attach hover listeners that drive the shared highlight state. */
  _attachHover(element, item) {
    element.addEventListener('mouseenter', () => this.actions.setHighlight(item));
    element.addEventListener('mouseleave', () => this.actions.setHighlight(null));
  }

  /**
   * Light up the panel rows matching a highlight set (joints/links/bodies),
   * driven from either a canvas hover or a panel hover.
   * @param {{joints: Set, links: Set, bodies: Set}} sets
   */
  applyHighlight(sets) {
    for (const e of this._jointEls.values()) e.classList.remove('hl');
    for (const e of this._linkEls.values()) e.classList.remove('hl');
    for (const e of this._bodyEls.values()) e.classList.remove('hl');
    if (!sets) return;
    for (const j of sets.joints) this._jointEls.get(j.id)?.classList.add('hl');
    for (const l of sets.links) this._linkEls.get(l)?.classList.add('hl');
    for (const b of sets.bodies) this._bodyEls.get(b)?.classList.add('hl');
  }

  // ---- Per-frame live updates --------------------------------------------

  tick(viewState) {
    // Keep the Play button label in sync.
    if (this._playBtn) {
      this._playBtn.textContent = viewState.running ? '❚❚ Pause' : '▶ Play';
    }
    // Update coordinate inputs that the user isn't actively editing.
    for (const joint of this.actions.getJoints()) {
      const refs = this._coordInputs.get(joint.id);
      if (!refs) continue;
      if (document.activeElement !== refs.x) refs.x.value = round(joint.position.x);
      if (document.activeElement !== refs.y) refs.y.value = round(joint.position.y);
    }
    // Motor angle readouts.
    for (const d of this.actions.getDrivers()) {
      if (d._angleReadout) d._angleReadout.textContent = `${d.angleDegrees.toFixed(0)}°`;
    }
    // Keep the snap checkbox in sync with the toolbar toggle.
    if (this._snapEnable && this.actions.getSnap && document.activeElement !== this._snapEnable) {
      this._snapEnable.checked = this.actions.getSnap().enabled;
    }
  }
}

// ---- tiny DOM helpers -----------------------------------------------------

// Allow fluent "also" tweaks on created elements.
Object.defineProperty(HTMLElement.prototype, 'also', {
  value(fn) { fn(this); return this; },
  configurable: true,
  writable: true
});

function el(tagName, className) {
  const n = document.createElement(tagName);
  if (className) n.className = className;
  return n;
}

function button(text, onClick, extra = '') {
  const b = el('button', extra);
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function label(text) {
  const l = el('label');
  l.textContent = text;
  return l;
}

/** Inline editable name field; commits on change (blur/Enter). */
function nameInput(value, onCommit) {
  const i = el('input', 'name-input');
  i.type = 'text';
  i.value = value;
  i.spellcheck = false;
  i.addEventListener('change', () => onCommit(i.value.trim() || value));
  i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); });
  return i;
}

function input(type, attrs) {
  const i = el('input');
  i.type = type;
  for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
  return i;
}

function field(labelText) {
  const wrap = el('div', 'field');
  const span = el('span');
  span.textContent = labelText;
  const inp = input('number', { step: 0.5 });
  wrap.append(span, inp);
  return { wrap, input: inp };
}

function select(joints, placeholder) {
  const s = el('select');
  if (placeholder) {
    const opt = el('option');
    opt.value = '';
    opt.textContent = placeholder;
    opt.disabled = true;
    s.appendChild(opt);
  }
  for (const j of joints) {
    const opt = el('option');
    opt.value = j.id;
    opt.textContent = j.name;
    s.appendChild(opt);
  }
  if (joints[0]) s.value = joints[0].id;
  return s;
}

function hint(text) {
  const p = el('p', 'hint');
  p.textContent = text;
  return p;
}

function tag(text) {
  const t = el('span', 'tag');
  t.textContent = text;
  return t;
}

function round(n) {
  return String(Math.round(n * 100) / 100);
}
