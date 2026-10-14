import { Vector2 } from '../math/Vector2.js';

let _autoId = 0;

/**
 * A rigid link (bar/arm) connecting two joints at a fixed design length (mm).
 *
 * The Link is a pure data/domain object describing the mechanism topology.
 * The *enforcement* of its length lives in a separate DistanceConstraint
 * (Single Responsibility): the Link knows what it is, the constraint knows
 * how to satisfy it. The mechanism keeps the two in sync.
 */
export class Link {
  /**
   * @param {object} opts
   * @param {string} [opts.id]
   * @param {string} [opts.name]
   * @param {import('./Joint.js').Joint} opts.jointA
   * @param {import('./Joint.js').Joint} opts.jointB
   * @param {number} [opts.length] Design length in mm (defaults to current spacing).
   */
  constructor({ id, name, jointA, jointB, length, color = null } = {}) {
    this.id = id ?? `L${_autoId++}`;
    this.name = name ?? this.id;
    this.jointA = jointA;
    this.jointB = jointB;
    this.length = length ?? jointA.position.distanceTo(jointB.position);
    /** Optional override color (hex). Null = default. */
    this.color = color;
  }

  /** Current (actual) distance between the two joints in mm. */
  get currentLength() {
    return this.jointA.position.distanceTo(this.jointB.position);
  }

  /** Midpoint in world space, handy for labels. @returns {Vector2} */
  get midpoint() {
    return this.jointA.position.lerp(this.jointB.position, 0.5);
  }

  /** True if `joint` is one of this link's endpoints. */
  connects(joint) {
    return this.jointA === joint || this.jointB === joint;
  }
}
