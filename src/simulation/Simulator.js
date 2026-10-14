/**
 * Orchestrates one simulation step: apply drivers, then solve constraints.
 *
 * It owns the list of drivers and the play/pause state, but delegates the
 * actual geometry work to the injected ConstraintSolver (Dependency
 * Inversion — the solver can be swapped without touching this class).
 *
 * The solver runs on every step, even while paused/idle, so the linkage stays
 * assembled when the user drags a joint or edits a coordinate.
 */
export class Simulator {
  /**
   * @param {import('../domain/Mechanism.js').Mechanism} mechanism
   * @param {import('../solver/ConstraintSolver.js').ConstraintSolver} solver
   */
  constructor(mechanism, solver) {
    this.mechanism = mechanism;
    this.solver = solver;
    /** @type {import('./Driver.js').Driver[]} */
    this.drivers = [];
    this.running = false;
  }

  /** @param {import('./Driver.js').Driver} driver */
  addDriver(driver) {
    this.drivers.push(driver);
    return driver;
  }

  /** @param {import('./Driver.js').Driver} driver */
  removeDriver(driver) {
    this.drivers = this.drivers.filter((d) => d !== driver);
  }

  /** Remove every driver controlling `joint` (used when a joint is deleted). */
  removeDriversFor(joint) {
    this.drivers = this.drivers.filter((d) => !d.controls(joint));
  }

  play() { this.running = true; }
  pause() { this.running = false; }
  toggle() { this.running = !this.running; }

  /**
   * Advance the simulation by `dt` seconds.
   *
   * Driver-imposed pins (`joint.driven`) are cleared and reapplied every frame
   * so that removing or pausing a driver immediately frees its joint.
   * @param {number} dt seconds
   */
  step(dt) {
    // Clear transient driver pins from the previous frame.
    for (const joint of this.mechanism.joints.values()) {
      joint.driven = false;
    }

    if (this.running) {
      for (const driver of this.drivers) {
        driver.update(dt);
      }
    }

    this.solver.solve(this.mechanism);
  }
}
