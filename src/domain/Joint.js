import { Vector2 } from '../math/Vector2.js';

let _autoId = 0;

/**
 * A kinematic joint: a point in 2D space (millimeters) that links connect to.
 *
 * Mobility is expressed through `invMass` (inverse mass), consumed by the
 * constraint solver. A joint with invMass 0 is immovable during a solve:
 *   - `fixed`    : permanently grounded/anchored by the user
 *   - `driven`   : positioned by a motor/driver this frame
 *   - `dragging` : being dragged by the pointer this frame
 *
 * This keeps the solver agnostic to *why* a joint is pinned (Dependency
 * Inversion: the solver depends only on the `invMass` abstraction).
 */
export class Joint {
  /**
   * @param {object} opts
   * @param {string} [opts.id]
   * @param {string} [opts.name]
   * @param {Vector2} [opts.position]
   * @param {boolean} [opts.fixed]
   */
  constructor({ id, name, position, fixed = false, color = null } = {}) {
    this.id = id ?? `J${_autoId++}`;
    this.name = name ?? this.id;
    /** @type {Vector2} */
    this.position = position ?? Vector2.ZERO;
    this.fixed = fixed;
    /** Optional override color (hex). Null = default by role. */
    this.color = color;

    // Transient per-frame pins (not persisted / not user state).
    this.driven = false;
    this.dragging = false;
  }

  /** Inverse mass for the solver: 0 means immovable this frame. */
  get invMass() {
    return (this.fixed || this.driven || this.dragging) ? 0 : 1;
  }

  /** True if the joint is held in place for any reason this frame. */
  get isPinned() {
    return this.invMass === 0;
  }
}
