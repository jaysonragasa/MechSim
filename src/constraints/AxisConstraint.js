import { Constraint } from './Constraint.js';
import { Vector2 } from '../math/Vector2.js';

/**
 * Constrains a joint to slide along an infinite line (a prismatic/slider
 * joint). Defined by a point on the line and a direction vector.
 *
 * This is the piece that turns a four-bar into a slider-crank: the slider
 * block is a joint locked to a horizontal (or any) axis. Adding it required
 * zero changes to the solver or mechanism — just a new Constraint subclass
 * (Open/Closed in action).
 */
export class AxisConstraint extends Constraint {
  /**
   * @param {import('../domain/Joint.js').Joint} joint
   * @param {Vector2} point A point the slide axis passes through (mm).
   * @param {Vector2} direction Direction of travel (need not be unit length).
   */
  constructor(joint, point, direction) {
    super();
    this.joint = joint;
    this.point = point;
    this.direction = direction.normalized();
  }

  apply() {
    const j = this.joint;
    if (j.invMass === 0) return; // pinned elsewhere this frame

    // Project the joint's position onto the line: closest point on the axis.
    const relative = j.position.sub(this.point);
    const t = relative.dot(this.direction);
    j.position = this.point.add(this.direction.scale(t));
  }

  /** Two far-apart points on the axis, for drawing the slider track. */
  trackSegment(halfSpan = 1000) {
    return [
      this.point.sub(this.direction.scale(halfSpan)),
      this.point.add(this.direction.scale(halfSpan))
    ];
  }

  involves(joint) {
    return this.joint === joint;
  }
}
