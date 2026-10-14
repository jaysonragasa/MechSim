import { Vector2 } from '../math/Vector2.js';

let _autoId = 0;

/**
 * A kinematic joint: a point in 2D space (millimeters) that links connect to.
 *
 * Mobility is expressed through `invMass` (inverse mass), consumed by the
 * constraint solver:
 *   - `fixed`    : grounded/anchored by the user  -> invMass 0 (immovable)
 *   - `driven`   : positioned by a motor this frame -> invMass 0 (immovable)
 *   - `dragging` : being dragged by the pointer -> a SMALL non-zero invMass
 *   - otherwise  : invMass 1 (freely movable)
 *
 * A dragged joint uses a small non-zero inverse mass rather than 0 on purpose:
 * it still leads the pointer (movable neighbours absorb almost all of each
 * link correction), but when a link's other end is immovable the dragged joint
 * takes the full correction and is clamped to the link's length — so links
 * swing on their arc instead of stretching past their length.
 *
 * This keeps the solver agnostic to *why* a joint is held (Dependency
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

  /** Inverse mass for the solver: 0 immovable, small while dragging, else 1. */
  get invMass() {
    if (this.fixed || this.driven) return 0;
    if (this.dragging) return Joint.DRAG_INV_MASS;
    return 1;
  }

  /** True if the joint is fully immovable this frame (grounded or driven). */
  get isPinned() {
    return this.fixed || this.driven;
  }
}

/**
 * Inverse mass of a joint while it's being dragged. Small enough that the
 * joint leads the pointer against movable neighbours, large enough that a link
 * to an immovable neighbour clamps it to length instead of stretching.
 */
Joint.DRAG_INV_MASS = 0.02;
