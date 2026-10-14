/**
 * Abstract driver (actuator). A driver imposes motion on the mechanism each
 * frame before the solver runs — e.g. a motor spinning a crank, a linear
 * actuator extending, or a scripted path.
 *
 * Open/Closed: new actuation types are added as Driver subclasses without
 * changing the Simulator. Interface Segregation: drivers only need `update`.
 */
export class Driver {
  constructor() {
    this.enabled = true;
  }

  /**
   * Advance the actuator by `dt` seconds and pin the joints it controls
   * (set `joint.driven = true` and position them).
   * @param {number} _dt seconds
   * @abstract
   */
  update(_dt) {
    throw new Error('Driver.update(dt) must be implemented by a subclass');
  }

  /**
   * Whether this driver controls the given joint (for cleanup on delete).
   * @param {import('../domain/Joint.js').Joint} _joint
   * @returns {boolean}
   */
  controls(_joint) {
    return false;
  }
}
