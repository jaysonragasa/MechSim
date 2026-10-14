import { Constraint } from './Constraint.js';
import { Vector2 } from '../math/Vector2.js';

/**
 * Shape-matching rigidity for a group of joints — the correct way to model a
 * rigid part in a position-based solver.
 *
 * Instead of N*(N-1)/2 soft pairwise distance constraints (which stretch when
 * one pivot is dragged against the rest of a stiff linkage), this treats the
 * body as one unit. Each pass it:
 *   1. captures the body's frozen "rest" shape (offsets from the rest centroid),
 *   2. finds the best-fit rigid transform (rotation + translation) of that rest
 *      shape onto the pivots' current positions,
 *   3. moves each FREE pivot straight onto its rigid target.
 *
 * The optimal 2D rotation has a closed form (no iteration): with q = rest
 * offset and p = current offset from the respective centroids,
 *   theta = atan2( Σ (q × p), Σ (q · p) ).
 * This is stiff and stable, so a dragged part stays solid instead of tearing.
 *
 * Pinned pivots (invMass 0 — grounded, driven or dragged) are left in place
 * but still inform the centroid and rotation, so the body follows them.
 */
export class RigidBodyConstraint extends Constraint {
  /**
   * @param {import('../domain/Joint.js').Joint[]} joints
   * @param {number} [stiffness] 0..1 fraction of the correction applied per pass.
   */
  constructor(joints, stiffness = 1) {
    super();
    this.joints = joints;
    this.stiffness = stiffness;
    this.capture();
  }

  /** Freeze the current configuration as the body's rigid rest shape. */
  capture() {
    const c = this._centroid();
    this.rest = this.joints.map((j) => j.position.sub(c));
  }

  _centroid() {
    let cx = 0;
    let cy = 0;
    for (const j of this.joints) { cx += j.position.x; cy += j.position.y; }
    const n = this.joints.length || 1;
    return new Vector2(cx / n, cy / n);
  }

  apply() {
    const n = this.joints.length;
    if (n < 2) return;

    // Current centroid.
    let cx = 0;
    let cy = 0;
    for (const j of this.joints) { cx += j.position.x; cy += j.position.y; }
    cx /= n;
    cy /= n;

    // Best-fit rotation of the rest shape onto the current shape.
    let num = 0; // Σ q × p
    let den = 0; // Σ q · p
    for (let i = 0; i < n; i++) {
      const q = this.rest[i];
      const px = this.joints[i].position.x - cx;
      const py = this.joints[i].position.y - cy;
      num += q.x * py - q.y * px;
      den += q.x * px + q.y * py;
    }
    const theta = Math.atan2(num, den);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    // Pull every free pivot onto its rigid target.
    for (let i = 0; i < n; i++) {
      const j = this.joints[i];
      if (j.invMass === 0) continue; // grounded / driven / dragged
      const q = this.rest[i];
      const tx = cx + (q.x * cos - q.y * sin);
      const ty = cy + (q.x * sin + q.y * cos);
      j.position = new Vector2(
        j.position.x + (tx - j.position.x) * this.stiffness,
        j.position.y + (ty - j.position.y) * this.stiffness
      );
    }
  }

  involves(joint) {
    return this.joints.includes(joint);
  }
}
