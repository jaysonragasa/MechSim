import { Constraint } from './Constraint.js';
import { Vector2 } from '../math/Vector2.js';

const DEG = Math.PI / 180;

/**
 * Enforces a motor's angular travel limit as a solver constraint, so the limit
 * is respected at all times — not only while the motor is actively driving.
 * When paused, dragging pushes the crank through the linkage; this clamps the
 * crank back into the allowed arc [0°, limit] (measured from the motor's zero
 * reference, honoring invert), preserving its current radius so the connecting
 * link's length constraint still resolves normally.
 *
 * It holds a live reference to the AngleDriver, so changing the motor's zero,
 * invert or limit takes effect immediately with no re-wiring.
 */
export class MotorLimitConstraint extends Constraint {
  /** @param {import('../simulation/AngleDriver.js').AngleDriver} driver */
  constructor(driver) {
    super();
    this.driver = driver;
  }

  apply() {
    const d = this.driver;
    if (d.limitDegrees >= 360) return;          // full rotation allowed
    const crank = d.crank;
    const pivot = d.pivot;
    if (!crank || !pivot || crank.fixed) return; // don't move a grounded crank

    const offset = crank.position.sub(pivot.position);
    const r = offset.length;
    if (r === 0) return;

    // Servo angle (deg) relative to the zero reference, honoring invert,
    // normalized to [0, 360).
    let servo = (offset.angle - d.zeroRad) / DEG;
    if (d.inverted) servo = -servo;
    servo = ((servo % 360) + 360) % 360;

    if (servo <= d.limitDegrees) return; // already within the allowed arc

    // Outside the arc: clamp to whichever boundary (limit or 0/360) is nearer.
    const toLimit = servo - d.limitDegrees;
    const toZero = 360 - servo;
    const clamped = toLimit <= toZero ? d.limitDegrees : 0;

    const rawDeg = d.inverted ? -clamped : clamped;
    const world = d.zeroRad + rawDeg * DEG;
    crank.position = pivot.position.add(Vector2.fromAngle(world, r));
  }

  involves(joint) {
    return this.driver.crank === joint || this.driver.pivot === joint;
  }
}
