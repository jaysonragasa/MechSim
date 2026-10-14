import { Mechanism } from '../domain/Mechanism.js';
import { MechanismFactory } from '../domain/MechanismFactory.js';
import { MechanismSerializer } from '../domain/MechanismSerializer.js';
import { ConstraintSolver } from '../solver/ConstraintSolver.js';
import { Simulator } from '../simulation/Simulator.js';
import { AngleDriver } from '../simulation/AngleDriver.js';
import { Camera } from '../rendering/Camera.js';
import { CanvasRenderer } from '../rendering/CanvasRenderer.js';
import { InteractionController } from '../interaction/InteractionController.js';
import { ControlPanel } from '../ui/ControlPanel.js';
import { Toolbar } from '../ui/Toolbar.js';
import { MotorLimitConstraint } from '../constraints/MotorLimitConstraint.js';
import { FloatingPanel } from '../ui/FloatingPanel.js';
import { DockPanel } from '../ui/DockPanel.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { InfoOverlay } from '../ui/InfoOverlay.js';
import { Inspector } from '../ui/Inspector.js';
import { Selection } from './Selection.js';
import { History } from './History.js';
import { Vector2 } from '../math/Vector2.js';

const STORAGE_KEY = 'mechsim.scene.v1';

const HINTS = {
  select: 'Select: click to pick · drag joints to move · right-click for options · Shift adds',
  joint: 'Joint: click empty space to add a joint · drag an existing joint to move',
  link: 'Link: click two joints to connect · click links to multi-select · right-click to convert to rigid'
};

/**
 * Composition root. Owns the scene, the tool/selection/history state, and the
 * UI shell, and runs the animation loop. Every mutation funnels through the
 * actions facade so history/autosave stay consistent.
 */
export class App {
  constructor(dom) {
    this.dom = dom;
    this.appEl = dom.appEl;
    this.canvas = dom.canvas;
    this.statusCoords = dom.statusCoords;
    this.statusZoom = dom.statusZoom;
    this.hintEl = dom.hintEl;

    this.mechanism = new Mechanism();
    this.solver = new ConstraintSolver(24);
    this.simulator = new Simulator(this.mechanism, this.solver);

    this.camera = new Camera({ pxPerMm: 3, originPx: new Vector2(0, 0) });
    this.renderer = new CanvasRenderer(this.canvas, this.camera);

    // Editor state.
    this.tool = 'select';
    this.selection = new Selection();
    this.history = new History();
    this._linkStart = null;
    this.panelCollapsed = false;
    this.snap = this._loadSnapPref();
    this._motorConstraints = [];

    this._highlight = null;
    this._highlightSets = emptySets();

    // UI shell.
    this.floating = new FloatingPanel(dom.floatingLayer);
    this.dock = new DockPanel(dom.dockInspector);
    this.context = new ContextMenu();
    this.showCanvasLabels = this._loadLabelsPref();
    this.info = new InfoOverlay(dom.infoOverlay, {
      onToggleLabels: (on) => { this.showCanvasLabels = on; this._saveLabelsPref(); this._dirty = true; }
    });
    this.info.setLabels(this.showCanvasLabels);
    this._floatingTarget = null;
    this._editorXY = null;

    // Inspector placement preference ('beside' floating | 'side' docked).
    this.inspectorMode = this._loadInspectorMode();
    this._updateInspectModeBtn();
    dom.inspectModeBtn?.addEventListener('click', () => this.toggleInspectorMode());

    this.toolbar = new Toolbar({
      onTool: (t) => this.setTool(t),
      onPlayToggle: () => this.togglePlay(),
      onInfoToggle: () => { this.info.toggle(); this.toolbar.setInfo(this.info.visible); this._dirty = true; },
      onSnapToggle: () => this.toggleSnap(),
      onPanelToggle: () => this.togglePanel()
    });
    this.toolbar.setSnap(this.snap.enabled);

    this.interaction = new InteractionController(
      { canvas: this.canvas, camera: this.camera, mechanism: this.mechanism },
      {
        getTool: () => this.tool,
        onPointerMove: (w) => this._updateCoordStatus(w),
        onHover: (item) => this.setHighlight(item),
        onSelect: (item, mods) => this.selectFromCanvas(item, mods),
        onAddJoint: (w) => this.addJointAt(w),
        snap: (w) => this.snapWorld(w),
        onLinkClick: (item) => this.linkClick(item),
        onContext: (item, x, y) => this.openContext(item, x, y),
        onDragEnd: () => this._afterEdit(),
        onChange: () => { this._dirty = true; }
      }
    );

    this.panel = new ControlPanel(dom.panelRoot, this.actions());

    this._dirty = true;
    this._lastTime = performance.now();

    this._installResize();
    this._installKeyboard();
    this._installFileIO();

    this._bootScene();
    this.panel.build();
    this.toolbar.setTool(this.tool);
    this._loop();
  }

  // ---- Boot / persistence -------------------------------------------------

  _bootScene() {
    const saved = this._loadSaved();
    if (saved) {
      this._swapScene(saved.mechanism, saved.drivers, { frame: true });
    } else {
      this.loadPreset('fourBar', { commit: false });
    }
    this.history.init(this._snapshot());
  }

  _loadSaved() {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return null;
      return MechanismSerializer.fromJSON(json);
    } catch {
      return null;
    }
  }

  _snapshot() {
    return MechanismSerializer.toObject(this.mechanism, this.simulator.drivers);
  }

  _autosave() {
    try {
      localStorage.setItem(STORAGE_KEY, MechanismSerializer.toJSON(this.mechanism, this.simulator.drivers));
    } catch { /* ignore quota / privacy errors */ }
  }

  /** Record an undo step + autosave after a committed change. */
  commit() {
    this.history.push(this._snapshot());
    this._autosave();
  }

  // ---- Scene swapping -----------------------------------------------------

  _swapScene(mechanism, drivers, { frame = false } = {}) {
    this.mechanism = mechanism;
    this.simulator.mechanism = mechanism;
    this.simulator.drivers = drivers;
    this.simulator.pause();
    this.toolbar.setPlaying(false);
    this._syncMotorConstraints();
    this.interaction.setMechanism(mechanism);
    this.selection.clear();
    this._linkStart = null;
    this._highlight = null;
    this._highlightSets = emptySets();
    this._hideInspector();
    this.context.hide();
    if (frame) this.resetView();
    this.panel?.refresh();
    this._dirty = true;
  }

  loadPreset(name, { commit = true } = {}) {
    const factory = MechanismFactory[name] ?? MechanismFactory.fourBar;
    const { mechanism, motors = [], motor } = factory();
    const drivers = motors.length ? motors : (motor ? [motor] : []);
    this._swapScene(mechanism, drivers, { frame: true });
    if (commit) this.commit();
  }

  /** Restore a serialized snapshot (undo/redo/import). Keeps the view. */
  restore(snapshot, { frame = false } = {}) {
    const { mechanism, drivers } = MechanismSerializer.fromObject(snapshot);
    this._swapScene(mechanism, drivers, { frame });
  }

  // ---- Tool / panel -------------------------------------------------------

  setTool(tool) {
    this.tool = tool;
    this._linkStart = null;
    this.toolbar.setTool(tool);
    if (this.hintEl) this.hintEl.textContent = HINTS[tool] ?? '';
    this._dirty = true;
  }

  togglePlay() {
    this.simulator.toggle();
    this.toolbar.setPlaying(this.simulator.running);
    this._dirty = true;
  }

  toggleSnap() {
    this.snap.enabled = !this.snap.enabled;
    this.toolbar.setSnap(this.snap.enabled);
    this._saveSnapPref();
    this._dirty = true;
  }

  /** Round a world point to the snap grid when snapping is on. */
  snapWorld(world) {
    if (!this.snap.enabled) return world;
    const s = this.snap.step || 5;
    return new Vector2(Math.round(world.x / s) * s, Math.round(world.y / s) * s);
  }

  _loadSnapPref() {
    try {
      const raw = JSON.parse(localStorage.getItem('mechsim.snap') ?? '');
      return { enabled: !!raw.enabled, step: Number(raw.step) || 5 };
    } catch {
      return { enabled: false, step: 5 };
    }
  }

  _saveSnapPref() {
    try { localStorage.setItem('mechsim.snap', JSON.stringify(this.snap)); } catch { /* ignore */ }
  }

  togglePanel() {
    this.panelCollapsed = !this.panelCollapsed;
    this.appEl.classList.toggle('panel-collapsed', this.panelCollapsed);
    this.toolbar.setCollapsed(this.panelCollapsed);
    // Canvas size changes; re-measure next frame.
    requestAnimationFrame(() => {
      const r = this.canvas.getBoundingClientRect();
      this.renderer.resize(r.width, r.height);
      this._dirty = true;
    });
  }

  // ---- Selection & inspectors --------------------------------------------

  selectFromCanvas(item, mods = {}) {
    if (!item) {
      if (!mods.additive) { this.selection.clear(); this._hideInspector(); }
      this._dirty = true;
      return;
    }
    if (mods.additive) this.selection.toggle(item);
    else this.selection.set(item);

    const single = this.selection.single();
    if (single) this._openInspectorFor(single, this._itemScreenPx(single));
    else this._hideInspector();
    this._dirty = true;
  }

  addJointAt(world) {
    const p = this.snapWorld(world);
    const joint = this.mechanism.addJoint({ position: new Vector2(p.x, p.y) });
    this.selection.set({ type: 'joint', ref: joint });
    this.panel.refresh();
    this.commit();
    this._dirty = true;
    this._openInspectorFor({ type: 'joint', ref: joint }, this._itemScreenPx({ type: 'joint', ref: joint }));
  }

  linkClick(item) {
    if (item?.type === 'joint') {
      const j = item.ref;
      if (this._linkStart && this._linkStart !== j) {
        this._connect(this._linkStart, j);
        this._linkStart = j;
      } else {
        this._linkStart = j;
      }
      this.selection.clear();
    } else if (item?.type === 'link') {
      this._linkStart = null;
      this.selection.toggle(item);
    } else {
      this._linkStart = null;
      this.selection.clear();
    }
    this._hideInspector();
    this._dirty = true;
  }

  _connect(a, b) {
    const exists = this.mechanism.links.some((l) => l.connects(a) && l.connects(b));
    if (!exists) {
      this.mechanism.addLink(a, b);
      this.panel.refresh();
      this.commit();
    }
    this._dirty = true;
  }

  _inspectorHost() {
    return this.inspectorMode === 'side' ? this.dock : this.floating;
  }

  _inspectorVisible() {
    return this.floating.visible || this.dock.visible;
  }

  _hideInspector() {
    this.floating.hide();
    this.dock.hide();
    this._floatingTarget = null;
    this._editorXY = null;
  }

  _openInspectorFor(item, atPx) {
    const host = this._inspectorHost();
    const other = host === this.floating ? this.dock : this.floating;
    other.hide();
    const ctx = this._inspectorCtx();
    const body = Inspector[item.type](item.ref, ctx);
    const title = `${item.type === 'body' ? 'Rigid body' : cap(item.type)} · ${item.ref.name}`;
    host.show(title, body, atPx);
    this._floatingTarget = item;
    this._editorXY = item.type === 'joint' ? ctx._xyInputs : null;
  }

  toggleInspectorMode() {
    this.inspectorMode = this.inspectorMode === 'beside' ? 'side' : 'beside';
    this._saveInspectorMode();
    this._updateInspectModeBtn();
    // Move an already-open inspector to the newly chosen placement.
    const t = this._floatingTarget;
    this._hideInspector();
    if (t && this._exists(t)) this._openInspectorFor(t, this._itemScreenPx(t));
    this._dirty = true;
  }

  _updateInspectModeBtn() {
    if (this.dom.inspectModeBtn) {
      this.dom.inspectModeBtn.textContent = `Inspector: ${this.inspectorMode === 'side' ? 'Side' : 'Beside'}`;
    }
  }

  _loadInspectorMode() {
    try { return localStorage.getItem('mechsim.inspectorMode') === 'side' ? 'side' : 'beside'; }
    catch { return 'beside'; }
  }

  _saveInspectorMode() {
    try { localStorage.setItem('mechsim.inspectorMode', this.inspectorMode); } catch { /* ignore */ }
  }

  _inspectorCtx() {
    const ctx = {
      actions: this.actions(),
      getMotorFor: (joint) => this.simulator.drivers.find((d) => d.pivot === joint) ?? null,
      getNeighbors: (joint) => {
        const seen = new Set();
        const out = [];
        for (const l of this.mechanism.links) {
          if (!l.connects(joint)) continue;
          const other = l.jointA === joint ? l.jointB : l.jointA;
          if (!seen.has(other.id)) { seen.add(other.id); out.push(other); }
        }
        return out;
      }
    };
    return ctx;
  }

  _rebuildInspectorIfOpen() {
    const t = this._floatingTarget;
    if (!t || !this._inspectorVisible()) return;
    if (!this._exists(t)) { this._hideInspector(); return; }
    const atPx = this.floating.visible ? (this.floating.anchor ?? this._itemScreenPx(t)) : this._itemScreenPx(t);
    this._openInspectorFor(t, atPx);
  }

  _exists(item) {
    if (item.type === 'joint') return this.mechanism.joints.has(item.ref.id);
    if (item.type === 'link') return this.mechanism.links.includes(item.ref);
    return this.mechanism.rigidBodies.includes(item.ref);
  }

  _itemScreenPx(item) {
    let world;
    if (item.type === 'joint') world = item.ref.position;
    else if (item.type === 'link') world = item.ref.midpoint;
    else world = item.ref.joints[0].position;
    return this.camera.worldToScreen(world);
  }

  // ---- Context menu -------------------------------------------------------

  openContext(item, clientX, clientY) {
    const items = [];
    const selLinks = [...this.selection.links];

    if (selLinks.length >= 2 || (this.tool === 'link' && selLinks.length >= 1)) {
      items.push({ heading: `${selLinks.length} link(s) selected` });
      if (selLinks.length >= 2) {
        const connected = this._linksConnected(selLinks);
        items.push({
          label: connected ? `Convert to rigid body` : 'Select connected links to convert',
          onClick: connected ? () => this._selectedLinksToRigid() : undefined
        });
      }
      for (const [label, hex] of [['Color blue', '#4ea1ff'], ['Color orange', '#ffb454'], ['Color green', '#4ec9a1']]) {
        items.push({ label, onClick: () => { for (const l of selLinks) l.color = hex; this._afterEdit(); } });
      }
      items.push({ separator: true });
      items.push({ label: 'Delete selected links', danger: true, onClick: () => this.deleteSelection() });
      items.push({ label: 'Clear selection', onClick: () => { this.selection.clear(); this._dirty = true; } });
      this.context.show(clientX, clientY, items);
      return;
    }

    if (!item) return;
    this.selection.set(item);
    this._dirty = true;
    const atPx = this._clientToLayer(clientX, clientY);

    if (item.type === 'joint') {
      const motor = this.simulator.drivers.find((d) => d.pivot === item.ref);
      items.push({ label: 'Edit…', onClick: () => this._openInspectorFor(item, atPx) });
      items.push({ label: motor ? 'Motor settings…' : 'Make motor…', onClick: () => this._openInspectorFor(item, atPx) });
      items.push({ label: item.ref.fixed ? 'Unground' : 'Ground', onClick: () => this.actions().setJointFixed(item.ref, !item.ref.fixed) });
      items.push({ separator: true });
      items.push({ label: 'Delete joint', danger: true, onClick: () => this.deleteSelection() });
    } else if (item.type === 'link') {
      items.push({ label: 'Edit…', onClick: () => this._openInspectorFor(item, atPx) });
      items.push({ label: 'Delete link', danger: true, onClick: () => this.deleteSelection() });
    } else {
      items.push({ label: 'Edit…', onClick: () => this._openInspectorFor(item, atPx) });
      items.push({ label: 'Convert to links', onClick: () => this.actions().bodyToLinks(item.ref) });
      items.push({ label: 'Delete body', danger: true, onClick: () => this.deleteSelection() });
    }
    this.context.show(clientX, clientY, items);
  }

  _clientToLayer(clientX, clientY) {
    const rect = this.dom.floatingLayer.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /** Are the given links one connected chain (shared joints)? */
  _linksConnected(links) {
    if (links.length <= 1) return true;
    const adj = new Map();
    const key = (j) => j.id;
    for (const l of links) {
      adj.set(key(l.jointA), adj.get(key(l.jointA)) ?? new Set());
      adj.set(key(l.jointB), adj.get(key(l.jointB)) ?? new Set());
      adj.get(key(l.jointA)).add(key(l.jointB));
      adj.get(key(l.jointB)).add(key(l.jointA));
    }
    const start = key(links[0].jointA);
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const n = stack.pop();
      for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    }
    // All joints touched by the selected links must be reachable.
    for (const l of links) {
      if (!seen.has(key(l.jointA)) || !seen.has(key(l.jointB))) return false;
    }
    return true;
  }

  _selectedLinksToRigid() {
    const links = [...this.selection.links];
    const joints = [];
    const seen = new Set();
    for (const l of links) {
      for (const j of [l.jointA, l.jointB]) if (!seen.has(j.id)) { seen.add(j.id); joints.push(j); }
    }
    for (const l of links) this.mechanism.removeLink(l);
    if (joints.length >= 2) this.mechanism.addRigidBody(joints);
    this.selection.clear();
    this._afterStructuralChange();
  }

  // ---- Delete / undo / redo ----------------------------------------------

  deleteSelection() {
    if (this.selection.isEmpty) return;
    for (const link of [...this.selection.links]) this.mechanism.removeLink(link);
    for (const body of [...this.selection.bodies]) this.mechanism.removeRigidBody(body);
    for (const joint of [...this.selection.joints]) {
      this.simulator.removeDriversFor(joint);
      this.mechanism.removeJoint(joint);
    }
    this.selection.clear();
    this._linkStart = null;
    this._afterStructuralChange();
  }

  undo() {
    const snap = this.history.undo();
    if (snap) { this.restore(snap); this._autosave(); }
  }

  redo() {
    const snap = this.history.redo();
    if (snap) { this.restore(snap); this._autosave(); }
  }

  // ---- Change bookkeeping -------------------------------------------------

  /** Structural change: refresh panel, re-sync inspector, record history. */
  _afterStructuralChange() {
    this._pruneSelection();
    this._syncMotorConstraints();
    this._highlight = null;
    this._highlightSets = emptySets();
    this.panel.refresh();
    this._rebuildInspectorIfOpen();
    this.commit();
    this._dirty = true;
  }

  /** Light edit (position/color/param): record history, no DOM rebuild. */
  _afterEdit() {
    this.commit();
    this._dirty = true;
  }

  /**
   * Keep exactly one MotorLimitConstraint per motor in the mechanism's
   * constraint list, so angular limits are enforced by the solver on every
   * frame (dragging included), not just while the motor is driving.
   */
  _syncMotorConstraints() {
    for (const c of this._motorConstraints) this.mechanism.removeConstraint(c);
    this._motorConstraints = this.simulator.drivers.map((d) => {
      const c = new MotorLimitConstraint(d);
      this.mechanism.addConstraint(c);
      return c;
    });
  }

  _pruneSelection() {
    for (const j of [...this.selection.joints]) if (!this.mechanism.joints.has(j.id)) this.selection.joints.delete(j);
    for (const l of [...this.selection.links]) if (!this.mechanism.links.includes(l)) this.selection.links.delete(l);
    for (const b of [...this.selection.bodies]) if (!this.mechanism.rigidBodies.includes(b)) this.selection.bodies.delete(b);
  }

  // ---- Actions facade -----------------------------------------------------

  actions() {
    // Read `this.mechanism` lazily inside each closure so the facade always
    // targets the live scene even after a preset load / import swaps it.
    return {
      loadPreset: (name) => this.loadPreset(name),
      resetView: () => this.resetView(),
      togglePlay: () => this.togglePlay(),
      setIterations: (n) => { this.solver.iterations = n; this._dirty = true; },
      getSnap: () => this.snap,
      setSnapEnabled: (on) => { this.snap.enabled = on; this.toolbar.setSnap(on); this._saveSnapPref(); this._dirty = true; },
      setSnapStep: (step) => { this.snap.step = Math.max(0.1, step); this._saveSnapPref(); },

      getJoints: () => this.mechanism.jointList,
      getLinks: () => this.mechanism.links,
      getBodies: () => this.mechanism.rigidBodies,
      getDrivers: () => this.simulator.drivers,

      setHighlight: (item) => this.setHighlight(item),
      renameJoint: (joint, name) => { joint.name = name; this._afterStructuralChange(); },
      renameLink: (link, name) => { link.name = name; this._afterStructuralChange(); },
      renameBody: (body, name) => { body.name = name; this._afterStructuralChange(); },

      setJointColor: (joint, hex) => { joint.color = hex; this._afterStructuralChange(); },
      setLinkColor: (link, hex) => { link.color = hex; this._afterStructuralChange(); },
      setBodyColor: (body, hex) => { body.color = hex; this._afterStructuralChange(); },

      addJoint: ({ x, y, fixed }) => { this.mechanism.addJoint({ position: new Vector2(x, y), fixed }); this._afterStructuralChange(); },
      removeJoint: (joint) => { this.simulator.removeDriversFor(joint); this.mechanism.removeJoint(joint); this._afterStructuralChange(); },
      setJointPosition: (joint, x, y) => { joint.position = new Vector2(x, y); this._afterEdit(); },
      setJointFixed: (joint, fixed) => { joint.fixed = fixed; this._afterStructuralChange(); },

      addLink: (aId, bId) => {
        const a = this.mechanism.getJoint(aId); const b = this.mechanism.getJoint(bId);
        if (a && b && a !== b) this.mechanism.addLink(a, b);
        this._afterStructuralChange();
      },
      removeLink: (link) => { this.mechanism.removeLink(link); this._afterStructuralChange(); },
      setLinkLength: (link, length) => { this.mechanism.setLinkLength(link, Math.max(0.1, length)); this._afterEdit(); },

      createRigidBody: (jointIds) => {
        const joints = [...new Set(jointIds.map((id) => this.mechanism.getJoint(id)).filter(Boolean))];
        if (joints.length >= 2) this.mechanism.addRigidBody(joints);
        this._afterStructuralChange();
      },
      addJointToBody: (body, jointId) => {
        const j = this.mechanism.getJoint(jointId);
        if (j && !body.has(j)) this.mechanism.addJointToBody(body, j);
        this._afterStructuralChange();
      },
      addBodyPivot: (body, x, y) => { this.mechanism.addPivotToBody(body, new Vector2(x, y)); this._afterStructuralChange(); },
      removeRigidBody: (body) => { this.mechanism.removeRigidBody(body); this._afterStructuralChange(); },
      bodyToLinks: (body) => {
        const js = body.joints;
        for (let i = 0; i < js.length - 1; i++) this.mechanism.addLink(js[i], js[i + 1]);
        this.mechanism.removeRigidBody(body);
        this._afterStructuralChange();
      },

      addMotor: (pivotId, crankId, speed) => {
        const pivot = this.mechanism.getJoint(pivotId); const crank = this.mechanism.getJoint(crankId);
        if (pivot && crank && pivot !== crank) {
          this.simulator.addDriver(new AngleDriver({ pivot, crank, speed }));
        }
        this._afterStructuralChange();
      },
      removeMotor: (driver) => { this.simulator.removeDriver(driver); this._afterStructuralChange(); },
      setMotorParams: (motor, partial) => {
        if ('speed' in partial) motor.speedDegPerSec = partial.speed;
        if ('inverted' in partial) motor.inverted = partial.inverted;
        if ('zeroDegrees' in partial) motor.zeroDegrees = partial.zeroDegrees;
        if ('limitDegrees' in partial) motor.limitDegrees = partial.limitDegrees;
        if ('inverted' in partial || 'zeroDegrees' in partial) motor.sync();
        this._afterEdit();
      }
    };
  }

  // ---- Highlight ----------------------------------------------------------

  setHighlight(item) {
    const same = (a, b) => (a === b) || (a && b && a.type === b.type && a.ref === b.ref);
    if (same(item, this._highlight)) return;
    this._highlight = item;
    this._highlightSets = this._deriveHighlight(item);
    this.panel.applyHighlight(this._highlightSets);
    this._dirty = true;
  }

  _deriveHighlight(item) {
    const sets = emptySets();
    if (item) {
      if (item.type === 'joint') {
        sets.joints.add(item.ref);
        for (const l of this.mechanism.links) if (l.connects(item.ref)) sets.links.add(l);
        for (const b of this.mechanism.rigidBodies) if (b.has(item.ref)) sets.bodies.add(b);
      } else if (item.type === 'link') {
        sets.links.add(item.ref);
        sets.joints.add(item.ref.jointA);
        sets.joints.add(item.ref.jointB);
      } else if (item.type === 'body') {
        sets.bodies.add(item.ref);
        for (const j of item.ref.joints) sets.joints.add(j);
      }
    }
    return sets;
  }

  // ---- Loop ---------------------------------------------------------------

  _loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastTime) / 1000);
    this._lastTime = now;

    const needsSolve = this.simulator.running || this._dirty || this.interaction.draggingJoint;
    if (needsSolve) {
      this.simulator.step(dt);
      this._render();
      this.panel.tick({ running: this.simulator.running });
      this.info.update(this.mechanism, this.simulator.drivers);
      this._syncFloatingToJoint();
      this._updateZoomStatus();
      this._dirty = this.simulator.running; // keep rendering while running
    }
    requestAnimationFrame(() => this._loop());
  }

  _render() {
    this.renderer.render(this.mechanism, {
      drivers: this.simulator.drivers,
      highlight: this._highlightSets,
      selection: { joints: this.selection.joints, links: this.selection.links, bodies: this.selection.bodies },
      linkStart: this._linkStart,
      labels: this.showCanvasLabels
    });
  }

  _loadLabelsPref() {
    try { return localStorage.getItem('mechsim.canvasLabels') === '1'; } catch { return false; }
  }

  _saveLabelsPref() {
    try { localStorage.setItem('mechsim.canvasLabels', this.showCanvasLabels ? '1' : '0'); } catch { /* ignore */ }
  }

  /** Keep the joint editor glued to its joint (floating only) and X/Y live. */
  _syncFloatingToJoint() {
    const t = this._floatingTarget;
    if (!t || t.type !== 'joint' || !this._inspectorVisible()) return;
    if (this.floating.visible) this.floating.reposition(this.camera.worldToScreen(t.ref.position));
    if (this._editorXY) {
      const { x, y } = this._editorXY;
      if (document.activeElement !== x) x.value = String(Math.round(t.ref.position.x * 100) / 100);
      if (document.activeElement !== y) y.value = String(Math.round(t.ref.position.y * 100) / 100);
    }
  }

  // ---- Status -------------------------------------------------------------

  _updateCoordStatus(w) {
    this.statusCoords.textContent = `x: ${w.x.toFixed(1)} mm \u00a0 y: ${w.y.toFixed(1)} mm`;
  }

  _updateZoomStatus() {
    this.statusZoom.textContent = `zoom: ${Math.round((this.camera.pxPerMm / 3) * 100)}%`;
  }

  // ---- View ---------------------------------------------------------------

  resetView() {
    const joints = this.mechanism.jointList;
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    if (joints.length === 0) {
      this.camera.pxPerMm = 3;
      this.camera.originPx = new Vector2(w / 2, h / 2);
      this._dirty = true;
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const j of joints) {
      minX = Math.min(minX, j.position.x); minY = Math.min(minY, j.position.y);
      maxX = Math.max(maxX, j.position.x); maxY = Math.max(maxY, j.position.y);
    }
    const spanX = Math.max(40, maxX - minX);
    const spanY = Math.max(40, maxY - minY);
    this.camera.pxPerMm = Math.min(60, Math.max(0.2, Math.min(w / (spanX * 1.6), h / (spanY * 1.6))));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.camera.originPx = new Vector2(w / 2 - cx * this.camera.pxPerMm, h / 2 + cy * this.camera.pxPerMm);
    this._dirty = true;
  }

  // ---- Keyboard -----------------------------------------------------------

  _installKeyboard() {
    window.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
      if (typing) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo(); else this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
      if (e.ctrlKey || e.metaKey) return;

      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelection(); return; }
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.togglePlay(); return; }
      if (e.key === 'v' || e.key === 'V') this.setTool('select');
      else if (e.key === 'j' || e.key === 'J') this.setTool('joint');
      else if (e.key === 'l' || e.key === 'L') this.setTool('link');
      else if (e.key === 'g' || e.key === 'G') this.toggleSnap();
      else if (e.key === 'Escape') { this.selection.clear(); this._linkStart = null; this._hideInspector(); this.context.hide(); this._dirty = true; }
    });
  }

  // ---- File import / export ----------------------------------------------

  _installFileIO() {
    this.dom.exportBtn?.addEventListener('click', () => this._export());
    this.dom.importBtn?.addEventListener('click', () => this.dom.fileInput?.click());
    this.dom.fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const { mechanism, drivers } = MechanismSerializer.fromJSON(String(reader.result));
          this._swapScene(mechanism, drivers, { frame: true });
          this.commit();
        } catch (err) {
          alert(`Could not import: ${err.message}`);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  _export() {
    const json = MechanismSerializer.toJSON(this.mechanism, this.simulator.drivers);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.mechsim';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- Resize -------------------------------------------------------------

  _installResize() {
    let framedOnce = false;
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.renderer.resize(rect.width, rect.height);
      if (!framedOnce && rect.width > 0 && rect.height > 0) { framedOnce = true; this.resetView(); }
      this._dirty = true;
    };
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);
  }
}

function emptySets() {
  return { joints: new Set(), links: new Set(), bodies: new Set() };
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
