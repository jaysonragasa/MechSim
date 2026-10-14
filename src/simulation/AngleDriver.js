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
  constructor({ pivot, crank, speed = 60, inverted = false, zeroDegrees = 0, limitDegrees = 360 }) {
    super();
    this.pivot = pivot;
    this.crank = crank;
    this.speedDegPerSec = speed;
    this.inverted = inverted;
    this.zeroDegrees = zeroDegrees;
    this.limitDegrees = limitDegrees;
    this.sync();
  }

  /** Re-measure radius and set the phase to match the crank's current pose. */
  sync() {
    const offset = this.crank.position.sub(this.pivot.position);
    this.radius = offset.length;
    // phase = servo angle (relative to zero) implied by the current pose.
    this.phase = norm2pi(offset.angle - this.zeroDegrees * DEG);
  }

  get zeroRad() { return this.zeroDegrees * DEG; }
  get limitRad() { return this.limitDegrees * DEG; }

  /** @param {number} dt seconds */
  update(dt) {
    if (!this.enabled) return;
    const dir = this.inverted ? -1 : 1;
    this.phase += dir * this.speedDegPerSec * DEG * dt;

    const servo = this._servoAngle(this.phase);
    const world = this.zeroRad + servo;
    this.crank.driven = true;
    this.crank.position = this.pivot.position.add(Vector2.fromAngle(world, this.radius));
  }

  /** Map an accumulated phase to a servo angle within the travel limit. */
  _servoAngle(phase) {
    if (this.limitDegrees >= 360) return phase; // continuous
    const limit = this.limitRad;
    const period = 2 * limit;
    let t = ((phase % period) + period) % period;
    return t <= limit ? t : period - t; // triangle wave: 0..limit..0
  }

  /**
   * The crank's current angle relative to the configured zero, in degrees,
   * computed from live positions (so it's correct even while paused).
   * Honors `inverted` and `zeroDegrees`.
   */
  measuredAngleDegrees() {
    const offset = this.crank.position.sub(this.pivot.position);
    let deg = (offset.angle - this.zeroRad) / DEG;
    if (this.inverted) deg = -deg;
    deg %= 360;
    return deg < 0 ? deg + 360 : deg;
  }

  /** Legacy accessor kept for callers; same as the measured angle. */
  get angleDegrees() {
    return this.measuredAngleDegrees();
  }

  controls(joint) {
    return this.crank === joint;
  }
}
