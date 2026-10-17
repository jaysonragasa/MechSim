import { IRenderer } from './IRenderer.js';
import { Vector2 } from '../math/Vector2.js';
import { AxisConstraint } from '../constraints/AxisConstraint.js';
import { convexHull, polygonArea, farthestPair } from '../math/geometry2d.js';

const COLORS = {
  bg: '#0f1319',
  gridMinor: '#1b2230',
  gridMajor: '#283347',
  axis: '#3a4a63',
  axisLabel: '#8b98a9',
  link: '#4ea1ff',
  linkLabel: '#cfe4ff',
  track: '#5a6a86',
  trail: '#ffce88',
  railDraft: '#4ea1ff',
  bodyFill: 'rgba(255, 180, 84, 0.14)',
  bodyFillHot: 'rgba(255, 180, 84, 0.3)',
  bodyStroke: 'rgba(255, 180, 84, 0.85)',
  highlight: '#ffd27a',
  select: '#4ec9a1',
  jointFree: '#4ea1ff',
  jointGround: '#8b98a9',
  jointHover: '#ffb454',
  jointSelected: '#4ec9a1',
  motorArc: '#ffb45488',
  motorArcMark: '#ffce88',
  text: '#e6edf3'
};

/**
 * Draws the mechanism onto a 2D canvas. Pure presentation: it reads the
 * mechanism and view state and never mutates domain objects (Single
 * Responsibility). All geometry comes in as millimeters and is converted to
 * pixels through the injected Camera.
 */
export class CanvasRenderer extends IRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./Camera.js').Camera} camera
   */
  constructor(canvas, camera) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.dpr = window.devicePixelRatio || 1;
    this.widthPx = canvas.clientWidth;
    this.heightPx = canvas.clientHeight;
  }

  resize(widthPx, heightPx) {
    this.widthPx = widthPx;
    this.heightPx = heightPx;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(widthPx * this.dpr);
    this.canvas.height = Math.round(heightPx * this.dpr);
    this.canvas.style.width = `${widthPx}px`;
    this.canvas.style.height = `${heightPx}px`;
  }

  render(mechanism, viewState = {}) {
    const ctx = this.ctx;
    const empty = { joints: new Set(), links: new Set(), bodies: new Set() };
    const {
      drivers = [],
      highlight = empty,
      selection = empty,
      linkStart = null,
      labels = false,
      trail = null,
      railDraft = null
    } = viewState;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.widthPx, this.heightPx);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.widthPx, this.heightPx);

    this._drawGrid();
    this._drawSliderTracks(mechanism);
    if (trail) this._drawTrails(trail, mechanism);
    if (railDraft) this._drawRailDraft(railDraft);
    this._drawMotorArcs(drivers);
    this._drawRigidBodies(mechanism, highlight.bodies, selection.bodies);
    this._drawLinks(mechanism, highlight.links, selection.links, labels);
    this._drawJoints(mechanism, highlight.joints, selection.joints, linkStart);
    if (labels) this._drawNameLabels(mechanism, highlight.joints, selection.joints);

    ctx.restore();
  }

  // ---- Background ---------------------------------------------------------

  /** Adaptive grid: picks a "nice" mm spacing based on current zoom. */
  _drawGrid() {
    const ctx = this.ctx;
    const cam = this.camera;

    // Choose a grid step (mm) that renders at a comfortable pixel pitch.
    const targetPx = 32;
    const roughMm = targetPx / cam.pxPerMm;
    const step = niceStep(roughMm);
    const major = step * 5;

    const topLeft = cam.screenToWorld(new Vector2(0, 0));
    const bottomRight = cam.screenToWorld(new Vector2(this.widthPx, this.heightPx));
    const minX = Math.floor(topLeft.x / step) * step;
    const maxX = Math.ceil(bottomRight.x / step) * step;
    const minY = Math.floor(bottomRight.y / step) * step;
    const maxY = Math.ceil(topLeft.y / step) * step;

    ctx.lineWidth = 1;
    for (let x = minX; x <= maxX; x += step) {
      const p = cam.worldToScreen(new Vector2(x, 0));
      const isMajor = Math.abs(Math.round(x / major) * major - x) < 1e-6;
      ctx.strokeStyle = isMajor ? COLORS.gridMajor : COLORS.gridMinor;
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, this.heightPx);
      ctx.stroke();
    }
    for (let y = minY; y <= maxY; y += step) {
      const p = cam.worldToScreen(new Vector2(0, y));
      const isMajor = Math.abs(Math.round(y / major) * major - y) < 1e-6;
      ctx.strokeStyle = isMajor ? COLORS.gridMajor : COLORS.gridMinor;
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(this.widthPx, p.y);
      ctx.stroke();
    }

    // World axes through origin.
    const origin = cam.worldToScreen(Vector2.ZERO);
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(this.widthPx, origin.y);
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, this.heightPx);
    ctx.stroke();

    this._drawAxisLabels(origin);

    // Axis scale label.
    ctx.fillStyle = COLORS.axisLabel;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`grid: ${formatMm(step)} / ${formatMm(major)}`, 10, this.heightPx - 10);
  }

  /** "X (mm) →" / "↑ Y (mm)" markers so the axes read unambiguously. */
  _drawAxisLabels(origin) {
    const ctx = this.ctx;
    const pad = 14;
    const yOnScreen = Math.max(pad, Math.min(this.heightPx - pad, origin.y));
    const xOnScreen = Math.max(pad, Math.min(this.widthPx - pad, origin.x));

    ctx.fillStyle = COLORS.axisLabel;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';

    // +X: toward the right edge, along the x-axis.
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('X (mm) →', this.widthPx - 10, yOnScreen - 4);

    // +Y: toward the top edge, along the y-axis (world Y is up).
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('↑ Y (mm)', xOnScreen + 6, 8);
  }

  // ---- Slider tracks ------------------------------------------------------

  _drawSliderTracks(mechanism) {
    const ctx = this.ctx;
    for (const c of mechanism.constraints) {
      if (!(c instanceof AxisConstraint)) continue;
      const [a, b] = c.trackSegment(5000);
      const pa = this.camera.worldToScreen(a);
      const pb = this.camera.worldToScreen(b);
      ctx.strokeStyle = COLORS.track;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Finite rails get end caps + draggable endpoint handles.
      if (c.finite) {
        this._drawRailCaps(pa, pb, COLORS.track);
        for (const p of [pa, pb]) {
          ctx.fillStyle = COLORS.bg;
          ctx.strokeStyle = COLORS.track;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  /** Short perpendicular caps at each end of a rail segment (screen space). */
  _drawRailCaps(pa, pb, color) {
    const ctx = this.ctx;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; // perpendicular
    const ny = dx / len;
    const cap = 7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const p of [pa, pb]) {
      ctx.beginPath();
      ctx.moveTo(p.x - nx * cap, p.y - ny * cap);
      ctx.lineTo(p.x + nx * cap, p.y + ny * cap);
      ctx.stroke();
    }
  }

  /** The rubber-band preview while drawing a rail with the Rail tool. */
  _drawRailDraft(draft) {
    const ctx = this.ctx;
    const pa = this.camera.worldToScreen(draft.start);
    const pb = this.camera.worldToScreen(draft.end);
    ctx.strokeStyle = COLORS.railDraft;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.setLineDash([]);
    this._drawRailCaps(pa, pb, COLORS.railDraft);
    ctx.fillStyle = COLORS.railDraft;
    ctx.beginPath();
    ctx.arc(pa.x, pa.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Motion trails ------------------------------------------------------

  /**
   * Draw the path each moving joint has traced, as a translucent polyline in
   * the joint's own color. Fades the tail so recent motion reads brighter.
   * @param {Map<string, import('../math/Vector2.js').Vector2[]>} trail
   */
  _drawTrails(trail, mechanism) {
    const ctx = this.ctx;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const joint of mechanism.joints.values()) {
      const pts = trail.get(joint.id);
      if (!pts || pts.length < 2) continue;
      const base = joint.color || COLORS.trail;

      // Main faint path.
      ctx.strokeStyle = hexA(base, 0.35);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = this.camera.worldToScreen(pts[i]);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // Brighter recent tail (last ~60 samples) so the current sweep stands out.
      const tailStart = Math.max(0, pts.length - 60);
      ctx.strokeStyle = hexA(base, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = tailStart; i < pts.length; i++) {
        const p = this.camera.worldToScreen(pts[i]);
        if (i === tailStart) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  // ---- Motor arcs ---------------------------------------------------------

  _drawMotorArcs(drivers) {
    const ctx = this.ctx;
    for (const d of drivers) {
      if (d.radius == null || !d.pivot || d.radius <= 0) continue;
      const center = this.camera.worldToScreen(d.pivot.position);
      const rpx = this.camera.mmToPx(d.radius);
      if (rpx < 2) continue;

      // Unlimited motor: full dashed circle (its whole travel).
      if (d.limitDegrees >= 360) {
        ctx.strokeStyle = COLORS.motorArc;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, rpx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }

      // Limited motor: draw only the reachable arc, from the zero reference
      // through the travel limit (honoring invert). Sampled in world space so
      // the Y-flip is handled by worldToScreen.
      const dir = d.inverted ? -1 : 1;
      const zero = d.zeroWorldRad; // includes the parent-link base for serial motors
      const steps = Math.max(10, Math.ceil(d.limitDegrees / 4));
      ctx.strokeStyle = COLORS.motorArc;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const wa = zero + dir * (i / steps) * d.limitRad;
        const p = this.camera.worldToScreen(d.pivot.position.add(Vector2.fromAngle(wa, d.radius)));
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Boundary markers: where 0° starts and where the limit ends.
      this._drawMotorBoundary(d, zero, '0°', true);
      this._drawMotorBoundary(d, zero + dir * d.limitRad, `${d.limitDegrees}°`, false);
    }
  }

  /** Radial tick + label at a motor travel boundary (zero or limit). */
  _drawMotorBoundary(d, worldAngle, label, isStart) {
    const ctx = this.ctx;
    const at = (f) => this.camera.worldToScreen(d.pivot.position.add(Vector2.fromAngle(worldAngle, d.radius * f)));
    const inner = at(0.86);
    const outer = at(1.14);
    const lab = at(1.26);

    ctx.strokeStyle = COLORS.motorArcMark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y);
    ctx.lineTo(outer.x, outer.y);
    ctx.stroke();

    if (isStart) {
      const dot = at(1);
      ctx.fillStyle = COLORS.motorArcMark;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(15, 19, 25, 0.8)';
    ctx.strokeText(label, lab.x, lab.y);
    ctx.fillStyle = COLORS.motorArcMark;
    ctx.fillText(label, lab.x, lab.y);
  }

  // ---- Rigid bodies -------------------------------------------------------

  /**
   * Draw each rigid body as a solid piece: a filled convex hull when the
   * pivots span an area (a plate), or a thick capsule when they are collinear
   * (a bar). The pairwise "struts" are stroked to read as one rigid part,
   * clearly distinct from the thin pin-jointed links.
   */
  _drawRigidBodies(mechanism, highlighted = new Set(), selected = new Set()) {
    const ctx = this.ctx;
    for (const body of mechanism.rigidBodies) {
      if (body.memberCount < 2) continue;
      const hot = highlighted.has(body);
      const sel = selected.has(body);
      const base = body.color || COLORS.bodyStroke;
      const fill = body.color ? hexA(body.color, hot ? 0.3 : 0.16) : (hot ? COLORS.bodyFillHot : COLORS.bodyFill);
      const pts = body.joints.map((j) => this.camera.worldToScreen(j.position));

      const hull = convexHull(pts);
      const area = polygonArea(hull);

      if (hull.length >= 3 && area > 6) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(hull[0].x, hull[0].y);
        for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
        ctx.closePath();
        ctx.fill();
      } else {
        // Collinear: draw a thick capsule between the two farthest points.
        const [a, b] = farthestPair(pts);
        ctx.strokeStyle = fill;
        ctx.lineWidth = hot ? 18 : 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Struts between every pair of pivots (the rigidity, made visible).
      ctx.strokeStyle = sel ? COLORS.select : (hot ? COLORS.highlight : base);
      ctx.lineWidth = (sel || hot) ? 3.5 : 2.5;
      ctx.lineCap = 'round';
      for (let i = 0; i < pts.length; i++) {
        for (let k = i + 1; k < pts.length; k++) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[k].x, pts[k].y);
          ctx.stroke();
        }
      }
    }
  }

  // ---- Links --------------------------------------------------------------

  _drawLinks(mechanism, highlighted = new Set(), selected = new Set(), showNames = false) {
    const ctx = this.ctx;
    for (const link of mechanism.links) {
      const hot = highlighted.has(link);
      const sel = selected.has(link);
      const pa = this.camera.worldToScreen(link.jointA.position);
      const pb = this.camera.worldToScreen(link.jointB.position);

      ctx.strokeStyle = sel ? COLORS.select : (hot ? COLORS.highlight : (link.color || COLORS.link));
      ctx.lineWidth = (sel || hot) ? 7 : 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();

      // Length label at the midpoint (prefixed with the name when highlighted
      // or when canvas labels are enabled).
      const mid = this.camera.worldToScreen(link.midpoint);
      const label = (hot || showNames) ? `${link.name}  ${formatMm(link.length)}` : formatMm(link.length);
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(15,19,25,0.78)';
      ctx.fillRect(mid.x - w / 2, mid.y - 9, w, 16);
      ctx.fillStyle = COLORS.linkLabel;
      ctx.fillText(label, mid.x, mid.y);
    }
  }

  // ---- Joints -------------------------------------------------------------

  _drawJoints(mechanism, highlighted = new Set(), selected = new Set(), linkStart = null) {
    const ctx = this.ctx;
    for (const joint of mechanism.joints.values()) {
      const p = this.camera.worldToScreen(joint.position);
      const hot = highlighted.has(joint);
      const sel = selected.has(joint);
      const r = (hot || sel) ? 8 : 7;

      // Pending link-start gets a bright ring so you can see the anchor.
      if (joint === linkStart) {
        ctx.strokeStyle = COLORS.highlight;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      let color = joint.color || (joint.fixed ? COLORS.jointGround : COLORS.jointFree);
      if (sel) color = COLORS.jointSelected;
      else if (hot) color = COLORS.jointHover;

      if (joint.fixed) {
        // Grounded joint: square with a hatched base beneath it.
        ctx.fillStyle = color;
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        this._drawGroundHatch(p, r);
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.bg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r - 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Name + coordinate label (shown when highlighted or selected).
      if (hot || sel || joint === linkStart) {
        const label = `${joint.name}  ${formatMm(joint.position.x)}, ${formatMm(joint.position.y)}`;
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        const w = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(15,19,25,0.85)';
        ctx.fillRect(p.x + 10, p.y - 24, w, 18);
        ctx.fillStyle = COLORS.text;
        ctx.fillText(label, p.x + 15, p.y - 9);
      }
    }
  }

  /**
   * Subtle persistent joint-name labels (the Info "Names on canvas" toggle).
   * Drawn with a dark outline instead of a filled box so they stay legible
   * over the grid without obscuring the scene. Joints already showing a
   * detailed hover/selection label are skipped to avoid double text.
   */
  _drawNameLabels(mechanism, highlighted = new Set(), selected = new Set()) {
    const ctx = this.ctx;
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    for (const joint of mechanism.joints.values()) {
      if (highlighted.has(joint) || selected.has(joint)) continue;
      const p = this.camera.worldToScreen(joint.position);
      const x = p.x + 9;
      const y = p.y - 9;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(15, 19, 25, 0.75)';
      ctx.strokeText(joint.name, x, y);
      ctx.fillStyle = 'rgba(230, 237, 243, 0.72)';
      ctx.fillText(joint.name, x, y);
    }
  }

  _drawGroundHatch(p, r) {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.jointGround;
    ctx.lineWidth = 1.5;
    const baseY = p.y + r;
    ctx.beginPath();
    ctx.moveTo(p.x - r - 2, baseY);
    ctx.lineTo(p.x + r + 2, baseY);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = -r; i <= r; i += 4) {
      ctx.beginPath();
      ctx.moveTo(p.x + i, baseY);
      ctx.lineTo(p.x + i - 4, baseY + 5);
      ctx.stroke();
    }
  }
}

// ---- helpers --------------------------------------------------------------

/** Snap a rough mm value up to a 1/2/5 x 10^n "nice" number. */
function niceStep(rough) {
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / pow;
  let f = 1;
  if (n > 5) f = 10;
  else if (n > 2) f = 5;
  else if (n > 1) f = 2;
  return f * pow;
}

/** Hex color (#rrggbb) to an rgba() string with the given alpha. */
function hexA(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Format a mm value compactly (drops trailing zeros, uses m for large). */
function formatMm(mm) {
  const abs = Math.abs(mm);
  if (abs >= 1000) return `${(mm / 1000).toFixed(abs % 1000 === 0 ? 0 : 2)} m`;
  const rounded = Math.round(mm * 100) / 100;
  return `${rounded} mm`;
}
