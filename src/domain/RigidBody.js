import { RigidBodyConstraint } from '../constraints/RigidBodyConstraint.js';

let _autoId = 0;

/**
 * A rigid body (ternary / N-ary link): a set of joints frozen into one solid
 * piece so they cannot move relative to each other. This is what a simple
 * 2-point bar can't express — a part that carries three or more pivots at
 * fixed offsets (e.g. a tibia with a knee pivot, an offset link-attach pivot,
 * and a foot).
 *
 * Rigidity is enforced by emitting a single shape-matching
 * RigidBodyConstraint over all member joints. Shape matching keeps the part
 * stiff and solid (it won't stretch when one pivot is dragged against the rest
 * of the linkage), and handles any number of pivots including the collinear
 * case. Because it emits an ordinary Constraint, the solver needs no knowledge
 * of rigid bodies at all (Open/Closed + Dependency Inversion).
 *
 * The relative geometry is captured implicitly from the joints' current
 * positions at build time, so you place the pivots where you want them (the
 * offsets) and the body locks that shape in.
 */
export class RigidBody {
  /**
   * @param {object} opts
   * @param {string} [opts.id]
   * @param {string} [opts.name]
   * @param {import('./Joint.js').Joint[]} [opts.joints]
   */
  constructor({ id, name, joints = [], color = null } = {}) {
    this.id = id ?? `B${_autoId++}`;
    this.name = name ?? this.id;
    /** Optional override color (hex). Null = default. */
    this.color = color;
    /** @type {import('./Joint.js').Joint[]} */
    this.joints = [...joints];
    /** @type {import('../constraints/Constraint.js').Constraint[]} */
    this.constraints = [];
    this.rebuild();
  }

  get memberCount() {
    return this.joints.length;
  }

  has(joint) {
    return this.joints.includes(joint);
  }

  addJoint(joint) {
    if (!this.joints.includes(joint)) this.joints.push(joint);
    this.rebuild();
  }

  removeJoint(joint) {
    this.joints = this.joints.filter((j) => j !== joint);
    this.rebuild();
  }

  /**
   * Regenerate the shape-matching constraint, freezing the members' current
   * positions as the body's rigid rest shape.
   */
  rebuild() {
    this.constraints = this.joints.length >= 2
      ? [new RigidBodyConstraint(this.joints)]
      : [];
  }
}
