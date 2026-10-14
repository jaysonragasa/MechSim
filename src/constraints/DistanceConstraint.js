import { Constraint } from './Constraint.js';

/**
 * Keeps two joints exactly `restLength` mm apart — the enforcement behind a
 * rigid link. Implemented as a Position-Based Dynamics (PBD) relaxation:
 * each pass moves the two joints toward/away from each other, distributing the
 * correction by inverse mass so pinned joints (invMass 0) stay put.
 *
 * Running many passes (see ConstraintSolver) makes a whole network of these
 * converge to a consistent configuration — this is what makes dragging one
 * joint drag the rest of the linkage along believably.
 */
export class DistanceConstraint extends Constraint {
  /**
   * @param {import('../domain/Joint.js').Joint} jointA
   * @param {import('../domain/Joint.js').Joint} jointB
   * @param {number} restLength mm
   * @param {number} [stiffness] 0..1 fraction of the correction applied per pass
   */
  constructor(jointA, jointB, restLength, stiffness = 1) {
    super();
    this.a = jointA;
    this.b = jointB;
    this.restLength = restLength;
    this.stiffness = stiffness;
  }

  apply() {
    const { a, b } = this;
    const wA = a.invMass;
    const wB = b.invMass;
    const wSum = wA + wB;
    if (wSum === 0) return; // both pinned

    const delta = b.position.sub(a.position);
    const dist = delta.length;
    if (dist === 0) return; // coincident; no defined direction

    const dir = delta.scale(1 / dist);
    const error = (dist - this.restLength) * this.stiffness;

    // Move each joint along the link axis proportional to its share of mobility.
    a.position = a.position.add(dir.scale((wA / wSum) * error));
    b.position = b.position.sub(dir.scale((wB / wSum) * error));
  }

  involves(joint) {
    return this.a === joint || this.b === joint;
  }
}
