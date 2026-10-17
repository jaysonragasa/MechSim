import { Constraint } from './Constraint.js';
import { Vector2 } from '../math/Vector2.js';

/**
 * Constrains a joint to slide along a line — a prismatic / slider joint, or a
 * "rail". Defined by a point, a direction, and an optional travel length:
 *   - length = Infinity (default): an unbounded line (classic slider, e.g. the
 *     block in the slider-crank preset).
 *   - length finite: a rail segment from `point` to `point + dir*length`; the
 *     joint is clamped to [0, length] so it can't slide past the ends.
 *
 * It needed zero changes to the solver or mechanism — just a Constraint
 * subclass (Open/Closed in action).
 */
export class AxisConstraint extends Constraint {
  /**
   * @param {import('../domain/Joint.js').Joint} joint
   * @param {Vector2} point Start of the rail / a point on the line (mm).
   * @param {Vector2} direction Direction of travel (need not be unit length).
   * @param {object} [opts]
   * @param {number} [opts.length] Segment length in mm; omit for an infinite line.
   */
  constructor(joint, point, direction, { length = Infinity } = {}) {
    super();
    this.joint = joint;
    this.point = point;
    this.direction = direction.normalized();
    this.length = length;
    this.priority = 20; // authoritative: a rail runs last so the joint stays on it
  }

  get finite() {
    return Number.isFinite(this.length);
  }

  apply() {
    const j = this.joint;
    if (j.invMass === 0) return; // grounded / driven this frame

    // Project the joint onto the line, then clamp to the segment if finite.
    let t = j.position.sub(this.point).dot(this.direction);
    if (this.finite) t = Math.max(0, Math.min(this.length, t));
    j.position = this.point.add(this.direction.scale(t));
  }

  /** The drawable extent of the rail: the segment if finite, else a long line. */
  trackSegment(halfSpan = 1000) {
    if (this.finite) {
      return [this.point, this.point.add(this.direction.scale(this.length))];
    }
    return [
      this.point.sub(this.direction.scale(halfSpan)),
      this.point.add(this.direction.scale(halfSpan))
    ];
  }

  involves(joint) {
    return this.joint === joint;
  }
}
