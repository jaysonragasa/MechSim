import { Vector2 } from '../math/Vector2.js';
import { distToSegment, convexHull, polygonArea, pointInPolygon } from '../math/geometry2d.js';
import { AxisConstraint } from '../constraints/AxisConstraint.js';

/**
 * Turns raw pointer/wheel events into tool-aware intent. The active tool
 * (select | joint | link) is read through `getTool()`, and the controller
 * reports intent through callbacks rather than mutating app state directly.
 *
 * Shared across all tools: camera pan (middle / Space-drag) and zoom (wheel),
 * plus hit-testing of joints, links and rigid bodies.
 *
 * Tool behaviours:
 *   select : click to select (Shift adds); drag a joint to move it.
 *   joint  : click empty space to add a joint; drag an existing joint to move.
 *   link   : click joints to chain links; click a link to multi-select it.
 */
export class InteractionController {
  constructor({ canvas, camera, mechanism }, callbacks = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.mechanism = mechanism;
    this.cb = callbacks;

    this.hoveredItem = null;
    this.draggingJoint = null;
    this._draggingRail = null; // { constraint, which: 'start'|'end' }

    this._panning = false;
    this._moved = false;
    this._lastPointerPx = Vector2.ZERO;
    this.pickRadiusPx = 12;
    this.edgePickPx = 7;

    this._bind();
  }

  setMechanism(mechanism) {
    this.mechanism = mechanism;
    this.hoveredItem = null;
    this.draggingJoint = null;
    this._draggingRail = null;
  }

  /** Nearest finite-rail endpoint handle under the pointer, or null. */
  _pickRailEnd(px) {
    for (const c of this.mechanism.constraints) {
      if (!(c instanceof AxisConstraint) || !c.finite) continue;
      const [s, e] = c.trackSegment();
      if (this.camera.worldToScreen(s).distanceTo(px) <= this.pickRadiusPx) return { constraint: c, which: 'start' };
      if (this.camera.worldToScreen(e).distanceTo(px) <= this.pickRadiusPx) return { constraint: c, which: 'end' };
    }
    return null;
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._onDown(e));
    c.addEventListener('pointermove', (e) => this._onMove(e));
    c.addEventListener('pointerleave', () => this._setHover(null));
    window.addEventListener('pointerup', (e) => this._onUp(e));
    c.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => this._onContext(e));
  }

  _pointerPx(e) {
    const rect = this.canvas.getBoundingClientRect();
    return new Vector2(e.clientX - rect.left, e.clientY - rect.top);
  }

  _tool() { return this.cb.getTool?.() ?? 'select'; }

  // ---- Hit testing --------------------------------------------------------

  _pickJoint(px) {
    let best = null;
    let bestDist = this.pickRadiusPx;
    for (const joint of this.mechanism.joints.values()) {
      const d = this.camera.worldToScreen(joint.position).distanceTo(px);
      if (d <= bestDist) { best = joint; bestDist = d; }
    }
    return best;
  }

  _pickItem(px) {
    const joint = this._pickJoint(px);
    if (joint) return { type: 'joint', ref: joint };

    for (const link of this.mechanism.links) {
      const a = this.camera.worldToScreen(link.jointA.position);
      const b = this.camera.worldToScreen(link.jointB.position);
      if (distToSegment(px, a, b) <= this.edgePickPx) return { type: 'link', ref: link };
    }

    for (const body of this.mechanism.rigidBodies) {
      if (body.memberCount < 2) continue;
      const pts = body.joints.map((j) => this.camera.worldToScreen(j.position));
      const hull = convexHull(pts);
      if (hull.length >= 3 && polygonArea(hull) > 6 && pointInPolygon(px, hull)) {
        return { type: 'body', ref: body };
      }
      for (let i = 0; i < pts.length; i++) {
        for (let k = i + 1; k < pts.length; k++) {
          if (distToSegment(px, pts[i], pts[k]) <= this.edgePickPx + 2) return { type: 'body', ref: body };
        }
      }
    }
    return null;
  }

  _setHover(item) {
    const same = (a, b) => (a === b) || (a && b && a.type === b.type && a.ref === b.ref);
    if (same(item, this.hoveredItem)) return;
    this.hoveredItem = item;
    this.cb.onHover?.(item);
  }

  // ---- Pointer handlers ---------------------------------------------------

  _onDown(e) {
    if (e.button === 2) return; // right-click handled in contextmenu
    const px = this._pointerPx(e);
    this._lastPointerPx = px;
    this._moved = false;

    if (e.button === 1) {
      this._panning = true;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    const tool = this._tool();
    const item = this._pickItem(px);
    const joint = item?.type === 'joint' ? item.ref : null;

    if (tool === 'link') {
      this.cb.onLinkClick?.(item);
      return;
    }

    if (tool === 'rail') {
      const world = this.camera.screenToWorld(px);
      const snapped = this.cb.snap ? this.cb.snap(world) : world;
      this.cb.onRailClick?.(joint, snapped);
      return;
    }

    // select & joint tools
    if (joint) {
      this.cb.onSelect?.({ type: 'joint', ref: joint }, { additive: e.shiftKey });
      this.draggingJoint = joint;
      this.cb.onDragStart?.(joint);
      this.canvas.setPointerCapture?.(e.pointerId);
      return;
    }

    if (tool === 'joint') {
      const world = this.camera.screenToWorld(px);
      this.cb.onAddJoint?.(world);
      return;
    }

    // Select tool: grab a rail endpoint handle to reshape the rail.
    if (tool === 'select') {
      const railEnd = this._pickRailEnd(px);
      if (railEnd) {
        this._draggingRail = railEnd;
        this.canvas.setPointerCapture?.(e.pointerId);
        return;
      }
    }

    // select tool on a link/body, or empty
    this.cb.onSelect?.(item, { additive: e.shiftKey });
  }

  _onMove(e) {
    const px = this._pointerPx(e);
    const worldMm = this.camera.screenToWorld(px);
    this.cb.onPointerMove?.(worldMm);
    if (px.distanceTo(this._lastPointerPx) > 2) this._moved = true;

    if (this._panning) {
      this.camera.panBy(px.sub(this._lastPointerPx));
      this._lastPointerPx = px;
      this.cb.onChange?.();
      return;
    }

    if (this._draggingRail) {
      const w = this.cb.snap ? this.cb.snap(worldMm) : worldMm;
      this.cb.setRailEnd?.(this._draggingRail.constraint, this._draggingRail.which, w);
      this._lastPointerPx = px;
      this.cb.onChange?.();
      return;
    }

    if (this.draggingJoint) {
      const w = this.cb.snap ? this.cb.snap(worldMm) : worldMm;
      this.cb.onDragMove?.(w); // soft pull; the solver keeps links rigid
      this._lastPointerPx = px;
      this.cb.onChange?.();
      return;
    }

    const hit = this._pickItem(px);
    this._setHover(hit);
    const tool = this._tool();
    const railEnd = tool === 'select' ? this._pickRailEnd(px) : null;
    this.canvas.style.cursor =
      railEnd ? 'grab'
      : tool === 'rail' ? 'crosshair'
      : tool === 'joint' && !hit ? 'copy'
      : tool === 'link' ? (hit ? 'pointer' : 'crosshair')
      : hit?.type === 'joint' ? 'grab'
      : hit ? 'pointer'
      : 'crosshair';
  }

  _onUp() {
    if (this.draggingJoint) {
      this.draggingJoint = null;
      this.cb.onDragEnd?.(this._moved); // always clean up; commit only if moved
    }
    if (this._draggingRail) {
      this._draggingRail = null;
      if (this._moved) this.cb.onRailEndCommit?.();
    }
    this._panning = false;
    this.canvas.style.cursor = 'crosshair';
    this.cb.onChange?.();
  }

  _onContext(e) {
    e.preventDefault();
    const px = this._pointerPx(e);
    const item = this._pickItem(px);
    this.cb.onContext?.(item, e.clientX, e.clientY);
  }

  _onWheel(e) {
    e.preventDefault();
    const px = this._pointerPx(e);
    this.camera.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, px);
    this.cb.onChange?.();
  }
}
