/**
 * Abstract constraint. A constraint nudges joint positions toward satisfying
 * some geometric relationship when `apply()` is called by the solver.
 *
 * This is the extension seam of the system (Open/Closed Principle): new kinds
 * of behaviour — distance bars, sliders, angle locks, path followers — are
 * added as new subclasses without touching the solver or the mechanism.
 *
 * Liskov: every subclass must honour the same contract — `apply()` performs a
 * single relaxation pass and must leave pinned joints (invMass 0) untouched.
 */
export class Constraint {
  /**
   * Perform one relaxation pass, mutating joint positions in place.
   * @abstract
   */
  apply() {
    throw new Error('Constraint.apply() must be implemented by a subclass');
  }

  /**
   * Whether this constraint references the given joint. Used for cleanup when
   * a joint is deleted. Subclasses should override.
   * @param {import('../domain/Joint.js').Joint} _joint
   * @returns {boolean}
   */
  involves(_joint) {
    return false;
  }
}
