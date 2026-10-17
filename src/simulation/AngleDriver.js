import { Driver } from './Driver.js';
import { Vector2 } from '../math/Vector2.js';

const DEG = Math.PI / 180;

/** Normalize radians to [0, 2π). */
function norm2pi(a) {
  const t = a % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
}

/**
 * A rotary motor. Spins a `crank` joint on a circle around a `pivot` joint.
 *
 * Configurable like a real servo:
 *   - speed       : angular velocity in degrees/second.
 *   - inverted    : reverse the direction of travel.
 *   - zeroDegrees : where the servo's 0° points, as a world angle. Use the
 *                   clock mapping 3 o'clock = 0, 12 = 90, 9 = 180, 6 = 270.
 *                   Reported/limited angles are measured from here.
 *   - limitDegrees: travel range from 0°. 360 (default) = free continuous
 *                   rotation; anything less makes it sweep back and forth
 *                   (ping-pong) within [0, limit], like a limited servo.
 *   - reference   : optional parent joint. When set, the angle is measured
 *                   relative to the pivot→reference direction instead of the
 *                   world — a true SERIAL joint whose zero rotates with its
 *                   parent link. When null the motor is absolute/world
 *                   (independent, parallel-style).
 */
export class AngleDriver extends Driver {
  /**
   * @param {object} opts
   * @param {import('../domain/Joint.js').Joint} opts.pivot
   * @param {import('../domain/Joint.js').Joint} opts.crank
   * @param {number} [opts.speed] deg/s
   * @param {boolean} [opts.inverted]
   * @param {number} [opts.zeroDegrees] world angle of the 0° reference
   * @param {number} [opts.limitDegrees] travel range (<=360)
   */
  constructor({ pivot, crank, speed = 60, inverted = false, zeroDegrees = 0, limitDegrees = 360, reference = null }) {
    super();
    this.pivot = pivot;
    this.crank = crank;
    this.speedDegPerSec = speed;
    this.inverted = inverted;
    this.zeroDegrees = zeroDegrees;
    this.limitDegrees = limitDegrees;
    this.reference = reference; // parent joint for serial (relative) measurement
    this._suppressed = false;
    this.sync();
  }

  /** Re-measure radius and set the phase to match the crank's current pose. */
  sync() {
    const offset = this.crank.position.sub(this.pivot.position);
    this.radius = offset.length;
    this.phase = norm2pi(offset.angle - this.zeroWorldRad);
  }

  get zeroRad() { return this.zeroDegrees * DEG; }
  get limitRad() { return this.limitDegrees * DEG; }

  /** World angle of the parent link (pivot→reference), or 0 if absolute. */
  get referenceRad() {
    if (!this.reference) return 0;
    return this.pivot.position.sub(this.reference.position).angle;
  }

  /** World angle of the servo's 0°, including the parent-link base if serial. */
  get zeroWorldRad() {
    return this.referenceRad + this.zeroRad;
  }

  /**
   * Place the crank at a commanded servo angle (degrees from zero) and suppress
   * this frame's own spin, so a script can drive the motor directly. The
   * commanded angle is clamped to the travel limit.
   * @param {number} deg
   */
  commandServo(deg) {
    let d = deg;
    if (this.limitDegrees < 360) d = Math.max(0, Math.min(this.limitDegrees, d));
    const world = this.zeroWorldRad + (this.inverted ? -1 : 1) * d * DEG;
    this.crank.driven = true;
    this.crank.position = this.pivot.position.add(Vector2.fromAngle(world, this.radius));
    this.phase = d * DEG; // keep phase continuous for when the script releases
    this._suppressed = true;
  }

  /**
   * Per-frame hold. Motors no longer free-run on their own `speed` — all
   * motion comes from the script (via `commandServo`/`m.setMotor`). An
   * un-commanded motor simply holds its crank where it is (a servo holding
   * position); the travel limit is still enforced by MotorLimitConstraint.
   * @param {number} _dt seconds (unused)
   */
  update(_dt) {
    if (!this.enabled) return;
    if (this._suppressed) { this._suppressed = false; return; } // driven by script this frame
    this.crank.driven = true; // pin in place — no automatic sweep
  }

  /**
   * The crank's current angle relative to the configured zero, in degrees,
   * computed from live positions (so it's correct even while paused).
   * Honors `inverted` and `zeroDegrees`.
   */
  measuredAngleDegrees() {
    const offset = this.crank.position.sub(this.pivot.position);
    let deg = (offset.angle - this.zeroWorldRad) / DEG;
    if (this.inverted) deg = -deg;
    deg %= 360;
    return deg < 0 ? deg + 360 : deg;
  }

  controlsReference(joint) {
    return this.reference === joint;
  }

  /** Legacy accessor kept for callers; same as the measured angle. */
  get angleDegrees() {
    return this.measuredAngleDegrees();
  }

  controls(joint) {
    return this.crank === joint;
  }
}
