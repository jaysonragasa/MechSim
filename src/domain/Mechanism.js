import { Joint } from './Joint.js';
import { Link } from './Link.js';
import { RigidBody } from './RigidBody.js';
import { DistanceConstraint } from '../constraints/DistanceConstraint.js';

/**
 * The mechanism aggregate: the collection of joints, links and constraints
 * that make up a planar linkage.
 *
 * Responsibilities (Single Responsibility):
 *   - own the topology (what connects to what)
 *   - keep links and their enforcing distance-constraints in sync
 *   - provide safe add/remove that cleans up dependent references
 *
 * It intentionally knows nothing about rendering, input or solving order.
 */
export class Mechanism {
  constructor() {
    /** @type {Map<string, Joint>} */
    this.joints = new Map();
    /** @type {Link[]} */
    this.links = [];
    /** @type {RigidBody[]} */
    this.rigidBodies = [];
    /** @type {import('../constraints/Constraint.js').Constraint[]} */
    this.constraints = [];
    /** Maps a Link to its enforcing DistanceConstraint. @type {Map<Link, DistanceConstraint>} */
    this._linkConstraints = new Map();
  }

  // ---- Joints -------------------------------------------------------------

  /**
   * @param {object} opts See Joint constructor.
   * @returns {Joint}
   */
  addJoint(opts) {
    const joint = opts instanceof Joint ? opts : new Joint(opts);
    this.joints.set(joint.id, joint);
    return joint;
  }

  /** @param {string} id */
  getJoint(id) {
    return this.joints.get(id);
  }

  /** @returns {Joint[]} */
  get jointList() {
    return [...this.joints.values()];
  }

  /**
   * Remove a joint plus any links and constraints that referenced it.
   * @param {Joint} joint
   */
  removeJoint(joint) {
    this.joints.delete(joint.id);

    const doomedLinks = this.links.filter((l) => l.connects(joint));
    for (const link of doomedLinks) this.removeLink(link);

    // Detach the joint from any rigid body it belongs to; drop bodies that
    // fall below two members (no longer a body).
    for (const body of [...this.rigidBodies]) {
      if (!body.has(joint)) continue;
      this._unregisterBody(body);
      body.removeJoint(joint);
      if (body.memberCount >= 2) this._registerBody(body);
      else this.rigidBodies = this.rigidBodies.filter((b) => b !== body);
    }

    // Drop any remaining constraints that reference this joint.
    this.constraints = this.constraints.filter((c) => !c.involves?.(joint));
  }

  // ---- Links --------------------------------------------------------------

  /**
   * Connect two joints with a rigid link and register the distance constraint
   * that keeps them at the link's length.
   * @param {Joint} jointA
   * @param {Joint} jointB
   * @param {object} [opts] { name, length }
   * @returns {Link}
   */
  addLink(jointA, jointB, opts = {}) {
    const link = new Link({ jointA, jointB, ...opts });
    const constraint = new DistanceConstraint(jointA, jointB, link.length);
    this.links.push(link);
    this.constraints.push(constraint);
    this._linkConstraints.set(link, constraint);
    return link;
  }

  /**
   * Change a link's design length and keep its constraint synchronized.
   * @param {Link} link
   * @param {number} length mm
   */
  setLinkLength(link, length) {
    link.length = length;
    const c = this._linkConstraints.get(link);
    if (c) c.restLength = length;
  }

  /** @param {Link} link */
  removeLink(link) {
    this.links = this.links.filter((l) => l !== link);
    const c = this._linkConstraints.get(link);
    if (c) {
      this.constraints = this.constraints.filter((x) => x !== c);
      this._linkConstraints.delete(link);
    }
  }

  // ---- Rigid bodies (ternary / offset links) ------------------------------

  /**
   * Freeze a set of joints into one rigid body. The body's shape is captured
   * from the joints' current positions.
   * @param {Joint[]} joints
   * @param {object} [opts] { name }
   * @returns {RigidBody}
   */
  addRigidBody(joints, opts = {}) {
    const body = new RigidBody({ joints, ...opts });
    this.rigidBodies.push(body);
    this._registerBody(body);
    return body;
  }

  /**
   * Weld a new pivot onto an existing rigid body at a world position. The
   * offset from the body's other pivots is locked in, so when the body
   * rotates this pivot sweeps an arc with it.
   * @param {RigidBody} body
   * @param {import('../math/Vector2.js').Vector2} position
   * @param {object} [opts] { name }
   * @returns {Joint}
   */
  addPivotToBody(body, position, opts = {}) {
    const joint = this.addJoint({ position, ...opts });
    return this.addJointToBody(body, joint);
  }

  /**
   * Fold an existing joint into a rigid body, locking its current offset.
   * @param {RigidBody} body
   * @param {Joint} joint
   * @returns {Joint}
   */
  addJointToBody(body, joint) {
    this._unregisterBody(body);
    body.addJoint(joint); // rebuilds the body's pairwise constraints
    this._registerBody(body);
    return joint;
  }

  /** @param {RigidBody} body */
  removeRigidBody(body) {
    this._unregisterBody(body);
    this.rigidBodies = this.rigidBodies.filter((b) => b !== body);
  }

  _registerBody(body) {
    for (const c of body.constraints) this.constraints.push(c);
  }

  _unregisterBody(body) {
    const owned = new Set(body.constraints);
    this.constraints = this.constraints.filter((c) => !owned.has(c));
  }

  // ---- Arbitrary constraints (sliders, etc.) ------------------------------

  /**
   * Register any Constraint (Open/Closed: the mechanism accepts new constraint
   * types without modification).
   * @param {import('../constraints/Constraint.js').Constraint} constraint
   */
  addConstraint(constraint) {
    this.constraints.push(constraint);
    return constraint;
  }

  /** @param {import('../constraints/Constraint.js').Constraint} constraint */
  removeConstraint(constraint) {
    this.constraints = this.constraints.filter((c) => c !== constraint);
  }

  // ---- Lifecycle ----------------------------------------------------------

  clear() {
    this.joints.clear();
    this.links = [];
    this.rigidBodies = [];
    this.constraints = [];
    this._linkConstraints.clear();
  }
}
